const service=require('./galpao.service');
const PDFDocument=require('pdfkit');
const {createWorkbook}=require('../../utils/simple-xlsx');

function sendError(res,err){console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Erro interno no módulo Galpão.'});}
function dataArquivo(){return new Date().toLocaleDateString('en-CA',{timeZone:'America/Fortaleza'});}
function dataHoraBr(){return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}).format(new Date());}
function fmtData(v){if(!v)return 'Sem estoque';const s=String(v).slice(0,10);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:s;}
function num(v){const n=Number(v||0);return Number.isFinite(n)?n:0;}

exports.dashboard=async(req,res)=>{try{res.json(await service.dashboard());}catch(e){sendError(res,e);}};
exports.listProducts=async(req,res)=>{try{res.json(await service.listProducts(req.query));}catch(e){sendError(res,e);}};
exports.createProduct=async(req,res)=>{try{res.status(201).json(await service.createProduct(req.body));}catch(e){sendError(res,e);}};
exports.updateProduct=async(req,res)=>{try{res.json(await service.updateProduct(req.params.id,req.body));}catch(e){sendError(res,e);}};
exports.listStock=async(req,res)=>{try{res.json(await service.listStock(req.query));}catch(e){sendError(res,e);}};

exports.stockReportExcel=async(req,res)=>{
  try{
    const {itens,resumo}=await service.stockReport();
    const rows=[];
    for(const item of itens){
      const lotes=Array.isArray(item.lotes)?item.lotes:[];
      lotes.forEach((lote,idx)=>{
        rows.push([
          idx===0?String(item.codigo_barra||''):'',
          idx===0?String(item.descricao||''):'↳ Outro lote',
          lote.sem_estoque?'Sem estoque':(lote.validade?fmtData(lote.validade):'Sem validade'),
          num(lote.unidades_por_embalagem),
          num(lote.quantidade),
          num(lote.total_unidades)
        ]);
      });
      if(item.mostrar_total){
        rows.push([
          '',
          `TOTAL DO PRODUTO - ${String(item.descricao||'')}`,
          '',
          '',
          num(item.quantidade_total),
          num(item.total_unidades)
        ]);
      }
    }
    const buffer=createWorkbook({
      sheetName:'Estoque atual',
      title:'Estoque atual do Galpão',
      subtitle:`Gerado em ${dataHoraBr()} | Produtos: ${Number(resumo.produtos||0).toLocaleString('pt-BR')} | Lotes ativos: ${Number(resumo.lotesAtivos||0).toLocaleString('pt-BR')} | Embalagens: ${Number(resumo.embalagens||0).toLocaleString('pt-BR')} | Unidades: ${Number(resumo.unidades||0).toLocaleString('pt-BR')}`,
      headers:['Código','Produto / lote','Validade','Unid./Emb.','Embalagens','Total unid.'],
      rows,
      widths:[20,52,18,13,14,16]
    });
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="estoque-galpao-${dataArquivo()}.xlsx"`);
    res.setHeader('Content-Length',buffer.length);
    res.end(buffer);
  }catch(e){sendError(res,e);}
};

exports.stockReportPdf=async(req,res)=>{
  try{
    const {itens,resumo}=await service.stockReport();
    const doc=new PDFDocument({size:'A4',layout:'portrait',margin:28,bufferPages:true,info:{Title:'Estoque atual do Galpão',Author:'Plataforma Manaíra'}});
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="estoque-galpao-${dataArquivo()}.pdf"`);
    doc.pipe(res);

    const x0=doc.page.margins.left;
    const pageW=doc.page.width-doc.page.margins.left-doc.page.margins.right;
    const cols=[82,236,74,55,43,49];
    const headers=['Código','Produto / lote','Validade','Unid./Emb.','Emb.','Total'];
    const rowH=17;
    const totalH=19;
    const tableTop=84;
    const footerY=doc.page.height-doc.page.margins.bottom-8;

    function headerPage(){
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#0B1F3A').text('Estoque atual do Galpão',x0,24,{width:pageW});
      doc.font('Helvetica').fontSize(7.7).fillColor('#52657A').text(
        `Gerado em ${dataHoraBr()}  |  Produtos: ${Number(resumo.produtos||0).toLocaleString('pt-BR')}  |  Lotes ativos: ${Number(resumo.lotesAtivos||0).toLocaleString('pt-BR')}  |  Embalagens: ${Number(resumo.embalagens||0).toLocaleString('pt-BR')}  |  Unidades: ${Number(resumo.unidades||0).toLocaleString('pt-BR')}`,
        x0,47,{width:pageW}
      );
      doc.font('Helvetica').fontSize(7.2).fillColor('#64748B').text('Lotes discriminados por produto. A linha de total aparece somente quando o produto possui mais de um lote.',x0,61,{width:pageW});
      let x=x0;
      headers.forEach((h,i)=>{
        doc.rect(x,tableTop,cols[i],20).fill('#2563EB');
        doc.font('Helvetica-Bold').fontSize(7.1).fillColor('#FFFFFF').text(h,x+3,tableTop+6,{width:cols[i]-6,align:i>=3?'right':'left'});
        x+=cols[i];
      });
      doc.y=tableTop+20;
    }

    function ensureSpace(h){
      const maxY=doc.page.height-doc.page.margins.bottom-22;
      if(doc.y+h>maxY){
        doc.addPage({size:'A4',layout:'portrait',margin:28});
        headerPage();
      }
    }

    function drawLotRow(item,lote,idx,globalIndex){
      ensureSpace(rowH);
      const y=doc.y;
      const zero=Boolean(lote.sem_estoque)||num(lote.quantidade)===0;
      const fill=zero?'#FFF1F2':(globalIndex%2===0?'#FFFFFF':'#F8FAFC');
      const vals=[
        idx===0?String(item.codigo_barra||''):'',
        idx===0?String(item.descricao||''):'↳ Outro lote',
        zero?'Sem estoque':(lote.validade?fmtData(lote.validade):'Sem validade'),
        num(lote.unidades_por_embalagem).toLocaleString('pt-BR'),
        num(lote.quantidade).toLocaleString('pt-BR'),
        num(lote.total_unidades).toLocaleString('pt-BR')
      ];
      let x=x0;
      vals.forEach((v,i)=>{
        doc.rect(x,y,cols[i],rowH).fillAndStroke(fill,'#D7E0EC');
        const bold=(idx===0&&i===1)||i>=4;
        doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(6.6).fillColor(zero&&i>=4?'#B91C1C':'#111827').text(
          v,x+3,y+4,{width:cols[i]-6,height:rowH-5,ellipsis:true,align:i>=3?'right':'left',lineBreak:false}
        );
        x+=cols[i];
      });
      doc.y=y+rowH;
    }

    function drawTotalRow(item){
      if(!item.mostrar_total)return;
      ensureSpace(totalH);
      const y=doc.y;
      let x=x0;
      const vals=['',`TOTAL DO PRODUTO\n${String(item.descricao||'')}`,'','',num(item.quantidade_total).toLocaleString('pt-BR'),num(item.total_unidades).toLocaleString('pt-BR')];
      vals.forEach((v,i)=>{
        doc.rect(x,y,cols[i],totalH).fillAndStroke('#EAF2FF','#9EC5FE');
        doc.font('Helvetica-Bold').fontSize(i===1?6.2:6.8).fillColor('#0B3B8F').text(
          v,x+3,y+(i===1?3:5),{width:cols[i]-6,height:totalH-4,ellipsis:true,align:i>=3?'right':'left',lineBreak:i===1}
        );
        x+=cols[i];
      });
      doc.y=y+totalH;
    }

    headerPage();
    let globalIndex=0;
    for(const item of itens){
      const lotes=Array.isArray(item.lotes)?item.lotes:[];
      lotes.forEach((lote,idx)=>drawLotRow(item,lote,idx,globalIndex++));
      drawTotalRow(item);
    }

    const range=doc.bufferedPageRange();
    for(let i=range.start;i<range.start+range.count;i++){
      doc.switchToPage(i);
      const pagina=i-range.start+1;
      doc.font('Helvetica').fontSize(6.8).fillColor('#64748B').text(
        `Página ${pagina} de ${range.count}`,
        doc.page.width-doc.page.margins.right-90,
        footerY-2,
        {width:90,align:'right',lineBreak:false}
      );
    }
    doc.end();
  }catch(e){sendError(res,e);}
};

exports.stockForProduct=async(req,res)=>{try{res.json(await service.stockForProduct(req.params.id));}catch(e){sendError(res,e);}};
exports.entry=async(req,res)=>{try{res.status(201).json(await service.movement('ENTRADA',req.body,req.user));}catch(e){sendError(res,e);}};
exports.exit=async(req,res)=>{try{res.status(201).json(await service.movement('SAIDA',req.body,req.user));}catch(e){sendError(res,e);}};
exports.history=async(req,res)=>{try{res.json(await service.history(req.query));}catch(e){sendError(res,e);}};
exports.reverseMovement=async(req,res)=>{try{res.json({ok:true,...await service.reverseMovement(req.params.id,req.body,req.user)});}catch(e){sendError(res,e);}};
exports.expiry=async(req,res)=>{try{res.json(await service.expiry(req.query));}catch(e){sendError(res,e);}};
exports.adjustmentStock=async(req,res)=>{try{res.json(await service.adjustmentStock(req.query));}catch(e){sendError(res,e);}};
exports.adjustmentHistory=async(req,res)=>{try{res.json(await service.adjustmentHistory(req.query));}catch(e){sendError(res,e);}};
exports.adjustQuantity=async(req,res)=>{try{res.status(201).json({ok:true,...await service.adjustQuantity(req.body,req.user)});}catch(e){sendError(res,e);}};
exports.correctValidity=async(req,res)=>{try{res.status(201).json({ok:true,...await service.correctValidity(req.body,req.user)});}catch(e){sendError(res,e);}};
exports.previewImport=async(req,res)=>{try{res.json(await service.previewImport(req.file,req.user));}catch(e){sendError(res,e);}};
exports.executeImport=async(req,res)=>{try{res.json({ok:true,importacao:await service.executeImport(req.file,req.body,req.user)});}catch(e){sendError(res,e);}};
