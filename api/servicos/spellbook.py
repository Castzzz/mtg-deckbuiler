"""Serviço de consulta e integração com o Commander Spellbook."""
import hashlib
import json
from collections import OrderedDict

import requests

URL_SPELLBOOK_COMBOS = "https://backend.commanderspellbook.com/find-my-combos"
USER_AGENT = "mtg-deckbuilder/0.1 (projeto pessoal)"
TIMEOUT = 20
TAMANHO_CACHE = 200


class ServicoSpellbook:
    def __init__(
        self,
        url: str = URL_SPELLBOOK_COMBOS,
        timeout: int = TIMEOUT,
        max_cache: int = TAMANHO_CACHE,
    ):
        self.url = url
        self.timeout = timeout
        self.max_cache = max_cache
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        })
        self._cache: OrderedDict[str, dict] = OrderedDict()

    def _calcular_chave(
        self,
        commanders_nomes: list[str],
        cartas_nomes_qtd: list[tuple[str, int]],
    ) -> str:
        dados_chave = [
            sorted(commanders_nomes),
            sorted((nome, int(qtd)) for nome, qtd in cartas_nomes_qtd),
        ]
        return hashlib.sha1(json.dumps(dados_chave).encode()).hexdigest()

    def consultar_combos(
        self,
        commanders_nomes: list[str],
        cartas_nomes_qtd: list[tuple[str, int]],
    ) -> dict | None:
        chave = self._calcular_chave(commanders_nomes, cartas_nomes_qtd)
        if chave in self._cache:
            self._cache.move_to_end(chave)
            return self._cache[chave]

        corpo = {
            "commanders": [{"card": nome} for nome in commanders_nomes],
            "main": [{"card": nome, "quantity": qtd} for nome, qtd in cartas_nomes_qtd],
        }

        try:
            resp = self.session.post(
                self.url,
                json = corpo,
                timeout = self.timeout,
            )
            resp.raise_for_status()
            resultado = resp.json()
        except (requests.RequestException, json.JSONDecodeError, ValueError):
            return None

        if isinstance(resultado, dict):
            self._cache[chave] = resultado
            if len(self._cache) > self.max_cache:
                self._cache.popitem(last = False)
            return resultado

        return None

    def limpar_cache(self) -> None:
        self._cache.clear()


servico_spellbook = ServicoSpellbook()


def consultar_combos(
    commanders_nomes: list[str],
    cartas_nomes_qtd: list[tuple[str, int]],
) -> dict | None:
    return servico_spellbook.consultar_combos(commanders_nomes, cartas_nomes_qtd)
