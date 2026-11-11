CREATE TABLE IF NOT EXISTS ta_perfis (usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE, setor TEXT NOT NULL CHECK(setor IN ('prevencao','avaria','ambos')), pin_hash TEXT, atualizado_em TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS ta_remessas (id BIGSERIAL PRIMARY KEY, status TEXT NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','enviada','conferida','divergente','resolvida','cancelada')), observacao TEXT DEFAULT '', criado_por INTEGER NOT NULL REFERENCES usuarios(id), enviado_por INTEGER REFERENCES usuarios(id), recebido_por INTEGER REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), enviado_em TIMESTAMPTZ, recebido_em TIMESTAMPTZ, resolvido_em TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS ta_itens (id BIGSERIAL PRIMARY KEY, remessa_id BIGINT NOT NULL REFERENCES ta_remessas(id) ON DELETE CASCADE, codigo TEXT NOT NULL, descricao TEXT NOT NULL, unidade TEXT NOT NULL DEFAULT 'UN', quantidade_enviada NUMERIC(12,3) NOT NULL CHECK(quantidade_enviada>0), quantidade_recebida NUMERIC(12,3) CHECK(quantidade_recebida>=0), UNIQUE(remessa_id,codigo));
CREATE TABLE IF NOT EXISTS ta_eventos (id BIGSERIAL PRIMARY KEY, remessa_id BIGINT NOT NULL REFERENCES ta_remessas(id) ON DELETE CASCADE, usuario_id INTEGER REFERENCES usuarios(id), acao TEXT NOT NULL, detalhes JSONB NOT NULL DEFAULT '{}', criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS ta_remessas_status_idx ON ta_remessas(status,criado_em DESC);
CREATE INDEX IF NOT EXISTS ta_eventos_remessa_idx ON ta_eventos(remessa_id,id);

-- V74.16: permitir produtos sem EAN e códigos internos (vários avulsos na mesma remessa).
ALTER TABLE ta_itens ALTER COLUMN codigo DROP NOT NULL;

-- V74.17: recebimento com conferência parcial e retomada.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ta_remessas'::regclass AND conname='ta_remessas_status_check') THEN
    ALTER TABLE ta_remessas DROP CONSTRAINT ta_remessas_status_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ta_remessas'::regclass AND conname='ta_remessas_status_check') THEN
    ALTER TABLE ta_remessas ADD CONSTRAINT ta_remessas_status_check CHECK(status IN ('rascunho','enviada','em_conferencia','conferida','divergente','resolvida','cancelada'));
  END IF;
END $$;
ALTER TABLE ta_remessas ADD COLUMN IF NOT EXISTS conferencia_iniciada_por INTEGER REFERENCES usuarios(id);
ALTER TABLE ta_remessas ADD COLUMN IF NOT EXISTS conferencia_iniciada_em TIMESTAMPTZ;

-- V74.25: evidencia fotografica e classificacao individual dos itens.
ALTER TABLE ta_itens ADD COLUMN IF NOT EXISTS setor_origem TEXT;
ALTER TABLE ta_itens ADD COLUMN IF NOT EXISTS motivo_avaria TEXT;
ALTER TABLE ta_itens ADD COLUMN IF NOT EXISTS motivo_outros TEXT;
ALTER TABLE ta_itens ADD COLUMN IF NOT EXISTS foto_id BIGINT;
CREATE TABLE IF NOT EXISTS ta_fotos (
 id BIGSERIAL PRIMARY KEY, remessa_id BIGINT NOT NULL REFERENCES ta_remessas(id) ON DELETE CASCADE,
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id), public_id TEXT NOT NULL UNIQUE, formato TEXT NOT NULL,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ta_itens_foto_fk' AND conrelid='ta_itens'::regclass) THEN
  ALTER TABLE ta_itens ADD CONSTRAINT ta_itens_foto_fk FOREIGN KEY (foto_id) REFERENCES ta_fotos(id);
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS ta_fotos_remessa_idx ON ta_fotos(remessa_id);
CREATE UNIQUE INDEX IF NOT EXISTS ta_itens_foto_unica_idx ON ta_itens(foto_id) WHERE foto_id IS NOT NULL;

-- V74.26: cadastro de fornecedores e vinculacao pelo codigo INTERNO do GZ.
CREATE TABLE IF NOT EXISTS ta_fornecedores (
 codigo TEXT PRIMARY KEY, nome TEXT NOT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE,
 atualizado_por INTEGER REFERENCES usuarios(id), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ta_fornecedor_produtos (
 codigo_produto TEXT PRIMARY KEY, codigo_fornecedor TEXT NOT NULL REFERENCES ta_fornecedores(codigo),
 atualizado_por INTEGER REFERENCES usuarios(id), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ta_fornecedor_produtos_fornecedor_idx ON ta_fornecedor_produtos(codigo_fornecedor);
ALTER TABLE ta_itens ADD COLUMN IF NOT EXISTS codigo_interno TEXT;
CREATE INDEX IF NOT EXISTS ta_itens_interno_idx ON ta_itens(codigo_interno);
