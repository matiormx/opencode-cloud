import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));

export const config = {
  root: ROOT,
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT) || 3000,
  dataDir,
  projectsDir: path.join(dataDir, 'projects'),
  opencodePort: Number(process.env.OPENCODE_PORT) || 4096,
  opencodeBin: process.env.OPENCODE_BIN || '',
  // 'ask' (pide permiso en la UI) o 'allow' (el agente edita y ejecuta sin preguntar)
  ocPermission: process.env.OC_PERMISSION === 'allow' ? 'allow' : 'ask',
  secureCookies: process.env.SECURE_COOKIES === '1',
  updateBranch: process.env.UPDATE_BRANCH || 'main',
  // Hosts a los que se puede enviar el token de GitHub (separados por comas)
  gitHosts: (process.env.GIT_ALLOWED_HOSTS || 'github.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  sessionDays: Number(process.env.SESSION_DAYS) || 7,
};
