"""Calcula as recomendações de cartas pra cada commander e grava na tabela `recomendacoes`.

Combina dois scores (ver recomendador/score.py):
- sinergia (estilo EDHREC): % dos decks do commander que usam a carta
  menos % de todos os decks que poderiam usar a carta (mesma identidade de cor) que usam ela.
  Tira o peso das cartas que todo mundo joga (Sol Ring, Cultivate...).
- afinidade: o método da potência do trabalho da UFRJ, mas no grafo de coocorrência de todos os
  decks e com o teletransporte sempre voltando pro commander (PageRank personalizado). Sozinho ele
  só mede popularidade (Sol Ring no topo de todo mundo), então é dividido pelo PageRank global:
  fica "quão mais perto desse commander do que do resto".

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

from recomendador.grafo import Grafo, carregar_grafo
from recomendador.score import MIN_DECKS_CARTA, MIN_DECKS_COMMANDER, pontuar

TOP_N = 300                  # quantas recomendações guardar por commander
LOTE_PAGERANK = 128          # quantos commanders resolver de uma vez no método da potência
PROCESSOS = max(1, (os.cpu_count() or 2) // 2)

# O grafo fica num global pros processos filhos herdarem via fork, sem copiar/serializar as matrizes
_GRAFO: Grafo | None = None


def _pagerank_lote(sementes: np.ndarray) -> np.ndarray:
    # Teletransporte: toda a probabilidade no commander da coluna
    E = np.zeros((_GRAFO.num_cartas, len(sementes)), dtype = np.float32)
    E[sementes, np.arange(len(sementes))] = 1.0
    return _GRAFO.C.pagerank(E)


def calcular(grafo: Grafo):
    global _GRAFO
    _GRAFO = grafo

    validos = np.flatnonzero(grafo.num_decks >= MIN_DECKS_COMMANDER)
    print(f"{len(validos)} commanders com pelo menos {MIN_DECKS_COMMANDER} decks")

    # contagem[commander, carta] = quantos decks do commander usam a carta
    contagem = (grafo.A[validos] @ grafo.M).tocsr()
    inicios = range(0, len(validos), LOTE_PAGERANK)
    lotes = [validos[inicio:inicio + LOTE_PAGERANK] for inicio in inicios]

    resultados, commanders = [], []
    t = time.monotonic()
    with ProcessPoolExecutor(PROCESSOS, mp_context = mp.get_context("fork")) as pool:
        # map devolve na ordem dos lotes, conforme cada um termina
        for inicio, lote, V in zip(inicios, lotes, pool.map(_pagerank_lote, [grafo.commanders_idx[l] for l in lotes])):
            print(f"  PageRank {inicio + len(lote)}/{len(validos)} ({time.monotonic() - t:.0f}s)")
            for j, i in enumerate(lote):
                linha = contagem[inicio + j]
                cartas_idx, n_com_carta = linha.indices, linha.data

                # Candidatas: aparecem em decks suficientes e não são o próprio commander
                manter = (n_com_carta >= MIN_DECKS_CARTA) & (cartas_idx != grafo.commanders_idx[i])
                if not manter.any():
                    continue

                commander_id = grafo.oracle_ids[grafo.commanders_idx[i]]
                df = pontuar(grafo, cartas_idx[manter], n_com_carta[manter], grafo.num_decks[i], V[:, j])
                resultados.append(df.head(TOP_N).drop(columns = "idx").assign(commander_id = commander_id))
                commanders.append((commander_id, int(grafo.num_decks[i])))

    return pd.DataFrame(commanders, columns = ["oracle_id", "num_decks"]), pd.concat(resultados, ignore_index = True)


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
        grafo = carregar_grafo(conn)
        print(f"Grafo: {grafo.M.shape[0]} decks, {grafo.num_cartas} cartas, {grafo.M.nnz} valores "
              f"({time.monotonic() - t:.0f}s)")

        commanders, recomendacoes = calcular(grafo)
        gravar(conn, commanders, recomendacoes)
        print(f"Total: {time.monotonic() - t:.0f}s")


if __name__ == "__main__":
    main()
