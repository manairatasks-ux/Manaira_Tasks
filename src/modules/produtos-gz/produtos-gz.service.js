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
    produtos
  };
}


module.exports = {
  consultarProduto
};