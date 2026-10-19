import crypto from 'node:crypto';
import { config } from './config.js';
import * as store from './store.js';

const COOKIE = 'occ_session';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const scrypt = (password, salt) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return { salt: salt.toString('hex'), hash: key.toString('hex') };
}

export async function checkPassword(password, rec) {
  if (!rec?.salt || !rec?.hash || typeof password !== 'string') return false;
  const key = await scrypt(password, Buffer.from(rec.salt, 'hex'));
  const expected = Buffer.from(rec.hash, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

export function hasPassword() {
  return Boolean(store.load('auth', {}).hash);
}

export async function setPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw Object.assign(new Error('La contraseña debe tener al menos 8 caracteres'), { status: 400 });
  }
  store.save('auth', await hashPassword(password));
  // Invalida las sesiones del administrador (en modo de un solo usuario, todas)
  dropSessions('');
}

export const verifyPassword = (password) => checkPassword(password, store.load('auth', {}));

// ---- Limitador de intentos de login (por IP) ----
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const LOCK_MS = 15 * 60 * 1000;

export function checkRate(ip) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) {
    const mins = Math.ceil((a.until - Date.now()) / 60000);
    throw Object.assign(new Error(`Demasiados intentos. Prueba de nuevo en ${mins} min`), { status: 429 });
  }
}
export function registerFailure(ip) {
  const a = attempts.get(ip) || { count: 0, until: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.until = Date.now() + LOCK_MS;
    a.count = 0;
  }
  attempts.set(ip, a);
}
export const clearFailures = (ip) => attempts.delete(ip);

// ---- Sesiones ----
// Cada sesión guarda su caducidad y el usuario ('' = administrador/propietario). El formato antiguo era solo la caducidad.
const norm = (v) => (typeof v === 'number' ? { exp: v, user: '' } : v);

function pruneSessions(sessions) {
  const now = Date.now();
  for (const [k, v] of Object.entries(sessions)) if (!v || norm(v).exp < now) delete sessions[k];
  return sessions;
}

export function createSession(user = '') {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = pruneSessions(store.load('sessions', {}));
  sessions[sha256(token)] = { exp: Date.now() + config.sessionDays * 86400 * 1000, user };
  store.save('sessions', sessions);
  return token;
}

export function dropSessions(user) {
  const sessions = store.load('sessions', {});
  for (const [k, v] of Object.entries(sessions)) if (norm(v).user === user) delete sessions[k];
  store.save('sessions', sessions);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Sesión válida de la petición: { user } ('' = administrador) o null
export function sessionInfo(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const v = store.load('sessions', {})[sha256(token)];
  if (!v) return null;
  const s = norm(v);
  return s.exp > Date.now() ? { user: s.user } : null;
}

// En modo instancia no hay login: solo se aceptan las peticiones que traen el secreto de la pasarela
function fromGateway(req) {
  const got = req.headers['x-oc-gateway'];
  if (typeof got !== 'string' || !got) return false;
  const a = crypto.createHash('sha256').update(got).digest();
  const b = crypto.createHash('sha256').update(config.instanceSecret).digest();
  return crypto.timingSafeEqual(a, b);
}

export function isAuthenticated(req) {
  if (config.instance) return fromGateway(req);
  return Boolean(sessionInfo(req));
}

export function destroySession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return;
  const sessions = store.load('sessions', {});
  delete sessions[sha256(token)];
  store.save('sessions', sessions);
}

export function setCookie(res, token) {
  const maxAge = config.sessionDays * 86400;
  const flags = ['HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAge}`];
  if (config.secureCookies) flags.push('Secure');
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${flags.join('; ')}`);
}

export function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

// ---- Middlewares ----
// Defensa CSRF adicional a SameSite: las peticiones que cambian estado deben llevar una cabecera propia.
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'occloud') {
    return res.status(403).json({ error: 'Petición no válida' });
  }
  next();
}

export function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'No autenticado' });
}
