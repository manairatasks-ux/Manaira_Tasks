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
 const w=595.28,h=841.89,L=25,R=570.28,W=R-L;
 const pdf=new PDFDocument({size:'A4',margin:25,bufferPages:true,autoFirstPage:false,info:{Title:`DANFE NF-e ${V(ide,'nNF')} série ${V(ide,'serie')}`,Author:'Supermercado Manaíra — geração a partir do XML NF-e'}});
 res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`inline; filename="DANFE-${V(ide,'nNF')}-${V(ide,'serie')}.pdf"`);res.setHeader('Cache-Control','private, no-store');
 pdf.on('error',e=>{console.error('Erro DANFE:',e.message);res.destroy(e)});pdf.pipe(res);
 const border=(x,y,wid,hei)=>pdf.lineWidth(.6).strokeColor('#454545').rect(x,y,wid,hei).stroke();
 function cell(x,y,wid,hei,label,value,opts={}){
  border(x,y,wid,hei);
  pdf.font('Helvetica').fillColor('#333').fontSize(5.5).text(S(label).toUpperCase(),x+3,y+2,{width:wid-6,height:9,ellipsis:true});
  pdf.font(opts.bold?'Helvetica-Bold':'Helvetica').fillColor('#111').fontSize(opts.size||8).text(S(value)||' ',x+3,y+12,{width:wid-6,height:Math.max(1,hei-13),ellipsis:true,align:opts.align||'left',lineGap:0});
 }
 const bar=(title,y)=>{pdf.fillColor('#111').font('Helvetica-Bold').fontSize(8).text(title,L,y,{width:W,height:11});return y+12};
 function head(continuation=false){
  pdf.addPage();let y=25;
  cell(L,y,275,72,'Identificação do emitente',[V(emit,'xNome'),addr(emit.enderEmit),`CNPJ: ${cnpj(V(emit,'CNPJ'))}`].join('\n'),{bold:true,size:8});
  cell(L+275,y,90,72,'DANFE',`Documento Auxiliar\nda Nota Fiscal Eletrônica\n${V(ide,'tpNF')==='0'?'0 - ENTRADA':'1 - SAÍDA'}`,{bold:true,size:8});
  cell(L+365,y,W-365,72,'Nº / Série',`${V(ide,'nNF')}  /  ${V(ide,'serie')}\nFolha: a calcular`,{size:9,bold:true});y+=72;
  cell(L,y,W,65,'Chave de acesso',chave,{size:9,bold:true});barcode(pdf,chave,L+20,y+25,W-40,27);y+=65;
  cell(L,y,365,34,'Natureza da operação',V(ide,'natOp'));
  cell(L+365,y,W-365,34,'Protocolo de autorização de uso',[V(prot,'nProt'),date(V(prot,'dhRecbto'))].filter(Boolean).join(' - '));y+=34;
  cell(L,y,180,32,'Inscrição estadual',V(emit,'IE'));cell(L+180,y,180,32,'Inscrição estadual do subst. trib.',V(emit,'IEST'));cell(L+360,y,W-360,32,'CNPJ / CPF',cnpj(V(emit,'CNPJ'))||V(emit,'CPF'));y+=37;
  y=bar('DESTINATÁRIO / REMETENTE',y);
  cell(L,y,315,36,'Nome / razão social',V(dest,'xNome'));cell(L+315,y,130,36,'CNPJ / CPF',cnpj(V(dest,'CNPJ'))||V(dest,'CPF'));cell(L+445,y,W-445,36,'Data emissão',date(V(ide,'dhEmi')||V(ide,'dEmi')));y+=36;
  cell(L,y,350,36,'Endereço / bairro',addr(dest.enderDest));cell(L+350,y,100,36,'CEP',cep(V(dest.enderDest,'CEP')));cell(L+450,y,W-450,36,'Data saída/entrada',date(V(ide,'dhSaiEnt')||V(ide,'dSaiEnt')));y+=36;
  cell(L,y,260,34,'Município',V(dest.enderDest,'xMun'));cell(L+260,y,70,34,'UF',V(dest.enderDest,'UF'));cell(L+330,y,115,34,'Telefone',V(dest.enderDest,'fone'));cell(L+445,y,W-445,34,'Inscrição estadual',V(dest,'IE'));y+=39;
  y=bar('FATURA / PAGAMENTO',y);
  const cobr=inf.cobr||{};const dup=arr(cobr.dup).map(d=>`${V(d,'nDup')}  ${date(V(d,'dVenc'))}  R$ ${money(V(d,'vDup'))}`).join('    |    ');
  cell(L,y,W,37,'Fatura / duplicatas',[V(cobr.fat,'nFat'),dup||arr(inf.pag?.detPag).map(p=>`Tipo: ${V(p,'tPag')} / Valor: R$ ${money(V(p,'vPag'))}`).join('   ')].filter(Boolean).join(' — '),{size:7});y+=42;
  y=bar('CÁLCULO DO IMPOSTO',y);
  const taxes=[['Base cálculo ICMS',V(t,'vBC')],['Valor ICMS',V(t,'vICMS')],['Base ICMS ST',V(t,'vBCST')],['Valor ICMS ST',V(t,'vST')],['Valor produtos',V(t,'vProd')],['Frete',V(t,'vFrete')],['Seguro',V(t,'vSeg')],['Desconto',V(t,'vDesc')],['Outras despesas',V(t,'vOutro')],['Valor IPI',V(t,'vIPI')]];
  taxes.forEach((a,i)=>cell(L+(i%5)*W/5,y+Math.floor(i/5)*31,W/5,31,a[0],money(a[1]),{size:7}));y+=62;
  cell(L,y,W/2,33,'Valor total da NF-e','R$ '+money(V(t,'vNF')),{bold:true,size:12});cell(L+W/2,y,W/2,33,'PIS / COFINS / tributos',`PIS ${money(V(t,'vPIS'))}  COFINS ${money(V(t,'vCOFINS'))}  Trib. aprox. ${money(V(t,'vTotTrib'))}`,{size:7});y+=38;
  y=bar('TRANSPORTADOR / VOLUMES TRANSPORTADOS',y);const tr=inf.transp||{},trans=tr.transporta||{},vol=arr(tr.vol)[0]||{};
  cell(L,y,252,34,'Razão social',V(trans,'xNome'));cell(L+252,y,72,34,'Frete por conta',V(tr,'modFrete'));cell(L+324,y,106,34,'Código ANTT / placa',V(tr.veicTransp,'placa')||V(trans,'placa'));cell(L+430,y,W-430,34,'CNPJ / CPF',cnpj(V(trans,'CNPJ'))||V(trans,'CPF'));y+=34;
  cell(L,y,185,32,'Endereço',V(trans,'xEnder'));cell(L+185,y,113,32,'Município',V(trans,'xMun'));cell(L+298,y,45,32,'UF',V(trans,'UF'));cell(L+343,y,90,32,'Quantidade',V(vol,'qVol'));cell(L+433,y,W-433,32,'Peso bruto / líquido',`${V(vol,'pesoB')} / ${V(vol,'pesoL')}`);y+=37;
  return {y,continuation};
 }
 const widths=[38,175,40,25,34,31,41,42,46,46,27];
 const cols=['CÓD.','DESCRIÇÃO DOS PRODUTOS / SERVIÇOS','NCM','CST','CFOP','UN','QUANT.','V. UNIT.','V. TOTAL','B. ICMS','ICMS %'];
 function tableHeader(y){pdf.font('Helvetica-Bold').fontSize(6);let x=L;cols.forEach((n,i)=>{border(x,y,widths[i],25);pdf.text(n,x+2,y+4,{width:widths[i]-4,height:19,align:i===1?'left':'center'});x+=widths[i]});return y+25}
 const det=arr(inf.det);
 let {y}=head();y=bar('DADOS DOS PRODUTOS / SERVIÇOS',y);y=tableHeader(y);
 for(const d of det){
  const p=d.prod||{},im=d.imposto||{},icms=(im.ICMS&&Object.values(im.ICMS)[0])||{};
  const cest=V(p,'CEST'),desc=[V(p,'xProd'),cest?`CEST ${cest}`:''].filter(Boolean).join(' | ');
  const rows=[V(p,'cProd'),desc,V(p,'NCM'),V(icms,'CST')||V(icms,'CSOSN'),V(p,'CFOP'),V(p,'uCom'),V(p,'qCom'),money(V(p,'vUnCom')),money(V(p,'vProd')),money(V(icms,'vBC')),V(icms,'pICMS')];
  const hh=Math.max(24,Math.min(75,pdf.heightOfString(desc,{width:widths[1]-5,font:'Helvetica',fontSize:6.5})+7));
  if(y+hh>771){({y}=head(true));y=bar('CONTINUAÇÃO — PRODUTOS / SERVIÇOS',y);y=tableHeader(y)}
  let x=L;rows.forEach((v,i)=>{border(x,y,widths[i],hh);pdf.font('Helvetica').fontSize(i===1?6.5:6).fillColor('#111').text(S(v),x+2,y+3,{width:widths[i]-4,height:hh-5,ellipsis:true,align:i<2?'left':'right'});x+=widths[i]});y+=hh;
  if(y+28<765){const extra=`EAN: ${V(p,'cEAN')} | UN trib.: ${V(p,'uTrib')} ${V(p,'qTrib')} x ${V(p,'vUnTrib')} | ICMS R$ ${money(V(icms,'vICMS'))} | IPI R$ ${money(V((im.IPI||{}).IPITrib,'vIPI'))} | PIS R$ ${money(V(Object.values(im.PIS||{})[0],'vPIS'))} | COFINS R$ ${money(V(Object.values(im.COFINS||{})[0],'vCOFINS'))}`;pdf.font('Helvetica').fontSize(5.7).fillColor('#444').text(extra,L+3,y+2,{width:W-6,height:13,ellipsis:true});y+=17}
 }
 if(y>650){({y}=head(true));y=bar('DADOS ADICIONAIS',y)}else y+=8;
 y=bar('DADOS ADICIONAIS',y);
 const extra=inf.infAdic||{};const obs=[V(extra,'infCpl'),V(extra,'infAdFisco'),...arr(extra.obsCont).map(x=>`${V(x,'@_xCampo')}: ${V(x,'xTexto')}`)].filter(Boolean).join('\n');
 if(!obs){cell(L,y,W,55,'Informações complementares','—')}else{
  const lines=obs.match(/.{1,700}/gs)||[];
  for(const segment of lines){if(y>735){({y}=head(true));y=bar('DADOS ADICIONAIS — CONTINUAÇÃO',y)}const height=Math.min(125,Math.max(40,pdf.heightOfString(segment,{width:W-10,fontSize:7})+15));cell(L,y,W,height,'Informações complementares',segment,{size:7});y+=height}
 }
 const pages=pdf.bufferedPageRange();for(let i=pages.start;i<pages.start+pages.count;i++){
  pdf.switchToPage(i);
  pdf.font('Helvetica').fillColor('#222').fontSize(7).text(`DANFE gerada a partir do XML NF-e  |  Página ${i+1} de ${pages.count}`,L,809,{width:W,align:'right',lineBreak:false});
  // Substituição visual do campo folha dentro do quadro de identificação.
  pdf.save().fillColor('#fff').rect(L+368,72,W-373,12).fill();pdf.restore();
  pdf.fillColor('#111').font('Helvetica-Bold').fontSize(8).text(`FOLHA ${i+1}/${pages.count}`,L+368,73,{width:W-373});
 }
 pdf.end();
}
module.exports={render,parse};
