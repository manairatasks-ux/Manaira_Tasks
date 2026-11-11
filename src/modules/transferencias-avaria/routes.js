 'use strict';
const router=require('express').Router();
const bcrypt=require('bcryptjs');
const multer=require('multer');
const cloudinary=require('cloudinary').v2;
const crypto=require('crypto');
const fs=require('fs');
const gz=require('../produtos-gz/produtos-gz.service');
const {pool,query}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
router.use(auth,requireModuleAccess('transferencias_avaria'));
const safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e};
const manager=req=>['administrador_principal','administrador','gerente'].includes(String(req.user.perfil||'').toLowerCase());
const clean=(v,n=200)=>String(v??'').trim().slice(0,n);
const pinValid=v=>/^\d{4,8}$/.test(String(v??''));
async function profile(req,client=pool){return (await client.query('SELECT setor,pin_hash FROM ta_perfis WHERE usuario_id=$1',[req.user.id])).rows[0]||null}
async function gate(req,role,client=pool){const p=await profile(req,client);if(!p||!(p.setor===role||p.setor==='ambos'))fail(`Seu usuário não está autorizado no setor ${role}.`,403);return p}
async function pin(req,role,client=pool){const p=await gate(req,role,client);if(!p.pin_hash)fail('Cadastre seu PIN pessoal antes de confirmar movimentações.',403);if(!pinValid(req.body.pin)||!await bcrypt.compare(String(req.body.pin),p.pin_hash))fail('PIN inválido.',403)}
async function event(client,id,req,acao,detalhes={}){await client.query('INSERT INTO ta_eventos(remessa_id,usuario_id,acao,detalhes) VALUES($1,$2,$3,$4::jsonb)',[id,req.user.id,acao,JSON.stringify(detalhes)])}
async function row(client,id){const r=(await client.query('SELECT * FROM ta_remessas WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r)fail('Remessa não encontrada.',404);return r}
async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
// Fotos privadas: Cloudinary ja utilizado pelos modulos Pit Stop e Recebimento.
const motivos=['Produto avariado','Degustação de cliente','Fermentado','Vencido','Próximo do vencimento','Furado','Bichado','Microfuro','Outros'];
const setores=['Loja','Hortifruti','Frios','Açougue','Padaria','Depósito','Laticínios','Processados','E-commerce','Recebimento','Outros'];
const fotoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1},fileFilter:(req,file,cb)=>{if(!['image/jpeg','image/png','image/webp'].includes(file.mimetype))return cb(Object.assign(new Error('A foto precisa ser JPG, PNG ou WEBP.'),{status:400}));cb(null,true)}}).single('foto');
function cloud(){if(!process.env.CLOUDINARY_CLOUD_NAME||!process.env.CLOUDINARY_API_KEY||!process.env.CLOUDINARY_API_SECRET)fail('Configure o Cloudinary para permitir o registro de fotos.',503);cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true})}
function sendPhoto(buffer){cloud();return new Promise((resolve,reject)=>{const stream=cloudinary.uploader.upload_stream({folder:'manaira/prevencao-avaria',type:'authenticated',resource_type:'image',public_id:crypto.randomUUID(),overwrite:false},(err,result)=>err?reject(err):resolve(result));stream.end(buffer)})}
function photoLink(f){if(!f||!f.public_id)return null;cloud();return cloudinary.utils.private_download_url(f.public_id,f.formato||'jpg',{resource_type:'image',type:'authenticated',expires_at:Math.floor(Date.now()/1000)+300,attachment:false})}
router.post('/remessas/:id/foto',(req,res,next)=>fotoUpload(req,res,err=>{if(err)return next(err);safe(async(req,res)=>{await gate(req,'prevencao');if(!req.file)fail('Selecione uma foto JPG, PNG ou WEBP de até 8 MB.');const r=(await query('SELECT * FROM ta_remessas WHERE id=$1',[req.params.id])).rows[0];if(!r)fail('Remessa não encontrada.',404);if(r.status!=='rascunho')fail('Fotos só podem ser adicionadas antes do envio.',409);if(Number(r.criado_por)!==Number(req.user.id)&&!manager(req))fail('Somente o criador pode alterar o rascunho.',403);const foto=await sendPhoto(req.file.buffer);try{const result=await query('INSERT INTO ta_fotos(remessa_id,usuario_id,public_id,formato) VALUES($1,$2,$3,$4) RETURNING id',[r.id,req.user.id,foto.public_id,foto.format]);res.status(201).json({id:result.rows[0].id,url:photoLink({public_id:foto.public_id,formato:foto.format})})}catch(e){await cloudinary.uploader.destroy(foto.public_id,{resource_type:'image',type:'authenticated'}).catch(()=>{});throw e}})(req,res,next)}));
// Consulta de EAN no mesmo serviço GZ utilizado pelo Pit Stop.
router.get('/produto/:ean',safe(async(req,res)=>{
  const ean=clean(req.params.ean,20);
  if(!/^\d{8,14}$/.test(ean))fail('Informe EAN de 8 a 14 dígitos.');
  const consulta=await gz.consultarProduto({codigoBarras:ean});
  const lista=consulta.produtos||[];
  const item=lista.find(x=>String(x.codigoEan||x.codigoBarras||x.codigo_barras||x.ean||x.codigobarras||'')===ean)||lista[0];
  if(!item)fail('Produto não encontrado no GZ. Você pode cadastrá-lo avulso.',404);
  const descricao=clean(item.descricao||item.descpdv||item.descricaoProduto||item.nome||item.nomeProduto||item.produto,240);
  if(!descricao)fail('Produto sem descrição retornada pelo GZ.',502);
  const interno=clean(item.codigo??item.codigoProduto??item.codigoInterno??'',80);
  res.set('Cache-Control','no-store');res.json({codigo:ean,codigo_interno:interno,descricao,unidade:'UN'});
}));
router.get('/bootstrap',safe(async(req,res)=>{const [me,users,remessas]=await Promise.all([profile(req),manager(req)?query('SELECT u.id,u.nome,p.setor FROM usuarios u LEFT JOIN ta_perfis p ON p.usuario_id=u.id WHERE u.ativo=TRUE ORDER BY u.nome'):Promise.resolve({rows:[]}),query(`SELECT r.*,u.nome AS criado_nome,s.nome AS enviado_nome,t.nome AS recebido_nome,(SELECT COUNT(*)::int FROM ta_itens i WHERE i.remessa_id=r.id) AS total_itens,(SELECT COUNT(*)::int FROM ta_itens i WHERE i.remessa_id=r.id AND i.quantidade_recebida IS NOT NULL) AS itens_conferidos,(SELECT COUNT(*)::int FROM ta_itens i WHERE i.remessa_id=r.id AND i.quantidade_recebida IS NOT NULL AND i.quantidade_enviada<>i.quantidade_recebida) AS divergencias FROM ta_remessas r LEFT JOIN usuarios u ON u.id=r.criado_por LEFT JOIN usuarios s ON s.id=r.enviado_por LEFT JOIN usuarios t ON t.id=r.recebido_por ORDER BY r.id DESC LIMIT 250`)]);res.set('Cache-Control','no-store');res.json({perfil:me?{setor:me.setor,pin_configurado:!!me.pin_hash}:null,gerente:manager(req),usuarios:users.rows,remessas:remessas.rows})}));
router.put('/usuarios/:id',safe(async(req,res)=>{if(!manager(req))fail('Somente a gerência pode definir os setores.',403);const id=Number(req.params.id),setor=clean(req.body.setor,20);if(!Number.isInteger(id)||id<=0)fail('Usuário inválido.');if(!['prevencao','avaria','ambos','nenhum'].includes(setor))fail('Setor inválido.');if(setor==='nenhum'){await query('DELETE FROM ta_perfis WHERE usuario_id=$1',[id]);return res.json({ok:true})}const r=await query('INSERT INTO ta_perfis(usuario_id,setor) SELECT id,$2 FROM usuarios WHERE id=$1 AND ativo=TRUE ON CONFLICT(usuario_id) DO UPDATE SET setor=EXCLUDED.setor,atualizado_em=NOW() RETURNING usuario_id',[id,setor]);if(!r.rowCount)fail('Usuário não encontrado.',404);res.json({ok:true})}));
router.put('/me/pin',safe(async(req,res)=>{const {novo_pin,pin_atual}=req.body||{};if(!pinValid(novo_pin))fail('PIN deve conter de 4 a 8 números.');const p=await profile(req);if(!p)fail('Solicite à gerência acesso a um setor antes de cadastrar PIN.',403);if(p.pin_hash&&(!pinValid(pin_atual)||!await bcrypt.compare(String(pin_atual),p.pin_hash)))fail('PIN atual incorreto.',403);await query('UPDATE ta_perfis SET pin_hash=$1,atualizado_em=NOW() WHERE usuario_id=$2',[await bcrypt.hash(String(novo_pin),11),req.user.id]);res.json({ok:true})}));
router.post('/remessas',safe(async(req,res)=>{await gate(req,'prevencao');const r=await query('INSERT INTO ta_remessas(observacao,criado_por) VALUES($1,$2) RETURNING *',[clean(req.body.observacao,1000),req.user.id]);await event(pool,r.rows[0].id,req,'CRIAR');res.status(201).json(r.rows[0])}));
router.get('/remessas/:id',safe(async(req,res)=>{const id=Number(req.params.id);const [r,itens,eventos]=await Promise.all([query('SELECT r.*,u.nome AS criado_nome,s.nome AS enviado_nome,t.nome AS recebido_nome FROM ta_remessas r LEFT JOIN usuarios u ON u.id=r.criado_por LEFT JOIN usuarios s ON s.id=r.enviado_por LEFT JOIN usuarios t ON t.id=r.recebido_por WHERE r.id=$1',[id]),query('SELECT i.*,f.public_id AS foto_public_id,f.formato AS foto_formato FROM ta_itens i LEFT JOIN ta_fotos f ON f.id=i.foto_id WHERE i.remessa_id=$1 ORDER BY i.id',[id]),query('SELECT e.*,u.nome AS usuario_nome FROM ta_eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id WHERE remessa_id=$1 ORDER BY e.id',[id])]);if(!r.rows.length)fail('Remessa não encontrada.',404);res.json({remessa:r.rows[0],itens:itens.rows.map(x=>({...x,foto_url:x.foto_public_id?photoLink({public_id:x.foto_public_id,formato:x.foto_formato}):null})),eventos:eventos.rows})}));
router.put('/remessas/:id/itens',safe(async(req,res)=>{
 await gate(req,'prevencao');
 const itens=req.body?.itens;
 if(!Array.isArray(itens)||!itens.length||itens.length>200)fail('Informe entre 1 e 200 produtos.');
 const seen=new Set(),seenPhotos=new Set(),valid=itens.map((x,index)=>{
  const codigo=clean(x.codigo,80),descricao=clean(x.descricao,240),unidade=clean(x.unidade||'UN',10).toUpperCase(),quantidade=Number(x.quantidade);
  const setor=clean(x.setor_origem,80),motivo=clean(x.motivo_avaria,80),outros=clean(x.motivo_outros,500),foto=Number(x.foto_id),interno=clean(x.codigo_interno,80);
  if(!descricao||!Number.isFinite(quantidade)||quantidade<=0||quantidade>1000000)fail(`Confira código, descrição e quantidade do item ${index+1}.`);
  if(!setores.includes(setor))fail(`Selecione o setor de origem do item ${index+1}.`);
  if(!motivos.includes(motivo))fail(`Selecione o motivo da avaria do item ${index+1}.`);
  if(motivo==='Outros'&&!outros)fail(`Informe o motivo no campo Outros do item ${index+1}.`);
  if(!Number.isSafeInteger(foto)||foto<=0)fail(`Adicione uma foto ao item ${index+1}.`);
  if(seenPhotos.has(foto))fail(`Cada produto precisa de sua própria foto (item ${index+1}).`);seenPhotos.add(foto);
  if(codigo){if(seen.has(codigo))fail(`Código duplicado: ${codigo}`);seen.add(codigo)}
  return {codigo:codigo||null,descricao,unidade,quantidade,setor,motivo,outros:motivo==='Outros'?outros:'',foto,interno};
 });
 await tx(async c=>{
  const r=await row(c,Number(req.params.id));
  if(r.status!=='rascunho')fail('Remessa já enviada: não é possível alterar produtos.',409);
  if(Number(r.criado_por)!==Number(req.user.id)&&!manager(req))fail('Somente o criador pode editar o rascunho.',403);
  const fotos=(await c.query('SELECT id FROM ta_fotos WHERE remessa_id=$1 AND id=ANY($2::bigint[])',[r.id,valid.map(x=>x.foto)])).rows;
  if(new Set(fotos.map(f=>Number(f.id))).size!==new Set(valid.map(x=>x.foto)).size)fail('Uma ou mais fotos não pertencem a esta remessa.');
  const anterior=(await c.query('SELECT codigo,codigo_interno,descricao,quantidade_enviada,setor_origem,motivo_avaria,motivo_outros,foto_id FROM ta_itens WHERE remessa_id=$1 ORDER BY id',[r.id])).rows;
  await c.query('DELETE FROM ta_itens WHERE remessa_id=$1',[r.id]);
  for(const x of valid)await c.query('INSERT INTO ta_itens(remessa_id,codigo,codigo_interno,descricao,unidade,quantidade_enviada,setor_origem,motivo_avaria,motivo_outros,foto_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[r.id,x.codigo,x.interno,x.descricao,x.unidade,x.quantidade,x.setor,x.motivo,x.outros,x.foto]);
  await event(c,r.id,req,'ATUALIZAR_ITENS',{anteriores:anterior,novos:valid});
 });res.json({ok:true});
}));
router.post('/remessas/:id/enviar',safe(async(req,res)=>{await tx(async c=>{await pin(req,'prevencao',c);const r=await row(c,Number(req.params.id));if(r.status!=='rascunho')fail('Somente rascunhos podem ser enviados.');const n=(await c.query('SELECT COUNT(*)::int n FROM ta_itens WHERE remessa_id=$1',[r.id])).rows[0].n;if(!n)fail('Adicione produtos antes de enviar.');const incompletos=(await c.query("SELECT COUNT(*)::int n FROM ta_itens WHERE remessa_id=$1 AND (foto_id IS NULL OR NULLIF(setor_origem,'') IS NULL OR NULLIF(motivo_avaria,'') IS NULL OR (motivo_avaria='Outros' AND NULLIF(motivo_outros,'') IS NULL))",[r.id])).rows[0].n;if(incompletos)fail(`${incompletos} item(ns) sem foto, setor ou motivo. Complete os cadastros antes de enviar.`);await c.query("UPDATE ta_remessas SET status='enviada',enviado_por=$2,enviado_em=NOW() WHERE id=$1",[r.id,req.user.id]);await event(c,r.id,req,'ENVIAR',{total_itens:n})});res.json({ok:true})}));
// Apenas um recebimento aberto por vez; retomada pelo próprio conferente.
router.post('/remessas/:id/iniciar-recebimento',safe(async(req,res)=>{
  await tx(async c=>{
    await gate(req,'avaria',c);
    const r=await row(c,Number(req.params.id));
    if(Number(r.enviado_por)===Number(req.user.id))fail('Quem enviou não pode receber a própria remessa.',403);
    if(r.status==='em_conferencia'){
      if(Number(r.conferencia_iniciada_por)!==Number(req.user.id))fail('Esta conferência já foi iniciada por outro operador. Solicite à gerência uma transferência de responsabilidade.',409);
      return;
    }
    if(r.status!=='enviada')fail('Esta remessa não está disponível para recebimento.',409);
    await c.query("UPDATE ta_remessas SET status='em_conferencia',conferencia_iniciada_por=$2,conferencia_iniciada_em=NOW() WHERE id=$1",[r.id,req.user.id]);
    await event(c,r.id,req,'INICIAR_RECEBIMENTO');
  });res.json({ok:true});
}));
router.put('/remessas/:id/conferencia',safe(async(req,res)=>{
  const itens=req.body?.itens;
  if(!Array.isArray(itens))fail('Informe os itens conferidos.');
  await tx(async c=>{
    await gate(req,'avaria',c);
    const r=await row(c,Number(req.params.id));
    if(r.status!=='em_conferencia')fail('Inicie o recebimento antes de salvar a conferência.',409);
    if(Number(r.conferencia_iniciada_por)!==Number(req.user.id))fail('Somente o responsável pode salvar esta conferência.',403);
    const orig=(await c.query('SELECT id FROM ta_itens WHERE remessa_id=$1 FOR UPDATE',[r.id])).rows;
    const valid=new Set(orig.map(x=>String(x.id))),seen=new Set();
    for(const x of itens){
      const id=String(x.id),n=Number(x.quantidade);
      if(!valid.has(id)||seen.has(id)||x.quantidade===null||x.quantidade===undefined||String(x.quantidade).trim()===''||!Number.isFinite(n)||n<0||n>1000000)fail('Itens ou quantidades inválidas.');
      seen.add(id);
    }
    // A tela envia só o que foi contado. Itens não informados continuam pendentes.
    await c.query('UPDATE ta_itens SET quantidade_recebida=NULL WHERE remessa_id=$1',[r.id]);
    for(const x of itens)await c.query('UPDATE ta_itens SET quantidade_recebida=$1 WHERE id=$2 AND remessa_id=$3',[Number(x.quantidade),x.id,r.id]);
    await event(c,r.id,req,'SALVAR_CONFERENCIA',{conferidos:itens.length,total:orig.length});
  });res.json({ok:true});
}));
router.post('/remessas/:id/receber',safe(async(req,res)=>{const itens=req.body.itens;if(!Array.isArray(itens))fail('Informe a conferência dos produtos.');await tx(async c=>{await pin(req,'avaria',c);const r=await row(c,Number(req.params.id));if(r.status!=='em_conferencia')fail('Inicie a conferência antes de finalizar o recebimento.');
if(Number(r.conferencia_iniciada_por)!==Number(req.user.id))fail('A conferência está atribuída a outro operador.',403);if(Number(r.enviado_por)===Number(req.user.id))fail('Quem enviou não pode confirmar o próprio recebimento.',403);const orig=(await c.query('SELECT * FROM ta_itens WHERE remessa_id=$1 ORDER BY id FOR UPDATE',[r.id])).rows;if(itens.length!==orig.length)fail('Confira todos os itens da remessa.');const quant=new Map();for(const x of itens){const id=Number(x.id),n=Number(x.quantidade);if(!Number.isSafeInteger(id)||quant.has(id)||x.quantidade==null||String(x.quantidade).trim()===''||!Number.isFinite(n)||n<0||n>1000000)fail('Quantidade recebida inválida.');quant.set(id,n)}let divergencias=0;for(const x of orig){if(!quant.has(Number(x.id)))fail('Há itens não conferidos.');const n=quant.get(Number(x.id));if(Number(x.quantidade_enviada)!==n)divergencias++;await c.query('UPDATE ta_itens SET quantidade_recebida=$1 WHERE id=$2',[n,x.id])}await c.query('UPDATE ta_remessas SET status=$2,recebido_por=$3,recebido_em=NOW() WHERE id=$1',[r.id,divergencias?'divergente':'conferida',req.user.id]);await event(c,r.id,req,'RECEBER',{divergencias})});res.json({ok:true})}));
router.post('/remessas/:id/resolver',safe(async(req,res)=>{await tx(async c=>{await pin(req,'avaria',c);if(!manager(req))fail('Apenas a gerência pode encerrar divergências.',403);const r=await row(c,Number(req.params.id));if(r.status!=='divergente')fail('Não há divergências pendentes nesta remessa.');const justificativa=clean(req.body.justificativa,1500);if(justificativa.length<10)fail('Informe justificativa com pelo menos 10 caracteres.');await c.query("UPDATE ta_remessas SET status='resolvida',resolvido_em=NOW() WHERE id=$1",[r.id]);await event(c,r.id,req,'RESOLVER_DIVERGENCIA',{justificativa})});res.json({ok:true})}));

// V74.26 — Relatórios de avaria e manutenção de fornecedores.
const somenteGestao=req=>{if(!manager(req))fail('Somente a gerência pode gerenciar fornecedores.',403)};
const codigoOk=v=>/^\d{1,30}$/.test(clean(v,40));
const reportFrom=String.raw`FROM ta_itens i
 JOIN ta_remessas r ON r.id=i.remessa_id
 LEFT JOIN LATERAL (SELECT MIN(c.codigo_produto) AS codigo_produto FROM gz_catalogo_produtos c
    WHERE c.codigo_ean=i.codigo HAVING COUNT(*)=1) gz ON (i.codigo_interno IS NULL OR i.codigo_interno='')
 LEFT JOIN ta_fornecedor_produtos fp ON fp.codigo_produto=COALESCE(NULLIF(i.codigo_interno,''),gz.codigo_produto)
 LEFT JOIN ta_fornecedores f ON f.codigo=fp.codigo_fornecedor AND f.ativo=TRUE`;
function reportFilter(req){
 const inicio=clean(req.query.inicio,10),fim=clean(req.query.fim,10),fornecedor=clean(req.query.fornecedor,40),status=clean(req.query.status,30),motivo=clean(req.query.motivo,80),setor=clean(req.query.setor,80);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(fim)||inicio>fim)fail('Selecione um período válido.');
 const p=[inicio,fim];const where=[`r.criado_em >= $1::date`,`r.criado_em < ($2::date + INTERVAL '1 day')`,`r.status <> 'cancelada'`,`r.status <> 'rascunho'`];
 if(fornecedor){where.push(fornecedor==='sem'?`f.codigo IS NULL`:`f.codigo=$${p.push(fornecedor)}`)}
 if(status){where.push(`r.status=$${p.push(status)}`)}
 if(motivo){where.push(`i.motivo_avaria=$${p.push(motivo)}`)}
 if(setor){where.push(`i.setor_origem=$${p.push(setor)}`)}
 return {where:' WHERE '+where.join(' AND '),params:p};
}
router.get('/relatorios/itens',safe(async(req,res)=>{
 await gate(req,'avaria');const {where,params}=reportFilter(req);
 const rows=(await query(`SELECT i.id,i.remessa_id,r.status,r.criado_em,r.recebido_em,i.codigo,i.codigo_interno,
 COALESCE(NULLIF(i.codigo_interno,''),gz.codigo_produto) AS codigo_gz,
 i.descricao,i.unidade,i.setor_origem,i.motivo_avaria,i.motivo_outros,
 i.quantidade_enviada,i.quantidade_recebida,
 CASE WHEN i.quantidade_recebida IS NULL THEN NULL ELSE i.quantidade_recebida-i.quantidade_enviada END AS diferenca,
 COALESCE(f.codigo,'') AS codigo_fornecedor,COALESCE(f.nome,'Sem fornecedor') AS fornecedor
 ${reportFrom} ${where} ORDER BY r.criado_em DESC,i.id DESC LIMIT 15000`,params)).rows;
 res.set('Cache-Control','no-store');res.json({itens:rows,limite:15000});
}));
router.get('/fornecedores',safe(async(req,res)=>{
 await gate(req,'avaria');const busca=clean(req.query.busca,100),limit=Number(req.query.limite)||150;
 const rows=(await query(`SELECT f.codigo,f.nome,f.ativo,COUNT(p.codigo_produto)::int AS produtos
 FROM ta_fornecedores f LEFT JOIN ta_fornecedor_produtos p ON p.codigo_fornecedor=f.codigo
 WHERE ($1='' OR f.codigo ILIKE '%'||$1||'%' OR f.nome ILIKE '%'||$1||'%')
 GROUP BY f.codigo ORDER BY f.nome LIMIT $2`,[busca,Math.min(Math.max(limit,1),1000)])).rows;
 res.json({fornecedores:rows});
}));
router.put('/fornecedores/:codigo',safe(async(req,res)=>{
 somenteGestao(req);const codigo=clean(req.params.codigo,30),nome=clean(req.body?.nome,160);
 if(!codigoOk(codigo)||!nome)fail('Informe código numérico e nome do fornecedor.');
 const antigo=(await query('SELECT * FROM ta_fornecedores WHERE codigo=$1',[codigo])).rows[0]||null;
 await query(`INSERT INTO ta_fornecedores(codigo,nome,ativo,atualizado_por) VALUES($1,$2,$3,$4)
 ON CONFLICT(codigo) DO UPDATE SET nome=EXCLUDED.nome,ativo=EXCLUDED.ativo,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=NOW()`,
 [codigo,nome,req.body.ativo!==false,req.user.id]);
 res.json({ok:true,anterior:antigo});
}));
router.put('/fornecedores-produtos/:codigo',safe(async(req,res)=>{
 somenteGestao(req);const codigo=clean(req.params.codigo,30),fornecedor=clean(req.body?.codigo_fornecedor,30);
 if(!codigoOk(codigo))fail('Código interno do produto inválido.');
 if(!fornecedor){await query('DELETE FROM ta_fornecedor_produtos WHERE codigo_produto=$1',[codigo]);return res.json({ok:true})}
 if(!codigoOk(fornecedor))fail('Código do fornecedor inválido.');
 const found=(await query('SELECT codigo FROM ta_fornecedores WHERE codigo=$1 AND ativo=TRUE',[fornecedor])).rows;
 if(!found.length)fail('Cadastre ou ative o fornecedor antes de vincular o produto.');
 await query(`INSERT INTO ta_fornecedor_produtos(codigo_produto,codigo_fornecedor,atualizado_por) VALUES($1,$2,$3)
 ON CONFLICT(codigo_produto) DO UPDATE SET codigo_fornecedor=EXCLUDED.codigo_fornecedor,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=NOW()`,[codigo,fornecedor,req.user.id]);
 res.json({ok:true});
}));
router.get('/fornecedores-produtos/:codigo',safe(async(req,res)=>{
 await gate(req,'avaria');const codigo=clean(req.params.codigo,30);const result=(await query(`SELECT p.codigo_produto,p.codigo_fornecedor,f.nome
 FROM ta_fornecedor_produtos p JOIN ta_fornecedores f ON f.codigo=p.codigo_fornecedor WHERE p.codigo_produto=$1`,[codigo])).rows[0]||null;
 res.json({vinculo:result});
}));
// Importação gerencial de TXT/CSV em 3 colunas: fornecedor, nome e código INTERNO do produto.
const importUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:4*1024*1024}}).single('arquivo');
router.post('/fornecedores/importar',(req,res,next)=>importUpload(req,res,err=>{if(err)return next(err);safe(async(req,res)=>{
 somenteGestao(req);if(!req.file)fail('Selecione arquivo TXT ou CSV.');
 const linhas=req.file.buffer.toString('utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
 if(linhas.length>100000)fail('Máximo de 100 mil linhas por importação.');
 const suppliers=new Map(),links=new Map();let repetidas=0;
 for(const [idx,line] of linhas.entries()){
  const cols=line.includes('\t')?line.split('\t'):line.split(';');
  if(cols.length<3){if(idx===0&&/fornecedor/i.test(line))continue;fail(`Linha ${idx+1}: informe 3 colunas.`)}
  const [fc,fn,pc]=cols.map(v=>clean(v.replace(/^"|"$/g,''),200));
  if(idx===0&&!/^\d+$/.test(fc)&&/fornecedor/i.test(fc))continue;
  if(!codigoOk(fc)||!fn||!codigoOk(pc))fail(`Linha ${idx+1}: código do fornecedor, nome ou código do produto inválido.`);
  if(suppliers.has(fc)&&suppliers.get(fc)!==fn)fail(`Linha ${idx+1}: nomes diferentes para fornecedor ${fc}.`);
  if(links.has(pc)){if(links.get(pc)!==fc)fail(`Linha ${idx+1}: produto ${pc} associado a dois fornecedores.`);repetidas++;continue}
  suppliers.set(fc,fn);links.set(pc,fc);
 }
 if(!links.size)fail('Arquivo vazio.');
 await tx(async c=>{
  for(const [codigo,nome] of suppliers){await c.query(`INSERT INTO ta_fornecedores(codigo,nome,atualizado_por) VALUES($1,$2,$3)
   ON CONFLICT(codigo) DO UPDATE SET nome=EXCLUDED.nome,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=NOW()`,[codigo,nome,req.user.id])}
  for(let off=0;off<links.size;off+=800){const part=[...links].slice(off,off+800);
   await c.query(`INSERT INTO ta_fornecedor_produtos(codigo_produto,codigo_fornecedor,atualizado_por)
   SELECT p,f,$3 FROM UNNEST($1::text[],$2::text[]) AS t(p,f)
   ON CONFLICT(codigo_produto) DO UPDATE SET codigo_fornecedor=EXCLUDED.codigo_fornecedor,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=NOW()`,
   [part.map(x=>x[0]),part.map(x=>x[1]),req.user.id])}
 });res.json({ok:true,fornecedores:suppliers.size,produtos:links.size,repetidas});
})(req,res,next)}));

router.use((err,req,res,next)=>{console.error('Transferências:',err.message);res.status(err.status||(err instanceof multer.MulterError?400:500)).json({error:err.status||err instanceof multer.MulterError?err.message:'Erro ao processar a operação.'})});
module.exports=router;
