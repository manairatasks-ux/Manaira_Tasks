-- V74: Scanntech; registros independentes dos módulos existentes.
CREATE TABLE IF NOT EXISTS st_campanhas (
 id BIGSERIAL PRIMARY KEY,
 codigo_scanntech VARCHAR(90), marca VARCHAR(150) NOT NULL,
 titulo VARCHAR(240) NOT NULL DEFAULT '',
 preco_antigo NUMERIC(14,2) NOT NULL CHECK(preco_antigo>=0),
 preco_novo NUMERIC(14,2) NOT NULL CHECK(preco_novo>=0),
 desconto NUMERIC(14,2) NOT NULL CHECK(desconto>=0),
 reembolso NUMERIC(14,2) NOT NULL CHECK(reembolso>=0),
 inicio DATE NOT NULL, fim DATE NOT NULL CHECK(fim>=inicio),
 margem_minima NUMERIC(6,2) NOT NULL DEFAULT 20,
 status VARCHAR(20) NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','ativada','cancelada')),
 placas_colocadas_em TIMESTAMPTZ, placas_retiradas_em TIMESTAMPTZ,
 observacao TEXT NOT NULL DEFAULT '',
 criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS st_itens (
 id BIGSERIAL PRIMARY KEY,
 campanha_id BIGINT NOT NULL REFERENCES st_campanhas(id) ON DELETE CASCADE,
 codigo VARCHAR(24) NOT NULL, descricao_origem TEXT NOT NULL DEFAULT '',
 descricao_gz TEXT, situacao_gz VARCHAR(100),
 preco_gz NUMERIC(14,2), custo_gz NUMERIC(14,2), estoque_gz NUMERIC(16,3),
 encontrado BOOLEAN NOT NULL DEFAULT FALSE,
 incluido BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE(campanha_id,codigo)
);
CREATE INDEX IF NOT EXISTS idx_st_campanhas_datas ON st_campanhas(inicio,fim);
CREATE INDEX IF NOT EXISTS idx_st_campanhas_status ON st_campanhas(status);
CREATE INDEX IF NOT EXISTS idx_st_itens_codigo ON st_itens(codigo);

-- V74.2: preserva itens rejeitados para conferência, sem incluí-los em campanhas ativadas.
ALTER TABLE st_itens ADD COLUMN IF NOT EXISTS incluido BOOLEAN NOT NULL DEFAULT TRUE;

-- V74.4: limite financeiro informado pelo portal, preservando registros existentes.
ALTER TABLE st_campanhas ADD COLUMN IF NOT EXISTS limite_rede NUMERIC(14,2);
