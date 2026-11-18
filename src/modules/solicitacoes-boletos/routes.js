 'use strict';
const router=require('express').Router();
const {pool,query}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
const {hasAccess}=require('../modulos/modulo.model');
const multer=require('multer');
const cloudinary=require('cloudinary').v2;
const crypto=require('crypto');
router.use(auth);
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(msg,status=400)=>{const e=new Error(msg);e.status=status;throw e;};
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);
async function access(req,role){
 if(String(req.user.perfil||'')==='administrador_principal')return;
 if(!await hasAccess(req.user.id,role==='financeiro'?'financeiro_boletos':'online_boletos'))fail('Você não possui acesso ao módulo solicitado.',403);
}
async function anyAccess(req){
 if(String(req.user.perfil||'')==='administrador_principal')return;
 if(!await hasAccess(req.user.id,'financeiro_boletos')&&!await hasAccess(req.user.id,'online_boletos'))fail('Acesso ao módulo não autorizado.',403);
}
function cloud(){
 if(!process.env.CLOUDINARY_CLOUD_NAME||!process.env.CLOUDINARY_API_KEY||!process.env.CLOUDINARY_API_SECRET)fail('Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no Render para anexos.',503);
 cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});
}
const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1},fileFilter:(req,file,cb)=>allowed.has(file.mimetype)?cb(null,true):cb(Object.assign(new Error('Anexe JPG, PNG, WEBP ou PDF de até 10 MB.'),{status:400}))}).single('arquivo');
function uploadCloud(file){
 cloud();const image=file.mimetype.startsWith('image/');const resource=image?'image':'raw';
 // PDFs como RAW, com extensão para download coerente.
 const format=image?(file.mimetype.split('/')[1]==='jpeg'?'jpg':file.mimetype.split('/')[1]):'pdf';
 const id='manaira/boletos/'+crypto.randomUUID()+(image?'':'.pdf');
 return new Promise((resolve,reject)=>{
  const stream=cloudinary.uploader.upload_stream({public_id:id,type:'authenticated',resource_type:resource,overwrite:false},(e,r)=>e?reject(e):resolve({public_id:r.public_id,format,resource_type:resource}));
  stream.end(file.buffer);
 });
}
async function docCleanup(doc){try{cloud();await cloudinary.uploader.destroy(doc.public_id,{type:'authenticated',resource_type:doc.resource_type,invalidate:true})}catch(e){console.error('[Boletos] Falha ao remover anexo órfão:',e.message)}}
const select=`SELECT s.*, u.nome AS solicitado_por_nome, f.nome AS financeiro_nome,
 (SELECT COUNT(*)::int FROM sb_documentos d WHERE d.solicitacao_id=s.id AND d.tipo='cupom') AS cupons,
 (SELECT COUNT(*)::int FROM sb_documentos d WHERE d.solicitacao_id=s.id AND d.tipo='boleto') AS boletos
 FROM sb_solicitacoes s LEFT JOIN usuarios u ON u.id=s.criado_por LEFT JOIN usuarios f ON f.id=s.responsavel_financeiro`;
async function evento(client,id,req,acao,detalhes={}){await client.query('INSERT INTO sb_eventos(solicitacao_id,usuario_id,acao,detalhes) VALUES ($1,$2,$3,$4::jsonb)',[id,req.user.id,acao,JSON.stringify(detalhes)]);}
router.get('/solicitacoes',wrap(async(req,res)=>{
 await anyAccess(req);
 const status=clean(req.query.status,30),busca=clean(req.query.busca,150);
 const params=[];let wh='WHERE 1=1';
 if(status){if(!['pendente','em_preparacao','pronto','devolvido','cancelado'].includes(status))fail('Status inválido.');params.push(status);wh+=` AND s.status=$${params.length}`;}
 if(busca){params.push('%'+busca+'%');wh+=` AND (s.cliente ILIKE $${params.length} OR s.numero_cupom ILIKE $${params.length} OR s.id::text ILIKE $${params.length})`;}
 const r=await query(`${select} ${wh} ORDER BY s.criado_em DESC,s.id DESC LIMIT 500`,params);
 res.set('Cache-Control','no-store');res.json({solicitacoes:r.rows});
}));
router.post('/solicitacoes',wrap(async(req,res)=>{
 await access(req,'online');const cliente=clean(req.body?.cliente,200),numero=clean(req.body?.numero_cupom,80);
 if(!cliente||!numero)fail('Informe cliente e número do cupom.');
 const valor= req.body?.valor===undefined||req.body?.valor===null||req.body?.valor===''?null:Number(req.body.valor);
 if(valor!==null&&(!Number.isFinite(valor)||valor<0||valor>999999999))fail('Valor inválido.');
 const parcelas=req.body?.parcelas?Number(req.body.parcelas):null;
 if(parcelas!==null&&(!Number.isInteger(parcelas)||parcelas<1||parcelas>120))fail('Quantidade de parcelas inválida.');
 const r=await query(`INSERT INTO sb_solicitacoes(setor_origem,tipo,cliente,numero_cupom,valor,parcelas,observacoes,criado_por)
 VALUES('online','emissao_boleto',$1,$2,$3,$4,$5,$6) RETURNING *`,[cliente,numero,valor,parcelas,clean(req.body?.observacoes,2000),req.user.id]);
 await query('INSERT INTO sb_eventos(solicitacao_id,usuario_id,acao) VALUES($1,$2,$3)',[r.rows[0].id,req.user.id,'CRIADA']);
 res.status(201).json(r.rows[0]);
}));
router.get('/solicitacoes/:id',wrap(async(req,res)=>{
 await anyAccess(req);const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)fail('ID inválido.');
 const r=await query(`${select} WHERE s.id=$1`,[id]);if(!r.rowCount)fail('Solicitação não encontrada.',404);
 const [docs,events]=await Promise.all([
 query(`SELECT d.id,d.tipo,d.nome_original,d.mime,d.criado_em,u.nome AS usuario_nome FROM sb_documentos d LEFT JOIN usuarios u ON u.id=d.enviado_por WHERE d.solicitacao_id=$1 ORDER BY d.id`,[id]),
 query(`SELECT e.id,e.acao,e.detalhes,e.criado_em,u.nome AS usuario_nome FROM sb_eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id WHERE e.solicitacao_id=$1 ORDER BY e.id`,[id])]);
 res.set('Cache-Control','no-store');res.json({solicitacao:r.rows[0],documentos:docs.rows,eventos:events.rows});
}));
router.post('/solicitacoes/:id/documentos',(req,res,next)=>upload(req,res,err=>err?next(err):wrap(async(req,res)=>{
 const id=Number(req.params.id),tipo=clean(req.body?.tipo,30);
 if(!Number.isSafeInteger(id)||id<1)fail('ID inválido.');
 if(!['cupom','boleto','complementar'].includes(tipo))fail('Tipo de documento inválido.');
 if(tipo==='boleto')await access(req,'financeiro');else if(tipo==='cupom')await access(req,'online');else await anyAccess(req);
 if(!req.file)fail('Selecione um arquivo JPG, PNG, WEBP ou PDF.');
 const r=await query('SELECT status FROM sb_solicitacoes WHERE id=$1',[id]);if(!r.rowCount)fail('Solicitação não encontrada.',404);
 if(r.rows[0].status==='cancelado')fail('Solicitação cancelada.',409);
 if(tipo==='cupom'&&r.rows[0].status!=='pendente'&&r.rows[0].status!=='devolvido')fail('Cupom só pode ser anexado antes do processamento ou após devolução.',409);
 const doc=await uploadCloud(req.file);
 try{
  const c=await pool.connect();try{await c.query('BEGIN');
   const saved=await c.query(`INSERT INTO sb_documentos(solicitacao_id,tipo,nome_original,mime,public_id,formato,resource_type,enviado_por)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[id,tipo,clean(req.file.originalname,240),req.file.mimetype,doc.public_id,doc.format,doc.resource_type,req.user.id]);
   await evento(c,id,req,'DOCUMENTO_ANEXADO',{tipo,documento_id:saved.rows[0].id,nome:clean(req.file.originalname,240)});
   await c.query('COMMIT');res.status(201).json({ok:true,id:saved.rows[0].id});
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }catch(e){await docCleanup(doc);throw e}
})(req,res,next)));
router.get('/documentos/:id',wrap(async(req,res)=>{
 await anyAccess(req);const r=await query('SELECT * FROM sb_documentos WHERE id=$1',[req.params.id]);
 if(!r.rowCount)fail('Documento não encontrado.',404);const d=r.rows[0];cloud();
 const url=cloudinary.utils.private_download_url(d.public_id,d.resource_type==='raw'?'':d.formato,{resource_type:d.resource_type,type:'authenticated',expires_at:Math.floor(Date.now()/1000)+90,attachment:false});
 res.set('Cache-Control','no-store');res.json({url,nome:d.nome_original,mime:d.mime});
}));
router.put('/solicitacoes/:id/status',wrap(async(req,res)=>{
 await access(req,'financeiro');const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)fail('ID inválido.');
 const status=clean(req.body?.status,30),motivo=clean(req.body?.motivo,1000);
 if(!['em_preparacao','pronto','devolvido','cancelado'].includes(status))fail('Status inválido.');
 if(['devolvido','cancelado'].includes(status)&&motivo.length<5)fail('Informe um motivo com pelo menos 5 caracteres.');
 const c=await pool.connect();try{await c.query('BEGIN');const r=await c.query('SELECT * FROM sb_solicitacoes WHERE id=$1 FOR UPDATE',[id]);
  if(!r.rowCount)fail('Solicitação não encontrada.',404);const old=r.rows[0].status;
  const allowed={pendente:['em_preparacao','devolvido','cancelado'],em_preparacao:['pronto','devolvido','cancelado'],devolvido:['em_preparacao','cancelado'],pronto:[],cancelado:[]};
  if(!allowed[old].includes(status))fail('Transição de status não permitida: '+old+' → '+status+'.',409);
  if(status==='em_preparacao'){const cup=await c.query("SELECT COUNT(*)::int AS n FROM sb_documentos WHERE solicitacao_id=$1 AND tipo='cupom'",[id]);if(!cup.rows[0].n)fail('A solicitação precisa de pelo menos um cupom fiscal anexado.',409);}
  if(status==='pronto'){
   const docs=await c.query("SELECT COUNT(*)::int AS n FROM sb_documentos WHERE solicitacao_id=$1 AND tipo='boleto'",[id]);
   if(!docs.rows[0].n)fail('Anexe pelo menos um boleto antes de concluir.',409);
  }
  await c.query(`UPDATE sb_solicitacoes SET status=$2,responsavel_financeiro=$3,devolucao_motivo=$4,concluido_em=CASE WHEN $2='pronto' THEN now() ELSE concluido_em END,atualizado_em=now() WHERE id=$1`,[id,status,req.user.id,status==='devolvido'?motivo:null]);
  await evento(c,id,req,'STATUS_ALTERADO',{anterior:old,novo:status,motivo});await c.query('COMMIT');res.json({ok:true,status});
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}));
router.put('/solicitacoes/:id/reenviar',wrap(async(req,res)=>{
 await access(req,'online');const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)fail('ID inválido.');
 const c=await pool.connect();try{await c.query('BEGIN');const r=await c.query("UPDATE sb_solicitacoes SET status='pendente',devolucao_motivo=NULL,atualizado_em=now() WHERE id=$1 AND status='devolvido' RETURNING id",[id]);
  if(!r.rowCount)fail('Solicitação inexistente ou não devolvida.',409);
  await evento(c,id,req,'REENVIADA');await c.query('COMMIT');res.json({ok:true});
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}));
router.use((err,req,res,next)=>{if(res.headersSent)return next(err);console.error('[Boletos]',err.message);res.status(err.status||(err instanceof multer.MulterError?400:500)).json({error:err.status?err.message:err instanceof multer.MulterError?err.message:'Falha no módulo de boletos.'})});
module.exports=router;
