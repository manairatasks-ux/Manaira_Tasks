require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { query, get, pool } = require('./db');

function nullIfEmpty(value) {
  return value === '' || value === undefined ? null : value;
}

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await query(schema);

  const userCount = await get('SELECT COUNT(*)::int AS total FROM usuarios');
  if (!userCount || userCount.total === 0) {
    const senhaHash = await bcrypt.hash('admin123', 10);
    await query(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4)',
      ['Administrador', 'admin@manaira.com', senhaHash, 'admin']
    );
  }

  const setorCount = await get('SELECT COUNT(*)::int AS total FROM setores');
  if (!setorCount || setorCount.total === 0) {
    const setor = await get(
      'INSERT INTO setores (nome, descricao, cor) VALUES ($1, $2, $3) RETURNING *',
      ['Abastecimento loja', 'Organização operacional, execução e acompanhamento de tarefas.', '#2563eb']
    );

    const g1 = await get(
      'INSERT INTO grupos (setor_id, nome, cor, ordem) VALUES ($1, $2, $3, $4) RETURNING *',
      [setor.id, 'Prioridades da semana', '#2563eb', 1]
    );
    const g2 = await get(
      'INSERT INTO grupos (setor_id, nome, cor, ordem) VALUES ($1, $2, $3, $4) RETURNING *',
      [setor.id, 'Projetos e melhorias', '#e11d48', 2]
    );

    await query(`INSERT INTO tarefas
      (grupo_id, titulo, responsavel, status, prioridade, prazo, cronograma_inicio, cronograma_fim, observacoes, ordem)
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10),
      ($11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [
        g1.id, 'Analisar promotores por corredor', 'Gerente', 'Não iniciado', 'Média', nullIfEmpty('2026-06-30'), nullIfEmpty('2026-06-01'), nullIfEmpty('2026-06-30'), 'Mapear empresas, promotores e responsabilidades por setor.', 1,
        g2.id, 'Desenvolver sistema de tarefas', 'Leonardo', 'Em andamento', 'Alta', nullIfEmpty('2026-07-20'), nullIfEmpty('2026-06-01'), nullIfEmpty('2026-07-20'), 'Base estilo Monday para gestão interna do Manaíra.', 2
      ]);
    }
}

if (require.main === module) {
  initDb()
    .then(async () => {
      console.log('Banco inicializado com sucesso.');
      await pool.end();
    })
    .catch(async (err) => {
      console.error('Erro ao inicializar banco:', err);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { initDb };
