import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import express from 'express';
import * as auth from './auth.js';
import { config } from './config.js';
import * as git from './git.js';
import * as gh from './github.js';
import * as oc from './opencode.js';
import * as store from './store.js';
import * as updater from './updater.js';

const fsp = fs.promises;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  next();
});

app.use(
  express.static(path.join(config.root, 'public'), {
    setHeaders(res, file) {
      // El service worker y el manifest deben revalidarse siempre para que las actualizaciones lleguen
      if (/[\\/](sw\.js|manifest\.webmanifest)$/.test(file)) {
        res.setHeader('Cache-Control', 'no-cache');
        if (file.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
      } else if (/[\\/]icons[\\/]/.test(file)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }),
);
app.use('/api', auth.csrf);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const router = express.Router();

// ---------- Público ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/me', (req, res) => {
  res.json({ authenticated: auth.isAuthenticated(req), passwordSet: auth.hasPassword() });
});

app.post(
  '/api/login',
  wrap(async (req, res) => {
    if (!auth.hasPassword()) throw fail('No hay contraseña configurada. Ejecuta: node bin/set-password.js', 409);
    auth.checkRate(req.ip);
    const ok = await auth.verifyPassword(req.body?.password);
    if (!ok) {
      auth.registerFailure(req.ip);
      throw fail('Contraseña incorrecta', 401);
    }
    auth.clearFailures(req.ip);
    auth.setCookie(res, auth.createSession());
    res.json({ ok: true });
  }),
);

app.post('/api/logout', (req, res) => {
  auth.destroySession(req);
  auth.clearCookie(res);
  res.json({ ok: true });
});

// ---------- Protegido ----------
app.use('/api', auth.requireAuth, router);

// --- Ajustes ---
const publicSettings = () => {
  const s = store.getSettings();
  return { githubTokenSet: Boolean(s.githubToken), gitName: s.gitName, gitEmail: s.gitEmail, ocPermission: config.ocPermission };
};

router.get('/settings', (req, res) => res.json(publicSettings()));

router.put(
  '/settings',
  wrap(async (req, res) => {
    const { gitName, gitEmail } = req.body || {};
    const patch = {};
    if (typeof gitName === 'string' && gitName.trim()) patch.gitName = gitName.trim().slice(0, 100);
    if (typeof gitEmail === 'string' && /^[^\s@]+@[^\s@]+$/.test(gitEmail.trim())) patch.gitEmail = gitEmail.trim().slice(0, 200);
    store.updateSettings(patch);
    res.json(publicSettings());
  }),
);

router.put(
  '/github/token',
  wrap(async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!/^[A-Za-z0-9_\-.]{20,255}$/.test(token)) throw fail('El token no tiene un formato válido');
    const previous = store.getSettings().githubToken;
    store.updateSettings({ githubToken: token });
    try {
      const me = await gh.whoami();
      res.json({ ok: true, login: me.login });
    } catch (e) {
      store.updateSettings({ githubToken: previous });
      throw fail(`GitHub rechazó el token: ${e.message}`);
    }
  }),
);

router.delete('/github/token', (req, res) => {
  store.updateSettings({ githubToken: '' });
  res.json({ ok: true });
});

router.get(
  '/github/status',
  wrap(async (req, res) => {
    if (!store.getSettings().githubToken) return res.json({ connected: false });
    try {
      const me = await gh.whoami();
      res.json({ connected: true, login: me.login, avatar: me.avatar_url });
    } catch (e) {
      res.json({ connected: false, error: e.message });
    }
  }),
);

router.get('/github/repos', wrap(async (req, res) => res.json(await gh.listRepos())));

router.put(
  '/password',
  wrap(async (req, res) => {
    const { current, next } = req.body || {};
    if (!(await auth.verifyPassword(current))) throw fail('La contraseña actual no es correcta', 403);
    await auth.setPassword(next);
    auth.setCookie(res, auth.createSession());
    res.json({ ok: true });
  }),
);

// --- Proyectos ---
const loadProjects = () => store.load('projects', []);
const saveProjects = (list) => store.save('projects', list);
const withPath = (p) => ({ ...p, path: path.join(config.projectsDir, p.dir) });

function getProject(req) {
  const p = loadProjects().find((x) => x.id === req.params.id);
  if (!p) throw fail('Proyecto no encontrado', 404);
  return withPath(p);
}

const slugify = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'proyecto';

function uniqueDir(base) {
  let dir = base;
  let i = 2;
  while (fs.existsSync(path.join(config.projectsDir, dir))) dir = `${base}-${i++}`;
  return dir;
}

router.get('/projects', (req, res) => {
  res.json(loadProjects().map(({ id, name, createdAt, remote }) => ({ id, name, createdAt, remote })));
});

router.post(
  '/projects',
  wrap(async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const cloneUrl = req.body?.cloneUrl ? git.validateRemoteUrl(String(req.body.cloneUrl)) : null;
    const branch = req.body?.branch ? String(req.body.branch) : undefined;
    const repoName = cloneUrl ? git.parseGithubRepo(cloneUrl)?.repo : null;
    const finalName = name || repoName;
    if (!finalName) throw fail('Indica un nombre para el proyecto');

    const dir = uniqueDir(slugify(finalName));
    const full = path.join(config.projectsDir, dir);
    try {
      if (cloneUrl) {
        await git.clone(cloneUrl, full, branch);
      } else {
        fs.mkdirSync(full, { recursive: true });
        await git.init(full);
      }
    } catch (e) {
      fs.rmSync(full, { recursive: true, force: true });
      throw e;
    }
    const project = { id: crypto.randomUUID().slice(0, 8), name: finalName, dir, createdAt: new Date().toISOString(), remote: cloneUrl };
    saveProjects([...loadProjects(), project]);
    res.status(201).json({ id: project.id, name: project.name, createdAt: project.createdAt, remote: project.remote });
  }),
);

router.patch(
  '/projects/:id',
  wrap(async (req, res) => {
    const list = loadProjects();
    const p = list.find((x) => x.id === req.params.id);
    if (!p) throw fail('Proyecto no encontrado', 404);
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) throw fail('Nombre no válido');
    p.name = name;
    saveProjects(list);
    res.json({ ok: true });
  }),
);

router.delete(
  '/projects/:id',
  wrap(async (req, res) => {
    const p = getProject(req);
    saveProjects(loadProjects().filter((x) => x.id !== p.id));
    if (req.query.files === '1') {
      // Defensa: solo se borra si la ruta está estrictamente dentro de projectsDir
      const rel = path.relative(config.projectsDir, p.path);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) fs.rmSync(p.path, { recursive: true, force: true });
    }
    res.json({ ok: true });
  }),
);

// --- Git ---
const gitRoute = (fn) =>
  wrap(async (req, res) => {
    const p = getProject(req);
    res.json(await fn(p.path, req, p));
  });

router.get('/projects/:id/git/status', gitRoute((cwd) => git.status(cwd)));
router.get(
  '/projects/:id/git/overview',
  gitRoute(async (cwd) => ({ status: await git.status(cwd), branches: await git.branches(cwd), log: await git.log(cwd) })),
);
router.post('/projects/:id/git/fetch', gitRoute(async (cwd) => ({ output: (await git.fetchAll(cwd)).stderr.trim() })));
router.post('/projects/:id/git/pull', gitRoute((cwd) => git.pull(cwd)));
router.post('/projects/:id/git/push', gitRoute(async (cwd) => ({ output: (await git.push(cwd)).stderr.trim() })));
router.post('/projects/:id/git/commit', gitRoute(async (cwd, req) => ({ output: await git.commitAll(cwd, req.body?.message) })));
router.post(
  '/projects/:id/git/checkout',
  gitRoute(async (cwd, req) => {
    await git.checkout(cwd, req.body?.branch, Boolean(req.body?.create));
    return { ok: true };
  }),
);
router.post('/projects/:id/git/merge', gitRoute((cwd, req) => git.merge(cwd, req.body?.branch)));
router.post(
  '/projects/:id/git/merge/abort',
  gitRoute(async (cwd) => {
    await git.mergeAbort(cwd);
    return { ok: true };
  }),
);
router.put(
  '/projects/:id/git/remote',
  wrap(async (req, res) => {
    const p = getProject(req);
    await git.setRemote(p.path, req.body?.url);
    const list = loadProjects();
    const item = list.find((x) => x.id === p.id);
    item.remote = req.body.url.trim();
    saveProjects(list);
    res.json({ ok: true });
  }),
);

// --- Pull requests de GitHub ---
async function repoOf(req) {
  const p = getProject(req);
  const remote = (await git.run(['remote', 'get-url', 'origin'], { cwd: p.path, allowFail: true })).stdout.trim();
  const repo = git.parseGithubRepo(remote);
  if (!repo) throw fail('El remoto "origin" de este proyecto no es un repositorio de GitHub');
  return repo;
}

router.get('/projects/:id/github/pulls', wrap(async (req, res) => {
  const { owner, repo } = await repoOf(req);
  res.json(await gh.listPulls(owner, repo));
}));

router.post('/projects/:id/github/pulls', wrap(async (req, res) => {
  const { owner, repo } = await repoOf(req);
  const { title, body, head, base } = req.body || {};
  if (!title || !head || !base) throw fail('Faltan título, rama origen o rama destino');
  res.json(await gh.createPull(owner, repo, { title: String(title), body: String(body || ''), head: git.validateBranch(head), base: git.validateBranch(base) }));
}));

router.post('/projects/:id/github/pulls/:number/merge', wrap(async (req, res) => {
  const { owner, repo } = await repoOf(req);
  res.json(await gh.mergePull(owner, repo, Number(req.params.number), req.body?.method));
}));

// --- Chat (proxy hacia OpenCode, siempre acotado al directorio del proyecto) ---
const SID = /^[A-Za-z0-9_-]{1,100}$/;
const sid = (req) => {
  if (!SID.test(req.params.sid)) throw fail('Sesión no válida');
  return req.params.sid;
};
const ocRoute = (fn) =>
  wrap(async (req, res) => {
    const p = getProject(req);
    res.json(await fn(p.path, req));
  });

router.get(
  '/projects/:id/sessions',
  ocRoute(async (dir) => {
    const list = await oc.json('GET', '/session', { directory: dir });
    return (Array.isArray(list) ? list : []).filter((s) => !s.parentID).sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
  }),
);
router.post('/projects/:id/sessions', ocRoute((dir, req) => oc.json('POST', '/session', { directory: dir, body: { title: req.body?.title || undefined } })));
router.get('/projects/:id/sessions/:sid/messages', ocRoute((dir, req) => oc.json('GET', `/session/${sid(req)}/message`, { directory: dir, query: { limit: 300 } })));
router.get('/projects/:id/sessions/:sid/diff', ocRoute((dir, req) => oc.json('GET', `/session/${sid(req)}/diff`, { directory: dir })));
router.patch('/projects/:id/sessions/:sid', ocRoute((dir, req) => oc.json('PATCH', `/session/${sid(req)}`, { directory: dir, body: { title: String(req.body?.title || '').slice(0, 120) } })));
router.delete('/projects/:id/sessions/:sid', ocRoute((dir, req) => oc.json('DELETE', `/session/${sid(req)}`, { directory: dir })));
router.post('/projects/:id/sessions/:sid/abort', ocRoute((dir, req) => oc.json('POST', `/session/${sid(req)}/abort`, { directory: dir })));
router.get('/projects/:id/status', ocRoute((dir) => oc.json('GET', '/session/status', { directory: dir })));

router.post(
  '/projects/:id/sessions/:sid/send',
  wrap(async (req, res) => {
    const p = getProject(req);
    const text = String(req.body?.text || '');
    if (!text.trim()) throw fail('Mensaje vacío');
    const body = { parts: [{ type: 'text', text }] };
    const m = req.body?.model;
    if (m?.providerID && m?.modelID) body.model = { providerID: String(m.providerID), modelID: String(m.modelID) };
    if (req.body?.agent) body.agent = String(req.body.agent);
    await oc.json('POST', `/session/${sid(req)}/prompt_async`, { directory: p.path, body });
    res.json({ ok: true });
  }),
);

router.post(
  '/projects/:id/sessions/:sid/permissions/:pid',
  wrap(async (req, res) => {
    const p = getProject(req);
    if (!SID.test(req.params.pid)) throw fail('Permiso no válido');
    const response = ['once', 'always', 'reject'].includes(req.body?.response) ? req.body.response : 'reject';
    try {
      // API actual de OpenCode
      res.json(await oc.json('POST', `/permission/${req.params.pid}/reply`, { directory: p.path, body: { reply: response } }));
    } catch (e) {
      if (e.status !== 404) throw e;
      // Versiones anteriores
      res.json(await oc.json('POST', `/session/${sid(req)}/permissions/${req.params.pid}`, { directory: p.path, body: { response } }));
    }
  }),
);

router.get(
  '/projects/:id/events',
  wrap(async (req, res) => {
    const p = getProject(req);
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    const upstream = await oc.stream('/event', { directory: p.path, signal: ac.signal });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const body = Readable.fromWeb(upstream.body);
    body.on('error', () => res.end());
    body.pipe(res);
  }),
);

// --- Modelos y proveedores ---
router.get(
  '/models',
  wrap(async (req, res) => {
    const [cfg, prov] = await Promise.all([
      oc.json('GET', '/config/providers', { directory: config.projectsDir }),
      oc.json('GET', '/provider', { directory: config.projectsDir }).catch(() => null),
    ]);
    const providers = (cfg.providers || []).map((p) => ({
      id: p.id,
      name: p.name || p.id,
      models: Object.values(p.models || {}).map((m) => ({ id: m.id, name: m.name || m.id })),
    }));
    const all = (prov?.all || []).map((p) => ({ id: p.id, name: p.name || p.id }));
    const names = new Map(all.map((p) => [p.id, p.name]));
    const stored = (await readStoredAuth()).map((a) => ({ ...a, name: names.get(a.id) || a.id }));
    res.json({ providers, defaults: cfg.default || {}, all, stored, favorites: store.getSettings().favoriteModels || [], connected: prov?.connected || providers.map((p) => p.id) });
  }),
);

// Claves guardadas por OpenCode (auth.json). Nunca se devuelve la clave, solo el final.
async function readStoredAuth() {
  try {
    const base = process.env.XDG_DATA_HOME || path.join(process.env.HOME || os.homedir(), '.local', 'share');
    const raw = JSON.parse(await fsp.readFile(path.join(base, 'opencode', 'auth.json'), 'utf8'));
    return Object.entries(raw || {}).map(([id, v]) => ({
      id,
      type: v?.type || 'api',
      hint: v?.type === 'api' && typeof v.key === 'string' && v.key.length >= 12 ? `…${v.key.slice(-4)}` : '',
    }));
  } catch {
    return [];
  }
}

router.delete(
  '/providers/:id',
  wrap(async (req, res) => {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(req.params.id)) throw fail('Proveedor no válido');
    await oc.json('DELETE', `/auth/${req.params.id}`, { directory: config.projectsDir });
    await oc.json('POST', '/instance/dispose', { directory: config.projectsDir }).catch(() => {});
    res.json({ ok: true });
  }),
);

router.put(
  '/models/favorites',
  wrap(async (req, res) => {
    const list = Array.isArray(req.body?.favorites) ? req.body.favorites : null;
    if (!list) throw fail('Lista no válida');
    const clean = [...new Set(list.filter((v) => typeof v === 'string' && v.length <= 200 && /^[^:]+::.+$/.test(v)))].slice(0, 100);
    store.updateSettings({ favoriteModels: clean });
    res.json({ favorites: clean });
  }),
);

router.put(
  '/providers/:id/key',
  wrap(async (req, res) => {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(req.params.id)) throw fail('Proveedor no válido');
    const key = String(req.body?.key || '').trim();
    if (key.length < 8) throw fail('Clave no válida');
    await oc.json('PUT', `/auth/${req.params.id}`, { directory: config.projectsDir, body: { type: 'api', key } });
    await oc.json('POST', '/instance/dispose', { directory: config.projectsDir }).catch(() => {});
    res.json({ ok: true });
  }),
);

// --- OpenCode ---
router.get(
  '/opencode/status',
  wrap(async (req, res) => {
    const h = await oc.health();
    res.json({ running: oc.isRunning(), healthy: Boolean(h?.healthy), version: h?.version || null, logs: oc.logs() });
  }),
);
router.post('/opencode/restart', wrap(async (req, res) => { await oc.restart(); res.json({ ok: true }); }));
router.post(
  '/opencode/upgrade',
  wrap(async (req, res) => {
    const output = await oc.upgrade();
    await oc.restart();
    res.json({ ok: true, output });
  }),
);

// --- Actualizaciones de esta aplicación (desde GitHub) ---
router.get('/update/status', wrap(async (req, res) => res.json(await updater.check({ refresh: req.query.refresh === '1' }))));
router.post('/update/apply', wrap(async (req, res) => res.json(await updater.apply())));
router.post('/update/rollback', wrap(async (req, res) => res.json(await updater.rollback())));

// ---------- Errores ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Error interno', ...(err.output ? { output: err.output } : {}) });
});

// ---------- Arranque ----------
oc.start();
updater.startPeriodicCheck();

const server = app.listen(config.port, config.host, () => {
  console.log(`opencode-cloud escuchando en http://${config.host}:${config.port}  (datos: ${config.dataDir})`);
  if (!auth.hasPassword()) console.warn('AVISO: no hay contraseña. Ejecuta: node bin/set-password.js "<contraseña>"');
});

async function shutdown() {
  server.close();
  await oc.stop();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
