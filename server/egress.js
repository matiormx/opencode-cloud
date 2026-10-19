// Salida a internet: ¿está activo el túnel WireGuard (deploy/egress.sh) y con qué IP pública sale este proceso?
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';

const IFACE = process.env.EGRESS_IFACE || 'ocegress';
const TTL = 60_000;
const URLS = ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com'];

let cache = null; // { at, tunnel, ip }
let inflight = null;

const tunnelUp = () => Boolean(os.networkInterfaces()[IFACE]);

async function lookup() {
  const signal = AbortSignal.timeout(5000); // presupuesto total, no por URL
  for (const url of URLS) {
    try {
      const r = await fetch(url, { signal });
      const t = (await r.text()).trim();
      if (r.ok && /^[0-9a-fA-F:.]{7,45}$/.test(t)) return t;
    } catch { /* probar el siguiente */ }
  }
  return null;
}

export async function status({ force = false } = {}) {
  const tunnel = tunnelUp();
  if (!force && cache && cache.tunnel === tunnel && Date.now() - cache.at < TTL) return { iface: IFACE, ...cache, ...helperInfo() };
  inflight ||= lookup().finally(() => { inflight = null; });
  const ip = await inflight;
  cache = { at: Date.now(), tunnel, ip };
  return { iface: IFACE, ...cache, ...helperInfo() };
}

// --- Ayudante del sistema (deploy/egress.sh setup) ---
// La app no es root: deja la petición en INBOX y una unidad systemd de root (opencode-egress.path) la aplica y
// publica el resultado en OUTBOX, que la app solo puede leer.
const INBOX = process.env.EGRESS_INBOX || path.join(config.dataDir, 'egress-inbox');
const OUTBOX = process.env.EGRESS_OUTBOX || path.join(config.dataDir, 'egress-status');
const MAX_CONF = 8192;
let busy = false;

function readHelper() {
  try { return JSON.parse(fs.readFileSync(path.join(OUTBOX, 'status.json'), 'utf8')); } catch { return null; }
}

function readHealth() {
  try { return JSON.parse(fs.readFileSync(path.join(OUTBOX, 'health.json'), 'utf8')); } catch { return null; }
}

export function helperInfo() {
  const h = readHelper();
  const inboxOk = (() => { try { return fs.statSync(INBOX).isDirectory(); } catch { return false; } })();
  if (!h || !inboxOk) return { helper: false };
  const hl = readHealth();
  // Estado vivo (lo publica un temporizador cada minuto); si no existe o está viejo, se usa la última acción
  const fresh = hl && Date.now() - (hl.at || 0) < 180_000;
  return {
    helper: true,
    helperV: hl?.v || 1,
    configured: Boolean(fresh ? hl.configured : h.configured),
    active: Boolean(fresh ? hl.active : h.active),
    enabled: fresh ? Boolean(hl.enabled) : null,
    handshakeAge: fresh && Number.isFinite(hl.handshakeAge) ? hl.handshakeAge : null,
    endpoint: hl?.endpoint || '',
    address: hl?.address || '',
    confView: typeof hl?.view === 'string' ? hl.view.replace(/\\n/g, '\n') : '',
    directIp: h.directIp || '',
    tunnelIp: h.tunnelIp || '',
    message: h.message || '',
    helperAt: h.at || 0,
  };
}

export async function request(action, conf) {
  if (!helperInfo().helper) throw Object.assign(new Error('El ayudante no está instalado en el VPS'), { status: 409 });
  if (!['apply', 'on', 'off', 'remove', 'reconnect'].includes(action)) throw Object.assign(new Error('Acción no válida'), { status: 400 });
  if (action === 'apply') {
    if (typeof conf !== 'string' || !conf.trim()) throw Object.assign(new Error('Pega o carga el contenido del fichero .conf'), { status: 400 });
    if (Buffer.byteLength(conf) > MAX_CONF) throw Object.assign(new Error('El fichero es demasiado grande para ser una configuración WireGuard'), { status: 400 });
  }
  if (busy) throw Object.assign(new Error('Hay otra operación en curso'), { status: 409 });
  busy = true;
  try {
    const id = crypto.randomBytes(8).toString('hex');
    if (action === 'apply') fs.writeFileSync(path.join(INBOX, 'wg.conf'), conf.replace(/\r/g, ''), { mode: 0o600 });
    fs.writeFileSync(path.join(INBOX, 'request'), `${action} ${id}\n`, { mode: 0o600 });
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      await new Promise((r) => setTimeout(r, 400));
      const h = readHelper();
      if (h && h.id === id) { cache = null; return { ok: Boolean(h.ok), message: h.message || '', ...helperInfo() }; }
    }
    throw Object.assign(new Error('El ayudante no respondió. Comprueba en el VPS: systemctl status opencode-egress.path'), { status: 504 });
  } finally {
    busy = false;
    try { fs.rmSync(path.join(INBOX, 'wg.conf'), { force: true }); } catch { /* ya lo borró el ayudante */ }
  }
}
