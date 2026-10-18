// Monitorización de peticiones al modelo: escucha el flujo global de eventos de OpenCode y cuenta
// cada llamada completada (step-finish), cada reintento y cada error durante la última hora.
import { Readable } from 'node:stream';
import * as oc from './opencode.js';

const HOUR = 3_600_000;
const reqs = []; // { t, tokens, cost }
const retries = []; // { t }
const errors = []; // { t, status, message }
const seen = new Set(); // ids de partes ya contadas
let connected = false;

const prune = () => {
  const lim = Date.now() - HOUR;
  for (const a of [reqs, retries, errors]) while (a.length && a[0].t < lim) a.shift();
  if (seen.size > 4000) for (const k of [...seen].slice(0, 2000)) seen.delete(k);
};

function onEvent(msg) {
  const ev = msg?.payload || msg;
  const t = ev?.type;
  const p = ev?.properties || {};
  const now = Date.now();
  if (t === 'message.part.updated') {
    const part = p.part;
    if (!part?.id || seen.has(part.id)) return;
    if (part.type === 'step-finish') {
      seen.add(part.id);
      reqs.push({ t: now, tokens: part.tokens?.total || 0, cost: part.cost || 0 });
    } else if (part.type === 'retry') {
      seen.add(part.id);
      retries.push({ t: now });
    }
  } else if (t === 'session.error') {
    const d = p.error?.data || {};
    errors.push({ t: now, status: d.statusCode || null, message: String(d.message || p.error?.name || 'Error').slice(0, 300) });
  }
  prune();
}

async function run() {
  for (;;) {
    const ac = new AbortController();
    try {
      const r = await oc.stream('/global/event', { signal: ac.signal });
      connected = true;
      let buf = '';
      for await (const chunk of Readable.fromWeb(r.body)) {
        buf += chunk.toString('utf8');
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = block.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          try { onEvent(JSON.parse(line.slice(5))); } catch { /* evento no JSON */ }
        }
      }
    } catch { /* OpenCode no está listo o se reinició */ }
    connected = false;
    ac.abort();
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export function start() {
  run();
}

export function snapshot() {
  prune();
  const now = Date.now();
  const minute = (t) => Math.floor(t / 60_000);
  const cur = minute(now);
  const perMinute = [];
  for (let m = cur - 59; m <= cur; m++) perMinute.push({ t: m * 60_000, req: 0, retry: 0, err: 0 });
  const put = (arr, key) => { for (const x of arr) { const b = perMinute[minute(x.t) - (cur - 59)]; if (b) b[key]++; } };
  put(reqs, 'req'); put(retries, 'retry'); put(errors, 'err');
  return {
    connected,
    rpm: reqs.filter((x) => x.t > now - 60_000).length,
    total1h: reqs.length,
    retries1h: retries.length,
    errors1h: errors.length,
    tokens1h: reqs.reduce((a, x) => a + x.tokens, 0),
    cost1h: Math.round(reqs.reduce((a, x) => a + x.cost, 0) * 10000) / 10000,
    lastError: errors.length ? errors.at(-1) : null,
    perMinute,
  };
}
