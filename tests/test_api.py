"""Testes da API contra o banco local (precisa do Postgres rodando com os dados importados).

Uso: .venv/bin/python -m pytest tests/
"""
import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture(scope = "module")
def cliente():
    # O `with` roda o lifespan (abre o pool e carrega o grafo, ~20s), uma vez pro módulo todo
    with TestClient(app) as c:
        yield c


def oracle_id(cliente, nome: str) -> str:
    cartas = cliente.get("/cartas", params = {"q": nome}).json()
    return next(c["oracle_id"] for c in cartas if c["nome"] == nome)


def test_saude(cliente):
    r = cliente.get("/saude")
    assert r.status_code == 200
    assert r.json()["cartas_no_grafo"] > 0


def test_busca_prioriza_quem_comeca_com_o_texto(cliente):
    nomes = [c["nome"] for c in cliente.get("/cartas", params = {"q": "sol ring"}).json()]
    assert nomes[0] == "Sol Ring"


def test_busca_curta_demais(cliente):
    assert cliente.get("/cartas", params = {"q": "a"}).status_code == 422


def test_busca_filtra_identidade_de_cor(cliente):
    cartas = cliente.get("/cartas", params = {"q": "bolt", "cores": "UB", "limite": 100}).json()
    assert cartas and all(set(c["identidade_cor"]) <= {"U", "B"} for c in cartas)
    assert "Lightning Bolt" not in {c["nome"] for c in cartas}


def test_cartas_por_nome(cliente):
    nomes = ["sol ring", "Fire / Ice", "Delver of Secrets", "Mana Crypt", "Carta Que Não Existe", "Atraxa, Praetors\u2019 Voice"]
    r = cliente.post("/cartas/por-nome", json = {"nomes": nomes}).json()
    assert r["sol ring"]["nome"] == "Sol Ring" and r["sol ring"]["legal"]
    assert r["Fire / Ice"]["nome"] == "Fire // Ice"
    assert r["Delver of Secrets"]["nome"] == "Delver of Secrets // Insectile Aberration"  # só a frente
    assert not r["Mana Crypt"]["legal"]  # banida
    assert r["Atraxa, Praetors\u2019 Voice"]["pode_ser_commander"]
    assert "Carta Que Não Existe" not in r


def test_edicoes_da_carta(cliente):
    sol_ring = oracle_id(cliente, "Sol Ring")
    edicoes = cliente.get(f"/cartas/{sol_ring}/edicoes").json()
    assert len(edicoes) > 30 and all(e["imagem_url"] for e in edicoes)
    datas = [e["lancamento"] for e in edicoes]
    assert datas == sorted(datas, reverse = True)


def test_carta_inexistente(cliente):
    assert cliente.get("/cartas/00000000-0000-0000-0000-000000000000").status_code == 404


def test_recomendacoes_do_commander_filtram_categoria(cliente):
    edgar = oracle_id(cliente, "Edgar Markov")
    recs = cliente.get(f"/commanders/{edgar}/recomendacoes", params = {"categoria": "terreno", "limite": 10}).json()
    assert recs and all(r["carta"]["categoria"] == "terreno" for r in recs)
    scores = [r["score"] for r in recs]
    assert scores == sorted(scores, reverse = True)


@pytest.mark.parametrize("ordem", ["sinergia", "inclusao"])
def test_recomendacoes_do_commander_por_ordem(cliente, ordem):
    edgar = oracle_id(cliente, "Edgar Markov")
    for filtro in [{}, {"categoria": "terreno"}]:
        recs = cliente.get(f"/commanders/{edgar}/recomendacoes", params = {"ordem": ordem, "limite": 60, **filtro}).json()
        assert len(recs) == 60
        valores = [r[ordem] for r in recs]
        assert valores == sorted(valores, reverse = True)


def test_recomendar_nao_sugere_cartas_do_deck_nem_fora_das_cores(cliente):
    edgar = oracle_id(cliente, "Edgar Markov")
    no_deck = [oracle_id(cliente, n) for n in ["Blood Artist", "Viscera Seer"]]
    recs = cliente.post("/recomendar", json = {"commanders": [edgar], "cartas": no_deck, "limite": 300}).json()

    assert recs
    assert not {r["carta"]["oracle_id"] for r in recs} & set(no_deck)
    assert all(set(r["carta"]["identidade_cor"]) <= {"W", "B", "R"} for r in recs)


def test_recomendar_por_estilo_puxa_pro_tema_do_deck(cliente):
    edgar = oracle_id(cliente, "Edgar Markov")
    sacrificio = [oracle_id(cliente, n) for n in
                  ["Blood Artist", "Zulaport Cutthroat", "Viscera Seer", "Carrion Feeder", "Falkenrath Noble"]]
    recs = cliente.post("/recomendar", json = {
        "commanders": [edgar], "cartas": sacrificio, "ordem": "estilo", "limite": 10,
    }).json()
    nomes = {r["carta"]["nome"] for r in recs}
    assert nomes & {"Cruel Celebrant", "Phyrexian Altar", "Ashnod's Altar", "Yahenni, Undying Partisan"}


def test_recomendar_por_estilo_acha_o_arquetipo_fora_do_commander(cliente):
    # Group hug com a Atraxa: quase ninguém joga assim, então os decks parecidos vêm de outros commanders
    atraxa = oracle_id(cliente, "Atraxa, Praetors' Voice")
    group_hug = [oracle_id(cliente, n) for n in
                 ["Howling Mine", "Kami of the Crescent Moon", "Temple Bell", "Font of Mythos", "Rites of Flourishing"]]
    recs = cliente.post("/recomendar", json = {
        "commanders": [atraxa], "cartas": group_hug, "ordem": "estilo", "limite": 15,
    }).json()
    nomes = {r["carta"]["nome"] for r in recs}
    assert len(nomes & {"Dictate of Kruphix", "Kwain, Itinerant Meddler", "Minds Aglow", "Prosperity",
                        "Horn of Greed", "Forced Fruition", "Folio of Fancies", "Collective Voyage"}) >= 3


def test_recomendacoes_respeitam_o_preco_maximo(cliente):
    edgar = oracle_id(cliente, "Edgar Markov")
    pre = cliente.get(f"/commanders/{edgar}/recomendacoes", params = {"preco_max": 2, "limite": 50}).json()
    na_hora = cliente.post("/recomendar", json = {"commanders": [edgar], "preco_max": 2, "limite": 50}).json()
    for recs in [pre, na_hora]:
        assert len(recs) == 50
        assert all(r["carta"]["preco_usd"] is not None and r["carta"]["preco_usd"] <= 2 for r in recs)


def test_cartas_por_id_trazem_o_preco(cliente):
    sol_ring = oracle_id(cliente, "Sol Ring")
    [carta] = cliente.post("/cartas/por-id", json = {"ids": [sol_ring]}).json()
    assert 0 < carta["preco_usd"] < 20


def test_bracket_aplica_as_regras():
    from api.modelos import ComboBracket
    from api.rotas.bracket import classificar

    combo = ComboBracket(cartas = ["A", "B"], resultado = ["Infinite mana"], duas_cartas = True, turnos_extras = False, link = "")
    assert classificar([], [], [], [], True).bracket == 2
    assert classificar(["Rhystic Study"], [], [], [], True).bracket == 3
    assert classificar(["a", "b", "c", "d"], [], [], [], True).bracket == 4
    assert classificar([], ["Armageddon"], [], [], True).bracket == 4
    assert classificar([], [], [], [combo], True).bracket == 3
    assert classificar([], [], ["Time Warp"], [], True).bracket == 2  # turno extra solto não sobe o bracket


def test_bracket_do_deck(cliente):
    edgar = oracle_id(cliente, "Edgar Markov")
    cartas = [{"oracle_id": oracle_id(cliente, n)} for n in ["Sol Ring", "Blood Artist", "Smothering Tithe"]]
    r = cliente.post("/bracket", json = {"commanders": [edgar], "cartas": cartas}).json()
    assert r["game_changers"] == ["Smothering Tithe"]
    assert r["bracket"] == 3


def test_recomendar_partners(cliente):
    frodo, sam = oracle_id(cliente, "Frodo, Adventurous Hobbit"), oracle_id(cliente, "Sam, Loyal Attendant")
    r = cliente.post("/recomendar", json = {"commanders": [frodo, sam], "limite": 5})
    assert r.status_code == 200 and len(r.json()) == 5


def test_parceiros_partner_with_so_aceita_a_carta_citada(cliente):
    frodo = oracle_id(cliente, "Frodo, Adventurous Hobbit")
    assert [p["nome"] for p in cliente.get(f"/commanders/{frodo}/parceiros").json()] == ["Sam, Loyal Attendant"]


def test_parceiros_background_vem_dos_mais_jogados(cliente):
    halsin = oracle_id(cliente, "Halsin, Emerald Archdruid")
    parceiros = cliente.get(f"/commanders/{halsin}/parceiros", params = {"limite": 200}).json()
    assert len(parceiros) >= 20 and all(p["parceria"] == "background" for p in parceiros)
    juntos = [p["decks_juntos"] for p in parceiros]
    assert juntos == sorted(juntos, reverse = True)


def test_parceiros_de_quem_nao_tem_parceria(cliente):
    edgar = oracle_id(cliente, "Edgar Markov")
    assert cliente.get(f"/commanders/{edgar}/parceiros").json() == []


def test_recomendar_rejeita_quem_nao_pode_ser_commander(cliente):
    sol_ring = oracle_id(cliente, "Sol Ring")
    assert cliente.post("/recomendar", json = {"commanders": [sol_ring]}).status_code == 422


def test_tokens_do_deck(cliente):
    ids = [oracle_id(cliente, "Edgar Markov"), oracle_id(cliente, "Smothering Tithe"), oracle_id(cliente, "Pitiless Plunderer")]
    tokens = cliente.post("/tokens/do-deck", json = {"ids": ids}).json()
    por_nome = {t["token"]["nome"]: t for t in tokens}
    # Treasure vem primeiro: duas cartas do deck criam
    assert tokens[0]["token"]["nome"] == "Treasure"
    assert tokens[0]["criado_por"] == ["Pitiless Plunderer", "Smothering Tithe"]
    assert por_nome["Vampire"]["criado_por"] == ["Edgar Markov"]
    assert por_nome["Vampire"]["token"]["poder"] == "1"
    assert all(t["token"]["imagem_url"] for t in tokens)


def test_busca_tokens_por_nome_ou_tipo(cliente):
    tokens = cliente.get("/tokens", params = {"q": "treasure"}).json()
    assert tokens[0]["nome"] == "Treasure"
    zumbis = cliente.get("/tokens", params = {"q": "zombie"}).json()
    assert zumbis and all("zombie" in (t["nome"] + t["tipo"]).lower() for t in zumbis)


def test_sugerir_commanders_pelas_cartas_do_deck(cliente):
    elfos = [oracle_id(cliente, n) for n in ["Llanowar Elves", "Elvish Archdruid", "Priest of Titania", "Heritage Druid"]]
    sugestoes = cliente.post("/sugerir-commanders", json = {"cartas": elfos, "limite": 5}).json()
    assert len(sugestoes) == 5
    assert {"Lathril, Blade of the Elves", "Marwyn, the Nurturer", "Ezuri, Renegade Leader"} & {s["nome"] for s in sugestoes}
    assert all(s["pode_ser_commander"] and s["legal"] and s["fora_das_cores"] == 0 for s in sugestoes)


def test_sugerir_commanders_evita_quem_nao_pode_usar_as_cartas(cliente):
    # Deck Mardu: quem não tem vermelho ou branco fica pra trás, mesmo jogando com vampiros
    nomes = ["Blood Artist", "Falkenrath Noble", "Cordial Vampire", "Lightning Bolt", "Swords to Plowshares", "Sacred Foundry"]
    sugestoes = cliente.post("/sugerir-commanders", json = {"cartas": [oracle_id(cliente, n) for n in nomes], "limite": 5}).json()
    assert sugestoes[0]["nome"] == "Edgar Markov"
    assert all(s["fora_das_cores"] == 0 for s in sugestoes)


def test_commanders_por_identidade_exata(cliente):
    orzhov = cliente.get("/commanders", params = {"cores": "BW", "limite": 30}).json()
    assert orzhov and all(sorted(c["identidade_cor"]) == ["B", "W"] for c in orzhov)
    assert [c["num_decks"] for c in orzhov] == sorted((c["num_decks"] for c in orzhov), reverse = True)
    incolores = cliente.get("/commanders", params = {"cores": "C", "limite": 30}).json()
    assert incolores and all(c["identidade_cor"] == [] for c in incolores)
    assert cliente.get("/commanders", params = {"cores": "WC"}).status_code == 422
