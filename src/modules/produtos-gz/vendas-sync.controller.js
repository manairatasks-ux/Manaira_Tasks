const sync=require('./vendas-sync.service');
function admin(req,res,next){ if(!['administrador','administrador_principal'].includes(req.user?.perfil)) return res.status(403).json({error:'Acesso restrito a administradores.'}); next(); }
function principal(req,res,next){ if(req.user?.perfil!=='administrador_principal') return res.status(403).json({error:'Vendas em piloto: acesso restrito ao Administrador Principal.'}); next(); }
async function status(req,res){try{res.json(await sync.status());}catch(e){res.status(500).json({error:e.message});}}
async function executar(req,res){try{const r=await sync.iniciar({manual:true,usuarioId:req.user.id});res.status(r.iniciado?202:409).json(r.iniciado?r:{error:r.mensagem,...r});}catch(e){res.status(500).json({error:e.message});}}
async function parar(req,res){try{const r=await sync.parar();res.json(r);}catch(e){res.status(500).json({error:e.message});}}
async function historico(req,res){try{res.json({codigoProduto:req.query.codigoProduto,vendas:await sync.historico(req.query.codigoProduto)});}catch(e){res.status(500).json({error:e.message});}}
module.exports={admin,principal,status,executar,parar,historico};
