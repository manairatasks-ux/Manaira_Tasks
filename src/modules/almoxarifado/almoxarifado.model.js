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


// V62: saldo de cada variação é lido de almox_itens. Nunca há saldo duplicado.
async function listProducts({ busca = '' } = {}) {
  const params = [];
  let where = 'WHERE p.ativo = TRUE';
  if (busca) {
    params.push(`%${busca}%`);
    where += ` AND (p.descricao ILIKE $1 OR COALESCE(p.categoria,'') ILIKE $1 OR EXISTS (
      SELECT 1 FROM almox_variacoes vx JOIN almox_itens ix ON ix.id = vx.item_id
      WHERE vx.produto_id = p.id AND (vx.rotulo ILIKE $1 OR COALESCE(ix.codigo_patrimonio,'') ILIKE $1)))`;
  }
  const result = await all(`
    SELECT p.id, p.descricao, p.categoria, p.unidade, p.observacao,
      COALESCE(SUM(i.quantidade_atual) FILTER (WHERE i.ativo),0)::int AS quantidade_atual,
      COALESCE(json_agg(json_build_object('id',v.id,'item_id',i.id,'rotulo',v.rotulo,
        'atributos',v.atributos,'quantidade_atual',i.quantidade_atual,
        'codigo_patrimonio',i.codigo_patrimonio,'ativo',i.ativo)
        ORDER BY v.id) FILTER (WHERE i.id IS NOT NULL AND i.ativo), '[]'::json) AS variacoes
    FROM almox_produtos p
    LEFT JOIN almox_variacoes v ON v.produto_id = p.id
    LEFT JOIN almox_itens i ON i.id = v.item_id
    ${where}
    GROUP BY p.id
    HAVING COUNT(i.id) FILTER (WHERE i.ativo) > 0
    ORDER BY p.descricao`, params);
  return result;
}
async function createProduct(data, usuarioId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pr = await client.query(`INSERT INTO almox_produtos(descricao,categoria,unidade,observacao)
      VALUES($1,$2,$3,$4) RETURNING *`, [data.descricao,data.categoria||null,data.unidade,data.observacao||null]);
    for (const v of data.variacoes) await insertVariation(client, pr.rows[0], v, usuarioId);
    await client.query('COMMIT');
    return pr.rows[0];
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
async function insertVariation(client, produto, v, usuarioId) {
  const descricao = v.rotulo === 'Padrão' ? produto.descricao : `${produto.descricao} (${v.rotulo})`;
  const item = await client.query(`INSERT INTO almox_itens
    (descricao,categoria,unidade,observacao,codigo_patrimonio,quantidade_atual,criado_por)
    VALUES($1,$2,$3,$4,$5,0,$6) RETURNING id`,
    [descricao,produto.categoria,produto.unidade,produto.observacao,v.codigo_patrimonio||null,usuarioId]);
  const itemId = item.rows[0].id;
  await client.query(`INSERT INTO almox_variacoes(produto_id,item_id,rotulo,atributos)
    VALUES($1,$2,$3,$4::jsonb)`, [produto.id,itemId,v.rotulo,JSON.stringify(v.atributos||{})]);
  if (v.quantidade_inicial > 0) {
    await client.query(`UPDATE almox_itens SET quantidade_atual=$1,atualizado_em=NOW() WHERE id=$2`,[v.quantidade_inicial,itemId]);
    await client.query(`INSERT INTO almox_movimentacoes
      (item_id,tipo,quantidade,observacao,usuario_id,saldo_anterior,saldo_posterior)
      VALUES($1,'ENTRADA',$2,'Estoque inicial - cadastro de variação',$3,0,$2)`,[itemId,v.quantidade_inicial,usuarioId]);
  }
}
async function addVariation(produtoId, v, usuarioId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT * FROM almox_produtos WHERE id=$1 AND ativo FOR UPDATE`,[produtoId]);
    const produto=result.rows[0];
    if (!produto) { const e=new Error('Produto não encontrado.'); e.status=404; throw e; }
    await insertVariation(client,produto,v,usuarioId);
    await client.query('COMMIT');
    return {ok:true};
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally {client.release();}
}
async function updateProduct(id,data) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const result=await client.query(`UPDATE almox_produtos SET descricao=$1,categoria=$2,unidade=$3,observacao=$4,atualizado_em=NOW()
      WHERE id=$5 AND ativo RETURNING *`,[data.descricao,data.categoria||null,data.unidade,data.observacao||null,id]);
    const produto=result.rows[0];
    if (!produto) {const e=new Error('Produto não encontrado.');e.status=404;throw e;}
    // Preserve nomes históricos nas movimentações; atualize descrição do item somente
    // para novas consultas, mantendo o vínculo pelo mesmo ID.
    await client.query(`UPDATE almox_itens i SET
       descricao=CASE WHEN v.rotulo='Padrão' THEN $1 ELSE $1 || ' (' || v.rotulo || ')' END,
       categoria=$2, unidade=$3, atualizado_em=NOW()
       FROM almox_variacoes v WHERE v.item_id=i.id AND v.produto_id=$4`,
       [data.descricao,data.categoria||null,data.unidade,id]);
    await client.query('COMMIT');return produto;
  } catch(e) {await client.query('ROLLBACK');throw e;}finally{client.release();}
}

module.exports = { listProducts, createProduct, addVariation, updateProduct, dashboard, listItems, getItem, createItem, updateItem, createMovement, history };
