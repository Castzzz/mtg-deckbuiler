"""API do mtg-deckbuilder.

Uso: uvicorn api.main:app --reload
Documentação interativa em http://localhost:8000/docs
"""
import os
import time
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.banco import pool
from api.rotas import bracket, cartas, commanders, cotacao, recomendar
from recomendador.grafo import carregar_grafo


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    t = time.monotonic()
    with pool.connection() as conn:
        # O grafo fica em memória pro /recomendar calcular o PageRank na hora (~15s pra carregar)
        app.state.grafo = carregar_grafo(conn)
        app.state.meta_cartas = pd.DataFrame(
            conn.execute("SELECT oracle_id::text, categoria, legal_commander, pode_ser_commander, preco_usd::float FROM cartas").fetchall()
        ).set_index("oracle_id").astype({"preco_usd": float})  # sem preço vira NaN
    print(f"Grafo carregado: {app.state.grafo.num_cartas} cartas ({time.monotonic() - t:.0f}s)")
    yield
    pool.close()


app = FastAPI(title = "mtg-deckbuilder", lifespan = lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins = os.environ.get("CORS_ORIGENS", "http://localhost:5173,http://localhost:3000").split(","),
    allow_methods = ["*"],
    allow_headers = ["*"],
)

app.include_router(cartas.router)
app.include_router(commanders.router)
app.include_router(recomendar.router)
app.include_router(cotacao.router)
app.include_router(bracket.router)


@app.get("/saude", tags = ["sistema"])
def saude():
    return {"status": "ok", "cartas_no_grafo": app.state.grafo.num_cartas}
