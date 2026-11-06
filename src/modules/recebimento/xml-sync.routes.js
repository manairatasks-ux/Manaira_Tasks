'use strict';
const router=require('express').Router();
const crypto=require('crypto');
const {pool,query}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
const text=(v,n=200)=>String(v??'').trim().slice(0,n);
const fail=(res,msg,status=400)=>res.status(status).json({error:msg});
const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
// Ponte envia apenas metadados de XML, nunca confirma recebimento físico.
const receberSync=run(async(req,res)=>{
 const secret=process.env.XML_SYNC_SECRET||'';
 if(secret.length<24)return fail(res,'Sincronização XML não configurada.',503);
 const timestamp=String(req.get('x-xml-timestamp')||'');
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000)return fail(res,'Data da assinatura inválida.',401);
 const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):'';
 const provided=String(req.get('x-xml-signature')||'');
 const expected=crypto.createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
 if(!/^[a-f0-9]{64}$/.test(provided)||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return fail(res,'Assinatura inválida.',401);
 let payload;try{payload=JSON.parse(raw)}catch{return fail(res,'JSON inválido.')}
 const notes=payload.notas;
 if(!Array.isArray(notes)||notes.length>100)return fail(res,'Máximo de 100 notas por envio.');
 const dest=String(process.env.XML_DEST_CNPJ||'').replace(/\D/g,'');
 if(!/^\d{14}$/.test(dest))return fail(res,'Configure XML_DEST_CNPJ.',503);
 const results=[];
 for(const n of notes){
  const chave=text(n.chave,44),cnpj=text(n.cnpj_destinatario,14),cnpjEmit=text(n.cnpj_fornecedor,14);
  if(!/^\d{44}$/.test(chave)||cnpj!==dest||!/^\d{14}$/.test(cnpjEmit)||!String(n.numero||'').trim()||!Number.isFinite(Number(n.valor))||Number(n.valor)<=0)continue;
  results.push([chave,text(n.numero,40),text(n.serie,15),text(n.fornecedor,160),cnpjEmit,cnpj,Number(n.valor),text(n.emissao,40),text(n.protocolo,50),Boolean(n.autorizada)]);
 }
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  for(const d of results){
   await client.query(`INSERT INTO receb_xml_pendentes(chave,numero,serie,fornecedor,cnpj_fornecedor,cnpj_destinatario,valor,emissao_texto,protocolo,autorizada,ultimo_sync)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    ON CONFLICT (chave) DO UPDATE SET numero=EXCLUDED.numero,serie=EXCLUDED.serie,fornecedor=EXCLUDED.fornecedor,valor=EXCLUDED.valor,protocolo=EXCLUDED.protocolo,autorizada=EXCLUDED.autorizada,ultimo_sync=now()`,d);
  }
  await client.query('COMMIT');res.json({ok:true,recebidas:results.length});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});
router.use(auth,requireModuleAccess('recebimento_cpd'));
router.get('/xml-pendentes',run(async(req,res)=>{
 const busca=text(req.query.busca,80);
 const r=await query(`SELECT chave,numero,serie,fornecedor,cnpj_fornecedor,valor,emissao_texto,autorizada,primeiro_sync,ultimo_sync,recebido_nota_id
 FROM receb_xml_pendentes WHERE ($1='' OR fornecedor ILIKE '%'||$1||'%' OR numero ILIKE '%'||$1||'%' OR chave ILIKE '%'||$1||'%')
 ORDER BY ultimo_sync DESC,chave DESC LIMIT 400`,[busca]);res.json(r.rows);
}));
router.post('/xml-pendentes/receber',run(async(req,res)=>{
 const chaves=req.body?.chaves,origem=req.body?.origem;
 if(!Array.isArray(chaves)||chaves.length<1||chaves.length>100||!['PAPEL','MENSAGEM'].includes(origem))return fail(res,'Selecione de 1 a 100 notas e informe a origem (PAPEL ou MENSAGEM).');
 if(chaves.some(c=>!/^\d{44}$/.test(String(c))))return fail(res,'Chave de NF-e inválida.');
 const client=await pool.connect();
 const result=[];
 try{
  await client.query('BEGIN');
  for(const chave of [...new Set(chaves)]){
   const r=await client.query('SELECT * FROM receb_xml_pendentes WHERE chave=$1 FOR UPDATE',[chave]);
   if(!r.rowCount){result.push({chave,status:'nao_encontrada'});continue}
   const n=r.rows[0];
   if(n.recebido_nota_id){result.push({chave,status:'ja_recebida',id:n.recebido_nota_id});continue}
   if(!n.autorizada){result.push({chave,status:'conferir_autorizacao'});continue}
   // Não inventamos duplicatas: o CPD poderá conferir os vencimentos a partir do documento fiscal.
   const dup=await client.query(`SELECT id FROM receb_notas WHERE numero=$1 AND serie=$2 AND (codigo_fornecedor=$3 OR lower(btrim(fornecedor))=lower(btrim($4))) LIMIT 1`,[n.numero,n.serie,n.cnpj_fornecedor,n.fornecedor]);
   if(dup.rowCount){result.push({chave,status:'possivel_duplicata',id:dup.rows[0].id});continue}
   const created=await client.query(`INSERT INTO receb_notas(codigo_fornecedor,fornecedor,numero,serie,valor,origem,recebido_por,observacao) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[n.cnpj_fornecedor,n.fornecedor,n.numero,n.serie,n.valor,origem,req.user.id,'Recebimento por XML (chave '+chave+'). Duplicatas a conferir no CPD.']);
   const id=created.rows[0].id;
   await client.query('UPDATE receb_xml_pendentes SET recebido_nota_id=$2,recebido_em=now() WHERE chave=$1',[chave,id]);
   await client.query(`INSERT INTO receb_eventos(nota_id,usuario_id,acao,detalhes) VALUES($1,$2,'CADASTRO',$3)`,[id,req.user.id,'Cadastro em lote via XML. Chave: '+chave]);
   result.push({chave,status:'recebida',id});
  }
  await client.query('COMMIT');res.json({resultados:result,registradas:result.filter(x=>x.status==='recebida').length});
 }catch(e){await client.query('ROLLBACK');if(e.code==='23505')return fail(res,'Conflito de duplicidade no cadastro. Atualize a lista e tente novamente.',409);throw e}finally{client.release()}
}));
module.exports={router,receberSync};
