// Actual generated manifest + renderer addressing/fallback, no browser/GL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import os from 'node:os';
import {loadPackedSheets, loadSheetSet, setSheetFrame} from '../src/render/packed_sheets.js';
import {bladeAxes} from '../src/render/weapon_lightning_pattern.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const art = read(path.join(root, 'game/data/art.json'));
assert.deepEqual(Object.keys(art.packedCharacters), ['rival_yakuza'], 'only the approved hero is converted');
const url = new URL('../../assets/sprites_packed/rival_yakuza_v1/manifest.json', import.meta.url).href;
const manifest = read(fileURLToPath(url)), names = art.characters.rival_yakuza;
// Backups are deliberately local/uncommitted. Compare them when available,
// but the committed test also works on a fresh checkout without archives.
const backupFile = path.join(root, manifest.codeBackup, 'game/data/art.json');
if (fs.existsSync(backupFile)) {
  const originalArt = read(backupFile);
  assert.deepEqual(art.characters, originalArt.characters, 'all animation names/speeds and other models are unchanged');
  assert.deepEqual(art.characterFraming, originalArt.characterFraming);
}
let sharp;
try { sharp = createRequire(import.meta.url)(process.env.SHARP_MODULE || 'sharp'); }
catch { sharp = createRequire(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/check.cjs'))('sharp'); }
sharp.cache(false); sharp.concurrency(1);
const textures = new Map();
const options = {url, model: 'rival_yakuza', names, requireGlow: true, loadJson: async () => manifest,
  loadTexture: async address => {
    assert.ok(!textures.has(address), 'shared pages load only once');
    const {data, info} = await sharp(fileURLToPath(address)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const texture = {image: info, pixels: data, disposed: 0, dispose() { this.disposed++; }};
    textures.set(address, texture); return texture;
  }};
const sheets = await loadPackedSheets(options);
assert.equal(textures.size, 31);
assert.equal(sheets.idle.tex, sheets.guard.tex, 'idle/guard aliases share textures');
assert.equal(sheets.idle.packed, sheets.guard.packed);
assert.equal(sheets.idle.speed, .5); assert.equal(sheets.guard.speed, 1);
const vector = () => ({values: [], set(...values) { this.values = values; }});
const uniforms = () => ({uMap: {value: null}, uFrame: {value: vector()}, uSampleBounds: {value: vector()}});
let checkedFrames = 0;
for (const [stem, record] of Object.entries(manifest.sheets)) {
  const anim = Object.keys(names).find(key => (typeof names[key] === 'string' ? names[key] : names[key].file) === stem);
  const sheet = sheets[anim];
  for (const kind of ['color', 'glow']) {
    const channel = record[kind], u = uniforms();
    for (let index = 0; index < channel.regions.length; index++) {
      const region = channel.regions[index];
      setSheetFrame(u, sheet, Math.floor(index/sheet.frames), index%sheet.frames, kind === 'glow');
      assert.ok(u.uFrame.value.values.every(Number.isFinite));
      if (!region) continue;
      const page = channel.pages[region.page], frame = sheet.packed[kind][index];
      assert.equal(u.uMap.value, frame.map, 'direction/frame selects its own page');
      const [ox, oy, sx, sy] = u.uFrame.value.values, [x0,y0,x1,y1] = u.uSampleBounds.value.values;
      // Corners + centre of every crop, not just one preferred facing. This
      // catches X offsets, top/bottom inversion, frame drift and glow scaling.
      for (const [x,y] of [[0,0],[region.width-1,0],[0,region.height-1],[region.width-1,region.height-1],[Math.floor(region.width/2),Math.floor(region.height/2)]]) {
        const localX = (region.left+x+.5)/channel.cell, localY = 1-(region.top+y+.5)/channel.cell;
        const u2 = ox+localX*sx, v2 = oy+localY*sy;
        assert.ok(u2 >= x0 && u2 <= x1 && v2 >= y0 && v2 <= y1);
        assert.ok(Math.abs(u2*page.width - (region.x+x+.5)) < 1e-8);
        assert.ok(Math.abs((1-v2)*page.height - (region.y+y+.5)) < 1e-8);
        // Procedural effects still see original 0..1 cell coordinates.
        assert.ok(Math.abs((u2-ox)/sx-localX) < 1e-10);
        assert.ok(Math.abs((v2-oy)/sy-localY) < 1e-10);
      }
      // Every gutter pixel is transparent: no neighbouring pose can appear in
      // the shader's allowed tile at base level (GPU mip filtering is manual).
      const image = u.uMap.value.pixels;
      for (let y = region.y-8; y < region.y+region.height+8; y++) for (let x = region.x-8; x < region.x+region.width+8; x++) {
        if (x >= region.x && x < region.x+region.width && y >= region.y && y < region.y+region.height) continue;
        assert.equal(image[(y*page.width+x)*4+3], 0);
      }
      checkedFrames++;
    }
  }
  const originalGlow = path.join(root, record.glow.source.file);
  const {data, info} = await sharp(originalGlow).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  assert.deepEqual(record.bladeAxes, bladeAxes(data, info.width, info.height, record.glow.frames), 'lightning/run trail attachment matches original masks');
}
// Regular sheet math remains identical for every other character/fallback.
const legacy = {tex: {}, glow: {}, frames: 15}, normal = uniforms();
setSheetFrame(normal, legacy, 7, 14);
assert.deepEqual(normal.uFrame.value.values, [14/15, 0, 1/15, 1/8]);
assert.deepEqual(normal.uSampleBounds.value.values, [0,0,1,1]);
setSheetFrame(normal, legacy, 3, 2, true); assert.equal(normal.uMap.value, legacy.glow);

let originalCalls = 0, jsonCalls = 0, warnings = 0;
const fallback = {packedUrl: url, model: 'rival_yakuza', names,
  loadOriginal: async () => { originalCalls++; return legacy; },
  loadJson: async () => { jsonCalls++; throw Error('missing manifest'); },
  onFallback: () => warnings++};
assert.equal(await loadSheetSet({...fallback, disabled: true}), legacy);
assert.equal(jsonCalls, 0, 'original comparison never fetches packed pages');
assert.equal(await loadSheetSet(fallback), legacy); assert.equal(warnings, 1);
const tinyChannel = {cell: 1, frames: 1, regions: Array(8).fill({page:0,x:8,y:8,left:0,top:0,width:1,height:1}), pages:[{file:'good.png',width:32,height:32},{file:'bad.png',width:32,height:32}]};
const tiny = {version:1,model:'test',directions:8,margin:8,sheets:{idle:{color:tinyChannel}}};
const late = {image:{width:32,height:32}, disposed:0,dispose(){this.disposed++;}};
assert.equal(await loadSheetSet({...fallback, model:'test', names:{idle:'idle'}, loadJson:async()=>tiny,
  loadTexture: async address => {
    if (address.endsWith('bad.png')) throw Error('failed page');
    await new Promise(resolve => setTimeout(resolve, 5)); return late;
  }}), legacy);
assert.equal(late.disposed, 1, 'late successful page is released before fallback');
assert.equal(originalCalls, 3);
let pageCalls = 0;
assert.equal(await loadSheetSet({...fallback, model:'test', names:{idle:'idle'}, loadJson:async()=>({...tiny,directions:4}),
  loadTexture:async()=>{pageCalls++;}}), legacy);
assert.equal(pageCalls, 0, 'invalid manifest falls back before allocating textures');
const wrongSize = {image:{width:16,height:32}, disposed:0,dispose(){this.disposed++;}};
assert.equal(await loadSheetSet({...fallback, model:'test', names:{idle:'idle'}, loadJson:async()=>tiny,
  loadTexture:async()=>wrongSize}), legacy);
assert.equal(wrongSize.disposed, 1, 'wrong-size pages are released, including shared texture objects');
await assert.rejects(loadPackedSheets({...options, model:'test', names:{idle:'idle'}, requireGlow:true, loadJson:async()=>tiny,
  loadTexture:async()=>{throw Error('must fail before allocating');}}), /required weapon glow/);
console.log(`Packed hero: ${checkedFrames} frame crops, color/glow page addressing, original effect coordinates/axes, transparent gutters, shared aliases, original-mode bypass and late-load cleanup passed`);
