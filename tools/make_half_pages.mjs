// Half-size copies of the packed character pages, for far zoom (2026-11-15).
//
//   node tools/make_half_pages.mjs            make every half page that is missing or older than its full page
//   node tools/make_half_pages.mjs --all      make them all again
//   node tools/make_half_pages.mjs --check    only report what is missing or out of date (exit 1 if any)
//
// Full pages:  assets/sprites_packed/catalog_v1/<name>.png
// Half pages:  assets/sprites_packed/catalog_v1_half/<name>_half.png   (half the width and height, a quarter of the memory)
// The game loads the half pages when the camera is far out and the full pages up close (game/src/render/sprite_detail.js);
// a half page that is missing falls back to its full page. The half folder is local (.gitignore): this tool rebuilds it,
// and tools/repack_model.mjs runs it after every repack. A half page whose full page is gone is moved to to_delete/.
// Needs sharp: npm install sharp (or SHARP_MODULE=<path to sharp>).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), all = args.includes('--all'), checkOnly = args.includes('--check');
const full = path.join(root, 'assets/sprites_packed/catalog_v1'), half = path.join(root, 'assets/sprites_packed/catalog_v1_half');
export const halfName = file => file.replace(/\.png$/, '_half.png');

let sharp;
const loaders = [() => createRequire(import.meta.url)(process.env.SHARP_MODULE),
  () => createRequire(path.join(root, 'package.json'))('sharp'),
  () => createRequire(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/check.cjs'))('sharp')];
for (const load of process.env.SHARP_MODULE ? loaders.slice(0, 1) : loaders.slice(1)) { try { sharp = load(); break; } catch {} }
if (!sharp && !checkOnly) { console.error('sharp not found: run "npm install sharp" in the game folder, or set SHARP_MODULE'); process.exit(1); }

const t0 = Date.now();
const pages = fs.readdirSync(full).filter(f => f.endsWith('.png'));
const todo = pages.filter(f => { if (all) return true; const h = path.join(half, halfName(f)); return !fs.existsSync(h) || fs.statSync(h).mtimeMs < fs.statSync(path.join(full, f)).mtimeMs; });
const wanted = new Set(pages.map(halfName));
const stale = fs.existsSync(half) ? fs.readdirSync(half).filter(f => f.endsWith('.png') && !wanted.has(f)) : [];
if (checkOnly) {
  console.log(`${pages.length} full pages, ${todo.length} half pages missing or out of date, ${stale.length} stale`);
  process.exit(todo.length || stale.length ? 1 : 0);
}
fs.mkdirSync(half, { recursive: true });
let done = 0, bytes = 0;
const work = [...todo];
async function worker() {
  for (let f = work.pop(); f; f = work.pop()) {
    const src = path.join(full, f), meta = await sharp(src).metadata();
    const w = Math.ceil(meta.width / 2), h = Math.ceil(meta.height / 2);
    // sharp resizes with premultiplied alpha, so the transparent surround does not darken the edges
    const buf = await sharp(src).resize(w, h, { kernel: 'lanczos2', fit: 'fill' }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(half, halfName(f)), buf);
    done++; bytes += buf.length;
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
if (stale.length) {
  const bin = path.join(root, 'to_delete/_half_pages_stale'); fs.mkdirSync(bin, { recursive: true });
  for (const f of stale) fs.renameSync(path.join(half, f), path.join(bin, f));
}
console.log(`Half pages: made ${done} of ${pages.length} (${(bytes / 1e6).toFixed(1)} MB)${stale.length ? `, moved ${stale.length} stale to to_delete/_half_pages_stale` : ''} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
