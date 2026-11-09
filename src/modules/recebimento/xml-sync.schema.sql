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
