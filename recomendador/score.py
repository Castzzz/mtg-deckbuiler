"""Scores de recomendação: sinergia (estilo EDHREC) + afinidade (PageRank personalizado / global)."""
import numpy as np
import pandas as pd

from recomendador.grafo import Grafo

MIN_DECKS_COMMANDER = 5      # commanders com menos decks que isso não têm sinergia confiável
MIN_DECKS_CARTA = 2          # carta tem que aparecer em pelo menos N decks do commander
PESO_SINERGIA = 0.5          # score = PESO_SINERGIA * sinergia + (1 - PESO_SINERGIA) * afinidade (ambos normalizados)
SUAVIZACAO = 10              # puxa a afinidade pra 1 em cartas com poucos decks: (n*razão + k) / (n + k)
MIN_DECKS_SEM_HISTORICO = 20 # commander sem decks: só recomenda cartas usadas em pelo menos N decks no geral
PESO_COMMANDER = 0.5         # no deck em montagem, fração do teletransporte que vai pro(s) commander(s)
VIZINHOS_ESTILO = 300        # quantos decks parecidos com o do usuário entram na conta do "estilo"
BONUS_MESMO_COMMANDER = 1.5  # decks do mesmo commander contam como mais parecidos


def normalizar(x: np.ndarray) -> np.ndarray:
    # Min-max pra [0, 1], pra dar pra somar sinergia e afinidade na mesma escala
    amplitude = x.max() - x.min()
    return (x - x.min()) / amplitude if amplitude > 0 else np.zeros_like(x, dtype = float)


def pontuar(grafo: Grafo, cartas_idx: np.ndarray, n_com_carta: np.ndarray, num_decks: int,
            pagerank: np.ndarray) -> pd.DataFrame:
    """Calcula inclusão, sinergia, afinidade e score das cartas candidatas, ordenado pelo score."""
    razao = pagerank[cartas_idx] / grafo.pagerank_global[cartas_idx]
    afinidade = (n_com_carta * razao + SUAVIZACAO) / (n_com_carta + SUAVIZACAO)
    inclusao = n_com_carta / max(num_decks, 1)
    sinergia = inclusao - grafo.p_geral[cartas_idx]
    score = PESO_SINERGIA * normalizar(sinergia) + (1 - PESO_SINERGIA) * normalizar(afinidade)

    return pd.DataFrame({
        "idx": cartas_idx,
        "oracle_id": grafo.oracle_ids[cartas_idx],
        "num_decks": n_com_carta.astype(int),
        "inclusao": inclusao,
        "sinergia": sinergia,
        "pagerank": afinidade,
        "score": score,
    }).sort_values("score", ascending = False, ignore_index = True)


def recomendar_para_deck(grafo: Grafo, commanders: list[str], cartas_no_deck: list[str]) -> pd.DataFrame:
    """Recomendações pro deck que o usuário está montando, calculadas na hora.

    O PageRank personalizado se teletransporta pro(s) commander(s) e pras cartas que já estão no deck,
    então as sugestões vão puxando pro estilo que o deck está tomando.
    """
    sementes_cmd = [grafo.indice[c] for c in commanders if c in grafo.indice]
    sementes_deck = [grafo.indice[c] for c in cartas_no_deck if c in grafo.indice and c not in commanders]
    if not sementes_cmd:
        return pd.DataFrame()

    E = np.zeros((grafo.num_cartas, 1), dtype = np.float32)
    peso_cmd = PESO_COMMANDER if sementes_deck else 1.0
    E[sementes_cmd, 0] += peso_cmd / len(sementes_cmd)
    if sementes_deck:
        E[sementes_deck, 0] += (1 - peso_cmd) / len(sementes_deck)
    pagerank = grafo.C.pagerank(E).ravel()

    # Decks com esse(s) commander(s). Partners: os decks com a dupla; se forem poucos, com qualquer um dos dois.
    linhas = [grafo.linha_commander[c] for c in commanders if c in grafo.linha_commander]
    decks = np.zeros(grafo.M.shape[0], dtype = bool)
    if linhas:
        por_commander = np.asarray(grafo.A[linhas].sum(axis = 0)).ravel()
        decks = por_commander == len(linhas)
        if decks.sum() < MIN_DECKS_COMMANDER:
            decks = por_commander > 0
    num_decks = int(decks.sum())
    n_com_carta = np.asarray(grafo.M[decks].sum(axis = 0)).ravel() if num_decks else np.zeros(grafo.num_cartas)

    # Candidatas: dentro da identidade de cor dos commanders e fora do deck
    mascara_cmd = np.bitwise_or.reduce(grafo.mascara_carta[sementes_cmd])
    candidata = (grafo.mascara_carta & ~mascara_cmd) == 0
    candidata[sementes_cmd + sementes_deck] = False
    if num_decks >= MIN_DECKS_COMMANDER:
        candidata &= n_com_carta >= MIN_DECKS_CARTA
    else:
        # Commander novo/raro: sem decks suficientes, a sinergia não diz nada e sobra só a afinidade
        candidata &= grafo.C.diagonal >= MIN_DECKS_SEM_HISTORICO

    cartas_idx = np.flatnonzero(candidata)
    df = pontuar(grafo, cartas_idx, n_com_carta[cartas_idx], num_decks, pagerank)
    df["estilo"] = estilo(grafo, decks, int(mascara_cmd), sementes_deck)[df["idx"]]
    return df


def estilo(grafo: Grafo, decks_commander: np.ndarray, mascara_cmd: int, sementes_deck: list[int]) -> np.ndarray:
    """Quanto mais os decks *parecidos com o do usuário* usam cada carta, comparado com a média das cores.

    Procura entre todos os decks que cabem na identidade de cor do commander, não só os do commander:
    assim um deck de group hug puxa cartas de group hug mesmo com um commander que quase ninguém joga assim.
    A parecença é a soma do IDF das cartas em comum, então dividir uma carta de nicho conta muito mais
    que dividir o Sol Ring. Os VIZINHOS_ESTILO decks mais parecidos entram com peso = parecença.
    Ex: Edgar + Blood Artist, Viscera Seer puxa Cruel Celebrant e Phyrexian Altar. Com o deck vazio, tudo dá 0.
    """
    if not sementes_deck:
        return np.zeros(grafo.num_cartas)

    idf = grafo.idf[sementes_deck]
    parecenca = np.asarray(idf @ grafo.C.Mt[sementes_deck]).ravel() / idf.sum()  # um valor por deck
    parecenca[decks_commander] *= BONUS_MESMO_COMMANDER
    parecenca[(grafo.mascara_deck & ~mascara_cmd) != 0] = 0  # decks com cores que o commander não tem

    k = min(VIZINHOS_ESTILO, int((parecenca > 0).sum()))
    if k == 0:
        return np.zeros(grafo.num_cartas)
    vizinhos = np.argpartition(-parecenca, k - 1)[:k]
    pesos = parecenca[vizinhos]
    inclusao_vizinhos = np.asarray(pesos @ grafo.M[vizinhos]).ravel() / pesos.sum()
    return inclusao_vizinhos - grafo.inclusao_nas_cores(mascara_cmd)
