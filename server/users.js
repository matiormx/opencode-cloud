// Usuarios de la pasarela (modo multiusuario). El administrador es el propietario de la instalación y conserva su
// contraseña de siempre (auth.json); el resto se guardan en users.json con su hash scrypt.
import * as auth from './auth.js';
import * as store from './store.js';

export const NAME_RE = /^[a-z][a-z0-9]{1,19}$/;
const RESERVED = new Set(['root', 'admin', 'occloud', 'ubuntu', 'daemon', 'nobody', 'system', 'opencode', 'git', 'www', 'test', 'users', 'removed']);

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const data = () => {
  const d = store.load('users', {});
  return { owner: d.owner || 'admin', users: d.users || {} };
};
const save = (d) => store.save('users', d);

export const ownerName = () => data().owner;

export function validateName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw fail('El usuario debe tener 2-20 caracteres: minúsculas y números, empezando por una letra');
  if (RESERVED.has(name) && name !== ownerName()) throw fail('Ese nombre está reservado');
}

export function exists(name) {
  return name === ownerName() || Boolean(data().users[name]);
}

export function isActive(name) {
  const u = data().users[name];
  return Boolean(u && !u.disabled);
}

export function list() {
  const d = data();
  const rest = Object.entries(d.users)
    .map(([name, u]) => ({ name, role: 'user', disabled: Boolean(u.disabled), createdAt: u.createdAt || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [{ name: d.owner, role: 'admin', disabled: false, createdAt: 0 }, ...rest];
}

// Devuelve { name, role } o null. Hace el mismo trabajo (scrypt) aunque el usuario no exista, para no revelar cuáles existen.
export async function authenticate(name, password) {
  const d = data();
  if (name === d.owner) return (await auth.verifyPassword(password)) ? { name, role: 'admin' } : null;
  const u = d.users[name];
  if (!u) {
    await auth.checkPassword(password, { salt: '00'.repeat(16), hash: '00'.repeat(64) });
    return null;
  }
  const ok = await auth.checkPassword(password, u);
  return ok && !u.disabled ? { name, role: 'user' } : null;
}

export async function create(name, password) {
  validateName(name);
  if (typeof password !== 'string' || password.length < 8) throw fail('La contraseña debe tener al menos 8 caracteres');
  const d = data();
  if (name === d.owner || d.users[name]) throw fail('Ese usuario ya existe', 409);
  d.users[name] = { ...(await auth.hashPassword(password)), disabled: false, createdAt: Date.now() };
  save(d);
}

export async function setPassword(name, password) {
  if (typeof password !== 'string' || password.length < 8) throw fail('La contraseña debe tener al menos 8 caracteres');
  const d = data();
  if (!d.users[name]) throw fail('Usuario no encontrado', 404);
  Object.assign(d.users[name], await auth.hashPassword(password));
  save(d);
  auth.dropSessions(name);
}

export function setDisabled(name, disabled) {
  const d = data();
  if (!d.users[name]) throw fail('Usuario no encontrado', 404);
  d.users[name].disabled = Boolean(disabled);
  save(d);
  if (disabled) auth.dropSessions(name);
}

export function remove(name) {
  const d = data();
  if (!d.users[name]) return;
  delete d.users[name];
  save(d);
  auth.dropSessions(name);
}

// Cambio de contraseña por el propio usuario (no administrador)
export async function changeOwnPassword(name, current, next) {
  const u = data().users[name];
  if (!u || !(await auth.checkPassword(current, u))) throw fail('La contraseña actual no es correcta', 403);
  await setPassword(name, next);
}
