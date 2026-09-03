const crypto = require('crypto');
const { pool, get, all } = require('../../config/database');

function normalizedDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

async function dashboard() {
  const resumo = await get(`
    SELECT
      (SELECT COUNT(*)::int FROM galpao_produtos WHERE ativo = TRUE) AS produtos,
      (SELECT COUNT(*)::int FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id WHERE p.ativo=TRUE AND e.quantidade > 0) AS lotes_com_saldo,
      (SELECT COALESCE(SUM(e.quantidade),0)::bigint FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id WHERE p.ativo=TRUE) AS embalagens_estoque,
      (SELECT COALESCE(SUM((e.quantidade::bigint) * e.unidades_por_embalagem),0)::bigint FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id WHERE p.ativo=TRUE) AS unidades_estoque,
      (SELECT COUNT(*)::int FROM galpao_estoque e WHERE e.quantidade > 0 AND e.validade IS NOT NULL AND e.validade < CURRENT_DATE) AS vencidos,
      (SELECT COUNT(*)::int FROM galpao_estoque e WHERE e.quantidade > 0 AND e.validade IS NOT NULL AND e.validade BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days') AS vencem_60_dias
  `);
  const recentes = await all(`
    SELECT m.id,m.tipo,m.quantidade,m.validade,m.unidades_por_embalagem,m.data_movimento,m.origem,m.criado_em,
           p.codigo_barra,p.descricao,u.nome AS usuario_nome
    FROM galpao_movimentacoes m
    JOIN galpao_produtos p ON p.id=m.produto_id
    LEFT JOIN usuarios u ON u.id=m.usuario_id
    ORDER BY m.data_movimento DESC,m.id DESC LIMIT 10
  `);
  return { resumo: resumo || {}, recentes };
}

async function listProducts({ busca = '' } = {}) {
  const params = [];
  let where = 'WHERE p.ativo=TRUE';
  if (busca) { params.push(`%${busca}%`); where += ` AND (p.codigo_barra ILIKE $1 OR p.descricao ILIKE $1)`; }
  return all(`
    SELECT p.id,p.codigo_barra,p.descricao,p.ativo,p.criado_em,p.atualizado_em,
           COUNT(e.id)::int AS lotes,
           COALESCE(SUM(e.quantidade),0)::bigint AS embalagens,
           COALESCE(SUM((e.quantidade::bigint)*e.unidades_por_embalagem),0)::bigint AS unidades
    FROM galpao_produtos p LEFT JOIN galpao_estoque e ON e.produto_id=p.id
    ${where}
    GROUP BY p.id ORDER BY p.descricao
  `, params);
}

async function getProduct(id) { return get('SELECT * FROM galpao_produtos WHERE id=$1', [id]); }
async function getProductByBarcode(codigo) { return get('SELECT * FROM galpao_produtos WHERE codigo_barra=$1', [codigo]); }
async function createProduct(data) {
  return get(`INSERT INTO galpao_produtos(codigo_barra,descricao) VALUES($1,$2) RETURNING *`, [data.codigo_barra, data.descricao]);
}
async function updateProduct(id, data) {
  return get(`UPDATE galpao_produtos SET codigo_barra=$1,descricao=$2,atualizado_em=CURRENT_TIMESTAMP WHERE id=$3 AND ativo=TRUE RETURNING *`, [data.codigo_barra, data.descricao, id]);
}

async function listStock({ busca = '', validade = '' } = {}) {
  const params = []; const filtros = ['p.ativo=TRUE'];
  if (busca) { params.push(`%${busca}%`); filtros.push(`(p.codigo_barra ILIKE $${params.length} OR p.descricao ILIKE $${params.length})`); }
  if (validade === 'vencidos') filtros.push(`e.quantidade>0 AND e.validade IS NOT NULL AND e.validade < CURRENT_DATE`);
  else if (validade === '60') filtros.push(`e.quantidade>0 AND e.validade IS NOT NULL AND e.validade BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'`);
  else if (validade === 'sem') filtros.push(`e.validade IS NULL`);
  else if (validade === 'saldo') filtros.push(`e.quantidade > 0`);
  return all(`
    SELECT e.id,p.id AS produto_id,p.codigo_barra,p.descricao,e.validade,e.unidades_por_embalagem,e.quantidade,
           (e.quantidade::bigint * e.unidades_por_embalagem)::bigint AS total_unidades,e.atualizado_em
    FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id
    WHERE ${filtros.join(' AND ')}
    ORDER BY p.descricao,e.validade NULLS LAST,e.unidades_por_embalagem
  `, params);
}

async function stockForProduct(produtoId) {
  return all(`SELECT id,validade,unidades_por_embalagem,quantidade,(quantidade::bigint*unidades_por_embalagem)::bigint AS total_unidades FROM galpao_estoque WHERE produto_id=$1 ORDER BY validade NULLS LAST,unidades_por_embalagem`, [produtoId]);
}

async function createMovement({ produtoId, tipo, validade, unidadesPorEmbalagem, quantidade, dataMovimento, observacao, usuarioId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const produto = (await client.query('SELECT * FROM galpao_produtos WHERE id=$1 AND ativo=TRUE FOR UPDATE', [produtoId])).rows[0];
    if (!produto) { const e = new Error('Produto não encontrado.'); e.status = 404; throw e; }
    const lote = (await client.query(`SELECT * FROM galpao_estoque WHERE produto_id=$1 AND unidades_por_embalagem=$2 AND (($3::date IS NULL AND validade IS NULL) OR validade=$3::date) FOR UPDATE`, [produtoId, unidadesPorEmbalagem, validade])).rows[0];
    const anterior = Number(lote?.quantidade || 0);
    if (tipo === 'SAIDA' && !lote) { const e = new Error('Não existe estoque para esta validade e Unid/Emb.'); e.status = 400; throw e; }
    const posterior = tipo === 'ENTRADA' ? anterior + quantidade : anterior - quantidade;
    if (posterior < 0) { const e = new Error(`Quantidade insuficiente. Disponível: ${anterior} embalagem(ns).`); e.status = 400; throw e; }
    let estoqueId;





    if (lote) {

      if (posterior === 0) {

        await client.query(
          'DELETE FROM galpao_estoque WHERE id=$1',
          [lote.id]
        );

        estoqueId = null;

      } else {

        await client.query(
          `UPDATE galpao_estoque
       SET quantidade=$1,
           atualizado_em=CURRENT_TIMESTAMP
       WHERE id=$2`,
          [posterior, lote.id]
        );

        estoqueId = lote.id;
      }

    } else {

      estoqueId = (
        await client.query(
          `INSERT INTO galpao_estoque(
        produto_id,
        validade,
        unidades_por_embalagem,
        quantidade
      )
      VALUES($1,$2,$3,$4)
      RETURNING id`,
          [
            produtoId,
            validade,
            unidadesPorEmbalagem,
            posterior
          ]
        )
      ).rows[0].id;
    }







    const mov = (await client.query(`
      INSERT INTO galpao_movimentacoes(produto_id,tipo,validade,unidades_por_embalagem,quantidade,data_movimento,observacao,usuario_id,saldo_anterior,saldo_posterior,origem)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'WEB') RETURNING *
    `, [produtoId, tipo, validade, unidadesPorEmbalagem, quantidade, dataMovimento, observacao || null, usuarioId, anterior, posterior])).rows[0];
    await client.query('COMMIT');
    return { movimentacao: mov, estoque_id: estoqueId, saldo: posterior };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function history({ tipo = '', busca = '', limite = 300 } = {}) {
  const params = []; const filtros = [];
  if (tipo) { params.push(tipo); filtros.push(`m.tipo=$${params.length}`); }
  if (busca) { params.push(`%${busca}%`); filtros.push(`(p.codigo_barra ILIKE $${params.length} OR p.descricao ILIKE $${params.length} OR COALESCE(m.observacao,'') ILIKE $${params.length})`); }
  params.push(Math.min(Math.max(Number(limite) || 300, 1), 1000));
  return all(`
    SELECT m.*,p.codigo_barra,p.descricao,u.nome AS usuario_nome
    FROM galpao_movimentacoes m JOIN galpao_produtos p ON p.id=m.produto_id LEFT JOIN usuarios u ON u.id=m.usuario_id
    ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
    ORDER BY m.data_movimento DESC,m.id DESC LIMIT $${params.length}
  `, params);
}

async function expiry({ dias = 90, busca = '' } = {}) {
  const params = [Math.min(Math.max(Number(dias) || 90, 1), 3650)];
  let filtro = 'e.quantidade > 0 AND e.validade IS NOT NULL AND e.validade <= CURRENT_DATE + ($1::int * INTERVAL \'1 day\')';
  if (busca) { params.push(`%${busca}%`); filtro += ` AND (p.codigo_barra ILIKE $2 OR p.descricao ILIKE $2)`; }
  return all(`SELECT e.id,p.codigo_barra,p.descricao,e.validade,e.unidades_por_embalagem,e.quantidade,(e.quantidade::bigint*e.unidades_por_embalagem)::bigint AS total_unidades,(e.validade-CURRENT_DATE)::int AS dias_restantes FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id WHERE p.ativo=TRUE AND ${filtro} ORDER BY e.validade,p.descricao`, params);
}

async function hasData() { return get(`SELECT (EXISTS(SELECT 1 FROM galpao_produtos) OR EXISTS(SELECT 1 FROM galpao_estoque) OR EXISTS(SELECT 1 FROM galpao_movimentacoes)) AS possui`); }
async function importByHash(hash) { return get('SELECT * FROM galpao_importacoes WHERE arquivo_hash=$1 ORDER BY id DESC LIMIT 1', [hash]); }

async function importLegacy({ buffer, parsed, usuarioId, replaceExisting = false, nomeArquivo = '' }) {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = (await client.query(`SELECT (EXISTS(SELECT 1 FROM galpao_produtos) OR EXISTS(SELECT 1 FROM galpao_estoque) OR EXISTS(SELECT 1 FROM galpao_movimentacoes)) AS possui`)).rows[0]?.possui;
    if (exists && !replaceExisting) { const e = new Error('O módulo Galpão já possui dados. Marque a opção de substituir os dados existentes para fazer uma migração completa.'); e.status = 409; throw e; }
    const same = (await client.query('SELECT id FROM galpao_importacoes WHERE arquivo_hash=$1 LIMIT 1', [hash])).rows[0];
    if (same && !replaceExisting) { const e = new Error('Este mesmo arquivo já foi importado anteriormente.'); e.status = 409; throw e; }
    if (replaceExisting) {
      await client.query('DELETE FROM galpao_movimentacoes');
      await client.query('DELETE FROM galpao_estoque');
      await client.query('DELETE FROM galpao_produtos');
      await client.query('DELETE FROM galpao_importacoes');
    }
    const map = new Map();
    for (const p of parsed.produtos) {
      const codigo = String(p.codigo_barra ?? '').trim(); if (!codigo) continue;
      const descricao = String(p.descricao ?? '').trim() || codigo;
      const row = (await client.query(`INSERT INTO galpao_produtos(codigo_barra,descricao) VALUES($1,$2) ON CONFLICT(codigo_barra) DO UPDATE SET descricao=EXCLUDED.descricao,atualizado_em=CURRENT_TIMESTAMP RETURNING id`, [codigo, descricao])).rows[0];
      map.set(codigo, row.id);
    }
    for (const e of parsed.estoque) {
      const codigo = String(e.codigo_barra ?? '').trim(); let produtoId = map.get(codigo);
      if (!produtoId) {
        const row = (await client.query(`INSERT INTO galpao_produtos(codigo_barra,descricao) VALUES($1,$2) ON CONFLICT(codigo_barra) DO UPDATE SET descricao=EXCLUDED.descricao RETURNING id`, [codigo, codigo])).rows[0]; produtoId = row.id; map.set(codigo, produtoId);
      }
      const validade = normalizedDate(e.validade); const ue = Math.max(Number(e.unidades_por_embalagem) || 1, 1); const qtd = Math.max(Number(e.quantidade) || 0, 0);
      await client.query(`INSERT INTO galpao_estoque(produto_id,validade,unidades_por_embalagem,quantidade) VALUES($1,$2,$3,$4) ON CONFLICT (produto_id,(COALESCE(validade, DATE '0001-01-01')),unidades_por_embalagem) DO UPDATE SET quantidade=EXCLUDED.quantidade,atualizado_em=CURRENT_TIMESTAMP`, [produtoId, validade, ue, qtd]);
    }
    const inserirMov = async (tipo, lista) => {
      for (const m of lista) {
        const codigo = String(m.codigo_barra ?? '').trim(); let produtoId = map.get(codigo); if (!produtoId) continue;
        await client.query(`INSERT INTO galpao_movimentacoes(produto_id,tipo,validade,unidades_por_embalagem,quantidade,data_movimento,observacao,usuario_id,saldo_anterior,saldo_posterior,origem,legacy_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,'SQLITE',$9) ON CONFLICT DO NOTHING`, [
          produtoId, tipo, normalizedDate(m.validade), Math.max(Number(m.unidades_por_embalagem) || 1, 1), Math.max(Number(m.quantidade) || 0, 0), normalizedDate(m.data) || new Date().toISOString().slice(0, 10), 'Importado do sistema Python', usuarioId, Number(m.id) || null
        ]);
      }
    };
    await inserirMov('ENTRADA', parsed.entradas); await inserirMov('SAIDA', parsed.saidas);
    const result = (await client.query(`INSERT INTO galpao_importacoes(nome_arquivo,arquivo_hash,produtos_importados,estoque_importado,entradas_importadas,saidas_importadas,usuario_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [nomeArquivo || 'controle_estoque.db', hash, parsed.produtos.length, parsed.estoque.length, parsed.entradas.length, parsed.saidas.length, usuarioId])).rows[0];
    await client.query('COMMIT'); return result;
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

module.exports = { dashboard, listProducts, getProduct, getProductByBarcode, createProduct, updateProduct, listStock, stockForProduct, createMovement, history, expiry, hasData, importByHash, importLegacy };
