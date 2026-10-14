"""API do mtg-deckbuilder.

Uso: uvicorn api.main:app --reload
Documentação interativa em http://localhost:8000/docs
"""
import os
import threading
import time
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.banco import pool
from api.rotas import bracket, cartas, commanders, contas, cotacao, meus_decks, recomendar, salas, tokens
from recomendador.grafo import carregar_grafo


INTERVALO_RECARGA = 300  # segundos entre uma checagem e outra de dados novos no banco


def versao_dados(conn) -> dict:
    # Muda quando o pipeline recalcula as recomendações ou reimporta os preços
    return conn.execute("""
        SELECT (SELECT max(calculado_em) FROM commanders) AS recomendacoes,
               (SELECT max(atualizado_em) FROM impressoes) AS precos
    """).fetchone()


def carregar_dados(app: FastAPI):
    t = time.monotonic()
    with pool.connection() as conn:
        versao = versao_dados(conn)
        # O grafo fica em memória pro /recomendar calcular o PageRank na hora (~15s pra carregar)
        grafo = carregar_grafo(conn)
        meta = pd.DataFrame(
            conn.execute("SELECT oracle_id::text, categoria, legal_commander, pode_ser_commander, preco_usd::float FROM cartas").fetchall()
        ).set_index("oracle_id").astype({"preco_usd": float})  # sem preço vira NaN
    # Troca tudo de uma vez: quem estava usando os dados antigos termina com eles
    app.state.grafo, app.state.meta_cartas, app.state.versao = grafo, meta, versao
    print(f"Grafo carregado: {grafo.num_cartas} cartas ({time.monotonic() - t:.0f}s)", flush = True)


def vigiar_dados(app: FastAPI, parar: threading.Event):
    """Recarrega o grafo quando o pipeline atualiza o banco (ex: pipeline.atualizar de madrugada)."""
    while not parar.wait(INTERVALO_RECARGA):
        try:
            with pool.connection() as conn:
                mudou = versao_dados(conn) != app.state.versao
            if mudou:
                print("Dados novos no banco, recarregando o grafo...", flush = True)
                carregar_dados(app)
        except Exception as erro:  # banco fora do ar, etc: tenta de novo na próxima
            print(f"Erro ao checar dados novos: {erro}", flush = True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    carregar_dados(app)
    parar = threading.Event()
    threading.Thread(target = vigiar_dados, args = (app, parar), daemon = True).start()
    yield
    parar.set()
    pool.close()


app = FastAPI(title = "mtg-deckbuilder", lifespan = lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins = os.environ.get("CORS_ORIGENS", "http://localhost:5173,http://localhost:3000").split(","),
    allow_credentials = True,  # o cookie do login, quando o site está em outro endereço
    allow_methods = ["*"],
    allow_headers = ["*"],
)

app.include_router(cartas.router)
app.include_router(commanders.router)
app.include_router(recomendar.router)
app.include_router(cotacao.router)
app.include_router(bracket.router)
app.include_router(tokens.router)
app.include_router(salas.router)
app.include_router(contas.router)
app.include_router(meus_decks.router)


@app.get("/saude", tags = ["sistema"])
def saude():
    return {"status": "ok", "cartas_no_grafo": app.state.grafo.num_cartas}
