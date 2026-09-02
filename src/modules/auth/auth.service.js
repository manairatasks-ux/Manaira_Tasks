const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const model=require('./auth.model');
const {jwtSecret}=require('../../config/env');
const moduloService=require('../modulos/modulo.service');
async function login(email,senha){
  if(!email||!senha){ const e=new Error('Informe email e senha.'); e.status=400; throw e; }
  const usuario=await model.findActiveByEmail(email);
  if(!usuario || !(await bcrypt.compare(senha,usuario.senha_hash))){ const e=new Error('Usuário ou senha inválidos.'); e.status=401; throw e; }
  const token=jwt.sign({id:usuario.id,nome:usuario.nome,perfil:usuario.perfil},jwtSecret,{expiresIn:'8h'});
  return {token,usuario:{id:usuario.id,nome:usuario.nome,email:usuario.email,perfil:usuario.perfil}};
}
async function me(id){ const usuario=await model.findSafeById(id); if(!usuario) return usuario; usuario.modulos=await moduloService.myModules(usuario); return usuario; }
module.exports={login,me};
