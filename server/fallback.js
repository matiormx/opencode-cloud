// Modelo de respaldo: si el modelo que usa una conversación se queda sin cupo (límite de uso, créditos, plan gratuito agotado)
// y el proveedor impone una espera larga, la app cancela el reintento y sigue con el modelo de respaldo que elijas,
// para no quedarse parada horas. Funciona en el servidor, aunque la app esté cerrada.
// No es para saltarse límites: usa un modelo/proveedor distinto con su propio cupo o clave.
import * as store from './store.js';

const POLL_MS = Number(process.env.FALLBACK_POLL_MS) || 10_000;
const QUOTA_RE = /free usage|usage (limit )?exceeded|exceeded.*(quota|usage|limit)|quota|insufficient|credit|billing|subscribe|payment|out of/i;
const LONG_WAIT_S = 600; // un límite de peticiones por minuto se resuelve solo; una espera de más de 10 min, no
const COOLDOWN_MS = 15 * 60_000; // por conversación: evita cambiar de un modelo a otro en bucle
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let deps = null; // { collectSessions, lastChoice, send, abort }
const exhausted = new Map(); // "proveedor::modelo" → hasta cuándo (ms)
const lastSwitch = new Map(); // sessionId → ms
const switching = new Set(); // conversaciones que se están cambiando ahora mismo
let ticking = false;

const keyOf = (m) => (m?.providerID && m?.modelID ? `${m.providerID}::${m.modelID}` : '');
export const init = (d) => { deps = d; };
export const getFallback = () => {
  const m = store.getSettings().fallbackModel;
  return m?.providerID && m?.modelID ? { providerID: String(m.providerID), modelID: String(m.modelID) } : null;
};
const isExhausted = (key) => (exhausted.get(key) || 0) > Date.now();
export const isSwitching = (sessionId) => switching.has(sessionId);

// Para la cola: si el modelo de una petición está agotado y hay respaldo disponible, se usa el respaldo
export function pick(model) {
  const fb = getFallback();
  if (!model || !fb) return model;
  const k = keyOf(model);
  if (k && isExhausted(k) && !isExhausted(keyOf(fb)) && k !== keyOf(fb)) return fb;
  return model;
}

async function tick() {
  const fb = getFallback();
  if (!fb || !deps || ticking) return;
  ticking = true;
  try {
    const sessions = await deps.collectSessions();
    for (const s of sessions) {
      if (s.state !== 'retrying' || !s.retry) continue;
      const msg = s.retry.message || '';
      const wait = s.retry.inSec ?? 0;
      if (!QUOTA_RE.test(msg) && wait < LONG_WAIT_S) continue; // un fallo pasajero: OpenCode reintenta solo
      if (Date.now() - (lastSwitch.get(s.sessionId) || 0) < COOLDOWN_MS) continue;
      const choice = await deps.lastChoice(s);
      const failing = keyOf(choice.model);
      if (failing && failing === keyOf(fb)) continue; // el respaldo es el que falla: no hay a dónde ir
      if (isExhausted(keyOf(fb))) continue;
      if (failing) exhausted.set(failing, Date.now() + Math.min(Math.max(wait, 3600), 24 * 3600) * 1000);
      lastSwitch.set(s.sessionId, Date.now());
      switching.add(s.sessionId);
      try {
        await deps.abort(s);
        await sleep(1200); // deja que termine de cancelarse
        const text = `Cambio automático de modelo: ${failing || 'el anterior'} alcanzó su límite de uso (${msg.slice(0, 120) || 'sin detalle'}). Continúa con la tarea anterior desde donde se quedó.`;
        await deps.send(s, text, fb, choice.agent);
        console.log(`[respaldo] ${s.projectName}: ${failing || '?'} → ${keyOf(fb)}`);
      } catch (e) {
        console.error(`[respaldo] ${s.sessionId}: ${e.message}`);
      } finally {
        setTimeout(() => switching.delete(s.sessionId), 4000).unref?.();
      }
    }
  } catch { /* OpenCode no responde */ } finally {
    ticking = false;
  }
}

export function start() {
  setInterval(() => tick().catch(() => {}), POLL_MS).unref();
}
