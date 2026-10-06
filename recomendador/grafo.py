"""Grafo de coocorrência de cartas, montado a partir dos decks do banco.

É usado tanto pelo pipeline (que pré-calcula as recomendações de todos os commanders)
quanto pela API (que calcula na hora as recomendações pro deck que o usuário está montando).
"""
import io
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix

MAX_CARTAS_DECK = 250        # acima disso não é deck, é coleção/lista de compras (liga tudo com tudo no grafo)
DAMPING = 0.5                # menor que o 0.85 clássico: o passeio fica mais perto das sementes
TOLERANCIA = 1e-6            # suficiente pra ordem das cartas não mudar (o trabalho usava 1e-9)
MAX_ITER = 200

CORES = "WUBRG"


def mascara_cores(identidade: str) -> int:
    # Identidade de cor como 5 bits (W=1, U=2, B=4, R=8, G=16): "BRW" -> 13
    return sum(1 << CORES.index(c) for c in identidade)


class Coocorrencia:
    """Operador da matriz de coocorrência C = MᵀM (diagonal zerada), sem montar C.

    C teria centenas de milhões de valores, então C·x é calculado como Mᵀ(M·x) - diag(MᵀM)·x,
    usando só a matriz deck x carta M (~10 milhões de valores).
    """

    def __init__(self, M: csr_matrix):
        self.M = M
        self.Mt = M.T.tocsr()
        self.diagonal = np.asarray(M.sum(axis = 0)).ravel()  # M é binária, então diag(MᵀM) = soma das colunas
        # Soma das colunas de C, com o mesmo cuidado do trabalho pra cartas sem conexão
        self.soma_colunas = self.vezes(np.ones((M.shape[1], 1), dtype = np.float32)).ravel()
        self.soma_colunas[self.soma_colunas == 0] = 1

    def vezes(self, X: np.ndarray) -> np.ndarray:
        return self.Mt @ (self.M @ X) - self.diagonal[:, None] * X

    def pagerank(self, E: np.ndarray, d: float = DAMPING, tol: float = TOLERANCIA, max_iter: int = MAX_ITER):
        """Método da potência, uma execução por coluna de E.

        E[:, j] é o vetor de teletransporte da execução j: uniforme (1/n) dá o PageRank clássico,
        concentrado em algumas cartas dá o PageRank personalizado pra elas.
        """
        V = E.copy()
        for _ in range(max_iter):
            Y = d * self.vezes(V / self.soma_colunas[:, None]) + (1 - d) * E
            Y /= Y.sum(axis = 0, keepdims = True)
            diferenca = np.abs(Y - V).sum(axis = 0).max()
            V = Y
            if diferenca < tol:
                break
        return V


@dataclass
class Grafo:
    M: csr_matrix                  # M[deck, carta] = 1 se a carta está no deck (commander incluso)
    A: csr_matrix                  # A[commander, deck] = 1 se o deck é desse commander (partners: conta pros dois)
    oracle_ids: np.ndarray         # índice da carta -> oracle_id
    commanders_idx: np.ndarray     # linha de A -> índice da carta do commander
    mascara_carta: np.ndarray      # identidade de cor de cada carta (5 bits)
    mascara_deck: np.ndarray       # identidade de cor de cada deck (união dos commanders)
    indice: dict[str, int] = field(init = False)          # oracle_id -> índice da carta
    linha_commander: dict[str, int] = field(init = False)  # oracle_id do commander -> linha de A
    num_decks: np.ndarray = field(init = False)           # decks por commander (linha de A)
    p_geral: np.ndarray = field(init = False)             # inclusão geral de cada carta nas suas cores
    C: Coocorrencia = field(init = False)
    pagerank_global: np.ndarray = field(init = False)

    def __post_init__(self):
        self.indice = {o: i for i, o in enumerate(self.oracle_ids)}
        self.linha_commander = {self.oracle_ids[c]: i for i, c in enumerate(self.commanders_idx)}
        self.num_decks = np.asarray(self.A.sum(axis = 1)).ravel()
        self.p_geral = self._inclusao_geral()
        self.C = Coocorrencia(self.M)
        n = self.M.shape[1]
        self.pagerank_global = self.C.pagerank(np.full((n, 1), 1 / n, dtype = np.float32)).ravel()

    @property
    def num_cartas(self) -> int:
        return self.M.shape[1]

    def _inclusao_geral(self) -> np.ndarray:
        """Pra cada carta: decks que usam ela / decks que *poderiam* usar (identidade do deck contém a da carta)."""
        decks_por_mascara = np.bincount(self.mascara_deck, minlength = 32)
        # elegiveis[m] = quantos decks têm identidade que contém m
        elegiveis = np.array([decks_por_mascara[[d for d in range(32) if d & m == m]].sum() for m in range(32)])
        uso = np.asarray(self.M.sum(axis = 0)).ravel()
        return uso / np.maximum(elegiveis[self.mascara_carta], 1)


def carregar_grafo(conn) -> Grafo:
    """Lê os decks do banco e monta o grafo."""
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

    deck_idx, decks = pd.factorize(deck_cartas["deck_id"])
    carta_idx = deck_cartas["oracle_id"].cat.codes.to_numpy()
    oracle_ids = deck_cartas["oracle_id"].cat.categories.to_numpy()

    M = csr_matrix((np.ones(len(deck_cartas), dtype = np.float32), (deck_idx, carta_idx)),
                   shape = (len(decks), len(oracle_ids)))

    eh_cmd = deck_cartas["eh_commander"].to_numpy().astype(bool)
    cmd_carta_idx = carta_idx[eh_cmd]
    commanders_idx, cmd_linha = np.unique(cmd_carta_idx, return_inverse = True)
    A = csr_matrix((np.ones(len(cmd_linha), dtype = np.float32), (cmd_linha, deck_idx[eh_cmd])),
                   shape = (len(commanders_idx), len(decks)))

    mascara_por_id = dict(zip(cartas["oracle_id"], cartas["identidade"].map(mascara_cores)))
    mascara_carta = np.array([mascara_por_id[o] for o in oracle_ids], dtype = np.int64)

    mascara_deck = np.zeros(len(decks), dtype = np.int64)
    np.bitwise_or.at(mascara_deck, deck_idx[eh_cmd], mascara_carta[cmd_carta_idx])

    return Grafo(M, A, oracle_ids, commanders_idx, mascara_carta, mascara_deck)
