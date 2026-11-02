// Save-file routes for the dev server (frontier F1.6).
//   GET /saves            -> headers of every save (reads only the start of each file)
//   GET /saves/<name>     -> the whole save file
//   PUT /saves/<name>     -> write it (temp file, then rename, so a crash never leaves half a save)
//   DELETE /saves/<name>  -> moves it to saves/_trash/ (never a real delete)
import { mkdir, open, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NAME_RE, headerFromText } from './src/save_store.js';

const MAX_BYTES = 64 * 1024 * 1024;
const send = (res, code, body) => {
  if (body === undefined) { res.writeHead(code).end(); return; }
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
};

// Returns true when the request was a /saves request (handled here).
export async function handleSaves(req, res, dir) {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path !== '/saves' && !path.startsWith('/saves/')) return false;
  try {
    const name = path.slice('/saves/'.length);
    if (path === '/saves' || path === '/saves/') {
      if (req.method !== 'GET') { send(res, 405); return true; }
      await mkdir(dir, { recursive: true });
      const out = [];
      for (const f of await readdir(dir)) {
        if (!f.endsWith('.json')) continue;
        const fh = await open(join(dir, f), 'r');
        try {
          const buf = Buffer.alloc(4096);
          const { bytesRead } = await fh.read(buf, 0, 4096, 0);
          const h = headerFromText(buf.toString('utf8', 0, bytesRead));
          if (h) out.push({ name: f.slice(0, -5), ...h });
        } finally { await fh.close(); }
      }
      send(res, 200, out); return true;
    }
    if (!NAME_RE.test(name)) { send(res, 400, { error: 'Bad save name' }); return true; }
    const file = join(dir, `${name}.json`);
    if (req.method === 'GET') {
      try { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(await readFile(file)); }
      catch { send(res, 404); }
    } else if (req.method === 'PUT') {
      let body = ''; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > MAX_BYTES) { send(res, 413); return true; } body += chunk; }
      const parsed = JSON.parse(body);
      if (parsed?.format !== 'infamy-save') { send(res, 400, { error: 'Not a save file' }); return true; }
      await mkdir(dir, { recursive: true });
      // header fields first, state last, so list() can read just the start
      const { state, private: priv, ...head } = parsed;
      const text = JSON.stringify({ ...head, state, private: priv });
      await writeFile(`${file}.tmp`, text);
      await rename(`${file}.tmp`, file);
      send(res, 204);
    } else if (req.method === 'DELETE') {
      await mkdir(join(dir, '_trash'), { recursive: true });
      try { await rename(file, join(dir, '_trash', `${name}-${Date.now()}.json`)); send(res, 204); }
      catch { send(res, 404); }
    } else send(res, 405);
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
  return true;
}
