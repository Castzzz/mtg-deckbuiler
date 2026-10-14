-- Contas: usuários, sessões de login e os decks montados no site (os de quem tem conta ficam aqui, não no navegador).
-- Não confundir com `decks`/`deck_cartas`, que são os decks coletados de fora pras recomendações.
CREATE TABLE IF NOT EXISTS usuarios (
    id          bigserial PRIMARY KEY,
    usuario     text NOT NULL,                 -- o nome que aparece, do jeito que a pessoa escreveu
    email       text NOT NULL,
    senha_hash  text NOT NULL,                 -- scrypt, com o sal e os parâmetros junto
    criado_em   timestamptz NOT NULL DEFAULT now()
);
-- Login sem diferenciar maiúsculas
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_usuario_idx ON usuarios (lower(usuario));
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_idx ON usuarios (lower(email));

-- Guarda só o hash do token: quem ler o banco não consegue entrar como ninguém
CREATE TABLE IF NOT EXISTS sessoes (
    token_hash  bytea PRIMARY KEY,
    usuario_id  bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    criada_em   timestamptz NOT NULL DEFAULT now(),
    expira_em   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessoes_usuario_idx ON sessoes (usuario_id);

-- O id vem do navegador (o deck pode ter nascido antes da conta), por isso a chave inclui o dono
CREATE TABLE IF NOT EXISTS decks_usuario (
    usuario_id    bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    id            text NOT NULL,
    nome          text NOT NULL,
    artes         jsonb NOT NULL DEFAULT '{}',  -- oracle_id -> edição escolhida
    criado_em     timestamptz NOT NULL,
    atualizado_em timestamptz NOT NULL,
    PRIMARY KEY (usuario_id, id)
);

-- `ordem` mantém a ordem em que as cartas foram adicionadas (e a dos commanders, quando são 2).
-- A mesma carta pode estar em mais de uma seção (ex: no deck e no maybeboard)
CREATE TABLE IF NOT EXISTS decks_usuario_cartas (
    usuario_id   bigint NOT NULL,
    deck_id      text NOT NULL,
    oracle_id    uuid NOT NULL REFERENCES cartas (oracle_id),
    secao        text NOT NULL CHECK (secao IN ('commander', 'cartas', 'sideboard', 'maybeboard')),
    quantidade   integer NOT NULL DEFAULT 1,
    origem       text,                           -- busca, sugestao, importada, basico
    ordem        integer NOT NULL,
    PRIMARY KEY (usuario_id, deck_id, oracle_id, secao),
    FOREIGN KEY (usuario_id, deck_id) REFERENCES decks_usuario (usuario_id, id) ON DELETE CASCADE
);
