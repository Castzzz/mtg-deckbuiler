import re
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from api.banco import COLUNAS_CARTA, pool
from api.modelos import Carta, Edicao, PedidoIds, PedidoNomes

router = APIRouter(prefix = "/cartas", tags = ["cartas"])


@router.get("", response_model = list[Carta])
def buscar_cartas(
    q: str = Query(min_length = 2, description = "parte do nome da carta"),
    cores: str | None = Query(None, pattern = "^[WUBRGC]*$", description = "só cartas dentro dessa identidade de cor, ex: WBR (C = incolor)"),
    limite: int = Query(20, ge = 1, le = 100),
):
    """Busca cartas legais em Commander pelo nome. Quem começa com o texto buscado vem primeiro."""
    with pool.connection() as conn:
        return conn.execute(f"""
            SELECT {COLUNAS_CARTA}
            FROM cartas c
            WHERE c.legal_commander AND c.nome ILIKE %(contem)s
              AND (%(cores)s::text IS NULL OR c.identidade_cor <@ string_to_array(%(cores)s, NULL)::char(1)[])
            ORDER BY c.nome ILIKE %(comeca)s DESC, length(c.nome), c.nome
            LIMIT %(limite)s
        """, {"contem": f"%{q}%", "comeca": f"{q}%", "cores": cores, "limite": limite}).fetchall()


def normalizar_nome(nome: str) -> str:
    # Listas exportadas às vezes usam apóstrofo curvo ou "Fire / Ice" com uma barra só
    nome = nome.strip().replace("\u2019", "'")
    return re.sub(r"\s*/{1,2}\s*", " // ", nome).lower()


@router.post("/por-nome", response_model = dict[str, Carta])
def cartas_por_nome(pedido: PedidoNomes):
    """Acha várias cartas pelo nome exato (sem diferenciar maiúsculas), pra importar uma lista.

    Também aceita só o nome da frente de cartas de duas faces. Devolve {nome pedido: carta};
    os nomes que não foram encontrados ficam de fora.
    """
    normalizados = {normalizar_nome(n): n for n in pedido.nomes}
    with pool.connection() as conn:
        # Duas junções separadas (nome inteiro / nome da frente) em vez de um OR: assim o Postgres faz hash join
        linhas = conn.execute(f"""
            WITH b AS (SELECT unnest(%s::text[]) AS busca),
            achadas AS (
                SELECT b.busca, c.oracle_id, 0 AS prioridade FROM b JOIN cartas c ON lower(c.nome) = b.busca
                UNION ALL
                SELECT b.busca, c.oracle_id, 1 FROM b JOIN cartas c ON lower(split_part(c.nome, ' // ', 1)) = b.busca
                WHERE c.nome LIKE '%%//%%'
            )
            SELECT DISTINCT ON (a.busca) a.busca, {COLUNAS_CARTA}
            FROM achadas a JOIN cartas c USING (oracle_id)
            ORDER BY a.busca, a.prioridade, c.legal_commander DESC
        """, (list(normalizados),)).fetchall()
    return {normalizados[l.pop("busca")]: l for l in linhas}


@router.post("/por-id", response_model = list[Carta])
def cartas_por_id(pedido: PedidoIds):
    """Dados atualizados (preço, imagem, ...) de várias cartas, ex: as de um deck salvo no navegador."""
    with pool.connection() as conn:
        return conn.execute(f"SELECT {COLUNAS_CARTA} FROM cartas c WHERE c.oracle_id = ANY(%s)", (pedido.ids,)).fetchall()


@router.get("/{oracle_id}/edicoes", response_model = list[Edicao])
def edicoes(oracle_id: UUID):
    """Todas as edições em papel da carta (pra escolher a arte), das mais novas pras mais antigas."""
    with pool.connection() as conn:
        return conn.execute("""
            SELECT scryfall_id, edicao, nome_edicao, numero, lancamento, imagem_url,
                   preco_usd::float AS preco_usd, preco_eur::float AS preco_eur
            FROM impressoes
            WHERE oracle_id = %s AND imagem_url IS NOT NULL
            ORDER BY lancamento DESC NULLS LAST, edicao, numero
        """, (oracle_id,)).fetchall()


@router.get("/{oracle_id}", response_model = Carta)
def carta(oracle_id: UUID):
    with pool.connection() as conn:
        linha = conn.execute(f"SELECT {COLUNAS_CARTA} FROM cartas c WHERE c.oracle_id = %s", (oracle_id,)).fetchone()
    if linha is None:
        raise HTTPException(404, "Carta não encontrada")
    return linha
