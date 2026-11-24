-- V73.4: fila de XMLs encontrados na rede, SEM marcar chegada física automaticamente.
CREATE TABLE IF NOT EXISTS receb_xml_pendentes (
 chave VARCHAR(44) PRIMARY KEY,
 numero VARCHAR(40) NOT NULL,
 serie VARCHAR(15) NOT NULL DEFAULT '',
 fornecedor VARCHAR(160) NOT NULL,
 cnpj_fornecedor VARCHAR(14) NOT NULL,
 cnpj_destinatario VARCHAR(14) NOT NULL,
 valor NUMERIC(14,2) NOT NULL CHECK(valor>0),
 emissao_texto VARCHAR(40) DEFAULT '',
 protocolo VARCHAR(50) DEFAULT '',
 autorizada BOOLEAN NOT NULL DEFAULT FALSE,
 primeiro_sync TIMESTAMPTZ NOT NULL DEFAULT now(),
 ultimo_sync TIMESTAMPTZ NOT NULL DEFAULT now(),
 recebido_em TIMESTAMPTZ,
 recebido_nota_id BIGINT REFERENCES receb_notas(id)
);
CREATE INDEX IF NOT EXISTS receb_xml_pendentes_fornecedor_idx ON receb_xml_pendentes(fornecedor);
CREATE INDEX IF NOT EXISTS receb_xml_pendentes_ultimo_idx ON receb_xml_pendentes(ultimo_sync DESC);

-- V73.5: detalhes opcionais para PDF de conferência de NF-e.
ALTER TABLE receb_xml_pendentes ADD COLUMN IF NOT EXISTS resumo_pdf JSONB;

-- V73.6: retenção do XML original completo da NF-e para DANFE e auditoria.
ALTER TABLE receb_xml_pendentes ADD COLUMN IF NOT EXISTS xml_original TEXT;


-- V74.31: controle conservador de presença/ausência em duas origens.
-- Não retira dados existentes e não transforma um XML em recebimento físico.
ALTER TABLE receb_xml_pendentes ADD COLUMN IF NOT EXISTS presente_principal BOOLEAN;
ALTER TABLE receb_xml_pendentes ADD COLUMN IF NOT EXISTS presente_adicional BOOLEAN;
ALTER TABLE receb_xml_pendentes ADD COLUMN IF NOT EXISTS observado_inventario_em TIMESTAMPTZ;
ALTER TABLE receb_xml_pendentes ADD COLUMN IF NOT EXISTS ultima_conferencia_em TIMESTAMPTZ;
ALTER TABLE receb_xml_pendentes ADD COLUMN IF NOT EXISTS ausente_desde TIMESTAMPTZ;
ALTER TABLE receb_xml_pendentes ADD COLUMN IF NOT EXISTS lancamento_automatico_em TIMESTAMPTZ;
ALTER TABLE receb_xml_pendentes ADD COLUMN IF NOT EXISTS reapareceu_apos_auto BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS receb_xml_pendentes_ausente_idx ON receb_xml_pendentes(ausente_desde) WHERE ausente_desde IS NOT NULL;

ALTER TABLE receb_notas ADD COLUMN IF NOT EXISTS lancamento_origem VARCHAR(16);
-- Todas as notas lançadas antes desta versão foram tratadas manualmente.
UPDATE receb_notas SET lancamento_origem='MANUAL' WHERE status='LANCADA' AND lancamento_origem IS NULL;
-- Eventos do sistema possuem autor NULL, distinto de qualquer colaborador.
ALTER TABLE receb_eventos ALTER COLUMN usuario_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS receb_xml_inventarios (
 ciclo_id UUID PRIMARY KEY,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
 notas_principal INTEGER NOT NULL,
 notas_adicional INTEGER NOT NULL,
 lancadas_automaticamente INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS receb_xml_inventarios_criado_idx ON receb_xml_inventarios(criado_em DESC);
