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
 const border=(x,y,w,h)=>pdf.save().lineWidth(.5).strokeColor('#555').rect(x,y,w,h).stroke().restore();
 function text(v,x,y,w,h,size=7,bold=false,align='left'){
  pdf.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor('#111').text(S(v)||' ',x,y,{width:w,height:h,ellipsis:true,lineGap:0,align});
 }
 function cell(x,y,w,h,label,value,opts={}){
  border(x,y,w,h);
  text(String(label).toUpperCase(),x+3,y+2,w-6,9,5.3,false);
  text(value,x+3,y+11,w-6,h-13,opts.size||7.5,!!opts.bold,opts.align||'left');
 }
 function section(title,y){text(title,L,y,W,12,8,true);return y+13}
 function page(){pdf.addPage();return 23}
 function firstHeader(){
  let y=page();
  cell(L,y,275,60,'Identificação do emitente',[V(emit,'xNome'),addr(emit.enderEmit),`CNPJ: ${cnpj(V(emit,'CNPJ'))}`].join('\n'),{bold:true,size:7.2});
  cell(L+275,y,90,60,'DANFE',`Documento Auxiliar\nda Nota Fiscal\nEletrônica\n${V(ide,'tpNF')==='0'?'0 - ENTRADA':'1 - SAÍDA'}`,{bold:true,size:7});
  cell(L+365,y,W-365,60,'Nº / Série',`${V(ide,'nNF')} / ${V(ide,'serie')}`,{size:10,bold:true});y+=60;
  cell(L,y,W,58,'Chave de acesso',chave,{size:8.2,bold:true});barcode(pdf,chave,L+18,y+24,W-36,25);y+=58;
  cell(L,y,365,30,'Natureza da operação',V(ide,'natOp'));
  cell(L+365,y,W-365,30,'Protocolo de autorização de uso',[V(prot,'nProt'),date(V(prot,'dhRecbto'))].filter(Boolean).join(' - '),{size:6.7});y+=30;
  cell(L,y,180,27,'Inscrição estadual',V(emit,'IE'));cell(L+180,y,180,27,'Inscrição estadual do subst. trib.',V(emit,'IEST'));cell(L+360,y,W-360,27,'CNPJ / CPF',cnpj(V(emit,'CNPJ'))||V(emit,'CPF'));y+=31;
  y=section('DESTINATÁRIO / REMETENTE',y);
  cell(L,y,315,30,'Nome / razão social',V(dest,'xNome'));cell(L+315,y,130,30,'CNPJ / CPF',cnpj(V(dest,'CNPJ'))||V(dest,'CPF'));cell(L+445,y,W-445,30,'Data emissão',date(V(ide,'dhEmi')||V(ide,'dEmi')),{size:6.5});y+=30;
  cell(L,y,350,30,'Endereço / bairro',addr(dest.enderDest),{size:6.8});cell(L+350,y,100,30,'CEP',cep(V(dest.enderDest,'CEP')));cell(L+450,y,W-450,30,'Data saída/entrada',date(V(ide,'dhSaiEnt')||V(ide,'dSaiEnt')),{size:6.5});y+=30;
  cell(L,y,260,27,'Município',V(dest.enderDest,'xMun'));cell(L+260,y,65,27,'UF',V(dest.enderDest,'UF'));cell(L+325,y,120,27,'Telefone',V(dest.enderDest,'fone'));cell(L+445,y,W-445,27,'Inscrição estadual',V(dest,'IE'));y+=31;
  y=section('FATURA / PAGAMENTO',y);
  const cobr=inf.cobr||{};const dup=arr(cobr.dup).map(d=>`${V(d,'nDup')} ${date(V(d,'dVenc'))} R$ ${money(V(d,'vDup'))}`).join('  |  ');
  cell(L,y,W,29,'Fatura / duplicatas',[V(cobr.fat,'nFat'),dup||arr(inf.pag?.detPag).map(p=>`Tipo: ${V(p,'tPag')} / R$ ${money(V(p,'vPag'))}`).join('  ')].filter(Boolean).join(' — '),{size:6.6});y+=32;
  y=section('CÁLCULO DO IMPOSTO',y);
  const taxes=[['Base cálculo ICMS',V(t,'vBC')],['Valor ICMS',V(t,'vICMS')],['Base ICMS ST',V(t,'vBCST')],['Valor ICMS ST',V(t,'vST')],['Valor produtos',V(t,'vProd')],['Frete',V(t,'vFrete')],['Seguro',V(t,'vSeg')],['Desconto',V(t,'vDesc')],['Outras despesas',V(t,'vOutro')],['Valor IPI',V(t,'vIPI')]];
  taxes.forEach((a,i)=>cell(L+(i%5)*W/5,y+Math.floor(i/5)*25,W/5,25,a[0],money(a[1]),{size:7}));y+=50;
  cell(L,y,W/2,29,'Valor total da NF-e','R$ '+money(V(t,'vNF')),{bold:true,size:10});cell(L+W/2,y,W/2,29,'PIS / COFINS / tributos',`PIS ${money(V(t,'vPIS'))}  COFINS ${money(V(t,'vCOFINS'))}  Trib. aprox. ${money(V(t,'vTotTrib'))}`,{size:6.6});y+=32;
  y=section('TRANSPORTADOR / VOLUMES TRANSPORTADOS',y);const tr=inf.transp||{},trans=tr.transporta||{},vol=arr(tr.vol)[0]||{};
  cell(L,y,252,28,'Razão social',V(trans,'xNome'));cell(L+252,y,72,28,'Frete por conta',V(tr,'modFrete'));cell(L+324,y,106,28,'Código ANTT / placa',V(tr.veicTransp,'placa')||V(trans,'placa'));cell(L+430,y,W-430,28,'CNPJ / CPF',cnpj(V(trans,'CNPJ'))||V(trans,'CPF'));y+=28;
  cell(L,y,185,27,'Endereço',V(trans,'xEnder'));cell(L+185,y,113,27,'Município',V(trans,'xMun'));cell(L+298,y,45,27,'UF',V(trans,'UF'));cell(L+343,y,90,27,'Quantidade',V(vol,'qVol'));cell(L+433,y,W-433,27,'Peso bruto / líquido',`${V(vol,'pesoB')} / ${V(vol,'pesoL')}`);y+=31;
  return y;
 }
 function continuation(){let y=page();cell(L,y,225,35,'Emitente',V(emit,'xNome'),{bold:true,size:8});cell(L+225,y,180,35,'NF-e / Série',`${V(ide,'nNF')} / ${V(ide,'serie')}`,{bold:true,size:8});cell(L+405,y,W-405,35,'CNPJ',cnpj(V(emit,'CNPJ')),{size:7});y+=39;return y}
 const widths=[38,175,40,25,34,31,41,42,46,46,27];
 const cols=['CÓD.','DESCRIÇÃO DOS PRODUTOS / SERVIÇOS','NCM','CST','CFOP','UN','QUANT.','V. UNIT.','V. TOTAL','B. ICMS','ICMS %'];
 function tableHeader(y){let x=L;cols.forEach((n,i)=>{border(x,y,widths[i],21);text(n,x+2,y+4,widths[i]-4,16,5.7,true,i===1?'left':'center');x+=widths[i]});return y+21}
 let y=firstHeader();y=section('DADOS DOS PRODUTOS / SERVIÇOS',y);y=tableHeader(y);
 for(const d of arr(inf.det)){
  const p=d.prod||{},im=d.imposto||{},icms=(im.ICMS&&Object.values(im.ICMS)[0])||{};
  const cest=V(p,'CEST'),desc=[V(p,'xProd'),cest?`CEST ${cest}`:''].filter(Boolean).join(' | ');
  const rows=[V(p,'cProd'),desc,V(p,'NCM'),V(icms,'CST')||V(icms,'CSOSN'),V(p,'CFOP'),V(p,'uCom'),V(p,'qCom'),money(V(p,'vUnCom')),money(V(p,'vProd')),money(V(icms,'vBC')),V(icms,'pICMS')];
  pdf.font('Helvetica').fontSize(6.1);
  const rh=Math.max(20,Math.min(59,Math.ceil(pdf.heightOfString(desc,{width:widths[1]-6,lineGap:0})+7)));
  const extra=`EAN: ${V(p,'cEAN')} | UN trib.: ${V(p,'uTrib')} ${V(p,'qTrib')} x ${V(p,'vUnTrib')} | ICMS R$ ${money(V(icms,'vICMS'))} | IPI R$ ${money(V((im.IPI||{}).IPITrib,'vIPI'))} | PIS R$ ${money(V(Object.values(im.PIS||{})[0],'vPIS'))} | COFINS R$ ${money(V(Object.values(im.COFINS||{})[0],'vCOFINS'))}`;
  const extraH=12;
  if(y+rh+extraH>BOTTOM){y=continuation();y=section('CONTINUAÇÃO — PRODUTOS / SERVIÇOS',y);y=tableHeader(y)}
  let x=L;rows.forEach((v,i)=>{border(x,y,widths[i],rh);text(v,x+2,y+3,widths[i]-4,rh-5,i===1?6.1:6,false,i<2?'left':'right');x+=widths[i]});y+=rh;
  text(extra,L+3,y+2,W-6,10,5.5);y+=extraH;
 }
 const infExtra=inf.infAdic||{};
 const obs=[V(infExtra,'infCpl'),V(infExtra,'infAdFisco'),...arr(infExtra.obsCont).map(x=>`${V(x,'@_xCampo')}: ${V(x,'xTexto')}`)].filter(Boolean).join('\n')||'—';
 // Segmentos baseados em linhas reais de PDFKit, sem cortar o texto em posições arbitrárias.
 pdf.font('Helvetica').fontSize(6.6);
 const words=obs.split(/\s+/);let part='';const parts=[];const maxTextHeight=110;
 for(const word of words){const test=part?part+' '+word:word;
  if(part&&pdf.heightOfString(test,{width:W-10,lineGap:0})>maxTextHeight){parts.push(part);part=word}else part=test}
 if(part)parts.push(part);
 for(let i=0;i<parts.length;i++){
  pdf.font('Helvetica').fontSize(6.6);
  const chunkH=Math.max(26,Math.ceil(pdf.heightOfString(parts[i],{width:W-10,lineGap:0}))+15);
  if(y+16+chunkH>BOTTOM)y=continuation();
  y=section(i?'DADOS ADICIONAIS — CONTINUAÇÃO':'DADOS ADICIONAIS',y);
  cell(L,y,W,chunkH,'Informações complementares',parts[i],{size:6.6});y+=chunkH;
 }
 // Insere folhas APENAS nas páginas existentes. Sempre abaixo da área de conteúdo
 // e acima da margem inferior para não provocar novas páginas no PDFKit.
 const range=pdf.bufferedPageRange(),total=range.count;
 for(let i=range.start;i<range.start+total;i++){
  pdf.switchToPage(i);
  pdf.font('Helvetica').fontSize(7).fillColor('#333').text(`NF-e ${V(ide,'nNF')} / ${V(ide,'serie')}  |  Folha ${i-range.start+1}/${total}`,L,FOOTER_Y,{width:W,height:10,align:'right',lineBreak:false});
  // O campo de identificação na folha inicial informa a numeração sem pós-processamento.
  if(i===range.start){pdf.save().fillColor('#fff').rect(L+368,63,W-376,11).fill().restore();text(`Folha 1/${total}`,L+370,64,W-383,10,7.5,true)}
 }
 pdf.end();
}
module.exports={render,parse};
