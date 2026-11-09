'use strict';
// DANFE em formato fiscal convencional, gerada integralmente do XML procNFe.
// Não pretende reproduzir pixel a pixel a impressão personalizada do emissor.
const PDFDocument=require('pdfkit');
const {XMLParser,XMLValidator}=require('fast-xml-parser');
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,parseTagValue:false,trimValues:true});
const S=v=>String(v??'').trim();
const V=(o,k)=>S(o?.[k]);
const N=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const money=v=>N(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=v=>{const s=S(v);if(!/^\d{4}-\d{2}-\d{2}/.test(s))return s;return `${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)} ${s.slice(11,19)}`.trim()};
const arr=v=>Array.isArray(v)?v:v?[v]:[];
const cnpj=v=>{const s=S(v).replace(/\D/g,'');return s.length===14?s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):s};
const cep=v=>{const s=S(v);return s.length===8?s.slice(0,5)+'-'+s.slice(5):s};
const addr=a=>[V(a,'xLgr'),V(a,'nro'),V(a,'xCpl'),V(a,'xBairro'),[V(a,'xMun'),V(a,'UF')].filter(Boolean).join(' / '),cep(V(a,'CEP'))].filter(Boolean).join(' — ');
function parse(xml){
 if(typeof xml!=='string'||Buffer.byteLength(xml,'utf8')>3*1024*1024||/<\s*!\s*(DOCTYPE|ENTITY)\b/i.test(xml))throw new Error('XML inválido ou acima do limite de 3 MB.');
 if(XMLValidator.validate(xml)!==true)throw new Error('XML NF-e malformado.');
 const doc=parser.parse(xml);const proc=doc.nfeProc||doc.NFeProc||{};
 const nf=proc.NFe||doc.NFe;const inf=nf?.infNFe;
 if(!inf?.ide||!inf?.emit||!inf?.dest||!inf?.total?.ICMSTot||V(inf.ide,'mod')!=='55')throw new Error('XML não é uma NF-e modelo 55 completa.');
 const chave=V(inf,'@_Id').replace(/^NFe/i,'');
 if(!/^\d{44}$/.test(chave))throw new Error('Chave de acesso inválida.');
 return {inf,prot:proc.protNFe?.infProt||{},chave};
}
// Padrão Code 128 C (somente dígitos, chave NF-e com 44 posições).
const PATTERNS=('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
function barcode(doc,code,x,y,width,height){
 const nums=[105];for(let i=0;i<code.length;i+=2)nums.push(Number(code.slice(i,i+2)));
 let check=nums[0];for(let i=1;i<nums.length;i++)check+=i*nums[i];nums.push(check%103,106);
 const total=nums.reduce((sum,n)=>sum+PATTERNS[n].split('').reduce((a,b)=>a+Number(b),0),0);
 const unit=width/(total+20);let pos=x+10*unit;
 doc.save().fillColor('#000000');for(const n of nums){let black=true;for(const c of PATTERNS[n]){const w=Number(c)*unit;if(black)doc.rect(pos,y,w,height).fill();pos+=w;black=!black;}}doc.restore();
}
function render(xml,res){
 const {inf,prot,chave}=parse(xml);
 const ide=inf.ide,emit=inf.emit,dest=inf.dest,t=inf.total.ICMSTot;
 const L=25,W=545.28,BOTTOM=776,FOOTER_Y=796;
 const pdf=new PDFDocument({size:'A4',margins:{top:25,bottom:25,left:25,right:25},bufferPages:true,autoFirstPage:false,
  info:{Title:`DANFE NF-e ${V(ide,'nNF')} série ${V(ide,'serie')}`,Author:'Supermercado Manaíra — geração a partir do XML NF-e'}});
 res.setHeader('Content-Type','application/pdf');
 res.setHeader('Content-Disposition',`inline; filename="DANFE-${V(ide,'nNF')}-${V(ide,'serie')}.pdf"`);
 res.setHeader('Cache-Control','private, no-store');
 pdf.on('error',e=>{console.error('Erro DANFE:',e.message);res.destroy(e)});pdf.pipe(res);
 const border=(x,y,w,h)=>pdf.save().lineWidth(.55).strokeColor('#111').rect(x,y,w,h).stroke().restore();
 const line=(x1,y1,x2,y2)=>pdf.save().lineWidth(.45).strokeColor('#111').moveTo(x1,y1).lineTo(x2,y2).stroke().restore();
 function text(v,x,y,w,h,size=7,bold=false,align='left'){
  pdf.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor('#111').text(S(v)||' ',x,y,{width:w,height:h,ellipsis:true,lineGap:0,align});
 }
 function cell(x,y,w,h,label,value,opts={}){
  border(x,y,w,h);
  text(String(label).toUpperCase(),x+3,y+2,w-6,9,5.1,false);
  text(value,x+3,y+10,w-6,h-12,opts.size||7.3,!!opts.bold,opts.align||'left');
 }
 function section(title,y){
  border(L,y,W,14);
  text(title,L+3,y+3,W-6,9,7.2,true,'center');
  return y+14;
 }
 function page(){pdf.addPage();return 23}
 function drawReceipt(y){
  border(L,y,W,36);
  text(`Recebemos de ${V(emit,'xNome')} os produtos e/ou serviços constantes da Nota Fiscal Eletrônica indicada ao lado.`,L+4,y+4,W-170,8,6.6,false);
  text(`DATA DE RECEBIMENTO`,L+4,y+22,130,8,5.2,false);
  text(`IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR`,L+136,y+22,230,8,5.2,false);
  line(L+130,y+20,L+130,y+35);
  line(L+365,y,L+365,y+36);
  text('NF-e',L+370,y+4,W-374,12,11,true,'center');
  text(`Nº ${V(ide,'nNF')}
Série ${V(ide,'serie')}`,L+370,y+16,W-374,16,9,true,'center');
  return y+39;
 }
 function danfeHead(y,total){
  const emitW=185,centerW=95,rightW=W-emitW-centerW;
  border(L,y,emitW,90);
  text(V(emit,'xNome'),L+4,y+5,emitW-8,12,10.5,true,'center');
  text(addr(emit.enderEmit),L+4,y+19,emitW-8,34,6.2,false,'center');
  text([`Fone: ${V(emit.enderEmit,'fone')||V(emit,'fone')}`,(V(emit,'email')?`E-mail: ${V(emit,'email')}`:'')].filter(Boolean).join('   '),L+4,y+58,emitW-8,10,6.1,false,'center');
  text(`CNPJ: ${cnpj(V(emit,'CNPJ'))}   IE: ${V(emit,'IE')}`,L+4,y+70,emitW-8,10,6.3,false,'center');

  border(L+emitW,y,centerW,90);
  text('DANFE',L+emitW+3,y+8,centerW-6,12,13,true,'center');
  text('Documento Auxiliar da\nNota Fiscal Eletrônica',L+emitW+4,y+24,centerW-8,18,7.1,false,'center');
  text('0 - ENTRADA',L+emitW+7,y+50,55,8,7,false);
  border(L+emitW+64,y+47,10,10); if(V(ide,'tpNF')==='0') text('X',L+emitW+66,y+48,6,8,7,true,'center');
  text('1 - SAÍDA',L+emitW+7,y+63,55,8,7,false);
  border(L+emitW+64,y+60,10,10); if(V(ide,'tpNF')!=='0') text('X',L+emitW+66,y+61,6,8,7,true,'center');
  text(`Nº ${V(ide,'nNF')}`,L+emitW+4,y+74,centerW-8,8,9,true,'center');
  text(`SÉRIE ${V(ide,'serie')}   FOLHA 1/${total||1}`,L+emitW+4,y+83,centerW-8,7,7.3,true,'center');

  border(L+emitW+centerW,y,rightW,90);
  text('CHAVE DE ACESSO',L+emitW+centerW+4,y+4,rightW-8,8,5.4,false,'center');
  barcode(pdf,chave,L+emitW+centerW+18,y+13,rightW-36,24);
  text(chave.replace(/(\d{4})(?=\d)/g,'$1 '),L+emitW+centerW+6,y+39,rightW-12,10,7.2,true,'center');
  text('Consulta de autenticidade no portal nacional da NF-e\nou no site da Sefaz autorizadora.',L+emitW+centerW+8,y+52,rightW-16,16,6.2,false,'center');
  text([V(prot,'nProt'),date(V(prot,'dhRecbto'))].filter(Boolean).join('  -  '),L+emitW+centerW+8,y+72,rightW-16,10,6.2,true,'center');
  return y+93;
 }
 function firstHeader(){
  let y=page();
  y=drawReceipt(y);
  y=danfeHead(y,1);
  cell(L,y,350,23,'Natureza da operação',V(ide,'natOp'));
  cell(L+350,y,W-350,23,'Protocolo de autorização de uso',[V(prot,'nProt'),date(V(prot,'dhRecbto'))].filter(Boolean).join(' - '),{size:6.2}); y+=23;
  cell(L,y,182,20,'Inscrição estadual',V(emit,'IE')); cell(L+182,y,182,20,'Inscrição estadual do substituto tributário',V(emit,'IEST')); cell(L+364,y,W-364,20,'CNPJ / CPF',cnpj(V(emit,'CNPJ'))||V(emit,'CPF')); y+=23;

  y=section('DESTINATÁRIO / REMETENTE',y);
  cell(L,y,310,25,'Nome / razão social',V(dest,'xNome')); cell(L+310,y,122,25,'CNPJ / CPF',cnpj(V(dest,'CNPJ'))||V(dest,'CPF')); cell(L+432,y,W-432,25,'Data da emissão',date(V(ide,'dhEmi')||V(ide,'dEmi')),{size:6.2}); y+=25;
  cell(L,y,250,24,'Endereço',`${V(dest.enderDest,'xLgr')}, ${V(dest.enderDest,'nro')} ${V(dest.enderDest,'xCpl')}`.trim(),{size:6.5});
  cell(L+250,y,118,24,'Bairro / distrito',V(dest.enderDest,'xBairro')); cell(L+368,y,77,24,'CEP',cep(V(dest.enderDest,'CEP'))); cell(L+445,y,W-445,24,'Data saída / entrada',date(V(ide,'dhSaiEnt')||V(ide,'dSaiEnt')),{size:6.2}); y+=24;
  cell(L,y,165,22,'Município',V(dest.enderDest,'xMun')); cell(L+165,y,35,22,'UF',V(dest.enderDest,'UF')); cell(L+200,y,110,22,'Telefone / fax',V(dest.enderDest,'fone')); cell(L+310,y,135,22,'Inscrição estadual',V(dest,'IE')); cell(L+445,y,W-445,22,'Hora saída',S(V(ide,'hSaiEnt'))||S(V(ide,'dhSaiEnt')).slice(11,19),{size:6.2}); y+=25;

  y=section('CÁLCULO DO IMPOSTO',y);
  const taxes=[['Base de cálculo ICMS',V(t,'vBC')],['Valor do ICMS',V(t,'vICMS')],['Base de cálculo ICMS ST',V(t,'vBCST')],['Valor do ICMS ST',V(t,'vST')],['Valor total dos produtos',V(t,'vProd')],['Valor do frete',V(t,'vFrete')],['Valor do seguro',V(t,'vSeg')],['Desconto',V(t,'vDesc')],['Outras despesas acessórias',V(t,'vOutro')],['Valor do IPI',V(t,'vIPI')],['Valor total da nota',V(t,'vNF')]];
  const widths=[W/5,W/5,W/5,W/5,W/5,W/6,W/6,W/6,W/6,W/6,W/6];
  let x=L;
  for(let i=0;i<5;i++){ cell(x,y,widths[i],21,taxes[i][0],money(taxes[i][1]),{size:6.8}); x+=widths[i]; }
  y+=21; x=L;
  for(let i=5;i<11;i++){ cell(x,y,widths[i],21,taxes[i][0],money(taxes[i][1]),{size:i===10?8.3:6.8,bold:i===10}); x+=widths[i]; }
  y+=24;
  cell(L,y,W,18,'PIS / COFINS / tributos',`PIS ${money(V(t,'vPIS'))}   COFINS ${money(V(t,'vCOFINS'))}   Tributos aprox. ${money(V(t,'vTotTrib'))}`,{size:6.2}); y+=21;

  y=section('TRANSPORTADOR / VOLUMES TRANSPORTADOS',y);
  const tr=inf.transp||{},trans=tr.transporta||{},vol=arr(tr.vol)[0]||{};
  cell(L,y,178,22,'Nome / razão social',V(trans,'xNome')); cell(L+178,y,92,22,'Frete por conta',V(tr,'modFrete')); cell(L+270,y,74,22,'Código ANTT',V(tr.veicTransp,'RNTC')); cell(L+344,y,64,22,'Placa do veículo',V(tr.veicTransp,'placa')||V(trans,'placa')); cell(L+408,y,28,22,'UF',V(tr.veicTransp,'UF')||V(trans,'UF')); cell(L+436,y,W-436,22,'CNPJ / CPF',cnpj(V(trans,'CNPJ'))||V(trans,'CPF')); y+=22;
  cell(L,y,178,22,'Endereço',V(trans,'xEnder')); cell(L+178,y,120,22,'Município',V(trans,'xMun')); cell(L+298,y,36,22,'UF',V(trans,'UF')); cell(L+334,y,70,22,'Quantidade',V(vol,'qVol')); cell(L+404,y,60,22,'Espécie',V(vol,'esp')); cell(L+464,y,50,22,'Marca',V(vol,'marca')); cell(L+514,y,W-514,22,'Numeração',V(vol,'nVol')); y+=22;
  cell(L,y,140,22,'Peso bruto',V(vol,'pesoB')); cell(L+140,y,140,22,'Peso líquido',V(vol,'pesoL')); cell(L+280,y,W-280,22,'Fatura / pagamento',(()=>{const cobr=inf.cobr||{};const dup=arr(cobr.dup).map(d=>`${V(d,'nDup')} ${date(V(d,'dVenc'))} R$ ${money(V(d,'vDup'))}`).join(' | ');return [V(cobr.fat,'nFat'),dup||arr(inf.pag?.detPag).map(p=>`Tipo ${V(p,'tPag')} R$ ${money(V(p,'vPag'))}`).join(' | ')].filter(Boolean).join(' — ')})(),{size:6.1}); y+=25;
  return y;
 }
 function continuation(){
  let y=page();
  y=drawReceipt(y);
  y=danfeHead(y,1);
  return y;
 }
 const widths=[38,175,40,25,34,31,41,42,46,46,27];
 const cols=['CÓD. PROD.','DESCRIÇÃO DO PRODUTO / SERVIÇO','NCM/SH','CST','CFOP','UNID.','QTDE.','V. UNIT.','V. TOTAL','BC ICMS','ICMS %'];
 function tableHeader(y){let x=L;cols.forEach((n,i)=>{border(x,y,widths[i],22);text(n,x+2,y+4,widths[i]-4,16,5.5,true,i===1?'left':'center');x+=widths[i]});return y+22}
 let y=firstHeader(); y=section('DADOS DOS PRODUTOS / SERVIÇOS',y); y=tableHeader(y);
 for(const d of arr(inf.det)){
  const p=d.prod||{},im=d.imposto||{},icms=(im.ICMS&&Object.values(im.ICMS)[0])||{};
  const cest=V(p,'CEST'),desc=[V(p,'xProd'),cest?`CEST ${cest}`:''].filter(Boolean).join(' | ');
  const rows=[V(p,'cProd'),desc,V(p,'NCM'),V(icms,'CST')||V(icms,'CSOSN'),V(p,'CFOP'),V(p,'uCom'),V(p,'qCom'),money(V(p,'vUnCom')),money(V(p,'vProd')),money(V(icms,'vBC')),V(icms,'pICMS')];
  pdf.font('Helvetica').fontSize(6.0);
  const rh=Math.max(22,Math.min(64,Math.ceil(pdf.heightOfString(desc,{width:widths[1]-6,lineGap:0})+8)));
  const extra=`EAN: ${V(p,'cEAN')} | UN trib.: ${V(p,'uTrib')} ${V(p,'qTrib')} x ${V(p,'vUnTrib')} | ICMS R$ ${money(V(icms,'vICMS'))} | IPI R$ ${money(V((im.IPI||{}).IPITrib,'vIPI'))} | PIS R$ ${money(V(Object.values(im.PIS||{})[0],'vPIS'))} | COFINS R$ ${money(V(Object.values(im.COFINS||{})[0],'vCOFINS'))}`;
  const extraH=12;
  if(y+rh+extraH>BOTTOM){y=continuation(); y=section('CONTINUAÇÃO — PRODUTOS / SERVIÇOS',y); y=tableHeader(y)}
  let x=L; rows.forEach((v,i)=>{border(x,y,widths[i],rh); text(v,x+2,y+3,widths[i]-4,rh-5,i===1?6.0:5.9,false,i<2?'left':'right'); x+=widths[i]}); y+=rh;
  border(L,y,W,extraH); text(extra,L+3,y+3,W-6,8,5.4,false,'left'); y+=extraH;
 }
 const infExtra=inf.infAdic||{};
 const obs=[V(infExtra,'infCpl'),V(infExtra,'infAdFisco'),...arr(infExtra.obsCont).map(x=>`${V(x,'@_xCampo')}: ${V(x,'xTexto')}`)].filter(Boolean).join('\n')||'—';
 pdf.font('Helvetica').fontSize(6.5);
 const words=obs.split(/\s+/); let part=''; const parts=[]; const maxTextHeight=115;
 for(const word of words){ const test=part?part+' '+word:word; if(part&&pdf.heightOfString(test,{width:W*0.68-10,lineGap:0})>maxTextHeight){parts.push(part); part=word}else part=test }
 if(part)parts.push(part);
 for(let i=0;i<parts.length;i++){
  pdf.font('Helvetica').fontSize(6.5);
  const chunkH=Math.max(44,Math.ceil(pdf.heightOfString(parts[i],{width:W*0.68-10,lineGap:0}))+15);
  if(y+16+chunkH>BOTTOM) y=continuation();
  y=section(i?'DADOS ADICIONAIS — CONTINUAÇÃO':'DADOS ADICIONAIS',y);
  const leftW=Math.round(W*0.68), rightW=W-leftW;
  cell(L,y,leftW,chunkH,'Informações complementares',parts[i],{size:6.5});
  cell(L+leftW,y,rightW,chunkH,'Reservado ao fisco',[
   `Chave de acesso: ${chave}`,
   `Protocolo: ${V(prot,'nProt')}`,
   `Autorização: ${date(V(prot,'dhRecbto'))}`
  ].filter(Boolean).join('\n'),{size:6.3});
  y+=chunkH;
 }
 const range=pdf.bufferedPageRange(), total=range.count;
 for(let i=range.start;i<range.start+total;i++){
  pdf.switchToPage(i);
  pdf.font('Helvetica').fontSize(7).fillColor('#333').text(`NF-e ${V(ide,'nNF')} / Série ${V(ide,'serie')}  |  Folha ${i-range.start+1}/${total}`,L,FOOTER_Y,{width:W,height:10,align:'right',lineBreak:false});
  pdf.save().fillColor('#fff').rect(L+189,145,87,8).fill().restore();
  text(`SÉRIE ${V(ide,'serie')}   FOLHA ${i-range.start+1}/${total}`,L+189,145,87,7,7.3,true,'center');
 }
 pdf.end();
}
module.exports={render,parse};
