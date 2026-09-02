const { pool, query, get, all } = require('../../config/database');

async function dashboard() {
  const resumo = await get(`
    SELECT
      (SELECT COUNT(*)::int FROM almox_itens WHERE ativo = TRUE) AS itens_cadastrados,
      (SELECT COUNT(*)::int FROM almox_itens WHERE ativo = TRUE AND quantidade_atual > 0) AS itens_com_saldo,
      (SELECT COUNT(*)::int FROM almox_movimentacoes WHERE tipo = 'ENTRADA' AND date_trunc('month', criado_em) = date_trunc('month', CURRENT_DATE)) AS entradas_mes,
      (SELECT COUNT(*)::int FROM almox_movimentacoes WHERE tipo = 'SAIDA' AND date_trunc('month', criado_em) = date_trunc('month', CURRENT_DATE)) AS saidas_mes
  `);
  const recentes = await all(`
    SELECT m.id, m.tipo, m.quantidade, m.destino, m.responsavel, m.observacao,
           m.saldo_anterior, m.saldo_posterior, m.criado_em,
           i.id AS item_id, i.descricao AS item_descricao, i.unidade,
           u.nome AS usuario_nome
    FROM almox_movimentacoes m
    JOIN almox_itens i ON i.id = m.item_id
    LEFT JOIN usuarios u ON u.id = m.usuario_id
    ORDER BY m.criado_em DESC, m.id DESC
    LIMIT 10
  `);
  return { resumo: resumo || {}, recentes };
}

async function listItems({ busca = '', categoria = '' } = {}) {
  const params = [];
  const filtros = ['i.ativo = TRUE'];
  if (busca) {
    params.push(`%${String(busca).trim()}%`);
    filtros.push(`(i.descricao ILIKE $${params.length} OR COALESCE(i.codigo_patrimonio, '') ILIKE $${params.length} OR COALESCE(i.categoria, '') ILIKE $${params.length})`);
  }
  if (categoria) {
    params.push(categoria);
    filtros.push(`i.categoria = $${params.length}`);
  }
  return all(`
    SELECT i.*
    FROM almox_itens i
    WHERE ${filtros.join(' AND ')}
    ORDER BY i.descricao
  `, params);
}

async function getItem(id) {
  return get('SELECT * FROM almox_itens WHERE id = $1', [id]);
}

async function createItem(data, usuarioId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO almox_itens (descricao, categoria, codigo_patrimonio, unidade, observacao, quantidade_atual, criado_por)
      VALUES ($1, $2, $3, $4, $5, 0, $6)
      RETURNING *
    `, [data.descricao, data.categoria || null, data.codigo_patrimonio || null, data.unidade, data.observacao || null, usuarioId]);
    const item = result.rows[0];
    if (data.quantidade_inicial > 0) {
      await client.query('UPDATE almox_itens SET quantidade_atual = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2', [data.quantidade_inicial, item.id]);
      await client.query(`
        INSERT INTO almox_movimentacoes (item_id, tipo, quantidade, observacao, usuario_id, saldo_anterior, saldo_posterior)
        VALUES ($1, 'ENTRADA', $2, $3, $4, 0, $2)
      `, [item.id, data.quantidade_inicial, data.observacao_inicial || 'Estoque inicial', usuarioId]);
      item.quantidade_atual = data.quantidade_inicial;
    }
    await client.query('COMMIT');
    return item;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateItem(id, data) {
  return get(`
    UPDATE almox_itens SET
      descricao = $1,
      categoria = $2,
      codigo_patrimonio = $3,
      unidade = $4,
      observacao = $5,
      atualizado_em = CURRENT_TIMESTAMP
    WHERE id = $6 AND ativo = TRUE
    RETURNING *
  `, [data.descricao, data.categoria || null, data.codigo_patrimonio || null, data.unidade, data.observacao || null, id]);
}

async function createMovement({ itemId, tipo, quantidade, destino, responsavel, observacao, usuarioId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT * FROM almox_itens WHERE id = $1 AND ativo = TRUE FOR UPDATE', [itemId]);
    const item = locked.rows[0];
    if (!item) {
      const e = new Error('Item não encontrado.'); e.status = 404; throw e;
    }
    const anterior = Number(item.quantidade_atual || 0);
    const posterior = tipo === 'ENTRADA' ? anterior + quantidade : anterior - quantidade;
    if (posterior < 0) {
      const e = new Error(`Estoque insuficiente. Saldo atual: ${anterior} ${item.unidade}.`); e.status = 400; throw e;
    }
    await client.query('UPDATE almox_itens SET quantidade_atual = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2', [posterior, itemId]);
    const mov = await client.query(`
      INSERT INTO almox_movimentacoes (item_id, tipo, quantidade, destino, responsavel, observacao, usuario_id, saldo_anterior, saldo_posterior)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [itemId, tipo, quantidade, destino || null, responsavel || null, observacao || null, usuarioId, anterior, posterior]);
    await client.query('COMMIT');
    return { movimentacao: mov.rows[0], item: { ...item, quantidade_atual: posterior } };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function history({ tipo = '', busca = '', limite = 200 } = {}) {
  const params = [];
  const filtros = [];
  if (tipo) { params.push(tipo); filtros.push(`m.tipo = $${params.length}`); }
  if (busca) {
    params.push(`%${String(busca).trim()}%`);
    filtros.push(`(i.descricao ILIKE $${params.length} OR COALESCE(i.codigo_patrimonio,'') ILIKE $${params.length} OR COALESCE(m.destino,'') ILIKE $${params.length} OR COALESCE(m.responsavel,'') ILIKE $${params.length} OR COALESCE(m.observacao,'') ILIKE $${params.length})`);
  }
  params.push(Math.min(Math.max(Number(limite) || 200, 1), 500));
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  return all(`
    SELECT m.id, m.tipo, m.quantidade, m.destino, m.responsavel, m.observacao,
           m.saldo_anterior, m.saldo_posterior, m.criado_em,
           i.id AS item_id, i.descricao AS item_descricao, i.codigo_patrimonio, i.unidade,
           u.nome AS usuario_nome
    FROM almox_movimentacoes m
    JOIN almox_itens i ON i.id = m.item_id
    LEFT JOIN usuarios u ON u.id = m.usuario_id
    ${where}
    ORDER BY m.criado_em DESC, m.id DESC
    LIMIT $${params.length}
  `, params);
}

module.exports = { dashboard, listItems, getItem, createItem, updateItem, createMovement, history };
