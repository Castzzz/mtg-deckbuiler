-- Tokens (e emblemas) e quais cartas criam cada um, pra mostrar no deck e criar na mesa de teste.
-- Depois de rodar, importe: python -m pipeline.importar_tokens
CREATE TABLE IF NOT EXISTS tokens (
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
CREATE INDEX IF NOT EXISTS tokens_nome_idx ON tokens (lower(nome));

CREATE TABLE IF NOT EXISTS carta_tokens (
    oracle_id uuid NOT NULL REFERENCES cartas (oracle_id) ON DELETE CASCADE,
    token_id  uuid NOT NULL REFERENCES tokens (oracle_id) ON DELETE CASCADE,
    PRIMARY KEY (oracle_id, token_id)
);
CREATE INDEX IF NOT EXISTS carta_tokens_token_idx ON carta_tokens (token_id);
