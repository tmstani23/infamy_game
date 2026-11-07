// Repack only the named characters into the live packed catalog, in seconds.
// Use after exporting new or changed sheets (new character, new held item):
//
//   node tools/repack_model.mjs koruda_enforcer            (one model)
//   node tools/repack_model.mjs thug brute --margin=4      (several, 4 px gutters)
//   node tools/repack_model.mjs --all                      (every model; slow)
//   add --dry to report sizes without writing anything
//   add --portrait to pack character-page portraits instead (one front row at 512 px,
//       from tools/export_sprites.mjs --portrait) into assets/sprites_packed/portraits/
//
// Reads   game/data/art.json (which sheets each model uses, packedCharacters path)
//         game/data/weapon_glow.json (models with a weapon get _glow sheets packed too)
//         assets/sprites/<sheet>.png (+ _glow.png)
// Writes  the catalog pages <sheet>_<color|glow>_<n>.png and <model>.json for the
//         named models, plus any other model sharing those sheets (its JSON is
//         updated in place). A new model is added to art.json packedCharacters.
// Old pages and JSONs are MOVED to assets/sprites_archive/repack_<date>/ first
// (never deleted). Every page is decoded again and checked pixel for pixel.
// Needs sharp: npm install sharp (or SHARP_MODULE=<path to sharp>).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {frameBounds, packFrames, validateLayout, mipBytes} from './sprite_packing.mjs';
import {bladeAxes} from '../game/src/render/weapon_lightning_pattern.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => args.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
const margin = Number(flag('margin')?.split('=')[1] ?? 8);
const dry = !!flag('dry'), portrait = !!flag('portrait');
const PORTRAIT_ROW = 7;   // the portrait's single row stands in for sheet row 7 (front view)
assert.ok(Number.isInteger(margin) && margin >= 2 && margin <= 16, '--margin must be 2..16');

const rel = p => path.relative(root, p).replaceAll('\\', '/');
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const hash = buf => createHash('sha256').update(buf).digest('hex');
const artFile = 'game/data/art.json', art = readJSON(artFile), glow = readJSON('game/data/weapon_glow.json');
const stemOf = e => typeof e === 'string' ? e : e.file;
const stemsOf = model => portrait ? [`${model}_portrait_idle`] : [...new Set(Object.values(art.characters[model]).map(stemOf))];
const sheetDir = portrait ? 'assets/sprites/portraits' : 'assets/sprites', directions = portrait ? 1 : 8;
// long vehicles may have 16 or 32 rows (tools/export_sprites.mjs MOUNTS dirs, recorded in assets/sprites/mounts.json)
const mountInfo = fs.existsSync(path.join(root, 'assets/sprites/mounts.json')) ? readJSON('assets/sprites/mounts.json') : {};
const rowsOf = stem => portrait ? 1 : mountInfo[stem]?.dirs || directions;
const modelRows = m => portrait ? 8 : rowsOf(stemsOf(m)[0]);
const hasGlow = model => !!glow.weapons?.[glow.models?.[model]];

let models = args.filter(a => !a.startsWith('--'));
if (flag('all')) models = Object.keys(art.characters);
assert.ok(models.length, 'Name at least one model (keys of art.json "characters"), or --all');
for (const m of models) assert.ok(art.characters[m], `Unknown model ${m}`);

// Catalog folder: where the existing packed models live (default catalog_v1).
const firstPacked = Object.values(art.packedCharacters || {})[0] || '../assets/sprites_packed/catalog_v1/x.json';
const catalog = portrait ? path.join(root, 'assets/sprites_packed/portraits') : path.resolve(root, 'game', path.dirname(firstPacked));
assert.ok(rel(catalog).startsWith('assets/sprites_packed/'), 'Catalog must be under assets/sprites_packed');

// Any other model sharing a repacked sheet gets its JSON refreshed as well.
const stems = new Set(models.flatMap(stemsOf));
const affected = portrait ? models : Object.keys(art.characters).filter(m => models.includes(m) || stemsOf(m).some(s => stems.has(s)));
for (const m of affected) if (!models.includes(m)) console.log(`  ${m} shares sheets; its catalog JSON is updated too`);
for (const m of affected) for (const s of stemsOf(m)) stems.add(s);   // pack its other sheets too, keeps one margin per JSON

let sharp;
// sharp from SHARP_MODULE, the game folder's node_modules, or the Codex runtime cache.
const loaders = [() => createRequire(import.meta.url)(process.env.SHARP_MODULE),
  () => createRequire(path.join(root, 'package.json'))('sharp'),
  () => createRequire(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/check.cjs'))('sharp')];
for (const load of process.env.SHARP_MODULE ? loaders.slice(0, 1) : loaders.slice(1)) { try { sharp = load(); break; } catch {} }
assert.ok(sharp, 'sharp not found: run "npm install sharp" in the game folder, or set SHARP_MODULE');
sharp.cache(false); sharp.concurrency(1);

const date = new Date().toISOString().slice(0, 10);
const archive = path.join(root, 'assets/sprites_archive', `repack_${date}`);
const moveToArchive = file => {
  const src = path.join(catalog, file);
  if (!fs.existsSync(src)) return;
  const dst = path.join(archive, file);
  fs.mkdirSync(path.dirname(dst), {recursive: true});
  if (fs.existsSync(dst)) fs.renameSync(dst, dst.replace(/(\.\w+)$/, `_${Date.now()}$1`));
  fs.renameSync(src, dst);
};

// The game always addresses 8 direction rows; a portrait fills row 7 only.
const toEightRows = (list, frames) => portrait
  ? Array.from({length: 8 * frames}, (_, i) => Math.floor(i / frames) === PORTRAIT_ROW ? list[i % frames] : null) : list;

// Pack each sheet once (shared sheets are shared records).
const records = {}, stats = {};
const t0 = Date.now();
for (const stem of stems) {
  const record = {}, glowWanted = affected.some(m => hasGlow(m) && stemsOf(m).includes(stem));
  for (const kind of ['color', 'glow']) {
    const file = path.join(root, sheetDir, `${stem}${kind === 'glow' ? '_glow' : ''}.png`);
    if (kind === 'glow' && (!glowWanted || !fs.existsSync(file))) continue;
    assert.ok(fs.existsSync(file), `Missing sheet ${rel(file)}`);
    const source = fs.readFileSync(file);
    const {data: original, info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const fb = frameBounds(original, info.width, info.height, rowsOf(stem));
    const layout = packFrames(fb.bounds, {margin});
    validateLayout(fb.bounds, layout);
    const pageBuffers = layout.pages.map(p => Buffer.alloc(p.width * p.height * 4));
    fb.bounds.forEach((b, i) => {
      const p = layout.placements[i]; if (!p) return;
      const pw = layout.pages[p.page].width;
      for (let y = 0; y < b.h; y++) {
        const start = ((b.dir * fb.cell + b.y + y) * info.width + b.frame * fb.cell + b.x) * 4;
        original.copy(pageBuffers[p.page], ((p.y + y) * pw + p.x) * 4, start, start + b.w * 4);
      }
    });
    const pages = await Promise.all(pageBuffers.map(async (buf, i) => {
      const {width, height} = layout.pages[i];
      const png = await sharp(buf, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
      const back = await sharp(png).ensureAlpha().raw().toBuffer();
      assert.ok(back.equals(buf), `PNG round trip differs: ${stem} ${kind} page ${i}`);
      return {file: `${stem}_${kind}_${i}.png`, width, height, png};
    }));
    // Every visible original pixel must be where the regions say it is.
    fb.bounds.forEach((b, i) => {
      const p = layout.placements[i];
      if (!p) return;
      const pw = layout.pages[p.page].width;
      for (let y = 0; y < b.h; y++) {
        const a = ((b.dir * fb.cell + b.y + y) * info.width + b.frame * fb.cell + b.x) * 4, o = ((p.y + y) * pw + p.x) * 4;
        assert.ok(original.subarray(a, a + b.w * 4).equals(pageBuffers[p.page].subarray(o, o + b.w * 4)), `Region mismatch ${stem} ${kind}`);
      }
    });
    record[kind] = {cell: fb.cell, frames: fb.frames, margin, pages,
      regions: toEightRows(fb.bounds.map((b, i) => {
        const p = layout.placements[i];
        return p ? {page: p.page, x: p.x, y: p.y, left: b.x, top: b.y, width: b.w, height: b.h} : null;
      }), fb.frames),
      source: {file: rel(file), sha256: hash(source)}};
    if (kind === 'glow') record.bladeAxes = toEightRows(bladeAxes(original, info.width, info.height, fb.frames, rowsOf(stem)), fb.frames);
    stats[`${stem}:${kind}`] = {frames: fb.bounds.length, originalBytes: mipBytes(info.width, info.height), packedBytes: layout.bytes};
  }
  if (record.glow) assert.equal(record.glow.frames, record.color.frames, `${stem}: colour/glow frame counts differ`);
  records[stem] = record;
}

const sum = (keys, k) => keys.reduce((n, key) => n + (stats[key]?.[k] || 0), 0);
const MiB = n => (n / 1048576).toFixed(1);
for (const m of affected) {
  const keys = stemsOf(m).flatMap(s => [`${s}:color`, `${s}:glow`]);
  const pages = stemsOf(m).reduce((n, s) => n + (records[s].color.pages.length + (records[s].glow?.pages.length || 0)), 0);
  console.log(`${m}: ${MiB(sum(keys, 'originalBytes'))} -> ${MiB(sum(keys, 'packedBytes'))} MiB with mips, ${pages} pages, ${margin} px gutter`);
}
if (dry) { console.log(`Dry run: nothing written (${((Date.now() - t0) / 1000).toFixed(1)} s).`); process.exit(0); }

// Archive the old pages of every repacked sheet, and the old model JSONs.
const oldPrefixes = [...stems].map(s => [`${s}_color_`, `${s}_glow_`]).flat();
const oldPages = fs.existsSync(catalog) ? fs.readdirSync(catalog).filter(f => oldPrefixes.some(p => f.startsWith(p) && /^\d+\.png$/.test(f.slice(p.length)))) : [];
fs.mkdirSync(catalog, {recursive: true});
for (const f of oldPages) moveToArchive(f);
for (const m of affected) moveToArchive(`${m}.json`);

for (const record of Object.values(records)) for (const ch of [record.color, record.glow].filter(Boolean)) {
  for (const p of ch.pages) { fs.writeFileSync(path.join(catalog, p.file), p.png); delete p.png; }
}
for (const m of affected) {
  const keys = stemsOf(m).flatMap(s => [`${s}:color`, `${s}:glow`]);
  const json = {version: 1, directions: modelRows(m), margin, model: m, sheets: Object.fromEntries(stemsOf(m).map(s => [s, records[s]])),
    repacked: new Date().toISOString(), tool: 'tools/repack_model.mjs',
    verification: {frames: sum(keys, 'frames'), originalBytes: sum(keys, 'originalBytes'), packedBytes: sum(keys, 'packedBytes')}};
  fs.writeFileSync(path.join(catalog, `${m}.json`), JSON.stringify(json));
  const link = `../${rel(catalog)}/${m}.json`;
  if (!portrait && art.packedCharacters?.[m] !== link) {
    art.packedCharacters = {...art.packedCharacters, [m]: link};
    console.log(`  added ${m} to art.json packedCharacters`);
  }
}
if (JSON.stringify(readJSON(artFile).packedCharacters) !== JSON.stringify(art.packedCharacters)) {
  // Targeted edit: replace only the packedCharacters line, keep the rest of art.json as written.
  const text = fs.readFileSync(path.join(root, artFile), 'utf8');
  const next = text.replace(/"packedCharacters":\s*\{[^}]*\}/, `"packedCharacters": ${JSON.stringify(art.packedCharacters)}`);
  assert.notEqual(next, text, 'Could not update packedCharacters in art.json');
  fs.writeFileSync(path.join(root, artFile), next);
}
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)} s. Old files: ${oldPages.length ? rel(archive) : 'none'}. Ctrl+F5 in the browser to see the new pages.`);
