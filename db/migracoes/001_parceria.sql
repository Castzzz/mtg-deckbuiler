-- Coluna `parceria` pra bancos criados antes dela existir.
-- Depois de rodar, reimporte as cartas (python -m pipeline.importar_scryfall) pra preencher.
ALTER TABLE cartas ADD COLUMN IF NOT EXISTS parceria text;
