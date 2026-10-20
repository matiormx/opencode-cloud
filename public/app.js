import { renderMarkdown, esc } from './md.js';

/* ============================== Utilidades ============================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ico = (d, extra = '') => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  git: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 4-6 3-11 5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  tconn: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  tia: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  tpuz: '<path d="M4 9h3a2 2 0 1 0 0-4h0a2 2 0 1 1 4 0v0H9v4h-.5a2 2 0 1 1 0 4H9v5h5v-1.5a2 2 0 1 1 4 0V18h2v-5h-2a2 2 0 1 1 0-4h2V4h-5v2"/>',
  chevr: '<path d="M9 6l6 6-6 6"/>',
  chevl: '<path d="M15 6l-6 6 6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6M9 11h6"/>',
  upd: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  tusers: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.8 0 5 2.2 5 5"/>',
  tred: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 9"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  chev: '<path d="M7 10l5 5 5-5"/>',
};

// Tema: «system» sigue al dispositivo; «light» y «dark» lo fuerzan
function applyTheme(mode, animate = false) {
  const root = document.documentElement;
  if (animate && !reducedMotion()) { root.classList.add('theme-fade'); setTimeout(() => root.classList.remove('theme-fade'), 400); }
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode; else delete root.dataset.theme;
  root.style.colorScheme = mode === 'light' || mode === 'dark' ? mode : '';
  const colors = { light: '#faf9f5', dark: '#262624' };
  for (const meta of document.querySelectorAll('meta[name=theme-color]')) {
    if (!meta.dataset.orig) meta.dataset.orig = meta.getAttribute('content');
    meta.setAttribute('content', colors[mode] || meta.dataset.orig);
  }
}

const store = {
  get: (k, d = null) => { try { return JSON.parse(localStorage.getItem(`occ:${k}`)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(`occ:${k}`, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

async function api(method, url, body) {
  const orig = url;
  if (state.adminHost && url.startsWith('/api/')) url = `/admin${url}`; // el panel de administración tiene su propia API
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'occloud' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && orig !== '/api/login') {
    showLogin();
    throw new Error('Sesión caducada');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { data });
  return data;
}

// Comando para copiar: texto seleccionable más botón «Copiar» (en la PWA el texto normal no se puede seleccionar)
const cmdBox = (text, style = '') => `<div class="cmd" style="${style}"><code>${esc(text)}</code><button type="button" class="btn small" data-copy>Copiar</button></div>`;
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* sin permiso: alternativa */ }
  try {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const ok = await copyText(b.parentElement.querySelector('code')?.textContent || '');
  const old = b.textContent; b.textContent = ok ? 'Copiado' : 'No se pudo'; setTimeout(() => { b.textContent = old; }, 1500);
});

applyTheme(store.get('theme', 'system'));
document.addEventListener('touchstart', () => {}, { passive: true });

// El teclado del móvil tapa la parte baja: las hojas se ajustan a la zona realmente visible (--vvh/--vvt)
if (window.visualViewport) {
  const vv = window.visualViewport;
  const syncViewport = () => {
    const st = document.documentElement.style;
    st.setProperty('--vvh', `${Math.round(vv.height)}px`);
    st.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
  };
  vv.addEventListener('resize', syncViewport);
  vv.addEventListener('scroll', syncViewport);
  syncViewport();
}

function toast(msg, kind = '') {
  // Un mismo aviso no se repite mientras sigue en pantalla (al volver de segundo plano se disparaban varios a la vez)
  if ([...document.querySelectorAll('#toasts .toast')].some((t) => t.textContent === msg)) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3200);
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Muelle críticamente amortiguado (apple-design §4-5): parte siempre del valor y la velocidad actuales,
// así cualquier movimiento se puede agarrar y redirigir sin saltos. `response` en segundos.
function makeSpring(initial, onUpdate, { response = 0.34, eps = 0.001, veps = 0.02 } = {}) {
  const w = (2 * Math.PI) / response;
  let x = initial; let v = 0; let target = initial; let raf = 0; let t0 = 0; let done = null;
  const step = (now) => {
    const dt = Math.min(0.034, (now - t0) / 1000);
    t0 = now;
    const d = x - target;
    const B = v + w * d;
    const e = Math.exp(-w * dt);
    x = target + (d + B * dt) * e;
    v = (B - w * (d + B * dt)) * e;
    if (Math.abs(x - target) < eps && Math.abs(v) < veps) {
      x = target; v = 0; raf = 0; onUpdate(x);
      const cb = done; done = null; if (cb) cb();
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(step);
  };
  return {
    to(t, vel, cb) { target = t; if (vel !== undefined && vel !== null) v = vel; done = cb || null; if (!raf) { t0 = performance.now(); raf = requestAnimationFrame(step); } },
    set(val) { cancelAnimationFrame(raf); raf = 0; x = val; v = 0; target = val; done = null; onUpdate(x); },
    stop() { cancelAnimationFrame(raf); raf = 0; done = null; },
    get value() { return x; },
  };
}
// Resistencia progresiva al pasar el límite (apple-design §9)
const rubberband = (over, dim = 420, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

function openModal(title, html, { wide = false, bare = false, sticky = false } = {}) {
  const back = document.createElement('div');
  back.className = `backdrop spr${bare ? ' top' : ''}`;
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}${bare ? ' bare' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    ${bare ? '' : `<h2><span>${esc(title)}</span><button class="icon-btn" data-close aria-label="Cerrar">${ico(I.x)}</button></h2>`}
    <div class="modal-body">${html}</div></div>`;
  const sheet = back.querySelector('.modal');
  const desk = () => matchMedia('(min-width: 860px)').matches;
  const travel = () => (desk() ? 28 : Math.max(300, back.clientHeight || innerHeight));
  let closing = false;
  const y = makeSpring(0, (v) => {
    sheet.style.transform = v ? `translateY(${v.toFixed(2)}px)` : '';
    const span = travel();
    back.style.setProperty('--sp', Math.max(0, Math.min(1, 1 - Math.max(0, v) / span)).toFixed(3));
    if (desk()) sheet.style.opacity = String(Math.max(0, Math.min(1, 1 - v / 28)));
    else sheet.style.opacity = '';
  }, { response: 0.36, eps: 0.4, veps: 8 });

  const remove = () => { y.stop(); closing = true; back.remove(); document.removeEventListener('keydown', onKey); };
  const close = (vel = 0) => {
    if (closing || sticky) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    if (reducedMotion()) { back.remove(); return; }
    const fin = () => back.remove();
    setTimeout(fin, 900); // por si el navegador pausa las animaciones
    y.to(travel() + 20, vel, fin);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  // Con el teclado abierto, lleva el campo enfocado a la zona visible
  back.addEventListener('focusin', (e) => {
    if (e.target.matches?.('input:not([type=checkbox]):not([type=file]), textarea, select, .pf')) setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  });

  // Arrastrar la hoja hacia abajo para cerrarla: 1:1 con el dedo, y al soltar se proyecta el impulso (apple-design §2, §5, §6)
  const drag = (handle) => {
    if (!handle) return;
    handle.style.touchAction = 'none';
    let id = null; let sy = 0; let base = 0; let hist = [];
    handle.addEventListener('pointerdown', (e) => {
      if (closing || sticky || desk() || e.target.closest('button, a, input, textarea, select')) return;
      id = e.pointerId; handle.setPointerCapture(id); y.stop(); sy = e.clientY; base = y.value; hist = [[e.timeStamp, e.clientY]];
    });
    handle.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const v = base + (e.clientY - sy);
      y.set(v < 0 ? -rubberband(-v) : v);
      hist.push([e.timeStamp, e.clientY]);
      while (hist.length > 2 && e.timeStamp - hist[0][0] > 100) hist.shift();
    });
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      const [t0, y0] = hist[0];
      const vel = ((e.clientY - y0) / Math.max(1, e.timeStamp - t0)) * 1000; // px/s al soltar
      const projected = y.value + (vel / 1000) * 0.998 / (1 - 0.998); // dónde acabaría con el impulso
      if (e.type === 'pointercancel' || vel < -300 || projected < sheet.offsetHeight * 0.4) y.to(0, vel); // vuelve; el signo de la velocidad decide
      else close(vel);
    };
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };
  if (!bare) drag(back.querySelector('h2'));

  // Entrada: la hoja sube desde abajo con el mismo muelle (salida simétrica por el mismo camino)
  if (reducedMotion()) y.set(0); else y.set(travel());
  document.body.append(back);
  if (!reducedMotion()) requestAnimationFrame(() => y.to(0));
  return { el: back, body: $('.modal-body', back), close, remove, drag };
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
  attach: [], // imágenes pendientes de enviar: { name, url }
  me: null, // { name, role } del usuario con sesión
  multiuser: false,
  projects: [],
  project: null,
  sessions: [],
  sessionId: null,
  messages: [],
  busy: false,
  busyGrace: 0,
  queue: { items: [], paused: false },
  featured: { pinned: [], recent: [] },
  sys: null,
  act: null,
  models: null,
  model: store.get('model'),
  // En pantallas pequeñas Git es una hoja que empieza cerrada; en ≥1200px se recuerda la preferencia
  gitOpen: matchMedia('(min-width: 1200px)').matches ? store.get('gitOpen', false) : false,
  git: null,
  gitOutput: '',
  gitFail: null,
  update: null,
  perms: new Map(),
  booting: false, // arranque: se cargan proyectos, modelos y la primera conversación
  loadingChat: false, // se está cargando una conversación
  questions: new Map(), // preguntas pendientes del agente (herramienta question)
  qdraft: new Map(), // lo que lleva marcado/escrito el usuario en cada una
  navOpen: false,
};
let events = null;
let installPromptEvent = null;

// Enlaces de GitHub para crear/gestionar el token (con nombre y permisos ya rellenados)
const GH_TOKEN_FINE = 'https://github.com/settings/personal-access-tokens/new?name=OpenCode+Cloud&description=Token+para+OpenCode+Cloud+%28clonar%2C+push+y+pull+requests%29&expires_in=90&contents=write&pull_requests=write&workflows=write';
const GH_TOKEN_CLASSIC = 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=OpenCode+Cloud';
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
  const multi = state.multiuser && !state.adminHost; // en el panel solo entra el administrador: no se pide usuario
  let last = '';
  try { last = localStorage.getItem('lastUser') || ''; } catch { /* sin almacenamiento */ }
  $('#root').innerHTML = `
    <div class="login"><form class="login-card" id="login-form">
      <div class="logo">${ico(I.code, 'stroke="#fff" stroke-width="2.4"')}</div>
      <h1>${state.adminHost ? 'Administración' : 'OpenCode Cloud'}</h1>
      <p class="muted" style="margin:0 0 20px">${state.adminHost ? 'Panel del administrador' : 'Inicia sesión para continuar'}</p>
      ${multi ? `<div class="field"><label for="un">Usuario</label><input id="un" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(last)}" ${last ? '' : 'autofocus'} required></div>` : ''}
      <div class="field"><label for="pw">Contraseña</label><input id="pw" type="password" autocomplete="current-password" ${multi && !last ? '' : 'autofocus'} required></div>
      <button class="btn primary" style="width:100%" type="submit">Entrar</button>
    </form></div>`;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', e.target);
    try {
      const body = { password: $('#pw').value };
      if (multi) body.username = $('#un').value.trim().toLowerCase();
      const r = await busyBtn(btn, 'Entrando…', () => api('POST', '/api/login', body));
      state.me = r.user || null;
      if (multi) { try { localStorage.setItem('lastUser', body.username); } catch { /* sin almacenamiento */ } }
      // El administrador solo administra: su sesión es la del panel
      if (state.multiuser && r.user?.role === 'admin' && state.route?.kind !== 'admin') return location.replace('/admin/');
      await enter();
    } catch (err) {
      toast(err.message, 'err');
      $('#pw').select();
    }
  });
}

/* ============================== Rutas: puerta, panel y espacios ============================== */
// «/» es la puerta (login y reparto), «/admin/» el panel y «/u/<usuario>/» el espacio de cada uno (modo multiusuario)
function parseRoute() {
  const p = location.pathname;
  if (/^\/admin(\/|$)/.test(p)) return { kind: 'admin' };
  const m = p.match(/^\/u\/([a-z][a-z0-9]{1,19})\/?$/);
  return m ? { kind: 'user', name: m[1] } : { kind: 'root' };
}
const homeOf = (u) => `/u/${u.name}/`;

// Qué mostrar según la ruta y la sesión actual
// El panel tiene su propia sesión (otra cookie y otra contraseña): desde la raíz se pregunta si hay una abierta
async function adminSession() {
  try {
    const r = await fetch('/admin/api/me', { headers: { 'X-Requested-With': 'occloud' } });
    return Boolean((await r.json()).authenticated);
  } catch { return false; }
}

async function enter() {
  const r = state.route || { kind: 'root' }, u = state.me;
  if (!state.multiuser) return r.kind === 'root' ? mountApp() : location.replace('/');
  if (!u) return showLogin();
  if (r.kind === 'admin') return u.role === 'admin' ? mountAdmin() : showLogin();
  if (r.kind === 'user') return u.name === r.name ? mountApp() : location.replace(homeOf(u));
  // Raíz: con una sola sesión abierta se va directo a su sitio; solo si hay la de un usuario Y la del administrador se pregunta
  if (await adminSession()) return showPortal(u);
  location.replace(homeOf(u));
}

// El administrador elige entre el panel y su espacio de trabajo
function showPortal(u) {
  closeEvents();
  $('#root').innerHTML = `
    <div class="login"><div class="login-card portal">
      <div class="logo">${ico(I.code, 'stroke="#fff" stroke-width="2.4"')}</div>
      <h1>Hola, ${esc(u.name)}</h1>
      <p class="muted" style="margin:0 0 20px">¿A dónde quieres ir?</p>
      <a class="btn primary" style="width:100%;margin-bottom:10px" href="${esc(homeOf(u))}">Trabajar (${esc(u.name)})</a>
      <a class="btn" style="width:100%;margin-bottom:10px" href="/admin/">Administración</a>
      <button class="btn ghost" style="width:100%" type="button" id="portal-out">Cerrar sesión</button>
    </div></div>`;
  $('#portal-out').addEventListener('click', async () => {
    try { await api('POST', '/api/logout'); } catch { /* sesión ya cerrada */ }
    try { await fetch('/admin/api/logout', { method: 'POST', headers: { 'X-Requested-With': 'occloud' } }); } catch { /* sin sesión de panel */ }
    state.me = null; showLogin();
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
          <div class="wait-banner hidden" id="wait" role="status" aria-live="polite"></div>
          <div class="queue hidden" id="queue" aria-live="polite"></div>
          <div class="composer">
            <div class="attach-row hidden" id="attach-row"></div>
            <div id="input" class="chat-input" role="textbox" aria-multiline="true" aria-label="Instrucción para OpenCode" contenteditable="plaintext-only" enterkeyhint="send" inputmode="text" autocapitalize="sentences" autocorrect="on" spellcheck="true" data-placeholder="Pide algo a OpenCode…"></div>
            <input type="file" id="attach-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
            <div class="composer-bar">
              <button class="attach-btn" id="attach-btn" type="button" aria-label="Adjuntar imagen" title="Adjuntar imagen">${ico(I.image)}</button>
              <button class="model-btn" id="model-btn" type="button" data-act="model-picker" aria-haspopup="dialog" aria-label="Elegir modelo"></button>
              <button class="ctx-btn hidden" id="ctx-btn" type="button" data-act="context" aria-haspopup="dialog" aria-label="Contexto de la conversación"></button>
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
  state.booting = true;
  renderTopbar();
  renderMessages();
  renderModels();
  try {
    await Promise.all([loadProjects(), loadModels(), loadUpdate(false), loadFeatured(), loadSys(), loadActivity()]);
    state.booting = false;
    renderAll();
    const last = store.get('project');
    const target = state.projects.find((p) => p.id === last) || state.projects[0];
    if (target) await selectProject(target.id);
    else renderMessages();
  } finally {
    state.booting = false;
    renderAll();
  }
  if (!timersStarted) {
    timersStarted = true;
    setInterval(pollStatus, 2500);
    setInterval(() => { if (!document.hidden && $('#sysmon-slot')) loadSys(); }, 10_000);
    setInterval(() => { if (!document.hidden && $('#sysmon-slot')) loadActivity(); }, 5000);
    setInterval(() => { if (!document.hidden && state.act) { const slot = $('#sysmon-slot'); if (slot) slot.innerHTML = sysCardHtml(); renderWait(); } }, 1000);
    setInterval(() => { if (state.queue.items.length) loadQueue(); }, 4000);
    setInterval(() => { if ($('#sidebar')) loadUpdate(false); }, 10 * 60_000);
  }
}
let timersStarted = false;

// Panel de administración (dominio propio): solo usuarios, red, actualizaciones y recursos. No carga proyectos ni el agente.
let adminTimer = null;
const stopAdminTimer = () => { clearInterval(adminTimer); adminTimer = null; };
async function mountAdmin() {
  document.body.classList.add('adminapp');
  $('#root').innerHTML = '<div class="splash" aria-hidden="true"><div class="logo">' + ico(I.code, 'stroke="#fff" stroke-width="2.4"') + '</div></div>';
  await loadSys();
  await settingsModal('main', { admin: true });
  stopAdminTimer();
  adminTimer = setInterval(async () => {
    if (document.hidden) return;
    await loadSys();
    const slot = $('#adm-sys');
    if (slot) slot.innerHTML = sysCardHtml();
  }, 10_000);
}

function renderAll() {
  renderSidebar();
  renderTopbar();
  textboxShim($('#input'));
  renderMessages();
  renderModels();
  renderGit();
  renderQueue();
  renderWait();
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
const isPinned = (projectId, sessionId) => (state.featured.pinned || []).some((x) => x.projectId === projectId && x.id === sessionId);

function featuredRow(c) {
  const active = c.projectId === state.project?.id && c.id === state.sessionId;
  return `<div class="sess feat ${active ? 'active' : ''}" data-act="open-conv" data-pid="${esc(c.projectId)}" data-id="${esc(c.id)}">
      <span class="feat-text"><span class="name">${esc(c.title || 'Sin título')}</span><span class="feat-proj">${esc(c.projectName)} · ${esc(fmtDate(c.updated))}</span></span>
      <button class="icon-btn star ${c.pinned ? 'on' : ''}" data-act="toggle-pin" data-pid="${esc(c.projectId)}" data-id="${esc(c.id)}" aria-pressed="${c.pinned ? 'true' : 'false'}" aria-label="${c.pinned ? 'Quitar de destacadas' : 'Marcar como destacada'}" style="width:32px;height:32px">${ico(I.star, `width="15" height="15" ${c.pinned ? 'style="fill:currentColor"' : ''}`)}</button>
      <button class="icon-btn del" data-act="session-menu" data-pid="${esc(c.projectId)}" data-id="${esc(c.id)}" aria-label="Opciones de la conversación" style="width:28px;height:28px">${ico(I.more, 'width="15" height="15"')}</button>
    </div>`;
}

function featuredHtml() {
  const { pinned = [], recent = [] } = state.featured || {};
  let html = '';
  if (pinned.length) html += `<div class="side-title">★ Destacadas</div>${pinned.map(featuredRow).join('')}`;
  if (recent.length) html += `<div class="side-title">Recientes</div>${recent.map(featuredRow).join('')}`;
  return html;
}

async function loadFeatured() {
  try {
    state.featured = await api('GET', '/api/conversations/overview');
  } catch { /* se mantiene la lista anterior */ }
  renderSidebar();
}

/* ============================== Recursos del VPS ============================== */
const fmtBytes = (n) => {
  if (!Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
};
const fmtRate = (n) => `${fmtBytes(n)}/s`;
const fmtUptime = (sec) => {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
};
const pct = (x) => `${Math.round(x)}%`;
const HIGH = 85;

function sparkSvg(values, { w = 120, h = 28 } = {}) {
  if (values.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const x = (i) => 3 + (i / (values.length - 1)) * (w - 6);
  const y = (v) => h - 3 - (Math.min(100, Math.max(0, v)) / 100) * (h - 6);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${x(last).toFixed(1)}" cy="${y(values[last]).toFixed(1)}" r="3" fill="var(--s1)" stroke="var(--card)" stroke-width="2"/></svg>`;
}


/* ============================== Actividad de OpenCode ============================== */
const remainingSec = (row) => (row?.retry?.inSec == null ? null : Math.max(0, row.retry.inSec - Math.floor((Date.now() - (state.act?.at || Date.now())) / 1000)));

function ocStateHtml() {
  const a = state.act;
  if (!a) return '';
  const rows = a.sessions || [];
  const retrying = rows.filter((r) => r.state === 'retrying');
  const perm = rows.filter((r) => r.state === 'permission');
  const asks = rows.filter((r) => r.state === 'question');
  const working = rows.filter((r) => r.state === 'working');
  const rpm = a.requests?.rpm ?? 0;
  let dot = 'idle', text = 'OpenCode inactivo';
  if (retrying.length) { dot = 'wait'; const s = remainingSec(retrying[0]); text = `Esperando al proveedor${s != null ? ` · reintento en ${s} s` : ''}`; }
  else if (perm.length) { dot = 'wait'; text = `Esperando tu permiso${perm.length > 1 ? ` (${perm.length})` : ''}`; }
  else if (asks.length) { dot = 'wait'; text = `Esperando tu respuesta${asks.length > 1 ? ` (${asks.length})` : ''}`; }
  else if (working.length) { dot = 'work'; text = `Trabajando${working.length > 1 ? ` en ${working.length} conversaciones` : ''}`; }
  return `<button class="oc-state" data-act="sysmon" aria-label="Estado de OpenCode: ${esc(text)}"><span class="st ${dot}" aria-hidden="true"></span><span class="oc-text">${esc(text)}</span><span class="oc-rpm">${rpm} pet/min</span></button>`;
}

function renderWait() {
  const box = $('#wait');
  if (!box) return;
  const row = (state.act?.sessions || []).find((r) => r.sessionId === state.sessionId && r.projectId === state.project?.id);
  if (row?.state === 'retrying') {
    const s = remainingSec(row);
    box.innerHTML = `<span class="wait-ico" aria-hidden="true">⏳</span><span><strong>Esperando al proveedor.</strong> ${esc(row.retry.message || 'Límite de peticiones o error temporal')} · reintento ${row.retry.attempt}${s != null ? ` · próximo intento en ${s} s` : ''}</span>`;
    box.classList.remove('hidden');
  } else if (state.questions.size || row?.state === 'question') {
    const q = [...state.questions.values()][0];
    if (!q) {
      box.innerHTML = '<span class="wait-ico" aria-hidden="true">❓</span><span><strong>OpenCode te pregunta algo</strong> · cargando…</span>';
    } else if (box.querySelector('.wait-q')?.dataset.qid !== q.id) { // no se repinta si ya está: se perdería lo que escribes
      box.innerHTML = questionCard(q);
      syncQuestion();
    }
    box.classList.remove('hidden');
  } else if (row?.state === 'permission' || state.perms.size) {
    const first = [...state.perms.values()][0];
    if (!first) {
      box.innerHTML = '<span class="wait-ico" aria-hidden="true">🔒</span><span><strong>Esperando tu permiso</strong> · cargando la solicitud…</span>';
    } else {
      const what = first.title || first.permission || first.type || 'una acción';
      const pat = [].concat(first.pattern || first.patterns || [])[0];
      box.innerHTML = `<div class="wait-perm" data-pid="${esc(first.id)}"><div><span class="wait-ico" aria-hidden="true">🔒</span> <strong>OpenCode pide permiso</strong> · ${esc(what)}${state.perms.size > 1 ? ` <span class="muted">(+${state.perms.size - 1} más)</span>` : ''}</div>${pat ? `<code class="wait-pat">${esc(String(pat).slice(0, 140))}</code>` : ''}<div class="row wait-btns"><button class="btn small primary" data-act="perm" data-r="once">Permitir una vez</button><button class="btn small" data-act="perm" data-r="always">Siempre</button><button class="btn small danger" data-act="perm" data-r="reject">Rechazar</button></div></div>`;
    }
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
    box.innerHTML = '';
  }
}

async function loadActivity() {
  try {
    const a = await api('GET', '/api/activity');
    a.at = Date.now();
    state.act = a;
    const slot = $('#sysmon-slot');
    if (slot) slot.innerHTML = sysCardHtml();
    const mine = (a.sessions || []).some((r) => r.sessionId === state.sessionId && r.projectId === state.project?.id && r.state === 'permission');
    const asked = (a.sessions || []).some((r) => r.sessionId === state.sessionId && r.projectId === state.project?.id && r.state === 'question');
    if (asked && !state.questions.size) await loadQuestions();
    else if (!asked && state.questions.size) { state.questions.clear(); renderWait(); }
    if (mine && !state.perms.size) await loadPerms();
    else if (!mine && state.perms.size) { state.perms.clear(); renderPerms(); }
    renderWait();
  } catch { /* se reintenta en el siguiente ciclo */ }
}

function sysCardHtml() {
  const s = state.sys;
  if (!s || !s.history.length) return `<button class="sysmon" data-act="sysmon" aria-label="Recursos del servidor"><span class="muted" style="font-size:13px">Recursos del servidor…</span></button>${ocStateHtml()}`;
  const cpu = s.now.cpu, mem = s.now.mem.total ? (s.now.mem.used / s.now.mem.total) * 100 : 0;
  const col = (label, v, key) => `<span class="sm-col"><span class="sm-top"><span class="sm-label">${label}</span><span class="sm-val">${pct(v)}</span>${v >= HIGH ? '<span class="sm-high" title="Uso alto">▲ alto</span>' : ''}</span>${sparkSvg(s.history.map((p) => p[key]))}</span>`;
  return `<button class="sysmon" data-act="sysmon" aria-label="Ver recursos del servidor en detalle">${col('CPU', cpu, 'cpu')}${col('RAM', mem, 'mem')}</button>${ocStateHtml()}`;
}

async function loadSys(points = 30) {
  try {
    state.sys = await api('GET', `/api/system?points=${points}`);
    const el = $('#sysmon-slot');
    if (el) el.innerHTML = sysCardHtml();
  } catch { /* se reintenta en el siguiente ciclo */ }
}

function lineChart({ id, series, data, yMax, yFmt, valFmt, h = 120 }) {
  const wrap = document.getElementById(id);
  if (!wrap) return;
  const W = Math.max(240, wrap.clientWidth || 320), H = h, L = 48, R = 8, T = 8, B = 20;
  const n = data.length;
  const x = (i) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v) => T + (1 - Math.min(1, Math.max(0, v / yMax))) * (H - T - B);
  const grid = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(yMax * f).toFixed(1)}" y2="${y(yMax * f).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${(y(yMax * f) + 4).toFixed(1)}" text-anchor="end" class="ch-ax">${yFmt(yMax * f)}</text>`).join('');
  const span = n > 1 ? Math.round((data[n - 1].t - data[0].t) / 60000) : 0;
  const lines = series.map((sr) => `<polyline fill="none" stroke="${sr.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${data.map((p, i) => `${x(i).toFixed(1)},${y(p[sr.key]).toFixed(1)}`).join(' ')}"/>`).join('');
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(series.map((sr) => sr.label).join(' y '))}, últimos ${span} minutos">${grid}${lines}
    <text x="${L}" y="${H - 4}" class="ch-ax">hace ${span} min</text><text x="${W - R}" y="${H - 4}" text-anchor="end" class="ch-ax">ahora</text>
    <line class="ch-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-width="1" style="display:none"/>
    <g class="ch-dots"></g><rect class="ch-hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/></svg><div class="ch-tip" role="status" hidden></div>`;
  const svg = wrap.querySelector('svg'), tip = wrap.querySelector('.ch-tip'), cross = wrap.querySelector('.ch-cross'), dots = wrap.querySelector('.ch-dots'), hit = wrap.querySelector('.ch-hit');
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.min(n - 1, Math.max(0, Math.round(((px - L) / (W - L - R)) * (n - 1))));
    const p = data[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = '';
    dots.innerHTML = series.map((sr) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p[sr.key]).toFixed(1)}" r="4" fill="${sr.color}" stroke="var(--bg)" stroke-width="2"/>`).join('');
    tip.hidden = false;
    tip.textContent = '';
    const head = document.createElement('div');
    head.className = 'ch-tip-time';
    head.textContent = new Date(p.t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    tip.append(head);
    for (const sr of series) {
      const row = document.createElement('div');
      row.className = 'ch-tip-row';
      const key = document.createElement('i'); key.style.background = sr.color;
      const val = document.createElement('strong'); val.textContent = valFmt(p[sr.key]);
      const lab = document.createElement('span'); lab.textContent = sr.label;
      row.append(key, val, lab);
      tip.append(row);
    }
    const tw = tip.offsetWidth;
    const left = Math.min(Math.max(4, (x(i) / W) * r.width - tw / 2), r.width - tw - 4);
    tip.style.left = `${left}px`;
  };
  const hide = () => { tip.hidden = true; cross.style.display = 'none'; dots.innerHTML = ''; };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);
}


function barChart({ id, data, h = 110 }) {
  const wrap = document.getElementById(id);
  if (!wrap) return;
  const W = Math.max(240, wrap.clientWidth || 320), H = h, L = 34, R = 6, T = 8, B = 20;
  const n = data.length;
  const peak = Math.max(...data.map((d) => d.req), 0);
  const yMax = Math.max(4, Math.ceil(peak / 4) * 4);
  const slot = (W - L - R) / n, bw = Math.max(2, Math.min(24, slot - 2));
  const x = (i) => L + i * slot + (slot - bw) / 2;
  const y = (v) => T + (1 - v / yMax) * (H - T - B);
  const grid = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(yMax * f).toFixed(1)}" y2="${y(yMax * f).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${(y(yMax * f) + 4).toFixed(1)}" text-anchor="end" class="ch-ax">${Math.round(yMax * f)}</text>`).join('');
  const bars = data.map((d, i) => d.req ? `<path d="M${x(i).toFixed(1)} ${y(0).toFixed(1)}V${(y(d.req) + 1.5).toFixed(1)}a1.5 1.5 0 0 1 1.5-1.5h${Math.max(0, bw - 3).toFixed(1)}a1.5 1.5 0 0 1 1.5 1.5V${y(0).toFixed(1)}z" fill="var(--s1)"/>` : '').join('');
  const marks = data.map((d, i) => (d.retry || d.err) ? `<circle cx="${(x(i) + bw / 2).toFixed(1)}" cy="${(H - B + 8).toFixed(1)}" r="2.5" fill="var(--s2)"/>` : '').join('');
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Peticiones al modelo por minuto, última hora">${grid}${bars}${marks}
    <text x="${L}" y="${H - 1}" class="ch-ax" style="display:none"></text><rect class="ch-hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/><line class="ch-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-width="1" style="display:none"/></svg><div class="ch-tip" role="status" hidden></div>
    <div class="ch-xl"><span>hace 60 min</span><span>ahora</span></div>`;
  const svg = wrap.querySelector('svg'), tip = wrap.querySelector('.ch-tip'), cross = wrap.querySelector('.ch-cross'), hit = wrap.querySelector('.ch-hit');
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.min(n - 1, Math.max(0, Math.floor((px - L) / slot)));
    const d = data[i];
    cross.setAttribute('x1', x(i) + bw / 2); cross.setAttribute('x2', x(i) + bw / 2); cross.style.display = '';
    tip.hidden = false; tip.textContent = '';
    const head = document.createElement('div'); head.className = 'ch-tip-time';
    head.textContent = new Date(d.t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    tip.append(head);
    for (const [label, v, color] of [['peticiones', d.req, 'var(--s1)'], ['reintentos', d.retry, 'var(--s2)'], ['errores', d.err, 'var(--s2)']]) {
      const row = document.createElement('div'); row.className = 'ch-tip-row';
      const k = document.createElement('i'); k.style.background = color;
      const val = document.createElement('strong'); val.textContent = String(v);
      const lab = document.createElement('span'); lab.textContent = label;
      row.append(k, val, lab); tip.append(row);
    }
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(4, ((x(i) + bw / 2) / W) * r.width - tw / 2), r.width - tw - 4)}px`;
  };
  const hide = () => { tip.hidden = true; cross.style.display = 'none'; };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);
}

function activityBlockHtml(a) {
  const r = a.requests;
  const rows = a.sessions || [];
  const label = { working: 'Trabajando', retrying: 'Esperando al proveedor', permission: 'Esperando tu permiso' };
  const list = rows.length
    ? `<ul class="act-list">${rows.map((x) => `<li><span class="st ${x.state === 'working' ? 'work' : 'wait'}" aria-hidden="true"></span><span class="grow"><strong>${esc(x.title || 'Conversación')}</strong> <span class="muted">· ${esc(x.projectName)}</span><br><span class="muted" style="font-size:13px">${label[x.state]}${x.retry ? ` · reintento ${x.retry.attempt}${x.retry.inSec != null ? ` en ${x.retry.inSec} s` : ''} · ${esc(x.retry.message)}` : ''}</span></span></li>`).join('')}</ul>`
    : '<p class="muted" style="margin:6px 0">OpenCode no está trabajando ahora mismo.</p>';
  const last = r.lastError ? `<tr><th scope="row">Último error</th><td>${esc(new Date(r.lastError.t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))} · ${r.lastError.status ? `${r.lastError.status} · ` : ''}${esc(r.lastError.message.slice(0, 140))}</td></tr>` : '';
  return `
    <div class="ch-block"><div class="ch-head"><h3>Peticiones al modelo</h3><span class="ch-now">${r.rpm} /min</span></div>
      <div class="ch-legend" style="margin-bottom:4px"><span><i style="background:var(--s1);height:8px;width:8px;border-radius:2px"></i>Peticiones por minuto</span><span><i style="background:var(--s2);height:8px;width:8px;border-radius:50%"></i>Minuto con reintento o error</span></div>
      <div class="ch" id="ch-req"></div></div>
    <table class="kv"><tbody>
      <tr><th scope="row">Última hora</th><td>${r.total1h} petición${r.total1h === 1 ? '' : 'es'} · ${r.retries1h} reintento${r.retries1h === 1 ? '' : 's'} · ${r.errors1h} error${r.errors1h === 1 ? '' : 'es'}</td></tr>
      <tr><th scope="row">Tokens (1 h)</th><td>${r.tokens1h.toLocaleString('es-ES')}${r.cost1h ? ` · coste ${r.cost1h.toLocaleString('es-ES', { maximumFractionDigits: 4 })} USD` : ''}</td></tr>
      ${last}
    </tbody></table>
    <h3>OpenCode ahora</h3>${list}`;
}

function sysModal() {
  const m = openModal('Recursos y peticiones', '<p class="muted">Cargando…</p>', { wide: true });
  let timer = null;
  const draw = async () => {
    let d;
    let act = null;
    try { act = await api('GET', '/api/activity'); act.at = Date.now(); state.act = act; } catch { /* sin datos de actividad */ }
    let eg = null;
    const egP = api('GET', '/api/egress').then((x) => { eg = x; }, () => {});
    try { d = await api('GET', '/api/system?points=360'); await egP; } catch (e) { m.body.innerHTML = `<div class="banner">${esc(e.message)}</div>`; return; }
    state.sys = d;
    const el = $('#sysmon-slot'); if (el) el.innerHTML = sysCardHtml();
    const { now, history } = d;
    const memPct = now.mem.total ? (now.mem.used / now.mem.total) * 100 : 0;
    const diskPct = now.disk?.total ? (now.disk.used / now.disk.total) * 100 : null;
    const maxNet = Math.max(1024, ...history.map((p) => Math.max(p.rx, p.tx)));
    const niceNet = 2 ** Math.ceil(Math.log2(maxNet));
    const statRow = (label, value, high) => `<tr><th scope="row">${label}</th><td>${value}${high ? ' <span class="sm-high">▲ alto</span>' : ''}</td></tr>`;
    const agg = (key, f) => { const v = history.map((p) => p[key]); return v.length ? f(v) : 0; };
    const avg = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    const tableRows = [
      ['CPU', (x) => pct(x), 'cpu'], ['Memoria', (x) => pct(x), 'mem'], ['Red ↓ (recibida)', fmtRate, 'rx'], ['Red ↑ (enviada)', fmtRate, 'tx'],
    ].map(([lab, f, key]) => `<tr><th scope="row">${lab}</th><td>${f(agg(key, (v) => Math.min(...v)))}</td><td>${f(agg(key, avg))}</td><td>${f(agg(key, (v) => Math.max(...v)))}</td></tr>`).join('');
    m.body.innerHTML = `
      ${act ? activityBlockHtml(act) : ''}
      <div class="ch-block"><div class="ch-head"><h3>CPU</h3><span class="ch-now">${pct(now.cpu)}${now.cpu >= HIGH ? ' <span class="sm-high">▲ alto</span>' : ''}</span></div><div class="ch" id="ch-cpu"></div></div>
      <div class="ch-block"><div class="ch-head"><h3>Memoria</h3><span class="ch-now">${pct(memPct)}${memPct >= HIGH ? ' <span class="sm-high">▲ alto</span>' : ''}</span></div><div class="ch" id="ch-mem"></div></div>
      <div class="ch-block"><div class="ch-head"><h3>Red</h3><span class="ch-legend"><span><i style="background:var(--s1)"></i>Recibida ${fmtRate(now.net?.rx ?? 0)}</span><span><i style="background:var(--s2)"></i>Enviada ${fmtRate(now.net?.tx ?? 0)}</span></span></div><div class="ch" id="ch-net"></div></div>
      <h3>Ahora</h3>
      <table class="kv"><tbody>
        ${statRow('Memoria', `${fmtBytes(now.mem.used)} de ${fmtBytes(now.mem.total)} (${pct(memPct)})`, memPct >= HIGH)}
        ${now.mem.swapTotal ? statRow('Swap', `${fmtBytes(now.mem.swapUsed)} de ${fmtBytes(now.mem.swapTotal)}`) : ''}
        ${diskPct !== null ? statRow('Disco', `${fmtBytes(now.disk.used)} de ${fmtBytes(now.disk.total)} (${pct(diskPct)})`, diskPct >= 90) : ''}
        ${statRow('Carga (1 / 5 / 15 min)', `${now.load.join(' / ')} · ${now.cores} núcleo${now.cores > 1 ? 's' : ''}`, now.load[0] > now.cores * 1.5)}
        ${statRow('Encendido desde hace', fmtUptime(now.uptime))}
        ${eg ? statRow('Salida a internet', eg.tunnel ? `por túnel WireGuard (casa) · IP ${esc(eg.ip || 'sin respuesta')}` : `directa desde el VPS${eg.ip ? ` · IP ${esc(eg.ip)}` : ''}`) : ''}
      </tbody></table>
      ${eg && !eg.tunnel ? '<p class="muted" style="font-size:12px">¿Bloqueos por la IP del VPS? Puedes sacar solo a OpenCode por tu servidor WireGuard de casa: <button class="btn small" data-act="settings" data-section="egress">Configurar en Ajustes</button></p>' : ''}
      <details class="ch-table"><summary>Ver como tabla (últimos ${Math.max(1, Math.round(history.length * d.intervalMs / 60000))} min)</summary>
        <table class="kv"><thead><tr><th></th><th>Mín.</th><th>Media</th><th>Máx.</th></tr></thead><tbody>${tableRows}</tbody></table></details>
      <p class="muted" style="font-size:12px">Una muestra cada ${Math.round(d.intervalMs / 1000)} s; se guarda la última hora (se reinicia al reiniciar el servicio).</p>`;
    if (act) barChart({ id: 'ch-req', data: act.requests.perMinute });
    if (history.length >= 2) {
      lineChart({ id: 'ch-cpu', series: [{ key: 'cpu', label: 'CPU', color: 'var(--s1)' }], data: history, yMax: 100, yFmt: pct, valFmt: pct });
      lineChart({ id: 'ch-mem', series: [{ key: 'mem', label: 'Memoria', color: 'var(--s1)' }], data: history, yMax: 100, yFmt: pct, valFmt: pct });
      lineChart({ id: 'ch-net', series: [{ key: 'rx', label: 'Recibida', color: 'var(--s1)' }, { key: 'tx', label: 'Enviada', color: 'var(--s2)' }], data: history, yMax: niceNet, yFmt: (v) => fmtBytes(v).replace('.0 ', ' '), valFmt: fmtRate });
    } else {
      for (const id of ['ch-cpu', 'ch-mem', 'ch-net']) { const e = document.getElementById(id); if (e) e.innerHTML = '<p class="muted">Recogiendo datos… vuelve en unos segundos.</p>'; }
    }
  };
  draw();
  timer = setInterval(() => { if (!document.hidden && document.body.contains(m.el)) draw(); else if (!document.body.contains(m.el)) clearInterval(timer); }, 10_000);
}

// Antes de reiniciar o actualizar: avisa si OpenCode está trabajando (se interrumpiría esa tarea)
function seenAgo(t) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 2 ? 'activo ahora' : m < 60 ? `visto hace ${m} min` : m < 1440 ? `visto hace ${Math.round(m / 60)} h` : `visto hace ${Math.round(m / 1440)} d`;
}

async function confirmInterrupt(question) {
  let busy = [];
  let queued = 0;
  let others = [];
  try { ({ busy, queued, others = [] } = await api('GET', '/api/activity')); } catch { /* sin datos: se pregunta lo normal */ }
  if (others.some((o) => o.busy)) {
    const who = others.filter((o) => o.busy).map((o) => `${o.name} (${o.busy})`).join(', ');
    const mine = busy.length ? `Tú también tienes ${busy.length} conversación${busy.length > 1 ? 'es' : ''} trabajando.\n\n` : '';
    return confirm(`Hay usuarios con OpenCode trabajando ahora mismo: ${who}.\n\n${mine}Si continúas, esas tareas se interrumpirán y no se reanudan solas.\n\n¿Continuar de todos modos?`);
  }
  if (!busy.length) return confirm(question);
  const names = [...new Set(busy.map((b) => b.projectName))].join(', ');
  return confirm(`OpenCode está trabajando ahora mismo (${busy.length} conversación${busy.length > 1 ? 'es' : ''}: ${names}).\n\nSi continúas, esa tarea se interrumpirá y no se reanuda sola${queued ? ' (los mensajes en cola sí se enviarán después)' : ''}.\n\n¿Continuar de todos modos?`);
}

function sessionMenuModal(projectId, sessionId) {
  const proj = state.projects.find((x) => x.id === projectId);
  const known = [...(state.featured.pinned || []), ...(state.featured.recent || [])].find((x) => x.projectId === projectId && x.id === sessionId)
    || (projectId === state.project?.id ? state.sessions.find((x) => x.id === sessionId) : null);
  if (!proj || !known) return;
  const title = known.title || '';
  let pinned = isPinned(projectId, sessionId);
  const m = openModal('Conversación', `
    <div class="field"><label for="sm-title">Título</label><input id="sm-title" type="text" value="${esc(title)}" maxlength="120" autocomplete="off" data-1p-ignore="true" data-lpignore="true"></div>
    <button class="btn primary" id="sm-save">Guardar título</button>
    <hr class="sep">
    <div class="row wrap"><button class="btn grow" id="sm-pin"></button><button class="btn danger grow" id="sm-del">Eliminar conversación</button></div>
    <p class="muted" style="margin:10px 0 0">Proyecto: ${esc(proj.name)}</p>`);
  const paintPin = () => { m.el.querySelector('#sm-pin').innerHTML = `${ico(I.star, `width="16" height="16" ${pinned ? 'style="fill:currentColor"' : ''}`)} ${pinned ? 'Quitar de destacadas' : 'Marcar como destacada'}`; };
  paintPin();
  const refreshAll = async () => { await Promise.all([projectId === state.project?.id ? loadSessions() : null, loadFeatured()]); };
  const save = async (b) => {
    const v = m.el.querySelector('#sm-title').value.trim();
    if (!v) { toast('El título no puede estar vacío', 'err'); return; }
    await busyBtn(b, 'Guardando…', () => api('PATCH', `/api/projects/${projectId}/sessions/${sessionId}`, { title: v }));
    toast('Título cambiado'); m.close(); await refreshAll();
  };
  m.el.querySelector('#sm-save').addEventListener('click', (e) => save(e.currentTarget).catch((err) => toast(err.message, 'err')));
  m.el.querySelector('#sm-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); m.el.querySelector('#sm-save').click(); } });
  m.el.querySelector('#sm-pin').addEventListener('click', async () => {
    try { pinned = !pinned; await api('PUT', '/api/conversations/pin', { projectId, sessionId, pinned }); paintPin(); await refreshAll(); } catch (err) { pinned = !pinned; toast(err.message, 'err'); }
  });
  m.el.querySelector('#sm-del').addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta conversación?')) return;
    try {
      await api('DELETE', `/api/projects/${projectId}/sessions/${sessionId}`);
      if (projectId === state.project?.id && state.sessionId === sessionId) { state.sessionId = null; state.messages = []; renderMessages(); }
      m.close(); await refreshAll();
    } catch (err) { toast(err.message, 'err'); }
  });
  setTimeout(() => { const i = m.el.querySelector('#sm-title'); i.focus(); i.select(); }, 60);
}

function renderSidebar() {
  if (!$('#sidebar')) return; // el panel de administración no tiene barra lateral
  const upd = state.update;
  const items = state.projects.map((p) => {
    const active = p.id === state.project?.id;
    const sess = active
      ? `<div class="sessions">
          <div class="sess" data-act="new-session">${ico(I.plus, 'width="14" height="14"')}<span class="name">Nueva conversación</span></div>
          ${state.sessions.map((s) => `
            <div class="sess ${s.id === state.sessionId ? 'active' : ''}" data-act="select-session" data-id="${esc(s.id)}">
              <span class="name">${esc(s.title || 'Sin título')}</span>
              ${isPinned(state.project.id, s.id) ? `<span class="pin-mark" title="Destacada">${ico(I.star, 'width="13" height="13" style="fill:currentColor"')}</span>` : ''}
              <button class="icon-btn del" data-act="session-menu" data-pid="${esc(state.project.id)}" data-id="${esc(s.id)}" aria-label="Opciones de la conversación" style="width:24px;height:24px">${ico(I.more, 'width="15" height="15"')}</button>
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
      ${featuredHtml()}
      <div class="side-title">Proyectos</div>
      ${items || '<p class="muted" style="padding:8px">Aún no tienes proyectos. Crea uno o clona un repositorio de GitHub.</p>'}
    </div>
    <div class="side-foot">
      <div id="sysmon-slot">${sysCardHtml()}</div>
      ${installPromptEvent && !isStandalone() ? `<button class="install-pill" data-act="install-app"><span>${ico(I.down, 'width="16" height="16"')}</span><span><strong>Instalar aplicación</strong><br><span class="muted">Añádela a tu pantalla de inicio</span></span></button>` : ''}
      ${upd?.behind ? `<button class="update-pill" data-act="settings" data-section="update"><span class="dot"></span><span><strong>Actualización disponible</strong><br><span class="muted">${upd.behind} cambio${upd.behind > 1 ? 's' : ''} nuevo${upd.behind > 1 ? 's' : ''} en GitHub</span></span></button>` : ''}
      ${state.multiuser && state.me ? `<div class="who muted">Sesión de <strong>${esc(state.me.name)}</strong>${state.me.role === 'admin' ? ' · administrador' : ''}</div>` : ''}
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
  state.queue = { items: [], paused: false };
  state.git = null;
  state.perms.clear();
  state.questions.clear();
  store.set('project', id);
  state.loadingChat = true;
  renderAll();
  connectEvents();
  try {
    await Promise.all([loadSessions(), loadGit()]);
    const remembered = store.get(`session:${id}`);
    const target = state.sessions.find((s) => s.id === remembered) || state.sessions[0];
    if (target) await selectSession(target.id, keepNav);
  } finally {
    state.loadingChat = false;
    renderAll();
  }
}

async function loadSessions() {
  if (!state.project) return;
  try {
    const list = await api('GET', `/api/projects/${state.project.id}/sessions`);
    if (Array.isArray(list)) state.sessions = list;
  } catch (e) {
    toast(`No se pudieron cargar las conversaciones: ${e.message}`, 'err');
  }
  renderSidebar();
  loadFeatured();
}

async function selectSession(id, keepNav = false) {
  state.sessionId = id;
  state.messages = [];
  state.queue = { items: [], paused: false };
  state.perms.clear();
  state.questions.clear();
  store.set(`session:${state.project.id}`, id);
  if (!keepNav) state.navOpen = false;
  state.loadingChat = true;
  renderAll();
  try {
    await refreshMessages(true);
  } finally {
    state.loadingChat = false;
    renderMessages(true);
  }
  await pollStatus(true);
  loadQueue();
  loadPerms();
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
    // Si OpenCode contesta algo que no es una lista (se está reiniciando, sesión no disponible…) se conserva lo que había
    if (!Array.isArray(msgs)) return;
    state.messages = msgs;
    renderMessages(forceScroll);
    if (msgs.some((m) => m.parts?.some((x) => x.type === 'tool' && x.tool === 'question' && x.state?.status === 'running'))) loadQuestions();
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

async function loadQueue() {
  if (!state.project || !state.sessionId) { state.queue = { items: [], paused: false }; renderQueue(); return; }
  const pid = state.project.id, sid = state.sessionId;
  try {
    const q = await api('GET', `/api/projects/${pid}/sessions/${sid}/queue`);
    if (state.project?.id === pid && state.sessionId === sid) { state.queue = q; renderQueue(); updateSendButton(); }
  } catch { /* se reintenta en el siguiente evento */ }
}

function renderQueue() {
  const box = $('#queue');
  if (!box) return;
  const { items, paused } = state.queue;
  box.classList.toggle('hidden', !items.length);
  if (!items.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="queue-head"><strong>En cola (${items.length})</strong>${paused ? '<span class="queue-paused">en pausa</span>' : ''}<span class="grow"></span>${paused ? '<button class="btn small" data-act="queue-resume">Reanudar</button>' : ''}<button class="btn small ghost" data-act="queue-clear">Vaciar</button></div>` +
    items.map((i, n) => `<div class="queue-item"><span class="queue-n">${n + 1}</span><span class="queue-text">${esc(i.text.length > 160 ? `${i.text.slice(0, 160)}…` : i.text)}</span><button class="icon-btn" data-act="queue-del" data-id="${esc(i.id)}" aria-label="Quitar de la cola">${ico(I.x, 'width="16" height="16"')}</button></div>`).join('');
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
  refreshTimer = setTimeout(() => { refreshMessages(); if (state.queue.items.length) loadQueue(); }, 180);
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
    setTimeout(loadQueue, 2500);
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
    if (p.part?.tool === 'question') setTimeout(loadQuestions, 300);
    scheduleRefresh();
  } else if (t === 'session.updated' || t === 'session.created' || t === 'session.deleted') {
    clearTimeout(sessionsTimer);
    sessionsTimer = setTimeout(loadSessions, 400);
  } else if ((t === 'permission.updated' || t === 'permission.asked') && (p.sessionID === state.sessionId)) {
    state.perms.set(p.id, p);
    renderPerms();
    renderWait();
  } else if (t === 'permission.replied') {
    state.perms.delete(p.permissionID || p.requestID || p.id);
    renderPerms();
    renderWait();
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

/* ---------- Preguntas del agente (herramienta question) ---------- */
async function loadQuestions() {
  if (!state.project || !state.sessionId) return;
  const pid = state.project.id, sid = state.sessionId;
  try {
    const list = await api('GET', `/api/projects/${pid}/questions`);
    if (state.project?.id !== pid || state.sessionId !== sid) return;
    const mine = (Array.isArray(list) ? list : []).filter((x) => x.sessionID === sid);
    for (const id of [...state.questions.keys()]) if (!mine.some((x) => x.id === id)) { state.questions.delete(id); state.qdraft.delete(id); }
    for (const x of mine) state.questions.set(x.id, x);
    renderWait();
  } catch { /* se reintenta en el siguiente ciclo */ }
}

function qDraft(q) {
  if (!state.qdraft.has(q.id)) state.qdraft.set(q.id, { sel: q.questions.map(() => []), text: q.questions.map(() => '') });
  return state.qdraft.get(q.id);
}

function questionCard(q) {
  const d = qDraft(q);
  const items = q.questions.map((x, i) => `
    <div class="qblock">
      ${x.header ? `<span class="chip">${esc(x.header)}</span>` : ''}
      <p class="qtext">${esc(x.question)}</p>
      <div class="qopts" role="${x.multiple ? 'group' : 'radiogroup'}">${(x.options || []).map((o, j) => `<button type="button" class="qopt${d.sel[i].includes(o.label) ? ' on' : ''}" data-qi="${i}" data-oi="${j}" aria-pressed="${d.sel[i].includes(o.label)}"><strong>${esc(o.label)}</strong>${o.description ? `<span>${esc(o.description)}</span>` : ''}</button>`).join('')}</div>
      ${x.custom === false ? '' : `<input type="text" class="qcustom" data-qi="${i}" placeholder="${(x.options || []).length ? 'Otra respuesta…' : 'Tu respuesta…'}" maxlength="1000" enterkeyhint="done" autocapitalize="sentences" value="${esc(d.text[i])}">`}
    </div>`).join('');
  return `<div class="wait-q" data-qid="${esc(q.id)}"><div class="qhead"><span class="wait-ico" aria-hidden="true">❓</span> <strong>OpenCode te pregunta</strong>${state.questions.size > 1 ? ` <span class="muted">(${state.questions.size} pendientes)</span>` : ''}</div>${items}
    <div class="row wrap qactions"><button type="button" class="btn primary grow" data-qsend disabled>Enviar respuestas</button><button type="button" class="btn danger" data-qrej>Descartar</button></div></div>`;
}

const qAnswers = (q) => { const d = qDraft(q); return q.questions.map((_, i) => [...d.sel[i], ...(d.text[i].trim() ? [d.text[i].trim()] : [])]); };
function syncQuestion() {
  const box = $('#wait .wait-q');
  const q = box && state.questions.get(box.dataset.qid);
  if (!q) return;
  const d = qDraft(q);
  box.querySelectorAll('.qopt').forEach((b) => { const on = d.sel[+b.dataset.qi].includes(q.questions[+b.dataset.qi].options[+b.dataset.oi].label); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  const ready = qAnswers(q).every((a) => a.length);
  const send = box.querySelector('[data-qsend]');
  if (send && !send.dataset.busy) send.disabled = !ready;
}

function bindQuestions() {
  const wait = $('#wait');
  wait.addEventListener('input', (e) => {
    const f = e.target.closest?.('.qcustom');
    const q = f && state.questions.get(f.closest('.wait-q')?.dataset.qid);
    if (!q) return;
    const i = +f.dataset.qi, d = qDraft(q);
    d.text[i] = f.value;
    if (!q.questions[i].multiple && f.value.trim()) d.sel[i] = []; // en una sola elección, escribir sustituye a lo marcado
    syncQuestion();
  });
  wait.addEventListener('click', async (e) => {
    const box = e.target.closest?.('.wait-q');
    const q = box && state.questions.get(box.dataset.qid);
    if (!q) return;
    const opt = e.target.closest('.qopt');
    if (opt) {
      const i = +opt.dataset.qi, label = q.questions[i].options[+opt.dataset.oi].label, d = qDraft(q);
      if (q.questions[i].multiple) d.sel[i] = d.sel[i].includes(label) ? d.sel[i].filter((x) => x !== label) : [...d.sel[i], label];
      else { d.sel[i] = d.sel[i].includes(label) ? [] : [label]; if (d.sel[i].length) { d.text[i] = ''; const f = box.querySelector(`.qcustom[data-qi="${i}"]`); if (f) f.value = ''; } }
      syncQuestion();
      return;
    }
    const base = `/api/projects/${state.project.id}/sessions/${state.sessionId}/questions/${q.id}`;
    if (e.target.closest('[data-qsend]')) {
      const btn = e.target.closest('[data-qsend]');
      btn.dataset.busy = '1';
      try {
        await busyBtn(btn, 'Enviando…', () => api('POST', `${base}/reply`, { answers: qAnswers(q) }));
        state.questions.delete(q.id); state.qdraft.delete(q.id);
        setBusy(true);
        renderWait();
        setTimeout(loadActivity, 800);
        setTimeout(() => refreshMessages(), 900);
      } catch (err) { toast(err.message, 'err'); } finally { delete btn.dataset.busy; syncQuestion(); }
    } else if (e.target.closest('[data-qrej]')) {
      if (!confirm('Descartar las preguntas detiene la tarea de OpenCode. ¿Descartar?')) return;
      try {
        await api('POST', `${base}/reject`);
        state.questions.delete(q.id); state.qdraft.delete(q.id);
        renderWait();
        setTimeout(refreshMessages, 600);
      } catch (err) { toast(err.message, 'err'); }
    }
  });
}

/* ---------- Archivos que menciona el agente (capturas, informes…) ---------- */
const FILE_RE = /(?:^|[\s`'"(\[*>])((?:\.{0,2}\/)?[\w@%+~.\-\/À-ɏ]+\.(?:png|jpe?g|gif|webp|pdf|zip|csv|xlsx|docx|pptx|txt|md|json|mp3|wav|mp4|svg|log|gz|tar))(?=$|[\s`'")\],.:;!?*<])/gi;
const fileCache = new Map(); // «proyecto:ruta» → { meta, at }
const FILE_NULL_TTL = 20_000;

function fileRefs(msg) {
  if (msg.info?.role !== 'assistant' || msg.info.summary) return [];
  const found = new Set();
  const scan = (t) => { for (const m of String(t || '').matchAll(FILE_RE)) found.add(m[1].replace(/^\.\//, '')); };
  for (const p of msg.parts || []) {
    if (p.type === 'text') scan(p.text);
    else if (p.type === 'tool' && p.state?.status === 'completed') {
      for (const m of String(typeof p.state.output === 'string' ? p.state.output.slice(0, 4000) : '').matchAll(FILE_RE)) if (/\.(png|jpe?g|gif|webp)$/i.test(m[1])) found.add(m[1].replace(/^\.\//, ''));
      const fp = p.state.input?.filePath;
      if (p.tool === 'write' && typeof fp === 'string' && /\.(png|jpe?g|gif|webp|pdf)$/i.test(fp)) found.add(fp);
    }
  }
  return [...found].filter((x) => !/^https?:/i.test(x) && !x.includes('..')).slice(0, 12);
}

const fileUrl = (pid, rel, dl) => `/api/projects/${pid}/file?path=${encodeURIComponent(rel)}${dl ? '&download=1' : ''}`;
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function renderFiles(msg) {
  const pid = state.project?.id;
  if (!pid) return '';
  const seenRel = new Set();
  const items = [];
  for (const r of fileRefs(msg)) {
    const hit = fileCache.get(`${pid}:${r}`)?.meta;
    if (!hit || seenRel.has(hit.rel)) continue;
    seenRel.add(hit.rel);
    items.push(hit);
  }
  if (!items.length) return '';
  const imgs = items.filter((x) => x.kind === 'image');
  const files = items.filter((x) => x.kind !== 'image');
  return `<div class="files-strip">${imgs.map((x) => `<button type="button" class="fthumb" data-fopen="${esc(x.rel)}" aria-label="Ver ${esc(x.name)}"><img loading="lazy" decoding="async" src="${fileUrl(pid, x.rel)}" alt="${esc(x.name)}"><span>${esc(x.name)}</span></button>`).join('')}${files.map((x) => `<a class="fchip" href="${fileUrl(pid, x.rel, true)}" download="${esc(x.name)}">${ico(I.download, 'width="16" height="16"')}<span>${esc(x.name)}</span><span class="muted">${fmtSize(x.size)}</span></a>`).join('')}</div>`;
}

let fileCheckBusy = false;
async function resolveFiles() {
  const pid = state.project?.id;
  if (!pid || fileCheckBusy) return;
  const now = Date.now();
  const want = new Set();
  for (const m of state.messages) for (const r of fileRefs(m)) {
    const c = fileCache.get(`${pid}:${r}`);
    if (!c || (!c.meta && now - c.at > FILE_NULL_TTL)) want.add(r);
  }
  if (!want.size) return;
  fileCheckBusy = true;
  try {
    const res = await api('POST', `/api/projects/${pid}/files/check`, { paths: [...want] });
    let gained = false;
    for (const r of want) { const meta = res[r] || null; fileCache.set(`${pid}:${r}`, { meta, at: Date.now() }); if (meta) gained = true; }
    if (gained && state.project?.id === pid) renderMessages();
  } catch { /* sin conexión: se reintenta en el siguiente repintado */ } finally { fileCheckBusy = false; }
}

function fileViewer(rel, name) {
  const pid = state.project.id;
  const m = openModal(name, `<div class="fview"><img src="${fileUrl(pid, rel)}" alt="${esc(name)}"></div>
    <div class="row wrap" style="margin-top:12px"><a class="btn primary grow" href="${fileUrl(pid, rel, true)}" download="${esc(name)}">Descargar</a></div>`);
  return m;
}

/* ---------- Contexto de la conversación y compactación ---------- */
// Tokens que ocupa la conversación = los de la última respuesta del modelo (entrada + salida + caché)
function contextInfo() {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const info = state.messages[i].info;
    if (info?.role !== 'assistant' || info.error) continue;
    if (info.summary) return { fresh: true, providerID: info.providerID, modelID: info.modelID };
    const t = info.tokens;
    if (!t) continue;
    const used = (t.input || 0) + (t.output || 0) + (t.reasoning || 0) + (t.cache?.read || 0) + (t.cache?.write || 0);
    if (!used) continue;
    const model = (state.models?.providers || []).find((p) => p.id === info.providerID)?.models.find((x) => x.id === info.modelID);
    const limit = model?.context || 0;
    return { used, limit, pct: limit ? Math.min(100, Math.round((used / limit) * 100)) : null, providerID: info.providerID, modelID: info.modelID };
  }
  return null;
}

function updateContext() {
  const btn = $('#ctx-btn');
  if (!btn) return;
  const c = state.project && state.sessionId ? contextInfo() : null;
  btn.classList.toggle('hidden', !c);
  if (!c) return;
  const level = c.fresh || c.pct == null ? '' : c.pct >= 90 ? 'high' : c.pct >= 70 ? 'mid' : '';
  btn.dataset.level = level;
  btn.innerHTML = c.fresh ? `<span class="ctx-ring" style="--p:0"></span><span>Compactada</span>`
    : c.pct == null ? `<span class="ctx-ring" style="--p:0"></span><span>${Math.round(c.used / 1000)}k</span>`
    : `<span class="ctx-ring" style="--p:${c.pct}"></span><span>${c.pct} %</span>`;
}

function contextModal() {
  const c = contextInfo();
  if (!c) return;
  const n = (v) => v.toLocaleString('es-ES');
  const usage = c.fresh ? '<p style="margin-top:0">La conversación se acaba de compactar. El uso real aparecerá con la próxima respuesta del modelo.</p>'
    : c.pct == null ? `<p style="margin-top:0"><strong>${n(c.used)}</strong> tokens usados. No conozco el límite de este modelo.</p>`
    : `<p style="margin-top:0"><strong>${n(c.used)}</strong> de ${n(c.limit)} tokens (${c.pct} %)</p><div class="ctx-bar" data-level="${c.pct >= 90 ? 'high' : c.pct >= 70 ? 'mid' : ''}"><span style="width:${c.pct}%"></span></div>`;
  const m = openModal('Contexto', `
    ${usage}
    <p class="muted">Compactar resume lo antiguo de la conversación y conserva lo reciente. Así cada petición lleva menos contexto, es más rápida y barata, y no se llega al límite del modelo. Se pierde detalle fino de lo antiguo. OpenCode ya compacta solo cuando se acerca al límite.</p>
    <div class="row wrap" style="margin-top:12px"><button class="btn primary grow" id="ctx-go" ${state.busy ? 'disabled' : ''}>Compactar ahora</button></div>
    ${state.busy ? '<p class="hint">OpenCode está trabajando: espera a que termine para compactar.</p>' : ''}`);
  m.el.querySelector('#ctx-go').addEventListener('click', async (e) => {
    const [pid, mid] = c.providerID && c.modelID ? [c.providerID, c.modelID] : (state.model || '').split('::');
    if (!pid || !mid) { toast('Elige un modelo para poder compactar', 'err'); return; }
    const projectId = state.project.id;
    const sessionId = state.sessionId;
    try {
      await busyBtn(e.currentTarget, 'Compactando…', () => api('POST', `/api/projects/${projectId}/sessions/${sessionId}/compact`, { providerID: pid, modelID: mid }));
      toast('Conversación compactada');
      m.close();
      if (state.sessionId === sessionId) await refreshMessages(true);
    } catch (err) {
      toast(err.message, 'err');
    }
  });
}

function renderMessage(msg) {
  const { info, parts = [] } = msg;
  if (info.role === 'user') {
    const text = parts.filter((p) => p.type === 'text' && !p.synthetic).map((p) => p.text).join('\n').trim();
    const imgs = parts.filter((p) => p.type === 'file' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(p.url || '')).map((p) => `<img class="msg-img" src="${p.url}" alt="${esc(p.filename || 'imagen')}">`).join('');
    return text || imgs ? `<div class="msg user">${imgs ? `<div class="msg-imgs">${imgs}</div>` : ''}${esc(text)}</div>` : '';
  }
  if (info.summary) {
    const t = parts.filter((p) => p.type === 'text' && p.text).map((p) => p.text).join('\n').trim();
    return t ? `<details class="compacted" data-key="${esc(info.id)}"><summary>Conversación compactada</summary><div class="rbody">${renderMarkdown(t)}</div></details>` : '';
  }
  let html = '';
  for (const p of parts) {
    if (p.type === 'text' && p.text) html += renderMarkdown(p.text);
    else if (p.type === 'reasoning' && p.text?.trim()) html += `<details class="reasoning" data-key="${esc(p.id)}"><summary>Razonamiento</summary><div class="rbody">${esc(p.text)}</div></details>`;
    else if (p.type === 'tool') html += renderTool(p);
  }
  if (info.error) html += `<div class="banner err">${esc(info.error.data?.message || info.error.name || 'Error')}</div>`;
  return html ? `<div class="msg assistant">${html}</div>${renderFiles(msg)}` : renderFiles(msg);
}

function renderMessages(forceScroll = false) {
  const chat = $('#chat');
  const inner = $('#chat-inner');
  if (!chat) return;
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 140;
  if (state.booting || state.loadingChat) {
    inner.innerHTML = `<div class="boot" role="status" aria-live="polite"><div class="logo boot-logo">${ico(I.code, 'stroke="#fff" stroke-width="2.4"')}</div><p>${state.booting ? 'Conectando con OpenCode…' : 'Cargando la conversación…'}</p><div class="boot-lines" aria-hidden="true"><div class="skel user"></div><div class="skel line" style="width:92%"></div><div class="skel line" style="width:78%"></div><div class="skel line" style="width:56%"></div></div></div>`;
    return;
  }
  const open = new Set($$('details[open]', inner).map((d) => d.dataset.key));

  if (!state.project) {
    inner.innerHTML = `<div class="empty"><div class="logo" style="margin:0 auto">${ico(I.code, 'stroke="#fff" stroke-width="2.4"')}</div><h1>Bienvenido</h1><p class="muted">Crea un proyecto o clona uno desde GitHub para empezar a trabajar con OpenCode.</p><p><button class="btn primary" data-act="new-project">Nuevo proyecto</button></p></div>`;
    return;
  }
  // Tras detener una tarea: acciones sobre la última consulta (editarla o retirarla)
  let lastUser = -1;
  state.messages.forEach((mm, i) => { if (mm.info?.role === 'user') lastUser = i; });
  const after = lastUser >= 0 ? state.messages.slice(lastUser + 1).filter((mm) => mm.info?.role === 'assistant') : [];
  const stopped = lastUser >= 0 && !state.busy && state.messages[lastUser].info?.id !== 'tmp'
    && (!after.length || after.some((mm) => mm.info?.error?.name === 'MessageAbortedError'));
  const html = state.messages.map((mm, i) => renderMessage(mm) + (i === lastUser && stopped
    ? `<div class="msg-actions" data-mid="${esc(mm.info.id)}"><span class="muted">Tarea detenida</span><button type="button" class="btn small" data-rw="edit">Editar consulta</button><button type="button" class="btn small danger" data-rw="del">Eliminar</button></div>` : '')).join('');
  inner.innerHTML = (html || `<div class="empty"><h1>${esc(state.project.name)}</h1><p class="muted">Escribe tu primera petición abajo. OpenCode trabajará dentro de este proyecto.</p></div>`)
    + '<div id="typing"></div><div id="perms"></div>';
  $$('details', inner).forEach((d) => { if (open.has(d.dataset.key)) d.open = true; });
  renderTyping();
  renderPerms();
  updateContext();
  resolveFiles();
  if (forceScroll || nearBottom) chat.scrollTop = chat.scrollHeight;
}

function renderTyping() {
  const el = $('#typing');
  if (el) el.innerHTML = state.busy ? '<span class="typing"><i></i><i></i><i></i></span>' : '';
}

// Solicitudes de permiso pendientes: se piden al servidor (no solo llegan por eventos), para no perderlas
// al recargar, cambiar de conversación o reconectar.
async function loadPerms() {
  if (!state.project || !state.sessionId) return;
  const pid = state.project.id, sid = state.sessionId;
  try {
    const list = await api('GET', `/api/projects/${pid}/permissions`);
    if (state.project?.id !== pid || state.sessionId !== sid) return;
    state.perms.clear();
    for (const x of Array.isArray(list) ? list : []) if (x.sessionID === sid) state.perms.set(x.id, x);
    renderPerms();
    renderWait();
  } catch { /* se reintenta en el siguiente ciclo */ }
}

// Las solicitudes de permiso se muestran en el aviso fijo sobre el cuadro de texto (renderWait);
// así se ven siempre, aunque el chat esté desplazado.
function renderPerms() {
  const el = $('#perms');
  if (el) el.innerHTML = '';
  renderWait();
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

// Proveedores visibles en el selector (los ocultos se gestionan en Ajustes)
const visibleProviders = () => (state.models?.providers || []).filter((p) => !(state.models?.hidden || []).includes(p.id));

const modelKey = (p, m) => `${p.id}::${m.id}`;

function allModels() {
  const out = [];
  for (const p of visibleProviders()) for (const m of p.models) out.push({ key: modelKey(p, m), provider: p.name, name: m.name });
  return out;
}

function renderModels() {
  const btn = $('#model-btn');
  if (!btn) return;
  if (state.booting) { btn.innerHTML = '<span class="skel" style="width:92px;height:12px"></span>'; btn.dataset.empty = '1'; return; }
  const providers = visibleProviders();
  if (!providers.length) {
    btn.textContent = (state.models?.providers || []).length ? 'Todos los modelos ocultos (Ajustes)' : 'Sin modelos: configura una API key';
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
  const providers = visibleProviders();
  if (!providers.length) { toast('No hay modelos visibles. Muéstralos en Ajustes → Proveedores de IA.'); return; }
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

// --- Imágenes adjuntas ---
const MAX_IMAGES = 4;
function readImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('No se pudo leer la imagen'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen no compatible'));
      img.onload = () => {
        // Se reduce a 1600 px como máximo para no subir fotos enormes desde el móvil
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        if (k === 1 && file.size < 1.5 * 1024 * 1024 && /^image\/(png|jpeg|webp)$/.test(file.type)) return resolve({ name: file.name || 'imagen', url: fr.result });
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve({ name: (file.name || 'imagen').replace(/\.\w+$/, '') + '.jpg', url: c.toDataURL('image/jpeg', 0.88) });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function addImages(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  for (const f of list) {
    if (state.attach.length >= MAX_IMAGES) { toast(`Máximo ${MAX_IMAGES} imágenes por mensaje`, 'err'); break; }
    try { state.attach.push(await readImage(f)); } catch (e) { toast(e.message, 'err'); }
  }
  renderAttach();
}
function renderAttach() {
  const row = $('#attach-row');
  if (!row) return;
  row.classList.toggle('hidden', !state.attach.length);
  row.innerHTML = state.attach.map((a, i) => `<div class="thumb"><img src="${a.url}" alt="${esc(a.name)}"><button type="button" class="thumb-x" data-i="${i}" aria-label="Quitar imagen">×</button></div>`).join('');
  updateSendButton();
}

function updateSendButton() {
  const b = $('#send');
  if (!b) return;
  const typed = Boolean($('#input')?.value.trim()) || state.attach.length > 0;
  const stop = state.busy && !typed;
  b.classList.toggle('stop', stop);
  b.innerHTML = ico(stop ? I.stop : I.send);
  b.setAttribute('aria-label', stop ? 'Detener' : state.busy ? 'Añadir a la cola' : 'Enviar');
  b.title = state.busy && typed ? 'Se enviará cuando OpenCode termine' : '';
  const inp = $('#input');
  if (inp) inp.placeholder = state.busy ? 'Trabajando… escribe para añadir a la cola' : 'Pide algo a OpenCode…';
  b.disabled = !state.project;
}

async function sendMessage(text, images = []) {
  if (!state.project) return;
  text = text.trim();
  if (!text && !images.length) return;
  try {
    if (!state.sessionId) {
      const s = await api('POST', `/api/projects/${state.project.id}/sessions`, {});
      state.sessions.unshift(s);
      state.sessionId = s.id;
      store.set(`session:${state.project.id}`, s.id);
      renderSidebar();
    }
    const [providerID, modelID] = (state.model || '').split('::');
    state.messages.push({ info: { id: 'tmp', role: 'user' }, parts: [...(text ? [{ type: 'text', text }] : []), ...images.map((a) => ({ type: 'file', mime: 'image/*', url: a.url, filename: a.name }))] });
    state.busyGrace = Date.now() + 5000;
    setBusy(true);
    renderMessages(true);
    await api('POST', `/api/projects/${state.project.id}/sessions/${state.sessionId}/send`, {
      text,
      images: images.length ? images : undefined,
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
  const text = input.value;
  if (state.busy && !text.trim()) {
    if (!state.sessionId) return;
    try { await api('POST', `/api/projects/${state.project.id}/sessions/${state.sessionId}/abort`); loadQueue(); } catch (e) { toast(e.message, 'err'); }
    return;
  }
  if ((!text.trim() && !state.attach.length) || !state.project) return;
  if (state.busy && state.attach.length) { toast('Las imágenes solo se pueden enviar cuando OpenCode no está trabajando. Espera a que termine o quítalas.', 'err'); return; }
  if (state.busy) {
    // OpenCode está ocupado: el mensaje espera en la cola del servidor
    const [providerID, modelID] = (state.model || '').split('::');
    try {
      await api('POST', `/api/projects/${state.project.id}/sessions/${state.sessionId}/queue`, { text, model: providerID && modelID ? { providerID, modelID } : undefined });
      input.value = '';
      autosize(input);
      updateSendButton();
      await loadQueue();
    } catch (e) { toast(e.message, 'err'); }
    return;
  }
  const images = state.attach;
  input.value = '';
  state.attach = [];
  autosize(input);
  renderAttach();
  await sendMessage(text, images);
}


/* El cuadro del chat es un editable de texto plano, no un <textarea>: iOS ofrece el código de verificación
   y las contraseñas guardadas del sitio en cualquier campo de formulario, pero no en un editable.
   Mantiene la interfaz de un campo (value, placeholder, focus) para el resto del código. */
function textboxShim(el, { line = false } = {}) {
  if (!el || el.dataset.shim) return;
  el.dataset.shim = '1';
  el.contentEditable = 'plaintext-only';
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; // iOS antiguo
  const max = Number(el.getAttribute('maxlength')) || 0;
  const clean = (t) => (line ? t.replace(/[\r\n]+/g, '') : t);
  const read = () => clean(line ? el.textContent : el.innerText.replace(/\n$/, ''));
  Object.defineProperty(el, 'value', { get: read, set: (v) => { el.textContent = clean(String(v ?? '')); } });
  Object.defineProperty(el, 'placeholder', { get: () => el.dataset.placeholder || '', set: (v) => { el.dataset.placeholder = v; } });
  Object.defineProperty(el, 'disabled', { get: () => el.contentEditable === 'false', set: (v) => { el.contentEditable = v ? 'false' : 'plaintext-only'; } });
  el.select = () => { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
  const caretToEnd = () => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
  el.addEventListener('input', () => {
    if (!el.textContent) el.replaceChildren(); // sin <br> residual: así funciona el :empty
    else if (max && read().length > max) { el.textContent = read().slice(0, max); caretToEnd(); }
  });
  if (line) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  // Pegar siempre como texto plano (también en navegadores sin plaintext-only)
  el.addEventListener('paste', (e) => {
    if (e.defaultPrevented || e.clipboardData?.files?.length) return;
    const t = e.clipboardData?.getData('text/plain');
    if (t == null) return;
    e.preventDefault();
    let txt = clean(t);
    if (max) txt = txt.slice(0, Math.max(0, max - read().length));
    document.execCommand('insertText', false, txt);
  });
}

/* Campos de texto como editables de texto plano. iOS ofrece contraseñas y códigos de verificación guardados
   en cualquier input/textarea del sitio; en un editable no. Se convierten al insertar HTML (de forma síncrona,
   antes de que el código enlace eventos) y mantienen value, placeholder, disabled, select() y focus().
   Quedan como input real: contraseñas, usuario, y todo lo que está dentro de un <form> (inicio de sesión). */
const PF_KEEP_AC = /^(username|current-password|new-password|one-time-code)$/;
function plainFieldize(root) {
  for (const el of root.querySelectorAll('input,textarea')) {
    const area = el.tagName === 'TEXTAREA';
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (!area && !['text', 'url', 'email', 'search'].includes(t)) continue;
    if (PF_KEEP_AC.test(el.getAttribute('autocomplete') || '') || el.closest('form')) continue;
    const d = document.createElement('div');
    for (const a of el.attributes) {
      if (['type', 'value', 'placeholder', 'name', 'autocomplete', 'list', 'rows', 'autofocus'].includes(a.name)) continue;
      d.setAttribute(a.name, a.value);
    }
    d.classList.add('pf', area ? 'pf-area' : 'pf-line');
    d.setAttribute('role', 'textbox');
    if (area) { d.setAttribute('aria-multiline', 'true'); d.style.minHeight = `calc(${Number(el.getAttribute('rows')) || 2} * 1.45em + 20px)`; }
    d.dataset.placeholder = el.getAttribute('placeholder') || '';
    for (const [k, v] of Object.entries(FIELD_HINTS[el.id] || {})) d.setAttribute(k, v);
    if (!d.hasAttribute('autocapitalize') && !area) d.setAttribute('autocapitalize', 'none');
    if (!d.hasAttribute('inputmode') && (t === 'url' || t === 'email')) d.setAttribute('inputmode', t);
    if (t === 'search' && !d.hasAttribute('enterkeyhint')) d.setAttribute('enterkeyhint', 'search');
    d.textContent = area ? el.value : (el.getAttribute('value') || '');
    textboxShim(d, { line: !area });
    el.replaceWith(d);
    if (el.hasAttribute('autofocus')) setTimeout(() => d.focus(), 0);
  }
}
{
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', {
    ...desc,
    set(v) { desc.set.call(this, v); if (typeof v === 'string' && /<(input|textarea)/i.test(v)) plainFieldize(this); },
  });
  const ins = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (pos, html) { ins.call(this, pos, html); if (/<(input|textarea)/i.test(html)) plainFieldize(this.parentElement || this); };
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
    ${state.gitFail ? `<div class="banner err" style="margin-bottom:12px">
      <div class="row"><strong class="grow">${esc(state.gitFail.ex ? state.gitFail.ex.title : 'Git ha devuelto un error')}</strong><button class="icon-btn" data-act="git-dismiss" aria-label="Descartar" style="width:32px;height:32px">${ico(I.x)}</button></div>
      ${state.gitFail.ex ? `<p style="margin:6px 0 0">${esc(state.gitFail.ex.advice)}</p>` : ''}
      <details ${state.gitFail.ex ? '' : 'open'} style="margin-top:8px"><summary class="muted" style="cursor:pointer">Salida completa de git</summary><div class="output" style="max-height:none;user-select:text">${esc(state.gitFail.text)}</div></details>
    </div>` : ''}

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

// Traduce los errores típicos de git/GitHub a algo accionable. `text` es la salida completa de git.
function gitExplain(text) {
  const t = String(text || '');
  const rules = [
    [/without [`'"]?workflow[`'"]? scope|workflow[`'"]? scope/i, 'GitHub rechaza el push porque incluye archivos de GitHub Actions (.github/workflows) y tu token no tiene permiso para modificarlos.',
      'Crea un token nuevo con el permiso «Workflows» (fine-grained: Workflows → lectura y escritura; clásico: marca «workflow») y pégalo en Ajustes → GitHub.'],
    [/GH013|push protection|secret.?scanning|Push cannot contain secrets/i, 'GitHub ha bloqueado el push porque detecta un secreto (clave o token) en los commits.',
      'Quita el secreto del archivo, rota esa clave y rehaz el commit. El mensaje de abajo indica el archivo y la línea.'],
    [/\[rejected\].*(fetch first|non-fast-forward)|non-fast-forward|fetch first|Updates were rejected/i, 'GitHub tiene cambios que tú no tienes, así que no acepta el push.',
      'Pulsa «Pull (fusionar)» y, cuando termine, vuelve a hacer «Push».'],
    [/protected branch|GH006|Changes must be made through a pull request|required status check/i, 'La rama está protegida en GitHub: no admite push directos.',
      'Crea una rama nueva, súbela y abre un Pull Request.'],
    [/Permission to .* denied|403|Write access to repository not granted|permission denied/i, 'Tu token no tiene permiso de escritura en este repositorio.',
      'En GitHub edita el token: añade este repositorio y da «Contents» en lectura y escritura (o crea un token nuevo desde Ajustes → GitHub).'],
    [/Authentication failed|could not read (Username|Password)|Invalid username or password|Bad credentials|401/i, 'GitHub no acepta el token (caducado o revocado).',
      'Crea un token nuevo y pégalo en Ajustes → GitHub.'],
    [/Repository not found|not found/i, 'GitHub no encuentra el repositorio, o tu token no lo ve.',
      'Comprueba que existe y que el token incluye este repositorio.'],
    [/Could not resolve host|Connection timed out|Failed to connect|Operation timed out|unable to access/i, 'No hay conexión con GitHub desde el VPS.', 'Reintenta en un momento. Si usas el túnel WireGuard, comprueba que esté funcionando.'],
  ];
  for (const [re, title, advice] of rules) if (re.test(t)) return { title, advice };
  return null;
}

// Una línea útil para el aviso corto (la primera de git suele ser solo «To https://…»)
function gitBestLine(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const pick = lines.find((l) => /^(fatal:|error:|remote: (error|fatal|Permission|Invalid|Repository|Write)|!\s)/i.test(l)) || lines.find((l) => !/^To /.test(l)) || lines[0] || 'Error de git';
  return pick.replace(/^(fatal|error): /i, '').slice(0, 200);
}

async function gitAction(btn, label, path, body, { successMsg } = {}) {
  const id = state.project.id;
  return busyBtn(btn, label, async () => {
    try {
      const r = await api('POST', `/api/projects/${id}/git/${path}`, body || {});
      state.gitOutput = (r.output || '').trim();
      state.gitFail = null;
      if (r.conflict) toast('Hay conflictos que resolver', 'err');
      else toast(successMsg || 'Hecho');
      await loadGit();
      return r;
    } catch (e) {
      const full = e.data?.output || e.message;
      const ex = gitExplain(full);
      state.gitOutput = '';
      state.gitFail = { text: full, ex };
      toast(ex ? ex.title : gitBestLine(full), 'err');
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
  $('#np-gotoset', root).addEventListener('click', (ev) => { ev.preventDefault(); m.remove(); settingsModal('conn'); });
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
async function settingsModal(section, { admin = false } = {}) {
  const m = openModal(admin ? 'Administración' : 'Ajustes', '<p class="muted">Cargando…</p>', { wide: true, bare: true, sticky: admin });
  m.el.querySelector('.modal').insertAdjacentHTML('afterbegin', `<div class="sethead"><button type="button" class="cbtn" data-sback aria-label="Cerrar">${ico(I.x, 'width="22" height="22"')}</button><div class="settitle">${admin ? 'Administración' : 'Ajustes'}</div><button type="button" class="cbtn" data-sinfo aria-label="Acerca de"><span class="ibig">i</span></button></div>`);
  m.drag(m.el.querySelector('.sethead'));
  const usersP = state.multiuser ? api('GET', '/api/users').catch(() => null) : Promise.resolve(null);
  const [settings, gh, oc, upd, models, eg0] = await Promise.all([
    admin ? Promise.resolve({ canAdmin: true, canManageUsers: true, gitName: '', gitEmail: '' }) : api('GET', '/api/settings'),
    admin ? Promise.resolve({ connected: false }) : api('GET', '/api/github/status').catch(() => ({ connected: false })),
    admin ? Promise.resolve({}) : api('GET', '/api/opencode/status').catch(() => ({})),
    api('GET', '/api/update/status').catch(() => null),
    admin ? Promise.resolve(null) : api('GET', '/api/models').catch(() => null),
    api('GET', '/api/egress').catch(() => null),
  ]);
  let eg = eg0;
  const canAdmin = settings.canAdmin !== false; // en el espacio de un usuario, actualizaciones, WireGuard y OpenCode los gestiona el administrador
  let usersData = settings.canManageUsers ? await usersP : null;
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
        : (u.pending ? '<p class="muted">Buscando actualizaciones en GitHub…</p>' : !u.error ? '<p class="muted">Estás en la última versión.</p>' : '')}
      ${u.dirty ? '<div class="banner err" style="margin-bottom:10px">Hay cambios locales sin confirmar en la instalación: la actualización automática está bloqueada.</div>' : ''}
      <div class="row wrap">
        <button class="btn" id="upd-check">Buscar actualizaciones</button>
        <button class="btn primary" id="upd-apply" ${u.behind && !u.dirty ? '' : 'disabled'}>Actualizar ahora</button>
        <button class="btn danger" id="upd-rollback" ${u.canRollback ? '' : 'disabled'}>Volver a la versión anterior</button>
      </div>
      ${u.underSystemd ? '' : '<p class="muted" style="font-size:13px">No se ejecuta bajo systemd: tras actualizar tendrás que reiniciar el proceso a mano.</p>'}`;
  };

  let egDraft = ''; // lo pegado en el formulario: no se pierde si falla al aplicar
  const egressBlock = () => {
    if (!eg) return '<p class="muted" style="margin:0">No se pudo consultar el estado.</p>';
    const ipTxt = (ip) => (ip ? ` · IP ${esc(ip)}` : '');
    if (!eg.helper) return `
      <p style="margin-top:0">Si el proveedor de modelos gratuitos bloquea la IP de tu VPS, puedes sacar <strong>solo el tráfico de OpenCode</strong> por tu servidor WireGuard de casa. Estado actual: salida directa desde el VPS${ipTxt(eg.ip)}.</p>
      <p style="margin-bottom:6px">Para gestionarlo desde aquí hay que instalar un pequeño ayudante en el VPS (una sola vez, por SSH):</p>
      ${cmdBox('sudo /opt/opencode-cloud/deploy/egress.sh setup', 'margin-bottom:10px')}
      <button class="btn" id="eg-recheck">Ya lo he instalado, comprobar</button>`;
    const age = eg.handshakeAge;
    const stale = eg.active && age != null && (age < 0 || age > 300);
    const problem = eg.active && (stale || /no consigue|no hay handshake/.test(eg.message || ''));
    const hs = eg.active && age != null ? (age < 0 ? 'sin handshake todavía' : `último handshake hace ${age < 90 ? `${age} s` : `${Math.round(age / 60)} min`}`) : '';
    const state1 = eg.active
      ? (problem ? '<span style="color:var(--warn)">Túnel activo con problemas</span>' : `<span style="color:var(--ok)">Activo</span>: OpenCode sale por tu casa${ipTxt(eg.tunnel ? eg.ip : eg.tunnelIp)}`)
      : (eg.configured ? 'Configurado pero <strong>desactivado</strong>: sale directo desde el VPS' : 'Sin configurar: sale directo desde el VPS')
        + ipTxt(eg.ip);
    const saved = eg.configured ? `<div class="banner" style="margin-bottom:10px">
        <strong>Configuración guardada en el VPS</strong>${eg.endpoint ? `<br>Servidor de casa: <code>${esc(eg.endpoint)}</code>` : ''}${eg.address ? `<br>Dirección del túnel: <code>${esc(eg.address)}</code>` : ''}
        <br><span class="muted">La clave privada está guardada y no se vuelve a mostrar por seguridad.${hs ? ` · ${hs}` : ''}</span></div>` : '';
    const old = eg.helperV < 3 ? `<div class="banner" style="margin-bottom:10px">El ayudante está desactualizado: ${eg.helperV < 2 ? 'no vigila el túnel ni recupera la conexión si se cae, y ' : ''}no permite editar la configuración guardada. Ejecuta de nuevo este comando por SSH (no pierdes tu configuración):${cmdBox('sudo /opt/opencode-cloud/deploy/egress.sh setup', 'margin-top:8px')}</div>` : '';
    const draft = esc(egDraft || eg.confView || '');
    const form = `
      <label for="eg-conf" class="muted" style="font-size:13.5px;display:block;margin-bottom:6px">${eg.configured ? 'Configuración guardada (editable)' : 'Configuración del cliente WireGuard'} — el contenido del archivo <code>.conf</code></label>
      <textarea id="eg-conf" rows="6" class="mono" style="font-size:13px" placeholder="[Interface]&#10;PrivateKey = …&#10;Address = 10.8.0.2/32&#10;&#10;[Peer]&#10;PublicKey = …&#10;Endpoint = tucasa.ejemplo.org:51820&#10;AllowedIPs = 0.0.0.0/0" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">${draft}</textarea>
      <div class="row wrap" style="margin-top:8px">
        <label class="btn" for="eg-file" style="cursor:pointer">Cargar archivo…</label><input id="eg-file" type="file" style="display:none">
        <button class="btn primary grow" id="eg-save">Guardar y activar</button>
      </div>
      <p class="muted" style="font-size:12.5px;margin:8px 0 0">${eg.confView ? 'Donde pone <code>(guardada)</code> se conserva la clave que ya está en el VPS: déjalo así salvo que quieras cambiarla. ' : ''}La clave privada se guarda solo en el VPS (<code>/etc/wireguard</code>, solo root) y no vuelve a mostrarse. Tu servidor de casa debe permitir <code>0.0.0.0/0</code>, reenviar paquetes y hacer NAT.</p>`;
    return `
      <p style="margin-top:0">${state1}</p>
      ${eg.active && eg.directIp ? `<p class="muted" style="margin-top:-6px;font-size:13px">IP del VPS: ${esc(eg.directIp)}</p>` : ''}
      ${problem ? `<div class="banner err" style="margin-bottom:10px">${esc(stale ? `El servidor de casa no responde (${hs}). El vigilante intentará reconectar solo; también puedes pulsar «Reconectar». Si tu IP de casa cambió, comprueba el nombre del Endpoint.` : eg.message)}</div>` : ''}
      ${old}
      ${saved}
      ${eg.configured ? `<div class="row wrap" style="margin-bottom:12px">
        ${eg.active ? '<button class="btn" id="eg-reconnect">Reconectar</button><button class="btn" id="eg-off">Desactivar</button>' : '<button class="btn primary" id="eg-on">Activar</button>'}
        <button class="btn danger" id="eg-remove">Quitar configuración</button></div>
      <details id="eg-replace"${egDraft ? ' open' : ''}><summary class="muted" style="cursor:pointer;margin-bottom:8px">${eg.confView ? 'Editar la configuración…' : 'Sustituir la configuración…'}</summary>${form}</details>` : form}`;
  };

  const genPass = () => {
    const al = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const r = crypto.getRandomValues(new Uint32Array(14));
    return [...r].map((n) => al[n % al.length]).join('');
  };
  const usersBlock = () => {
    const d = usersData;
    if (!d) return '<p class="muted" style="margin:0">No se pudo cargar la lista de usuarios.</p>';
    const h = d.helper || {};
    const warn = !h.ready
      ? `<div class="banner err" style="margin-bottom:10px">Falta instalar el ayudante del sistema (una sola vez, por SSH):${cmdBox('sudo /opt/opencode-cloud/deploy/multiuser.sh setup', 'margin-top:8px')}</div>`
      : (h.outdated ? `<div class="banner" style="margin-bottom:10px">El ayudante del sistema está desactualizado. Ejecuta de nuevo este comando por SSH:${cmdBox('sudo /opt/opencode-cloud/deploy/multiuser.sh setup', 'margin-top:8px')}</div>` : '');
    const stat = (u) => {
      if (u.role === 'admin') return ['', 'Administrador'];
      if (u.disabled) return ['off', 'Desactivado'];
      if (!u.running) return ['warn', 'Sin responder'];
      if (u.activity === 'busy') return ['busy', `Trabajando${u.busy ? ` (${u.busy})` : ''}${u.queued ? ` · ${u.queued} en cola` : ''}`];
      const seen = u.lastSeen ? seenAgo(u.lastSeen) : 'sin conexión reciente';
      if (u.activity === 'idle') return ['ok', `Libre · ${seen}`];
      return ['warn', `Actividad desconocida · ${seen}`];
    };
    const rows = d.users.map((u) => {
      const [k, txt] = stat(u);
      return `<div class="urow"><div class="uav">${esc(u.name.slice(0, 1).toUpperCase())}</div>
        <div class="umain"><div class="uname">${esc(u.name)}</div><div class="ustat"><span class="dot ${k}"></span>${esc(txt)}</div></div>
        ${u.role === 'admin' ? '' : `<button type="button" class="icon-btn" data-u-menu="${esc(u.name)}" aria-label="Acciones de ${esc(u.name)}">${ico(I.dots)}</button>`}</div>`;
    }).join('');
    return `
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="muted" style="font-size:13.5px">Cada usuario tiene su espacio aislado.</span>
        <button class="icon-btn" id="users-refresh" type="button" aria-label="Actualizar actividad" title="Actualizar actividad">${ico(I.refresh)}</button>
      </div>
      ${warn}
      <div id="user-list" style="margin-bottom:12px">${rows}</div>
      <div class="row wrap" style="margin-bottom:12px"><button class="btn small" id="spaces-restart-us" type="button">Reiniciar todos los espacios</button></div>
      <details class="nu-box" id="nu-box"><summary>+ Nuevo usuario</summary>
        <div class="stack" style="margin-top:10px">
          <input id="nu-name" type="text" placeholder="Usuario (minúsculas y números)" maxlength="20" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
          <input id="nu-pass" name="new-user-secret" type="text" class="secret" placeholder="Contraseña (mín. 8)" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
          <div class="row wrap"><button class="btn" id="nu-gen" type="button">Generar</button><button class="btn primary grow" id="nu-create" type="button" ${h.ready ? '' : 'disabled'}>Crear usuario</button></div>
        </div>
      </details>`;
  };

  const viewTitles = { oc: 'OpenCode', conn: 'Conexiones', ia: 'IA y OpenCode', ext: 'Extensiones', sk: 'Habilidades', users: 'Usuarios', red: 'Salida a internet', upd: 'Actualizaciones', app: 'Aplicación', pw: 'Contraseña' };
  const legacy = { update: 'upd', egress: 'red' };
  let curView = legacy[section] || (viewTitles[section] ? section : 'main');
  if ((curView === 'users' || curView === 'red' || curView === 'upd' || curView === 'oc') && !canAdmin) curView = 'main';

  const mainHtml = () => {
    const R = (k, icon, label, val = '', hot = false) => `<button type="button" class="srow" data-go="${k}"><span class="si">${ico(icon, 'width="22" height="22"')}</span><span class="sl">${label}</span>${val ? `<span class="sv${hot ? ' hot' : ''}">${esc(val)}</span>` : ''}<span class="sc">${ico(I.chevr, 'width="18" height="18"')}</span></button>`;
    const me = state.multiuser && state.me ? state.me : null;
    const title = me ? me.name : (gh.connected ? gh.login : 'OpenCode Cloud');
    const sub = me ? (me.role === 'admin' ? 'Administrador' : me.via === 'admin' ? 'Sesión del administrador' : 'Usuario') : (gh.connected ? 'GitHub conectado' : 'GitHub sin conectar');
    const u = state.update;
    const theme = store.get('theme', 'system');
    const egVal = !eg ? '' : !eg.helper ? 'Sin ayudante' : eg.active ? 'Activa' : eg.configured ? 'Desactivada' : 'Sin configurar';
    const usersVal = settings.canManageUsers ? String(usersData?.users?.length ?? '') : 'Desactivado';
    return `
      ${admin ? `<div class="scard acct"><span class="avatar">${esc((title || '?').slice(0, 1).toUpperCase())}</span><span class="acct-t"><strong>${esc(title)}</strong><span class="muted">Panel de administración</span></span></div>` : `<button type="button" class="scard acct" data-go="conn"><span class="avatar">${esc((title || '?').slice(0, 1).toUpperCase())}</span><span class="acct-t"><strong>${esc(title)}</strong><span class="muted">${esc(sub)}</span></span><span class="sc">${ico(I.chevr, 'width="18" height="18"')}</span></button>
      <div class="sgl">Cuenta</div>
      <div class="scard">${R('conn', I.tconn, 'Conexiones', gh.connected ? gh.login : 'Sin conectar')}${R('pw', I.lock, 'Contraseña')}</div>
      <div class="sgl">Aplicación</div>
      <div class="scard">${R('ia', I.tia, 'IA y OpenCode', oc.healthy ? (oc.version ? `v${oc.version}` : '') : 'No responde')}${R('ext', I.tpuz, 'Extensiones')}${R('sk', I.book, 'Habilidades')}</div>
      ${settings.adminUrl ? `<div class="scard"><a class="srow" href="${esc(settings.adminUrl)}" target="_blank" rel="noopener noreferrer"><span class="si">${ico(I.tusers, 'width="22" height="22"')}</span><span class="sl">Panel de administración</span><span class="sc">${ico(I.chevr, 'width="18" height="18"')}</span></a></div>` : ''}`}
      ${admin ? `<div class="sgl">Recursos</div><div class="scard" style="padding:10px 12px" id="adm-sys">${sysCardHtml()}</div>` : ''}
      ${canAdmin ? `<div class="sgl">Servidor</div>
      <div class="scard">${R('users', I.tusers, 'Usuarios', usersVal)}${R('red', I.tred, 'Salida a internet', egVal)}${admin ? R('oc', I.tia, 'OpenCode', 'Actualizar') : ''}${R('upd', I.upd, 'Actualizaciones', u?.behind ? `${u.behind} nueva${u.behind > 1 ? 's' : ''}` : (u?.version ? `v${u.version}` : ''), Boolean(u?.behind))}</div>` : ''}
      <div class="scard" style="margin-top:22px">${admin ? R('pw', I.lock, 'Contraseña') : ''}${R('app', I.phone, 'Instalar aplicación', isStandalone() ? 'Instalada' : '')}</div>
      <div class="sgl">Apariencia</div>
      <div class="themes">${[['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Sistema']].map(([k, l]) => `<button type="button" class="theme-opt${theme === k ? ' on' : ''}" data-theme-set="${k}"><span class="tp ${k}"></span><span>${l}</span></button>`).join('')}</div>
      <div class="scard" style="margin-top:22px"><button type="button" class="srow danger" data-logout><span class="si">${ico(I.logout, 'width="22" height="22"')}</span><span class="sl">Cerrar sesión</span></button></div>`;
  };

  m.body.innerHTML = `
    <div class="tabpane" data-pane="main"${curView === 'main' ? '' : ' hidden'}>${mainHtml()}</div>
    <div class="tabpane" data-pane="conn"${curView === 'conn' ? '' : ' hidden'}>
    <h3 style="margin-top:0">GitHub</h3>
    <div id="gh-block">
      ${gh.connected ? `<p style="margin-top:0">Conectado como <strong>${esc(gh.login)}</strong>.</p><div class="row wrap"><button class="btn small danger" id="gh-remove">Desconectar</button><a class="btn small" href="${GH_TOKENS_PAGE}" target="_blank" rel="noopener noreferrer">Gestionar mis tokens en GitHub</a></div>`
        : `<p style="margin-top:0">Necesitas un <strong>token de acceso personal</strong> de GitHub. No hace falta escribir tu usuario: se detecta solo a partir del token.</p>
        <div class="row wrap" style="margin-bottom:10px">
          <a class="btn" href="${GH_TOKEN_FINE}" target="_blank" rel="noopener noreferrer">Crear token (recomendado)</a>
          <a class="btn" href="${GH_TOKEN_CLASSIC}" target="_blank" rel="noopener noreferrer">Crear token clásico (más rápido)</a>
        </div>
        <p class="muted" style="font-size:13.5px;margin:0 0 12px"><strong>Recomendado</strong> (fine-grained): se abre ya con los permisos <em>Contents</em>, <em>Pull requests</em> y <em>Workflows</em> (para repos con GitHub Actions) en lectura y escritura; solo tienes que elegir en la página los repositorios a los que dará acceso y pulsar «Generate token». <strong>Clásico</strong>: viene con los permisos <code>repo</code> y <code>workflow</code> marcados y da acceso a todos tus repos. GitHub muestra el token una sola vez: cópialo y pégalo aquí. Se guarda solo en tu servidor.</p>
        <div class="row"><input id="gh-token" name="gh-pat-field" type="text" class="secret grow" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" placeholder="github_pat_… o ghp_…"><button class="btn primary" id="gh-save">Guardar</button></div>`}
    </div>

    <h3>Identidad de Git</h3>
    <div class="row wrap"><input id="g-name" type="text" class="grow" value="${esc(settings.gitName)}" placeholder="Nombre"><input id="g-email" type="email" class="grow" value="${esc(settings.gitEmail)}" placeholder="correo"><button class="btn" id="g-save">Guardar</button></div>

    </div>
    <div class="tabpane" data-pane="ia"${curView === 'ia' ? '' : ' hidden'}>
    <h3 style="margin-top:0">Proveedores de IA</h3>
    <p class="muted" style="margin-top:0">Añade una API key para que aparezcan sus modelos en el selector. Con «Visible» desactivado, un proveedor sigue conectado pero sus modelos no salen en la lista.</p>
    ${(() => {
      const stored = new Map((models?.stored || []).map((x) => [x.id, x]));
      const rows = new Map();
      for (const p of models?.providers || []) rows.set(p.id, { id: p.id, name: p.name, count: p.models.length });
      for (const x of models?.stored || []) if (!rows.has(x.id)) rows.set(x.id, { id: x.id, name: x.name, count: 0 });
      if (!rows.size) return '';
      const hidden = models?.hidden || [];
      return `<div id="prov-list" class="stack" style="margin-bottom:10px">${[...rows.values()].sort((a, b) => a.name.localeCompare(b.name)).map((r) => {
        const st = stored.get(r.id);
        return `<div class="prov-row"><div class="grow"><strong>${esc(r.name)}</strong> <span class="muted mono">${st ? esc(st.hint || (st.type === 'oauth' ? 'sesión' : 'clave')) : 'sin clave propia'}</span><div class="muted" style="font-size:12px">${r.count} modelos</div></div><label class="switch" title="Mostrar sus modelos en el selector"><input type="checkbox" data-prov-vis="${esc(r.id)}" ${hidden.includes(r.id) ? '' : 'checked'}><span>Visible</span></label>${st ? `<button class="btn danger" data-prov-del="${esc(r.id)}" data-prov-name="${esc(r.name)}">Quitar</button>` : ''}</div>`;
      }).join('')}</div>`;
    })()}
    <div class="row wrap"><select id="prov-id" class="grow">${providerOptions}</select><input id="prov-key" name="provider-key-field" type="text" class="secret grow" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" placeholder="API key"><button class="btn" id="prov-save">Guardar</button></div>
    <div id="prov-help" style="margin-top:8px"></div>

    <h3>OpenCode</h3>
    <p style="margin-top:0">Estado: ${oc.healthy ? '<span style="color:var(--ok)">en marcha</span>' : '<span style="color:var(--err)">no responde</span>'}${oc.version ? ` · versión ${esc(oc.version)}` : ''}</p>
    <div class="row wrap"><button class="btn" id="oc-restart">Reiniciar OpenCode</button>${canAdmin && !admin ? '<button class="btn" id="oc-upgrade">Actualizar OpenCode</button>' : ''}<button class="btn ghost" id="oc-logs">Ver registro</button></div>
    <div id="oc-logbox"></div>
    </div>

    <div class="tabpane" data-pane="ext"${curView === 'ext' ? '' : ' hidden'}>
    <p class="muted" style="margin-top:0">Servidores MCP que dan herramientas extra a OpenCode (documentación al día, navegador…). Es lo equivalente a los plugins de Claude Code.</p>
    <div id="ext-block"><p class="muted">Cargando…</p></div>
    </div>

    <div class="tabpane" data-pane="sk"${curView === 'sk' ? '' : ' hidden'}>
    <div id="sk-block"><p class="muted">Cargando…</p></div>
    </div>

    ${canAdmin ? `<div class="tabpane" data-pane="users"${curView === 'users' ? '' : ' hidden'}>` : ''}
    ${usersData || settings.canManageUsers ? `<h3 id="sec-users" class="t-dup">Usuarios</h3><div id="users-block">${usersBlock()}</div>` : (canAdmin ? `<h3 id="sec-users" class="t-dup">Usuarios</h3><div class="hint">El modo multiusuario no está activado. Para poder crear usuarios con su propio espacio, ejecuta una vez por SSH en el VPS:${cmdBox('sudo /opt/opencode-cloud/deploy/multiuser.sh setup', 'margin-top:8px')}y vuelve a abrir los ajustes. (Requiere haber actualizado antes a la v0.8.0 o superior.)</div>` : '')}

    ${canAdmin ? `</div>
    <div class="tabpane" data-pane="red"${curView === 'red' ? '' : ' hidden'}>
    <h3 id="sec-egress" class="t-dup">Salida a internet (WireGuard)</h3>
    <div id="eg-block">${egressBlock()}</div>
    ${admin ? `<h3>Aplicar la nueva salida</h3><p class="muted" style="margin-top:0">Las conexiones que ya estaban abiertas siguen por la ruta antigua: reinicia los espacios para que todo salga por el túnel.</p><div class="row wrap"><button class="btn" id="spaces-restart-eg" type="button">Reiniciar espacios</button></div>` : ''}
    </div>` : ''}

    ${admin ? `<div class="tabpane" data-pane="oc"${curView === 'oc' ? '' : ' hidden'}>
    <p class="muted" style="margin-top:0">OpenCode es el mismo programa para todos los espacios. Al actualizarlo se reinician todos (se avisa si alguien está trabajando).</p>
    <div class="row wrap"><button class="btn" id="oc-upgrade">Actualizar OpenCode</button></div></div>` : ''}

    ${canAdmin ? `<div class="tabpane" data-pane="upd"${curView === 'upd' ? '' : ' hidden'}>
    <h3 id="sec-update" class="t-dup">Actualizaciones de esta aplicación</h3>
    <div id="upd-block">${updateBlock()}</div></div>` : ''}

    <div class="tabpane" data-pane="app"${curView === 'app' ? '' : ' hidden'}>
    <div id="app-block">${appBlock()}</div>
    </div>

    <div class="tabpane" data-pane="pw"${curView === 'pw' ? '' : ' hidden'}>
    <div id="pw-slot"></div>
    </div>`;

  const pwHtml = `<p class="muted" style="margin-top:0">Cambia la contraseña con la que entras a esta WebUI.</p>
    <div class="row wrap"><input id="pw-cur" type="password" class="grow" placeholder="Contraseña actual" autocomplete="current-password"><input id="pw-new" type="password" class="grow" placeholder="Nueva (mín. 8)" autocomplete="new-password"><button class="btn" id="pw-save">Cambiar</button></div>`;

  const q = (s) => $(s, m.el);
  const click = (sel, fn) => q(sel)?.addEventListener('click', async (e) => { try { await fn(e.target); } catch (err) { toast(err.message, 'err'); } });
  const rebind = () => {
    click('#upd-check', async (b) => { state.update = await busyBtn(b, 'Buscando…', () => api('GET', '/api/update/status?refresh=1')); $('#upd-block', m.el).innerHTML = updateBlock(); rebind(); renderSidebar(); });
    click('#upd-apply', async (b) => {
      if (!(await confirmInterrupt('Se descargará la nueva versión y la aplicación se reiniciará unos segundos. ¿Continuar?'))) return;
      const r = await busyBtn(b, 'Actualizando…', () => api('POST', '/api/update/apply'));
      afterRestart(r, `Actualizado a ${r.to}`, m);
    });
    click('#upd-rollback', async (b) => {
      if (!(await confirmInterrupt('¿Volver a la versión anterior a la última actualización?'))) return;
      const r = await busyBtn(b, 'Restaurando…', () => api('POST', '/api/update/rollback'));
      afterRestart(r, `Restaurada la versión ${r.to}`, m);
    });
  };
  rebind();
  if (state.update?.pending) {
    // La comprobación en GitHub va en segundo plano: se refresca el bloque cuando termina
    let tries = 0;
    const t = setInterval(async () => {
      if (!document.body.contains(m.el) || ++tries > 12) { clearInterval(t); return; }
      const u = await api('GET', '/api/update/status').catch(() => null);
      if (u && !u.pending) { clearInterval(t); state.update = u; const el = $('#upd-block', m.el); if (el) { el.innerHTML = updateBlock(); rebind(); } renderSidebar(); }
    }, 2500);
  }

  const egRefresh = async () => { eg = await api('GET', '/api/egress?force=1').catch(() => eg); $('#eg-block', m.el).innerHTML = egressBlock(); egBind(); };
  // En el panel no hay OpenCode propio: lo que se reinicia son los espacios de los usuarios
  const spacesRestart = async (question) => {
    if (!(await confirmInterrupt(question || 'Se reiniciarán los espacios de todos los usuarios; lo que estén haciendo se interrumpe y no se reanuda solo. ¿Reiniciar ahora?'))) return false;
    await api('POST', '/api/users/restart-all'); toast('Espacios reiniciados'); return true;
  };
  const egAfter = async (r, okMsg) => {
    eg = { ...eg, ...r };
    $('#eg-block', m.el).innerHTML = egressBlock(); egBind();
    if (!r.ok) { toast(r.message || 'No se pudo aplicar', 'err'); return; }
    toast(r.message || okMsg);
    if (admin) await spacesRestart('Para que los espacios usen la nueva salida hay que reiniciarlos (lo que estén haciendo se interrumpe). ¿Reiniciar ahora?');
    else if (await confirmInterrupt('Para que OpenCode use la nueva salida hay que reiniciarlo. ¿Reiniciar OpenCode ahora?')) {
      await api('POST', '/api/opencode/restart'); toast('OpenCode reiniciado'); await loadModels(); renderModels();
    }
    egRefresh();
  };
  const egBind = () => {
    click('#spaces-restart-eg', async (b) => { await busyBtn(b, 'Reiniciando…', () => spacesRestart()); });
    click('#eg-recheck', async (b) => { await busyBtn(b, 'Comprobando…', egRefresh); if (!eg?.helper) toast('Todavía no se detecta el ayudante', 'err'); });
    q('#eg-file')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      if (f.size > 8192) { toast('Ese archivo es demasiado grande para ser un .conf de WireGuard', 'err'); return; }
      q('#eg-conf').value = await f.text(); egDraft = q('#eg-conf').value; e.target.value = '';
    });
    click('#eg-save', async (b) => {
      const conf = q('#eg-conf').value;
      if (!conf.trim()) { toast('Pega el contenido del .conf o carga el archivo', 'err'); return; }
      egDraft = conf;
      const r = await busyBtn(b, 'Aplicando…', () => api('POST', '/api/egress/config', { conf }));
      if (r.ok) egDraft = '';
      await egAfter(r, 'Túnel activado');
    });
    q('#eg-conf')?.addEventListener('input', (e) => { egDraft = e.target.value; });
    click('#eg-reconnect', async (b) => { const r = await busyBtn(b, 'Reconectando…', () => api('POST', '/api/egress/action', { action: 'reconnect' })); eg = { ...eg, ...r }; $('#eg-block', m.el).innerHTML = egressBlock(); egBind(); toast(r.message || 'Hecho', r.ok ? undefined : 'err'); egRefresh(); });
    click('#eg-on', async (b) => egAfter(await busyBtn(b, 'Activando…', () => api('POST', '/api/egress/action', { action: 'on' })), 'Túnel activado'));
    click('#eg-off', async (b) => { if (!(await confirmInterrupt(admin ? 'Se desactivará el túnel y se reiniciarán los espacios de los usuarios. ¿Continuar?' : 'Se desactivará el túnel y se reiniciará OpenCode. ¿Continuar?'))) return;
      const r = await busyBtn(b, 'Desactivando…', () => api('POST', '/api/egress/action', { action: 'off' }));
      eg = { ...eg, ...r }; $('#eg-block', m.el).innerHTML = egressBlock(); egBind(); toast(r.message);
      if (admin) await api('POST', '/api/users/restart-all'); else await api('POST', '/api/opencode/restart');
      toast(admin ? 'Espacios reiniciados' : 'OpenCode reiniciado'); egRefresh(); });
    click('#eg-remove', async (b) => { if (!confirm('¿Quitar la configuración de WireGuard del VPS?')) return;
      const r = await busyBtn(b, 'Quitando…', () => api('POST', '/api/egress/action', { action: 'remove' }));
      eg = { ...eg, ...r }; $('#eg-block', m.el).innerHTML = egressBlock(); egBind(); toast(r.message); egRefresh(); });
  };
  egBind();
  const usersRefresh = async () => {
    usersData = await api('GET', '/api/users').catch(() => usersData);
    const el = $('#users-block', m.el); if (el) { el.innerHTML = usersBlock(); usersBind(); }
  };
  const passModal = (name) => {
    const pm = openModal(`Nueva contraseña de ${name}`, `
      <p class="muted" style="margin-top:0">Se cerrará su sesión actual. Cópiala antes de guardar para pasársela.</p>
      <div class="field"><input id="np" name="reset-secret" type="text" class="secret" placeholder="Mínimo 8 caracteres" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"></div>
      <div class="row wrap"><button class="btn" id="np-gen">Generar</button><button class="btn primary grow" id="np-save">Guardar</button></div>`);
    $('#np-gen', pm.el).addEventListener('click', () => { $('#np', pm.el).value = genPass(); });
    $('#np-save', pm.el).addEventListener('click', async (e) => {
      try { await busyBtn(e.target, 'Guardando…', () => api('PUT', `/api/users/${encodeURIComponent(name)}/password`, { password: $('#np', pm.el).value })); toast('Contraseña cambiada'); pm.close(); } catch (err) { toast(err.message, 'err'); }
    });
  };
  const delModal = (name) => {
    const dm = openModal(`Eliminar a ${name}`, `
      <p style="margin-top:0">Se detendrá su espacio, se borrará su usuario de Linux y dejará de poder entrar.</p>
      <label class="row" style="gap:8px;margin-bottom:14px"><input type="checkbox" id="del-purge" style="width:auto"> <span>Borrar también sus proyectos y claves (irreversible). Si no, se archivan en el servidor.</span></label>
      <button class="btn danger" id="del-go" style="width:100%">Eliminar usuario</button>`);
    $('#del-go', dm.el).addEventListener('click', async (e) => {
      try { await busyBtn(e.target, 'Eliminando…', () => api('DELETE', `/api/users/${encodeURIComponent(name)}`, { purge: $('#del-purge', dm.el).checked })); toast('Usuario eliminado'); dm.close(); usersRefresh(); } catch (err) { toast(err.message, 'err'); }
    });
  };
  const userAct = async (name, act, u) => {
    try {
      if (act === 'enter') {
        if (!confirm(`Entrarás en el espacio de ${name}: verás sus proyectos, conversaciones y claves. Queda registrado y la sesión dura 12 horas. ¿Continuar?`)) return;
        const r = await api('POST', `/api/users/${encodeURIComponent(name)}/enter`);
        location.assign(r.url);
      } else if (act === 'pass') passModal(name);
      else if (act === 'del') delModal(name);
      else if (act === 'restart') {
        const fresh = (await api('GET', '/api/users').catch(() => null))?.users?.find((x) => x.name === name);
        const msg = fresh?.activity === 'busy' ? `${name} tiene ${fresh.busy || 'tareas'} conversación(es) trabajando ahora mismo. Si reinicias su espacio, se interrumpen y no se reanudan solas. ¿Reiniciar de todos modos?`
          : fresh?.activity === 'idle' ? `${name} no tiene tareas en curso. ¿Reiniciar su espacio?`
            : `No he podido comprobar si ${name} está trabajando. ¿Reiniciar su espacio de todos modos?`;
        if (!confirm(msg)) return;
        await api('POST', `/api/users/${encodeURIComponent(name)}/restart`); toast('Espacio reiniciado'); usersRefresh();
      } else if (act === 'toggle') {
        const disable = !u?.disabled;
        if (disable && !confirm(`Se cerrará la sesión de ${name} y se detendrá su espacio (sus datos se conservan). ¿Continuar?`)) return;
        await api('PUT', `/api/users/${encodeURIComponent(name)}/disabled`, { disabled: disable }); usersRefresh();
      }
    } catch (err) { toast(err.message, 'err'); }
  };
  const userMenu = (name) => {
    const u = usersData?.users?.find((x) => x.name === name);
    const mm = openModal(name, `<div class="stack">
      ${u?.disabled ? '' : `<button class="btn primary" data-ma="enter">Entrar como ${esc(name)}</button>`}
      <button class="btn" data-ma="pass">Cambiar contraseña</button>
      ${u?.disabled ? '' : '<button class="btn" data-ma="restart">Reiniciar espacio</button>'}
      <button class="btn" data-ma="toggle">${u?.disabled ? 'Activar usuario' : 'Desactivar usuario'}</button>
      <button class="btn danger" data-ma="del">Eliminar usuario…</button></div>`);
    mm.el.querySelectorAll('[data-ma]').forEach((b) => b.addEventListener('click', () => { mm.close(); userAct(name, b.dataset.ma, u); }));
  };
  const usersBind = () => {
    q('#nu-gen')?.addEventListener('click', () => { q('#nu-pass').value = genPass(); });
    click('#users-refresh', async (b) => { await busyBtn(b, 'Comprobando…', usersRefresh); });
    click('#spaces-restart-us', async (b) => { await busyBtn(b, 'Reiniciando…', () => spacesRestart()); usersRefresh(); });
    click('#nu-create', async (b) => {
      const name = q('#nu-name').value.trim().toLowerCase(); const password = q('#nu-pass').value;
      await busyBtn(b, 'Creando… (unos segundos)', () => api('POST', '/api/users', { name, password }));
      toast(`Usuario ${name} creado`); q('#nu-name').value = ''; q('#nu-pass').value = '';
      await usersRefresh();
    });
    m.el.querySelectorAll('[data-u-menu]').forEach((btn) => btn.addEventListener('click', () => userMenu(btn.dataset.uMenu)));
  };
  usersBind();

  click('#gh-save', async (b) => { const r = await busyBtn(b, 'Comprobando…', () => api('PUT', '/api/github/token', { token: q('#gh-token').value })); toast(`Conectado como ${r.login}`); m.remove(); settingsModal('conn'); });
  click('#gh-remove', async () => { await api('DELETE', '/api/github/token'); toast('GitHub desconectado'); m.remove(); settingsModal('conn'); });
  click('#g-save', async () => { await api('PUT', '/api/settings', { gitName: q('#g-name').value, gitEmail: q('#g-email').value }); toast('Identidad guardada (se aplica a nuevos commits)'); });
  m.el.querySelectorAll('[data-prov-vis]').forEach((cb) => cb.addEventListener('change', async () => {
    const prev = state.models.hidden || [];
    const id = cb.dataset.provVis;
    const next = cb.checked ? prev.filter((x) => x !== id) : [...new Set([...prev, id])];
    state.models.hidden = next;
    renderModels();
    try { await api('PUT', '/api/models/hidden', { hidden: next }); } catch (err) { state.models.hidden = prev; cb.checked = !cb.checked; renderModels(); toast(err.message, 'err'); }
  }));
  m.el.querySelectorAll('[data-prov-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`¿Quitar la clave de ${b.dataset.provName}? Sus modelos dejarán de aparecer.`)) return;
    try {
      await busyBtn(b, 'Quitando…', () => api('DELETE', `/api/providers/${encodeURIComponent(b.dataset.provDel)}`));
      toast('Clave eliminada'); await loadModels(); renderModels(); m.remove(); settingsModal('ia');
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
    m.remove(); settingsModal('ia');
  });
  click('#oc-restart', async (b) => { if (!(await confirmInterrupt('Se reiniciará OpenCode. ¿Continuar?'))) return; await busyBtn(b, 'Reiniciando…', () => api('POST', '/api/opencode/restart')); toast('OpenCode reiniciado'); await loadModels(); renderModels(); });
  click('#oc-upgrade', async (b) => { if (!(await confirmInterrupt('Se actualizará OpenCode y se reiniciará. ¿Continuar?'))) return; const r = await busyBtn(b, 'Actualizando…', () => api('POST', '/api/opencode/upgrade')); toast('OpenCode actualizado'); q('#oc-logbox').innerHTML = `<div class="output">${esc(r.output || '')}</div>`; });
  click('#oc-logs', async () => { const r = await api('GET', '/api/opencode/status'); q('#oc-logbox').innerHTML = `<div class="output">${esc((r.logs || []).join('\n') || 'Sin salida todavía')}</div>`; });
  click('#app-install', async () => { await installApp(); $('#app-block', m.el).innerHTML = appBlock(); });

  /* ---- Extensiones (MCP): Context7, Playwright y propias ---- */
  let ext = null;
  let extLoading = false;
  let extTimer = null;
  let sk = null;
  let skFound = null;
  let skRepo = '';
  const extDraft = { name: '', type: 'remote', url: '', command: '', headers: '', env: '', open: false };
  const extStatus = (name) => {
    const s = ext?.status?.[name];
    if (!s || !s.status) return '';
    if (s.status === 'connected') return '<span class="chip ok">Conectada</span>';
    if (s.status === 'failed') return `<span class="chip err">Con error</span>`;
    if (s.status === 'needs_auth' || s.status === 'needs_client_registration') return '<span class="chip warn">Necesita autorización</span>';
    return '';
  };
  const extFail = (name) => {
    const s = ext?.status?.[name];
    return s && s.status === 'failed' && s.error ? `<div class="banner err" style="margin-top:8px">${esc(String(s.error).slice(0, 300))}</div>` : '';
  };
  const extSwitch = (key, on, label = 'Activada') => `<label class="switch"><input type="checkbox" data-xsw="${esc(key)}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
  const playwrightBody = () => {
    const b = ext.playwright.browser;
    const risk = '<p class="muted" style="font-size:12.5px;margin:8px 0 0">Chromium se ejecuta sin pantalla y sin su aislamiento interno (Ubuntu 24.04 no lo permite a usuarios normales), así que úsalo para probar tus propias páginas. Cada navegador abierto ocupa unos 300 MB de RAM.</p>';
    if (b.installing) return `<div class="row" style="gap:8px"><span class="spin"></span><strong>Instalando Chromium…</strong></div><div class="muted" style="font-size:13px;margin-top:4px">${esc(b.message || '')}</div>${b.log.length ? `<div class="output" style="margin-top:8px;max-height:120px;overflow:auto;font-size:11.5px">${esc(b.log.join('\n'))}</div>` : ''}`;
    const err = b.error ? `<div class="banner err" style="margin:0 0 10px">${esc(b.error)}</div>` : '';
    if (b.installed) {
      return `${err}<p style="margin:0">Chromium listo · Playwright MCP ${esc(b.version || '')}</p>${ext.canInstallBrowser && b.helper ? '<div class="row wrap" style="margin-top:8px"><button class="btn small" data-x="browser-install">Actualizar</button><button class="btn small danger" data-x="browser-remove">Desinstalar</button></div>' : ''}${risk}`;
    }
    if (!ext.canInstallBrowser) return `${err}<div class="hint">Chromium todavía no está instalado en el servidor. Pídele al administrador que lo instale desde Ajustes → Extensiones.</div>`;
    if (!b.helper) return `${err}<div class="hint">Instala una vez el ayudante por SSH en el VPS y vuelve a abrir los ajustes:${cmdBox('sudo /opt/opencode-cloud/deploy/browser.sh setup', 'margin-top:8px')}</div>`;
    return `${err}<p class="muted" style="margin:0 0 8px">Hay que instalar Chromium y sus librerías (unos 400 MB y varios minutos). Se instala una vez para todos los usuarios.</p><button class="btn primary" data-x="browser-install">Instalar Chromium</button>`;
  };
  const skillsBlock = () => {
    if (!sk) return '<p class="muted">No se pudo cargar la lista.</p>';
    const srcs = [...new Set(sk.items.map((s) => s.source).filter(Boolean))];
    const rows = sk.items.map((s) => `<div class="ext-row"><div class="grow" style="min-width:0"><strong>${esc(s.name)}</strong> <span class="chip">${s.source ? esc(s.source) : 'manual'}</span><div class="muted sk-desc">${esc(s.description)}</div></div><button class="btn small danger" data-x="sk-del" data-name="${esc(s.name)}">Quitar</button></div>`).join('');
    const found = skFound ? `<div class="ext-card" style="margin-top:10px"><div style="margin-bottom:6px"><strong>${esc(skFound.repo)}</strong> <span class="chip">${esc(skFound.sha || '')}</span></div>
        <div class="row wrap" style="margin-bottom:4px"><button class="btn small" data-x="sk-all">Marcar todas</button><button class="btn small" data-x="sk-none">Ninguna</button></div>
        ${skFound.skills.map((s) => `<label class="sk-pick"><input type="checkbox" data-sksel="${esc(s.name)}" ${skFound.sel.has(s.name) ? 'checked' : ''}><span><strong>${esc(s.name)}</strong> ${s.installed ? '<span class="chip">ya instalada</span>' : ''}<span class="muted sk-desc">${esc(s.description)}</span></span></label>`).join('')}
        <p class="muted" style="font-size:12.5px;margin:8px 0">Una skill son instrucciones que seguirá el modelo: instala solo las de repositorios en los que confíes.</p>
        <div class="row wrap"><button class="btn primary" data-x="sk-install">Instalar seleccionadas (${skFound.sel.size})</button><button class="btn ghost" data-x="sk-cancel">Cancelar</button></div></div>` : '';
    return `
      <p class="muted" style="margin-top:0">Guías que OpenCode carga solo cuando la tarea las necesita (por ejemplo, principios de diseño). Se descargan de GitHub y quedan en tu espacio.</p>
      ${rows ? `<div class="ext-card" style="padding-top:2px;padding-bottom:2px">${rows}</div>` : '<p class="muted">Todavía no hay ninguna instalada.</p>'}
      ${srcs.length ? `<div class="row wrap" style="margin-bottom:10px">${srcs.map((r) => `<button class="btn small" data-x="sk-update" data-repo="${esc(r)}">Actualizar de ${esc(r)}</button>`).join('')}</div>` : ''}
      <div class="row wrap"><input id="sk-repo" name="skill-source-field" type="text" class="grow" inputmode="url" enterkeyhint="search" placeholder="usuario/repositorio" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" value="${esc(skRepo)}"><button class="btn" data-x="sk-find">Buscar</button></div>
      <div class="row wrap" style="margin-top:6px"><button class="btn small ghost" data-x="sk-fill" data-repo="emilkowalski/skills">Ejemplo: emilkowalski/skills (diseño y animación)</button></div>
      ${found}`;
  };
  const restartBanner = () => (ext?.restartNeeded || sk?.restartNeeded ? '<div class="banner" style="margin-bottom:12px"><strong>Hay cambios sin aplicar.</strong> OpenCode debe reiniciarse para usarlos.<div class="row" style="margin-top:8px"><button class="btn primary small" data-x="apply">Aplicar y reiniciar OpenCode</button></div></div>' : '');
  const extBlock = () => {
    if (!ext) return '<p class="muted">Cargando…</p>';
    const c7 = ext.context7;
    const pw = ext.playwright;
    const customRows = ext.custom.map((c) => `<div class="ext-row"><div class="grow" style="min-width:0"><strong>${esc(c.name)}</strong> <span class="chip">${c.type === 'remote' ? 'remota' : 'local'}</span> ${extStatus(c.name)}<div class="muted mono ext-target">${esc(c.target)}</div>${c.headerNames.length || c.envNames.length ? `<div class="muted" style="font-size:12px">${c.headerNames.length ? `Cabeceras: ${c.headerNames.map(esc).join(', ')}` : ''}${c.envNames.length ? ` Variables: ${c.envNames.map(esc).join(', ')}` : ''}</div>` : ''}${extFail(c.name)}</div>${extSwitch(`custom:${c.id}`, c.enabled, 'Activa')}<button class="btn small danger" data-x="custom-del" data-id="${esc(c.id)}" data-name="${esc(c.name)}">Quitar</button></div>`).join('');
    return `
      ${restartBanner()}
      <div class="ext-card">
        <div class="row" style="gap:8px;align-items:center"><div class="grow"><strong>Context7</strong> ${extStatus('context7')}<div class="muted" style="font-size:13px">Documentación actualizada de librerías y frameworks, para que OpenCode no use APIs antiguas.</div></div>${extSwitch('context7', c7.enabled)}</div>
        <div class="row wrap" style="margin-top:10px"><input id="c7-key" name="docs-key-field" type="text" class="secret grow" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" placeholder="${c7.hasKey ? 'Clave guardada · escribe para cambiar' : 'Clave de Context7 (opcional, más límite)'}"><button class="btn" data-x="c7-save">Guardar</button>${c7.hasKey ? '<button class="btn danger" data-x="c7-clear">Quitar clave</button>' : ''}</div>
        ${extFail('context7')}
      </div>
      <div class="ext-card">
        <div class="row" style="gap:8px;align-items:center"><div class="grow"><strong>Playwright</strong> ${extStatus('playwright')}<div class="muted" style="font-size:13px">OpenCode puede abrir páginas web, hacer capturas y probar lo que construye.</div></div>${extSwitch('playwright', pw.enabled)}</div>
        <div style="margin-top:10px">${playwrightBody()}</div>
        ${extFail('playwright')}
      </div>
      <h3>Otras extensiones</h3>
      ${customRows ? `<div class="ext-card" style="padding-top:2px;padding-bottom:2px">${customRows}</div>` : '<p class="muted" style="margin-top:0">Añade cualquier servidor MCP: remoto (una URL) o local (un comando que se ejecuta en tu espacio).</p>'}
      <details class="nu-box" id="ext-new" ${extDraft.open ? 'open' : ''}><summary>Añadir una extensión</summary>
        <div class="stack" style="margin-top:10px">
          <input id="xn-name" name="ext-label-field" type="text" placeholder="Nombre (p. ej. github, notion)" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" value="${esc(extDraft.name)}">
          <select id="xn-type"><option value="remote"${extDraft.type === 'remote' ? ' selected' : ''}>Remota (URL)</option><option value="local"${extDraft.type === 'local' ? ' selected' : ''}>Local (comando)</option></select>
          <div id="xn-remote"${extDraft.type === 'remote' ? '' : ' hidden'} class="stack"><input id="xn-url" name="ext-address-field" type="url" placeholder="https://servidor.ejemplo.com/mcp" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" value="${esc(extDraft.url)}"><textarea id="xn-headers" rows="2" placeholder="Cabeceras, una por línea:&#10;Authorization: Bearer …" autocapitalize="off" spellcheck="false">${esc(extDraft.headers)}</textarea></div>
          <div id="xn-local"${extDraft.type === 'local' ? '' : ' hidden'} class="stack"><input id="xn-command" name="ext-command-field" type="text" placeholder="npx -y @paquete/servidor-mcp" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" value="${esc(extDraft.command)}"><textarea id="xn-env" rows="2" placeholder="Variables, una por línea:&#10;CLAVE=valor" autocapitalize="off" spellcheck="false">${esc(extDraft.env)}</textarea></div>
          <button class="btn primary" data-x="custom-add">Añadir</button>
        </div>
      </details>`;
  };
  const drawExt = () => {
    const box = q('#ext-block');
    if (!box) return;
    box.innerHTML = extBlock();
    const sb = q('#sk-block');
    if (sb) sb.innerHTML = `${restartBanner()}${skillsBlock()}`;
    clearTimeout(extTimer);
    // Mientras se instala Chromium se consulta el progreso
    if (ext?.playwright?.browser?.installing && m.el.isConnected) extTimer = setTimeout(() => loadExt(true), 3000);
  };
  const loadExt = async (quiet = false) => {
    if (extLoading) return;
    extLoading = true;
    try {
      const [e, k] = await Promise.all([api('GET', '/api/extensions'), api('GET', '/api/skills').catch(() => sk)]);
      ext = e; sk = k; drawExt();
    }
    catch (err) { if (!quiet) { const e = `<div class="banner err">${esc(err.message)}</div>`; q('#ext-block').innerHTML = e; q('#sk-block').innerHTML = e; } }
    finally { extLoading = false; }
  };
  const extDo = async (btn, label, method, url, body) => {
    try { ext = await busyBtn(btn, label, () => api(method, url, body)); drawExt(); return true; }
    catch (err) { toast(err.message, 'err'); await loadExt(true); return false; }
  };
  const extBox = m.body;
  extBox.addEventListener('input', (e) => {
    if (!e.target.closest('#ext-block, #sk-block')) return;
    const map = { 'xn-name': 'name', 'xn-url': 'url', 'xn-command': 'command', 'xn-headers': 'headers', 'xn-env': 'env' };
    if (map[e.target.id]) extDraft[map[e.target.id]] = e.target.value;
    if (e.target.id === 'sk-repo') skRepo = e.target.value;
  });
  extBox.addEventListener('toggle', (e) => { if (e.target.id === 'ext-new') extDraft.open = e.target.open; }, true);
  extBox.addEventListener('change', async (e) => {
    if (!e.target.closest('#ext-block, #sk-block')) return;
    if (e.target.id === 'xn-type') {
      extDraft.type = e.target.value;
      q('#xn-remote').hidden = extDraft.type !== 'remote';
      q('#xn-local').hidden = extDraft.type !== 'local';
      return;
    }
    if (e.target.dataset?.sksel && skFound) {
      const n = e.target.dataset.sksel;
      if (e.target.checked) skFound.sel.add(n); else skFound.sel.delete(n);
      const ib = q('[data-x=sk-install]'); if (ib) ib.textContent = `Instalar seleccionadas (${skFound.sel.size})`;
      return;
    }
    const key = e.target.dataset?.xsw;
    if (!key) return;
    const on = e.target.checked;
    const ok = key === 'context7' ? await extDo(e.target, '', 'PUT', '/api/extensions/context7', { enabled: on })
      : key === 'playwright' ? await extDo(e.target, '', 'PUT', '/api/extensions/playwright', { enabled: on })
        : await extDo(e.target, '', 'PUT', `/api/extensions/custom/${key.slice(7)}`, { enabled: on });
    if (!ok) drawExt();
  });
  extBox.addEventListener('click', async (e) => {
    const b = e.target.closest('#ext-block [data-x], #sk-block [data-x]');
    if (!b) return;
    const act = b.dataset.x;
    try {
      if (act === 'apply') {
        if (!(await confirmInterrupt('Se reiniciará OpenCode para aplicar las extensiones. ¿Continuar?'))) return;
        await busyBtn(b, 'Reiniciando…', () => api('POST', '/api/opencode/restart'));
        await new Promise((r) => setTimeout(r, 2500)); // OpenCode tarda un momento en cargar los servidores MCP
        await loadExt(true);
        toast('Extensiones aplicadas');
      } else if (act === 'c7-save') {
        const v = q('#c7-key').value.trim();
        if (!v) return toast('Escribe la clave de Context7', 'err');
        if (await extDo(b, 'Guardando…', 'PUT', '/api/extensions/context7', { apiKey: v })) toast('Clave guardada');
      } else if (act === 'c7-clear') {
        await extDo(b, 'Quitando…', 'PUT', '/api/extensions/context7', { clearKey: true });
      } else if (act === 'browser-install') {
        if (!confirm('Se descargarán Chromium y sus librerías (unos 400 MB). Puede tardar varios minutos y no interrumpe a OpenCode. ¿Continuar?')) return;
        await extDo(b, 'Iniciando…', 'POST', '/api/extensions/browser', { action: 'install' });
      } else if (act === 'browser-remove') {
        if (!confirm('Se desinstalará Chromium para todos los usuarios. ¿Continuar?')) return;
        await extDo(b, 'Quitando…', 'POST', '/api/extensions/browser', { action: 'remove' });
      } else if (act === 'custom-del') {
        if (!confirm(`¿Quitar la extensión «${b.dataset.name}»?`)) return;
        await extDo(b, 'Quitando…', 'DELETE', `/api/extensions/custom/${b.dataset.id}`);
      } else if (act === 'sk-fill') {
        skRepo = b.dataset.repo; q('#sk-repo').value = skRepo;
      } else if (act === 'sk-find') {
        if (!skRepo.trim()) return toast('Escribe usuario/repositorio', 'err');
        const r = await busyBtn(b, 'Descargando…', () => api('POST', '/api/skills/discover', { repo: skRepo }));
        skFound = { ...r, sel: new Set(r.skills.filter((x) => !x.installed).map((x) => x.name)) };
        drawExt();
        q('.sk-pick')?.scrollIntoView({ block: 'nearest' });
      } else if (act === 'sk-all' || act === 'sk-none') {
        skFound.sel = new Set(act === 'sk-all' ? skFound.skills.map((x) => x.name) : []);
        drawExt();
      } else if (act === 'sk-cancel') {
        skFound = null; drawExt();
      } else if (act === 'sk-install') {
        if (!skFound.sel.size) return toast('Marca al menos una skill', 'err');
        const r = await busyBtn(b, 'Instalando…', () => api('POST', '/api/skills/install', { id: skFound.id, names: [...skFound.sel] }));
        sk = r; skFound = null; skRepo = '';
        drawExt();
        toast(r.skipped?.length ? `Instaladas ${r.installed.length}; ${r.skipped.length} con problemas (${r.skipped[0].name}: ${r.skipped[0].reason})` : `${r.installed.length} skill${r.installed.length > 1 ? 's' : ''} instalada${r.installed.length > 1 ? 's' : ''}. Aplica los cambios para que OpenCode las vea.`, r.skipped?.length ? 'err' : '');
      } else if (act === 'sk-del') {
        if (!confirm(`¿Quitar la skill «${b.dataset.name}»?`)) return;
        sk = await busyBtn(b, 'Quitando…', () => api('DELETE', `/api/skills/${encodeURIComponent(b.dataset.name)}`));
        drawExt();
      } else if (act === 'sk-update') {
        const r = await busyBtn(b, 'Actualizando…', () => api('POST', '/api/skills/update', { repo: b.dataset.repo }));
        sk = r; drawExt();
        toast(`Actualizadas ${r.installed.length} skill${r.installed.length === 1 ? '' : 's'} (${r.sha})${r.missing?.length ? `. Ya no están en el repositorio: ${r.missing.join(', ')}` : ''}`);
      } else if (act === 'custom-add') {
        const body = { name: extDraft.name, type: extDraft.type, url: extDraft.url, command: extDraft.command, headers: extDraft.headers, env: extDraft.env };
        if (await extDo(b, 'Añadiendo…', 'POST', '/api/extensions/custom', body)) {
          Object.assign(extDraft, { name: '', url: '', command: '', headers: '', env: '', open: false });
          drawExt();
          toast('Extensión añadida. Aplica los cambios para usarla.');
        }
      }
    } catch (err) { toast(err.message, 'err'); }
  });
  if (curView === 'ext' || curView === 'sk') loadExt();

  const head = m.el.querySelector('.sethead');
  const paneEl = (k) => m.body.querySelector(`[data-pane="${k}"]`);
  const drawMain = () => { const pn = paneEl('main'); if (pn) pn.innerHTML = mainHtml(); };
  const syncHead = (k) => {
    head.querySelector('.settitle').textContent = k === 'main' ? (admin ? 'Administración' : 'Ajustes') : viewTitles[k];
    const back = head.querySelector('[data-sback]');
    back.style.visibility = admin && k === 'main' ? 'hidden' : '';
    back.innerHTML = ico(k === 'main' ? I.x : I.chevl, 'width="22" height="22"');
    back.setAttribute('aria-label', k === 'main' ? 'Cerrar' : 'Atrás');
    head.querySelector('[data-sinfo]').style.visibility = k === 'main' && !admin ? 'visible' : 'hidden';
    head.classList.toggle('scrolled', (paneEl(k)?.scrollTop || 0) > 4);
  };
  // Los paneles se deslizan como en iOS: el nuevo entra desde la derecha y el anterior se aparta con paralaje;
  // al volver, el mismo camino al revés. Un solo muelle lleva el progreso 0→1.
  let nav = null;
  const layout = (p) => {
    if (!nav) return;
    const { a, b, dir } = nav;
    if (dir > 0) { a.style.transform = `translateX(${(-28 * p).toFixed(2)}%)`; a.style.opacity = String(1 - 0.45 * p); b.style.transform = `translateX(${(100 * (1 - p)).toFixed(2)}%)`; }
    else { a.style.transform = `translateX(${(100 * p).toFixed(2)}%)`; b.style.transform = `translateX(${(-28 * (1 - p)).toFixed(2)}%)`; b.style.opacity = String(1 - 0.45 * (1 - p)); }
  };
  const navSpring = makeSpring(1, layout, { response: 0.38, eps: 0.001, veps: 0.02 });
  const endNav = () => {
    if (!nav) return;
    const { a, b } = nav;
    a.hidden = true;
    for (const el of [a, b]) { el.style.transform = ''; el.style.opacity = ''; el.style.zIndex = ''; el.classList.remove('lift'); }
    nav = null;
  };
  const openView = (k) => {
    if (nav) { navSpring.stop(); endNav(); } // una transición en curso se completa al instante: nunca se bloquea la entrada
    const prev = curView;
    if (k === 'main') drawMain();
    curView = k;
    const slot = q('#pw-slot'); if (slot) slot.innerHTML = k === 'pw' ? pwHtml : '';
    const a = paneEl(prev); const b = paneEl(k);
    syncHead(k);
    if (prev !== k && a && b && !reducedMotion()) {
      const dir = k === 'main' ? -1 : 1;
      b.hidden = false;
      if (dir > 0) b.scrollTop = 0;
      nav = { a, b, dir };
      (dir > 0 ? b : a).classList.add('lift');
      b.style.zIndex = dir > 0 ? 2 : 1; a.style.zIndex = dir > 0 ? 1 : 2;
      navSpring.set(0);
      navSpring.to(1, 0, () => { endNav(); syncHead(k); });
    } else {
      for (const pn of m.el.querySelectorAll('.tabpane')) pn.hidden = pn.dataset.pane !== k;
      if (b && k !== 'main') b.scrollTop = 0;
    }
    if ((k === 'ext' || k === 'sk') && !ext) loadExt(); else if (k === 'ext' || k === 'sk') drawExt();
  };
  syncHead(curView);
  m.body.addEventListener('scroll', (e) => { if (e.target.dataset?.pane === curView) head.classList.toggle('scrolled', e.target.scrollTop > 4); }, true);
  m.el.addEventListener('click', async (e) => {
    const pwb = e.target.closest('#pw-save');
    if (pwb) {
      try { await busyBtn(pwb, 'Guardando…', () => api('PUT', '/api/password', { current: q('#pw-cur').value, next: q('#pw-new').value })); toast('Contraseña cambiada'); q('#pw-cur').value = ''; q('#pw-new').value = ''; } catch (err) { toast(err.message, 'err'); }
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) return openView(go.dataset.go);
    if (e.target.closest('[data-sback]')) return curView === 'main' ? m.close() : openView('main');
    const th = e.target.closest('[data-theme-set]');
    if (th) { store.set('theme', th.dataset.themeSet); applyTheme(th.dataset.themeSet, true); drawMain(); return; }
    if (e.target.closest('[data-logout]')) { try { await api('POST', '/api/logout'); } catch { /* sesión ya cerrada */ } if (admin) { stopAdminTimer(); document.querySelector('.backdrop')?.remove(); } else m.close(); state.me = null; showLogin(); return; }
    if (e.target.closest('[data-sinfo]')) {
      const u = state.update;
      const about = openModal('Acerca de', `<div class="stack">
        <div>Versión de la aplicación: <strong>${esc(u?.version || '—')}</strong> ${u?.sha ? `<span class="chip">${esc(u.sha)}</span>` : ''}</div>
        ${u?.branch ? `<div class="muted">Rama de actualización: <code>${esc(u.branch)}</code></div>` : ''}
        <div>OpenCode: <strong>${esc(oc.version || (oc.healthy ? 'en marcha' : 'no responde'))}</strong></div>
        <div class="muted" style="font-size:13px">OpenCode Cloud: OpenCode en tu VPS con una interfaz web móvil, proyectos, GitHub y actualizaciones desde la propia WebUI.</div></div>`);
      about.el.style.zIndex = 60;
    }
  });
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
        case 'context': contextModal(); break;
        case 'queue-del': await api('DELETE', `/api/projects/${state.project.id}/sessions/${state.sessionId}/queue/${t.dataset.id}`); await loadQueue(); break;
        case 'queue-clear': await api('DELETE', `/api/projects/${state.project.id}/sessions/${state.sessionId}/queue`); await loadQueue(); break;
        case 'queue-resume': await api('POST', `/api/projects/${state.project.id}/sessions/${state.sessionId}/queue/resume`, {}); await loadQueue(); break;
        case 'install-app': await installApp(); break;
        case 'select-project': if (state.project?.id !== t.dataset.id) await selectProject(t.dataset.id); break;
        case 'project-menu': e.stopPropagation(); state.navOpen = false; applyPanelState(); projectMenuModal(t.dataset.id); break;
        case 'new-project': state.navOpen = false; applyPanelState(); newProjectModal(); break;
        case 'new-session': await newSession(); break;
        case 'select-session': await selectSession(t.dataset.id); break;
        case 'sysmon': state.navOpen = false; applyPanelState(); sysModal(); break;
        case 'session-menu': e.stopPropagation(); sessionMenuModal(t.dataset.pid, t.dataset.id); break;
        case 'toggle-pin': {
          e.stopPropagation();
          const was = t.getAttribute('aria-pressed') === 'true';
          await api('PUT', '/api/conversations/pin', { projectId: t.dataset.pid, sessionId: t.dataset.id, pinned: !was });
          await loadFeatured();
          break;
        }
        case 'open-conv':
          if (state.project?.id !== t.dataset.pid) await selectProject(t.dataset.pid);
          await selectSession(t.dataset.id);
          break;
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
        case 'git-dismiss': state.gitFail = null; renderGit(); break;
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
          renderWait();
          setTimeout(loadActivity, 800);
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
  input.addEventListener('input', () => { autosize(input); updateSendButton(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitInput(); }
  });
  $('#send').addEventListener('click', submitInput);
  $('#chat-inner').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rw]'); if (!b) return;
    const mid = b.closest('.msg-actions')?.dataset.mid; if (!mid || !state.project || !state.sessionId) return;
    const um = state.messages.find((x) => x.info?.id === mid);
    const text = (um?.parts || []).filter((p) => p.type === 'text' && !p.synthetic).map((p) => p.text).join('\n').trim();
    const edit = b.dataset.rw === 'edit';
    if (!edit && !confirm('Se retirará esta consulta de la conversación y se deshará lo que OpenCode llegó a modificar en los archivos con ella. ¿Continuar?')) return;
    if (edit && !confirm('Se retirará esta consulta y se deshará lo que OpenCode llegó a modificar con ella; el texto pasará al cuadro de mensaje para que lo edites. ¿Continuar?')) return;
    try {
      await busyBtn(b, 'Deshaciendo…', () => api('POST', `/api/projects/${state.project.id}/sessions/${state.sessionId}/rewind`, { messageID: mid }));
      state.messages = state.messages.filter((x) => String(x.info?.id || '') < mid);
      renderMessages(true);
      if (edit) { const inp = $('#input'); inp.value = text; autosize(inp); updateSendButton(); inp.focus(); }
      refreshMessages();
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#attach-btn').addEventListener('click', () => $('#attach-file').click());
  $('#attach-file').addEventListener('change', async (e) => { const f = [...e.target.files]; e.target.value = ''; await addImages(f); });
  $('#attach-row').addEventListener('click', (e) => { const b = e.target.closest('.thumb-x'); if (b) { state.attach.splice(Number(b.dataset.i), 1); renderAttach(); } });
  input.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])].filter((x) => x.type.startsWith('image/')); if (f.length) { e.preventDefault(); addImages(f); } });

  // Botón "ir al final" cuando el usuario se aleja del último mensaje
  const chat = $('#chat');
  const toBottom = $('#to-bottom');
  bindQuestions();
  chat.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-fopen]');
    if (t) fileViewer(t.dataset.fopen, t.querySelector('span')?.textContent || 'Imagen');
  });
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


/* ===== Atributos de entrada coherentes con cada campo =====
   Sin pistas, iOS trata cualquier campo como candidato a código de verificación o a contraseña.
   Cada campo declara aquí para qué sirve: teclado, mayúsculas, corrector y botón de intro. */
const FIELD_HINTS = {
  'input': { enterkeyhint: 'send', autocapitalize: 'sentences', spellcheck: 'true' },
  'sm-title': { enterkeyhint: 'done', autocapitalize: 'sentences', spellcheck: 'true' },
  'mp-q': { enterkeyhint: 'search' },
  'remote-url': { inputmode: 'url', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'go' },
  'np-url': { inputmode: 'url', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'next' },
  'np-name': { autocapitalize: 'sentences', spellcheck: 'true', enterkeyhint: 'next' },
  'np-branch': { autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'next' },
  'np-cname': { autocapitalize: 'sentences', spellcheck: 'true', enterkeyhint: 'done' },
  'pm-name': { autocapitalize: 'sentences', spellcheck: 'true', enterkeyhint: 'done' },
  'commit-msg': { autocapitalize: 'sentences', spellcheck: 'true', enterkeyhint: 'done' },
  'pr-title': { autocapitalize: 'sentences', spellcheck: 'true', enterkeyhint: 'next' },
  'pr-body': { autocapitalize: 'sentences', spellcheck: 'true' },
  'g-name': { autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'next' },
  'g-email': { autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'done' },
  'xn-url': { inputmode: 'url', enterkeyhint: 'next' },
  'xn-command': { enterkeyhint: 'next' },
};
function tuneField(el) {
  if (el.dataset.tuned) return;
  el.dataset.tuned = '1';
  if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' || el.type === 'hidden') return;
  const set = (k, v) => { if (!el.hasAttribute(k)) el.setAttribute(k, v); };
  // Contraseñas reales del inicio de sesión y del cambio de clave conservan su autocompletado
  if (!el.hasAttribute('autocomplete')) {
    set('autocomplete', 'off');
    set('data-1p-ignore', 'true'); set('data-lpignore', 'true'); set('data-bwignore', 'true');
  }
  for (const [k, v] of Object.entries(FIELD_HINTS[el.id] || {})) if (k !== 'inputmode' || !el.hasAttribute('inputmode')) el.setAttribute(k, v);
  if (el.tagName === 'INPUT' && el.type === 'text' && !el.hasAttribute('autocapitalize')) set('autocapitalize', 'none');
}
const tuneAll = (root) => { if (root.matches?.('input,textarea')) tuneField(root); root.querySelectorAll?.('input,textarea').forEach(tuneField); };
new MutationObserver((list) => { for (const r of list) for (const n of r.addedNodes) if (n.nodeType === 1) tuneAll(n); }).observe(document.body, { childList: true, subtree: true });
tuneAll(document.body);

/* ============================== Arranque ============================== */
(async () => {
  try {
    state.route = parseRoute();
    state.adminHost = state.route.kind === 'admin';
    const me = await api('GET', '/api/me');
    state.multiuser = Boolean(me.multiuser);
    state.me = me.user || null;
    if (state.adminHost) document.title = 'OpenCode Admin';
    if (me.authenticated) await enter();
    else if (state.multiuser && state.route.kind === 'root' && (await adminSession())) location.replace('/admin/'); // solo hay sesión del panel
    else showLogin();
  } catch {
    showLogin();
  }
})();
