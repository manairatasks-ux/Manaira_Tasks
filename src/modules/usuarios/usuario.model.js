const {query,get,all}=require('../../config/database');
async function list(tipo='',ativos='true'){
 const filters=[]; if(ativos!=='false') filters.push('u.ativo = TRUE'); if(tipo==='tarefas') filters.push('u.pode_receber_tarefas = TRUE'); if(tipo==='os') filters.push('u.pode_receber_os = TRUE');
 const where=filters.length?`WHERE ${filters.join(' AND ')}`:'';
 return all(`SELECT u.id,u.nome,u.email,u.perfil,u.administrador_principal,u.setor_id,s.nome AS setor_nome,u.pode_receber_tarefas,u.pode_receber_os,u.ativo,u.criado_em FROM usuarios u LEFT JOIN setores s ON s.id=u.setor_id ${where} ORDER BY u.ativo DESC,u.nome`);
}
async function byId(id){ return get('SELECT * FROM usuarios WHERE id=$1',[id]); }
async function create(d){ return get(`INSERT INTO usuarios (nome,email,senha_hash,perfil,setor_id,pode_receber_tarefas,pode_receber_os,ativo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,nome,email,perfil,administrador_principal,setor_id,pode_receber_tarefas,pode_receber_os,ativo,criado_em`,[d.nome,d.email,d.senha_hash,d.perfil,d.setor_id,d.pode_receber_tarefas,d.pode_receber_os,d.ativo]); }
async function update(id,d){ return get(`UPDATE usuarios SET nome=$1,email=$2,senha_hash=$3,perfil=$4,setor_id=$5,pode_receber_tarefas=$6,pode_receber_os=$7,ativo=$8 WHERE id=$9 RETURNING id,nome,email,perfil,administrador_principal,setor_id,pode_receber_tarefas,pode_receber_os,ativo,criado_em`,[d.nome,d.email,d.senha_hash,d.perfil,d.setor_id,d.pode_receber_tarefas,d.pode_receber_os,d.ativo,id]); }
async function deactivate(id){ return query('UPDATE usuarios SET ativo=FALSE WHERE id=$1',[id]); }
module.exports={list,byId,create,update,deactivate};
