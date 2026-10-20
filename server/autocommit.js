// Commit automático: cuando OpenCode termina una tarea (y también entre una tarea y la siguiente de la cola) se hace
// «git add -A && git commit» del proyecto, con el principio de lo que pediste como mensaje. Nunca hace push.
// El estado pendiente se guarda en disco: sobrevive a un reinicio de la app mientras OpenCode trabaja.
import path from 'node:path';
import { config } from './config.js';
import * as git from './git.js';
import * as oc from './opencode.js';
import * as store from './store.js';

const POLL_MS = Number(process.env.AUTOCOMMIT_POLL_MS) || 3000;
const GRACE_MS = Number(process.env.AUTOCOMMIT_GRACE_MS) || 5000; // tiempo para que la conversación pase a «ocupada» tras enviar
const MAX_AGE_MS = 12 * 3600_000;

// { "<projectId>": { at, prompt } }: proyectos con una tarea enviada cuyo resultado aún no se ha confirmado en git
let pending = store.load('autocommit', {});
const persist = () => { try { store.save('autocommit', pending); } catch { /* mejor esfuerzo */ } };
const enabled = () => store.getSettings().autoCommit !== false;
let ticking = false;

// Primera línea útil de lo que pediste (sin la nota de archivos adjuntos)
function subject(prompt) {
  const first = String(prompt || '').split('\n').map((l) => l.trim()).find((l) => l && !/^Archivos adjuntos \(/.test(l)) || '';
  const clean = first.replace(/\s+/g, ' ');
  if (!clean) return 'Cambios de OpenCode';
  return clean.length > 72 ? `${clean.slice(0, 71)}…` : clean;
}

// Se llama al enviar una tarea a OpenCode (desde el chat, desde la cola o al reanudar tras un reinicio)
export function note(projectId, prompt) {
  if (!enabled()) return;
  pending[projectId] = { at: Date.now(), prompt: prompt ? String(prompt).slice(0, 2000) : (pending[projectId]?.prompt || '') };
  persist();
}

const dirOf = (proj) => path.join(config.projectsDir, proj.dir);
const anyBusy = (st) => Object.values(st || {}).some((s) => s && s.type && s.type !== 'idle');

// Hace el commit del proyecto si hay cambios. Devuelve true si ya no hay nada pendiente (hecho o sin nada que hacer).
async function commit(proj, entry) {
  const dir = dirOf(proj);
  if (!(await git.isRepo(dir))) return true;
  const st = await git.status(dir);
  if (st.merging || st.conflicts.length) return true; // no se toca una fusión a medias
  if (!st.files.length) return true;
  try {
    await git.commitAll(dir, `${subject(entry?.prompt)}\n\nCommit automático de OpenCode Cloud.`);
    console.log(`[autocommit] ${proj.name}: ${subject(entry?.prompt)}`);
    return true;
  } catch (e) {
    if (/No hay cambios/i.test(e.message)) return true;
    console.error(`[autocommit] ${proj.name}: ${e.message}`);
    return false; // p. ej. git ocupado: se reintenta
  }
}

// Antes de enviar la siguiente tarea de la cola: se confirma lo que dejó la anterior.
// `status` es /session/status del proyecto, ya consultado por la cola.
export async function flush(proj, status) {
  const entry = pending[proj.id];
  if (!entry || !enabled() || anyBusy(status)) return;
  if (await commit(proj, entry)) { delete pending[proj.id]; persist(); }
}

async function tick() {
  if (ticking) return;
  const ids = Object.keys(pending);
  if (!ids.length) return;
  ticking = true;
  try {
    const projects = store.load('projects', []);
    for (const id of ids) {
      const entry = pending[id];
      const proj = projects.find((p) => p.id === id);
      if (!proj || !enabled() || Date.now() - entry.at > MAX_AGE_MS) { delete pending[id]; persist(); continue; }
      if (Date.now() - entry.at < GRACE_MS) continue;
      let status;
      try { status = await oc.json('GET', '/session/status', { directory: dirOf(proj) }); } catch { continue; } // OpenCode no responde: se reintenta
      if (anyBusy(status)) continue; // sigue trabajando (o esperando un permiso)
      if (await commit(proj, entry)) { delete pending[id]; persist(); }
    }
  } finally {
    ticking = false;
  }
}

export function start() {
  setInterval(() => tick().catch(() => {}), POLL_MS).unref();
}
