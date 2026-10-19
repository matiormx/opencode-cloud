import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { mcpConfig } from './extensions.js';

// Contraseña interna entre esta app y `opencode serve` (el servidor de OpenCode solo escucha en 127.0.0.1).
const password = crypto.randomBytes(24).toString('hex');
const base = `http://127.0.0.1:${config.opencodePort}`;
const authHeader = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;

let child = null;
let stopping = false;
let restarts = 0;
let startedAt = 0;
let timer = null;
let appliedMcp = '{}';
const logTail = [];

function pushLog(line) {
  logTail.push(line);
  if (logTail.length > 200) logTail.shift();
}

export function resolveBin() {
  if (config.opencodeBin) return config.opencodeBin;
  const local = path.join(os.homedir(), '.opencode', 'bin', 'opencode');
  return fs.existsSync(local) ? local : 'opencode';
}

export function start() {
  if (child) return;
  stopping = false;
  const env = { ...process.env, OPENCODE_SERVER_PASSWORD: password };
  // Configuración que pone esta app (se mezcla con la del usuario): permisos y extensiones MCP (ver extensions.js)
  const inline = {};
  if (config.ocPermission === 'allow') inline.permission = { edit: 'allow', bash: 'allow', webfetch: 'allow' };
  let mcp = {};
  try { mcp = mcpConfig(); } catch (e) { pushLog(`[opencode-cloud] No se pudieron cargar las extensiones: ${e.message}`); }
  if (Object.keys(mcp).length) inline.mcp = mcp;
  appliedMcp = JSON.stringify(mcp);
  if (Object.keys(inline).length) env.OPENCODE_CONFIG_CONTENT = JSON.stringify(inline);
  const bin = resolveBin();
  startedAt = Date.now();
  const proc = spawn(bin, ['serve', '--port', String(config.opencodePort), '--hostname', '127.0.0.1'], {
    cwd: config.projectsDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child = proc;
  const onData = (d) => d.toString().split('\n').filter(Boolean).forEach(pushLog);
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('error', (e) => {
    pushLog(`[opencode-cloud] No se pudo lanzar "${bin}": ${e.message}`);
  });
  proc.on('exit', (code, signal) => {
    pushLog(`[opencode-cloud] opencode terminó (code=${code} signal=${signal})`);
    child = null;
    if (stopping) return;
    if (Date.now() - startedAt > 60_000) restarts = 0;
    const delay = Math.min(30_000, 1000 * 2 ** restarts++);
    timer = setTimeout(start, delay);
  });
}

export function stop() {
  stopping = true;
  clearTimeout(timer);
  const proc = child;
  if (!proc) return Promise.resolve();
  return new Promise((resolve) => {
    const force = setTimeout(() => proc.kill('SIGKILL'), 5000);
    proc.once('exit', () => {
      clearTimeout(force);
      resolve();
    });
    proc.kill('SIGTERM');
  });
}

export async function restart() {
  await stop();
  restarts = 0;
  start();
}

export const logs = () => logTail.slice(-60);
// Extensiones con las que arrancó OpenCode (para saber si hay cambios pendientes de aplicar)
export const appliedMcpJson = () => appliedMcp;
export const isRunning = () => Boolean(child);

function buildUrl(p, { directory, query } = {}) {
  const url = new URL(base + p);
  if (directory) url.searchParams.set('directory', directory);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  return url;
}

export async function json(method, p, { directory, query, body, signal, timeout = 30_000 } = {}) {
  let r;
  try {
    r = await fetch(buildUrl(p, { directory, query }), {
      method,
      headers: { Authorization: authHeader, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signal || AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw Object.assign(new Error('OpenCode no responde (¿se está iniciando o no está instalado?)'), { status: 503, cause: e });
  }
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw Object.assign(new Error(`OpenCode ${r.status}: ${text.slice(0, 300)}`), { status: r.status === 404 ? 404 : 502 });
  }
  if (r.status === 204) return true;
  const type = r.headers.get('content-type') || '';
  return type.includes('json') ? r.json() : r.text();
}

export async function stream(p, { directory, signal } = {}) {
  let r;
  try {
    r = await fetch(buildUrl(p, { directory }), { headers: { Authorization: authHeader, Accept: 'text/event-stream' }, signal });
  } catch (e) {
    throw Object.assign(new Error('OpenCode no responde'), { status: 503, cause: e });
  }
  if (!r.ok || !r.body) throw Object.assign(new Error(`OpenCode ${r.status}`), { status: 502 });
  return r;
}

export async function health() {
  try {
    return await json('GET', '/global/health', { timeout: 3000 });
  } catch {
    return null;
  }
}

export function upgrade() {
  return new Promise((resolve, reject) => {
    execFile(resolveBin(), ['upgrade'], { timeout: 5 * 60_000, env: process.env }, (err, stdout, stderr) => {
      const out = `${stdout || ''}${stderr || ''}`.trim();
      if (err) return reject(Object.assign(new Error(out || err.message), { status: 500 }));
      resolve(out);
    });
  });
}
