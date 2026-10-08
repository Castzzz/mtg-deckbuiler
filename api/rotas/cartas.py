from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from api.banco import COLUNAS_CARTA, pool
from api.modelos import Carta

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


@router.get("/{oracle_id}", response_model = Carta)
def carta(oracle_id: UUID):
    with pool.connection() as conn:
        linha = conn.execute(f"SELECT {COLUNAS_CARTA} FROM cartas c WHERE c.oracle_id = %s", (oracle_id,)).fetchone()
    if linha is None:
        raise HTTPException(404, "Carta não encontrada")
    return linha
