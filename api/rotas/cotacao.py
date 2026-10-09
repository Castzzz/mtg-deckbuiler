import time

import requests
from fastapi import APIRouter, HTTPException

from api.modelos import Cotacao

router = APIRouter(tags = ["preços"])

URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL"
VALIDADE = 3600  # segundos: a cotação é buscada no máximo uma vez por hora

_cache: dict = {"cotacao": None, "buscada_em": 0.0}


@router.get("/cotacao", response_model = Cotacao)
def cotacao():
    """Quanto vale 1 dólar e 1 euro em reais (AwesomeAPI), pra converter os preços do Scryfall."""
    if time.monotonic() - _cache["buscada_em"] > VALIDADE:
        try:
            r = requests.get(URL, timeout = 10)
            r.raise_for_status()
            dados = r.json()
            _cache["cotacao"] = Cotacao(
                usd_brl = float(dados["USDBRL"]["bid"]),
                eur_brl = float(dados["EURBRL"]["bid"]),
                atualizada_em = dados["USDBRL"]["create_date"],
            )
            _cache["buscada_em"] = time.monotonic()
        except (requests.RequestException, KeyError, ValueError):
            # Sem internet ou API fora do ar: segue com a última cotação que deu certo, se tiver
            if _cache["cotacao"] is None:
                raise HTTPException(503, "Não consegui buscar a cotação do dólar")
    return _cache["cotacao"]
