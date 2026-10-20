// Bloqueo de tareas nuevas mientras hay un reinicio programado por el administrador (afecta a todos los espacios).
// Lo pide la pasarela y se renueva en cada ronda: si deja de renovarse (la pasarela cae), caduca a los 45 s y el espacio se desbloquea solo.
let until = 0;

export const MSG = 'Hay un reinicio programado por el administrador: no se pueden iniciar tareas nuevas hasta que termine. Inténtalo en unos minutos.';

export const set = (on) => { until = on ? Date.now() + 45_000 : 0; };
export const active = () => Date.now() < until;
export const info = () => ({ pending: active() });
