import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
// Modo instancia: este proceso es el espacio de un usuario y solo acepta peticiones de la pasarela (que conoce el secreto)
const instanceSecret = process.env.INSTANCE_SECRET || '';

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
  // Modo multiusuario (pasarela): login con usuario y proxy hacia el espacio de cada usuario. Lo activa deploy/multiuser.sh
  multiuser: process.env.MULTIUSER === '1' && !instanceSecret,
  instance: Boolean(instanceSecret),
  instanceSecret,
  instanceUser: process.env.INSTANCE_USER || '',
  // Dominio propio del panel de administración (opcional). En él solo se atiende al administrador y solo lo suyo
  adminHost: (process.env.ADMIN_HOST || '').trim().toLowerCase(),
  sessionDays: Number(process.env.SESSION_DAYS) || 7,
};
