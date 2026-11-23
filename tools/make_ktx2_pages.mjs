// GPU-compressed (KTX2, UASTC) copies of the sprite pages (Tim 2026-11-15: high quality, far zoom only by default).
//
//   node tools/make_ktx2_pages.mjs            compress every half page that is missing or older than its PNG
//   node tools/make_ktx2_pages.mjs --full     also compress the full pages (for the "Everywhere" setting)
//   node tools/make_ktx2_pages.mjs --all      make them all again
//   node tools/make_ktx2_pages.mjs --check    only report what is missing or out of date (exit 1 if any)
//   add --only=ship_,boat_                     only pages whose names start with these (2026-11-23: ship full pages)
//
// PNG pages stay as they are; the compressed pages live in their own folders:
//   assets/sprites_packed/catalog_v1_half_ktx2/<name>_half.ktx2   from catalog_v1_half/<name>_half.png
//   assets/sprites_packed/catalog_v1_ktx2/<name>.ktx2             from catalog_v1/<name>.png
// The game uses them when Video settings, Compressed sprites, says so (render/sprite_detail.js); a missing one falls
// back to its PNG. Both folders are local (.gitignore). Pages are stored upside down (the game draws the PNGs flipped
// on load; a compressed page cannot be flipped on load). Needs sharp and ktx2-encoder (npm install).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), all = args.includes('--all'), checkOnly = args.includes('--check'), withFull = args.includes('--full');
const P = d => path.join(root, 'assets/sprites_packed', d);
const sets = [{ from: P('catalog_v1_half'), to: P('catalog_v1_half_ktx2') }, ...(withFull ? [{ from: P('catalog_v1'), to: P('catalog_v1_ktx2') }] : [])];
const ktxName = f => f.replace(/\.png$/, '.ktx2');
const only = args.find(a => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
const picked = f => !only || only.some(p => f.startsWith(p));

const jobs = [], stale = [];
for (const s of sets) {
  const pngs = fs.existsSync(s.from) ? fs.readdirSync(s.from).filter(f => f.endsWith('.png') && picked(f)) : [];
  for (const f of pngs) {
    const out = path.join(s.to, ktxName(f));
    if (all || !fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(path.join(s.from, f)).mtimeMs) jobs.push([path.join(s.from, f), out]);
  }
  const wanted = new Set(pngs.map(ktxName));
  if (fs.existsSync(s.to)) for (const f of fs.readdirSync(s.to)) if (f.endsWith('.ktx2') && picked(f) && !wanted.has(f)) stale.push(path.join(s.to, f));
}
if (checkOnly) { console.log(`${jobs.length} compressed pages missing or out of date, ${stale.length} stale`); process.exit(jobs.length || stale.length ? 1 : 0); }

const req = createRequire(path.join(root, 'package.json'));
let sharp, encodeToKTX2;
try { sharp = req('sharp'); ({ encodeToKTX2 } = await import('ktx2-encoder')); }
catch (e) { console.error('needs sharp and ktx2-encoder: run "npm install" in the game root folder\n' + e.message); process.exit(1); }
const imageDecoder = async buf => {
  const { data, info } = await sharp(buf).flip().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
const options = { isUASTC: true, uastcLDRQualityLevel: 2, needSupercompression: true, generateMipmap: true, imageDecoder, enableDebug: false };

// the encoder prints a line per mip level: keep the console to our own progress
const write = process.stdout.write.bind(process.stdout);
const quiet = () => { process.stdout.write = () => true; console.log = (...a) => { if (!/^(Slice|Encoding|Mode:|basis_)/.test(String(a[0]))) write(a.join(' ') + '\n'); }; };
const log = (...a) => write(a.join(' ') + '\n');
quiet();

const t0 = Date.now(); let done = 0, bytes = 0;
for (const s of sets) fs.mkdirSync(s.to, { recursive: true });
// one page at a time: the encoder is single-threaded wasm; run two copies of this tool on halves of the list with
// --part=0/2 and --part=1/2 to use two cores
const part = args.find(a => a.startsWith('--part='))?.slice(7).split('/').map(Number);
const mine = part ? jobs.filter((_, i) => i % part[1] === part[0]) : jobs;
for (const [src, out] of mine) {
  const ktx = await encodeToKTX2(new Uint8Array(fs.readFileSync(src)), options);
  fs.writeFileSync(out + '.part', ktx); fs.renameSync(out + '.part', out);
  done++; bytes += ktx.length;
  if (done % 25 === 0) log(`  ${done} of ${mine.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
if (stale.length && !part) {
  const bin = path.join(root, 'to_delete/_ktx2_pages_stale'); fs.mkdirSync(bin, { recursive: true });
  for (const f of stale) fs.renameSync(f, path.join(bin, path.basename(f)));
}
log(`Compressed pages: made ${done} of ${mine.length} (${(bytes / 1e6).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)} s${stale.length && !part ? `, moved ${stale.length} stale to to_delete/_ktx2_pages_stale` : ''}`);
