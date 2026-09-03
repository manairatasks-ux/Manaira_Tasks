const model=require('./galpao.model');
let sqlPromise=null;

function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function text(v){return String(v??'').trim();}
function positiveInt(v,nome){const n=Number(v);if(!Number.isInteger(n)||n<=0)fail(`${nome} deve ser um número inteiro maior que zero.`);return n;}
function normalizeDate(v){const s=text(v);if(!s)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;fail('Data/validade inválida.');}
function isPrincipal(user){return String(user?.perfil||'').toLowerCase()==='administrador_principal'||user?.administrador_principal===true;}

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
async function stockForProduct(id){return model.stockForProduct(Number(id));}
async function movement(tipo,body,user){
  const produtoId=Number(body.produto_id);if(!Number.isInteger(produtoId)||produtoId<=0)fail('Selecione um produto.');
  const quantidade=positiveInt(body.quantidade,'Quantidade');const unidadesPorEmbalagem=positiveInt(body.unidades_por_embalagem||1,'Unid/Emb');
  const validade=normalizeDate(body.validade);const dataMovimento=normalizeDate(body.data_movimento)||new Date().toISOString().slice(0,10);
  return model.createMovement({produtoId,tipo,validade,unidadesPorEmbalagem,quantidade,dataMovimento,observacao:text(body.observacao),usuarioId:user.id});
}
async function history(q){const tipo=text(q.tipo).toUpperCase();if(tipo&&!['ENTRADA','SAIDA'].includes(tipo))fail('Tipo inválido.');return model.history({tipo,busca:text(q.busca),limite:q.limite});}
async function expiry(q){return model.expiry({dias:q.dias,busca:text(q.busca)});}
async function previewImport(file,user){if(!isPrincipal(user))fail('Somente o Administrador Principal pode importar o banco antigo do Galpão.',403);const parsed=await parseLegacy(file?.buffer);const atual=await model.hasData();return{arquivo:file.originalname,tamanho:file.size,possui_dados_atuais:Boolean(atual?.possui),produtos:parsed.produtos.length,estoque:parsed.estoque.length,entradas:parsed.entradas.length,saidas:parsed.saidas.length};}
async function executeImport(file,body,user){if(!isPrincipal(user))fail('Somente o Administrador Principal pode importar o banco antigo do Galpão.',403);if(text(body.confirmacao)!=='IMPORTAR')fail('Confirmação inválida. Digite IMPORTAR para continuar.');const parsed=await parseLegacy(file?.buffer);return model.importLegacy({buffer:file.buffer,parsed,usuarioId:user.id,replaceExisting:String(body.substituir||'false')==='true',nomeArquivo:file.originalname});}
module.exports={dashboard,listProducts,createProduct,updateProduct,listStock,stockForProduct,movement,history,expiry,previewImport,executeImport};
