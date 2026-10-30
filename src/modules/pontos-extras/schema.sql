
-- V71: tabelas próprias, apenas migração aditiva.
CREATE TABLE IF NOT EXISTS pe_fornecedores (id BIGSERIAL PRIMARY KEY,nome TEXT NOT NULL,cnpj TEXT,contato TEXT,telefone TEXT,email TEXT,criado_em TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS pe_pontos (id BIGSERIAL PRIMARY KEY,codigo TEXT NOT NULL UNIQUE,tipo TEXT NOT NULL,localizacao TEXT NOT NULL,valor NUMERIC(13,2) NOT NULL DEFAULT 0,foto_id TEXT,foto_formato TEXT,observacao TEXT,x NUMERIC(8,5),y NUMERIC(8,5),criado_em TIMESTAMPTZ DEFAULT NOW(),CHECK(x IS NULL OR x BETWEEN 0 AND 1),CHECK(y IS NULL OR y BETWEEN 0 AND 1));
CREATE TABLE IF NOT EXISTS pe_pacotes (id BIGSERIAL PRIMARY KEY,fornecedor_id BIGINT NOT NULL REFERENCES pe_fornecedores(id),nome TEXT NOT NULL,inicio DATE NOT NULL,fim DATE NOT NULL,valor NUMERIC(13,2) NOT NULL CHECK(valor>=0),forma_pagamento TEXT,arquivo_id TEXT,observacao TEXT,CHECK(fim>=inicio));
CREATE TABLE IF NOT EXISTS pe_contratos (id BIGSERIAL PRIMARY KEY,fornecedor_id BIGINT NOT NULL REFERENCES pe_fornecedores(id),ponto_id BIGINT NOT NULL REFERENCES pe_pontos(id),pacote_id BIGINT REFERENCES pe_pacotes(id),inicio DATE NOT NULL,fim DATE NOT NULL,valor NUMERIC(13,2) NOT NULL CHECK(valor>=0),forma_pagamento TEXT,arquivo_id TEXT,observacao TEXT,CHECK(fim>=inicio));
CREATE INDEX IF NOT EXISTS pe_contratos_periodo ON pe_contratos(ponto_id,inicio,fim);
CREATE TABLE IF NOT EXISTS pe_cobrancas (id BIGSERIAL PRIMARY KEY,contrato_id BIGINT REFERENCES pe_contratos(id),pacote_id BIGINT REFERENCES pe_pacotes(id),competencia VARCHAR(7) NOT NULL,vencimento DATE NOT NULL,valor NUMERIC(13,2) NOT NULL CHECK(valor>0),pago NUMERIC(13,2) NOT NULL DEFAULT 0 CHECK(pago>=0),CHECK((contrato_id IS NOT NULL) <> (pacote_id IS NOT NULL)),CHECK(pago<=valor),UNIQUE(contrato_id,competencia),UNIQUE(pacote_id,competencia));
CREATE TABLE IF NOT EXISTS pe_recebimentos (id BIGSERIAL PRIMARY KEY,cobranca_id BIGINT NOT NULL REFERENCES pe_cobrancas(id),data DATE NOT NULL,valor NUMERIC(13,2) NOT NULL CHECK(valor>0),modalidade TEXT NOT NULL,comprovante_id TEXT,observacao TEXT,usuario_id BIGINT REFERENCES usuarios(id),criado_em TIMESTAMPTZ DEFAULT NOW());

ALTER TABLE pe_pontos ADD COLUMN IF NOT EXISTS foto_formato TEXT;

-- V71.6: histórico imutável de alterações financeiras
CREATE TABLE IF NOT EXISTS pe_financeiro_auditoria (
 id BIGSERIAL PRIMARY KEY,
 tipo VARCHAR(30) NOT NULL,
 registro_id BIGINT NOT NULL,
 acao VARCHAR(20) NOT NULL,
 antes JSONB, depois JSONB,
 motivo TEXT,
 usuario_id BIGINT REFERENCES usuarios(id),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pe_financeiro_auditoria_registro ON pe_financeiro_auditoria(tipo,registro_id,criado_em DESC);
