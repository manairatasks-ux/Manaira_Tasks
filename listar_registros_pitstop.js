
/**
 * MANAÍRA BOARD — TODOS OS REGISTROS DO PIT STOP
 *
 * Coloque este arquivo na raiz do projeto,
 * junto ao package.json e ao .env.
 *
 * Execute:
 * node listar_registros_pitstop.js
 *
 * SOMENTE CONSULTA — NÃO ALTERA O BANCO.
 */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({
  path: path.join(__dirname, '.env')
});

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: String(process.env.DB_SSL || 'true').toLowerCase() !== 'false'
    ? { rejectUnauthorized: false }
    : false,
  connectionTimeoutMillis: 12000
});

// Formatar datas no horário de João Pessoa.
function formatDate(data) {
  if (!data) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Fortaleza',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(data));
}

// Proteger conteúdo exportado para Excel.
function escapeCell(valor) {
  if (valor == null) return '';

  let texto = typeof valor === 'object'
    ? JSON.stringify(valor)
    : String(valor);

  if (/^[\s]*[=+@\-\t\r]/.test(texto)) {
    texto = "'" + texto;
  }

  return '"' + texto.replace(/"/g, '""') + '"';
}

// Gerar arquivos CSV.
function exportCsv(arquivo, colunas, registros) {
  const cabecalho = colunas
    .map(c => escapeCell(c[0]))
    .join(';');

  const linhas = registros.map(registro =>
    colunas
      .map(c => escapeCell(registro[c[1]]))
      .join(';')
  );

  const conteudo =
    '\uFEFF' +
    cabecalho +
    '\r\n' +
    linhas.join('\r\n') +
    '\r\n';

  fs.writeFileSync(arquivo, conteudo, 'utf8');
}

async function main() {

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL não configurada no .env.'
    );
  }

  console.log('\nConectando ao PostgreSQL...');

  // Verificar se as tabelas existem.
  const check = await pool.query(`
    SELECT
      to_regclass('public.pitstop_entradas') AS entradas,
      to_regclass('public.pitstop_sessoes') AS sessoes
  `);

  if (!check.rows[0].entradas || !check.rows[0].sessoes) {
    throw new Error(
      'Tabelas do Pit Stop não encontradas. ' +
      'Verifique se a conexão aponta para o banco correto.'
    );
  }

  console.log('Consultando lançamentos...');

  // TODOS OS LANÇAMENTOS
  // Inclui registros ativos e cancelados.
  const registros = (await pool.query(`
    SELECT
      e.id,
      e.sessao_id AS abastecimento_id,
      e.codigo_produto,
      e.ean,
      e.descricao,
      e.quantidade,
      e.observacao,
      e.criado_em,
      e.cancelado_em,
      e.cancelamento_motivo,
      e.foto_public_id,
      e.foto_formato,

      u.nome AS responsavel_registro,

      s.criado_em AS abastecimento_aberto_em,
      s.fechada_em AS abastecimento_fechado_em,

      us.nome AS responsavel_abastecimento

    FROM pitstop_entradas e

    JOIN pitstop_sessoes s
      ON s.id = e.sessao_id

    LEFT JOIN usuarios u
      ON u.id = e.usuario_id

    LEFT JOIN usuarios us
      ON us.id = s.usuario_id

    ORDER BY
      e.criado_em DESC,
      e.id DESC
  `)).rows;

  console.log('Consultando abastecimentos...');

  // TODOS OS ABASTECIMENTOS
  const abastecimentos = (await pool.query(`
    SELECT
      s.id,
      s.criado_em,
      s.fechada_em,

      u.nome AS responsavel,

      COUNT(e.id)::int AS total_lancamentos,

      COUNT(e.id) FILTER (
        WHERE e.cancelado_em IS NULL
      )::int AS lancamentos_ativos,

      COUNT(e.id) FILTER (
        WHERE e.cancelado_em IS NOT NULL
      )::int AS lancamentos_cancelados,

      COALESCE(
        SUM(e.quantidade) FILTER (
          WHERE e.cancelado_em IS NULL
        ),
        0
      ) AS total_unidades_ativas

    FROM pitstop_sessoes s

    LEFT JOIN usuarios u
      ON u.id = s.usuario_id

    LEFT JOIN pitstop_entradas e
      ON e.sessao_id = s.id

    GROUP BY
      s.id,
      s.criado_em,
      s.fechada_em,
      u.nome

    ORDER BY
      s.criado_em DESC,
      s.id DESC
  `)).rows;

  console.log('Consultando histórico de alterações...');

  // AUDITORIA
  const auditoria = (await pool.query(`
    SELECT
      a.id,
      a.entrada_id,
      a.acao,
      a.detalhes,
      a.criado_em,

      u.nome AS responsavel

    FROM pitstop_auditoria a

    LEFT JOIN usuarios u
      ON u.id = a.usuario_id

    ORDER BY
      a.criado_em DESC,
      a.id DESC
  `)).rows;

  // Criar pasta de resultados.
  const pasta = path.join(
    __dirname,
    'relatorios_pitstop'
  );

  fs.mkdirSync(pasta, { recursive: true });

  // Formatar lançamentos.
  const lancamentosFormatados = registros.map(e => ({
    ...e,

    criado_em: formatDate(e.criado_em),

    cancelado_em: formatDate(e.cancelado_em),

    abastecimento_aberto_em:
      formatDate(e.abastecimento_aberto_em),

    abastecimento_fechado_em:
      formatDate(e.abastecimento_fechado_em),

    status: e.cancelado_em
      ? 'CANCELADO'
      : 'ATIVO'
  }));

  // Formatar abastecimentos.
  const abastecimentosFormatados = abastecimentos.map(e => ({
    ...e,

    criado_em: formatDate(e.criado_em),

    fechada_em: formatDate(e.fechada_em),

    status: e.fechada_em
      ? 'CONCLUIDO'
      : 'EM ANDAMENTO'
  }));

  // Formatar auditoria.
  const auditoriaFormatada = auditoria.map(e => ({
    ...e,
    criado_em: formatDate(e.criado_em)
  }));

  // EXPORTAÇÃO 1 — LANÇAMENTOS
  exportCsv(
    path.join(pasta, 'pitstop_todos_lancamentos.csv'),
    [
      ['ID lançamento', 'id'],
      ['Abastecimento', 'abastecimento_id'],
      ['Data / hora', 'criado_em'],
      ['Código produto', 'codigo_produto'],
      ['EAN', 'ean'],
      ['Descrição', 'descricao'],
      ['Quantidade', 'quantidade'],
      ['Status', 'status'],
      ['Responsável lançamento', 'responsavel_registro'],
      ['Observação', 'observacao'],
      ['Cancelado em', 'cancelado_em'],
      ['Motivo cancelamento', 'cancelamento_motivo'],
      ['Foto Cloudinary', 'foto_public_id'],
      ['Formato foto', 'foto_formato'],
      ['Abastecimento aberto em', 'abastecimento_aberto_em'],
      ['Abastecimento concluído em', 'abastecimento_fechado_em'],
      ['Responsável abastecimento', 'responsavel_abastecimento']
    ],
    lancamentosFormatados
  );

  // EXPORTAÇÃO 2 — ABASTECIMENTOS
  exportCsv(
    path.join(pasta, 'pitstop_abastecimentos.csv'),
    [
      ['Abastecimento', 'id'],
      ['Responsável', 'responsavel'],
      ['Aberto em', 'criado_em'],
      ['Concluído em', 'fechada_em'],
      ['Situação', 'status'],
      ['Lançamentos (todos)', 'total_lancamentos'],
      ['Lançamentos ativos', 'lancamentos_ativos'],
      ['Lançamentos cancelados', 'lancamentos_cancelados'],
      ['Unidades ativas', 'total_unidades_ativas']
    ],
    abastecimentosFormatados
  );

  // EXPORTAÇÃO 3 — AUDITORIA
  exportCsv(
    path.join(pasta, 'pitstop_auditoria.csv'),
    [
      ['ID auditoria', 'id'],
      ['ID lançamento', 'entrada_id'],
      ['Data / hora', 'criado_em'],
      ['Ação', 'acao'],
      ['Responsável', 'responsavel'],
      ['Detalhes', 'detalhes']
    ],
    auditoriaFormatada
  );

  // RESUMO
  const ativos = registros.filter(e => !e.cancelado_em);

  const totalQuantidade = ativos.reduce(
    (total, e) => total + Number(e.quantidade || 0),
    0
  );

  console.log('\n==========================================');
  console.log('       PIT STOP — TODOS OS REGISTROS');
  console.log('==========================================');

  console.log(`Abastecimentos: ${abastecimentos.length}`);
  console.log(`Lançamentos totais: ${registros.length}`);
  console.log(`Lançamentos ativos: ${ativos.length}`);
  console.log(
    `Lançamentos cancelados: ${registros.length - ativos.length}`
  );
  console.log(`Quantidade total ativa: ${totalQuantidade}`);
  console.log(`Eventos de auditoria: ${auditoria.length}`);

  console.log('\nLANÇAMENTOS:\n');

  console.table(
    lancamentosFormatados.map(e => ({
      ID: e.id,
      Abastecimento: e.abastecimento_id,
      Data: e.criado_em,
      Produto: e.descricao,
      EAN: e.ean,
      Quantidade: e.quantidade,
      Status: e.status,
      Responsavel: e.responsavel_registro
    }))
  );

  console.log('\nArquivos gerados em:');
  console.log(pasta);

  console.log('\n1. pitstop_todos_lancamentos.csv');
  console.log('2. pitstop_abastecimentos.csv');
  console.log('3. pitstop_auditoria.csv');

  console.log('\nConsulta concluída!');
}

// Executar e encerrar conexão.
main()
  .catch(erro => {
    console.error('\nERRO:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
