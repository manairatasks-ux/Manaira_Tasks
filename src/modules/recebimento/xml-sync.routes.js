'use strict';
const router=require('express').Router();
const crypto=require('crypto');
const {render:renderDanfe,parse:parseNfe}=require('./danfe.service');
const {pool,query}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
const text=(v,n=200)=>String(v??'').trim().slice(0,n);
const fail=(res,msg,status=400)=>res.status(status).json({error:msg});
const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
// O inventário completo da Ponte é gerado a cada 120 minutos.
// Uma margem de 30 minutos absorve pequenas variações do agendador, mas
// qualquer interrupção maior reinicia a prova de ausência (sem retroagir).
const INVENTORY_MAX_GAP_MINUTES=150;

// Ponte envia apenas metadados de XML, nunca confirma recebimento físico.
function validarAssinatura(req,res){
 const secret=process.env.XML_SYNC_SECRET||'';
 if(secret.length<24){fail(res,'Sincronização XML não configurada.',503);return null}
 const timestamp=String(req.get('x-xml-timestamp')||'');
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000){fail(res,'Data da assinatura inválida.',401);return null}
 const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):'';
 const provided=String(req.get('x-xml-signature')||'');
 const expected=crypto.createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
 if(!/^[a-f0-9]{64}$/.test(provided)||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected))){fail(res,'Assinatura inválida.',401);return null}
 try{return JSON.parse(raw)}catch{fail(res,'JSON inválido.');return null}
}

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
 const results=[], rejeitadas=[];
 for(const n of notes){
  const chave=text(n?.chave,44),cnpj=text(n?.cnpj_destinatario,14),cnpjEmit=text(n?.cnpj_fornecedor,14);
  const rejeitar=(motivo)=>rejeitadas.push({chave:/^\d{44}$/.test(chave)?chave:null,motivo});
  if(!/^\d{44}$/.test(chave)||cnpj!==dest||!/^\d{14}$/.test(cnpjEmit)||!String(n?.numero||'').trim()||!Number.isFinite(Number(n?.valor))||Number(n.valor)<=0){rejeitar('Metadados fiscais incompletos ou CNPJ destinatário divergente.');continue}
  const resumo=n.resumo_pdf&&typeof n.resumo_pdf==='object'&&!Array.isArray(n.resumo_pdf)?n.resumo_pdf:null;
  const detalhes=resumo&&JSON.stringify(resumo).length<180000?JSON.stringify(resumo):null;
  let xmlOriginal=null,tratamentoEspecial=false,tipoOperacao='NORMAL',motivoEspecial='';
  if(typeof n.xml_original==='string'){
   if(Buffer.byteLength(n.xml_original,'utf8')>3*1024*1024){rejeitar('XML integral excede 3 MB.');continue}
   try{
    const parsed=parseNfe(n.xml_original),inf=parsed.inf;
    if(parsed.chave!==chave||String(inf.ide.nNF)!==String(n.numero)||String(inf.ide.serie)!==String(n.serie)||
      String(inf.emit.CNPJ)!==cnpjEmit||String(inf.dest.CNPJ)!==cnpj||
      Math.abs(Number(inf.total.ICMSTot.vNF)-Number(n.valor))>.011) {rejeitar('XML integral diverge do resumo fiscal.');continue}
    xmlOriginal=n.xml_original;
    const finalidade=String(inf.ide.finNFe||'1'),natureza=text(inf.ide.natOp,160);
    tipoOperacao=finalidade==='4'?'DEVOLUCAO':finalidade==='3'?'AJUSTE':finalidade==='2'?'COMPLEMENTAR':'NORMAL';
    if(tipoOperacao==='NORMAL'&&/devolu[cç][aã]o|retorno|remessa|bonifica[cç][aã]o/i.test(natureza))tipoOperacao='OPERACAO_ESPECIAL';
    tratamentoEspecial=tipoOperacao!=='NORMAL';
    motivoEspecial=tratamentoEspecial?`Finalidade ${finalidade}; natureza: ${natureza}`:'';
   }catch(err){rejeitar('XML integral inválido ou modelo não suportado: '+err.message);continue}
  }else{
   // Preserva compatibilidade com a Ponte antiga: notas sem XML integral
   // continuam disponíveis; apenas marcadores explícitos de exceção bloqueiam automação.
   const aviso=text(n.tipo_operacao||n.tipo_nota||n.classificacao||'',80).toUpperCase();
   const excecao=/DEVOL|AJUST|COMPLEMENT|BONIFIC|REMESSA|RETORNO|ESPECIAL|ERRO|DIVERG/.test(aviso);
   tipoOperacao=excecao?'A_CONFERIR_ESPECIAL':'SEM_XML';tratamentoEspecial=excecao;
   motivoEspecial=excecao?'Ponte sinalizou possível operação especial; exige conferência do XML integral.':'';
  }
  results.push([chave,text(n.numero,40),text(n.serie,15),text(n.fornecedor,160),cnpjEmit,cnpj,Number(n.valor),text(n.emissao,40),text(n.protocolo,50),Boolean(n.autorizada),detalhes,xmlOriginal,tipoOperacao,tratamentoEspecial,motivoEspecial]);
 }
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  for(const d of results){
   await client.query(`INSERT INTO receb_xml_pendentes(chave,numero,serie,fornecedor,cnpj_fornecedor,cnpj_destinatario,valor,emissao_texto,protocolo,autorizada,resumo_pdf,xml_original,tipo_operacao,tratamento_especial,motivo_especial,ultimo_sync)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,now())
    ON CONFLICT (chave) DO UPDATE SET numero=EXCLUDED.numero,serie=EXCLUDED.serie,fornecedor=EXCLUDED.fornecedor,valor=EXCLUDED.valor,protocolo=EXCLUDED.protocolo,autorizada=EXCLUDED.autorizada,resumo_pdf=COALESCE(EXCLUDED.resumo_pdf,receb_xml_pendentes.resumo_pdf),xml_original=COALESCE(EXCLUDED.xml_original,receb_xml_pendentes.xml_original),tipo_operacao=CASE WHEN EXCLUDED.xml_original IS NOT NULL THEN EXCLUDED.tipo_operacao WHEN receb_xml_pendentes.xml_original IS NOT NULL THEN receb_xml_pendentes.tipo_operacao ELSE EXCLUDED.tipo_operacao END,tratamento_especial=CASE WHEN EXCLUDED.xml_original IS NOT NULL THEN EXCLUDED.tratamento_especial WHEN receb_xml_pendentes.xml_original IS NOT NULL THEN receb_xml_pendentes.tratamento_especial ELSE EXCLUDED.tratamento_especial END,motivo_especial=CASE WHEN EXCLUDED.xml_original IS NOT NULL THEN EXCLUDED.motivo_especial WHEN receb_xml_pendentes.xml_original IS NOT NULL THEN receb_xml_pendentes.motivo_especial ELSE EXCLUDED.motivo_especial END,ultimo_sync=now()`,d);
  }
  await client.query('COMMIT');res.json({ok:true,recebidas:results.length,rejeitadas:rejeitadas.length,erros:rejeitadas.slice(0,100)});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});
// V74.35: relatórios parciais SOMENTE para acompanhamento. Eles nunca
// alteram presente_*, ausente_desde, lancamento_origem ou status das notas.
// A Ponte deve enviar um resumo sem listas de chaves fiscais, com o mesmo HMAC.
const receberParcial=run(async(req,res)=>{
 const body=validarAssinatura(req,res);
 if(!body)return;
 if(body.tipo!=='ACOMPANHAMENTO'||body.alteraLancamentos!==false)
  return fail(res,'Relatório parcial deve ser apenas de acompanhamento.');
 const gerado=Date.parse(body.geradoEm||'');
 if(!Number.isFinite(gerado)||Math.abs(Date.now()-gerado)>15*60*1000)
  return fail(res,'Data do relatório parcial inválida ou antiga.');
 const fontes=body.fontes;
 if(!Array.isArray(fontes)||fontes.length<1||fontes.length>2||
    fontes.some(x=>!x||!['principal','adicional'].includes(x.id)||
      !['ok','aguardando','error','partial'].includes(x.estado)||
      !Number.isInteger(x.encontradas)||x.encontradas<0||x.encontradas>500000||
      !Number.isInteger(x.examinadas)||x.examinadas<0||x.examinadas>500000||
      !Array.isArray(x.erros)||x.erros.length>10))
  return fail(res,'Fontes inválidas no relatório parcial.');
 if(new Set(fontes.map(x=>x.id)).size!==fontes.length)return fail(res,'Fontes duplicadas.');
 const contagens=['examinados','sincronizadas','duplicidades'];
 if(contagens.some(k=>!Number.isInteger(body[k])||body[k]<0||body[k]>500000))
  return fail(res,'Contagens inválidas no relatório.');
 if(!Array.isArray(body.erros)||body.erros.length>12)
  return fail(res,'Erros inválidos no relatório.');
 const resumo={
  fontes:fontes.map(x=>({id:x.id,estado:x.estado,encontradas:x.encontradas,examinadas:x.examinadas,erros:x.erros.map(e=>text(e,180))})),
  erros:body.erros.map(e=>text(e,180)),
  inventarioCompletoEnviado:body.inventarioCompletoEnviado===true
 };
 // Restringe a telemetria: nenhuma chave de acesso, XML, arquivo integral ou segredo.
 const result=await query(`INSERT INTO receb_xml_relatorios_parciais
  (gerado_em,examinados,sincronizadas,duplicidades,detalhes)
  VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT (gerado_em) DO NOTHING RETURNING gerado_em`,
  [new Date(gerado),body.examinados,body.sincronizadas,body.duplicidades,JSON.stringify(resumo)]);
 return res.json({ok:true,acompanhamento:true,duplicado:!result.rowCount,alteraLancamentos:false});
});
// V74.31: fechado SOMENTE depois do ciclo completo da Ponte V4.4.
// Assinatura HMAC igual à utilizada na sincronização individual.
const receberInventario=run(async(req,res)=>{
 const body=validarAssinatura(req,res);
 if(!body)return;
 if(body.completo!==true || !body.pastas || body.pastas.principal!==true || body.pastas.adicional!==true)
  return fail(res,'Inventário incompleto: leitura integral das duas pastas é obrigatória.');
 const ciclo=String(body.ciclo_id||'');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ciclo))return fail(res,'Identificador do ciclo inválido.');
 const a=body.chaves_principal,b=body.chaves_adicional;
 if(!Array.isArray(a)||!Array.isArray(b)||a.length>3000||b.length>3000)return fail(res,'Listas de chaves inválidas.');
 const chaveValida=c=>typeof c==='string'&&/^\d{44}$/.test(c);
 if(!a.every(chaveValida)||!b.every(chaveValida)||new Set(a).size!==a.length||new Set(b).size!==b.length)
  return fail(res,'Inventário contém chaves fiscais inválidas ou duplicadas.');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  // Serializa ciclos em várias instâncias do Board.
  await c.query("SELECT pg_advisory_xact_lock(hashtext('receb-xml-inventario-v7431'))");
  const novo=await c.query(`INSERT INTO receb_xml_inventarios(ciclo_id,notas_principal,notas_adicional)
   VALUES($1,$2,$3) ON CONFLICT(ciclo_id) DO NOTHING RETURNING ciclo_id`,[ciclo,a.length,b.length]);
  if(!novo.rowCount){await c.query('COMMIT');return res.json({ok:true,duplicado:true,lancadas:0})}
  // As chaves só podem estar disponíveis para contagem depois de terem
  // aparecido em PELO MENOS UM inventário completo. Dados históricos sem
  // essa observação jamais entram automaticamente em contagem retroativa.
  // Uma pausa >30 min entre inventários reinicia a contagem para não
  // contabilizar períodos sem verificação das pastas.
  await c.query(`UPDATE receb_xml_pendentes x SET
   presente_principal=(x.chave=ANY($1::varchar[])),
   presente_adicional=(x.chave=ANY($2::varchar[])),
   reapareceu_apos_auto=CASE WHEN (x.chave=ANY($1::varchar[]) OR x.chave=ANY($2::varchar[])) AND x.lancamento_automatico_em IS NOT NULL THEN TRUE ELSE x.reapareceu_apos_auto END,
   ausente_desde=CASE
    WHEN (x.chave=ANY($1::varchar[]) OR x.chave=ANY($2::varchar[])) THEN NULL
    WHEN x.observado_inventario_em IS NULL THEN NULL
    WHEN x.ultima_conferencia_em IS NULL OR x.ultima_conferencia_em < now()-make_interval(mins => $3::int) THEN now()
    ELSE COALESCE(x.ausente_desde,now()) END,
   observado_inventario_em=CASE WHEN (x.chave=ANY($1::varchar[]) OR x.chave=ANY($2::varchar[])) THEN now() ELSE x.observado_inventario_em END,
   ultima_conferencia_em=now()
   WHERE x.observado_inventario_em IS NOT NULL OR x.chave=ANY($1::varchar[]) OR x.chave=ANY($2::varchar[])`,[a,b,INVENTORY_MAX_GAP_MINUTES]);
  // Somente nota com recebimento CPD confirmado e sem pendência: ausência
  // >=12h; manual e já lançadas nunca são sobrepostas.
  const changed=await c.query(`UPDATE receb_notas n SET
   status='LANCADA', lancado_em=now(), lancamento_origem='AUTOMATICO',atualizado_em=now()
   FROM receb_xml_pendentes x
   WHERE x.recebido_nota_id=n.id AND x.ausente_desde <= now()-interval '12 hours'
    AND x.presente_principal=FALSE AND x.presente_adicional=FALSE
    AND x.ultima_conferencia_em >= now()-interval '2 minutes'
    AND x.lancamento_automatico_em IS NULL
    AND x.tratamento_especial=FALSE
    AND n.status='RECEBIDA_CPD' AND n.cpd_recebido_em IS NOT NULL
    AND COALESCE(btrim(n.pendencia),'')=''
    AND n.lancado_em IS NULL AND n.lancamento_origem IS NULL
   RETURNING n.id,n.numero`,[]);
  for(const n of changed.rows){
   await c.query(`UPDATE receb_xml_pendentes SET lancamento_automatico_em=now() WHERE recebido_nota_id=$1`,[n.id]);
   await c.query(`INSERT INTO receb_eventos(nota_id,usuario_id,acao,detalhes)
      VALUES($1,NULL,'LANCAMENTO_AUTOMATICO',$2)`,[n.id,'Classificação automática no Board após 12h de ausência confirmada nas duas pastas; NÃO é lançamento fiscal efetuado no GZ.']);
  }
  await c.query('UPDATE receb_xml_inventarios SET lancadas_automaticamente=$2 WHERE ciclo_id=$1',[ciclo,changed.rowCount]);
  await c.query('COMMIT');
  return res.json({ok:true,lancadas:changed.rowCount,concluido_em:new Date().toISOString()});
 }catch(err){await c.query('ROLLBACK');throw err}finally{c.release()}
});
router.use(auth,requireModuleAccess('recebimento_cpd'));
// V74.30: monitor leve da recepção de XMLs. A Ponte V4.3 mantém o contrato
// da V4.2: ambas as pastas enviam notas à mesma rota, com unicidade pela chave.
// Esta consulta usa os XMLs já persistidos; não acessa a rede nem dispara sync.
router.get('/xml-sync/resumo',run(async(req,res)=>{
 const r=await query(`SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE xml_original IS NOT NULL)::int AS com_xml_integral,
  COUNT(*) FILTER (WHERE recebido_nota_id IS NULL)::int AS aguardando_recebimento,
  MAX(ultimo_sync) AS ultima_sincronizacao,
  COUNT(*) FILTER(WHERE ausente_desde IS NOT NULL AND lancamento_automatico_em IS NULL)::int AS ausencia_monitorada,
  COUNT(*) FILTER(WHERE lancamento_automatico_em IS NOT NULL)::int AS lancadas_automaticamente
 FROM receb_xml_pendentes`);
 res.setHeader('Cache-Control','no-store');
 const last=await query('SELECT criado_em,notas_principal,notas_adicional,lancadas_automaticamente FROM receb_xml_inventarios ORDER BY criado_em DESC LIMIT 1');
 const parcial=await query('SELECT gerado_em,examinados,sincronizadas,duplicidades,detalhes FROM receb_xml_relatorios_parciais ORDER BY gerado_em DESC LIMIT 1');
 res.json({...(r.rows[0]||{}),ultimo_inventario:last.rows[0]||null,ultimo_parcial:parcial.rows[0]||null,
  janela_maxima_minutos:INVENTORY_MAX_GAP_MINUTES,modo:'duas_pastas_monitoradas',
  detalhe:'Somente inventários completos consecutivos confirmam ausência. Parciais são informativos e não alteram notas.'});
}));
router.get('/xml-sync/historico',run(async(req,res)=>{
 const limit=Math.min(100,Math.max(1,Number.parseInt(req.query.limite,10)||30));
 const result=await query(`SELECT 'COMPLETO' AS tipo,criado_em AS data,
  notas_principal,notas_adicional,lancadas_automaticamente,
  NULL::integer AS examinados,NULL::integer AS sincronizadas,NULL::jsonb AS detalhes
  FROM receb_xml_inventarios
  UNION ALL
  SELECT 'PARCIAL' AS tipo,gerado_em AS data,
  NULL::integer,NULL::integer,NULL::integer,
  examinados,sincronizadas,detalhes
  FROM receb_xml_relatorios_parciais
  ORDER BY data DESC LIMIT $1`,[limit]);
 res.setHeader('Cache-Control','no-store');res.json(result.rows);
}));
router.get('/xml-pendentes',run(async(req,res)=>{
 const busca=text(req.query.busca,80);
 const r=await query(`SELECT x.chave,x.numero,x.serie,x.fornecedor,x.cnpj_fornecedor,x.valor,x.emissao_texto,x.autorizada,
 (x.xml_original IS NOT NULL) AS tem_danfe,(x.resumo_pdf IS NOT NULL) AS tem_pdf,x.primeiro_sync,x.ultimo_sync,x.recebido_nota_id,
 x.presente_principal,x.presente_adicional,x.ausente_desde,x.lancamento_automatico_em,x.reapareceu_apos_auto,
 x.tipo_operacao,x.tratamento_especial,x.motivo_especial,
 n.status AS status_recebimento,n.lancamento_origem
 FROM receb_xml_pendentes x LEFT JOIN receb_notas n ON n.id=x.recebido_nota_id
 WHERE ($1='' OR x.fornecedor ILIKE '%'||$1||'%' OR x.numero ILIKE '%'||$1||'%' OR x.chave ILIKE '%'||$1||'%')
 ORDER BY x.ultimo_sync DESC,x.chave DESC LIMIT 400`,[busca]);res.json(r.rows);
}));

// O XML integral preservado é a fonte oficial dos dados fiscais desta visualização.
router.get('/xml-pendentes/:chave/pdf',run(async(req,res)=>{
 const chave=String(req.params.chave||'');
 if(!/^\d{44}$/.test(chave))return fail(res,'Chave inválida.');
 const r=await query('SELECT xml_original FROM receb_xml_pendentes WHERE chave=$1',[chave]);
 if(!r.rowCount)return fail(res,'NF-e não encontrada.',404);
 if(!r.rows[0].xml_original)return fail(res,'XML completo ainda não sincronizado. A DANFE só pode ser gerada após o envio do XML integral pela Ponte GZ V4.2.',409);
 try{renderDanfe(r.rows[0].xml_original,res)}catch(err){console.error('DANFE:',err.message);return fail(res,'Não foi possível gerar a DANFE: '+err.message,422)}
}));
router.get('/xml-pendentes/:chave/xml',run(async(req,res)=>{
 const chave=String(req.params.chave||'');
 if(!/^\d{44}$/.test(chave))return fail(res,'Chave inválida.');
 const r=await query('SELECT xml_original FROM receb_xml_pendentes WHERE chave=$1',[chave]);
 if(!r.rowCount)return fail(res,'NF-e não encontrada.',404);
 if(!r.rows[0].xml_original)return fail(res,'XML original indisponível para esta NF-e.',409);
 res.setHeader('Content-Type','application/xml; charset=utf-8');
 res.setHeader('Content-Disposition',`attachment; filename="NFe-${chave}.xml"`);
 res.setHeader('Cache-Control','private, no-store');
 res.send(r.rows[0].xml_original);
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
   if(n.tratamento_especial){result.push({chave,status:'conferir_tipo_operacao',tipo_operacao:n.tipo_operacao});continue}
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
module.exports={router,receberSync,receberInventario,receberParcial,INVENTORY_MAX_GAP_MINUTES};
