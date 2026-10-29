const router=require('express').Router();
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
const {pool}=require('../../db');
const gz=require('../produtos-gz/produtos-gz.service');
const PDFDocument=require('pdfkit');
const path=require('path');
const base=[auth,requireModuleAccess('orcamentos')];
const fail=(m,s=400)=>{const e=new Error(m);e.status=s;throw e};
const safe=(fn)=>async(req,res)=>{try{await fn(req,res)}catch(e){res.status(e.status||500).json({error:e.message})}};
const money=n=>Math.round((Number(n)+Number.EPSILON)*100);
const number=v=>Number(v);
const isManager=u=>['administrador_principal','administrador','gerente'].includes(String(u.perfil).toLowerCase());
const price=p=>{
 const val=k=>{const x=p?.[k];if(x===null||x===undefined||x==='')return 0;return Number(String(x).replace(/R\$/gi,'').replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'))||0};
 const normal=val('precoVenda'), offer=val('precoEspecial')||val('precoPromocao');
 const date=v=>{if(!v)return null;const s=String(v).slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;if(/^\d{2}\/\d{2}\/\d{4}$/.test(s))return s.slice(6)+'-'+s.slice(3,5)+'-'+s.slice(0,2);return null};
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Fortaleza'});
 return money(offer>0&&date(p.dataInicioPromocao)&&date(p.dataTerminoPromocao)&&day>=date(p.dataInicioPromocao)&&day<=date(p.dataTerminoPromocao)?offer:normal);
};
function calc(items,discount){let subtotal=0,less=0;const detail=items.map(x=>{const qty=number(x.quantidade);if(!Number.isFinite(qty)||qty<=0||qty>100000)fail('Quantidade inválida');const unit=Number(x.preco_centavos);if(!Number.isSafeInteger(unit)||unit<0)fail('Preço inválido');const gross=Math.round(unit*qty);const d=discountValue(x.desconto_tipo,x.desconto_valor,gross);subtotal+=gross;less+=d;return {...x,total_centavos:gross-d,desconto_centavos:d}});const general=discountValue(discount?.tipo,discount?.valor,subtotal-less);return {detail,subtotal,desconto_itens:less,desconto_geral:general,total:subtotal-less-general}};
function discountValue(kind,val,basis){if(!kind||kind==='nenhum')return 0;const n=number(val);if(!Number.isFinite(n)||n<0)fail('Desconto inválido');if(kind==='percentual'){if(n>100)fail('Desconto percentual superior a 100%');return Math.round(basis*n/100)}if(kind==='valor'){const result=money(n);if(result>basis)fail('Desconto maior que o valor disponível');return result}fail('Tipo de desconto inválido')}
async function product(q){const response=await gz.consultarProduto(q);return response.produtos||[]}
// Sintaxe de pesquisa GZ: termo comum = início da descrição;
// %termo = ocorrência em qualquer posição. Todos os termos devem corresponder.
// Normalização serve apenas ao filtro, não altera a expressão enviada à Ponte GZ.
const normalizarBusca = texto => String(texto || '').normalize('NFD')
 .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
function interpretarBusca(texto) {
 const termos=String(texto||'').trim().split(/\s+/).filter(Boolean).map((parte,indice)=>({
  valor:normalizarBusca(parte.replace(/^%+/,'')),
  contem:parte.startsWith('%'),
  indice
 }));
 if (!termos.length || termos.some(t=>!t.valor)) fail('Informe termos de pesquisa válidos.');
 return termos;
}
function correspondeDescricao(descricao, termos) {
 const nome=normalizarBusca(descricao);
 return termos.every(t=>t.contem ? nome.includes(t.valor) : (t.indice===0 ? nome.startsWith(t.valor) : nome.includes(t.valor)));
}
// Campos opcionais da Ponte GZ: nunca assumir saldo, status ou validade ausentes.
const primeiro=(p,nomes)=>{for(const n of nomes){if(p[n]!==undefined&&p[n]!==null&&p[n]!=='')return p[n]}return null};
const situacaoProduto=p=>{const v=primeiro(p,['situacao','status','ativo']);if(v===null)return 'DESCONHECIDO';if(v===true||v===1)return 'ATIVO';if(v===false||v===0)return 'INATIVO';const x=String(v).trim().toUpperCase();if(['ATIVO','A','1','TRUE'].includes(x))return 'ATIVO';if(['INATIVO','I','0','FALSE'].includes(x))return 'INATIVO';return 'DESCONHECIDO'};
const dataProduto=v=>{if(!v)return null;const s=String(v).slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;if(/^\d{2}\/\d{2}\/\d{4}$/.test(s))return s.slice(6)+'-'+s.slice(3,5)+'-'+s.slice(0,2);return null};
const valorProduto=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(/R\$/gi,'').replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));return Number.isFinite(n)?n:null};
router.get('/produtos',...base,safe(async(req,res)=>{
 const term=String(req.query.busca||'').trim();if(term.length<2)fail('Digite pelo menos dois caracteres');
 const numerico=/^\d+$/.test(term);
 const q=numerico ? (/^\d{8,14}$/.test(term)?{codigoBarras:term}:{codigoInterno:term}) : {descricao:term};
 // A Ponte GZ recebe a expressão completa, incluindo %, para aproveitar a
 // busca nativa. O filtro abaixo garante a correspondência entre os retornados.
 const termos=numerico?null:interpretarBusca(term);
 const consultados=await product(q);
 const found=(termos?consultados.filter(x=>correspondeDescricao(x.descricao||x.descpdv,termos)):consultados).slice(0,40);
 // O catálogo local é apenas fallback da situação, identificado como tal na resposta.
 let catalogo=new Map();
 const codes=[...new Set(found.map(x=>String(x.codigo||x.codigoInterno||'')).filter(Boolean))];
 if(codes.length){try{const cr=await pool.query('SELECT codigo_produto,situacao FROM gz_catalogo_produtos WHERE codigo_produto = ANY($1::text[])',[codes]);catalogo=new Map(cr.rows.map(r=>[String(r.codigo_produto),String(r.situacao)]))}catch(e){console.warn('Orçamentos: catálogo auxiliar indisponível:',e.message)}}
 const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Fortaleza'});
 res.json({produtos:found.map(x=>{
  const codigo=String(x.codigo||x.codigoInterno||'');
  let situacao=situacaoProduto(x),situacao_origem='Ponte GZ';
  if(situacao==='DESCONHECIDO'&&catalogo.has(codigo)){situacao=situacaoProduto({situacao:catalogo.get(codigo)});situacao_origem='Catálogo sincronizado'}
  const saldo=valorProduto(primeiro(x,['quantidadeEstoque','estoqueAtual','estoque','saldoEstoque','saldo','quantidade']));
  const normal=valorProduto(primeiro(x,['precoVenda']));
  const oferta=valorProduto(primeiro(x,['precoEspecial','precoPromocao']));
  const inicio=dataProduto(primeiro(x,['dataInicioPromocao']));
  const fim=dataProduto(primeiro(x,['dataTerminoPromocao']));
  const em_promocao=oferta!==null&&oferta>0&&inicio!==null&&fim!==null&&hoje>=inicio&&hoje<=fim;
  const cents=price(x);
  return {codigo,ean:String(x.codigoEan||x.codigoBarras||''),descricao:String(x.descricao||x.descpdv||''),preco_centavos:cents,preco_disponivel:cents>0,situacao,situacao_origem,estoque:saldo,preco_normal_centavos:normal===null?null:money(normal),preco_promocional_centavos:em_promocao?money(oferta):null,promocao_ate:em_promocao?fim:null,em_promocao};
 })});
}));
router.get('/',...base,safe(async(req,res)=>{const r=await pool.query(`SELECT id,numero,cliente,status,total_centavos,criado_em,validade_em,tipo_destinatario FROM orcamentos ORDER BY id DESC LIMIT 100`);res.json({orcamentos:r.rows})}));
router.get('/:id',...base,safe(async(req,res)=>{const o=(await pool.query('SELECT * FROM orcamentos WHERE id=$1',[req.params.id])).rows[0];if(!o)fail('Orçamento não encontrado',404);const items=(await pool.query('SELECT * FROM orcamento_itens WHERE orcamento_id=$1 ORDER BY id',[o.id])).rows;res.json({orcamento:o,itens:items})}));
router.post('/',...base,safe(async(req,res)=>{
 const b=req.body||{},items=b.itens;validateRecipient(b);if(!Array.isArray(items)||!items.length||items.length>250)fail('Informe de 1 a 250 itens');if(!String(b.cliente||'').trim())fail('Informe o cliente');if(String(b.cliente).length>180)fail('Nome muito longo');
 if(items.some(x=>x.desconto_tipo&&x.desconto_tipo!=='nenhum')||(b.desconto?.tipo&&b.desconto.tipo!=='nenhum')){if(!isManager(req.user))fail('Descontos exigem perfil de gerente ou administrador.',403)}
 // Não confiar nos preços recebidos do navegador: verificar produtos diretamente na Ponte GZ.
 const checked=[];
 for(const x of items){const code=String(x.codigo||'').trim(),ean=String(x.ean||'').trim();if(!code&&!ean)fail('Produto sem código GZ');const matches=await product(code?{codigoInterno:code}:{codigoBarras:ean});const found=matches.find(p=>String(p.codigo||p.codigoInterno||'')===code || (ean&&String(p.codigoEan||p.codigoBarras||'')===ean));if(!found)fail('Produto não encontrado no GZ: '+(code||ean));if(situacaoProduto(found)==='INATIVO')fail('Produto inativo no GZ: '+(found.descricao||code));const cents=price(found);if(cents<=0)fail('Preço de terminal indisponível: '+(found.descricao||code));checked.push({codigo:code||String(found.codigo||''),ean:ean||String(found.codigoEan||''),descricao:String(found.descricao||found.descpdv||''),quantidade:x.quantidade,preco_centavos:cents,desconto_tipo:x.desconto_tipo||'nenhum',desconto_valor:x.desconto_valor||0})}
 const totals=calc(checked,b.desconto);const client=await pool.connect();try{await client.query('BEGIN');const o=(await client.query(`INSERT INTO orcamentos (cliente,contato,observacoes,validade_em,criado_por,desconto_tipo,desconto_valor,subtotal_centavos,desconto_itens_centavos,desconto_geral_centavos,total_centavos,status,tipo_destinatario,documento_cliente,endereco_cliente) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'EMITIDO',$12,$13,$14) RETURNING id`,[String(b.cliente).trim(),String(b.contato||''),String(b.observacoes||''),b.validade||null,req.user.id,b.desconto?.tipo||'nenhum',Number(b.desconto?.valor||0),totals.subtotal,totals.desconto_itens,totals.desconto_geral,totals.total,b.tipo_destinatario||'CLIENTE',b.documento_cliente||null,b.endereco_cliente||null])).rows[0];for(const x of totals.detail)await client.query(`INSERT INTO orcamento_itens (orcamento_id,codigo,ean,descricao,quantidade,preco_centavos,desconto_tipo,desconto_valor,desconto_centavos,total_centavos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[o.id,x.codigo,x.ean,x.descricao,x.quantidade,x.preco_centavos,x.desconto_tipo,x.desconto_valor,x.desconto_centavos,x.total_centavos]);await client.query('UPDATE orcamentos SET numero=$1 WHERE id=$2',['ORC-'+new Date().getFullYear()+'-'+String(o.id).padStart(6,'0'),o.id]);await client.query('COMMIT');res.status(201).json({id:o.id,total_centavos:totals.total})}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
const load=async(id)=>{const r=await pool.query('SELECT * FROM orcamentos WHERE id=$1',[id]);if(!r.rows.length)fail('Orçamento não encontrado',404);return {o:r.rows[0],items:(await pool.query('SELECT * FROM orcamento_itens WHERE orcamento_id=$1 ORDER BY id',[id])).rows}};
const br=n=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
// Validações compartilhadas pelas operações de criação e edição.
function validateRecipient(b){
 const tipo=String(b.tipo_destinatario||'CLIENTE').toUpperCase();
 if(!['CLIENTE','EMPRESA'].includes(tipo))fail('Tipo de orçamento inválido');
 if(tipo==='EMPRESA'&&!String(b.documento_cliente||'').trim())fail('Informe o CNPJ da empresa');
 if(String(b.documento_cliente||'').length>24||String(b.endereco_cliente||'').length>500)fail('Dados do destinatário muito longos');
}
async function snapshot(client,id){
 const o=(await client.query('SELECT * FROM orcamentos WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!o)fail('Orçamento não encontrado',404);
 const items=(await client.query('SELECT * FROM orcamento_itens WHERE orcamento_id=$1 ORDER BY id',[id])).rows;
 return {orcamento:o,itens:items};
}
function checkEdit(u,o){
 if(o.status==='CANCELADO')fail('Orçamento cancelado não pode ser alterado');
 if(!isManager(u)&&Number(o.criado_por)!==Number(u.id))fail('Sem permissão para editar este orçamento',403);
}
router.put('/:id',...base,safe(async(req,res)=>{
 const b=req.body||{};validateRecipient(b);
 if(!String(b.cliente||'').trim()||String(b.cliente).length>180)fail('Nome inválido');
 if(!Array.isArray(b.itens)||b.itens.length<1||b.itens.length>250)fail('Informe entre 1 e 250 itens');
 const codes=new Set();
 for(const x of b.itens){const code=String(x.codigo||x.ean||'').trim();if(!code||codes.has(code))fail('Produto sem código ou repetido');codes.add(code)}
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const before=await snapshot(client,req.params.id),o=before.orcamento;
  checkEdit(req.user,o);
  const discountUsed=b.itens.some(x=>x.desconto_tipo&&x.desconto_tipo!=='nenhum')||(b.desconto?.tipo&&b.desconto.tipo!=='nenhum');
  if(discountUsed&&!isManager(req.user))fail('Descontos exigem perfil de gerente ou administrador',403);
  // Na edição o preço originalmente emitido é preservado. Não o substituímos silenciosamente por preços novos.
  const oldByCode=new Map(before.itens.map(x=>[String(x.codigo||x.ean),x]));
  const items=[];
  for(const x of b.itens){
    const code=String(x.codigo||x.ean);const old=oldByCode.get(code);
    if(!old){
      const matches=await product(x.codigo?{codigoInterno:String(x.codigo)}:{codigoBarras:String(x.ean)});
      const found=matches.find(p=>String(p.codigo||p.codigoInterno||'')===String(x.codigo||'') || (x.ean&&String(p.codigoEan||p.codigoBarras||'')===String(x.ean)));
      if(!found)fail('Novo produto não encontrado no GZ: '+code);
      if(situacaoProduto(found)==='INATIVO')fail('Produto inativo no GZ: '+code);
      const cents=price(found);if(cents<=0)fail('Preço de terminal indisponível: '+code);
      items.push({codigo:String(found.codigo||found.codigoInterno||x.codigo||''),ean:String(found.codigoEan||found.codigoBarras||x.ean||''),descricao:String(found.descricao||found.descpdv||''),preco_centavos:cents,quantidade:x.quantidade,desconto_tipo:x.desconto_tipo||'nenhum',desconto_valor:x.desconto_valor||0});
    }else items.push({codigo:old.codigo,ean:old.ean,descricao:old.descricao,preco_centavos:Number(old.preco_centavos),quantidade:x.quantidade,desconto_tipo:x.desconto_tipo||'nenhum',desconto_valor:x.desconto_valor||0});
  }
  const totals=calc(items,b.desconto);
  await client.query(`UPDATE orcamentos SET cliente=$2,contato=$3,observacoes=$4,validade_em=$5,desconto_tipo=$6,desconto_valor=$7,subtotal_centavos=$8,desconto_itens_centavos=$9,desconto_geral_centavos=$10,total_centavos=$11,tipo_destinatario=$12,documento_cliente=$13,endereco_cliente=$14,atualizado_em=NOW(),atualizado_por=$15 WHERE id=$1`,[o.id,b.cliente.trim(),String(b.contato||''),String(b.observacoes||''),b.validade||null,b.desconto?.tipo||'nenhum',Number(b.desconto?.valor||0),totals.subtotal,totals.desconto_itens,totals.desconto_geral,totals.total,b.tipo_destinatario||'CLIENTE',b.documento_cliente||null,b.endereco_cliente||null,req.user.id]);
  await client.query('DELETE FROM orcamento_itens WHERE orcamento_id=$1',[o.id]);
  for(const x of totals.detail)await client.query(`INSERT INTO orcamento_itens (orcamento_id,codigo,ean,descricao,quantidade,preco_centavos,desconto_tipo,desconto_valor,desconto_centavos,total_centavos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[o.id,x.codigo,x.ean,x.descricao,x.quantidade,x.preco_centavos,x.desconto_tipo,x.desconto_valor,x.desconto_centavos,x.total_centavos]);
  await client.query('INSERT INTO orcamento_auditoria(orcamento_id,acao,usuario_id,dados_anteriores) VALUES($1,$2,$3,$4::jsonb)',[o.id,'EDICAO',req.user.id,JSON.stringify(before)]);
  await client.query('COMMIT');res.json({ok:true,id:o.id,total_centavos:totals.total});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
router.delete('/:id',...base,safe(async(req,res)=>{
 if(!isManager(req.user))fail('Somente gerente/administrador pode cancelar orçamentos',403);
 const motivo=String(req.body?.motivo||'').trim();if(motivo.length<5)fail('Informe motivo com pelo menos 5 caracteres');
 const client=await pool.connect();try{await client.query('BEGIN');const before=await snapshot(client,req.params.id);if(before.orcamento.status==='CANCELADO')fail('Orçamento já cancelado');
 await client.query(`UPDATE orcamentos SET status='CANCELADO',cancelado_em=NOW(),cancelado_por=$2,motivo_cancelamento=$3 WHERE id=$1`,[before.orcamento.id,req.user.id,motivo]);
 await client.query('INSERT INTO orcamento_auditoria(orcamento_id,acao,usuario_id,dados_anteriores,detalhes) VALUES($1,$2,$3,$4::jsonb,$5)',[before.orcamento.id,'CANCELAMENTO',req.user.id,JSON.stringify(before),motivo]);
 await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
router.get('/:id/auditoria',...base,safe(async(req,res)=>{const r=await pool.query('SELECT id,acao,usuario_id,detalhes,criado_em FROM orcamento_auditoria WHERE orcamento_id=$1 ORDER BY id DESC',[req.params.id]);res.json({eventos:r.rows})}));
const dataBR=v=>v?new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza'}):'Não informada';
router.get('/:id/pdf',...base,safe(async(req,res)=>{
 const {o,items}=await load(req.params.id);
 const empresa=o.tipo_destinatario==='EMPRESA';
 res.type('application/pdf');res.set('Content-Disposition',`attachment; filename="${o.numero}.pdf"`);
 const doc=new PDFDocument({size:'A4',margin:0,bufferPages:true});doc.pipe(res);
 const navy='#0b3973',gold='#f5b700', W=595.28,H=841.89, left=40,right=W-40;
 const logo=path.join(__dirname,'assets','manaira-000.png');
 const line=(x1,y1,x2,y2,c=navy,w=1)=>doc.strokeColor(c).lineWidth(w).moveTo(x1,y1).lineTo(x2,y2).stroke();
 function pageHeader(){
  doc.rect(left,38,right-left,745).lineWidth(.8).strokeColor(gold).stroke();
  try{doc.image(logo,47,45,{fit:[60,56]})}catch(e){}
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(10).text('SUPERMERCADOS MANAÍRA LTDA',115,48,{width:255});
  doc.font('Helvetica').fontSize(8).text('CNPJ: 09.143.892/0001-54',115,64).text('Av. João Câncio da Silva, 492',115,76).text('Manaíra - João Pessoa/PB',115,88);
  doc.font('Helvetica-Bold').fontSize(15).text(empresa?'ORÇAMENTO EMPRESARIAL':'ORÇAMENTO',365,48,{width:185,align:'right'});
  doc.fontSize(8).text(`EMISSÃO: ${dataBR(o.criado_em)}`,375,68,{width:175,align:'right'}).text(`VALIDADE: ${dataBR(o.validade_em)}`,375,80,{width:175,align:'right'});
  doc.rect(left,115,257,14).fill(navy);doc.rect(297,115,258,14).fill(gold);
  doc.fillColor('white').fontSize(8).text(empresa?'DADOS DA EMPRESA CLIENTE':'DADOS DO CLIENTE',44,119);
  doc.fillColor(navy).text('DADOS DO EMITENTE',301,119);
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(9).text(String(o.cliente||''),44,134,{width:245,height:23});
  doc.font('Helvetica').fontSize(8).text(`${empresa?'CNPJ':'Documento'}: ${o.documento_cliente||'Não informado'}`,44,154,{width:245});
  doc.text(String(o.contato||''),44,166,{width:245,height:12});
  if(o.endereco_cliente)doc.text(String(o.endereco_cliente),44,177,{width:245,height:26});
  doc.font('Helvetica-Bold').text('SUPERMERCADOS MANAÍRA LTDA',301,134,{width:250});
  doc.font('Helvetica').text('CNPJ: 09.143.892/0001-54',301,149).text('Av. João Câncio da Silva, 492',301,161).text('Manaíra - João Pessoa/PB',301,173);
  doc.rect(left,209,right-left,26).fill(navy);
  const cols=[44,68,108,142,205,375,417,483];
  ['ITEM','QTD.','UND','CÓDIGO','DESCRIÇÃO DO PRODUTO','PREÇO UNIT.','DESC.','TOTAL ITEM'].forEach((t,i)=>doc.fillColor('white').font('Helvetica-Bold').fontSize(i===4?7.2:6.8).text(t,cols[i],218,{width:(cols[i+1]||555)-cols[i]-3,align:i===4?'left':'center'}));
 }
 function footer(pageNum,totalPages,last){
  doc.rect(left,748,right-left,21).fill(navy);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('white').text('SUPERMERCADOS MANAÍRA LTDA  •  QUALIDADE, AGILIDADE E COMPROMISSO',left,755,{width:right-left,align:'center'});
  doc.font('Helvetica').fontSize(7).fillColor(navy).text(`Página ${pageNum} de ${totalPages}`,left,731,{width:110});
  if(last){doc.font('Helvetica').fontSize(7.5).text('Orçamento não reserva mercadorias. Sujeito às condições comerciais e disponibilidade.',left,678,{width:500});
    doc.fontSize(8).text('Subtotal: '+br(o.subtotal_centavos),330,690,{width:220,align:'right'}).text('Descontos nos itens: − '+br(o.desconto_itens_centavos),330,704,{width:220,align:'right'}).text('Desconto geral: − '+br(o.desconto_geral_centavos),330,718,{width:220,align:'right'});
    doc.font('Helvetica-Bold').fontSize(10).fillColor(navy).text('TOTAL GERAL: '+br(o.total_centavos),330,733,{width:220,align:'right'});
  }
 }
 const perPage=24;
 const pageCount=Math.max(1,Math.ceil(items.length/perPage));
 for(let pg=0;pg<pageCount;pg++){
  if(pg>0)doc.addPage();pageHeader();
  const chunk=items.slice(pg*perPage,(pg+1)*perPage);
  chunk.forEach((x,i)=>{
   const y=241+i*17;doc.font('Helvetica').fillColor(navy).fontSize(7.4);
   const col=(txt,c,w,align='left')=>doc.text(String(txt),c,y,{width:w,align,height:14,ellipsis:true});
   col(pg*perPage+i+1,44,20,'center');col(x.quantidade,68,37,'right');col('UND',108,29,'center');col(x.ean||x.codigo||'',142,61);col(x.descricao,205,167);col(br(x.preco_centavos),375,41,'right');col(br(x.desconto_centavos),417,62,'right');col(br(x.total_centavos),483,68,'right');
   line(left,y+15,right,y+15,'#e8edf2',.3);
  });
  footer(pg+1,pageCount,pg===pageCount-1);
  if(o.status==='CANCELADO')doc.save().opacity(.18).fillColor('#b91c1c').font('Helvetica-Bold').fontSize(55).rotate(-30,{origin:[280,430]}).text('CANCELADO',75,425,{width:500,align:'center'}).restore();
 }
 doc.end();
}));
router.get('/:id/csv',...base,safe(async(req,res)=>{const {o,items}=await load(req.params.id);const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const lines=[['Orçamento',o.numero],['Cliente',o.cliente],['Validade',o.validade_em||''],[],['Código','EAN','Produto','Quantidade','Preço unitário','Desconto','Total'],...items.map(x=>[x.codigo,x.ean,x.descricao,x.quantidade,(x.preco_centavos/100).toFixed(2).replace('.',','),(x.desconto_centavos/100).toFixed(2).replace('.',','),(x.total_centavos/100).toFixed(2).replace('.',',')]),[],['TOTAL','','','','','',(o.total_centavos/100).toFixed(2).replace('.',',')]];res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition',`attachment; filename="${o.numero}.csv"`);res.send('\ufeff'+lines.map(x=>x.map(esc).join(';')).join('\r\n'))}));
module.exports=router;
