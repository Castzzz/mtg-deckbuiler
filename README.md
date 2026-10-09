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
.venv/bin/python -m pipeline.coletar_archidekt   # coleta decks direto da API do Archidekt (~3.500 decks/h, ver abaixo)
.venv/bin/python -m pipeline.calcular_recomendacoes  # calcula as recomendações de todos os commanders (~2 min)
```

O coletor começa pelos commanders lançados mais recentemente (o dataset do Archidekt é antigo) e pega
até os 300 decks mais recentes de cada um. A API do Archidekt aguenta ~60 requisições/min: os downloads
rodam em paralelo pra aproveitar esse limite, e se ela responder 429 o coletor espera um minuto e desacelera.
Dá pra parar com Ctrl+C e rodar de novo quando quiser, ele continua de onde parou. Depois de coletar,
rode o `calcular_recomendacoes` de novo pra atualizar o site.

O importador do Archidekt grava em `dados/archidekt/` dois relatórios do que ficou de fora
(`nao_encontradas_cartas.csv`, `nao_encontradas_commanders.csv`). Reimportar o CSV atualiza os decks
que estão nele, mas não apaga decks que já estavam no banco e não aparecem mais no arquivo.

> `db/schema.sql` só roda quando o volume do Postgres é criado pela primeira vez.
> Num banco já existente, rode as migrações de `db/migracoes/` em ordem
> (`docker compose exec -T db psql -U mtg mtg < db/migracoes/001_parceria.sql`) e depois o importador de novo.
> Pra recriar do zero: `docker compose down -v && docker compose up -d --wait`.

## API

```bash
.venv/bin/uvicorn api.main:app --reload   # http://localhost:8000/docs
```

Ao iniciar, a API carrega o grafo de decks na memória (~20s) pra calcular o `/recomendar` na hora.

| Endpoint | O que faz |
|---|---|
| `GET /cartas?q=&cores=` | busca cartas legais em Commander pelo nome (`cores=WB`: só as que cabem na identidade) |
| `POST /cartas/por-nome` | acha várias cartas pelo nome de uma vez (usado pelo import de lista) |
| `GET /cartas/{id}` | detalhes de uma carta |
| `GET /commanders?q=` | commanders com recomendações, dos mais jogados pros menos |
| `GET /commanders/{id}/parceiros` | quem pode fazer dupla com o commander (Partner, Background, Doctor's companion...), das duplas mais jogadas pras menos |
| `GET /commanders/{id}/recomendacoes?categoria=&ordem=` | recomendações pré-calculadas, por `score`, `sinergia` ou `inclusao` (filtra por criatura, terreno, ...) |
| `POST /recomendar` | recomendações pro deck em montagem, levando em conta as cartas que já estão nele |

O `POST /recomendar` aceita `ordem: "estilo"`: acha os 300 decks mais parecidos com o do usuário entre
todos os que cabem nas cores do commander (cartas raras em comum pesam mais, decks do mesmo commander
ganham bônus) e ordena pelas cartas que eles usam bem mais que a média. Ex: Edgar + cartas de sacrifício
puxa Ashnod's Altar e Grave Pact; Atraxa + Howling Mine e Temple Bell puxa group hug (Kwain, Propaganda).

## Site

```bash
cd web
npm install
npm run dev   # http://localhost:5173 (precisa da API rodando na porta 8000)
```

React + Vite + TypeScript + Tailwind. Em desenvolvimento o Vite repassa `/api/*` pra FastAPI
(ver `web/vite.config.ts`); pra apontar pra outra API, defina `VITE_API_URL`.

- `/`: busca de commander e os mais jogados
- `/commander/{id}`: recomendações como no EDHREC (alta sinergia, mais usadas) ou pelo score do grafo,
  filtradas por categoria; commanders com Partner, Background ou Doctor's companion podem escolher a dupla
  (`?parceiro={id}`), e aí as recomendações são calculadas pros dois
- `/deck/{id}`: montador de deck. Sugestões que se adaptam ao deck ("Para o seu deck"), busca de qualquer
  carta nas cores do commander, lista agrupada por tipo, curva de mana, terrenos básicos e exportação
  da lista pro Moxfield/Archidekt. Os decks ficam no `localStorage` do navegador (`/decks` lista todos)
- `/importar`: cola uma lista do Moxfield, do Archidekt ou do Arena e vira um deck; reconhece o commander
  (seção Commander, `*CMDR*`, categoria `[Commander]`) e avisa o que ficou de fora (banidas, fora das cores, ...)

## Testes

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest tests/   # usa o banco local, precisa dos dados importados
cd web && npm test                  # testes do front (leitura e análise da lista importada)
```

## Estrutura

- `db/schema.sql`: tabelas `cartas`, `decks`, `deck_cartas`, `coleta_commanders`, `commanders`, `recomendacoes`
- `pipeline/`: scripts que alimentam o banco (Scryfall, decks do Archidekt, recomendações)
- `recomendador/`: grafo de coocorrência, PageRank e scores, usado pelo pipeline e pela API
- `api/`: FastAPI
- `web/`: site (React)
- `tests/`: testes da API
