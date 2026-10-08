const service=require('./pedidos-galpao.service');
const PDFDocument=require('pdfkit');
function erro(res,e){console.error('Pedidos ao Galpão:',e);res.status(e.status||502).json({error:e.message||'Falha ao consultar os estoques.'});}
exports.sugestoes=async(req,res)=>{try{res.json(await service.sugestoes());}catch(e){erro(res,e);}};
exports.relatorio=async(req,res)=>{
  try{
    const itens=req.body?.itens;
    if(!Array.isArray(itens)||!itens.length||itens.length>500) return res.status(400).json({error:'Selecione de 1 a 500 produtos.'});
    const lista=itens.map(x=>({codigo:String(x.codigo_barra||'').trim(),quantidade:Number(x.quantidade)}));
    if(lista.some(x=>!x.codigo||!Number.isSafeInteger(x.quantidade)||x.quantidade<=0||x.quantidade>100000000))return res.status(400).json({error:'Informe quantidades inteiras e positivas para todos os produtos.'});
    if(new Set(lista.map(x=>x.codigo)).size!==lista.length)return res.status(400).json({error:'Há produtos repetidos no pedido.'});
    // Confirma os produtos no estoque do galpão sem modificar qualquer registro.
    const model=require('../galpao/galpao.model');
    const existentes=await model.listProducts({busca:''});
    const mapa=new Map(existentes.map(p=>[String(p.codigo_barra).trim(),p]));
    if(lista.some(x=>!mapa.has(x.codigo)))return res.status(400).json({error:'Um ou mais produtos não pertencem ao cadastro do Galpão.'});
    const doc=new PDFDocument({size:'A4',margin:35,bufferPages:true});
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition','attachment; filename="guia-pedidos-galpao.pdf"');
    doc.pipe(res);
    const data=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}).format(new Date());
    const largura=525;
    function cabecalho(){
      doc.fillColor('#176A53').font('Helvetica-Bold').fontSize(17).text('SUPERMERCADO MANAÍRA');
      doc.fillColor('#1E293B').fontSize(12).text('GUIA DE PEDIDO AO GALPÃO');
      doc.font('Helvetica').fontSize(9).fillColor('#475569').text('Gerado em: '+data+'  |  Solicitante: '+String(req.user?.nome||req.user?.email||'Usuário'));
      doc.moveDown(.5).text('Documento orientativo. Não realiza reserva, transferência ou baixa de estoque.');
      doc.moveDown();
    }
    function titulo(){const y=doc.y;doc.rect(35,y,largura,23).fill('#176A53');doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9).text('CÓDIGO / PRODUTO',42,y+7,{width:330}).text('QTD.',392,y+7,{width:58,align:'right'}).text('SEPARADO',462,y+7,{width:91,align:'center'});doc.y=y+28;}
    cabecalho();titulo();
    lista.forEach((item,i)=>{
      const p=mapa.get(item.codigo);
      const desc=String(p.descricao||'Produto').slice(0,135);
      doc.font('Helvetica').fontSize(9);
      const altura=Math.max(42,doc.heightOfString(desc,{width:320})+29);
      if(doc.y+altura>doc.page.height-65){doc.addPage();cabecalho();titulo();}
      const y=doc.y;
      if(i%2===0)doc.rect(35,y,largura,altura).fill('#F1F5F9');
      doc.fillColor('#1E293B').font('Helvetica-Bold').text(desc,42,y+5,{width:320});
      doc.font('Helvetica').fontSize(8).fillColor('#64748B').text(item.codigo,42,y+altura-16,{width:320});
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1E293B').text(String(item.quantidade),392,y+12,{width:58,align:'right'});
      doc.rect(495,y+10,13,13).stroke('#64748B');
      doc.y=y+altura;
    });
    if(doc.y+100>doc.page.height-45)doc.addPage();
    doc.moveDown(2).font('Helvetica').fontSize(9).fillColor('#475569').text('Total de produtos: '+lista.length);
    doc.moveDown(2).text('Separado por: ___________________________________');
    doc.moveDown().text('Conferido por: __________________________________');
    doc.moveDown().text('Observações: ___________________________________');
    doc.end();
  }catch(e){if(!res.headersSent)erro(res,e);else res.destroy(e);}
};
