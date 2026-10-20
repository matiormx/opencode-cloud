// Reinicio programado de los espacios de usuario (solo en la pasarela del modo multiusuario).
// Lo que afecta a todos (nueva salida WireGuard, actualizar la app o OpenCode) espera a que todos estén libres: desde que el
// administrador lo programa NADIE puede iniciar tareas nuevas (cada espacio rechaza mensajes nuevos y pausa su cola); las
// conversaciones que ya estaban trabajando terminan con normalidad y, cuando todos los espacios están libres de forma estable,
// se pide al ayudante de root que reinicie. No hay tope de espera: el administrador puede cancelar o forzar a mano.
// Una conversación parada esperando un permiso o una respuesta del usuario no cuenta como trabajo en curso.
// La petición se guarda en disco: sobrevive a un reinicio de la pasarela.
import * as instances from './instances.js';
import * as store from './store.js';
import * as users from './users.js';

const POLL_MS = Number(process.env.RESTART_POLL_MS) || 10_000;
const STABLE_POLLS = 2; // libres en dos comprobaciones seguidas
export const ACTIONS = ['restart-all', 'upgrade-opencode'];

let pending = store.load('pending-restart', null); // { since, action }
if (pending && !Number.isFinite(pending.since)) pending = null;
if (pending && !ACTIONS.includes(pending.action)) pending.action = 'restart-all';
let timer = null;
let streak = 0;
let ticking = false;

const activeUsers = () => users.list().filter((u) => u.role !== 'admin' && !u.disabled);

// Quién tiene trabajo real en curso ahora (y quién está solo esperando una respuesta suya).
// 'unknown' = el espacio responde pero no se pudo saber su actividad (no se da por libre).
export async function whoIsBusy() {
  const busy = [];
  const waiting = [];
  let unknown = 0;
  await Promise.all(activeUsers().map(async (u) => {
    if (!(await instances.probe(u.name))) return; // apagado: nada que interrumpir
    const a = await instances.activity(u.name, true); // sin caché: decide un reinicio
    if (!a) { unknown++; return; }
    if (a.working) busy.push({ name: u.name, busy: a.working, queued: a.queued, projects: a.projects || [] });
    if (a.waiting) waiting.push({ name: u.name, waiting: a.waiting });
  }));
  return { busy, waiting, unknown };
}

const persist = () => { try { store.save('pending-restart', pending); } catch { /* mejor esfuerzo */ } };

// Pide a cada espacio en marcha que bloquee (o libere) las tareas nuevas; se renueva en cada ronda porque caduca solo
async function pushDrain(on) {
  await Promise.all(activeUsers().map((u) => instances.setDrain(u.name, on).catch(() => {})));
}

async function tick() {
  if (!pending || ticking) return;
  ticking = true;
  try {
    await pushDrain(true);
    const r = await whoIsBusy();
    streak = !r.busy.length && !r.unknown ? streak + 1 : 0;
    if (streak >= STABLE_POLLS) {
      const action = pending.action;
      console.log(`[reinicio] todos los espacios están libres: ${action}`);
      pending = null; streak = 0; persist();
      clearInterval(timer); timer = null;
      instances.fire(action); // los espacios se reinician: el bloqueo desaparece con ellos
    }
  } catch (err) {
    console.error('[reinicio]', err.message);
  } finally {
    ticking = false;
  }
}

function startTimer() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  timer.unref?.();
  tick();
}

// Programa el reinicio (si ya hay uno programado, no cambia nada)
export async function schedule(action = 'restart-all') {
  if (!ACTIONS.includes(action)) throw Object.assign(new Error('Acción no válida'), { status: 400 });
  if (!pending) { pending = { since: Date.now(), action }; streak = 0; persist(); }
  startTimer();
  await pushDrain(true);
  return status();
}

export const pendingAction = () => (pending ? pending.action : '');

export async function cancel() {
  const had = Boolean(pending);
  pending = null;
  streak = 0;
  persist();
  if (timer) { clearInterval(timer); timer = null; }
  if (had) await pushDrain(false);
  return status();
}

export async function status() {
  const { busy, waiting, unknown } = await whoIsBusy().catch(() => ({ busy: [], waiting: [], unknown: 0 }));
  return { pending: Boolean(pending), action: pending?.action || '', since: pending?.since || 0, busy, waiting, unknown };
}

// Al arrancar la pasarela: si había un reinicio programado, se reanuda
export function resume() {
  if (pending) startTimer();
}

// Pausa el trabajo de todos los espacios para poder reiniciar sin esperar: cada espacio cancela el turno de sus conversaciones,
// apunta cuáles eran y, al volver tras el reinicio, las retoma solo. Si un espacio no puede pausarse con seguridad
// (no responde, o es de una versión anterior y tiene trabajo en curso) se devuelve en 'blocked' y no se debe reiniciar.
export async function pauseAll() {
  const rows = await Promise.all(activeUsers().map(async (u) => {
    if (!(await instances.probe(u.name))) return { name: u.name, paused: 0, blocked: false };
    const r = await instances.pause(u.name);
    if (r.status === 200 && r.json?.ok) return { name: u.name, paused: r.json.paused || 0, blocked: false };
    if (r.status === 404) { // versión anterior: solo es seguro si no tiene nada trabajando
      const a = await instances.activity(u.name, true);
      return { name: u.name, paused: 0, blocked: !a || Boolean(a.working), old: true };
    }
    return { name: u.name, paused: 0, blocked: true };
  }));
  return { paused: rows.reduce((n, r) => n + r.paused, 0), blocked: rows.filter((r) => r.blocked) };
}

// Si no se llega a reiniciar, los espacios retoman lo pausado
export async function resumeAll() {
  await Promise.all(activeUsers().map((u) => instances.resume(u.name).catch(() => null)));
}
