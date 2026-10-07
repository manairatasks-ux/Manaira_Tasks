const { pool, query, get, all } = require('../../db');
const produtosGz = require('./produtos-gz.service');

const TAMANHO_LOTE = Math.max(250, Math.min(5000, Number(process.env.GZ_CATALOGO_BATCH_SIZE || 2000)));
const TENTATIVAS_BANCO = Math.max(1, Math.min(5, Number(process.env.GZ_CATALOGO_DB_RETRIES || 3)));
const ESPERA_RETRY_MS = Math.max(500, Number(process.env.GZ_CATALOGO_DB_RETRY_MS || 2000));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

async function executarTransacaoComRetry(fn, contexto = 'catálogo') {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS_BANCO; tentativa++) {
    let client = null;
    let erroConexao = null;
    let onError = null;
    try {
      client = await pool.connect();
      onError = err => { erroConexao = err; };
      client.on('error', onError);
      await client.query('BEGIN');
      const resultado = await fn(client);
      if (erroConexao) throw erroConexao;
      await client.query('COMMIT');
      return resultado;
    } catch (e) {
      ultimoErro = e;
      if (client) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      if (tentativa < TENTATIVAS_BANCO) {
        console.warn(`[V53] Falha no banco durante ${contexto}; nova tentativa ${tentativa + 1}/${TENTATIVAS_BANCO}: ${e.message}`);
        await sleep(ESPERA_RETRY_MS * tentativa);
      }
    } finally {
      if (client) {
        if (onError) client.removeListener('error', onError);
        // Descarta conexões que apresentaram erro; conexões saudáveis voltam ao pool.
        client.release(Boolean(erroConexao));
      }
    }
  }
  throw ultimoErro;
}

async function atualizarCatalogo(execucaoId = null, opcoes = {}) {
  const inicio = Date.now();
  const onProgress = typeof opcoes.onProgress === 'function' ? opcoes.onProgress : async () => {};
  const deveParar = typeof opcoes.deveParar === 'function' ? opcoes.deveParar : async () => false;

  await onProgress({ etapa: 'BAIXANDO', processados: 0, total: 0, loteAtual: 0, totalLotes: 0 });
  const inicioApi = Date.now();
  const resp = await produtosGz.consultarCatalogoCompleto();
  const apiDuracaoMs = Date.now() - inicioApi;

  const mapa = new Map();
  for (const bruto of resp.produtos || []) {
    const p = normalizarProduto(bruto);
    if (p) mapa.set(p.codigo, p);
  }
  const produtos = [...mapa.values()];
  if (!produtos.length) throw new Error('Catálogo GZ recebido, porém nenhum produto possuía código válido.');

  const anterior = await get('SELECT COUNT(*)::int total FROM gz_catalogo_produtos');
  const totalAnterior = Number(anterior?.total || 0);
  if (totalAnterior >= 1000 && produtos.length < Math.floor(totalAnterior * 0.5)) {
    throw new Error(`Catálogo GZ aparentemente incompleto: ${produtos.length} itens recebidos para ${totalAnterior} existentes.`);
  }

  // A primeira fotografia só deixa de ser "base inicial" depois que uma execução anterior
  // realmente terminou e registrou um catálogo substancial. Isso evita transformar uma
  // primeira carga parcialmente concluída em milhares de eventos NOVO_DETECTADO no retry.
  const anteriorConcluida = await get(`
    SELECT EXISTS(
      SELECT 1 FROM gz_sync_execucoes
       WHERE id IS DISTINCT FROM $1
         AND catalogo_total >= 1000
    ) AS existe
  `, [execucaoId]);
  const baseVazia = !Boolean(anteriorConcluida?.existe);

  const totalLotes = Math.ceil(produtos.length / TAMANHO_LOTE);
  const marcaInicio = new Date(inicio).toISOString();
  await onProgress({ etapa: 'SALVANDO', processados: 0, total: produtos.length, loteAtual: 0, totalLotes });

  for (let i = 0; i < produtos.length; i += TAMANHO_LOTE) {
    if (await deveParar()) {
      const err = new Error('Atualização do catálogo interrompida manualmente.');
      err.code = 'CATALOGO_INTERROMPIDO';
      throw err;
    }

    const lote = produtos.slice(i, i + TAMANHO_LOTE);
    const payload = JSON.stringify(lote);
    const loteAtual = Math.floor(i / TAMANHO_LOTE) + 1;

    await executarTransacaoComRetry(async client => {
      if (!baseVazia) {
        await client.query(`
          WITH entrada AS (
            SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
              codigo text, codigo_ean text, descricao text, situacao text,
              quantidade_estoque numeric, data_cadastro date, unidade text, loja text,
              departamento text, grupo text, marca text, setor text
            )
          ), mudancas AS (
            SELECT e.codigo,
              CASE
                WHEN c.codigo_produto IS NULL THEN 'NOVO_DETECTADO'
                WHEN c.situacao <> 'ATIVO' AND e.situacao = 'ATIVO' THEN 'REATIVADO'
                WHEN c.situacao = 'ATIVO' AND e.situacao = 'INATIVO' THEN 'INATIVADO'
                ELSE NULL
              END AS tipo,
              c.situacao AS situacao_anterior,
              e.situacao AS situacao_nova
            FROM entrada e
            LEFT JOIN gz_catalogo_produtos c ON c.codigo_produto=e.codigo
          )
          INSERT INTO gz_catalogo_eventos(execucao_id,codigo_produto,tipo,situacao_anterior,situacao_nova,data_evento)
          SELECT $2, m.codigo, m.tipo, m.situacao_anterior, m.situacao_nova, CURRENT_DATE
          FROM mudancas m
          WHERE m.tipo IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM gz_catalogo_eventos ev
               WHERE ev.execucao_id IS NOT DISTINCT FROM $2
                 AND ev.codigo_produto=m.codigo
                 AND ev.tipo=m.tipo
            )
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
    }, `lote ${loteAtual}/${totalLotes}`);

    await onProgress({
      etapa: 'SALVANDO',
      processados: Math.min(i + lote.length, produtos.length),
      total: produtos.length,
      loteAtual,
      totalLotes
    });
  }

  await onProgress({ etapa: 'FINALIZANDO', processados: produtos.length, total: produtos.length, loteAtual: totalLotes, totalLotes });

  // Operações finais ficam fora da carga em lotes e usam conexões curtas do pool.
  await query(`
    UPDATE gz_catalogo_produtos
       SET situacao='AUSENTE_CATALOGO', ultima_mudanca_status_em=NOW()
     WHERE ultimo_visto_em < $1::timestamptz
       AND situacao <> 'AUSENTE_CATALOGO'
  `, [marcaInicio]);

  await query(`
    UPDATE gz_produtos_monitorados m
       SET situacao_gz=c.situacao, ultimo_status_em=NOW()
      FROM gz_catalogo_produtos c
     WHERE c.codigo_produto=m.codigo_produto
  `);

  const resumo = await get(`
    SELECT COUNT(*)::int total,
           COUNT(*) FILTER (WHERE situacao='ATIVO')::int ativos,
           COUNT(*) FILTER (WHERE situacao='INATIVO')::int inativos,
           COUNT(*) FILTER (WHERE situacao NOT IN ('ATIVO','INATIVO'))::int desconhecidos
      FROM gz_catalogo_produtos
  `) || {};
  const eventos = await get(`
    SELECT COUNT(*) FILTER (WHERE tipo='NOVO_DETECTADO')::int novos_detectados,
           COUNT(*) FILTER (WHERE tipo='REATIVADO')::int reativados,
           COUNT(*) FILTER (WHERE tipo='INATIVADO')::int inativados
      FROM gz_catalogo_eventos WHERE execucao_id IS NOT DISTINCT FROM $1
  `, [execucaoId]) || {};
  const novosHoje = await get(`SELECT COUNT(*)::int total FROM gz_produtos_cadastrados WHERE data_cadastro_gz=CURRENT_DATE`) || {};

  return {
    httpStatus: resp.httpStatus || 200,
    apiDuracaoMs,
    duracaoMs: Date.now() - inicio,
    baseInicial: baseVazia,
    totalRecebido: produtos.length,
    tamanhoLote: TAMANHO_LOTE,
    totalLotes,
    ...resumo,
    ...eventos,
    novosHoje: Number(novosHoje.total || 0)
  };
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
