-- V74.29 - solicitacoes de boletos para Online e Financeiro; estrutura multi-origem.
CREATE TABLE IF NOT EXISTS sb_solicitacoes (
 id BIGSERIAL PRIMARY KEY,
 setor_origem TEXT NOT NULL DEFAULT 'online',
 tipo TEXT NOT NULL DEFAULT 'emissao_boleto',
 cliente TEXT NOT NULL,
 numero_cupom TEXT NOT NULL,
 valor NUMERIC(13,2),
 parcelas INTEGER,
 observacoes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_preparacao','pronto','devolvido','cancelado')),
 criado_por INTEGER NOT NULL REFERENCES usuarios(id),
 responsavel_financeiro INTEGER REFERENCES usuarios(id),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
 atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
 concluido_em TIMESTAMPTZ,
 devolucao_motivo TEXT
);
CREATE INDEX IF NOT EXISTS sb_solicitacoes_status_idx ON sb_solicitacoes(status,criado_em DESC);
CREATE INDEX IF NOT EXISTS sb_solicitacoes_setor_idx ON sb_solicitacoes(setor_origem,criado_em DESC);
CREATE TABLE IF NOT EXISTS sb_documentos (
 id BIGSERIAL PRIMARY KEY,
 solicitacao_id BIGINT NOT NULL REFERENCES sb_solicitacoes(id) ON DELETE CASCADE,
 tipo TEXT NOT NULL CHECK(tipo IN ('cupom','boleto','complementar')),
 nome_original TEXT NOT NULL,
 mime TEXT NOT NULL,
 public_id TEXT NOT NULL,
 formato TEXT NOT NULL,
 resource_type TEXT NOT NULL,
 enviado_por INTEGER NOT NULL REFERENCES usuarios(id),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sb_documentos_solicitacao_idx ON sb_documentos(solicitacao_id);
CREATE TABLE IF NOT EXISTS sb_eventos (
 id BIGSERIAL PRIMARY KEY,
 solicitacao_id BIGINT NOT NULL REFERENCES sb_solicitacoes(id) ON DELETE CASCADE,
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
 acao TEXT NOT NULL,
 detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sb_eventos_solicitacao_idx ON sb_eventos(solicitacao_id,criado_em);
