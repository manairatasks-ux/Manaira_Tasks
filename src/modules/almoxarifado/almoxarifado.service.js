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

module.exports = { dashboard, listItems, createItem, updateItem, movement, history };
