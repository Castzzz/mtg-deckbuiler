"""Baixa o bulk data "default_cards" do Scryfall (todas as edições em papel de cada carta),
grava na tabela `impressoes` e atualiza o preço mais barato de cada carta em `cartas`.

Os preços do Scryfall mudam todo dia: rode de novo pra atualizar.

Uso: python -m pipeline.importar_impressoes
"""
import gzip
import json
import os
from decimal import Decimal
from pathlib import Path

import psycopg

from pipeline.importar_scryfall import LAYOUTS_IGNORADOS, baixar_bulk, face_principal


def menor_preco(precos: dict, *chaves: str) -> Decimal | None:
    # Normal, foil ou etched: o que for mais barato (muitas cartas só existem em foil)
    valores = [Decimal(precos[c]) for c in chaves if precos.get(c)]
    return min(valores) if valores else None


def para_linha(carta: dict) -> tuple | None:
    if "paper" not in carta.get("games", []) or carta.get("oversized") or carta.get("layout") in LAYOUTS_IGNORADOS:
        return None
    # Cartas reversíveis guardam o oracle_id em cada face
    oracle_id = carta.get("oracle_id") or face_principal(carta).get("oracle_id")
    if not oracle_id:
        return None

    imagens = carta.get("image_uris") or face_principal(carta).get("image_uris") or {}
    precos = carta.get("prices") or {}
    return (
        carta["id"],
        oracle_id,
        carta["set"],
        carta["set_name"],
        carta["collector_number"],
        carta.get("released_at"),
        imagens.get("normal"),
        menor_preco(precos, "usd", "usd_foil", "usd_etched"),
        menor_preco(precos, "eur", "eur_foil", "eur_etched"),
    )


def importar(caminho: Path, dsn: str):
    with gzip.open(caminho, "rt", encoding = "utf-8") as f:
        linhas = [l for l in (para_linha(json.loads(t)) for t in f if t.strip()) if l]
    print(f"{len(linhas)} edições em papel no arquivo")

    colunas = "scryfall_id, oracle_id, edicao, nome_edicao, numero, lancamento, imagem_url, preco_usd, preco_eur"
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(f"CREATE TEMP TABLE impressoes_tmp ({colunas.replace(',', ' text,')} text) ON COMMIT DROP")
        with cur.copy(f"COPY impressoes_tmp ({colunas}) FROM STDIN") as copy:
            for linha in linhas:
                copy.write_row(linha)

        # Recria a tabela inteira numa transação (quem estiver lendo vê a versão antiga até o commit).
        # Edições de cartas que não estão em `cartas` (tokens, cartas de arte, ...) ficam de fora.
        cur.execute("DELETE FROM impressoes")
        cur.execute(f"""
            INSERT INTO impressoes ({colunas})
            SELECT t.scryfall_id::uuid, t.oracle_id::uuid, t.edicao, t.nome_edicao, t.numero,
                   t.lancamento::date, t.imagem_url, t.preco_usd::numeric, t.preco_eur::numeric
            FROM impressoes_tmp t
            JOIN cartas c ON c.oracle_id = t.oracle_id::uuid
        """)
        print(f"{cur.rowcount} edições gravadas")

        cur.execute("""
            UPDATE cartas c SET preco_usd = p.usd, preco_eur = p.eur
            FROM (SELECT oracle_id, min(preco_usd) AS usd, min(preco_eur) AS eur FROM impressoes GROUP BY oracle_id) p
            WHERE c.oracle_id = p.oracle_id
        """)
        print(f"Preço atualizado em {cur.rowcount} cartas")


def main():
    dsn = os.environ.get("DATABASE_URL", "postgresql://mtg:mtg@localhost:5432/mtg")
    importar(baixar_bulk("default_cards"), dsn)


if __name__ == "__main__":
    main()
