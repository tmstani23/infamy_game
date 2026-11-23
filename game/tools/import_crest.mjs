// Import a painted clan crest (one emblem on a transparent or flat magenta background).
// Prompts: project file art_prompts/icons_and_crests/prompts.md (2026-11-23).
//   node game/tools/import_crest.mjs <yakuza|kuroda|shinobi> <crest.png> [outDir]
// Keys out the magenta (or keeps real transparency), trims, centres on a square with 6% padding and writes
// <outDir>/<clan>.png at 256 px and <outDir>/<clan>_96.png at 96 px, then lists the clan in game/data/ui_art.json.
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isKey, addToManifest } from './slice_icon_sheet.mjs';

const CLANS = ['yakuza', 'kuroda', 'shinobi'];

export async function importCrest(clan, file, outDir) {
  if (!CLANS.includes(clan)) throw new Error(`clan must be one of ${CLANS.join(', ')}`);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 250) opaque++;
  const realAlpha = opaque < W * H * 0.9;
  // a fake grey-and-white checkerboard instead of transparency cannot be keyed reliably
  if (!realAlpha) {
    let keyed = 0;
    for (let i = 0; i < data.length; i += 4) if (isKey(data[i], data[i + 1], data[i + 2])) keyed++;
    if (keyed < W * H * 0.2) throw new Error('no transparency and no magenta background found: regenerate with the flat magenta background line');
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (isKey(r, g, b)) { data[i + 3] = 0; continue; }
      // soft edge: how magenta the pixel still is -> partly transparent, and pull the tint out of its colour
      const spill = Math.max(0, Math.min(r, b) - g) / 255;
      if (spill > 0.25) { data[i + 3] = Math.round(255 * (1 - spill)); data[i] = data[i + 2] = Math.min(r, b, g + 40); }
    }
  }
  const keyed = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const trimmed = await sharp(keyed).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const side = Math.max(trimmed.info.width, trimmed.info.height), padded = Math.round(side / 0.88);
  const square = await sharp({ create: { width: padded, height: padded, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed.data, left: Math.round((padded - trimmed.info.width) / 2), top: Math.round((padded - trimmed.info.height) / 2) }]).png().toBuffer();
  await sharp(square).resize(256, 256, { kernel: 'lanczos3' }).png().toFile(path.join(outDir, `${clan}.png`));
  await sharp(square).resize(96, 96, { kernel: 'lanczos3' }).png().toFile(path.join(outDir, `${clan}_96.png`));
  return realAlpha ? 'kept real transparency' : 'keyed out magenta';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [clan, file, outArg] = process.argv.slice(2);
  if (!clan || !file) { console.log('usage: node game/tools/import_crest.mjs <yakuza|kuroda|shinobi> <crest.png> [outDir]'); process.exit(1); }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const outDir = outArg || path.join(root, 'assets', 'ui', 'crests');
  try {
    (await import('node:fs')).mkdirSync(outDir, { recursive: true });
    const how = await importCrest(clan, file, outDir);
    if (!outArg) addToManifest(path.join(root, 'game', 'data', 'ui_art.json'), 'crests', [clan]);
    console.log(`${clan}: ${how}, wrote ${outDir}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
