const { query, get, all } = require('../../config/database');

async function listActive() {
  return all(`SELECT id, codigo, nome, descricao, ordem, ativo
              FROM modulos WHERE ativo = TRUE ORDER BY ordem, nome`);
}

async function userModuleCodes(usuarioId) {
  const rows = await all(`SELECT m.codigo
                          FROM usuario_modulos um
                          JOIN modulos m ON m.id = um.modulo_id
                          WHERE um.usuario_id = $1 AND m.ativo = TRUE
                          ORDER BY m.ordem, m.nome`, [usuarioId]);
  return rows.map(r => r.codigo);
}

async function hasAccess(usuarioId, codigo) {
  return !!(await get(`SELECT 1
                       FROM usuario_modulos um
                       JOIN modulos m ON m.id = um.modulo_id
                       WHERE um.usuario_id = $1 AND m.codigo = $2 AND m.ativo = TRUE`, [usuarioId, codigo]));
}

async function userById(id) {
  return get(`SELECT id, nome, email, perfil, administrador_principal, ativo
              FROM usuarios WHERE id = $1`, [id]);
}

async function usersWithAccess() {
  return all(`SELECT u.id, u.nome, u.email, u.perfil, u.administrador_principal, u.ativo,
                     COALESCE(array_agg(m.codigo ORDER BY m.ordem) FILTER (WHERE m.codigo IS NOT NULL), ARRAY[]::varchar[]) AS modulos
              FROM usuarios u
              LEFT JOIN usuario_modulos um ON um.usuario_id = u.id
              LEFT JOIN modulos m ON m.id = um.modulo_id AND m.ativo = TRUE
              GROUP BY u.id
              ORDER BY u.ativo DESC, u.nome`);
}

async function replaceUserModules(usuarioId, codigos) {
  await query('DELETE FROM usuario_modulos WHERE usuario_id = $1', [usuarioId]);
  if (!codigos.length) return;
  await query(`INSERT INTO usuario_modulos (usuario_id, modulo_id)
               SELECT $1, id FROM modulos
               WHERE ativo = TRUE AND codigo = ANY($2::varchar[])
               ON CONFLICT DO NOTHING`, [usuarioId, codigos]);
}

async function seedDefaultForUser(usuarioId, perfil) {
  const p = String(perfil || '').toLowerCase();
  const codigos = ['atividades'];
  if (['administrador_principal','administrador','gerente','encarregado'].includes(p)) {
    codigos.push('os', 'administracao');
  }
  await replaceUserModules(usuarioId, codigos);
  return codigos;
}

module.exports = { listActive, userModuleCodes, hasAccess, userById, usersWithAccess, replaceUserModules, seedDefaultForUser };
