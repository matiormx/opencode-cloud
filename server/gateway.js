// Pasarela multiusuario: las peticiones /api de un usuario que no es el administrador se reenvían, sin tocar el cuerpo
// (por eso va antes de express.json), a su propia instancia de la app, que corre como su usuario de Linux.
import http from 'node:http';
import * as auth from './auth.js';
import { config } from './config.js';
import * as instances from './instances.js';
import * as users from './users.js';

// Rutas que atiende siempre la pasarela, para cualquier usuario
const LOCAL = new Set(['/health', '/me', '/login', '/logout', '/password']);
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length']);

const seen = new Map();
export const lastSeen = (name) => seen.get(name) || 0;

export function proxy(req, res, next) {
  if (!config.multiuser) return next();
  const info = auth.sessionInfo(req);
  if (!info || info.user === '') return next(); // sin sesión (lo resuelve requireAuth) o administrador (atiende la pasarela)
  const name = info.user;
  if (!users.isActive(name)) {
    auth.dropSessions(name);
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (LOCAL.has(req.path)) return next();
  if (req.path.startsWith('/users')) return res.status(403).json({ error: 'Solo el administrador puede gestionar usuarios' });

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
