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
