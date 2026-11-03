// Atlas illustration references only. Does not change world/runtime assets.
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { terrainAt } from '../game/src/sim/world_data.js';
import { createPaint } from '../game/src/world_paint.js';

const args = process.argv.slice(2);
const out = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'assets/environment/island/atlas';
if (!out || out.startsWith('--')) throw Error('Missing --output directory');
const inputs = [
  'game/data/world.json', 'game/data/world_paint.json', 'game/data/world_overrides.json',
  'docs/images/frontier/blueprint/world_blueprint_v2.json', 'docs/images/frontier/blueprint/blueprint.py',
  'tools/seed_world.mjs', 'tools/prepare_atlas_reference.mjs',
  'game/src/sim/world_data.js', 'game/src/sim/shoreline.js',
  'game/src/sim/island_art.js', 'game/src/world_paint.js',
];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestPath = `${out}/atlas_reference_manifest_v1.json`;
const files = ['atlas_blueprint_v1.png', 'atlas_features_v1.json', 'atlas_features_v1.svg',
  'atlas_registration_v1.png', 'atlas_review_v1.png', 'atlas_effective_blueprint_v1.json'];
if (args.includes('--check')) {
  const stale = [];
  const saved = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath)) : null;
  for (const file of inputs) if (!saved || saved.sourceHashes?.[file] !== hash(file)) stale.push(`input: ${file}`);
  for (const file of files) if (!fs.existsSync(`${out}/${file}`) || saved?.outputHashes?.[file] !== hash(`${out}/${file}`)) stale.push(`output: ${file}`);
  if (stale.length) {
    console.error(`Atlas reference is STALE or missing:\n${stale.join('\n')}\nRegenerate after applying approved blueprint edits: node tools/prepare_atlas_reference.mjs`);
    process.exit(1);
  }
}
// Never bless stale runtime geography by merely hashing it. Reproduce the world
// from its authored sources without writing any runtime or preview files.
const sync = spawnSync(process.execPath, ['tools/seed_world.mjs', '--check'], { encoding:'utf8' });
if (sync.status !== 0) {
  console.error(sync.stderr || sync.stdout || sync.error?.message || 'Blueprint/world synchronization failed');
  process.exit(1);
}
if (args.includes('--check')) {
  console.log('Atlas reference is FRESH: blueprint/world agree; all source and output hashes match.');
  process.exit(0);
}
fs.mkdirSync(out, { recursive: true });
const world = JSON.parse(fs.readFileSync(inputs[0])), cfg = JSON.parse(fs.readFileSync(inputs[1]));
const paint = createPaint(world, cfg);
const width = 2800, height = 1600, scale = width / world.size.w;
if (world.size.w !== 14000 || world.size.h !== 8000) throw Error('Review atlas dimensions after a world-size change');
const palette = {
  forest: '#6c825d', jungle: '#36765e', plain: '#b6bd82', hills: '#a99b74',
  marsh: '#81988b', dry: '#c59b68', snow: '#e4e7df', bank: '#486b7c',
  top_forest: '#827f6e', top_dry: '#a97753', top_snow: '#c9d2d4',
  sea: '#34566b', lake: '#507c8d', river: '#598798', bamboo: '#81975f',
};
const rgb = Object.fromEntries(Object.entries(palette).map(([k,v]) => [k, [1,3,5].map(n => parseInt(v.slice(n,n+2),16))]));
const pixels = Buffer.alloc(width * height * 3), counts = {};
const topology = (await import('../game/src/sim/shoreline.js')).shorelineTopology(world);
for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
  const x = (px + .5) / scale, z = (py + .5) / scale, code = terrainAt(world,x,z);
  let family = paint.biomes[paint.gridAt(x,z)];
  if (code === 'w') family = topology.waterKindAt(x,z) === 'sea' ? 'sea' : 'lake';
  else if (code === 'r') family = 'river';
  else if (code === 'b' && family === 'forest') family = 'bamboo';
  const color = rgb[family] || rgb.plain, index = (py * width + px) * 3;
  pixels.set(color,index); counts[family] = (counts[family] || 0) + 1;
}
// Water bodies use the same runtime code; names/classification remain in the data overlay.
await sharp(pixels,{raw:{width,height,channels:3}}).png().toFile(`${out}/atlas_blueprint_v1.png`);
const markers = [
  { type:'capital', ...world.capital },
  ...world.sites.map(v => ({...v,type:'site'})),
  ...world.nodes.map(v => ({...v,type:'resource'})),
  ...world.camps.map(v => ({...v,type:'camp'})),
  ...world.fords.map(v => ({...v,type:'crossing'})),
  ...world.passes.map(v => ({...v,type:'pass'})),
];
for (const m of markers) if (!Number.isFinite(m.x) || !Number.isFinite(m.z) || m.x < 0 || m.z < 0 || m.x >= world.size.w || m.z >= world.size.h)
  throw Error(`Feature outside reference bounds: ${m.type}/${m.id || m.name}`);
const identities = markers.map(m => `${m.type}/${m.id || m.name}`);
if (new Set(identities).size !== identities.length) throw Error('Duplicate feature identity');
// Generated structural snapshot, never an additional hand-edited source.
const { rules, stats, _note, ...effective } = world;
fs.writeFileSync(`${out}/atlas_effective_blueprint_v1.json`, JSON.stringify({
  generated: true, editable: false, source: 'blueprint + overrides + seed_world adjustments',
  ...effective, biomeAreas: cfg.biomeAreas || [],
}, null, 2)+'\n');
const overlay = {
  coordinates: 'World x east, z south; pixel x=x*0.2, y=z*0.2. No crop, margin or rotation.',
  routes: world.corridors.map(v => ({id:v.id,kind:v.kind,points:v.points,type:'authored corridor; not a claim of constructed road'})),
  extraTrails: cfg.paths?.list || [], markers,
  discovery: 'Review reference includes all records. Game atlas must filter undiscovered sites/features; no live units or camera quad.',
};
fs.writeFileSync(`${out}/atlas_features_v1.json`,JSON.stringify(overlay,null,2)+'\n');
const point = p => `${p[0]*scale},${p[1]*scale}`;
let drawing = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
for (const r of overlay.routes) drawing += `<polyline points="${r.points.map(point).join(' ')}" fill="none" stroke="#f6db9b" stroke-opacity=".7" stroke-width="2"/>`;
for (const r of overlay.extraTrails) drawing += `<polyline points="${r.map(point).join(' ')}" fill="none" stroke="#f6db9b" stroke-width="1"/>`;
const colors = {capital:'#ba3440',site:'#f6d37c',resource:'#d7e9b1',camp:'#cf8e78',crossing:'#f5f2df',pass:'#bcb3ea'};
for (const m of markers) if (Number.isFinite(m.x) && Number.isFinite(m.z)) {
  const x=m.x*scale,y=m.z*scale;
  if(m.type==='crossing' && m.kind==='bridge') drawing+=`<path d="M${x-5},${y-3}h10m-10,6h10m-7,-8v10m4,-10v10" stroke="${colors.crossing}" stroke-width="1.5"/>`;
  else if(m.type==='crossing') drawing+=`<path d="M${x-4},${y-4}l8,8m-8,0l8,-8" stroke="${colors.crossing}" stroke-width="2"/>`;
  else drawing+=`<circle cx="${x}" cy="${y}" r="${m.type==='capital'?7:3}" fill="${colors[m.type]}" stroke="#182b32" stroke-width="1"/>`;
}
drawing+='</svg>';
fs.writeFileSync(`${out}/atlas_features_v1.svg`,drawing);
await sharp(`${out}/atlas_blueprint_v1.png`).composite([{input:Buffer.from(drawing)}]).png().toFile(`${out}/atlas_registration_v1.png`);
// Review furniture lives OUTSIDE the exact artwork rectangle. Never send this
// sheet as the edit target; use the clean no-padding blueprint instead.
const reviewHeader = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2800" height="240">
<rect width="2800" height="240" fill="#eee8d9"/>
<g font-family="Arial,sans-serif" fill="#243e48"><text x="36" y="48" font-size="30" font-weight="bold">Effective world blueprint — current runtime, north up</text>
<text x="36" y="82" font-size="21">14,000 × 8,000 world units • 2,800 × 1,600 reference pixels • 5 world units per pixel • no fog or live units</text>
<text x="36" y="116" font-size="20">Review sheet only: terrain + authored corridor network + all feature records. Corridors do not imply constructed roads.</text>
${Object.entries(colors).map(([name,color],i)=>`${name==='crossing'?`<g transform="translate(${48+i*370},156)" stroke="#243e48" stroke-width="2"><path d="M-10,-4h12m-12,8h12m-9,-11v14m6,-14v14M12,-5l10,10m-10,0l10,-10"/></g>`:`<circle cx="${48+i*370}" cy="156" r="7" fill="${color}" stroke="#182b32"/>`}<text x="${(name==='crossing'?82:66)+i*370}" y="163" font-size="20">${name==='crossing'?'bridge / ford':name} (${markers.filter(m=>m.type===name).length})</text>`).join('')}
<text x="36" y="210" font-size="20">Biome colours: snow = pale; mountains = grey/rust; dry = ochre; plains = olive; forest = muted green; jungle = deep green; marsh = grey-green.</text>
</g></svg>`);
await sharp({create:{width,height:height+240,channels:3,background:'#eee8d9'}})
  .composite([{input:reviewHeader,top:0,left:0},{input:`${out}/atlas_registration_v1.png`,top:240,left:0}])
  .png().toFile(`${out}/atlas_review_v1.png`);
const manifest = {
  version:2,date:'2026-11-03',status:'Step 1 complete: effective blueprint/reference + freshness gate. Illustration generation/integration not started.',
  worldUnits:[world.size.w,world.size.h],referencePixels:[width,height],worldUnitsPerPixel:1/scale,
  orientation:'north-up; no padding; identical bounds for terrain, art and feature overlays',
  sourceHashes:Object.fromEntries(inputs.map(p=>[p,hash(p)])),
  outputHashes:Object.fromEntries(files.map(p=>[p,hash(`${out}/${p}`)])),
  synchronization:'Read-only seed_world --check passed before export. Source design + overrides reproduce the runtime world.',
  artifactRoles:{artReference:'atlas_blueprint_v1.png',registration:'atlas_registration_v1.png',humanReview:'atlas_review_v1.png (240px header; NOT an artwork target)',structuralSnapshot:'atlas_effective_blueprint_v1.json (generated, not editable)',features:'atlas_features_v1.json / .svg'},
  palette,referencePixelCounts:counts,
  crossingCounts:world.fords.reduce((a,f)=>(a[f.kind]=(a[f.kind]||0)+1,a),{}),
  accuracy:'Blueprint samples authoritative rounded terrain and runtime biome classification at 5-unit pixel centers. Base is a reference, not generated artwork; original blueprint has not been overwritten.',
  review:'Generated art may drift. Compare registered coast/lakes/rivers/ranges/biomes before accepting. Data overlays and hover queries remain authoritative; never move gameplay to fit art.',
};
fs.writeFileSync(`${out}/atlas_reference_manifest_v1.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(`Atlas reference ${width}x${height}; ${markers.length} exact feature records; crossings ${JSON.stringify(manifest.crossingCounts)}`);
