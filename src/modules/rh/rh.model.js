const { pool, get, all } = require('../../config/database');

async function dashboard() {
  const resumo = await get(`
    SELECT
      COUNT(*) FILTER (WHERE status <> 'Concluído')::int AS abertos,
      COUNT(*) FILTER (WHERE status = 'Recebido')::int AS recebidos,
      COUNT(*) FILTER (WHERE status = 'Em análise')::int AS em_analise,
      COUNT(*) FILTER (WHERE status = 'Aguardando colaborador')::int AS aguardando,
      COUNT(*) FILTER (WHERE status = 'Em andamento')::int AS em_andamento,
      COUNT(*) FILTER (WHERE status = 'Concluído' AND date_trunc('month', concluido_em) = date_trunc('month', CURRENT_DATE))::int AS concluidos_mes
    FROM rh_solicitacoes
  `);
  const recentes = await all(`
    SELECT s.id,s.protocolo,s.solicitante_nome,s.status,s.prioridade,s.criado_em,
           t.nome AS tipo_nome,u.nome AS responsavel_nome
    FROM rh_solicitacoes s
    JOIN rh_tipos_solicitacao t ON t.id=s.tipo_id
    LEFT JOIN usuarios u ON u.id=s.responsavel_id
    ORDER BY s.criado_em DESC,s.id DESC LIMIT 10
  `);
  const porTipo = await all(`
    SELECT t.nome, COUNT(s.id)::int AS total
    FROM rh_tipos_solicitacao t
    LEFT JOIN rh_solicitacoes s ON s.tipo_id=t.id AND s.status <> 'Concluído'
    WHERE t.ativo=TRUE
    GROUP BY t.id,t.nome,t.ordem
    HAVING COUNT(s.id) > 0
    ORDER BY total DESC,t.ordem,t.nome LIMIT 8
  `);
  return { resumo: resumo || {}, recentes, por_tipo: porTipo };
}
async function listTypes({ ativos = false } = {}) {
  return all(`SELECT id,nome,descricao,ativo,ordem,criado_em,atualizado_em FROM rh_tipos_solicitacao ${ativos ? 'WHERE ativo=TRUE' : ''} ORDER BY ativo DESC,ordem,nome`);
}
async function createType(data) {
  return get(`INSERT INTO rh_tipos_solicitacao(nome,descricao,ordem,ativo) VALUES($1,$2,$3,TRUE) RETURNING *`,
    [data.nome, data.descricao || null, Number(data.ordem) || 0]);
}
async function updateType(id, data) {
  return get(`UPDATE rh_tipos_solicitacao SET nome=$1,descricao=$2,ordem=$3,ativo=$4,atualizado_em=CURRENT_TIMESTAMP WHERE id=$5 RETURNING *`,
    [data.nome, data.descricao || null, Number(data.ordem) || 0, data.ativo !== false, id]);
}
async function listRequests({ busca = '', status = '', tipoId = '' } = {}) {
  const params = []; const filtros = [];
  if (busca) { params.push(`%${busca}%`); filtros.push(`(s.protocolo ILIKE $${params.length} OR s.solicitante_nome ILIKE $${params.length} OR COALESCE(s.identificacao,'') ILIKE $${params.length} OR s.descricao ILIKE $${params.length})`); }
  if (status) { params.push(status); filtros.push(`s.status=$${params.length}`); }
  if (tipoId) { params.push(Number(tipoId)); filtros.push(`s.tipo_id=$${params.length}`); }
  return all(`
    SELECT s.id,s.protocolo,s.solicitante_nome,s.identificacao,s.contato,s.descricao,s.status,s.prioridade,
           s.responsavel_id,s.origem,s.criado_em,s.atualizado_em,s.concluido_em,
           t.nome AS tipo_nome,u.nome AS responsavel_nome
    FROM rh_solicitacoes s
    JOIN rh_tipos_solicitacao t ON t.id=s.tipo_id
    LEFT JOIN usuarios u ON u.id=s.responsavel_id
    ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
    ORDER BY CASE s.status WHEN 'Recebido' THEN 1 WHEN 'Em análise' THEN 2 WHEN 'Em andamento' THEN 3 WHEN 'Aguardando colaborador' THEN 4 ELSE 5 END,
             s.criado_em DESC,s.id DESC LIMIT 1000`, params);
}
async function getRequest(id) {
  const solicitacao = await get(`
    SELECT s.*,t.nome AS tipo_nome,u.nome AS responsavel_nome
    FROM rh_solicitacoes s
    JOIN rh_tipos_solicitacao t ON t.id=s.tipo_id
    LEFT JOIN usuarios u ON u.id=s.responsavel_id
    WHERE s.id=$1`, [id]);
  if (!solicitacao) return null;
  const interacoes = await all(`
    SELECT i.*,u.nome AS usuario_nome
    FROM rh_solicitacao_interacoes i
    LEFT JOIN usuarios u ON u.id=i.usuario_id
    WHERE i.solicitacao_id=$1 ORDER BY i.criado_em ASC,i.id ASC`, [id]);
  return { solicitacao, interacoes };
}
async function createRequest(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(`
      INSERT INTO rh_solicitacoes(tipo_id,solicitante_nome,identificacao,contato,descricao,status,prioridade,responsavel_id,criado_por,origem)
      VALUES($1,$2,$3,$4,$5,'Recebido',$6,$7,$8,$9) RETURNING *`,
      [data.tipoId, data.solicitanteNome, data.identificacao || null, data.contato || null, data.descricao, data.prioridade || 'Normal', data.responsavelId || null, data.criadoPor || null, data.origem || 'PUBLICO'])).rows[0];
    const protocolo = `RH-${String(row.id).padStart(6, '0')}`;
    await client.query('UPDATE rh_solicitacoes SET protocolo=$1 WHERE id=$2', [protocolo, row.id]);
    await client.query(`INSERT INTO rh_solicitacao_interacoes(solicitacao_id,usuario_id,autor_nome,mensagem,tipo) VALUES($1,$2,$3,$4,'EVENTO')`,
      [row.id, data.criadoPor || null, data.criadoPor ? null : data.solicitanteNome, 'Solicitação aberta.']);
    await client.query('COMMIT');
    return { ...row, protocolo };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}
async function updateStatus(id, status, usuarioId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const atual = (
      await client.query(
        'SELECT status FROM rh_solicitacoes WHERE id=$1 FOR UPDATE',
        [id]
      )
    ).rows[0];

    if (!atual) {
      const e = new Error('Solicitação não encontrada.');
      e.status = 404;
      throw e;
    }

    const row = (
      await client.query(
        `
        UPDATE rh_solicitacoes
        SET
          status = $1,
          atualizado_em = CURRENT_TIMESTAMP,
          concluido_em = CASE
            WHEN $2 = 'Concluído' THEN CURRENT_TIMESTAMP
            ELSE NULL
          END
        WHERE id = $3
        RETURNING *
        `,
        [status, status, id]
      )
    ).rows[0];

    if (atual.status !== status) {
      await client.query(
        `
        INSERT INTO rh_solicitacao_interacoes
          (solicitacao_id, usuario_id, mensagem, tipo)
        VALUES
          ($1, $2, $3, 'EVENTO')
        `,
        [
          id,
          usuarioId,
          `Status alterado de "${atual.status}" para "${status}".`
        ]
      );
    }

    await client.query('COMMIT');

    return row;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;

  } finally {
    client.release();
  }
}
async function assign(id, responsavelId, usuarioId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resp = responsavelId ? (await client.query('SELECT nome FROM usuarios WHERE id=$1 AND ativo=TRUE', [responsavelId])).rows[0] : null;
    const row = (await client.query('UPDATE rh_solicitacoes SET responsavel_id=$1,atualizado_em=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *', [responsavelId || null, id])).rows[0];
    if (!row) { const e = new Error('Solicitação não encontrada.'); e.status = 404; throw e; }
    await client.query(`INSERT INTO rh_solicitacao_interacoes(solicitacao_id,usuario_id,mensagem,tipo) VALUES($1,$2,$3,'EVENTO')`, [id, usuarioId, resp ? `Responsável definido: ${resp.nome}.` : 'Responsável removido.']);
    await client.query('COMMIT'); return row;
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}
async function addComment(id, usuarioId, mensagem) {
  return get(`INSERT INTO rh_solicitacao_interacoes(solicitacao_id,usuario_id,mensagem,tipo) VALUES($1,$2,$3,'COMENTARIO') RETURNING *`, [id, usuarioId, mensagem]);
}
async function responsibles() {
  return all(`SELECT DISTINCT u.id,u.nome,u.email FROM usuarios u
    LEFT JOIN usuario_modulos um ON um.usuario_id=u.id
    LEFT JOIN modulos m ON m.id=um.modulo_id
    WHERE u.ativo=TRUE AND (u.administrador_principal=TRUE OR m.codigo='rh')
    ORDER BY u.nome`);
}
module.exports = { dashboard, listTypes, createType, updateType, listRequests, getRequest, createRequest, updateStatus, assign, addComment, responsibles };
