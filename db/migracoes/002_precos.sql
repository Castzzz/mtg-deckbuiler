-- Edições de cada carta (preços e, no futuro, escolha da arte) e o preço mais barato na tabela `cartas`.
-- Depois de rodar, importe as edições: python -m pipeline.importar_impressoes
CREATE TABLE IF NOT EXISTS impressoes (
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
CREATE INDEX IF NOT EXISTS impressoes_oracle_idx ON impressoes (oracle_id);

ALTER TABLE cartas ADD COLUMN IF NOT EXISTS preco_usd numeric;  -- edição mais barata
ALTER TABLE cartas ADD COLUMN IF NOT EXISTS preco_eur numeric;
