"""Estimativa do bracket do deck, pelas regras oficiais de Commander Brackets (Wizards, 2025).

Quem detecta combos, destruição de terrenos em massa e turnos extras é o Commander Spellbook;
aqui só aplicamos as regras em cima disso e explicamos o porquê. O que depende da intenção de quem
monta (1 Exhibition x 2 Core, 4 Optimized x 5 cEDH) não dá pra saber pela lista, então o resultado
é o menor bracket em que o deck cabe.
"""
import hashlib
import json
from collections import OrderedDict

import requests
from fastapi import APIRouter

from api.banco import pool
from api.modelos import Bracket, ComboBracket, PedidoBracket

router = APIRouter(tags = ["bracket"])

URL_SPELLBOOK = "https://backend.commanderspellbook.com/estimate-bracket"
HEADERS = {"User-Agent": "mtg-deckbuilder/0.1 (projeto pessoal)", "Accept": "application/json"}
MAX_GAME_CHANGERS_BRACKET_3 = 3

# O mesmo deck costuma ser pedido várias vezes seguidas (cada carta adicionada muda pouca coisa)
_cache: OrderedDict[str, Bracket] = OrderedDict()
TAMANHO_CACHE = 200


def consultar_spellbook(commanders: list[str], cartas: list[tuple[str, int]]) -> dict | None:
    corpo = {
        "commanders": [{"card": nome} for nome in commanders],
        "main": [{"card": nome, "quantity": qtd} for nome, qtd in cartas],
    }
    try:
        r = requests.post(URL_SPELLBOOK, json = corpo, headers = HEADERS, timeout = 20)
        r.raise_for_status()
        return r.json()
    except requests.RequestException:
        return None


def classificar(game_changers: list[str], terrenos_em_massa: list[str], turnos_extras: list[str],
                combos: list[ComboBracket], spellbook_ok: bool) -> Bracket:
    bracket, motivos = 2, []

    if game_changers:
        n = len(game_changers)
        if n <= MAX_GAME_CHANGERS_BRACKET_3:
            bracket = max(bracket, 3)
            motivos.append(f"{n} Game Changer{'s' if n > 1 else ''}: os brackets 1 e 2 não permitem nenhum, o 3 permite até 3")
        else:
            bracket = max(bracket, 4)
            motivos.append(f"{n} Game Changers: o bracket 3 permite no máximo 3")
    if terrenos_em_massa:
        bracket = max(bracket, 4)
        motivos.append("Destruição de terrenos em massa: só a partir do bracket 4")
    if any(c.turnos_extras for c in combos):
        bracket = max(bracket, 4)
        motivos.append("Combo de turnos extras em sequência: só a partir do bracket 4")
    dois_cartas = [c for c in combos if c.duas_cartas]
    if dois_cartas:
        bracket = max(bracket, 3)
        motivos.append("Combo infinito de 2 cartas: os brackets 1 e 2 não permitem; no 3, só se não ganhar o jogo cedo")
    if turnos_extras and bracket < 4:
        motivos.append("Turnos extras: tudo bem em poucos, desde que não entrem em sequência")
    if not spellbook_ok:
        motivos.append("Não consegui falar com o Commander Spellbook: combos, turnos extras e destruição "
                       "de terrenos não foram verificados")

    return Bracket(bracket = bracket, motivos = motivos, game_changers = game_changers,
                   terrenos_em_massa = terrenos_em_massa, turnos_extras = turnos_extras,
                   combos = combos, verificado = spellbook_ok)


@router.post("/bracket", response_model = Bracket)
def bracket(pedido: PedidoBracket):
    """Bracket estimado do deck (o menor em que ele cabe) e os motivos."""
    ids = [str(c) for c in pedido.commanders] + [str(c.oracle_id) for c in pedido.cartas]
    with pool.connection() as conn:
        linhas = conn.execute("""
            SELECT oracle_id::text, nome, coalesce((dados->>'game_changer')::boolean, false) AS game_changer
            FROM cartas WHERE oracle_id = ANY(%s::uuid[])
        """, (ids,)).fetchall()
    por_id = {l["oracle_id"]: l for l in linhas}

    commanders = [por_id[str(c)]["nome"] for c in pedido.commanders if str(c) in por_id]
    cartas = [(por_id[str(c.oracle_id)]["nome"], c.qtd) for c in pedido.cartas if str(c.oracle_id) in por_id]

    chave = hashlib.sha1(json.dumps([sorted(commanders), sorted(cartas)]).encode()).hexdigest()
    if chave in _cache:
        _cache.move_to_end(chave)
        return _cache[chave]

    # Game Changers vêm do nosso banco (lista do Scryfall), então funcionam mesmo sem o Spellbook
    game_changers = sorted(l["nome"] for l in linhas if l["game_changer"])
    resposta = consultar_spellbook(commanders, cartas)
    terrenos_em_massa, turnos_extras, combos = [], [], []
    if resposta:
        terrenos_em_massa = sorted(c["card"]["name"] for c in resposta["cards"] if c["massLandDenial"])
        turnos_extras = sorted(c["card"]["name"] for c in resposta["cards"] if c["extraTurn"])
        combos = [
            ComboBracket(
                cartas = [u["card"]["name"] for u in v["combo"]["uses"]],
                resultado = [p["feature"]["name"] for p in v["combo"]["produces"]][:4],
                duas_cartas = v["definitelyTwoCard"],
                turnos_extras = v["extraTurn"],
                link = f"https://commanderspellbook.com/combo/{v['combo']['id']}/",
            )
            for v in resposta["combos"] if v["relevant"]
        ]

    resultado = classificar(game_changers, terrenos_em_massa, turnos_extras, combos, resposta is not None)
    if resposta is not None:  # sem o Spellbook, tenta de novo na próxima
        _cache[chave] = resultado
        if len(_cache) > TAMANHO_CACHE:
            _cache.popitem(last = False)
    return resultado
