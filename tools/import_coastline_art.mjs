// Preserve the generated pixels and source images. Calibrate source rows from
// the actual painted band rather than the requested canvas or nominal endpoints.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const configFile = 'game/data/coastline.json';
const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const report = {};
const median = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const [family, m] of Object.entries(cfg.materials)) {
  const source = fs.readFileSync(m.src);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const tops = [], bottoms = [];
  for (let x = 0; x < info.width; x += 4) {
    let top = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * 4 + 3] > 128) { if (top < 0) top = y; bottom = y; }
    if (top >= 0) { tops.push(top); bottoms.push(bottom); }
  }
  if (!tops.length) throw new Error(`No usable painted strip: ${m.src}`);
  const top = median(tops) / info.height, bottom = median(bottoms) / info.height;
  m.rows = [Math.max(0, top - 0.025), Math.max(top, bottom - 0.025), Math.min(1, bottom + 0.08)].map(v => +v.toFixed(6));
  m.pixels = [info.width, info.height];
  const dest = path.join('game', m.file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, source);
  report[family] = { source: m.src, runtime: dest, pixels: m.pixels, rows: m.rows,
    sha256: crypto.createHash('sha256').update(source).digest('hex'), resized: false, alphaPreserved: true };
}
fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + '\n');
fs.writeFileSync('game/art/ground/coast/import_manifest.json', JSON.stringify(report, null, 2) + '\n');
console.log('Imported wet/dry/snow coastline strips unchanged; calibrated actual band rows.');
