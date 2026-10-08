"""Coleta decks de Commander direto da API do Archidekt e grava no banco.

Pra cada commander (os mais novos primeiro, ou os mais populares), busca os decks mais recentes
dele na API, pula os que já estão no banco e não mudaram, e baixa o resto em paralelo. Pode ser
interrompido (Ctrl+C) e rodado de novo: continua de onde parou.

Uso:
    python -m pipeline.coletar_archidekt                         # todos os commanders, os mais novos primeiro
    python -m pipeline.coletar_archidekt --ordem populares --limite 50
    python -m pipeline.coletar_archidekt --commander "Edgar Markov"
    python -m pipeline.coletar_archidekt --max-decks 150            # menos decks por commander, termina antes
"""
import argparse
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from itertools import islice

import psycopg
import requests

URL_BUSCA = "https://archidekt.com/api/decks/v3/"
URL_DECK = "https://archidekt.com/api/decks/{}/"
HEADERS = {"User-Agent": "mtg-deckbuilder/0.1 (projeto pessoal)", "Accept": "application/json"}
FONTE = "archidekt"
FORMATO_COMMANDER = 3


PAUSA_MAXIMA = 10.0         # teto da pausa quando o Archidekt pede pra ir mais devagar
# Medido em 10/2026: 60 requisições/min passam sem erro, ~80/min já leva 429 de vez em quando.
# Passou do limite, a API responde 429 por cerca de um minuto (sem Retry-After)
ESPERA_429 = 60.0


class ClienteArchidekt:
    """Requisições de várias threads com um ritmo global: no máximo uma a cada `pausa` segundos.

    A API não documenta o limite, então o ritmo se ajusta sozinho: num 429 todas as threads esperam
    ESPERA_429 segundos e voltam 25% mais devagar; a cada resposta normal a pausa diminui um pouquinho,
    até a pausa mínima pedida. Fica oscilando perto do limite real.
    """

    def __init__(self, pausa: float):
        self.pausa_minima = pausa
        self.pausa = pausa
        self.proxima = 0.0                # quando a próxima requisição pode sair (time.monotonic)
        self.ultima_desacelerada = 0.0
        self.trava = threading.Lock()
        self.local = threading.local()    # uma requests.Session por thread

    def sessao(self) -> requests.Session:
        if not hasattr(self.local, "sessao"):
            self.local.sessao = requests.Session()
            self.local.sessao.headers.update(HEADERS)
        return self.local.sessao

    def esperar_vez(self):
        with self.trava:
            agora = time.monotonic()
            vez = max(agora, self.proxima)
            self.proxima = vez + self.pausa
        time.sleep(vez - agora)

    def desacelerar(self):
        with self.trava:
            # Várias threads recebem 429 juntas: conta como uma desacelerada só
            if time.monotonic() - self.ultima_desacelerada < ESPERA_429:
                return
            self.ultima_desacelerada = time.monotonic()
            self.pausa = min(self.pausa * 1.25, PAUSA_MAXIMA)
            self.proxima = time.monotonic() + ESPERA_429  # ninguém faz requisição até a janela passar
            print(f"  HTTP 429: esperando {ESPERA_429:.0f}s e voltando com {60 / self.pausa:.0f} requisições/min")

    def acelerar(self):
        with self.trava:
            self.pausa = max(self.pausa_minima, self.pausa * 0.998)

    def get(self, url: str, params: dict | None = None, tentativas: int = 8) -> dict | None:
        """JSON da resposta, ou None se não existe (404) ou se continuou dando erro depois das tentativas."""
        erro = "?"
        for tentativa in range(tentativas):
            self.esperar_vez()
            try:
                r = self.sessao().get(url, params = params, timeout = 30)
            except requests.RequestException as excecao:
                erro = excecao.__class__.__name__
                print(f"  erro de conexão ({erro}), tentando de novo...")
                time.sleep(2 ** (tentativa + 1))
                continue

            if r.status_code == 404:
                return None  # deck apagado ou privado
            erro = f"HTTP {r.status_code}"
            if r.status_code == 429:
                self.desacelerar()  # a espera acontece no esperar_vez da próxima tentativa
                continue
            if r.status_code >= 500:
                # Erro do servidor costuma ser só daquele deck: tenta de novo sem frear as outras threads
                time.sleep(2 ** tentativa)
                continue
            r.raise_for_status()
            self.acelerar()
            return r.json()
        print(f"  desisti depois de {tentativas} tentativas ({erro}): {url}")
        return None

    def buscar_decks(self, nome_commander: str):
        """Resumo dos decks de um commander, dos atualizados mais recentemente pros mais antigos.

        Vai buscando as páginas (60 decks cada) conforme são consumidas. A API limita a ~1000 resultados.
        """
        url, params = URL_BUSCA, {"deckFormat": FORMATO_COMMANDER, "commanderName": nome_commander}
        while url:
            pagina = self.get(url, params)
            if pagina is None:
                return
            for deck in pagina["results"]:
                yield deck
            url, params = pagina.get("next"), None  # `next` já vem com os parâmetros
            if url:
                url = url.replace("http://", "https://", 1)


def parse_deck(deck: dict, cartas_conhecidas: set[str]):
    """Converte o JSON do Archidekt em {oracle_id: [quantidade, eh_commander]}.

    Devolve None se não for um deck de Commander válido (sem commander ou com mais de 2).
    """
    incluida = {c["name"]: c["includedInDeck"] for c in deck["categories"]}
    premier = {c["name"] for c in deck["categories"] if c["isPremier"]}

    cartas = {}
    for item in deck["cards"]:
        if item.get("deletedAt"):
            continue
        categorias = item["categories"] or []
        # Carta em mais de uma categoria (ex: "Maybeboard" + "Tokens"): só conta se todas estão no deck
        if not all(incluida.get(c, True) for c in categorias):
            continue
        oracle_id = item["card"]["oracleCard"]["uid"]
        if oracle_id not in cartas_conhecidas:
            continue  # token, carta custom ou carta nova que ainda não está na tabela `cartas`
        quantidade, eh_commander = cartas.get(oracle_id, [0, False])
        cartas[oracle_id] = [quantidade + item["quantity"], eh_commander or any(c in premier for c in categorias)]

    n_commanders = sum(eh for _, eh in cartas.values())
    if not 1 <= n_commanders <= 2:
        return None
    return cartas


def gravar_deck(cur, deck: dict, cartas: dict):
    cur.execute("""
        INSERT INTO decks (fonte, id_externo, nome, atualizado_em)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (fonte, id_externo) DO UPDATE SET
            nome = EXCLUDED.nome, atualizado_em = EXCLUDED.atualizado_em, coletado_em = now()
        RETURNING id
    """, (FONTE, str(deck["id"]), deck["name"], deck["updatedAt"]))
    deck_id = cur.fetchone()[0]

    cur.execute("DELETE FROM deck_cartas WHERE deck_id = %s", (deck_id,))
    cur.executemany(
        "INSERT INTO deck_cartas (deck_id, oracle_id, quantidade, eh_commander) VALUES (%s, %s, %s, %s)",
        [(deck_id, oracle_id, qtd, eh) for oracle_id, (qtd, eh) in cartas.items()],
    )


ORDENS = {
    # Lançados mais recentemente primeiro: são os que o dataset antigo não cobre
    "novos": "(c.dados->>'released_at')::date DESC NULLS LAST, c.nome",
    # Mais decks no banco primeiro
    "populares": "coalesce(pop.n, 0) DESC, c.nome",
}


def commanders_para_coletar(conn, commander: str | None, limite: int | None, dias: int, ordem: str):
    if commander:
        return conn.execute(
            "SELECT oracle_id::text, nome FROM cartas WHERE lower(nome) = lower(%s)", (commander,)
        ).fetchall()

    # Pula os coletados há menos de `dias` dias
    return conn.execute(f"""
        SELECT c.oracle_id::text, c.nome
        FROM cartas c
        LEFT JOIN coleta_commanders cc USING (oracle_id)
        LEFT JOIN (
            SELECT oracle_id, count(*) AS n FROM deck_cartas WHERE eh_commander GROUP BY oracle_id
        ) pop USING (oracle_id)
        WHERE c.pode_ser_commander AND c.legal_commander
          AND (cc.coletado_em IS NULL OR cc.coletado_em < now() - make_interval(days => %s))
        ORDER BY {ORDENS[ordem]}
        LIMIT %s
    """, (dias, limite)).fetchall()


def coletar_commander(conn, cliente: ClienteArchidekt, baixador: ThreadPoolExecutor, oracle_id: str, nome: str,
                      cartas_conhecidas: set[str], tamanho_minimo: int, max_decks: int) -> dict:
    stats = {"encontrados": 0, "novos": 0, "pulados": 0, "invalidos": 0}

    # Cartas de duas faces: a busca do Archidekt usa o nome da frente.
    # Só os `max_decks` mais recentes: o islice para de buscar páginas quando chega lá.
    validos = (d for d in cliente.buscar_decks(nome.split(" // ")[0]) if d["size"] >= tamanho_minimo)
    resultados = list(islice(validos, max_decks))
    stats["encontrados"] = len(resultados)

    # Decks que já estão no banco com a mesma data de atualização não precisam ser baixados de novo
    ja_temos = dict(conn.execute(
        "SELECT id_externo, atualizado_em FROM decks WHERE fonte = %s AND id_externo = ANY(%s)",
        (FONTE, [str(d["id"]) for d in resultados]),
    ).fetchall())

    baixar = []
    for resumo in resultados:
        atualizado = ja_temos.get(str(resumo["id"]))
        if atualizado and atualizado >= datetime.fromisoformat(resumo["updatedAt"]):
            stats["pulados"] += 1
        else:
            baixar.append(resumo["id"])

    # Os downloads rodam em paralelo; a gravação no banco fica aqui, numa conexão só
    for deck in baixador.map(lambda id_deck: cliente.get(URL_DECK.format(id_deck)), baixar):
        cartas = parse_deck(deck, cartas_conhecidas) if deck else None
        if cartas is None:
            stats["invalidos"] += 1
            continue

        with conn.transaction(), conn.cursor() as cur:
            gravar_deck(cur, deck, cartas)
        stats["novos"] += 1

    conn.execute("""
        INSERT INTO coleta_commanders (oracle_id, decks_encontrados) VALUES (%s, %s)
        ON CONFLICT (oracle_id) DO UPDATE SET coletado_em = now(), decks_encontrados = EXCLUDED.decks_encontrados
    """, (oracle_id, stats["encontrados"]))
    return stats


def main():
    parser = argparse.ArgumentParser(description = __doc__, formatter_class = argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--commander", help = "coleta só esse commander (nome exato da carta)")
    parser.add_argument("--limite", type = int, help = "quantos commanders coletar nessa rodada")
    parser.add_argument("--dias", type = int, default = 7, help = "recoleta commanders coletados há mais de N dias (padrão: 7)")
    parser.add_argument("--ordem", choices = ORDENS, default = "novos",
                        help = "novos: commanders lançados mais recentemente primeiro (padrão); populares: mais decks no banco primeiro")
    parser.add_argument("--max-decks", type = int, default = 300,
                        help = "no máximo os N decks mais recentes de cada commander (padrão: 300)")
    parser.add_argument("--workers", type = int, default = 3, help = "downloads em paralelo (padrão: 3)")
    parser.add_argument("--pausa", type = float, default = 1.0,
                        help = "intervalo mínimo entre requisições, somando todas as threads (padrão: 1.0 = 60/min); "
                               "se o Archidekt reclamar (429), o coletor desacelera sozinho")
    parser.add_argument("--tamanho-minimo", type = int, default = 10,
                        help = "ignora decks com menos cartas que isso, ex: decks recém-criados vazios (padrão: 10)")
    args = parser.parse_args()

    dsn = os.environ.get("DATABASE_URL", "postgresql://mtg:mtg@localhost:5432/mtg")
    cliente = ClienteArchidekt(args.pausa)

    # autocommit: cada deck é gravado na sua própria transação, então um Ctrl+C não perde o que já foi feito
    with psycopg.connect(dsn, autocommit = True) as conn:
        cartas_conhecidas = {r[0] for r in conn.execute("SELECT oracle_id::text FROM cartas")}
        commanders = commanders_para_coletar(conn, args.commander, args.limite, args.dias, args.ordem)
        print(f"{len(commanders)} commanders pra coletar")

        baixador = ThreadPoolExecutor(args.workers)
        total, comeco = 0, time.monotonic()
        try:
            for i, (oracle_id, nome) in enumerate(commanders, 1):
                inicio = time.monotonic()
                s = coletar_commander(conn, cliente, baixador, oracle_id, nome, cartas_conhecidas,
                                      args.tamanho_minimo, args.max_decks)
                total += s["novos"]
                print(f"[{i}/{len(commanders)}] {nome}: {s['encontrados']} encontrados, {s['novos']} gravados, "
                      f"{s['pulados']} sem mudança, {s['invalidos']} inválidos ({time.monotonic() - inicio:.0f}s) "
                      f"| total {total} decks, {total / (time.monotonic() - comeco) * 3600:.0f}/h")
        except KeyboardInterrupt:
            print("\nInterrompido. Rode de novo pra continuar de onde parou.")
        finally:
            # Não espera os downloads pendentes: o que não foi gravado é baixado de novo na próxima rodada
            baixador.shutdown(wait = False, cancel_futures = True)


if __name__ == "__main__":
    main()
