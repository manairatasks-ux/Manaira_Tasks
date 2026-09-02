const service=require('./usuario.service');
function sendError(res,err,msg){ if(err.code==='23505') return res.status(400).json({error:'Já existe um usuário com este email.'}); return res.status(err.status||500).json({error:err.status?err.message:msg,...(err.status?{}:{details:err.message})}); }
async function list(req,res){ try{res.json(await service.list(req.query));}catch(e){sendError(res,e,'Erro ao listar usuários.');}}
async function create(req,res){try{res.status(201).json(await service.create(req.body,req.user));}catch(e){sendError(res,e,'Erro ao criar usuário.');}}
async function update(req,res){try{res.json(await service.update(req.params.id,req.body,req.user));}catch(e){sendError(res,e,'Erro ao atualizar usuário.');}}
async function deactivate(req,res){try{res.json(await service.deactivate(req.params.id,req.user));}catch(e){sendError(res,e,'Erro ao desativar usuário.');}}
module.exports={list,create,update,deactivate};
