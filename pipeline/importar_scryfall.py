"""Baixa o bulk data "oracle_cards" do Scryfall e faz upsert na tabela `cartas`.

Uso: python -m pipeline.importar_scryfall
"""
import gzip
import json
import os
import re
import time
from pathlib import Path

import psycopg
import requests

URL_BULK = "https://api.scryfall.com/bulk-data/oracle_cards"
URL_BUSCA = "https://api.scryfall.com/cards/search"
# O Scryfall pede User-Agent e Accept em todas as requisições
HEADERS = {"User-Agent": "mtg-deckbuilder/0.1", "Accept": "application/json"}
PASTA_DADOS = Path("dados")

# Layouts que não são cartas jogáveis num deck
LAYOUTS_IGNORADOS = {
    "token", "double_faced_token", "emblem", "art_series",
    "vanguard", "scheme", "planar", "reversible_card",
}


def baixar_bulk() -> Path:
    meta = requests.get(URL_BULK, headers = HEADERS, timeout = 30)
    meta.raise_for_status()
    meta = meta.json()

    PASTA_DADOS.mkdir(exist_ok = True)
    url = meta["jsonl_download_uri"]
    caminho = PASTA_DADOS / Path(url).name  # nome já vem com a data, ex: oracle-cards-20261006090155.jsonl.gz
    if caminho.exists():
        print(f"Já baixado: {caminho}")
        return caminho

    print(f"Baixando {url} ({meta['compressed_size'] / 1e6:.0f} MB)...")
    with requests.get(url, headers = HEADERS, stream = True, timeout = 60) as r:
        r.raise_for_status()
        with open(caminho, "wb") as f:
            for bloco in r.iter_content(chunk_size = 1 << 20):
                f.write(bloco)
    return caminho


def face_principal(carta: dict) -> dict:
    # Cartas de duas faces (MDFC, transform, ...) guardam texto/imagem em card_faces
    return carta["card_faces"][0] if carta.get("card_faces") else carta


def buscar_commanders() -> set[str]:
    # A busca "is:commander" do Scryfall já trata os casos especiais (Grist, backgrounds, ...),
    # então é mais confiável que tentar deduzir pelo tipo/texto da carta.
    oracle_ids = set()
    url, params = URL_BUSCA, {"q": "is:commander", "unique": "cards"}
    while url:
        pagina = get_com_retry(url, params)
        oracle_ids.update(c["oracle_id"] for c in pagina["data"] if "oracle_id" in c)
        url, params = pagina.get("next_page"), None  # next_page já vem com os parâmetros
        time.sleep(0.5)  # respeita o rate limit da API
    return oracle_ids


def parceria(tipo: str, texto: str | None) -> str | None:
    """Que tipo de dupla de commanders a carta forma (quem combina com quem: GET /commanders/{id}/parceiros).

    - "partner": Partner comum, faz dupla com qualquer outro Partner comum
    - "partner:Friends forever": Partner—Friends forever (e outros Partner—X), só com o mesmo X
    - "partner_with:Sam, Loyal Attendant": Partner with, só com a carta citada
    - "escolhe_background" / "background": Choose a Background + um Background
    - "companheiro" / "doctor": Doctor's companion + um Time Lord Doctor
    """
    if re.search(r"Legendary Enchantment — Background$", tipo):
        return "background"
    if re.search(r"Legendary Creature — Time Lord Doctor$", tipo):
        return "doctor"
    for linha in (texto or "").split("\n"):
        linha = re.sub(r" \(.*", "", linha).strip()  # tira o texto de lembrete
        if linha == "Partner":
            return "partner"
        if m := re.fullmatch(r"Partner—(.+)", linha):
            return f"partner:{m[1]}"
        if m := re.fullmatch(r"Partner with (.+)", linha):
            return f"partner_with:{m[1]}"
        if linha == "Choose a Background":
            return "escolhe_background"
        if linha == "Doctor's companion":
            return "companheiro"
    return None


def get_com_retry(url: str, params: dict | None, tentativas: int = 5) -> dict:
    for tentativa in range(tentativas):
        r = requests.get(url, headers = HEADERS, params = params, timeout = 30)
        if r.status_code != 429:
            r.raise_for_status()
            return r.json()
        # 429 = muitas requisições: espera o que a API pedir (ou cada vez mais) e tenta de novo
        espera = float(r.headers.get("Retry-After", 2 ** (tentativa + 1)))
        print(f"Rate limit do Scryfall, esperando {espera:.0f}s...")
        time.sleep(espera)
    r.raise_for_status()


def para_linha(carta: dict, commanders: set[str]) -> tuple:
    frente = face_principal(carta)
    imagens = carta.get("image_uris") or frente.get("image_uris") or {}
    texto = carta.get("oracle_text")
    if texto is None and carta.get("card_faces"):
        texto = "\n//\n".join(f.get("oracle_text", "") for f in carta["card_faces"])

    return (
        carta["oracle_id"],
        carta["name"],
        carta.get("mana_cost", frente.get("mana_cost")),
        carta.get("cmc", 0),
        carta["type_line"],
        texto,
        carta.get("colors", frente.get("colors", [])),
        carta["color_identity"],
        carta["legalities"].get("commander") == "legal",
        carta["oracle_id"] in commanders,
        parceria(carta["type_line"], texto),
        imagens.get("normal"),
        carta.get("scryfall_uri"),
        json.dumps(carta),
    )


def ler_cartas(caminho: Path) -> list[dict]:
    # JSON Lines comprimido: uma carta por linha
    with gzip.open(caminho, "rt", encoding = "utf-8") as f:
        return [json.loads(linha) for linha in f if linha.strip()]


def importar(caminho: Path, dsn: str):
    cartas = ler_cartas(caminho)
    commanders = buscar_commanders()
    print(f"{len(commanders)} cartas podem ser commander")

    linhas = [
        para_linha(c, commanders) for c in cartas
        if "oracle_id" in c and c.get("layout") not in LAYOUTS_IGNORADOS
    ]
    print(f"{len(linhas)} cartas pra importar (de {len(cartas)} no arquivo)")

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        # COPY numa tabela temporária e depois um único upsert: bem mais rápido que um INSERT por carta
        cur.execute("CREATE TEMP TABLE cartas_tmp (LIKE cartas INCLUDING DEFAULTS) ON COMMIT DROP")
        colunas = ("oracle_id, nome, custo_mana, cmc, tipo, texto, cores, identidade_cor, "
                   "legal_commander, pode_ser_commander, parceria, imagem_url, scryfall_uri, dados")
        with cur.copy(f"COPY cartas_tmp ({colunas}) FROM STDIN") as copy:
            for linha in linhas:
                copy.write_row(linha)

        cur.execute(f"""
            INSERT INTO cartas ({colunas})
            SELECT {colunas} FROM cartas_tmp
            ON CONFLICT (oracle_id) DO UPDATE SET
                nome = EXCLUDED.nome,
                custo_mana = EXCLUDED.custo_mana,
                cmc = EXCLUDED.cmc,
                tipo = EXCLUDED.tipo,
                texto = EXCLUDED.texto,
                cores = EXCLUDED.cores,
                identidade_cor = EXCLUDED.identidade_cor,
                legal_commander = EXCLUDED.legal_commander,
                pode_ser_commander = EXCLUDED.pode_ser_commander,
                parceria = EXCLUDED.parceria,
                imagem_url = EXCLUDED.imagem_url,
                scryfall_uri = EXCLUDED.scryfall_uri,
                dados = EXCLUDED.dados,
                atualizado_em = now()
        """)
        print(f"{cur.rowcount} cartas inseridas/atualizadas")


def main():
    dsn = os.environ.get("DATABASE_URL", "postgresql://mtg:mtg@localhost:5432/mtg")
    importar(baixar_bulk(), dsn)


if __name__ == "__main__":
    main()
