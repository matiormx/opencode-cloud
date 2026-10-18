import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import * as store from './store.js';

const ASKPASS = path.join(config.root, 'bin', 'git-askpass.sh');
try {
  fs.chmodSync(ASKPASS, 0o755);
} catch {
  /* se ignora: puede ser solo lectura */
}

const fail = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, ...extra });

export function redact(text) {
  const token = store.getSettings().githubToken;
  let out = String(text || '');
  if (token) out = out.split(token).join('***');
  return out.replace(/(https?:\/\/)[^@\s/]+@/g, '$1***@');
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isAllowedRemote(url) {
  return /^https:\/\//i.test(url) && config.gitHosts.includes(hostOf(url));
}

export function validateRemoteUrl(url) {
  if (typeof url !== 'string' || !isAllowedRemote(url.trim())) {
    throw fail(`Solo se admiten URLs https:// de: ${config.gitHosts.join(', ')}`);
  }
  return url.trim();
}

export function validateBranch(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(name) || name.includes('..') || name.endsWith('/') || name.endsWith('.lock')) {
    throw fail('Nombre de rama no válido');
  }
  return name;
}

/**
 * Ejecuta git sin shell. Con `net: true` inyecta el token de GitHub vía GIT_ASKPASS,
 * pero solo si el remoto apunta a un host permitido (el token nunca se envía a otros hosts).
 */
export async function run(args, { cwd, net = false, url, timeout = 60_000, allowFail = false } = {}) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', LC_ALL: 'C' };
  const prefix = [];
  if (net) {
    prefix.push('-c', 'credential.helper=');
    let target = url;
    if (!target && cwd) {
      const r = await run(['remote', 'get-url', 'origin'], { cwd, allowFail: true });
      target = r.stdout.trim();
    }
    const token = store.getSettings().githubToken;
    if (token && target && isAllowedRemote(target)) {
      env.GIT_ASKPASS = ASKPASS;
      env.GIT_TOKEN = token;
    }
  }
  return new Promise((resolve, reject) => {
    execFile('git', [...prefix, ...args], { cwd, env, timeout, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      const res = { code, stdout: redact(stdout), stderr: redact(stderr) };
      if (code !== 0 && !allowFail) {
        const msg = (res.stderr || res.stdout || err.message).trim();
        return reject(fail(msg || 'Error de git', 400, { output: msg }));
      }
      resolve(res);
    });
  });
}

export async function isRepo(cwd) {
  const r = await run(['rev-parse', '--is-inside-work-tree'], { cwd, allowFail: true });
  return r.code === 0 && r.stdout.trim() === 'true';
}

export async function configureIdentity(cwd) {
  const { gitName, gitEmail } = store.getSettings();
  await run(['config', 'user.name', gitName], { cwd });
  await run(['config', 'user.email', gitEmail], { cwd });
}

export async function init(cwd) {
  await run(['init', '-b', 'main'], { cwd });
  await configureIdentity(cwd);
  // Un primer commit vacío hace que OpenCode trate el directorio como proyecto git (diffs, snapshots)
  await run(['commit', '--allow-empty', '-m', 'Commit inicial'], { cwd });
}

export async function clone(url, dir, branch) {
  validateRemoteUrl(url);
  const args = ['clone'];
  if (branch) args.push('--branch', validateBranch(branch));
  args.push('--', url, dir);
  await run(args, { net: true, url, timeout: 15 * 60_000 });
  await configureIdentity(dir);
}

const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

export async function status(cwd) {
  const r = await run(['status', '--porcelain=v1', '-b', '-uall'], { cwd });
  const lines = r.stdout.split('\n').filter(Boolean);
  let head = (lines.shift() || '').replace(/^## /, '');
  let ahead = 0;
  let behind = 0;
  const ab = head.match(/ \[(.*)\]$/);
  if (ab) {
    ahead = Number(ab[1].match(/ahead (\d+)/)?.[1] || 0);
    behind = Number(ab[1].match(/behind (\d+)/)?.[1] || 0);
    head = head.slice(0, ab.index);
  }
  head = head.replace(/^No commits yet on /, '').replace(/^Initial commit on /, '');
  const [branch, upstream = null] = head.split('...');
  const files = lines.map((l) => ({ xy: l.slice(0, 2), path: l.slice(3) }));
  const conflicts = files.filter((f) => CONFLICT_CODES.has(f.xy)).map((f) => f.path);
  const remote = (await run(['remote', 'get-url', 'origin'], { cwd, allowFail: true })).stdout.trim() || null;
  const merging = fs.existsSync(path.join(cwd, '.git', 'MERGE_HEAD'));
  const hasCommits = (await run(['rev-parse', '--verify', 'HEAD'], { cwd, allowFail: true })).code === 0;
  return { branch, upstream, ahead, behind, files, conflicts, remote, merging, hasCommits };
}

export async function branches(cwd) {
  const r = await run(['for-each-ref', '--format=%(refname)%09%(refname:short)', 'refs/heads', 'refs/remotes'], { cwd });
  const local = [];
  const remote = [];
  for (const line of r.stdout.split('\n').filter(Boolean)) {
    const [ref, short] = line.split('\t');
    if (ref.startsWith('refs/heads/')) local.push(short);
    else if (ref.startsWith('refs/remotes/') && !ref.endsWith('/HEAD')) remote.push(short.replace(/^origin\//, ''));
  }
  return { local, remote: remote.filter((b) => !local.includes(b)) };
}

export async function log(cwd, n = 20) {
  const r = await run(['log', `-n${n}`, '--pretty=format:%h%x1f%s%x1f%an%x1f%cr'], { cwd, allowFail: true });
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, subject, author, when] = l.split('\x1f');
      return { hash, subject, author, when };
    });
}

export const fetchAll = (cwd) => run(['fetch', '--prune', 'origin'], { cwd, net: true, timeout: 5 * 60_000 });
export const push = (cwd) => run(['push', '-u', 'origin', 'HEAD'], { cwd, net: true, timeout: 5 * 60_000 });

export async function commitAll(cwd, message) {
  if (!message || !message.trim()) throw fail('Escribe un mensaje de commit');
  await configureIdentity(cwd);
  await run(['add', '-A'], { cwd });
  const r = await run(['commit', '-m', message.trim()], { cwd, allowFail: true });
  if (r.code !== 0) {
    if (/nothing to commit/i.test(r.stdout + r.stderr)) throw fail('No hay cambios que confirmar');
    throw fail((r.stderr || r.stdout).trim());
  }
  return r.stdout;
}

export async function checkout(cwd, branch, create = false) {
  validateBranch(branch);
  return run(create ? ['checkout', '-b', branch] : ['checkout', branch], { cwd });
}

async function mergeLike(cwd, args, net) {
  await configureIdentity(cwd);
  const r = await run(args, { cwd, net, allowFail: true, timeout: 5 * 60_000 });
  const merging = fs.existsSync(path.join(cwd, '.git', 'MERGE_HEAD'));
  if (r.code === 0) return { ok: true, conflict: false, output: (r.stdout + r.stderr).trim() };
  if (merging) {
    const st = await status(cwd);
    return { ok: false, conflict: true, conflicts: st.conflicts, output: (r.stdout + r.stderr).trim() };
  }
  throw fail((r.stderr || r.stdout).trim() || 'Error de git', 400);
}

export const pull = (cwd) => mergeLike(cwd, ['pull', '--no-rebase', '--no-edit'], true);
export const merge = (cwd, branch) => mergeLike(cwd, ['merge', '--no-edit', validateBranch(branch)], false);
export const mergeAbort = (cwd) => run(['merge', '--abort'], { cwd });

export async function setRemote(cwd, url) {
  validateRemoteUrl(url);
  const has = (await run(['remote', 'get-url', 'origin'], { cwd, allowFail: true })).code === 0;
  await run(has ? ['remote', 'set-url', 'origin', url] : ['remote', 'add', 'origin', url], { cwd });
}

export function parseGithubRepo(url) {
  const m = String(url || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}
