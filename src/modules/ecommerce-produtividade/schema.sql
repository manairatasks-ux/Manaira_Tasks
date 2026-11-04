-- V73: dados consolidados dos relatórios VIP. Tabelas independentes e migração idempotente.
CREATE TABLE IF NOT EXISTS ep_usuarios (
 vip_id INTEGER PRIMARY KEY CHECK (vip_id>0), nome TEXT NOT NULL,
 categoria VARCHAR(25) NOT NULL DEFAULT 'separador' CHECK (categoria IN ('separador','operacional','desconsiderado')),
 observacao TEXT NOT NULL DEFAULT '', atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ep_importacoes (
 id BIGSERIAL PRIMARY KEY, inicio DATE NOT NULL, fim DATE NOT NULL,
 arquivo_nome TEXT NOT NULL, hash_sha256 CHAR(64) NOT NULL,
 registros INTEGER NOT NULL, criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(fim>=inicio), UNIQUE(inicio,fim)
);
CREATE INDEX IF NOT EXISTS ep_importacoes_datas_idx ON ep_importacoes(inicio,fim);
CREATE TABLE IF NOT EXISTS ep_metricas (
 importacao_id BIGINT NOT NULL REFERENCES ep_importacoes(id) ON DELETE CASCADE,
 vip_id INTEGER NOT NULL REFERENCES ep_usuarios(vip_id), nome_original TEXT NOT NULL,
 compras INTEGER NOT NULL CHECK(compras>=0), produtos INTEGER NOT NULL CHECK(produtos>=0),
 itens INTEGER NOT NULL CHECK(itens>=0),
 segundos_total BIGINT NOT NULL CHECK(segundos_total>=0),
 segundos_compra BIGINT NOT NULL CHECK(segundos_compra>=0),
 segundos_produto BIGINT NOT NULL CHECK(segundos_produto>=0),
 segundos_item BIGINT NOT NULL CHECK(segundos_item>=0),
 PRIMARY KEY (importacao_id,vip_id)
);
INSERT INTO ep_usuarios(vip_id,nome,categoria,observacao) VALUES
 (9,'Mateus Reis','desconsiderado','Exclusão fixa de produtividade'),
 (52,'Imprimir Selo','desconsiderado','Exclusão fixa de produtividade')
ON CONFLICT (vip_id) DO UPDATE SET categoria='desconsiderado';
