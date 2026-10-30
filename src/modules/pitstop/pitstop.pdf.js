'use strict';
const PDFDocument = require('pdfkit');
const path = require('path');
const LOGO = path.join(__dirname, '../../../public/img/pitstop-logo.jpg');
const C = {navy:'#172E61',blue:'#2167AB',yellow:'#F4C631',red:'#D83B42',ink:'#203049',muted:'#5F718A',line:'#DFE7F1',pale:'#F4F7FB',white:'#FFFFFF'};
const W=595.28, LEFT=42, RIGHT=553, BODY=511;
const stamp = d => new Date(d).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'});
const moneyQty = n => Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
const datePt = s => String(s).split('-').reverse().join('/');
function rounded(doc,x,y,w,h,r,fill,stroke){doc.roundedRect(x,y,w,h,r);if(fill&&stroke)doc.fillAndStroke(fill,stroke);else if(fill)doc.fill(fill);else doc.stroke(stroke);}
function label(doc,t,x,y,w){doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted).text(t.toUpperCase(),x,y,{width:w});}
function startPdf(res,file){
 const doc=new PDFDocument({size:'A4',margin:LEFT,bufferPages:true,autoFirstPage:true});
 res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${file}"`,'Cache-Control':'private, no-store'});doc.pipe(res);return doc;
}
function header(doc,{subtitle,meta='',continued=false}){
 doc.rect(0,0,W,8).fill(C.navy);
 doc.image(LOGO,LEFT,26,{fit:[270,76]});
 doc.font('Helvetica-Bold').fontSize(9).fillColor(C.navy).text('CONTROLE DE ABASTECIMENTO',348,47,{width:205,align:'right'});
 doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('Supermercado Manaíra',348,64,{width:205,align:'right'});
 doc.moveTo(LEFT,111).lineTo(RIGHT,111).lineWidth(1).strokeColor(C.line).stroke();
 doc.font('Helvetica-Bold').fontSize(continued?14:17).fillColor(C.ink).text(subtitle,LEFT,127,{width:BODY});
 if(meta)doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(meta,LEFT,151,{width:BODY});
 doc.y=178;
}
function addPage(doc,title,meta){doc.addPage();header(doc,{subtitle:title,meta,continued:true});}
function sectionTitle(doc,title){doc.font('Helvetica-Bold').fontSize(11).fillColor(C.navy).text(title,LEFT,doc.y,{width:BODY});doc.moveDown(.8);}
function summary(doc,items){
 const gap=9,w=(BODY-(items.length-1)*gap)/items.length,y=doc.y;
 items.forEach((a,i)=>{const x=LEFT+i*(w+gap);rounded(doc,x,y,w,69,9,C.pale);label(doc,a.label,x+12,y+12,w-24);doc.font('Helvetica-Bold').fontSize(19).fillColor(C.navy).text(String(a.value),x+12,y+32,{width:w-24});});
 doc.y=y+87;
}
function tableHead(doc){const y=doc.y;rounded(doc,LEFT,y,BODY,24,5,C.navy);doc.font('Helvetica-Bold').fontSize(8).fillColor(C.white).text('PRODUTO / EAN',LEFT+10,y+8,{width:395}).text('QUANTIDADE',RIGHT-98,y+8,{width:88,align:'right'});doc.y=y+29;}
function tableRow(doc,desc,ean,quantity,idx){
 const y=doc.y;const name=String(desc||'-');const h=Math.max(43,Math.ceil(name.length/66)*11+29);
 if(y+h>753){addPage(doc,'Resumo de produtos','Continuação do relatório');tableHead(doc);}
 const z=doc.y;if(idx%2===0)rounded(doc,LEFT,z,BODY,h-2,4,C.pale);
 doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink).text(name,LEFT+10,z+8,{width:380,height:h-20,ellipsis:true});
 doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('EAN '+String(ean||'-'),LEFT+10,z+h-17,{width:380});
 doc.font('Helvetica-Bold').fontSize(10).fillColor(C.blue).text(moneyQty(quantity),RIGHT-105,z+14,{width:95,align:'right'});
 doc.y=z+h;
}
async function photoCard(doc,item,fetchPhoto,title,meta){
 const height=131;
 if(doc.y+height>752)addPage(doc,title,meta);
 const y=doc.y;rounded(doc,LEFT,y,BODY,height-8,9,C.white,C.line);
 rounded(doc,RIGHT-127,y+11,114,99,7,C.pale);
 doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(String(item.descricao||'-'),LEFT+13,y+14,{width:350,height:34,ellipsis:true});
 doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('EAN: '+String(item.ean||'-'),LEFT+13,y+51,{width:345});
 doc.font('Helvetica-Bold').fontSize(9).fillColor(C.blue).text('Quantidade: '+moneyQty(item.quantidade),LEFT+13,y+68,{width:345});
 doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(stamp(item.criado_em),LEFT+13,y+85,{width:345});
 if(item.usuario_nome)doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('Responsável: '+item.usuario_nome,LEFT+13,y+101,{width:345,height:14,ellipsis:true});
 if(item.foto_public_id){try{const buf=await fetchPhoto(item);doc.image(buf,RIGHT-124,y+14,{fit:[108,92],align:'center',valign:'center'});}catch(_){doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('Foto indisponível',RIGHT-121,y+55,{width:101,align:'center'});}}
 else doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('Sem foto',RIGHT-121,y+55,{width:101,align:'center'});
 doc.y=y+height;
}
function footer(doc){const pages=doc.bufferedPageRange().count;for(let i=0;i<pages;i++){doc.switchToPage(i);doc.moveTo(LEFT,781).lineTo(RIGHT,781).strokeColor(C.line).lineWidth(.7).stroke();doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('PIT STOP MANAÍRA  •  Relatório interno',LEFT,790,{width:350});doc.text(`Página ${i+1} de ${pages}`,RIGHT-115,790,{width:115,align:'right'});}}
async function sessionReport(res,s,rows,responsavel,fetchPhoto){
 const doc=startPdf(res,`PitStop_Abastecimento_${s.id}.pdf`);
 const title=`Abastecimento #${s.id}`;
 header(doc,{subtitle:title,meta:`Responsável: ${responsavel||'-'}  •  Abertura: ${stamp(s.criado_em)}`});
 const total=rows.reduce((a,r)=>a+Number(r.quantidade||0),0);
 summary(doc,[{label:'Lançamentos',value:rows.length},{label:'Unidades registradas',value:moneyQty(total)},{label:'Emitido em',value:new Date().toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza'})}]);
 sectionTitle(doc,'COMPROVANTES DE ABASTECIMENTO');
 for(const item of rows)await photoCard(doc,item,fetchPhoto,title,`Abastecimento #${s.id}  •  Continuação`);
 footer(doc);doc.end();
}
async function periodReport(res,ini,fim,rows,fetchPhoto){
 const doc=startPdf(res,`PitStop_Relatorio_${ini}_a_${fim}.pdf`);
 const title='Relatório consolidado';const meta=`Período: ${datePt(ini)} a ${datePt(fim)}  •  Gerado em: ${stamp(new Date())}`;
 header(doc,{subtitle:title,meta});
 const products=new Map();let total=0;
 for(const item of rows){const q=Number(item.quantidade||0);total+=q;const old=products.get(item.ean)||{descricao:item.descricao,q:0};old.q+=q;products.set(item.ean,old);}
 summary(doc,[{label:'Lançamentos',value:rows.length},{label:'Unidades',value:moneyQty(total)},{label:'Produtos distintos',value:products.size}]);
 sectionTitle(doc,'RESUMO POR PRODUTO');tableHead(doc);
 let idx=0;for(const [ean,p] of products)tableRow(doc,p.descricao,ean,p.q,idx++);
 if(doc.y>680)addPage(doc,title,meta);else doc.y+=18;
 sectionTitle(doc,'COMPROVANTES FOTOGRÁFICOS');
 for(const item of rows)await photoCard(doc,item,fetchPhoto,title,meta);
 footer(doc);doc.end();
}
module.exports={sessionReport,periodReport};
