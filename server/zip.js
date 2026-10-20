// Descarga de un proyecto como .zip, generado al vuelo (sin guardar nada en disco y sin depender de ningún programa externo).
// Excluye carpetas que se regeneran o pesan mucho (node_modules, .git…) y los enlaces simbólicos.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { once } from 'node:events';

const fsp = fs.promises;
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.nuxt', '.cache', '__pycache__', '.venv', 'venv', '.turbo', '.parcel-cache', '.gradle']);
const SKIP_FILES = new Set(['.DS_Store']);
export const MAX_TOTAL = 1.5 * 1024 ** 3; // sin ZIP64: por encima de esto se pide comprimir aparte
export const MAX_FILES = 20000;

const tooBig = () => Object.assign(new Error('El proyecto es demasiado grande para descargarlo de una vez (más de 1,5 GB o 20 000 archivos). Pídele a OpenCode que lo comprima dejando fuera lo que no haga falta.'), { status: 413 });

let TABLE = null;
function crc32(buf, prev = 0) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf, prev);
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; }
  }
  let c = prev ^ 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dos(d) {
  const y = Math.max(1980, d.getFullYear());
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

async function collect(root) {
  const out = [];
  let total = 0;
  async function rec(dir, rel) {
    let ents;
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of ents) {
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await rec(abs, r); continue; }
      if (!e.isFile() || SKIP_FILES.has(e.name)) continue;
      let st;
      try { st = await fsp.stat(abs); } catch { continue; }
      total += st.size;
      out.push({ abs, rel: r, mtime: st.mtime, mode: st.mode & 0xffff });
      if (out.length > MAX_FILES || total > MAX_TOTAL) throw tooBig();
    }
  }
  await rec(root, '');
  return out;
}

export async function sendZip(res, root, name) {
  const files = await collect(root); // si es demasiado grande, falla antes de enviar nada
  const base = String(name || 'proyecto').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 80) || 'proyecto';
  const ascii = base.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${ascii}.zip"; filename*=UTF-8''${encodeURIComponent(base)}.zip`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  let offset = 0;
  const central = [];
  const w = async (buf) => {
    if (res.destroyed) throw new Error('conexión cerrada');
    if (!res.write(buf)) await once(res, 'drain');
    offset += buf.length;
  };
  try {
    for (const f of files) {
      const nameBuf = Buffer.from(f.rel, 'utf8');
      const { time, date } = dos(f.mtime);
      const lho = offset;
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0808, 6); lh.writeUInt16LE(8, 8);
      lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt16LE(nameBuf.length, 26);
      await w(Buffer.concat([lh, nameBuf]));
      let crc = 0; let usize = 0; let csize = 0;
      const rs = fs.createReadStream(f.abs);
      const def = zlib.createDeflateRaw({ level: 6 });
      rs.on('error', (e) => def.destroy(e));
      rs.on('data', (c) => { crc = crc32(c, crc); usize += c.length; });
      rs.pipe(def);
      for await (const c of def) { csize += c.length; await w(c); }
      const dd = Buffer.alloc(16);
      dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc, 4); dd.writeUInt32LE(csize, 8); dd.writeUInt32LE(usize, 12);
      await w(dd);
      central.push({ nameBuf, time, date, crc, csize, usize, lho, mode: f.mode });
    }
    const cdStart = offset;
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(0x0314, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0808, 8); h.writeUInt16LE(8, 10);
      h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14); h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.usize, 24);
      h.writeUInt16LE(c.nameBuf.length, 28); h.writeUInt32LE(((c.mode << 16) >>> 0), 38); h.writeUInt32LE(c.lho, 42);
      await w(Buffer.concat([h, c.nameBuf]));
    }
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(central.length, 8); eocd.writeUInt16LE(central.length, 10);
    eocd.writeUInt32LE(offset - cdStart, 12); eocd.writeUInt32LE(cdStart, 16);
    await w(eocd);
    res.end();
  } catch (err) {
    res.destroy(); // el archivo queda incompleto: el navegador lo marca como fallido
    if (!/conexión cerrada/.test(err.message)) console.error('[zip]', err.message);
  }
}
