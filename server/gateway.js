// Pasarela multiusuario: las peticiones /api de un usuario que no es el administrador se reenvían, sin tocar el cuerpo
// (por eso va antes de express.json), a su propia instancia de la app, que corre como su usuario de Linux.
import http from 'node:http';
import * as auth from './auth.js';
import { config } from './config.js';
import * as instances from './instances.js';
import * as users from './users.js';

// Rutas que atiende siempre la pasarela, para cualquier usuario
const LOCAL = new Set(['/health', '/me', '/login', '/logout', '/password']);
// Lo que solo gestiona la pasarela y solo para el administrador: usuarios, actualizar la app, red y recursos del servidor.
// Todo lo demás (proyectos, el agente, claves, GitHub) va al espacio propio del administrador (ocu-<admin>), igual que el de cualquier usuario:
// la pasarela no ve ni toca los proyectos, y el agente no corre con los permisos de la pasarela.
const ADMIN_LOCAL = ['/users', '/update', '/egress', '/system', '/extensions/browser', '/opencode/upgrade'];
export const isAdminHost = (req) => Boolean(config.adminHost) && String(req.hostname || '').toLowerCase() === config.adminHost;
export const adminUrl = () => (config.adminHost ? `${config.secureCookies ? 'https' : 'http'}://${config.adminHost}` : '');
// Con panel de administración aparte, estas acciones no se aceptan en el dominio de trabajo, ni siquiera del administrador
const ADMIN_ONLY = ['/users', '/update/apply', '/update/rollback', '/egress/config', '/egress/action', '/extensions/browser', '/opencode/upgrade'];
const isAdminOnly = (p) => ADMIN_ONLY.some((x) => p === x || p.startsWith(`${x}/`));
const isAdminLocal = (p) => ADMIN_LOCAL.some((x) => p === x || p.startsWith(`${x}/`));
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length']);

const seen = new Map();
export const lastSeen = (name) => seen.get(name) || 0;

export function proxy(req, res, next) {
  if (!config.multiuser) return next();
  const info = auth.sessionInfo(req);
  if (!info) return next(); // sin sesión: lo resuelve requireAuth
  const admin = info.user === '';
  const name = admin ? users.ownerName() : info.user;
  if (isAdminHost(req)) {
    // Dominio del panel: solo el administrador, y solo lo suyo (nada de proyectos ni del agente)
    if (!admin) return res.status(401).json({ error: 'No autenticado' });
    return LOCAL.has(req.path) || isAdminLocal(req.path) ? next() : res.status(404).json({ error: 'No encontrado' });
  }
  const merged = admin && !config.adminHost; // sin panel aparte, el administrador gestiona también desde aquí
  if (admin && !merged && isAdminOnly(req.path)) return res.status(403).json({ error: 'Eso se gestiona desde el panel de administración' });
  if (!admin && !users.isActive(name)) {
    auth.dropSessions(name);
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (LOCAL.has(req.path)) return next();
  if (merged && isAdminLocal(req.path)) return next();
  if (merged && req.path === '/activity' && req.method === 'GET') return adminActivity(req, res, name);
  if (!admin && req.path.startsWith('/users')) return res.status(403).json({ error: 'Solo el administrador puede gestionar usuarios' });

  seen.set(name, Date.now());
  const k = instances.keys(name);
  if (!k) return res.status(503).json({ error: admin ? 'Tu espacio todavía no está preparado. En el VPS: sudo /opt/opencode-cloud/deploy/multiuser.sh setup' : 'Tu espacio todavía no está preparado. Pide al administrador que lo revise.' });

  const headers = {};
  for (const [h, v] of Object.entries(req.headers)) {
    if (HOP.has(h) || h === 'cookie' || h.startsWith('x-oc-')) continue;
    headers[h] = v;
  }
  headers['x-oc-gateway'] = k.secret;
  headers['x-oc-user'] = name;
  if (merged) headers['x-oc-role'] = 'admin';
  if (config.adminHost && admin) headers['x-oc-admin-url'] = adminUrl();
  headers['x-forwarded-for'] = req.ip;
  if (req.headers['content-length']) headers['content-length'] = req.headers['content-length'];
  if (req.headers['transfer-encoding']) headers['transfer-encoding'] = req.headers['transfer-encoding'];

  const up = http.request({ host: '127.0.0.1', port: k.port, method: req.method, path: req.originalUrl, headers }, (pr) => {
    const out = {};
    for (const [h, v] of Object.entries(pr.headers)) if (!HOP.has(h)) out[h] = v;
    res.writeHead(pr.statusCode || 502, out);
    pr.pipe(res);
    pr.on('error', () => res.destroy());
  });
  up.on('error', () => {
    if (res.headersSent) return res.destroy();
    instances.nudge(name);
    res.status(503).json({ error: 'Tu espacio se está iniciando… vuelve a intentarlo en unos segundos.' });
  });
  res.on('close', () => up.destroy());
  req.pipe(up);
}

// Actividad del administrador: la de su propio espacio más la de los espacios de los demás (que solo conoce la pasarela)
function adminActivity(req, res, name) {
  const k = instances.keys(name);
  const done = (own) => {
    Promise.all(users.list().filter((u) => u.role !== 'admin' && !u.disabled).map(async (u) => ({ name: u.name, ...((await instances.activity(u.name)) || {}) })))
      .then((rows) => res.json({ busy: [], sessions: [], queued: 0, requests: null, ...own, others: rows.filter((r) => r.busy || r.queued) }))
      .catch(() => res.json({ busy: [], sessions: [], queued: 0, requests: null, ...own, others: [] }));
  };
  if (!k) return done({});
  const rq = http.request({ host: '127.0.0.1', port: k.port, path: '/api/activity', method: 'GET', timeout: 8000, headers: { 'x-oc-gateway': k.secret, 'x-oc-user': name, 'x-oc-role': 'admin' } }, (r) => {
    let b = ''; r.setEncoding('utf8'); r.on('data', (d) => { if (b.length < 2_000_000) b += d; });
    r.on('end', () => { let j = {}; try { j = JSON.parse(b); } catch { /* sin datos */ } done(r.statusCode === 200 && j && typeof j === 'object' ? j : {}); });
  });
  rq.on('timeout', () => rq.destroy());
  rq.on('error', () => { instances.nudge(name); done({}); });
  rq.end();
}
