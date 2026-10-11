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
    assert sala["jogadores"][0] == {"id": id_ana, "nome": "Ana", "conectado": False, "deck": None, "mesa": {"vida": 33}}

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
