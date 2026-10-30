'use strict';
const router=require('express').Router();
const multer=require('multer');
const crypto=require('crypto');
const cloudinary=require('cloudinary').v2;
const {query,pool}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
router.use(auth,requireModuleAccess('pontos_extras'));

// V71.9 — Trilha de auditoria geral. Registros somente leitura pela interface.
// O histórico financeiro anterior também permanece disponível na tabela legada.
const ENTIDADES_AUDITADAS={fornecedores:'Fornecedor',pontos:'Ponto',contratos:'Contrato',pacotes:'Pacote',cobrancas:'Cobrança',recebimentos:'Recebimento'};
const ROTAS_AUDITADAS=new Set(['POST','PUT','PATCH','DELETE']);
const camposAuditados={
 fornecedores:['nome','cnpj','contato','telefone','email'],
 pontos:['codigo','tipo','localizacao','valor','observacao','x','y','foto_id','foto_formato'],
 contratos:['fornecedor_id','ponto_id','pacote_id','inicio','fim','valor','modelo_valor','forma_pagamento','observacao','arquivo_id'],
 pacotes:['fornecedor_id','nome','inicio','fim','valor','modelo_valor','forma_pagamento','observacao','arquivo_id'],
 cobrancas:['contrato_id','pacote_id','competencia','vencimento','valor','pago'],
 recebimentos:['cobranca_id','data','valor','modalidade','observacao','comprovante_id']
};
function auditCampos(entidade,row){
 if(!row||typeof row!=='object')return null;
 return Object.fromEntries(camposAuditados[entidade].filter(k=>Object.prototype.hasOwnProperty.call(row,k)).map(k=>[k,row[k]]));
}
// Captura o estado prévio antes de uma edição ou exclusão, mesmo se a linha desaparecer depois.
router.use(async(req,res,next)=>{
 if(!ROTAS_AUDITADAS.has(req.method))return next();
 const partes=req.path.split('/').filter(Boolean);
 const entidade=partes[0];if(!ENTIDADES_AUDITADAS[entidade])return next();
 // Um upload simples em /anexo ainda não está vinculado a qualquer registro; o vínculo será auditado.
 const id=/^\d+$/.test(partes[1]||'')?Number(partes[1]):null;
 let anterior=null;
 try{
  if(id && req.method!=='POST'){
   const row=await query(`SELECT * FROM pe_${entidade} WHERE id=$1`,[id]);
   anterior=row.rows[0]||null;
  }
 }catch(err){return next(err)}
 const send=res.json.bind(res);
 res.json=function(payload){
  if(res.statusCode>=200&&res.statusCode<300){
   const acao=partes[1]==='programar'?'PROGRAMAR':req.method==='DELETE'?'EXCLUIR':req.method==='PUT'?'EDITAR':req.method==='PATCH'?'ALTERAR':partes[2]==='receber'?'RECEBER':partes[2]==='foto'?'FOTO':partes[2]==='anexo'?'ANEXO':partes[2]==='comprovante'?'COMPROVANTE':'CADASTRAR';
   const alvo=partes[2]==='receber'?'recebimentos':entidade;
   const codigo=payload&&typeof payload==='object'&&payload.id?Number(payload.id):id;
   const depois=payload&&typeof payload==='object'?auditCampos(alvo,payload):null;
   const before=auditCampos(entidade,anterior);
   const extra=partes.length>2?{operacao:partes.slice(2).join('/'),registro_origem:id}:{};
   const after=partes[1]==='programar'?{parcelas_criadas:payload.ids||[],origem:req.body?.origem,referencia_id:req.body?.referencia_id,parcelas:req.body?.parcelas}:depois?{...depois,...extra}:Object.keys(extra).length?extra:null;
   // Exceções de falha são registradas no servidor, sem ocultar que a ação principal já foi concluída.
   query(`INSERT INTO pe_auditoria_geral (entidade,registro_id,acao,usuario_id,dados_anteriores,dados_novos,motivo)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
     [alvo,codigo,acao,req.user?.id||null,JSON.stringify(before),JSON.stringify(after),String(req.body?.motivo||'').slice(0,2000)]
   ).catch(err=>console.error('[Pontos Extras] Falha ao gravar auditoria:',err.message));
  }
  return send(payload);
 };
 next();
});

// Histórico geral + alterações financeiras anteriores à V71.9.
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
router.get('/auditoria',wrap(async(req,res)=>{
 const entidade=String(req.query.entidade||'');
 const acao=String(req.query.acao||'');
 const inicio=req.query.inicio?date(req.query.inicio):null;
 const fim=req.query.fim?date(req.query.fim):null;
 const busca=String(req.query.busca||'').trim().slice(0,120);
 const tamanho=Math.min(100,Math.max(10,Number(req.query.limite)||50));
 const pagina=Math.min(10000,Math.max(1,Number(req.query.pagina)||1));
 const registros=await query(`
   WITH eventos AS (
     SELECT g.id::text AS identificador, g.entidade, g.registro_id, g.acao,
            g.usuario_id, u.nome AS usuario, g.dados_anteriores AS antes,
            g.dados_novos AS depois, g.motivo, g.criado_em, 'geral'::text AS origem
       FROM pe_auditoria_geral g LEFT JOIN usuarios u ON u.id=g.usuario_id
     UNION ALL
     SELECT ('f'||f.id::text), CASE WHEN f.tipo='cobranca' THEN 'cobrancas' ELSE 'recebimentos' END,
            f.registro_id, f.acao, f.usuario_id, u.nome, f.antes, f.depois,
            f.motivo,f.criado_em,'financeiro'::text
       FROM pe_financeiro_auditoria f LEFT JOIN usuarios u ON u.id=f.usuario_id
       WHERE NOT EXISTS (SELECT 1 FROM pe_auditoria_geral g
         WHERE g.entidade=CASE WHEN f.tipo='cobranca' THEN 'cobrancas' ELSE 'recebimentos' END
           AND g.registro_id=f.registro_id AND g.acao=f.acao
           AND g.criado_em BETWEEN f.criado_em - INTERVAL '2 minutes' AND f.criado_em + INTERVAL '2 minutes')
   )
   SELECT * FROM eventos
   WHERE ($1::text='' OR entidade=$1) AND ($2::text='' OR acao=$2)
     AND ($3::date IS NULL OR criado_em>=($3::date)::timestamp AT TIME ZONE 'America/Fortaleza')
     AND ($4::date IS NULL OR criado_em<(($4::date+1)::timestamp AT TIME ZONE 'America/Fortaleza'))
     AND ($5::text='' OR COALESCE(usuario,'') ILIKE '%'||$5||'%'
       OR COALESCE(registro_id::text,'') ILIKE '%'||$5||'%'
       OR COALESCE(depois::text,'') ILIKE '%'||$5||'%'
       OR COALESCE(antes::text,'') ILIKE '%'||$5||'%')
   ORDER BY criado_em DESC,identificador DESC LIMIT $6 OFFSET $7`,
   [entidade,acao,inicio,fim,busca,tamanho+1,(pagina-1)*tamanho]);
 res.set('Cache-Control','no-store');
 res.json({registros:registros.rows.slice(0,tamanho),pagina,mais:registros.rows.length>tamanho});
}));

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
router.post('/contratos',wrap(async(req,res)=>{const b=req.body;reqFields(b,['fornecedor_id','ponto_id','inicio','fim']);const inicio=date(b.inicio),fim=date(b.fim);if(fim<inicio)bad('Fim anterior ao início.');const client=await pool.connect();try{await client.query('BEGIN');await lockAndCheck(client,[Number(b.ponto_id)],inicio,fim);const r=await client.query('INSERT INTO pe_contratos(fornecedor_id,ponto_id,inicio,fim,valor,forma_pagamento,observacao) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[b.fornecedor_id,b.ponto_id,inicio,fim,money(b.valor),str(b.forma_pagamento,80),str(b.observacao,3000)]);await client.query("UPDATE pe_contratos SET modelo_valor='total' WHERE id=$1",[r.rows[0].id]);await client.query('COMMIT');res.status(201).json(r.rows[0]);}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.put('/contratos/:id',wrap(async(req,res)=>{const b=req.body;reqFields(b,['fornecedor_id','ponto_id','inicio','fim']);const inicio=date(b.inicio),fim=date(b.fim);if(fim<inicio)bad('Fim anterior ao início.');const client=await pool.connect();try{await client.query('BEGIN');const atual=await client.query('SELECT * FROM pe_contratos WHERE id=$1 FOR UPDATE',[req.params.id]);if(!atual.rowCount)bad('Contrato não encontrado.',404);if(atual.rows[0].pacote_id)bad('Edite o pacote correspondente.');await lockAndCheck(client,[Number(b.ponto_id)],inicio,fim,req.params.id);if(atual.rows[0].modelo_valor==='total'){const financeiro=await client.query('SELECT COALESCE(SUM(valor),0) AS programado FROM pe_cobrancas WHERE contrato_id=$1',[req.params.id]);if(money(b.valor)+.001<Number(financeiro.rows[0].programado))bad('Valor contratado não pode ficar abaixo das parcelas programadas.',409);}const r=await client.query('UPDATE pe_contratos SET fornecedor_id=$1,ponto_id=$2,inicio=$3,fim=$4,valor=$5,forma_pagamento=$6,observacao=$7 WHERE id=$8 RETURNING *',[b.fornecedor_id,b.ponto_id,inicio,fim,money(b.valor),str(b.forma_pagamento,80),str(b.observacao,3000),req.params.id]);await client.query('COMMIT');res.json(r.rows[0]);}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.delete('/contratos/:id',wrap(async(req,res)=>{const r=await query('DELETE FROM pe_contratos WHERE id=$1 AND pacote_id IS NULL RETURNING id',[req.params.id]);if(!r.rowCount)bad('Contrato não encontrado ou vinculado a pacote.',404);res.json({ok:true})}));
router.post('/pacotes',wrap(async(req,res)=>{const b=req.body;reqFields(b,['fornecedor_id','nome','inicio','fim']);const inicio=date(b.inicio),fim=date(b.fim),pontos=[...new Set((b.pontos||[]).map(Number))];if(fim<inicio||pontos.length<2||pontos.some(x=>!Number.isInteger(x)||x<1))bad('Selecione pontos e datas válidos.');const client=await pool.connect();try{await client.query('BEGIN');await lockAndCheck(client,pontos,inicio,fim);const pacote=await client.query('INSERT INTO pe_pacotes(fornecedor_id,nome,inicio,fim,valor,forma_pagamento,observacao) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[b.fornecedor_id,str(b.nome),inicio,fim,money(b.valor),str(b.forma_pagamento,80),str(b.observacao,3000)]);await client.query("UPDATE pe_pacotes SET modelo_valor='total' WHERE id=$1",[pacote.rows[0].id]);for(const id of pontos)await client.query('INSERT INTO pe_contratos(fornecedor_id,ponto_id,pacote_id,inicio,fim,valor,forma_pagamento) VALUES($1,$2,$3,$4,$5,$6,0,$7)',[b.fornecedor_id,id,pacote.rows[0].id,inicio,fim,str(b.forma_pagamento,80)]);await client.query('COMMIT');res.status(201).json(pacote.rows[0]);}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.put('/pacotes/:id',wrap(async(req,res)=>{const b=req.body;reqFields(b,['fornecedor_id','nome','inicio','fim']);const inicio=date(b.inicio),fim=date(b.fim),ids=[...new Set((b.pontos||[]).map(Number))];if(fim<inicio||ids.length<2||ids.some(x=>!Number.isInteger(x)||x<1))bad('Selecione pontos e datas válidos.');const client=await pool.connect();try{await client.query('BEGIN');const old=await client.query('SELECT id FROM pe_pacotes WHERE id=$1 FOR UPDATE',[req.params.id]);if(!old.rowCount)bad('Pacote não encontrado.',404);if((await client.query('SELECT 1 FROM pe_cobrancas WHERE pacote_id=$1 LIMIT 1',[req.params.id])).rowCount)bad('Pacote com cobranças não pode ser alterado sem revisão financeira.',409);const current=await client.query('SELECT id,ponto_id FROM pe_contratos WHERE pacote_id=$1',[req.params.id]);await client.query('DELETE FROM pe_contratos WHERE pacote_id=$1',[req.params.id]);await lockAndCheck(client,ids,inicio,fim);await client.query('UPDATE pe_pacotes SET fornecedor_id=$1,nome=$2,inicio=$3,fim=$4,valor=$5,forma_pagamento=$6,observacao=$7 WHERE id=$8',[b.fornecedor_id,str(b.nome),inicio,fim,money(b.valor),str(b.forma_pagamento,80),str(b.observacao,3000),req.params.id]);for(const id of ids)await client.query('INSERT INTO pe_contratos(fornecedor_id,ponto_id,pacote_id,inicio,fim,valor,forma_pagamento) VALUES($1,$2,$3,$4,$5,0,$6)',[b.fornecedor_id,id,req.params.id,inicio,fim,str(b.forma_pagamento,80)]);await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.delete('/pacotes/:id',wrap(async(req,res)=>{const client=await pool.connect();try{await client.query('BEGIN');if((await client.query('SELECT id FROM pe_cobrancas WHERE pacote_id=$1 LIMIT 1',[req.params.id])).rowCount)bad('Pacote possui cobranças vinculadas.',409);await client.query('DELETE FROM pe_contratos WHERE pacote_id=$1',[req.params.id]);const r=await client.query('DELETE FROM pe_pacotes WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)bad('Pacote não encontrado.',404);await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.get('/cobrancas',wrap(async(req,res)=>{res.json((await query(`SELECT c.*,COALESCE(f.nome,fp.nome) AS fornecedor_nome,CASE WHEN c.pacote_id IS NULL THEN 'individual' ELSE 'pacote' END AS origem,COALESCE(pt.codigo,pc.nome) AS referencia FROM pe_cobrancas c LEFT JOIN pe_contratos ct ON ct.id=c.contrato_id LEFT JOIN pe_fornecedores f ON f.id=ct.fornecedor_id LEFT JOIN pe_pontos pt ON pt.id=ct.ponto_id LEFT JOIN pe_pacotes pc ON pc.id=c.pacote_id LEFT JOIN pe_fornecedores fp ON fp.id=pc.fornecedor_id ORDER BY c.vencimento DESC,c.id DESC`)).rows)}));
router.post('/cobrancas',wrap(async(req,res)=>{const b=req.body;if(!['individual','pacote'].includes(b.origem))bad('Origem inválida.');if(!/^\d{4}-\d{2}$/.test(b.competencia||''))bad('Competência inválida (AAAA-MM).');const valor=money(b.valor);if(valor<=0)bad('Valor da parcela deve ser positivo.');const client=await pool.connect();try{await client.query('BEGIN');const tabela=b.origem==='individual'?'pe_contratos':'pe_pacotes';const coluna=b.origem==='individual'?'contrato_id':'pacote_id';const contrato=await client.query(`SELECT id,valor,modelo_valor FROM ${tabela} WHERE id=$1 FOR UPDATE`,[b.referencia_id]);if(!contrato.rowCount)bad('Contrato não encontrado.',404);if(contrato.rows[0].modelo_valor==='total'){const total=await client.query(`SELECT COALESCE(SUM(valor),0) AS total FROM pe_cobrancas WHERE ${coluna}=$1`,[b.referencia_id]);if(Number(total.rows[0].total)+valor>Number(contrato.rows[0].valor)+0.001)bad('A soma das parcelas ultrapassa o valor total contratado.',409);}const r=await client.query('INSERT INTO pe_cobrancas(contrato_id,pacote_id,competencia,vencimento,valor) VALUES($1,$2,$3,$4,$5) RETURNING *',[b.origem==='individual'?b.referencia_id:null,b.origem==='pacote'?b.referencia_id:null,b.competencia,date(b.vencimento),valor]);await client.query('COMMIT');res.status(201).json(r.rows[0]);}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
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
  const ref=found.rows[0];if(ref.contrato_id||ref.pacote_id){const tabela=ref.contrato_id?'pe_contratos':'pe_pacotes';const refid=ref.contrato_id||ref.pacote_id;const entidade=await client.query(`SELECT id,valor,modelo_valor FROM ${tabela} WHERE id=$1 FOR UPDATE`,[refid]);if(entidade.rows[0]?.modelo_valor==='total'){const col=ref.contrato_id?'contrato_id':'pacote_id';const outros=await client.query(`SELECT COALESCE(SUM(valor),0) AS total FROM pe_cobrancas WHERE ${col}=$1 AND id<>$2`,[refid,req.params.id]);if(Number(outros.rows[0].total)+valor>Number(entidade.rows[0].valor)+.001)bad('A soma das parcelas ultrapassa o contrato.',409);}}const r=await client.query('UPDATE pe_cobrancas SET competencia=$1,vencimento=$2,valor=$3 WHERE id=$4 RETURNING *',[b.competencia,venc,valor,req.params.id]);
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


// Programação em lote: todas as parcelas são verificadas e gravadas na mesma transação.
router.post('/cobrancas/programar',wrap(async(req,res)=>{const b=req.body,origem=b.origem;if(!['individual','pacote'].includes(origem))bad('Tipo inválido.');const itens=b.parcelas;if(!Array.isArray(itens)||!itens.length||itens.length>120)bad('Informe entre 1 e 120 parcelas.');const id=Number(b.referencia_id);if(!Number.isSafeInteger(id)||id<1)bad('Contrato inválido.');const client=await pool.connect();try{await client.query('BEGIN');const tabela=origem==='individual'?'pe_contratos':'pe_pacotes';const col=origem==='individual'?'contrato_id':'pacote_id';const result=await client.query(`SELECT id,valor,modelo_valor FROM ${tabela} WHERE id=$1 FOR UPDATE`,[id]);if(!result.rowCount)bad('Contrato não encontrado.',404);const novo=itens.map(i=>({competencia:String(i.competencia),vencimento:date(i.vencimento),valor:money(i.valor)}));if(novo.some(x=>!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(x.competencia)||x.valor<=0))bad('Competência ou valor inválido.');if(new Set(novo.map(x=>x.competencia)).size!==novo.length)bad('Existem competências repetidas.');const existing=await client.query(`SELECT competencia,valor FROM pe_cobrancas WHERE ${col}=$1`,[id]);const keys=new Set(existing.rows.map(i=>i.competencia));if(novo.some(x=>keys.has(x.competencia)))bad('Já existe uma cobrança cadastrada para uma dessas competências.',409);const soma=novo.reduce((a,x)=>a+x.valor,existing.rows.reduce((a,x)=>a+Number(x.valor),0));if(result.rows[0].modelo_valor==='total'&&soma>Number(result.rows[0].valor)+.001)bad('A soma das parcelas ultrapassa o total contratado.',409);const created=[];for(const x of novo){const v=await client.query('INSERT INTO pe_cobrancas(contrato_id,pacote_id,competencia,vencimento,valor) VALUES($1,$2,$3,$4,$5) RETURNING id',[origem==='individual'?id:null,origem==='pacote'?id:null,x.competencia,x.vencimento,x.valor]);created.push(v.rows[0].id)}await client.query('COMMIT');res.status(201).json({ok:true,ids:created});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.get('/resumo-contratos',wrap(async(req,res)=>{const r=await query(`SELECT x.tipo,x.id,x.fornecedor_id,x.fornecedor,x.referencia,x.valor,x.modelo_valor,COALESCE(y.programado,0) AS programado,COALESCE(y.pago,0) AS pago FROM (SELECT 'individual' AS tipo,c.id,c.fornecedor_id,f.nome AS fornecedor,p.codigo AS referencia,c.valor,c.modelo_valor FROM pe_contratos c JOIN pe_fornecedores f ON f.id=c.fornecedor_id JOIN pe_pontos p ON p.id=c.ponto_id WHERE c.pacote_id IS NULL UNION ALL SELECT 'pacote',pc.id,pc.fornecedor_id,f.nome,pc.nome,pc.valor,pc.modelo_valor FROM pe_pacotes pc JOIN pe_fornecedores f ON f.id=pc.fornecedor_id) x LEFT JOIN LATERAL (SELECT SUM(valor) programado,SUM(pago) pago FROM pe_cobrancas WHERE (x.tipo='individual' AND contrato_id=x.id) OR (x.tipo='pacote' AND pacote_id=x.id)) y ON true ORDER BY x.fornecedor,x.tipo,x.id`);res.json(r.rows)}));

// V71.8 — Relatórios financeiros: filtros exclusivamente no servidor, respeitando permissões.
const PDFDocument=require('pdfkit');
const validReportTypes=new Set(['abertos','quitados','fornecedor','consolidado','modalidade']);
async function dadosRelatorio(q){
 const tipo=String(q.tipo||'consolidado');if(!validReportTypes.has(tipo))bad('Relatório inválido.');
 const fornecedorId=q.fornecedor_id?Number(q.fornecedor_id):null;
 if(q.fornecedor_id&&(!Number.isSafeInteger(fornecedorId)||fornecedorId<1))bad('Fornecedor inválido.');
 const inicio=q.inicio?date(q.inicio):null,fim=q.fim?date(q.fim):null;
 if(inicio&&fim&&inicio>fim)bad('Período inválido.');
 const rows=(await query(`SELECT c.id,c.competencia,c.vencimento,c.valor,c.pago,c.contrato_id,c.pacote_id,
 COALESCE(fc.id,fp.id) AS fornecedor_id,COALESCE(fc.nome,fp.nome) AS fornecedor,
 COALESCE(pt.codigo,pc.nome) AS referencia, CASE WHEN c.pacote_id IS NULL THEN 'Individual' ELSE 'Pacote' END AS natureza
 FROM pe_cobrancas c LEFT JOIN pe_contratos ct ON ct.id=c.contrato_id
 LEFT JOIN pe_fornecedores fc ON fc.id=ct.fornecedor_id LEFT JOIN pe_pontos pt ON pt.id=ct.ponto_id
 LEFT JOIN pe_pacotes pc ON pc.id=c.pacote_id LEFT JOIN pe_fornecedores fp ON fp.id=pc.fornecedor_id
 WHERE ($1::bigint IS NULL OR COALESCE(fc.id,fp.id)=$1)
 AND ($2::date IS NULL OR c.vencimento>=$2) AND ($3::date IS NULL OR c.vencimento<=$3)
 ORDER BY fornecedor,c.vencimento,c.id`,[fornecedorId,inicio,fim])).rows;
 const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Fortaleza'});
 const itens=rows.map(x=>{const saldo=Math.max(0,Number(x.valor)-Number(x.pago));return {...x,saldo,status:saldo<=.001?'Quitado':x.vencimento.toISOString().slice(0,10)<hoje?'Atrasado':Number(x.pago)>0?'Parcial':'Em aberto'}});
 const filtered=itens.filter(x=>tipo==='abertos'?x.saldo>.001:tipo==='quitados'?x.saldo<=.001:true);
 const recs=(await query(`SELECT r.id,r.cobranca_id,r.data,r.valor,r.modalidade,r.observacao,r.comprovante_id,
 COALESCE(fc.id,fp.id) AS fornecedor_id,COALESCE(fc.nome,fp.nome) AS fornecedor
 FROM pe_recebimentos r JOIN pe_cobrancas c ON c.id=r.cobranca_id
 LEFT JOIN pe_contratos ct ON ct.id=c.contrato_id LEFT JOIN pe_fornecedores fc ON fc.id=ct.fornecedor_id
 LEFT JOIN pe_pacotes pc ON pc.id=c.pacote_id LEFT JOIN pe_fornecedores fp ON fp.id=pc.fornecedor_id
 WHERE ($1::bigint IS NULL OR COALESCE(fc.id,fp.id)=$1)
 AND ($2::date IS NULL OR r.data>=$2) AND ($3::date IS NULL OR r.data<=$3)
 ORDER BY r.data DESC,r.id DESC`,[fornecedorId,inicio,fim])).rows;
 const totais=filtered.reduce((a,x)=>{a.valor+=Number(x.valor);a.pago+=Number(x.pago);a.saldo+=x.saldo;if(x.status==='Atrasado')a.vencido+=x.saldo;return a},{valor:0,pago:0,saldo:0,vencido:0});
 const porModalidade={};for(const r of recs){const key=r.modalidade||'Não informada';porModalidade[key]=(porModalidade[key]||0)+Number(r.valor)}
 return {tipo,itens:filtered,recebimentos:recs,totais,porModalidade,periodo:{inicio,fim},fornecedor_id:fornecedorId};
}
router.get('/relatorios/financeiro',wrap(async(req,res)=>res.json(await dadosRelatorio(req.query))));
const fmtMoney=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtDate=v=>v?new Date(v).toISOString().slice(0,10).split('-').reverse().join('/'):'—';
function linhasRelatorio(d){if(d.tipo==='modalidade')return [['Modalidade','Total recebido'],...Object.entries(d.porModalidade).map(([x,v])=>[x,fmtMoney(v)])];
 return [['Fornecedor','Ponto / Pacote','Competência','Vencimento','Valor','Recebido','Saldo','Status'],...d.itens.map(x=>[x.fornecedor,x.referencia,x.competencia,fmtDate(x.vencimento),fmtMoney(x.valor),fmtMoney(x.pago),fmtMoney(x.saldo),x.status])];}
function csvSafe(v){let s=String(v??'');if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
router.get('/relatorios/financeiro.csv',wrap(async(req,res)=>{const d=await dadosRelatorio(req.query),rows=linhasRelatorio(d);res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="pontos_extras_relatorio.csv"','Cache-Control':'private,no-store'});res.send('\uFEFF'+rows.map(row=>row.map(csvSafe).join(';')).join('\r\n'))}));
const {createWorkbook}=require('../../utils/simple-xlsx');
router.get('/relatorios/financeiro.xlsx',wrap(async(req,res)=>{const d=await dadosRelatorio(req.query);const rows=linhasRelatorio(d);const buff=createWorkbook({sheetName:'Pontos Extras',title:'Relatório Financeiro - Pontos Extras',subtitle:'Consulta por fornecedor e situação',headers:rows[0],rows:rows.slice(1),widths:rows[0].map((x,i)=>i===0?24:18)});res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="pontos_extras_relatorio.xlsx"','Cache-Control':'private,no-store'});res.end(buff)}));
router.get('/relatorios/financeiro.pdf',wrap(async(req,res)=>{const d=await dadosRelatorio(req.query),nomes={abertos:'Pagamentos em aberto',quitados:'Pagamentos quitados',fornecedor:'Extrato por fornecedor',consolidado:'Relatório financeiro consolidado',modalidade:'Recebimentos por modalidade'};
 res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="pontos_extras_relatorio.pdf"','Cache-Control':'private,no-store'});
 const doc=new PDFDocument({size:'A4',margin:38,bufferPages:true});doc.pipe(res);doc.rect(0,0,595,98).fill('#0B315D');doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text('MANAÍRA BOARD  |  PONTOS EXTRAS',38,30);doc.font('Helvetica').fontSize(11).text(nomes[d.tipo],38,60);
 doc.fillColor('#23364C').fontSize(9).text('Emitido em: '+new Date().toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}),38,113);
 doc.font('Helvetica-Bold').fontSize(10).text(`Contratado nas cobranças: ${fmtMoney(d.totais.valor)}   Recebido: ${fmtMoney(d.totais.pago)}`,38,132);doc.text(`Saldo: ${fmtMoney(d.totais.saldo)}   Vencido: ${fmtMoney(d.totais.vencido)}`,38,147);
 let y=180;const rows=linhasRelatorio(d);const compact=d.tipo==='modalidade';const widths=compact?[235,280]:[95,70,53,62,67,67,67,37];const formatRow=(row,header)=>{if(y>753){doc.addPage();y=40;}let x=38;doc.rect(38,y,519,header?24:Math.max(25,30)).fill(header?'#DCE8F4':(Math.round(y)%2?'#FAFCFE':'#FFFFFF'));row.forEach((v,i)=>{doc.fillColor('#1C3550').font(header?'Helvetica-Bold':'Helvetica').fontSize(header?8:7).text(String(v??''),x+3,y+6,{width:widths[i]-6,height:23,ellipsis:true});x+=widths[i]});y+=header?24:30;};rows.forEach((r,i)=>formatRow(r,i===0));
 if(!d.itens.length&&d.tipo!=='modalidade'){doc.moveDown().fontSize(10).text('Não há registros para os filtros escolhidos.',38,y+10)}
 if(['quitados','fornecedor','consolidado'].includes(d.tipo)&&d.recebimentos.length){if(y>705){doc.addPage();y=40;}y+=18;doc.fillColor('#0B315D').font('Helvetica-Bold').fontSize(12).text('Recebimentos por fornecedor',38,y);y+=22;const recebHeader=['Fornecedor','Data','Modalidade','Valor','Comprovante'];const rr=d.recebimentos.map(x=>[x.fornecedor,fmtDate(x.data),x.modalidade,fmtMoney(x.valor),x.comprovante_id?'Anexado':'—']);const cols=[130,85,125,90,89];const draw=(values,head=false)=>{if(y>750){doc.addPage();y=40;}doc.rect(38,y,519,24).fill(head?'#DCE8F4':'#FAFCFE');let xx=38;values.forEach((v,i)=>{doc.font(head?'Helvetica-Bold':'Helvetica').fontSize(8).fillColor('#23364C').text(String(v||''),xx+4,y+6,{width:cols[i]-7,height:15,ellipsis:true});xx+=cols[i]});y+=24;};draw(recebHeader,true);rr.forEach(x=>draw(x));}
 const count=doc.bufferedPageRange().count;for(let i=0;i<count;i++){doc.switchToPage(i);doc.fillColor('#60738B').fontSize(8).text(`Pit Stop / Pontos Extras • Página ${i+1} de ${count}`,38,812,{width:519,align:'right'})}doc.end();}));

router.use((err,req,res,next)=>{if(res.headersSent)return next(err);console.error('Pontos Extras:',err.message);res.status(err.status||((err.code==='23505'||err.code==='23503')?409:500)).json({error:err.status?err.message:err.code==='23505'?'Já existe cadastro com esta referência.':err.code==='23503'?'Há registros vinculados que impedem esta operação.':'Falha ao processar operação de Pontos Extras.'})});
module.exports=router;
