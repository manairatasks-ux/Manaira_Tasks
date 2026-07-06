require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');

const { query, get, all } = require('./db');
const { initDb } = require('./init-db');

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

function cleanDate(value) {
  return value && value !== '' ? value : null;
}

async function getNextOrder(table, whereColumn, whereValue) {
  const result = await get(
    `SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima_ordem FROM ${table} WHERE ${whereColumn} = $1`,
    [whereValue]
  );

  return result?.proxima_ordem || 1;
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Token não informado.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

function authPdf(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '') || req.query.token;

  if (!token) {
    return res.status(401).send('Token não informado.');
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).send('Token inválido.');
  }
}

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Informe email e senha.' });
    }

    const usuario = await get(
      'SELECT * FROM usuarios WHERE email = $1 AND ativo = TRUE',
      [email]
    );

    if (!usuario) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const ok = await bcrypt.compare(senha, usuario.senha_hash);

    if (!ok) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        nome: usuario.nome,
        perfil: usuario.perfil
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Erro ao fazer login.',
      details: err.message
    });
  }
});

app.get('/api/me', auth, async (req, res) => {
  try {
    const usuario = await get(
      'SELECT id, nome, email, perfil FROM usuarios WHERE id = $1',
      [req.user.id]
    );

    res.json(usuario);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar usuário.', details: err.message });
  }
});



app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const { setor_id, responsavel, periodo = '90' } = req.query;
    const periodoDias = Math.max(7, Math.min(parseInt(periodo, 10) || 90, 365));

    const params = [];
    const filters = [];

    if (setor_id) {
      params.push(setor_id);
      filters.push(`s.id = $${params.length}`);
    }

    if (responsavel) {
      params.push(`%${String(responsavel).trim()}%`);
      filters.push(`COALESCE(t.responsavel, '') ILIKE $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const totalizadores = await get(`
      SELECT
        COUNT(t.*)::int AS total,
        COUNT(t.*) FILTER (WHERE t.status <> 'Feito')::int AS abertas,
        COUNT(t.*) FILTER (WHERE t.status = 'Feito')::int AS concluidas,
        COUNT(t.*) FILTER (WHERE t.status <> 'Feito' AND t.prazo IS NOT NULL AND t.prazo < CURRENT_DATE)::int AS atrasadas,
        COUNT(t.*) FILTER (WHERE t.status <> 'Feito' AND t.prazo = CURRENT_DATE)::int AS vencem_hoje,
        COUNT(t.*) FILTER (WHERE t.status <> 'Feito' AND t.prazo BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')::int AS proximos_7_dias,
        COUNT(t.*) FILTER (WHERE t.status = 'Feito' AND t.atualizado_em >= date_trunc('week', CURRENT_DATE))::int AS concluidas_semana,
        COUNT(DISTINCT NULLIF(TRIM(t.responsavel), ''))::int AS responsaveis_ativos,
        ROUND(
          CASE WHEN COUNT(t.*) = 0 THEN 0
          ELSE (COUNT(t.*) FILTER (WHERE t.status = 'Feito')::numeric / COUNT(t.*)::numeric) * 100 END
        )::int AS taxa_conclusao
      FROM tarefas t
      JOIN grupos g ON g.id = t.grupo_id
      JOIN setores s ON s.id = g.setor_id
      ${where}
    `, params);

    const porSetor = await all(`
      SELECT
        s.id,
        s.nome,
        s.cor,
        COUNT(t.id)::int AS total,
        COUNT(t.id) FILTER (WHERE t.status <> 'Feito')::int AS abertas,
        COUNT(t.id) FILTER (WHERE t.status = 'Feito')::int AS concluidas,
        COUNT(t.id) FILTER (WHERE t.status <> 'Feito' AND t.prazo IS NOT NULL AND t.prazo < CURRENT_DATE)::int AS atrasadas,
        ROUND(CASE WHEN COUNT(t.id) = 0 THEN 0 ELSE (COUNT(t.id) FILTER (WHERE t.status = 'Feito')::numeric / COUNT(t.id)::numeric) * 100 END)::int AS taxa_conclusao
      FROM setores s
      LEFT JOIN grupos g ON g.setor_id = s.id
      LEFT JOIN tarefas t ON t.grupo_id = g.id
      ${setor_id ? 'WHERE s.id = $1' : ''}
      GROUP BY s.id, s.nome, s.cor
      ORDER BY abertas DESC, atrasadas DESC, s.nome
      LIMIT 12
    `, setor_id ? [setor_id] : []);

    const porStatus = await all(`
      SELECT t.status, COUNT(*)::int AS total
      FROM tarefas t
      JOIN grupos g ON g.id = t.grupo_id
      JOIN setores s ON s.id = g.setor_id
      ${where}
      GROUP BY t.status
      ORDER BY total DESC, t.status
    `, params);

    const porResponsavel = await all(`
      SELECT
        COALESCE(NULLIF(TRIM(t.responsavel), ''), 'Sem responsável') AS responsavel,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE t.status <> 'Feito')::int AS abertas,
        COUNT(*) FILTER (WHERE t.status = 'Feito')::int AS concluidas,
        COUNT(*) FILTER (WHERE t.status <> 'Feito' AND t.prazo IS NOT NULL AND t.prazo < CURRENT_DATE)::int AS atrasadas,
        ROUND(CASE WHEN COUNT(*) = 0 THEN 0 ELSE (COUNT(*) FILTER (WHERE t.status = 'Feito')::numeric / COUNT(*)::numeric) * 100 END)::int AS taxa_conclusao
      FROM tarefas t
      JOIN grupos g ON g.id = t.grupo_id
      JOIN setores s ON s.id = g.setor_id
      ${where}
      GROUP BY COALESCE(NULLIF(TRIM(t.responsavel), ''), 'Sem responsável')
      ORDER BY abertas DESC, atrasadas DESC, total DESC
      LIMIT 10
    `, params);

    const tarefasPorMes = await all(`
      SELECT
        to_char(date_trunc('month', t.criado_em), 'YYYY-MM') AS mes,
        COUNT(*)::int AS criadas,
        COUNT(*) FILTER (WHERE t.status = 'Feito')::int AS concluidas
      FROM tarefas t
      JOIN grupos g ON g.id = t.grupo_id
      JOIN setores s ON s.id = g.setor_id
      WHERE t.criado_em >= date_trunc('month', CURRENT_DATE) - ($1::int * INTERVAL '1 day')
      ${setor_id ? 'AND s.id = $2' : ''}
      GROUP BY date_trunc('month', t.criado_em)
      ORDER BY date_trunc('month', t.criado_em)
    `, setor_id ? [periodoDias, setor_id] : [periodoDias]);

    const proximosPrazos = await all(`
      SELECT t.id, t.titulo, t.responsavel, t.status, t.prioridade, t.prazo, s.nome AS setor, g.nome AS grupo
      FROM tarefas t
      JOIN grupos g ON g.id = t.grupo_id
      JOIN setores s ON s.id = g.setor_id
      ${where ? where + " AND" : "WHERE"} t.status <> 'Feito' AND t.prazo IS NOT NULL
      ORDER BY t.prazo ASC, CASE t.prioridade WHEN 'Alta' THEN 1 WHEN 'Média' THEN 2 ELSE 3 END, t.id ASC
      LIMIT 14
    `, params);

    const ultimasAtividades = await all(`
      SELECT t.id, t.titulo, t.status, t.responsavel, t.atualizado_em, s.nome AS setor, g.nome AS grupo
      FROM tarefas t
      JOIN grupos g ON g.id = t.grupo_id
      JOIN setores s ON s.id = g.setor_id
      ${where}
      ORDER BY t.atualizado_em DESC, t.id DESC
      LIMIT 12
    `, params);

    const calendario = await all(`
      SELECT t.id, t.titulo, t.responsavel, t.status, t.prioridade, t.prazo, s.nome AS setor
      FROM tarefas t
      JOIN grupos g ON g.id = t.grupo_id
      JOIN setores s ON s.id = g.setor_id
      WHERE t.prazo BETWEEN date_trunc('month', CURRENT_DATE)::date AND (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date
      ${setor_id ? 'AND s.id = $1' : ''}
      ORDER BY t.prazo, t.prioridade DESC, t.id
    `, setor_id ? [setor_id] : []);

    const quickLists = await getQuickDashboardLists(setor_id || null);

    res.json({
      filtros: { setor_id: setor_id || '', responsavel: responsavel || '', periodo: periodoDias },
      totalizadores: totalizadores || {},
      porSetor,
      porStatus,
      porResponsavel,
      tarefasPorMes,
      proximosPrazos,
      ultimasAtividades,
      calendario,
      quickLists
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar dashboard.', details: err.message });
  }
});

async function getQuickDashboardLists(setorId = null) {
  const setorFilter = setorId ? 'AND s.id = $1' : '';
  const params = setorId ? [setorId] : [];
  const base = `
    SELECT t.id, t.titulo, t.responsavel, t.status, t.prioridade, t.prazo, s.nome AS setor, g.nome AS grupo
    FROM tarefas t
    JOIN grupos g ON g.id = t.grupo_id
    JOIN setores s ON s.id = g.setor_id
    WHERE t.status <> 'Feito' ${setorFilter}
  `;

  const [atrasadas, hoje, semana, alta, semResponsavel] = await Promise.all([
    all(`${base} AND t.prazo IS NOT NULL AND t.prazo < CURRENT_DATE ORDER BY t.prazo ASC LIMIT 30`, params),
    all(`${base} AND t.prazo = CURRENT_DATE ORDER BY t.prioridade DESC, t.id LIMIT 30`, params),
    all(`${base} AND t.prazo BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' ORDER BY t.prazo ASC LIMIT 30`, params),
    all(`${base} AND t.prioridade = 'Alta' ORDER BY t.prazo ASC NULLS LAST LIMIT 30`, params),
    all(`${base} AND NULLIF(TRIM(COALESCE(t.responsavel, '')), '') IS NULL ORDER BY t.prazo ASC NULLS LAST LIMIT 30`, params)
  ]);

  return { atrasadas, hoje, semana, alta, semResponsavel };
}

app.get('/api/setores', auth, async (req, res) => {
  try {
    const setores = await all('SELECT * FROM setores ORDER BY nome');
    res.json(setores);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar setores.', details: err.message });
  }
});

app.post('/api/setores', auth, async (req, res) => {
  try {
    const { nome, descricao, cor } = req.body;

    if (!nome) {
      return res.status(400).json({ error: 'Nome do setor é obrigatório.' });
    }

    const setor = await get(
      'INSERT INTO setores (nome, descricao, cor) VALUES ($1, $2, $3) RETURNING *',
      [nome, descricao || '', cor || '#2563eb']
    );

    await query(
      'INSERT INTO grupos (setor_id, nome, cor, ordem) VALUES ($1, $2, $3, $4)',
      [setor.id, 'Prioridades da semana', '#2563eb', 1]
    );

    res.status(201).json(setor);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar setor.', details: err.message });
  }
});

app.put('/api/setores/:id', auth, async (req, res) => {
  try {
    const { nome, descricao, cor } = req.body;

    const setor = await get(
      'UPDATE setores SET nome = $1, descricao = $2, cor = $3 WHERE id = $4 RETURNING *',
      [nome, descricao || '', cor || '#2563eb', req.params.id]
    );

    res.json(setor);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar setor.', details: err.message });
  }
});

app.delete('/api/setores/:id', auth, async (req, res) => {
  try {
    await query('DELETE FROM setores WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir setor.', details: err.message });
  }
});

app.get('/api/setores/:id/quadro', auth, async (req, res) => {
  try {
    const setor = await get('SELECT * FROM setores WHERE id = $1', [req.params.id]);

    if (!setor) {
      return res.status(404).json({ error: 'Setor não encontrado.' });
    }

    const grupos = await all(
      'SELECT * FROM grupos WHERE setor_id = $1 ORDER BY ordem, id',
      [req.params.id]
    );

    for (const grupo of grupos) {
      grupo.tarefas = await all(
        'SELECT * FROM tarefas WHERE grupo_id = $1 ORDER BY ordem, id',
        [grupo.id]
      );
    }

    res.json({ setor, grupos });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar quadro.', details: err.message });
  }
});

app.post('/api/grupos', auth, async (req, res) => {
  try {
    const { setor_id, nome, cor } = req.body;

    if (!setor_id || !nome) {
      return res.status(400).json({ error: 'Setor e nome são obrigatórios.' });
    }

    const ordem = await getNextOrder('grupos', 'setor_id', setor_id);

    const grupo = await get(
      'INSERT INTO grupos (setor_id, nome, cor, ordem) VALUES ($1, $2, $3, $4) RETURNING *',
      [setor_id, nome, cor || '#2563eb', ordem]
    );

    res.status(201).json(grupo);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar grupo.', details: err.message });
  }
});

app.put('/api/grupos/:id', auth, async (req, res) => {
  try {
    const { nome, cor } = req.body;

    const grupo = await get(
      'UPDATE grupos SET nome = $1, cor = $2 WHERE id = $3 RETURNING *',
      [nome, cor || '#2563eb', req.params.id]
    );

    res.json(grupo);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar grupo.', details: err.message });
  }
});

app.delete('/api/grupos/:id', auth, async (req, res) => {
  try {
    await query('DELETE FROM grupos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir grupo.', details: err.message });
  }
});

app.post('/api/tarefas', auth, async (req, res) => {
  try {
    const {
      grupo_id,
      titulo,
      responsavel,
      status,
      prioridade,
      prazo,
      cronograma_inicio,
      cronograma_fim,
      observacoes
    } = req.body;

    if (!grupo_id || !titulo) {
      return res.status(400).json({ error: 'Grupo e título são obrigatórios.' });
    }

    const ordem = await getNextOrder('tarefas', 'grupo_id', grupo_id);

    const tarefa = await get(
      `INSERT INTO tarefas
      (
        grupo_id,
        titulo,
        responsavel,
        status,
        prioridade,
        prazo,
        cronograma_inicio,
        cronograma_fim,
        observacoes,
        ordem
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        grupo_id,
        titulo,
        responsavel || '',
        status || 'Não iniciado',
        prioridade || 'Média',
        cleanDate(prazo),
        cleanDate(cronograma_inicio),
        cleanDate(cronograma_fim),
        observacoes || '',
        ordem
      ]
    );

    res.status(201).json(tarefa);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar tarefa.', details: err.message });
  }
});

app.put('/api/tarefas/:id', auth, async (req, res) => {
  try {
    const {
      grupo_id,
      titulo,
      responsavel,
      status,
      prioridade,
      prazo,
      cronograma_inicio,
      cronograma_fim,
      observacoes
    } = req.body;

    const tarefa = await get(
      `UPDATE tarefas SET
        grupo_id = $1,
        titulo = $2,
        responsavel = $3,
        status = $4,
        prioridade = $5,
        prazo = $6,
        cronograma_inicio = $7,
        cronograma_fim = $8,
        observacoes = $9,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *`,
      [
        grupo_id,
        titulo,
        responsavel || '',
        status || 'Não iniciado',
        prioridade || 'Média',
        cleanDate(prazo),
        cleanDate(cronograma_inicio),
        cleanDate(cronograma_fim),
        observacoes || '',
        req.params.id
      ]
    );

    res.json(tarefa);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar tarefa.', details: err.message });
  }
});

app.delete('/api/tarefas/:id', auth, async (req, res) => {
  try {
    await query('DELETE FROM tarefas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir tarefa.', details: err.message });
  }
});

app.get('/api/tarefas/:id/comentarios', auth, async (req, res) => {
  try {
    const comentarios = await all(
      `SELECT c.*, u.nome AS usuario_nome
       FROM comentarios c
       LEFT JOIN usuarios u ON u.id = c.usuario_id
       WHERE tarefa_id = $1
       ORDER BY c.id DESC`,
      [req.params.id]
    );

    res.json(comentarios);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar comentários.', details: err.message });
  }
});

app.post('/api/tarefas/:id/comentarios', auth, async (req, res) => {
  try {
    const { comentario } = req.body;

    if (!comentario) {
      return res.status(400).json({ error: 'Comentário obrigatório.' });
    }

    const novo = await get(
      'INSERT INTO comentarios (tarefa_id, usuario_id, comentario) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, req.user.id, comentario]
    );

    res.status(201).json(novo);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar comentário.', details: err.message });
  }
});


function brDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const parts = String(value).split('-');
    return parts.length >= 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
  }
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function brDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function safeFileName(value) {
  return String(value || 'relatorio')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function drawPill(doc, x, y, text, bg, fg = '#0f172a', width = null) {
  const label = String(text || '-');
  const w = width || Math.max(58, doc.widthOfString(label) + 20);
  doc.roundedRect(x, y, w, 18, 9).fill(bg);
  doc.fillColor(fg).font('Helvetica-Bold').fontSize(7.8).text(label, x, y + 5, { width: w, align: 'center' });
  return w;
}

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('feito') || s.includes('concl')) return ['#dcfce7', '#047857'];
  if (s.includes('andamento')) return ['#ffedd5', '#c2410c'];
  if (s.includes('aguard')) return ['#e0f2fe', '#0369a1'];
  if (s.includes('cancel')) return ['#e5e7eb', '#374151'];
  return ['#f1f5f9', '#334155'];
}

function priorityColor(prioridade) {
  const p = String(prioridade || '').toLowerCase();
  if (p.includes('alta')) return ['#fee2e2', '#b91c1c'];
  if (p.includes('baixa')) return ['#dcfce7', '#047857'];
  return ['#fef3c7', '#92400e'];
}


function pct(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function pdfMode(totalTasks, totalTextLength = 0) {
  const density = totalTasks + Math.ceil(totalTextLength / 380);
  if (density <= 6) return 'visual';
  if (density <= 18) return 'executivo';
  return 'compacto';
}

function taskIsLate(t) {
  if (!t.prazo || t.status === 'Feito') return false;
  return String(t.prazo).slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function periodLabel(periodo) {
  return {
    hoje: 'Hoje',
    semana: 'Semana atual',
    mes: 'Mês atual',
    todos: 'Todas as tarefas'
  }[periodo || 'todos'] || 'Todas as tarefas';
}

function periodSql(alias = 't', periodo = 'todos') {
  const field = `${alias}.prazo`;
  if (periodo === 'hoje') return `AND ${field} = CURRENT_DATE`;
  if (periodo === 'semana') return `AND ${field} BETWEEN date_trunc('week', CURRENT_DATE)::date AND (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::date`;
  if (periodo === 'mes') return `AND ${field} BETWEEN date_trunc('month', CURRENT_DATE)::date AND (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date`;
  return '';
}

function drawMiniHeader(doc, title, subtitle, userName, pageW, opts = {}) {
  const blue = '#0b2f6b';
  doc.rect(0, 0, pageW, 46).fill('#ffffff');
  doc.roundedRect(28, 13, 32, 24, 7).fill(blue);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13).text('M', 28, 19, { width: 32, align: 'center' });
  doc.fillColor(blue).font('Helvetica-Bold').fontSize(13).text('SUPERMERCADO MANAÍRA', 70, 13, { width: 230, ellipsis: true });
  doc.fillColor('#e11d48').font('Helvetica-Bold').fontSize(6.5).text('GESTÃO INTERNA DE TAREFAS', 72, 30);
  doc.fillColor(blue).font('Helvetica-Bold').fontSize(opts.titleSize || 17).text(title, 268, 9, { width: 310, align: 'center', ellipsis: true });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.8).text(subtitle, 268, 30, { width: 310, align: 'center', ellipsis: true });
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7)
    .text(`Data: ${brDate(new Date())}`, 648, 10)
    .text(`Gerado por: ${userName || 'Usuário'}`, 648, 24);
}

function drawPillSmart(doc, x, y, text, bg, fg = '#0f172a', width = null, fontSize = 7.2) {
  const label = String(text || '-');
  const w = width || Math.max(50, Math.min(92, doc.widthOfString(label) + 16));
  doc.roundedRect(x, y, w, 15, 7.5).fill(bg);
  doc.fillColor(fg).font('Helvetica-Bold').fontSize(fontSize).text(label, x, y + 4, { width: w, align: 'center', ellipsis: true });
  return w;
}

function drawMetric(doc, x, y, w, label, value, color) {
  doc.roundedRect(x, y, w, 44, 11).fill('#ffffff').strokeColor('#dbeafe').stroke();
  doc.fillColor(color).font('Helvetica-Bold').fontSize(16).text(String(value), x + 8, y + 8, { width: w - 16, align: 'center' });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.2).text(label, x + 6, y + 27, { width: w - 12, align: 'center', ellipsis: true });
}

function drawTaskVisual(doc, t, index, x, y, w, mode = 'executivo') {
  const compact = mode === 'compacto';
  const h = compact ? 42 : mode === 'executivo' ? 56 : 68;
  const status = statusColor(t.status);
  const priority = priorityColor(t.prioridade);
  const late = t.atrasada || taskIsLate(t);
  doc.roundedRect(x, y, w, h, 10).fill('#ffffff').strokeColor(late ? '#fecaca' : '#dbeafe').lineWidth(1).stroke();
  doc.roundedRect(x, y, 6, h, 3).fill(late ? '#ef4444' : (t.grupo_cor || t.setor_cor || '#2563eb'));
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(compact ? 8.4 : 9.2)
    .text(`${index}. ${t.titulo || '-'}`, x + 13, y + 8, { width: w - 24, height: compact ? 12 : 22, ellipsis: true });
  doc.fillColor('#475569').font('Helvetica').fontSize(compact ? 6.8 : 7.5)
    .text(`Resp.: ${t.responsavel || 'Sem responsável'}`, x + 13, y + (compact ? 23 : 31), { width: 138, ellipsis: true })
    .text(`Prazo: ${brDate(t.prazo)}`, x + 154, y + (compact ? 23 : 31), { width: 78 });
  drawPillSmart(doc, x + w - 148, y + (compact ? 20 : 27), t.status || '-', status[0], status[1], 76, 6.6);
  drawPillSmart(doc, x + w - 66, y + (compact ? 20 : 27), t.prioridade || '-', priority[0], priority[1], 54, 6.6);
  if (!compact) {
    doc.fillColor('#334155').font('Helvetica').fontSize(7)
      .text(t.observacoes || 'Sem observações.', x + 13, y + 47, { width: w - 26, height: mode === 'visual' ? 15 : 8, ellipsis: true });
  }
  return h;
}

function drawTaskTableRow(doc, t, x, y, widths, rowH, index, fontSize = 7) {
  const late = t.atrasada || taskIsLate(t);
  const priority = priorityColor(t.prioridade);
  const status = statusColor(t.status);
  doc.rect(x, y, widths.reduce((a,b)=>a+b,0), rowH).fill(index % 2 ? '#ffffff' : '#f8fafc').strokeColor('#e2e8f0').stroke();
  doc.fillColor(late ? '#dc2626' : '#0f172a').font('Helvetica-Bold').fontSize(fontSize)
    .text(String(t.titulo || '-'), x + 6, y + 6, { width: widths[0]-12, height: rowH-10, ellipsis: true });
  doc.fillColor('#334155').font('Helvetica').fontSize(fontSize)
    .text(String(t.responsavel || '-'), x + widths[0] + 6, y + 6, { width: widths[1]-12, ellipsis: true })
    .text(brDate(t.prazo), x + widths[0]+widths[1] + 6, y + 6, { width: widths[2]-12, align: 'center' });
  drawPillSmart(doc, x + widths[0]+widths[1]+widths[2] + 8, y + 5, t.status || '-', status[0], status[1], widths[3]-16, 6.2);
  drawPillSmart(doc, x + widths[0]+widths[1]+widths[2]+widths[3] + 8, y + 5, t.prioridade || '-', priority[0], priority[1], widths[4]-16, 6.2);
  doc.fillColor('#334155').font('Helvetica').fontSize(fontSize - .2)
    .text(String(t.observacoes || ''), x + widths.slice(0,5).reduce((a,b)=>a+b,0) + 6, y + 6, { width: widths[5]-12, height: rowH-10, ellipsis: true });
}

function addSmartPage(doc, pageW, pageH, title, subtitle, userName) {
  doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 });
  doc.rect(0, 0, pageW, pageH).fill('#f8fbff');
  drawMiniHeader(doc, title, subtitle, userName, pageW, { titleSize: 14 });
  return 66;
}

function renderGroupPdf(doc, grupo, tarefas, req, options = {}) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const blue = '#0b2f6b';
  const accent = grupo.cor || grupo.setor_cor || '#2563eb';
  const total = tarefas.length;
  const concluidas = tarefas.filter(t => t.status === 'Feito').length;
  const andamento = tarefas.filter(t => String(t.status || '').toLowerCase().includes('andamento')).length;
  const atrasadas = tarefas.filter(t => t.atrasada || taskIsLate(t)).length;
  const alta = tarefas.filter(t => t.prioridade === 'Alta').length;
  const mode = options.mode || pdfMode(total, tarefas.reduce((n, t) => n + String(t.titulo || '').length + String(t.observacoes || '').length, 0));
  const pctDone = pct(concluidas, total);

  doc.rect(0, 0, pageW, pageH).fill('#f8fbff');
  drawMiniHeader(doc, 'MAPA DE TAREFAS DO GRUPO', `${grupo.setor_nome || ''} • ${periodLabel(options.periodo)}`, req.user.nome, pageW);

  let y = 66;
  doc.roundedRect(28, y, 785, 58, 16).fill('#ffffff').strokeColor('#dbeafe').stroke();
  doc.roundedRect(44, y + 14, 34, 30, 10).fill(accent);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text('G', 44, y + 22, { width: 34, align: 'center' });
  doc.fillColor(blue).font('Helvetica-Bold').fontSize(17).text(grupo.nome, 92, y + 11, { width: 375, ellipsis: true });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8.2).text(`Setor: ${grupo.setor_nome}`, 94, y + 35, { width: 330, ellipsis: true });
  drawMetric(doc, 480, y + 7, 72, 'Total', total, blue);
  drawMetric(doc, 560, y + 7, 72, 'Concluídas', concluidas, '#047857');
  drawMetric(doc, 640, y + 7, 72, 'Atrasadas', atrasadas, '#dc2626');
  drawMetric(doc, 720, y + 7, 72, 'Conclusão', `${pctDone}%`, '#2563eb');
  y += 74;

  if (mode !== 'compacto') {
    doc.roundedRect(28, y, 785, 48, 14).fill('#ffffff').strokeColor('#dbeafe').stroke();
    drawMetric(doc, 44, y + 6, 96, 'Em andamento', andamento, '#f97316');
    drawMetric(doc, 152, y + 6, 96, 'Alta prioridade', alta, '#b91c1c');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('Progresso do grupo', 290, y + 9);
    doc.roundedRect(290, y + 27, 220, 12, 6).fill('#e2e8f0');
    doc.roundedRect(290, y + 27, Math.max(8, 220 * pctDone / 100), 12, 6).fill('#22c55e');
    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7).text(`${pctDone}% concluído`, 520, y + 26);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('Modo automático', 628, y + 9);
    doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(mode === 'visual' ? 'Visual: poucas tarefas' : 'Executivo: volume médio', 628, y + 27, { width: 150 });
    y += 64;
  }

  doc.fillColor(blue).font('Helvetica-Bold').fontSize(12).text('Tarefas', 34, y);
  y += 18;
  if (!tarefas.length) {
    doc.roundedRect(34, y, 770, 64, 14).fill('#ffffff').strokeColor('#dbeafe').stroke();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(12).text('Nenhuma tarefa encontrada para este filtro.', 34, y + 24, { width: 770, align: 'center' });
    return;
  }

  if (mode === 'visual') {
    const cardW = 372, leftX = 34, rightX = 432;
    tarefas.forEach((t, i) => {
      const colX = i % 2 === 0 ? leftX : rightX;
      if (i % 2 === 0 && i > 0) y += 78;
      if (y > 505) y = addSmartPage(doc, pageW, pageH, `GRUPO: ${grupo.nome}`, `${grupo.setor_nome || ''} • continuação`, req.user.nome);
      drawTaskVisual(doc, t, i + 1, colX, y, cardW, 'visual');
    });
  } else if (mode === 'executivo') {
    const cardW = 372, leftX = 34, rightX = 432;
    tarefas.forEach((t, i) => {
      const colX = i % 2 === 0 ? leftX : rightX;
      if (i % 2 === 0 && i > 0) y += 64;
      if (y > 515) y = addSmartPage(doc, pageW, pageH, `GRUPO: ${grupo.nome}`, `${grupo.setor_nome || ''} • continuação`, req.user.nome);
      drawTaskVisual(doc, t, i + 1, colX, y, cardW, 'executivo');
    });
  } else {
    const widths = [245, 92, 72, 88, 70, 202];
    const x = 34;
    const rowH = 28;
    const header = () => {
      doc.rect(x, y, widths.reduce((a,b)=>a+b,0), 24).fill(blue);
      const heads = ['Tarefa', 'Responsável', 'Prazo', 'Status', 'Prior.', 'Observações'];
      let cx = x;
      heads.forEach((h, i) => {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.2).text(h, cx + 5, y + 8, { width: widths[i] - 10, align: i === 2 ? 'center' : 'left' });
        cx += widths[i];
      });
      y += 24;
    };
    header();
    tarefas.forEach((t, i) => {
      if (y > 542) { y = addSmartPage(doc, pageW, pageH, `GRUPO: ${grupo.nome}`, `${grupo.setor_nome || ''} • continuação`, req.user.nome); header(); }
      drawTaskTableRow(doc, t, x, y, widths, rowH, i, 6.8);
      y += rowH;
    });
  }
}

async function getGroupTasks(grupoId, periodo = 'todos', status = '', busca = '', responsavel = '') {
  const params = [grupoId];
  const filters = ['t.grupo_id = $1'];
  if (status) { params.push(status); filters.push(`t.status = $${params.length}`); }
  if (busca) { params.push(`%${busca}%`); filters.push(`(t.titulo ILIKE $${params.length} OR COALESCE(t.observacoes,'') ILIKE $${params.length} OR COALESCE(t.responsavel,'') ILIKE $${params.length})`); }
  if (responsavel) { params.push(`%${responsavel}%`); filters.push(`COALESCE(t.responsavel,'') ILIKE $${params.length}`); }
  const period = periodSql('t', periodo).replace(/^AND /, '');
  if (period) filters.push(period);
  return all(`
    SELECT t.*, g.cor AS grupo_cor,
      CASE WHEN t.status <> 'Feito' AND t.prazo IS NOT NULL AND t.prazo < CURRENT_DATE THEN TRUE ELSE FALSE END AS atrasada
    FROM tarefas t
    JOIN grupos g ON g.id = t.grupo_id
    WHERE ${filters.join(' AND ')}
    ORDER BY CASE t.prioridade WHEN 'Alta' THEN 1 WHEN 'Média' THEN 2 WHEN 'Baixa' THEN 3 ELSE 4 END,
      t.prazo ASC NULLS LAST, t.ordem ASC, t.id ASC
  `, params);
}



// =========================
// PDF v2.2 - impressão inteligente em A4 retrato
// Evita páginas extras, reduz automaticamente o layout e só quebra página quando necessário.
// =========================
const PDF_PRINT = {
  w: 595.28,
  h: 841.89,
  margin: 28,
  footerY: 802,
  blue: '#0b2f6b',
  soft: '#f8fbff'
};

function pdfDensityMode(totalTasks, totalTextLength = 0) {
  const density = totalTasks + Math.ceil(totalTextLength / 520);
  if (density <= 5) return 'visual';
  if (density <= 18) return 'executivo';
  return 'compacto';
}

function addPrintPage(doc, title, subtitle, userName, compactHeader = false) {
  doc.addPage({ size: 'A4', margin: PDF_PRINT.margin });
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_PRINT.soft);
  const y0 = 18;
  doc.roundedRect(24, y0, 42, 30, 8).fill(PDF_PRINT.blue);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text('M', 24, y0 + 8, { width: 42, align: 'center' });
  doc.fillColor(PDF_PRINT.blue).font('Helvetica-Bold').fontSize(11).text('SUPERMERCADO MANAÍRA', 74, y0 + 1, { width: 190, ellipsis: true });
  doc.fillColor('#e11d48').font('Helvetica-Bold').fontSize(6.4).text('GESTÃO INTERNA DE TAREFAS', 75, y0 + 17);
  doc.fillColor('#64748b').font('Helvetica').fontSize(6.6).text(`Gerado em ${brDate(new Date())} • ${userName || 'Usuário'}`, 75, y0 + 29, { width: 230, ellipsis: true });

  doc.fillColor(PDF_PRINT.blue).font('Helvetica-Bold').fontSize(compactHeader ? 12 : 15)
    .text(title, 285, y0, { width: 280, align: 'right', ellipsis: true });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5)
    .text(subtitle, 285, y0 + (compactHeader ? 17 : 22), { width: 280, align: 'right', ellipsis: true });
  doc.moveTo(24, 58).lineTo(571, 58).strokeColor('#dbeafe').lineWidth(1).stroke();
  return 72;
}

function ensurePrintSpace(doc, y, needed, title, subtitle, userName) {
  if (y + needed <= PDF_PRINT.footerY - 8) return y;
  return addPrintPage(doc, title, subtitle, userName, true);
}

function drawPrintMetric(doc, x, y, w, label, value, color) {
  doc.roundedRect(x, y, w, 42, 10).fill('#ffffff').strokeColor('#dbeafe').lineWidth(1).stroke();
  doc.fillColor(color).font('Helvetica-Bold').fontSize(15).text(String(value), x + 6, y + 8, { width: w - 12, align: 'center' });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(6.7).text(label, x + 5, y + 28, { width: w - 10, align: 'center', ellipsis: true });
}

function drawPrintSummary(doc, y, items) {
  const x = 28, gap = 8;
  const w = Math.floor((539 - gap * (items.length - 1)) / items.length);
  items.forEach((it, i) => drawPrintMetric(doc, x + i * (w + gap), y, w, it.label, it.value, it.color));
  return y + 54;
}

function truncateText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function drawPrintPill(doc, x, y, text, bg, fg, w) {
  doc.roundedRect(x, y, w, 14, 7).fill(bg);
  doc.fillColor(fg).font('Helvetica-Bold').fontSize(6.1).text(String(text || '-'), x + 3, y + 4, { width: w - 6, align: 'center', ellipsis: true });
}

function drawPrintTaskCard(doc, t, x, y, w, index, mode, accent) {
  const late = t.atrasada || taskIsLate(t);
  const compact = mode === 'compacto';
  const obs = truncateText(t.observacoes || '', compact ? 70 : 140);
  const baseH = compact ? 43 : mode === 'executivo' ? 58 : 76;
  const h = obs && !compact ? baseH + 8 : baseH;
  const status = statusColor(t.status);
  const pri = priorityColor(t.prioridade);
  doc.roundedRect(x, y, w, h, 10).fill('#ffffff').strokeColor(late ? '#fecaca' : '#dbeafe').lineWidth(1).stroke();
  doc.roundedRect(x, y, 6, h, 3).fill(late ? '#ef4444' : accent || '#2563eb');
  doc.fillColor(late ? '#b91c1c' : '#0f172a').font('Helvetica-Bold').fontSize(compact ? 7.6 : 8.7)
    .text(`${index}. ${truncateText(t.titulo || '-', compact ? 70 : 105)}`, x + 12, y + 8, { width: w - 24, height: compact ? 11 : 22, ellipsis: true });
  doc.fillColor('#334155').font('Helvetica').fontSize(compact ? 6.3 : 7)
    .text(`Responsável: ${truncateText(t.responsavel || 'Sem responsável', 34)}`, x + 12, y + (compact ? 23 : 31), { width: 190, ellipsis: true })
    .text(`Prazo: ${brDate(t.prazo)}`, x + 210, y + (compact ? 23 : 31), { width: 78 });
  drawPrintPill(doc, x + w - 132, y + (compact ? 21 : 29), t.status || '-', status[0], status[1], 72);
  drawPrintPill(doc, x + w - 55, y + (compact ? 21 : 29), t.prioridade || '-', pri[0], pri[1], 46);
  if (obs && !compact) {
    doc.fillColor('#475569').font('Helvetica').fontSize(6.7)
      .text(obs, x + 12, y + 49, { width: w - 24, height: h - 54, ellipsis: true });
  }
  return h;
}

function drawPrintTableHeader(doc, x, y, widths, titleColor = PDF_PRINT.blue) {
  const totalW = widths.reduce((a,b)=>a+b,0);
  doc.roundedRect(x, y, totalW, 22, 7).fill(titleColor);
  const heads = ['Tarefa', 'Resp.', 'Prazo', 'Status', 'Prior.', 'Obs.'];
  let cx = x;
  heads.forEach((h, i) => {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.2)
      .text(h, cx + 4, y + 8, { width: widths[i] - 8, align: i === 2 ? 'center' : 'left' });
    cx += widths[i];
  });
  return y + 22;
}

function drawPrintTaskRow(doc, t, x, y, widths, rowH, idx) {
  const status = statusColor(t.status);
  const pri = priorityColor(t.prioridade);
  const late = t.atrasada || taskIsLate(t);
  const totalW = widths.reduce((a,b)=>a+b,0);
  doc.rect(x, y, totalW, rowH).fill(idx % 2 ? '#ffffff' : '#f8fafc').strokeColor('#e2e8f0').lineWidth(.6).stroke();
  doc.fillColor(late ? '#b91c1c' : '#0f172a').font('Helvetica-Bold').fontSize(6.35)
    .text(truncateText(t.titulo || '-', 58), x + 4, y + 6, { width: widths[0] - 8, height: rowH - 8, ellipsis: true });
  let cx = x + widths[0];
  doc.fillColor('#334155').font('Helvetica').fontSize(6.2)
    .text(truncateText(t.responsavel || '-', 18), cx + 4, y + 6, { width: widths[1] - 8, ellipsis: true });
  cx += widths[1];
  doc.text(brDate(t.prazo), cx + 3, y + 6, { width: widths[2] - 6, align: 'center' });
  cx += widths[2];
  drawPrintPill(doc, cx + 3, y + 5, t.status || '-', status[0], status[1], widths[3] - 6);
  cx += widths[3];
  drawPrintPill(doc, cx + 3, y + 5, t.prioridade || '-', pri[0], pri[1], widths[4] - 6);
  cx += widths[4];
  doc.fillColor('#475569').font('Helvetica').fontSize(6.1)
    .text(truncateText(t.observacoes || '', 68), cx + 4, y + 6, { width: widths[5] - 8, height: rowH - 8, ellipsis: true });
}

function drawFooterPages(doc, footerText) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(24, PDF_PRINT.footerY - 8).lineTo(571, PDF_PRINT.footerY - 8).strokeColor('#dbeafe').lineWidth(1).stroke();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6.5)
      .text(footerText, 28, PDF_PRINT.footerY, { width: 360, ellipsis: true });
    doc.fillColor(PDF_PRINT.blue).font('Helvetica-Bold').fontSize(6.5)
      .text(`Página ${i + 1} de ${range.count}`, 470, PDF_PRINT.footerY, { width: 95, align: 'right' });
  }
}

function renderGroupPdfV22(doc, grupo, tarefas, req, options = {}) {
  const totalText = tarefas.reduce((n, t) => n + String(t.titulo || '').length + String(t.observacoes || '').length, 0);
  const mode = pdfDensityMode(tarefas.length, totalText);
  const title = 'RELATÓRIO DO GRUPO';
  const subtitle = `${grupo.setor_nome || ''} • ${grupo.nome || ''} • ${periodLabel(options.periodo)}`;
  let y = addPrintPage(doc, title, subtitle, req.user.nome);
  const total = tarefas.length;
  const concluidas = tarefas.filter(t => t.status === 'Feito').length;
  const atrasadas = tarefas.filter(t => t.atrasada || taskIsLate(t)).length;
  const alta = tarefas.filter(t => t.prioridade === 'Alta').length;
  y = drawPrintSummary(doc, y, [
    { label: 'Total', value: total, color: PDF_PRINT.blue },
    { label: 'Concluídas', value: concluidas, color: '#047857' },
    { label: 'Atrasadas', value: atrasadas, color: '#dc2626' },
    { label: 'Conclusão', value: `${pct(concluidas, total)}%`, color: '#2563eb' }
  ]);

  doc.roundedRect(28, y, 539, 48, 12).fill('#ffffff').strokeColor('#dbeafe').stroke();
  doc.roundedRect(42, y + 10, 26, 26, 8).fill(grupo.cor || grupo.setor_cor || '#2563eb');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text('G', 42, y + 17, { width: 26, align: 'center' });
  doc.fillColor(PDF_PRINT.blue).font('Helvetica-Bold').fontSize(12).text(truncateText(grupo.nome, 55), 80, y + 9, { width: 300, ellipsis: true });
  doc.fillColor('#475569').font('Helvetica').fontSize(7).text(`Modo automático: ${mode} • Alta prioridade: ${alta}`, 80, y + 28, { width: 330, ellipsis: true });
  doc.roundedRect(414, y + 20, 120, 9, 4).fill('#e2e8f0');
  doc.roundedRect(414, y + 20, Math.max(6, 120 * pct(concluidas, total) / 100), 9, 4).fill('#22c55e');
  doc.fillColor('#334155').font('Helvetica-Bold').fontSize(6.5).text(`${pct(concluidas, total)}%`, 540, y + 18, { width: 20 });
  y += 62;

  if (!tarefas.length) {
    doc.roundedRect(28, y, 539, 58, 12).fill('#ffffff').strokeColor('#dbeafe').stroke();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(10).text('Nenhuma tarefa encontrada para este filtro.', 28, y + 22, { width: 539, align: 'center' });
    return;
  }

  if (mode === 'visual' || mode === 'executivo') {
    tarefas.forEach((t, i) => {
      const h = mode === 'visual' ? 84 : 65;
      y = ensurePrintSpace(doc, y, h + 8, title, subtitle, req.user.nome);
      const realH = drawPrintTaskCard(doc, t, 28, y, 539, i + 1, mode, grupo.cor || grupo.setor_cor);
      y += realH + 8;
    });
  } else {
    const widths = [180, 64, 50, 64, 50, 131];
    const x = 28, rowH = 24;
    y = drawPrintTableHeader(doc, x, y, widths);
    tarefas.forEach((t, i) => {
      if (y + rowH > PDF_PRINT.footerY - 8) {
        y = addPrintPage(doc, title, subtitle + ' • continuação', req.user.nome, true);
        y = drawPrintTableHeader(doc, x, y, widths);
      }
      drawPrintTaskRow(doc, t, x, y, widths, rowH, i);
      y += rowH;
    });
  }
}

function renderSectorPdfV22(doc, setor, grupos, allTasks, req, options = {}) {
  const totalText = allTasks.reduce((n, t) => n + String(t.titulo || '').length + String(t.observacoes || '').length, 0);
  const mode = pdfDensityMode(allTasks.length, totalText);
  const title = 'RELATÓRIO DO SETOR';
  const filtro = `${periodLabel(options.periodo)}${options.status ? ' • ' + options.status : ''}${options.responsavel ? ' • ' + options.responsavel : ''}${options.busca ? ' • Busca: ' + options.busca : ''}`;
  const subtitle = `${setor.nome} • ${filtro}`;
  let y = addPrintPage(doc, title, subtitle, req.user.nome);
  const total = allTasks.length;
  const concluidas = allTasks.filter(t => t.status === 'Feito').length;
  const atrasadas = allTasks.filter(t => t.atrasada || taskIsLate(t)).length;
  const alta = allTasks.filter(t => t.prioridade === 'Alta').length;
  y = drawPrintSummary(doc, y, [
    { label: 'Total', value: total, color: PDF_PRINT.blue },
    { label: 'Concluídas', value: concluidas, color: '#047857' },
    { label: 'Atrasadas', value: atrasadas, color: '#dc2626' },
    { label: 'Alta prioridade', value: alta, color: '#b91c1c' },
    { label: 'Conclusão', value: `${pct(concluidas, total)}%`, color: '#2563eb' }
  ]);

  if (!allTasks.length) {
    doc.roundedRect(28, y, 539, 58, 12).fill('#ffffff').strokeColor('#dbeafe').stroke();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(10).text('Nenhuma tarefa encontrada para os filtros aplicados.', 28, y + 22, { width: 539, align: 'center' });
    return;
  }

  for (const grupo of grupos) {
    const tarefas = grupo.tarefas || [];
    if (!tarefas.length) continue;
    y = ensurePrintSpace(doc, y, 54, title, `${setor.nome} • continuação`, req.user.nome);
    doc.roundedRect(28, y, 539, 30, 8).fill('#ffffff').strokeColor('#dbeafe').stroke();
    doc.roundedRect(40, y + 8, 10, 14, 4).fill(grupo.cor || setor.cor || PDF_PRINT.blue);
    doc.fillColor(PDF_PRINT.blue).font('Helvetica-Bold').fontSize(9.5).text(`${truncateText(grupo.nome, 52)} (${tarefas.length})`, 58, y + 9, { width: 285, ellipsis: true });
    const gDone = tarefas.filter(t => t.status === 'Feito').length;
    const gLate = tarefas.filter(t => t.atrasada || taskIsLate(t)).length;
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(6.8).text(`${gDone} concluídas • ${gLate} atrasadas`, 390, y + 10, { width: 155, align: 'right' });
    y += 38;

    if (mode === 'visual') {
      tarefas.forEach((t, i) => {
        y = ensurePrintSpace(doc, y, 76, title, `${setor.nome} • ${grupo.nome}`, req.user.nome);
        const h = drawPrintTaskCard(doc, t, 38, y, 519, i + 1, 'executivo', grupo.cor || setor.cor);
        y += h + 7;
      });
    } else if (mode === 'executivo') {
      tarefas.forEach((t, i) => {
        y = ensurePrintSpace(doc, y, 58, title, `${setor.nome} • ${grupo.nome}`, req.user.nome);
        const h = drawPrintTaskCard(doc, t, 38, y, 519, i + 1, 'compacto', grupo.cor || setor.cor);
        y += h + 6;
      });
    } else {
      const widths = [174, 62, 48, 60, 48, 107];
      const x = 38, rowH = 22;
      y = drawPrintTableHeader(doc, x, y, widths, grupo.cor || setor.cor || PDF_PRINT.blue);
      tarefas.forEach((t, i) => {
        if (y + rowH > PDF_PRINT.footerY - 8) {
          y = addPrintPage(doc, title, `${setor.nome} • ${grupo.nome} • continuação`, req.user.nome, true);
          y = drawPrintTableHeader(doc, x, y, widths, grupo.cor || setor.cor || PDF_PRINT.blue);
        }
        drawPrintTaskRow(doc, t, x, y, widths, rowH, i);
        y += rowH;
      });
      y += 10;
    }
  }
}

app.get('/api/grupos/:id/relatorio-pdf', authPdf, async (req, res) => {
  try {
    const { periodo = 'todos', status = '', busca = '', responsavel = '' } = req.query;
    const grupo = await get(`
      SELECT g.*, s.nome AS setor_nome, s.descricao AS setor_descricao, s.cor AS setor_cor
      FROM grupos g JOIN setores s ON s.id = g.setor_id WHERE g.id = $1
    `, [req.params.id]);
    if (!grupo) return res.status(404).send('Grupo não encontrado.');
    const tarefas = await getGroupTasks(req.params.id, periodo, status, busca, responsavel);
    const filename = `grupo-${safeFileName(grupo.setor_nome)}-${safeFileName(grupo.nome)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margin: 28, bufferPages: true });
    doc.pipe(res);
    renderGroupPdfV22(doc, grupo, tarefas, req, { periodo, status, busca, responsavel });
    drawFooterPages(doc, 'Relatório do grupo para execução operacional.');
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao gerar relatório PDF do grupo.');
  }
});

app.get('/api/setores/:id/relatorio-pdf', authPdf, async (req, res) => {
  try {
    const { periodo = 'todos', status = '', busca = '', responsavel = '' } = req.query;
    const setor = await get('SELECT * FROM setores WHERE id = $1', [req.params.id]);
    if (!setor) return res.status(404).send('Setor não encontrado.');
    const grupos = await all('SELECT * FROM grupos WHERE setor_id = $1 ORDER BY ordem, id', [req.params.id]);
    let allTasks = [];
    for (const grupo of grupos) {
      grupo.setor_nome = setor.nome;
      grupo.setor_descricao = setor.descricao;
      grupo.setor_cor = setor.cor;
      grupo.tarefas = await getGroupTasks(grupo.id, periodo, status, busca, responsavel);
      allTasks.push(...grupo.tarefas.map(t => ({ ...t, grupo_nome: grupo.nome })));
    }
    const totalText = allTasks.reduce((n, t) => n + String(t.titulo || '').length + String(t.observacoes || '').length, 0);
    const mode = pdfMode(allTasks.length, totalText);
    const filename = `setor-${safeFileName(setor.nome)}-${safeFileName(periodLabel(periodo))}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margin: 28, bufferPages: true });
    doc.pipe(res);
    renderSectorPdfV22(doc, setor, grupos, allTasks, req, { periodo, status, busca, responsavel, mode });
    drawFooterPages(doc, 'Relatório do setor para impressão e acompanhamento das equipes.');
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao gerar relatório PDF do setor.');
  }
});


// =========================
// Módulo Ordem de Serviço Operacional
// =========================
function cleanDateTime(value) {
  return value && value !== '' ? value : null;
}

function normalizeMinutes(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function generateOsNumber() {
  const row = await get(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ordens_servico`);
  const year = new Date().getFullYear();
  return `OS-${year}-${String(row?.next_id || 1).padStart(5, '0')}`;
}

function osOpenFilter(alias = 'o') {
  return `${alias}.status NOT IN ('Concluído', 'Cancelado')`;
}

app.get('/api/os/dashboard', auth, async (req, res) => {
  try {
    const { busca = '', status = '', prioridade = '', responsavel = '', periodo = '30' } = req.query;
    const params = [];
    const filters = [];

    if (busca) {
      params.push(`%${String(busca).trim()}%`);
      filters.push(`(o.titulo ILIKE $${params.length} OR COALESCE(o.descricao,'') ILIKE $${params.length} OR COALESCE(o.setor_local,'') ILIKE $${params.length} OR COALESCE(o.solicitante,'') ILIKE $${params.length})`);
    }
    if (status) { params.push(status); filters.push(`o.status = $${params.length}`); }
    if (prioridade) { params.push(prioridade); filters.push(`o.prioridade = $${params.length}`); }
    if (responsavel) { params.push(`%${String(responsavel).trim()}%`); filters.push(`COALESCE(o.responsavel_principal,'') ILIKE $${params.length}`); }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const periodoDias = Math.max(1, Math.min(parseInt(periodo, 10) || 30, 365));

    const totalizadores = await get(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${osOpenFilter('o')})::int AS abertas,
        COUNT(*) FILTER (WHERE o.status = 'Recebido')::int AS recebidas,
        COUNT(*) FILTER (WHERE o.status = 'Em execução')::int AS em_execucao,
        COUNT(*) FILTER (WHERE o.status IN ('Aguardando mão de obra', 'Aguardando material', 'Pausado'))::int AS pendentes,
        COUNT(*) FILTER (WHERE o.status = 'Concluído')::int AS concluidas,
        COUNT(*) FILTER (WHERE o.prioridade = 'Urgente' AND ${osOpenFilter('o')})::int AS urgentes,
        ROUND(AVG(NULLIF(o.tempo_real_min, 0)))::int AS tempo_medio_min
      FROM ordens_servico o
      ${where}
    `, params);

    const porStatus = await all(`SELECT o.status, COUNT(*)::int AS total FROM ordens_servico o ${where} GROUP BY o.status ORDER BY total DESC`, params);
    const porPrioridade = await all(`SELECT o.prioridade, COUNT(*)::int AS total FROM ordens_servico o ${where} GROUP BY o.prioridade ORDER BY CASE o.prioridade WHEN 'Urgente' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Média' THEN 3 WHEN 'Baixa' THEN 4 ELSE 5 END`, params);
    const porResponsavel = await all(`
      SELECT COALESCE(NULLIF(TRIM(o.responsavel_principal), ''), 'Sem responsável') AS responsavel,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${osOpenFilter('o')})::int AS abertas,
        COUNT(*) FILTER (WHERE o.status = 'Concluído')::int AS concluidas
      FROM ordens_servico o
      ${where}
      GROUP BY COALESCE(NULLIF(TRIM(o.responsavel_principal), ''), 'Sem responsável')
      ORDER BY abertas DESC, total DESC
      LIMIT 12
    `, params);

    const recentes = await all(`
      SELECT * FROM ordens_servico o
      ${where}
      ORDER BY CASE o.prioridade WHEN 'Urgente' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Média' THEN 3 WHEN 'Baixa' THEN 4 ELSE 5 END,
        CASE o.status WHEN 'Recebido' THEN 1 WHEN 'Em análise' THEN 2 WHEN 'Em execução' THEN 3 ELSE 4 END,
        o.criado_em DESC
      LIMIT 80
    `, params);

    const concluidasPeriodo = await all(`
      SELECT to_char(date_trunc('day', o.data_conclusao), 'YYYY-MM-DD') AS dia, COUNT(*)::int AS total
      FROM ordens_servico o
      WHERE o.status = 'Concluído' AND o.data_conclusao >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      GROUP BY date_trunc('day', o.data_conclusao)
      ORDER BY date_trunc('day', o.data_conclusao)
    `, [periodoDias]);

    res.json({ filtros: { busca, status, prioridade, responsavel, periodo: periodoDias }, totalizadores: totalizadores || {}, porStatus, porPrioridade, porResponsavel, recentes, concluidasPeriodo });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar ordens de serviço.', details: err.message });
  }
});

app.post('/api/os', auth, async (req, res) => {
  try {
    const {
      titulo, descricao, solicitante, setor_local, categoria, prioridade, impacto, status,
      responsavel_principal, funcionarios, quantidade_mao_obra, tempo_estimado_min,
      previsao_conclusao, material_necessario, material_utilizado, pendencias, execucao,
      observacao_conclusao, data_inicio, data_conclusao, tempo_real_min
    } = req.body;

    if (!titulo) return res.status(400).json({ error: 'Título da OS é obrigatório.' });
    const numero = await generateOsNumber();
    const os = await get(`
      INSERT INTO ordens_servico
      (numero, titulo, descricao, solicitante, setor_local, categoria, prioridade, impacto, status,
       responsavel_principal, funcionarios, quantidade_mao_obra, tempo_estimado_min, tempo_real_min,
       previsao_conclusao, data_inicio, data_conclusao, material_necessario, material_utilizado, pendencias,
       execucao, observacao_conclusao, criado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *
    `, [
      numero, titulo, descricao || '', solicitante || '', setor_local || '', categoria || 'Outros', prioridade || 'Média', impacto || '', status || 'Recebido',
      responsavel_principal || '', funcionarios || '', normalizeMinutes(quantidade_mao_obra) || 1, normalizeMinutes(tempo_estimado_min), normalizeMinutes(tempo_real_min),
      cleanDateTime(previsao_conclusao), cleanDateTime(data_inicio), cleanDateTime(data_conclusao), material_necessario || '', material_utilizado || '', pendencias || '',
      execucao || '', observacao_conclusao || '', req.user.id
    ]);
    res.status(201).json(os);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar OS.', details: err.message });
  }
});


app.put('/api/os/:id', auth, async (req, res) => {
  try {
    const {
      titulo,
      descricao,
      solicitante,
      setor_local,
      categoria,
      prioridade,
      impacto,
      status,
      responsavel_principal,
      funcionarios,
      quantidade_mao_obra,
      tempo_estimado_min,
      previsao_conclusao,
      material_necessario,
      material_utilizado,
      pendencias,
      execucao,
      observacao_conclusao,
      data_inicio,
      data_conclusao,
      tempo_real_min
    } = req.body;

    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({
        error: 'Título da OS é obrigatório.'
      });
    }

    const finalStatus = status || 'Recebido';

    const osExistente = await get(
      'SELECT * FROM ordens_servico WHERE id = $1',
      [req.params.id]
    );

    if (!osExistente) {
      return res.status(404).json({
        error: 'Ordem de serviço não encontrada.'
      });
    }

    let dataInicioFinal = cleanDateTime(data_inicio);
    let dataConclusaoFinal = cleanDateTime(data_conclusao);

    // Se entrar em execução pela primeira vez,
    // registra automaticamente a data de início.
    if (
      finalStatus === 'Em execução' &&
      !dataInicioFinal &&
      !osExistente.data_inicio
    ) {
      dataInicioFinal = new Date();
    }

    // Mantém a data de início existente.
    if (!dataInicioFinal && osExistente.data_inicio) {
      dataInicioFinal = osExistente.data_inicio;
    }

    // Se for concluída pela primeira vez,
    // registra automaticamente a conclusão.
    if (
      finalStatus === 'Concluído' &&
      !dataConclusaoFinal &&
      !osExistente.data_conclusao
    ) {
      dataConclusaoFinal = new Date();
    }

    // Mantém a data de conclusão existente.
    if (!dataConclusaoFinal && osExistente.data_conclusao) {
      dataConclusaoFinal = osExistente.data_conclusao;
    }

    const os = await get(
      `
      UPDATE ordens_servico SET

        titulo = $1,
        descricao = $2,
        solicitante = $3,
        setor_local = $4,
        categoria = $5,
        prioridade = $6,
        impacto = $7,
        status = $8,

        responsavel_principal = $9,
        funcionarios = $10,

        quantidade_mao_obra = $11,
        tempo_estimado_min = $12,
        tempo_real_min = $13,

        previsao_conclusao = $14,
        data_inicio = $15,
        data_conclusao = $16,

        material_necessario = $17,
        material_utilizado = $18,
        pendencias = $19,
        execucao = $20,
        observacao_conclusao = $21,

        atualizado_em = CURRENT_TIMESTAMP

      WHERE id = $22

      RETURNING *
      `,
      [
        String(titulo).trim(),
        descricao || '',
        solicitante || '',
        setor_local || '',
        categoria || 'Outros',
        prioridade || 'Média',
        impacto || '',
        finalStatus,

        responsavel_principal || '',
        funcionarios || '',

        normalizeMinutes(quantidade_mao_obra) || 1,
        normalizeMinutes(tempo_estimado_min),
        normalizeMinutes(tempo_real_min),

        cleanDateTime(previsao_conclusao),
        dataInicioFinal,
        dataConclusaoFinal,

        material_necessario || '',
        material_utilizado || '',
        pendencias || '',
        execucao || '',
        observacao_conclusao || '',

        req.params.id
      ]
    );

    return res.json(os);

  } catch (err) {

    console.error('ERRO AO ATUALIZAR OS:');
    console.error(err);

    return res.status(500).json({
      error: 'Erro ao atualizar OS.',
      details: err.message
    });
  }
});





app.patch('/api/os/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Status é obrigatório.'
      });
    }

    const osExistente = await get(
      'SELECT * FROM ordens_servico WHERE id = $1',
      [req.params.id]
    );

    if (!osExistente) {
      return res.status(404).json({
        error: 'Ordem de serviço não encontrada.'
      });
    }

    let dataInicioFinal = osExistente.data_inicio;
    let dataConclusaoFinal = osExistente.data_conclusao;

    // Registra automaticamente quando a OS entra em execução
    if (status === 'Em execução' && !dataInicioFinal) {
      dataInicioFinal = new Date();
    }

    // Registra automaticamente quando a OS é concluída
    if (status === 'Concluído' && !dataConclusaoFinal) {
      dataConclusaoFinal = new Date();
    }

    const osAtualizada = await get(
      `
      UPDATE ordens_servico SET
        status = $1,
        data_inicio = $2,
        data_conclusao = $3,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
      `,
      [
        status,
        dataInicioFinal,
        dataConclusaoFinal,
        req.params.id
      ]
    );

    return res.json(osAtualizada);

  } catch (err) {
    console.error('ERRO AO ALTERAR STATUS DA OS:');
    console.error(err);

    return res.status(500).json({
      error: 'Erro ao alterar status da OS.',
      details: err.message
    });
  }
});

app.delete('/api/os/:id', auth, async (req, res) => {
  try {
    await query('DELETE FROM ordens_servico WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir OS.', details: err.message });
  }
});

app.get('/api/os/relatorio-pdf', authPdf, async (req, res) => {
  try {
    const itens = await all(`SELECT * FROM ordens_servico ORDER BY criado_em DESC LIMIT 200`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="ordens-servico-operacional.pdf"');
    const doc = new PDFDocument({ size: 'A4', margin: 28, bufferPages: true });
    doc.pipe(res);
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0b2f6b').text('Ordens de Serviço Operacionais', { align: 'center' });
    doc.moveDown(.5).font('Helvetica').fontSize(8).fillColor('#64748b').text(`Gerado em ${brDate(new Date())} • ${req.user.nome}`, { align: 'center' });
    doc.moveDown();
    itens.forEach((o, i) => {
      if (doc.y > 760) doc.addPage();
      doc.roundedRect(28, doc.y, 539, 54, 8).strokeColor('#dbeafe').stroke();
      const y = doc.y + 8;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(`${o.numero || o.id} - ${o.titulo}`, 38, y, { width: 330, ellipsis: true });
      doc.font('Helvetica').fontSize(7).fillColor('#334155').text(`Local: ${o.setor_local || '-'} • Resp.: ${o.responsavel_principal || '-'} • M.O.: ${o.quantidade_mao_obra || 1}`, 38, y+16, { width: 380, ellipsis: true });
      doc.text(`Status: ${o.status || '-'} • Prioridade: ${o.prioridade || '-'} • Criado: ${brDateTime(o.criado_em)}`, 38, y+30, { width: 420, ellipsis: true });
      doc.y = y + 50;
    });
    drawFooterPages(doc, 'Relatório operacional de ordens de serviço.');
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao gerar PDF de OS.');
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Manaíra Board rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Erro ao iniciar aplicação:', err);
    process.exit(1);
  });