import { execFile } from 'node:child_process';
import { config } from './config.js';
import * as git from './git.js';
import * as store from './store.js';

const cwd = config.root;
const underSystemd = Boolean(process.env.INVOCATION_ID);
let cache = null;
let busy = false;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const state = () => store.load('update', {});

function npmCi() {
  return new Promise((resolve, reject) => {
    execFile('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd, timeout: 10 * 60_000 }, (err, stdout, stderr) => {
      if (err) return reject(fail(`npm ci falló: ${(stderr || err.message).slice(-500)}`, 500));
      resolve(stdout);
    });
  });
}

async function readVersion() {
  const pkg = JSON.parse((await import('node:fs')).readFileSync(`${cwd}/package.json`, 'utf8'));
  return pkg.version;
}

export async function current() {
  if (config.instance) return { supported: false, version: await readVersion(), reason: 'Las actualizaciones las gestiona el administrador' };
  const repo = await git.isRepo(cwd);
  if (!repo) return { supported: false, version: await readVersion(), reason: 'La aplicación no está instalada desde un repositorio git' };
  const head = await git.run(['rev-parse', '--short', 'HEAD'], { cwd, allowFail: true });
  if (head.code !== 0) return { supported: false, version: await readVersion(), reason: 'El repositorio de la aplicación aún no tiene commits' };
  const sha = head.stdout.trim();
  const remote = (await git.run(['remote', 'get-url', 'origin'], { cwd, allowFail: true })).stdout.trim();
  return { supported: Boolean(remote), version: await readVersion(), sha, remote, branch: config.updateBranch, underSystemd };
}

// Consulta rápida para la WebUI: devuelve lo último que se sabe (o solo lo local) sin esperar a GitHub,
// y si no hay datos recientes lanza la comprobación en segundo plano.
let bg = null;
export async function peek() {
  if (cache) return cache;
  bg ||= check({ refresh: true }).catch(() => null).finally(() => { bg = null; });
  const info = await current();
  return { ...info, behind: 0, commits: [], pending: true };
}

export async function check({ refresh = true } = {}) {
  if (!refresh && cache) return cache;
  const info = await current();
  if (!info.supported) return (cache = { ...info, behind: 0, commits: [], checkedAt: Date.now() });
  const branch = config.updateBranch;
  try {
    await git.run(['fetch', 'origin', branch], { cwd, net: true, timeout: 90_000 });
  } catch (e) {
    return (cache = { ...info, behind: 0, commits: [], error: e.message, checkedAt: Date.now() });
  }
  const behind = Number((await git.run(['rev-list', '--count', `HEAD..origin/${branch}`], { cwd })).stdout.trim() || 0);
  const logOut = behind
    ? (await git.run(['log', '--pretty=format:%h%x1f%s%x1f%an%x1f%cr', '-n', '30', `HEAD..origin/${branch}`], { cwd })).stdout
    : '';
  const commits = logOut
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, subject, author, when] = l.split('\x1f');
      return { hash, subject, author, when };
    });
  const dirty = (await git.run(['status', '--porcelain', '--untracked-files=no'], { cwd })).stdout.trim().length > 0;
  const latest = (await git.run(['rev-parse', '--short', `origin/${branch}`], { cwd })).stdout.trim();
  const prev = state().prev || null;
  return (cache = { ...info, behind, commits, dirty, latest, canRollback: Boolean(prev), checkedAt: Date.now() });
}

function scheduleRestart() {
  if (!underSystemd) return false;
  // systemd (Restart=always) vuelve a levantar el proceso con el código nuevo
  setTimeout(() => process.exit(0), 800);
  return true;
}

export async function apply() {
  if (busy) throw fail('Ya hay una actualización en curso', 409);
  busy = true;
  try {
    const info = await check({ refresh: true });
    if (!info.supported) throw fail(info.reason || 'Actualización no disponible');
    if (info.error) throw fail(`No se pudo consultar GitHub: ${info.error}`);
    if (info.dirty) throw fail('Hay cambios locales sin confirmar en la instalación; no se puede actualizar automáticamente');
    if (!info.behind) throw fail('Ya tienes la última versión');
    const prev = (await git.run(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
    const branch = config.updateBranch;
    await git.run(['merge', '--ff-only', `origin/${branch}`], { cwd });
    const changed = (await git.run(['diff', '--name-only', prev, 'HEAD'], { cwd })).stdout.split('\n');
    try {
      if (changed.some((f) => f === 'package.json' || f === 'package-lock.json')) await npmCi();
    } catch (e) {
      await git.run(['reset', '--hard', prev], { cwd });
      throw e;
    }
    store.save('update', { prev, appliedAt: new Date().toISOString() });
    cache = null;
    const to = (await git.run(['rev-parse', '--short', 'HEAD'], { cwd })).stdout.trim();
    return { ok: true, from: prev.slice(0, 7), to, restarting: scheduleRestart(), commits: info.commits.length };
  } finally {
    busy = false;
  }
}

export async function rollback() {
  const prev = state().prev;
  if (!prev) throw fail('No hay versión anterior registrada');
  if (busy) throw fail('Ya hay una actualización en curso', 409);
  busy = true;
  try {
    const now = (await git.run(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
    await git.run(['reset', '--hard', prev], { cwd });
    const changed = (await git.run(['diff', '--name-only', now, prev], { cwd })).stdout.split('\n');
    if (changed.some((f) => f === 'package.json' || f === 'package-lock.json')) await npmCi();
    store.save('update', {});
    cache = null;
    return { ok: true, to: prev.slice(0, 7), restarting: scheduleRestart() };
  } finally {
    busy = false;
  }
}

export function startPeriodicCheck(everyMs = 6 * 3600_000) {
  setTimeout(() => check().catch(() => {}), 30_000).unref();
  setInterval(() => check().catch(() => {}), everyMs).unref();
}
