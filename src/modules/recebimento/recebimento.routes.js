const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const { pool, query } = require('../../db');
const { auth } = require('../../middlewares/auth.middleware');
const { requireModuleAccess } = require('../../middlewares/module-access.middleware');
const cloudinary = require('cloudinary').v2;

router.use(auth, requireModuleAccess('recebimento_cpd'));
const admin = req => ['administrador_principal','administrador'].includes(String(req.user?.perfil).toLowerCase());
const bad = (res, message, status=400) => res.status(status).json({ error: message });
const text = (v,n=200) => String(v??'').trim().slice(0,n);
const num = v => Number(v);
const configured = () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
function cloudConfig(){
  if (!configured()) throw new Error('Cloudinary não configurado no servidor.');
  cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});
}
function asyncRoute(fn){return (req,res,next)=>Promise.resolve(fn(req,res)).catch(next)}
function validDate(x){return /^\d{4}-\d{2}-\d{2}$/.test(String(x||'')) && !Number.isNaN(Date.parse(x+'T12:00:00Z'))}
async function authorizeCPD(client, req, pin){
  const r = await client.query('SELECT usuario_id, pin_hash FROM receb_cpd_autorizados WHERE usuario_id=$1', [req.user.id]);
  if(!r.rowCount) return false;
  return bcrypt.compare(String(pin||''),r.rows[0].pin_hash);
}
router.get('/resumo',asyncRoute(async(req,res)=>{
 const [n,c] = await Promise.all([
  query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE cpd_recebido_em IS NULL)::int AS aguardando, COUNT(*) FILTER (WHERE status='PRODUTOS_CADASTRAR')::int AS cadastro, COUNT(*) FILTER (WHERE status='LANCADA')::int AS lancadas FROM receb_notas WHERE recebido_em::date=(now() AT TIME ZONE 'America/Fortaleza')::date`),
  query(`SELECT categoria, COALESCE(SUM(quantidade),0)::int AS total FROM receb_caminhoes WHERE dia=(now() AT TIME ZONE 'America/Fortaleza')::date GROUP BY categoria`)
 ]);
 res.json({notas:n.rows[0],caminhoes:c.rows});
}));
// V67.5: quadro por etapas com filtros de data e paginação independentes.
router.get('/notas/painel',asyncRoute(async(req,res)=>{
 const inicio=text(req.query.inicio,10),fim=text(req.query.fim,10),busca=text(req.query.busca,100);
 if(!validDate(inicio)||!validDate(fim)||inicio>fim)return bad(res,'Informe um período válido (data inicial e final).');
 const grupos={
  recebidas:"n.status='NAO_RECEBIDA_CPD'",
  cpd:"n.status='RECEBIDA_CPD'",
  pendencias:"n.status IN ('PRODUTOS_CADASTRAR','DIVERGENCIA')",
  lancadas:"n.status='LANCADA'"
 };
 const limite=8;
 // Datas em intervalo, sem converter a coluna: permite aproveitar índice recebido_em.
 const params=[inicio,fim,'%'+busca+'%'];
 const filtro=`n.recebido_em >= ($1::date::timestamp AT TIME ZONE 'America/Fortaleza')
  AND n.recebido_em < (($2::date + 1)::timestamp AT TIME ZONE 'America/Fortaleza')
  AND (n.fornecedor ILIKE $3 OR n.numero ILIKE $3 OR n.codigo_fornecedor ILIKE $3)`;
 // Uma consulta de contadores para as quatro colunas, evitando quatro COUNTs independentes.
 const contagens=await query(`SELECT
  COUNT(*) FILTER (WHERE n.status='NAO_RECEBIDA_CPD')::int AS recebidas,
  COUNT(*) FILTER (WHERE n.status='RECEBIDA_CPD')::int AS cpd,
  COUNT(*) FILTER (WHERE n.status IN ('PRODUTOS_CADASTRAR','DIVERGENCIA'))::int AS pendencias,
  COUNT(*) FILTER (WHERE n.status='LANCADA')::int AS lancadas
  FROM receb_notas n WHERE ${filtro}`,params);
 const counts=contagens.rows[0];
 const resultado={inicio,fim,limite,grupos:{}};
 // Máximo de 8 notas por coluna. Duplicatas, anexos e histórico somente ao abrir nota.
 await Promise.all(Object.entries(grupos).map(async([chave,condicao])=>{
  const quantidade=Number(counts[chave]||0);
  const paginas=Math.max(1,Math.ceil(quantidade/limite));
  const solicitada=Math.min(100000,Math.max(1,parseInt(req.query['pagina_'+chave],10)||1));
  const pagina=Math.min(solicitada,paginas);
  if(!quantidade){resultado.grupos[chave]={total:0,pagina:1,paginas:1,itens:[]};return;}
  const itens=await query(`SELECT n.id,n.codigo_fornecedor,n.fornecedor,n.numero,n.serie,n.valor,
    n.origem,n.recebido_em,n.recebido_por,n.status,n.cpd_recebido_em,n.cpd_recebido_por,
    n.pendencia,n.observacao,u.nome AS recebido_por_nome,c.nome AS cpd_por_nome
    FROM receb_notas n
    JOIN usuarios u ON u.id=n.recebido_por
    LEFT JOIN usuarios c ON c.id=n.cpd_recebido_por
    WHERE ${filtro} AND (${condicao})
    ORDER BY n.recebido_em DESC,n.id DESC LIMIT $4 OFFSET $5`,
    [...params,limite,(pagina-1)*limite]);
  resultado.grupos[chave]={total:quantidade,pagina,paginas,itens:itens.rows};
 }));
 res.set('Cache-Control','private, no-store');
 res.json(resultado);
}));
// Carregamento sob demanda: dados completos somente após abrir uma nota.
router.get('/notas/:id/detalhe',asyncRoute(async(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1)return bad(res,'Nota inválida.');
 const r=await query(`SELECT n.*,u.nome AS recebido_por_nome,c.nome AS cpd_por_nome,
  (SELECT COALESCE(json_agg(json_build_object('id',d.id,'numero',d.numero,
     'vencimento',d.vencimento,'valor',d.valor) ORDER BY d.vencimento),'[]'::json)
   FROM receb_duplicatas d WHERE d.nota_id=n.id) AS duplicatas
  FROM receb_notas n JOIN usuarios u ON u.id=n.recebido_por
  LEFT JOIN usuarios c ON c.id=n.cpd_recebido_por WHERE n.id=$1`,[id]);
 if(!r.rowCount)return bad(res,'Nota não encontrada.',404);
 res.set('Cache-Control','private, no-store');
 res.json(r.rows[0]);
}));
router.get('/notas',asyncRoute(async(req,res)=>{
 const filtros=[]; const params=[];
 if(req.query.status){params.push(text(req.query.status,40)); filtros.push(`n.status=$${params.length}`)}
 if(req.query.busca){params.push('%'+text(req.query.busca,100)+'%'); filtros.push(`(n.fornecedor ILIKE $${params.length} OR n.numero ILIKE $${params.length} OR n.codigo_fornecedor ILIKE $${params.length})`)}
 if(req.query.dia && validDate(req.query.dia)){params.push(req.query.dia); filtros.push(`(n.recebido_em AT TIME ZONE 'America/Fortaleza')::date=$${params.length}::date`)}
 const r=await query(`SELECT n.*, u.nome AS recebido_por_nome, c.nome AS cpd_por_nome, l.nome AS lancado_por_nome,
 (SELECT COALESCE(json_agg(json_build_object('id',d.id,'numero',d.numero,'vencimento',d.vencimento,'valor',d.valor) ORDER BY d.vencimento), '[]'::json) FROM receb_duplicatas d WHERE d.nota_id=n.id) AS duplicatas,
 (SELECT COUNT(*)::int FROM receb_anexos a WHERE a.nota_id=n.id) AS anexos
 FROM receb_notas n JOIN usuarios u ON u.id=n.recebido_por LEFT JOIN usuarios c ON c.id=n.cpd_recebido_por LEFT JOIN usuarios l ON l.id=n.lancado_por
 ${filtros.length?'WHERE '+filtros.join(' AND '):''} ORDER BY n.recebido_em DESC LIMIT 300`,params);
 res.json(r.rows);
}));
router.post('/notas',asyncRoute(async(req,res)=>{
 const b=req.body||{};
 const codigo=text(b.codigo_fornecedor,40), fornecedor=text(b.fornecedor,160), numero=text(b.numero,40), serie=text(b.serie,15);
 const valor=num(b.valor);
 if(!fornecedor||!numero||!Number.isFinite(valor)||valor<=0)return bad(res,'Informe nome do fornecedor, número e valor positivo da nota. O código do fornecedor é opcional.');
 if(!['PAPEL','MENSAGEM'].includes(b.origem))return bad(res,'Selecione papel ou mensagem.');
 const duplicatas=Array.isArray(b.duplicatas)?b.duplicatas:[];
 if(!duplicatas.length || duplicatas.length>24)return bad(res,'Informe de 1 a 24 duplicatas/vencimentos.');
 if(duplicatas.some(d=>!validDate(d.vencimento)||!Number.isFinite(num(d.valor))||num(d.valor)<=0))return bad(res,'Existem duplicatas com vencimento ou valor inválido.');
 const soma=duplicatas.reduce((s,d)=>s+Math.round(num(d.valor)*100),0);
 if(Math.abs(soma-Math.round(valor*100))>1)return bad(res,'A soma das duplicatas deve corresponder ao valor da nota.');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const r=await client.query(`INSERT INTO receb_notas(codigo_fornecedor,fornecedor,numero,serie,valor,origem,recebido_por,observacao) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[codigo,fornecedor,numero,serie,valor,b.origem,req.user.id,text(b.observacao,1500)]);
  for(let i=0;i<duplicatas.length;i++){const d=duplicatas[i];await client.query(`INSERT INTO receb_duplicatas(nota_id,numero,vencimento,valor) VALUES($1,$2,$3,$4)`,[r.rows[0].id,text(d.numero||String(i+1),30),d.vencimento,num(d.valor)])}
  await client.query(`INSERT INTO receb_eventos(nota_id,usuario_id,acao,detalhes) VALUES($1,$2,'CADASTRO',$3)`,[r.rows[0].id,req.user.id,'Nota registrada no recebimento']);
  await client.query('COMMIT'); res.status(201).json(r.rows[0]);
 }catch(e){await client.query('ROLLBACK');if(e.code==='23505')return bad(res,'Já existe uma nota com este fornecedor, número e série.',409);throw e}finally{client.release()}
}));
router.get('/cpd/perfil',asyncRoute(async(req,res)=>{
 const r=await query('SELECT EXISTS(SELECT 1 FROM receb_cpd_autorizados WHERE usuario_id=$1) AS autorizado',[req.user.id]);
 res.json({autorizado:r.rows[0].autorizado,administrador:admin(req)});
}));
router.post('/cpd/configurar',asyncRoute(async(req,res)=>{
 if(!admin(req))return bad(res,'Somente administrador configura o responsável do CPD.',403);
 const id=Number(req.body.usuario_id), pin=String(req.body.pin||'');
 if(!Number.isInteger(id)||!/^\d{6,10}$/.test(pin))return bad(res,'Escolha o usuário e um PIN numérico de 6 a 10 dígitos.');
 const existe=await query('SELECT id FROM usuarios WHERE id=$1 AND ativo=TRUE',[id]);
 if(!existe.rowCount)return bad(res,'Usuário não encontrado ou inativo.');
 const hash=await bcrypt.hash(pin,12);
 await query('INSERT INTO receb_cpd_autorizados(usuario_id,pin_hash,configurado_por) VALUES($1,$2,$3) ON CONFLICT (usuario_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash, configurado_por=EXCLUDED.configurado_por, atualizado_em=now()',[id,hash,req.user.id]);
 res.json({ok:true});
}));
router.get('/usuarios',asyncRoute(async(req,res)=>{
 if(!admin(req))return bad(res,'Acesso restrito.',403);
 const r=await query('SELECT id,nome,email FROM usuarios WHERE ativo=TRUE ORDER BY nome');res.json(r.rows);
}));
router.post('/notas/:id/acao',asyncRoute(async(req,res)=>{
 const id=Number(req.params.id),acao=text(req.body.acao,32),pin=req.body.pin;
 if(!Number.isInteger(id)||!['RECEBER_CPD','PENDENCIA','LANCAR','DIVERGENCIA','RESOLVER'].includes(acao))return bad(res,'Ação inválida.');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const n=await c.query('SELECT * FROM receb_notas WHERE id=$1 FOR UPDATE',[id]);
  if(!n.rowCount){await c.query('ROLLBACK');return bad(res,'Nota não encontrada.',404)}
  if(!(await authorizeCPD(c,req,pin))){await c.query('ROLLBACK');return bad(res,'Somente usuário autorizado do CPD com PIN correto pode executar a ação.',403)}
  const nota=n.rows[0],obs=text(req.body.observacao,1500);
  if(acao==='RECEBER_CPD' && nota.cpd_recebido_em){await c.query('ROLLBACK');return bad(res,'CPD já confirmou o recebimento.');}
  if(acao!=='RECEBER_CPD' && !nota.cpd_recebido_em){await c.query('ROLLBACK');return bad(res,'Confirme primeiro o recebimento pelo CPD.');}
  if(nota.status==='LANCADA' && acao!=='RECEBER_CPD'){await c.query('ROLLBACK');return bad(res,'Nota já lançada.');}
  if(['PENDENCIA','DIVERGENCIA'].includes(acao) && obs.length<5){await c.query('ROLLBACK');return bad(res,'Informe a descrição da pendência.');}
  const status={RECEBER_CPD:'RECEBIDA_CPD',PENDENCIA:'PRODUTOS_CADASTRAR',LANCAR:'LANCADA',DIVERGENCIA:'DIVERGENCIA',RESOLVER:'RECEBIDA_CPD'}[acao];
  await c.query(`UPDATE receb_notas SET status=$2, cpd_recebido_em=CASE WHEN $3='RECEBER_CPD' THEN now() ELSE cpd_recebido_em END,cpd_recebido_por=CASE WHEN $3='RECEBER_CPD' THEN $4 ELSE cpd_recebido_por END,lancado_em=CASE WHEN $3='LANCAR' THEN now() ELSE lancado_em END,lancado_por=CASE WHEN $3='LANCAR' THEN $4 ELSE lancado_por END,pendencia=CASE WHEN $3 IN ('PENDENCIA','DIVERGENCIA') THEN $5 WHEN $3='RESOLVER' THEN '' ELSE pendencia END,atualizado_em=now() WHERE id=$1`,[id,status,acao,req.user.id,obs]);
  await c.query('INSERT INTO receb_eventos(nota_id,usuario_id,acao,detalhes) VALUES($1,$2,$3,$4)',[id,req.user.id,acao,obs]);
  await c.query('COMMIT');res.json({ok:true,status});
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}));
router.get('/notas/:id/eventos',asyncRoute(async(req,res)=>{
 const r=await query('SELECT e.*,u.nome AS usuario FROM receb_eventos e JOIN usuarios u ON u.id=e.usuario_id WHERE e.nota_id=$1 ORDER BY e.criado_em DESC',[req.params.id]);res.json(r.rows);
}));
router.get('/caminhoes',asyncRoute(async(req,res)=>{
 const dia=validDate(req.query.dia)?req.query.dia:null;
 const r=await query(`SELECT c.*,u.nome AS registrado_por_nome FROM receb_caminhoes c JOIN usuarios u ON u.id=c.registrado_por WHERE c.dia=COALESCE($1::date,(now() AT TIME ZONE 'America/Fortaleza')::date) ORDER BY c.criado_em DESC`,[dia]);res.json(r.rows);
}));
router.post('/caminhoes',asyncRoute(async(req,res)=>{
 const cat=req.body.categoria,quant=Number(req.body.quantidade),dia=req.body.dia;
 if(!['MERCEARIA','HORTIFRUTI','FRIOS'].includes(cat)||!Number.isInteger(quant)||quant<1||quant>100||!validDate(dia))return bad(res,'Informe data, setor e quantidade de caminhões válida.');
 const r=await query('INSERT INTO receb_caminhoes(dia,categoria,quantidade,registrado_por,observacao) VALUES($1,$2,$3,$4,$5) RETURNING *',[dia,cat,quant,req.user.id,text(req.body.observacao,350)]);res.status(201).json(r.rows[0]);
}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype))});
router.post('/notas/:id/anexos',upload.single('arquivo'),asyncRoute(async(req,res)=>{
 if(!req.file)return bad(res,'Envie uma imagem JPG, PNG, WebP ou PDF de até 8 MB.');
 const id=Number(req.params.id);if(!Number.isInteger(id))return bad(res,'Nota inválida.');
 const existe=await query('SELECT id FROM receb_notas WHERE id=$1',[id]);if(!existe.rowCount)return bad(res,'Nota não encontrada.',404);
 if(!configured())return bad(res,'Configure as credenciais Cloudinary no servidor antes de anexar.',503);
 cloudConfig();const tipo=req.file.mimetype==='application/pdf'?'raw':'image';
 const publicId='recebimento/nota_'+id+'/'+crypto.randomUUID();
 const response=await new Promise((resolve,reject)=>{
  const stream=cloudinary.uploader.upload_stream({public_id:publicId,resource_type:tipo,type:'authenticated',overwrite:false},(err,result)=>err?reject(err):resolve(result));
  stream.end(req.file.buffer);
 });
 try{
 const r=await query('INSERT INTO receb_anexos(nota_id,usuario_id,public_id,resource_type,formato,nome_original,bytes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,nome_original,bytes,criado_em',[id,req.user.id,response.public_id,tipo,response.format||'pdf',text(req.file.originalname,200),req.file.size]);
 await query('INSERT INTO receb_eventos(nota_id,usuario_id,acao,detalhes) VALUES($1,$2,$3,$4)',[id,req.user.id,'ANEXO',text(req.file.originalname,200)]);
 res.status(201).json(r.rows[0]);
 }catch(e){await cloudinary.uploader.destroy(response.public_id,{resource_type:tipo,type:'authenticated'}).catch(()=>{});throw e}
}));
router.get('/notas/:id/anexos',asyncRoute(async(req,res)=>{
 const r=await query('SELECT id,nome_original,bytes,criado_em FROM receb_anexos WHERE nota_id=$1 ORDER BY id DESC',[req.params.id]);res.json(r.rows);
}));
router.get('/anexos/:id/abrir',asyncRoute(async(req,res)=>{
 const r=await query('SELECT * FROM receb_anexos WHERE id=$1',[req.params.id]);if(!r.rowCount)return bad(res,'Arquivo inexistente.',404);
 if(!configured())return bad(res,'Cloudinary não configurado.',503);
 cloudConfig();const a=r.rows[0];
 // URL assinada temporária: não expomos arquivos por links públicos.
 const url=cloudinary.utils.private_download_url(a.public_id,a.formato,{resource_type:a.resource_type,type:'authenticated',expires_at:Math.floor(Date.now()/1000)+300,attachment:false});
 res.json({url,expira_em_segundos:300});
}));
router.use((err,req,res,next)=>{
 if(err instanceof multer.MulterError)return bad(res,'Falha no upload: '+err.message);
 console.error('Recebimento V67:',err);
 return bad(res,'Falha ao processar a operação. Verifique o servidor.',500);
});
module.exports=router;
