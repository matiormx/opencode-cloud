// Bloqueo de tareas nuevas en este espacio.
//  - set(): lo pide la pasarela mientras hay un reinicio programado por el administrador (se renueva en cada ronda y caduca a los 45 s).
//  - hold(): pausa para reiniciar; no se pueden iniciar tareas hasta que se retoman las pausadas (o caduca, como red de seguridad).
let until = 0;
let holdUntil = 0;

export const MSG = 'Hay un reinicio en curso: no se pueden iniciar tareas nuevas hasta que termine. Inténtalo en unos segundos.';

export const set = (on) => { until = on ? Date.now() + 45_000 : 0; };
export const hold = (ms) => { holdUntil = Date.now() + ms; };
export const release = () => { holdUntil = 0; };
export const active = () => Date.now() < until || Date.now() < holdUntil;
export const info = () => ({ pending: active() });
