"""Testes das contas e dos decks salvos nelas (precisa do Postgres rodando, com a migração 004).

Uso: .venv/bin/python -m pytest tests/test_contas.py
"""
import secrets

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from api.banco import DSN
from api.rotas import contas, meus_decks

# Um pool só destes testes: o de api.banco não reabre depois que outro teste (o da API inteira) fecha ele
pool = ConnectionPool(DSN, min_size = 1, max_size = 4, open = False, kwargs = {"row_factory": dict_row})


@pytest.fixture(scope = "module")
def app():
    pool.open()
    originais = contas.pool, meus_decks.pool
    contas.pool = meus_decks.pool = pool
    app = FastAPI()
    app.include_router(contas.router)
    app.include_router(meus_decks.router)
    criados = []
    app.state.criados = criados
    yield app
    # apaga as contas criadas pelos testes (as sessões e os decks vão junto)
    with pool.connection() as conn:
        conn.execute("DELETE FROM usuarios WHERE lower(usuario) = ANY(%s)", ([u.lower() for u in criados],))
    contas.pool, meus_decks.pool = originais
    pool.close()


def cliente_novo(app) -> TestClient:
    """Um cliente sem cookie (outro navegador), com `criar` pra criar uma conta e entrar nela."""
    cliente = TestClient(app)

    def criar(senha = "senha-boa-123"):
        usuario = "t_" + secrets.token_hex(4)
        app.state.criados.append(usuario)
        r = cliente.post("/contas", json = {"usuario": usuario, "email": f"{usuario}@teste.com", "senha": senha})
        assert r.status_code == 201, r.text
        return r.json()
    cliente.criar = criar
    return cliente


@pytest.fixture
def novo(app):
    return cliente_novo(app)


def oracle_ids(n: int) -> list[str]:
    with pool.connection() as conn:
        return [str(l["oracle_id"]) for l in conn.execute("SELECT oracle_id FROM cartas ORDER BY nome LIMIT %s", (n,))]


def deck(ids: list[str], quando = "2026-01-01T10:00:00Z", nome = "Teste"):
    return {
        "nome": nome,
        "commanders": [{"oracle_id": ids[0], "nome": "o navegador manda a carta inteira"}],
        "cartas": [{"carta": {"oracle_id": i}, "qtd": 1, "origem": "busca"} for i in ids[1:]],
        "artes": {},
        "criadoEm": "2026-01-01T10:00:00Z",
        "atualizadoEm": quando,
    }


def test_criar_conta_ja_entra(novo):
    conta = novo.criar()
    assert "senha" not in str(conta)
    assert novo.get("/eu").json() == conta


def test_sem_login(novo):
    assert novo.get("/eu").status_code == 401
    assert novo.get("/meus-decks").status_code == 401


def test_nome_e_email_repetidos(novo, app):
    conta = novo.criar()
    outro = TestClient(app)
    r = outro.post("/contas", json = {"usuario": conta["usuario"].upper(), "email": "outro@teste.com", "senha": "senha-boa-123"})
    assert r.status_code == 409 and "usuário" in r.json()["detail"]
    app.state.criados.append("t_outro")
    r = outro.post("/contas", json = {"usuario": "t_outro", "email": conta["email"].upper(), "senha": "senha-boa-123"})
    assert r.status_code == 409 and "e-mail" in r.json()["detail"]


def test_validacao(novo):
    assert novo.post("/contas", json = {"usuario": "a b", "email": "x@y.com", "senha": "senha-boa-123"}).status_code == 422
    assert novo.post("/contas", json = {"usuario": "t_curta", "email": "x@y.com", "senha": "1234"}).status_code == 422
    assert novo.post("/contas", json = {"usuario": "t_email", "email": "sem-arroba", "senha": "senha-boa-123"}).status_code == 422


def test_login_logout(novo, app):
    conta = novo.criar(senha = "minha-senha-1")
    novo.post("/logout")
    assert novo.get("/eu").status_code == 401
    assert novo.post("/login", json = {"login": conta["usuario"], "senha": "errada-123"}).status_code == 401
    assert novo.post("/login", json = {"login": "t_ninguem_" + secrets.token_hex(3), "senha": "x"}).status_code == 401
    # pelo nome ou pelo e-mail, sem ligar pra maiúsculas
    assert novo.post("/login", json = {"login": conta["usuario"].upper(), "senha": "minha-senha-1"}).json() == conta
    outro = TestClient(app)
    assert outro.post("/login", json = {"login": conta["email"], "senha": "minha-senha-1"}).status_code == 200
    # sair num aparelho não tira o outro
    novo.post("/logout")
    assert outro.get("/eu").status_code == 200


def test_muitas_senhas_erradas(novo):
    conta = novo.criar(senha = "minha-senha-1")
    for _ in range(contas.MAX_ERROS):
        assert novo.post("/login", json = {"login": conta["usuario"], "senha": "errada-123"}).status_code == 401
    assert novo.post("/login", json = {"login": conta["usuario"], "senha": "minha-senha-1"}).status_code == 429


def test_sessao_vencida(novo):
    novo.criar()
    with pool.connection() as conn:
        conn.execute("UPDATE sessoes SET expira_em = now() - interval '1 second' WHERE token_hash = %s",
                     (contas.hash_token(novo.cookies[contas.COOKIE]),))
    assert novo.get("/eu").status_code == 401


def test_salvar_e_ler_deck(novo):
    novo.criar()
    ids = oracle_ids(4)
    r = novo.put("/meus-decks/d1", json = deck(ids))
    assert r.status_code == 200, r.text
    salvo = novo.get("/meus-decks").json()
    assert len(salvo) == 1
    d = salvo[0]
    assert d["id"] == "d1" and d["nome"] == "Teste"
    assert [c["oracle_id"] for c in d["commanders"]] == ids[:1]
    # na ordem em que foram postas, e com os dados da carta vindos do banco
    assert [c["carta"]["oracle_id"] for c in d["cartas"]] == ids[1:]
    assert d["cartas"][0]["carta"]["nome"] and d["cartas"][0]["origem"] == "busca"


def test_sideboard_e_maybeboard(novo):
    novo.criar()
    ids = oracle_ids(4)
    d = deck(ids[:3])
    d["sideboard"] = [{"carta": {"oracle_id": ids[3]}, "qtd": 1}]
    d["maybeboard"] = [{"carta": {"oracle_id": ids[1]}, "qtd": 2, "origem": "sugestao"}]  # também está no deck
    salvo = novo.put("/meus-decks/d1", json = d).json()
    assert [c["carta"]["oracle_id"] for c in salvo["cartas"]] == ids[1:3]
    assert [c["carta"]["oracle_id"] for c in salvo["sideboard"]] == ids[3:]
    assert salvo["maybeboard"][0]["carta"]["oracle_id"] == ids[1] and salvo["maybeboard"][0]["qtd"] == 2
    # deck que veio sem (de antes) tem os dois vazios
    assert novo.put("/meus-decks/d2", json = deck(ids)).json()["sideboard"] == []


def test_atualizar_deck(novo):
    novo.criar()
    ids = oracle_ids(5)
    novo.put("/meus-decks/d1", json = deck(ids[:3]))
    r = novo.put("/meus-decks/d1", json = deck(ids, quando = "2026-01-02T10:00:00Z", nome = "Novo nome"))
    assert r.json()["nome"] == "Novo nome" and len(r.json()["cartas"]) == 4
    # uma versão mais velha (de outro aparelho) não passa por cima: volta a de agora
    r = novo.put("/meus-decks/d1", json = deck(ids[:2], quando = "2026-01-01T12:00:00Z", nome = "Velho"))
    assert r.json()["nome"] == "Novo nome" and len(r.json()["cartas"]) == 4


def test_cada_um_ve_so_os_seus(novo, app):
    novo.criar()
    ids = oracle_ids(3)
    novo.put("/meus-decks/mesmo-id", json = deck(ids, nome = "Meu"))
    outro = cliente_novo(app)
    outro.criar()
    assert outro.get("/meus-decks").json() == []
    # o mesmo id em outra conta é outro deck
    outro.put("/meus-decks/mesmo-id", json = deck(ids, nome = "Do outro"))
    outro.delete("/meus-decks/mesmo-id")
    assert novo.get("/meus-decks").json()[0]["nome"] == "Meu"


def test_apagar_deck(novo):
    novo.criar()
    novo.put("/meus-decks/d1", json = deck(oracle_ids(3)))
    assert novo.delete("/meus-decks/d1").status_code == 204
    assert novo.get("/meus-decks").json() == []


def test_carta_que_nao_existe(novo):
    novo.criar()
    d = deck(oracle_ids(2))
    d["cartas"].append({"carta": {"oracle_id": "00000000-0000-0000-0000-000000000000"}, "qtd": 1})
    assert novo.put("/meus-decks/d1", json = d).status_code == 422
