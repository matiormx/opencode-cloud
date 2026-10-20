import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import express from 'express';
import * as auth from './auth.js';
import { config } from './config.js';
import * as drain from './drain.js';
import * as egress from './egress.js';
import * as ext from './extensions.js';
import * as git from './git.js';
import * as gateway from './gateway.js';
import * as gh from './github.js';
import * as instances from './instances.js';
import * as oc from './opencode.js';
import * as preview from './preview.js';
import * as queue from './queue.js';
import * as restarts from './restarts.js';
import * as reqmon from './reqmon.js';
import * as skills from './skills.js';
import * as sysmon from './sysmon.js';
import * as store from './store.js';
import * as updater from './updater.js';
import { sendZip } from './zip.js';
import * as users from './users.js';

const fsp = fs.promises;

const APP_VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(config.root, 'package.json'), 'utf8')).version; } catch { return '0'; } })();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
// API del panel de administración (/admin/api/…): se atiende como /api/… marcada como contexto de administración
app.use((req, res, next) => {
  if (config.multiuser && !config.instance && req.url.startsWith('/admin/api/')) { req.adminCtx = true; req.url = req.url.slice('/admin'.length); }
  next();
});
// Vista previa (/preview/…): se atiende antes que nada porque su token sustituye a la cookie y el cuerpo no se toca
app.use(preview.intercept);
app.use(preview.instanceServe);
// Modo multiusuario: las peticiones de los usuarios que no son el administrador se reenvían a su espacio sin leer el cuerpo
app.use('/api', gateway.proxy);
app.use(express.json({ limit: '14mb' })); // los mensajes con imágenes van en base64

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  next();
});

// Páginas del modo multiusuario: «/» es la puerta (login y reparto), «/admin/» el panel y «/u/<usuario>/» el espacio de cada uno.
// Cada una se instala como su propia app (manifest con su id y su ámbito). Los archivos y la API no cambian de sitio.
if (config.multiuser && !config.instance) {
  const baseManifest = () => JSON.parse(fs.readFileSync(path.join(config.root, 'public', 'manifest.webmanifest'), 'utf8'));
  const manifestFor = (admin, name) => {
    const m = baseManifest();
    const scope = admin ? '/admin/' : `/u/${name}/`;
    Object.assign(m, { id: scope, start_url: scope, scope });
    if (admin) {
      Object.assign(m, { name: 'OpenCode Admin', short_name: 'Admin', description: 'Panel de administración de OpenCode Cloud.', theme_color: '#1f2937', background_color: '#1f2937' });
      m.icons = m.icons.filter((i) => !i.src.endsWith('.svg')).map((i) => ({ ...i, src: i.src.replace('/icons/', '/icons/admin-') }));
    }
    return m;
  };
  const pageFor = (admin, name) => {
    let h = fs.readFileSync(path.join(config.root, 'public', 'index.html'), 'utf8');
    const scope = admin ? '/admin/' : `/u/${name}/`;
    h = h.replace('href="/manifest.webmanifest"', `href="${scope}manifest.webmanifest"`);
    h = h.replace('src="/app.js"', `src="/app.js?v=${APP_VERSION}"`).replace('href="/app.css"', `href="/app.css?v=${APP_VERSION}"`);
    if (admin) h = h.replace('/icons/apple-touch-icon.png', '/icons/admin-apple-touch-icon.png').replace('<title>OpenCode Cloud</title>', '<title>OpenCode Admin</title>').replace('name="apple-mobile-web-app-title" content="OpenCode"', 'name="apple-mobile-web-app-title" content="Admin"').replace('name="application-name" content="OpenCode Cloud"', 'name="application-name" content="OpenCode Admin"');
    return h;
  };
  const noCache = (res) => res.setHeader('Cache-Control', 'no-cache');
  const sendPage = (res, admin, name) => {
    noCache(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.type('html').send(pageFor(admin, name));
  };
  const sendManifest = (res, admin, name) => { noCache(res); res.type('application/manifest+json').send(JSON.stringify(manifestFor(admin, name))); };
  const validName = (n) => users.NAME_RE.test(String(n));
  app.get('/admin', (req, res, next) => (req.path === '/admin' ? res.redirect(301, '/admin/') : next()));
  app.get('/admin/', (req, res) => sendPage(res, true));
  app.get('/admin/manifest.webmanifest', (req, res) => sendManifest(res, true));
  app.get('/u/:name', (req, res, next) => (req.path.endsWith('/') ? next() : res.redirect(301, `/u/${encodeURIComponent(req.params.name)}/`)));
  app.get('/u/:name/', (req, res, next) => (validName(req.params.name) ? sendPage(res, false, req.params.name) : next()));
  app.get('/u/:name/manifest.webmanifest', (req, res, next) => (validName(req.params.name) ? sendManifest(res, false, req.params.name) : next()));
}

app.use(
  express.static(path.join(config.root, 'public'), {
    setHeaders(res, file) {
      // El service worker y el manifest deben revalidarse siempre para que las actualizaciones lleguen
      if (/[\\/](sw\.js|manifest\.webmanifest)$/.test(file)) {
        res.setHeader('Cache-Control', 'no-cache');
        if (file.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
      } else if (/[\\/]icons[\\/]/.test(file)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else {
        res.setHeader('Cache-Control', 'no-cache'); // app.js / app.css: siempre revalidar (si no, el iPhone puede seguir con la versión antigua)
      }
    },
  }),
);
app.use('/api', auth.csrf);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const router = express.Router();

// ---------- Público ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));

const meInfo = (req) => {
  const info = auth.sessionInfo(req);
  if (!info || (info.user && !users.isActive(info.user))) return null;
  return { name: info.user || (config.multiuser ? users.ownerName() : 'admin'), role: info.user ? 'user' : 'admin', ...(info.via ? { via: info.via } : {}) };
};

app.get('/api/me', (req, res) => {
  const user = config.instance ? null : meInfo(req);
  res.json({ authenticated: Boolean(user) && (!req.adminCtx || user.role === 'admin'), passwordSet: auth.hasPassword(), multiuser: config.multiuser, user });
});

app.post(
  '/api/login',
  wrap(async (req, res) => {
    if (config.instance) throw fail('No encontrado', 404);
    if (!auth.hasPassword()) throw fail('No hay contraseña configurada. Ejecuta: node bin/set-password.js', 409);
    const username = req.adminCtx ? users.ownerName() : config.multiuser ? String(req.body?.username || '').trim().toLowerCase() : users.ownerName();
    const keys = [req.ip, `u:${username}`];
    keys.forEach((k) => auth.checkRate(k));
    const user = await users.authenticate(username, req.body?.password);
    if (!user) {
      keys.forEach((k) => auth.registerFailure(k));
      throw fail(config.multiuser ? 'Usuario o contraseña incorrectos' : 'Contraseña incorrecta', 401);
    }
    keys.forEach((k) => auth.clearFailures(k));
    // En modo multiusuario el administrador solo administra: entre por donde entre, su sesión es la del panel (/admin/)
    const kind = config.multiuser && user.role === 'admin' ? 'admin' : auth.sessionKind(req);
    auth.setCookie(res, auth.createSession(user.role === 'admin' ? '' : user.name, kind), kind);
    if (config.multiuser && user.role !== 'admin') instances.probe(user.name).then((up) => { if (!up) instances.nudge(user.name); });
    res.json({ ok: true, user });
  }),
);

app.post('/api/logout', (req, res) => {
  auth.destroySession(req);
  auth.clearCookie(res, auth.sessionKind(req));
  res.json({ ok: true });
});

// ---------- Protegido ----------
const attachUser = (req, res, next) => {
  req.sessionUser = config.instance ? '' : auth.sessionInfo(req)?.user ?? '';
  next();
};
app.use('/api', auth.requireAuth, attachUser, router);
const adminOnly = (req, res, next) => (req.sessionUser === '' ? next() : next(fail('Solo el administrador', 403)));
const multiOnly = (req, res, next) => (config.multiuser ? next() : next(fail('El modo multiusuario no está activado', 404)));

// --- Trabajo en curso: qué conversaciones están trabajando, esperando al proveedor o pendientes de permiso ---
// Conversaciones de este espacio que están trabajando, esperando al proveedor o pendientes de permiso/respuesta
async function collectSessions() {
  const sessions = [];
  await Promise.all(
    loadProjects().map(async (pr) => {
      const dir = withPath(pr).path;
      try {
        const [st, perms, asks] = await Promise.all([
          oc.json('GET', '/session/status', { directory: dir }),
          oc.json('GET', '/permission', { directory: dir }).catch(() => []),
          oc.json('GET', '/question', { directory: dir }).catch(() => []),
        ]);
        const pending = new Set((Array.isArray(perms) ? perms : []).map((x) => x.sessionID));
        const asking = new Set((Array.isArray(asks) ? asks : []).map((x) => x.sessionID));
        const ids = new Set([...Object.keys(st || {}).filter((k) => st[k] && st[k].type !== 'idle'), ...pending, ...asking]);
        if (!ids.size) return;
        let titles = new Map();
        try {
          const list = await oc.json('GET', '/session', { directory: dir });
          titles = new Map((Array.isArray(list) ? list : []).map((x) => [x.id, x.title || '']));
        } catch { /* sin títulos */ }
        for (const id of ids) {
          const v = st?.[id];
          const row = { projectId: pr.id, projectName: pr.name, sessionId: id, title: titles.get(id) || '', state: 'working' };
          if (pending.has(id)) row.state = 'permission';
          else if (asking.has(id)) row.state = 'question';
          else if (v?.type === 'retry') {
            const next = Number(v.next) || 0;
            const nextAt = next > 1e11 ? next : next ? Date.now() + next : 0;
            row.state = 'retrying';
            row.retry = { attempt: v.attempt || 0, message: String(v.message || '').slice(0, 300), inSec: nextAt ? Math.max(0, Math.round((nextAt - Date.now()) / 1000)) : null };
          }
          sessions.push(row);
        }
      } catch { /* OpenCode no responde: no hay nada que interrumpir */ }
    }),
  );
  return sessions;
}

router.get(
  '/activity',
  wrap(async (req, res) => {
    const sessions = await collectSessions();
    // En modo multiusuario, el administrador también ve si los espacios de los demás están trabajando
    let others = [];
    if (config.multiuser && req.sessionUser === '') {
      const rows = await Promise.all(users.list().filter((u) => u.role !== 'admin' && !u.disabled).map(async (u) => ({ name: u.name, ...((await instances.activity(u.name)) || {}) })));
      others = rows.filter((r) => r.busy || r.queued);
    }
    res.json({
      busy: sessions.map(({ projectId, projectName, sessionId }) => ({ projectId, projectName, sessionId })),
      sessions,
      queued: queue.countAll(),
      requests: reqmon.snapshot(),
      others,
    });
  }),
);

// --- Recursos del servidor ---
router.get('/system', wrap(async (req, res) => res.json(await sysmon.snapshot(req.query.points))));

// --- Salida a internet (túnel WireGuard opcional) ---
router.get('/egress', wrap(async (req, res) => res.json(await egress.status({ force: req.query.force === '1' }))));
const notInstance = (req, res, next) => (config.instance ? next(fail('Lo gestiona el administrador', 403)) : next());
router.post('/egress/config', notInstance, wrap(async (req, res) => res.json(await egress.request('apply', req.body?.conf))));
router.post('/egress/action', notInstance, wrap(async (req, res) => {
  const a = String(req.body?.action || '');
  if (!['on', 'off', 'remove', 'reconnect'].includes(a)) return res.status(400).json({ error: 'Acción no válida' });
  res.json(await egress.request(a));
}));

// --- Extensiones (servidores MCP: Context7, Playwright y propios) ---
// Los cambios se guardan al momento y se aplican al reiniciar OpenCode (POST /opencode/restart)
const extView = async () => {
  const v = ext.view();
  let status = null;
  try { const r = await oc.json('GET', '/mcp', { timeout: 4000 }); if (r && typeof r === 'object' && !Array.isArray(r)) status = r; } catch { /* sin estado */ }
  return { ...v, restartNeeded: oc.appliedMcpJson() !== JSON.stringify(ext.mcpConfig()), status };
};
router.get('/extensions', wrap(async (req, res) => res.json(await extView())));
router.put('/extensions/context7', wrap(async (req, res) => { ext.setContext7(req.body || {}); res.json(await extView()); }));
router.put('/extensions/playwright', wrap(async (req, res) => { ext.setPlaywright(req.body || {}); res.json(await extView()); }));
router.post('/extensions/custom', wrap(async (req, res) => { ext.addCustom(req.body || {}); res.json(await extView()); }));
router.put('/extensions/custom/:id', wrap(async (req, res) => { ext.setCustom(String(req.params.id), req.body || {}); res.json(await extView()); }));
router.delete('/extensions/custom/:id', wrap(async (req, res) => { ext.removeCustom(String(req.params.id)); res.json(await extView()); }));
// Chromium es del servidor, no de un usuario: lo gestiona el administrador. En el panel (pasarela) solo se devuelve el estado
// del navegador; en modo normal, la vista completa de extensiones.
const browserView = () => ({ canInstallBrowser: !config.instance, browser: ext.browserInfo() });
router.get('/extensions/browser', notInstance, wrap(async (req, res) => res.json(browserView())));
router.post('/extensions/browser', notInstance, wrap(async (req, res) => { ext.browserRequest(String(req.body?.action || '')); res.json(config.multiuser ? browserView() : await extView()); }));

// --- Habilidades (skills): se descargan de un repositorio de GitHub y se instalan en el espacio del usuario ---
const skillsView = () => ({ dir: skills.dir(), items: skills.installed(), restartNeeded: skills.changedAt() > oc.startedAtMs() });
router.get('/skills', wrap(async (req, res) => res.json(skillsView())));
router.post('/skills/discover', wrap(async (req, res) => res.json(await skills.discover(req.body?.repo))));
router.post('/skills/install', wrap(async (req, res) => {
  const r = skills.install(req.body?.id, req.body?.names);
  skills.closeSession(req.body?.id);
  res.json({ ...r, ...skillsView() });
}));
router.post('/skills/update', wrap(async (req, res) => res.json({ ...(await skills.update(req.body?.repo)), ...skillsView() })));
router.delete('/skills/:name', wrap(async (req, res) => { skills.remove(String(req.params.name)); res.json(skillsView()); }));

// --- Ajustes ---
const isAdminReq = (req) => !config.instance || req.headers['x-oc-role'] === 'admin';
const publicSettings = (admin = !config.instance, adminUrl = '') => {
  const s = store.getSettings();
  return {
    githubTokenSet: Boolean(s.githubToken),
    adminUrl,
    gitName: s.gitName,
    gitEmail: s.gitEmail,
    ocPermission: config.ocPermission,
    // Qué puede gestionar este espacio: en el de un usuario, la actualización de la app, la salida WireGuard y OpenCode las gestiona el administrador
    mode: config.instance && !admin ? 'instance' : config.multiuser || config.instance ? 'owner' : 'single',
    canAdmin: admin,
    canManageUsers: config.multiuser || (config.instance && admin),
  };
};

router.get('/settings', (req, res) => res.json(publicSettings(isAdminReq(req), String(req.headers['x-oc-admin-url'] || ''))));

router.put(
  '/settings',
  wrap(async (req, res) => {
    const { gitName, gitEmail } = req.body || {};
    const patch = {};
    if (typeof gitName === 'string' && gitName.trim()) patch.gitName = gitName.trim().slice(0, 100);
    if (typeof gitEmail === 'string' && /^[^\s@]+@[^\s@]+$/.test(gitEmail.trim())) patch.gitEmail = gitEmail.trim().slice(0, 200);
    store.updateSettings(patch);
    res.json(publicSettings(isAdminReq(req), String(req.headers['x-oc-admin-url'] || '')));
  }),
);

router.put(
  '/github/token',
  wrap(async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!/^[A-Za-z0-9_\-.]{20,255}$/.test(token)) throw fail('El token no tiene un formato válido');
    const previous = store.getSettings().githubToken;
    store.updateSettings({ githubToken: token });
    try {
      const me = await gh.whoami();
      res.json({ ok: true, login: me.login });
    } catch (e) {
      store.updateSettings({ githubToken: previous });
      throw fail(`GitHub rechazó el token: ${e.message}`);
    }
  }),
);

router.delete('/github/token', (req, res) => {
  store.updateSettings({ githubToken: '' });
  res.json({ ok: true });
});

router.get(
  '/github/status',
  wrap(async (req, res) => {
    if (!store.getSettings().githubToken) return res.json({ connected: false });
    try {
      const me = await gh.whoami();
      res.json({ connected: true, login: me.login, avatar: me.avatar_url });
    } catch (e) {
      res.json({ connected: false, error: e.message });
    }
  }),
);

router.get('/github/repos', wrap(async (req, res) => res.json(await gh.listRepos())));

router.put(
  '/password',
  wrap(async (req, res) => {
    const { current, next } = req.body || {};
    if (req.sessionUser) {
      // Usuario no administrador: su contraseña vive en la pasarela
      await users.changeOwnPassword(req.sessionUser, current, next);
      auth.setCookie(res, auth.createSession(req.sessionUser, auth.sessionKind(req)), auth.sessionKind(req));
      return res.json({ ok: true });
    }
    if (!(await auth.verifyPassword(current))) throw fail('La contraseña actual no es correcta', 403);
    await auth.setPassword(next);
    auth.setCookie(res, auth.createSession('', auth.sessionKind(req)), auth.sessionKind(req));
    res.json({ ok: true });
  }),
);

// Antes de reiniciar o actualizar lo que afecta a todos: se pausa lo que esté trabajando (se retoma solo al volver).
// Si algún espacio no se puede pausar con seguridad, se cancela todo y se devuelve el motivo.
async function pauseEveryone() {
  const p = await restarts.pauseAll();
  if (p.blocked.length) {
    await restarts.resumeAll();
    const who = p.blocked.map((b) => b.name).join(', ');
    throw fail(`No se pudo pausar a ${who}${p.blocked.some((b) => b.old) ? ' (su espacio tiene una versión anterior y tiene trabajo en curso)' : ''}. No se ha reiniciado nada: usa «Esperar a que estén libres» o inténtalo de nuevo.`, 409);
  }
  return p.paused;
}

// --- Usuarios (solo administrador, modo multiusuario) ---
// Reinicia el espacio de todos los usuarios (p. ej. para que usen una nueva salida WireGuard)
router.post(
  '/users/restart-all',
  multiOnly,
  adminOnly,
  wrap(async (req, res) => {
    // when:'idle' → se espera a que ningún espacio esté trabajando (persistente); por defecto, ahora mismo
    if (req.body?.when === 'idle') return res.json({ ok: true, ...(await restarts.schedule('restart-all')) });
    // Pausar y reiniciar ya: si había algo programado, se hace esa misma acción
    const action = restarts.pendingAction() || 'restart-all';
    await restarts.cancel();
    const paused = await pauseEveryone();
    try { await instances.request(action); } catch (e) { await restarts.resumeAll(); throw e; }
    res.json({ ok: true, paused, ...(await restarts.status()) });
  }),
);
router.get('/users/restart-status', multiOnly, adminOnly, wrap(async (req, res) => res.json(await restarts.status())));
router.post('/users/restart-cancel', multiOnly, adminOnly, wrap(async (req, res) => res.json(await restarts.cancel())));
// El administrador puede entrar en el espacio de un usuario sin su contraseña (sesión de trabajo corta, queda en el registro)
router.post(
  '/users/:name/enter',
  multiOnly,
  adminOnly,
  wrap(async (req, res) => {
    const name = String(req.params.name);
    if (!users.list().some((u) => u.name === name && u.role !== 'admin' && !u.disabled)) throw fail('Usuario no encontrado o desactivado', 404);
    console.log(`[admin] el administrador entra como «${name}» (desde ${req.ip})`);
    const hours = 12;
    auth.setCookie(res, auth.createSession(name, 'work', { via: 'admin', hours }), 'work', hours);
    instances.probe(name).then((up) => { if (!up) instances.nudge(name); });
    res.json({ ok: true, url: `/u/${name}/` });
  }),
);

router.get(
  '/users',
  multiOnly,
  adminOnly,
  wrap(async (req, res) => {
    const list = users.list();
    await Promise.all(list.map(async (u) => {
      u.running = u.role === 'admin' ? true : !u.disabled && (await instances.probe(u.name));
      if (u.role === 'admin') return;
      u.lastSeen = gateway.lastSeen(u.name) || 0;
      if (u.running) {
        const a = await instances.activity(u.name);
        // 'unknown' = no se pudo comprobar (no se da por inactivo); 'idle' = comprobado y sin nada en marcha
        if (a) { u.busy = a.busy; u.queued = a.queued; u.activity = a.busy || a.queued ? 'busy' : 'idle'; } else u.activity = 'unknown';
      }
    }));
    res.json({ users: list, helper: instances.helperInfo() });
  }),
);

router.post(
  '/users',
  multiOnly,
  adminOnly,
  wrap(async (req, res) => {
    const name = String(req.body?.name || '').trim().toLowerCase();
    users.validateName(name);
    if (!instances.helperInfo().ready) throw fail('El ayudante del sistema no está instalado (sudo deploy/multiuser.sh setup)', 409);
    await users.create(name, req.body?.password);
    try {
      await instances.request('create', name);
    } catch (e) {
      users.remove(name);
      throw e;
    }
    res.json({ ok: true, name });
  }),
);

const userParam = (req) => {
  const name = String(req.params.name || '');
  if (name === users.ownerName() || !users.list().some((u) => u.name === name)) throw fail('Usuario no encontrado', 404);
  return name;
};

router.put('/users/:name/password', multiOnly, adminOnly, wrap(async (req, res) => { await users.setPassword(userParam(req), req.body?.password); res.json({ ok: true }); }));

router.put(
  '/users/:name/disabled',
  multiOnly,
  adminOnly,
  wrap(async (req, res) => {
    const name = userParam(req);
    const disabled = Boolean(req.body?.disabled);
    users.setDisabled(name, disabled);
    await instances.request(disabled ? 'stop' : 'start', name).catch(() => {});
    res.json({ ok: true });
  }),
);

router.post('/users/:name/restart', multiOnly, adminOnly, wrap(async (req, res) => { await instances.request('restart', userParam(req)); res.json({ ok: true }); }));

router.delete(
  '/users/:name',
  multiOnly,
  adminOnly,
  wrap(async (req, res) => {
    const name = userParam(req);
    await instances.request(req.body?.purge ? 'delete-purge' : 'delete', name);
    users.remove(name);
    res.json({ ok: true });
  }),
);

// --- Proyectos ---
const loadProjects = () => store.load('projects', []);
const saveProjects = (list) => store.save('projects', list);
preview.init((id) => { const p = loadProjects().find((x) => x.id === id); return p ? path.join(config.projectsDir, p.dir) : null; });
const withPath = (p) => ({ ...p, path: path.join(config.projectsDir, p.dir) });

function getProject(req) {
  const p = loadProjects().find((x) => x.id === req.params.id);
  if (!p) throw fail('Proyecto no encontrado', 404);
  return withPath(p);
}

const slugify = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'proyecto';

function uniqueDir(base) {
  let dir = base;
  let i = 2;
  while (fs.existsSync(path.join(config.projectsDir, dir))) dir = `${base}-${i++}`;
  return dir;
}

router.get('/projects', (req, res) => {
  res.json(loadProjects().map(({ id, name, createdAt, remote }) => ({ id, name, createdAt, remote })));
});

router.post(
  '/projects',
  wrap(async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const cloneUrl = req.body?.cloneUrl ? git.validateRemoteUrl(String(req.body.cloneUrl)) : null;
    const branch = req.body?.branch ? String(req.body.branch) : undefined;
    const repoName = cloneUrl ? git.parseGithubRepo(cloneUrl)?.repo : null;
    const finalName = name || repoName;
    if (!finalName) throw fail('Indica un nombre para el proyecto');

    const dir = uniqueDir(slugify(finalName));
    const full = path.join(config.projectsDir, dir);
    try {
      if (cloneUrl) {
        await git.clone(cloneUrl, full, branch);
      } else {
        fs.mkdirSync(full, { recursive: true });
        await git.init(full);
      }
    } catch (e) {
      fs.rmSync(full, { recursive: true, force: true });
      throw e;
    }
    const project = { id: crypto.randomUUID().slice(0, 8), name: finalName, dir, createdAt: new Date().toISOString(), remote: cloneUrl };
    saveProjects([...loadProjects(), project]);
    res.status(201).json({ id: project.id, name: project.name, createdAt: project.createdAt, remote: project.remote });
  }),
);

router.patch(
  '/projects/:id',
  wrap(async (req, res) => {
    const list = loadProjects();
    const p = list.find((x) => x.id === req.params.id);
    if (!p) throw fail('Proyecto no encontrado', 404);
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) throw fail('Nombre no válido');
    p.name = name;
    saveProjects(list);
    res.json({ ok: true });
  }),
);

router.delete(
  '/projects/:id',
  wrap(async (req, res) => {
    const p = getProject(req);
    saveProjects(loadProjects().filter((x) => x.id !== p.id));
    queue.dropProject(p.id);
    store.updateSettings({ pinnedSessions: (store.getSettings().pinnedSessions || []).filter((k) => !k.startsWith(`${p.id}:`)) });
    if (req.query.files === '1') {
      // Defensa: solo se borra si la ruta está estrictamente dentro de projectsDir
      const rel = path.relative(config.projectsDir, p.path);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) fs.rmSync(p.path, { recursive: true, force: true });
    }
    res.json({ ok: true });
  }),
);

// --- Git ---
const gitRoute = (fn) =>
  wrap(async (req, res) => {
    const p = getProject(req);
    res.json(await fn(p.path, req, p));
  });

router.get('/projects/:id/git/status', gitRoute((cwd) => git.status(cwd)));
router.get(
  '/projects/:id/git/overview',
  gitRoute(async (cwd) => ({ status: await git.status(cwd), branches: await git.branches(cwd), log: await git.log(cwd) })),
);
router.post('/projects/:id/git/fetch', gitRoute(async (cwd) => ({ output: (await git.fetchAll(cwd)).stderr.trim() })));
router.post('/projects/:id/git/pull', gitRoute((cwd) => git.pull(cwd)));
router.post('/projects/:id/git/push', gitRoute(async (cwd) => ({ output: (await git.push(cwd)).stderr.trim() })));
router.post('/projects/:id/git/commit', gitRoute(async (cwd, req) => ({ output: await git.commitAll(cwd, req.body?.message) })));
router.post(
  '/projects/:id/git/checkout',
  gitRoute(async (cwd, req) => {
    await git.checkout(cwd, req.body?.branch, Boolean(req.body?.create));
    return { ok: true };
  }),
);
router.post('/projects/:id/git/merge', gitRoute((cwd, req) => git.merge(cwd, req.body?.branch)));
router.post(
  '/projects/:id/git/merge/abort',
  gitRoute(async (cwd) => {
    await git.mergeAbort(cwd);
    return { ok: true };
  }),
);
router.put(
  '/projects/:id/git/remote',
  wrap(async (req, res) => {
    const p = getProject(req);
    await git.setRemote(p.path, req.body?.url);
    const list = loadProjects();
    const item = list.find((x) => x.id === p.id);
    item.remote = req.body.url.trim();
    saveProjects(list);
    res.json({ ok: true });
  }),
);

// --- Pull requests de GitHub ---
async function repoOf(req) {
  const p = getProject(req);
  const remote = (await git.run(['remote', 'get-url', 'origin'], { cwd: p.path, allowFail: true })).stdout.trim();
  const repo = git.parseGithubRepo(remote);
  if (!repo) throw fail('El remoto "origin" de este proyecto no es un repositorio de GitHub');
  return repo;
}

router.get('/projects/:id/github/pulls', wrap(async (req, res) => {
  const { owner, repo } = await repoOf(req);
  res.json(await gh.listPulls(owner, repo));
}));

router.post('/projects/:id/github/pulls', wrap(async (req, res) => {
  const { owner, repo } = await repoOf(req);
  const { title, body, head, base } = req.body || {};
  if (!title || !head || !base) throw fail('Faltan título, rama origen o rama destino');
  res.json(await gh.createPull(owner, repo, { title: String(title), body: String(body || ''), head: git.validateBranch(head), base: git.validateBranch(base) }));
}));

router.post('/projects/:id/github/pulls/:number/merge', wrap(async (req, res) => {
  const { owner, repo } = await repoOf(req);
  res.json(await gh.mergePull(owner, repo, Number(req.params.number), req.body?.method));
}));

// --- Chat (proxy hacia OpenCode, siempre acotado al directorio del proyecto) ---
const SID = /^[A-Za-z0-9_-]{1,100}$/;
const sid = (req) => {
  if (!SID.test(req.params.sid)) throw fail('Sesión no válida');
  return req.params.sid;
};
const ocRoute = (fn) =>
  wrap(async (req, res) => {
    const p = getProject(req);
    res.json(await fn(p.path, req));
  });

router.get(
  '/projects/:id/sessions',
  ocRoute(async (dir) => {
    const list = await oc.json('GET', '/session', { directory: dir });
    return (Array.isArray(list) ? list : []).filter((s) => !s.parentID).sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
  }),
);
router.post('/projects/:id/sessions', ocRoute((dir, req) => oc.json('POST', '/session', { directory: dir, body: { title: req.body?.title || undefined } })));
router.get('/projects/:id/sessions/:sid/messages', ocRoute(async (dir, req) => {
  const [r, ses] = await Promise.all([
    oc.json('GET', `/session/${sid(req)}/message`, { directory: dir, query: { limit: 300 } }),
    oc.json('GET', `/session/${sid(req)}`, { directory: dir }).catch(() => null),
  ]);
  if (!Array.isArray(r)) throw fail('OpenCode no devolvió la conversación (¿se está reiniciando?). Reintenta en unos segundos.', 502);
  // Tras «deshacer» (revert), OpenCode conserva los mensajes revertidos hasta el siguiente envío: no se muestran
  const cut = ses?.revert?.messageID;
  return typeof cut === 'string' && cut ? r.filter((m) => String(m.info?.id || '') < cut) : r;
}));
// Retira una consulta (y lo que vino después) de la conversación y deshace los cambios de archivos que hizo esa tarea
router.post('/projects/:id/sessions/:sid/rewind', wrap(async (req, res) => {
  const p = getProject(req);
  const messageID = String(req.body?.messageID || '');
  if (!/^msg_[A-Za-z0-9]{6,40}$/.test(messageID)) throw fail('Mensaje no válido');
  queue.pauseIfAny(p.id, sid(req));
  await oc.json('POST', `/session/${sid(req)}/abort`, { directory: p.path }).catch(() => null); // por si sigue trabajando
  res.json(await oc.json('POST', `/session/${sid(req)}/revert`, { directory: p.path, body: { messageID } }));
}));
router.get('/projects/:id/sessions/:sid/diff', ocRoute((dir, req) => oc.json('GET', `/session/${sid(req)}/diff`, { directory: dir })));
router.patch(
  '/projects/:id/sessions/:sid',
  wrap(async (req, res) => {
    const p = getProject(req);
    const title = String(req.body?.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!title) throw fail('El título no puede estar vacío');
    res.json(await oc.json('PATCH', `/session/${sid(req)}`, { directory: p.path, body: { title } }));
  }),
);

// --- Conversaciones destacadas y recientes (de todos los proyectos) ---
const pinKey = (projectId, sessionId) => `${projectId}:${sessionId}`;
router.get(
  '/conversations/overview',
  wrap(async (req, res) => {
    const pinned = new Set(store.getSettings().pinnedSessions || []);
    const projects = loadProjects();
    const lists = await Promise.all(
      projects.map(async (pr) => {
        try {
          const list = await oc.json('GET', '/session', { directory: withPath(pr).path });
          return (Array.isArray(list) ? list : []).filter((s) => !s.parentID).map((s) => ({
            projectId: pr.id, projectName: pr.name, id: s.id, title: s.title || '', updated: s.time?.updated || s.time?.created || 0,
          }));
        } catch {
          return [];
        }
      }),
    );
    const all = lists.flat().sort((a, b) => b.updated - a.updated);
    const mark = (x) => ({ ...x, pinned: pinned.has(pinKey(x.projectId, x.id)) });
    res.json({
      pinned: all.filter((x) => pinned.has(pinKey(x.projectId, x.id))).map(mark),
      recent: all.filter((x) => !pinned.has(pinKey(x.projectId, x.id))).slice(0, 5).map(mark),
    });
  }),
);
router.put(
  '/conversations/pin',
  wrap(async (req, res) => {
    const { projectId, sessionId, pinned } = req.body || {};
    if (!loadProjects().some((x) => x.id === projectId)) throw fail('Proyecto no encontrado', 404);
    if (typeof sessionId !== 'string' || !SID.test(sessionId)) throw fail('Conversación no válida');
    const set = new Set(store.getSettings().pinnedSessions || []);
    if (pinned) set.add(pinKey(projectId, sessionId));
    else set.delete(pinKey(projectId, sessionId));
    store.updateSettings({ pinnedSessions: [...set].slice(-200) });
    res.json({ ok: true });
  }),
);
router.delete(
  '/projects/:id/sessions/:sid',
  wrap(async (req, res) => {
    const p = getProject(req);
    queue.clear(p.id, sid(req));
    store.updateSettings({ pinnedSessions: (store.getSettings().pinnedSessions || []).filter((k) => k !== pinKey(p.id, sid(req))) });
    res.json(await oc.json('DELETE', `/session/${sid(req)}`, { directory: p.path }));
  }),
);
router.post(
  '/projects/:id/sessions/:sid/abort',
  wrap(async (req, res) => {
    const p = getProject(req);
    queue.pauseIfAny(p.id, sid(req));
    res.json(await oc.json('POST', `/session/${sid(req)}/abort`, { directory: p.path }));
  }),
);

// --- Archivos del proyecto (capturas y entregables que genera el agente) ---
const FILE_MAX = 25 * 1024 * 1024;
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const SHARE_EXT = new Set(['pdf', 'zip', 'csv', 'xlsx', 'docx', 'pptx', 'txt', 'md', 'json', 'mp3', 'wav', 'mp4', 'gz', 'tar', 'svg', 'log']);

// Busca por nombre (sin carpeta) un archivo dentro del proyecto: el agente suele decir «01_inicio.png» sin la carpeta
function findByName(root, name) {
  let best = null;
  let seen = 0;
  const walk = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (++seen > 4000) return;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 4) walk(full, depth + 1);
      else if (e.isFile() && e.name === name) {
        const m = fs.statSync(full).mtimeMs;
        if (!best || m > best.m) best = { full, m };
      }
    }
  };
  walk(root, 0);
  return best?.full || null;
}

// Resuelve una ruta pedida por el navegador y comprueba que es un archivo permitido dentro del proyecto
function projectFile(p, wanted) {
  const input = String(wanted || '').replace(/\\/g, '/');
  if (!input || input.length > 400 || input.includes('\0')) throw fail('Ruta no válida');
  const root = fs.realpathSync(p.path);
  const guess = path.isAbsolute(input) ? input : path.join(root, input);
  let real;
  try {
    real = fs.realpathSync(guess);
  } catch {
    const found = !input.includes('/') ? findByName(root, input) : null;
    if (!found) throw fail('No existe', 404);
    real = fs.realpathSync(found);
  }
  if (!real.startsWith(root + path.sep)) throw fail('Fuera del proyecto', 403);
  const rel = path.relative(root, real).split(path.sep).join('/');
  if (rel.split('/').some((seg) => seg.startsWith('.') || seg === 'node_modules')) throw fail('No disponible', 403);
  const ext = path.extname(real).slice(1).toLowerCase();
  if (!IMAGE_TYPES[ext] && !SHARE_EXT.has(ext)) throw fail('Tipo de archivo no compartible', 403);
  const st = fs.statSync(real);
  if (!st.isFile()) throw fail('No es un archivo', 404);
  if (st.size > FILE_MAX) throw fail('El archivo supera los 25 MB', 413);
  return { real, rel, ext, size: st.size, name: path.basename(real) };
}

// Qué rutas de las que menciona el agente existen de verdad (y cuáles se pueden enseñar)
router.post(
  '/projects/:id/files/check',
  wrap(async (req, res) => {
    const p = getProject(req);
    const paths = Array.isArray(req.body?.paths) ? req.body.paths.slice(0, 60) : [];
    const out = {};
    for (const w of paths) {
      try {
        const f = projectFile(p, w);
        out[String(w)] = { rel: f.rel, name: f.name, size: f.size, kind: IMAGE_TYPES[f.ext] ? 'image' : 'file' };
      } catch { out[String(w)] = null; }
    }
    res.json(out);
  }),
);

// Vista previa: qué servidores web tiene en marcha el usuario (y si el proyecto tiene un index.html que servir)
router.get('/preview/ports', wrap(async (req, res) => {
  const id = String(req.query.project || '');
  res.json({ ports: await preview.ports(), project: preview.hasIndex(id) ? `s${id}` : '' });
}));

router.get('/projects/:id/download', wrap(async (req, res) => {
  const p = getProject(req);
  await sendZip(res, p.path, p.name);
}));

router.get(
  '/projects/:id/file',
  wrap(async (req, res) => {
    const f = projectFile(getProject(req), req.query.path);
    const image = IMAGE_TYPES[f.ext];
    const inline = !req.query.download && (image || f.ext === 'pdf');
    res.set({
      'Content-Type': image || (f.ext === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
      'Content-Length': String(f.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:",
      'Cache-Control': 'private, max-age=60',
    });
    fs.createReadStream(f.real).on('error', () => res.destroy()).pipe(res);
  }),
);

// Compacta la conversación: OpenCode resume lo antiguo y conserva lo reciente. La respuesta llega cuando termina el resumen.
router.post(
  '/projects/:id/sessions/:sid/compact',
  wrap(async (req, res) => {
    const p = getProject(req);
    const ID = /^[\w.:/@+-]{1,160}$/;
    const providerID = String(req.body?.providerID || '');
    const modelID = String(req.body?.modelID || '');
    if (!ID.test(providerID) || !ID.test(modelID)) throw fail('Elige un modelo para poder compactar');
    const status = await oc.json('GET', '/session/status', { directory: p.path }).catch(() => ({}));
    if (status?.[sid(req)]?.type) throw fail('OpenCode está trabajando en esta conversación. Espera a que termine o detenla.', 409);
    const opts = { directory: p.path, timeout: 300_000 };
    try {
      await oc.json('POST', `/session/${sid(req)}/summarize`, { ...opts, body: { providerID, modelID } });
    } catch (e) {
      if (e.status !== 404) throw e;
      await oc.json('POST', `/api/session/${sid(req)}/compact`, { ...opts, body: {} }); // versiones nuevas de OpenCode
    }
    res.json({ ok: true });
  }),
);

// --- Cola de mensajes ---
router.get('/projects/:id/sessions/:sid/queue', wrap(async (req, res) => { const p = getProject(req); res.json(queue.list(p.id, sid(req))); }));
router.post(
  '/projects/:id/sessions/:sid/queue',
  wrap(async (req, res) => {
    if (drain.active()) throw fail(drain.MSG, 423);
    const p = getProject(req);
    res.json(queue.add(p.id, sid(req), req.body?.text, req.body?.model));
  }),
);
router.delete('/projects/:id/sessions/:sid/queue/:qid', wrap(async (req, res) => {
  const p = getProject(req);
  if (!/^[a-f0-9]{1,32}$/.test(req.params.qid)) throw fail('Elemento no válido');
  queue.remove(p.id, sid(req), req.params.qid);
  res.json({ ok: true });
}));
router.delete('/projects/:id/sessions/:sid/queue', wrap(async (req, res) => { const p = getProject(req); queue.clear(p.id, sid(req)); res.json({ ok: true }); }));
router.post('/projects/:id/sessions/:sid/queue/resume', wrap(async (req, res) => { const p = getProject(req); queue.setPaused(p.id, sid(req), false); res.json({ ok: true }); }));
router.get('/projects/:id/permissions', ocRoute((dir) => oc.json('GET', '/permission', { directory: dir })));
router.get('/projects/:id/status', ocRoute((dir) => oc.json('GET', '/session/status', { directory: dir })));

// Imágenes adjuntas: solo tipos de imagen habituales, como data URL, con tope de número y tamaño
const IMG_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
function parseImages(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 4) throw fail('Máximo 4 imágenes por mensaje');
  return list.map((im, i) => {
    const m = IMG_RE.exec(String(im?.url || ''));
    if (!m) throw fail('Imagen no válida (usa PNG, JPG, WebP o GIF)');
    if (m[2].length * 0.75 > 3.5 * 1024 * 1024) throw fail('Una imagen supera los 3,5 MB');
    const name = String(im?.name || '').replace(/[^\w.\- ]/g, '').slice(0, 60) || `imagen-${i + 1}`;
    return { type: 'file', mime: m[1], filename: name, url: m[0] };
  });
}

// Archivos adjuntos de cualquier tipo: se guardan en la carpeta «adjuntos» del proyecto y el mensaje le dice a OpenCode dónde están.
const UPLOAD_MAX = 50 * 1024 * 1024; // por debajo del límite de 100 MB de Cloudflare
router.post('/projects/:id/upload', wrap(async (req, res) => {
  const p = getProject(req);
  const raw = String(req.query.name || '').normalize('NFC');
  let name = path.basename(raw.replace(/\\/g, '/')).replace(/[^\p{L}\p{N}._\- ()]/gu, '_').replace(/^\.+/, '').trim().slice(0, 100);
  if (!name) name = 'archivo';
  if (Number(req.headers['content-length'] || 0) > UPLOAD_MAX) throw fail('El archivo supera los 50 MB', 413);
  const dir = path.join(p.path, 'adjuntos');
  await fsp.mkdir(dir, { recursive: true });
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let target = '';
  for (let i = 0; i < 100; i++) {
    const t = path.join(dir, i ? `${base}-${i}${ext}` : name);
    if (!fs.existsSync(t)) { target = t; break; }
  }
  if (!target) throw fail('Ya hay demasiados archivos con ese nombre en «adjuntos»');
  let size = 0;
  const limit = new Transform({ transform(chunk, enc, cb) { size += chunk.length; cb(size > UPLOAD_MAX ? fail('El archivo supera los 50 MB', 413) : null, chunk); } });
  try {
    await pipeline(req, limit, fs.createWriteStream(target, { flags: 'wx', mode: 0o644 }));
  } catch (err) {
    await fsp.rm(target, { force: true });
    throw err.status ? err : fail('No se pudo guardar el archivo', 500);
  }
  res.json({ ok: true, name: path.basename(target), path: `adjuntos/${path.basename(target)}`, size });
}));

router.post(
  '/projects/:id/sessions/:sid/send',
  wrap(async (req, res) => {
    if (drain.active()) throw fail(drain.MSG, 423);
    const p = getProject(req);
    const text = String(req.body?.text || '');
    const imgs = parseImages(req.body?.images);
    if (!text.trim() && !imgs.length) throw fail('Mensaje vacío');
    const body = { parts: [...(text.trim() ? [{ type: 'text', text }] : []), ...imgs] };
    const m = req.body?.model;
    if (m?.providerID && m?.modelID) body.model = { providerID: String(m.providerID), modelID: String(m.modelID) };
    if (req.body?.agent) body.agent = String(req.body.agent);
    await oc.json('POST', `/session/${sid(req)}/prompt_async`, { directory: p.path, body });
    res.json({ ok: true });
  }),
);

router.post(
  '/projects/:id/sessions/:sid/permissions/:pid',
  wrap(async (req, res) => {
    const p = getProject(req);
    if (!SID.test(req.params.pid)) throw fail('Permiso no válido');
    const response = ['once', 'always', 'reject'].includes(req.body?.response) ? req.body.response : 'reject';
    try {
      // API actual de OpenCode
      res.json(await oc.json('POST', `/permission/${req.params.pid}/reply`, { directory: p.path, body: { reply: response } }));
    } catch (e) {
      if (e.status !== 404) throw e;
      // Versiones anteriores
      res.json(await oc.json('POST', `/session/${sid(req)}/permissions/${req.params.pid}`, { directory: p.path, body: { response } }));
    }
  }),
);

// --- Preguntas del agente (herramienta «question»): lista, respuesta y descarte ---
router.get('/projects/:id/questions', ocRoute((dir) => oc.json('GET', '/question', { directory: dir })));
router.post(
  '/projects/:id/sessions/:sid/questions/:qid/reply',
  wrap(async (req, res) => {
    const p = getProject(req);
    if (!SID.test(req.params.qid)) throw fail('Pregunta no válida');
    const raw = req.body?.answers;
    if (!Array.isArray(raw) || raw.length > 20 || raw.some((a) => !Array.isArray(a) || a.length > 20 || a.some((x) => typeof x !== 'string' || x.length > 1000))) throw fail('Respuestas no válidas');
    const answers = raw.map((a) => a.map((x) => x.trim()).filter(Boolean));
    if (answers.some((a) => !a.length)) throw fail('Responde a todas las preguntas');
    const opts = { directory: p.path };
    try {
      await oc.json('POST', `/question/${req.params.qid}/reply`, { ...opts, body: { answers } });
    } catch (e) {
      if (e.status !== 404) throw e;
      await oc.json('POST', `/api/session/${sid(req)}/question/${req.params.qid}/reply`, { ...opts, body: { answers } }); // versiones nuevas
    }
    res.json({ ok: true });
  }),
);
router.post(
  '/projects/:id/sessions/:sid/questions/:qid/reject',
  wrap(async (req, res) => {
    const p = getProject(req);
    if (!SID.test(req.params.qid)) throw fail('Pregunta no válida');
    queue.pauseIfAny(p.id, sid(req));
    res.json(await oc.json('POST', `/question/${req.params.qid}/reject`, { directory: p.path }));
  }),
);

router.get(
  '/projects/:id/events',
  wrap(async (req, res) => {
    const p = getProject(req);
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    const upstream = await oc.stream('/event', { directory: p.path, signal: ac.signal });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const body = Readable.fromWeb(upstream.body);
    body.on('error', () => res.end());
    body.pipe(res);
  }),
);

// --- Modelos y proveedores ---
router.get(
  '/models',
  wrap(async (req, res) => {
    const [cfg, prov] = await Promise.all([
      oc.json('GET', '/config/providers', { directory: config.projectsDir }),
      oc.json('GET', '/provider', { directory: config.projectsDir }).catch(() => null),
    ]);
    const providers = (cfg.providers || []).map((p) => ({
      id: p.id,
      name: p.name || p.id,
      models: Object.values(p.models || {}).map((m) => ({ id: m.id, name: m.name || m.id, context: Number(m.limit?.context) || 0 })),
    }));
    const all = (prov?.all || []).map((p) => ({ id: p.id, name: p.name || p.id }));
    const names = new Map(all.map((p) => [p.id, p.name]));
    const stored = (await readStoredAuth()).map((a) => ({ ...a, name: names.get(a.id) || a.id }));
    res.json({ providers, defaults: cfg.default || {}, all, stored, favorites: store.getSettings().favoriteModels || [], hidden: store.getSettings().hiddenProviders || [], connected: prov?.connected || providers.map((p) => p.id) });
  }),
);

// Claves guardadas por OpenCode (auth.json). Nunca se devuelve la clave, solo el final.
async function readStoredAuth() {
  try {
    const base = process.env.XDG_DATA_HOME || path.join(process.env.HOME || os.homedir(), '.local', 'share');
    const raw = JSON.parse(await fsp.readFile(path.join(base, 'opencode', 'auth.json'), 'utf8'));
    return Object.entries(raw || {}).map(([id, v]) => ({
      id,
      type: v?.type || 'api',
      hint: v?.type === 'api' && typeof v.key === 'string' && v.key.length >= 12 ? `…${v.key.slice(-4)}` : '',
    }));
  } catch {
    return [];
  }
}

router.delete(
  '/providers/:id',
  wrap(async (req, res) => {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(req.params.id)) throw fail('Proveedor no válido');
    await oc.json('DELETE', `/auth/${req.params.id}`, { directory: config.projectsDir });
    await oc.json('POST', '/instance/dispose', { directory: config.projectsDir }).catch(() => {});
    res.json({ ok: true });
  }),
);

router.put(
  '/models/hidden',
  wrap(async (req, res) => {
    const list = Array.isArray(req.body?.hidden) ? req.body.hidden : null;
    if (!list) throw fail('Lista no válida');
    const clean = [...new Set(list.filter((v) => typeof v === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(v)))].slice(0, 200);
    store.updateSettings({ hiddenProviders: clean });
    res.json({ hidden: clean });
  }),
);

router.put(
  '/models/favorites',
  wrap(async (req, res) => {
    const list = Array.isArray(req.body?.favorites) ? req.body.favorites : null;
    if (!list) throw fail('Lista no válida');
    const clean = [...new Set(list.filter((v) => typeof v === 'string' && v.length <= 200 && /^[^:]+::.+$/.test(v)))].slice(0, 100);
    store.updateSettings({ favoriteModels: clean });
    res.json({ favorites: clean });
  }),
);

router.put(
  '/providers/:id/key',
  wrap(async (req, res) => {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(req.params.id)) throw fail('Proveedor no válido');
    const key = String(req.body?.key || '').trim();
    if (key.length < 8) throw fail('Clave no válida');
    await oc.json('PUT', `/auth/${req.params.id}`, { directory: config.projectsDir, body: { type: 'api', key } });
    await oc.json('POST', '/instance/dispose', { directory: config.projectsDir }).catch(() => {});
    res.json({ ok: true });
  }),
);

// --- OpenCode ---
router.get(
  '/opencode/status',
  wrap(async (req, res) => {
    const h = await oc.health();
    res.json({ running: oc.isRunning(), healthy: Boolean(h?.healthy), version: h?.version || null, logs: oc.logs() });
  }),
);
// Estado del bloqueo de tareas nuevas por reinicio programado por el administrador (lo consulta la WebUI para avisar)
router.get('/maintenance', wrap(async (req, res) => res.json(drain.info())));
// La pasarela pide bloquear (o liberar) las tareas nuevas de este espacio. Solo desde la pasarela: los usuarios no llegan aquí.
router.post('/drain', wrap(async (req, res) => {
  if (!config.instance) throw fail('No encontrado', 404);
  drain.set(Boolean(req.body?.on));
  res.json({ ok: true });
}));

// --- Pausar y retomar: para reiniciar sin perder el hilo ---
// Se cancela el turno de cada conversación que está trabajando y se apuntan en 'paused'. Al volver OpenCode (o este espacio, si se
// reinicia entero), se les manda a cada una un mensaje para que revise el estado y continúe. Lo que estuviera a medias (un comando
// largo, una instalación) se corta: el agente lo comprueba al retomar.
const RESUME_TEXT = 'El servidor se reinició mientras trabajabas y tu tarea se interrumpió. Revisa el estado actual del proyecto (archivos y comandos que pudieron quedar a medias) y continúa donde lo dejaste.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAFETY_MS = 10 * 60_000; // red de seguridad: si nadie reinicia, se retoma y se libera el bloqueo
let safetyTimer = null;
let resuming = false;

// Modelo y agente que usaba la conversación (para retomarla igual); mejor esfuerzo
async function lastChoice(dir, sessionId) {
  try {
    const msgs = await oc.json('GET', `/session/${sessionId}/message`, { directory: dir, query: { limit: 30 } });
    for (const m of [...(Array.isArray(msgs) ? msgs : [])].reverse()) {
      const i = m?.info || {};
      const model = i.model?.providerID && i.model?.modelID ? i.model : i.providerID && i.modelID ? { providerID: i.providerID, modelID: i.modelID } : null;
      if (model) return { model: { providerID: String(model.providerID), modelID: String(model.modelID) }, agent: typeof i.agent === 'string' ? i.agent : undefined };
    }
  } catch { /* sin modelo: se usa el predeterminado */ }
  return {};
}

async function pauseSessions() {
  const sessions = await collectSessions();
  const projects = loadProjects();
  const items = [];
  for (const sx of sessions) {
    const pr = projects.find((p) => p.id === sx.projectId);
    if (!pr) continue;
    const dir = withPath(pr).path;
    const choice = await lastChoice(dir, sx.sessionId);
    await oc.json('POST', `/session/${sx.sessionId}/abort`, { directory: dir }).catch(() => null);
    items.push({ projectId: sx.projectId, sessionId: sx.sessionId, ...choice });
  }
  const prev = store.load('paused', { items: [] });
  const kept = (prev.items || []).filter((i) => !items.some((n) => n.sessionId === i.sessionId));
  store.save('paused', { at: Date.now(), items: [...kept, ...items] });
  drain.hold(SAFETY_MS);
  queue.hold(true);
  clearTimeout(safetyTimer);
  safetyTimer = setTimeout(() => resumePaused().catch(() => {}), SAFETY_MS);
  safetyTimer.unref?.();
  if (items.length) await sleep(800); // deja que terminen de cancelarse
  return items.length;
}

async function resumePaused() {
  if (resuming) return;
  resuming = true;
  clearTimeout(safetyTimer);
  try {
    const m = store.load('paused', { items: [] });
    if (!m.items?.length) return;
    if (Date.now() - (m.at || 0) > 30 * 60_000) { store.save('paused', { items: [] }); return; } // demasiado antiguo
    queue.hold(true);
    for (let i = 0; i < 90; i++) { if ((await oc.health())?.healthy) break; await sleep(1000); }
    const projects = loadProjects();
    for (const it of m.items) {
      const pr = projects.find((p) => p.id === it.projectId);
      if (!pr) continue;
      const body = { parts: [{ type: 'text', text: RESUME_TEXT }] };
      if (it.model) body.model = it.model;
      if (it.agent) body.agent = it.agent;
      try { await oc.json('POST', `/session/${it.sessionId}/prompt_async`, { directory: withPath(pr).path, body }); }
      catch (e) { console.error(`[reanudar] ${it.sessionId}: ${e.message}`); }
    }
    store.save('paused', { items: [] });
  } finally {
    queue.hold(false);
    drain.release();
    resuming = false;
  }
}
// Solo la pasarela las usa (los usuarios no llegan: la pasarela las bloquea)
router.post('/pause', wrap(async (req, res) => {
  if (!config.instance) throw fail('No encontrado', 404);
  res.json({ ok: true, paused: await pauseSessions() });
}));
router.post('/resume', wrap(async (req, res) => {
  if (!config.instance) throw fail('No encontrado', 404);
  resumePaused().catch(() => {});
  res.json({ ok: true });
}));

// Reiniciar el OpenCode de este espacio afecta solo a su dueño: lo decide él. Con pause:true se pausan sus conversaciones
// antes y se retoman solas después.
router.post('/opencode/restart', wrap(async (req, res) => {
  const paused = req.body?.pause === true ? await pauseSessions() : 0;
  await oc.restart();
  if (req.body?.pause === true) resumePaused().catch(() => {}); // retoma lo pausado y libera el bloqueo
  res.json({ ok: true, paused });
}));
router.post(
  '/opencode/upgrade',
  notInstance,
  wrap(async (req, res) => {
    if (config.multiuser) {
      // El OpenCode de todos los espacios es una copia de root: se actualiza con el ayudante, que reinicia los espacios.
      // when:'idle' → se programa: nadie inicia tareas nuevas y se actualiza cuando todos estén libres
      if (req.body?.when === 'idle') return res.json({ ok: true, scheduled: true, ...(await restarts.schedule('upgrade-opencode')) });
      await restarts.cancel();
      const paused = await pauseEveryone();
      let r;
      try { r = await instances.request('upgrade-opencode'); } catch (e) { await restarts.resumeAll(); throw e; }
      return res.json({ ok: true, paused, output: r.message || 'OpenCode actualizado' });
    }
    const output = await oc.upgrade();
    await oc.restart();
    res.json({ ok: true, output });
  }),
);

// --- Actualizaciones de esta aplicación (desde GitHub) ---
router.get('/update/status', wrap(async (req, res) => res.json(req.query.refresh === '1' ? await updater.check({ refresh: true }) : await updater.peek())));
// Tras actualizar el código, los espacios de los usuarios también se reinician para usar la versión nueva
// when:'idle' → la app se actualiza ya, pero los espacios (que siguen con el código anterior) se reinician cuando todos estén libres
router.post('/update/apply', notInstance, wrap(async (req, res) => {
  const idle = config.multiuser && req.body?.when === 'idle';
  const paused = config.multiuser && !idle ? await pauseEveryone() : 0; // «ahora»: se pausa lo que esté trabajando y se retoma al volver
  let r;
  try { r = await updater.apply(); } catch (e) { if (paused) await restarts.resumeAll(); throw e; }
  if (config.multiuser) { if (idle) await restarts.schedule('restart-all'); else instances.fire('restart-all'); }
  res.json({ ...r, paused });
}));
router.post('/update/rollback', notInstance, wrap(async (req, res) => {
  const paused = config.multiuser ? await pauseEveryone() : 0;
  let r;
  try { r = await updater.rollback(); } catch (e) { if (paused) await restarts.resumeAll(); throw e; }
  if (config.multiuser) instances.fire('restart-all');
  res.json({ ...r, paused });
}));

// ---------- Errores ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Error interno', ...(err.output ? { output: err.output } : {}) });
});

// ---------- Arranque ----------
// La pasarela del modo multiusuario no ejecuta al agente: OpenCode corre en el espacio de cada usuario (incluido el administrador)
const gatewayOnly = config.multiuser && !config.instance;
if (!gatewayOnly) oc.start();
if (gatewayOnly) restarts.resume();
// Si este espacio se reinició con conversaciones pausadas, se retoman al volver OpenCode
if (!gatewayOnly) { if (store.load('paused', { items: [] }).items?.length) queue.hold(true); resumePaused().catch((e) => console.error('[reanudar]', e.message)); }
if (!config.instance) updater.startPeriodicCheck();
if (!gatewayOnly) queue.start();
sysmon.start();
if (!gatewayOnly) reqmon.start();

const server = app.listen(config.port, config.host, () => {
  console.log(`opencode-cloud escuchando en http://${config.host}:${config.port}  (datos: ${config.dataDir})${config.instance ? ` [espacio de ${config.instanceUser || 'usuario'}]` : config.multiuser ? ' [multiusuario]' : ''}`);
  if (!config.instance && !auth.hasPassword()) console.warn('AVISO: no hay contraseña. Ejecuta: node bin/set-password.js "<contraseña>"');
});

async function shutdown() {
  server.close();
  await oc.stop();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
