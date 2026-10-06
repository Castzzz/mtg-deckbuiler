"""Coleta decks de Commander direto da API do Archidekt e grava no banco.

Pra cada commander (os mais populares primeiro), busca os decks dele na API, pula os que já
estão no banco e não mudaram, e baixa o resto. Pode ser interrompido (Ctrl+C) e rodado de novo:
continua de onde parou.

Uso:
    python -m pipeline.coletar_archidekt                         # todos os commanders
    python -m pipeline.coletar_archidekt --limite 50             # só os 50 mais populares
    python -m pipeline.coletar_archidekt --commander "Edgar Markov"
"""
import argparse
import os
import time
from datetime import datetime

import psycopg
import requests

URL_BUSCA = "https://archidekt.com/api/decks/v3/"
URL_DECK = "https://archidekt.com/api/decks/{}/"
HEADERS = {"User-Agent": "mtg-deckbuilder/0.1 (projeto pessoal)", "Accept": "application/json"}
FONTE = "archidekt"
FORMATO_COMMANDER = 3


class ClienteArchidekt:
    """Faz as requisições respeitando uma pausa mínima entre elas, com retry em erro temporário."""

    def __init__(self, pausa: float):
        self.pausa = pausa
        self.sessao = requests.Session()
        self.sessao.headers.update(HEADERS)
        self.ultima_requisicao = 0.0

    def get(self, url: str, params: dict | None = None, tentativas: int = 5) -> dict | None:
        for tentativa in range(tentativas):
            espera = self.ultima_requisicao + self.pausa - time.monotonic()
            if espera > 0:
                time.sleep(espera)
            self.ultima_requisicao = time.monotonic()

            try:
                r = self.sessao.get(url, params = params, timeout = 30)
            except requests.RequestException as erro:
                print(f"  erro de conexão ({erro.__class__.__name__}), tentando de novo...")
                time.sleep(2 ** (tentativa + 1))
                continue

            if r.status_code == 404:
                return None  # deck apagado ou privado
            if r.status_code == 429 or r.status_code >= 500:
                espera = float(r.headers.get("Retry-After", 2 ** (tentativa + 2)))
                print(f"  HTTP {r.status_code}, esperando {espera:.0f}s...")
                time.sleep(espera)
                continue
            r.raise_for_status()
            return r.json()
        raise RuntimeError(f"Desisti depois de {tentativas} tentativas: {url}")

    def buscar_decks(self, nome_commander: str):
        """Lista (id, updatedAt) dos decks de um commander. A API limita a ~1000 resultados."""
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


def commanders_para_coletar(conn, commander: str | None, limite: int | None, dias: int):
    if commander:
        return conn.execute(
            "SELECT oracle_id::text, nome FROM cartas WHERE lower(nome) = lower(%s)", (commander,)
        ).fetchall()

    # Mais populares primeiro (pelos decks que já temos), pulando os coletados há menos de `dias` dias
    return conn.execute("""
        SELECT c.oracle_id::text, c.nome
        FROM cartas c
        LEFT JOIN coleta_commanders cc USING (oracle_id)
        LEFT JOIN (
            SELECT oracle_id, count(*) AS n FROM deck_cartas WHERE eh_commander GROUP BY oracle_id
        ) pop USING (oracle_id)
        WHERE c.pode_ser_commander AND c.legal_commander
          AND (cc.coletado_em IS NULL OR cc.coletado_em < now() - make_interval(days => %s))
        ORDER BY coalesce(pop.n, 0) DESC, c.nome
        LIMIT %s
    """, (dias, limite)).fetchall()


def coletar_commander(conn, cliente: ClienteArchidekt, oracle_id: str, nome: str,
                      cartas_conhecidas: set[str], tamanho_minimo: int) -> dict:
    stats = {"encontrados": 0, "novos": 0, "pulados": 0, "invalidos": 0}

    # Cartas de duas faces: a busca do Archidekt usa o nome da frente
    resultados = [d for d in cliente.buscar_decks(nome.split(" // ")[0]) if d["size"] >= tamanho_minimo]
    stats["encontrados"] = len(resultados)

    # Decks que já estão no banco com a mesma data de atualização não precisam ser baixados de novo
    ja_temos = dict(conn.execute(
        "SELECT id_externo, atualizado_em FROM decks WHERE fonte = %s AND id_externo = ANY(%s)",
        (FONTE, [str(d["id"]) for d in resultados]),
    ).fetchall())

    for resumo in resultados:
        atualizado = ja_temos.get(str(resumo["id"]))
        if atualizado and atualizado >= datetime.fromisoformat(resumo["updatedAt"]):
            stats["pulados"] += 1
            continue

        deck = cliente.get(URL_DECK.format(resumo["id"]))
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
    parser.add_argument("--pausa", type = float, default = 1.0, help = "segundos entre requisições (padrão: 1.0)")
    parser.add_argument("--tamanho-minimo", type = int, default = 10,
                        help = "ignora decks com menos cartas que isso, ex: decks recém-criados vazios (padrão: 10)")
    args = parser.parse_args()

    dsn = os.environ.get("DATABASE_URL", "postgresql://mtg:mtg@localhost:5432/mtg")
    cliente = ClienteArchidekt(args.pausa)

    # autocommit: cada deck é gravado na sua própria transação, então um Ctrl+C não perde o que já foi feito
    with psycopg.connect(dsn, autocommit = True) as conn:
        cartas_conhecidas = {r[0] for r in conn.execute("SELECT oracle_id::text FROM cartas")}
        commanders = commanders_para_coletar(conn, args.commander, args.limite, args.dias)
        print(f"{len(commanders)} commanders pra coletar")

        try:
            for i, (oracle_id, nome) in enumerate(commanders, 1):
                inicio = time.monotonic()
                s = coletar_commander(conn, cliente, oracle_id, nome, cartas_conhecidas, args.tamanho_minimo)
                print(f"[{i}/{len(commanders)}] {nome}: {s['encontrados']} encontrados, {s['novos']} gravados, "
                      f"{s['pulados']} sem mudança, {s['invalidos']} inválidos ({time.monotonic() - inicio:.0f}s)")
        except KeyboardInterrupt:
            print("\nInterrompido. Rode de novo pra continuar de onde parou.")


if __name__ == "__main__":
    main()
