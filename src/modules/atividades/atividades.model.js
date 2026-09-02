const db=require('../../config/database');
async function obterAcessoSetor(userId,setorId){ return db.get(`SELECT s.id,s.proprietario_id,CASE WHEN s.proprietario_id=$1 THEN 'proprietario' ELSE sc.permissao END AS permissao FROM setores s LEFT JOIN setor_compartilhamentos sc ON sc.setor_id=s.id AND sc.usuario_id=$1 WHERE s.id=$2 AND (s.proprietario_id=$1 OR sc.usuario_id=$1)`,[userId,setorId]); }
async function setorIdPorGrupo(grupoId){ const r=await db.get('SELECT setor_id FROM grupos WHERE id=$1',[grupoId]); return r?.setor_id||null; }
async function setorIdPorTarefa(tarefaId){ const r=await db.get('SELECT g.setor_id FROM tarefas t JOIN grupos g ON g.id=t.grupo_id WHERE t.id=$1',[tarefaId]); return r?.setor_id||null; }
module.exports={...db,obterAcessoSetor,setorIdPorGrupo,setorIdPorTarefa};
