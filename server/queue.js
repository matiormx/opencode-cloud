// Cola de mensajes por conversación: si OpenCode está ocupado, la petición espera
// en el servidor y se envía sola cuando la conversación queda libre (aunque cierres la app).
import crypto from 'node:crypto';
import path from 'node:path';
import { config } from './config.js';
import * as oc from './opencode.js';
import * as autocommit from './autocommit.js';
import * as drain from './drain.js';
import * as fallback from './fallback.js';
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
    items: data.items.filter((i) => i.projectId === projectId && i.sessionId === sessionId).map(({ id, text, at, model }) => ({ id, text, at, ...(model ? { model } : {}) })),
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
  if (data.items.length !== before) {
    // sin peticiones guardadas, la pausa no tiene sentido (y lo nuevo que escribas se enviaría a una cola invisible)
    if (!list(projectId, sessionId).items.length) delete data.paused[keyOf(projectId, sessionId)];
    persist();
  }
}

// Edita el texto y/o el modelo de una petición que sigue en la cola
export function update(projectId, sessionId, id, text, model) {
  const item = data.items.find((i) => i.id === id && i.projectId === projectId && i.sessionId === sessionId);
  if (!item) throw Object.assign(new Error('Esa petición ya se envió o no existe'), { status: 404 });
  if (text !== undefined) {
    text = String(text || '').trim();
    if (!text) throw Object.assign(new Error('El mensaje no puede quedar vacío'), { status: 400 });
    if (text.length > MAX_TEXT) throw Object.assign(new Error('Mensaje demasiado largo'), { status: 400 });
    item.text = text;
  }
  if (model !== undefined) {
    if (model === null) delete item.model; // sin modelo propio: el que tenga la conversación
    else if (model?.providerID && model?.modelID) item.model = { providerID: String(model.providerID).slice(0, 100), modelID: String(model.modelID).slice(0, 200) };
    else throw Object.assign(new Error('Modelo no válido'), { status: 400 });
  }
  persist();
}

// Reordena las peticiones de una conversación según la lista de ids (las que ya no estén —porque se enviaron— se ignoran;
// las nuevas que no vengan en la lista quedan al final)
export function reorder(projectId, sessionId, ids) {
  if (!Array.isArray(ids)) throw Object.assign(new Error('Orden no válido'), { status: 400 });
  const mine = data.items.filter((i) => i.projectId === projectId && i.sessionId === sessionId);
  const byId = new Map(mine.map((i) => [i.id, i]));
  const ordered = [];
  for (const id of ids) { const it = byId.get(String(id)); if (it && !ordered.includes(it)) ordered.push(it); }
  for (const it of mine) if (!ordered.includes(it)) ordered.push(it);
  let n = 0;
  data.items = data.items.map((i) => (i.projectId === projectId && i.sessionId === sessionId ? ordered[n++] : i));
  persist();
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

let held = false; // mientras se retoman las conversaciones pausadas por un reinicio, la cola espera
export const hold = (v) => { held = Boolean(v); };

async function tick() {
  if (ticking || held || !data.items.length || drain.active()) return; // con reinicio programado la cola espera
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
      if (fallback.isSwitching(items[0].sessionId)) continue; // se está cambiando de modelo: no se mezcla otra petición
      const proj = projects.find((p) => p.id === items[0].projectId);
      if (!proj) { clear(items[0].projectId, items[0].sessionId); continue; }
      if (Date.now() - (lastDispatch.get(k) || 0) < COOLDOWN_MS) continue;
      const dir = path.join(config.projectsDir, proj.dir);
      try {
        if (!statusCache.has(dir)) statusCache.set(dir, await oc.json('GET', '/session/status', { directory: dir }));
        const cur = statusCache.get(dir)?.[items[0].sessionId];
        if (cur && cur.type !== 'idle') continue; // sigue ocupada
        const next = items[0];
        await autocommit.flush(proj, statusCache.get(dir)); // lo que dejó la tarea anterior queda en un commit antes de empezar la siguiente
        const body = { parts: [{ type: 'text', text: next.text }] };
        if (next.model) body.model = fallback.pick(next.model); // si su modelo está sin cupo, se usa el de respaldo
        lastDispatch.set(k, Date.now());
        await oc.json('POST', `/session/${next.sessionId}/prompt_async`, { directory: dir, body });
        autocommit.note(proj.id, next.text);
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
