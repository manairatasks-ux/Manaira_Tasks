const http = require('http');
const https = require('https');
const { URL } = require('url');
const { gzLoja } = require('../../config/env');

// Agora o Render não acessa mais a GZ diretamente.
// Ele acessa a Ponte GZ através do Cloudflare.
const bridgeApiBase = (process.env.BRIDGE_API_BASE || '').trim();
const bridgeApiKey = (process.env.BRIDGE_API_KEY || '').trim();

function requestJson(pathname, params = {}) {
  return new Promise((resolve, reject) => {

    if (!bridgeApiBase) {
      const err = new Error(
        'BRIDGE_API_BASE não configurada no servidor.'
      );

      err.code = 'BRIDGE_BASE_MISSING';
      return reject(err);
    }

    if (!bridgeApiKey) {
      const err = new Error(
        'BRIDGE_API_KEY não configurada no servidor.'
      );

      err.code = 'BRIDGE_KEY_MISSING';
      return reject(err);
    }

    const url = new URL(
      pathname,
      bridgeApiBase.endsWith('/')
        ? bridgeApiBase
        : `${bridgeApiBase}/`
    );

    Object.entries(params).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ''
      ) {
        url.searchParams.set(key, String(value));
      }
    });

    const client =
      url.protocol === 'https:' ? https : http;

    const req = client.request(
      url,
      {
        method: 'GET',

        headers: {
          'x-bridge-key': bridgeApiKey,
          Accept: 'application/json'
        },

        timeout: 15000
      },

      (res) => {
        let body = '';

        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          let data;

          try {
            data = body
              ? JSON.parse(body)
              : null;
          } catch {
            data = {
              raw: body
            };
          }

          if (
            res.statusCode >= 200 &&
            res.statusCode < 300
          ) {
            return resolve({
              status: res.statusCode,
              data
            });
          }

          const err = new Error(
            data?.erro ||
            data?.error ||
            data?.message ||
            `A Ponte GZ respondeu com HTTP ${res.statusCode}.`
          );

          err.status = res.statusCode;
          err.response = data;

          reject(err);
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(
        new Error(
          'Tempo limite ao conectar com a Ponte GZ.'
        )
      );
    });

    req.on('error', reject);

    req.end();
  });
}


async function consultarProduto({
  codigoBarras,
  codigoInterno,
  descricao,
  situacao
}) {

  const filtros = {};

  if (codigoBarras) {
    filtros.codigoBarras = codigoBarras;

  } else if (codigoInterno) {
    filtros.codigoInterno = codigoInterno;

  } else if (descricao) {
    filtros.descricao = descricao;

  } else if (situacao) {
    filtros.situacao = situacao;

  } else {
    throw new Error(
      'Informe código de barras, código interno ou descrição.'
    );
  }

  // Agora chamamos a nossa Ponte GZ.
  // A própria ponte já sabe que deve consultar a loja 1.
  const resposta = await requestJson(
    '/produtos',
    filtros
  );

  const produtos = Array.isArray(resposta.data)
    ? resposta.data
    : (
        resposta.data
          ? [resposta.data]
          : []
      );

  return {
    loja: Number(gzLoja || 1),
    produtos,
    httpStatus: resposta.status
  };
}


function isoDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function inicioUltimos12Meses(hoje = new Date()) {
  return new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
}

function fimDoMes(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function montarPeriodosMensais12Meses(hoje = new Date()) {
  const periodos = [];
  for (let i = 11; i >= 0; i--) {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const ultimoDia = fimDoMes(inicio);
    const ehMesAtual = inicio.getFullYear() === hoje.getFullYear() && inicio.getMonth() === hoje.getMonth();
    const fim = ehMesAtual ? hoje : ultimoDia;
    periodos.push({ inicio: isoDateLocal(inicio), fim: isoDateLocal(fim) });
  }
  return periodos;
}

function normalizarMovimentos(resposta) {
  if (!resposta || resposta.status === 204 || resposta.data == null) return [];
  if (Array.isArray(resposta.data)) return resposta.data;
  if (Array.isArray(resposta.data?.content)) return resposta.data.content;
  return resposta.data ? [resposta.data] : [];
}

async function consultarPeriodoVendaDetalhado(codigoProduto, periodo) {
  const resposta = await requestJson('/movimento-estoque', {
    codigoProduto: String(codigoProduto).trim(),
    dataInicio: periodo.inicio,
    dataFim: periodo.fim,
    loja: Number(gzLoja || 1),
    retornaPrecoFechado: true
  });
  return { movimentos: normalizarMovimentos(resposta), httpStatus: resposta.status };
}

async function consultarPeriodoVenda(codigoProduto, periodo) {
  return (await consultarPeriodoVendaDetalhado(codigoProduto, periodo)).movimentos;
}

async function consultarVendasProduto({ codigoProduto }) {
  if (!codigoProduto) throw new Error('Código interno do produto não informado.');

  const hoje = new Date();
  const periodos = montarPeriodosMensais12Meses(hoje);
  const movimentos = [];

  // A GZ limita /movimento-estoque a no máximo 30 dias de diferença entre
  // dataInicio e dataFim. Consultamos cada mês separadamente e em pequenos
  // lotes paralelos para não sobrecarregar a Ponte/API.
  const concorrencia = 4;
  for (let i = 0; i < periodos.length; i += concorrencia) {
    const lote = periodos.slice(i, i + concorrencia);
    const resultados = await Promise.all(lote.map(p => consultarPeriodoVenda(codigoProduto, p)));
    for (const itens of resultados) movimentos.push(...itens);
  }

  return {
    loja: Number(gzLoja || 1),
    codigoProduto: String(codigoProduto).trim(),
    dataInicio: periodos[0].inicio,
    dataFim: periodos[periodos.length - 1].fim,
    periodosConsultados: periodos,
    movimentos
  };
}

module.exports = {
  consultarProduto,
  consultarVendasProduto,
  consultarVendasPeriodo: async (codigoProduto, dataInicio, dataFim) => consultarPeriodoVenda(codigoProduto, { inicio: dataInicio, fim: dataFim }),
  consultarVendasPeriodoDetalhado: async (codigoProduto, dataInicio, dataFim) => consultarPeriodoVendaDetalhado(codigoProduto, { inicio: dataInicio, fim: dataFim })
};