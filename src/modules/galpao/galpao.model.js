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
           COUNT(e.id) FILTER (WHERE e.quantidade > 0)::int AS lotes,
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
  const params = [];
  const buscaSql = busca
    ? (() => { params.push(`%${busca}%`); return ` AND (p.codigo_barra ILIKE $${params.length} OR p.descricao ILIKE $${params.length})`; })()
    : '';

  // Filtros específicos trabalham somente com lotes ativos (com saldo).
  // Na visão padrão, produtos sem saldo continuam aparecendo uma única vez,
  // sem trazer todos os lotes antigos zerados para a tela operacional.
  if (validade) {
    const filtros = ['p.ativo=TRUE', 'e.quantidade > 0'];
    if (busca) filtros.push(`(p.codigo_barra ILIKE $1 OR p.descricao ILIKE $1)`);
    if (validade === 'vencidos') filtros.push(`e.validade IS NOT NULL AND e.validade < CURRENT_DATE`);
    else if (validade === '60') filtros.push(`e.validade IS NOT NULL AND e.validade BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'`);
    else if (validade === 'sem') filtros.push(`e.validade IS NULL`);
    // "saldo" já está coberto por e.quantidade > 0.
    return all(`
      SELECT e.id,p.id AS produto_id,p.codigo_barra,p.descricao,e.validade,e.unidades_por_embalagem,e.quantidade,
             (e.quantidade::bigint * e.unidades_por_embalagem)::bigint AS total_unidades,e.atualizado_em,
             FALSE AS sem_estoque
      FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id
      WHERE ${filtros.join(' AND ')}
      ORDER BY p.descricao,e.validade NULLS LAST,e.unidades_por_embalagem
    `, params);
  }

  return all(`
    WITH ativos AS (
      SELECT e.id,p.id AS produto_id,p.codigo_barra,p.descricao,e.validade,e.unidades_por_embalagem,e.quantidade,
             (e.quantidade::bigint * e.unidades_por_embalagem)::bigint AS total_unidades,e.atualizado_em,
             FALSE AS sem_estoque
      FROM galpao_estoque e
      JOIN galpao_produtos p ON p.id=e.produto_id
      WHERE p.ativo=TRUE AND e.quantidade > 0${buscaSql}
    ),
    zerados AS (
      SELECT NULL::bigint AS id,p.id AS produto_id,p.codigo_barra,p.descricao,NULL::date AS validade,
             COALESCE(ult.unidades_por_embalagem, mov.unidades_por_embalagem, 1)::int AS unidades_por_embalagem,
             0::bigint AS quantidade,0::bigint AS total_unidades,
             COALESCE(ult.atualizado_em,p.atualizado_em,p.criado_em) AS atualizado_em,
             TRUE AS sem_estoque
      FROM galpao_produtos p
      LEFT JOIN LATERAL (
        SELECT e.unidades_por_embalagem,e.atualizado_em
        FROM galpao_estoque e WHERE e.produto_id=p.id
        ORDER BY e.atualizado_em DESC,e.id DESC LIMIT 1
      ) ult ON TRUE
      LEFT JOIN LATERAL (
        SELECT m.unidades_por_embalagem
        FROM galpao_movimentacoes m WHERE m.produto_id=p.id
        ORDER BY m.id DESC LIMIT 1
      ) mov ON TRUE
      WHERE p.ativo=TRUE${buscaSql}
        AND NOT EXISTS (SELECT 1 FROM galpao_estoque e2 WHERE e2.produto_id=p.id AND e2.quantidade > 0)
    )
    SELECT * FROM ativos
    UNION ALL
    SELECT * FROM zerados
    ORDER BY descricao,validade NULLS LAST,unidades_por_embalagem
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

      // V39: lote zerado não é apagado fisicamente. Mantemos o registro para
      // rastreabilidade, mas ele deixa de contar como lote ativo.
      await client.query(
        `UPDATE galpao_estoque
         SET quantidade=$1, atualizado_em=CURRENT_TIMESTAMP
         WHERE id=$2`,
        [posterior, lote.id]
      );
      estoqueId = lote.id;

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

async function importLegacyOnce({ buffer, parsed, usuarioId, replaceExisting = false, nomeArquivo = '' }) {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // V38: somente uma importacao do Galpao pode alterar estas tabelas por vez.
    // O advisory lock dura apenas ate COMMIT/ROLLBACK e evita duas migracoes concorrentes.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('manaira_galpao_importacao_v38'))");

    const exists = (await client.query(`SELECT (EXISTS(SELECT 1 FROM galpao_produtos) OR EXISTS(SELECT 1 FROM galpao_estoque) OR EXISTS(SELECT 1 FROM galpao_movimentacoes)) AS possui`)).rows[0]?.possui;
    if (exists && !replaceExisting) { const e = new Error('O módulo Galpão já possui dados. Marque a opção de substituir os dados existentes para fazer uma migração completa.'); e.status = 409; throw e; }
    const same = (await client.query('SELECT id FROM galpao_importacoes WHERE arquivo_hash=$1 LIMIT 1', [hash])).rows[0];
    if (same && !replaceExisting) { const e = new Error('Este mesmo arquivo já foi importado anteriormente.'); e.status = 409; throw e; }

    if (replaceExisting) {
      // Ordem fixa em todas as substituicoes. Tudo permanece dentro da mesma transacao.
      await client.query('DELETE FROM galpao_movimentacoes');
      await client.query('DELETE FROM galpao_estoque');
      await client.query('DELETE FROM galpao_produtos');
      await client.query('DELETE FROM galpao_importacoes');
    }

    // Monta uma lista unica de produtos, inclusive codigos que porventura existam apenas no estoque.
    const produtosPorCodigo = new Map();
    for (const p of parsed.produtos) {
      const codigo = String(p.codigo_barra ?? '').trim();
      if (!codigo) continue;
      produtosPorCodigo.set(codigo, String(p.descricao ?? '').trim() || codigo);
    }
    for (const e of parsed.estoque) {
      const codigo = String(e.codigo_barra ?? '').trim();
      if (codigo && !produtosPorCodigo.has(codigo)) produtosPorCodigo.set(codigo, codigo);
    }

    // V38: gravacao em lotes reduz milhares de idas ao PostgreSQL e diminui muito
    // a janela em que a transacao mantem locks abertos.
    const produtoEntries = [...produtosPorCodigo.entries()];
    const CHUNK_PRODUTOS = 400;
    for (let i = 0; i < produtoEntries.length; i += CHUNK_PRODUTOS) {
      const chunk = produtoEntries.slice(i, i + CHUNK_PRODUTOS);
      const params = [];
      const values = chunk.map(([codigo, descricao], idx) => {
        params.push(codigo, descricao);
        const b = idx * 2;
        return `($${b + 1},$${b + 2})`;
      });
      await client.query(`
        INSERT INTO galpao_produtos(codigo_barra,descricao)
        VALUES ${values.join(',')}
        ON CONFLICT(codigo_barra) DO UPDATE
        SET descricao=EXCLUDED.descricao, atualizado_em=CURRENT_TIMESTAMP
      `, params);
    }

    const map = new Map();
    const codigos = [...produtosPorCodigo.keys()];
    const CHUNK_SELECT = 1000;
    for (let i = 0; i < codigos.length; i += CHUNK_SELECT) {
      const rows = (await client.query('SELECT id,codigo_barra FROM galpao_produtos WHERE codigo_barra = ANY($1::text[])', [codigos.slice(i, i + CHUNK_SELECT)])).rows;
      for (const row of rows) map.set(String(row.codigo_barra), row.id);
    }

    // Mantem a mesma regra da V37: para lote repetido, prevalece a ultima linha encontrada.
    const estoqueUnico = new Map();
    for (const e of parsed.estoque) {
      const codigo = String(e.codigo_barra ?? '').trim();
      const produtoId = map.get(codigo);
      if (!produtoId) continue;
      const validade = normalizedDate(e.validade);
      const ue = Math.max(Number(e.unidades_por_embalagem) || 1, 1);
      const qtd = Math.max(Number(e.quantidade) || 0, 0);
      estoqueUnico.set(`${produtoId}|${validade || ''}|${ue}`, { produtoId, validade, ue, qtd });
    }

    const estoqueRows = [...estoqueUnico.values()];
    const CHUNK_ESTOQUE = 500;
    for (let i = 0; i < estoqueRows.length; i += CHUNK_ESTOQUE) {
      const chunk = estoqueRows.slice(i, i + CHUNK_ESTOQUE);
      const params = [];
      const values = chunk.map((e, idx) => {
        params.push(e.produtoId, e.validade, e.ue, e.qtd);
        const b = idx * 4;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`;
      });
      await client.query(`
        INSERT INTO galpao_estoque(produto_id,validade,unidades_por_embalagem,quantidade)
        VALUES ${values.join(',')}
        ON CONFLICT (produto_id,(COALESCE(validade, DATE '0001-01-01')),unidades_por_embalagem)
        DO UPDATE SET quantidade=EXCLUDED.quantidade, atualizado_em=CURRENT_TIMESTAMP
      `, params);
    }

    const inserirMovimentos = async (tipo, lista) => {
      const preparados = [];
      for (const m of lista) {
        const codigo = String(m.codigo_barra ?? '').trim();
        const produtoId = map.get(codigo);
        if (!produtoId) continue;
        preparados.push({
          produtoId,
          validade: normalizedDate(m.validade),
          ue: Math.max(Number(m.unidades_por_embalagem) || 1, 1),
          qtd: Math.max(Number(m.quantidade) || 0, 0),
          data: normalizedDate(m.data) || new Date().toISOString().slice(0, 10),
          legacyId: Number(m.id) || null
        });
      }

      const CHUNK_MOV = 350; // 9 parametros por linha; margem segura abaixo do limite do PostgreSQL.
      for (let i = 0; i < preparados.length; i += CHUNK_MOV) {
        const chunk = preparados.slice(i, i + CHUNK_MOV);
        const params = [];
        const values = chunk.map((m, idx) => {
          params.push(m.produtoId, tipo, m.validade, m.ue, m.qtd, m.data, 'Importado do sistema Python', usuarioId, m.legacyId);
          const b = idx * 9;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},NULL,NULL,'SQLITE',$${b + 9})`;
        });
        await client.query(`
          INSERT INTO galpao_movimentacoes(
            produto_id,tipo,validade,unidades_por_embalagem,quantidade,data_movimento,
            observacao,usuario_id,saldo_anterior,saldo_posterior,origem,legacy_id
          ) VALUES ${values.join(',')}
          ON CONFLICT DO NOTHING
        `, params);
      }
    };

    await inserirMovimentos('ENTRADA', parsed.entradas);
    await inserirMovimentos('SAIDA', parsed.saidas);

    const result = (await client.query(`
      INSERT INTO galpao_importacoes(nome_arquivo,arquivo_hash,produtos_importados,estoque_importado,entradas_importadas,saidas_importadas,usuario_id)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [nomeArquivo || 'controle_estoque.db', hash, parsed.produtos.length, parsed.estoque.length, parsed.entradas.length, parsed.saidas.length, usuarioId])).rows[0];

    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function importLegacy(args) {
  // PostgreSQL pode escolher uma transacao como vitima de deadlock (40P01).
  // V38 refaz automaticamente a operacao inteira; cada tentativa anterior ja sofreu ROLLBACK.
  const maxTentativas = 3;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      return await importLegacyOnce(args);
    } catch (err) {
      if (err?.code !== '40P01' || tentativa === maxTentativas) {
        if (err?.code === '40P01') {
          err.status = 503;
          err.message = 'O banco ficou ocupado por outra operação. A importação foi cancelada com segurança. Aguarde alguns segundos e tente novamente.';
        }
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 350 * tentativa));
    }
  }
}

module.exports = { dashboard, listProducts, getProduct, getProductByBarcode, createProduct, updateProduct, listStock, stockForProduct, createMovement, history, expiry, hasData, importByHash, importLegacy };
