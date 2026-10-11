-- Cartas: uma linha por carta "oracle" (mesma carta em várias edições = uma linha só).
-- Fonte: bulk data "oracle_cards" do Scryfall.
CREATE TABLE cartas (
    oracle_id       uuid PRIMARY KEY,
    nome            text NOT NULL,
    custo_mana      text,
    cmc             numeric NOT NULL DEFAULT 0,  -- sem limite: Gleemax custa 1.000.000
    tipo            text NOT NULL,
    texto           text,
    cores           char(1)[] NOT NULL DEFAULT '{}',
    identidade_cor  char(1)[] NOT NULL DEFAULT '{}',
    legal_commander boolean NOT NULL,
    pode_ser_commander boolean NOT NULL,
    parceria        text,            -- tipo de dupla de commanders (partner, background, ...), ver pipeline.importar_scryfall.parceria
    imagem_url      text,
    scryfall_uri    text,
    dados           jsonb NOT NULL,  -- objeto completo do Scryfall, pra campos que ainda não viraram coluna
    preco_usd       numeric,         -- edição mais barata (pipeline.importar_impressoes)
    preco_eur       numeric,
    atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- Categoria principal da carta (como o EDHREC agrupa as recomendações), pela face da frente
ALTER TABLE cartas ADD COLUMN categoria text GENERATED ALWAYS AS (
    CASE
        WHEN split_part(tipo, ' // ', 1) LIKE '%Land%'         THEN 'terreno'
        WHEN split_part(tipo, ' // ', 1) LIKE '%Creature%'     THEN 'criatura'
        WHEN split_part(tipo, ' // ', 1) LIKE '%Planeswalker%' THEN 'planeswalker'
        WHEN split_part(tipo, ' // ', 1) LIKE '%Battle%'       THEN 'batalha'
        WHEN split_part(tipo, ' // ', 1) LIKE '%Instant%'      THEN 'instantanea'
        WHEN split_part(tipo, ' // ', 1) LIKE '%Sorcery%'      THEN 'feitico'
        WHEN split_part(tipo, ' // ', 1) LIKE '%Artifact%'     THEN 'artefato'
        WHEN split_part(tipo, ' // ', 1) LIKE '%Enchantment%'  THEN 'encantamento'
        ELSE 'outro'
    END
) STORED;

CREATE INDEX cartas_nome_idx ON cartas (lower(nome));
CREATE INDEX cartas_identidade_cor_idx ON cartas USING gin (identidade_cor);

-- Edições de cada carta (todas as impressões em papel), do bulk "default_cards" do Scryfall
CREATE TABLE impressoes (
    scryfall_id   uuid PRIMARY KEY,
    oracle_id     uuid NOT NULL REFERENCES cartas (oracle_id) ON DELETE CASCADE,
    edicao        text NOT NULL,          -- código da coleção, ex: "c21"
    nome_edicao   text NOT NULL,
    numero        text NOT NULL,          -- número de colecionador
    lancamento    date,
    imagem_url    text,
    preco_usd     numeric,                -- menor preço entre normal, foil e etched (Scryfall/TCGplayer)
    preco_eur     numeric,                -- idem (Cardmarket)
    atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX impressoes_oracle_idx ON impressoes (oracle_id);

-- Tokens (e emblemas), um por oracle_id, com a imagem da edição mais nova (pipeline.importar_tokens)
CREATE TABLE tokens (
    oracle_id     uuid PRIMARY KEY,
    nome          text NOT NULL,
    tipo          text NOT NULL,          -- ex: "Token Creature — Zombie", "Emblem — Liliana"
    texto         text,
    poder         text,                   -- texto porque pode ser "*" ou "X"
    resistencia   text,
    cores         char(1)[] NOT NULL DEFAULT '{}',
    imagem_url    text,
    atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tokens_nome_idx ON tokens (lower(nome));

-- Quais tokens cada carta cria (o "all_parts" do Scryfall, juntando todas as edições)
CREATE TABLE carta_tokens (
    oracle_id uuid NOT NULL REFERENCES cartas (oracle_id) ON DELETE CASCADE,
    token_id  uuid NOT NULL REFERENCES tokens (oracle_id) ON DELETE CASCADE,
    PRIMARY KEY (oracle_id, token_id)
);
CREATE INDEX carta_tokens_token_idx ON carta_tokens (token_id);

-- Decks coletados de sites externos (Archidekt, Moxfield, ...), usados pra calcular sinergia.
CREATE TABLE decks (
    id           bigserial PRIMARY KEY,
    fonte        text NOT NULL,          -- 'archidekt', 'moxfield', ...
    id_externo   text NOT NULL,          -- id do deck no site de origem
    nome         text,
    atualizado_em timestamptz,           -- data de atualização no site de origem
    coletado_em  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (fonte, id_externo)
);

-- eh_commander separa o(s) commander(s) do resto do deck (partners têm 2).
CREATE TABLE deck_cartas (
    deck_id      bigint NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    oracle_id    uuid NOT NULL REFERENCES cartas (oracle_id),
    quantidade   integer NOT NULL DEFAULT 1,
    eh_commander boolean NOT NULL DEFAULT false,
    PRIMARY KEY (deck_id, oracle_id)
);

CREATE INDEX deck_cartas_oracle_idx ON deck_cartas (oracle_id);
CREATE INDEX deck_cartas_commander_idx ON deck_cartas (oracle_id) WHERE eh_commander;

-- Progresso do coletor da API do Archidekt: quando cada commander foi coletado pela última vez.
CREATE TABLE coleta_commanders (
    oracle_id         uuid PRIMARY KEY REFERENCES cartas (oracle_id),
    coletado_em       timestamptz NOT NULL DEFAULT now(),
    decks_encontrados integer NOT NULL
);
-- Resultado do pipeline.calcular_recomendacoes (recalculado do zero a cada execução).

-- Commanders com decks suficientes pra ter recomendação
CREATE TABLE commanders (
    oracle_id    uuid PRIMARY KEY REFERENCES cartas (oracle_id),
    num_decks    integer NOT NULL,
    calculado_em timestamptz NOT NULL DEFAULT now()
);

-- Cartas recomendadas pra cada commander
CREATE TABLE recomendacoes (
    commander_id uuid NOT NULL REFERENCES commanders (oracle_id) ON DELETE CASCADE,
    oracle_id    uuid NOT NULL REFERENCES cartas (oracle_id),
    num_decks    integer NOT NULL,  -- quantos decks desse commander usam a carta
    inclusao     real NOT NULL,     -- num_decks / decks do commander
    sinergia     real NOT NULL,     -- estilo EDHREC: inclusão no commander - inclusão geral nas cores da carta
    pagerank     real NOT NULL,     -- PageRank personalizado (teletransporte pro commander) dividido pelo PageRank global
    score        real NOT NULL,     -- combinação dos dois, é o que ordena as recomendações
    PRIMARY KEY (commander_id, oracle_id)
);

CREATE INDEX recomendacoes_score_idx ON recomendacoes (commander_id, score DESC);
