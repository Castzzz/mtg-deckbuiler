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
```

> `db/schema.sql` só roda quando o volume do Postgres é criado pela primeira vez.
> Pra recriar do zero: `docker compose down -v && docker compose up -d --wait`.

## Estrutura

- `db/schema.sql`: tabelas `cartas`, `decks`, `deck_cartas`
- `pipeline/`: scripts que alimentam o banco (Scryfall, depois decks e recomendações)
