// Read-only production-asset audit; writes backups/reports and optional proof
// atlases ONLY to new experiment folders. Never edits art.json or live sheets.
// node tools/audit_sprite_packing.mjs audit [experiment-folder]
// node tools/audit_sprite_packing.mjs validate [experiment-folder] [sheet-name]
// Requires sharp (npm install sharp, or set SHARP_MODULE to its module path).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {frameBounds, packFrames, validateLayout, mipBytes} from './sprite_packing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [action = 'audit', folder = 'look_tests/perf/sprite_packing_2026-10-31', sample = 'rival_yakuza_great_sword_slash'] = process.argv.slice(2);
assert.ok(['audit', 'validate'].includes(action), 'Expected audit or validate');
const out = path.resolve(root, folder);
assert.ok(out.startsWith(root + path.sep), 'Experiment must stay in project');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require(process.env.SHARP_MODULE || 'sharp'); }
catch (error) {
  if (process.env.SHARP_MODULE) throw error;
  const runtimeRequire = createRequire(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/check.cjs'));
  sharp = runtimeRequire('sharp');
}
sharp.cache(false); sharp.concurrency(1);
const rgba = file => sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const sum = (rows, key) => rows.reduce((n, row) => n + row[key], 0);
const memory = (before, after) => ({beforeBytes: before, afterBytes: after, savedPercent: +(100 * (1 - after / before)).toFixed(2)});

if (action === 'audit') {
  assert.ok(!fs.existsSync(out), 'Use a new experiment folder; previous results are preserved');
  const art = readJSON(path.join(root, 'game/data/art.json'));
  const glow = readJSON(path.join(root, 'game/data/weapon_glow.json'));
  const civilians = readJSON(path.join(root, 'game/data/civilians.json'));
  const sources = new Map(), models = {}, missingGlows = new Set();
  for (const [model, animations] of Object.entries(art.characters)) {
    const files = new Set();
    for (const entry of Object.values(animations)) {
      const stem = typeof entry === 'string' ? entry : entry.file;
      const color = `${stem}.png`, colorPath = `assets/sprites/${color}`;
      assert.ok(fs.existsSync(path.join(root, colorPath)), `Missing referenced color: ${color}`);
      sources.set(color, {file: colorPath, kind: 'color'}); files.add(color);
      if (glow.weapons?.[glow.models?.[model]]) {
        const file = `${stem}_glow.png`, filePath = `assets/sprites/${file}`;
        if (fs.existsSync(path.join(root, filePath))) { sources.set(file, {file: filePath, kind: 'glow'}); files.add(file); }
        else missingGlows.add(file);
      }
    }
    models[model] = [...files];
  }
  const backup = path.join(root, 'assets/sprites_archive', path.basename(out) + '_backup');
  assert.ok(!fs.existsSync(backup), 'Backup already exists; use a new experiment folder');
  const inputs = [...sources.values()].map(s => s.file).concat([
    'game/data/art.json', 'game/data/weapon_glow.json', 'game/data/civilians.json',
    'game/src/render/characters.js', 'game/src/render/shading.js', 'game/src/render/weapon_lightning.js',
  ]);
  fs.mkdirSync(backup, {recursive: true});
  const manifest = [];
  for (const file of inputs) {
    const source = path.join(root, file), target = path.join(backup, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    const sha256 = hash(source);
    assert.equal(hash(target), sha256, `Backup mismatch: ${file}`);
    manifest.push({file, bytes: fs.statSync(source).size, sha256});
  }
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({created: new Date().toISOString(), files: manifest}, null, 2), {flag: 'wx'});
  fs.mkdirSync(out, {recursive: true});
  console.log(`Backup verified: ${manifest.length} files, ${(sum(manifest, 'bytes') / 1048576).toFixed(1)} MiB. Scanning ${sources.size} unique textures sequentially.`);
  const sheets = [];
  let scanned = 0;
  for (const [name, source] of sources) {
    const sourcePath = path.join(root, source.file);
    const {data, info} = await rgba(sourcePath);
    const frames = frameBounds(data, info.width, info.height);
    const layout = packFrames(frames.bounds, {margin: 8});
    validateLayout(frames.bounds, layout);
    const sensitivity = packFrames(frames.bounds, {margin: 4});
    validateLayout(frames.bounds, sensitivity);
    sheets.push({name, ...source, sha256: manifest.find(f => f.file === source.file).sha256,
      width: info.width, height: info.height, ...frames,
      originalBytes: mipBytes(info.width, info.height), originalBaseBytes: mipBytes(info.width, info.height, false),
      occupiedPixels: frames.bounds.reduce((n, b) => n + b.w * b.h, 0),
      layout, packedBytes: layout.bytes, packedBaseBytes: layout.pages.reduce((n, p) => n + mipBytes(p.width, p.height, false), 0),
      packedBytesMargin4: sensitivity.bytes});
    if (++scanned % 30 === 0) console.log(`Scanned ${scanned}/${sources.size}`);
  }
  const summarize = names => {
    const rows = sheets.filter(s => names.has(s.name));
    return {textures: rows.length, frames: rows.reduce((n, s) => n + s.bounds.length, 0), pages: rows.reduce((n, s) => n + s.layout.pages.length, 0),
      ...memory(sum(rows, 'originalBytes'), sum(rows, 'packedBytes')),
      margin4: memory(sum(rows, 'originalBytes'), sum(rows, 'packedBytesMargin4'))};
  };
  const modelSummaries = Object.fromEntries(Object.entries(models).map(([model, files]) => [model, summarize(new Set(files))]));
  const civilianModels = new Set(Object.values(civilians.types).filter(t => t.count > 0).map(t => t.model));
  const union = names => new Set(names.flatMap(model => models[model] || []));
  const groups = {
    allCatalog: summarize(new Set(sources.keys())),
    civiliansAndPolice: summarize(union([...civilianModels, 'police'])),
    combatAndPolice: summarize(union(Object.keys(models).filter(m => !civilianModels.has(m)))),
    largeFramingModels: summarize(union(Object.keys(art.characterFraming || {}))),
  };
  // Input hashing after the audit establishes it used the same backed-up
  // asset revision. Never silently mix sheets being exported concurrently.
  for (const entry of manifest) assert.equal(hash(path.join(root, entry.file)), entry.sha256, `Source changed during audit: ${entry.file}`);
  const report = {version: 1, created: new Date().toISOString(), backup: path.relative(root, backup),
    policy: {directions: 8, alphaThreshold: 0, margin: 8, sensitivityMargin: 4, maxPage: 2048,
      layout: 'MaxRects best short side, no rotation, candidate widths 64..2048, trimmed power-of-two page allocations',
      allocation: 'RGBA8 with exact full mip chain, one independent packing set per source sheet',
      caveats: ['Texture-allocation estimate, not measured browser RAM or FPS.', 'All-catalog is a unique-asset upper inventory, not simultaneous match residency.',
        'Per-model totals include shared sheets; group unions deduplicate them. No per-unit multiplier.',
        '8px transparent gutters are included. Zoom/mipmap bleed and shader/glow alignment still need an in-game trial.',
        'Existing runtime can load aliases/shared sheets more than once; unique-source accounting is conservative.',
        'Smaller pages increase the number of textures and can increase texture switches; no draw-time improvement is measured.',
        'No frame deduplication, downsampling, rotation, GPU compression or FPS/direction reduction.']},
    originalInputsUnchanged: true, missingOptionalGlows: [...missingGlows], groups, models: modelSummaries, sheets,
    processPeakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024)};
  fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify(report, null, 2), {flag: 'wx'});
  const line = (label, row) => `${label}: ${(row.beforeBytes/1048576).toFixed(1)} -> ${(row.afterBytes/1048576).toFixed(1)} MiB (${row.savedPercent}% saved)`;
  const summary = [
    'OFFLINE SPRITE PACKING AUDIT — not a browser memory measurement',
    `Verified backup: ${report.backup}`, 'Policy: RGBA8, full mip chain, 8px gutter per side, <=2048 POT pages; no frames/pixels removed.',
    ...Object.entries(groups).map(([label, row]) => line(label, row)), '', 'Per model (shared sheets overlap; do not add these rows):',
    ...Object.entries(modelSummaries).map(([label, row]) => line(label, row)), '', ...report.policy.caveats,
  ].join('\n');
  fs.writeFileSync(path.join(out, 'summary.txt'), summary + '\n', {flag: 'wx'});
  console.log(Object.entries(groups).map(([label, row]) => line(label, row)).join('\n'));
  console.log(`Audit saved; originals unchanged. Audit peak RSS ${report.processPeakRssMiB} MiB.`);
} else {
  const report = readJSON(path.join(out, 'audit.json'));
  const selected = report.sheets.filter(s => s.name === `${sample}.png` || s.name === `${sample}_glow.png`);
  assert.ok(selected.some(s => s.kind === 'color'), 'Sample must be a referenced color animation');
  const proof = path.join(out, 'validation_' + sample);
  assert.ok(!fs.existsSync(proof), 'Validation already exists; preserve previous results');
  const backup = path.join(root, report.backup), manifest = readJSON(path.join(backup, 'manifest.json'));
  for (const s of selected) {
    assert.equal(hash(path.join(root, s.file)), s.sha256, `Changed source: ${s.file}`);
    assert.equal(hash(path.join(backup, s.file)), s.sha256, `Backup mismatch: ${s.file}`);
    assert.equal(manifest.files.find(f => f.file === s.file)?.sha256, s.sha256);
  }
  fs.mkdirSync(proof);
  const results = [];
  for (const sheet of selected) {
    const {data: original, info} = await rgba(path.join(root, sheet.file));
    const layout = sheet.layout;
    validateLayout(sheet.bounds, layout);
    const pages = layout.pages.map(p => Buffer.alloc(p.width * p.height * 4));
    for (let i = 0; i < sheet.bounds.length; i++) {
      const b = sheet.bounds[i], p = layout.placements[i];
      if (!p) continue;
      const page = layout.pages[p.page];
      for (let y = 0; y < b.h; y++) {
        const start = ((b.dir * sheet.cell + b.y + y) * sheet.width + b.frame * sheet.cell + b.x) * 4;
        original.copy(pages[p.page], ((p.y + y) * page.width + p.x) * 4, start, start + b.w * 4);
      }
    }
    // Save and decode actual PNGs: validate the complete packed-file round trip,
    // not simply copied buffers. Original full sheet never gets overwritten.
    const decoded = [];
    for (let page = 0; page < pages.length; page++) {
      const file = `${sheet.name.slice(0,-4)}_page${page}.png`, p = layout.pages[page];
      await sharp(pages[page], {raw: {width: p.width, height: p.height, channels: 4}}).png().toFile(path.join(proof, file));
      decoded.push((await rgba(path.join(proof, file))).data);
    }
    const restored = Buffer.alloc(original.length);
    for (let i = 0; i < sheet.bounds.length; i++) {
      const b = sheet.bounds[i], p = layout.placements[i];
      if (!p) continue;
      const page = layout.pages[p.page];
      for (let y = 0; y < b.h; y++) {
        const start = ((p.y + y) * page.width + p.x) * 4;
        decoded[p.page].copy(restored, ((b.dir * sheet.cell + b.y + y) * sheet.width + b.frame * sheet.cell + b.x) * 4, start, start + b.w * 4);
      }
    }
    let visiblePixels = 0, transparentRgbDifferences = 0;
    for (let i = 0; i < original.length; i += 4) {
      assert.equal(restored[i+3], original[i+3], `Alpha mismatch at pixel ${i/4}`);
      if (original[i+3]) {
        visiblePixels++;
        assert.ok(original.subarray(i, i+4).equals(restored.subarray(i, i+4)), `Visible pixel mismatch at ${i/4}`);
      } else if (!original.subarray(i, i+3).equals(restored.subarray(i, i+3))) transparentRgbDifferences++;
    }
    assert.equal(hash(path.join(root, sheet.file)), sheet.sha256);
    results.push({file: sheet.file, cell: sheet.cell, framesPerDirection: sheet.frames, directions: sheet.directions,
      visiblePixels, transparentRgbDifferences, alphaExact: true, visibleRgbaExact: true,
      fullRgbaExact: original.equals(restored), sourceUnchanged: true,
      pages: layout.pages, ...memory(sheet.originalBytes, sheet.packedBytes)});
    console.log(`${sheet.name}: all ${sheet.bounds.length} frame positions, alpha and ${visiblePixels} visible RGBA pixels match exactly.`);
  }
  const color = selected.find(s => s.kind === 'color'), glow = selected.find(s => s.kind === 'glow');
  if (glow) assert.ok(color.frames === glow.frames && color.directions === glow.directions, 'Glow/color frame pairing differs');
  fs.writeFileSync(path.join(proof, 'frames.json'), JSON.stringify(selected.map(s => ({name: s.name, cell: s.cell, frames: s.frames, directions: s.directions, bounds: s.bounds, layout: s.layout})), null, 2));
  const validation = {created: new Date().toISOString(), sample, results,
    note: 'CPU pixel/offset round trip only. Does not validate GPU filtering, shader appearance, trails or browser memory. Fully transparent RGB outside retained bounds may differ.'};
  fs.writeFileSync(path.join(proof, 'validation.json'), JSON.stringify(validation, null, 2));
  console.log('Temporary PNG proof complete. Live catalog, sheets and renderer unchanged.');
}
