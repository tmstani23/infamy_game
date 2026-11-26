// Saved HUD layouts for the dev server (2026-11-16): one file per layout in saves/layouts/<name>.json,
// kept apart from the game saves and from the game's own data folder (data/ui_layout.json is the shipped Default
// and is never written by the game).
//   GET    /layouts         -> { names: [...] }
//   GET    /layouts/<name>  -> { panels }
//   PUT    /layouts/<name>  -> write { panels } (temp file, then rename)
//   DELETE /layouts/<name>  -> moves it to to_delete/layouts/ (never a real delete)
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const LAYOUT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,29}$/;
const send = (res, code, body) => {
  if (body === undefined) { res.writeHead(code).end(); return; }
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
};

// Returns true when the request was a /layouts request (handled here).
export async function handleLayouts(req, res, dir, trashDir) {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path !== '/layouts' && !path.startsWith('/layouts/')) return false;
  try {
    if (path === '/layouts' || path === '/layouts/') {
      if (req.method !== 'GET') { send(res, 405); return true; }
      await mkdir(dir, { recursive: true });
      const names = (await readdir(dir)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(n => LAYOUT_NAME_RE.test(n)).sort((a, b) => a.localeCompare(b));
      send(res, 200, { names }); return true;
    }
    const name = path.slice('/layouts/'.length);
    if (!LAYOUT_NAME_RE.test(name) || name.toLowerCase() === 'default') { send(res, 400, { error: 'Bad layout name' }); return true; }
    const file = join(dir, `${name}.json`);
    if (req.method === 'GET') {
      let text = null;
      try { text = await readFile(file); } catch { send(res, 404); return true; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(text);
    } else if (req.method === 'PUT') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 262144) { send(res, 413); return true; } }
      const panels = JSON.parse(body).panels;
      if (!panels || typeof panels !== 'object') { send(res, 400, { error: 'Not a layout' }); return true; }
      await mkdir(dir, { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify({ panels }, null, 2) + '\n');
      await rename(`${file}.tmp`, file);
      send(res, 204);
    } else if (req.method === 'DELETE') {
      await mkdir(trashDir, { recursive: true });
      try { await rename(file, join(trashDir, `${name}-${Date.now()}.json`)); send(res, 204); }
      catch { send(res, 404); }
    } else send(res, 405);
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
  return true;
}
