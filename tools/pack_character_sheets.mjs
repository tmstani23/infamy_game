// Catalog rollout using audited layouts; every unique source is packed once.
// node tools/pack_character_sheets.mjs [NEW output-folder]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {validateLayout} from './sprite_packing.mjs';
import {bladeAxes} from '../game/src/render/weapon_lightning_pattern.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || 'assets/sprites_packed/catalog_v1');
assert.ok(out.startsWith(path.join(root, 'assets/sprites_packed') + path.sep));
assert.ok(!fs.existsSync(out), 'Use a new folder; existing trial assets are preserved');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const art = read('game/data/art.json'), audit = read('look_tests/perf/sprite_packing_2026-10-31/audit.json');
// Police and civilian checkpoint first, then the remaining catalog.
const modelNames = ['police', 'merchant', ...Object.keys(art.characters).filter(n => !['police','merchant'].includes(n))];
const sources = new Set(modelNames.flatMap(n => Object.values(art.characters[n]).map(e => typeof e === 'string' ? e : e.file)));
const backup = path.join(root, 'assets/sprites_archive', path.basename(out) + '_runtime_backup');
assert.ok(!fs.existsSync(backup), 'Backup already exists; choose a new output folder');
const backed = [];
fs.mkdirSync(backup, {recursive: true});
for (const file of ['game/data/art.json', 'game/src/render/characters.js', 'game/src/render/shading.js',
  'game/src/render/weapon_lightning_pattern.js', 'game/src/render/run_trail.js', 'game/src/render/sheet_cache.js', 'game/src/render/packed_sheets.js']) {
  const target = path.join(backup, file), source = path.join(root, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  assert.equal(hash(target), hash(source));
  backed.push({file, sha256: hash(source)});
}
for (const stem of sources) for (const name of [`${stem}.png`, `${stem}_glow.png`]) {
  const sheet = audit.sheets.find(s => s.name === name);
  if (!sheet && name.endsWith('_glow.png')) continue;
  assert.ok(sheet, `Missing audited sheet ${name}`);
  assert.equal(hash(path.join(root, sheet.file)), sheet.sha256, `Changed original ${name}`);
  assert.equal(hash(path.join(root, audit.backup, sheet.file)), sheet.sha256, `Backup mismatch ${name}`);
}
fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({created: new Date().toISOString(), files: backed,
  originalSheetsBackup: audit.backup}, null, 2));
console.log('Pre-change code/catalog backup verified; all referenced original textures match the source backup.');
let sharp;
try { sharp = createRequire(import.meta.url)(process.env.SHARP_MODULE || 'sharp'); }
catch (error) {
  if (process.env.SHARP_MODULE) throw error;
  sharp = createRequire(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/check.cjs'))('sharp');
}
sharp.cache(false); sharp.concurrency(1);
fs.mkdirSync(out, {recursive: true});
const manifest = {version: 1, directions: 8, margin: 8, sheets: {},
  sourceBackup: audit.backup, codeBackup: path.relative(root, backup), verification: {frames: 0, visiblePixels: 0, originalBytes: 0, packedBytes: 0}};
for (const stem of sources) {
  const record = {};
  for (const kind of ['color', 'glow']) {
    const name = `${stem}${kind === 'glow' ? '_glow' : ''}.png`, sheet = audit.sheets.find(s => s.name === name);
    if (!sheet && kind === 'glow') continue;
    validateLayout(sheet.bounds, sheet.layout);
    const {data: original} = await sharp(path.join(root, sheet.file)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const pageBuffers = sheet.layout.pages.map(p => Buffer.alloc(p.width * p.height * 4));
    for (let i = 0; i < sheet.bounds.length; i++) {
      const b = sheet.bounds[i], p = sheet.layout.placements[i];
      if (!p) continue;
      const page = sheet.layout.pages[p.page];
      for (let y = 0; y < b.h; y++) {
        const start = ((b.dir * sheet.cell + b.y + y) * sheet.width + b.frame * sheet.cell + b.x) * 4;
        original.copy(pageBuffers[p.page], ((p.y+y) * page.width + p.x) * 4, start, start + b.w * 4);
      }
    }
    const pages = [], decoded = [];
    for (let i = 0; i < pageBuffers.length; i++) {
      const {width, height} = sheet.layout.pages[i], file = `${stem}_${kind}_${i}.png`;
      await sharp(pageBuffers[i], {raw: {width, height, channels: 4}}).png().toFile(path.join(out, file));
      const pixels = await sharp(path.join(out, file)).ensureAlpha().raw().toBuffer();
      assert.ok(pixels.equals(pageBuffers[i]), 'Packed PNG round trip differs');
      decoded.push(pixels); pages.push({file, width, height});
    }
    let visiblePixels = 0;
    // Check every original pixel against reconstructed atlas coordinates,
    // including alpha-zero pixels outside crops and faint glow alpha=1.
    for (let index = 0; index < sheet.bounds.length; index++) {
      const b = sheet.bounds[index], p = sheet.layout.placements[index];
      for (let y = 0; y < sheet.cell; y++) for (let x = 0; x < sheet.cell; x++) {
        const start = ((b.dir * sheet.cell + y) * sheet.width + b.frame * sheet.cell + x) * 4;
        const inside = p && x >= b.x && x < b.x+b.w && y >= b.y && y < b.y+b.h;
        if (!inside) { assert.equal(original[start+3], 0); continue; }
        const packedStart = ((p.y+y-b.y) * pages[p.page].width + p.x+x-b.x) * 4;
        for (let c = 0; c < 4; c++) assert.equal(decoded[p.page][packedStart+c], original[start+c]);
        if (original[start+3]) visiblePixels++;
      }
    }
    record[kind] = {cell: sheet.cell, frames: sheet.frames, pages,
      regions: sheet.bounds.map((b, i) => {
        const p = sheet.layout.placements[i];
        return p ? {page: p.page, x: p.x, y: p.y, left: b.x, top: b.y, width: b.w, height: b.h} : null;
      })};
    if (kind === 'glow') record.bladeAxes = bladeAxes(original, sheet.width, sheet.height, sheet.frames);
    manifest.verification.frames += sheet.bounds.length;
    manifest.verification.visiblePixels += visiblePixels;
    manifest.verification.originalBytes += sheet.originalBytes;
    manifest.verification.packedBytes += sheet.packedBytes;
    record[kind].source = {file: sheet.file, sha256: sheet.sha256};
    assert.equal(hash(path.join(root, sheet.file)), sheet.sha256, 'Source changed during packing');
  }
  manifest.sheets[stem] = record;
  if (Object.keys(manifest.sheets).length % 20 === 0) console.log(`Verified ${Object.keys(manifest.sheets).length}/${sources.size} animation sets`);
}
for (const model of modelNames) {
  const stems = new Set(Object.values(art.characters[model]).map(e => typeof e === 'string' ? e : e.file));
  const sheets = Object.fromEntries([...stems].map(s => [s, manifest.sheets[s]]));
  const rows = audit.sheets.filter(s => [...stems].some(stem => s.name === `${stem}.png` || s.name === `${stem}_glow.png`));
  const verification = {frames: rows.reduce((n,s)=>n+s.bounds.length,0), originalBytes: rows.reduce((n,s)=>n+s.originalBytes,0), packedBytes: rows.reduce((n,s)=>n+s.packedBytes,0)};
  fs.writeFileSync(path.join(out, `${model}.json`), JSON.stringify({...manifest, model, sheets, verification}, null, 2));
}
fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({models:modelNames.length, sources:sources.size, ...manifest.verification}, null, 2));
const v = manifest.verification;
console.log(`Catalog textures: ${(v.originalBytes/1048576).toFixed(1)} -> ${(v.packedBytes/1048576).toFixed(1)} MiB including mips; all original PNGs unchanged.`);
