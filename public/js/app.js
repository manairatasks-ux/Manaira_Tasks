const state = {
  token: localStorage.getItem('mb_token'),
  usuario: null,
  setores: [],
  setorAtual: null,
  quadro: null,
  view: 'dashboard',
  dashboardFilters: { periodo: '90', setor_id: '', responsavel: '' },
  dashboardData: null,
  osData: null,
  usuarios: [],
  minhasData: { tarefas: [], os: [] },
  osPages: {
    recebidos: 1,
    execucao: 1,
    pendencias: 1,
    concluidos: 1
  },
  osFilters: { busca: '', status: '', prioridade: '', responsavel: '', periodo: '30' },
  cache: { dashboard: new Map(), quadros: new Map() },
  pending: { dashboard: null, setor: null },
  renderTimer: null
};

const CACHE_TTL = 60 * 1000;

const $ = (id) => document.getElementById(id);

function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function isFresh(entry) {
  return entry && (Date.now() - entry.createdAt) < CACHE_TTL;
}

function setLoading(message = 'Carregando...') {
  const box = $('pageLoading');
  if (!box) return;
  box.querySelector('span').textContent = message;
  box.classList.remove('hidden');
}

function clearLoading() {
  const box = $('pageLoading');
  if (box) box.classList.add('hidden');
}

function scheduleRender(fn) {
  if (state.renderTimer) cancelAnimationFrame(state.renderTimer);
  state.renderTimer = requestAnimationFrame(() => {
    state.renderTimer = null;
    fn();
  });
}

function invalidateDashboard() {
  state.cache.dashboard.clear();
}

function invalidateSetor(id = state.setorAtual?.id) {
  if (id) state.cache.quadros.delete(String(id));
  invalidateDashboard();
}

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  });
}

function showApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
}

function showLogin() {
  $('app').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
}


function configurarMenuPorPerfil() {
  const perfil = String(state.usuario?.perfil || '').toLowerCase();
  const isManager = ['admin', 'gerente'].includes(perfil);
  const isWorker = ['colaborador', 'encarregado'].includes(perfil);

  $('btnDashboard')?.classList.toggle('hidden', !isManager);
  $('btnOS')?.classList.toggle('hidden', !isManager);
  $('btnConfig')?.classList.toggle('hidden', !isManager);
  $('btnNovoSetor')?.classList.toggle('hidden', !isManager);
  $('setoresList')?.classList.toggle('hidden', !isManager);

  // Colaborador e encarregado começam na própria área.
  // Gerente/admin continuam na visão executiva.
}

function statusClass(status) {
  return 'status-' + (status || 'Não iniciado').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll(' ', '-');
}

function priorityClass(priority) {
  return 'priority-' + (priority || 'Média').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fmtDate(date) {
  if (!date) return '-';
  const [y, m, d] = String(date).split('-');
  return d && m && y ? `${d}/${m}/${y}` : date;
}

function taskMatchesPeriod(t, periodo) {
  if (!periodo || periodo === 'todos') return true;
  if (!t.prazo) return false;
  const prazo = String(t.prazo).slice(0, 10);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (periodo === 'hoje') return prazo === today;
  const d = new Date(prazo + 'T00:00:00');
  if (periodo === 'mes') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (periodo === 'semana') {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }
  return true;
}

function currentBoardPdfParams() {
  const params = new URLSearchParams();
  if (state.token) params.set('token', state.token);
  const busca = $('busca')?.value?.trim();
  const status = $('filtroStatus')?.value;
  const periodo = $('filtroPeriodo')?.value || 'todos';
  if (busca) params.set('busca', busca);
  if (status) params.set('status', status);
  params.set('periodo', periodo);
  return params.toString();
}

function fmtDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function setView(view) {
  state.view = view;
  const isDashboard = view === 'dashboard';
  const isBoard = view === 'board';
  const isOS = view === 'os';
  const isMinhas = view === 'minhas';
  const isConfig = view === 'config';
  $('dashboard').classList.toggle('hidden', !isDashboard);
  $('board').classList.toggle('hidden', !isBoard);
  $('osPanel')?.classList.toggle('hidden', !isOS);
  $('minhasPanel')?.classList.toggle('hidden', !isMinhas);
  $('configPanel')?.classList.toggle('hidden', !isConfig);
  $('printFooter').classList.toggle('hidden', false);
  $('btnDashboard').classList.toggle('active', isDashboard);
  $('btnOS')?.classList.toggle('active', isOS);
  $('btnMinhas')?.classList.toggle('active', isMinhas);
  $('btnConfig')?.classList.toggle('active', isConfig);
  $('btnExcluirSetor').classList.toggle('hidden', !isBoard);
  $('btnNovoGrupo').style.display = isBoard ? '' : 'none';
  $('btnNovaTarefa').style.display = isBoard ? '' : 'none';
  $('busca').style.display = isBoard ? '' : 'none';
  $('filtroStatus').style.display = isBoard ? '' : 'none';
  $('filtroPeriodo').style.display = isBoard ? '' : 'none';
  $('btnPdfSetor').style.display = isBoard ? '' : 'none';
}

async function init() {
  if (!state.token) return showLogin();
  try {
    state.usuario = await api('/api/me');
    $('userName').textContent = state.usuario.nome;
    showApp();
    configurarMenuPorPerfil();
    invalidateDashboard();
    state.cache.quadros.clear();
    await carregarSetores(false);
    const perfilAtual = String(state.usuario?.perfil || '').toLowerCase();
    if (['admin', 'gerente'].includes(perfilAtual)) {
      state.usuarios = await carregarUsuarios();
    }
    if (['colaborador', 'encarregado'].includes(perfilAtual)) {
      await abrirMinhas();
    } else {
      await abrirDashboard(true);
    }
  } catch {
    localStorage.removeItem('mb_token');
    state.token = null;
    showLogin();
  }
}

async function carregarSetores(openFirst = true) {
  state.setores = await api('/api/setores');
  renderSetores();
  if (openFirst && !state.setorAtual && state.setores.length) {
    await abrirSetor(state.setores[0].id);
  } else if (openFirst && state.setorAtual) {
    await abrirSetor(state.setorAtual.id);
  }
}


async function carregarUsuarios(tipo = '') {
  const qs = tipo ? `?tipo=${encodeURIComponent(tipo)}` : '';
  return api(`/api/usuarios${qs}`);
}

function usuarioOptions(tipo = 'tarefas', selectedId = '') {
  const users = (state.usuarios || []).filter(u => {
    if (!u.ativo) return false;
    if (tipo === 'tarefas') return u.pode_receber_tarefas;
    if (tipo === 'os') return u.pode_receber_os;
    return true;
  });

  return ['<option value="">Selecione um responsável</option>']
    .concat(users.map(u => `<option value="${u.id}" ${String(selectedId || '') === String(u.id) ? 'selected' : ''}>${escapeHtml(u.nome)}${u.setor_nome ? ' • ' + escapeHtml(u.setor_nome) : ''}</option>`))
    .join('');
}

function perfilLabel(perfil) {
  return {
    admin: 'Administrador',
    gerente: 'Gerente',
    encarregado: 'Encarregado',
    colaborador: 'Colaborador'
  }[perfil] || perfil || '-';
}

function renderSetores() {
  const nav = $('setoresList');
  nav.innerHTML = '<span class="nav-label">Setores</span>';
  state.setores.forEach(setor => {
    const btn = document.createElement('button');
    btn.className = 'sector-item' + (state.view === 'board' && state.setorAtual?.id === setor.id ? ' active' : '');
    btn.innerHTML = `<span class="color-dot" style="background:${setor.cor}"></span><span>${escapeHtml(setor.nome)}</span>`;
    btn.onclick = () => abrirSetor(setor.id);
    nav.appendChild(btn);
  });
}

async function abrirDashboard(force = false) {
  setView('dashboard');
  state.setorAtual = null;
  renderSetores();
  $('setorTitulo').textContent = 'Dashboard Geral';
  $('setorDescricao').textContent = 'Visão executiva das tarefas, prazos, setores e responsáveis.';

  const qs = new URLSearchParams(state.dashboardFilters).toString();
  const cached = state.cache.dashboard.get(qs);
  if (!force && isFresh(cached)) {
    state.dashboardData = cached.data;
    scheduleRender(() => renderDashboard(cached.data));
    return;
  }

  try {
    setLoading('Carregando dashboard...');
    const request = api(`/api/dashboard?${qs}`);
    state.pending.dashboard = request;
    const data = await request;
    if (state.pending.dashboard !== request) return;
    state.cache.dashboard.set(qs, { data, createdAt: Date.now() });
    state.dashboardData = data;
    scheduleRender(() => renderDashboard(data));
  } finally {
    clearLoading();
  }
}

async function abrirSetor(id, force = false) {
  const key = String(id);
  const cached = state.cache.quadros.get(key);
  if (!force && isFresh(cached)) {
    state.quadro = cached.data;
    state.setorAtual = state.quadro.setor;
    setView('board');
    $('setorTitulo').textContent = state.setorAtual.nome;
    $('setorDescricao').textContent = state.setorAtual.descricao || 'Quadro de tarefas do setor.';
    renderSetores();
    scheduleRender(renderBoard);
    return;
  }

  try {
    setLoading('Carregando setor...');
    const request = api(`/api/setores/${id}/quadro`);
    state.pending.setor = request;
    const data = await request;
    if (state.pending.setor !== request) return;
    state.quadro = data;
    state.setorAtual = state.quadro.setor;
    state.cache.quadros.set(key, { data, createdAt: Date.now() });
    setView('board');
    $('setorTitulo').textContent = state.setorAtual.nome;
    $('setorDescricao').textContent = state.setorAtual.descricao || 'Quadro de tarefas do setor.';
    renderSetores();
    scheduleRender(renderBoard);
  } finally {
    clearLoading();
  }
}

function percent(done, total) {
  if (!total) return 0;
  return Math.round((Number(done || 0) / Number(total || 0)) * 100);
}

function maxValue(items, key) {
  return Math.max(1, ...(items || []).map(item => Number(item[key] || 0)));
}

function isOverdue(item) {
  if (!item.prazo || item.status === 'Feito') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${item.prazo}T00:00:00`);
  return due < today;
}

function quickCount(data, key) {
  return (data.quickLists?.[key] || []).length;
}

function renderDashboard(data) {
  const t = data.totalizadores || {};
  const dashboard = $('dashboard');
  const maxMes = maxValue(data.tarefasPorMes, 'criadas');
  const maxResp = maxValue(data.porResponsavel, 'total');
  const setorOptions = ['<option value="">Todos os setores</option>']
    .concat(state.setores.map(s => `<option value="${s.id}" ${String(state.dashboardFilters.setor_id) === String(s.id) ? 'selected' : ''}>${escapeHtml(s.nome)}</option>`))
    .join('');

  dashboard.innerHTML = `
    <div class="dashboard-toolbar">
      <div>
        <strong>Filtros rápidos</strong>
        <span>Use para enxergar gargalos sem entrar em cada setor.</span>
      </div>
      <div class="dashboard-filters">
        <select id="dashSetor">${setorOptions}</select>
        <input id="dashResponsavel" placeholder="Filtrar responsável" value="${escapeHtml(state.dashboardFilters.responsavel || '')}">
        <select id="dashPeriodo">
          ${[['30', '30 dias'], ['90', '90 dias'], ['180', '180 dias'], ['365', '12 meses']].map(([v, l]) => `<option value="${v}" ${String(state.dashboardFilters.periodo) === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button onclick="aplicarFiltrosDashboard()">Aplicar</button>
        <button onclick="limparFiltrosDashboard()">Limpar</button>
      </div>
    </div>

    <div class="quick-grid">
      <button onclick="abrirListaRapida('atrasadas')"><strong>${t.atrasadas || 0}</strong><span>Atrasadas</span></button>
      <button onclick="abrirListaRapida('hoje')"><strong>${t.vencem_hoje || 0}</strong><span>Vencem hoje</span></button>
      <button onclick="abrirListaRapida('semana')"><strong>${t.proximos_7_dias || 0}</strong><span>Próx. 7 dias</span></button>
      <button onclick="abrirListaRapida('alta')"><strong>${quickCount(data, 'alta')}</strong><span>Alta prioridade</span></button>
      <button onclick="abrirListaRapida('semResponsavel')"><strong>${quickCount(data, 'semResponsavel')}</strong><span>Sem responsável</span></button>
    </div>

    <div class="kpi-grid v2">
      <div class="kpi-card"><span>Total de tarefas</span><strong>${t.total || 0}</strong><small>Todos os setores filtrados</small></div>
      <div class="kpi-card"><span>Em aberto</span><strong>${t.abertas || 0}</strong><small>Pendentes de execução</small></div>
      <div class="kpi-card danger"><span>Atrasadas</span><strong>${t.atrasadas || 0}</strong><small>Prazo vencido</small></div>
      <div class="kpi-card success"><span>Conclusão geral</span><strong>${t.taxa_conclusao || 0}%</strong><small>${t.concluidas || 0} concluídas</small></div>
      <div class="kpi-card success"><span>Concluídas na semana</span><strong>${t.concluidas_semana || 0}</strong><small>Entregas recentes</small></div>
    </div>

    <div class="dash-grid">
      <section class="dash-panel wide">
        <div class="panel-head"><h2>Tarefas por mês</h2><button onclick="window.print()">🖨️ Imprimir</button></div>
        <div class="month-chart">
          ${(data.tarefasPorMes || []).map(m => {
    const h = Math.max(8, Math.round((Number(m.criadas || 0) / maxMes) * 100));
    const doneH = Math.max(4, Math.round((Number(m.concluidas || 0) / maxMes) * 100));
    const label = String(m.mes || '').split('-').reverse().join('/');
    return `<div class="month-col" title="${label}: ${m.criadas} criadas, ${m.concluidas} concluídas">
              <div class="month-bars"><span style="height:${h}%"></span><i style="height:${doneH}%"></i></div>
              <small>${label}</small>
            </div>`;
  }).join('') || '<p class="empty">Sem dados no período selecionado.</p>'}
        </div>
        <div class="chart-legend"><span>Criadas</span><span>Concluídas</span></div>
      </section>

      <section class="dash-panel wide">
        <h2>Produtividade por setor</h2>
        <div class="bar-list">
          ${(data.porSetor || []).map(s => {
    const p = Number(s.taxa_conclusao || percent(s.concluidas, s.total));
    return `<div class="bar-row" onclick="abrirSetor(${s.id})">
              <div class="bar-info"><strong>${escapeHtml(s.nome)}</strong><span>${s.total || 0} total • ${s.abertas || 0} abertas • ${s.atrasadas || 0} atrasadas • ${p}% concluído</span></div>
              <div class="bar-track"><div style="width:${p}%; background:${s.cor || '#2563eb'}"></div></div>
            </div>`;
  }).join('') || '<p class="empty">Nenhum setor com tarefas ainda.</p>'}
        </div>
      </section>

      <section class="dash-panel">
        <h2>Status das tarefas</h2>
        <div class="status-list">
          ${(data.porStatus || []).map(s => `<div><span class="badge ${statusClass(s.status)}">${escapeHtml(s.status)}</span><strong>${s.total}</strong></div>`).join('') || '<p class="empty">Sem tarefas cadastradas.</p>'}
        </div>
      </section>

      <section class="dash-panel">
        <h2>Produtividade por responsável</h2>
        <div class="responsavel-list">
          ${(data.porResponsavel || []).map(r => {
    const p = Number(r.taxa_conclusao || 0);
    return `<div class="resp-row">
              <div><strong>${escapeHtml(r.responsavel)}</strong><span>${r.total} total • ${r.abertas} abertas • ${r.atrasadas} atrasadas</span></div>
              <b>${p}%</b>
              <div class="mini-track"><i style="width:${p}%"></i></div>
            </div>`;
  }).join('') || '<p class="empty">Sem responsáveis informados.</p>'}
        </div>
      </section>

      <section class="dash-panel wide">
        <h2>Calendário do mês</h2>
        ${renderCalendar(data.calendario || [])}
      </section>

      <section class="dash-panel wide">
        <h2>Próximos vencimentos</h2>
        ${renderTaskTable(data.proximosPrazos || [], true)}
      </section>

      <section class="dash-panel wide">
        <h2>Últimas movimentações</h2>
        <table class="dash-table">
          <thead><tr><th>Tarefa</th><th>Setor</th><th>Grupo</th><th>Responsável</th><th>Status</th><th>Atualização</th></tr></thead>
          <tbody>
            ${(data.ultimasAtividades || []).map(item => `<tr>
              <td>${escapeHtml(item.titulo)}</td>
              <td>${escapeHtml(item.setor)}</td>
              <td>${escapeHtml(item.grupo)}</td>
              <td>${escapeHtml(item.responsavel || '-')}</td>
              <td><span class="badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
              <td>${fmtDateTime(item.atualizado_em)}</td>
            </tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhuma movimentação.</td></tr>'}
          </tbody>
        </table>
      </section>
    </div>
  `;
}

function renderTaskTable(items, showStatus = false) {
  return `<table class="dash-table">
    <thead><tr><th>Tarefa</th><th>Setor</th><th>Grupo</th><th>Responsável</th><th>Prioridade</th><th>Prazo</th>${showStatus ? '<th>Status</th>' : ''}</tr></thead>
    <tbody>
      ${items.map(item => `<tr class="${isOverdue(item) ? 'overdue-row' : ''}">
        <td>${escapeHtml(item.titulo)}</td>
        <td>${escapeHtml(item.setor)}</td>
        <td>${escapeHtml(item.grupo || '-')}</td>
        <td>${escapeHtml(item.responsavel || '-')}</td>
        <td><span class="badge ${priorityClass(item.prioridade)}">${escapeHtml(item.prioridade)}</span></td>
        <td>${fmtDate(item.prazo)}</td>
        ${showStatus ? `<td><span class="badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>` : ''}
      </tr>`).join('') || `<tr><td colspan="${showStatus ? 7 : 6}" class="empty">Nenhuma tarefa encontrada.</td></tr>`}
    </tbody>
  </table>`;
}

function renderCalendar(items) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startWeekDay = first.getDay();
  const byDay = {};

  items.forEach(item => {
    const day = Number(String(item.prazo || '').split('-')[2]);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(item);
  });

  const cells = [];
  for (let i = 0; i < startWeekDay; i++) cells.push('<div class="cal-cell muted"></div>');
  for (let day = 1; day <= last.getDate(); day++) {
    const dayItems = byDay[day] || [];
    cells.push(`<div class="cal-cell ${day === now.getDate() ? 'today' : ''}">
      <strong>${day}</strong>
      ${dayItems.slice(0, 3).map(item => `<span class="cal-task ${isOverdue(item) ? 'late' : ''}" title="${escapeHtml(item.titulo)}">${escapeHtml(item.titulo)}</span>`).join('')}
      ${dayItems.length > 3 ? `<small>+${dayItems.length - 3} tarefas</small>` : ''}
    </div>`);
  }

  return `<div class="calendar-wrap">
    <div class="calendar-week"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div>
    <div class="calendar-grid">${cells.join('')}</div>
  </div>`;
}

function renderBoard() {
  const board = $('board');
  const busca = $('busca').value.toLowerCase().trim();
  const filtroStatus = $('filtroStatus').value;
  board.innerHTML = '';

  if (!state.quadro) return;

  state.quadro.grupos.forEach(grupo => {
    const tarefas = grupo.tarefas.filter(t => {
      const matchBusca = !busca || [t.titulo, t.responsavel, t.observacoes].join(' ').toLowerCase().includes(busca);
      const matchStatus = !filtroStatus || t.status === filtroStatus;
      const matchPeriodo = taskMatchesPeriod(t, $('filtroPeriodo')?.value || 'todos');
      return matchBusca && matchStatus && matchPeriodo;
    });

    const div = document.createElement('div');
    div.className = 'group';
    div.innerHTML = `
      <div class="group-title">
        <div class="group-title-left">
          <span class="group-bar" style="background:${grupo.cor}"></span>
          <span>${escapeHtml(grupo.nome)}</span>
          <small>(${tarefas.length})</small>
        </div>
        <div class="group-actions">
          <button onclick="imprimirGrupoPdf(${grupo.id})">📄 PDF do grupo</button>
          <button onclick="editarGrupo(${grupo.id})">Editar grupo</button>
          <button onclick="excluirGrupo(${grupo.id})">Excluir grupo</button>
          <button class="primary" onclick="novaTarefa(${grupo.id})">+ Tarefa</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:310px">Tarefa</th>
            <th style="width:150px">Responsável</th>
            <th style="width:150px">Status</th>
            <th style="width:120px">Prioridade</th>
            <th style="width:120px">Prazo</th>
            <th style="width:190px">Cronograma</th>
            <th>Observações</th>
            <th style="width:130px">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${tarefas.length ? tarefas.map(t => `
            <tr>
              <td><span class="task-title" onclick="verTarefa(${t.id})">${escapeHtml(t.titulo)}</span></td>
              <td>${escapeHtml(t.responsavel_nome || t.responsavel || '-')}</td>
              <td><span class="badge ${statusClass(t.status)}">${escapeHtml(t.status)}</span></td>
              <td><span class="badge ${priorityClass(t.prioridade)}">${escapeHtml(t.prioridade)}</span></td>
              <td>${fmtDate(t.prazo)}</td>
              <td>${fmtDate(t.cronograma_inicio)} até ${fmtDate(t.cronograma_fim)}</td>
              <td>${escapeHtml(t.observacoes || '')}</td>
              <td>
                <div class="task-actions">
                  <button title="Editar" onclick="editarTarefa(${t.id})">✏️</button>
                  <button title="Excluir" class="danger" onclick="excluirTarefa(${t.id})">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('') : '<tr><td colspan="8" class="empty">Nenhuma tarefa cadastrada neste grupo.</td></tr>'}
        </tbody>
      </table>
      <button class="add-task-line" onclick="novaTarefa(${grupo.id})">+ Adicionar tarefa</button>
    `;
    board.appendChild(div);
  });
}

function openModal(title, body) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = body;
  $('modal').classList.remove('hidden');
}

function closeModal() {
  $('modal').classList.add('hidden');
}

function setorForm(setor = {}) {
  openModal(setor.id ? 'Editar setor' : 'Novo setor', `
    <form id="setorForm">
      <label>Nome do setor/quadro</label>
      <input name="nome" value="${escapeHtml(setor.nome || '')}" required>
      <label>Descrição</label>
      <textarea name="descricao">${escapeHtml(setor.descricao || '')}</textarea>
      <label>Cor</label>
      <input name="cor" type="color" value="${setor.cor || '#2563eb'}">
      <div class="modal-actions">
        <button type="button" onclick="closeModal()">Cancelar</button>
        <button class="primary" type="submit">Salvar</button>
      </div>
    </form>
  `);
  $('setorForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (setor.id) await api(`/api/setores/${setor.id}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/setores', { method: 'POST', body: JSON.stringify(data) });
    closeModal();
    invalidateDashboard();
    state.cache.quadros.clear();
    await carregarSetores(false);
    await abrirDashboard(true);
  };
}

function grupoForm(grupo = {}) {
  if (!state.setorAtual) return alert('Selecione um setor primeiro.');
  openModal(grupo.id ? 'Editar grupo' : 'Novo grupo', `
    <form id="grupoForm">
      <label>Nome do grupo</label>
      <input name="nome" value="${escapeHtml(grupo.nome || '')}" required>
      <label>Cor</label>
      <input name="cor" type="color" value="${grupo.cor || '#2563eb'}">
      <div class="modal-actions">
        <button type="button" onclick="closeModal()">Cancelar</button>
        <button class="primary" type="submit">Salvar</button>
      </div>
    </form>
  `);
  $('grupoForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (grupo.id) await api(`/api/grupos/${grupo.id}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/grupos', { method: 'POST', body: JSON.stringify({ ...data, setor_id: state.setorAtual.id }) });
    closeModal();
    invalidateSetor(state.setorAtual.id);
    await abrirSetor(state.setorAtual.id, true);
  };
}

function tarefaForm(tarefa = {}, grupoId = null) {
  if (!state.quadro) return alert('Selecione um setor primeiro.');
  const gruposOptions = state.quadro.grupos.map(g => `<option value="${g.id}" ${(tarefa.grupo_id || grupoId) == g.id ? 'selected' : ''}>${escapeHtml(g.nome)}</option>`).join('');
  const responsavelOptions = usuarioOptions('tarefas', tarefa.responsavel_id || '');
  openModal(tarefa.id ? 'Editar tarefa' : 'Nova tarefa', `
    <form id="tarefaForm">
      <div class="form-grid">
        <div class="full">
          <label>Tarefa</label>
          <input name="titulo" value="${escapeHtml(tarefa.titulo || '')}" required>
        </div>
        <div><label>Grupo</label><select name="grupo_id">${gruposOptions}</select></div>
        <div><label>Responsável</label><select name="responsavel_id" required>${responsavelOptions}</select></div>
        <div><label>Status</label><select name="status">${['Não iniciado', 'Em andamento', 'Parado', 'Feito'].map(s => `<option ${tarefa.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div><label>Prioridade</label><select name="prioridade">${['Baixa', 'Média', 'Alta'].map(p => `<option ${tarefa.prioridade === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div><label>Prazo</label><input name="prazo" type="date" value="${tarefa.prazo || ''}"></div>
        <div><label>Início cronograma</label><input name="cronograma_inicio" type="date" value="${tarefa.cronograma_inicio || ''}"></div>
        <div><label>Fim cronograma</label><input name="cronograma_fim" type="date" value="${tarefa.cronograma_fim || ''}"></div>
        <div class="full"><label>Observações</label><textarea name="observacoes">${escapeHtml(tarefa.observacoes || '')}</textarea></div>
      </div>
      <div class="modal-actions">
        <button type="button" onclick="closeModal()">Cancelar</button>
        <button class="primary" type="submit">Salvar</button>
      </div>
    </form>
  `);
  $('tarefaForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (tarefa.id) await api(`/api/tarefas/${tarefa.id}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/tarefas', { method: 'POST', body: JSON.stringify(data) });
    closeModal();
    invalidateSetor(state.setorAtual.id);
    await abrirSetor(state.setorAtual.id, true);
  };
}

window.excluirSetorAtual = async () => {
  if (!state.setorAtual) {
    return alert('Nenhum setor selecionado.');
  }

  const setor = state.setorAtual;

  const confirmar = confirm(
    `Deseja realmente excluir o setor "${setor.nome}"?\n\n` +
    `ATENÇÃO: todos os grupos e tarefas deste setor também serão excluídos.\n\n` +
    `Esta ação não poderá ser desfeita.`
  );

  if (!confirmar) return;

  try {
    setLoading('Excluindo setor...');

    await api(`/api/setores/${setor.id}`, {
      method: 'DELETE'
    });

    state.cache.quadros.delete(String(setor.id));

    state.setorAtual = null;
    state.quadro = null;

    invalidateDashboard();

    await carregarSetores(false);
    await abrirDashboard(true);

  } catch (err) {
    alert(`Erro ao excluir setor: ${err.message}`);
  } finally {
    clearLoading();
  }
};

window.abrirSetor = abrirSetor;
window.imprimirGrupoPdf = (id) => {
  if (!state.token) return alert('Sessão expirada. Faça login novamente.');
  const url = `/api/grupos/${id}/relatorio-pdf?${currentBoardPdfParams()}`;
  window.open(url, '_blank');
};

window.imprimirSetorPdf = () => {
  if (!state.token) return alert('Sessão expirada. Faça login novamente.');
  if (!state.setorAtual?.id) return alert('Selecione um setor primeiro.');
  const url = `/api/setores/${state.setorAtual.id}/relatorio-pdf?${currentBoardPdfParams()}`;
  window.open(url, '_blank');
};

window.editarGrupo = (id) => grupoForm(state.quadro.grupos.find(g => g.id === id));
window.excluirGrupo = async (id) => {
  if (!confirm('Excluir este grupo e todas as tarefas dentro dele?')) return;
  await api(`/api/grupos/${id}`, { method: 'DELETE' });
  invalidateSetor(state.setorAtual.id);
  await abrirSetor(state.setorAtual.id, true);
};
window.novaTarefa = (grupoId) => tarefaForm({}, grupoId);
window.editarTarefa = (id) => {
  const tarefa = state.quadro.grupos.flatMap(g => g.tarefas).find(t => t.id === id);
  tarefaForm(tarefa);
};
window.excluirTarefa = async (id) => {
  if (!confirm('Excluir esta tarefa?')) return;
  await api(`/api/tarefas/${id}`, { method: 'DELETE' });
  invalidateSetor(state.setorAtual.id);
  await abrirSetor(state.setorAtual.id, true);
};
window.verTarefa = async (id) => {
  const tarefa = state.quadro.grupos.flatMap(g => g.tarefas).find(t => t.id === id);
  const comentarios = await api(`/api/tarefas/${id}/comentarios`);
  openModal('Detalhes da tarefa', `
    <h3>${escapeHtml(tarefa.titulo)}</h3>
    <p><strong>Status:</strong> ${escapeHtml(tarefa.status)} | <strong>Responsável:</strong> ${escapeHtml(tarefa.responsavel || '-')} | <strong>Prazo:</strong> ${fmtDate(tarefa.prazo)}</p>
    <p>${escapeHtml(tarefa.observacoes || 'Sem observações.')}</p>
    <div class="comments">
      <h3>Comentários</h3>
      <form id="commentForm">
        <textarea name="comentario" placeholder="Adicionar comentário..." required></textarea>
        <div class="modal-actions"><button class="primary" type="submit">Comentar</button></div>
      </form>
      <div id="commentsList">${comentarios.map(c => `<div class="comment"><strong>${escapeHtml(c.usuario_nome || 'Usuário')}</strong><br><small>${fmtDateTime(c.criado_em)}</small><p>${escapeHtml(c.comentario)}</p></div>`).join('')}</div>
    </div>
  `);
  $('commentForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await api(`/api/tarefas/${id}/comentarios`, { method: 'POST', body: JSON.stringify(data) });
    invalidateSetor(state.setorAtual?.id);
    window.verTarefa(id);
  };
};


window.aplicarFiltrosDashboard = async () => {
  state.dashboardFilters = {
    setor_id: $('dashSetor')?.value || '',
    responsavel: $('dashResponsavel')?.value || '',
    periodo: $('dashPeriodo')?.value || '90'
  };
  await abrirDashboard(true);
};

window.limparFiltrosDashboard = async () => {
  state.dashboardFilters = { periodo: '90', setor_id: '', responsavel: '' };
  await abrirDashboard(true);
};

window.abrirListaRapida = (tipo) => {
  const labels = {
    atrasadas: 'Tarefas atrasadas',
    hoje: 'Tarefas que vencem hoje',
    semana: 'Tarefas dos próximos 7 dias',
    alta: 'Tarefas de alta prioridade',
    semResponsavel: 'Tarefas sem responsável'
  };
  const items = state.dashboardData?.quickLists?.[tipo] || [];
  openModal(labels[tipo] || 'Tarefas', `
    <div class="modal-report-head">
      <p>${items.length} tarefa(s) encontrada(s).</p>
      <button onclick="window.print()">🖨️ Imprimir</button>
    </div>
    ${renderTaskTable(items, true)}
  `);
};


// =========================
// Módulo Ordem de Serviço Operacional
// =========================
const OS_STATUS = ['Recebido', 'Em análise', 'Aguardando mão de obra', 'Aguardando material', 'Em execução', 'Pausado', 'Concluído', 'Cancelado'];
const OS_PRIORIDADES = ['Urgente', 'Alta', 'Média', 'Baixa'];
const OS_CATEGORIAS = ['Elétrica', 'Hidráulica', 'Pintura', 'Estrutura', 'Equipamento', 'Limpeza/apoio', 'Outros'];

function minutesLabel(min) {
  const n = Number(min || 0);
  if (!n) return '-';
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h${m ? ` ${m}min` : ''}` : `${m}min`;
}

function dateTimeInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function osStatusClass(status) {
  return 'os-' + String(status || 'recebido').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll(' ', '-').replaceAll('/', '-');
}

async function abrirOS() {
  setView('os');
  state.setorAtual = null;
  renderSetores();
  $('setorTitulo').textContent = 'Ordem de Serviço Operacional';
  $('setorDescricao').textContent = 'Recepção, priorização, mão de obra, execução, pendências e conclusão dos chamados rápidos.';
  await carregarOS();
}

async function carregarOS() {
  try {
    setLoading('Carregando ordens de serviço...');
    const qs = new URLSearchParams(state.osFilters).toString();
    const data = await api(`/api/os/dashboard?${qs}`);
    state.osData = data;
    renderOS(data);
  } finally {
    clearLoading();
  }
}

function renderOS(data) {
  const t = data.totalizadores || {};
  const panel = $('osPanel');
  const statusOptions = ['<option value="">Todos os status</option>'].concat(OS_STATUS.map(s => `<option value="${s}" ${state.osFilters.status === s ? 'selected' : ''}>${s}</option>`)).join('');
  const prioridadeOptions = ['<option value="">Todas prioridades</option>'].concat(OS_PRIORIDADES.map(p => `<option value="${p}" ${state.osFilters.prioridade === p ? 'selected' : ''}>${p}</option>`)).join('');

  panel.innerHTML = `
    <div class="os-toolbar">
      <div>
        <strong>Painel de chamados rápidos</strong>
        <span>Controle operacional para manutenção, estrutura, elétrica, hidráulica e demandas urgentes.</span>
      </div>
      <div class="os-actions">
        <button onclick="imprimirOSAndamentoPdf('all')">📄 PDF andamento</button>
        <button onclick="imprimirOSAndamentoPdf('hoje')">📅 Hoje</button>
        <button onclick="imprimirOSAndamentoPdf('all')">📌 Todas</button>
        <button class="primary" onclick="osForm()">+ Nova OS</button>
      </div>
    </div>

    <div class="os-kpis">
      <div><span>Abertas</span><strong>${t.abertas || 0}</strong></div>
      <div class="danger"><span>Urgentes</span><strong>${t.urgentes || 0}</strong></div>
      <div><span>Recebidas</span><strong>${t.recebidas || 0}</strong></div>
      <div><span>Em execução</span><strong>${t.em_execucao || 0}</strong></div>
      <div><span>Pendentes</span><strong>${t.pendentes || 0}</strong></div>
      <div class="success"><span>Concluídas</span><strong>${t.concluidas || 0}</strong></div>
    </div>

    <div class="os-filters">
      <input id="osBusca" placeholder="Buscar OS, local, solicitante..." value="${escapeHtml(state.osFilters.busca || '')}">
      <select id="osStatus">${statusOptions}</select>
      <select id="osPrioridade">${prioridadeOptions}</select>
      <input id="osResponsavel" placeholder="Responsável" value="${escapeHtml(state.osFilters.responsavel || '')}">
      <button onclick="aplicarFiltrosOS()">Aplicar</button>
      <button onclick="limparFiltrosOS()">Limpar</button>
    </div>

    <div class="os-board">
      ${renderOSColumn('Recebidos', (data.recentes || []).filter(o => ['Recebido', 'Em análise'].includes(o.status)))}
      ${renderOSColumn('Em execução', (data.recentes || []).filter(o => o.status === 'Em execução'))}
      ${renderOSColumn('Pendências', (data.recentes || []).filter(o => ['Aguardando mão de obra', 'Aguardando material', 'Pausado'].includes(o.status)))}
      ${renderOSColumn('Concluídos/Cancelados', (data.recentes || []).filter(o => ['Concluído', 'Cancelado'].includes(o.status)))}
    </div>

    <div class="dash-grid os-bottom">
      <section class="dash-panel"><h2>Por status</h2><div class="status-list">${(data.porStatus || []).map(s => `<div><span class="badge ${osStatusClass(s.status)}">${escapeHtml(s.status)}</span><strong>${s.total}</strong></div>`).join('') || '<p class="empty">Sem dados.</p>'}</div></section>
      <section class="dash-panel"><h2>Por responsável</h2><div class="responsavel-list">${(data.porResponsavel || []).map(r => `<div class="resp-row"><div><strong>${escapeHtml(r.responsavel)}</strong><span>${r.total} total • ${r.abertas} abertas • ${r.concluidas} concluídas</span></div></div>`).join('') || '<p class="empty">Sem responsáveis.</p>'}</div></section>
    </div>
  `;
}

const OS_PAGE_SIZE = 5;

function getOSPageKey(title) {
  const t = String(title || '').toLowerCase();

  if (t.includes('receb')) return 'recebidos';
  if (t.includes('exec')) return 'execucao';
  if (t.includes('pend')) return 'pendencias';
  if (t.includes('concl')) return 'concluidos';

  return 'recebidos';
}

function renderOSColumn(title, items) {
  const pageKey = getOSPageKey(title);
  const currentPage = state.osPages?.[pageKey] || 1;
  const totalPages = Math.max(1, Math.ceil(items.length / OS_PAGE_SIZE));

  const safePage = Math.min(currentPage, totalPages);
  state.osPages[pageKey] = safePage;

  const start = (safePage - 1) * OS_PAGE_SIZE;
  const pageItems = items.slice(start, start + OS_PAGE_SIZE);

  return `
    <section class="os-column">
      <h3>${title} <small>${items.length}</small></h3>

      ${pageItems.map(renderOSCard).join('') || '<p class="empty">Nenhuma OS aqui.</p>'}

      ${items.length > OS_PAGE_SIZE ? `
        <div class="os-pagination">
          <button onclick="mudarPaginaOS('${pageKey}', -1)" ${safePage <= 1 ? 'disabled' : ''}>‹</button>
          <span>${safePage} / ${totalPages}</span>
          <button onclick="mudarPaginaOS('${pageKey}', 1)" ${safePage >= totalPages ? 'disabled' : ''}>›</button>
        </div>
      ` : ''}
    </section>
  `;
}

window.mudarPaginaOS = (pageKey, direction) => {
  state.osPages[pageKey] = Math.max(1, (state.osPages[pageKey] || 1) + direction);
  renderOS(state.osData);
};

function renderOSCard(o) {
  return `<article class="os-card ${o.prioridade === 'Urgente' ? 'urgent' : ''}" onclick="verOS(${o.id})">
    <div class="os-card-head"><strong>${escapeHtml(o.numero || `OS-${o.id}`)}</strong><span class="badge ${priorityClass(o.prioridade)}">${escapeHtml(o.prioridade)}</span></div>
    <h4>${escapeHtml(o.titulo)}</h4>
    <p>${escapeHtml(o.setor_local || 'Local não informado')}</p>
    <div class="os-meta"><span>Resp.: ${escapeHtml(o.responsavel_nome || o.responsavel_principal || 'Sem responsável')}</span><span>M.O.: ${o.quantidade_mao_obra || 1}</span></div>
    <div class="os-meta"><span>Estimado: ${minutesLabel(o.tempo_estimado_min)}</span><span>Real: ${minutesLabel(o.tempo_real_min)}</span></div>
    ${o.pendencias ? `<small class="os-pendency">Pendência: ${escapeHtml(o.pendencias)}</small>` : ''}
    <div class="os-card-actions" onclick="event.stopPropagation()">
      <select onchange="alterarStatusOS(${o.id}, this)">${OS_STATUS.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <button onclick="editarOS(${o.id})">Editar</button>
    </div>
  </article>`;
}

function osForm(os = {}) {
  const statusOptions = OS_STATUS.map(s => `<option value="${s}" ${os.status === s ? 'selected' : ''}>${s}</option>`).join('');
  const prioridadeOptions = OS_PRIORIDADES.map(p => `<option value="${p}" ${os.prioridade === p ? 'selected' : ''}>${p}</option>`).join('');
  const categoriaOptions = OS_CATEGORIAS.map(c => `<option value="${c}" ${os.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
  const responsavelOsOptions = usuarioOptions('os', os.responsavel_principal_id || '');

  openModal(os.id ? `Editar ${escapeHtml(os.numero || 'OS')}` : 'Nova Ordem de Serviço', `
    <form id="osForm">
      <div class="form-grid">
        <div class="full"><label>Título do chamado</label><input name="titulo" value="${escapeHtml(os.titulo || '')}" required></div>
        <div><label>Solicitante</label><input name="solicitante" value="${escapeHtml(os.solicitante || '')}"></div>
        <div><label>Setor/local</label><input name="setor_local" value="${escapeHtml(os.setor_local || '')}"></div>
        <div><label>Categoria</label><select name="categoria">${categoriaOptions}</select></div>
        <div><label>Prioridade</label><select name="prioridade">${prioridadeOptions}</select></div>
        <div><label>Status</label><select name="status">${statusOptions}</select></div>
        <div><label>Impacto na operação</label><input name="impacto" value="${escapeHtml(os.impacto || '')}"></div>
        <div><label>Responsável principal</label><select name="responsavel_principal_id">${responsavelOsOptions}</select></div>
        <div class="full"><label>Funcionários envolvidos</label><input name="funcionarios" value="${escapeHtml(os.funcionarios || '')}"></div>
        <div><label>Qtd. mão de obra</label><input name="quantidade_mao_obra" type="number" min="1" value="${os.quantidade_mao_obra || 1}"></div>
        <div><label>Tempo estimado (min)</label><input name="tempo_estimado_min" type="number" min="0" value="${os.tempo_estimado_min || 0}"></div>
        <div><label>Tempo real (min)</label><input name="tempo_real_min" type="number" min="0" value="${os.tempo_real_min || 0}"></div>
        <div><label>Previsão de conclusão</label><input name="previsao_conclusao" type="datetime-local" value="${dateTimeInputValue(os.previsao_conclusao)}"></div>
        <div class="full"><label>Descrição do chamado</label><textarea name="descricao">${escapeHtml(os.descricao || '')}</textarea></div>
        <div class="full"><label>Material necessário</label><textarea name="material_necessario">${escapeHtml(os.material_necessario || '')}</textarea></div>
        <div class="full"><label>Como está sendo executado</label><textarea name="execucao">${escapeHtml(os.execucao || '')}</textarea></div>
        <div class="full"><label>Pendências</label><textarea name="pendencias">${escapeHtml(os.pendencias || '')}</textarea></div>
        <div class="full"><label>Material utilizado</label><textarea name="material_utilizado">${escapeHtml(os.material_utilizado || '')}</textarea></div>
        <div class="full"><label>Observação de conclusão</label><textarea name="observacao_conclusao">${escapeHtml(os.observacao_conclusao || '')}</textarea></div>
      </div>
      <div class="modal-actions">
        <button type="button" onclick="closeModal()">Cancelar</button>
        ${os.id ? `<button type="button" class="danger" onclick="excluirOSConfirmada(${os.id})">Excluir</button>` : ''}
        <button class="primary" type="submit">Salvar OS</button>
      </div>
    </form>
  `);

  $('osForm').onsubmit = async (e) => {
    e.preventDefault();

    const btn = e.target.querySelector('button[type="submit"]');

    try {
      const data = Object.fromEntries(new FormData(e.target));

      data.quantidade_mao_obra = data.quantidade_mao_obra ? Number(data.quantidade_mao_obra) : 1;
      data.tempo_estimado_min = data.tempo_estimado_min ? Number(data.tempo_estimado_min) : 0;
      data.tempo_real_min = data.tempo_real_min ? Number(data.tempo_real_min) : 0;
      data.previsao_conclusao = data.previsao_conclusao || null;

      btn.disabled = true;
      btn.textContent = 'Salvando...';

      if (os.id) {
        await api(`/api/os/${os.id}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });
      } else {
        await api('/api/os', {
          method: 'POST',
          body: JSON.stringify(data)
        });
      }

      closeModal();
      await carregarOS();
    } catch (err) {
      alert(`Erro ao salvar OS: ${err.message}`);
      btn.disabled = false;
      btn.textContent = 'Salvar OS';
    }
  };
}


function renderDescricaoOS(descricao = '') {
  const texto = String(descricao || '').trim();

  if (!texto) {
    return '<p><strong>Descrição:</strong><br>Sem descrição.</p>';
  }

  const textoFormatado = escapeHtml(texto)
    .replace(
      /\s*Serviço solicitado:/gi,
      '<br><br><strong>Serviço solicitado:</strong><br>'
    )
    .replace(
      /\s*Material\/observação:/gi,
      '<br><br><strong>Material/observação:</strong><br>'
    )
    .replace(
      /\s*Local exato informado:/gi,
      '<br><br><strong>Local exato:</strong><br>'
    )
    .replace(
      /\s*Impacto informado:/gi,
      '<br><br><strong>Impacto:</strong><br>'
    );

  return `
    <div class="os-desc-box">
      <p>
        <strong>Descrição:</strong><br>
        ${textoFormatado}
      </p>
    </div>
  `;
}



window.verOS = (id) => {
  const os = state.osData?.recentes?.find(o => o.id === id);
  if (!os) return;
  openModal(`${escapeHtml(os.numero || 'OS')} - Detalhes`, `
    <div class="os-detail">
      <h3>${escapeHtml(os.titulo)}</h3>
      <p><strong>Status:</strong> ${escapeHtml(os.status)} | <strong>Prioridade:</strong> ${escapeHtml(os.prioridade)} | <strong>Local:</strong> ${escapeHtml(os.setor_local || '-')}</p>
      <p><strong>Responsável:</strong> ${escapeHtml(os.responsavel_nome || os.responsavel_principal || '-')} | <strong>Equipe:</strong> ${escapeHtml(os.funcionarios || '-')} | <strong>M.O.:</strong> ${os.quantidade_mao_obra || 1}</p>
      <p><strong>Tempo:</strong> estimado ${minutesLabel(os.tempo_estimado_min)} / real ${minutesLabel(os.tempo_real_min)}</p>
      <hr>
      ${renderDescricaoOS(os.descricao)}
      <p><strong>Execução:</strong><br>${escapeHtml(os.execucao || '-')}</p>
      <p><strong>Pendências:</strong><br>${escapeHtml(os.pendencias || '-')}</p>
      <p><strong>Material necessário:</strong><br>${escapeHtml(os.material_necessario || '-')}</p>
      <p><strong>Conclusão:</strong><br>${escapeHtml(os.observacao_conclusao || '-')}</p>
      <div class="modal-actions"><button onclick="editarOS(${os.id})">Editar OS</button></div>
    </div>
  `);
};

window.editarOS = (id) => {
  const os = state.osData?.recentes?.find(o => o.id === id);
  if (os) osForm(os);
};

window.alterarStatusOS = async (id, select) => {

  const status = select.value;

  select.disabled = true;

  const corOriginal = select.style.background;
  const textoOriginal = select.value;

  try {

    select.style.background = "#fff7ed";

    await api(`/api/os/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status
      })
    });

    select.style.background = "#dcfce7";

    setTimeout(() => {
      carregarOS();
    }, 250);

  } catch (err) {

    alert(err.message);

    select.value = textoOriginal;
    select.style.background = "#fee2e2";

    setTimeout(() => {
      select.style.background = corOriginal;
    }, 1000);

  } finally {

    setTimeout(() => {
      select.disabled = false;
    }, 250);

  }

};

window.excluirOSConfirmada = async (id) => {
  if (!confirm('Excluir esta Ordem de Serviço?')) return;
  await api(`/api/os/${id}`, { method: 'DELETE' });
  closeModal();
  await carregarOS();
};

window.aplicarFiltrosOS = async () => {
  state.osFilters = {
    busca: $('osBusca')?.value || '',
    status: $('osStatus')?.value || '',
    prioridade: $('osPrioridade')?.value || '',
    responsavel: $('osResponsavel')?.value || '',
    periodo: '30'
  };
  state.osPages = {
    recebidos: 1,
    execucao: 1,
    pendencias: 1,
    concluidos: 1
  };
  await carregarOS();
};

window.limparFiltrosOS = async () => {
  state.osFilters = {
    busca: '',
    status: '',
    prioridade: '',
    responsavel: '',
    periodo: '30'
  };

  state.osPages = {
    recebidos: 1,
    execucao: 1,
    pendencias: 1,
    concluidos: 1
  };

  await carregarOS();
};

window.imprimirOSPdf = () => {
  if (!state.token) return alert('Sessão expirada. Faça login novamente.');
  window.open(`/api/os/relatorio-pdf?token=${state.token}`, '_blank');
};

window.imprimirOSAndamentoPdf = (range = 'all') => {
  if (!state.token) return alert('Sessão expirada. Faça login novamente.');

  const params = new URLSearchParams();
  params.set('token', state.token);
  params.set('range', range);

  const busca = $('osBusca')?.value?.trim() || state.osFilters.busca || '';
  const prioridade = $('osPrioridade')?.value || state.osFilters.prioridade || '';
  const responsavel = $('osResponsavel')?.value?.trim() || state.osFilters.responsavel || '';

  if (busca) params.set('busca', busca);
  if (prioridade) params.set('prioridade', prioridade);
  if (responsavel) params.set('responsavel', responsavel);

  window.open(`/api/os/relatorio-andamento-pdf?${params.toString()}`, '_blank');
};


async function abrirMinhas() {
  setView('minhas');
  state.setorAtual = null;
  renderSetores();
  $('setorTitulo').textContent = 'Minhas tarefas e OS';
  $('setorDescricao').textContent = 'Acompanhamento individual do colaborador logado.';

  const [tarefas, os] = await Promise.all([
    api('/api/minhas-tarefas'),
    api('/api/minhas-os')
  ]);

  state.minhasData = { tarefas, os };
  renderMinhas();
}

function renderMinhas() {
  const panel = $('minhasPanel');
  const tarefas = state.minhasData?.tarefas || [];
  const ordens = state.minhasData?.os || [];

  panel.innerHTML = `
    <div class="dashboard-toolbar">
      <div>
        <strong>Minha área</strong>
        <span>Você vê apenas as tarefas e OS vinculadas ao seu usuário.</span>
      </div>
    </div>

    <div class="dash-grid">
      <section class="dash-panel wide">
        <h2>Minhas tarefas (${tarefas.length})</h2>
        <div class="mine-list">
          ${tarefas.map(t => `
            <article class="mine-card">
              <div><strong>${escapeHtml(t.titulo)}</strong><span>${escapeHtml(t.setor_nome || '-')} • ${escapeHtml(t.grupo_nome || '-')}</span></div>
              <div class="mine-meta"><span class="badge ${statusClass(t.status)}">${escapeHtml(t.status)}</span><span class="badge ${priorityClass(t.prioridade)}">${escapeHtml(t.prioridade)}</span><span>Prazo: ${fmtDate(t.prazo)}</span></div>
              <div class="mine-actions">
                <select onchange="alterarMinhaTarefa(${t.id}, this.value)">
                  ${['Não iniciado', 'Em andamento', 'Parado', 'Feito'].map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </div>
            </article>
          `).join('') || '<p class="empty">Nenhuma tarefa vinculada ao seu usuário.</p>'}
        </div>
      </section>

      <section class="dash-panel wide">
        <h2>Minhas OS (${ordens.length})</h2>
        <div class="mine-list">
          ${ordens.map(o => `
            <article class="mine-card">
              <div><strong>${escapeHtml(o.numero || 'OS')} - ${escapeHtml(o.titulo)}</strong><span>${escapeHtml(o.setor_local || '-')} • ${escapeHtml(o.categoria || '-')}</span></div>
              <div class="mine-meta"><span class="badge ${osStatusClass(o.status)}">${escapeHtml(o.status)}</span><span class="badge ${priorityClass(o.prioridade)}">${escapeHtml(o.prioridade)}</span><span>Criada: ${fmtDateTime(o.criado_em)}</span></div>
              <div class="mine-actions">
                <select onchange="alterarMinhaOS(${o.id}, this.value)">
                  ${OS_STATUS.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </div>
            </article>
          `).join('') || '<p class="empty">Nenhuma OS vinculada ao seu usuário.</p>'}
        </div>
      </section>
    </div>
  `;
}

window.alterarMinhaTarefa = async (id, status) => {
  await api(`/api/minhas-tarefas/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  await abrirMinhas();
};

window.alterarMinhaOS = async (id, status) => {
  await api(`/api/minhas-os/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  await abrirMinhas();
};

async function abrirConfig() {
  setView('config');
  state.setorAtual = null;
  renderSetores();
  $('setorTitulo').textContent = 'Configurações';
  $('setorDescricao').textContent = 'Cadastre usuários, permissões e responsáveis de tarefas/OS.';
  state.usuarios = await carregarUsuarios('');
  renderConfig();
}

function renderConfig() {
  const panel = $('configPanel');
  const setorOptions = ['<option value="">Sem setor</option>'].concat(state.setores.map(s => `<option value="${s.id}">${escapeHtml(s.nome)}</option>`)).join('');

  panel.innerHTML = `
    <div class="dashboard-toolbar">
      <div>
        <strong>Usuários cadastrados</strong>
        <span>Somente usuários ativos e habilitados aparecem como responsáveis em tarefas e OS.</span>
      </div>
      <button class="primary" onclick="usuarioForm()">+ Novo usuário</button>
    </div>

    <section class="dash-panel wide">
      <table class="dash-table">
        <thead><tr><th>Nome</th><th>Email/Login</th><th>Perfil</th><th>Setor</th><th>Tarefas</th><th>OS</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>
          ${(state.usuarios || []).map(u => `
            <tr>
              <td>${escapeHtml(u.nome)}</td>
              <td>${escapeHtml(u.email)}</td>
              <td>${escapeHtml(perfilLabel(u.perfil))}</td>
              <td>${escapeHtml(u.setor_nome || '-')}</td>
              <td>${u.pode_receber_tarefas ? 'Sim' : 'Não'}</td>
              <td>${u.pode_receber_os ? 'Sim' : 'Não'}</td>
              <td>${u.ativo ? 'Ativo' : 'Inativo'}</td>
              <td><div class="task-actions"><button onclick="usuarioForm(${u.id})">✏️</button><button class="danger" onclick="desativarUsuario(${u.id})">🚫</button></div></td>
            </tr>
          `).join('') || '<tr><td colspan="8" class="empty">Nenhum usuário cadastrado.</td></tr>'}
        </tbody>
      </table>
    </section>
  `;
}

window.usuarioForm = (id = null) => {
  const usuario = id ? state.usuarios.find(u => u.id === id) : {};
  const setorOptions = ['<option value="">Sem setor</option>']
    .concat(state.setores.map(s => `<option value="${s.id}" ${String(usuario?.setor_id || '') === String(s.id) ? 'selected' : ''}>${escapeHtml(s.nome)}</option>`))
    .join('');

  openModal(id ? 'Editar usuário' : 'Novo usuário', `
    <form id="usuarioForm">
      <div class="form-grid">
        <div><label>Nome</label><input name="nome" value="${escapeHtml(usuario?.nome || '')}" required></div>
        <div><label>Email/Login</label><input name="email" type="email" value="${escapeHtml(usuario?.email || '')}" required></div>
        <div><label>Senha ${id ? '(preencha apenas para alterar)' : ''}</label><input name="senha" type="password" ${id ? '' : 'required'}></div>
        <div><label>Perfil</label><select name="perfil">
          ${['admin', 'gerente', 'encarregado', 'colaborador'].map(p => `<option value="${p}" ${usuario?.perfil === p ? 'selected' : ''}>${perfilLabel(p)}</option>`).join('')}
        </select></div>
        <div><label>Setor</label><select name="setor_id">${setorOptions}</select></div>
        <div><label>Status</label><select name="ativo"><option value="true" ${usuario?.ativo !== false ? 'selected' : ''}>Ativo</option><option value="false" ${usuario?.ativo === false ? 'selected' : ''}>Inativo</option></select></div>
        <div class="full"><label><input type="checkbox" name="pode_receber_tarefas" ${usuario?.pode_receber_tarefas !== false ? 'checked' : ''}> Pode receber tarefas</label></div>
        <div class="full"><label><input type="checkbox" name="pode_receber_os" ${usuario?.pode_receber_os ? 'checked' : ''}> Pode receber OS</label></div>
      </div>
      <div class="modal-actions"><button type="button" onclick="closeModal()">Cancelar</button><button class="primary" type="submit">Salvar usuário</button></div>
    </form>
  `);

  $('usuarioForm').onsubmit = async (e) => {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.target));
    const data = {
      ...raw,
      ativo: raw.ativo === 'true',
      pode_receber_tarefas: e.target.querySelector('[name="pode_receber_tarefas"]').checked,
      pode_receber_os: e.target.querySelector('[name="pode_receber_os"]').checked
    };
    if (!data.senha) delete data.senha;
    if (id) await api(`/api/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/usuarios', { method: 'POST', body: JSON.stringify(data) });
    closeModal();
    state.usuarios = await carregarUsuarios('');
    renderConfig();
  };
};

window.desativarUsuario = async (id) => {
  if (!confirm('Desativar este usuário?')) return;
  await api(`/api/usuarios/${id}`, { method: 'DELETE' });
  state.usuarios = await carregarUsuarios('');
  renderConfig();
};

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('loginMsg').textContent = '';
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: $('email').value, senha: $('senha').value }) });
    state.token = data.token;
    localStorage.setItem('mb_token', data.token);
    await init();
  } catch (err) {
    $('loginMsg').textContent = err.message;
  }
};
$('btnSair').onclick = () => { localStorage.removeItem('mb_token'); location.reload(); };
$('btnDashboard').onclick = abrirDashboard;
$('btnOS').onclick = abrirOS;
$('btnMinhas').onclick = abrirMinhas;
$('btnConfig').onclick = abrirConfig;
$('btnSolicitarOS').onclick = () => window.open('/solicitar-os.html', '_blank');
$('btnNovoSetor').onclick = () => setorForm();
$('btnExcluirSetor').onclick = () => window.excluirSetorAtual();
$('btnNovoGrupo').onclick = () => grupoForm();
$('btnNovaTarefa').onclick = () => tarefaForm({}, state.quadro?.grupos?.[0]?.id);
$('modalClose').onclick = closeModal;
const renderBoardDebounced = debounce(() => scheduleRender(renderBoard), 180);
$('busca').oninput = renderBoardDebounced;
$('filtroStatus').onchange = () => scheduleRender(renderBoard);
$('filtroPeriodo').onchange = () => scheduleRender(renderBoard);
$('btnPdfSetor').onclick = () => window.imprimirSetorPdf();

init();
