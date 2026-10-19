// Espacios de usuario (modo multiusuario). Cada usuario tiene su usuario de Linux y su propia instancia de esta app
// escuchando en 127.0.0.1. La app NO es root: pide crear/borrar/reiniciar al ayudante de root (deploy/multiuser.sh)
// dejando una petición en una carpeta suya; el ayudante publica el resultado en otra que la app solo puede leer.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { config } from './config.js';

export const HELPER_VERSION = 1;
const INBOX = process.env.MU_INBOX || path.join(config.dataDir, 'multiuser-inbox');
const OUTBOX = process.env.MU_OUTBOX || path.join(config.dataDir, 'multiuser-status');
const KEYS = process.env.MU_KEYS || path.join(config.dataDir, 'instance-keys');

const fail = (message, status = 500) => Object.assign(new Error(message), { status });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readStatus = () => {
  try { return JSON.parse(fs.readFileSync(path.join(OUTBOX, 'status.json'), 'utf8')); } catch { return null; }
};

export function helperInfo() {
  const st = readStatus();
  const inbox = (() => { try { return fs.statSync(INBOX).isDirectory(); } catch { return false; } })();
  if (!st || !inbox) return { ready: false };
  return { ready: true, version: st.version || 0, outdated: (st.version || 0) < HELPER_VERSION };
}

// Una petición cada vez: se espera a que el ayudante recoja la anterior antes de dejar otra
let chain = Promise.resolve();
export function request(action, name = '') {
  const run = chain.then(() => doRequest(action, name));
  chain = run.catch(() => {});
  return run;
}

async function doRequest(action, name) {
  if (!helperInfo().ready) throw fail('El ayudante del sistema no está instalado (sudo deploy/multiuser.sh setup)', 409);
  const req = path.join(INBOX, 'request');
  for (let i = 0; i < 50 && fs.existsSync(req); i++) await sleep(200);
  const id = crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(req, `${action} ${id} ${name}\n`, { mode: 0o600 });
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    await sleep(400);
    const st = readStatus();
    if (st && st.id === id) {
      if (!st.ok) throw fail(st.message || 'El ayudante no pudo completar la operación', 500);
      return st;
    }
  }
  throw fail('El ayudante no respondió. En el VPS: systemctl status opencode-multiuser.path', 504);
}

// Sin esperar respuesta (p. ej. reiniciar todos los espacios tras actualizar la app)
export function fire(action, name = '') {
  try {
    if (helperInfo().ready) fs.writeFileSync(path.join(INBOX, 'request'), `${action} none ${name}\n`, { mode: 0o600 });
  } catch { /* mejor esfuerzo */ }
}

// Puerto y secreto de la instancia de un usuario (los escribe el ayudante, legibles solo por la app)
const keyCache = new Map();
export function keys(name) {
  if (!/^[a-z][a-z0-9]{1,19}$/.test(name)) return null;
  const file = path.join(KEYS, `${name}.json`);
  try {
    const mtime = fs.statSync(file).mtimeMs;
    const c = keyCache.get(name);
    if (c && c.mtime === mtime) return c.value;
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Number.isInteger(value.port) || typeof value.secret !== 'string') return null;
    keyCache.set(name, { mtime, value });
    return value;
  } catch {
    keyCache.delete(name);
    return null;
  }
}

export function probe(name, timeout = 1500) {
  const k = keys(name);
  if (!k) return Promise.resolve(false);
  return new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port: k.port, path: '/api/health', timeout }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    r.on('timeout', () => { r.destroy(); resolve(false); });
    r.on('error', () => resolve(false));
  });
}

// Si el espacio no responde, pide arrancarlo (como mucho una vez cada 30 s por usuario)
const nudged = new Map();
export function nudge(name) {
  if (Date.now() - (nudged.get(name) || 0) < 30_000) return;
  nudged.set(name, Date.now());
  request('start', name).catch(() => {});
}

// Trabajo en curso en el espacio de un usuario (conversaciones de OpenCode trabajando y mensajes en cola).
// Se pregunta a su propia instancia; caché corta para no saturar cuando la WebUI consulta a menudo.
const actCache = new Map();
export async function activity(name) {
  const c = actCache.get(name);
  if (c && Date.now() - c.at < 8000) return c.v;
  const k = keys(name);
  let v = null;
  if (k) {
    v = await new Promise((resolve) => {
      const rq = http.request({ host: '127.0.0.1', port: k.port, path: '/api/activity', method: 'GET', timeout: 2500, headers: { 'x-oc-gateway': k.secret, 'x-oc-user': name } }, (r) => {
        let b = ''; r.setEncoding('utf8'); r.on('data', (d) => { if (b.length < 200000) b += d; });
        r.on('end', () => { try { const j = JSON.parse(b); resolve({ busy: (j.busy || []).length, queued: Number(j.queued) || 0, projects: [...new Set((j.busy || []).map((x) => x.projectName))].slice(0, 5) }); } catch { resolve(null); } });
      });
      rq.on('timeout', () => rq.destroy()); rq.on('error', () => resolve(null)); rq.end();
    });
  }
  actCache.set(name, { at: Date.now(), v });
  return v;
}
