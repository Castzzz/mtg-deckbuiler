"""Calcula as recomendações de cartas pra cada commander e grava na tabela `recomendacoes`.

Combina dois scores:
- sinergia (estilo EDHREC): % dos decks do commander que usam a carta
  menos % de todos os decks que poderiam usar a carta (mesma identidade de cor) que usam ela.
  Tira o peso das cartas que todo mundo joga (Sol Ring, Cultivate...).
- PageRank personalizado: o método da potência do trabalho da UFRJ, mas no grafo de coocorrência
  de todos os decks e com o teletransporte sempre voltando pro commander. Mede quão "perto" do
  commander a carta está no grafo. Sozinho ele só mede popularidade (Sol Ring no topo de todo mundo),
  então é dividido pelo PageRank global: fica "quão mais perto desse commander do que do resto".

Uso: python -m pipeline.calcular_recomendacoes
"""
import io
import multiprocessing as mp
import os
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd
import psycopg
from scipy.sparse import csr_matrix

MIN_DECKS_COMMANDER = 5      # commanders com menos decks que isso não ganham recomendação
MIN_DECKS_CARTA = 2          # carta tem que aparecer em pelo menos N decks do commander
MAX_CARTAS_DECK = 250        # acima disso não é deck, é coleção/lista de compras (liga tudo com tudo no grafo)
TOP_N = 300                  # quantas recomendações guardar por commander
PESO_SINERGIA = 0.5          # score = PESO_SINERGIA * sinergia + (1 - PESO_SINERGIA) * afinidade do pagerank (ambos normalizados)

DAMPING = 0.5                # menor que o 0.85 clássico: o passeio fica mais perto do commander
SUAVIZACAO = 10              # puxa a razão pra 1 em cartas com poucos decks (n*razão + k) / (n + k)
TOLERANCIA = 1e-6            # suficiente pra ordem das cartas não mudar (o trabalho usava 1e-9)
MAX_ITER = 200
LOTE_PAGERANK = 128          # quantos commanders resolver de uma vez no método da potência
PROCESSOS = max(1, (os.cpu_count() or 2) // 2)

CORES = "WUBRG"


def carregar_dados(conn):
    """Lê deck_cartas e cartas do banco. Devolve (deck_cartas, cartas) como DataFrames."""
    def copy_para_df(sql: str, **kwargs) -> pd.DataFrame:
        # COPY TO STDOUT é bem mais rápido que fetchall() pra milhões de linhas
        buffer = io.BytesIO()
        with conn.cursor().copy(f"COPY ({sql}) TO STDOUT WITH (FORMAT csv, HEADER)") as copy:
            for bloco in copy:
                buffer.write(bloco)
        buffer.seek(0)
        return pd.read_csv(buffer, **kwargs)

    deck_cartas = copy_para_df(f"""
        SELECT dc.deck_id, dc.oracle_id, dc.eh_commander::int AS eh_commander
        FROM deck_cartas dc
        JOIN cartas c USING (oracle_id)
        WHERE c.tipo NOT LIKE 'Basic Land%'
          AND dc.deck_id IN (SELECT deck_id FROM deck_cartas GROUP BY deck_id HAVING count(*) <= {MAX_CARTAS_DECK})
    """, dtype = {"oracle_id": "category"})

    cartas = copy_para_df("SELECT oracle_id, array_to_string(identidade_cor, '') AS identidade FROM cartas",
                          keep_default_na = False)
    return deck_cartas, cartas


def mascara_cores(identidade: str) -> int:
    # Identidade de cor como 5 bits (W=1, U=2, B=4, R=8, G=16): "BRW" -> 13
    return sum(1 << CORES.index(c) for c in identidade)


def montar_matrizes(deck_cartas: pd.DataFrame, cartas: pd.DataFrame):
    deck_idx, decks = pd.factorize(deck_cartas["deck_id"])
    carta_idx = deck_cartas["oracle_id"].cat.codes.to_numpy()
    oracle_ids = deck_cartas["oracle_id"].cat.categories.to_numpy()

    # M[deck, carta] = 1 se a carta está no deck (o commander também entra como carta)
    M = csr_matrix((np.ones(len(deck_cartas), dtype = np.float32), (deck_idx, carta_idx)),
                   shape = (len(decks), len(oracle_ids)))

    # A[commander, deck] = 1 se o deck é desse commander. Partners: o deck conta pros dois.
    eh_cmd = deck_cartas["eh_commander"].to_numpy().astype(bool)
    cmd_carta_idx = carta_idx[eh_cmd]
    commanders_idx, cmd_linha = np.unique(cmd_carta_idx, return_inverse = True)
    A = csr_matrix((np.ones(len(cmd_linha), dtype = np.float32), (cmd_linha, deck_idx[eh_cmd])),
                   shape = (len(commanders_idx), len(decks)))

    mascara_por_id = dict(zip(cartas["oracle_id"], cartas["identidade"].map(mascara_cores)))
    mascara_carta = np.array([mascara_por_id[o] for o in oracle_ids], dtype = np.int64)

    # Identidade do deck = união das identidades dos commanders
    mascara_deck = np.zeros(len(decks), dtype = np.int64)
    np.bitwise_or.at(mascara_deck, deck_idx[eh_cmd], mascara_carta[cmd_carta_idx])

    return M, A, oracle_ids, commanders_idx, mascara_carta, mascara_deck


def inclusao_geral(M, mascara_carta, mascara_deck):
    """Pra cada carta: decks que usam ela / decks que *poderiam* usar (identidade do deck contém a da carta)."""
    decks_por_mascara = np.bincount(mascara_deck, minlength = 32)
    # elegiveis[m] = quantos decks têm identidade que contém m
    elegiveis = np.array([decks_por_mascara[[d for d in range(32) if d & m == m]].sum() for m in range(32)])
    uso = np.asarray(M.sum(axis = 0)).ravel()
    return uso / np.maximum(elegiveis[mascara_carta], 1)


def pagerank(M, E: np.ndarray, d: float = DAMPING, tol: float = TOLERANCIA, max_iter: int = MAX_ITER):
    """Método da potência no grafo de coocorrência, uma execução por coluna de E.

    E[:, j] é o vetor de teletransporte da execução j: uniforme (1/n) dá o PageRank clássico,
    tudo numa carta só dá o PageRank personalizado pra ela.

    A matriz de coocorrência C = MᵀM (diagonal zerada) teria centenas de milhões de valores,
    então ela nunca é montada: C·x é calculado como Mᵀ(M·x) - diag(MᵀM)·x.
    """
    n = M.shape[1]
    Mt = M.T.tocsr()
    diagonal = np.asarray(M.sum(axis = 0)).ravel()  # M é binária, então diag(MᵀM) = soma das colunas

    def C_vezes(x):
        return Mt @ (M @ x) - diagonal[:, None] * x

    # Soma das colunas de C, com o mesmo cuidado do trabalho pra cartas sem conexão
    soma_colunas = C_vezes(np.ones((n, 1), dtype = np.float32)).ravel()
    soma_colunas[soma_colunas == 0] = 1

    V = E.copy()

    for _ in range(max_iter):
        Y = d * C_vezes(V / soma_colunas[:, None]) + (1 - d) * E
        Y /= Y.sum(axis = 0, keepdims = True)
        diferenca = np.abs(Y - V).sum(axis = 0).max()
        V = Y
        if diferenca < tol:
            break
    return V


# O M fica num global pros processos filhos herdarem via fork, sem copiar/serializar a matriz
_M_COMPARTILHADA = None


def _pagerank_lote(sementes: np.ndarray) -> np.ndarray:
    # Teletransporte: toda a probabilidade no commander da coluna
    E = np.zeros((_M_COMPARTILHADA.shape[1], len(sementes)), dtype = np.float32)
    E[sementes, np.arange(len(sementes))] = 1.0
    return pagerank(_M_COMPARTILHADA, E)


def normalizar(x: np.ndarray) -> np.ndarray:
    # Min-max pra [0, 1], pra dar pra somar sinergia e pagerank na mesma escala
    amplitude = x.max() - x.min()
    return (x - x.min()) / amplitude if amplitude > 0 else np.zeros_like(x)


def calcular(M, A, oracle_ids, commanders_idx, mascara_carta, mascara_deck):
    num_decks = np.asarray(A.sum(axis = 1)).ravel()
    validos = np.flatnonzero(num_decks >= MIN_DECKS_COMMANDER)
    print(f"{len(validos)} commanders com pelo menos {MIN_DECKS_COMMANDER} decks")

    p_geral = inclusao_geral(M, mascara_carta, mascara_deck)
    n = M.shape[1]
    pagerank_global = pagerank(M, np.full((n, 1), 1 / n, dtype = np.float32)).ravel()
    # contagem[commander, carta] = quantos decks do commander usam a carta
    contagem = (A[validos] @ M).tocsr()

    global _M_COMPARTILHADA
    _M_COMPARTILHADA = M
    inicios = range(0, len(validos), LOTE_PAGERANK)
    lotes = [validos[inicio:inicio + LOTE_PAGERANK] for inicio in inicios]

    resultados, commanders = [], []
    t = time.monotonic()
    with ProcessPoolExecutor(PROCESSOS, mp_context = mp.get_context("fork")) as pool:
        # map devolve na ordem dos lotes, conforme cada um termina
        for inicio, lote, V in zip(inicios, lotes, pool.map(_pagerank_lote, [commanders_idx[l] for l in lotes])):
            print(f"  PageRank {inicio + len(lote)}/{len(validos)} ({time.monotonic() - t:.0f}s)")
            resultados_lote, commanders_lote = recomendacoes_do_lote(
                lote, inicio, V, contagem, num_decks, p_geral, pagerank_global, oracle_ids, commanders_idx)
            resultados += resultados_lote
            commanders += commanders_lote

    return pd.DataFrame(commanders, columns = ["oracle_id", "num_decks"]), pd.concat(resultados, ignore_index = True)


def recomendacoes_do_lote(lote, inicio, V, contagem, num_decks, p_geral, pagerank_global, oracle_ids, commanders_idx):
    resultados, commanders = [], []
    for j, i in enumerate(lote):
        linha = contagem[inicio + j]
        cartas_idx, n_com_carta = linha.indices, linha.data.astype(int)

        # Candidatas: aparecem em decks suficientes e não são o próprio commander
        manter = (n_com_carta >= MIN_DECKS_CARTA) & (cartas_idx != commanders_idx[i])
        cartas_idx, n_com_carta = cartas_idx[manter], n_com_carta[manter]
        if len(cartas_idx) == 0:
            continue

        inclusao = n_com_carta / num_decks[i]
        sinergia = inclusao - p_geral[cartas_idx]
        razao = V[cartas_idx, j] / pagerank_global[cartas_idx]
        afinidade = (n_com_carta * razao + SUAVIZACAO) / (n_com_carta + SUAVIZACAO)
        score = PESO_SINERGIA * normalizar(sinergia) + (1 - PESO_SINERGIA) * normalizar(afinidade)

        top = np.argsort(-score)[:TOP_N]
        resultados.append(pd.DataFrame({
            "commander_id": oracle_ids[commanders_idx[i]],
            "oracle_id": oracle_ids[cartas_idx[top]],
            "num_decks": n_com_carta[top],
            "inclusao": inclusao[top],
            "sinergia": sinergia[top],
            "pagerank": afinidade[top],
            "score": score[top],
        }))
        commanders.append((oracle_ids[commanders_idx[i]], int(num_decks[i])))
    return resultados, commanders


def gravar(conn, commanders: pd.DataFrame, recomendacoes: pd.DataFrame):
    def copy_df(tabela: str, df: pd.DataFrame):
        buffer = io.StringIO()
        df.to_csv(buffer, index = False, header = False)
        with conn.cursor().copy(f"COPY {tabela} ({', '.join(df.columns)}) FROM STDIN WITH (FORMAT csv)") as copy:
            copy.write(buffer.getvalue())

    # Tudo numa transação: quem estiver lendo vê as recomendações antigas até o commit
    with conn.transaction():
        conn.execute("DELETE FROM commanders")  # o CASCADE apaga as recomendações junto
        copy_df("commanders", commanders)
        copy_df("recomendacoes", recomendacoes)
    print(f"{len(commanders)} commanders e {len(recomendacoes)} recomendações gravadas")


def main():
    dsn = os.environ.get("DATABASE_URL", "postgresql://mtg:mtg@localhost:5432/mtg")
    with psycopg.connect(dsn) as conn:
        t = time.monotonic()
        deck_cartas, cartas = carregar_dados(conn)
        print(f"{len(deck_cartas)} linhas carregadas ({time.monotonic() - t:.0f}s)")

        matrizes = montar_matrizes(deck_cartas, cartas)
        del deck_cartas
        M = matrizes[0]
        print(f"Matriz deck x carta: {M.shape[0]} decks, {M.shape[1]} cartas, {M.nnz} valores")

        commanders, recomendacoes = calcular(*matrizes)
        gravar(conn, commanders, recomendacoes)
        print(f"Total: {time.monotonic() - t:.0f}s")


if __name__ == "__main__":
    main()
