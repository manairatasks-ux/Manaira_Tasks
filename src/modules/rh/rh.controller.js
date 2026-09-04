const service=require('./rh.service');
function handler(fn){return async(req,res)=>{try{res.json(await fn(req));}catch(err){console.error(err);res.status(err.status||500).json({error:err.message||'Erro interno.'});}};}
exports.publicTypes=handler(()=>service.types(true));
exports.publicCreate=handler(req=>service.create(req.body,null,'PUBLICO'));
exports.dashboard=handler(()=>service.dashboard());
exports.types=handler(()=>service.types(false));
exports.createType=handler(req=>service.createType(req.body));
exports.updateType=handler(req=>service.updateType(req.params.id,req.body));
exports.requests=handler(req=>service.requests(req.query));
exports.detail=handler(req=>service.detail(req.params.id));
exports.create=handler(req=>service.create(req.body,req.user,'INTERNO'));
exports.status=handler(req=>service.status(req.params.id,req.body,req.user));
exports.assign=handler(req=>service.assign(req.params.id,req.body,req.user));
exports.comment=handler(req=>service.comment(req.params.id,req.body,req.user));
exports.responsibles=handler(()=>service.responsibles());
