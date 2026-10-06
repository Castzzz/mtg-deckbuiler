"""Importa o dataset de decks do Archidekt (CSV) para as tabelas `decks` e `deck_cartas`.

Precisa que a tabela `cartas` já esteja populada (pipeline.importar_scryfall).

Uso: python -m pipeline.importar_archidekt [caminho_do_csv]
"""
import io
import os
import sys
from pathlib import Path

import gdown
import pandas as pd
import psycopg

ID_DRIVE = "1GY32ruMmWoeRIA63uWiNEKCyicQ2QyVx"
CAMINHO_PADRAO = Path("dados/archidekt/dataset_archidekt.csv")
FONTE = "archidekt"
TAMANHO_LOTE_COPY = 1_000_000


def baixar_csv(caminho: Path) -> Path:
    # O csv tem ~600MB, então só baixa do google drive se ainda não existir localmente
    if not caminho.exists():
        caminho.parent.mkdir(parents = True, exist_ok = True)
        gdown.download(id = ID_DRIVE, output = str(caminho))
    return caminho


def carregar_nomes(conn) -> dict[str, str]:
    """Monta o dicionário nome -> oracle_id usado pra casar os nomes do CSV com o Scryfall."""
    # Alguns nomes se repetem (Un-sets, Attractions...): o ORDER BY faz a versão legal em Commander vencer
    linhas = conn.execute("SELECT nome, oracle_id::text FROM cartas ORDER BY legal_commander").fetchall()

    nomes = {}
    for nome, oracle_id in linhas:
        nomes[nome] = oracle_id
        nomes.setdefault(nome.lower(), oracle_id)
        # Cartas de duas faces: aceita também só o nome da frente ("Esika, God of the Tree")
        if " // " in nome:
            nomes.setdefault(nome.split(" // ")[0], oracle_id)
    return nomes


def resolver_nome(nome: str, nomes: dict[str, str]) -> str | None:
    if nome in nomes:
        return nomes[nome]
    if nome.lower() in nomes:
        return nomes[nome.lower()]
    # Cartas rebalanceadas do Arena ("A-Blood Artist") viram a carta original
    if nome.startswith("A-"):
        return resolver_nome(nome[2:], nomes)
    return None


def resolver_commander(nome: str, nomes: dict[str, str]) -> list[str] | None:
    # O CSV junta tudo com " // ": pode ser uma carta de duas faces ("Esika... // The Prismatic Bridge"),
    # uma dupla de partners ("Frodo... // Sam...") ou as duas coisas misturadas.
    # Vai lendo as partes e, quando duas seguidas formam uma carta de duas faces, junta elas.
    partes = nome.split(" // ")
    oracle_ids = []
    i = 0
    while i < len(partes):
        juntas = " // ".join(partes[i:i + 2])
        if i + 1 < len(partes) and resolver_nome(juntas, nomes):
            oracle_ids.append(resolver_nome(juntas, nomes))
            i += 2
        elif resolver_nome(partes[i], nomes):
            oracle_ids.append(resolver_nome(partes[i], nomes))
            i += 1
        else:
            return None
    # Tira repetidos ("Sliver Overlord // Sliver Overlord") mantendo a ordem.
    # Mais de 2 "commanders" é alguém usando a categoria Commander do Archidekt pra outra coisa.
    oracle_ids = list(dict.fromkeys(oracle_ids))
    return oracle_ids if len(oracle_ids) <= 2 else None


def montar_deck_cartas(df: pd.DataFrame, nomes: dict[str, str]):
    """Devolve (deck_cartas, nomes_nao_encontrados, commanders_nao_encontrados)."""
    # Resolve cada nome único uma vez só, em vez de uma vez por linha (são ~10M linhas)
    mapa_cartas = {n: resolver_nome(n, nomes) for n in df["nome_carta"].unique()}
    mapa_commanders = {n: resolver_commander(n, nomes) for n in df["commander"].unique()}

    df = df.assign(oracle_id = df["nome_carta"].map(mapa_cartas))

    # Nomes que não existem no Scryfall como carta jogável: tokens, emblemas, "The Monarch"...
    sem_match = df[df["oracle_id"].isna()]
    nomes_nao_encontrados = sem_match["nome_carta"].value_counts()

    # Decks cujo commander não foi reconhecido são descartados inteiros
    commanders_nao_encontrados = df.loc[df["commander"].map(mapa_commanders).isna(), "commander"]
    commanders_nao_encontrados = commanders_nao_encontrados.groupby(commanders_nao_encontrados).size()
    df = df[df["commander"].map(mapa_commanders).notna() & df["oracle_id"].notna() & (df["quantidade"] > 0)]

    cartas = df[["deck_id", "oracle_id", "quantidade"]].assign(eh_commander = False)

    # No CSV o commander não aparece nas linhas do deck, só na coluna `commander`
    decks_commander = df[["deck_id", "commander"]].drop_duplicates("deck_id")
    commanders = (
        decks_commander.assign(oracle_id = decks_commander["commander"].map(mapa_commanders))
        .explode("oracle_id")[["deck_id", "oracle_id"]]
        .assign(quantidade = 1, eh_commander = True)
    )

    # "A-Carta" e "Carta" no mesmo deck viram o mesmo oracle_id: junta somando as quantidades
    deck_cartas = (
        pd.concat([cartas, commanders])
        .groupby(["deck_id", "oracle_id"], as_index = False)
        .agg(quantidade = ("quantidade", "sum"), eh_commander = ("eh_commander", "max"))
    )
    return deck_cartas, nomes_nao_encontrados, commanders_nao_encontrados


def gravar(conn, deck_cartas: pd.DataFrame):
    with conn.cursor() as cur:
        # 1. Upsert dos decks (mantém o id interno se o deck já tinha sido importado antes)
        cur.execute("CREATE TEMP TABLE decks_tmp (id_externo text) ON COMMIT DROP")
        with cur.copy("COPY decks_tmp (id_externo) FROM STDIN") as copy:
            for deck_id in deck_cartas["deck_id"].unique():
                copy.write_row((str(deck_id),))
        cur.execute("""
            INSERT INTO decks (fonte, id_externo)
            SELECT %s, id_externo FROM decks_tmp
            ON CONFLICT (fonte, id_externo) DO UPDATE SET coletado_em = now()
        """, (FONTE,))
        print(f"{cur.rowcount} decks inseridos/atualizados")

        # 2. Apaga as cartas antigas desses decks, pra reimportar do zero
        cur.execute("""
            DELETE FROM deck_cartas dc USING decks d, decks_tmp t
            WHERE dc.deck_id = d.id AND d.fonte = %s AND d.id_externo = t.id_externo
        """, (FONTE,))

        # 3. COPY das cartas em lotes, já trocando o id do Archidekt pelo id interno
        cur.execute("""
            CREATE TEMP TABLE deck_cartas_tmp (
                id_externo text, oracle_id uuid, quantidade integer, eh_commander boolean
            ) ON COMMIT DROP
        """)
        for inicio in range(0, len(deck_cartas), TAMANHO_LOTE_COPY):
            lote = deck_cartas.iloc[inicio:inicio + TAMANHO_LOTE_COPY]
            buffer = io.StringIO()
            lote[["deck_id", "oracle_id", "quantidade", "eh_commander"]].to_csv(buffer, index = False, header = False)
            with cur.copy("COPY deck_cartas_tmp FROM STDIN WITH (FORMAT csv)") as copy:
                copy.write(buffer.getvalue())
            print(f"  {min(inicio + TAMANHO_LOTE_COPY, len(deck_cartas))}/{len(deck_cartas)} linhas copiadas")

        cur.execute("""
            INSERT INTO deck_cartas (deck_id, oracle_id, quantidade, eh_commander)
            SELECT d.id, t.oracle_id, t.quantidade, t.eh_commander
            FROM deck_cartas_tmp t
            JOIN decks d ON d.fonte = %s AND d.id_externo = t.id_externo
        """, (FONTE,))
        print(f"{cur.rowcount} linhas em deck_cartas")


def main():
    caminho = baixar_csv(Path(sys.argv[1]) if len(sys.argv) > 1 else CAMINHO_PADRAO)
    dsn = os.environ.get("DATABASE_URL", "postgresql://mtg:mtg@localhost:5432/mtg")

    df = pd.read_csv(caminho, dtype = {"deck_id": "int64", "quantidade": "int32"})
    print(f"CSV: {len(df)} linhas, {df['deck_id'].nunique()} decks")

    with psycopg.connect(dsn) as conn:
        nomes = carregar_nomes(conn)
        deck_cartas, nomes_nao_encontrados, commanders_nao_encontrados = montar_deck_cartas(df, nomes)

        print(f"{len(nomes_nao_encontrados)} nomes de carta não encontrados "
              f"({nomes_nao_encontrados.sum()} linhas, tokens/emblemas etc.)")
        print(f"{len(commanders_nao_encontrados)} commanders não encontrados "
              f"({commanders_nao_encontrados.sum()} linhas descartadas)")

        # Relatórios pra revisar depois o que ficou de fora
        pasta = caminho.parent
        nomes_nao_encontrados.to_csv(pasta / "nao_encontradas_cartas.csv", header = ["linhas"])
        commanders_nao_encontrados.sort_values(ascending = False).to_csv(
            pasta / "nao_encontradas_commanders.csv", header = ["linhas"])

        gravar(conn, deck_cartas)


if __name__ == "__main__":
    main()
