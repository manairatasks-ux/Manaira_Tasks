require('dotenv').config();
const { get, query, pool } = require('./db');

async function main() {
  const email = String(process.argv[2] || process.env.ADMIN_PRINCIPAL_EMAIL || '').trim().toLowerCase();
  if (!email) throw new Error('Informe o email: npm run definir-admin-principal -- seu@email.com');
  const usuario = await get('SELECT id, nome, email FROM usuarios WHERE LOWER(email) = $1 AND ativo = TRUE', [email]);
  if (!usuario) throw new Error(`Usuário ativo não encontrado: ${email}`);

  await query('BEGIN');
  try {
    await query(`UPDATE usuarios SET perfil = 'administrador' WHERE administrador_principal = TRUE AND id <> $1`, [usuario.id]);
    await query('UPDATE usuarios SET administrador_principal = FALSE WHERE id <> $1', [usuario.id]);
    await query(`UPDATE usuarios SET administrador_principal = TRUE, perfil = 'administrador_principal' WHERE id = $1`, [usuario.id]);
    await query('UPDATE setores SET proprietario_id = $1 WHERE proprietario_id IS NULL', [usuario.id]);
    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
  console.log(`Administrador Principal definido: ${usuario.nome} <${usuario.email}>`);
  console.log('Setores sem proprietário foram vinculados a esse usuário.');
}

main().catch(err => { console.error('Erro:', err.message); process.exitCode = 1; }).finally(() => pool.end());
