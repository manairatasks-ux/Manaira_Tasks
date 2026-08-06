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
