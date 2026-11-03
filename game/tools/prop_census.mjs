// Island prop census (groundcover clustering plan, phase A). Run from the repo root:
//   node game/tools/prop_census.mjs           (all passes, then the report; about 45 s)
//   node game/tools/prop_census.mjs --stage=N (one pass only, N = 0..7; add --old for the old scatter; saved to to_delete/_chk/)
//   node game/tools/prop_census.mjs --report  (report from the saved passes)
// Runs the CURRENT generator (sim/chunk_gen.js buildChunk) over every island chunk and counts what it
// places, by the ground biome under each prop. Read-only: changes no game code or data.
// Passes are told apart by switching them on one at a time (each is appended after the earlier ones,
// so earlier counts do not move) and taking the difference.
// Asset check: every prop cutout in the island art folders (biome_props manifest, jungle/, forest_floor/,
// marsh/) must be in the art catalog (game/data/art.json) and be placed at least once in its own biome.
// Report: to_delete/_chk/prop_census.md
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { buildChunk, cityOnIsland } from '../src/sim/chunk_gen.js';
import { createPaint } from '../src/world_paint.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const root = new URL('../../', import.meta.url), out = new URL('to_delete/_chk/', root);
mkdirSync(out, { recursive: true });
const world = data('data/world.json'), district = data('data/port_town.json'), catalog = data('data/art.json').items;
const base = { ...data('data/world_chunks.json'), paint: data('data/world_paint.json'), biomeProps: data('data/biome_props.json'), coastline: data('data/coastline.json') };
const bp = base.biomeProps;
const STAGES = ['painted', 'additional', 'bamboo', 'marsh', 'coast', 'tops', 'clusters', 'oddities'];
const OLD = process.argv.includes('--old'), tag = OLD ? 'old_' : '';   // --old: clustering off (the old scatter)
const stageArg = process.argv.find(a => a.startsWith('--stage='));

const cfgFor = n => ({ ...base,
  paint: { ...base.paint, bamboo: n >= 2 ? base.paint.bamboo : undefined },
  biomeProps: { ...bp, additional: n >= 1 ? bp.additional : [], marshSupplement: n >= 3 ? bp.marshSupplement : undefined,
    coast: n >= 4 ? bp.coast : undefined, mountainTops: n >= 5 ? bp.mountainTops : undefined, oddities: n >= 7 ? bp.oddities : undefined,
    clustering: bp.clustering && (OLD ? { ...bp.clustering, enabled: false } : { ...bp.clustering, families: bp.clustering.families.map(f => n >= 6 ? f : { ...f, per1000: 0 }) }) } });

const S = base.chunk, T = world.terrain, W = T.rows[0].length * T.cell, H = T.rows.length * T.cell;
const city = district.bounds ? cityOnIsland(world, district.bounds) : null;
const P = createPaint(world, base.paint);

function runStage(n) {
  const cfg = cfgFor(n), counts = {}, t0 = Date.now();
  for (let cz = 0; cz * S < H; cz++) for (let cx = 0; cx * S < W; cx++)
    for (const p of buildChunk(world, cfg, cx, cz, base.seed ?? 1, { city }).props) {
      const k = `${P.biomes[P.gridAt(p.x, p.z)] ?? '?'}|${p.art || p.kind}`; counts[k] = (counts[k] || 0) + 1;
    }
  writeFileSync(new URL(`${tag}census_${n}.json`, out), JSON.stringify(counts));
  console.log(`pass ${n} (${STAGES[n]}): ${Object.values(counts).reduce((a, b) => a + b, 0)} props, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// --- the asset list: what art exists for each biome ---
function assetList() {
  const oddity = new Set([...Object.values(bp.oddities?.byBiome || {}).flat(), ...(bp.oddities?.coast || [])]);
  const fix = b => ({ plains: 'plain', forest_floor: 'forest' }[b] || b), list = new Map();
  const add = (kind, biome, from) => { const k = `${fix(biome)}|${kind}`; if (!list.has(k)) list.set(k, { kind, biome: fix(biome), from, oddity: oddity.has(kind) }); };
  const isl = new URL('assets/environment/island/', root);
  for (const a of JSON.parse(readFileSync(new URL('biome_props/cutouts/cutouts_manifest.json', isl))).assets)
    add(a.file.replace(/\.png$/, ''), a.biome, `biome_props (${a.group})`);
  for (const d of ['jungle', 'forest_floor', 'marsh'])
    for (const f of readdirSync(new URL(`${d}/cutouts/`, isl))) if (f.endsWith('.png')) add(f.slice(0, -4), d, `${d}/cutouts`);
  // older shared props: placed by the paint rules but drawn from the original art set, not the island folders
  // (one entry per biome whose rules use them, e.g. pine in forest, plain, hills and snow)
  const repl = bp.replaceByBiome || {};
  for (const r of base.paint.props) { const k = repl[r.biome]?.[r.kind] || r.kind; add(k, r.biome, 'older shared props'); }
  if (base.paint.bamboo) add(base.paint.bamboo.kind, 'forest', 'older shared props');
  return [...list.values()];
}

function report() {
  const st = STAGES.map((_, n) => JSON.parse(readFileSync(new URL(`${tag}census_${n}.json`, out))));
  const all = st.at(-1), area = {}, byKind = {};
  for (let i = 0; i < T.rows.length; i++) for (let j = 0; j < T.rows[0].length; j++) {
    const b = P.biomes[P.gridAt((j + .5) * T.cell, (i + .5) * T.cell)]; area[b] = (area[b] || 0) + T.cell * T.cell;
  }
  const src = k => STAGES.map((name, n) => [name, (st[n][k] || 0) - (n ? st[n - 1][k] || 0 : 0)]).filter(([, d]) => d).map(([s, d]) => `${s} ${d}`).join(', ');
  for (const [k, c] of Object.entries(all)) { const [b, kind] = k.split('|'); (byKind[kind] ||= {})[b] = c; }
  const per = (c, b) => (c / ((area[b] || 1) / 1000));
  const assets = assetList(), known = new Set(assets.map(a => a.kind));
  const anyBiome = a => a.biome === 'coast' || a.biome === 'shared';
  for (const a of assets) {
    const counts = byKind[a.kind] || {};
    a.inCatalog = !!catalog[a.kind] || a.from === 'older shared props';
    a.own = anyBiome(a) ? Object.values(counts).reduce((x, y) => x + y, 0) : counts[a.biome] || 0;
    a.elsewhere = anyBiome(a) ? 0 : Object.entries(counts).filter(([b]) => b !== a.biome).reduce((x, [, c]) => x + c, 0);
    a.status = !a.inCatalog ? 'NOT IN CATALOG' : a.own ? 'used' : a.elsewhere ? 'ONLY OUTSIDE ITS BIOME' : 'NEVER PLACED';
  }
  const bad = assets.filter(a => a.status !== 'used'), fmt = n => n.toLocaleString('en-US');
  const biomes = ['forest', 'jungle', 'hills', 'snow', 'dry', 'marsh', 'plain', 'top_dry', 'top_forest', 'top_snow'];
  const L = [`# Island prop census (current generator), ${new Date().toISOString().slice(0, 10)}`, '',
    'Made by `node game/tools/prop_census.mjs` (read-only). Every prop the current generator places over the whole island, counted by the ground biome under it.',
    '"Per 1000" = props per 1000 square units of that biome\'s land. "Placed by" = which generator pass placed it.', '',
    '## Summary', '', '| Biome | Land (M sq u) | Props | Per 1000 | Assets used |', '|---|---:|---:|---:|---:|'];
  let total = 0;
  for (const b of biomes) {
    const n = Object.entries(all).filter(([k]) => k.startsWith(b + '|')).reduce((x, [, c]) => x + c, 0), mine = assets.filter(a => a.biome === b);
    total += n;
    L.push(`| ${b} | ${(area[b] / 1e6).toFixed(1)} | ${fmt(n)} | ${per(n, b).toFixed(1)} | ${mine.filter(a => a.status === 'used').length} / ${mine.length} |`);
  }
  const shared = assets.filter(anyBiome);
  L.push(`| coast + shared art (any biome) | | | | ${shared.filter(a => a.status === 'used').length} / ${shared.length} |`, `| **island** | | **${fmt(total)}** | | **${assets.length - bad.length} / ${assets.length}** |`, '');
  L.push('## Assets not used', '', bad.length ? '| Asset | Biome | From | Problem | Placed elsewhere |\n|---|---|---|---|---:|' : 'None: every asset is placed in its own biome.');
  for (const a of bad) L.push(`| ${a.kind} | ${a.biome} | ${a.from} | ${a.status} | ${a.elsewhere} |`);
  L.push('');
  for (const b of biomes.filter(x => x.startsWith('top_'))) {   // mountain tops: art-only, no asset list of their own
    const here = Object.entries(all).filter(([k]) => k.startsWith(b + '|')).sort((x, y) => y[1] - x[1]);
    if (!here.length) continue;
    L.push(`## ${b} (mountain tops, art only)`, '', '| Kind | Count | Per 1000 | Placed by |', '|---|---:|---:|---|');
    for (const [k, c] of here) L.push(`| ${k.split('|')[1]} | ${fmt(c)} | ${per(c, b).toFixed(3)} | ${src(k)} |`);
    L.push('');
  }
  for (const b of [...biomes.filter(x => !x.startsWith('top_')), 'coast + shared']) {
    const mine = b === 'coast + shared' ? shared : assets.filter(a => a.biome === b);
    L.push(`## ${b}`, '', '| Asset | Kind of art | Count | Per 1000 | Placed by | Status |', '|---|---|---:|---:|---|---|');
    for (const a of mine.sort((x, y) => y.own - x.own)) {
      const k = anyBiome(a) ? null : `${b}|${a.kind}`;
      const by = k ? src(k) : biomes.map(x => src(`${x}|${a.kind}`)).filter(Boolean).join('; ');
      L.push(`| ${a.kind} | ${a.oddity ? 'oddity' : a.from} | ${fmt(a.own)} | ${k ? per(a.own, b).toFixed(3) : ''} | ${by} | ${a.status === 'used' ? 'used' : '**' + a.status + '**'} |`);
    }
    if (b !== 'coast + shared') {
      const strays = Object.entries(all).filter(([k]) => { const [bb, kind] = k.split('|'); return bb === b && !mine.some(a => a.kind === kind) && !shared.some(a => a.kind === kind); });
      const n = strays.reduce((x, [, c]) => x + c, 0);
      if (n) L.push('', `Edge strays: ${fmt(n)} props of ${strays.length} kinds from neighbouring biomes, where the biome field blends at borders.`);
    }
    L.push('');
  }
  const unknown = Object.keys(byKind).filter(k => !known.has(k));
  if (unknown.length) L.push('## Placed kinds with no art-folder entry', '', unknown.join(', '), '');
  writeFileSync(new URL(`${tag}prop_census.md`, out), L.join('\n'));
  console.log(L.slice(0, 22 + bad.length).join('\n'));
}

if (stageArg) runStage(+stageArg.split('=')[1]);
else { if (!process.argv.includes('--report')) STAGES.forEach((_, n) => runStage(n)); report(); }
