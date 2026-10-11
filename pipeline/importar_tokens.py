"""Lê o bulk data "default_cards" do Scryfall e grava os tokens (e emblemas) na tabela `tokens`,
e quais cartas criam cada um em `carta_tokens`.

A ligação vem do "all_parts" do Scryfall, que nem sempre está em todas as edições: por isso junta
todas as edições das cartas e dos tokens (a carta aponta pro token, e o token aponta de volta pra carta).

Uso: python -m pipeline.importar_tokens
"""
import gzip
import json
import os
from pathlib import Path

import psycopg

from pipeline.importar_scryfall import baixar_bulk, face_principal

LAYOUTS_TOKEN = {"token", "double_faced_token", "emblem"}


def oracle_da(carta: dict) -> str | None:
    # Cartas reversíveis e tokens de duas faces podem guardar o oracle_id em cada face
    return carta.get("oracle_id") or face_principal(carta).get("oracle_id")


def ler(caminho: Path) -> tuple[dict[str, dict], set[tuple[str, str]]]:
    """Devolve {oracle_id do token: edição mais nova com imagem} e os pares (carta, token) por oracle_id."""
    edicao_para_oracle: dict[str, str] = {}
    tokens: dict[str, dict] = {}
    partes: list[tuple[str, list[str]]] = []  # (oracle_id de quem cita, ids de edição citados)

    with gzip.open(caminho, "rt", encoding = "utf-8") as f:
        for texto in f:
            if not texto.strip():
                continue
            carta = json.loads(texto)
            oracle_id = oracle_da(carta)
            if not oracle_id:
                continue
            edicao_para_oracle[carta["id"]] = oracle_id
            if carta.get("all_parts"):
                partes.append((oracle_id, [p["id"] for p in carta["all_parts"]]))

            tipo = carta.get("type_line") or face_principal(carta).get("type_line") or ""
            # O layout "token" também tem checklists e cartas de ajuda: só fica o que é token ou emblema de verdade
            if carta.get("layout") in LAYOUTS_TOKEN and "paper" in carta.get("games", []) and ("Token" in tipo or "Emblem" in tipo):
                face = face_principal(carta)
                imagem = (carta.get("image_uris") or face.get("image_uris") or {}).get("normal")
                atual = tokens.get(oracle_id)
                # Fica a edição mais nova que tem imagem
                if imagem and (atual is None or (carta.get("released_at") or "") > atual["lancamento"]):
                    tokens[oracle_id] = {
                        "oracle_id": oracle_id,
                        "nome": carta["name"],
                        "tipo": tipo,
                        "texto": face.get("oracle_text"),
                        "poder": face.get("power"),
                        "resistencia": face.get("toughness"),
                        "cores": carta.get("colors") or face.get("colors") or [],
                        "imagem_url": imagem,
                        "lancamento": carta.get("released_at") or "",
                    }

    # Um lado precisa ser token e o outro não: carta -> token ou token -> carta
    pares = set()
    for quem, ids in partes:
        for id_citado in ids:
            citado = edicao_para_oracle.get(id_citado)
            if not citado or citado == quem:
                continue
            if citado in tokens and quem not in tokens:
                pares.add((quem, citado))
            elif quem in tokens and citado not in tokens:
                pares.add((citado, quem))
    return tokens, pares


def importar(caminho: Path, dsn: str):
    tokens, pares = ler(caminho)
    print(f"{len(tokens)} tokens e emblemas, {len(pares)} ligações carta -> token no arquivo")

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        # Recria tudo numa transação (quem estiver lendo vê a versão antiga até o commit)
        cur.execute("DELETE FROM carta_tokens")
        cur.execute("DELETE FROM tokens")
        colunas = "oracle_id, nome, tipo, texto, poder, resistencia, cores, imagem_url"
        with cur.copy(f"COPY tokens ({colunas}) FROM STDIN") as copy:
            for t in tokens.values():
                copy.write_row((t["oracle_id"], t["nome"], t["tipo"], t["texto"], t["poder"], t["resistencia"], t["cores"], t["imagem_url"]))

        cur.execute("CREATE TEMP TABLE pares_tmp (oracle_id uuid, token_id uuid) ON COMMIT DROP")
        with cur.copy("COPY pares_tmp FROM STDIN") as copy:
            for par in pares:
                copy.write_row(par)
        # Só as cartas que estão em `cartas` (as jogáveis)
        cur.execute("""
            INSERT INTO carta_tokens (oracle_id, token_id)
            SELECT p.oracle_id, p.token_id FROM pares_tmp p JOIN cartas c USING (oracle_id)
        """)
        print(f"{cur.rowcount} ligações gravadas")


def main():
    dsn = os.environ.get("DATABASE_URL", "postgresql://mtg:mtg@localhost:5432/mtg")
    importar(baixar_bulk("default_cards"), dsn)


if __name__ == "__main__":
    main()
