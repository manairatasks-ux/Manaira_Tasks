const service=require('./galpao.service');
function sendError(res,err){console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Erro interno no módulo Galpão.'});}
exports.dashboard=async(req,res)=>{try{res.json(await service.dashboard());}catch(e){sendError(res,e);}};
exports.listProducts=async(req,res)=>{try{res.json(await service.listProducts(req.query));}catch(e){sendError(res,e);}};
exports.createProduct=async(req,res)=>{try{res.status(201).json(await service.createProduct(req.body));}catch(e){sendError(res,e);}};
exports.updateProduct=async(req,res)=>{try{res.json(await service.updateProduct(req.params.id,req.body));}catch(e){sendError(res,e);}};
exports.listStock=async(req,res)=>{try{res.json(await service.listStock(req.query));}catch(e){sendError(res,e);}};
exports.stockForProduct=async(req,res)=>{try{res.json(await service.stockForProduct(req.params.id));}catch(e){sendError(res,e);}};
exports.entry=async(req,res)=>{try{res.status(201).json(await service.movement('ENTRADA',req.body,req.user));}catch(e){sendError(res,e);}};
exports.exit=async(req,res)=>{try{res.status(201).json(await service.movement('SAIDA',req.body,req.user));}catch(e){sendError(res,e);}};
exports.history=async(req,res)=>{try{res.json(await service.history(req.query));}catch(e){sendError(res,e);}};
exports.expiry=async(req,res)=>{try{res.json(await service.expiry(req.query));}catch(e){sendError(res,e);}};
exports.previewImport=async(req,res)=>{try{res.json(await service.previewImport(req.file,req.user));}catch(e){sendError(res,e);}};
exports.executeImport=async(req,res)=>{try{res.json({ok:true,importacao:await service.executeImport(req.file,req.body,req.user)});}catch(e){sendError(res,e);}};
