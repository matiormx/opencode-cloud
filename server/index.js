import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import express from 'express';
import * as auth from './auth.js';
import { config } from './config.js';
import * as egress from './egress.js';
import * as git from './git.js';
import * as gateway from './gateway.js';
import * as gh from './github.js';
import * as instances from './instances.js';
import * as oc from './opencode.js';
import * as queue from './queue.js';
import * as reqmon from './reqmon.js';
import * as sysmon from './sysmon.js';
import * as store from './store.js';
import * as updater from './updater.js';
import * as users from './users.js';

const fsp = fs.promises;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
// Modo multiusuario: las peticiones de los usuarios que no son el administrador se reenvían a su espacio sin leer el cuerpo
app.use('/api', gateway.proxy);
app.use(express.json({ limit: '14mb' })); // los mensajes con imágenes van en base64

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

const meInfo = (req) => {
  const info = auth.sessionInfo(req);
  if (!info || (info.user && !users.isActive(info.user))) return null;
  return { name: info.user || (config.multiuser ? users.ownerName() : 'admin'), role: info.user ? 'user' : 'admin' };
};

app.get('/api/me', (req, res) => {
  const user = config.instance ? null : meInfo(req);
  res.json({ authenticated: Boolean(user), passwordSet: auth.hasPassword(), multiuser: config.multiuser, user });
});

app.post(
  '/api/login',
  wrap(async (req, res) => {
    if (config.instance) throw fail('No encontrado', 404);
    if (!auth.hasPassword()) throw fail('No hay contraseña configurada. Ejecuta: node bin/set-password.js', 409);
    const username = config.multiuser ? String(req.body?.username || '').trim().toLowerCase() : users.ownerName();
    const keys = [req.ip, `u:${username}`];
    keys.forEach((k) => auth.checkRate(k));
    const user = await users.authenticate(username, req.body?.password);
    if (!user) {
      keys.forEach((k) => auth.registerFailure(k));
      throw fail(config.multiuser ? 'Usuario o contraseña incorrectos' : 'Contraseña incorrecta', 401);
    }
    keys.forEach((k) => auth.clearFailures(k));
    auth.setCookie(res, auth.createSession(user.role === 'admin' ? '' : user.name));
    if (user.role !== 'admin') instances.probe(user.name).then((up) => { if (!up) instances.nudge(user.name); });
    res.json({ ok: true, user });
  }),
);

app.post('/api/logout', (req, res) => {
  auth.destroySession(req);
  auth.clearCookie(res);
  res.json({ ok: true });
});

// ---------- Protegido ----------
const attachUser = (req, res, next) => {
  req.sessionUser = config.instance ? '' : auth.sessionInfo(req)?.user ?? '';
  next();
};
app.use('/api', auth.requireAuth, attachUser, router);
const adminOnly = (req, res, next) => (req.sessionUser === '' ? next() : next(fail('Solo el administrador', 403)));
const multiOnly = (req, res, next) => (config.multiuser ? next() : next(fail('El modo multiusuario no está activado', 404)));

// --- Trabajo en curso: qué conversaciones están trabajando, esperando al proveedor o pendientes de permiso ---
router.get(
  '/activity',
  wrap(async (req, res) => {
    const sessions = [];
    await Promise.all(
      loadProjects().map(async (pr) => {
        const dir = withPath(pr).path;
        try {
          const [st, perms] = await Promise.all([
            oc.json('GET', '/session/status', { directory: dir }),
            oc.json('GET', '/permission', { directory: dir }).catch(() => []),
          ]);
          const pending = new Set((Array.isArray(perms) ? perms : []).map((x) => x.sessionID));
          const ids = new Set([...Object.keys(st || {}).filter((k) => st[k] && st[k].type !== 'idle'), ...pending]);
          if (!ids.size) return;
          let titles = new Map();
          try {
            const list = await oc.json('GET', '/session', { directory: dir });
            titles = new Map((Array.isArray(list) ? list : []).map((x) => [x.id, x.title || '']));
          } catch { /* sin títulos */ }
          for (const id of ids) {
            const v = st?.[id];
            const row = { projectId: pr.id, projectName: pr.name, sessionId: id, title: titles.get(id) || '', state: 'working' };
            if (pending.has(id)) row.state = 'permission';
            else if (v?.type === 'retry') {
              const next = Number(v.next) || 0;
              const nextAt = next > 1e11 ? next : next ? Date.now() + next : 0;
              row.state = 'retrying';
              row.retry = { attempt: v.attempt || 0, message: String(v.message || '').slice(0, 300), inSec: nextAt ? Math.max(0, Math.round((nextAt - Date.now()) / 1000)) : null };
            }
            sessions.push(row);
          }
        } catch { /* OpenCode no responde: no hay nada que interrumpir */ }
      }),
    );
    // En modo multiusuario, el administrador también ve si los espacios de los demás están trabajando
    let others = [];
    if (config.multiuser && req.sessionUser === '') {
      const rows = await Promise.all(users.list().filter((u) => u.role !== 'admin' && !u.disabled).map(async (u) => ({ name: u.name, ...((await instances.activity(u.name)) || {}) })));
      others = rows.filter((r) => r.busy || r.queued);
    }
    res.json({
      busy: sessions.map(({ projectId, projectName, sessionId }) => ({ projectId, projectName, sessionId })),
      sessions,
      queued: queue.countAll(),
      requests: reqmon.snapshot(),
      others,
    });
  }),
);

// --- Recursos del servidor ---
router.get('/system', wrap(async (req, res) => res.json(await sysmon.snapshot(req.query.points))));

// --- Salida a internet (túnel WireGuard opcional) ---
router.get('/egress', wrap(async (req, res) => res.json(await egress.status({ force: req.query.force === '1' }))));
const notInstance = (req, res, next) => (config.instance ? next(fail('Lo gestiona el administrador', 403)) : next());
router.post('/egress/config', notInstance, wrap(async (req, res) => res.json(await egress.request('apply', req.body?.conf))));
router.post('/egress/action', notInstance, wrap(async (req, res) => {
  const a = String(req.body?.action || '');
  if (!['on', 'off', 'remove', 'reconnect'].includes(a)) return res.status(400).json({ error: 'Acción no válida' });
  res.json(await egress.request(a));
}));

// --- Ajustes ---
const publicSettings = () => {
  const s = store.getSettings();
  return {
    githubTokenSet: Boolean(s.githubToken),
    gitName: s.gitName,
    gitEmail: s.gitEmail,
    ocPermission: config.ocPermission,
    // Qué puede gestionar este espacio: en el de un usuario, la actualización de la app, la salida WireGuard y OpenCode las gestiona el administrador
    mode: config.instance ? 'instance' : config.multiuser ? 'owner' : 'single',
    canAdmin: !config.instance,
    canManageUsers: config.multiuser,
  };
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
    if (req.sessionUser) {
      // Usuario no administrador: su contraseña vive en la pasarela
      await users.changeOwnPassword(req.sessionUser, current, next);
      auth.setCookie(res, auth.createSession(req.sessionUser));
      return res.json({ ok: true });
    }
    if (!(await auth.verifyPassword(current))) throw fail('La contraseña actual no es correcta', 403);
    await auth.setPassword(next);
    auth.setCookie(res, auth.createSession(''));
    res.json({ ok: true });
  }),
);

// --- Usuarios (solo administrador, modo multiusuario) ---
router.get(
  '/users',
  multiOnly,
  adminOnly,
  wrap(async (req, res) => {
    const list = users.list();
    await Promise.all(list.map(async (u) => {
      u.running = u.role === 'admin' ? true : !u.disabled && (await instances.probe(u.name));
      if (u.role === 'admin') return;
      u.lastSeen = gateway.lastSeen(u.name) || 0;
      if (u.running) { const a = await instances.activity(u.name); if (a) { u.busy = a.busy; u.queued = a.queued; } }
    }));
    res.json({ users: list, helper: instances.helperInfo() });
  }),
);

router.post(
  '/users',
  multiOnly,
  adminOnly,
  wrap(async (req, res) => {
    const name = String(req.body?.name || '').trim().toLowerCase();
    users.validateName(name);
    if (!instances.helperInfo().ready) throw fail('El ayudante del sistema no está instalado (sudo deploy/multiuser.sh setup)', 409);
    await users.create(name, req.body?.password);
    try {
      await instances.request('create', name);
    } catch (e) {
      users.remove(name);
      throw e;
    }
    res.json({ ok: true, name });
  }),
);

const userParam = (req) => {
  const name = String(req.params.name || '');
  if (name === users.ownerName() || !users.list().some((u) => u.name === name)) throw fail('Usuario no encontrado', 404);
  return name;
};

router.put('/users/:name/password', multiOnly, adminOnly, wrap(async (req, res) => { await users.setPassword(userParam(req), req.body?.password); res.json({ ok: true }); }));

router.put(
  '/users/:name/disabled',
  multiOnly,
  adminOnly,
  wrap(async (req, res) => {
    const name = userParam(req);
    const disabled = Boolean(req.body?.disabled);
    users.setDisabled(name, disabled);
    await instances.request(disabled ? 'stop' : 'start', name).catch(() => {});
    res.json({ ok: true });
  }),
);

router.post('/users/:name/restart', multiOnly, adminOnly, wrap(async (req, res) => { await instances.request('restart', userParam(req)); res.json({ ok: true }); }));

router.delete(
  '/users/:name',
  multiOnly,
  adminOnly,
  wrap(async (req, res) => {
    const name = userParam(req);
    await instances.request(req.body?.purge ? 'delete-purge' : 'delete', name);
    users.remove(name);
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
    queue.dropProject(p.id);
    store.updateSettings({ pinnedSessions: (store.getSettings().pinnedSessions || []).filter((k) => !k.startsWith(`${p.id}:`)) });
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
router.get('/projects/:id/sessions/:sid/messages', ocRoute(async (dir, req) => {
  const r = await oc.json('GET', `/session/${sid(req)}/message`, { directory: dir, query: { limit: 300 } });
  if (!Array.isArray(r)) throw fail('OpenCode no devolvió la conversación (¿se está reiniciando?). Reintenta en unos segundos.', 502);
  return r;
}));
router.get('/projects/:id/sessions/:sid/diff', ocRoute((dir, req) => oc.json('GET', `/session/${sid(req)}/diff`, { directory: dir })));
router.patch(
  '/projects/:id/sessions/:sid',
  wrap(async (req, res) => {
    const p = getProject(req);
    const title = String(req.body?.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!title) throw fail('El título no puede estar vacío');
    res.json(await oc.json('PATCH', `/session/${sid(req)}`, { directory: p.path, body: { title } }));
  }),
);

// --- Conversaciones destacadas y recientes (de todos los proyectos) ---
const pinKey = (projectId, sessionId) => `${projectId}:${sessionId}`;
router.get(
  '/conversations/overview',
  wrap(async (req, res) => {
    const pinned = new Set(store.getSettings().pinnedSessions || []);
    const projects = loadProjects();
    const lists = await Promise.all(
      projects.map(async (pr) => {
        try {
          const list = await oc.json('GET', '/session', { directory: withPath(pr).path });
          return (Array.isArray(list) ? list : []).filter((s) => !s.parentID).map((s) => ({
            projectId: pr.id, projectName: pr.name, id: s.id, title: s.title || '', updated: s.time?.updated || s.time?.created || 0,
          }));
        } catch {
          return [];
        }
      }),
    );
    const all = lists.flat().sort((a, b) => b.updated - a.updated);
    const mark = (x) => ({ ...x, pinned: pinned.has(pinKey(x.projectId, x.id)) });
    res.json({
      pinned: all.filter((x) => pinned.has(pinKey(x.projectId, x.id))).map(mark),
      recent: all.filter((x) => !pinned.has(pinKey(x.projectId, x.id))).slice(0, 5).map(mark),
    });
  }),
);
router.put(
  '/conversations/pin',
  wrap(async (req, res) => {
    const { projectId, sessionId, pinned } = req.body || {};
    if (!loadProjects().some((x) => x.id === projectId)) throw fail('Proyecto no encontrado', 404);
    if (typeof sessionId !== 'string' || !SID.test(sessionId)) throw fail('Conversación no válida');
    const set = new Set(store.getSettings().pinnedSessions || []);
    if (pinned) set.add(pinKey(projectId, sessionId));
    else set.delete(pinKey(projectId, sessionId));
    store.updateSettings({ pinnedSessions: [...set].slice(-200) });
    res.json({ ok: true });
  }),
);
router.delete(
  '/projects/:id/sessions/:sid',
  wrap(async (req, res) => {
    const p = getProject(req);
    queue.clear(p.id, sid(req));
    store.updateSettings({ pinnedSessions: (store.getSettings().pinnedSessions || []).filter((k) => k !== pinKey(p.id, sid(req))) });
    res.json(await oc.json('DELETE', `/session/${sid(req)}`, { directory: p.path }));
  }),
);
router.post(
  '/projects/:id/sessions/:sid/abort',
  wrap(async (req, res) => {
    const p = getProject(req);
    queue.pauseIfAny(p.id, sid(req));
    res.json(await oc.json('POST', `/session/${sid(req)}/abort`, { directory: p.path }));
  }),
);

// --- Cola de mensajes ---
router.get('/projects/:id/sessions/:sid/queue', wrap(async (req, res) => { const p = getProject(req); res.json(queue.list(p.id, sid(req))); }));
router.post(
  '/projects/:id/sessions/:sid/queue',
  wrap(async (req, res) => {
    const p = getProject(req);
    res.json(queue.add(p.id, sid(req), req.body?.text, req.body?.model));
  }),
);
router.delete('/projects/:id/sessions/:sid/queue/:qid', wrap(async (req, res) => {
  const p = getProject(req);
  if (!/^[a-f0-9]{1,32}$/.test(req.params.qid)) throw fail('Elemento no válido');
  queue.remove(p.id, sid(req), req.params.qid);
  res.json({ ok: true });
}));
router.delete('/projects/:id/sessions/:sid/queue', wrap(async (req, res) => { const p = getProject(req); queue.clear(p.id, sid(req)); res.json({ ok: true }); }));
router.post('/projects/:id/sessions/:sid/queue/resume', wrap(async (req, res) => { const p = getProject(req); queue.setPaused(p.id, sid(req), false); res.json({ ok: true }); }));
router.get('/projects/:id/permissions', ocRoute((dir) => oc.json('GET', '/permission', { directory: dir })));
router.get('/projects/:id/status', ocRoute((dir) => oc.json('GET', '/session/status', { directory: dir })));

// Imágenes adjuntas: solo tipos de imagen habituales, como data URL, con tope de número y tamaño
const IMG_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
function parseImages(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 4) throw fail('Máximo 4 imágenes por mensaje');
  return list.map((im, i) => {
    const m = IMG_RE.exec(String(im?.url || ''));
    if (!m) throw fail('Imagen no válida (usa PNG, JPG, WebP o GIF)');
    if (m[2].length * 0.75 > 3.5 * 1024 * 1024) throw fail('Una imagen supera los 3,5 MB');
    const name = String(im?.name || '').replace(/[^\w.\- ]/g, '').slice(0, 60) || `imagen-${i + 1}`;
    return { type: 'file', mime: m[1], filename: name, url: m[0] };
  });
}

router.post(
  '/projects/:id/sessions/:sid/send',
  wrap(async (req, res) => {
    const p = getProject(req);
    const text = String(req.body?.text || '');
    const imgs = parseImages(req.body?.images);
    if (!text.trim() && !imgs.length) throw fail('Mensaje vacío');
    const body = { parts: [...(text.trim() ? [{ type: 'text', text }] : []), ...imgs] };
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
    res.json({ providers, defaults: cfg.default || {}, all, stored, favorites: store.getSettings().favoriteModels || [], hidden: store.getSettings().hiddenProviders || [], connected: prov?.connected || providers.map((p) => p.id) });
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
  '/models/hidden',
  wrap(async (req, res) => {
    const list = Array.isArray(req.body?.hidden) ? req.body.hidden : null;
    if (!list) throw fail('Lista no válida');
    const clean = [...new Set(list.filter((v) => typeof v === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(v)))].slice(0, 200);
    store.updateSettings({ hiddenProviders: clean });
    res.json({ hidden: clean });
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
  notInstance,
  wrap(async (req, res) => {
    const output = await oc.upgrade();
    await oc.restart();
    res.json({ ok: true, output });
  }),
);

// --- Actualizaciones de esta aplicación (desde GitHub) ---
router.get('/update/status', wrap(async (req, res) => res.json(await updater.check({ refresh: req.query.refresh === '1' }))));
// Tras actualizar el código, los espacios de los usuarios también se reinician para usar la versión nueva
router.post('/update/apply', notInstance, wrap(async (req, res) => { const r = await updater.apply(); if (config.multiuser) instances.fire('restart-all'); res.json(r); }));
router.post('/update/rollback', notInstance, wrap(async (req, res) => { const r = await updater.rollback(); if (config.multiuser) instances.fire('restart-all'); res.json(r); }));

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
if (!config.instance) updater.startPeriodicCheck();
queue.start();
sysmon.start();
reqmon.start();

const server = app.listen(config.port, config.host, () => {
  console.log(`opencode-cloud escuchando en http://${config.host}:${config.port}  (datos: ${config.dataDir})${config.instance ? ` [espacio de ${config.instanceUser || 'usuario'}]` : config.multiuser ? ' [multiusuario]' : ''}`);
  if (!config.instance && !auth.hasPassword()) console.warn('AVISO: no hay contraseña. Ejecuta: node bin/set-password.js "<contraseña>"');
});

async function shutdown() {
  server.close();
  await oc.stop();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
