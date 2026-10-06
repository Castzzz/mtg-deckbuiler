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
    imagem_url      text,
    scryfall_uri    text,
    dados           jsonb NOT NULL,  -- objeto completo do Scryfall, pra campos que ainda não viraram coluna
    atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cartas_nome_idx ON cartas (lower(nome));
CREATE INDEX cartas_identidade_cor_idx ON cartas USING gin (identidade_cor);

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
    quantidade   smallint NOT NULL DEFAULT 1,
    eh_commander boolean NOT NULL DEFAULT false,
    PRIMARY KEY (deck_id, oracle_id)
);

CREATE INDEX deck_cartas_oracle_idx ON deck_cartas (oracle_id);
CREATE INDEX deck_cartas_commander_idx ON deck_cartas (oracle_id) WHERE eh_commander;
