
'use strict';

/**
 * Plataforma Manaíra V61
 * Consulta do estoque do Almoxarifado.
 *
 * Listar tudo:
 * node listar_estoque_almoxarifado.js
 *
 * Pesquisar produto:
 * node listar_estoque_almoxarifado.js botina
 *
 * Apenas itens com saldo:
 * node listar_estoque_almoxarifado.js --com-saldo
 *
 * Exportar para Excel (CSV):
 * node listar_estoque_almoxarifado.js --csv
 *
 * Somente leitura: não modifica o estoque.
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config({
  path: path.join(__dirname, '.env')
});

const { Client } = require('pg');

function formatarQuantidade(valor) {
  const n = Number(valor);

  return Number.isFinite(n)
    ? new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 4
      }).format(n)
    : String(valor ?? '0');
}

function escaparCsv(valor) {
  const texto = String(valor ?? '');
  return `"${texto.replace(/"/g, '""')}"`;
}

async function executar() {
  const args = process.argv.slice(2);

  const exportarCsv = args.includes('--csv');
  const comSaldo = args.includes('--com-saldo');
  const ajuda =
    args.includes('--ajuda') ||
    args.includes('--help');

  const busca = args
    .filter((arg) => !arg.startsWith('--'))
    .join(' ')
    .trim();

  if (ajuda) {
    console.log(
      'Uso: node listar_estoque_almoxarifado.js ' +
      '[texto para buscar] [--com-saldo] [--csv]'
    );
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL não encontrada. ' +
      'Coloque este arquivo na raiz do projeto, ' +
      'ao lado do .env.'
    );
  }

  const ssl =
    String(process.env.DB_SSL ?? 'true')
      .toLowerCase() !== 'false';

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: ssl
      ? { rejectUnauthorized: false }
      : false,
    connectionTimeoutMillis: Number(
      process.env.DB_CONNECTION_TIMEOUT_MS || 10000
    )
  });

  try {
    await client.connect();

    // Consulta protegida contra alterações.
    await client.query('BEGIN READ ONLY');

    const filtros = ['ativo = TRUE'];
    const parametros = [];

    if (busca) {
      parametros.push(`%${busca}%`);

      filtros.push(`
        (
          descricao ILIKE $${parametros.length}
          OR COALESCE(categoria, '') ILIKE $${parametros.length}
          OR COALESCE(codigo_patrimonio, '') ILIKE $${parametros.length}
        )
      `);
    }

    if (comSaldo) {
      filtros.push('quantidade_atual > 0');
    }

    const resultado = await client.query(`
      SELECT
        id,
        descricao,
        categoria,
        codigo_patrimonio,
        quantidade_atual,
        unidade
      FROM almox_itens
      WHERE ${filtros.join(' AND ')}
      ORDER BY descricao ASC, id ASC
    `, parametros);

    await client.query('COMMIT');

    const itens = resultado.rows;

    console.log(
      '\n=== ESTOQUE ATUAL - ALMOXARIFADO MANAÍRA ==='
    );

    if (busca) {
      console.log(`Filtro de pesquisa: ${busca}`);
    }

    if (comSaldo) {
      console.log(
        'Mostrando somente itens com saldo positivo.'
      );
    }

    console.log(
      `Total de itens encontrados: ${itens.length}\n`
    );

    console.table(
      itens.map((item) => ({
        ID: item.id,
        Item: item.descricao,
        Categoria: item.categoria || '-',
        Patrimonio: item.codigo_patrimonio || '-',
        Quantidade: formatarQuantidade(
          item.quantidade_atual
        ),
        Unidade: item.unidade || '-'
      }))
    );

    if (exportarCsv) {
      const cabecalho = [
        'ID',
        'Item',
        'Categoria',
        'Patrimônio',
        'Quantidade',
        'Unidade'
      ];

      const linhas = itens.map((item) =>
        [
          item.id,
          item.descricao,
          item.categoria,
          item.codigo_patrimonio,
          formatarQuantidade(item.quantidade_atual),
          item.unidade
        ]
          .map(escaparCsv)
          .join(';')
      );

      const destino = path.join(
        __dirname,
        'estoque_almoxarifado.csv'
      );

      fs.writeFileSync(
        destino,
        '\uFEFF' +
          [
            cabecalho.map(escaparCsv).join(';'),
            ...linhas
          ].join('\r\n'),
        'utf8'
      );

      console.log(`\nCSV salvo em: ${destino}`);
    }
  } finally {
    await client.end();
  }
}

executar().catch((erro) => {
  console.error(
    '\nNão foi possível consultar o estoque:',
    erro.message
  );

  process.exitCode = 1;
});
