CREATE TABLE IF NOT EXISTS ta_perfis (usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE, setor TEXT NOT NULL CHECK(setor IN ('prevencao','avaria','ambos')), pin_hash TEXT, atualizado_em TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS ta_remessas (id BIGSERIAL PRIMARY KEY, status TEXT NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','enviada','conferida','divergente','resolvida','cancelada')), observacao TEXT DEFAULT '', criado_por INTEGER NOT NULL REFERENCES usuarios(id), enviado_por INTEGER REFERENCES usuarios(id), recebido_por INTEGER REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), enviado_em TIMESTAMPTZ, recebido_em TIMESTAMPTZ, resolvido_em TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS ta_itens (id BIGSERIAL PRIMARY KEY, remessa_id BIGINT NOT NULL REFERENCES ta_remessas(id) ON DELETE CASCADE, codigo TEXT NOT NULL, descricao TEXT NOT NULL, unidade TEXT NOT NULL DEFAULT 'UN', quantidade_enviada NUMERIC(12,3) NOT NULL CHECK(quantidade_enviada>0), quantidade_recebida NUMERIC(12,3) CHECK(quantidade_recebida>=0), UNIQUE(remessa_id,codigo));
CREATE TABLE IF NOT EXISTS ta_eventos (id BIGSERIAL PRIMARY KEY, remessa_id BIGINT NOT NULL REFERENCES ta_remessas(id) ON DELETE CASCADE, usuario_id INTEGER REFERENCES usuarios(id), acao TEXT NOT NULL, detalhes JSONB NOT NULL DEFAULT '{}', criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS ta_remessas_status_idx ON ta_remessas(status,criado_em DESC);
CREATE INDEX IF NOT EXISTS ta_eventos_remessa_idx ON ta_eventos(remessa_id,id);

-- V74.16: permitir produtos sem EAN e códigos internos (vários avulsos na mesma remessa).
ALTER TABLE ta_itens ALTER COLUMN codigo DROP NOT NULL;
