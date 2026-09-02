const { get } = require('../../config/database');
async function findActiveByEmail(email){ return get('SELECT * FROM usuarios WHERE email = $1 AND ativo = TRUE',[email]); }
async function findSafeById(id){ return get('SELECT id, nome, email, perfil, administrador_principal, setor_id, pode_receber_tarefas, pode_receber_os FROM usuarios WHERE id = $1',[id]); }
module.exports={findActiveByEmail,findSafeById};
