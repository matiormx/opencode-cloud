// Pasarela multiusuario: las peticiones /api de un usuario que no es el administrador se reenvían, sin tocar el cuerpo
// (por eso va antes de express.json), a su propia instancia de la app, que corre como su usuario de Linux.
import http from 'node:http';
import * as auth from './auth.js';
import { config } from './config.js';
import * as instances from './instances.js';
import * as users from './users.js';

// Rutas que atiende siempre la pasarela, para cualquier usuario
const LOCAL = new Set(['/health', '/me', '/login', '/logout', '/password']);
// El panel de administración usa su propia API (/admin/api/…, que index.js reescribe a /api/… marcando req.adminCtx):
// ahí solo hay usuarios, actualizar la app, red y recursos del servidor, y solo entra el administrador.
// Todo lo demás (proyectos, el agente, claves, GitHub) va al espacio propio de cada usuario (ocu-<nombre>), también el del administrador:
// la pasarela no ve ni toca los proyectos, y el agente no corre con los permisos de la pasarela.
const ADMIN_LOCAL = ['/users', '/update', '/egress', '/system', '/extensions/browser', '/opencode/upgrade', '/activity'];
// Fuera del panel (API de trabajo, /api/…) esas acciones no se aceptan, ni siquiera del administrador
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
  if (req.adminCtx) {
    // Panel de administración: solo el administrador, y solo lo suyo (nada de proyectos ni del agente)
    if (!admin) return res.status(401).json({ error: 'No autenticado' });
    if (LOCAL.has(req.path)) return next();
    if (req.path === '/activity' && req.method === 'GET') return adminActivity(req, res);
    return isAdminLocal(req.path) ? next() : res.status(404).json({ error: 'No encontrado' });
  }
  // El administrador no trabaja: no tiene espacio. En la API de trabajo solo hay sesiones de usuarios.
  if (admin) return res.status(401).json({ error: 'No autenticado' });
  const name = info.user;
  if (!users.isActive(name)) {
    auth.dropSessions(name);
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (LOCAL.has(req.path)) return next();
  if (['/drain', '/pause', '/resume'].includes(req.path)) return res.status(404).json({ error: 'No encontrado' }); // solo la pasarela lo usa, hacia la instancia
  if (isAdminOnly(req.path)) return res.status(403).json({ error: 'Solo el administrador puede hacer eso (desde /admin/)' });

  seen.set(name, Date.now());
  const k = instances.keys(name);
  if (!k) return res.status(503).json({ error: 'Tu espacio todavía no está preparado. Pide al administrador que lo revise.' });

  const headers = {};
  for (const [h, v] of Object.entries(req.headers)) {
    if (HOP.has(h) || h === 'cookie' || h.startsWith('x-oc-')) continue;
    headers[h] = v;
  }
  headers['x-oc-gateway'] = k.secret;
  headers['x-oc-user'] = name;
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

// Actividad para el administrador: la de los espacios de los usuarios (él no tiene espacio propio)
function adminActivity(req, res) {
  Promise.all(users.list().filter((u) => u.role !== 'admin' && !u.disabled).map(async (u) => ({ name: u.name, ...((await instances.activity(u.name, req.query.fresh === '1')) || {}) })))
    .then((rows) => res.json({ busy: [], sessions: [], queued: 0, requests: null, others: rows.filter((r) => r.busy || r.queued) }))
    .catch(() => res.json({ busy: [], sessions: [], queued: 0, requests: null, others: [] }));
}
