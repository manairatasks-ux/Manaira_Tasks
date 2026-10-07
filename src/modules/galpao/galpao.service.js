const model=require('./galpao.model');
let sqlPromise=null;

function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function text(v){return String(v??'').trim();}
function positiveInt(v,nome){const n=Number(v);if(!Number.isInteger(n)||n<=0)fail(`${nome} deve ser um número inteiro maior que zero.`);return n;}
function normalizeDate(v){const s=text(v);if(!s)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;fail('Data/validade inválida.');}
function isPrincipal(user){return String(user?.perfil||'').toLowerCase()==='administrador_principal'||user?.administrador_principal===true;}
function isAdmin(user){return ['administrador_principal','administrador','admin'].includes(String(user?.perfil||'').toLowerCase())||user?.administrador_principal===true;}

async function getSqlJs(){
  if(!sqlPromise){
    const initSqlJs=require('sql.js');
    sqlPromise=initSqlJs({locateFile:file=>require.resolve(`sql.js/dist/${file}`)});
  }
  return sqlPromise;
}
function querySqlite(db,sql){const r=db.exec(sql);if(!r.length)return[];const {columns,values}=r[0];return values.map(row=>Object.fromEntries(columns.map((c,i)=>[c,row[i]])));}
function validateColumns(rows,name,required){if(!rows.length)return;for(const c of required){if(!(c in rows[0]))fail(`O banco selecionado não possui a coluna ${c} na tabela ${name}.`);}}
async function parseLegacy(buffer){
  if(!buffer?.length)fail('Selecione um arquivo .db do projeto Galpão.');
  const SQL=await getSqlJs(); let db;
  try{db=new SQL.Database(new Uint8Array(buffer));}catch{fail('O arquivo selecionado não é um banco SQLite válido.');}
  try{
    const tables=querySqlite(db,"SELECT name FROM sqlite_master WHERE type='table'").map(x=>x.name);
    for(const t of ['produtos','estoque','entradas','saidas'])if(!tables.includes(t))fail(`Banco incompatível: tabela ${t} não encontrada.`);
    const produtos=querySqlite(db,'SELECT codigo_barra, descricao FROM produtos');
    const estoque=querySqlite(db,'SELECT id, codigo_barra, validade, COALESCE(unidades_por_embalagem,1) AS unidades_por_embalagem, quantidade FROM estoque');
    const entradas=querySqlite(db,'SELECT id, data, codigo_barra, descricao, validade, COALESCE(unidades_por_embalagem,1) AS unidades_por_embalagem, quantidade FROM entradas');
    const saidas=querySqlite(db,'SELECT id, data, codigo_barra, descricao, validade, COALESCE(unidades_por_embalagem,1) AS unidades_por_embalagem, quantidade FROM saidas');
    validateColumns(produtos,'produtos',['codigo_barra','descricao']); validateColumns(estoque,'estoque',['codigo_barra','quantidade']);
    return{produtos,estoque,entradas,saidas};
  }finally{db.close();}
}

async function dashboard(){return model.dashboard();}
async function listProducts(q){return model.listProducts({busca:text(q.busca)});}
async function createProduct(body){const codigo_barra=text(body.codigo_barra),descricao=text(body.descricao);if(!codigo_barra)fail('Código de barras é obrigatório.');if(!descricao)fail('Descrição é obrigatória.');try{return await model.createProduct({codigo_barra,descricao});}catch(e){if(e.code==='23505')fail('Já existe um produto com este código de barras.');throw e;}}
async function updateProduct(id,body){const existente=await model.getProduct(id);if(!existente)fail('Produto não encontrado.',404);const codigo_barra=text(body.codigo_barra),descricao=text(body.descricao);if(!codigo_barra||!descricao)fail('Código de barras e descrição são obrigatórios.');try{return await model.updateProduct(id,{codigo_barra,descricao});}catch(e){if(e.code==='23505')fail('Já existe outro produto com este código de barras.');throw e;}}
async function listStock(q){return model.listStock({busca:text(q.busca),validade:text(q.validade)});}

async function stockReport(){
  // Relatório completo agrupado por produto, preservando a discriminação dos lotes.
  // A linha "TOTAL DO PRODUTO" só é exibida quando o item possui mais de um lote ativo.
  // Produtos sem estoque continuam aparecendo com saldo zerado.
  const linhas=await model.listStock({busca:'',validade:''});
  const mapa=new Map();
  let lotesAtivos=0,embalagens=0,unidades=0;

  for(const item of linhas){
    const produtoId=String(item.produto_id);
    const qtd=Number(item.quantidade||0);
    const total=Number(item.total_unidades||0);
    const semEstoque=item.sem_estoque===true||item.sem_estoque==='true';

    if(qtd>0)lotesAtivos++;
    embalagens+=qtd;
    unidades+=total;

    if(!mapa.has(produtoId)){
      mapa.set(produtoId,{
        produto_id:item.produto_id,
        codigo_barra:item.codigo_barra,
        descricao:item.descricao,
        lotes:[],
        quantidade_total:0,
        total_unidades:0,
        sem_estoque:true
      });
    }

    const ag=mapa.get(produtoId);
    if(qtd>0 && !semEstoque){
      ag.sem_estoque=false;
      ag.quantidade_total+=qtd;
      ag.total_unidades+=total;
      ag.lotes.push({
        validade:item.validade ? String(item.validade).slice(0,10) : null,
        unidades_por_embalagem:Number(item.unidades_por_embalagem||0),
        quantidade:qtd,
        total_unidades:total,
        sem_estoque:false
      });
    } else if(ag.lotes.length===0){
      // Mantém uma linha sintética para itens sem estoque.
      ag.lotes=[{
        validade:null,
        unidades_por_embalagem:Number(item.unidades_por_embalagem||0),
        quantidade:0,
        total_unidades:0,
        sem_estoque:true
      }];
    }
  }

  const itens=[...mapa.values()].map(item=>{
    const lotes=item.sem_estoque
      ? item.lotes.slice(0,1)
      : item.lotes.sort((a,b)=>{
          const av=a.validade||'9999-12-31', bv=b.validade||'9999-12-31';
          return av.localeCompare(bv) || Number(a.unidades_por_embalagem||0)-Number(b.unidades_por_embalagem||0);
        });
    return {
      produto_id:item.produto_id,
      codigo_barra:item.codigo_barra,
      descricao:item.descricao,
      lotes,
      quantidade_total:item.sem_estoque?0:item.quantidade_total,
      total_unidades:item.sem_estoque?0:item.total_unidades,
      sem_estoque:item.sem_estoque,
      mostrar_total:lotes.filter(l=>!l.sem_estoque && Number(l.quantidade||0)>0).length>1
    };
  }).sort((a,b)=>String(a.descricao||'').localeCompare(String(b.descricao||''),'pt-BR'));

  const semEstoque=itens.filter(i=>i.sem_estoque).length;
  return {itens,resumo:{produtos:itens.length,lotesAtivos,embalagens,unidades,semEstoque}};
}
async function stockForProduct(id){return model.stockForProduct(Number(id));}
async function movement(tipo,body,user){
  const produtoId=Number(body.produto_id);if(!Number.isInteger(produtoId)||produtoId<=0)fail('Selecione um produto.');
  const quantidade=positiveInt(body.quantidade,'Quantidade');const unidadesPorEmbalagem=positiveInt(body.unidades_por_embalagem||1,'Unid/Emb');
  const validade=normalizeDate(body.validade);const dataMovimento=normalizeDate(body.data_movimento)||new Date().toISOString().slice(0,10);
  return model.createMovement({produtoId,tipo,validade,unidadesPorEmbalagem,quantidade,dataMovimento,observacao:text(body.observacao),usuarioId:user.id});
}
async function history(q){const tipo=text(q.tipo).toUpperCase();if(tipo&&!['ENTRADA','SAIDA'].includes(tipo))fail('Tipo inválido.');return model.history({tipo,busca:text(q.busca),limite:q.limite});}
async function reverseMovement(id,body,user){const movId=Number(id);if(!Number.isInteger(movId)||movId<=0)fail('Movimentação inválida.');const motivo=text(body.motivo);if(!motivo)fail('Informe o motivo do estorno.');if(motivo.length>500)fail('O motivo do estorno deve ter no máximo 500 caracteres.');return model.reverseMovement({id:movId,usuarioId:user.id,admin:isAdmin(user),motivo});}
async function expiry(q){return model.expiry({dias:q.dias,busca:text(q.busca)});}
async function adjustmentStock(q){return model.adjustmentStock({busca:text(q.busca)});}
async function adjustmentHistory(q){return model.adjustmentHistory({busca:text(q.busca),limite:q.limite});}
function adjustmentText(body){
  const motivo=text(body.motivo),observacao=text(body.observacao);
  if(!motivo)fail('Selecione o motivo do ajuste.');
  if(!observacao)fail('Descreva o motivo do ajuste na observação.');
  if(motivo.length>120)fail('Motivo muito longo.');
  if(observacao.length>1000)fail('A observação deve ter no máximo 1000 caracteres.');
  return {motivo,observacao};
}
async function adjustQuantity(body,user){
  const estoqueId=Number(body.estoque_id); if(!Number.isInteger(estoqueId)||estoqueId<=0)fail('Selecione um lote válido.');
  const quantidadeFisica=Number(body.quantidade_fisica); if(!Number.isInteger(quantidadeFisica)||quantidadeFisica<0)fail('A quantidade física deve ser um número inteiro igual ou maior que zero.');
  const {motivo,observacao}=adjustmentText(body);
  return model.adjustQuantity({estoqueId,quantidadeFisica,motivo,observacao,usuarioId:user.id});
}
async function correctValidity(body,user){
  const estoqueId=Number(body.estoque_id); if(!Number.isInteger(estoqueId)||estoqueId<=0)fail('Selecione um lote válido.');
  const quantidade=positiveInt(body.quantidade,'Quantidade a corrigir');
  const validadeNova=body.sem_validade===true||body.sem_validade==='true'?null:normalizeDate(body.validade_nova);
  if(!validadeNova && !(body.sem_validade===true||body.sem_validade==='true'))fail('Informe a nova validade ou marque Sem validade.');
  const {motivo,observacao}=adjustmentText(body);
  return model.correctValidity({estoqueId,validadeNova,quantidade,motivo,observacao,usuarioId:user.id});
}
async function previewImport(file,user){if(!isPrincipal(user))fail('Somente o Administrador Principal pode importar o banco antigo do Galpão.',403);const parsed=await parseLegacy(file?.buffer);const atual=await model.hasData();return{arquivo:file.originalname,tamanho:file.size,possui_dados_atuais:Boolean(atual?.possui),produtos:parsed.produtos.length,estoque:parsed.estoque.length,entradas:parsed.entradas.length,saidas:parsed.saidas.length};}
async function executeImport(file,body,user){if(!isPrincipal(user))fail('Somente o Administrador Principal pode importar o banco antigo do Galpão.',403);if(text(body.confirmacao)!=='IMPORTAR')fail('Confirmação inválida. Digite IMPORTAR para continuar.');const parsed=await parseLegacy(file?.buffer);return model.importLegacy({buffer:file.buffer,parsed,usuarioId:user.id,replaceExisting:String(body.substituir||'false')==='true',nomeArquivo:file.originalname});}
module.exports={dashboard,listProducts,createProduct,updateProduct,listStock,stockReport,stockForProduct,movement,history,reverseMovement,expiry,adjustmentStock,adjustmentHistory,adjustQuantity,correctValidity,previewImport,executeImport};
