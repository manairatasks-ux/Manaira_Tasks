-- V72.0: Manaíra Rotas — tabelas isoladas, migração aditiva.
CREATE TABLE IF NOT EXISTS mr_config (
 id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
 nome_origem text NOT NULL DEFAULT 'Supermercado Manaíra',
 endereco_origem text NOT NULL DEFAULT '',
 lat double precision,
 lon double precision,
 updated_at timestamptz NOT NULL DEFAULT NOW(),
 CHECK(lat IS NULL OR lat BETWEEN -90 AND 90),
 CHECK(lon IS NULL OR lon BETWEEN -180 AND 180)
);
INSERT INTO mr_config(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS mr_pedidos (
 id bigserial PRIMARY KEY,
 numero text NOT NULL UNIQUE,
 cliente text NOT NULL DEFAULT '',
 cep varchar(8) NOT NULL DEFAULT '',
 rua text NOT NULL,
 numero_endereco text NOT NULL,
 bairro text NOT NULL DEFAULT '',
 complemento text NOT NULL DEFAULT '',
 cidade text NOT NULL DEFAULT 'João Pessoa',
 uf char(2) NOT NULL DEFAULT 'PB',
 lat double precision,
 lon double precision,
 geo_status varchar(24) NOT NULL DEFAULT 'pendente',
 status varchar(28) NOT NULL DEFAULT 'preparando',
 observacao text NOT NULL DEFAULT '',
 prazo timestamptz,
 criado_por integer REFERENCES usuarios(id) ON DELETE SET NULL,
 criado_em timestamptz NOT NULL DEFAULT NOW(),
 atualizado_em timestamptz NOT NULL DEFAULT NOW(),
 CHECK(status IN ('preparando','pronto','em_rota','entregue','nao_entregue','cancelado')),
 CHECK(lat IS NULL OR lat BETWEEN -90 AND 90),
 CHECK(lon IS NULL OR lon BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS mr_pedidos_status_idx ON mr_pedidos(status);
CREATE TABLE IF NOT EXISTS mr_viagens (
 id bigserial PRIMARY KEY,
 entregador_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
 veiculo varchar(10) NOT NULL DEFAULT 'moto',
 status varchar(20) NOT NULL DEFAULT 'planejada',
 origem_nome text NOT NULL,
 origem_endereco text NOT NULL,
 origem_lat double precision NOT NULL,
 origem_lon double precision NOT NULL,
 distancia_metros integer,
 duracao_segundos integer,
 calculo varchar(40) NOT NULL DEFAULT 'estimativa_geografica',
 iniciado_em timestamptz,
 encerrado_em timestamptz,
 criado_por integer REFERENCES usuarios(id) ON DELETE SET NULL,
 criado_em timestamptz NOT NULL DEFAULT NOW(),
 CHECK(status IN ('planejada','em_rota','concluida'))
);
CREATE TABLE IF NOT EXISTS mr_paradas (
 id bigserial PRIMARY KEY,
 viagem_id bigint NOT NULL REFERENCES mr_viagens(id) ON DELETE CASCADE,
 pedido_id bigint NOT NULL REFERENCES mr_pedidos(id),
 ordem integer NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'pendente',
 concluida_em timestamptz,
 observacao text NOT NULL DEFAULT '',
 concluida_por integer REFERENCES usuarios(id) ON DELETE SET NULL,
 UNIQUE(viagem_id,ordem),
 CHECK(status IN ('pendente','entregue','nao_entregue'))
);
CREATE INDEX IF NOT EXISTS mr_paradas_viagem_idx ON mr_paradas(viagem_id,ordem);
CREATE INDEX IF NOT EXISTS mr_paradas_pedido_idx ON mr_paradas(pedido_id);
CREATE TABLE IF NOT EXISTS mr_localizacoes (
 viagem_id bigint PRIMARY KEY REFERENCES mr_viagens(id) ON DELETE CASCADE,
 entregador_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
 lat double precision NOT NULL,
 lon double precision NOT NULL,
 precisao_m integer,
 atualizado_em timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS mr_eventos (
 id bigserial PRIMARY KEY,
 entidade varchar(24) NOT NULL,
 registro_id bigint,
 evento varchar(40) NOT NULL,
 usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
 detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
 criado_em timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mr_eventos_criado_idx ON mr_eventos(criado_em DESC);
