const service=require('./auth.service');
async function login(req,res){ try{ res.json(await service.login(req.body.email,req.body.senha)); }catch(err){ res.status(err.status||500).json({error:err.status?err.message:'Erro ao fazer login.',...(err.status?{}:{details:err.message})}); } }
async function me(req,res){ try{ res.json(await service.me(req.user.id)); }catch(err){ res.status(500).json({error:'Erro ao buscar usuário.',details:err.message}); } }
module.exports={login,me};
