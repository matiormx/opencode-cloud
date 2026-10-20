// Bloqueo de tareas nuevas mientras hay un reinicio programado.
//  - global: lo pide la pasarela (reinicio programado por el administrador). Caduca solo si la pasarela deja de renovarlo.
//  - propio: el usuario ha pedido reiniciar su OpenCode y se espera a que terminen sus conversaciones.
let globalUntil = 0;
let globalDeadline = 0;
let mine = null; // { since, deadline }

export const MSG = 'Hay un reinicio programado: no se pueden iniciar tareas nuevas hasta que termine. Inténtalo en unos minutos.';

export function setGlobal(on, deadline = 0) {
  globalUntil = on ? Date.now() + 45_000 : 0;
  globalDeadline = on ? Number(deadline) || 0 : 0;
}
export const setMine = (v) => { mine = v ? { since: Date.now(), deadline: Number(v.deadline) || 0 } : null; };
export const getMine = () => mine;
export const active = () => Date.now() < globalUntil || Boolean(mine);
export function info() {
  const global = Date.now() < globalUntil;
  return { pending: active(), kind: mine ? 'self' : global ? 'global' : '', deadline: mine?.deadline || (global ? globalDeadline : 0) };
}
