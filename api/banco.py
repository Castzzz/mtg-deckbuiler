import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DSN = os.environ.get("DATABASE_URL", "postgresql://mtg:mtg@localhost:5432/mtg")

pool = ConnectionPool(DSN, min_size = 1, max_size = 10, open = False, kwargs = {"row_factory": dict_row})

# Colunas da carta no formato do modelo `Carta`. Espera a tabela `cartas` com alias `c`.
COLUNAS_CARTA = """
    c.oracle_id, c.nome, c.custo_mana, c.cmc::float AS cmc, c.tipo, c.categoria, c.texto,
    c.identidade_cor::text[] AS identidade_cor, c.parceria, c.imagem_url, c.scryfall_uri,
    c.preco_usd::float AS preco_usd, c.preco_eur::float AS preco_eur, c.legal_commander AS legal,
    c.pode_ser_commander
"""


def separar_carta(linha: dict, campos_carta: set[str]) -> tuple[dict, dict]:
    """Separa uma linha do banco em (campos da carta, resto), pra montar modelos aninhados."""
    carta = {k: v for k, v in linha.items() if k in campos_carta}
    resto = {k: v for k, v in linha.items() if k not in campos_carta}
    return carta, resto
