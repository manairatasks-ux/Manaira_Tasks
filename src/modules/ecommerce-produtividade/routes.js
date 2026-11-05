const router=require('express').Router();
const multer=require('multer');
const {pool,query}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
const {parse}=require('./parser');
const safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
// Leitura pública e exclusiva do retrato já publicado. Nenhuma operação de gestão aqui.
// O endereço é permanente: /tv. Não retorna dados brutos nem oferece edição.
router.get('/tv/publico',safe(async(req,res)=>{
 res.set('Cache-Control','no-store');
 const result=await query('SELECT snapshot,publicado_em FROM ep_tv_config WHERE id=1');
 const record=result.rows[0];
 if(!record?.snapshot)return res.json({publicado:false});
 res.json({publicado:true,publicado_em:record.publicado_em,...record.snapshot});
}));
router.use(auth,requireModuleAccess('ecommerce_produtividade'));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1}});
function bad(msg,status=400){const e=new Error(msg);e.status=status;throw e}
function date(x){return typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&!isNaN(Date.parse(x))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x}
function validDates(ini,fim){if(!date(ini)||!date(fim)||ini>fim)bad('Informe datas válidas no formato AAAA-MM-DD.');}
function manager(req){return ['administrador_principal','administrador','gerente','encarregado'].includes(String(req.user.perfil).toLowerCase())}
function requireManager(req){if(!manager(req))bad('Apenas gestores podem importar ou alterar cadastros.',403)}
function totals(rows){return rows.reduce((a,r)=>{a.compras+=Number(r.compras);a.produtos+=Number(r.produtos);a.itens+=Number(r.itens);a.segundos_total+=Number(r.segundos_total);return a},{compras:0,produtos:0,itens:0,segundos_total:0})}
router.post('/previa',requireUpload(),safe(async(req,res)=>{
 const {items}=parse(req.file.buffer);
 const known=await query('SELECT vip_id,categoria,arquivado FROM ep_usuarios WHERE vip_id=ANY($1::int[])',[items.map(x=>x.vip_id)]);
 const cfg=new Map(known.rows.map(x=>[x.vip_id,x]));
 const rows=items.map(x=>({...x,excluido:x.excluido||!!cfg.get(x.vip_id)?.arquivado||(cfg.get(x.vip_id)&&cfg.get(x.vip_id).categoria!=='separador')}));
 res.json({registros:rows.length,excluidos:rows.filter(r=>r.excluido),totais_brutos:totals(rows),totais_produtivos:totals(rows.filter(r=>!r.excluido)),linhas:rows});
}));
function requireUpload(){return (req,res,next)=>upload.single('arquivo')(req,res,err=>{if(err)return next(err);if(!req.file)return res.status(400).json({error:'Escolha um arquivo CSV da VIP.'});if(!/\.csv$/i.test(req.file.originalname))return res.status(400).json({error:'Formato aceito: CSV da VIP.'});next()})}
router.post('/importar',requireUpload(),safe(async(req,res)=>{requireManager(req);const inicio=String(req.body.inicio||''),fim=String(req.body.fim||'');validDates(inicio,fim);const {items,hash}=parse(req.file.buffer);const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7310671)');const overlap=await client.query('SELECT id,inicio,fim FROM ep_importacoes WHERE inicio<=$2 AND fim>=$1 FOR UPDATE',[inicio,fim]);if(overlap.rowCount)bad('Já existe relatório de período coincidente. Remova a importação anterior pelo histórico antes de importar outro intervalo.',409);const imp=await client.query('INSERT INTO ep_importacoes(inicio,fim,arquivo_nome,hash_sha256,registros,criado_por) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[inicio,fim,req.file.originalname.slice(0,220),hash,items.length,req.user.id]);for(const r of items){await client.query(`INSERT INTO ep_usuarios(vip_id,nome,categoria) VALUES($1,$2,$3) ON CONFLICT (vip_id) DO UPDATE SET nome=EXCLUDED.nome,atualizado_em=NOW(),categoria=CASE WHEN ep_usuarios.vip_id IN (9,52) THEN 'desconsiderado' ELSE ep_usuarios.categoria END`,[r.vip_id,r.nome,r.excluido?'desconsiderado':'separador']);await client.query(`INSERT INTO ep_metricas(importacao_id,vip_id,nome_original,compras,produtos,itens,segundos_total,segundos_compra,segundos_produto,segundos_item) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[imp.rows[0].id,r.vip_id,r.nome,r.compras,r.produtos,r.itens,r.segundos_total,r.segundos_compra,r.segundos_produto,r.segundos_item]);}await client.query('COMMIT');const eligible=await client.query(`SELECT m.compras,m.produtos,m.itens,m.segundos_total FROM ep_metricas m JOIN ep_usuarios u ON u.vip_id=m.vip_id WHERE m.importacao_id=$1 AND u.categoria='separador' AND u.arquivado=FALSE AND u.vip_id NOT IN (9,52)`,[imp.rows[0].id]);res.status(201).json({ok:true,id:imp.rows[0].id,registros:items.length,totais:totals(eligible.rows)});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.get('/importacoes',safe(async(req,res)=>{const r=await query(`SELECT i.id,i.inicio,i.fim,i.arquivo_nome,i.registros,i.criado_em,u.nome AS importado_por FROM ep_importacoes i LEFT JOIN usuarios u ON u.id=i.criado_por ORDER BY i.inicio DESC,i.id DESC LIMIT 300`);res.json({importacoes:r.rows,pode_gerenciar:manager(req)})}));
router.delete('/importacoes/:id',safe(async(req,res)=>{requireManager(req);const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)bad('Identificador inválido.');const r=await query('DELETE FROM ep_importacoes WHERE id=$1 RETURNING id',[id]);if(!r.rowCount)bad('Importação não encontrada.',404);res.json({ok:true})}));
router.get('/usuarios',safe(async(req,res)=>{
 const r=await query(`SELECT u.*,COALESCE(COUNT(m.importacao_id),0)::int AS periodos FROM ep_usuarios u LEFT JOIN ep_metricas m ON m.vip_id=u.vip_id GROUP BY u.vip_id ORDER BY u.nome`);
 res.json({usuarios:r.rows,pode_gerenciar:manager(req)});
}));
router.patch('/usuarios/:id',safe(async(req,res)=>{
 requireManager(req);const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1)bad('ID inválido.');
 const current=await query('SELECT * FROM ep_usuarios WHERE vip_id=$1',[id]);
 if(!current.rowCount)bad('Usuário não encontrado.',404);
 const old=current.rows[0];
 const categoria=Object.prototype.hasOwnProperty.call(req.body,'categoria')?String(req.body.categoria):old.categoria;
 if(!['separador','operacional','desconsiderado'].includes(categoria))bad('Categoria inválida.');
 if([9,52].includes(id)&&categoria==='separador')bad('IDs 9 e 52 são excluídos permanentemente do ranking.');
 const arquivado=Object.prototype.hasOwnProperty.call(req.body,'arquivado')?req.body.arquivado:old.arquivado;
 if(typeof arquivado!=='boolean')bad('Arquivamento inválido.');
 const obs=Object.prototype.hasOwnProperty.call(req.body,'observacao')?String(req.body.observacao||'').trim().slice(0,300):old.observacao;
 const r=await query('UPDATE ep_usuarios SET categoria=$1,arquivado=$2,observacao=$3,atualizado_em=NOW() WHERE vip_id=$4 RETURNING *',[categoria,arquivado,obs,id]);
 res.json(r.rows[0]);
}));
router.delete('/usuarios/:id',safe(async(req,res)=>{
 requireManager(req);const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1)bad('ID inválido.');
 if([9,52].includes(id))bad('Usuários padrão 9 e 52 são protegidos e devem continuar desconsiderados.',409);
 if(String(req.body?.confirmar_id)!==String(id))bad('Confirmação de ID inválida.');
 const client=await pool.connect();try{
  await client.query('BEGIN');
  const current=await client.query('SELECT vip_id,nome FROM ep_usuarios WHERE vip_id=$1 FOR UPDATE',[id]);
  if(!current.rowCount)bad('Funcionário não encontrado.',404);
  const removed=await client.query('DELETE FROM ep_metricas WHERE vip_id=$1',[id]);
  await client.query('DELETE FROM ep_usuarios WHERE vip_id=$1',[id]);
  await client.query('COMMIT');
  res.json({ok:true,nome:current.rows[0].nome,registros_excluidos:removed.rowCount});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
router.get('/indicadores',safe(async(req,res)=>{const inicio=String(req.query.inicio||'2026-01-01'),fim=String(req.query.fim||'2099-12-31');validDates(inicio,fim);const imp=await query('SELECT id,inicio,fim,arquivo_nome FROM ep_importacoes WHERE inicio >= $1 AND fim <= $2 ORDER BY inicio',[inicio,fim]);const sql=`SELECT u.vip_id,u.nome,u.categoria,u.arquivado, COUNT(m.importacao_id)::int AS periodos, SUM(m.compras)::bigint AS compras,SUM(m.produtos)::bigint AS produtos,SUM(m.itens)::bigint AS itens,SUM(m.segundos_total)::bigint AS segundos_total FROM ep_metricas m JOIN ep_usuarios u ON u.vip_id=m.vip_id JOIN ep_importacoes i ON i.id=m.importacao_id WHERE i.inicio >= $1 AND i.fim <= $2 GROUP BY u.vip_id,u.nome,u.categoria,u.arquivado ORDER BY itens DESC,u.nome`;const r=await query(sql,[inicio,fim]);const users=r.rows.map(x=>({...x,compras:Number(x.compras),produtos:Number(x.produtos),itens:Number(x.itens),segundos_total:Number(x.segundos_total),excluido:x.categoria!=='separador'||Boolean(x.arquivado)||[9,52].includes(x.vip_id)}));const productive=users.filter(u=>!u.excluido);res.json({inicio,fim,periodos:imp.rows,usuarios:users,produtivos:productive,totais:totals(productive),totais_brutos:totals(users),excluidos:users.filter(x=>x.excluido),criterio:'Somente relatórios integralmente contidos no período informado; intervalos parcialmente sobrepostos não entram no cálculo.',pode_gerenciar:manager(req)})}));
// A publicação congela um retrato. A TV só muda após nova publicação do responsável.
router.get('/tv/configuracao',safe(async(req,res)=>{
 const r=await query('SELECT inicio,fim,publicado_em,token_criado_em,(token_hash IS NOT NULL) AS possui_link,(snapshot IS NOT NULL) AS possui_publicacao FROM ep_tv_config WHERE id=1');
 res.json({...r.rows[0],pode_gerenciar:manager(req)});
}));
router.post('/tv/publicar',safe(async(req,res)=>{
 requireManager(req);
 const inicio=String(req.body?.inicio||''),fim=String(req.body?.fim||'');validDates(inicio,fim);
 const rr=await query(`SELECT u.vip_id,u.nome,SUM(m.compras)::bigint AS compras,SUM(m.produtos)::bigint AS produtos,
 SUM(m.itens)::bigint AS itens,SUM(m.segundos_total)::bigint AS segundos_total
 FROM ep_metricas m JOIN ep_usuarios u ON u.vip_id=m.vip_id JOIN ep_importacoes i ON i.id=m.importacao_id
 WHERE i.inicio >= $1 AND i.fim <= $2 AND u.categoria='separador' AND u.arquivado=FALSE AND u.vip_id NOT IN (9,52)
 GROUP BY u.vip_id,u.nome ORDER BY itens DESC,u.nome`,[inicio,fim]);
 const participants=rr.rows.map(r=>({vip_id:r.vip_id,nome:r.nome,compras:Number(r.compras),produtos:Number(r.produtos),itens:Number(r.itens),segundos_total:Number(r.segundos_total)}));
 const count=await query('SELECT COUNT(*)::int AS total FROM ep_importacoes WHERE inicio >= $1 AND fim <= $2',[inicio,fim]);
 if(!count.rows[0].total)bad('Não existem relatórios integralmente contidos no período escolhido.',409);
 const snapshot={inicio,fim,criterio:'Itens separados',usuarios:participants,totais:totals(participants),periodos:count.rows[0].total};
 await query('UPDATE ep_tv_config SET inicio=$1,fim=$2,snapshot=$3::jsonb,publicado_por=$4,publicado_em=NOW() WHERE id=1',[inicio,fim,JSON.stringify(snapshot),req.user.id]);
 res.json({ok:true,usuarios:participants.length,totais:snapshot.totais});
}));
router.get('/usuario/:id/evolucao',safe(async(req,res)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)bad('ID inválido.');const r=await query(`SELECT i.inicio,i.fim,m.compras,m.produtos,m.itens,m.segundos_total FROM ep_metricas m JOIN ep_importacoes i ON i.id=m.importacao_id WHERE m.vip_id=$1 ORDER BY i.inicio DESC LIMIT 120`,[id]);res.json({registros:r.rows})}));
router.get('/relatorio/pdf',safe(async(req,res)=>{
 const inicio=String(req.query.inicio||''),fim=String(req.query.fim||'');validDates(inicio,fim);
 const PDFDocument=require('pdfkit');
 const result=await query(`SELECT u.vip_id,u.nome, SUM(m.compras)::bigint AS compras,SUM(m.itens)::bigint AS itens,SUM(m.segundos_total)::bigint AS segundos
 FROM ep_metricas m JOIN ep_importacoes i ON i.id=m.importacao_id JOIN ep_usuarios u ON u.vip_id=m.vip_id
 WHERE i.inicio >= $1 AND i.fim <= $2 AND u.categoria='separador' AND u.arquivado=FALSE AND u.vip_id NOT IN (9,52)
 GROUP BY u.vip_id,u.nome ORDER BY itens DESC,u.nome`,[inicio,fim]);
 const fmt=n=>Number(n||0).toLocaleString('pt-BR');
 const sec=n=>{let x=Math.floor(Number(n||0));return [Math.floor(x/3600),Math.floor(x%3600/60),x%60].map(z=>String(z).padStart(2,'0')).join(':')};
 const pdf=new PDFDocument({size:'A4',margin:42,bufferPages:true});
 res.set('Content-Type','application/pdf');res.set('Content-Disposition',`attachment; filename="produtividade_${inicio}_${fim}.pdf"`);pdf.pipe(res);
 pdf.fontSize(18).fillColor('#123A60').text('Supermercado Manaíra');pdf.fontSize(13).text('Produtividade E-commerce — VIP');
 pdf.moveDown(0.4).fontSize(10).fillColor('#495D73').text(`Período: ${inicio.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}`);
 pdf.text('Desconsiderados: ID 9 Mateus Reis e ID 52 Imprimir Selo.');pdf.moveDown(1);
 const purchases=result.rows.reduce((a,r)=>a+Number(r.compras),0),items=result.rows.reduce((a,r)=>a+Number(r.itens),0);
 pdf.fontSize(11).fillColor('#123A60').text(`Colaboradores: ${result.rows.length}    Compras: ${fmt(purchases)}    Itens: ${fmt(items)}`);pdf.moveDown(0.6);
 function header(){pdf.fillColor('#edf4fa').rect(42,pdf.y,510,25).fill();const y=pdf.y+7;pdf.fillColor('#163b60').fontSize(9).text('Funcionário',48,y,{width:220}).text('Compras',275,y,{width:60,align:'right'}).text('Itens',345,y,{width:72,align:'right'}).text('Tempo',427,y,{width:115,align:'right'});pdf.y=y+23;}
 header();
 for(const r of result.rows){if(pdf.y>737){pdf.addPage();header();}const y=pdf.y;pdf.fillColor('#24394f').fontSize(9).text(String(r.nome),48,y,{width:215}).text(fmt(r.compras),275,y,{width:60,align:'right'}).text(fmt(r.itens),345,y,{width:72,align:'right'}).text(sec(r.segundos),427,y,{width:115,align:'right'});pdf.y=Math.max(pdf.y,y+23);pdf.strokeColor('#e1eaf3').moveTo(42,pdf.y).lineTo(552,pdf.y).stroke();pdf.y+=6;}
 pdf.moveDown(1).fillColor('#637b8f').fontSize(8).text('Indicadores derivados do CSV VIP. Ranking por volume, não por eficiência; as médias não levam em conta complexidade ou jornada.');
 pdf.end();
}));
router.use((err,req,res,next)=>{if(res.headersSent)return next(err);console.error('Produtividade e-commerce:',err);res.status(err.status|| (err instanceof multer.MulterError?400:500)).json({error:err.status?err.message:err instanceof multer.MulterError?err.message:'Não foi possível processar a operação de produtividade.'})});
module.exports=router;
