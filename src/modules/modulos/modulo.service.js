const model = require('./modulo.model');
const { nivelPerfil, isPrincipal } = require('../../shared/profile.service');

const CODIGOS_VALIDOS = new Set(['atividades', 'os', 'administracao']);

function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function principalUser(user) { return String(user?.perfil || '').toLowerCase() === 'administrador_principal' || user?.administrador_principal === true; }

async function myModules(user) {
  if (principalUser(user)) return (await model.listActive()).map(m => m.codigo);
  return model.userModuleCodes(user.id);
}

async function adminData(current) {
  const [modulos, usuarios] = await Promise.all([model.listActive(), model.usersWithAccess()]);
  return { modulos, usuarios, pode_alterar_administracao: principalUser(current) };
}

async function updateUserModules(targetId, codigos, current) {
  const alvo = await model.userById(targetId);
  if (!alvo) fail('Usuário não encontrado.', 404);
  if (alvo.administrador_principal || alvo.perfil === 'administrador_principal') fail('Os módulos do Administrador Principal são permanentes.', 403);
  if (nivelPerfil(alvo.perfil) >= nivelPerfil(current.perfil)) fail('Você só pode alterar acessos de usuários de nível inferior ao seu.', 403);

  const normalizados = [...new Set((Array.isArray(codigos) ? codigos : []).map(v => String(v).toLowerCase()).filter(v => CODIGOS_VALIDOS.has(v)))];

  // O módulo de OS e a Administração mantêm a hierarquia operacional existente da plataforma.
  if (nivelPerfil(alvo.perfil) < 2 && normalizados.some(c => c === 'os' || c === 'administracao')) {
    fail('Colaboradores podem receber tarefas/OS, mas o painel completo de OS e a Administração exigem perfil de Encarregado ou superior.', 400);
  }

  const atuais = await model.userModuleCodes(alvo.id);
  const querMudarAdmin = atuais.includes('administracao') !== normalizados.includes('administracao');
  if (querMudarAdmin && !principalUser(current)) {
    fail('Somente o Administrador Principal pode conceder ou remover acesso ao módulo Administração.', 403);
  }

  await model.replaceUserModules(alvo.id, normalizados);
  return { ok: true, usuario_id: alvo.id, modulos: normalizados };
}

async function seedDefaultForUser(usuarioId, perfil) { return model.seedDefaultForUser(usuarioId, perfil); }

module.exports = { myModules, adminData, updateUserModules, seedDefaultForUser };
