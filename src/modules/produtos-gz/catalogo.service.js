const { pool, query, get, all } = require('../../db');
const produtosGz = require('./produtos-gz.service');

function texto(v, max = 500) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function numero(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function dataIso(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizarSituacao(v) {
  const s = String(v || '').trim().toUpperCase();
  if (!s) return 'DESCONHECIDO';
  if (['ATIVO', 'A', '1', 'TRUE'].includes(s)) return 'ATIVO';
  if (['INATIVO', 'I', '0', 'FALSE'].includes(s)) return 'INATIVO';
  return s.slice(0, 30);
}

function normalizarProduto(p) {
  const codigo = texto(p?.codigo ?? p?.codigoProduto ?? p?.codigoInterno, 40);
  if (!codigo) return null;
  return {
    codigo,
    codigo_ean: texto(p?.codigoEan ?? p?.ean ?? p?.codigoBarras, 60),
    descricao: texto(p?.descricao ?? p?.descpdv ?? p?.descricaoProduto, 500),
    situacao: normalizarSituacao(p?.situacao ?? p?.status ?? p?.ativo),
    quantidade_estoque: numero(p?.quantidadeEstoque ?? p?.estoque),
    data_cadastro: dataIso(p?.dataCadastro ?? p?.data_cadastro),
    unidade: texto(p?.unidade, 30),
    loja: texto(p?.loja, 30),
    departamento: texto(p?.departamento, 120),
    grupo: texto(p?.grupo, 120),
    marca: texto(p?.marca, 120),
    setor: texto(p?.setor, 120)
  };
}

async function atualizarCatalogo(execucaoId = null) {
  const inicio = Date.now();
  const resp = await produtosGz.consultarCatalogoCompleto();
  const mapa = new Map();
  for (const bruto of resp.produtos || []) {
    const p = normalizarProduto(bruto);
    if (p) mapa.set(p.codigo, p);
  }
  const produtos = [...mapa.values()];
  if (!produtos.length) throw new Error('Catálogo GZ recebido, porém nenhum produto possuía código válido.');

  // Proteção contra resposta acidentalmente parcial: depois da primeira fotografia,
  // uma queda superior a 50% no volume cancela a atualização em vez de classificar
  // milhares de produtos com base em uma resposta truncada.
  const anterior = await get('SELECT COUNT(*)::int total FROM gz_catalogo_produtos');
  const totalAnterior = Number(anterior?.total || 0);
  if (totalAnterior >= 1000 && produtos.length < Math.floor(totalAnterior * 0.5)) {
    throw new Error(`Catálogo GZ aparentemente incompleto: ${produtos.length} itens recebidos para ${totalAnterior} existentes.`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const baseVazia = totalAnterior === 0;
    const payload = JSON.stringify(produtos);

    // Eventos só são gerados quando já existe uma fotografia anterior. Na primeira
    // carga, a base é tratada como fotografia inicial para não marcar ~60 mil itens como novos.
    if (!baseVazia) {
      await client.query(`
        WITH entrada AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
            codigo text, codigo_ean text, descricao text, situacao text,
            quantidade_estoque numeric, data_cadastro date, unidade text, loja text,
            departamento text, grupo text, marca text, setor text
          )
        )
        INSERT INTO gz_catalogo_eventos(execucao_id,codigo_produto,tipo,situacao_anterior,situacao_nova,data_evento)
        SELECT $2, e.codigo,
          CASE
            WHEN c.codigo_produto IS NULL THEN 'NOVO_DETECTADO'
            WHEN c.situacao <> 'ATIVO' AND e.situacao = 'ATIVO' THEN 'REATIVADO'
            WHEN c.situacao = 'ATIVO' AND e.situacao = 'INATIVO' THEN 'INATIVADO'
            ELSE NULL
          END,
          c.situacao, e.situacao, CURRENT_DATE
        FROM entrada e
        LEFT JOIN gz_catalogo_produtos c ON c.codigo_produto=e.codigo
        WHERE c.codigo_produto IS NULL
           OR (c.situacao <> 'ATIVO' AND e.situacao = 'ATIVO')
           OR (c.situacao = 'ATIVO' AND e.situacao = 'INATIVO')
      `, [payload, execucaoId]);
    }

    await client.query(`
      WITH entrada AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          codigo text, codigo_ean text, descricao text, situacao text,
          quantidade_estoque numeric, data_cadastro date, unidade text, loja text,
          departamento text, grupo text, marca text, setor text
        )
      )
      INSERT INTO gz_catalogo_produtos(
        codigo_produto,codigo_ean,descricao,situacao,quantidade_estoque,data_cadastro,
        unidade,loja,departamento,grupo,marca,setor,primeiro_visto_em,ultimo_visto_em,ultima_mudanca_status_em
      )
      SELECT codigo,codigo_ean,descricao,situacao,quantidade_estoque,data_cadastro,
             unidade,loja,departamento,grupo,marca,setor,NOW(),NOW(),NOW()
      FROM entrada
      ON CONFLICT(codigo_produto) DO UPDATE SET
        codigo_ean=EXCLUDED.codigo_ean,
        descricao=EXCLUDED.descricao,
        situacao=EXCLUDED.situacao,
        quantidade_estoque=EXCLUDED.quantidade_estoque,
        data_cadastro=COALESCE(EXCLUDED.data_cadastro,gz_catalogo_produtos.data_cadastro),
        unidade=EXCLUDED.unidade, loja=EXCLUDED.loja, departamento=EXCLUDED.departamento,
        grupo=EXCLUDED.grupo, marca=EXCLUDED.marca, setor=EXCLUDED.setor,
        ultimo_visto_em=NOW(),
        ultima_mudanca_status_em=CASE WHEN gz_catalogo_produtos.situacao IS DISTINCT FROM EXCLUDED.situacao THEN NOW() ELSE gz_catalogo_produtos.ultima_mudanca_status_em END
    `, [payload]);

    // Como a chamada é uma fotografia completa, itens que existiam antes e não vieram
    // agora ficam explicitamente marcados como ausentes, sem serem apagados do histórico.
    await client.query(`
      UPDATE gz_catalogo_produtos
         SET situacao='AUSENTE_CATALOGO', ultima_mudanca_status_em=NOW()
       WHERE ultimo_visto_em < $1::timestamptz
         AND situacao <> 'AUSENTE_CATALOGO'
    `, [new Date(inicio).toISOString()]);

    // Mantém uma tabela específica para relatórios por data de cadastro. O ON CONFLICT
    // torna a rotina idempotente e permite reconstruir o histórico aos poucos.
    await client.query(`
      WITH entrada AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          codigo text, codigo_ean text, descricao text, situacao text,
          quantidade_estoque numeric, data_cadastro date, unidade text, loja text,
          departamento text, grupo text, marca text, setor text
        )
      )
      INSERT INTO gz_produtos_cadastrados(codigo_produto,codigo_ean,descricao,data_cadastro_gz,situacao_ao_detectar,detectado_em)
      SELECT codigo,codigo_ean,descricao,data_cadastro,situacao,NOW()
      FROM entrada WHERE data_cadastro IS NOT NULL
      ON CONFLICT(codigo_produto) DO UPDATE SET
        codigo_ean=COALESCE(EXCLUDED.codigo_ean,gz_produtos_cadastrados.codigo_ean),
        descricao=COALESCE(EXCLUDED.descricao,gz_produtos_cadastrados.descricao),
        data_cadastro_gz=COALESCE(EXCLUDED.data_cadastro_gz,gz_produtos_cadastrados.data_cadastro_gz),
        situacao_ao_detectar=EXCLUDED.situacao_ao_detectar
    `, [payload]);

    // Atualiza de uma vez a situação dos itens monitorados. Com isso, a sincronização
    // normal deixa de consultar /produtos individualmente quando a fotografia foi obtida.
    await client.query(`
      UPDATE gz_produtos_monitorados m
         SET situacao_gz=c.situacao, ultimo_status_em=NOW()
        FROM gz_catalogo_produtos c
       WHERE c.codigo_produto=m.codigo_produto
    `);

    const resumo = await client.query(`
      SELECT COUNT(*)::int total,
             COUNT(*) FILTER (WHERE situacao='ATIVO')::int ativos,
             COUNT(*) FILTER (WHERE situacao='INATIVO')::int inativos,
             COUNT(*) FILTER (WHERE situacao NOT IN ('ATIVO','INATIVO'))::int desconhecidos
        FROM gz_catalogo_produtos
    `);
    const eventos = await client.query(`
      SELECT COUNT(*) FILTER (WHERE tipo='NOVO_DETECTADO')::int novos_detectados,
             COUNT(*) FILTER (WHERE tipo='REATIVADO')::int reativados,
             COUNT(*) FILTER (WHERE tipo='INATIVADO')::int inativados
        FROM gz_catalogo_eventos WHERE execucao_id IS NOT DISTINCT FROM $1
    `, [execucaoId]);
    const novosHoje = await client.query(`SELECT COUNT(*)::int total FROM gz_produtos_cadastrados WHERE data_cadastro_gz=CURRENT_DATE`);

    await client.query('COMMIT');
    return {
      httpStatus: resp.httpStatus || 200,
      duracaoMs: Date.now() - inicio,
      baseInicial: baseVazia,
      totalRecebido: produtos.length,
      ...(resumo.rows[0] || {}),
      ...(eventos.rows[0] || {}),
      novosHoje: Number(novosHoje.rows[0]?.total || 0)
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function resumoCatalogo() {
  const resumo = await get(`
    SELECT COUNT(*)::int total,
           COUNT(*) FILTER (WHERE situacao='ATIVO')::int ativos,
           COUNT(*) FILTER (WHERE situacao='INATIVO')::int inativos,
           COUNT(*) FILTER (WHERE situacao NOT IN ('ATIVO','INATIVO'))::int desconhecidos,
           MAX(ultimo_visto_em) ultima_atualizacao
      FROM gz_catalogo_produtos
  `) || {};
  const hoje = await get(`
    SELECT COUNT(*)::int novos_hoje FROM gz_produtos_cadastrados WHERE data_cadastro_gz=CURRENT_DATE
  `) || {};
  const eventos = await get(`
    SELECT COUNT(*) FILTER (WHERE tipo='REATIVADO')::int reativados_hoje,
           COUNT(*) FILTER (WHERE tipo='INATIVADO')::int inativados_hoje,
           COUNT(*) FILTER (WHERE tipo='NOVO_DETECTADO')::int novos_detectados_hoje
      FROM gz_catalogo_eventos WHERE data_evento=CURRENT_DATE
  `) || {};
  return { ...resumo, ...hoje, ...eventos };
}

async function cadastrados({ dataInicio, dataFim, limite = 500 } = {}) {
  const ini = dataInicio || new Date().toISOString().slice(0, 10);
  const fim = dataFim || ini;
  const lim = Math.min(5000, Math.max(1, Number(limite || 500)));
  return all(`
    SELECT codigo_produto,codigo_ean,descricao,data_cadastro_gz,situacao_ao_detectar,detectado_em
      FROM gz_produtos_cadastrados
     WHERE data_cadastro_gz BETWEEN $1::date AND $2::date
     ORDER BY data_cadastro_gz DESC, descricao NULLS LAST, codigo_produto
     LIMIT $3
  `, [ini, fim, lim]);
}

module.exports = { atualizarCatalogo, resumoCatalogo, cadastrados };
