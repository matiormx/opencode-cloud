// Vista previa: ver dentro de la app lo que OpenCode está construyendo (un servidor de desarrollo que haya arrancado o la
// carpeta del proyecto servida tal cual), sin abrir puertos al exterior.
//
// Cómo funciona y límites de seguridad:
//  - Se sirve en /preview/<destino>/… y exige tu sesión (cookie SameSite=Strict, como el resto de la app). El destino es un puerto
//    (3000, 5173…) o sXXXX = la carpeta del proyecto XXXX.
//  - Solo se llega a puertos que escuchan en 127.0.0.1 y pertenecen al mismo usuario de Linux que la instancia (se lee /proc/net/tcp),
//    nunca a los de la propia app, de OpenCode ni a los de otros usuarios. En multiusuario la pasarela solo reenvía a TU instancia.
//  - Al servidor del proyecto no se le envían tus cookies ni se aceptan las suyas (se quitan Cookie y Set-Cookie).
//  - Las rutas absolutas del proyecto (/assets/app.js, fetch('/api/x')…) se resuelven por la cabecera Referer de la propia vista previa.
//  - El proyecto se ejecuta en el navegador con el mismo origen que la app: previsualiza solo código en el que confíes.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import * as auth from './auth.js';
import { config } from './config.js';
import * as instances from './instances.js';
import * as users from './users.js';

const TARGET = '(s[0-9a-f]{4,16}|\\d{1,5})'; // puerto, o sXXXX = carpeta del proyecto XXXX
const PATH_RE = new RegExp(`^/preview/${TARGET}(/.*)?$`);
const INNER_RE = new RegExp(`^/_preview/${TARGET}(/.*)?$`);
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length']);

let projectDirOf = () => null;
export const init = (fn) => { projectDirOf = fn; };

// ---------- puertos del usuario ----------
function listening() {
  const uid = process.getuid?.();
  const found = new Map(); // puerto → host
  for (const [file, v6] of [['/proc/net/tcp', false], ['/proc/net/tcp6', true]]) {
    let t;
    try { t = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of t.split('\n').slice(1)) {
      const c = line.trim().split(/\s+/);
      if (c.length < 8 || c[3] !== '0A' || Number(c[7]) !== uid) continue;
      const [ip, hp] = c[1].split(':');
      const port = parseInt(hp, 16);
      let host = '';
      if (!v6) host = ip === '0100007F' || ip === '00000000' ? '127.0.0.1' : '';
      else if (/^0{32}$/.test(ip) || ip === '0000000000000000FFFF00000100007F') host = '127.0.0.1';
      else if (ip === '00000000000000000000000001000000') host = '::1';
      if (!host || !port) continue;
      if (found.get(port) !== '127.0.0.1') found.set(port, host);
    }
  }
  found.delete(config.port);
  found.delete(config.opencodePort);
  return found;
}

function probe(port, host) {
  return new Promise((resolve) => {
    const r = http.get({ host, port, path: '/', timeout: 900, headers: { host: `localhost:${port}`, 'accept-encoding': 'identity' } }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    r.on('timeout', () => { r.destroy(); resolve(0); });
    r.on('error', () => resolve(0));
  });
}

// Servidores web que hay en marcha ahora mismo (los demás puertos del usuario, como bases de datos, no se muestran)
export async function ports() {
  const rows = await Promise.all([...listening()].map(async ([port, host]) => ({ port, host, status: await probe(port, host) })));
  return rows.filter((r) => r.status > 0).sort((a, b) => a.port - b.port).map(({ port, status }) => ({ port, status }));
}

export function hasIndex(projectId) {
  const dir = projectId ? projectDirOf(projectId) : null;
  return Boolean(dir) && fs.existsSync(path.join(dir, 'index.html'));
}

// ---------- servir ----------
const MIME = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', map: 'application/json', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf', xml: 'application/xml', wasm: 'application/wasm', webmanifest: 'application/manifest+json' };

// Cabeceras propias de la vista previa: sin las globales de la app (que prohíben iframes y scripts en línea) y con
// Referer solo hacia el mismo origen (así no se filtra la dirección a terceros, pero las rutas absolutas siguen resolviéndose)
function previewHeaders(res, type) {
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (type) res.setHeader('Content-Type', type);
}

const plain = (res, code, text) => { if (!res.headersSent) { previewHeaders(res, 'text/plain; charset=utf-8'); res.status(code); } res.end(text); };

function serveStatic(req, res, id, rest) {
  const dir = projectDirOf(id.slice(1));
  if (!dir) return plain(res, 404, 'Proyecto no encontrado');
  let pathname;
  try { pathname = decodeURIComponent(new URL(rest, 'http://x').pathname); } catch { return plain(res, 400, 'Ruta no válida'); }
  if (pathname.split('/').some((s) => s === '..' || s.startsWith('.'))) return plain(res, 404, 'No encontrado');
  let real;
  try {
    const root = fs.realpathSync(dir);
    let f = path.join(root, pathname);
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    real = fs.realpathSync(f);
    if (real !== root && !real.startsWith(root + path.sep)) return plain(res, 404, 'No encontrado'); // enlace simbólico hacia fuera
    if (!fs.statSync(real).isFile()) return plain(res, 404, 'No encontrado');
  } catch { return plain(res, 404, 'No encontrado: no hay ningún archivo en esa ruta del proyecto'); }
  previewHeaders(res, MIME[path.extname(real).slice(1).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(real).on('error', () => res.destroy()).pipe(res);
}

const STRIP = new Set(['set-cookie', 'content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'referrer-policy', 'strict-transport-security']);

function serveProxy(req, res, port, rest, prefix) {
  const host = listening().get(port);
  if (!host) return plain(res, 502, `No hay ningún servidor escuchando en el puerto ${port}. Pídele a OpenCode que lo arranque.`);
  const headers = {};
  for (const [h, v] of Object.entries(req.headers)) {
    if (HOP.has(h) || h === 'cookie' || h === 'referer' || h.startsWith('x-oc-') || h.startsWith('x-forwarded')) continue;
    headers[h] = v;
  }
  headers.host = `localhost:${port}`; // los servidores de desarrollo (Vite…) rechazan hosts desconocidos
  if (headers.origin) headers.origin = `http://localhost:${port}`;
  if (req.headers['content-length']) headers['content-length'] = req.headers['content-length'];
  if (req.headers['transfer-encoding']) headers['transfer-encoding'] = req.headers['transfer-encoding'];
  let up;
  try {
    up = http.request({ host, port, method: req.method, path: rest, headers }, (pr) => {
      const out = {};
      for (const [h, v] of Object.entries(pr.headers)) if (!HOP.has(h) && !STRIP.has(h)) out[h] = v;
      if (out.location) { // redirecciones a localhost:puerto o a una ruta absoluta → de nuevo dentro de la vista previa
        const base = prefix.replace(/\/$/, '');
        out.location = String(out.location).replace(new RegExp(`^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${port}(?=/|$)`), base);
        if (out.location.startsWith('/') && !out.location.startsWith(`${base}/`)) out.location = base + out.location;
      }
      out['referrer-policy'] = 'same-origin';
      out['cache-control'] = 'no-store';
      res.writeHead(pr.statusCode || 502, out);
      pr.pipe(res);
      pr.on('error', () => res.destroy());
    });
  } catch { return plain(res, 400, 'Petición no válida'); }
  up.on('error', () => plain(res, 502, `El servidor del puerto ${port} no responde.`));
  res.on('close', () => up.destroy());
  req.pipe(up);
}

// Atiende un destino (puerto o carpeta del proyecto) del usuario de esta instancia
function serveLocal(req, res, target, rest, prefix) {
  if (target[0] === 's') return serveStatic(req, res, target, rest);
  return serveProxy(req, res, Number(target), rest, prefix);
}

function parse(req) {
  const url = req.originalUrl || req.url;
  const q = url.indexOf('?');
  const pathname = q < 0 ? url : url.slice(0, q);
  const search = q < 0 ? '' : url.slice(q);
  let m = PATH_RE.exec(pathname);
  if (m) return { target: m[1], rest: (m[2] || '/') + search, bare: !m[2], search };
  const ref = req.headers.referer;
  if (!ref) return null;
  try {
    const r = new URL(ref);
    if (r.host !== req.headers.host) return null;
    m = PATH_RE.exec(r.pathname);
    if (m) return { target: m[1], rest: url };
  } catch { /* sin Referer válido */ }
  return null;
}

// Pasarela (multiusuario) o app de un solo usuario: reconoce /preview/… (y las peticiones cuyo Referer es una vista previa)
export function intercept(req, res, next) {
  if (config.instance || req.adminCtx) return next();
  const t = parse(req);
  if (!t) return next();
  const prefix = `/preview/${t.target}/`;
  if (t.bare) return res.redirect(302, prefix + t.search);
  const info = auth.sessionInfo(req);
  if (!info) return plain(res, 401, 'Inicia sesión en la app para ver la vista previa.');
  if (!config.multiuser) return serveLocal(req, res, t.target, t.rest, prefix);
  const name = info.user;
  if (!name) return plain(res, 403, 'El administrador no tiene espacio de trabajo.');
  if (!users.isActive(name)) return plain(res, 403, 'Usuario no disponible');
  const k = instances.keys(name);
  if (!k) return plain(res, 503, 'Tu espacio todavía no está preparado');
  const headers = {};
  for (const [h, v] of Object.entries(req.headers)) {
    if (HOP.has(h) || h === 'cookie' || h.startsWith('x-oc-')) continue;
    headers[h] = v;
  }
  headers['x-oc-gateway'] = k.secret;
  headers['x-oc-user'] = name;
  headers['x-oc-prefix'] = prefix;
  if (req.headers['content-length']) headers['content-length'] = req.headers['content-length'];
  if (req.headers['transfer-encoding']) headers['transfer-encoding'] = req.headers['transfer-encoding'];
  let up;
  try {
    up = http.request({ host: '127.0.0.1', port: k.port, method: req.method, path: `/_preview/${t.target}${t.rest}`, headers }, (pr) => {
      const out = {};
      for (const [h, v] of Object.entries(pr.headers)) if (!HOP.has(h)) out[h] = v;
      res.writeHead(pr.statusCode || 502, out);
      pr.pipe(res);
      pr.on('error', () => res.destroy());
    });
  } catch { return plain(res, 400, 'Petición no válida'); }
  up.on('error', () => plain(res, 503, 'Tu espacio se está iniciando… inténtalo en unos segundos.'));
  res.on('close', () => up.destroy());
  req.pipe(up);
}

// Instancia de un usuario: solo atiende lo que llega de la pasarela (con su secreto)
export function instanceServe(req, res, next) {
  if (!config.instance || !req.url.startsWith('/_preview/')) return next();
  if (!auth.fromGateway(req)) return res.status(404).end();
  const url = req.url;
  const q = url.indexOf('?');
  const m = INNER_RE.exec(q < 0 ? url : url.slice(0, q));
  if (!m) return res.status(404).end();
  serveLocal(req, res, m[1], (m[2] || '/') + (q < 0 ? '' : url.slice(q)), `/preview/${m[1]}/`);
}
