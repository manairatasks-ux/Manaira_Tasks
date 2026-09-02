const bcrypt=require('bcryptjs');
const model=require('./usuario.model');
const {perfilValido,nivelPerfil}=require('../../shared/profile.service');
const {cleanId}=require('../../shared/utils');
const moduloService=require('../modulos/modulo.service');
function fail(message,status=400){ const e=new Error(message); e.status=status; throw e; }
async function list(q){ return model.list(q.tipo||'',q.ativos||'true'); }
async function create(body,current){
 const {nome,email,senha,perfil='colaborador',setor_id,pode_receber_tarefas=true,pode_receber_os=false,ativo=true}=body;
 if(!nome||!email||!senha) fail('Nome, email e senha são obrigatórios.'); if(!perfilValido(perfil)) fail('Perfil inválido.'); if(perfil==='administrador_principal') fail('O Administrador Principal é único e não pode ser criado por esta tela.'); if(nivelPerfil(perfil)>=nivelPerfil(current.perfil)) fail('Você só pode criar usuários de nível inferior ao seu.',403);
 const criado=await model.create({nome:String(nome).trim(),email:String(email).trim().toLowerCase(),senha_hash:await bcrypt.hash(String(senha),10),perfil,setor_id:cleanId(setor_id),pode_receber_tarefas:!!pode_receber_tarefas,pode_receber_os:!!pode_receber_os,ativo:ativo!==false}); await moduloService.seedDefaultForUser(criado.id,perfil); return criado;
}
async function update(id,body,current){ const alvo=await model.byId(id); if(!alvo) fail('Usuário não encontrado.',404); if(alvo.administrador_principal||nivelPerfil(alvo.perfil)>=nivelPerfil(current.perfil)) fail('Você só pode editar usuários de nível inferior ao seu.',403);
 const {nome,email,senha,perfil='colaborador',setor_id,pode_receber_tarefas=true,pode_receber_os=false,ativo=true}=body; if(!nome||!email) fail('Nome e email são obrigatórios.'); if(!perfilValido(perfil)) fail('Perfil inválido.'); if(perfil==='administrador_principal'||nivelPerfil(perfil)>=nivelPerfil(current.perfil)) fail('Você não pode atribuir um nível igual ou superior ao seu.',403);
 const senha_hash=senha&&String(senha).trim()?await bcrypt.hash(String(senha),10):alvo.senha_hash;
 return model.update(id,{nome:String(nome).trim(),email:String(email).trim().toLowerCase(),senha_hash,perfil,setor_id:cleanId(setor_id),pode_receber_tarefas:!!pode_receber_tarefas,pode_receber_os:!!pode_receber_os,ativo:ativo!==false}); }
async function deactivate(id,current){ if(String(id)===String(current.id)) fail('Você não pode desativar o próprio usuário.'); const alvo=await model.byId(id); if(!alvo) fail('Usuário não encontrado.',404); if(alvo.administrador_principal||nivelPerfil(alvo.perfil)>=nivelPerfil(current.perfil)) fail('Você só pode desativar usuários de nível inferior ao seu.',403); await model.deactivate(id); return {ok:true}; }
module.exports={list,create,update,deactivate};
