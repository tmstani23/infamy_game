// Quick check of the painted icon slicer and crest importer on synthetic sheets (no real art needed).
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { sliceSheet, findTiles, SHEETS } from './slice_icon_sheet.mjs';
import { importCrest } from './import_crest.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
const tile = (x, y, s) => ({ input: { create: { width: s, height: s, channels: 3, background: '#3a2418' } }, left: x, top: y });
const sheet = async (file, cols, rows) => {
  const comps = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) comps.push(tile(60 + c * 360 + (c % 2) * 6, 40 + r * 330 + (r % 2) * 5, 290 + (c % 3) * 4));
  await sharp({ create: { width: 1536, height: 1024, channels: 3, background: '#ff00ff' } }).composite(comps).blur(0.8).png().toFile(file);
};

await sheet(path.join(dir, 'good.png'), 4, 3);
const out = path.join(dir, 'out');
const report = await sliceSheet(path.join(dir, 'good.png'), 1, out);
assert.equal(report.length, 12);
for (const id of SHEETS[1]) {
  const m = await sharp(path.join(out, `${id}.png`)).metadata();
  assert.equal(m.width, 128); assert.equal(m.height, 128);
}
// no magenta left at the corners of a cut icon
// rounded: the very corner is transparent, a pixel a little in from it is painted and not magenta
const { data } = await sharp(path.join(out, 'master', 'dash.png')).raw().toBuffer({ resolveWithObject: true });
assert.equal(data[3], 0, 'corner not rounded');
const p = (40 * 256 + 40) * 4;
assert.equal(data[p + 3], 255); assert.ok(!(data[p] > 150 && data[p + 2] > 150 && data[p + 1] < 110), 'magenta left inside');

// --only: cut tile 2 alone, the rest stay as they were
const before = fs.statSync(path.join(out, 'master', 'dash.png')).mtimeMs;
assert.equal((await sliceSheet(path.join(dir, 'good.png'), 1, out, [2])).length, 1);
assert.equal(fs.statSync(path.join(out, 'master', 'dash.png')).mtimeMs, before);

await sheet(path.join(dir, 'wrong.png'), 4, 2);
await assert.rejects(findTiles(path.join(dir, 'wrong.png')), /expected 4 columns x 3 rows/);

// crest on magenta: keyed to transparent corners, square 256 output
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ff00ff' } })
  .composite([{ input: Buffer.from('<svg width="1024" height="1024"><circle cx="512" cy="480" r="300" fill="#e8dcc0"/></svg>'), left: 0, top: 0 }])
  .png().toFile(path.join(dir, 'crest.png'));
assert.equal(await importCrest('kuroda', path.join(dir, 'crest.png'), dir), 'keyed out magenta');
const c = await sharp(path.join(dir, 'kuroda.png')).raw().toBuffer({ resolveWithObject: true });
assert.equal(c.info.width, 256); assert.equal(c.data[3], 0);
await assert.rejects(importCrest('kuroda', path.join(dir, 'wrong.png').replace('wrong', 'nope'), dir));

fs.rmSync(dir, { recursive: true, force: true });
console.log('icon slicer ok');
