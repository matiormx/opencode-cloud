import crypto from 'node:crypto';
import { config } from './config.js';
import * as store from './store.js';

const COOKIE = 'occ_session';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const scrypt = (password, salt) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );

export function hasPassword() {
  return Boolean(store.load('auth', {}).hash);
}

export async function setPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw Object.assign(new Error('La contraseña debe tener al menos 8 caracteres'), { status: 400 });
  }
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  store.save('auth', { salt: salt.toString('hex'), hash: key.toString('hex') });
  // Invalida todas las sesiones abiertas
  store.save('sessions', {});
}

export async function verifyPassword(password) {
  const { salt, hash } = store.load('auth', {});
  if (!salt || !hash || typeof password !== 'string') return false;
  const key = await scrypt(password, Buffer.from(salt, 'hex'));
  const expected = Buffer.from(hash, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

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
function pruneSessions(sessions) {
  const now = Date.now();
  for (const [k, exp] of Object.entries(sessions)) if (exp < now) delete sessions[k];
  return sessions;
}

export function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = pruneSessions(store.load('sessions', {}));
  sessions[sha256(token)] = Date.now() + config.sessionDays * 86400 * 1000;
  store.save('sessions', sessions);
  return token;
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isAuthenticated(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return false;
  const exp = store.load('sessions', {})[sha256(token)];
  return Boolean(exp && exp > Date.now());
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
