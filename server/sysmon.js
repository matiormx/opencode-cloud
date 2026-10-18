// Monitorización ligera de recursos del servidor: una muestra cada 10 s, última hora en memoria.
import fs from 'node:fs';
import os from 'node:os';
import { config } from './config.js';

const INTERVAL_MS = 10_000;
const MAX_POINTS = 360; // 1 hora

const history = [];
let prevCpu = null;
let prevNet = null;

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const [k, v] of Object.entries(c.times)) {
      total += v;
      if (k === 'idle') idle += v;
    }
  }
  return { idle, total };
}

function readMem() {
  const total = os.totalmem();
  let available = os.freemem();
  let swapTotal = 0;
  let swapFree = 0;
  try {
    const info = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (k) => {
      const m = info.match(new RegExp(`^${k}:\\s+(\\d+) kB`, 'm'));
      return m ? Number(m[1]) * 1024 : null;
    };
    available = get('MemAvailable') ?? available;
    swapTotal = get('SwapTotal') ?? 0;
    swapFree = get('SwapFree') ?? 0;
  } catch { /* fuera de Linux: valores de os */ }
  return { total, used: Math.max(0, total - available), swapTotal, swapUsed: Math.max(0, swapTotal - swapFree) };
}

function readNet() {
  try {
    let rx = 0;
    let tx = 0;
    for (const line of fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) {
      const [name, rest] = line.split(':');
      if (!rest || name.trim() === 'lo') continue;
      const f = rest.trim().split(/\s+/).map(Number);
      rx += f[0] || 0;
      tx += f[8] || 0;
    }
    return { rx, tx };
  } catch {
    return null;
  }
}

function sample() {
  const now = Date.now();
  const c = cpuTimes();
  let cpu = 0;
  if (prevCpu) {
    const dt = c.total - prevCpu.total;
    cpu = dt > 0 ? (1 - (c.idle - prevCpu.idle) / dt) * 100 : 0;
  }
  prevCpu = c;
  const mem = readMem();
  let rx = 0;
  let tx = 0;
  const net = readNet();
  if (net && prevNet) {
    const secs = (now - prevNet.t) / 1000 || 1;
    rx = Math.max(0, (net.rx - prevNet.rx) / secs);
    tx = Math.max(0, (net.tx - prevNet.tx) / secs);
  }
  if (net) prevNet = { ...net, t: now };
  history.push({
    t: now,
    cpu: Math.round(Math.min(100, Math.max(0, cpu)) * 10) / 10,
    mem: mem.total ? Math.round((mem.used / mem.total) * 1000) / 10 : 0,
    rx: Math.round(rx),
    tx: Math.round(tx),
  });
  if (history.length > MAX_POINTS) history.shift();
}

async function disk() {
  try {
    const s = await fs.promises.statfs(config.dataDir);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total, used: Math.max(0, total - free) };
  } catch {
    return null;
  }
}

export async function snapshot(points = 60) {
  const n = Math.min(Math.max(Number(points) || 60, 1), MAX_POINTS);
  const mem = readMem();
  return {
    intervalMs: INTERVAL_MS,
    now: {
      cores: os.cpus().length,
      load: os.loadavg().map((x) => Math.round(x * 100) / 100),
      uptime: Math.round(os.uptime()),
      mem,
      disk: await disk(),
      net: history.length ? { rx: history.at(-1).rx, tx: history.at(-1).tx } : null,
      cpu: history.length ? history.at(-1).cpu : 0,
    },
    history: history.slice(-n),
  };
}

export function start() {
  sample(); // primera lectura: fija la referencia de CPU y red
  setInterval(sample, INTERVAL_MS).unref();
}
