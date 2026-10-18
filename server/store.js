import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(config.projectsDir, { recursive: true });

const file = (name) => path.join(config.dataDir, `${name}.json`);

export function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

export function save(name, data) {
  const target = file(name);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, target);
}

const DEFAULT_SETTINGS = { githubToken: '', gitName: 'OpenCode Cloud', gitEmail: 'opencode@localhost', favoriteModels: [] };

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...load('settings', {}) };
}

export function updateSettings(patch) {
  const next = { ...getSettings(), ...patch };
  save('settings', next);
  return next;
}
