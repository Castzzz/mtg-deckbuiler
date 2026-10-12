# mtg-deckbuilder

Montador de decks de Commander (Magic: The Gathering) com recomendações de cartas por sinergia.
Evolução do trabalho da UFRJ [Analise_Dados_Magic](../Analise_Dados_Magic), que usa PageRank sobre a matriz de coocorrência de cartas.

## Testando na minha máquina (dia a dia)

Com os dados já importados (se for a primeira vez, faça antes o passo a passo de "Rodando localmente"),
são três coisas, cada uma num terminal:

```bash
docker compose up -d --wait                  # 1. banco (se já não estiver de pé)
.venv/bin/uvicorn api.main:app --reload      # 2. API em http://localhost:8000 (espera o "Grafo carregado", ~20s)
cd web && npm run dev                        # 3. site em http://localhost:5173
```

Abre http://localhost:5173. Pra testar a partida sozinho, abre `/jogar` numa aba normal e na outra anônima
(cada aba anônima é outro "jogador", com os próprios decks). Pra parar: Ctrl+C na API e no site, e
`docker compose stop` se quiser desligar o banco.

## Jogar com os amigos pela internet

O jeito mais simples é rodar tudo no seu PC e abrir um túnel da Cloudflare: os amigos só recebem um link
`https://….trycloudflare.com`, sem instalar nada e sem mexer no roteador. O PC precisa ficar ligado durante a partida.

```bash
sudo pacman -S caddy cloudflared             # uma vez só (CachyOS/Arch)

docker compose up -d --wait
.venv/bin/uvicorn api.main:app               # sem --reload, e com um worker só (as salas ficam na memória dele)
cd web && npm run build && cd ..             # compila o site em web/dist (rode de novo quando mudar o front)
caddy run --config deploy/Caddyfile          # site + API juntos em http://localhost:8080
cloudflared tunnel --url http://localhost:8080   # mostra o link público pra mandar pros amigos
```

O `deploy/Caddyfile` serve o site e repassa `/api/*` (com o WebSocket das salas) pra API, como o Vite faz em
desenvolvimento; como fica tudo no mesmo endereço, não precisa configurar CORS nem `VITE_API_URL`. Confere
em http://localhost:8080 antes de mandar o link.

Coisas pra saber:

- O link do túnel rápido muda toda vez que roda o `cloudflared`. Pra ter um endereço fixo, precisa de conta
  na Cloudflare e um domínio (túnel nomeado), ou usar o [Tailscale](https://tailscale.com) (aí cada amigo
  instala o Tailscale e você compartilha a máquina com ele).
- Os decks ficam no navegador de cada um: cada amigo monta ou importa o próprio deck (`/importar`, colando a
  lista do Moxfield/Archidekt) antes de entrar na sala.
- Reiniciar a API apaga as salas abertas; os jogadores entram de novo com o mesmo link e recolocam a mesa.
- Qualquer um com o link usa o site todo, então desligue o túnel (Ctrl+C) quando acabar.

Pra deixar no ar sem depender do seu PC, dá pra fazer o mesmo num servidor (VPS). O grafo fica na memória da
API, então veja quanto ela usa no seu PC antes de escolher o plano. Clona o projeto, sobe o banco e copia os dados do seu
(`docker compose exec -T db pg_dump -U mtg --clean --if-exists mtg > mtg.sql` aqui, `docker compose exec -T db psql -U mtg mtg < mtg.sql`
lá), e troca o `:8080` do Caddyfile pelo domínio (o Caddy pega o HTTPS sozinho). Aí não precisa do túnel.

## Rodando localmente

```bash
cp .env.example .env
docker compose up -d --wait          # Postgres 17, já cria as tabelas de db/schema.sql

python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pipeline.importar_scryfall   # baixa as cartas do Scryfall e popula a tabela `cartas`
.venv/bin/python -m pipeline.importar_impressoes # baixa todas as edições (~80MB) e os preços (rode de novo pra atualizar)
.venv/bin/python -m pipeline.importar_tokens     # tokens e emblemas, e quais cartas criam cada um (usa o mesmo arquivo)
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

## Atualização automática

`pipeline.atualizar` roda tudo em ordem: cartas novas, edições e preços, tokens, coleta de decks (por até 2h,
continuando de onde parou) e recomendações. A API percebe os dados novos sozinha (checa a cada 5 min)
e recarrega o grafo sem cair, então não precisa reiniciar.

```bash
.venv/bin/python -m pipeline.atualizar                 # tudo, coleta por até 2h
.venv/bin/python -m pipeline.atualizar --sem-coleta    # só cartas, preços e recomendações (~3 min)
```

Pra rodar todo dia às 4h com o systemd (se o PC estiver desligado, roda quando ligar):

```bash
sudo systemctl enable --now docker                     # Docker subindo junto com o sistema
mkdir -p ~/.config/systemd/user
cp deploy/systemd/mtg-atualizar.* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mtg-atualizar.timer

systemctl --user list-timers mtg-atualizar             # quando vai rodar
journalctl --user -u mtg-atualizar -f                  # acompanhar o que está fazendo
systemctl --user start mtg-atualizar                   # rodar agora
```

Os arquivos assumem o projeto em `~/Dev/mtg-deckbuilder`; se estiver em outro lugar, ajuste o
`WorkingDirectory` e o `ExecStart` do `.service`.

## API

```bash
.venv/bin/uvicorn api.main:app --reload   # http://localhost:8000/docs
```

Ao iniciar, a API carrega o grafo de decks na memória (~20s) pra calcular o `/recomendar` na hora.

| Endpoint | O que faz |
|---|---|
| `GET /cartas?q=&cores=` | busca cartas legais em Commander pelo nome (`cores=WB`: só as que cabem na identidade) |
| `POST /cartas/por-id` | dados atualizados (preço, ...) de várias cartas, ex: as de um deck salvo |
| `POST /bracket` | bracket estimado do deck pelas regras oficiais, com os motivos (combos, turnos extras e destruição de terrenos vêm do Commander Spellbook) |
| `GET /cotacao` | dólar e euro em reais (AwesomeAPI, cache de 1h), pra converter os preços |
| `POST /cartas/por-nome` | acha várias cartas pelo nome de uma vez (usado pelo import de lista) |
| `GET /cartas/{id}` | detalhes de uma carta |
| `GET /cartas/{id}/edicoes` | todas as edições em papel da carta, com imagem e preço (pra escolher a arte) |
| `POST /tokens/do-deck` | os tokens (e emblemas) que as cartas do deck criam, com quem cria cada um |
| `GET /tokens?q=` | busca qualquer token pelo nome ou tipo (Treasure, Zombie, ...) |
| `POST /salas` | cria uma sala pra jogar com os amigos, com a regra de mulligan (`{"regra_mulligan": "commander"}` ou `"london"`); devolve o código de 5 letras |
| `WS /salas/{codigo}/ws?segredo=&nome=` | a partida em tempo real: mesas públicas, histórico, chat, dados e moedas, e de quem é a vez (mensagens descritas em `api/rotas/salas.py`) |
| `GET /commanders?q=` | commanders com recomendações, dos mais jogados pros menos |
| `GET /commanders/{id}/parceiros` | quem pode fazer dupla com o commander (Partner, Background, Doctor's companion...), das duplas mais jogadas pras menos |
| `GET /commanders/{id}/recomendacoes?categoria=&ordem=&preco_max=` | recomendações pré-calculadas, por `score`, `sinergia` ou `inclusao` (filtra por categoria e preço em dólar) |
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

React + Vite + TypeScript + Tailwind. O visual é de mesa de Magic (tons quentes, ver `web/src/index.css`), e a
cor de destaque, o brilho do fundo e a faixa do topo mudam com a identidade de cor do commander (`web/src/tema.ts`). Em desenvolvimento o Vite repassa `/api/*` pra FastAPI
(ver `web/vite.config.ts`); pra apontar pra outra API, defina `VITE_API_URL`.

- `/`: busca de commander e os mais jogados
- `/commander/{id}`: recomendações como no EDHREC (alta sinergia, mais usadas) ou pelo score do grafo,
  filtradas por categoria; commanders com Partner, Background ou Doctor's companion podem escolher a dupla
  (`?parceiro={id}`), e aí as recomendações são calculadas pros dois
- `/deck/{id}`: montador de deck. A pessoa busca as cartas pelo nome, e as sugestões só aparecem quando ela
  pede (botão "Sugerir cartas", que abre as recomendações com base nas cartas que já estão no deck). Cada
  carta guarda de onde veio (busca, sugestão, import), pra no futuro dar menos peso no grafo ao que veio das
  nossas sugestões. Tem checagem rápida (100 cartas, cores, banidas, cópias: básicos e cartas como Relentless
  Rats e Seven Dwarves podem ter várias), bracket estimado (com os motivos: Game Changers, combos, ...),
  visualização em imagens (como no Archidekt, com × pra tirar) ou em lista, e um popup ao clicar na carta
  (texto, preço, cópias, troca de arte e "Definir como commander": deck importado sem commander fica com
  um aviso até a pessoa escolher), curva de mana,
  terrenos básicos, tokens que o deck precisa, total em real ou dólar (sem contar os básicos, como na maioria dos sites) e exportação da lista pro Moxfield/Archidekt. Os decks ficam no
  `localStorage` do navegador (`/decks` lista todos)
- `/deck/{id}/testar`: mesa em tela cheia pra testar o deck sozinho, como o playtest do Moxfield. Começa com a mão
  inicial e o mulligan (primeiro grátis, como nas mesas de Commander, ou London), e depois tem o campo de batalha
  livre (a carta fica onde for solta; clicada, vai pro primeiro lugar livre, terrenos embaixo), mão, grimório
  (comprar, buscar, embaralhar), cemitério, exílio e zona de comando com o imposto do commander. Botão direito abre
  as opções da carta, inclusive os contadores (+1/+1 e -1/-1 se anulam, lealdade, carga, ou qualquer nome); "Próximo turno"
  desvira tudo e compra; Ctrl+Z desfaz. O campo e a mão têm zoom (botões − / + ou Ctrl + rodinha, fica salvo), e tem dados
  e moeda, e contadores do jogador (veneno, energia, experiência). Atalhos (`?` mostra todos): C compra,
  N próximo turno, U desvira tudo, O cria token, e com o mouse numa carta T vira, D copia, P joga, H mão, G cemitério,
  E exílio. Tokens: os do deck aparecem primeiro e dá pra buscar qualquer outro; fora do campo, token deixa de existir
- `/jogar`: partida de Commander com os amigos (até 6), com cartas digitais. Uma pessoa cria a sala e passa o código
  ou o link (`/jogar/{codigo}`) e escolhe a regra de mulligan da mesa (1º grátis ou London; dá pra mudar até começar);
  cada um escolhe um deck salvo no próprio navegador e o dono começa a partida. A ordem e quem joga primeiro são
  sorteados pelo servidor, e o sorteio aparece na tela de todo mundo. A mesa é a mesma do teste, com os outros jogadores
  em cima: o campo de cada um (reduzido, com os contadores), vida, veneno, quantas cartas tem na mão e no grimório,
  cemitério e exílio (clicáveis) e o dano que cada commander já te deu (você anota; 21 mata). Com 3 ou mais, um
  oponente fica grande (quem está na vez, ou quem você clicar) e os outros menores do lado; "Ver campo" abre o campo
  de qualquer um na tela toda. Dados e moedas numa partida são rolados pela sala, e todo mundo vê o resultado.
  Cartas mudam de campo: no menu da sua carta, "Dar o controle a…" (Donate); com o botão direito numa carta de outro
  jogador, "Pegar o controle" (Control Magic, Threaten). A carta chega como estava (virada, com contadores) e com um
  selo "de Fulano". A carta é livre: quem estiver com ela pode passar pra qualquer outro (ela continua sendo do dono,
  que fica sabendo com quem ela está) ou devolver, e o dono pode pegar de volta; se ela sair do campo, vai pra zona do
  dono (cemitério, mão, exílio...). Em "Sair do jogo" dá pra marcar "Fui eliminado" (a mesa sugere quando a vida chega
  a 0, o veneno a 10 ou o dano de um commander a 21) ou "Conceder" (pra quem precisa sair sem travar a partida): as
  cartas dele saem da mesa de todo mundo, as dos outros que estavam com ele voltam pros donos, e a vez passa a pular ele.
  Sobrando um, a sala anuncia o vencedor. Mesa casual: "Voltar pro jogo" traz a pessoa de volta, com as cartas dela.
  Cada um é dono da própria mesa: a mão e o grimório ficam só no seu navegador, e a sala recebe só a parte pública.
  Ao chegar a sua vez, desvira e compra sozinho; "Passar a vez" (N) passa pro próximo. Histórico e chat da mesa em
  "Histórico". Dá pra recarregar a página ou cair a internet sem perder nada; as salas ficam na memória da API
  (reiniciar a API apaga as salas)
- `/importar`: cola uma lista do Moxfield, do Archidekt ou do Arena e vira um deck; reconhece o commander
  (seção Commander, `*CMDR*`, categoria `[Commander]`), deixa criar sem commander se a lista não disser,
  e avisa o que ficou de fora (banidas, fora das cores, ...)

## Testes

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest tests/   # usa o banco local, precisa dos dados importados (test_salas.py não precisa)
cd web && npm test                  # testes do front (import de lista, regras do deck, mesa, partida)
```

## Estrutura

- `db/schema.sql`: tabelas `cartas`, `impressoes`, `tokens`, `carta_tokens`, `decks`, `deck_cartas`, `coleta_commanders`, `commanders`, `recomendacoes`
- `pipeline/`: scripts que alimentam o banco (Scryfall, decks do Archidekt, recomendações)
- `recomendador/`: grafo de coocorrência, PageRank e scores, usado pelo pipeline e pela API
- `api/`: FastAPI
- `web/`: site (React)
- `tests/`: testes da API
