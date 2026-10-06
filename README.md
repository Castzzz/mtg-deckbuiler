# mtg-deckbuilder

Montador de decks de Commander (Magic: The Gathering) com recomendações de cartas por sinergia.
Evolução do trabalho da UFRJ [Analise_Dados_Magic](../Analise_Dados_Magic), que usa PageRank sobre a matriz de coocorrência de cartas.

## Rodando localmente

```bash
cp .env.example .env
docker compose up -d --wait          # Postgres 17, já cria as tabelas de db/schema.sql

python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pipeline.importar_scryfall   # baixa as cartas do Scryfall e popula a tabela `cartas`
.venv/bin/python -m pipeline.importar_archidekt  # baixa o CSV do Archidekt (~600MB) e popula `decks`/`deck_cartas`
.venv/bin/python -m pipeline.coletar_archidekt   # coleta decks direto da API do Archidekt (demora: ~1 deck/s)
```

O importador do Archidekt grava em `dados/archidekt/` dois relatórios do que ficou de fora
(`nao_encontradas_cartas.csv`, `nao_encontradas_commanders.csv`). Reimportar o CSV atualiza os decks
que estão nele, mas não apaga decks que já estavam no banco e não aparecem mais no arquivo.

> `db/schema.sql` só roda quando o volume do Postgres é criado pela primeira vez.
> Pra recriar do zero: `docker compose down -v && docker compose up -d --wait`.

## Estrutura

- `db/schema.sql`: tabelas `cartas`, `decks`, `deck_cartas`, `coleta_commanders`
- `pipeline/`: scripts que alimentam o banco (Scryfall, depois decks e recomendações)
