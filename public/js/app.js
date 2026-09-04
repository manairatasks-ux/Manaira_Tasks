const state = {
  token: localStorage.getItem('mb_token'),
  usuario: null,
  setores: [],
  setorAtual: null,
  quadro: null,
  view: 'home',
  module: 'home',
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
  renderTimer: null,
  configTab: 'usuarios',
  modulosAcesso: [],
  almoxView: 'dashboard',
  almoxItens: [],
  almoxHistorico: [],
  galpaoView: 'dashboard',
  galpaoProdutos: [],
  rhView: 'dashboard',
  rhTipos: [],
  rhResponsaveis: []
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

function apiForm(path, formData, options = {}) {
  return fetch(path, {
    method: options.method || 'POST',
    headers: { ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    body: formData
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


function temAcessoModulo(codigo) {
  if (String(state.usuario?.perfil || '').toLowerCase() === 'administrador_principal') return true;
  return (state.modulosAcesso || state.usuario?.modulos || []).includes(codigo);
}

function exigirModulo(codigo, nome) {
  if (temAcessoModulo(codigo)) return true;
  alert(`Seu usuário não possui acesso ao módulo ${nome}.`);
  abrirHome();
  return false;
}

function configurarMenuPorPerfil() {
  const perfil = String(state.usuario?.perfil || '').toLowerCase();
  const isManager = ['administrador_principal', 'administrador', 'gerente', 'encarregado'].includes(perfil);
  const atividades = temAcessoModulo('atividades');
  const os = temAcessoModulo('os') && isManager;
  const admin = temAcessoModulo('administracao') && isManager;
  const almox = temAcessoModulo('almoxarifado');
  const galpao = temAcessoModulo('galpao');
  const rh = temAcessoModulo('rh');

  $('btnDashboard')?.classList.toggle('hidden', !atividades);
  $('btnMinhas')?.classList.toggle('hidden', !atividades);
  $('btnOS')?.classList.toggle('hidden', !os);
  $('btnConfig')?.classList.toggle('hidden', !admin);
  $('btnNovoSetor')?.classList.toggle('hidden', !atividades || !isManager);
  $('setoresList')?.classList.toggle('hidden', !atividades);
  $('cardAtividades')?.classList.toggle('hidden', !atividades);
  $('cardOS')?.classList.toggle('hidden', !os);
  $('cardAdmin')?.classList.toggle('hidden', !admin);
  $('cardAlmoxarifado')?.classList.toggle('hidden', !almox);
  $('cardGalpao')?.classList.toggle('hidden', !galpao);
  $('cardRH')?.classList.toggle('hidden', !rh);
  $('btnGalpaoImportar')?.classList.toggle('hidden', state.usuario?.perfil !== 'administrador_principal');
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

function setModule(module) {
  state.module = module;
  $('activityMenu')?.classList.toggle('hidden', module !== 'atividades');
  $('osMenu')?.classList.toggle('hidden', module !== 'os');
  $('adminMenu')?.classList.toggle('hidden', module !== 'admin');
  $('almoxMenu')?.classList.toggle('hidden', module !== 'almoxarifado');
  $('galpaoMenu')?.classList.toggle('hidden', module !== 'galpao');
  $('rhMenu')?.classList.toggle('hidden', module !== 'rh');
  $('btnHome')?.classList.toggle('active', module === 'home');
  const labels = { home: 'Central de módulos', atividades: 'Módulo Atividades', os: 'Módulo Ordem de Serviço', admin: 'Administração', almoxarifado: 'Módulo Almoxarifado', galpao: 'Módulo Galpão', rh: 'Módulo Recursos Humanos' };
  if ($('moduleLabel')) $('moduleLabel').textContent = labels[module] || 'Plataforma Manaíra';
}

function setView(view) {
  state.view = view;
  const isHome = view === 'home';
  const isDashboard = view === 'dashboard';
  const isBoard = view === 'board';
  const isOS = view === 'os';
  const isMinhas = view === 'minhas';
  const isConfig = view === 'config';
  const isAlmox = view === 'almoxarifado';
  const isGalpao = view === 'galpao';
  const isRH = view === 'rh';
  $('homePanel')?.classList.toggle('hidden', !isHome);
  $('dashboard').classList.toggle('hidden', !isDashboard);
  $('board').classList.toggle('hidden', !isBoard);
  $('osPanel')?.classList.toggle('hidden', !isOS);
  $('minhasPanel')?.classList.toggle('hidden', !isMinhas);
  $('configPanel')?.classList.toggle('hidden', !isConfig);
  $('almoxPanel')?.classList.toggle('hidden', !isAlmox);
  $('galpaoPanel')?.classList.toggle('hidden', !isGalpao);
  $('rhPanel')?.classList.toggle('hidden', !isRH);
  $('printFooter').classList.toggle('hidden', isHome);
  $('btnDashboard').classList.toggle('active', isDashboard);
  $('btnOS')?.classList.toggle('active', isOS);
  $('btnMinhas')?.classList.toggle('active', isMinhas);
  $('btnConfig')?.classList.toggle('active', isConfig);
  $('btnAlmoxDashboard')?.classList.remove('active');
  if (isAlmox) $('btnAlmoxDashboard')?.classList.add('active');

  ['btnGalpaoDashboard', 'btnGalpaoValidades', 'btnGalpaoImportar']
    .forEach(id => $(id)?.classList.remove('active'));

  const galpaoBtn = {
    dashboard: 'btnGalpaoDashboard',
    validades: 'btnGalpaoValidades',
    importar: 'btnGalpaoImportar'
  }[state.galpaoView];

  if (isGalpao && galpaoBtn) {
    $(galpaoBtn)?.classList.add('active');
  }

  ['btnRhDashboard','btnRhSolicitacoes','btnRhTipos']
    .forEach(id => $(id)?.classList.remove('active'));

  const rhBtn = {
    dashboard: 'btnRhDashboard',
    solicitacoes: 'btnRhSolicitacoes',
    tipos: 'btnRhTipos'
  }[state.rhView];

  if (isRH && rhBtn) {
    $(rhBtn)?.classList.add('active');
  }


  $('btnExcluirSetor').classList.toggle('hidden', !isBoard);
  $('btnCompartilharSetor')?.classList.toggle('hidden', !isBoard);
  $('btnNovoGrupo').style.display = isBoard ? '' : 'none';
  $('btnNovaTarefa').style.display = isBoard ? '' : 'none';
  $('busca').style.display = isBoard ? '' : 'none';
  $('filtroStatus').style.display = isBoard ? '' : 'none';
  $('filtroPeriodo').style.display = isBoard ? '' : 'none';
  $('btnPdfSetor').style.display = isBoard ? '' : 'none';
  document.querySelector('.filters')?.classList.toggle('hidden', !isBoard);
  document.querySelector('.topbar')?.classList.toggle('hidden', isHome);
}

function abrirHome() {
  state.setorAtual = null;
  setModule('home');
  setView('home');
  renderSetores();
  if ($('homeUserName')) $('homeUserName').textContent = (state.usuario?.nome || 'usuário').split(' ')[0];
  history.replaceState(null, '', '#inicio');
}

function entrarAtividades() {
  if (!exigirModulo('atividades', 'Atividades')) return;
  setModule('atividades');
  history.replaceState(null, '', '#atividades');
  return abrirDashboard(true);
}

function entrarOS() {
  if (!exigirModulo('os', 'Ordem de Serviço')) return;
  setModule('os');
  history.replaceState(null, '', '#ordens-servico');
  return abrirOS();
}

function entrarAdmin() {
  if (!exigirModulo('administracao', 'Administração')) return;
  setModule('admin');
  history.replaceState(null, '', '#administracao');
  return abrirConfig();
}

function entrarAlmoxarifado() {
  if (!exigirModulo('almoxarifado', 'Almoxarifado')) return;
  setModule('almoxarifado');
  history.replaceState(null, '', '#almoxarifado');
  return abrirAlmoxarifado('dashboard');
}

async function init() {
  if (!state.token) return showLogin();
  try {
    state.usuario = await api('/api/me');
    state.modulosAcesso = Array.isArray(state.usuario?.modulos) ? state.usuario.modulos : [];
    $('userName').textContent = state.usuario.nome;
    showApp();
    configurarMenuPorPerfil();
    invalidateDashboard();
    state.cache.quadros.clear();
    if (temAcessoModulo('atividades')) await carregarSetores(false);
    else { state.setores = []; renderSetores(); }
    state.usuarios = await carregarUsuarios();
    abrirHome();
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
    administrador_principal: 'Administrador Principal',
    administrador: 'Administrador',
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
  setModule('atividades');
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
    atualizarAcoesSetor();
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
    atualizarAcoesSetor();
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

  const acessoNivel = permissaoNivel(state.quadro?.setor?.permissao);
  const podeCriar = acessoNivel >= 2;
  const podeEditarEstrutura = acessoNivel >= 4;
  const podeGerenciar = acessoNivel >= 4;

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
          ${podeEditarEstrutura ? `<button onclick="editarGrupo(${grupo.id})">Editar grupo</button>` : ''}
          ${podeGerenciar ? `<button onclick="excluirGrupo(${grupo.id})">Excluir grupo</button>` : ''}
          ${podeCriar ? `<button class="primary" onclick="novaTarefa(${grupo.id})">+ Tarefa</button>` : ''}
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
                  ${(acessoNivel >= 3 || (acessoNivel >= 2 && String(t.criado_por) === String(state.usuario?.id))) ? `<button title="Editar" onclick="editarTarefa(${t.id})">✏️</button>` : ''}
                  ${(acessoNivel >= 4 || (acessoNivel >= 2 && String(t.criado_por) === String(state.usuario?.id))) ? `<button title="Excluir" class="danger" onclick="excluirTarefa(${t.id})">🗑️</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('') : '<tr><td colspan="8" class="empty">Nenhuma tarefa cadastrada neste grupo.</td></tr>'}
        </tbody>
      </table>
      ${podeCriar ? `<button class="add-task-line" onclick="novaTarefa(${grupo.id})">+ Adicionar tarefa</button>` : ''}
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

function permissaoNivel(p) { return ({ visualizar: 1, criar: 2, editar: 3, gerenciar: 4, proprietario: 5 })[p] || 0; }
function atualizarAcoesSetor() {
  const p = state.setorAtual?.permissao || '';
  const share = $('btnCompartilharSetor');
  if (share) share.classList.toggle('hidden', permissaoNivel(p) < 4);
  $('btnExcluirSetor')?.classList.toggle('hidden', p !== 'proprietario' && state.usuario?.perfil !== 'administrador_principal');
  $('btnNovoGrupo')?.classList.toggle('hidden', permissaoNivel(p) < 4);
  $('btnNovaTarefa')?.classList.toggle('hidden', permissaoNivel(p) < 2);
}

async function compartilharSetor() {
  if (!state.setorAtual) return;
  state.usuarios = await carregarUsuarios('');
  const atuais = await api(`/api/setores/${state.setorAtual.id}/compartilhamentos`);
  const map = new Map(atuais.map(x => [String(x.usuario_id), x]));
  const disponiveis = (state.usuarios || []).filter(u => String(u.id) !== String(state.setorAtual.proprietario_id));
  openModal('Compartilhar setor', `<p class="hint">Defina o acesso de cada funcionário ao setor <strong>${escapeHtml(state.setorAtual.nome)}</strong>.</p>
    <div class="share-list">${disponiveis.map(u => { const a = map.get(String(u.id)); return `<div class="share-row"><div><strong>${escapeHtml(u.nome)}</strong><small>${escapeHtml(perfilLabel(u.perfil))}</small></div><select data-share-user="${u.id}"><option value="">Sem acesso</option><option value="visualizar" ${a?.permissao === 'visualizar' ? 'selected' : ''}>Somente visualizar</option><option value="criar" ${a?.permissao === 'criar' ? 'selected' : ''}>Visualizar e criar</option><option value="editar" ${a?.permissao === 'editar' ? 'selected' : ''}>Editar</option><option value="gerenciar" ${a?.permissao === 'gerenciar' ? 'selected' : ''}>Gerenciar setor</option></select></div>` }).join('') || '<p>Nenhum outro usuário ativo.</p>'}</div><div class="modal-actions"><button onclick="closeModal()">Cancelar</button><button class="primary" id="salvarCompartilhamentos">Salvar</button></div>`);
  $('salvarCompartilhamentos').onclick = async () => { for (const sel of document.querySelectorAll('[data-share-user]')) { const uid = sel.dataset.shareUser, val = sel.value, old = map.get(String(uid)); if (!val && old) await api(`/api/setores/${state.setorAtual.id}/compartilhamentos/${uid}`, { method: 'DELETE' }); else if (val && (!old || old.permissao !== val)) await api(`/api/setores/${state.setorAtual.id}/compartilhamentos`, { method: 'PUT', body: JSON.stringify({ usuario_id: Number(uid), permissao: val }) }); } closeModal(); alert('Compartilhamentos atualizados.'); };
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
  setModule('os');
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
  setModule('atividades');
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
  if (!exigirModulo('administracao', 'Administração')) return;
  setModule('admin');
  setView('config');
  state.setorAtual = null;
  renderSetores();
  $('setorTitulo').textContent = 'Configurações';
  $('setorDescricao').textContent = 'Cadastre usuários, permissões e responsáveis de tarefas/OS.';
  state.usuarios = await carregarUsuarios('');
  renderConfig();
}


async function abrirAlmoxarifado(view = 'dashboard') {
  if (!exigirModulo('almoxarifado', 'Almoxarifado')) return;
  state.almoxView = view;
  setModule('almoxarifado');
  setView('almoxarifado');
  const titulos = {
    dashboard: ['Almoxarifado', 'Visão rápida do estoque e das últimas movimentações.'],
    estoque: ['Estoque', 'Consulte os itens disponíveis e cadastre novos materiais.'],
    entrada: ['Registrar entrada', 'Adicione ao estoque o material que chegou ao almoxarifado.'],
    saida: ['Registrar saída', 'Registre o material entregue e mantenha o saldo atualizado.'],
    historico: ['Histórico', 'Veja tudo que entrou e saiu do almoxarifado.']
  };
  const [titulo, descricao] = titulos[view] || titulos.dashboard;
  $('setorTitulo').textContent = titulo;
  $('setorDescricao').textContent = descricao;
  history.replaceState(null, '', view === 'dashboard' ? '#almoxarifado' : `#almoxarifado/${view}`);
  if (view === 'dashboard') return renderAlmoxDashboard();
  if (view === 'estoque') return renderAlmoxEstoque();
  if (view === 'entrada') return renderAlmoxMovimento('ENTRADA');
  if (view === 'saida') return renderAlmoxMovimento('SAIDA');
  return renderAlmoxHistorico();
}

async function carregarAlmoxItens(busca = '') {
  const qs = busca ? `?busca=${encodeURIComponent(busca)}` : '';
  state.almoxItens = await api(`/api/almoxarifado/itens${qs}`);
  return state.almoxItens;
}

function almoxFluxoBar(view = '') {
  const etapas = [
    ['estoque', '1', 'Estoque'],
    ['entrada', '2', 'Entrada'],
    ['saida', '3', 'Saída'],
    ['historico', '4', 'Histórico']
  ];
  return `
    <div class="almox-flow">
      <div class="almox-flow-label"><strong>Fluxo do Almoxarifado</strong><span>Selecione uma etapa</span></div>
      <div class="almox-flow-steps">
        ${etapas.map(([codigo, numero, label], i) => `
          <button type="button" class="almox-flow-step ${view === codigo ? 'active' : ''}" onclick="abrirAlmoxarifado('${codigo}')">
            <span class="almox-flow-number">${numero}</span>${label}
          </button>${i < etapas.length - 1 ? '<span class="almox-flow-arrow">›</span>' : ''}
        `).join('')}
      </div>
    </div>`;
}

function almoxTipoBadge(tipo) {
  return tipo === 'ENTRADA'
    ? '<span class="almox-mov-badge entrada">Entrada</span>'
    : '<span class="almox-mov-badge saida">Saída</span>';
}

async function renderAlmoxDashboard() {
  const panel = $('almoxPanel');
  if (!panel) return;
  panel.innerHTML = '<div class="almox-loading">Carregando almoxarifado...</div>';
  try {
    const data = await api('/api/almoxarifado/dashboard');
    const r = data.resumo || {};
    panel.innerHTML = `
      ${almoxFluxoBar('')}
      <div class="almox-summary-grid">
        <article class="almox-summary-card"><strong>${Number(r.itens_cadastrados || 0)}</strong><span>Itens cadastrados</span></article>
        <article class="almox-summary-card"><strong>${Number(r.itens_com_saldo || 0)}</strong><span>Itens com saldo</span></article>
        <article class="almox-summary-card"><strong>${Number(r.entradas_mes || 0)}</strong><span>Entradas no mês</span></article>
        <article class="almox-summary-card"><strong>${Number(r.saidas_mes || 0)}</strong><span>Saídas no mês</span></article>
      </div>
      <section class="dash-panel wide almox-recentes">
        <div class="dashboard-toolbar"><div><strong>Últimas movimentações</strong><span>Os registros mais recentes do almoxarifado.</span></div></div>
        <div class="almox-history-list">
          ${(data.recentes || []).map(m => `
            <div class="almox-history-row">
              <div>${almoxTipoBadge(m.tipo)}<strong>${escapeHtml(m.item_descricao)}</strong><small>${fmtDateTime(m.criado_em)}${m.usuario_nome ? ' • por ' + escapeHtml(m.usuario_nome) : ''}</small></div>
              <div class="almox-history-qty"><strong>${m.tipo === 'SAIDA' ? '−' : '+'}${Number(m.quantidade)}</strong><small>${escapeHtml(m.unidade || 'UND')}</small></div>
            </div>`).join('') || '<p class="empty">Nenhuma movimentação registrada ainda.</p>'}
        </div>
      </section>`;
  } catch (err) {
    panel.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`;
  }
}

async function renderAlmoxEstoque(busca = '') {
  const panel = $('almoxPanel');
  if (!panel) return;
  panel.innerHTML = '<div class="almox-loading">Carregando estoque...</div>';
  try {
    const itens = await carregarAlmoxItens(busca);
    panel.innerHTML = `
      ${almoxFluxoBar('estoque')}
      <div class="dashboard-toolbar almox-toolbar">
        <div><strong>Estoque atual</strong><span>Quantidade só muda por entrada ou saída.</span></div>
        <button class="primary" onclick="almoxItemForm()">+ Novo item</button>
      </div>
      <div class="almox-search"><input id="almoxBuscaItem" placeholder="Buscar item, categoria ou patrimônio..." value="${escapeHtml(busca)}"><button id="almoxBuscarBtn">Buscar</button></div>
      <section class="dash-panel wide almox-table-wrap">
        <table class="dash-table almox-table">
          <thead><tr><th>Item</th><th>Categoria</th><th>Patrimônio</th><th>Quantidade</th><th>Unidade</th><th></th></tr></thead>
          <tbody>${itens.map(i => `<tr>
            <td><strong>${escapeHtml(i.descricao)}</strong>${i.observacao ? `<small class="almox-cell-note">${escapeHtml(i.observacao)}</small>` : ''}</td>
            <td>${escapeHtml(i.categoria || '-')}</td>
            <td>${escapeHtml(i.codigo_patrimonio || '-')}</td>
            <td><span class="almox-stock-number ${Number(i.quantidade_atual) === 0 ? 'zero' : ''}">${Number(i.quantidade_atual)}</span></td>
            <td>${escapeHtml(i.unidade || 'UND')}</td>
            <td><button onclick="almoxItemForm(${i.id})">Editar</button></td>
          </tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum item cadastrado.</td></tr>'}</tbody>
        </table>
      </section>`;
    $('almoxBuscarBtn').onclick = () => renderAlmoxEstoque($('almoxBuscaItem').value.trim());
    $('almoxBuscaItem').onkeydown = e => { if (e.key === 'Enter') renderAlmoxEstoque(e.target.value.trim()); };
  } catch (err) {
    panel.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`;
  }
}

window.almoxItemForm = async (id = null) => {
  if (!state.almoxItens.length) await carregarAlmoxItens();
  const item = id ? state.almoxItens.find(i => Number(i.id) === Number(id)) : null;
  const categorias = ['EPI', 'Fardamento', 'Eletrônicos', 'Equipamentos', 'Ferramentas', 'Material de escritório', 'Material de limpeza', 'Utensílios', 'Outros'];
  openModal(item ? 'Editar item' : 'Novo item', `
    <form id="almoxItemForm">
      <div class="form-grid">
        <div class="full"><label>Descrição</label><input name="descricao" value="${escapeHtml(item?.descricao || '')}" placeholder="Ex.: Bota de Segurança em couro preta Nº 40" required></div>
        <div><label>Categoria</label><input name="categoria" list="almoxCategorias" value="${escapeHtml(item?.categoria || '')}" placeholder="Ex.: EPI"><datalist id="almoxCategorias">${categorias.map(c => `<option value="${c}">`).join('')}</datalist></div>
        <div><label>Unidade</label><select name="unidade">${['UND', 'PAR', 'CX', 'PCT', 'KIT', 'M', 'KG'].map(u => `<option value="${u}" ${(item?.unidade || 'UND') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        <div class="full"><label>Código do patrimônio <small>(opcional)</small></label><input name="codigo_patrimonio" value="${escapeHtml(item?.codigo_patrimonio || '')}" placeholder="Deixe em branco quando não houver"></div>
        ${item ? '' : '<div><label>Quantidade inicial</label><input name="quantidade_inicial" type="number" min="0" step="1" value="0"></div>'}
        <div class="full"><label>Observação <small>(opcional)</small></label><textarea name="observacao" rows="3">${escapeHtml(item?.observacao || '')}</textarea></div>
      </div>
      ${item ? '<p class="hint">A quantidade atual não é editada aqui. Use Entrada ou Saída para manter o histórico correto.</p>' : ''}
      <div class="modal-actions"><button type="button" onclick="closeModal()">Cancelar</button><button class="primary" type="submit">Salvar item</button></div>
    </form>`);
  $('almoxItemForm').onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      await api(item ? `/api/almoxarifado/itens/${item.id}` : '/api/almoxarifado/itens', { method: item ? 'PUT' : 'POST', body: JSON.stringify(data) });
      closeModal();
      await carregarAlmoxItens();
      renderAlmoxEstoque();
    } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = 'Salvar item'; }
  };
};

async function renderAlmoxMovimento(tipo) {
  const panel = $('almoxPanel');
  if (!panel) return;
  try {
    await carregarAlmoxItens();
    const saida = tipo === 'SAIDA';
    panel.innerHTML = `
      ${almoxFluxoBar(saida ? 'saida' : 'entrada')}
      <div class="almox-form-shell">
        <div class="almox-form-head"><span class="almox-form-icon">${saida ? '−' : '+'}</span><div><strong>${saida ? 'Registrar saída' : 'Registrar entrada'}</strong><small>${saida ? 'Informe o material que foi entregue.' : 'Informe o material que chegou ao almoxarifado.'}</small></div></div>
        <form id="almoxMovForm" class="almox-movement-form">
          <label>Item</label>
          <select name="item_id" required><option value="">Selecione o item</option>${state.almoxItens.map(i => `<option value="${i.id}">${escapeHtml(i.descricao)} — saldo ${Number(i.quantidade_atual)} ${escapeHtml(i.unidade)}</option>`).join('')}</select>
          <label>Quantidade</label><input name="quantidade" type="number" min="1" step="1" value="1" required>
          ${saida ? '<label>Destino</label><input name="destino" placeholder="Ex.: Açougue, RH, Frente de Loja"><label>Responsável</label><input name="responsavel" placeholder="Nome de quem recebeu (opcional)">' : ''}
          <label>Observação <small>(opcional)</small></label><textarea name="observacao" rows="3" placeholder="Alguma informação importante sobre esta movimentação"></textarea>
          <div id="almoxMovMsg" class="almox-form-msg"></div>
          <button class="primary almox-confirm" type="submit">${saida ? 'Confirmar saída' : 'Confirmar entrada'}</button>
        </form>
      </div>`;
    $('almoxMovForm').onsubmit = async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('button[type="submit"]');
      const msg = $('almoxMovMsg');
      btn.disabled = true; btn.textContent = 'Salvando...'; msg.textContent = '';
      try {
        await api(saida ? '/api/almoxarifado/saidas' : '/api/almoxarifado/entradas', { method: 'POST', body: JSON.stringify(data) });
        e.target.reset();
        msg.textContent = saida ? 'Saída registrada com sucesso.' : 'Entrada registrada com sucesso.';
        msg.className = 'almox-form-msg success';
        await carregarAlmoxItens();
        const select = e.target.querySelector('[name="item_id"]');
        select.innerHTML = '<option value="">Selecione o item</option>' + state.almoxItens.map(i => `<option value="${i.id}">${escapeHtml(i.descricao)} — saldo ${Number(i.quantidade_atual)} ${escapeHtml(i.unidade)}</option>`).join('');
      } catch (err) {
        msg.textContent = err.message; msg.className = 'almox-form-msg error';
      } finally { btn.disabled = false; btn.textContent = saida ? 'Confirmar saída' : 'Confirmar entrada'; }
    };
  } catch (err) {
    panel.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`;
  }
}

async function renderAlmoxHistorico(busca = '', tipo = '') {
  const panel = $('almoxPanel');
  if (!panel) return;
  panel.innerHTML = '<div class="almox-loading">Carregando histórico...</div>';
  try {
    const params = new URLSearchParams();
    if (busca) params.set('busca', busca);
    if (tipo) params.set('tipo', tipo);
    const data = await api(`/api/almoxarifado/historico?${params.toString()}`);
    state.almoxHistorico = data;
    panel.innerHTML = `
      ${almoxFluxoBar('historico')}
      <div class="almox-history-filters">
        <input id="almoxHistBusca" placeholder="Buscar item, destino, responsável..." value="${escapeHtml(busca)}">
        <select id="almoxHistTipo"><option value="">Entradas e saídas</option><option value="ENTRADA" ${tipo === 'ENTRADA' ? 'selected' : ''}>Entradas</option><option value="SAIDA" ${tipo === 'SAIDA' ? 'selected' : ''}>Saídas</option></select>
        <button id="almoxHistBuscar">Filtrar</button>
      </div>
      <section class="dash-panel wide">
        <div class="almox-history-list detailed">
          ${data.map(m => `<div class="almox-history-row">
            <div>${almoxTipoBadge(m.tipo)}<strong>${escapeHtml(m.item_descricao)}</strong><small>${fmtDateTime(m.criado_em)}${m.usuario_nome ? ' • registrado por ' + escapeHtml(m.usuario_nome) : ''}</small>${m.destino || m.responsavel || m.observacao ? `<p>${m.destino ? '<b>Destino:</b> ' + escapeHtml(m.destino) + ' ' : ''}${m.responsavel ? '<b>Responsável:</b> ' + escapeHtml(m.responsavel) + ' ' : ''}${m.observacao ? '<b>Obs.:</b> ' + escapeHtml(m.observacao) : ''}</p>` : ''}</div>
            <div class="almox-history-qty"><strong>${m.tipo === 'SAIDA' ? '−' : '+'}${Number(m.quantidade)}</strong><small>${escapeHtml(m.unidade || 'UND')} • saldo ${Number(m.saldo_posterior)}</small></div>
          </div>`).join('') || '<p class="empty">Nenhuma movimentação encontrada.</p>'}
        </div>
      </section>`;
    const filtrar = () => renderAlmoxHistorico($('almoxHistBusca').value.trim(), $('almoxHistTipo').value);
    $('almoxHistBuscar').onclick = filtrar;
    $('almoxHistTipo').onchange = filtrar;
    $('almoxHistBusca').onkeydown = e => { if (e.key === 'Enter') filtrar(); };
  } catch (err) {
    panel.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`;
  }
}

window.abrirAlmoxarifado = abrirAlmoxarifado;


// =========================
// V16 - Módulo Galpão
// =========================
function entrarGalpao() {
  if (!exigirModulo('galpao', 'Galpão')) return;
  setModule('galpao');
  history.replaceState(null, '', '#galpao');
  return abrirGalpao('dashboard');
}

async function carregarGalpaoProdutos(busca = '') {
  const qs = busca ? `?busca=${encodeURIComponent(busca)}` : '';
  state.galpaoProdutos = await api(`/api/galpao/produtos${qs}`);
  return state.galpaoProdutos;
}

function galpaoValidadeLabel(v) { return v ? fmtDate(v) : 'Sem validade'; }
function galpaoTipoBadge(tipo) { return tipo === 'ENTRADA' ? '<span class="galpao-badge entrada">Entrada</span>' : '<span class="galpao-badge saida">Saída</span>'; }

function galpaoFluxoBar(view = state.galpaoView) {
  const etapas = [
    ['produtos', 'Cadastro', '1'],
    ['entrada', 'Entrada', '2'],
    ['saida', 'Saída', '3'],
    ['estoque', 'Estoque atual', '4'],
    ['historico_entradas', 'Histórico entradas', '5'],
    ['historico_saidas', 'Histórico saídas', '6']
  ];
  return `<nav class="galpao-flow" aria-label="Fluxo operacional do Galpão">
    <div class="galpao-flow-label"><strong>Fluxo operacional</strong><span>Siga a mesma sequência do sistema antigo</span></div>
    <div class="galpao-flow-steps">${etapas.map(([codigo, label, n]) => `<button type="button" class="galpao-flow-step ${view === codigo ? 'active' : ''}" onclick="abrirGalpao('${codigo}')"><span class="galpao-flow-number">${n}</span><span>${label}</span></button>`).join('<span class="galpao-flow-arrow">›</span>')}</div>
  </nav>`;
}
function galpaoDiasBadge(dias) {
  const n = Number(dias);
  if (n < 0) return `<span class="galpao-expiry danger">Vencido há ${Math.abs(n)} dia(s)</span>`;
  if (n <= 30) return `<span class="galpao-expiry warning">${n} dia(s)</span>`;
  return `<span class="galpao-expiry ok">${n} dia(s)</span>`;
}

async function abrirGalpao(view = 'dashboard') {
  if (!exigirModulo('galpao', 'Galpão')) return;
  state.galpaoView = view;
  setModule('galpao');
  setView('galpao');
  const metas = {
    dashboard: ['Galpão', 'Visão geral do estoque e das validades.'],
    produtos: ['Produtos do Galpão', 'Cadastro base por código de barras.'],
    estoque: ['Estoque do Galpão', 'Saldo separado por produto, validade e unidades por embalagem.'],
    entrada: ['Entrada no Galpão', 'Registre o recebimento de mercadorias.'],
    saida: ['Saída do Galpão', 'Retire mercadorias do lote correto.'],
    historico: ['Histórico do Galpão', 'Entradas e saídas registradas no sistema.'],
    historico_entradas: ['Histórico de Entradas', 'Todas as entradas registradas no Galpão.'],
    historico_saidas: ['Histórico de Saídas', 'Todas as saídas registradas no Galpão.'],
    validades: ['Validades', 'Acompanhe lotes vencidos ou próximos do vencimento.'],
    importar: ['Importar sistema antigo', 'Migre o controle_estoque.db do projeto Python para o PostgreSQL.']
  };
  const [titulo, descricao] = metas[view] || metas.dashboard;
  $('setorTitulo').textContent = titulo; $('setorDescricao').textContent = descricao;
  history.replaceState(null, '', view === 'dashboard' ? '#galpao' : `#galpao/${view}`);
  if (view === 'dashboard') return renderGalpaoDashboard();
  if (view === 'produtos') return renderGalpaoProdutos();
  if (view === 'estoque') return renderGalpaoEstoque();
  if (view === 'entrada') return renderGalpaoMovimento('ENTRADA');
  if (view === 'saida') return renderGalpaoMovimento('SAIDA');
  if (view === 'historico') return renderGalpaoHistorico();
  if (view === 'historico_entradas') return renderGalpaoHistorico('', 'ENTRADA', true);
  if (view === 'historico_saidas') return renderGalpaoHistorico('', 'SAIDA', true);
  if (view === 'validades') return renderGalpaoValidades();
  if (view === 'importar') return renderGalpaoImportar();
}

async function renderGalpaoDashboard() {
  const panel = $('galpaoPanel'); panel.innerHTML = '<div class="almox-loading">Carregando Galpão...</div>';
  try {
    const data = await api('/api/galpao/dashboard'); const r = data.resumo || {};
    panel.innerHTML = `
      ${galpaoFluxoBar('dashboard')}
      
      <div class="almox-summary-grid galpao-summary-grid">
        <article class="almox-summary-card"><strong>${Number(r.produtos || 0).toLocaleString('pt-BR')}</strong><span>Produtos cadastrados</span></article>
        <article class="almox-summary-card"><strong>${Number(r.lotes_com_saldo || 0).toLocaleString('pt-BR')}</strong><span>Lotes com saldo</span></article>
        <article class="almox-summary-card"><strong>${Number(r.embalagens_estoque || 0).toLocaleString('pt-BR')}</strong><span>Embalagens em estoque</span></article>
        <article class="almox-summary-card"><strong>${Number(r.unidades_estoque || 0).toLocaleString('pt-BR')}</strong><span>Unidades totais</span></article>
        <article class="almox-summary-card alert"><strong>${Number(r.vencem_60_dias || 0)}</strong><span>Vencem em até 60 dias</span></article>
        <article class="almox-summary-card danger"><strong>${Number(r.vencidos || 0)}</strong><span>Lotes vencidos</span></article>
      </div>
      <section class="dash-panel wide">
        <div class="dashboard-toolbar"><div><strong>Movimentações recentes</strong><span>Últimos registros do Galpão.</span></div><button onclick="abrirGalpao('historico')">Ver histórico</button></div>
        <div class="almox-history-list">${(data.recentes || []).map(m => `<div class="almox-history-row"><div>${galpaoTipoBadge(m.tipo)}<strong>${escapeHtml(m.descricao)}</strong><small>${fmtDate(m.data_movimento)} • ${galpaoValidadeLabel(m.validade)} • ${Number(m.unidades_por_embalagem)} unid/emb${m.usuario_nome ? ' • ' + escapeHtml(m.usuario_nome) : ''}</small></div><div class="almox-history-qty"><strong>${m.tipo === 'SAIDA' ? '−' : '+'}${Number(m.quantidade)}</strong><small>embalagem(ns)</small></div></div>`).join('') || '<p class="empty">Nenhuma movimentação registrada.</p>'}</div>
      </section>`;
  } catch (err) { panel.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`; }
}

async function renderGalpaoProdutos(busca = '') {
  const panel = $('galpaoPanel'); panel.innerHTML = '<div class="almox-loading">Carregando produtos...</div>';
  try {
    const produtos = await carregarGalpaoProdutos(busca);
    panel.innerHTML = `${galpaoFluxoBar('produtos')}<div class="dashboard-toolbar almox-toolbar"><div><strong>${produtos.length.toLocaleString('pt-BR')} produto(s)</strong><span>O código de barras identifica o produto em entradas e saídas.</span></div><button class="primary" onclick="galpaoProdutoForm()">+ Novo produto</button></div>
      <div class="almox-search"><input id="galpaoBuscaProduto" placeholder="Buscar código ou descrição..." value="${escapeHtml(busca)}"><button id="galpaoBuscarProduto">Buscar</button></div>
      <section class="dash-panel wide almox-table-wrap"><table class="dash-table galpao-table"><thead><tr><th>Código</th><th>Descrição</th><th>Lotes</th><th>Emb.</th><th>Total unid.</th><th>Ação</th></tr></thead><tbody>${produtos.map(p => `<tr><td class="mono">${escapeHtml(p.codigo_barra)}</td><td><strong>${escapeHtml(p.descricao)}</strong></td><td>${Number(p.lotes)}</td><td>${Number(p.embalagens).toLocaleString('pt-BR')}</td><td>${Number(p.unidades).toLocaleString('pt-BR')}</td><td><button onclick="galpaoProdutoForm(${p.id})">Editar</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum produto encontrado.</td></tr>'}</tbody></table></section>`;
    const buscar = () => renderGalpaoProdutos($('galpaoBuscaProduto').value.trim()); $('galpaoBuscarProduto').onclick = buscar; $('galpaoBuscaProduto').onkeydown = e => { if (e.key === 'Enter') buscar(); };
  } catch (err) { panel.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`; }
}

window.galpaoProdutoForm = async (id = null) => {
  if (!state.galpaoProdutos.length) await carregarGalpaoProdutos(); const p = id ? state.galpaoProdutos.find(x => Number(x.id) === Number(id)) : null;
  openModal(p ? 'Editar produto' : 'Novo produto', `<form id="galpaoProdutoForm"><div class="form-grid"><div><label>Código de barras</label><input name="codigo_barra" value="${escapeHtml(p?.codigo_barra || '')}" required autofocus></div><div class="full"><label>Descrição</label><input name="descricao" value="${escapeHtml(p?.descricao || '')}" required></div></div><div class="modal-actions"><button type="button" onclick="closeModal()">Cancelar</button><button class="primary" type="submit">Salvar produto</button></div></form>`);
  $('galpaoProdutoForm').onsubmit = async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)); try { await api(p ? `/api/galpao/produtos/${p.id}` : '/api/galpao/produtos', { method: p ? 'PUT' : 'POST', body: JSON.stringify(data) }); closeModal(); await renderGalpaoProdutos(); } catch (err) { alert(err.message); } };
};

async function renderGalpaoEstoque(busca = '', validade = '') {
  const panel = $('galpaoPanel');
  panel.innerHTML = '<div class="almox-loading">Carregando estoque...</div>';

  try {
    const qs = new URLSearchParams();

    if (busca) {
      qs.set('busca', busca);
    }

    if (validade) {
      qs.set('validade', validade);
    }

    const dados = await api(`/api/galpao/estoque?${qs}`);

    // Estoque atual mostra somente lotes com saldo.
    const estoque = dados.filter(
      item => Number(item.quantidade) > 0
    );

    // Agrupa os lotes pelo produto.
    const grupos = new Map();

    estoque.forEach(item => {
      const chave = String(item.produto_id);

      if (!grupos.has(chave)) {
        grupos.set(chave, {
          produto_id: item.produto_id,
          codigo_barra: item.codigo_barra,
          descricao: item.descricao,
          lotes: []
        });
      }

      grupos.get(chave).lotes.push(item);
    });

    const gruposArray = [...grupos.values()];

    // Resumo do resultado exibido.
    const resumo = gruposArray.reduce(
      (acc, grupo) => {
        acc.produtos += 1;
        acc.lotes += grupo.lotes.length;

        grupo.lotes.forEach(item => {
          acc.embalagens += Number(
            item.quantidade || 0
          );

          acc.unidades += Number(
            item.total_unidades || 0
          );
        });

        return acc;
      },
      {
        produtos: 0,
        lotes: 0,
        embalagens: 0,
        unidades: 0
      }
    );

    // Define o destaque visual da validade.
    function validadeEstoqueHtml(valor) {
      if (!valor) {
        return `
          <span class="galpao-stock-validade sem-validade">
            Sem validade
          </span>
        `;
      }

      const dataTexto = String(valor).slice(0, 10);
      const partes = dataTexto
        .split('-')
        .map(Number);

      if (
        partes.length !== 3 ||
        partes.some(Number.isNaN)
      ) {
        return `
          <span class="galpao-stock-validade">
            ${escapeHtml(
          galpaoValidadeLabel(valor)
        )}
          </span>
        `;
      }

      const hoje = new Date();

      const hojeUtc = Date.UTC(
        hoje.getFullYear(),
        hoje.getMonth(),
        hoje.getDate()
      );

      const validadeUtc = Date.UTC(
        partes[0],
        partes[1] - 1,
        partes[2]
      );

      const dias = Math.floor(
        (validadeUtc - hojeUtc) / 86400000
      );

      let classe = 'ok';
      let complemento = '';

      if (dias < 0) {
        classe = 'vencido';
        complemento = 'Vencido';
      } else if (dias <= 30) {
        classe = 'urgente';
        complemento = `${dias}d`;
      } else if (dias <= 60) {
        classe = 'atencao';
        complemento = `${dias}d`;
      }

      return `
        <span class="galpao-stock-validade ${classe}">
          <span>
            ${escapeHtml(
        galpaoValidadeLabel(valor)
      )}
          </span>

          ${complemento
          ? `<small>${complemento}</small>`
          : ''
        }
        </span>
      `;
    }

    // Monta os grupos de produtos.
    const linhas = gruposArray
      .map((grupo, grupoIndex) => {
        let totalEmbalagens = 0;
        let totalUnidades = 0;

        const lotes = grupo.lotes
          .map((item, loteIndex) => {
            const quantidade = Number(
              item.quantidade || 0
            );

            const unidades = Number(
              item.total_unidades || 0
            );

            const primeiroLote =
              loteIndex === 0;

            const multiplo =
              grupo.lotes.length > 1;

            totalEmbalagens += quantidade;
            totalUnidades += unidades;

            return `
              <tr
                class="
                  galpao-stock-row
                  ${grupoIndex % 2 === 0
                ? 'grupo-a'
                : 'grupo-b'
              }
                  ${primeiroLote
                ? 'produto-inicio'
                : 'produto-continuacao'
              }
                "
              >

                <td class="mono galpao-stock-code">
                  ${primeiroLote
                ? escapeHtml(
                  item.codigo_barra
                )
                : ''
              }
                </td>

                <td class="galpao-stock-product">

                  ${primeiroLote
                ? `
                        <strong>
                          ${escapeHtml(
                  item.descricao
                )}
                        </strong>

                        ${multiplo
                  ? `
                              <small>
                                ${grupo.lotes
                    .length
                  }
                                lotes em estoque
                              </small>
                            `
                  : ''
                }
                      `
                : `
                        <span
                          class="galpao-lote-continuacao"
                        >
                          ↳ Outro lote
                        </span>
                      `
              }

                </td>

                <td>
                  ${validadeEstoqueHtml(
                item.validade
              )}
                </td>

                <td
                  class="galpao-stock-number-cell"
                >
                  ${Number(
                item.unidades_por_embalagem
              ).toLocaleString('pt-BR')}
                </td>

                <td
                  class="galpao-stock-number-cell"
                >
                  <span
                    class="almox-stock-number"
                  >
                    ${quantidade.toLocaleString(
                'pt-BR'
              )}
                  </span>
                </td>

                <td
                  class="
                    galpao-stock-number-cell
                    galpao-stock-total-unid
                  "
                >
                  ${unidades.toLocaleString(
                'pt-BR'
              )}
                </td>

              </tr>
            `;
          })
          .join('');

        // Só mostra TOTAL quando houver
        // mais de um lote.
        const total =
          grupo.lotes.length > 1
            ? `
              <tr
                class="
                  galpao-product-total
                  ${grupoIndex % 2 === 0
              ? 'grupo-a'
              : 'grupo-b'
            }
                "
              >

                <td></td>

                <td colspan="3">

                  <span
                    class="galpao-total-label"
                  >
                    Total do produto
                  </span>

                  <strong>
                    ${escapeHtml(
              grupo.descricao
            )}
                  </strong>

                </td>

                <td
                  class="galpao-stock-number-cell"
                >
                  <strong>
                    ${totalEmbalagens.toLocaleString(
              'pt-BR'
            )}
                  </strong>
                </td>

                <td
                  class="galpao-stock-number-cell"
                >
                  <strong>
                    ${totalUnidades.toLocaleString(
              'pt-BR'
            )}
                  </strong>
                </td>

              </tr>
            `
            : '';

        return `
          <tbody class="galpao-stock-group">

            ${lotes}

            ${total}

          </tbody>
        `;
      })
      .join('');

    panel.innerHTML = `

      ${galpaoFluxoBar('estoque')}

      <div
        class="
          dashboard-toolbar
          galpao-stock-toolbar
        "
      >

        <div>

          <strong>
            Estoque por produto e lote
          </strong>

          <span>
            Cada produto fica agrupado.
            Quando há mais de um lote,
            o total aparece ao final do grupo.
          </span>

        </div>

        <button
          class="primary"
          onclick="abrirGalpao('entrada')"
        >
          + Entrada
        </button>

      </div>


      <div class="galpao-stock-summary">

        <div>
          <span>Produtos</span>

          <strong>
            ${resumo.produtos.toLocaleString(
      'pt-BR'
    )}
          </strong>
        </div>

        <div>
          <span>Lotes</span>

          <strong>
            ${resumo.lotes.toLocaleString(
      'pt-BR'
    )}
          </strong>
        </div>

        <div>
          <span>Embalagens</span>

          <strong>
            ${resumo.embalagens.toLocaleString(
      'pt-BR'
    )}
          </strong>
        </div>

        <div>
          <span>Unidades</span>

          <strong>
            ${resumo.unidades.toLocaleString(
      'pt-BR'
    )}
          </strong>
        </div>

      </div>


      <div
        class="
          galpao-filters
          galpao-stock-filters
        "
      >

        <div class="galpao-stock-search">

          <span>⌕</span>

          <input
            id="galpaoEstoqueBusca"
            placeholder="
              Digite o código ou nome do produto...
            "
            value="${escapeHtml(busca)}"
            autocomplete="off"
          >

        </div>


        <select id="galpaoEstoqueValidade">

          <option
            value=""
            ${!validade
        ? 'selected'
        : ''
      }
          >
            Todos os lotes
          </option>

          <option
            value="saldo"
            ${validade === 'saldo'
        ? 'selected'
        : ''
      }
          >
            Somente com saldo
          </option>

          <option
            value="60"
            ${validade === '60'
        ? 'selected'
        : ''
      }
          >
            Vence em até 60 dias
          </option>

          <option
            value="vencidos"
            ${validade === 'vencidos'
        ? 'selected'
        : ''
      }
          >
            Vencidos
          </option>

          <option
            value="sem"
            ${validade === 'sem'
        ? 'selected'
        : ''
      }
          >
            Sem validade
          </option>

        </select>


        <button id="galpaoEstoqueFiltrar">
          Filtrar
        </button>

      </div>


      <section
        class="
          dash-panel
          wide
          almox-table-wrap
          galpao-stock-shell
        "
      >

        <table
          class="
            dash-table
            galpao-table
            galpao-stock-table
          "
        >

          <thead>

            <tr>

              <th>
                Código
              </th>

              <th>
                Produto
              </th>

              <th>
                Validade
              </th>

              <th class="number">
                Unid/Emb.
              </th>

              <th class="number">
                Emb.
              </th>

              <th class="number">
                Total unid.
              </th>

            </tr>

          </thead>


          ${linhas ||
      `
              <tbody>

                <tr>

                  <td
                    colspan="6"
                    class="empty"
                  >
                    Nenhum produto
                    com saldo encontrado.
                  </td>

                </tr>

              </tbody>
            `
      }

        </table>

      </section>
    `;


    const filtrar = () => {
      renderGalpaoEstoque(
        $('galpaoEstoqueBusca')
          .value
          .trim(),

        $('galpaoEstoqueValidade')
          .value
      );
    };


    $('galpaoEstoqueFiltrar').onclick =
      filtrar;


    $('galpaoEstoqueValidade').onchange =
      filtrar;


    $('galpaoEstoqueBusca').onkeydown =
      e => {
        if (e.key === 'Enter') {
          filtrar();
        }
      };


  } catch (err) {

    panel.innerHTML = `
      <section
        class="dash-panel wide"
      >

        <p class="empty">
          ${escapeHtml(err.message)}
        </p>

      </section>
    `;

  }
}

async function renderGalpaoMovimento(tipo) {
  const panel = $('galpaoPanel');
  panel.innerHTML = '<div class="almox-loading">Carregando produtos...</div>';

  try {
    const produtos = await carregarGalpaoProdutos();
    const saida = tipo === 'SAIDA';

    panel.innerHTML = `
      ${galpaoFluxoBar(saida ? 'saida' : 'entrada')}

      <section class="dash-panel wide galpao-form-panel">

        <div class="dashboard-toolbar">
          <div>
            <strong>${saida ? 'Registrar saída' : 'Registrar entrada'}</strong>
            <span>
              ${saida
        ? 'Digite ou bip o código do produto e selecione o lote que será retirado.'
        : 'Digite ou bip o código do produto para continuar.'}
            </span>
          </div>
        </div>

        <form id="galpaoMovForm">

          <div class="form-grid">

            <div class="full">
              <label>Código do produto</label>

              <input
                id="galpaoCodigoProduto"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                placeholder="Digite ou bip o código..."
                autofocus
              >

              <input
                type="hidden"
                name="produto_id"
                id="galpaoMovProduto"
              >

              <div id="galpaoProdutoEncontrado"></div>
            </div>

            ${saida
        ? `
                  <div
                    class="full hidden"
                    id="galpaoLoteArea"
                  >
                    <label>Lote / validade / Unid/Emb.</label>

                    <select
                      id="galpaoMovLote"
                      required
                    >
                      <option value="">
                        Selecione o lote...
                      </option>
                    </select>
                  </div>
                `
        : `
                  <div>
                    <label>Validade</label>
                    <input
                      name="validade"
                      type="date"
                    >
                  </div>

                  <div>
                    <label>Unidades por embalagem</label>
                    <input
                      name="unidades_por_embalagem"
                      type="number"
                      min="1"
                      step="1"
                      value="1"
                      required
                    >
                  </div>
                `
      }

            <div>
              <label>Quantidade de embalagens</label>
              <input
                name="quantidade"
                type="number"
                min="1"
                step="1"
                required
              >
            </div>

            <div>
              <label>Data</label>
              <input
                name="data_movimento"
                type="date"
                value="${new Date().toISOString().slice(0, 10)}"
                required
              >
            </div>

            <div class="full">
              <label>Observação (opcional)</label>

              <input
                name="observacao"
                placeholder="Informação complementar..."
              >
            </div>

          </div>

          <div class="modal-actions galpao-form-actions">
            <button
              type="button"
              onclick="abrirGalpao('estoque')"
            >
              Cancelar
            </button>

            <button
              class="primary"
              type="submit"
            >
              ${saida ? 'Registrar saída' : 'Registrar entrada'}
            </button>
          </div>

        </form>
      </section>
    `;

    const codigoInput = $('galpaoCodigoProduto');
    const produtoIdInput = $('galpaoMovProduto');
    const resultado = $('galpaoProdutoEncontrado');

    let produtoAtual = null;
    let timerBusca = null;

    async function buscarProdutoPorCodigo() {
      const codigo = codigoInput.value.trim();

      produtoAtual = null;
      produtoIdInput.value = '';

      if (saida) {
        $('galpaoLoteArea')?.classList.add('hidden');

        if ($('galpaoMovLote')) {
          $('galpaoMovLote').innerHTML =
            '<option value="">Selecione o lote...</option>';
        }
      }

      if (!codigo) {
        resultado.innerHTML = '';
        return;
      }

      const produto = produtos.find(
        p => String(p.codigo_barra || '').trim() === codigo
      );

      if (!produto) {
        resultado.innerHTML = `
          <div class="galpao-produto-status nao-encontrado">
            <strong>Produto não encontrado</strong>
            <span>Confira o código informado.</span>
          </div>
        `;
        return;
      }

      produtoAtual = produto;
      produtoIdInput.value = produto.id;

      resultado.innerHTML = `
        <div class="galpao-produto-status encontrado">
          <span class="galpao-produto-ok">✓</span>

          <div>
            <strong>${escapeHtml(produto.descricao)}</strong>
            <small>
              Código: ${escapeHtml(produto.codigo_barra)}
            </small>
          </div>
        </div>
      `;

      if (saida) {
        const loteArea = $('galpaoLoteArea');
        const loteSelect = $('galpaoMovLote');

        loteArea.classList.remove('hidden');
        loteSelect.disabled = true;

        loteSelect.innerHTML =
          '<option value="">Carregando lotes...</option>';

        try {
          const lotes = await api(
            `/api/galpao/produtos/${produto.id}/estoque`
          );

          const disponiveis = lotes.filter(
            lote => Number(lote.quantidade) > 0
          );

          if (!disponiveis.length) {
            loteSelect.innerHTML = `
              <option value="">
                Produto sem estoque disponível
              </option>
            `;

            resultado.innerHTML += `
              <div class="galpao-produto-alerta">
                Este produto não possui saldo disponível.
              </div>
            `;

            return;
          }

          loteSelect.innerHTML =
            '<option value="">Selecione o lote...</option>' +
            disponiveis.map(lote => `
              <option
                value="${lote.validade || ''}|${lote.unidades_por_embalagem}"
              >
                ${galpaoValidadeLabel(lote.validade)}
                • ${lote.unidades_por_embalagem} unid/emb
                • saldo ${Number(lote.quantidade).toLocaleString('pt-BR')} emb.
              </option>
            `).join('');

          loteSelect.disabled = false;

        } catch (err) {
          loteSelect.innerHTML = `
            <option value="">
              Erro ao carregar lotes
            </option>
          `;
        }
      }
    }

    codigoInput.addEventListener('input', () => {
      clearTimeout(timerBusca);

      timerBusca = setTimeout(() => {
        buscarProdutoPorCodigo();
      }, 250);
    });

    codigoInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timerBusca);
        buscarProdutoPorCodigo();
      }
    });

    $('galpaoMovForm').onsubmit = async e => {
      e.preventDefault();

      if (!produtoAtual || !produtoIdInput.value) {
        alert('Digite um código de produto válido.');
        codigoInput.focus();
        return;
      }

      const raw = Object.fromEntries(
        new FormData(e.target)
      );

      if (saida) {
        const lote = $('galpaoMovLote').value;

        if (!lote) {
          alert('Selecione o lote.');
          return;
        }

        const [validade, unidades] = lote.split('|');

        raw.validade = validade;
        raw.unidades_por_embalagem = Number(unidades);
      }

      try {
        await api(
          saida
            ? '/api/galpao/saidas'
            : '/api/galpao/entradas',
          {
            method: 'POST',
            body: JSON.stringify(raw)
          }
        );

        alert(
          `${saida ? 'Saída' : 'Entrada'} registrada com sucesso.`
        );

        await abrirGalpao('estoque');

      } catch (err) {
        alert(err.message);
      }
    };

    codigoInput.focus();

  } catch (err) {
    panel.innerHTML = `
      <section class="dash-panel wide">
        <p class="empty">
          ${escapeHtml(err.message)}
        </p>
      </section>
    `;
  }
}

async function renderGalpaoHistorico(busca = '', tipo = '', fixo = false) {
  const panel = $('galpaoPanel');
  panel.innerHTML = '<div class="almox-loading">Carregando histórico...</div>';

  try {
    const qs = new URLSearchParams({ limite: '500' });
    if (busca) qs.set('busca', busca);
    if (tipo) qs.set('tipo', tipo);

    const data = await api(`/api/galpao/historico?${qs}`);

    const viewAtual =
      tipo === 'ENTRADA' && fixo
        ? 'historico_entradas'
        : (
            tipo === 'SAIDA' && fixo
              ? 'historico_saidas'
              : 'historico'
          );

    const titulo =
      tipo === 'ENTRADA'
        ? 'Histórico de entradas'
        : (
            tipo === 'SAIDA'
              ? 'Histórico de saídas'
              : 'Histórico completo'
          );

    const podeCopiar = fixo && (tipo === 'ENTRADA' || tipo === 'SAIDA');

    panel.innerHTML = `
      ${galpaoFluxoBar(viewAtual)}

      <div class="dashboard-toolbar almox-toolbar galpao-history-head">
        <div>
          <strong>${titulo}</strong>
          <span>${data.length.toLocaleString('pt-BR')} registro(s) exibido(s).</span>
        </div>

        ${podeCopiar ? `
          <div class="galpao-copy-actions">
            <span id="galpaoCopyCount">0 selecionado(s)</span>

            <button
              type="button"
              id="galpaoCopiarSelecionados"
              class="primary"
              disabled
            >
              Copiar selecionados
            </button>

            <button
              type="button"
              id="galpaoLimparSelecao"
              disabled
            >
              Limpar seleção
            </button>
          </div>
        ` : ''}
      </div>

      <div class="galpao-filters ${fixo ? 'galpao-filters-simple' : ''}">
        <input
          id="galpaoHistBusca"
          placeholder="Código, produto ou observação..."
          value="${escapeHtml(busca)}"
        >

        ${fixo
          ? ''
          : `
            <select id="galpaoHistTipo">
              <option value="">Entradas e saídas</option>
              <option value="ENTRADA" ${tipo === 'ENTRADA' ? 'selected' : ''}>
                Entradas
              </option>
              <option value="SAIDA" ${tipo === 'SAIDA' ? 'selected' : ''}>
                Saídas
              </option>
            </select>
          `
        }

        <button id="galpaoHistFiltrar">
          Filtrar
        </button>
      </div>

      ${podeCopiar ? `
        <div class="galpao-copy-hint">
          Marque os registros do carregamento e clique em
          <strong>Copiar selecionados</strong>.
          O texto será copiado no formato:
          <span>código quantidade</span>
        </div>
      ` : ''}

      <section class="dash-panel wide almox-table-wrap">
        <table class="dash-table galpao-table galpao-history-table ${podeCopiar ? 'galpao-history-selectable' : ''}">
          <thead>
            <tr>
              ${podeCopiar ? `
                <th class="galpao-select-col">
                  <label
                    class="galpao-history-check"
                    title="Selecionar todos os registros exibidos"
                  >
                    <input
                      type="checkbox"
                      id="galpaoSelecionarTodos"
                      aria-label="Selecionar todos"
                    >
                  </label>
                </th>
              ` : ''}

              <th>Data</th>
              <th>Código</th>
              <th>Produto</th>
              <th>Validade</th>
              <th>Unid/Emb.</th>
              <th>Quantidade</th>
              <th>Usuário / observação</th>
            </tr>
          </thead>

          <tbody>
            ${data.map((m, index) => `
              <tr
                class="${podeCopiar ? 'galpao-history-select-row' : ''}"
                ${podeCopiar ? `data-copy-index="${index}"` : ''}
              >
                ${podeCopiar ? `
                  <td class="galpao-select-col">
                    <label class="galpao-history-check">
                      <input
                        type="checkbox"
                        class="galpaoHistCheck"
                        data-index="${index}"
                        aria-label="Selecionar ${escapeHtml(m.descricao)}"
                      >
                    </label>
                  </td>
                ` : ''}

                <td>${fmtDate(m.data_movimento)}</td>

                <td class="mono">
                  ${escapeHtml(m.codigo_barra)}
                </td>

                <td>
                  <strong>${escapeHtml(m.descricao)}</strong>
                  ${!fixo
                    ? `
                      <small class="almox-cell-note">
                        ${m.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}
                      </small>
                    `
                    : ''
                  }
                </td>

                <td>${galpaoValidadeLabel(m.validade)}</td>

                <td>${Number(m.unidades_por_embalagem)}</td>

                <td>
                  <strong
                    class="galpao-history-qty ${m.tipo === 'SAIDA' ? 'saida' : 'entrada'}"
                  >
                    ${m.tipo === 'SAIDA' ? '−' : '+'}${Number(m.quantidade).toLocaleString('pt-BR')}
                  </strong>
                </td>

                <td>
                  <span>
                    ${
                      m.usuario_nome
                        ? escapeHtml(m.usuario_nome)
                        : (
                            m.origem === 'SQLITE'
                              ? 'Importado do Python'
                              : '—'
                          )
                    }
                  </span>

                  ${m.observacao
                    ? `
                      <small class="almox-cell-note">
                        ${escapeHtml(m.observacao)}
                      </small>
                    `
                    : ''
                  }
                </td>
              </tr>
            `).join('') || `
              <tr>
                <td
                  colspan="${podeCopiar ? '8' : '7'}"
                  class="empty"
                >
                  Nenhuma movimentação encontrada.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </section>
    `;

    const filtrar = () => {
      const novaBusca = $('galpaoHistBusca').value.trim();
      const novoTipo = fixo ? tipo : $('galpaoHistTipo').value;

      renderGalpaoHistorico(
        novaBusca,
        novoTipo,
        fixo
      );
    };

    $('galpaoHistFiltrar').onclick = filtrar;

    if (!fixo) {
      $('galpaoHistTipo').onchange = filtrar;
    }

    $('galpaoHistBusca').onkeydown = e => {
      if (e.key === 'Enter') {
        filtrar();
      }
    };

    if (podeCopiar) {
      const checks = [
        ...document.querySelectorAll('.galpaoHistCheck')
      ];

      const selecionarTodos = $('galpaoSelecionarTodos');
      const copiarBtn = $('galpaoCopiarSelecionados');
      const limparBtn = $('galpaoLimparSelecao');
      const contador = $('galpaoCopyCount');

      const selecionados = () =>
        checks.filter(check => check.checked);

      const atualizarSelecao = () => {
        const marcados = selecionados();
        const quantidade = marcados.length;

        contador.textContent =
          `${quantidade} selecionado(s)`;

        copiarBtn.disabled = quantidade === 0;
        limparBtn.disabled = quantidade === 0;

        if (selecionarTodos) {
          selecionarTodos.checked =
            checks.length > 0 &&
            quantidade === checks.length;

          selecionarTodos.indeterminate =
            quantidade > 0 &&
            quantidade < checks.length;
        }

        document
          .querySelectorAll('.galpao-history-select-row')
          .forEach(row => {
            const check = row.querySelector('.galpaoHistCheck');
            row.classList.toggle(
              'selected',
              Boolean(check?.checked)
            );
          });
      };

      checks.forEach(check => {
        check.addEventListener(
          'change',
          atualizarSelecao
        );
      });

      if (selecionarTodos) {
        selecionarTodos.addEventListener(
          'change',
          () => {
            checks.forEach(check => {
              check.checked =
                selecionarTodos.checked;
            });

            atualizarSelecao();
          }
        );
      }

      limparBtn.addEventListener(
        'click',
        () => {
          checks.forEach(check => {
            check.checked = false;
          });

          if (selecionarTodos) {
            selecionarTodos.checked = false;
            selecionarTodos.indeterminate = false;
          }

          atualizarSelecao();
        }
      );

      async function copiarTexto(texto) {
        if (
          navigator.clipboard &&
          window.isSecureContext
        ) {
          await navigator.clipboard.writeText(texto);
          return;
        }

        const area = document.createElement('textarea');
        area.value = texto;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        area.style.pointerEvents = 'none';

        document.body.appendChild(area);
        area.select();

        const sucesso =
          document.execCommand('copy');

        area.remove();

        if (!sucesso) {
          throw new Error(
            'Não foi possível copiar automaticamente.'
          );
        }
      }

      copiarBtn.addEventListener(
        'click',
        async () => {
          const marcados = selecionados();

          if (!marcados.length) {
            return;
          }

          const linhas = marcados.map(check => {
            const registro =
              data[Number(check.dataset.index)];

            const codigo =
              String(registro.codigo_barra || '').trim();

            const quantidade =
              String(Number(registro.quantidade || 0));

            return `${codigo} ${quantidade}`;
          });

          const texto = linhas.join('\n');
          const textoOriginal = copiarBtn.textContent;

          try {
            await copiarTexto(texto);

            copiarBtn.textContent =
              `✓ ${marcados.length} copiado(s)`;

            copiarBtn.classList.add('copiado');

            setTimeout(() => {
              copiarBtn.textContent =
                textoOriginal;

              copiarBtn.classList.remove('copiado');
            }, 1800);

          } catch (err) {
            alert(
              'Não foi possível copiar automaticamente. ' +
              'Tente novamente ou verifique a permissão do navegador.'
            );
          }
        }
      );

      atualizarSelecao();
    }

  } catch (err) {
    panel.innerHTML = `
      <section class="dash-panel wide">
        <p class="empty">
          ${escapeHtml(err.message)}
        </p>
      </section>
    `;
  }
}


async function renderGalpaoValidades(dias = 90, busca = '') {
  const panel = $('galpaoPanel'); panel.innerHTML = '<div class="almox-loading">Carregando validades...</div>'; try {
    const qs = new URLSearchParams({ dias: String(dias) }); if (busca) qs.set('busca', busca); const data = await api(`/api/galpao/validades?${qs}`);
    panel.innerHTML = `${galpaoFluxoBar('validades')}<div class="dashboard-toolbar"><div><strong>Controle de validades</strong><span>Inclui vencidos e lotes que vencem dentro do período escolhido.</span></div></div><div class="galpao-filters"><input id="galpaoValBusca" placeholder="Código ou descrição..." value="${escapeHtml(busca)}"><select id="galpaoValDias"><option value="30" ${Number(dias) === 30 ? 'selected' : ''}>Próximos 30 dias</option><option value="60" ${Number(dias) === 60 ? 'selected' : ''}>Próximos 60 dias</option><option value="90" ${Number(dias) === 90 ? 'selected' : ''}>Próximos 90 dias</option><option value="180" ${Number(dias) === 180 ? 'selected' : ''}>Próximos 180 dias</option><option value="365" ${Number(dias) === 365 ? 'selected' : ''}>Próximo ano</option></select><button id="galpaoValFiltrar">Filtrar</button></div><section class="dash-panel wide almox-table-wrap"><table class="dash-table galpao-table"><thead><tr><th>Produto</th><th>Validade</th><th>Situação</th><th>Unid/Emb.</th><th>Emb.</th><th>Total unid.</th></tr></thead><tbody>${data.map(x => `<tr><td><strong>${escapeHtml(x.descricao)}</strong><small class="almox-cell-note">${escapeHtml(x.codigo_barra)}</small></td><td>${fmtDate(x.validade)}</td><td>${galpaoDiasBadge(x.dias_restantes)}</td><td>${Number(x.unidades_por_embalagem)}</td><td>${Number(x.quantidade).toLocaleString('pt-BR')}</td><td>${Number(x.total_unidades).toLocaleString('pt-BR')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum lote nesse período.</td></tr>'}</tbody></table></section>`;
    const f = () => renderGalpaoValidades(Number($('galpaoValDias').value), $('galpaoValBusca').value.trim()); $('galpaoValFiltrar').onclick = f; $('galpaoValDias').onchange = f; $('galpaoValBusca').onkeydown = e => { if (e.key === 'Enter') f(); };
  } catch (err) { panel.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`; }
}

async function renderGalpaoImportar() {
  const panel = $('galpaoPanel'); if (state.usuario?.perfil !== 'administrador_principal') { panel.innerHTML = '<section class="dash-panel wide"><p class="empty">Somente o Administrador Principal pode executar a migração do banco antigo.</p></section>'; return; }
  panel.innerHTML = `${galpaoFluxoBar('importar')}<section class="dash-panel wide galpao-import"><div class="dashboard-toolbar"><div><strong>Importar controle_estoque.db</strong><span>Use o banco ATUAL que está sendo alimentado no sistema Python no momento da implantação.</span></div></div><div class="galpao-import-warning"><strong>Importante</strong><span>O banco que usamos durante o desenvolvimento possui dados antigos de teste. Na implantação, selecione o arquivo atualizado do computador do Galpão.</span></div><form id="galpaoPreviewForm"><label>Arquivo SQLite (.db)</label><input id="galpaoArquivoDb" name="arquivo" type="file" accept=".db" required><div class="modal-actions"><button class="primary" type="submit">Analisar arquivo</button></div></form><div id="galpaoImportResumo"></div></section>`;
  $('galpaoPreviewForm').onsubmit = async e => { e.preventDefault(); const file = $('galpaoArquivoDb').files[0]; if (!file) return; const fd = new FormData(); fd.append('arquivo', file); const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Analisando...'; try { const r = await apiForm('/api/galpao/importar/preview', fd); $('galpaoImportResumo').innerHTML = `<div class="galpao-import-summary"><h3>Arquivo válido</h3><div class="galpao-import-counts"><div><strong>${r.produtos}</strong><span>Produtos</span></div><div><strong>${r.estoque}</strong><span>Lotes de estoque</span></div><div><strong>${r.entradas}</strong><span>Entradas</span></div><div><strong>${r.saidas}</strong><span>Saídas</span></div></div>${r.possui_dados_atuais ? '<label class="galpao-replace"><input id="galpaoSubstituir" type="checkbox"> Substituir completamente os dados atuais do módulo Galpão</label>' : '<p class="hint">O módulo Galpão está vazio e pronto para receber esta base.</p>'}<button class="primary" id="galpaoExecutarImport">Importar para a Plataforma</button></div>`; $('galpaoExecutarImport').onclick = () => executarImportacaoGalpao(file, r.possui_dados_atuais); } catch (err) { alert(err.message); } finally { btn.disabled = false; btn.textContent = 'Analisar arquivo'; } };
}

async function executarImportacaoGalpao(file, possuiDados) {
  const substituir = possuiDados && Boolean($('galpaoSubstituir')?.checked); if (possuiDados && !substituir) return alert('Como já existem dados no módulo, marque a opção de substituir completamente os dados atuais.');
  if (!confirm('Confirmar a migração deste banco para o módulo Galpão?' + (substituir ? ' Os dados atuais do Galpão serão substituídos.' : ''))) return;
  const fd = new FormData(); fd.append('arquivo', file); fd.append('substituir', String(substituir)); fd.append('confirmacao', 'IMPORTAR'); const btn = $('galpaoExecutarImport'); btn.disabled = true; btn.textContent = 'Importando...';
  try { const r = await apiForm('/api/galpao/importar', fd); const i = r.importacao; alert(`Migração concluída.\nProdutos: ${i.produtos_importados}\nEstoque: ${i.estoque_importado}\nEntradas: ${i.entradas_importadas}\nSaídas: ${i.saidas_importadas}`); state.galpaoProdutos = []; await abrirGalpao('dashboard'); } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = 'Importar para a Plataforma'; }
}

window.abrirGalpao = abrirGalpao;


// =========================
// V17 - Módulo RH
// =========================
function rhStatusBadge(status) {
  const cls = String(status || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replaceAll(' ','-');
  return `<span class="rh-status rh-status-${cls}">${escapeHtml(status || '-')}</span>`;
}

function entrarRH() {
  if (!exigirModulo('rh', 'Recursos Humanos')) return;
  setModule('rh');
  history.replaceState(null, '', '#rh');
  return abrirRH('dashboard');
}

async function abrirRH(view = 'dashboard') {
  if (!exigirModulo('rh', 'Recursos Humanos')) return;
  state.rhView = view;
  setModule('rh');
  setView('rh');

  const metas = {
    dashboard: ['Recursos Humanos', 'Visão geral dos chamados e pedidos recebidos pelo RH.'],
    solicitacoes: ['Solicitações ao RH', 'Acompanhe, atribua responsáveis e registre o andamento dos pedidos.'],
    tipos: ['Tipos de solicitação', 'Configure as categorias disponíveis para os colaboradores.']
  };

  const [titulo, descricao] = metas[view] || metas.dashboard;
  $('setorTitulo').textContent = titulo;
  $('setorDescricao').textContent = descricao;
  history.replaceState(null, '', view === 'dashboard' ? '#rh' : `#rh/${view}`);

  if (view === 'solicitacoes') return renderRhSolicitacoes();
  if (view === 'tipos') return renderRhTipos();
  return renderRhDashboard();
}

async function carregarRhTipos(ativos = false) {
  const endpoint = ativos ? '/api/rh/public/tipos' : '/api/rh/tipos';
  state.rhTipos = await api(endpoint);
  return state.rhTipos;
}

async function carregarRhResponsaveis() {
  state.rhResponsaveis = await api('/api/rh/responsaveis');
  return state.rhResponsaveis;
}

async function renderRhDashboard() {
  const panel = $('rhPanel');
  panel.innerHTML = '<div class="almox-loading">Carregando RH...</div>';

  try {
    const data = await api('/api/rh/dashboard');
    const r = data.resumo || {};

    panel.innerHTML = `
      <div class="rh-toolbar">
        <div>
          <strong>Central de solicitações do RH</strong>
          <span>Pedidos ficam registrados desde a abertura até a conclusão.</span>
        </div>
        <div class="rh-toolbar-actions">
          <button onclick="window.open('/solicitar-rh.html','_blank')">Abrir formulário do colaborador</button>
          <button class="primary" onclick="abrirRH('solicitacoes')">Ver solicitações</button>
        </div>
      </div>

      <div class="almox-summary-grid rh-summary-grid">
        <article class="almox-summary-card"><strong>${Number(r.abertos || 0)}</strong><span>Em aberto</span></article>
        <article class="almox-summary-card"><strong>${Number(r.recebidos || 0)}</strong><span>Recebidos</span></article>
        <article class="almox-summary-card alert"><strong>${Number(r.em_analise || 0)}</strong><span>Em análise</span></article>
        <article class="almox-summary-card"><strong>${Number(r.aguardando || 0)}</strong><span>Aguardando colaborador</span></article>
        <article class="almox-summary-card"><strong>${Number(r.em_andamento || 0)}</strong><span>Em andamento</span></article>
        <article class="almox-summary-card success"><strong>${Number(r.concluidos_mes || 0)}</strong><span>Concluídos no mês</span></article>
      </div>

      <div class="rh-dashboard-grid">
        <section class="dash-panel">
          <h2>Solicitações recentes</h2>
          <div class="rh-request-list">
            ${(data.recentes || []).map(s => `
              <button class="rh-request-card" onclick="verRhSolicitacao(${s.id})">
                <div><strong>${escapeHtml(s.protocolo)}</strong><span>${escapeHtml(s.tipo_nome)}</span></div>
                <div><b>${escapeHtml(s.solicitante_nome)}</b><small>${escapeHtml(s.responsavel_nome || 'Sem responsável')}</small></div>
                ${rhStatusBadge(s.status)}
              </button>
            `).join('') || '<p class="empty">Nenhuma solicitação recebida ainda.</p>'}
          </div>
        </section>

        <section class="dash-panel">
          <h2>Demandas em aberto por tipo</h2>
          <div class="rh-type-list">
            ${(data.por_tipo || []).map(x => `<div><span>${escapeHtml(x.nome)}</span><strong>${Number(x.total)}</strong></div>`).join('') || '<p class="empty">Sem demandas em aberto.</p>'}
          </div>
        </section>
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`;
  }
}

async function renderRhSolicitacoes(busca = '', status = '', tipoId = '') {
  const panel = $('rhPanel');
  panel.innerHTML = '<div class="almox-loading">Carregando solicitações...</div>';

  try {
    const tipos = state.rhTipos.length ? state.rhTipos : await carregarRhTipos(false);
    const qs = new URLSearchParams();
    if (busca) qs.set('busca', busca);
    if (status) qs.set('status', status);
    if (tipoId) qs.set('tipo_id', tipoId);
    const data = await api(`/api/rh/solicitacoes?${qs}`);

    panel.innerHTML = `
      <div class="rh-toolbar">
        <div><strong>Caixa de solicitações</strong><span>${data.length.toLocaleString('pt-BR')} registro(s) exibido(s).</span></div>
        <button class="primary" onclick="rhSolicitacaoInternaForm()">+ Nova solicitação</button>
      </div>

      <div class="rh-filters">
        <input id="rhBusca" placeholder="Protocolo, colaborador, CPF/matrícula ou descrição..." value="${escapeHtml(busca)}">
        <select id="rhStatusFiltro">
          <option value="">Todos os status</option>
          ${['Recebido','Em análise','Aguardando colaborador','Em andamento','Concluído','Cancelado'].map(s=>`<option value="${s}" ${status===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select id="rhTipoFiltro">
          <option value="">Todos os tipos</option>
          ${tipos.map(t=>`<option value="${t.id}" ${String(tipoId)===String(t.id)?'selected':''}>${escapeHtml(t.nome)}</option>`).join('')}
        </select>
        <button id="rhFiltrar">Filtrar</button>
      </div>

      <section class="dash-panel wide almox-table-wrap">
        <table class="dash-table rh-table">
          <thead><tr><th>Protocolo</th><th>Solicitante</th><th>Tipo</th><th>Status</th><th>Responsável</th><th>Abertura</th></tr></thead>
          <tbody>
            ${data.map(s=>`
              <tr class="rh-click-row" onclick="verRhSolicitacao(${s.id})">
                <td class="mono"><strong>${escapeHtml(s.protocolo)}</strong></td>
                <td><strong>${escapeHtml(s.solicitante_nome)}</strong><small class="almox-cell-note">${escapeHtml(s.identificacao || s.contato || '')}</small></td>
                <td>${escapeHtml(s.tipo_nome)}</td>
                <td>${rhStatusBadge(s.status)}</td>
                <td>${escapeHtml(s.responsavel_nome || 'Não atribuído')}</td>
                <td>${fmtDateTime(s.criado_em)}</td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="empty">Nenhuma solicitação encontrada.</td></tr>'}
          </tbody>
        </table>
      </section>
    `;

    const filtrar = () => renderRhSolicitacoes(
      $('rhBusca').value.trim(),
      $('rhStatusFiltro').value,
      $('rhTipoFiltro').value
    );

    $('rhFiltrar').onclick = filtrar;
    $('rhStatusFiltro').onchange = filtrar;
    $('rhTipoFiltro').onchange = filtrar;
    $('rhBusca').onkeydown = e => { if (e.key === 'Enter') filtrar(); };
  } catch (err) {
    panel.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`;
  }
}

window.rhSolicitacaoInternaForm = async () => {
  const tipos = state.rhTipos.length ? state.rhTipos.filter(t=>t.ativo) : await carregarRhTipos(false);
  openModal('Nova solicitação ao RH', `
    <form id="rhNovaSolicitacaoForm">
      <div class="form-grid">
        <div class="full"><label>Solicitante</label><input name="solicitante_nome" required></div>
        <div><label>CPF ou matrícula</label><input name="identificacao"></div>
        <div><label>Contato</label><input name="contato"></div>
        <div class="full"><label>Tipo</label><select name="tipo_id" required><option value="">Selecione...</option>${tipos.map(t=>`<option value="${t.id}">${escapeHtml(t.nome)}</option>`).join('')}</select></div>
        <div class="full"><label>Descrição</label><textarea name="descricao" required></textarea></div>
      </div>
      <div class="modal-actions"><button type="button" onclick="closeModal()">Cancelar</button><button class="primary" type="submit">Abrir solicitação</button></div>
    </form>
  `);

  $('rhNovaSolicitacaoForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/rh/solicitacoes',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
      closeModal();
      await renderRhSolicitacoes();
    } catch (err) { alert(err.message); }
  };
};

window.verRhSolicitacao = async id => {
  try {
    const [data, responsaveis] = await Promise.all([
      api(`/api/rh/solicitacoes/${id}`),
      state.rhResponsaveis.length ? Promise.resolve(state.rhResponsaveis) : carregarRhResponsaveis()
    ]);
    const s = data.solicitacao;

    openModal(`${s.protocolo} • ${s.tipo_nome}`, `
      <div class="rh-detail-head">
        <div><span>Solicitante</span><strong>${escapeHtml(s.solicitante_nome)}</strong><small>${escapeHtml(s.identificacao || '-')} • ${escapeHtml(s.contato || 'sem contato')}</small></div>
        ${rhStatusBadge(s.status)}
      </div>

      <div class="rh-detail-description">${escapeHtml(s.descricao)}</div>

      <div class="rh-detail-controls">
        <div><label>Status</label><select id="rhDetalheStatus">${['Recebido','Em análise','Aguardando colaborador','Em andamento','Concluído','Cancelado'].map(st=>`<option ${s.status===st?'selected':''}>${st}</option>`).join('')}</select></div>
        <div><label>Responsável</label><select id="rhDetalheResponsavel"><option value="">Não atribuído</option>${responsaveis.map(u=>`<option value="${u.id}" ${String(s.responsavel_id||'')===String(u.id)?'selected':''}>${escapeHtml(u.nome)}</option>`).join('')}</select></div>
      </div>

      <div class="rh-timeline">
        <h3>Histórico</h3>
        ${(data.interacoes || []).map(i=>`
          <div class="rh-timeline-item ${i.tipo==='EVENTO'?'event':''}">
            <span></span>
            <div><strong>${escapeHtml(i.usuario_nome || i.autor_nome || 'Sistema')}</strong><p>${escapeHtml(i.mensagem)}</p><small>${fmtDateTime(i.criado_em)}</small></div>
          </div>
        `).join('')}
      </div>

      <form id="rhComentarioForm" class="rh-comment-form">
        <label>Registrar comentário interno</label>
        <textarea name="mensagem" placeholder="Registre uma observação ou atualização do atendimento..." required></textarea>
        <div class="modal-actions"><button class="primary" type="submit">Adicionar comentário</button></div>
      </form>
    `);

    $('rhDetalheStatus').onchange = async e => {
      try { await api(`/api/rh/solicitacoes/${id}/status`,{method:'PUT',body:JSON.stringify({status:e.target.value})}); await verRhSolicitacao(id); }
      catch(err){alert(err.message);}
    };
    $('rhDetalheResponsavel').onchange = async e => {
      try { await api(`/api/rh/solicitacoes/${id}/responsavel`,{method:'PUT',body:JSON.stringify({responsavel_id:e.target.value||null})}); await verRhSolicitacao(id); }
      catch(err){alert(err.message);}
    };
    $('rhComentarioForm').onsubmit = async e => {
      e.preventDefault();
      try { await api(`/api/rh/solicitacoes/${id}/comentarios`,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))}); await verRhSolicitacao(id); }
      catch(err){alert(err.message);}
    };
  } catch (err) { alert(err.message); }
};

async function renderRhTipos() {
  const panel = $('rhPanel');
  panel.innerHTML = '<div class="almox-loading">Carregando tipos...</div>';
  try {
    const tipos = await carregarRhTipos(false);
    panel.innerHTML = `
      <div class="rh-toolbar">
        <div><strong>Tipos de solicitação</strong><span>Essas opções aparecem no formulário usado pelos colaboradores.</span></div>
        <button class="primary" onclick="rhTipoForm()">+ Novo tipo</button>
      </div>
      <section class="dash-panel wide almox-table-wrap">
        <table class="dash-table rh-table">
          <thead><tr><th>Ordem</th><th>Tipo</th><th>Descrição</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>${tipos.map(t=>`<tr><td>${Number(t.ordem)}</td><td><strong>${escapeHtml(t.nome)}</strong></td><td>${escapeHtml(t.descricao || '-')}</td><td>${t.ativo?'Ativo':'Inativo'}</td><td><button onclick="rhTipoForm(${t.id})">Editar</button></td></tr>`).join('')}</tbody>
        </table>
      </section>
    `;
  } catch (err) {
    panel.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`;
  }
}

window.rhTipoForm = async (id = null) => {
  const tipos = state.rhTipos.length ? state.rhTipos : await carregarRhTipos(false);
  const atual = id ? tipos.find(t=>Number(t.id)===Number(id)) : null;
  openModal(atual ? 'Editar tipo de solicitação' : 'Novo tipo de solicitação', `
    <form id="rhTipoForm">
      <label>Nome</label><input name="nome" value="${escapeHtml(atual?.nome || '')}" required>
      <label>Descrição</label><textarea name="descricao">${escapeHtml(atual?.descricao || '')}</textarea>
      <label>Ordem</label><input name="ordem" type="number" value="${Number(atual?.ordem || 0)}">
      ${atual ? `<label class="rh-active-check"><input name="ativo" type="checkbox" ${atual.ativo?'checked':''}> Tipo ativo</label>` : ''}
      <div class="modal-actions"><button type="button" onclick="closeModal()">Cancelar</button><button class="primary" type="submit">Salvar</button></div>
    </form>
  `);
  $('rhTipoForm').onsubmit = async e => {
    e.preventDefault();
    const body=Object.fromEntries(new FormData(e.target));
    if(atual) body.ativo=e.target.elements.ativo.checked;
    try{
      await api(atual?`/api/rh/tipos/${atual.id}`:'/api/rh/tipos',{method:atual?'PUT':'POST',body:JSON.stringify(body)});
      closeModal(); state.rhTipos=[]; await renderRhTipos();
    }catch(err){alert(err.message);}
  };
};

window.entrarRH = entrarRH;
window.abrirRH = abrirRH;


function podeGerenciarUsuario(usuario) {
  const niveis = { colaborador: 1, encarregado: 2, gerente: 3, administrador: 4, administrador_principal: 5 };
  return !usuario.administrador_principal && (niveis[usuario.perfil] || 0) < (niveis[state.usuario?.perfil] || 0);
}

window.mudarAbaConfig = async (aba) => {
  state.configTab = aba;
  renderConfig();
};

function renderConfig() {
  const panel = $('configPanel');
  const principal = state.usuario?.perfil === 'administrador_principal';
  const permitidas = principal ? ['usuarios', 'acessos', 'setores', 'hierarquia'] : ['usuarios', 'acessos', 'hierarquia'];
  if (!permitidas.includes(state.configTab)) state.configTab = 'usuarios';
  const tab = state.configTab;
  panel.innerHTML = `
    <div class="config-hero">
      <div><strong>Central de administração</strong><span>Gerencie usuários, hierarquia, proprietários e acessos aos módulos.</span></div>
      <div class="config-user-badge">${escapeHtml(perfilLabel(state.usuario?.perfil))}</div>
    </div>
    <div class="config-tabs">
      <button class="${tab === 'usuarios' ? 'active' : ''}" onclick="mudarAbaConfig('usuarios')">👥 Usuários</button>
      <button class="${tab === 'acessos' ? 'active' : ''}" onclick="mudarAbaConfig('acessos')">🔐 Acessos aos módulos</button>
      ${principal ? `<button class="${tab === 'setores' ? 'active' : ''}" onclick="mudarAbaConfig('setores')">🗂️ Setores e proprietários</button>` : ''}
      <button class="${tab === 'hierarquia' ? 'active' : ''}" onclick="mudarAbaConfig('hierarquia')">🛡️ Hierarquia</button>
    </div>
    <div id="configConteudo"></div>`;

  if (tab === 'usuarios') renderConfigUsuarios();
  else if (tab === 'acessos') renderConfigAcessos();
  else if (tab === 'setores') renderConfigSetores();
  else renderConfigHierarquia();
}

function renderConfigUsuarios() {
  const conteudo = $('configConteudo');
  conteudo.innerHTML = `
    <div class="dashboard-toolbar">
      <div><strong>Usuários cadastrados</strong><span>Você só pode alterar pessoas de nível inferior ao seu.</span></div>
      <button class="primary" onclick="usuarioForm()">+ Novo usuário</button>
    </div>
    <section class="dash-panel wide">
      <table class="dash-table">
        <thead><tr><th>Nome</th><th>Email/Login</th><th>Perfil</th><th>Setor de vínculo</th><th>Tarefas</th><th>OS</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${(state.usuarios || []).map(u => {
    const pode = podeGerenciarUsuario(u);
    return `<tr><td>${escapeHtml(u.nome)}${u.administrador_principal ? ' <span class="principal-tag">Principal</span>' : ''}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(perfilLabel(u.perfil))}</td><td>${escapeHtml(u.setor_nome || '-')}</td><td>${u.pode_receber_tarefas ? 'Sim' : 'Não'}</td><td>${u.pode_receber_os ? 'Sim' : 'Não'}</td><td>${u.ativo ? 'Ativo' : 'Inativo'}</td><td><div class="task-actions">${pode ? `<button onclick="usuarioForm(${u.id})">✏️</button><button class="danger" onclick="desativarUsuario(${u.id})">🚫</button>` : '<span class="muted">Protegido</span>'}</div></td></tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">Nenhum usuário cadastrado.</td></tr>'}</tbody>
      </table>
    </section>`;
}

async function renderConfigAcessos() {
  const conteudo = $('configConteudo');
  if (!conteudo) return;
  conteudo.innerHTML = '<section class="dash-panel wide"><p class="empty">Carregando acessos...</p></section>';
  try {
    const data = await api('/api/modulos/acessos');
    const modulos = data.modulos || [];
    const usuarios = data.usuarios || [];
    const principalAtual = state.usuario?.perfil === 'administrador_principal';
    const nivel = { colaborador: 1, encarregado: 2, gerente: 3, administrador: 4, administrador_principal: 5 };

    conteudo.innerHTML = `
      <div class="dashboard-toolbar">
        <div><strong>Acessos aos módulos</strong><span>O card só aparece na Central de Módulos quando o usuário possui acesso. O backend também bloqueia acessos diretos sem permissão.</span></div>
      </div>
      <section class="dash-panel wide">
        <div class="module-access-list">
          ${usuarios.map(u => {
      const protegido = u.administrador_principal || u.perfil === 'administrador_principal';
      const podeEditar = !protegido && (nivel[u.perfil] || 0) < (nivel[state.usuario?.perfil] || 0);
      const acessos = Array.isArray(u.modulos) ? u.modulos : [];
      return `<article class="module-access-row" data-access-user="${u.id}">
              <div class="module-access-user">
                <strong>${escapeHtml(u.nome)}${protegido ? ' <span class="principal-tag">Principal</span>' : ''}</strong>
                <small>${escapeHtml(perfilLabel(u.perfil))} • ${escapeHtml(u.email)}${u.ativo ? '' : ' • Inativo'}</small>
              </div>
              <div class="module-access-options">
                ${modulos.map(m => {
        const isAdmin = m.codigo === 'administracao';
        const incompatColab = u.perfil === 'colaborador' && (m.codigo === 'os' || isAdmin);
        const disabled = protegido || !podeEditar || incompatColab || (isAdmin && !principalAtual);
        const checked = protegido || acessos.includes(m.codigo);
        const title = incompatColab ? 'Exige perfil de Encarregado ou superior' : (isAdmin && !principalAtual ? 'Somente o Administrador Principal altera este acesso' : '');
        return `<label class="module-access-check ${disabled ? 'disabled' : ''}" title="${escapeHtml(title || m.descricao || '')}"><input type="checkbox" data-module="${m.codigo}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${escapeHtml(m.nome)}</strong></span></label>`;
      }).join('')}
              </div>
              <div class="module-access-action">${podeEditar ? `<button class="primary" onclick="salvarAcessosModulos(${u.id})">Salvar acessos</button>` : '<span class="muted">Protegido pela hierarquia</span>'}</div>
            </article>`;
    }).join('') || '<p class="empty">Nenhum usuário cadastrado.</p>'}
        </div>
      </section>`;
  } catch (err) {
    conteudo.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`;
  }
}

window.salvarAcessosModulos = async (usuarioId) => {
  const row = document.querySelector(`[data-access-user="${usuarioId}"]`);
  if (!row) return;
  const modulos = [...row.querySelectorAll('[data-module]:checked')].map(i => i.dataset.module);
  const btn = row.querySelector('.module-access-action button');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
  try {
    await api(`/api/modulos/usuarios/${usuarioId}`, { method: 'PUT', body: JSON.stringify({ modulos }) });
    if (btn) btn.textContent = 'Salvo ✓';
    setTimeout(() => renderConfigAcessos(), 650);
  } catch (err) {
    alert(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar acessos'; }
  }
};

async function renderConfigSetores() {
  const conteudo = $('configConteudo');
  if (!conteudo || state.usuario?.perfil !== 'administrador_principal') return;
  conteudo.innerHTML = '<section class="dash-panel wide"><p class="empty">Carregando setores...</p></section>';
  try {
    const setores = await api('/api/admin/setores');
    const usuarios = (state.usuarios || []).filter(u => u.ativo);
    conteudo.innerHTML = `
      <div class="dashboard-toolbar"><div><strong>Proprietários dos setores</strong><span>Todos os setores antigos ficam inicialmente sob seu controle. A transferência não apaga tarefas.</span></div></div>
      <section class="dash-panel wide"><div class="admin-sector-list">${setores.map(s => `
        <div class="admin-sector-row"><div><strong><span class="color-dot" style="background:${s.cor}"></span>${escapeHtml(s.nome)}</strong><small>Proprietário: ${escapeHtml(s.proprietario_nome || 'Não definido')} • ${s.compartilhados || 0} compartilhamento(s)</small></div>
        <select data-owner-sector="${s.id}">${usuarios.map(u => `<option value="${u.id}" ${String(u.id) === String(s.proprietario_id) ? 'selected' : ''}>${escapeHtml(u.nome)} — ${escapeHtml(perfilLabel(u.perfil))}</option>`).join('')}</select>
        <button class="primary" data-save-owner="${s.id}">Salvar proprietário</button></div>`).join('') || '<p class="empty">Nenhum setor cadastrado.</p>'}</div></section>`;
    document.querySelectorAll('[data-save-owner]').forEach(btn => btn.onclick = async () => {
      const id = btn.dataset.saveOwner, sel = document.querySelector(`[data-owner-sector="${id}"]`);
      btn.disabled = true; btn.textContent = 'Salvando...';
      try { await api(`/api/admin/setores/${id}/proprietario`, { method: 'PUT', body: JSON.stringify({ usuario_id: Number(sel.value) }) }); await carregarSetores(false); btn.textContent = 'Salvo ✓'; }
      finally { setTimeout(() => { btn.disabled = false; btn.textContent = 'Salvar proprietário'; }, 900); }
    });
  } catch (err) { conteudo.innerHTML = `<section class="dash-panel wide"><p class="empty">${escapeHtml(err.message)}</p></section>`; }
}

function renderConfigHierarquia() {
  $('configConteudo').innerHTML = `<section class="dash-panel wide hierarchy-panel">
    <h3>Hierarquia oficial da V11</h3>
    <div class="hierarchy-flow"><div>Administrador Principal<small>Controle mestre e proprietário inicial</small></div><span>↓</span><div>Administrador<small>Gerencia gerente, encarregado e colaborador</small></div><span>↓</span><div>Gerente<small>Gerencia encarregado e colaborador</small></div><span>↓</span><div>Encarregado<small>Gerencia colaborador</small></div><span>↓</span><div>Colaborador<small>Sem acesso à gestão de usuários</small></div></div>
    <p class="hint">Nenhum usuário pode editar, desativar ou promover alguém para o mesmo nível ou para um nível superior ao seu.</p>
  </section>`;
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
          ${['administrador', 'gerente', 'encarregado', 'colaborador'].filter(p => ({ administrador: 4, gerente: 3, encarregado: 2, colaborador: 1 })[p] < ({ administrador_principal: 5, administrador: 4, gerente: 3, encarregado: 2, colaborador: 1 })[state.usuario?.perfil]).map(p => `<option value="${p}" ${usuario?.perfil === p ? 'selected' : ''}>${perfilLabel(p)}</option>`).join('')}
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
$('btnHome').onclick = abrirHome;
$('cardAtividades').onclick = entrarAtividades;
$('cardOS').onclick = entrarOS;
$('cardAdmin').onclick = entrarAdmin;
$('cardAlmoxarifado').onclick = entrarAlmoxarifado;
$('cardGalpao').onclick = entrarGalpao;
$('cardRH').onclick = entrarRH;
$('btnGalpaoDashboard')?.addEventListener('click', () => abrirGalpao('dashboard'));
$('btnGalpaoValidades')?.addEventListener('click', () => abrirGalpao('validades'));
$('btnGalpaoImportar')?.addEventListener('click', () => abrirGalpao('importar'));
$('btnRhDashboard')?.addEventListener('click', () => abrirRH('dashboard'));
$('btnRhSolicitacoes')?.addEventListener('click', () => abrirRH('solicitacoes'));
$('btnRhTipos')?.addEventListener('click', () => abrirRH('tipos'));
$('btnRhNovaPublica')?.addEventListener('click', () => window.open('/solicitar-rh.html','_blank'));
$('btnAlmoxDashboard')?.addEventListener('click', () => abrirAlmoxarifado('dashboard'));
$('btnDashboard').onclick = abrirDashboard;
$('btnOS').onclick = abrirOS;
$('btnMinhas').onclick = abrirMinhas;
$('btnConfig').onclick = abrirConfig;
$('btnSolicitarOS').onclick = () => window.open('/solicitar-os.html', '_blank');
window.abrirGestaoSetores = async () => { state.configTab = 'setores'; await abrirConfig(); };

$('btnNovoSetor').onclick = () => setorForm();
$('btnCompartilharSetor').onclick = compartilharSetor;
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
