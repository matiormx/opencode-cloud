import * as store from './store.js';

const API = 'https://api.github.com';

async function call(method, path, body) {
  const token = store.getSettings().githubToken;
  if (!token) throw Object.assign(new Error('Configura primero el token de GitHub en Ajustes'), { status: 400 });
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'opencode-cloud',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = data.errors?.map((e) => e.message).filter(Boolean).join('; ');
    const msg = [data.message, detail].filter(Boolean).join(': ') || `GitHub ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status === 401 ? 400 : r.status === 404 ? 404 : 400 });
  }
  return data;
}

export const whoami = () => call('GET', '/user');

export async function listRepos() {
  const data = await call('GET', '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member');
  return data.map((r) => ({
    full_name: r.full_name,
    clone_url: r.clone_url,
    private: r.private,
    default_branch: r.default_branch,
    description: r.description,
    pushed_at: r.pushed_at,
  }));
}

export async function listPulls(owner, repo) {
  const data = await call('GET', `/repos/${owner}/${repo}/pulls?state=open&per_page=30`);
  return data.map((p) => ({
    number: p.number,
    title: p.title,
    head: p.head.ref,
    base: p.base.ref,
    user: p.user?.login,
    url: p.html_url,
    draft: p.draft,
  }));
}

export async function createPull(owner, repo, { title, body, head, base }) {
  const p = await call('POST', `/repos/${owner}/${repo}/pulls`, { title, body: body || '', head, base });
  return { number: p.number, url: p.html_url };
}

export async function mergePull(owner, repo, number, method = 'merge') {
  if (!['merge', 'squash', 'rebase'].includes(method)) method = 'merge';
  if (!Number.isInteger(number) || number < 1) throw Object.assign(new Error('Número de PR no válido'), { status: 400 });
  return call('PUT', `/repos/${owner}/${repo}/pulls/${number}/merge`, { merge_method: method });
}
