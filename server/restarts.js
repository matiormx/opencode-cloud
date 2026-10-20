// Reinicio programado de los espacios de usuario (solo en la pasarela del modo multiusuario).
// El administrador lo programa y, desde ese momento, NADIE puede iniciar tareas nuevas (cada espacio rechaza mensajes nuevos y
// pausa su cola). Las conversaciones que ya estaban trabajando terminan con normalidad; cuando todos los espacios están libres,
// de forma estable, se pide al ayudante de root que los reinicie y se levanta el bloqueo.
// Si pasado el tiempo máximo alguien sigue ocupado (p. ej. esperando un permiso que nadie responde) se reinicia igualmente.
// La petición se guarda en disco: sobrevive a un reinicio de la pasarela.
import * as instances from './instances.js';
import * as store from './store.js';
import * as users from './users.js';

const POLL_MS = Number(process.env.RESTART_POLL_MS) || 10_000;
const MAX_WAIT_MS = (Number(process.env.RESTART_MAX_MIN) || 30) * 60_000;
const STABLE_POLLS = 2; // libres en dos comprobaciones seguidas

let pending = store.load('pending-restart', null); // { since: ms }
if (pending && !Number.isFinite(pending.since)) pending = null;
let timer = null;
let streak = 0;
let ticking = false;

const activeUsers = () => users.list().filter((u) => u.role !== 'admin' && !u.disabled);

// Quién tiene conversaciones trabajando ahora. 'unknown' = el espacio responde pero no se pudo saber su actividad (no se da por libre).
// La cola no cuenta: mientras hay bloqueo no se envía y se retoma tras el reinicio.
export async function whoIsBusy() {
  const busy = [];
  let unknown = 0;
  await Promise.all(activeUsers().map(async (u) => {
    if (!(await instances.probe(u.name))) return; // apagado: nada que interrumpir
    const a = await instances.activity(u.name, true); // sin caché: decide un reinicio
    if (!a) { unknown++; return; }
    if (a.busy) busy.push({ name: u.name, busy: a.busy, queued: a.queued, projects: a.projects || [] });
  }));
  return { busy, unknown };
}

const persist = () => { try { store.save('pending-restart', pending); } catch { /* mejor esfuerzo */ } };
const deadline = () => (pending ? pending.since + MAX_WAIT_MS : 0);

// Pide a cada espacio en marcha que bloquee (o libere) las tareas nuevas; se renueva en cada ronda porque caduca solo
async function pushDrain(on) {
  await Promise.all(activeUsers().map((u) => instances.setDrain(u.name, on, deadline()).catch(() => {})));
}

async function tick() {
  if (!pending || ticking) return;
  ticking = true;
  try {
    await pushDrain(true);
    const r = await whoIsBusy();
    const free = !r.busy.length && !r.unknown;
    streak = free ? streak + 1 : 0;
    const expired = Date.now() > deadline();
    if (streak >= STABLE_POLLS || expired) {
      console.log(`[reinicio] ${expired && !free ? 'tiempo máximo de espera alcanzado' : 'todos los espacios están libres'}: reiniciando los espacios`);
      pending = null; streak = 0; persist();
      clearInterval(timer); timer = null;
      instances.fire('restart-all');
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
export async function schedule() {
  if (!pending) { pending = { since: Date.now() }; streak = 0; persist(); }
  startTimer();
  await pushDrain(true);
  return status();
}

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
  const { busy, unknown } = await whoIsBusy().catch(() => ({ busy: [], unknown: 0 }));
  return { pending: Boolean(pending), since: pending?.since || 0, deadline: deadline(), maxMinutes: Math.round(MAX_WAIT_MS / 60_000), busy, unknown };
}

// Al arrancar la pasarela: si había un reinicio programado, se reanuda
export function resume() {
  if (pending) startTimer();
}
