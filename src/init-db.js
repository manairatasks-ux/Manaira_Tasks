require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const { query, get, pool } = require('./db');

async function initDb() {
  // Cria/atualiza as tabelas do banco de dados
  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'schema.sql'),
    'utf8'
  );

  await query(schema);

  // Verifica se já existe algum usuário administrativo
  const userCount = await get(
    'SELECT COUNT(*)::int AS total FROM usuarios'
  );

  // Cria o administrador padrão somente se não existir nenhum usuário
  if (!userCount || userCount.total === 0) {
    const senhaHash = await bcrypt.hash('admin123', 10);

    await query(
      `
        INSERT INTO usuarios (
          nome,
          email,
          senha_hash,
          perfil
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        'Administrador',
        'admin@manaira.com',
        senhaHash,
        'admin'
      ]
    );

    console.log('Usuário administrador inicial criado.');
  }

  console.log('Banco de dados inicializado com sucesso.');
}

if (require.main === module) {
  initDb()
    .then(async () => {
      console.log('Inicialização concluída.');
      await pool.end();
    })
    .catch(async (err) => {
      console.error('Erro ao inicializar banco:', err);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { initDb };