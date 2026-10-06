from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from api.banco import COLUNAS_CARTA, pool, separar_carta
from api.modelos import Carta, Categoria, Commander, Recomendacao

router = APIRouter(prefix = "/commanders", tags = ["commanders"])

CAMPOS_CARTA = set(Carta.model_fields)


@router.get("", response_model = list[Commander])
def listar_commanders(
    q: str | None = Query(None, description = "parte do nome do commander"),
    limite: int = Query(50, ge = 1, le = 200),
    offset: int = Query(0, ge = 0),
):
    """Commanders com recomendações calculadas, dos mais jogados pros menos."""
    with pool.connection() as conn:
        return conn.execute(f"""
            SELECT {COLUNAS_CARTA}, cm.num_decks
            FROM commanders cm
            JOIN cartas c USING (oracle_id)
            WHERE %(q)s::text IS NULL OR c.nome ILIKE '%%' || %(q)s || '%%'
            ORDER BY cm.num_decks DESC, c.nome
            LIMIT %(limite)s OFFSET %(offset)s
        """, {"q": q, "limite": limite, "offset": offset}).fetchall()


@router.get("/{oracle_id}", response_model = Commander)
def commander(oracle_id: UUID):
    with pool.connection() as conn:
        linha = conn.execute(f"""
            SELECT {COLUNAS_CARTA}, cm.num_decks
            FROM commanders cm JOIN cartas c USING (oracle_id)
            WHERE cm.oracle_id = %s
        """, (oracle_id,)).fetchone()
    if linha is None:
        raise HTTPException(404, "Commander não encontrado ou sem decks suficientes")
    return linha


@router.get("/{oracle_id}/recomendacoes", response_model = list[Recomendacao])
def recomendacoes(
    oracle_id: UUID,
    categoria: Categoria | None = None,
    limite: int = Query(50, ge = 1, le = 300),
    offset: int = Query(0, ge = 0),
):
    """Recomendações pré-calculadas do commander (pipeline.calcular_recomendacoes)."""
    with pool.connection() as conn:
        if conn.execute("SELECT 1 FROM commanders WHERE oracle_id = %s", (oracle_id,)).fetchone() is None:
            raise HTTPException(404, "Commander não encontrado ou sem decks suficientes")
        linhas = conn.execute(f"""
            SELECT {COLUNAS_CARTA}, r.num_decks, r.inclusao, r.sinergia, r.pagerank AS afinidade, r.score
            FROM recomendacoes r
            JOIN cartas c USING (oracle_id)
            WHERE r.commander_id = %(id)s AND c.legal_commander
              AND (%(categoria)s::text IS NULL OR c.categoria = %(categoria)s)
            ORDER BY r.score DESC
            LIMIT %(limite)s OFFSET %(offset)s
        """, {"id": oracle_id, "categoria": categoria and categoria.value, "limite": limite, "offset": offset}).fetchall()

    resultado = []
    for linha in linhas:
        carta, resto = separar_carta(linha, CAMPOS_CARTA)
        resultado.append(Recomendacao(carta = carta, **resto))
    return resultado
