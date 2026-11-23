// Cut a painted ability icon sheet (4 columns x 3 rows of square paintings on flat magenta gutters) into icons.
// Prompts: project file art_prompts/icons_and_crests/prompts.md (2026-11-23).
//   node game/tools/slice_icon_sheet.mjs <sheet.png> <1|2|3> [--only 1,5,9] [outDir]
// --only cuts just those tiles (numbered 1 to 12, left to right, top row first) and leaves the other icons alone,
// to keep the best tiles of two generations.
// Finds the tiles by the magenta, not by fixed positions, and refuses anything but exactly 4 x 3 so names never shift.
// Writes <outDir>/<id>.png at 128 px, <outDir>/master/<id>.png at 256 px, <outDir>/preview_sheet<N>.png
// (each icon at 64 and 48 px on dark wood), and adds the ids to game/data/ui_art.json.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHEETS = {
  1: ['dash', 'intimidate', 'rally', 'lantern', 'sweep', 'reprisal', 'threefold', 'formation', 'shadowstep', 'distract', 'smoke', 'assassinate'],
  2: ['torch', 'charm', 'aimed', 'taunt', 'dogs', 'gatling', 'firebomb', 'hamstring', 'boarding', 'ambush', 'veil', 'detect'],
  3: ['battle_hardened', 'shadowcraft', 'attack', 'snared', 'stunned', 'downed', 'charmed', 'intimidated', 'critsurge', 'shroud', 'pursuit', 'watchtower'],
};
const COLS = 4, ROWS = 3;
// rounded corners (Tim 2026-11-23: "round the corners a bit"): radius as a share of the icon side, cut into the alpha
export const CORNER = 0.12;
const rounded = (buf, size) => sharp(buf).ensureAlpha().composite([{ input: Buffer.from(
  `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * CORNER)}" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer();

// magenta-ish: strong red and blue, weak green (tolerant of JPEG-ish noise and soft edges)
export const isKey = (r, g, b) => r > 150 && b > 150 && g < 110 && Math.abs(r - b) < 90;

// runs of indices where the painted share is above the threshold; tiny runs (noise) are dropped
function bands(counts, total, minLen) {
  const out = []; let start = -1;
  counts.forEach((c, i) => {
    const on = c / total > 0.35;
    if (on && start < 0) start = i;
    if ((!on || i === counts.length - 1) && start >= 0) { const end = on ? i : i - 1; if (end - start + 1 >= minLen) out.push([start, end]); start = -1; }
  });
  return out;
}

export async function findTiles(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const paint = new Uint8Array(W * H);
  const colCount = new Array(W).fill(0), rowCount = new Array(H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    if (!isKey(data[i], data[i + 1], data[i + 2])) { paint[y * W + x] = 1; colCount[x]++; rowCount[y]++; }
  }
  const cols = bands(colCount, H, W * 0.06), rows = bands(rowCount, W, H * 0.06);
  if (cols.length !== COLS || rows.length !== ROWS)
    throw new Error(`expected ${COLS} columns x ${ROWS} rows of tiles, found ${cols.length} x ${rows.length}: regenerate the sheet`);
  const tiles = [];
  for (const [y0, y1] of rows) for (const [x0, x1] of cols) {
    // tighten to this tile's own painted box (bands can be widened by a neighbour's wobble)
    let a = x1, b = x0, c = y1, d = y0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (paint[y * W + x]) { if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; }
    const w = b - a + 1, h = d - c + 1;
    if (Math.max(w, h) / Math.min(w, h) > 1.15) throw new Error(`tile at ${a},${c} is ${w}x${h}, not square: regenerate the sheet`);
    // square it about the centre, then inset 3% to drop the soft magenta fringe
    const side = Math.min(w, h), inset = Math.ceil(side * 0.03);
    const s = side - 2 * inset;
    tiles.push({ left: Math.round(a + (w - side) / 2) + inset, top: Math.round(c + (h - side) / 2) + inset, width: s, height: s });
  }
  return { tiles, width: W, height: H };
}

// replace any pixel still keyed or magenta-tinted with the mean of its unkeyed neighbours (edge clean-up)
async function despill(buf, size) {
  const { data } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const tinted = (r, g, b) => isKey(r, g, b) || (r - g > 60 && b - g > 60);
  let fixed = 0;
  for (let pass = 0; pass < 3; pass++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 3;
    if (!tinted(data[i], data[i + 1], data[i + 2])) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
      const j = (yy * size + xx) * 3; if (tinted(data[j], data[j + 1], data[j + 2])) continue;
      r += data[j]; g += data[j + 1]; b += data[j + 2]; n++;
    }
    if (n) { data[i] = r / n; data[i + 1] = g / n; data[i + 2] = b / n; fixed++; }
  }
  return { buf: await sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer(), fixed };
}

export async function sliceSheet(file, sheet, outDir, only = null) {
  const ids = SHEETS[sheet];
  if (!ids) throw new Error(`sheet must be 1, 2 or 3, got ${sheet}`);
  const { tiles } = await findTiles(file);
  fs.mkdirSync(path.join(outDir, 'master'), { recursive: true });
  const report = [];
  for (let k = 0; k < ids.length; k++) {
    if (only && !only.includes(k + 1)) continue;
    const master = await sharp(file).removeAlpha().extract(tiles[k]).resize(256, 256, { kernel: 'lanczos3' }).png().toBuffer();
    const { buf, fixed } = await despill(master, 256);
    const round = await rounded(buf, 256);
    fs.writeFileSync(path.join(outDir, 'master', `${ids[k]}.png`), round);
    await sharp(round).resize(128, 128, { kernel: 'lanczos3' }).png().toFile(path.join(outDir, `${ids[k]}.png`));
    report.push(`${ids[k]}: ${tiles[k].width}px tile${fixed ? `, ${fixed} fringe px cleaned` : ''}`);
  }
  const have = ids.filter(id => fs.existsSync(path.join(outDir, 'master', `${id}.png`)));
  if (have.length === ids.length) await preview(outDir, ids, path.join(outDir, `preview_sheet${sheet}.png`));
  return report;
}

// every icon at 64 and 48 px on dark wood, the sizes they show at in the action bar
async function preview(outDir, ids, out) {
  const pad = 14, cell = 64 + 48 + pad * 2, width = pad + 6 * cell, height = 2 * (64 + pad) + pad;
  const comps = [];
  ids.forEach((id, k) => {
    const col = k % 6, row = Math.floor(k / 6), x = pad + col * cell, y = pad + row * (64 + pad);
    const src = path.join(outDir, 'master', `${id}.png`);
    comps.push({ input: src, size: 64, left: x, top: y });
    comps.push({ input: src, size: 48, left: x + 64 + pad, top: y + 8 });
  });
  const bufs = await Promise.all(comps.map(c => sharp(c.input).resize(c.size, c.size).png().toBuffer()));
  await sharp({ create: { width, height, channels: 3, background: '#2a1c14' } })
    .composite(bufs.map((b, i) => ({ input: b, left: comps[i].left, top: comps[i].top }))).png().toFile(out);
}

// game/data/ui_art.json: which ids have painted art (the HUD falls back to the line icon for the rest)
export function addToManifest(manifestFile, kind, ids) {
  let m = { _note: 'Painted UI art present in the game folder (art_prompts/icons_and_crests). abilities: assets/ui/abilities/<id>.png; crests: assets/ui/crests/<clan>.png. Anything not listed uses the drawn fallback.', abilities: [], crests: [] };
  try { m = { ...m, ...JSON.parse(fs.readFileSync(manifestFile, 'utf8')) }; } catch {}
  m[kind] = [...new Set([...(m[kind] || []), ...ids])].sort();
  fs.writeFileSync(manifestFile, JSON.stringify(m, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--only');
  const only = at >= 0 ? args.splice(at, 2)[1].split(',').map(Number) : null;
  const [file, sheet, outArg] = args;
  if (!file || !sheet) { console.log('usage: node game/tools/slice_icon_sheet.mjs <sheet.png> <1|2|3> [outDir]'); process.exit(1); }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const outDir = outArg || path.join(root, 'assets', 'ui', 'abilities');
  try {
    const report = await sliceSheet(file, Number(sheet), outDir, only);
    if (!outArg) addToManifest(path.join(root, 'game', 'data', 'ui_art.json'), 'abilities', SHEETS[Number(sheet)].filter((id, k) => !only || only.includes(k + 1)));
    console.log(report.join('\n'));
    console.log(`wrote ${report.length} icons to ${outDir}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
