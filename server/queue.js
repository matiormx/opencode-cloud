// Cola de mensajes por conversación: si OpenCode está ocupado, la petición espera
// en el servidor y se envía sola cuando la conversación queda libre (aunque cierres la app).
import crypto from 'node:crypto';
import path from 'node:path';
import { config } from './config.js';
import * as oc from './opencode.js';
import * as store from './store.js';

const MAX_ITEMS = 20;
const MAX_TEXT = 20_000;
const COOLDOWN_MS = 4000; // tiempo para que el estado pase a «ocupado» tras enviar
const TICK_MS = 1500;

// { items: [{ id, projectId, sessionId, text, model, at }], paused: { "<projectId>:<sessionId>": true } }
let data = store.load('queue', { items: [], paused: {} });
data.items ||= [];
data.paused ||= {};
const persist = () => store.save('queue', data);
const keyOf = (projectId, sessionId) => `${projectId}:${sessionId}`;

const lastDispatch = new Map();
let ticking = false;

export function list(projectId, sessionId) {
  return {
    items: data.items.filter((i) => i.projectId === projectId && i.sessionId === sessionId).map(({ id, text, at }) => ({ id, text, at })),
    paused: Boolean(data.paused[keyOf(projectId, sessionId)]),
  };
}

export function countAll() {
  return data.items.length;
}

export function add(projectId, sessionId, text, model) {
  text = String(text || '').trim();
  if (!text) throw Object.assign(new Error('Mensaje vacío'), { status: 400 });
  if (text.length > MAX_TEXT) throw Object.assign(new Error('Mensaje demasiado largo'), { status: 400 });
  if (list(projectId, sessionId).items.length >= MAX_ITEMS) throw Object.assign(new Error(`La cola admite como máximo ${MAX_ITEMS} mensajes`), { status: 400 });
  const m = model?.providerID && model?.modelID ? { providerID: String(model.providerID), modelID: String(model.modelID) } : undefined;
  const item = { id: crypto.randomBytes(6).toString('hex'), projectId, sessionId, text, model: m, at: Date.now() };
  data.items.push(item);
  persist();
  return { id: item.id };
}

export function remove(projectId, sessionId, id) {
  const before = data.items.length;
  data.items = data.items.filter((i) => !(i.id === id && i.projectId === projectId && i.sessionId === sessionId));
  if (data.items.length !== before) persist();
}

export function clear(projectId, sessionId) {
  data.items = data.items.filter((i) => !(i.projectId === projectId && i.sessionId === sessionId));
  delete data.paused[keyOf(projectId, sessionId)];
  persist();
}

export function setPaused(projectId, sessionId, paused) {
  const k = keyOf(projectId, sessionId);
  if (paused) data.paused[k] = true;
  else delete data.paused[k];
  persist();
}

// Detener la tarea actual pausa la cola (si hay algo esperando) para que no arranque sola otra.
export function pauseIfAny(projectId, sessionId) {
  if (list(projectId, sessionId).items.length) setPaused(projectId, sessionId, true);
}

export function dropProject(projectId) {
  data.items = data.items.filter((i) => i.projectId !== projectId);
  for (const k of Object.keys(data.paused)) if (k.startsWith(`${projectId}:`)) delete data.paused[k];
  persist();
}

async function tick() {
  if (ticking || !data.items.length) return;
  ticking = true;
  try {
    const projects = store.load('projects', []);
    const groups = new Map();
    for (const i of data.items) {
      const k = keyOf(i.projectId, i.sessionId);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    }
    const statusCache = new Map();
    for (const [k, items] of groups) {
      if (data.paused[k]) continue;
      const proj = projects.find((p) => p.id === items[0].projectId);
      if (!proj) { clear(items[0].projectId, items[0].sessionId); continue; }
      if (Date.now() - (lastDispatch.get(k) || 0) < COOLDOWN_MS) continue;
      const dir = path.join(config.projectsDir, proj.dir);
      try {
        if (!statusCache.has(dir)) statusCache.set(dir, await oc.json('GET', '/session/status', { directory: dir }));
        const cur = statusCache.get(dir)?.[items[0].sessionId];
        if (cur && cur.type !== 'idle') continue; // sigue ocupada
        const next = items[0];
        const body = { parts: [{ type: 'text', text: next.text }] };
        if (next.model) body.model = next.model;
        lastDispatch.set(k, Date.now());
        await oc.json('POST', `/session/${next.sessionId}/prompt_async`, { directory: dir, body });
        data.items = data.items.filter((i) => i.id !== next.id);
        persist();
      } catch (e) {
        if (e.status === 404) clear(items[0].projectId, items[0].sessionId); // la conversación ya no existe
        // otros errores (OpenCode reiniciando…): se reintenta en el siguiente ciclo
      }
    }
  } finally {
    ticking = false;
  }
}

export function start() {
  setInterval(() => tick().catch(() => {}), TICK_MS).unref();
}
