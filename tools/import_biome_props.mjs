// Import the reviewed, alpha-trimmed biome prop cutouts into the runtime art catalog.
// Source sheets and cutouts remain under assets/environment/island/biome_props/.
import fs from 'node:fs';
import path from 'node:path';

const root = 'assets/environment/island/biome_props';
const manifestFile = path.join(root, 'cutouts', 'cutouts_manifest.json');
const catalogFile = 'game/data/art.json';
const cutsFile = 'game/art/cutouts.json';
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
if (manifest.schemaVersion < 2) throw new Error('Re-cut the sheets with tools/cut_biome_props.mjs before importing; legacy equal-cell cuts are unsafe.');
const catalogText = fs.readFileSync(catalogFile, 'utf8');
const cutsText = fs.readFileSync(cutsFile, 'utf8');
const catalog = JSON.parse(catalogText);
const cuts = JSON.parse(cutsText);
const entries = {};

function closeObject(text, start) {
  let depth = 0, quoted = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error('Invalid JSON object');
}

function upsert(text, values, nested) {
  for (const [key, value] of Object.entries(values)) {
    const rootStart = nested ? text.indexOf('{', text.indexOf('"items"')) : text.indexOf('{');
    const rootEnd = closeObject(text, rootStart);
    const found = text.indexOf(JSON.stringify(key) + ':', rootStart);
    if (found >= 0 && found < rootEnd) {
      const start = text.indexOf('{', found), end = closeObject(text, start);
      text = text.slice(0, start) + JSON.stringify(value) + text.slice(end + 1);
    } else {
      text = text.slice(0, rootEnd).trimEnd() + ',\n' + (nested ? '    ' : ' ') +
        JSON.stringify(key) + ': ' + JSON.stringify(value) + '\n' + (nested ? '  ' : '') + text.slice(rootEnd);
    }
  }
  return text;
}

for (const asset of manifest.assets) {
  const name = path.basename(asset.file, path.extname(asset.file));
  const source = path.join(root, 'cutouts', asset.file);
  const dest = path.join('game', 'art', 'props', asset.file);
  if (!fs.existsSync(source)) throw new Error(`Missing cutout: ${source}`);
  const { width, height } = asset.trim.size;
  if (asset.groundAnchor.coordinateSpace !== 'trimmedImage') throw new Error(`Ambiguous anchor coordinates: ${asset.file}`);
  const anchor = [asset.groundAnchor.x, asset.groundAnchor.y];
  const foot = asset.intendedFootprintUnitsGuidance || [3, 3];
  if (!(width > 0 && height > 0 && anchor[0] >= 0 && anchor[0] < width && anchor[1] >= 0 && anchor[1] < height))
    throw new Error(`Invalid trim or ground anchor for ${asset.file}`);
  const scale = Math.round(((foot[0] + foot[1]) / Math.SQRT2) * (160 / 3) / width * 1e6) / 1e6;
  fs.copyFileSync(source, dest);
  const cut = { w: width, h: height, left: 0, right: width - 1, bottomX: Math.round(anchor[0]), bottomY: Math.round(anchor[1]), glows: [] };
  const item = { kind: 'props', scale, foot, solid: 0, artAnchor: anchor, _note: 'Biome prop art-only; transparent cutout; does not change navigation.' };
  if (catalog.items[name] && catalog.items[name].kind !== 'props') throw new Error(`Catalog name collision: ${name}`);
  cuts[`props/${name}`] = cut;
  catalog.items[name] = item;
  entries[name] = item;
  entries[`props/${name}`] = cut;
}

const itemEntries = Object.fromEntries(Object.entries(entries).filter(([key]) => !key.startsWith('props/')));
const cutEntries = Object.fromEntries(Object.entries(entries).filter(([key]) => key.startsWith('props/')));
fs.writeFileSync(catalogFile, upsert(catalogText, itemEntries, true));
fs.writeFileSync(cutsFile, upsert(cutsText, cutEntries, false));
manifest.status = 'Reviewed per-object cuts imported into runtime; trimmed-image ground anchors preserved.';
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Imported ${manifest.assets.length} transparent biome props into game/art/props and runtime metadata.`);
