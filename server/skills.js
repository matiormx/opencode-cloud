// Habilidades (skills) de OpenCode: carpetas con un SKILL.md que el modelo carga cuando la tarea lo pide.
// Se descargan de un repositorio de GitHub y se instalan en el espacio del usuario (~/.config/opencode/skills),
// que es donde OpenCode las busca. No hace falta root. Cada usuario del modo multiusuario tiene las suyas.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as git from './git.js';
import * as store from './store.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export const dir = () => process.env.SKILLS_DIR || path.join(os.homedir(), '.config', 'opencode', 'skills');

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_BYTES = 3 * 1024 * 1024; // por skill
const MAX_FILES = 300;
const MAX_SKILLS = 100;
const SCAN_DEPTH = 4;
const TTL = 10 * 60_000;

const sessions = new Map(); // id → { at, root, repo, sha, skills }
let busy = false;

function sweep() {
  for (const [id, s] of sessions) {
    if (Date.now() - s.at > TTL) {
      fs.rmSync(s.tmp, { recursive: true, force: true });
      sessions.delete(id);
    }
  }
}

// «usuario/repo», «https://github.com/usuario/repo» o con .git/tree/rama al final → { owner, repo, url, label }
export function parseRepo(input) {
  let t = String(input || '').trim();
  if (!t) throw fail('Escribe el repositorio, por ejemplo usuario/repositorio');
  t = t.replace(/^https?:\/\/github\.com\//i, '').replace(/^github\.com\//i, '');
  const m = t.match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?(?:\/.*)?$/);
  if (!m || m[2] === '.' || m[2] === '..') throw fail('Formato no válido. Usa usuario/repositorio o la URL de GitHub');
  return { owner: m[1], repo: m[2], url: `https://github.com/${m[1]}/${m[2]}.git`, label: `${m[1]}/${m[2]}` };
}

// Frontmatter mínimo de un SKILL.md: name, description (también en bloque > o |)
export function parseFrontmatter(text) {
  const m = String(text).replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^[>|][+-]?$/.test(v)) {
      const parts = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === '')) parts.push(lines[++i].trim());
      v = parts.filter(Boolean).join(' ');
    } else if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
    out[kv[1]] = v;
  }
  return out;
}

function findSkillDirs(root) {
  const found = [];
  const walk = (d, depth) => {
    if (found.length >= MAX_SKILLS) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) { found.push(d); return; }
    if (depth >= SCAN_DEPTH) return;
    for (const e of entries) {
      if (e.isDirectory() && !e.isSymbolicLink() && e.name !== '.git' && e.name !== 'node_modules') walk(path.join(d, e.name), depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

// Lista los ficheros de una skill (sin enlaces simbólicos) y comprueba los límites
function collect(src) {
  const files = [];
  let bytes = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        bytes += fs.statSync(p).size;
        files.push(p);
        if (files.length > MAX_FILES) throw fail(`La skill tiene demasiados ficheros (máximo ${MAX_FILES})`);
        if (bytes > MAX_BYTES) throw fail('La skill es demasiado grande (máximo 3 MB)');
      }
    }
  };
  walk(src);
  return { files, bytes };
}

export function installed() {
  const base = dir();
  const rec = store.load('skills', { installed: {} }).installed || {};
  let names = [];
  try { names = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && NAME_RE.test(e.name)).map((e) => e.name); } catch { /* aún no existe */ }
  const out = [];
  for (const name of names) {
    let fm = null;
    try { fm = parseFrontmatter(fs.readFileSync(path.join(base, name, 'SKILL.md'), 'utf8')); } catch { continue; }
    out.push({ name, description: String(fm?.description || '').slice(0, 300), source: rec[name]?.repo || null, at: rec[name]?.at || 0 });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function changedAt() {
  return Number(store.load('skills', {}).changedAt) || 0;
}

// Descarga el repositorio a una carpeta temporal y devuelve las skills que contiene (no instala nada)
export async function discover(repoInput) {
  const r = parseRepo(repoInput);
  if (busy) throw fail('Hay otra descarga en curso, espera un momento', 409);
  busy = true;
  sweep();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'occ-skills-'));
  try {
    const root = path.join(tmp, 'repo');
    try {
      await git.run(['-c', 'core.symlinks=false', 'clone', '--depth', '1', '--no-tags', '--single-branch', r.url, root], { net: true, url: r.url, timeout: 90_000 });
    } catch (e) {
      const m = String(e.message);
      if (/could not read Username|not found|Authentication failed|Invalid username/i.test(m)) throw fail(`No se encontró ${r.label}. Revisa el nombre; si es privado, conecta tu GitHub en Ajustes → Conexiones.`);
      throw fail(`No se pudo descargar ${r.label}: ${m.split('\n').pop().slice(0, 200)}`);
    }
    const sha = (await git.run(['rev-parse', '--short', 'HEAD'], { cwd: root, allowFail: true })).stdout.trim();
    const have = new Set(installed().map((s) => s.name));
    const skills = [];
    const seen = new Set();
    for (const d of findSkillDirs(root)) {
      let fm;
      try { fm = parseFrontmatter(fs.readFileSync(path.join(d, 'SKILL.md'), 'utf8')); } catch { continue; }
      const name = String(fm?.name || '').trim();
      if (!NAME_RE.test(name) || name.length > 64 || !fm?.description || seen.has(name)) continue;
      let info;
      try { info = collect(d); } catch { continue; }
      seen.add(name);
      skills.push({ name, description: String(fm.description).slice(0, 300), path: path.relative(root, d) || '.', files: info.files.length, kb: Math.max(1, Math.round(info.bytes / 1024)), installed: have.has(name) });
    }
    if (!skills.length) throw fail(`No se encontró ninguna skill (carpeta con SKILL.md) en ${r.label}`);
    skills.sort((a, b) => a.name.localeCompare(b.name));
    const id = crypto.randomBytes(8).toString('hex');
    sessions.set(id, { at: Date.now(), tmp, root, repo: r.label, sha, skills });
    return { id, repo: r.label, sha, skills };
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  } finally {
    busy = false;
  }
}

function copyOne(session, sk) {
  const src = path.resolve(session.root, sk.path);
  if (src !== session.root && !src.startsWith(session.root + path.sep)) throw fail('Ruta no válida');
  const { files } = collect(src);
  const base = dir();
  fs.mkdirSync(base, { recursive: true, mode: 0o755 });
  const staging = fs.mkdtempSync(path.join(base, '.tmp-'));
  try {
    for (const f of files) {
      const rel = path.relative(src, f);
      const dst = path.join(staging, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(f, dst);
    }
    const final = path.join(base, sk.name);
    fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(staging, final);
    fs.chmodSync(final, 0o755);
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
}

export function install(id, names) {
  const s = sessions.get(String(id || ''));
  if (!s) throw fail('La descarga caducó. Vuelve a buscar el repositorio', 410);
  if (!Array.isArray(names) || !names.length) throw fail('Marca al menos una skill');
  const rec = store.load('skills', { installed: {} });
  rec.installed ||= {};
  const done = [];
  const skipped = [];
  for (const name of [...new Set(names.map(String))].slice(0, MAX_SKILLS)) {
    const sk = s.skills.find((x) => x.name === name);
    if (!sk) { skipped.push({ name, reason: 'no está en el repositorio' }); continue; }
    try {
      copyOne(s, sk);
      rec.installed[name] = { repo: s.repo, path: sk.path, sha: s.sha, at: Date.now() };
      done.push(name);
    } catch (e) { skipped.push({ name, reason: e.message }); }
  }
  if (done.length) { rec.changedAt = Date.now(); store.save('skills', rec); }
  return { installed: done, skipped };
}

export function remove(name) {
  if (!NAME_RE.test(String(name))) throw fail('Nombre no válido');
  const target = path.join(dir(), name);
  if (!fs.existsSync(target)) throw fail('No está instalada', 404);
  fs.rmSync(target, { recursive: true, force: true });
  const rec = store.load('skills', { installed: {} });
  if (rec.installed) delete rec.installed[name];
  rec.changedAt = Date.now();
  store.save('skills', rec);
}

// Vuelve a descargar un repositorio e instala de nuevo las skills que vinieron de él
export async function update(repoInput) {
  const r = parseRepo(repoInput);
  const rec = store.load('skills', { installed: {} });
  const mine = Object.entries(rec.installed || {}).filter(([, v]) => v.repo === r.label).map(([k]) => k);
  if (!mine.length) throw fail('No hay skills instaladas desde ese repositorio');
  const d = await discover(repoInput);
  const res = install(d.id, mine);
  const missing = mine.filter((n) => !d.skills.some((x) => x.name === n));
  closeSession(d.id);
  return { ...res, missing, sha: d.sha };
}

export function closeSession(id) {
  const s = sessions.get(String(id || ''));
  if (!s) return;
  fs.rmSync(s.tmp, { recursive: true, force: true });
  sessions.delete(String(id));
}
