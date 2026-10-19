// Extensiones de OpenCode (servidores MCP): Context7, Playwright y los que añada el usuario.
// No se toca el opencode.json de nadie: la configuración se guarda aquí (data/extensions.json) y se pasa a OpenCode al
// arrancar mediante OPENCODE_CONFIG_CONTENT (ver opencode.js). Cada espacio de usuario tiene la suya.
//
// Playwright necesita Chromium y sus librerías del sistema, que se instalan una vez para todos en MCP_TOOLS_DIR con el
// ayudante de root deploy/browser.sh (se lanza desde Ajustes → Extensiones; solo el administrador).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import * as store from './store.js';

export const TOOLS_DIR = process.env.MCP_TOOLS_DIR || '/opt/opencode-cloud-mcp';
const BIN = path.join(TOOLS_DIR, 'node_modules', '.bin', 'playwright-mcp');
const BROWSERS = path.join(TOOLS_DIR, 'browsers');
const INBOX = process.env.BROWSER_INBOX || path.join(config.dataDir, 'browser-inbox');
const OUTBOX = process.env.BROWSER_OUTBOX || path.join(config.dataDir, 'browser-status');
const MAX_CUSTOM = 12;
const RESERVED = new Set(['context7', 'playwright']);

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const DEFAULTS = { context7: { enabled: false, apiKey: '' }, playwright: { enabled: false }, custom: [] };

function read() {
  const s = store.load('extensions', DEFAULTS);
  return {
    context7: { ...DEFAULTS.context7, ...(s.context7 || {}) },
    playwright: { ...DEFAULTS.playwright, ...(s.playwright || {}) },
    custom: Array.isArray(s.custom) ? s.custom : [],
  };
}
const write = (s) => store.save('extensions', s);

// --- Chromium (instalado por el ayudante de root) ---
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
export function browserInfo() {
  const ready = readJson(path.join(TOOLS_DIR, 'ready.json'));
  const installed = Boolean(ready) && fs.existsSync(BIN);
  const inboxOk = (() => { try { return fs.statSync(INBOX).isDirectory(); } catch { return false; } })();
  const st = readJson(path.join(OUTBOX, 'status.json'));
  const helper = !config.instance && inboxOk && Boolean(st);
  let log = [];
  if (helper) {
    try { log = fs.readFileSync(path.join(OUTBOX, 'browser.log'), 'utf8').split('\n').filter(Boolean).slice(-6).map((l) => l.slice(0, 200)); } catch { /* sin registro */ }
  }
  return {
    installed,
    version: installed ? String(ready.version || '') : '',
    helper,
    installing: helper && st.state === 'installing' && Date.now() - (st.at || 0) < 45 * 60_000,
    error: helper && st.state === 'error' ? String(st.message || 'Falló la instalación') : '',
    message: helper ? String(st.message || '') : '',
    log: helper && st.state === 'installing' ? log : [],
  };
}

export function browserRequest(action) {
  if (config.instance) throw fail('Lo gestiona el administrador', 403);
  if (!['install', 'remove'].includes(action)) throw fail('Acción no válida');
  const b = browserInfo();
  if (!b.helper) throw fail('Falta el ayudante en el VPS. Ejecuta una vez: sudo /opt/opencode-cloud/deploy/browser.sh setup', 409);
  if (b.installing) throw fail('Ya hay una instalación en curso', 409);
  const id = crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(path.join(INBOX, 'request'), `${action} ${id}\n`, { mode: 0o600 });
}

// --- Configuración que se entrega a OpenCode ---
export function mcpConfig() {
  const s = read();
  const out = {};
  if (s.context7.enabled) {
    out.context7 = { type: 'remote', url: 'https://mcp.context7.com/mcp', enabled: true };
    if (s.context7.apiKey) out.context7.headers = { CONTEXT7_API_KEY: s.context7.apiKey };
  }
  // Sin Chromium instalado no se registra: así OpenCode no arranca un servidor que va a fallar
  if (s.playwright.enabled && browserInfo().installed) {
    out.playwright = {
      type: 'local',
      command: [BIN, '--headless', '--isolated', '--browser', 'chromium', '--no-sandbox'],
      enabled: true,
      environment: { PLAYWRIGHT_BROWSERS_PATH: BROWSERS },
    };
  }
  for (const c of s.custom) {
    if (!c.enabled) continue;
    out[c.name] = c.type === 'remote'
      ? { type: 'remote', url: c.url, enabled: true, ...(c.headers && Object.keys(c.headers).length ? { headers: c.headers } : {}) }
      : { type: 'local', command: c.command, enabled: true, ...(c.env && Object.keys(c.env).length ? { environment: c.env } : {}) };
  }
  return out;
}

// --- Vista para la WebUI (nunca devuelve claves ni valores secretos) ---
export function view() {
  const s = read();
  const b = browserInfo();
  return {
    canInstallBrowser: !config.instance,
    context7: { enabled: s.context7.enabled, hasKey: Boolean(s.context7.apiKey) },
    playwright: { enabled: s.playwright.enabled, browser: b },
    custom: s.custom.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      target: c.type === 'remote' ? c.url : c.command.join(' '),
      enabled: c.enabled,
      headerNames: Object.keys(c.headers || {}),
      envNames: Object.keys(c.env || {}),
    })),
  };
}

export function setContext7({ enabled, apiKey, clearKey }) {
  const s = read();
  if (typeof enabled === 'boolean') s.context7.enabled = enabled;
  if (clearKey === true) s.context7.apiKey = '';
  if (typeof apiKey === 'string' && apiKey.trim()) {
    const k = apiKey.trim();
    if (!/^[\x21-\x7e]{8,200}$/.test(k)) throw fail('La clave no tiene un formato válido');
    s.context7.apiKey = k;
  }
  write(s);
}

export function setPlaywright({ enabled }) {
  const s = read();
  if (typeof enabled !== 'boolean') throw fail('Falta enabled');
  if (enabled && !browserInfo().installed) throw fail('Primero hay que instalar Chromium (lo hace el administrador)', 409);
  s.playwright.enabled = enabled;
  write(s);
}

// "npx -y paquete --opción 'con espacios'" → ['npx','-y','paquete','--opción','con espacios']
export function splitCommand(text) {
  const out = [];
  let cur = '';
  let quote = '';
  let has = false;
  for (const ch of String(text)) {
    if (quote) {
      if (ch === quote) quote = '';
      else cur += ch;
    } else if (ch === '"' || ch === "'") { quote = ch; has = true; }
    else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = ''; has = false;
    } else cur += ch;
  }
  if (quote) throw fail('Hay unas comillas sin cerrar en el comando');
  if (has || cur) out.push(cur);
  return out;
}

const lines = (t) => String(t || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

function parseHeaders(text) {
  const out = {};
  for (const l of lines(text)) {
    const i = l.indexOf(':');
    const k = l.slice(0, i).trim();
    const v = l.slice(i + 1).trim();
    if (i < 1 || !/^[A-Za-z0-9-]{1,60}$/.test(k)) throw fail(`Cabecera no válida: «${l.slice(0, 40)}». Usa «Nombre: valor»`);
    if (!v || v.length > 500 || /[\x00-\x1f]/.test(v)) throw fail(`El valor de la cabecera ${k} no es válido`);
    out[k] = v;
  }
  if (Object.keys(out).length > 10) throw fail('Demasiadas cabeceras (máximo 10)');
  return out;
}

function parseEnv(text) {
  const out = {};
  for (const l of lines(text)) {
    const i = l.indexOf('=');
    const k = l.slice(0, i).trim();
    const v = l.slice(i + 1);
    if (i < 1 || !/^[A-Za-z_][A-Za-z0-9_]{0,59}$/.test(k)) throw fail(`Variable no válida: «${l.slice(0, 40)}». Usa «NOMBRE=valor»`);
    if (v.length > 500 || /[\x00-\x1f]/.test(v)) throw fail(`El valor de ${k} no es válido`);
    out[k] = v;
  }
  if (Object.keys(out).length > 10) throw fail('Demasiadas variables (máximo 10)');
  return out;
}

export function addCustom(b = {}) {
  const s = read();
  if (s.custom.length >= MAX_CUSTOM) throw fail(`Máximo ${MAX_CUSTOM} extensiones propias`);
  const name = String(b.name || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,29}$/.test(name)) throw fail('El nombre debe tener 2-30 caracteres: letras minúsculas, números, - o _');
  if (RESERVED.has(name) || s.custom.some((c) => c.name === name)) throw fail('Ya existe una extensión con ese nombre');
  const item = { id: crypto.randomBytes(5).toString('hex'), name, enabled: true };
  if (b.type === 'remote') {
    let u;
    try { u = new URL(String(b.url || '').trim()); } catch { throw fail('La dirección no es una URL válida'); }
    if (!['http:', 'https:'].includes(u.protocol)) throw fail('La URL debe empezar por http:// o https://');
    Object.assign(item, { type: 'remote', url: u.toString(), headers: parseHeaders(b.headers) });
  } else if (b.type === 'local') {
    const command = splitCommand(b.command);
    if (!command.length) throw fail('Escribe el comando que arranca el servidor MCP');
    if (command.length > 20 || command.some((a) => a.length > 300 || /[\x00-\x1f]/.test(a))) throw fail('El comando no es válido');
    Object.assign(item, { type: 'local', command, env: parseEnv(b.env) });
  } else throw fail('Elige el tipo: remoto (URL) o local (comando)');
  s.custom.push(item);
  write(s);
  return item.id;
}

export function setCustom(id, { enabled }) {
  const s = read();
  const c = s.custom.find((x) => x.id === id);
  if (!c) throw fail('No existe esa extensión', 404);
  if (typeof enabled !== 'boolean') throw fail('Falta enabled');
  c.enabled = enabled;
  write(s);
}

export function removeCustom(id) {
  const s = read();
  const n = s.custom.length;
  s.custom = s.custom.filter((x) => x.id !== id);
  if (s.custom.length === n) throw fail('No existe esa extensión', 404);
  write(s);
}
