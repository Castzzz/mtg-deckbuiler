"""Testes das salas de jogo (não precisam do banco: só o router das salas).

Uso: .venv/bin/python -m pytest tests/test_salas.py
"""
from contextlib import ExitStack

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from api.rotas import salas


@pytest.fixture
def cliente():
    salas.salas.clear()
    app = FastAPI()
    app.include_router(salas.router)
    # As conexões abertas pelo teste fecham no fim, senão o TestClient fica esperando por elas
    with TestClient(app) as c, ExitStack() as conexoes:
        c.conexoes = conexoes
        yield c


def conectar(cliente, codigo, segredo, nome):
    ws = cliente.conexoes.enter_context(cliente.websocket_connect(f"/salas/{codigo}/ws?segredo={segredo}&nome={nome}"))
    eu = ws.receive_json()
    assert eu["tipo"] == "voce"
    return ws, eu["id"]


def ate(ws, tipo):
    """Lê mensagens até chegar uma do tipo pedido."""
    while (msg := ws.receive_json())["tipo"] != tipo:
        pass
    return msg


def test_sala_inexistente(cliente):
    assert cliente.get("/salas/ZZZZZ").status_code == 404
    with cliente.websocket_connect("/salas/ZZZZZ/ws?segredo=a&nome=Ana") as ws:
        with pytest.raises(WebSocketDisconnect) as fechou:
            ws.receive_json()
    assert fechou.value.code == salas.SALA_NAO_EXISTE


def test_entrar_mesa_e_turnos(cliente):
    codigo = cliente.post("/salas").json()["codigo"]
    ana, id_ana = conectar(cliente, codigo, "segredo-ana", "Ana")
    assert ate(ana, "sala")["sala"]["dono"] == id_ana
    assert id_ana != "segredo-ana"  # o segredo nunca vai pros outros

    bia, id_bia = conectar(cliente, codigo, "segredo-bia", "Bia")
    bia.send_json({"tipo": "deck", "deck": {"nome": "Vampiros"}})
    while (sala := ate(bia, "sala")["sala"])["jogadores"][-1]["deck"] is None:
        pass
    assert [j["nome"] for j in sala["jogadores"]] == ["Ana", "Bia"]
    assert cliente.get(f"/salas/{codigo.lower()}").json()["jogadores"][1]["nome"] == "Bia"

    # Só o dono começa
    bia.send_json({"tipo": "comecar"})
    bia.send_json({"tipo": "mesa", "mesa": {"vida": 40}})
    assert ate(ana, "mesa") == {"tipo": "mesa", "jogador": id_bia, "mesa": {"vida": 40}}

    ana.send_json({"tipo": "comecar"})
    sala = ate(ana, "sala")["sala"]
    assert sala["comecou"] and sala["turno"] == 1
    primeiro = sala["vez"]
    segundo = id_bia if primeiro == id_ana else id_ana
    assert [j["id"] for j in sala["jogadores"]][0] == primeiro

    # Quem não está na vez não passa; quem está, passa pro próximo
    quem = {id_ana: ana, id_bia: bia}
    quem[segundo].send_json({"tipo": "passar"})
    quem[primeiro].send_json({"tipo": "passar"})
    sala = ate(ana, "sala")["sala"]
    assert sala["vez"] == segundo and sala["turno"] == 2

    ana.send_json({"tipo": "chat", "texto": "  gg  "})
    while not (linha := ate(bia, "log")["linha"])["chat"]:
        pass
    assert linha["texto"] == "gg" and linha["chat"] and linha["jogador"] == id_ana


def test_reconectar_mantem_a_mesa_e_sair_passa_o_dono(cliente):
    codigo = cliente.post("/salas").json()["codigo"]
    ana, id_ana = conectar(cliente, codigo, "a", "Ana")
    ana.send_json({"tipo": "mesa", "mesa": {"vida": 33}})
    ate(ana, "mesa")
    ana.close()  # fechou a aba

    bia, id_bia = conectar(cliente, codigo, "b", "Bia")
    sala = ate(bia, "sala")["sala"]
    assert sala["jogadores"][0] == {"id": id_ana, "nome": "Ana", "conectado": False, "deck": None, "mesa": {"vida": 33}, "eliminado": False}

    ana, _ = conectar(cliente, codigo, "a", "Ana")
    assert ate(ana, "sala")["sala"]["jogadores"][0]["conectado"]

    ana.send_json({"tipo": "sair"})
    sala = ate(bia, "sala")["sala"]
    while len(sala["jogadores"]) != 1:
        sala = ate(bia, "sala")["sala"]
    assert sala["dono"] == id_bia


def test_sala_cheia(cliente):
    codigo = cliente.post("/salas").json()["codigo"]
    for i in range(salas.MAX_JOGADORES):
        conectar(cliente, codigo, f"s{i}", f"J{i}")
    with cliente.websocket_connect(f"/salas/{codigo}/ws?segredo=x&nome=X") as ws:
        with pytest.raises(WebSocketDisconnect) as fechou:
            ws.receive_json()
    assert fechou.value.code == salas.SALA_CHEIA


def test_regra_de_mulligan_da_sala(cliente):
    assert cliente.post("/salas", json = {"regra_mulligan": "xyz"}).status_code == 422
    codigo = cliente.post("/salas", json = {"regra_mulligan": "london"}).json()["codigo"]
    ana, _ = conectar(cliente, codigo, "a", "Ana")
    assert ate(ana, "sala")["sala"]["regra_mulligan"] == "london"

    bia, _ = conectar(cliente, codigo, "b", "Bia")
    bia.send_json({"tipo": "regras", "regra_mulligan": "commander"})  # só o dono muda
    ana.send_json({"tipo": "regras", "regra_mulligan": "commander"})
    while (sala := ate(bia, "sala")["sala"])["regra_mulligan"] != "commander":
        pass
    assert cliente.post("/salas").json()["codigo"] in salas.salas  # sem corpo: 1º mulligan grátis
    assert salas.salas[codigo].regra_mulligan == "commander"


def test_dados_e_moedas(cliente):
    codigo = cliente.post("/salas").json()["codigo"]
    ana, id_ana = conectar(cliente, codigo, "a", "Ana")
    bia, _ = conectar(cliente, codigo, "b", "Bia")

    ana.send_json({"tipo": "dado", "lados": 7})  # dado que não existe: ignora
    ana.send_json({"tipo": "dado", "lados": 20})
    while not (linha := ate(bia, "log")["linha"]).get("destaque"):
        pass
    assert linha["jogador"] == id_ana and linha["texto"].startswith("Rolou 1d20: ")
    assert 1 <= int(linha["texto"].split(": ")[1]) <= 20

    ana.send_json({"tipo": "dado", "lados": 2})
    assert ate(bia, "log")["linha"]["texto"] in ("Jogou uma moeda: cara", "Jogou uma moeda: coroa")

    ana.send_json({"tipo": "dado", "lados": 6, "quantos": 3})
    texto = ate(bia, "log")["linha"]["texto"]
    valores, total = texto.removeprefix("Rolou 3d6: ").split(" = ")
    assert sum(map(int, valores.split(" + "))) == int(total)


def test_comecar_anuncia_quem_foi_sorteado(cliente):
    codigo = cliente.post("/salas").json()["codigo"]
    ana, _ = conectar(cliente, codigo, "a", "Ana")
    bia, _ = conectar(cliente, codigo, "b", "Bia")
    ana.send_json({"tipo": "comecar"})
    while not (linha := ate(bia, "log")["linha"]).get("destaque"):
        pass
    sala = ate(bia, "sala")["sala"]
    nome_da_vez = next(j["nome"] for j in sala["jogadores"] if j["id"] == sala["vez"])
    assert linha["texto"].startswith(f"Sorteio: {nome_da_vez} começa.")
    assert salas.rolar(2, 3).startswith("Jogou 3 moedas: ")


def test_eliminado_e_pulado_na_vez(cliente):
    codigo = cliente.post("/salas").json()["codigo"]
    ws = {}
    for nome in ("Ana", "Bia", "Caio"):
        ws[nome] = conectar(cliente, codigo, nome.lower(), nome)
    ana = ws["Ana"][0]
    ana.send_json({"tipo": "comecar"})
    while not (sala := ate(ana, "sala")["sala"])["comecou"]:
        pass
    por_id = {i: nome for nome, (_, i) in ws.items()}
    ordem = [j["id"] for j in sala["jogadores"]]

    # O segundo da mesa é eliminado (fora da vez dele): o primeiro passa e cai direto no terceiro
    ws[por_id[ordem[1]]][0].send_json({"tipo": "eliminado"})
    while not (sala := ate(ana, "sala")["sala"])["jogadores"][1]["eliminado"]:
        pass
    ws[por_id[ordem[0]]][0].send_json({"tipo": "passar"})
    while (sala := ate(ana, "sala")["sala"])["vez"] == ordem[0]:
        pass
    assert sala["vez"] == ordem[2]

    # O da vez é eliminado: a vez já passa (pulando o morto) e sobra um, que vence
    ws[por_id[ordem[2]]][0].send_json({"tipo": "eliminado"})
    while (sala := ate(ana, "sala")["sala"])["vez"] != ordem[0]:
        pass
    assert any("venceu a partida" in l["texto"] and l.get("destaque") for l in sala["log"])


def test_transferir_carta_e_guardar_pra_quem_esta_fora(cliente):
    codigo = cliente.post("/salas").json()["codigo"]
    ana, id_ana = conectar(cliente, codigo, "a", "Ana")
    bia, id_bia = conectar(cliente, codigo, "b", "Bia")

    carta = {"id": 7, "carta": {"nome": "Threaten"}, "virada": True}
    ana.send_json({"tipo": "transferir", "para": id_bia, "carta": carta})
    assert ate(bia, "transferir") == {
        "tipo": "transferir", "de": id_ana, "carta": carta, "devolvendo": False, "zona": None, "posicao": None,
    }

    # Bia pega uma carta da Ana: o pedido vai pro navegador da Ana
    bia.send_json({"tipo": "pedir", "de": id_ana, "id": 3})
    assert ate(ana, "pedido") == {"tipo": "pedido", "por": id_bia, "id": 3}

    # Ana fechou a aba: a devolução fica guardada e chega quando ela voltar
    ana.close()
    bia.send_json({"tipo": "transferir", "para": id_ana, "carta": carta, "devolvendo": True, "zona": "cemiterio"})
    while not salas.salas[codigo].jogadores[id_ana].pendentes:
        bia.send_json({"tipo": "log", "texto": "esperando"})  # só pra dar tempo do servidor tratar
        ate(bia, "log")
    ana, _ = conectar(cliente, codigo, "a", "Ana")
    msg = ate(ana, "transferir")
    assert msg["devolvendo"] and msg["zona"] == "cemiterio" and msg["de"] == id_bia
    assert not salas.salas[codigo].jogadores[id_ana].pendentes


def test_conceder_voltar_e_avisar_o_dono(cliente):
    codigo = cliente.post("/salas").json()["codigo"]
    ana, id_ana = conectar(cliente, codigo, "a", "Ana")
    bia, id_bia = conectar(cliente, codigo, "b", "Bia")
    caio, id_caio = conectar(cliente, codigo, "c", "Caio")
    ana.send_json({"tipo": "comecar"})

    caio.send_json({"tipo": "eliminado", "concedeu": True})
    while (linha := ate(ana, "log")["linha"])["texto"] != "Caio concedeu":
        pass
    caio.send_json({"tipo": "voltar"})
    while (linha := ate(ana, "log")["linha"])["texto"] != "Caio voltou pro jogo":
        pass
    assert linha["destaque"]
    assert not salas.salas[codigo].jogadores[id_caio].eliminado

    # A Bia passou pro Caio uma carta que é da Ana: a Ana fica sabendo com quem ela está
    bia.send_json({"tipo": "controle", "para": id_ana, "id": 4, "com": id_caio})
    assert ate(ana, "controle") == {"tipo": "controle", "de": id_bia, "id": 4, "com": id_caio}
