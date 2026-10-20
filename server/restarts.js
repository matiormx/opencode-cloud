// Reinicio de los espacios de usuario "cuando todos estén libres" (solo en la pasarela del modo multiusuario).
// El administrador lo pide (p. ej. tras cambiar la salida WireGuard) y la pasarela consulta cada pocos segundos si algún
// espacio tiene conversaciones trabajando o mensajes en cola. Cuando todos están libres de forma estable, pide al ayudante
// de root que los reinicie. La petición se guarda en disco: sobrevive a un reinicio de la pasarela.
import * as instances from './instances.js';
import * as store from './store.js';
import * as users from './users.js';

const POLL_MS = Number(process.env.RESTART_POLL_MS) || 15_000;
const MAX_WAIT_MS = (Number(process.env.RESTART_MAX_HOURS) || 6) * 3_600_000; // pasado este tiempo se reinicia igualmente
const STABLE_POLLS = 2; // libres en dos comprobaciones seguidas, para no pillar a alguien justo al enviar un mensaje

let pending = store.load('pending-restart', null); // { since: ms }
if (pending && !Number.isFinite(pending.since)) pending = null;
let timer = null;
let last = { at: 0, busy: [], unknown: 0 };
let streak = 0;
let ticking = false;

// Quién está trabajando ahora. 'unknown' = el espacio responde pero no se pudo saber su actividad (no se da por libre)
export async function whoIsBusy() {
  const list = users.list().filter((u) => u.role !== 'admin' && !u.disabled);
  const busy = [];
  let unknown = 0;
  await Promise.all(list.map(async (u) => {
    if (!(await instances.probe(u.name))) return; // apagado: nada que interrumpir
    const a = await instances.activity(u.name);
    if (!a) { unknown++; return; }
    if (a.busy || a.queued) busy.push({ name: u.name, busy: a.busy, queued: a.queued });
  }));
  return { busy, unknown };
}

const persist = () => { try { store.save('pending-restart', pending); } catch { /* mejor esfuerzo */ } };

async function tick() {
  if (!pending || ticking) return;
  ticking = true;
  try {
    const r = await whoIsBusy();
    last = { at: Date.now(), ...r };
    const free = !r.busy.length && !r.unknown;
    streak = free ? streak + 1 : 0;
    const expired = Date.now() - pending.since > MAX_WAIT_MS;
    if (streak >= STABLE_POLLS || expired) {
      console.log(`[reinicio] ${expired && !free ? 'tiempo máximo de espera alcanzado' : 'todos los espacios están libres'}: reiniciando los espacios`);
      cancel();
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

// Pide un reinicio al quedar todos libres (si ya hay uno pendiente, no cambia nada)
export function schedule() {
  if (!pending) { pending = { since: Date.now() }; streak = 0; persist(); }
  startTimer();
  return status();
}

export function cancel() {
  pending = null;
  streak = 0;
  persist();
  if (timer) { clearInterval(timer); timer = null; }
  return status();
}

export function status() {
  return { pending: Boolean(pending), since: pending?.since || 0, maxHours: Math.round(MAX_WAIT_MS / 3_600_000), busy: pending ? last.busy : [], unknown: pending ? last.unknown : 0 };
}

// Al arrancar la pasarela: si había un reinicio pendiente, se reanuda la espera
export function resume() {
  if (pending) startTimer();
}
