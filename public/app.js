import { renderMarkdown, esc } from './md.js';

/* ============================== Utilidades ============================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ico = (d, extra = '') => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  git: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 4-6 3-11 5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  chev: '<path d="M7 10l5 5 5-5"/>',
};

const store = {
  get: (k, d = null) => { try { return JSON.parse(localStorage.getItem(`occ:${k}`)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(`occ:${k}`, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'occloud' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') {
    showLogin();
    throw new Error('Sesión caducada');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { data });
  return data;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3200);
}

function openModal(title, html, { wide = false } = {}) {
  const back = document.createElement('div');
  back.className = 'backdrop';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <h2><span>${esc(title)}</span><button class="icon-btn" data-close aria-label="Cerrar">${ico(I.x)}</button></h2>
    <div class="modal-body">${html}</div></div>`;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  return { el: back, body: $('.modal-body', back), close };
}

async function busyBtn(btn, label, fn) {
  const prev = btn.textContent;
  btn.disabled = true;
  if (label) btn.textContent = label;
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = prev; }
}

const fmtDate = (ms) => new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/* ============================== Estado ============================== */
const state = {
  projects: [],
  project: null,
  sessions: [],
  sessionId: null,
  messages: [],
  busy: false,
  busyGrace: 0,
  models: null,
  model: store.get('model'),
  // En pantallas pequeñas Git es una hoja que empieza cerrada; en ≥1200px se recuerda la preferencia
  gitOpen: matchMedia('(min-width: 1200px)').matches ? store.get('gitOpen', false) : false,
  git: null,
  gitOutput: '',
  update: null,
  perms: new Map(),
  navOpen: false,
};
let events = null;
let installPromptEvent = null;

// Enlaces de GitHub para crear/gestionar el token (con nombre y permisos ya rellenados)
const GH_TOKEN_FINE = 'https://github.com/settings/personal-access-tokens/new?name=OpenCode+Cloud&description=Token+para+OpenCode+Cloud+%28clonar%2C+push+y+pull+requests%29&expires_in=90&contents=write&pull_requests=write';
const GH_TOKEN_CLASSIC = 'https://github.com/settings/tokens/new?scopes=repo&description=OpenCode+Cloud';
const GH_TOKENS_PAGE = 'https://github.com/settings/tokens';

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function updateOnlineBanner() {
  $('#offline')?.classList.toggle('hidden', navigator.onLine);
}

/* ============================== PWA ============================== */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPromptEvent = e;
  if ($('#sidebar')) renderSidebar();
});
window.addEventListener('appinstalled', () => {
  installPromptEvent = null;
  if ($('#sidebar')) renderSidebar();
  toast('Aplicación instalada');
});
window.addEventListener('online', updateOnlineBanner);
window.addEventListener('offline', updateOnlineBanner);

async function installApp() {
  if (!installPromptEvent) return;
  installPromptEvent.prompt();
  await installPromptEvent.userChoice.catch(() => {});
  installPromptEvent = null;
  renderSidebar();
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* sin SW: la app funciona igual, solo sin modo sin conexión */ });
  });
}

// Altura real de la ventana visible (teclado en pantalla): mantiene el campo de mensaje a la vista, también en iOS
(function trackViewport() {
  const vv = window.visualViewport;
  const apply = () => {
    document.documentElement.style.setProperty('--app-h', `${Math.round(vv ? vv.height : innerHeight)}px`);
    if (vv && vv.offsetTop) window.scrollTo(0, 0);
  };
  apply();
  (vv || window).addEventListener('resize', apply);
  vv?.addEventListener('scroll', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 250));
})();

/* ============================== Login ============================== */
function showLogin() {
  closeEvents();
  $('#root').innerHTML = `
    <div class="login"><form class="login-card" id="login-form">
      <div class="logo">${ico(I.code, 'stroke="#fff" stroke-width="2.4"')}</div>
      <h1>OpenCode Cloud</h1>
      <p class="muted" style="margin:0 0 20px">Inicia sesión para continuar</p>
      <div class="field"><label for="pw">Contraseña</label><input id="pw" type="password" autocomplete="current-password" autofocus required></div>
      <button class="btn primary" style="width:100%" type="submit">Entrar</button>
    </form></div>`;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', e.target);
    try {
      await busyBtn(btn, 'Entrando…', () => api('POST', '/api/login', { password: $('#pw').value }));
      await mountApp();
    } catch (err) {
      toast(err.message, 'err');
      $('#pw').select();
    }
  });
}

/* ============================== Estructura ============================== */
async function mountApp() {
  $('#root').innerHTML = `
    <div class="app" id="app">
      <div class="scrim" id="scrim" data-act="close-panels"></div>
      <aside class="sidebar" id="sidebar" aria-label="Proyectos"></aside>
      <section class="main" id="main">
        <header class="topbar" id="topbar"></header>
        <div class="offline hidden" id="offline" role="status">Sin conexión: no se pueden enviar mensajes hasta que vuelva la red.</div>
        <div class="chat" id="chat"><div class="chat-inner" id="chat-inner"></div></div>
        <button class="to-bottom hidden" id="to-bottom" aria-label="Ir al final">${ico(I.down)}</button>
        <div class="composer-wrap">
          <div class="composer">
            <textarea id="input" rows="1" placeholder="Pide algo a OpenCode…" aria-label="Mensaje"></textarea>
            <div class="composer-bar">
              <button class="model-btn" id="model-btn" type="button" data-act="model-picker" aria-haspopup="dialog" aria-label="Elegir modelo"></button>
              <span class="grow"></span>
              <button class="send" id="send" aria-label="Enviar">${ico(I.send)}</button>
            </div>
          </div>
        </div>
      </section>
      <aside class="gitpanel" id="gitpanel" aria-label="Control de versiones"></aside>
    </div>`;

  bindShell();
  updateOnlineBanner();
  await Promise.all([loadProjects(), loadModels(), loadUpdate(false)]);
  renderAll();
  const last = store.get('project');
  const target = state.projects.find((p) => p.id === last) || state.projects[0];
  if (target) await selectProject(target.id);
  else renderMessages();
  if (!timersStarted) {
    timersStarted = true;
    setInterval(pollStatus, 2500);
    setInterval(() => { if ($('#sidebar')) loadUpdate(false); }, 10 * 60_000);
  }
}
let timersStarted = false;

function renderAll() {
  renderSidebar();
  renderTopbar();
  renderMessages();
  renderModels();
  renderGit();
  applyPanelState();
  updateSendButton();
}

// Estado de los paneles: cajón lateral (móvil), hoja/columna de Git
function applyPanelState() {
  const app = $('#app');
  if (!app) return;
  const gitOpen = state.gitOpen && !!state.project;
  app.classList.toggle('git-open', gitOpen);
  app.classList.toggle('nav-open', state.navOpen);
  $('#gitpanel')?.setAttribute('aria-hidden', String(!gitOpen));
}

function closePanels() {
  const wasGit = state.gitOpen;
  state.navOpen = false;
  if (matchMedia('(max-width: 1199px)').matches) state.gitOpen = false; // en pantallas pequeñas Git se comporta como hoja
  applyPanelState();
  if (wasGit && !state.gitOpen) store.set('gitOpen', false);
}

/* ============================== Sidebar ============================== */
function renderSidebar() {
  const upd = state.update;
  const items = state.projects.map((p) => {
    const active = p.id === state.project?.id;
    const sess = active
      ? `<div class="sessions">
          <div class="sess" data-act="new-session">${ico(I.plus, 'width="14" height="14"')}<span class="name">Nueva conversación</span></div>
          ${state.sessions.map((s) => `
            <div class="sess ${s.id === state.sessionId ? 'active' : ''}" data-act="select-session" data-id="${esc(s.id)}">
              <span class="name">${esc(s.title || 'Sin título')}</span>
              <button class="icon-btn del" data-act="del-session" data-id="${esc(s.id)}" title="Eliminar conversación" style="width:24px;height:24px">${ico(I.x, 'width="13" height="13"')}</button>
            </div>`).join('')}
        </div>` : '';
    return `<div class="proj ${active ? 'active' : ''}" data-act="select-project" data-id="${esc(p.id)}">
        <span class="name">${esc(p.name)}</span>
        <button class="icon-btn more" data-act="project-menu" data-id="${esc(p.id)}" title="Opciones" style="width:26px;height:26px">${ico(I.more, 'width="16" height="16"')}</button>
      </div>${sess}`;
  }).join('');

  $('#sidebar').innerHTML = `
    <div class="brand"><span class="logo">${ico(I.code, 'stroke="#fff" stroke-width="2.6"')}</span><span class="grow">OpenCode Cloud</span><button class="icon-btn menu-btn" data-act="close-panels" aria-label="Cerrar menú">${ico(I.x)}</button></div>
    <div class="side-actions"><button class="btn primary" data-act="new-project">${ico(I.plus, 'width="16" height="16"')} Nuevo proyecto</button></div>
    <div class="side-scroll">
      <div class="side-title">Proyectos</div>
      ${items || '<p class="muted" style="padding:8px">Aún no tienes proyectos. Crea uno o clona un repositorio de GitHub.</p>'}
    </div>
    <div class="side-foot">
      ${installPromptEvent && !isStandalone() ? `<button class="install-pill" data-act="install-app"><span>${ico(I.down, 'width="16" height="16"')}</span><span><strong>Instalar aplicación</strong><br><span class="muted">Añádela a tu pantalla de inicio</span></span></button>` : ''}
      ${upd?.behind ? `<button class="update-pill" data-act="settings" data-section="update"><span class="dot"></span><span><strong>Actualización disponible</strong><br><span class="muted">${upd.behind} cambio${upd.behind > 1 ? 's' : ''} nuevo${upd.behind > 1 ? 's' : ''} en GitHub</span></span></button>` : ''}
      <div class="row">
        <button class="btn grow" data-act="settings">${ico(I.gear, 'width="16" height="16"')} Ajustes</button>
        <button class="icon-btn" data-act="logout" title="Cerrar sesión">${ico(I.logout)}</button>
      </div>
    </div>`;
}

function renderTopbar() {
  const p = state.project;
  const st = state.git?.status;
  $('#topbar').innerHTML = `
    <button class="icon-btn menu-btn" data-act="toggle-nav" aria-label="Menú">${ico(I.menu)}</button>
    <h2 class="grow">${p ? esc(p.name) : 'OpenCode Cloud'}</h2>
    ${p && st ? `<span class="chip ${st.merging ? 'err' : ''}">${esc(st.branch || '—')}${st.ahead ? ` ↑${st.ahead}` : ''}${st.behind ? ` ↓${st.behind}` : ''}</span>` : ''}
    ${p ? `<button class="btn small" data-act="toggle-git" aria-label="Control de versiones">${ico(I.git, 'width="16" height="16"')}<span class="git-label">Git</span></button>` : ''}`;
}

/* ============================== Datos ============================== */
async function loadProjects() {
  state.projects = await api('GET', '/api/projects');
}

async function loadModels() {
  try {
    state.models = await api('GET', '/api/models');
  } catch {
    state.models = null;
  }
}

async function loadUpdate(refresh) {
  try {
    state.update = await api('GET', `/api/update/status${refresh ? '?refresh=1' : ''}`);
  } catch { /* sin conexión con GitHub */ }
  if ($('#sidebar')) renderSidebar();
}

async function selectProject(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  // Si el cajón está abierto (móvil), se deja abierto para poder elegir conversación
  const keepNav = state.navOpen;
  state.project = p;
  state.sessions = [];
  state.sessionId = null;
  state.messages = [];
  state.busy = false;
  state.git = null;
  state.perms.clear();
  store.set('project', id);
  renderAll();
  connectEvents();
  await Promise.all([loadSessions(), loadGit()]);
  const remembered = store.get(`session:${id}`);
  const target = state.sessions.find((s) => s.id === remembered) || state.sessions[0];
  if (target) await selectSession(target.id, keepNav);
  else renderAll();
}

async function loadSessions() {
  if (!state.project) return;
  try {
    state.sessions = await api('GET', `/api/projects/${state.project.id}/sessions`);
  } catch (e) {
    toast(`No se pudieron cargar las conversaciones: ${e.message}`, 'err');
  }
  renderSidebar();
}

async function selectSession(id, keepNav = false) {
  state.sessionId = id;
  state.messages = [];
  state.perms.clear();
  store.set(`session:${state.project.id}`, id);
  if (!keepNav) state.navOpen = false;
  renderAll();
  await refreshMessages(true);
  await pollStatus(true);
}

async function newSession() {
  const s = await api('POST', `/api/projects/${state.project.id}/sessions`, {});
  state.sessions.unshift(s);
  await selectSession(s.id);
  $('#input').focus();
}

async function refreshMessages(forceScroll = false) {
  if (!state.project || !state.sessionId) return;
  const pid = state.project.id;
  const sid = state.sessionId;
  try {
    const msgs = await api('GET', `/api/projects/${pid}/sessions/${sid}/messages`);
    if (state.sessionId !== sid) return;
    state.messages = msgs;
    renderMessages(forceScroll);
  } catch (e) {
    if (e.message !== 'Sesión caducada') toast(e.message, 'err');
  }
}

async function pollStatus(initial = false) {
  if (!state.project || !state.sessionId || (!state.busy && !initial)) return;
  try {
    const st = await api('GET', `/api/projects/${state.project.id}/status`);
    const cur = st[state.sessionId];
    const running = Boolean(cur && cur.type !== 'idle');
    if (running) setBusy(true);
    else if (Date.now() > state.busyGrace) {
      const was = state.busy;
      setBusy(false);
      if (was) { await refreshMessages(); loadSessions(); }
    }
  } catch { /* se reintenta en el siguiente ciclo */ }
}

function setBusy(v) {
  state.busy = v;
  updateSendButton();
  renderTyping();
}

/* ============================== Eventos (SSE) ============================== */
function closeEvents() {
  if (events) { events.close(); events = null; }
}

function connectEvents() {
  closeEvents();
  if (!state.project) return;
  events = new EventSource(`/api/projects/${state.project.id}/events`);
  events.onmessage = (e) => {
    try { handleEvent(JSON.parse(e.data)); } catch { /* evento no JSON */ }
  };
}

let refreshTimer = null;
const scheduleRefresh = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshMessages(), 180);
};
let sessionsTimer = null;

function handleEvent(ev) {
  const t = ev.type || '';
  const p = ev.properties || {};
  const sid = p.sessionID || p.info?.sessionID || p.part?.sessionID;
  const mine = sid && sid === state.sessionId;

  if (t === 'session.idle' && mine) {
    state.busyGrace = 0;
    setBusy(false);
    refreshMessages();
    loadSessions();
  } else if (t === 'session.status' && mine) {
    const running = p.status?.type && p.status.type !== 'idle';
    if (running) setBusy(true);
    else if (Date.now() > state.busyGrace) setBusy(false);
  } else if (t === 'session.error' && mine) {
    setBusy(false);
    const m = p.error?.data?.message || p.error?.name;
    if (m) toast(m, 'err');
    refreshMessages();
  } else if (t.startsWith('message.') && mine) {
    if (!state.busy) setBusy(true);
    scheduleRefresh();
  } else if (t === 'session.updated' || t === 'session.created' || t === 'session.deleted') {
    clearTimeout(sessionsTimer);
    sessionsTimer = setTimeout(loadSessions, 400);
  } else if ((t === 'permission.updated' || t === 'permission.asked') && (p.sessionID === state.sessionId)) {
    state.perms.set(p.id, p);
    renderPerms();
  } else if (t === 'permission.replied') {
    state.perms.delete(p.permissionID || p.requestID || p.id);
    renderPerms();
  }
}

/* ============================== Mensajes ============================== */
function toolSummary(part) {
  const s = part.state || {};
  const i = s.input || {};
  return s.title || i.command || i.filePath || i.path || i.pattern || i.url || i.description || '';
}

function renderTool(part) {
  const s = part.state || {};
  const status = s.status || 'pending';
  const input = s.input && Object.keys(s.input).length ? JSON.stringify(s.input, null, 2) : '';
  const out = typeof s.output === 'string' ? s.output : s.error || '';
  const body = [input && `// entrada\n${input}`, out && `// salida\n${out.slice(0, 4000)}${out.length > 4000 ? '\n…' : ''}`].filter(Boolean).join('\n\n');
  return `<details class="tool" data-key="${esc(part.id)}">
    <summary><span class="status-dot ${esc(status)}"></span><span class="tname">${esc(part.tool || 'herramienta')}</span><span class="tsub">${esc(toolSummary(part))}</span></summary>
    ${body ? `<pre>${esc(body)}</pre>` : ''}</details>`;
}

function renderMessage(msg) {
  const { info, parts = [] } = msg;
  if (info.role === 'user') {
    const text = parts.filter((p) => p.type === 'text' && !p.synthetic).map((p) => p.text).join('\n').trim();
    return text ? `<div class="msg user">${esc(text)}</div>` : '';
  }
  let html = '';
  for (const p of parts) {
    if (p.type === 'text' && p.text) html += renderMarkdown(p.text);
    else if (p.type === 'reasoning' && p.text?.trim()) html += `<details class="reasoning" data-key="${esc(p.id)}"><summary>Razonamiento</summary><div class="rbody">${esc(p.text)}</div></details>`;
    else if (p.type === 'tool') html += renderTool(p);
  }
  if (info.error) html += `<div class="banner err">${esc(info.error.data?.message || info.error.name || 'Error')}</div>`;
  return html ? `<div class="msg assistant">${html}</div>` : '';
}

function renderMessages(forceScroll = false) {
  const chat = $('#chat');
  const inner = $('#chat-inner');
  if (!chat) return;
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 140;
  const open = new Set($$('details[open]', inner).map((d) => d.dataset.key));

  if (!state.project) {
    inner.innerHTML = `<div class="empty"><div class="logo" style="margin:0 auto">${ico(I.code, 'stroke="#fff" stroke-width="2.4"')}</div><h1>Bienvenido</h1><p class="muted">Crea un proyecto o clona uno desde GitHub para empezar a trabajar con OpenCode.</p><p><button class="btn primary" data-act="new-project">Nuevo proyecto</button></p></div>`;
    return;
  }
  const html = state.messages.map(renderMessage).join('');
  inner.innerHTML = (html || `<div class="empty"><h1>${esc(state.project.name)}</h1><p class="muted">Escribe tu primera petición abajo. OpenCode trabajará dentro de este proyecto.</p></div>`)
    + '<div id="typing"></div><div id="perms"></div>';
  $$('details', inner).forEach((d) => { if (open.has(d.dataset.key)) d.open = true; });
  renderTyping();
  renderPerms();
  if (forceScroll || nearBottom) chat.scrollTop = chat.scrollHeight;
}

function renderTyping() {
  const el = $('#typing');
  if (el) el.innerHTML = state.busy ? '<span class="typing"><i></i><i></i><i></i></span>' : '';
}

function renderPerms() {
  const el = $('#perms');
  if (!el) return;
  el.innerHTML = [...state.perms.values()].map((p) => `
    <div class="perm" data-pid="${esc(p.id)}">
      <strong>OpenCode solicita permiso</strong><br>
      <span class="muted">${esc(p.title || p.permission || p.type || 'acción')}</span>
      ${p.pattern || p.patterns ? `<pre class="output">${esc([].concat(p.pattern || p.patterns).join('\n'))}</pre>` : ''}
      <div class="row">
        <button class="btn small primary" data-act="perm" data-r="once">Permitir una vez</button>
        <button class="btn small" data-act="perm" data-r="always">Permitir siempre</button>
        <button class="btn small danger" data-act="perm" data-r="reject">Rechazar</button>
      </div>
    </div>`).join('');
  const chat = $('#chat');
  if (state.perms.size) chat.scrollTop = chat.scrollHeight;
}

/* ============================== Composer ============================== */
// Dónde crear la API key de cada proveedor (id de OpenCode → enlace y nota)
const PROVIDER_HELP = {
  nvidia: { url: 'https://build.nvidia.com/settings/api-keys', note: 'Usa la clave de build.nvidia.com (botón «Get API Key» de cualquier modelo). Las claves de NGC solo valen si incluyen «Public API Endpoints»; si no, da error 403.' },
  openrouter: { url: 'https://openrouter.ai/keys', note: 'Una sola clave para muchos modelos; algunos son gratuitos.' },
  anthropic: { url: 'https://console.anthropic.com/settings/keys' },
  openai: { url: 'https://platform.openai.com/api-keys' },
  google: { url: 'https://aistudio.google.com/apikey', note: 'Clave de Google AI Studio (Gemini).' },
  deepseek: { url: 'https://platform.deepseek.com/api_keys' },
  groq: { url: 'https://console.groq.com/keys' },
  mistral: { url: 'https://console.mistral.ai/api-keys' },
  xai: { url: 'https://console.x.ai' },
  togetherai: { url: 'https://api.together.ai/settings/api-keys' },
  'fireworks-ai': { url: 'https://fireworks.ai/account/api-keys' },
  cerebras: { url: 'https://cloud.cerebras.ai' },
};
const providerHelpHtml = (id) => {
  const h = PROVIDER_HELP[id];
  if (!h) return '';
  return `<a class="btn" href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">Conseguir la clave ↗</a>${h.note ? `<p class="muted" style="margin:6px 0 0">${esc(h.note)}</p>` : ''}`;
};

const modelKey = (p, m) => `${p.id}::${m.id}`;

function allModels() {
  const out = [];
  for (const p of state.models?.providers || []) for (const m of p.models) out.push({ key: modelKey(p, m), provider: p.name, name: m.name });
  return out;
}

function renderModels() {
  const btn = $('#model-btn');
  if (!btn) return;
  const providers = state.models?.providers || [];
  if (!providers.length) {
    btn.textContent = 'Sin modelos: configura una API key';
    btn.dataset.empty = '1';
    return;
  }
  delete btn.dataset.empty;
  const list = allModels();
  const favs = (state.models.favorites || []).filter((k) => list.some((x) => x.key === k));
  const defaults = state.models.defaults || {};
  let value = state.model;
  if (!list.some((x) => x.key === value)) {
    const p = providers[0];
    value = favs[0] || `${p.id}::${defaults[p.id] || p.models[0]?.id}`;
  }
  state.model = value;
  const cur = list.find((x) => x.key === value);
  btn.innerHTML = `<span class="model-name">${esc(cur?.name || value)}</span>${ico(I.chev, 'width="16" height="16"')}`;
}

function modelPicker() {
  const providers = state.models?.providers || [];
  if (!providers.length) return;
  const m = openModal('Elegir modelo', `
    <input id="mp-q" type="search" placeholder="Buscar modelo…" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore="true" data-lpignore="true">
    <p class="muted" style="margin:8px 0 0">Marca con ★ los que más usas y saldrán arriba.</p>
    <div id="mp-list"></div>`, {});
  const row = (x) => {
    const fav = (state.models.favorites || []).includes(x.key);
    return `<div class="mp-row ${x.key === state.model ? 'sel' : ''}"><button class="mp-pick" data-key="${esc(x.key)}"><span class="mp-name">${esc(x.name)}</span><span class="mp-prov">${esc(x.provider)}</span></button><button class="mp-star ${fav ? 'on' : ''}" data-fav="${esc(x.key)}" aria-label="${fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}" aria-pressed="${fav}">${ico(I.star, `width="20" height="20" ${fav ? 'style="fill:currentColor"' : ''}`)}</button></div>`;
  };
  const draw = () => {
    const term = $('#mp-q', m.el).value.trim().toLowerCase();
    const match = (x) => !term || `${x.name} ${x.provider} ${x.key}`.toLowerCase().includes(term);
    const list = allModels().filter(match);
    const favKeys = state.models.favorites || [];
    const favs = favKeys.map((k) => list.find((x) => x.key === k)).filter(Boolean);
    let html = '';
    if (favs.length) html += `<h3>★ Favoritos</h3>${favs.map(row).join('')}`;
    const groups = new Map();
    for (const x of list) { if (!groups.has(x.provider)) groups.set(x.provider, []); groups.get(x.provider).push(x); }
    for (const [name, items] of groups) html += `<h3>${esc(name)} <span class="muted">· ${items.length}</span></h3>${items.map(row).join('')}`;
    $('#mp-list', m.el).innerHTML = html || '<p class="muted">Sin resultados.</p>';
  };
  draw();
  $('#mp-q', m.el).addEventListener('input', draw);
  $('#mp-list', m.el).addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-key]');
    const star = e.target.closest('[data-fav]');
    if (pick) {
      state.model = pick.dataset.key; store.set('model', state.model); renderModels(); m.close();
    } else if (star) {
      const k = star.dataset.fav;
      const prev = state.models.favorites || [];
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      state.models.favorites = next;
      const top = $('.modal-body', m.el).scrollTop;
      draw(); $('.modal-body', m.el).scrollTop = top;
      try { await api('PUT', '/api/models/favorites', { favorites: next }); } catch (err) { state.models.favorites = prev; draw(); toast(err.message, 'err'); }
    }
  });
  setTimeout(() => { if (matchMedia('(min-width: 860px)').matches) $('#mp-q', m.el)?.focus(); }, 50);
}

function updateSendButton() {
  const b = $('#send');
  if (!b) return;
  b.classList.toggle('stop', state.busy);
  b.innerHTML = ico(state.busy ? I.stop : I.send);
  b.setAttribute('aria-label', state.busy ? 'Detener' : 'Enviar');
  b.disabled = !state.project;
}

async function sendMessage(text) {
  if (!state.project) return;
  text = text.trim();
  if (!text) return;
  try {
    if (!state.sessionId) {
      const s = await api('POST', `/api/projects/${state.project.id}/sessions`, {});
      state.sessions.unshift(s);
      state.sessionId = s.id;
      store.set(`session:${state.project.id}`, s.id);
      renderSidebar();
    }
    const [providerID, modelID] = (state.model || '').split('::');
    state.messages.push({ info: { id: 'tmp', role: 'user' }, parts: [{ type: 'text', text }] });
    state.busyGrace = Date.now() + 5000;
    setBusy(true);
    renderMessages(true);
    await api('POST', `/api/projects/${state.project.id}/sessions/${state.sessionId}/send`, {
      text,
      model: providerID && modelID ? { providerID, modelID } : undefined,
    });
    scheduleRefresh();
  } catch (e) {
    state.busyGrace = 0;
    setBusy(false);
    toast(e.message, 'err');
    refreshMessages();
  }
}

async function submitInput() {
  const input = $('#input');
  if (state.busy) {
    try { await api('POST', `/api/projects/${state.project.id}/sessions/${state.sessionId}/abort`); } catch (e) { toast(e.message, 'err'); }
    return;
  }
  const text = input.value;
  if (!text.trim()) return;
  input.value = '';
  autosize(input);
  await sendMessage(text);
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
}

/* ============================== Git ============================== */
async function loadGit() {
  if (!state.project) return;
  try {
    state.git = await api('GET', `/api/projects/${state.project.id}/git/overview`);
  } catch (e) {
    state.git = { error: e.message };
  }
  renderTopbar();
  renderGit();
}

const GIT_LABEL = { M: 'M', A: 'A', D: 'D', R: 'R', '?': '?' };
function fileXY(xy) { return (xy.trim()[0] || '?'); }

function renderGit() {
  const el = $('#gitpanel');
  if (!el || !state.project || !state.gitOpen) return;
  const g = state.git;
  if (!g) { el.innerHTML = '<p class="muted">Cargando…</p>'; return; }
  if (g.error) { el.innerHTML = `<div class="banner err">${esc(g.error)}</div>`; return; }
  const st = g.status;
  if (!g.branches.local.length && st.branch) g.branches.local = [st.branch];
  const otherBranches = [...new Set([...g.branches.local, ...g.branches.remote])].filter((b) => b !== st.branch);
  const isGithub = /^https:\/\/github\.com\//i.test(st.remote || '');

  const conflictBanner = st.merging ? `
    <div class="banner err">
      <strong>Fusión en curso${st.conflicts.length ? ' con conflictos' : ''}</strong>
      ${st.conflicts.length ? `<div class="files" style="margin:8px 0">${st.conflicts.map((c) => `<div><span class="xy c">UU</span>${esc(c)}</div>`).join('')}</div>` : '<p style="margin:6px 0">Sin conflictos pendientes: confirma para terminar la fusión.</p>'}
      <div class="row wrap">
        ${st.conflicts.length ? '<button class="btn small primary" data-act="ai-resolve">Pedir a OpenCode que los resuelva</button>' : ''}
        <button class="btn small danger" data-act="merge-abort">Abortar fusión</button>
      </div>
    </div>` : '';

  el.innerHTML = `
    <div class="row"><h3 class="grow">Control de versiones</h3><button class="icon-btn" data-act="toggle-git" aria-label="Cerrar">${ico(I.x)}</button></div>
    ${conflictBanner}

    <div class="card"><h4>Repositorio remoto</h4>
      ${st.remote ? `<div class="muted" style="word-break:break-all;font-size:13px">${esc(st.remote)}</div>`
        : `<div class="field" style="margin:0"><input id="remote-url" type="url" placeholder="https://github.com/usuario/repo.git"><button class="btn small" style="margin-top:8px" data-act="set-remote">Conectar con GitHub</button></div>`}
    </div>

    <div class="card"><h4>Rama</h4>
      <div class="row"><select id="branch-select" class="grow">${g.branches.local.map((b) => `<option ${b === st.branch ? 'selected' : ''}>${esc(b)}</option>`).join('')}${g.branches.remote.map((b) => `<option value="${esc(b)}">${esc(b)} (remota)</option>`).join('')}</select>
      <button class="btn small" data-act="new-branch">Nueva</button></div>
    </div>

    <div class="card"><h4>Sincronizar</h4>
      <div class="row wrap" style="margin-bottom:8px">
        <span class="chip">↑ ${st.ahead} por subir</span><span class="chip">↓ ${st.behind} por bajar</span>
      </div>
      <div class="row wrap">
        <button class="btn small" data-act="git-fetch" ${st.remote ? '' : 'disabled'}>Fetch</button>
        <button class="btn small" data-act="git-pull" ${st.remote && !st.merging ? '' : 'disabled'}>Pull (fusionar)</button>
        <button class="btn small primary" data-act="git-push" ${st.remote && st.hasCommits ? '' : 'disabled'}>Push</button>
      </div>
    </div>

    <div class="card"><h4>Fusionar rama en «${esc(st.branch)}»</h4>
      ${otherBranches.length ? `<div class="row"><select id="merge-select" class="grow">${otherBranches.map((b) => `<option>${esc(b)}</option>`).join('')}</select>
      <button class="btn small" data-act="git-merge" ${st.merging ? 'disabled' : ''}>Fusionar</button></div>` : '<p class="muted" style="margin:0;font-size:13px">No hay otras ramas.</p>'}
      ${isGithub ? '<div class="row" style="margin-top:10px"><button class="btn small" data-act="pr-new">Crear Pull Request</button><button class="btn small" data-act="pr-list">Ver PRs abiertos</button></div>' : ''}
    </div>

    <div class="card"><h4>Cambios (${st.files.length})</h4>
      ${st.files.length ? `<div class="files">${st.files.map((f) => `<div><span class="xy ${st.conflicts.includes(f.path) ? 'c' : ''}">${esc(GIT_LABEL[fileXY(f.xy)] || fileXY(f.xy))}</span><span>${esc(f.path)}</span></div>`).join('')}</div>
      <div class="field" style="margin:10px 0 0"><input id="commit-msg" type="text" placeholder="Mensaje del commit" maxlength="200"></div>
      <div class="row wrap" style="margin-top:8px"><button class="btn small primary" data-act="git-commit">Commit</button><button class="btn small" data-act="git-commit-push" ${st.remote ? '' : 'disabled'}>Commit y push</button></div>`
        : '<p class="muted" style="margin:0;font-size:13px">Sin cambios pendientes.</p>'}
    </div>

    ${state.gitOutput ? `<div class="output">${esc(state.gitOutput)}</div>` : ''}

    <div class="card"><h4>Historial</h4><div class="log">${g.log.length ? g.log.map((c) => `<div><span class="h">${esc(c.hash)}</span>${esc(c.subject)}<br><span class="muted">${esc(c.author)} · ${esc(c.when)}</span></div>`).join('') : '<span class="muted">Sin commits.</span>'}</div></div>`;
}

async function gitAction(btn, label, path, body, { successMsg } = {}) {
  const id = state.project.id;
  return busyBtn(btn, label, async () => {
    try {
      const r = await api('POST', `/api/projects/${id}/git/${path}`, body || {});
      state.gitOutput = (r.output || '').trim();
      if (r.conflict) toast('Hay conflictos que resolver', 'err');
      else toast(successMsg || 'Hecho');
      await loadGit();
      return r;
    } catch (e) {
      state.gitOutput = e.data?.output || e.message;
      toast(e.message.split('\n')[0].slice(0, 160), 'err');
      await loadGit();
    }
  });
}

async function aiResolveConflicts() {
  const files = state.git?.status?.conflicts || [];
  if (!files.length) return;
  state.navOpen = false;
  await sendMessage(`Hay una fusión de git en curso con conflictos en estos archivos:\n${files.map((f) => `- ${f}`).join('\n')}\n\nResuélvelos conservando los cambios de ambas ramas cuando tenga sentido, elimina todos los marcadores de conflicto (<<<<<<<, =======, >>>>>>>) y comprueba que el proyecto sigue siendo coherente. No hagas commit: lo revisaré yo.`);
}

function prNewModal() {
  const st = state.git.status;
  const branches = [...new Set([...state.git.branches.local, ...state.git.branches.remote])];
  const m = openModal('Crear Pull Request', `
    <p class="muted" style="margin-top:0">Se creará en GitHub desde la rama <code>${esc(st.branch)}</code>. Recuerda hacer push antes.</p>
    <div class="field"><label>Rama destino</label><select id="pr-base">${branches.filter((b) => b !== st.branch).map((b) => `<option ${b === 'main' ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>
    <div class="field"><label>Título</label><input id="pr-title" type="text" maxlength="200"></div>
    <div class="field"><label>Descripción</label><textarea id="pr-body" rows="4"></textarea></div>
    <button class="btn primary" id="pr-go">Crear Pull Request</button>`);
  $('#pr-go', m.el).addEventListener('click', async (e) => {
    try {
      const r = await busyBtn(e.target, 'Creando…', () => api('POST', `/api/projects/${state.project.id}/github/pulls`, { title: $('#pr-title', m.el).value, body: $('#pr-body', m.el).value, head: st.branch, base: $('#pr-base', m.el).value }));
      m.close();
      toast(`PR #${r.number} creado`);
      state.gitOutput = r.url;
      renderGit();
    } catch (err) { toast(err.message, 'err'); }
  });
}

async function prListModal() {
  const m = openModal('Pull Requests abiertos', '<p class="muted">Cargando…</p>');
  try {
    const prs = await api('GET', `/api/projects/${state.project.id}/github/pulls`);
    m.body.innerHTML = prs.length ? prs.map((p) => `
      <div class="card" style="margin-bottom:10px">
        <strong>#${p.number} ${esc(p.title)}</strong>
        <div class="muted" style="font-size:13px">${esc(p.head)} → ${esc(p.base)} · ${esc(p.user || '')}${p.draft ? ' · borrador' : ''}</div>
        <div class="row wrap" style="margin-top:8px">
          <a class="btn small" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Abrir en GitHub</a>
          <button class="btn small primary" data-merge="${p.number}" data-method="merge">Fusionar</button>
          <button class="btn small" data-merge="${p.number}" data-method="squash">Squash</button>
        </div>
      </div>`).join('') : '<p class="muted">No hay Pull Requests abiertos.</p>';
    m.body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-merge]');
      if (!b || !confirm(`¿Fusionar el PR #${b.dataset.merge} en GitHub?`)) return;
      try {
        await busyBtn(b, 'Fusionando…', () => api('POST', `/api/projects/${state.project.id}/github/pulls/${b.dataset.merge}/merge`, { method: b.dataset.method }));
        toast('PR fusionado. Haz Pull para traer los cambios.');
        m.close();
      } catch (err) { toast(err.message, 'err'); }
    });
  } catch (e) { m.body.innerHTML = `<div class="banner err">${esc(e.message)}</div>`; }
}

/* ============================== Proyectos (modales) ============================== */
function newProjectModal() {
  const m = openModal('Nuevo proyecto', `
    <div class="tabs"><button class="on" data-tab="empty">Proyecto vacío</button><button data-tab="clone">Clonar desde GitHub</button></div>
    <div data-pane="empty">
      <div class="field"><label>Nombre</label><input id="np-name" type="text" maxlength="80" placeholder="Mi proyecto"></div>
      <button class="btn primary" id="np-create">Crear</button>
    </div>
    <div data-pane="clone" class="hidden">
      <div class="field"><label>URL del repositorio (https)</label><input id="np-url" type="url" placeholder="https://github.com/usuario/repo.git"></div>
      <div class="row wrap" style="margin-bottom:12px"><button class="btn small" id="np-repos">Elegir de mis repositorios</button><span class="muted" style="font-size:13px">Requiere el token de GitHub — <a href="#" id="np-gotoset">configurarlo</a></span></div>
      <div id="np-repolist"></div>
      <div class="field"><label>Rama (opcional)</label><input id="np-branch" type="text" placeholder="por defecto"></div>
      <div class="field"><label>Nombre del proyecto (opcional)</label><input id="np-cname" type="text" maxlength="80"></div>
      <button class="btn primary" id="np-clone">Clonar</button>
    </div>`);
  const root = m.el;
  $$('.tabs button', root).forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button', root).forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-pane]', root).forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.tab));
  }));

  const done = async (project) => {
    m.close();
    await loadProjects();
    await selectProject(project.id);
    toast('Proyecto listo');
  };
  $('#np-create', root).addEventListener('click', async (e) => {
    try { done(await busyBtn(e.target, 'Creando…', () => api('POST', '/api/projects', { name: $('#np-name', root).value }))); } catch (err) { toast(err.message, 'err'); }
  });
  $('#np-clone', root).addEventListener('click', async (e) => {
    try {
      done(await busyBtn(e.target, 'Clonando… puede tardar', () => api('POST', '/api/projects', { name: $('#np-cname', root).value, cloneUrl: $('#np-url', root).value, branch: $('#np-branch', root).value || undefined })));
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#np-repos', root).addEventListener('click', async (e) => {
    try {
      const repos = await busyBtn(e.target, 'Cargando…', () => api('GET', '/api/github/repos'));
      $('#np-repolist', root).innerHTML = `<div class="repo-list" style="margin-bottom:12px">${repos.map((r) => `<div class="repo" data-url="${esc(r.clone_url)}" data-branch="${esc(r.default_branch)}">${esc(r.full_name)}${r.private ? ' 🔒' : ''}<small>${esc(r.description || '')}</small></div>`).join('')}</div>`;
      $('.repo-list', root).addEventListener('click', (ev) => {
        const r = ev.target.closest('.repo');
        if (!r) return;
        $$('.repo', root).forEach((x) => x.classList.toggle('on', x === r));
        $('#np-url', root).value = r.dataset.url;
      });
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#np-gotoset', root).addEventListener('click', (ev) => { ev.preventDefault(); m.close(); settingsModal(); });
  $('#np-name', root).focus();
}

function projectMenuModal(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  const m = openModal('Proyecto', `
    <div class="field"><label>Nombre</label><input id="pm-name" type="text" value="${esc(p.name)}" maxlength="80"></div>
    <button class="btn" id="pm-save">Guardar nombre</button>
    <hr class="sep">
    <label class="row" style="margin-bottom:10px"><input type="checkbox" id="pm-files"> <span>Eliminar también los archivos del servidor</span></label>
    <button class="btn danger" id="pm-del">Eliminar proyecto</button>`);
  $('#pm-save', m.el).addEventListener('click', async () => {
    try { await api('PATCH', `/api/projects/${id}`, { name: $('#pm-name', m.el).value }); await loadProjects(); if (state.project?.id === id) state.project = state.projects.find((x) => x.id === id); m.close(); renderAll(); } catch (e) { toast(e.message, 'err'); }
  });
  $('#pm-del', m.el).addEventListener('click', async () => {
    const withFiles = $('#pm-files', m.el).checked;
    if (!confirm(withFiles ? `Se borrará «${p.name}» y todos sus archivos del servidor. Esta acción no se puede deshacer.` : `¿Quitar «${p.name}» de la lista? Los archivos se conservan en el servidor.`)) return;
    try {
      await api('DELETE', `/api/projects/${id}${withFiles ? '?files=1' : ''}`);
      m.close();
      await loadProjects();
      if (state.project?.id === id) {
        closeEvents();
        state.project = null; state.sessionId = null; state.sessions = []; state.messages = []; state.git = null;
        if (state.projects[0]) await selectProject(state.projects[0].id); else renderAll();
      } else renderSidebar();
    } catch (e) { toast(e.message, 'err'); }
  });
}

/* ============================== Ajustes y actualizaciones ============================== */
async function settingsModal(section) {
  const m = openModal('Ajustes', '<p class="muted">Cargando…</p>', { wide: true });
  const [settings, gh, oc, upd, models] = await Promise.all([
    api('GET', '/api/settings'),
    api('GET', '/api/github/status').catch(() => ({ connected: false })),
    api('GET', '/api/opencode/status').catch(() => ({})),
    api('GET', '/api/update/status').catch(() => null),
    api('GET', '/api/models').catch(() => null),
  ]);
  state.update = upd;
  renderSidebar();

  const providerOptions = (models?.all || []).sort((a, b) => a.name.localeCompare(b.name)).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${models.connected?.includes(p.id) ? ' ✓' : ''}</option>`).join('');

  const appBlock = () => {
    if (isStandalone()) return '<p class="muted" style="margin:0">Estás usando la aplicación instalada.</p>';
    if (!window.isSecureContext) return '<div class="banner">Para instalarla como aplicación hace falta HTTPS (o localhost). Accede mediante tu dominio con HTTPS.</div>';
    if (installPromptEvent) return '<p class="muted" style="margin-top:0">Instálala para abrirla a pantalla completa desde tu pantalla de inicio.</p><button class="btn primary" id="app-install">Instalar aplicación</button>';
    if (isIOS()) return '<p style="margin:0">En iPhone/iPad (Safari): pulsa <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.</p>';
    return '<p class="muted" style="margin:0">Usa el menú del navegador: «Instalar aplicación» o «Añadir a pantalla de inicio».</p>';
  };

  const updateBlock = () => {
    const u = state.update;
    if (!u) return '<p class="muted">No se pudo consultar el estado.</p>';
    if (!u.supported) return `<div class="banner">${esc(u.reason || 'Actualización no disponible')}</div>`;
    return `
      <p style="margin-top:0">Versión instalada: <strong>${esc(u.version)}</strong> <span class="chip">${esc(u.sha || '')}</span> · rama <code>${esc(u.branch)}</code></p>
      ${u.error ? `<div class="banner err" style="margin-bottom:10px">No se pudo consultar GitHub: ${esc(u.error)}</div>` : ''}
      ${u.behind ? `<div class="banner" style="margin-bottom:10px"><strong>${u.behind} cambio${u.behind > 1 ? 's' : ''} disponible${u.behind > 1 ? 's' : ''}</strong> (${esc(u.latest || '')})
        <div class="log" style="margin-top:6px">${u.commits.map((c) => `<div><span class="h">${esc(c.hash)}</span>${esc(c.subject)}<br><span class="muted">${esc(c.author)} · ${esc(c.when)}</span></div>`).join('')}</div></div>`
        : (!u.error ? '<p class="muted">Estás en la última versión.</p>' : '')}
      ${u.dirty ? '<div class="banner err" style="margin-bottom:10px">Hay cambios locales sin confirmar en la instalación: la actualización automática está bloqueada.</div>' : ''}
      <div class="row wrap">
        <button class="btn" id="upd-check">Buscar actualizaciones</button>
        <button class="btn primary" id="upd-apply" ${u.behind && !u.dirty ? '' : 'disabled'}>Actualizar ahora</button>
        <button class="btn danger" id="upd-rollback" ${u.canRollback ? '' : 'disabled'}>Volver a la versión anterior</button>
      </div>
      ${u.underSystemd ? '' : '<p class="muted" style="font-size:13px">No se ejecuta bajo systemd: tras actualizar tendrás que reiniciar el proceso a mano.</p>'}`;
  };

  m.body.innerHTML = `
    <h3 style="margin-top:0">GitHub</h3>
    <div id="gh-block">
      ${gh.connected ? `<p style="margin-top:0">Conectado como <strong>${esc(gh.login)}</strong>.</p><div class="row wrap"><button class="btn small danger" id="gh-remove">Desconectar</button><a class="btn small" href="${GH_TOKENS_PAGE}" target="_blank" rel="noopener noreferrer">Gestionar mis tokens en GitHub</a></div>`
        : `<p style="margin-top:0">Necesitas un <strong>token de acceso personal</strong> de GitHub. No hace falta escribir tu usuario: se detecta solo a partir del token.</p>
        <div class="row wrap" style="margin-bottom:10px">
          <a class="btn" href="${GH_TOKEN_FINE}" target="_blank" rel="noopener noreferrer">Crear token (recomendado)</a>
          <a class="btn" href="${GH_TOKEN_CLASSIC}" target="_blank" rel="noopener noreferrer">Crear token clásico (más rápido)</a>
        </div>
        <p class="muted" style="font-size:13.5px;margin:0 0 12px"><strong>Recomendado</strong> (fine-grained): se abre ya con los permisos <em>Contents</em> y <em>Pull requests</em> en lectura y escritura; solo tienes que elegir en la página los repositorios a los que dará acceso y pulsar «Generate token». <strong>Clásico</strong>: viene con el permiso <code>repo</code> marcado y da acceso a todos tus repos. GitHub muestra el token una sola vez: cópialo y pégalo aquí. Se guarda solo en tu servidor.</p>
        <div class="row"><input id="gh-token" name="gh-pat-field" type="text" class="secret grow" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" placeholder="github_pat_… o ghp_…"><button class="btn primary" id="gh-save">Guardar</button></div>`}
    </div>

    <h3>Identidad de Git</h3>
    <div class="row wrap"><input id="g-name" type="text" class="grow" value="${esc(settings.gitName)}" placeholder="Nombre"><input id="g-email" type="email" class="grow" value="${esc(settings.gitEmail)}" placeholder="correo"><button class="btn" id="g-save">Guardar</button></div>

    <h3>Proveedores de IA</h3>
    <p class="muted" style="margin-top:0">Añade una API key para que aparezcan sus modelos en el selector.</p>
    ${(models?.stored || []).length ? `<div id="prov-list" class="stack" style="margin-bottom:10px">${models.stored.map((s) => `<div class="row" style="justify-content:space-between"><div class="grow"><strong>${esc(s.name)}</strong> <span class="muted mono">${esc(s.hint || (s.type === 'oauth' ? 'sesión' : ''))}</span></div><button class="btn danger" data-prov-del="${esc(s.id)}" data-prov-name="${esc(s.name)}">Quitar</button></div>`).join('')}</div>` : ''}
    <div class="row wrap"><select id="prov-id" class="grow">${providerOptions}</select><input id="prov-key" name="provider-key-field" type="text" class="secret grow" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" placeholder="API key"><button class="btn" id="prov-save">Guardar</button></div>
    <div id="prov-help" style="margin-top:8px"></div>

    <h3>OpenCode</h3>
    <p style="margin-top:0">Estado: ${oc.healthy ? '<span style="color:var(--ok)">en marcha</span>' : '<span style="color:var(--err)">no responde</span>'}${oc.version ? ` · versión ${esc(oc.version)}` : ''}</p>
    <div class="row wrap"><button class="btn" id="oc-restart">Reiniciar OpenCode</button><button class="btn" id="oc-upgrade">Actualizar OpenCode</button><button class="btn ghost" id="oc-logs">Ver registro</button></div>
    <div id="oc-logbox"></div>

    <h3 id="sec-update">Actualizaciones de esta aplicación</h3>
    <div id="upd-block">${updateBlock()}</div>

    <h3>Aplicación</h3>
    <div id="app-block">${appBlock()}</div>

    <h3>Seguridad</h3>
    <div class="row wrap"><input id="pw-cur" type="password" class="grow" placeholder="Contraseña actual" autocomplete="current-password"><input id="pw-new" type="password" class="grow" placeholder="Nueva (mín. 8)" autocomplete="new-password"><button class="btn" id="pw-save">Cambiar</button></div>`;

  const q = (s) => $(s, m.el);
  const click = (sel, fn) => q(sel)?.addEventListener('click', async (e) => { try { await fn(e.target); } catch (err) { toast(err.message, 'err'); } });
  const rebind = () => {
    click('#upd-check', async (b) => { state.update = await busyBtn(b, 'Buscando…', () => api('GET', '/api/update/status?refresh=1')); $('#upd-block', m.el).innerHTML = updateBlock(); rebind(); renderSidebar(); });
    click('#upd-apply', async (b) => {
      if (!confirm('Se descargará la nueva versión y la aplicación se reiniciará unos segundos. ¿Continuar?')) return;
      const r = await busyBtn(b, 'Actualizando…', () => api('POST', '/api/update/apply'));
      afterRestart(r, `Actualizado a ${r.to}`, m);
    });
    click('#upd-rollback', async (b) => {
      if (!confirm('¿Volver a la versión anterior a la última actualización?')) return;
      const r = await busyBtn(b, 'Restaurando…', () => api('POST', '/api/update/rollback'));
      afterRestart(r, `Restaurada la versión ${r.to}`, m);
    });
  };
  rebind();

  click('#gh-save', async (b) => { const r = await busyBtn(b, 'Comprobando…', () => api('PUT', '/api/github/token', { token: q('#gh-token').value })); toast(`Conectado como ${r.login}`); m.close(); settingsModal(); });
  click('#gh-remove', async () => { await api('DELETE', '/api/github/token'); toast('GitHub desconectado'); m.close(); settingsModal(); });
  click('#g-save', async () => { await api('PUT', '/api/settings', { gitName: q('#g-name').value, gitEmail: q('#g-email').value }); toast('Identidad guardada (se aplica a nuevos commits)'); });
  m.el.querySelectorAll('[data-prov-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`¿Quitar la clave de ${b.dataset.provName}? Sus modelos dejarán de aparecer.`)) return;
    try {
      await busyBtn(b, 'Quitando…', () => api('DELETE', `/api/providers/${encodeURIComponent(b.dataset.provDel)}`));
      toast('Clave eliminada'); await loadModels(); renderModels(); m.close(); settingsModal();
    } catch (err) { toast(err.message, 'err'); }
  }));
  const showProvHelp = () => { q('#prov-help').innerHTML = providerHelpHtml(q('#prov-id').value); };
  q('#prov-id').addEventListener('change', showProvHelp);
  showProvHelp();
  click('#prov-save', async (b) => {
    await busyBtn(b, 'Guardando…', () => api('PUT', `/api/providers/${q('#prov-id').value}/key`, { key: q('#prov-key').value }));
    q('#prov-key').value = '';
    toast('Clave guardada');
    await loadModels();
    renderModels();
    m.close(); settingsModal();
  });
  click('#oc-restart', async (b) => { await busyBtn(b, 'Reiniciando…', () => api('POST', '/api/opencode/restart')); toast('OpenCode reiniciado'); await loadModels(); renderModels(); });
  click('#oc-upgrade', async (b) => { const r = await busyBtn(b, 'Actualizando…', () => api('POST', '/api/opencode/upgrade')); toast('OpenCode actualizado'); q('#oc-logbox').innerHTML = `<div class="output">${esc(r.output || '')}</div>`; });
  click('#oc-logs', async () => { const r = await api('GET', '/api/opencode/status'); q('#oc-logbox').innerHTML = `<div class="output">${esc((r.logs || []).join('\n') || 'Sin salida todavía')}</div>`; });
  click('#app-install', async () => { await installApp(); $('#app-block', m.el).innerHTML = appBlock(); });
  click('#pw-save', async (b) => { await busyBtn(b, 'Guardando…', () => api('PUT', '/api/password', { current: q('#pw-cur').value, next: q('#pw-new').value })); toast('Contraseña cambiada'); q('#pw-cur').value = ''; q('#pw-new').value = ''; });

  if (section === 'update') setTimeout(() => q('#sec-update')?.scrollIntoView({ behavior: 'smooth' }), 50);
}

function afterRestart(result, message, modal) {
  modal.close();
  if (!result.restarting) { toast(`${message}. Reinicia el servicio manualmente para aplicarla.`); return; }
  const back = document.createElement('div');
  back.className = 'backdrop';
  back.innerHTML = `<div class="modal" style="text-align:center"><h2 style="justify-content:center">${esc(message)}</h2><p class="muted">Reiniciando la aplicación… esta página se recargará sola.</p></div>`;
  document.body.append(back);
  let wentDown = false;
  const started = Date.now();
  const timer = setInterval(async () => {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      if (r.ok && (wentDown || Date.now() - started > 8000)) { clearInterval(timer); location.reload(); }
    } catch { wentDown = true; }
    if (Date.now() - started > 120_000) { clearInterval(timer); back.remove(); toast('El reinicio tarda más de lo normal. Revisa el servicio en el servidor.', 'err'); }
  }, 1500);
}

/* ============================== Eventos de interfaz ============================== */
function bindShell() {
  const app = $('#app');

  app.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    try {
      switch (act) {
        case 'close-panels': closePanels(); break;
        case 'model-picker': modelPicker(); break;
        case 'install-app': await installApp(); break;
        case 'select-project': if (state.project?.id !== t.dataset.id) await selectProject(t.dataset.id); break;
        case 'project-menu': e.stopPropagation(); state.navOpen = false; applyPanelState(); projectMenuModal(t.dataset.id); break;
        case 'new-project': state.navOpen = false; applyPanelState(); newProjectModal(); break;
        case 'new-session': await newSession(); break;
        case 'select-session': await selectSession(t.dataset.id); break;
        case 'del-session':
          e.stopPropagation();
          if (!confirm('¿Eliminar esta conversación?')) break;
          await api('DELETE', `/api/projects/${state.project.id}/sessions/${t.dataset.id}`);
          if (state.sessionId === t.dataset.id) { state.sessionId = null; state.messages = []; }
          await loadSessions();
          renderMessages();
          break;
        case 'settings': state.navOpen = false; applyPanelState(); settingsModal(t.dataset.section); break;
        case 'logout': await api('POST', '/api/logout'); showLogin(); break;
        case 'toggle-nav': state.navOpen = !state.navOpen; if (state.navOpen) { state.gitOpen = false; } applyPanelState(); break;
        case 'toggle-git':
          state.gitOpen = !state.gitOpen;
          if (state.gitOpen) state.navOpen = false;
          if (matchMedia('(min-width: 1200px)').matches) store.set('gitOpen', state.gitOpen);
          renderAll();
          if (state.gitOpen) loadGit();
          break;
        case 'perm': {
          const box = t.closest('[data-pid]');
          await api('POST', `/api/projects/${state.project.id}/sessions/${state.sessionId}/permissions/${box.dataset.pid}`, { response: t.dataset.r });
          state.perms.delete(box.dataset.pid);
          renderPerms();
          break;
        }
        case 'git-fetch': await gitAction(t, 'Fetch…', 'fetch', {}, { successMsg: 'Fetch completado' }); break;
        case 'git-pull': await gitAction(t, 'Pull…', 'pull', {}, { successMsg: 'Pull completado' }); break;
        case 'git-push': await gitAction(t, 'Push…', 'push', {}, { successMsg: 'Cambios subidos a GitHub' }); break;
        case 'git-commit': await gitAction(t, 'Commit…', 'commit', { message: $('#commit-msg')?.value }, { successMsg: 'Commit creado' }); break;
        case 'git-commit-push': {
          const r = await gitAction(t, 'Commit…', 'commit', { message: $('#commit-msg')?.value }, { successMsg: 'Commit creado' });
          if (r) await gitAction(t, 'Push…', 'push', {}, { successMsg: 'Cambios subidos a GitHub' });
          break;
        }
        case 'git-merge': {
          const b = $('#merge-select')?.value;
          if (b && confirm(`¿Fusionar «${b}» en la rama actual?`)) await gitAction(t, 'Fusionando…', 'merge', { branch: b }, { successMsg: 'Fusión completada' });
          break;
        }
        case 'merge-abort': if (confirm('Se descartará la fusión en curso.')) await gitAction(t, 'Abortando…', 'merge/abort', {}, { successMsg: 'Fusión abortada' }); break;
        case 'ai-resolve': await aiResolveConflicts(); break;
        case 'new-branch': {
          const name = prompt('Nombre de la nueva rama (se crea desde la actual):');
          if (name) await gitAction(t, null, 'checkout', { branch: name.trim(), create: true }, { successMsg: `Rama «${name.trim()}» creada` });
          break;
        }
        case 'set-remote': {
          const url = $('#remote-url')?.value;
          await busyBtn(t, 'Conectando…', () => api('PUT', `/api/projects/${state.project.id}/git/remote`, { url }));
          toast('Remoto configurado');
          await loadProjects();
          await loadGit();
          break;
        }
        case 'pr-new': prNewModal(); break;
        case 'pr-list': prListModal(); break;
        default: break;
      }
    } catch (err) {
      if (err.message !== 'Sesión caducada') toast(err.message, 'err');
    }
  });

  app.addEventListener('change', async (e) => {
    if (e.target.id === 'branch-select') {
      try {
        await api('POST', `/api/projects/${state.project.id}/git/checkout`, { branch: e.target.value });
        toast(`Cambiado a «${e.target.value}»`);
      } catch (err) { toast(err.message, 'err'); }
      loadGit();
    }
  });

  const input = $('#input');
  input.addEventListener('input', () => autosize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitInput(); }
  });
  $('#send').addEventListener('click', submitInput);

  // Botón "ir al final" cuando el usuario se aleja del último mensaje
  const chat = $('#chat');
  const toBottom = $('#to-bottom');
  chat.addEventListener('scroll', () => {
    const far = chat.scrollHeight - chat.scrollTop - chat.clientHeight > 320;
    toBottom.classList.toggle('hidden', !far);
  }, { passive: true });
  toBottom.addEventListener('click', () => chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' }));

  // Con el teclado abierto, mantener el último mensaje visible
  input.addEventListener('focus', () => setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 300));

  bindGestures();
}

// Escape cierra paneles; gesto de deslizar desde el borde izquierdo abre el menú (móvil)
let gesturesBound = false;
function bindGestures() {
  if (gesturesBound) return;
  gesturesBound = true;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('.backdrop') && (state.navOpen || state.gitOpen)) closePanels();
  });

  let sx = 0; let sy = 0; let tracking = false; let edge = false;
  const small = () => matchMedia('(max-width: 859px)').matches;
  document.addEventListener('touchstart', (e) => {
    if (!small() || e.touches.length !== 1) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; tracking = true;
    edge = sx < 24 && !state.navOpen;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return; // gesto horizontal claro
    if (edge && dx > 0 && !document.querySelector('.backdrop')) { state.navOpen = true; state.gitOpen = false; applyPanelState(); }
    else if (state.navOpen && dx < 0) { state.navOpen = false; applyPanelState(); }
  }, { passive: true });
}

/* ============================== Arranque ============================== */
(async () => {
  try {
    const me = await api('GET', '/api/me');
    if (me.authenticated) await mountApp();
    else showLogin();
  } catch {
    showLogin();
  }
})();
