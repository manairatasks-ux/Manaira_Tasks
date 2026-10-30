'use strict';
const router=require('express').Router();
const multer=require('multer');
const crypto=require('crypto');
const cloudinary=require('cloudinary').v2;
const {query,pool}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
router.use(auth,requireModuleAccess('pontos_extras'));
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const bad=(message,status=400)=>{const err=new Error(message);err.status=status;throw err};
const str=(v,max=255)=>String(v??'').trim().slice(0,max);
const money=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>999999999)bad('Valor financeiro inválido.');return n};
const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))||Number.isNaN(Date.parse(v+'T12:00:00Z')))bad('Data inválida.');return v};
const reqFields=(body,fields)=>{fields.forEach(key=>{if(!str(body[key]))bad('Informe: '+key)});};
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype))});
function setupCloud(){if(!process.env.CLOUDINARY_CLOUD_NAME||!process.env.CLOUDINARY_API_KEY||!process.env.CLOUDINARY_API_SECRET)bad('Configure Cloudinary para anexos.',503);cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true});}
function uploadCloud(file){setupCloud();return new Promise((resolve,reject)=>{const isPdf=file.mimetype==='application/pdf';const stream=cloudinary.uploader.upload_stream({folder:'manaira/pontos-extras',type:'authenticated',resource_type:isPdf?'raw':'image',public_id:crypto.randomUUID(),overwrite:false},(err,r)=>err?reject(err):resolve({id:r.public_id,format:r.format,resource_type:isPdf?'raw':'image'}));stream.end(file.buffer);});}
function fileUrl(id,format='jpg',type='image'){setupCloud();return cloudinary.utils.private_download_url(id,format,{resource_type:type,type:'authenticated',expires_at:Math.floor(Date.now()/1000)+300,attachment:false});}
router.get('/dashboard',wrap(async(req,res)=>{const [p,f,c,fin]=await Promise.all([
 query('SELECT COUNT(*)::int AS total FROM pe_pontos'),query('SELECT COUNT(*)::int AS total FROM pe_fornecedores'),query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE inicio<=CURRENT_DATE AND fim>=CURRENT_DATE)::int AS ativos FROM pe_contratos"),query("SELECT COALESCE(SUM(valor),0) AS previsto,COALESCE(SUM(pago),0) AS recebido,COALESCE(SUM(valor-pago),0) AS saldo,COALESCE(SUM(valor-pago) FILTER(WHERE vencimento<CURRENT_DATE),0) AS vencido FROM pe_cobrancas")]);res.json({pontos:p.rows[0].total,fornecedores:f.rows[0].total,contratos:c.rows[0],financeiro:fin.rows[0]});}));
router.get('/fornecedores',wrap(async(req,res)=>res.json((await query('SELECT * FROM pe_fornecedores ORDER BY nome')).rows)));
router.post('/fornecedores',wrap(async(req,res)=>{reqFields(req.body,['nome']);const b=req.body;const r=await query('INSERT INTO pe_fornecedores(nome,cnpj,contato,telefone,email) VALUES($1,$2,$3,$4,$5) RETURNING *',[str(b.nome),str(b.cnpj,25),str(b.contato),str(b.telefone,50),str(b.email)]);res.status(201).json(r.rows[0]);}));
router.put('/fornecedores/:id',wrap(async(req,res)=>{reqFields(req.body,['nome']);const b=req.body;const r=await query('UPDATE pe_fornecedores SET nome=$1,cnpj=$2,contato=$3,telefone=$4,email=$5 WHERE id=$6 RETURNING *',[str(b.nome),str(b.cnpj,25),str(b.contato),str(b.telefone,50),str(b.email),req.params.id]);if(!r.rowCount)bad('Fornecedor não encontrado.',404);res.json(r.rows[0]);}));
router.delete('/fornecedores/:id',wrap(async(req,res)=>{const r=await query('DELETE FROM pe_fornecedores WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)bad('Fornecedor não encontrado.',404);res.json({ok:true})}));
router.get('/pontos',wrap(async(req,res)=>{res.json((await query(`SELECT p.*,EXISTS(SELECT 1 FROM pe_contratos c WHERE c.ponto_id=p.id AND c.inicio<=CURRENT_DATE AND c.fim>=CURRENT_DATE) AS ocupado FROM pe_pontos p ORDER BY p.codigo`)).rows)}));
router.post('/pontos',wrap(async(req,res)=>{const b=req.body;reqFields(b,['codigo','tipo','localizacao']);const r=await query('INSERT INTO pe_pontos(codigo,tipo,localizacao,valor,observacao,x,y) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[str(b.codigo,50),str(b.tipo),str(b.localizacao),money(b.valor||0),str(b.observacao,3000),b.x==null?null:Number(b.x),b.y==null?null:Number(b.y)]);res.status(201).json(r.rows[0]);}));
router.put('/pontos/:id',wrap(async(req,res)=>{const b=req.body;reqFields(b,['codigo','tipo','localizacao']);const r=await query('UPDATE pe_pontos SET codigo=$1,tipo=$2,localizacao=$3,valor=$4,observacao=$5 WHERE id=$6 RETURNING *',[str(b.codigo,50),str(b.tipo),str(b.localizacao),money(b.valor||0),str(b.observacao,3000),req.params.id]);if(!r.rowCount)bad('Ponto não encontrado.',404);res.json(r.rows[0]);}));
router.patch('/pontos/:id/posicao',wrap(async(req,res)=>{const x=Number(req.body.x),y=Number(req.body.y);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)bad('Coordenadas inválidas.');const r=await query('UPDATE pe_pontos SET x=$1,y=$2 WHERE id=$3 RETURNING *',[x,y,req.params.id]);if(!r.rowCount)bad('Ponto não encontrado.',404);res.json(r.rows[0]);}));
router.delete('/pontos/:id',wrap(async(req,res)=>{const r=await query('DELETE FROM pe_pontos WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)bad('Ponto não encontrado.',404);res.json({ok:true})}));
router.post('/pontos/:id/foto',upload.single('foto'),wrap(async(req,res)=>{if(!req.file||req.file.mimetype==='application/pdf')bad('Envie uma foto JPG, PNG ou WEBP.');const exists=await query('SELECT id FROM pe_pontos WHERE id=$1',[req.params.id]);if(!exists.rowCount)bad('Ponto não encontrado.',404);const f=await uploadCloud(req.file);const r=await query('UPDATE pe_pontos SET foto_id=$1,foto_formato=$3 WHERE id=$2 RETURNING id',[f.id,req.params.id,f.format]);res.json({ok:true,id:r.rows[0].id});}));
router.get('/pontos/:id/foto',wrap(async(req,res)=>{const r=await query('SELECT foto_id,foto_formato FROM pe_pontos WHERE id=$1',[req.params.id]);if(!r.rowCount||!r.rows[0].foto_id)bad('Foto não encontrada.',404);res.set('Cache-Control','private,no-store');res.json({url:fileUrl(r.rows[0].foto_id,r.rows[0].foto_formato||'jpg')})}));
router.get('/contratos',wrap(async(req,res)=>{const r=await query(`SELECT c.*,p.codigo AS ponto_codigo,p.localizacao,f.nome AS fornecedor_nome FROM pe_contratos c JOIN pe_pontos p ON p.id=c.ponto_id JOIN pe_fornecedores f ON f.id=c.fornecedor_id ORDER BY c.inicio DESC,c.id DESC`);res.json(r.rows)}));
router.get('/pacotes',wrap(async(req,res)=>{res.json((await query(`SELECT p.*,f.nome AS fornecedor_nome,COALESCE(json_agg(json_build_object('id',c.ponto_id,'codigo',pt.codigo)) FILTER(WHERE c.id IS NOT NULL),'[]'::json) AS pontos FROM pe_pacotes p JOIN pe_fornecedores f ON f.id=p.fornecedor_id LEFT JOIN pe_contratos c ON c.pacote_id=p.id LEFT JOIN pe_pontos pt ON pt.id=c.ponto_id GROUP BY p.id,f.nome ORDER BY p.id DESC`)).rows)}));
async function lockAndCheck(client,pontoIds,inicio,fim,excludeId){for(const id of [...new Set(pontoIds)].sort((a,b)=>a-b)){const lock=await client.query('SELECT id FROM pe_pontos WHERE id=$1 FOR UPDATE',[id]);if(!lock.rowCount)bad('Ponto não encontrado.');const c=await client.query('SELECT id FROM pe_contratos WHERE ponto_id=$1 AND inicio<=$3::date AND fim>=$2::date AND ($4::bigint IS NULL OR id<>$4) LIMIT 1',[id,inicio,fim,excludeId||null]);if(c.rowCount)bad(`O ponto ${id} já está contratado durante o período.`,409);}}
router.post('/contratos',wrap(async(req,res)=>{const b=req.body;reqFields(b,['fornecedor_id','ponto_id','inicio','fim']);const inicio=date(b.inicio),fim=date(b.fim);if(fim<inicio)bad('Fim anterior ao início.');const client=await pool.connect();try{await client.query('BEGIN');await lockAndCheck(client,[Number(b.ponto_id)],inicio,fim);const r=await client.query('INSERT INTO pe_contratos(fornecedor_id,ponto_id,inicio,fim,valor,forma_pagamento,observacao) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[b.fornecedor_id,b.ponto_id,inicio,fim,money(b.valor),str(b.forma_pagamento,80),str(b.observacao,3000)]);await client.query('COMMIT');res.status(201).json(r.rows[0]);}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.put('/contratos/:id',wrap(async(req,res)=>{const b=req.body;reqFields(b,['fornecedor_id','ponto_id','inicio','fim']);const inicio=date(b.inicio),fim=date(b.fim);if(fim<inicio)bad('Fim anterior ao início.');const client=await pool.connect();try{await client.query('BEGIN');const atual=await client.query('SELECT * FROM pe_contratos WHERE id=$1 FOR UPDATE',[req.params.id]);if(!atual.rowCount)bad('Contrato não encontrado.',404);if(atual.rows[0].pacote_id)bad('Edite o pacote correspondente.');await lockAndCheck(client,[Number(b.ponto_id)],inicio,fim,req.params.id);const r=await client.query('UPDATE pe_contratos SET fornecedor_id=$1,ponto_id=$2,inicio=$3,fim=$4,valor=$5,forma_pagamento=$6,observacao=$7 WHERE id=$8 RETURNING *',[b.fornecedor_id,b.ponto_id,inicio,fim,money(b.valor),str(b.forma_pagamento,80),str(b.observacao,3000),req.params.id]);await client.query('COMMIT');res.json(r.rows[0]);}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.delete('/contratos/:id',wrap(async(req,res)=>{const r=await query('DELETE FROM pe_contratos WHERE id=$1 AND pacote_id IS NULL RETURNING id',[req.params.id]);if(!r.rowCount)bad('Contrato não encontrado ou vinculado a pacote.',404);res.json({ok:true})}));
router.post('/pacotes',wrap(async(req,res)=>{const b=req.body;reqFields(b,['fornecedor_id','nome','inicio','fim']);const inicio=date(b.inicio),fim=date(b.fim),pontos=[...new Set((b.pontos||[]).map(Number))];if(fim<inicio||pontos.length<2||pontos.some(x=>!Number.isInteger(x)||x<1))bad('Selecione pontos e datas válidos.');const client=await pool.connect();try{await client.query('BEGIN');await lockAndCheck(client,pontos,inicio,fim);const pacote=await client.query('INSERT INTO pe_pacotes(fornecedor_id,nome,inicio,fim,valor,forma_pagamento,observacao) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[b.fornecedor_id,str(b.nome),inicio,fim,money(b.valor),str(b.forma_pagamento,80),str(b.observacao,3000)]);for(const id of pontos)await client.query('INSERT INTO pe_contratos(fornecedor_id,ponto_id,pacote_id,inicio,fim,valor,forma_pagamento) VALUES($1,$2,$3,$4,$5,$6,0,$7)',[b.fornecedor_id,id,pacote.rows[0].id,inicio,fim,str(b.forma_pagamento,80)]);await client.query('COMMIT');res.status(201).json(pacote.rows[0]);}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.put('/pacotes/:id',wrap(async(req,res)=>{const b=req.body;reqFields(b,['fornecedor_id','nome','inicio','fim']);const inicio=date(b.inicio),fim=date(b.fim),ids=[...new Set((b.pontos||[]).map(Number))];if(fim<inicio||ids.length<2||ids.some(x=>!Number.isInteger(x)||x<1))bad('Selecione pontos e datas válidos.');const client=await pool.connect();try{await client.query('BEGIN');const old=await client.query('SELECT id FROM pe_pacotes WHERE id=$1 FOR UPDATE',[req.params.id]);if(!old.rowCount)bad('Pacote não encontrado.',404);if((await client.query('SELECT 1 FROM pe_cobrancas WHERE pacote_id=$1 LIMIT 1',[req.params.id])).rowCount)bad('Pacote com cobranças não pode ser alterado sem revisão financeira.',409);const current=await client.query('SELECT id,ponto_id FROM pe_contratos WHERE pacote_id=$1',[req.params.id]);await client.query('DELETE FROM pe_contratos WHERE pacote_id=$1',[req.params.id]);await lockAndCheck(client,ids,inicio,fim);await client.query('UPDATE pe_pacotes SET fornecedor_id=$1,nome=$2,inicio=$3,fim=$4,valor=$5,forma_pagamento=$6,observacao=$7 WHERE id=$8',[b.fornecedor_id,str(b.nome),inicio,fim,money(b.valor),str(b.forma_pagamento,80),str(b.observacao,3000),req.params.id]);for(const id of ids)await client.query('INSERT INTO pe_contratos(fornecedor_id,ponto_id,pacote_id,inicio,fim,valor,forma_pagamento) VALUES($1,$2,$3,$4,$5,0,$6)',[b.fornecedor_id,id,req.params.id,inicio,fim,str(b.forma_pagamento,80)]);await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.delete('/pacotes/:id',wrap(async(req,res)=>{const client=await pool.connect();try{await client.query('BEGIN');if((await client.query('SELECT id FROM pe_cobrancas WHERE pacote_id=$1 LIMIT 1',[req.params.id])).rowCount)bad('Pacote possui cobranças vinculadas.',409);await client.query('DELETE FROM pe_contratos WHERE pacote_id=$1',[req.params.id]);const r=await client.query('DELETE FROM pe_pacotes WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)bad('Pacote não encontrado.',404);await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.get('/cobrancas',wrap(async(req,res)=>{res.json((await query(`SELECT c.*,COALESCE(f.nome,fp.nome) AS fornecedor_nome,CASE WHEN c.pacote_id IS NULL THEN 'individual' ELSE 'pacote' END AS origem,COALESCE(pt.codigo,pc.nome) AS referencia FROM pe_cobrancas c LEFT JOIN pe_contratos ct ON ct.id=c.contrato_id LEFT JOIN pe_fornecedores f ON f.id=ct.fornecedor_id LEFT JOIN pe_pontos pt ON pt.id=ct.ponto_id LEFT JOIN pe_pacotes pc ON pc.id=c.pacote_id LEFT JOIN pe_fornecedores fp ON fp.id=pc.fornecedor_id ORDER BY c.vencimento DESC,c.id DESC`)).rows)}));
router.post('/cobrancas',wrap(async(req,res)=>{const b=req.body;if(!['individual','pacote'].includes(b.origem))bad('Origem inválida.');if(!/^\d{4}-\d{2}$/.test(b.competencia||''))bad('Competência inválida (AAAA-MM).');const r=await query('INSERT INTO pe_cobrancas(contrato_id,pacote_id,competencia,vencimento,valor) VALUES($1,$2,$3,$4,$5) RETURNING *',[b.origem==='individual'?b.referencia_id:null,b.origem==='pacote'?b.referencia_id:null,b.competencia,date(b.vencimento),money(b.valor)]);res.status(201).json(r.rows[0]);}));
// V71.6 — auditoria de edição e exclusão financeira (migração aditiva)
async function gravarAuditoria(client,req,tipo,id,acao,antes,depois,motivo){
 await client.query(`INSERT INTO pe_financeiro_auditoria(tipo,registro_id,acao,antes,depois,motivo,usuario_id)
 VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,[tipo,id,acao,JSON.stringify(antes||null),JSON.stringify(depois||null),str(motivo,2000),req.user.id]);
}
async function transacao(fn){const client=await pool.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
router.put('/cobrancas/:id',wrap(async(req,res)=>{
 const b=req.body; if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(b.competencia||'')))bad('Competência inválida.');
 const venc=date(b.vencimento),valor=money(b.valor);if(valor<=0)bad('O valor deve ser positivo.');
 const result=await transacao(async client=>{
  const found=await client.query('SELECT * FROM pe_cobrancas WHERE id=$1 FOR UPDATE',[req.params.id]);if(!found.rowCount)bad('Mensalidade não encontrada.',404);
  const old=found.rows[0];if(valor+0.00001<Number(old.pago))bad('Novo valor não pode ser menor que o total recebido.',409);
  const r=await client.query('UPDATE pe_cobrancas SET competencia=$1,vencimento=$2,valor=$3 WHERE id=$4 RETURNING *',[b.competencia,venc,valor,req.params.id]);
  await gravarAuditoria(client,req,'cobranca',old.id,'EDITAR',old,r.rows[0],b.motivo);return r.rows[0];
 });res.json(result);
}));
router.delete('/cobrancas/:id',wrap(async(req,res)=>{
 const result=await transacao(async client=>{
  const found=await client.query('SELECT * FROM pe_cobrancas WHERE id=$1 FOR UPDATE',[req.params.id]);if(!found.rowCount)bad('Mensalidade não encontrada.',404);
  const old=found.rows[0];const pagamentos=await client.query('SELECT 1 FROM pe_recebimentos WHERE cobranca_id=$1 LIMIT 1',[req.params.id]);
  if(pagamentos.rowCount||Number(old.pago)>0)bad('Esta mensalidade já possui recebimentos. Exclua ou corrija as baixas primeiro.',409);
  await gravarAuditoria(client,req,'cobranca',old.id,'EXCLUIR',old,null,req.body?.motivo);
  await client.query('DELETE FROM pe_cobrancas WHERE id=$1',[old.id]);return {ok:true};
 });res.json(result);
}));
router.put('/recebimentos/:id',wrap(async(req,res)=>{
 const b=req.body;reqFields(b,['data','modalidade']);const valor=money(b.valor);if(valor<=0)bad('O valor recebido deve ser positivo.');
 const result=await transacao(async client=>{
  const reference=await client.query('SELECT cobranca_id FROM pe_recebimentos WHERE id=$1',[req.params.id]);if(!reference.rowCount)bad('Recebimento não encontrado.',404);
  const cob=await client.query('SELECT * FROM pe_cobrancas WHERE id=$1 FOR UPDATE',[reference.rows[0].cobranca_id]);if(!cob.rowCount)bad('Mensalidade não encontrada.',404);
  const found=await client.query('SELECT * FROM pe_recebimentos WHERE id=$1 FOR UPDATE',[req.params.id]);if(!found.rowCount)bad('Recebimento não encontrado.',404);
  const old=found.rows[0];const novoPago=Number(cob.rows[0].pago)-Number(old.valor)+valor;
  if(novoPago>Number(cob.rows[0].valor)+0.00001)bad('Valor excede o total da mensalidade.',409);
  if(novoPago<0)bad('Saldo financeiro inconsistente.',409);
  const r=await client.query('UPDATE pe_recebimentos SET data=$1,valor=$2,modalidade=$3,observacao=$4 WHERE id=$5 RETURNING *',[date(b.data),valor,str(b.modalidade,80),str(b.observacao,2000),old.id]);
  await client.query('UPDATE pe_cobrancas SET pago=$1 WHERE id=$2',[Number(novoPago.toFixed(2)),old.cobranca_id]);
  await gravarAuditoria(client,req,'recebimento',old.id,'EDITAR',old,r.rows[0],b.motivo);return r.rows[0];
 });res.json(result);
}));
router.delete('/recebimentos/:id',wrap(async(req,res)=>{
 const motivo=str(req.body?.motivo,2000);if(!motivo)bad('Informe o motivo da exclusão.');
 const result=await transacao(async client=>{
  const reference=await client.query('SELECT cobranca_id FROM pe_recebimentos WHERE id=$1',[req.params.id]);if(!reference.rowCount)bad('Recebimento não encontrado.',404);
  const cob=await client.query('SELECT * FROM pe_cobrancas WHERE id=$1 FOR UPDATE',[reference.rows[0].cobranca_id]);if(!cob.rowCount)bad('Mensalidade não encontrada.',404);
  const found=await client.query('SELECT * FROM pe_recebimentos WHERE id=$1 FOR UPDATE',[req.params.id]);if(!found.rowCount)bad('Recebimento não encontrado.',404);
  const old=found.rows[0];const novoPago=Number(cob.rows[0].pago)-Number(old.valor);
  if(novoPago<0)bad('Saldo financeiro inconsistente.',409);
  await gravarAuditoria(client,req,'recebimento',old.id,'EXCLUIR',old,null,motivo);
  await client.query('DELETE FROM pe_recebimentos WHERE id=$1',[old.id]);
  await client.query('UPDATE pe_cobrancas SET pago=$1 WHERE id=$2',[Number(novoPago.toFixed(2)),old.cobranca_id]);return {ok:true};
 });res.json(result);
}));
router.get('/recebimentos',wrap(async(req,res)=>{res.json((await query('SELECT r.*,c.competencia,c.vencimento FROM pe_recebimentos r JOIN pe_cobrancas c ON c.id=r.cobranca_id ORDER BY r.data DESC,r.id DESC')).rows)}));
router.post('/cobrancas/:id/receber',wrap(async(req,res)=>{const b=req.body;reqFields(b,['data','modalidade']);const valor=money(b.valor);if(valor<=0)bad('Informe valor positivo.');const client=await pool.connect();try{await client.query('BEGIN');const c=await client.query('SELECT * FROM pe_cobrancas WHERE id=$1 FOR UPDATE',[req.params.id]);if(!c.rowCount)bad('Cobrança não encontrada.',404);if(Number(c.rows[0].pago)+valor>Number(c.rows[0].valor)+0.00001)bad('Recebimento supera saldo da cobrança.',409);const r=await client.query('INSERT INTO pe_recebimentos(cobranca_id,data,valor,modalidade,observacao,usuario_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.params.id,date(b.data),valor,str(b.modalidade,80),str(b.observacao,2000),req.user.id]);await client.query('UPDATE pe_cobrancas SET pago=pago+$1 WHERE id=$2',[valor,req.params.id]);await client.query('COMMIT');res.status(201).json(r.rows[0]);}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.post('/anexo',upload.single('arquivo'),wrap(async(req,res)=>{if(!req.file)bad('Arquivo obrigatório.');const f=await uploadCloud(req.file);res.json(f)}));

// Armazena referências de anexos em registros existentes; não expõe identificadores arbitrários.
router.post('/contratos/:id/anexo',upload.single('arquivo'),wrap(async(req,res)=>{
 if(!req.file)bad('Selecione um arquivo.');
 const check=await query('SELECT id FROM pe_contratos WHERE id=$1 AND pacote_id IS NULL',[req.params.id]);if(!check.rowCount)bad('Contrato não encontrado.',404);
 const f=await uploadCloud(req.file);
 await query('UPDATE pe_contratos SET arquivo_id=$1 WHERE id=$2',[f.id,req.params.id]);res.json({ok:true});
}));
router.post('/pacotes/:id/anexo',upload.single('arquivo'),wrap(async(req,res)=>{
 if(!req.file)bad('Selecione um arquivo.');
 const check=await query('SELECT id FROM pe_pacotes WHERE id=$1',[req.params.id]);if(!check.rowCount)bad('Pacote não encontrado.',404);
 const f=await uploadCloud(req.file);
 await query('UPDATE pe_pacotes SET arquivo_id=$1 WHERE id=$2',[f.id,req.params.id]);res.json({ok:true});
}));
router.post('/recebimentos/:id/comprovante',upload.single('arquivo'),wrap(async(req,res)=>{
 if(!req.file)bad('Selecione um arquivo.');
 const check=await query('SELECT id FROM pe_recebimentos WHERE id=$1',[req.params.id]);if(!check.rowCount)bad('Recebimento não encontrado.',404);
 const f=await uploadCloud(req.file);
 await query('UPDATE pe_recebimentos SET comprovante_id=$1 WHERE id=$2',[f.id,req.params.id]);res.json({ok:true});
}));
// Associa o anexo diretamente ao item da cobrança em vez de gravar no disco local.
router.get('/pontos/:id/contratos',wrap(async(req,res)=>{
 const rows=await query(`SELECT c.*,f.nome AS fornecedor_nome,p.nome AS pacote_nome
 FROM pe_contratos c JOIN pe_fornecedores f ON f.id=c.fornecedor_id
 LEFT JOIN pe_pacotes p ON p.id=c.pacote_id WHERE c.ponto_id=$1 ORDER BY c.inicio DESC`,[req.params.id]);res.json(rows.rows)
}));
router.get('/anexo',wrap(async(req,res)=>{const tipo=req.query.tipo, id=req.query.id, campo=req.query.campo;if(![['pe_contratos','arquivo_id'],['pe_pacotes','arquivo_id'],['pe_recebimentos','comprovante_id']].some(([a,b])=>a===tipo&&b===campo))bad('Tipo de arquivo inválido.');const r=await query(`SELECT ${campo} FROM ${tipo} WHERE id=$1`,[id]);if(!r.rowCount||!r.rows[0][campo])bad('Arquivo não encontrado.',404);const publicId=r.rows[0][campo];setupCloud();
 let info=null;for(const resource_type of ['image','raw']){try{info=await cloudinary.api.resource(publicId,{resource_type,type:'authenticated'});break}catch(e){if(e.http_code!==404)throw e}}
 if(!info)bad('Arquivo não encontrado no armazenamento.',404);
 res.json({url:fileUrl(publicId,info.format||'jpg',info.resource_type||'image')})}));
router.use((err,req,res,next)=>{if(res.headersSent)return next(err);console.error('Pontos Extras:',err.message);res.status(err.status||((err.code==='23505'||err.code==='23503')?409:500)).json({error:err.status?err.message:err.code==='23505'?'Já existe cadastro com esta referência.':err.code==='23503'?'Há registros vinculados que impedem esta operação.':'Falha ao processar operação de Pontos Extras.'})});
module.exports=router;
