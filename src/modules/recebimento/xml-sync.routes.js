'use strict';
const router=require('express').Router();
const crypto=require('crypto');
const PDFDocument=require('pdfkit');
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
  const resumo=n.resumo_pdf&&typeof n.resumo_pdf==='object'&&!Array.isArray(n.resumo_pdf)?n.resumo_pdf:null;
  // Limita o payload detalhado para impedir que documentos anormais sobrecarreguem o banco.
  const detalhes=resumo&&JSON.stringify(resumo).length<180000?JSON.stringify(resumo):null;
  results.push([chave,text(n.numero,40),text(n.serie,15),text(n.fornecedor,160),cnpjEmit,cnpj,Number(n.valor),text(n.emissao,40),text(n.protocolo,50),Boolean(n.autorizada),detalhes]);
 }
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  for(const d of results){
   await client.query(`INSERT INTO receb_xml_pendentes(chave,numero,serie,fornecedor,cnpj_fornecedor,cnpj_destinatario,valor,emissao_texto,protocolo,autorizada,resumo_pdf,ultimo_sync)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now())
    ON CONFLICT (chave) DO UPDATE SET numero=EXCLUDED.numero,serie=EXCLUDED.serie,fornecedor=EXCLUDED.fornecedor,valor=EXCLUDED.valor,protocolo=EXCLUDED.protocolo,autorizada=EXCLUDED.autorizada,resumo_pdf=COALESCE(EXCLUDED.resumo_pdf,receb_xml_pendentes.resumo_pdf),ultimo_sync=now()`,d);
  }
  await client.query('COMMIT');res.json({ok:true,recebidas:results.length});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});
router.use(auth,requireModuleAccess('recebimento_cpd'));
router.get('/xml-pendentes',run(async(req,res)=>{
 const busca=text(req.query.busca,80);
 const r=await query(`SELECT chave,numero,serie,fornecedor,cnpj_fornecedor,valor,emissao_texto,autorizada,(resumo_pdf IS NOT NULL) AS tem_pdf,primeiro_sync,ultimo_sync,recebido_nota_id
 FROM receb_xml_pendentes WHERE ($1='' OR fornecedor ILIKE '%'||$1||'%' OR numero ILIKE '%'||$1||'%' OR chave ILIKE '%'||$1||'%')
 ORDER BY ultimo_sync DESC,chave DESC LIMIT 400`,[busca]);res.json(r.rows);
}));

// Prévia documental para uso operacional: não substitui DANFE fiscal ou XML autorizado.
router.get('/xml-pendentes/:chave/pdf',run(async(req,res)=>{
 const chave=String(req.params.chave||'');
 if(!/^\d{44}$/.test(chave))return fail(res,'Chave inválida.',400);
 const r=await query('SELECT * FROM receb_xml_pendentes WHERE chave=$1',[chave]);
 if(!r.rowCount)return fail(res,'NF-e não encontrada.',404);
 const n=r.rows[0],d=n.resumo_pdf;
 if(!d||!Array.isArray(d.produtos))return fail(res,'Detalhes do PDF ainda não sincronizados. Execute uma nova leitura pela Ponte GZ V4.1.',409);
 const pdf=new PDFDocument({size:'A4',margin:34,bufferPages:true});
 res.setHeader('Content-Type','application/pdf');
 res.setHeader('Content-Disposition',`inline; filename="NFe-${n.numero}-${n.serie}-conferencia.pdf"`);
 res.setHeader('Cache-Control','private, no-store');
 pdf.on('error',err=>{console.error('PDF NF-e:',err.message);if(!res.headersSent)res.status(500).end();else res.destroy(err)});
 pdf.pipe(res);
 const money=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 const linha=(k,v)=>{pdf.font('Helvetica-Bold').text(k+': ',{continued:true}).font('Helvetica').text(String(v||'—'))};
 const header=()=>{pdf.fillColor('#173B5E').fontSize(15).font('Helvetica-Bold').text('NF-e · Espelho para conferência');pdf.fillColor('#9B3737').fontSize(9).text('Documento interno gerado a partir dos dados do XML. NÃO substitui o DANFE oficial.');pdf.moveDown(.7);pdf.strokeColor('#BFC9D2').moveTo(34,pdf.y).lineTo(561,pdf.y).stroke();pdf.moveDown(.5)};
 header();
 pdf.fillColor('#1C2933').fontSize(10);
 linha('NF / Série',`${n.numero} / ${n.serie}`);linha('Chave de acesso',n.chave);linha('Protocolo',n.protocolo);linha('Emissão',d.emissao||n.emissao_texto);linha('Natureza da operação',d.natureza);
 pdf.moveDown(.6);
 pdf.font('Helvetica-Bold').fontSize(11).text('Emitente');pdf.fontSize(9).font('Helvetica');
 linha('Razão social',d.emitente?.nome||n.fornecedor);linha('CNPJ',d.emitente?.cnpj||n.cnpj_fornecedor);linha('IE',d.emitente?.ie);
 pdf.moveDown(.5);pdf.font('Helvetica-Bold').fontSize(11).text('Destinatário');pdf.fontSize(9).font('Helvetica');
 linha('Razão social',d.destinatario?.nome);linha('CNPJ',d.destinatario?.cnpj||n.cnpj_destinatario);
 pdf.moveDown(.7);
 pdf.font('Helvetica-Bold').fontSize(11).text('Produtos / serviços');pdf.moveDown(.3);
 const columns=[34,82,321,353,397,447,507];
 const title=()=>{pdf.fillColor('#173B5E').font('Helvetica-Bold').fontSize(8).text('Código',columns[0],pdf.y,{width:46,continued:false});const y=pdf.y-9;pdf.text('Descrição',columns[1],y,{width:235});pdf.text('UN',columns[2],y,{width:28});pdf.text('Qtd.',columns[3],y,{width:40,align:'right'});pdf.text('V. unit.',columns[4],y,{width:48,align:'right'});pdf.text('V. total',columns[5],y,{width:80,align:'right'});pdf.moveDown(.6);pdf.strokeColor('#CBD6DF').moveTo(34,pdf.y).lineTo(561,pdf.y).stroke();pdf.moveDown(.3)};
 title();
 for(const prod of d.produtos){
  if(pdf.y>745){pdf.addPage();title()}
  const y=pdf.y;
  pdf.font('Helvetica').fontSize(7.5).fillColor('#1C2933');
  const descr=String(prod.descricao||'').slice(0,180);
  const height=Math.max(16,pdf.heightOfString(descr,{width:232})+4);
  pdf.text(String(prod.codigo||''),columns[0],y,{width:46,height});
  pdf.text(descr,columns[1],y,{width:232,height});
  pdf.text(String(prod.unidade||''),columns[2],y,{width:28,height});
  pdf.text(String(prod.quantidade||''),columns[3],y,{width:40,align:'right',height});
  pdf.text(money(prod.valor_unitario),columns[4],y,{width:48,align:'right',height});
  pdf.text(money(prod.valor_total),columns[5],y,{width:80,align:'right',height});
  pdf.y=y+height+4;
  pdf.strokeColor('#E5EAF0').moveTo(34,pdf.y).lineTo(561,pdf.y).stroke();pdf.moveDown(.2);
 }
 if(pdf.y>685)pdf.addPage();
 pdf.moveDown(.7).fillColor('#173B5E').font('Helvetica-Bold').fontSize(11).text('Totais');
 pdf.fillColor('#1C2933').fontSize(9);linha('Produtos','R$ '+money(d.totais?.produtos));linha('Frete','R$ '+money(d.totais?.frete));linha('Desconto','R$ '+money(d.totais?.desconto));
 pdf.moveDown(.4).fontSize(13).font('Helvetica-Bold').text('VALOR TOTAL: R$ '+money(n.valor));
 if(d.informacoes){pdf.moveDown(.8).fontSize(9).text('Informações complementares').fontSize(8).font('Helvetica').text(d.informacoes,{width:520})}
 const pages=pdf.bufferedPageRange();for(let i=pages.start;i<pages.start+pages.count;i++){pdf.switchToPage(i);pdf.fontSize(7).fillColor('#697783').text(`Manaíra Board · Conferência interna · Página ${i+1}/${pages.count}`,34,806,{width:527,align:'right',lineBreak:false})}
 pdf.end();
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
