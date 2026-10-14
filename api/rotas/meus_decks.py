"""Os decks de quem tem conta. O navegador guarda uma cópia e manda cada mudança pra cá."""
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Path
from psycopg.errors import ForeignKeyViolation
from psycopg.types.json import Jsonb

from api.banco import COLUNAS_CARTA, pool, separar_carta
from api.modelos import Carta, DeckEntrada, DeckSalvo, Usuario
from api.rotas.contas import usuario_atual

router = APIRouter(prefix = "/meus-decks", tags = ["contas"])

ID_DECK = Path(max_length = 64)
CAMPOS_CARTA = set(Carta.model_fields)
SECOES = ("cartas", "sideboard", "maybeboard")  # fora os commanders


def ler_decks(conn, usuario_id: int, deck_id: str | None = None) -> list[dict]:
    filtro = "AND d.id = %(deck)s" if deck_id else ""
    decks = conn.execute(f"""
        SELECT d.id, d.nome, d.artes, d.criado_em AS "criadoEm", d.atualizado_em AS "atualizadoEm"
        FROM decks_usuario d WHERE d.usuario_id = %(u)s {filtro}
        ORDER BY d.atualizado_em DESC
    """, {"u": usuario_id, "deck": deck_id}).fetchall()
    cartas = conn.execute(f"""
        SELECT dc.deck_id, dc.quantidade AS qtd, dc.origem, dc.secao, {COLUNAS_CARTA}
        FROM decks_usuario_cartas dc JOIN cartas c ON c.oracle_id = dc.oracle_id
        WHERE dc.usuario_id = %(u)s {filtro.replace('d.id', 'dc.deck_id')}
        ORDER BY dc.ordem
    """, {"u": usuario_id, "deck": deck_id}).fetchall()
    por_deck = defaultdict(lambda: {"commanders": [], **{s: [] for s in SECOES}})
    for linha in cartas:
        carta, resto = separar_carta(linha, CAMPOS_CARTA)
        if resto["secao"] == "commander":
            por_deck[resto["deck_id"]]["commanders"].append(carta)
        else:
            por_deck[resto["deck_id"]][resto["secao"]].append({"carta": carta, "qtd": resto["qtd"], "origem": resto["origem"]})
    return [{**d, **por_deck[d["id"]]} for d in decks]


@router.get("", response_model = list[DeckSalvo])
def listar(usuario: Usuario = Depends(usuario_atual)):
    """Todos os decks da conta, do mexido por último pro mais antigo."""
    with pool.connection() as conn:
        return ler_decks(conn, usuario.id)


@router.put("/{deck_id}", response_model = DeckSalvo)
def salvar(deck: DeckEntrada, deck_id: str = ID_DECK, usuario: Usuario = Depends(usuario_atual)):
    """Cria ou atualiza o deck. Se o que está aqui foi mexido depois (em outro aparelho), fica o daqui,
    e a resposta traz ele pro navegador atualizar a cópia dele."""
    # a mesma carta duas vezes na mesma seção (não deveria acontecer) vira uma só, somando
    linhas: dict[tuple, dict] = {}
    for ordem, c in enumerate(deck.commanders):
        linhas[(c.oracle_id, "commander")] = {"qtd": 1, "origem": None, "ordem": ordem}
    for secao in SECOES:
        for c in getattr(deck, secao):
            chave = (c.carta.oracle_id, secao)
            if chave in linhas:
                linhas[chave]["qtd"] += c.qtd
            else:
                linhas[chave] = {"qtd": c.qtd, "origem": c.origem, "ordem": len(linhas)}
    try:
        with pool.connection() as conn, conn.transaction():
            gravou = conn.execute("""
                INSERT INTO decks_usuario (usuario_id, id, nome, artes, criado_em, atualizado_em)
                VALUES (%(u)s, %(id)s, %(nome)s, %(artes)s, %(criado)s, %(atualizado)s)
                ON CONFLICT (usuario_id, id) DO UPDATE
                SET nome = EXCLUDED.nome, artes = EXCLUDED.artes, atualizado_em = EXCLUDED.atualizado_em
                WHERE decks_usuario.atualizado_em <= EXCLUDED.atualizado_em
                RETURNING id
            """, {
                "u": usuario.id, "id": deck_id, "nome": deck.nome, "artes": Jsonb(deck.artes or {}),
                "criado": deck.criadoEm, "atualizado": deck.atualizadoEm,
            }).fetchone()
            if gravou:
                conn.execute("DELETE FROM decks_usuario_cartas WHERE usuario_id = %s AND deck_id = %s", (usuario.id, deck_id))
                with conn.cursor() as cur:
                    cur.executemany("""
                        INSERT INTO decks_usuario_cartas (usuario_id, deck_id, oracle_id, secao, quantidade, origem, ordem)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """, [(usuario.id, deck_id, oid, secao, l["qtd"], l["origem"], l["ordem"]) for (oid, secao), l in linhas.items()])
            return ler_decks(conn, usuario.id, deck_id)[0]
    except ForeignKeyViolation:
        raise HTTPException(422, "O deck tem uma carta que não existe no banco")


@router.delete("/{deck_id}", status_code = 204)
def apagar(deck_id: str = ID_DECK, usuario: Usuario = Depends(usuario_atual)):
    with pool.connection() as conn:
        conn.execute("DELETE FROM decks_usuario WHERE usuario_id = %s AND id = %s", (usuario.id, deck_id))
