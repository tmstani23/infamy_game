// Island ground textures (frontier W3.10): makes game/art/ground/island/<id>.jpg from the sources named in
// game/data/world_paint.json (`materials.<id>.src`). Every texture comes out square at `size` px, JPEG, so the
// ground shader can keep them all in one texture array. Textures marked `seamless` (the snow lowland set and the
// mountain tops, which were generated as single pictures) get their edges blended: the picture is mixed with a
// copy shifted by half its size, the mix weight fading to zero at the edges, so left meets right and top meets bottom.
// Source art stays untouched (it is not versioned; the small JPEGs here are).
//   node tools/import_island_ground.mjs
import fs from 'node:fs';
import sharp from 'sharp';

const cfg = JSON.parse(fs.readFileSync('game/data/world_paint.json', 'utf8'));
const size = cfg.size, out = 'game/art/ground/island/';
const selected = new Set(process.argv.slice(2));
fs.mkdirSync(out, { recursive: true });

function makeSeamless(px, W, H) {
  const rolled = Buffer.from(px);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (((y + H / 2) % H) * W + (x + W / 2) % W) * 3, d = (y * W + x) * 3;
    rolled[d] = px[s]; rolled[d + 1] = px[s + 1]; rolled[d + 2] = px[s + 2];
  }
  const res = Buffer.alloc(px.length);
  for (let y = 0; y < H; y++) {
    const ay = Math.sin(Math.PI * (y + 0.5) / H) ** 2;
    for (let x = 0; x < W; x++) {
      const a = Math.sin(Math.PI * (x + 0.5) / W) ** 2 * ay, d = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) res[d + c] = Math.round(px[d + c] * a + rolled[d + c] * (1 - a));
    }
  }
  return res;
}

let total = 0;
for (const [id, m] of Object.entries(cfg.materials)) {
  if (selected.size && !selected.has(id)) continue;
  const { data } = await sharp(m.src).removeAlpha().resize(size, size, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const px = m.seamless ? makeSeamless(data, size, size) : data;
  const file = out + id + '.jpg';
  await sharp(px, { raw: { width: size, height: size, channels: 3 } }).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  total += fs.statSync(file).size;
}
// Island water (W3.11 P1): the city water picture is brighter along its bottom edge, made for mirrored repeat;
// on the island it showed as a crisscross of light bands, so the island gets its own edge-blended copy.
if (!selected.size) {
  const { data, info } = await sharp('game/art/ground/water.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const file = out + 'water.jpg';
  await sharp(makeSeamless(data, info.width, info.height), { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  total += fs.statSync(file).size;
}
// Top-down decals (Part B): lake bank strips, resized to what they are drawn at
// (a 30-unit strip at the normal zoom of about 37 px per unit).
const decals = { ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(i => [`lake_edge_${i}`, 768])) };   // river_ford: the W3.9 copy (1024 px) is used as is
for (const [name, px] of Object.entries(selected.size ? {} : decals)) {
  const file = `game/art/props/${name}.png`;
  await sharp(`assets/environment/island/${name}.png`).ensureAlpha().resize(px, px, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(file + '.tmp');
  fs.renameSync(file + '.tmp', file);
  total += fs.statSync(file).size;
}
console.log(`import_island_ground: ${selected.size || Object.keys(cfg.materials).length} textures (${size}px) + ${selected.size ? 0 : Object.keys(decals).length} decals, ${(total / 1048576).toFixed(1)} MB`);
