const http = require('http');
const https = require('https');
const { URL } = require('url');
const { gzApiBase, gzApiToken, gzLoja } = require('../../config/env');

function requestJson(pathname, params = {}) {
  return new Promise((resolve, reject) => {
    if (!gzApiToken) {
      const err = new Error('Token da API GZ não configurado no servidor.');
      err.code = 'GZ_TOKEN_MISSING';
      return reject(err);
    }

    const url = new URL(pathname, gzApiBase.endsWith('/') ? gzApiBase : `${gzApiBase}/`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        url.searchParams.set(key, String(value));
      }
    });

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method: 'GET',
      headers: {
        token: gzApiToken,
        Accept: 'application/json'
      },
      timeout: 12000
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let data;
        try { data = body ? JSON.parse(body) : null; }
        catch { data = { raw: body }; }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          return resolve({ status: res.statusCode, data });
        }

        const err = new Error(data?.error || data?.message || `A API GZ respondeu com HTTP ${res.statusCode}.`);
        err.status = res.statusCode;
        err.response = data;
        reject(err);
      });
    });

    req.on('timeout', () => req.destroy(new Error('Tempo limite ao conectar com a API GZ.')));
    req.on('error', reject);
    req.end();
  });
}

async function consultarProduto({ codigoBarras, codigoInterno, descricao, situacao }) {
  const filtros = { loja: gzLoja || 1 };
  if (codigoBarras) filtros.codigoBarras = codigoBarras;
  else if (codigoInterno) filtros.codigoInterno = codigoInterno;
  else if (descricao) filtros.descricao = descricao;
  else if (situacao) filtros.situacao = situacao;
  else throw new Error('Informe código de barras, código interno ou descrição.');

  const resposta = await requestJson('/produtos/', filtros);
  const produtos = Array.isArray(resposta.data) ? resposta.data : (resposta.data ? [resposta.data] : []);
  return { loja: Number(gzLoja || 1), produtos };
}

module.exports = { consultarProduto };
