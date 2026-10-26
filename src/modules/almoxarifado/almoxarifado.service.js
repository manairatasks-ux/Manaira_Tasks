const model = require('./almoxarifado.model');

function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function text(v) { return String(v ?? '').trim(); }
function positiveInt(v, field = 'Quantidade') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) fail(`${field} deve ser um número inteiro maior que zero.`);
  return n;
}
function nonNegativeInt(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) fail('Quantidade inicial deve ser um número inteiro igual ou maior que zero.');
  return n;
}

async function dashboard() { return model.dashboard(); }
async function listItems(query) { return model.listItems({ busca: text(query.busca), categoria: text(query.categoria) }); }

async function createItem(body, user) {
  const descricao = text(body.descricao);
  if (!descricao) fail('Descrição do item é obrigatória.');
  const unidade = text(body.unidade).toUpperCase() || 'UND';
  const quantidade_inicial = nonNegativeInt(body.quantidade_inicial);
  return model.createItem({
    descricao,
    categoria: text(body.categoria),
    codigo_patrimonio: text(body.codigo_patrimonio),
    unidade,
    observacao: text(body.observacao),
    quantidade_inicial,
    observacao_inicial: 'Estoque inicial'
  }, user.id);
}

async function updateItem(id, body) {
  const existente = await model.getItem(id);
  if (!existente || !existente.ativo) fail('Item não encontrado.', 404);
  const descricao = text(body.descricao);
  if (!descricao) fail('Descrição do item é obrigatória.');
  return model.updateItem(id, {
    descricao,
    categoria: text(body.categoria),
    codigo_patrimonio: text(body.codigo_patrimonio),
    unidade: text(body.unidade).toUpperCase() || 'UND',
    observacao: text(body.observacao)
  });
}

async function movement(tipo, body, user) {
  if (!['ENTRADA', 'SAIDA'].includes(tipo)) fail('Tipo de movimentação inválido.');
  const itemId = Number(body.item_id);
  if (!Number.isInteger(itemId) || itemId <= 0) fail('Selecione um item.');
  const quantidade = positiveInt(body.quantidade);
  if (tipo === 'SAIDA' && !text(body.destino) && !text(body.responsavel)) {
    fail('Informe pelo menos o destino ou o responsável pela saída.');
  }
  return model.createMovement({
    itemId,
    tipo,
    quantidade,
    destino: text(body.destino),
    responsavel: text(body.responsavel),
    observacao: text(body.observacao),
    usuarioId: user.id
  });
}

async function history(query) { return model.history({ tipo: text(query.tipo).toUpperCase(), busca: text(query.busca), limite: query.limite }); }


function validateVariation(v) {
  const rotulo = text(v.rotulo) || 'Padrão';
  if (rotulo.length > 160) fail('Variação muito longa.');
  return {rotulo, atributos: {tipo: text(v.tipo) || 'Variação', valor: rotulo},
    codigo_patrimonio: text(v.codigo_patrimonio), quantidade_inicial: nonNegativeInt(v.quantidade_inicial)};
}
function validateProduct(body) {
  const descricao=text(body.descricao);
  if (!descricao || descricao.length>180) fail('Informe a descrição (até 180 caracteres).');
  const variacoes=Array.isArray(body.variacoes) ? body.variacoes.map(validateVariation) : [];
  if (!variacoes.length || variacoes.length>100) fail('Informe de 1 a 100 variações.');
  const labels=variacoes.map(v=>v.rotulo.toLocaleLowerCase('pt-BR'));
  if (new Set(labels).size !== labels.length) fail('Existem variações repetidas.');
  return {descricao,categoria:text(body.categoria),unidade:text(body.unidade).toUpperCase()||'UND',
    observacao:text(body.observacao), variacoes};
}
async function listProducts(query) {return model.listProducts({busca:text(query.busca)});}
async function createProduct(body,user) {return model.createProduct(validateProduct(body),user.id);}
async function addVariation(id,body,user) {return model.addVariation(id,validateVariation(body),user.id);}
async function updateProduct(id,body) {
 const descricao=text(body.descricao);
 if(!descricao) fail('Descrição obrigatória.');
 return model.updateProduct(id,{descricao,categoria:text(body.categoria),unidade:text(body.unidade)||'UND',observacao:text(body.observacao)});
}

async function adjustStock(body,user) {
 const itemId=Number(body.item_id), quantidadeFisica=Number(body.quantidade_fisica),saldoConferido=Number(body.saldo_conferido);
 if(!Number.isSafeInteger(itemId)||itemId<1) fail('Selecione uma variação válida.');
 if(!Number.isSafeInteger(quantidadeFisica)||quantidadeFisica<0) fail('A quantidade física deve ser um inteiro igual ou maior que zero.');
 if(!Number.isSafeInteger(saldoConferido)||saldoConferido<0) fail('Saldo conferido inválido. Atualize a página.');
 const motivo=text(body.motivo),observacao=text(body.observacao);
 if(motivo.length<3||motivo.length>160) fail('Informe um motivo válido.');
 if(observacao.length<10||observacao.length>1000) fail('Descreva o motivo do ajuste (10 a 1000 caracteres).');
 return model.adjustStock({itemId,quantidadeFisica,saldoConferido,motivo,observacao,usuarioId:user.id});
}
async function deactivateVariation(produtoId, itemId, body, user) {
  const p = Number(produtoId), i = Number(itemId);
  if (!Number.isSafeInteger(p) || p < 1 || !Number.isSafeInteger(i) || i < 1) fail('Produto ou variação inválidos.');
  const motivo = text(body?.motivo);
  if (motivo.length < 5 || motivo.length > 500) fail('Informe o motivo da desativação (5 a 500 caracteres).');
  return model.deactivateVariation({ produtoId: p, itemId: i, motivo, usuarioId: user.id });
}
async function adjustmentHistory(query){return model.adjustmentHistory({limite:query.limite});}

module.exports = { deactivateVariation, adjustStock, adjustmentHistory, listProducts, createProduct, addVariation, updateProduct, dashboard, listItems, createItem, updateItem, movement, history };
