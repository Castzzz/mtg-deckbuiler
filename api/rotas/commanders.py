from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from api.banco import COLUNAS_CARTA, pool, separar_carta
from api.modelos import Carta, Categoria, Commander, Ordem, Parceiro, Recomendacao

router = APIRouter(prefix = "/commanders", tags = ["commanders"])

CAMPOS_CARTA = set(Carta.model_fields)


@router.get("", response_model = list[Commander])
def listar_commanders(
    q: str | None = Query(None, description = "parte do nome do commander"),
    cores: str | None = Query(None, pattern = "^([WUBRG]+|C)$",
                              description = "identidade de cor exata, ex: WB = só Orzhov; C = incolores"),
    limite: int = Query(50, ge = 1, le = 200),
    offset: int = Query(0, ge = 0),
):
    """Commanders com recomendações calculadas, dos mais jogados pros menos."""
    identidade = None if cores is None else sorted(set(cores.replace("C", "")))
    with pool.connection() as conn:
        return conn.execute(f"""
            SELECT {COLUNAS_CARTA}, cm.num_decks
            FROM commanders cm
            JOIN cartas c USING (oracle_id)
            WHERE (%(q)s::text IS NULL OR c.nome ILIKE '%%' || %(q)s || '%%')
              AND (%(cores)s::char(1)[] IS NULL
                   OR (c.identidade_cor <@ %(cores)s::char(1)[] AND c.identidade_cor @> %(cores)s::char(1)[]))
            ORDER BY cm.num_decks DESC, c.nome
            LIMIT %(limite)s OFFSET %(offset)s
        """, {"q": q, "cores": identidade, "limite": limite, "offset": offset}).fetchall()


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


@router.get("/{oracle_id}/parceiros", response_model = list[Parceiro])
def parceiros(
    oracle_id: UUID,
    q: str | None = Query(None, description = "parte do nome do parceiro"),
    limite: int = Query(50, ge = 1, le = 200),
):
    """Cartas que podem fazer dupla de commanders com essa (Partner, Background, Doctor's companion, ...),
    das duplas mais jogadas pras menos."""
    with pool.connection() as conn:
        if conn.execute("SELECT 1 FROM cartas WHERE oracle_id = %s", (oracle_id,)).fetchone() is None:
            raise HTTPException(404, "Carta não encontrada")
        return conn.execute(f"""
            WITH base AS (SELECT oracle_id, parceria FROM cartas WHERE oracle_id = %(id)s),
            juntos AS (
                SELECT b.oracle_id, count(*) AS n
                FROM deck_cartas a
                JOIN deck_cartas b ON b.deck_id = a.deck_id AND b.eh_commander AND b.oracle_id <> a.oracle_id
                WHERE a.oracle_id = %(id)s AND a.eh_commander
                GROUP BY b.oracle_id
            )
            SELECT {COLUNAS_CARTA}, coalesce(j.n, 0)::int AS decks_juntos
            FROM base
            JOIN cartas c ON c.oracle_id <> base.oracle_id AND c.legal_commander AND (
                -- Partner comum e Partner—X: com quem tem exatamente a mesma habilidade
                (base.parceria = 'partner' OR base.parceria LIKE 'partner:%%') AND c.parceria = base.parceria
                -- Partner with: só com a carta citada (pela face da frente, se tiver duas)
                OR base.parceria LIKE 'partner_with:%%'
                   AND substr(base.parceria, length('partner_with:') + 1) IN (c.nome, split_part(c.nome, ' // ', 1))
                OR (base.parceria, c.parceria) IN (
                    ('escolhe_background', 'background'), ('background', 'escolhe_background'),
                    ('companheiro', 'doctor'), ('doctor', 'companheiro'))
            )
            LEFT JOIN juntos j ON j.oracle_id = c.oracle_id
            WHERE %(q)s::text IS NULL OR c.nome ILIKE '%%' || %(q)s || '%%'
            ORDER BY decks_juntos DESC, c.nome
            LIMIT %(limite)s
        """, {"id": oracle_id, "q": q, "limite": limite}).fetchall()


@router.get("/{oracle_id}/recomendacoes", response_model = list[Recomendacao])
def recomendacoes(
    oracle_id: UUID,
    categoria: Categoria | None = None,
    ordem: Ordem = Ordem.score,
    preco_max: float | None = Query(None, gt = 0, description = "só cartas até esse preço, em dólar"),
    limite: int = Query(50, ge = 1, le = 300),
    offset: int = Query(0, ge = 0),
):
    """Recomendações pré-calculadas do commander (pipeline.calcular_recomendacoes)."""
    if ordem == Ordem.estilo:
        raise HTTPException(422, "ordem = estilo depende das cartas do deck: use o POST /recomendar")
    with pool.connection() as conn:
        if conn.execute("SELECT 1 FROM commanders WHERE oracle_id = %s", (oracle_id,)).fetchone() is None:
            raise HTTPException(404, "Commander não encontrado ou sem decks suficientes")
        linhas = conn.execute(f"""
            SELECT {COLUNAS_CARTA}, r.num_decks, r.inclusao, r.sinergia, r.pagerank AS afinidade, r.score
            FROM recomendacoes r
            JOIN cartas c USING (oracle_id)
            WHERE r.commander_id = %(id)s AND c.legal_commander
              AND (%(categoria)s::text IS NULL OR c.categoria = %(categoria)s)
              AND (%(preco_max)s::numeric IS NULL OR c.preco_usd <= %(preco_max)s)
            ORDER BY r.{ordem.value} DESC, r.score DESC
            LIMIT %(limite)s OFFSET %(offset)s
        """, {"id": oracle_id, "categoria": categoria and categoria.value, "preco_max": preco_max,
              "limite": limite, "offset": offset}).fetchall()

    resultado = []
    for linha in linhas:
        carta, resto = separar_carta(linha, CAMPOS_CARTA)
        resultado.append(Recomendacao(carta = carta, **resto))
    return resultado
