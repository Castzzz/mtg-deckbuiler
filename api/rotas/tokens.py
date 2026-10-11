from fastapi import APIRouter, Query

from api.banco import pool
from api.modelos import PedidoIds, Token, TokenDoDeck

router = APIRouter(prefix = "/tokens", tags = ["tokens"])

COLUNAS_TOKEN = "t.oracle_id, t.nome, t.tipo, t.texto, t.poder, t.resistencia, t.cores::text[] AS cores, t.imagem_url"


@router.post("/do-deck", response_model = list[TokenDoDeck])
def tokens_do_deck(pedido: PedidoIds):
    """Os tokens (e emblemas) que as cartas do deck criam, dos que mais cartas criam pros que menos."""
    with pool.connection() as conn:
        linhas = conn.execute(f"""
            SELECT {COLUNAS_TOKEN}, array_agg(c.nome ORDER BY c.nome) AS criado_por
            FROM carta_tokens ct
            JOIN tokens t ON t.oracle_id = ct.token_id
            JOIN cartas c ON c.oracle_id = ct.oracle_id
            WHERE ct.oracle_id = ANY(%s)
            GROUP BY t.oracle_id
            ORDER BY count(*) DESC, t.tipo LIKE 'Emblem%%', t.nome
        """, (pedido.ids,)).fetchall()
    return [{"token": l, "criado_por": l.pop("criado_por")} for l in linhas]


@router.get("", response_model = list[Token])
def buscar_tokens(
    q: str = Query(min_length = 2, description = "parte do nome ou do tipo, ex: zombie, treasure"),
    limite: int = Query(40, ge = 1, le = 100),
):
    """Busca qualquer token pelo nome ou tipo (pra criar na mesa um que o deck não lista). Os mais usados vêm primeiro."""
    with pool.connection() as conn:
        return conn.execute(f"""
            SELECT {COLUNAS_TOKEN}
            FROM tokens t
            LEFT JOIN carta_tokens ct ON ct.token_id = t.oracle_id
            WHERE t.nome ILIKE %(contem)s OR t.tipo ILIKE %(contem)s
            GROUP BY t.oracle_id
            ORDER BY t.nome ILIKE %(comeca)s DESC, count(ct.oracle_id) DESC, t.nome
            LIMIT %(limite)s
        """, {"contem": f"%{q}%", "comeca": f"{q}%", "limite": limite}).fetchall()
