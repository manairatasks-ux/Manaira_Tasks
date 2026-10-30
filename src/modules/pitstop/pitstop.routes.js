'use strict';
const router=require('express').Router();
const multer=require('multer');
const crypto=require('crypto');
const {sessionReport,periodReport}=require('./pitstop.pdf');
const https=require('https');
const http=require('http');
const cloudinary=require('cloudinary').v2;
const {query,pool}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
const gz=require('../produtos-gz/produtos-gz.service');
router.use(auth,requireModuleAccess('pitstop'));
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const fail=(msg,status=400)=>{const e=new Error(msg);e.status=status;throw e;};
const isManager=req=>['administrador_principal','administrador','gerente','encarregado'].includes(String(req.user?.perfil||'').toLowerCase());
const storage=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))}).single('foto');
function cloud(){if(!process.env.CLOUDINARY_CLOUD_NAME||!process.env.CLOUDINARY_API_KEY||!process.env.CLOUDINARY_API_SECRET)fail('Configure as credenciais Cloudinary para fotografias.',503);cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});}
function uploadFoto(buffer){cloud();return new Promise((resolve,reject)=>{const s=cloudinary.uploader.upload_stream({folder:'manaira/pitstop',type:'authenticated',resource_type:'image',public_id:crypto.randomUUID(),overwrite:false},(err,r)=>err?reject(err):resolve(r));s.end(buffer);});}
function fotoUrl(row){cloud();const id=String(row.foto_public_id);const fmt=String(row.foto_formato||'jpg');return cloudinary.utils.private_download_url(id,fmt,{resource_type:'image',type:'authenticated',expires_at:Math.floor(Date.now()/1000)+300,attachment:false});}
function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(String(d||'')) && !Number.isNaN(Date.parse(d+'T12:00:00Z'));}
// Cache curto por código de barras: evita duas consultas GZ para o mesmo lançamento.
// Somente dados de identificação; nenhuma quantidade/preço/estoque é armazenada.
const produtoCache=new Map();
async function produtoGz(ean){
 const agora=Date.now(),anterior=produtoCache.get(ean);
 if(anterior&&anterior.expira>agora)return anterior.dados;
 const consulta=await gz.consultarProduto({codigoBarras:ean});
 const p=(consulta.produtos||[]).find(x=>String(x.codigoEan||x.codigoBarras||x.codigo_barras||x.ean||x.codigobarras||'')===ean)||consulta.produtos?.[0];
 if(!p)fail('Produto não encontrado no GZ.',404);
 const descricao=String(p.descricao||p.descpdv||p.descricaoProduto||p.nome||p.nomeProduto||p.produto||'').trim();
 if(!descricao)fail('O GZ não retornou a descrição do produto.',502);
 const dados={ean,codigo_produto:String(p.codigo||p.codigoInterno||p.codigoProduto||p.codproduto||''),descricao};
 if(produtoCache.size>1200){for(const [k,v] of produtoCache){if(v.expira<=agora)produtoCache.delete(k);}if(produtoCache.size>1200)produtoCache.clear();}
 produtoCache.set(ean,{dados,expira:agora+5*60*1000});
 return dados;
}
const detailSql=`SELECT e.id,e.sessao_id,e.ean,e.codigo_produto,e.descricao,e.quantidade,e.foto_public_id,e.foto_formato,e.criado_em,e.observacao,e.cancelado_em,e.cancelamento_motivo,u.nome AS usuario_nome FROM pitstop_entradas e JOIN usuarios u ON u.id=e.usuario_id`;
async function owned(id,req){const r=await query('SELECT * FROM pitstop_sessoes WHERE id=$1',[id]);if(!r.rowCount)fail('Sessão não encontrada.',404);if(!isManager(req)&&Number(r.rows[0].usuario_id)!==Number(req.user.id))fail('Acesso restrito ao responsável pela sessão.',403);return r.rows[0];}
router.get('/produto/:ean',wrap(async(req,res)=>{const ean=String(req.params.ean||'').trim();if(!/^[0-9]{8,14}$/.test(ean))fail('Informe um código de barras válido de 8 a 14 dígitos.');res.json(await produtoGz(ean));}));
router.post('/sessoes',wrap(async(req,res)=>{const r=await query('INSERT INTO pitstop_sessoes (usuario_id) VALUES ($1) RETURNING *',[req.user.id]);res.status(201).json(r.rows[0]);}));
router.get('/sessoes',wrap(async(req,res)=>{const ini=req.query.inicio,fim=req.query.fim;const args=[];let where='WHERE 1=1';if(ini||fim){if(!validDate(ini)||!validDate(fim)||ini>fim)fail('Datas do filtro inválidas.');args.push(ini,fim);where+=` AND s.criado_em >= ($1::date::timestamp AT TIME ZONE 'America/Fortaleza') AND s.criado_em < (($2::date + 1)::timestamp AT TIME ZONE 'America/Fortaleza')`;}if(!isManager(req)){args.push(req.user.id);where+=` AND s.usuario_id=$${args.length}`;}const r=await query(`SELECT s.*,u.nome AS usuario_nome,COUNT(e.id) FILTER (WHERE e.cancelado_em IS NULL)::int AS itens,COALESCE(SUM(e.quantidade) FILTER (WHERE e.cancelado_em IS NULL),0)::numeric AS unidades FROM pitstop_sessoes s JOIN usuarios u ON u.id=s.usuario_id LEFT JOIN pitstop_entradas e ON e.sessao_id=s.id ${where} GROUP BY s.id,u.nome ORDER BY s.criado_em DESC LIMIT 250`,args);res.json(r.rows);}));
router.get('/sessoes/:id',wrap(async(req,res)=>{const s=await owned(req.params.id,req);const r=await query(`${detailSql} WHERE e.sessao_id=$1 ORDER BY e.criado_em,e.id`,[s.id]);res.json({sessao:s,itens:r.rows.map(({foto_public_id,foto_formato,...item})=>({...item,tem_foto:!!foto_public_id}))});}));
router.post('/sessoes/:id/fechar',wrap(async(req,res)=>{const s=await owned(req.params.id,req);await query('UPDATE pitstop_sessoes SET fechada_em=COALESCE(fechada_em,NOW()) WHERE id=$1',[s.id]);res.json({ok:true});}));
router.post('/sessoes/:id/entradas',(req,res,next)=>storage(req,res,err=>{if(err)return next(err);wrap(async(req,res)=>{const s=await owned(req.params.id,req);if(s.fechada_em)fail('Sessão finalizada. Inicie outra para continuar.',409);const ean=String(req.body.ean||'').trim(),q=Number(req.body.quantidade);if(!/^\d{8,14}$/.test(ean))fail('Código de barras inválido.');if(!Number.isInteger(q)||q<1||q>100000)fail('Quantidade deve ser um inteiro entre 1 e 100.000.');if(!req.file)fail('Foto JPG, PNG ou WEBP obrigatória (máximo 8 MB).');const p=await produtoGz(ean);const desc=p.descricao;const dup=await query('SELECT id FROM pitstop_entradas WHERE sessao_id=$1 AND ean=$2 AND cancelado_em IS NULL LIMIT 1',[s.id,ean]);if(dup.rowCount&&!['sim','true'].includes(String(req.body.confirmar_duplicado||'').toLowerCase()))return res.status(409).json({error:'Este produto já foi registrado nesta sessão. Confirme para registrar uma nova entrada.',duplicado:true});const foto=await uploadFoto(req.file.buffer);try{const r=await query('INSERT INTO pitstop_entradas (sessao_id,usuario_id,ean,codigo_produto,descricao,quantidade,foto_public_id,observacao,foto_formato) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,sessao_id,ean,descricao,quantidade,criado_em',[s.id,req.user.id,ean,p.codigo_produto,desc,q,foto.public_id,String(req.body.observacao||'').slice(0,500),foto.format]);res.status(201).json(r.rows[0]);}catch(e){await cloudinary.uploader.destroy(foto.public_id,{resource_type:'image',type:'authenticated'}).catch(()=>{});throw e;}})(req,res,next)}));
router.get('/entradas/:id/foto',wrap(async(req,res)=>{const r=await query('SELECT e.foto_public_id,e.foto_formato,e.sessao_id FROM pitstop_entradas e WHERE e.id=$1',[req.params.id]);if(!r.rowCount)fail('Foto não encontrada.',404);await owned(r.rows[0].sessao_id,req);res.set('Cache-Control','private, no-store');res.json({url:fotoUrl(r.rows[0])});}));
router.patch('/entradas/:id',wrap(async(req,res)=>{const r=await query('SELECT * FROM pitstop_entradas WHERE id=$1',[req.params.id]);if(!r.rowCount)fail('Entrada não encontrada.',404);const s=await owned(r.rows[0].sessao_id,req);if(s.fechada_em&&!isManager(req))fail('Sessão finalizada.',409);const q=Number(req.body.quantidade);if(!Number.isInteger(q)||q<1||q>100000)fail('Quantidade inválida.');const motivo=String(req.body.motivo||'').trim();if(motivo.length<5)fail('Informe o motivo da correção (mínimo 5 caracteres).');const client=await pool.connect();try{await client.query('BEGIN');await client.query('INSERT INTO pitstop_auditoria (entrada_id,usuario_id,acao,detalhes) VALUES ($1,$2,$3,$4)',[r.rows[0].id,req.user.id,'CORRECAO',JSON.stringify({quantidade_anterior:r.rows[0].quantidade,quantidade_nova:q,motivo})]);await client.query('UPDATE pitstop_entradas SET quantidade=$1 WHERE id=$2',[q,r.rows[0].id]);await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.delete('/entradas/:id',wrap(async(req,res)=>{const r=await query('SELECT * FROM pitstop_entradas WHERE id=$1',[req.params.id]);if(!r.rowCount)fail('Entrada não encontrada.',404);const s=await owned(r.rows[0].sessao_id,req);if(s.fechada_em&&!isManager(req))fail('Sessão finalizada.',409);const motivo=String(req.body?.motivo||'').trim();if(motivo.length<5)fail('Informe motivo do cancelamento.');const client=await pool.connect();try{await client.query('BEGIN');await client.query('UPDATE pitstop_entradas SET cancelado_em=NOW(),cancelamento_motivo=$1 WHERE id=$2 AND cancelado_em IS NULL',[motivo,r.rows[0].id]);await client.query('INSERT INTO pitstop_auditoria (entrada_id,usuario_id,acao,detalhes) VALUES ($1,$2,$3,$4)',[r.rows[0].id,req.user.id,'CANCELAMENTO',JSON.stringify({motivo})]);await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.get('/resumo',wrap(async(req,res)=>{const ini=String(req.query.inicio||''),fim=String(req.query.fim||'');if(!validDate(ini)||!validDate(fim)||ini>fim)fail('Selecione datas válidas.');const args=[ini,fim];const wh=`e.cancelado_em IS NULL AND e.criado_em >= ($1::date::timestamp AT TIME ZONE 'America/Fortaleza') AND e.criado_em < (($2::date + 1)::timestamp AT TIME ZONE 'America/Fortaleza')`;const r=await query(`SELECT COUNT(*)::int AS lancamentos,COALESCE(SUM(e.quantidade),0)::numeric AS unidades,COUNT(DISTINCT e.ean)::int AS produtos FROM pitstop_entradas e WHERE ${wh}`,args);const itens=await query(`SELECT e.ean,MAX(e.descricao) AS descricao,SUM(e.quantidade)::numeric AS quantidade,COUNT(*)::int AS registros FROM pitstop_entradas e WHERE ${wh} GROUP BY e.ean ORDER BY quantidade DESC LIMIT 150`,args);res.json({resumo:r.rows[0],produtos:itens.rows});}));
function imageBuffer(url,limit=6){return new Promise((resolve,reject)=>{const proto=url.startsWith('https:')?https:http;proto.get(url,r=>{if(r.statusCode!==200){r.resume();return reject(new Error('Foto indisponível'));}let chunks=[],total=0;r.on('data',d=>{total+=d.length;if(total>limit*1024*1024){r.destroy(new Error('Imagem excede limite'));return;}chunks.push(d)});r.on('end',()=>resolve(Buffer.concat(chunks)));r.on('error',reject)}).on('error',reject)})}
router.get('/relatorio/pdf',wrap(async(req,res)=>{
 const ini=String(req.query.inicio||''),fim=String(req.query.fim||'');
 if(!validDate(ini)||!validDate(fim)||ini>fim)fail('Informe um período válido.');
 const args=[ini,fim];let restricao='';
 if(!isManager(req)){args.push(req.user.id);restricao=` AND e.usuario_id=$${args.length}`;}
 const r=await query(`${detailSql} WHERE e.cancelado_em IS NULL AND e.criado_em >= ($1::date::timestamp AT TIME ZONE 'America/Fortaleza') AND e.criado_em < (($2::date + 1)::timestamp AT TIME ZONE 'America/Fortaleza') ${restricao} ORDER BY e.criado_em,e.id LIMIT 300`,args);
 if(!r.rowCount)fail('Nenhum registro encontrado no período.',404);
 await periodReport(res,ini,fim,r.rows,it=>imageBuffer(fotoUrl(it)));
}));
router.get('/sessoes/:id/pdf',wrap(async(req,res)=>{
 const s=await owned(req.params.id,req);
 const r=await query(`${detailSql} WHERE e.sessao_id=$1 AND e.cancelado_em IS NULL ORDER BY e.id`,[s.id]);
 if(!r.rowCount)fail('Esta sessão não possui entradas ativas.',400);
 const u=await query('SELECT nome FROM usuarios WHERE id=$1',[s.usuario_id]);
 await sessionReport(res,s,r.rows,u.rows[0]?.nome||'-',it=>imageBuffer(fotoUrl(it)));
}));
router.use((err,req,res,next)=>{if(res.headersSent)return next(err);console.error('Pit Stop:',err.message);res.status(err.status|| (err instanceof multer.MulterError?400:500)).json({error:err.status?err.message:err instanceof multer.MulterError?err.message:'Falha ao processar a operação do Pit Stop.'});});
module.exports=router;
