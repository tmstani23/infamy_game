// Tiny local web server for the game (browsers block loading textures from file://).
// Serves the repository folder, so the game can read ../assets. No packages needed.
//   node game/server.mjs [--open]
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream', '.css': 'text/css', '.svg': 'image/svg+xml', '.ogg':'audio/ogg','.wav':'audio/wav' };

const server = createServer(async (req, res) => {
  try {
    // the movable HUD saves its layout here (src/hud_layout.js); the only file the game may write
    if (req.method === 'PUT') {
      if (new URL(req.url, 'http://x').pathname !== '/game/data/ui_layout.json') { res.writeHead(403).end(); return; }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 65536) { res.writeHead(413).end(); return; } }
      const panels = JSON.parse(body).panels;
      if (!panels || typeof panels !== 'object') { res.writeHead(400).end(); return; }
      await writeFile(join(ROOT, 'game', 'data', 'ui_layout.json'), JSON.stringify({ panels }, null, 2) + '\n');
      res.writeHead(204).end();
      return;
    }
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// start_game.bat stops older servers first; if one is still running, wait for it to go, then take its port
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  if (tries < 10) { tries++; setTimeout(() => server.listen(port, '127.0.0.1'), 300); }
  else if (port < 8150) { tries = 0; server.listen(++port, '127.0.0.1'); }
  else throw e;
});
// one 'listening' handler, so the browser opens exactly once
server.once('listening', () => {
  const url = `http://localhost:${port}/game/`;
  console.log(`Infamy is running at ${url}\nClose this window to stop it.`);
  if (process.argv.includes('--open')) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  }
});
let port = 8137, tries = 0;
server.listen(port, '127.0.0.1');
