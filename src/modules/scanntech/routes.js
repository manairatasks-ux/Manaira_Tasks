'use strict';
const router=require('express').Router();
const {pool,query}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
const {consultarProduto}=require('../produtos-gz/produtos-gz.service');
router.use(auth,requireModuleAccess('scanntech'));
const safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
function fail(m,s=400){const e=new Error(m);e.status=s;throw e}
function num(v,name){const n=Number(v);if(v==null||v===''||!Number.isFinite(n)||n<0||n>100000000)fail(`${name} inválido.`);return n}
function d(v){return /^\d{4}-\d\d-\d\d$/.test(String(v||''))&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v}
const manager=req=>['administrador_principal','administrador','gerente','encarregado'].includes(String(req.user.perfil).toLowerCase());
const canEdit=req=>{if(!manager(req))fail('Apenas encarregados ou gestores podem alterar campanhas.',403)};
// Ganho sobre custo (markup): reembolso reduz o custo; percentual calculado sobre o custo ajustado.
function calcularGanho(precoVenda,custo,reembolso){
 const preco=Number(precoVenda),c=Number(custo),r=Number(reembolso);
 if(!Number.isFinite(preco)||preco<=0||!Number.isFinite(c)||!Number.isFinite(r))return null;
 const custoAjustado=c-r;
 if(custoAjustado<=0)return null; // Não existe markup definido para custo ajustado nulo ou negativo.
 return (preco/custoAjustado-1)*100;
}
function elegivel(i,precoNovo,reembolso,margemMinima){
 const custo=i.custoGz;
 return !!i.encontrado && String(i.situacaoGz||'').trim().toUpperCase()==='ATIVO' && custo!=null && Number.isFinite(Number(custo)) && Number(custo)>=0 && Number(precoNovo)>0 && (calcularGanho(precoNovo,custo,reembolso)??-Infinity)>=Number(margemMinima);
}
function getProduct(products,code){return (products||[]).find(p=>String(p.codigoEan||'')===code||String(p.codigo||'')===code)||null}
router.post('/consultar',safe(async(req,res)=>{
 const itens=req.body?.itens;
 if(!Array.isArray(itens)||itens.length<1||itens.length>100)fail('Informe de 1 a 100 produtos.');
 const seen=new Set();const entrada=itens.map(i=>({codigo:String(i.codigo||'').trim(),descricaoOrigem:String(i.descricaoOrigem||'').trim().slice(0,500)}));
 for(const i of entrada){if(!/^\d{8,14}$/.test(i.codigo)||seen.has(i.codigo))fail('Código inválido ou duplicado: '+i.codigo);seen.add(i.codigo)}
 let next=0;const result=new Array(entrada.length);
 async function worker(){while(next<entrada.length){const idx=next++,item=entrada[idx];let produto=null,erro=null;
 try{const r=await consultarProduto({codigoBarras:item.codigo});produto=getProduct(r.produtos,item.codigo);
 if(!produto){const fallback=await consultarProduto({codigoInterno:item.codigo});produto=getProduct(fallback.produtos,item.codigo)}}catch(e){erro=e.message||'Falha de consulta GZ'}
 result[idx]={...item,encontrado:!!produto,descricaoGz:produto?.descricao||produto?.descpdv||null,situacaoGz:produto?.situacao||null,precoGz:produto?.precoVenda==null?null:Number(produto.precoVenda),custoGz:produto?.valorCustoAquisicao==null?(produto?.custoAquisicao==null?null:Number(produto.custoAquisicao)):Number(produto.valorCustoAquisicao),estoqueGz:produto?.quantidadeEstoque==null?null:Number(produto.quantidadeEstoque),erro};}}
 await Promise.all(Array.from({length:Math.min(4,entrada.length)},worker));res.json({itens:result});
}));
router.get('/campanhas',safe(async(req,res)=>{
 const rows=await query(`SELECT c.*,u.nome AS criado_por_nome,COUNT(i.id) FILTER (WHERE i.incluido)::int AS quantidade_itens,COUNT(i.id) FILTER (WHERE NOT i.incluido)::int AS quantidade_nao_incluidos,COUNT(i.id) FILTER (WHERE i.encontrado=FALSE)::int AS sem_cadastro FROM st_campanhas c LEFT JOIN st_itens i ON i.campanha_id=c.id LEFT JOIN usuarios u ON u.id=c.criado_por GROUP BY c.id,u.nome ORDER BY c.inicio DESC,c.id DESC LIMIT 1000`);
 res.json({campanhas:rows.rows,pode_editar:manager(req)});
}));
router.get('/campanhas/:id',safe(async(req,res)=>{
 const id=Number(req.params.id);if(!Number.isSafeInteger(id))fail('ID inválido');const c=await query('SELECT * FROM st_campanhas WHERE id=$1',[id]);if(!c.rowCount)fail('Campanha não encontrada.',404);
 const items=await query('SELECT * FROM st_itens WHERE campanha_id=$1 ORDER BY id',[id]);res.json({campanha:c.rows[0],itens:items.rows});
}));
router.post('/campanhas',safe(async(req,res)=>{
 canEdit(req);const b=req.body||{};const marca=String(b.marca||'').trim().slice(0,150);if(!marca)fail('Informe marca/fornecedor.');
 if(!d(b.inicio)||!d(b.fim)||b.inicio>b.fim)fail('Confira as datas da promoção.');
 const items=b.itens;if(!Array.isArray(items)||items.length<1||items.length>100)fail('Consulte de 1 a 100 produtos antes de salvar.');
 const pOld=num(b.preco_antigo,'Preço antigo'),pNew=num(b.preco_novo,'Preço novo'),discount=num(b.desconto,'Desconto'),refund=num(b.reembolso,'Reembolso');
 const minimum=num(b.margem_minima??20,'Ganho mínimo'),limiteRede=b.limite_rede==null||b.limite_rede===''?null:num(b.limite_rede,'Limite por rede');if(minimum>100)fail('Ganho mínimo acima de 100%.');
 const precosAntigos=Array.isArray(b.precos_antigos)?b.precos_antigos.map(v=>num(v,'Preço antigo da lista')):[];
 const descontosScanntech=Array.isArray(b.descontos_scanntech)?b.descontos_scanntech.map(v=>num(v,'Desconto da lista')):[];
 if(precosAntigos.length>20||descontosScanntech.length>20)fail('A lista de preços ou descontos excede 20 valores.');
 const multiplo=precosAntigos.length>1,autorizacao=!!b.autorizar_multiplos_precos;
 const status=String(b.status||'rascunho');if(!['rascunho','ativada'].includes(status))fail('Status inválido.');
 if(multiplo&&status==='ativada'&&!autorizacao)fail('Campanha com preços antigos diferentes: a ativação exige autorização explícita. Salve como rascunho ou confirme a revisão.');
 const codes=new Set();let aprovados=0;
 for(const i of items){const code=String(i.codigo||'');if(!/^\d{8,14}$/.test(code)||codes.has(code))fail('Códigos inválidos ou repetidos.');codes.add(code);if(elegivel(i,pNew,refund,minimum))aprovados++}
 if(status==='ativada'&&!aprovados)fail('Nenhum produto atende aos requisitos de ativação (cadastro ativo, custo ajustado positivo e ganho mínimo). Salve como rascunho.');
 if(status==='ativada'&&pNew<=0)fail('Informe um preço promocional maior que zero para ativar.');
 const client=await pool.connect();try{await client.query('BEGIN');
 if(status==='ativada'){
   const overlap=await client.query(`SELECT c.id,i.codigo FROM st_campanhas c JOIN st_itens i ON i.campanha_id=c.id WHERE c.status='ativada' AND c.inicio<=$2::date AND c.fim>=$1::date AND i.incluido=TRUE AND i.codigo=ANY($3::text[]) LIMIT 5`,[b.inicio,b.fim,items.filter(i=>elegivel(i,pNew,refund,minimum)).map(i=>String(i.codigo))]);
   if(overlap.rowCount)fail('Produtos já constam em outra campanha ativa com datas sobrepostas. Revise antes de ativar.',409);
 }
 const c=await client.query(`INSERT INTO st_campanhas(codigo_scanntech,marca,titulo,preco_antigo,preco_novo,desconto,reembolso,inicio,fim,margem_minima,status,observacao,criado_por,limite_rede,precos_antigos,descontos_scanntech,multiplos_precos_autorizados) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,[String(b.codigo_scanntech||'').slice(0,90),marca,String(b.titulo||'').slice(0,240),pOld,pNew,discount,refund,b.inicio,b.fim,minimum,status,String(b.observacao||'').slice(0,3000),req.user.id,limiteRede,JSON.stringify(precosAntigos),JSON.stringify(descontosScanntech),multiplo&&autorizacao]);
 for(const i of items){await client.query(`INSERT INTO st_itens(campanha_id,codigo,descricao_origem,descricao_gz,situacao_gz,preco_gz,custo_gz,estoque_gz,encontrado,incluido,preco_antigo_item) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[c.rows[0].id,String(i.codigo),String(i.descricaoOrigem||'').slice(0,500),i.descricaoGz?String(i.descricaoGz).slice(0,1000):null,i.situacaoGz?String(i.situacaoGz).slice(0,100):null,i.precoGz==null?null:num(i.precoGz,'Preço GZ'),i.custoGz==null?null:num(i.custoGz,'Custo GZ'),i.estoqueGz==null?null:Number(i.estoqueGz),!!i.encontrado,status==='ativada'?elegivel(i,pNew,refund,minimum):false,multiplo&&i.precoGz!=null?num(i.precoGz,'Preço antigo do produto'):pOld]);}
 await client.query('COMMIT');res.status(201).json({ok:true,id:c.rows[0].id,status,incluidos:status==='ativada'?aprovados:0,nao_incluidos:status==='ativada'?items.length-aprovados:items.length});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
router.patch('/campanhas/:id',safe(async(req,res)=>{
 canEdit(req);const id=Number(req.params.id),action=String(req.body?.acao||'');if(!Number.isSafeInteger(id)||!['ativar','cancelar','colocar_placas','retirar_placas'].includes(action))fail('Ação inválida.');
 const c=await query('SELECT * FROM st_campanhas WHERE id=$1',[id]);if(!c.rowCount)fail('Campanha não encontrada.',404);
 if(action==='ativar'){if(Array.isArray(c.rows[0].precos_antigos)&&c.rows[0].precos_antigos.length>1&&!req.body?.autorizar_multiplos_precos)fail('Campanha com múltiplos preços: é necessária autorização expressa para ativar.');if(c.rows[0].status!=='rascunho')fail('Somente rascunhos podem ser ativados.');
 const client=await pool.connect();try{
  await client.query('BEGIN');
  const rows=await client.query('SELECT * FROM st_itens WHERE campanha_id=$1 FOR UPDATE',[id]);
  const selected=rows.rows.filter(i=>elegivel({encontrado:i.encontrado,situacaoGz:i.situacao_gz,custoGz:i.custo_gz},c.rows[0].preco_novo,c.rows[0].reembolso,c.rows[0].margem_minima));
  if(!selected.length)fail('Nenhum produto do rascunho está apto para ativação.');
  const overlap=await client.query(`SELECT c2.id FROM st_campanhas c2 JOIN st_itens i2 ON i2.campanha_id=c2.id WHERE c2.id<>$1 AND c2.status='ativada' AND c2.inicio<=$3 AND c2.fim>=$2 AND i2.incluido=TRUE AND i2.codigo=ANY($4::text[]) LIMIT 1`,[id,c.rows[0].inicio,c.rows[0].fim,selected.map(i=>i.codigo)]);
  if(overlap.rowCount)fail('Existe uma promoção com produtos aptos e datas sobrepostas.',409);
  await client.query('UPDATE st_itens SET incluido=(codigo=ANY($2::text[])) WHERE campanha_id=$1',[id,selected.map(i=>i.codigo)]);
  await client.query("UPDATE st_campanhas SET status='ativada',multiplos_precos_autorizados=CASE WHEN jsonb_array_length(precos_antigos)>1 THEN TRUE ELSE multiplos_precos_autorizados END,atualizado_em=NOW() WHERE id=$1",[id]);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 if(action==='cancelar'){await query("UPDATE st_campanhas SET status='cancelada',atualizado_em=NOW() WHERE id=$1",[id]);}
 if(action==='colocar_placas'){if(c.rows[0].status!=='ativada')fail('Ative a campanha primeiro.');await query('UPDATE st_campanhas SET placas_colocadas_em=COALESCE(placas_colocadas_em,NOW()),atualizado_em=NOW() WHERE id=$1',[id]);}
 if(action==='retirar_placas'){await query('UPDATE st_campanhas SET placas_retiradas_em=COALESCE(placas_retiradas_em,NOW()),atualizado_em=NOW() WHERE id=$1',[id]);}
 res.json({ok:true});
}));
function csvEscape(s){let v=String(s??'');if(/^[\s]*[=+\-@]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
router.get('/relatorio',safe(async(req,res)=>{
 const tipo=String(req.query.tipo||'saida');if(!['saida','entrada'].includes(tipo))fail('Tipo de relatório inválido.');const de=String(req.query.de||''),ate=String(req.query.ate||'');if(!d(de)||!d(ate)||de>ate)fail('Informe um período válido.');
 const rows=await query(`SELECT c.id,c.marca,c.titulo,c.inicio,c.fim,COALESCE(i.preco_antigo_item,c.preco_antigo) AS preco_antigo,c.preco_novo,c.status,c.placas_colocadas_em,c.placas_retiradas_em,i.codigo,COALESCE(NULLIF(i.descricao_gz,''),i.descricao_origem) AS descricao FROM st_campanhas c JOIN st_itens i ON i.campanha_id=c.id WHERE i.incluido=TRUE AND c.status='ativada' AND ${tipo==='saida'?'c.fim':'c.inicio'} BETWEEN $1 AND $2 ORDER BY ${tipo==='saida'?'c.fim':'c.inicio'},c.marca,i.codigo`,[de,ate]);
 res.json({tipo,de,ate,linhas:rows.rows});
}));
router.use((err,req,res,next)=>{console.error('Scanntech:',err);res.status(err.status||500).json({error:err.status?err.message:'Falha na operação Scanntech.'});});
module.exports=router;
