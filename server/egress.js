// Salida a internet: ¿está activo el túnel WireGuard (deploy/egress.sh) y con qué IP pública sale este proceso?
import os from 'node:os';

const IFACE = process.env.EGRESS_IFACE || 'ocegress';
const TTL = 60_000;
const URLS = ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com'];

let cache = null; // { at, tunnel, ip }
let inflight = null;

const tunnelUp = () => Boolean(os.networkInterfaces()[IFACE]);

async function lookup() {
  const signal = AbortSignal.timeout(5000); // presupuesto total, no por URL
  for (const url of URLS) {
    try {
      const r = await fetch(url, { signal });
      const t = (await r.text()).trim();
      if (r.ok && /^[0-9a-fA-F:.]{7,45}$/.test(t)) return t;
    } catch { /* probar el siguiente */ }
  }
  return null;
}

export async function status({ force = false } = {}) {
  const tunnel = tunnelUp();
  if (!force && cache && cache.tunnel === tunnel && Date.now() - cache.at < TTL) return { iface: IFACE, ...cache };
  inflight ||= lookup().finally(() => { inflight = null; });
  const ip = await inflight;
  cache = { at: Date.now(), tunnel, ip };
  return { iface: IFACE, ...cache };
}
