CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  perfil VARCHAR(30) DEFAULT 'colaborador',
  setor_id INTEGER,
  pode_receber_tarefas BOOLEAN DEFAULT TRUE,
  pode_receber_os BOOLEAN DEFAULT FALSE,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS setores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT,
  cor VARCHAR(20) DEFAULT '#2563eb',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grupos (
  id SERIAL PRIMARY KEY,
  setor_id INTEGER NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  nome VARCHAR(120) NOT NULL,
  cor VARCHAR(20) DEFAULT '#2563eb',
  ordem INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tarefas (
  id SERIAL PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  responsavel VARCHAR(120),
  responsavel_id INTEGER REFERENCES usuarios(id),
  status VARCHAR(40) DEFAULT 'Não iniciado',
  prioridade VARCHAR(40) DEFAULT 'Média',
  prazo DATE,
  cronograma_inicio DATE,
  cronograma_fim DATE,
  observacoes TEXT,
  ordem INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comentarios (
  id SERIAL PRIMARY KEY,
  tarefa_id INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id),
  comentario TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_grupos_setor ON grupos(setor_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_grupo ON tarefas(grupo_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_tarefa ON comentarios(tarefa_id);


-- Módulo: Ordem de Serviço Operacional
CREATE TABLE IF NOT EXISTS ordens_servico (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(30) UNIQUE,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  solicitante VARCHAR(120),
  setor_local VARCHAR(160),
  categoria VARCHAR(60) DEFAULT 'Outros',
  prioridade VARCHAR(40) DEFAULT 'Média',
  impacto VARCHAR(120),
  status VARCHAR(60) DEFAULT 'Recebido',
  responsavel_principal VARCHAR(120),
  responsavel_principal_id INTEGER REFERENCES usuarios(id),
  funcionarios TEXT,
  quantidade_mao_obra INTEGER DEFAULT 1,
  tempo_estimado_min INTEGER DEFAULT 0,
  tempo_real_min INTEGER DEFAULT 0,
  previsao_conclusao TIMESTAMP,
  data_inicio TIMESTAMP,
  data_conclusao TIMESTAMP,
  material_necessario TEXT,
  material_utilizado TEXT,
  pendencias TEXT,
  execucao TEXT,
  observacao_conclusao TEXT,
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_os_status ON ordens_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_prioridade ON ordens_servico(prioridade);
CREATE INDEX IF NOT EXISTS idx_os_criado_em ON ordens_servico(criado_em);


-- Migrações V9 - usuários, permissões e responsáveis vinculados
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES setores(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_receber_tarefas BOOLEAN DEFAULT TRUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pode_receber_os BOOLEAN DEFAULT FALSE;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS responsavel_principal_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

-- Migração: separar o local exato da descrição da OS
ALTER TABLE ordens_servico
ADD COLUMN IF NOT EXISTS local_exato TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_usuarios_setor ON usuarios(setor_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel_id ON tarefas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_os_responsavel_principal_id ON ordens_servico(responsavel_principal_id);


-- Migrações V11 - hierarquia, propriedade e compartilhamento de setores
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS administrador_principal BOOLEAN DEFAULT FALSE;
ALTER TABLE setores ADD COLUMN IF NOT EXISTS proprietario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS setor_compartilhamentos (
  id SERIAL PRIMARY KEY,
  setor_id INTEGER NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permissao VARCHAR(30) NOT NULL DEFAULT 'visualizar',
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(setor_id, usuario_id),
  CONSTRAINT chk_setor_permissao CHECK (permissao IN ('visualizar','criar','editar','gerenciar'))
);

CREATE INDEX IF NOT EXISTS idx_setores_proprietario ON setores(proprietario_id);
CREATE INDEX IF NOT EXISTS idx_setor_comp_usuario ON setor_compartilhamentos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_setor_comp_setor ON setor_compartilhamentos(setor_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_criado_por ON tarefas(criado_por);

-- Normaliza perfis antigos.
UPDATE usuarios SET perfil = 'administrador' WHERE LOWER(perfil) = 'admin';

-- Garante um administrador principal quando o banco ainda não possui um.
-- Dá preferência ao antigo administrador padrão e, depois, ao administrador mais antigo.
UPDATE usuarios
SET administrador_principal = TRUE,
    perfil = 'administrador_principal'
WHERE id = COALESCE(
  (SELECT id FROM usuarios WHERE LOWER(email) = 'admin@manaira.com' AND ativo = TRUE ORDER BY id LIMIT 1),
  (SELECT id FROM usuarios WHERE perfil = 'administrador' AND ativo = TRUE ORDER BY criado_em ASC, id ASC LIMIT 1),
  (SELECT id FROM usuarios WHERE ativo = TRUE ORDER BY criado_em ASC, id ASC LIMIT 1)
)
AND NOT EXISTS (SELECT 1 FROM usuarios WHERE administrador_principal = TRUE);

UPDATE usuarios SET perfil = 'administrador_principal' WHERE administrador_principal = TRUE;

-- Setores antigos passam inicialmente ao administrador principal.
UPDATE setores
SET proprietario_id = (SELECT id FROM usuarios WHERE administrador_principal = TRUE ORDER BY id LIMIT 1)
WHERE proprietario_id IS NULL;

-- Tarefas antigas recebem como criador o proprietário atual do setor.
UPDATE tarefas t
SET criado_por = s.proprietario_id
FROM grupos g
JOIN setores s ON s.id = g.setor_id
WHERE t.grupo_id = g.id AND t.criado_por IS NULL;


-- Reforços de integridade V11.1
ALTER TABLE usuarios ALTER COLUMN perfil SET DEFAULT 'colaborador';

-- Mantém somente um Administrador Principal caso uma migração antiga tenha duplicado a marcação.
WITH principal_mantido AS (
  SELECT id FROM usuarios
  WHERE administrador_principal = TRUE
  ORDER BY CASE WHEN perfil = 'administrador_principal' THEN 0 ELSE 1 END, id
  LIMIT 1
)
UPDATE usuarios
SET administrador_principal = FALSE,
    perfil = CASE WHEN perfil = 'administrador_principal' THEN 'administrador' ELSE perfil END
WHERE administrador_principal = TRUE
  AND id <> COALESCE((SELECT id FROM principal_mantido), -1);

CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_admin_principal_unico
ON usuarios (administrador_principal)
WHERE administrador_principal = TRUE;


-- V14: controle de acesso por módulo
CREATE TABLE IF NOT EXISTS modulos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuario_modulos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, modulo_id)
);

CREATE INDEX IF NOT EXISTS idx_usuario_modulos_usuario ON usuario_modulos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_modulos_modulo ON usuario_modulos(modulo_id);

-- V15: módulo básico de Almoxarifado
CREATE TABLE IF NOT EXISTS almox_itens (
  id SERIAL PRIMARY KEY,
  descricao VARCHAR(180) NOT NULL,
  categoria VARCHAR(100),
  codigo_patrimonio VARCHAR(100),
  unidade VARCHAR(20) NOT NULL DEFAULT 'UND',
  observacao TEXT,
  quantidade_atual INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_atual >= 0),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_almox_itens_descricao ON almox_itens(descricao);
CREATE INDEX IF NOT EXISTS idx_almox_itens_categoria ON almox_itens(categoria);
CREATE INDEX IF NOT EXISTS idx_almox_itens_patrimonio ON almox_itens(codigo_patrimonio);

CREATE TABLE IF NOT EXISTS almox_movimentacoes (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES almox_itens(id) ON DELETE RESTRICT,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  destino VARCHAR(160),
  responsavel VARCHAR(160),
  observacao TEXT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  saldo_anterior INTEGER NOT NULL,
  saldo_posterior INTEGER NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_almox_mov_item ON almox_movimentacoes(item_id);
CREATE INDEX IF NOT EXISTS idx_almox_mov_tipo ON almox_movimentacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_almox_mov_data ON almox_movimentacoes(criado_em DESC);


-- V62: catálogo único com variações. O item legado permanece como fonte do saldo
-- e das movimentações; cada variação aponta para exatamente um item existente.
CREATE TABLE IF NOT EXISTS almox_produtos (
 id SERIAL PRIMARY KEY,
 descricao VARCHAR(180) NOT NULL,
 categoria VARCHAR(100),
 unidade VARCHAR(20) NOT NULL DEFAULT 'UND',
 observacao TEXT,
 ativo BOOLEAN NOT NULL DEFAULT TRUE,
 criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_almox_produtos_nome_categoria
 ON almox_produtos (LOWER(TRIM(descricao)), LOWER(TRIM(COALESCE(categoria,''))));
CREATE TABLE IF NOT EXISTS almox_variacoes (
 id SERIAL PRIMARY KEY,
 produto_id INTEGER NOT NULL REFERENCES almox_produtos(id) ON DELETE RESTRICT,
 item_id INTEGER NOT NULL UNIQUE REFERENCES almox_itens(id) ON DELETE RESTRICT,
 atributos JSONB NOT NULL DEFAULT '{}'::jsonb,
 rotulo VARCHAR(160) NOT NULL DEFAULT 'Padrão',
 criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(produto_id, rotulo)
);
CREATE INDEX IF NOT EXISTS idx_almox_variacoes_produto ON almox_variacoes(produto_id);

-- V16: módulo Galpão - migração do antigo sistema Python/SQLite
CREATE TABLE IF NOT EXISTS galpao_produtos (
  id SERIAL PRIMARY KEY,
  codigo_barra VARCHAR(80) NOT NULL UNIQUE,
  descricao VARCHAR(220) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_galpao_produtos_descricao ON galpao_produtos(descricao);

CREATE TABLE IF NOT EXISTS galpao_estoque (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER NOT NULL REFERENCES galpao_produtos(id) ON DELETE RESTRICT,
  validade DATE,
  unidades_por_embalagem INTEGER NOT NULL DEFAULT 1 CHECK (unidades_por_embalagem > 0),
  quantidade INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_galpao_estoque_lote
ON galpao_estoque (produto_id, COALESCE(validade, DATE '0001-01-01'), unidades_por_embalagem);
CREATE INDEX IF NOT EXISTS idx_galpao_estoque_produto ON galpao_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_galpao_estoque_validade ON galpao_estoque(validade);

CREATE TABLE IF NOT EXISTS galpao_movimentacoes (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER NOT NULL REFERENCES galpao_produtos(id) ON DELETE RESTRICT,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA','SAIDA')),
  validade DATE,
  unidades_por_embalagem INTEGER NOT NULL DEFAULT 1 CHECK (unidades_por_embalagem > 0),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  data_movimento DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao TEXT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  saldo_anterior INTEGER,
  saldo_posterior INTEGER,
  origem VARCHAR(20) NOT NULL DEFAULT 'WEB',
  legacy_id INTEGER,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_galpao_mov_produto ON galpao_movimentacoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_galpao_mov_data ON galpao_movimentacoes(data_movimento DESC);
CREATE INDEX IF NOT EXISTS idx_galpao_mov_tipo ON galpao_movimentacoes(tipo);
CREATE UNIQUE INDEX IF NOT EXISTS ux_galpao_mov_legacy
ON galpao_movimentacoes(origem,tipo,legacy_id) WHERE legacy_id IS NOT NULL;


-- V41: estorno auditado de movimentações WEB por até 24 horas.
ALTER TABLE galpao_movimentacoes ADD COLUMN IF NOT EXISTS estornado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE galpao_movimentacoes ADD COLUMN IF NOT EXISTS estornado_em TIMESTAMP;
ALTER TABLE galpao_movimentacoes ADD COLUMN IF NOT EXISTS estornado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE galpao_movimentacoes ADD COLUMN IF NOT EXISTS motivo_estorno TEXT;
CREATE INDEX IF NOT EXISTS idx_galpao_mov_estornado ON galpao_movimentacoes(estornado);

-- V44: ajustes auditados de estoque e correções de validade.
CREATE TABLE IF NOT EXISTS galpao_ajustes (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER NOT NULL REFERENCES galpao_produtos(id) ON DELETE RESTRICT,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('QUANTIDADE','VALIDADE')),
  validade_anterior DATE,
  validade_nova DATE,
  unidades_por_embalagem INTEGER NOT NULL DEFAULT 1 CHECK (unidades_por_embalagem > 0),
  quantidade_movida INTEGER,
  saldo_anterior INTEGER,
  saldo_posterior INTEGER,
  motivo VARCHAR(120) NOT NULL,
  observacao TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_galpao_ajustes_produto ON galpao_ajustes(produto_id);
CREATE INDEX IF NOT EXISTS idx_galpao_ajustes_criado ON galpao_ajustes(criado_em DESC);

CREATE TABLE IF NOT EXISTS galpao_importacoes (
  id SERIAL PRIMARY KEY,
  nome_arquivo VARCHAR(255),
  arquivo_hash VARCHAR(64) NOT NULL,
  produtos_importados INTEGER NOT NULL DEFAULT 0,
  estoque_importado INTEGER NOT NULL DEFAULT 0,
  entradas_importadas INTEGER NOT NULL DEFAULT 0,
  saidas_importadas INTEGER NOT NULL DEFAULT 0,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_galpao_import_hash ON galpao_importacoes(arquivo_hash);


-- V17: Módulo RH - Chamados e Solicitações
CREATE TABLE IF NOT EXISTS rh_tipos_solicitacao (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(140) UNIQUE NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rh_solicitacoes (
  id SERIAL PRIMARY KEY,
  protocolo VARCHAR(30) UNIQUE,
  tipo_id INTEGER NOT NULL REFERENCES rh_tipos_solicitacao(id),
  solicitante_nome VARCHAR(160) NOT NULL,
  identificacao VARCHAR(80),
  contato VARCHAR(160),
  descricao TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Recebido',
  prioridade VARCHAR(30) NOT NULL DEFAULT 'Normal',
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  origem VARCHAR(20) NOT NULL DEFAULT 'PUBLICO',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluido_em TIMESTAMP,
  CONSTRAINT chk_rh_status CHECK (status IN ('Recebido','Em análise','Aguardando colaborador','Em andamento','Concluído','Cancelado')),
  CONSTRAINT chk_rh_prioridade CHECK (prioridade IN ('Baixa','Normal','Alta','Urgente')),
  CONSTRAINT chk_rh_origem CHECK (origem IN ('PUBLICO','INTERNO'))
);

CREATE TABLE IF NOT EXISTS rh_solicitacao_interacoes (
  id SERIAL PRIMARY KEY,
  solicitacao_id INTEGER NOT NULL REFERENCES rh_solicitacoes(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  autor_nome VARCHAR(160),
  mensagem TEXT NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'COMENTARIO',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_rh_interacao_tipo CHECK (tipo IN ('EVENTO','COMENTARIO'))
);

CREATE INDEX IF NOT EXISTS idx_rh_solicitacoes_status ON rh_solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_rh_solicitacoes_tipo ON rh_solicitacoes(tipo_id);
CREATE INDEX IF NOT EXISTS idx_rh_solicitacoes_responsavel ON rh_solicitacoes(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_rh_solicitacoes_criado_em ON rh_solicitacoes(criado_em);
CREATE INDEX IF NOT EXISTS idx_rh_interacoes_solicitacao ON rh_solicitacao_interacoes(solicitacao_id);


-- V20: Agenda e detalhamento de atividades
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS descricao TEXT DEFAULT '';
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS local_atividade VARCHAR(180) DEFAULT '';
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS categoria VARCHAR(100) DEFAULT '';
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS link_referencia TEXT DEFAULT '';
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS horario_inicio TIME;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS horario_fim TIME;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS recorrencia VARCHAR(40) DEFAULT 'Nenhuma';
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS exigir_comprovacao BOOLEAN DEFAULT FALSE;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS checklist TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS lembretes_agenda (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT DEFAULT '',
  data DATE NOT NULL,
  horario_inicio TIME,
  horario_fim TIME,
  setor_id INTEGER REFERENCES setores(id) ON DELETE CASCADE,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  visibilidade VARCHAR(30) NOT NULL DEFAULT 'setor',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lembretes_agenda_data ON lembretes_agenda(data);
CREATE INDEX IF NOT EXISTS idx_lembretes_agenda_setor ON lembretes_agenda(setor_id);

CREATE TABLE IF NOT EXISTS tarefa_historico (
  id SERIAL PRIMARY KEY,
  tarefa_id INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  acao VARCHAR(120) NOT NULL,
  detalhes TEXT DEFAULT '',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tarefa_historico_tarefa ON tarefa_historico(tarefa_id);

-- V21 - índices para agenda/dashboard
CREATE INDEX IF NOT EXISTS idx_tarefas_prazo ON tarefas(prazo);
CREATE INDEX IF NOT EXISTS idx_tarefas_status_prazo ON tarefas(status, prazo);
CREATE INDEX IF NOT EXISTS idx_tarefas_atualizado_em ON tarefas(atualizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_lembretes_criado_por_data ON lembretes_agenda(criado_por, data);

-- V45 - histórico local e sincronização inteligente de vendas GZ
CREATE TABLE IF NOT EXISTS gz_produtos_monitorados (
  codigo_produto VARCHAR(40) PRIMARY KEY,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_sucesso TIMESTAMPTZ,
  ultimo_erro TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE gz_produtos_monitorados ADD COLUMN IF NOT EXISTS situacao_gz VARCHAR(20);
ALTER TABLE gz_produtos_monitorados ADD COLUMN IF NOT EXISTS ultimo_status_em TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS gz_vendas_diarias (
  id BIGSERIAL PRIMARY KEY,
  loja INTEGER NOT NULL DEFAULT 1,
  codigo_produto VARCHAR(40) NOT NULL,
  data_movimento DATE NOT NULL,
  quantidade_vendida NUMERIC(18,3) NOT NULL DEFAULT 0,
  valor_venda NUMERIC(18,2),
  origem VARCHAR(30) NOT NULL DEFAULT 'API_GZ',
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(loja,codigo_produto,data_movimento)
);
CREATE INDEX IF NOT EXISTS idx_gz_vendas_produto_data ON gz_vendas_diarias(codigo_produto,data_movimento);
CREATE TABLE IF NOT EXISTS gz_sync_execucoes (
  id BIGSERIAL PRIMARY KEY, tipo VARCHAR(20) NOT NULL, status VARCHAR(40) NOT NULL,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), finalizado_em TIMESTAMPTZ,
  itens_processados INTEGER NOT NULL DEFAULT 0, erros INTEGER NOT NULL DEFAULT 0,
  mensagem TEXT, usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS gz_sync_ocorrencias (
  id BIGSERIAL PRIMARY KEY, execucao_id BIGINT REFERENCES gz_sync_execucoes(id) ON DELETE SET NULL,
  codigo_produto VARCHAR(40), data_movimento DATE, tipo VARCHAR(30) NOT NULL,
  mensagem TEXT NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- V49 - métricas de diagnóstico da sincronização GZ
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS chamadas_produtos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS chamadas_movimento INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS tempo_produtos_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS tempo_movimento_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS tempo_espera_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS api_min_ms INTEGER;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS api_max_ms INTEGER;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS api_media_ms INTEGER;


-- V51 - trava global, parada manual, velocidade adaptativa e logs persistentes
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS parada_solicitada BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS heartbeat_em TIMESTAMPTZ;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS http_200 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS http_204 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS http_429 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS http_5xx INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS time_outs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS retries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS backoffs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS intervalo_final_ms INTEGER;
CREATE TABLE IF NOT EXISTS gz_sync_api_logs (
  id BIGSERIAL PRIMARY KEY, execucao_id BIGINT REFERENCES gz_sync_execucoes(id) ON DELETE CASCADE,
  rota VARCHAR(60) NOT NULL, codigo_produto VARCHAR(40), data_movimento DATE,
  http_status INTEGER, latencia_ms INTEGER NOT NULL DEFAULT 0, tentativa INTEGER NOT NULL DEFAULT 1,
  intervalo_ms INTEGER NOT NULL DEFAULT 0, erro TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gz_sync_api_logs_exec ON gz_sync_api_logs(execucao_id,id DESC);


-- V52 - fotografia completa do catálogo GZ, classificação ativo/inativo e histórico de cadastros
CREATE TABLE IF NOT EXISTS gz_catalogo_produtos (
  codigo_produto VARCHAR(40) PRIMARY KEY,
  codigo_ean VARCHAR(60),
  descricao VARCHAR(500),
  situacao VARCHAR(30) NOT NULL DEFAULT 'DESCONHECIDO',
  quantidade_estoque NUMERIC(18,3),
  data_cadastro DATE,
  unidade VARCHAR(30),
  loja VARCHAR(30),
  departamento VARCHAR(120),
  grupo VARCHAR(120),
  marca VARCHAR(120),
  setor VARCHAR(120),
  primeiro_visto_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_visto_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_mudanca_status_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gz_catalogo_situacao ON gz_catalogo_produtos(situacao);
CREATE INDEX IF NOT EXISTS idx_gz_catalogo_data_cadastro ON gz_catalogo_produtos(data_cadastro);
CREATE INDEX IF NOT EXISTS idx_gz_catalogo_ultimo_visto ON gz_catalogo_produtos(ultimo_visto_em DESC);

CREATE TABLE IF NOT EXISTS gz_catalogo_eventos (
  id BIGSERIAL PRIMARY KEY,
  execucao_id BIGINT REFERENCES gz_sync_execucoes(id) ON DELETE SET NULL,
  codigo_produto VARCHAR(40) NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  situacao_anterior VARCHAR(30),
  situacao_nova VARCHAR(30),
  data_evento DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gz_catalogo_eventos_data ON gz_catalogo_eventos(data_evento DESC,tipo);
CREATE INDEX IF NOT EXISTS idx_gz_catalogo_eventos_codigo ON gz_catalogo_eventos(codigo_produto,criado_em DESC);

CREATE TABLE IF NOT EXISTS gz_produtos_cadastrados (
  codigo_produto VARCHAR(40) PRIMARY KEY,
  codigo_ean VARCHAR(60),
  descricao VARCHAR(500),
  data_cadastro_gz DATE NOT NULL,
  situacao_ao_detectar VARCHAR(30),
  detectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gz_produtos_cadastrados_data ON gz_produtos_cadastrados(data_cadastro_gz DESC);

ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS catalogo_http INTEGER;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS catalogo_tempo_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS catalogo_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS catalogo_ativos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS catalogo_inativos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS catalogo_desconhecidos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS catalogo_novos_hoje INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS catalogo_reativados INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gz_sync_execucoes ADD COLUMN IF NOT EXISTS catalogo_inativados INTEGER NOT NULL DEFAULT 0;
