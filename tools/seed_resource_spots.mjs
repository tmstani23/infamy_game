// Resource spots (Loop 3, L3.4): small harvestable prop clusters everywhere + the 107 world nodes as rich deposits.
// Run from the repo root:  node tools/seed_resource_spots.mjs [--check]
//   (no flag) writes game/data/world_spots.json and prints the coverage report
//   --check   regenerates in memory, compares to the file on disk, writes nothing
// Reads game/data/world.json (never edits it) and game/data/resource_spots.json (the numbers).
// Deterministic: each random draw is seeded from (seed, kind, cell), so the same inputs give byte-identical output.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildable, terrainAt } from '../game/src/sim/world_data.js';
import { islandBiome } from '../game/src/sim/island_art.js';

const WORLD = 'game/data/world.json', CONF = 'game/data/resource_spots.json', CHUNKS = 'game/data/world_chunks.json';
const OUT = 'game/data/world_spots.json';
const check = process.argv.includes('--check');
const world = JSON.parse(readFileSync(WORLD, 'utf8'));
const conf = JSON.parse(readFileSync(CONF, 'utf8'));
const chunk = JSON.parse(readFileSync(CHUNKS, 'utf8')).chunk;
const S = conf.spots, CELL = world.terrain.cell, NX = world.terrain.rows[0].length, NZ = world.terrain.rows.length;
const W = world.size.w, H = world.size.h;

// ---- seeded random (mulberry32 over a string hash) ----
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = key => { let a = hash(`${conf.seed}|${key}`); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const r1 = v => Math.round(v * 10) / 10;
const code = (x, z) => terrainAt(world, x, z);

// ---- keep-out geometry ----
const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
const C = S.clearance;
const points = [];                                   // [x, z, clearance]
for (const p of world.passes || []) points.push([p.x, p.z, C.pass]);
for (const f of world.fords || []) points.push([f.x, f.z, C.ford]);
for (const s of world.sites || []) points.push([s.x, s.z, C.site]);
for (const c of world.camps || []) points.push([c.x, c.z, C.camp]);
for (const n of world.nodes || []) points.push([n.x, n.z, C.node]);
points.push([world.capital.x, world.capital.z, C.capital]);
const roadSegs = [];
for (const c of world.corridors || []) for (let i = 1; i < c.points.length; i++) roadSegs.push([...c.points[i - 1], ...c.points[i]]);
const blocked = (x, z, pad = 0) => {
  for (const [px, pz, r] of points) if (Math.hypot(px - x, pz - z) < r + pad) return true;
  for (const [ax, az, bx, bz] of roadSegs) if (segDist(x, z, ax, az, bx, bz) < C.road + pad) return true;
  return false;
};
const waterNear = (x, z, cells) => {
  for (let di = -cells; di <= cells; di++) for (let dj = -cells; dj <= cells; dj++) {
    const c = code(x + dj * CELL, z + di * CELL);
    if (c === 'w' || c === 'r') return [dj, di];
  }
  return null;
};
// distance along dir to the first water/river ground (1-unit steps), or null within max
const shoreDist = (x, z, dir, max) => {
  for (let d = 0; d <= max; d++) { const c = code(x + dir[0] * d, z + dir[1] * d); if (c === 'w' || c === 'r') return d; }
  return null;
};

// ---- piece layout: rejection-sampled points in a disc ----
function layout(rand, n, radius, gap, variants, ok, dir) {
  const pieces = [];
  for (let tries = 0; pieces.length < n && tries < n * 60; tries++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * radius;
    let dx = Math.cos(a) * d, dz = Math.sin(a) * d;
    if (dir) { dx += dir[0] * radius * 0.4; dz += dir[1] * radius * 0.4; }   // lean toward the water
    dx = r1(dx); dz = r1(dz);
    if (pieces.some(p => Math.hypot(p[0] - dx, p[1] - dz) < gap)) continue;
    if (ok && !ok(dx, dz)) continue;
    pieces.push([dx, dz, Math.floor(rand() * variants)]);
  }
  return pieces;
}

const spots = [], placed = [];                       // placed: [x, z, r] for spacing
const spaced = (x, z, r) => placed.every(([px, pz, pr]) => Math.hypot(px - x, pz - z) >= r + pr + C.spot);
const add = s => { spots.push(s); placed.push([s.x, s.z, s.r]); };

// 1. deposits: one per node, at the node
const nodes = world.nodes.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
let depositsOnRock = 0;
for (const n of nodes) {
  const d = S.deposits[n.kind];
  const rand = rng(`deposit|${n.id}`);
  const size = Math.round(d.size[0] + (d.size[1] - d.size[0]) * ((n.richness - 1) / 2));
  const dir = d.kind === 'fish' ? (() => { const w = waterNear(n.x, n.z, 2); return w ? (Math.hypot(...w) ? [w[0] / Math.hypot(...w), w[1] / Math.hypot(...w)] : null) : null; })() : null;
  const pieces = layout(rand, size, d.radius, d.minGap, S.kinds[d.kind].variants, null, dir);
  if (!buildable(world, n.x, n.z)) depositsOnRock++;
  add({ id: n.id.replace('N', 'D'), kind: d.kind, x: n.x, z: n.z, r: d.radius, pieces, deposit: n.id, nodeKind: n.kind });
}

// 2. ordinary spots: one seeded try per jittered-grid cell per kind
let seq = 0;
for (const kind of Object.keys(S.kinds)) {
  const k = S.kinds[kind];
  for (let gz = 0; gz * k.cell < H; gz++) for (let gx = 0; gx * k.cell < W; gx++) {
    const rand = rng(`${kind}|${gx}|${gz}`);
    const x = r1((gx + rand()) * k.cell), z = r1((gz + rand()) * k.cell);
    const roll = rand();
    if (x >= W || z >= H || !buildable(world, x, z)) continue;
    const chance = k.chance[code(x, z)] || 0;
    if (roll >= chance) continue;
    tryPlace(kind, x, z, rand);
  }
}
function tryPlace(kind, x, z, rand, quiet) {
  const k = S.kinds[kind];
  if (!buildable(world, x, z)) return false;
  let dir = null;
  if (kind === 'fish') {
    const w = waterNear(x, z, k.waterWithin); if (!w) return false;
    const m = Math.hypot(w[0], w[1]) || 1; dir = [w[0] / m, w[1] / m];
  }
  const r = r1(k.radius[0] + (k.radius[1] - k.radius[0]) * rand());
  if (dir) {   // fish (Tim 2026-11-05): pull the cluster onto the shore so the boats sit right at the water
    const d = shoreDist(x, z, dir, (k.waterWithin + 1) * CELL); if (d === null) return false;
    const shift = d - (r + (k.shoreGap ?? 2)); x += dir[0] * shift; z += dir[1] * shift;
    if (!buildable(world, x, z)) return false;
  }
  const n = k.size[0] + Math.floor(rand() * (k.size[1] - k.size[0] + 1));
  const rr = kind === 'timber' ? r1(k.radius[0] + (k.radius[1] - k.radius[0]) * ((n - k.size[0]) / (k.size[1] - k.size[0] || 1))) : r;
  if (blocked(x, z, rr) || !spaced(x, z, rr)) return false;
  const ok = (dx, dz) => buildable(world, x + dx, z + dz);
  const pieces = layout(rand, n, rr, k.minGap, k.variants, ok, dir);
  if (pieces.length < k.size[0]) return false;
  add({ id: `${kind[0].toUpperCase()}${String(++seq).padStart(4, '0')}`, kind, x, z, r: rr, pieces, deposit: null });
  return true;
}

// 3. coverage fill: buildable land with no timber / stone within radius gets one more spot (except skipped terrains)
function coverage(kind) {
  const R = Math.ceil(S.coverage.radius / CELL), g = new Uint8Array(NX * NZ);
  for (const s of spots) {
    if (s.kind !== kind) continue;
    const ci = Math.floor(s.z / CELL), cj = Math.floor(s.x / CELL);
    for (let i = Math.max(0, ci - R); i <= Math.min(NZ - 1, ci + R); i++) for (let j = Math.max(0, cj - R); j <= Math.min(NX - 1, cj + R); j++)
      if (Math.hypot((j + 0.5) * CELL - s.x, (i + 0.5) * CELL - s.z) <= S.coverage.radius) g[i * NX + j] = 1;
  }
  return g;
}
for (const kind of ['timber', 'stone']) {
  const skip = new Set(S.coverage[kind].skip);
  for (let pass = 0; pass < 6; pass++) {
    const g = coverage(kind); let added = 0;
    for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) {
      if (g[i * NX + j]) continue;
      const x = (j + 0.5) * CELL, z = (i + 0.5) * CELL;
      if (!buildable(world, x, z) || skip.has(code(x, z))) continue;
      if (g[i * NX + j]) continue;
      // try the cell, then a ring of nearby points
      const rand = rng(`fill|${kind}|${i}|${j}|${pass}`);
      let ok = false;
      for (let t = 0; t < 12 && !ok; t++) {
        const a = rand() * Math.PI * 2, d = t === 0 ? 0 : 40 + rand() * 260;
        ok = tryPlace(kind, r1(x + Math.cos(a) * d), r1(z + Math.sin(a) * d), rand);
      }
      if (ok) { added++; const s = spots[spots.length - 1]; const ci = Math.floor(s.z / CELL), cj = Math.floor(s.x / CELL), R = Math.ceil(S.coverage.radius / CELL);
        for (let a = Math.max(0, ci - R); a <= Math.min(NZ - 1, ci + R); a++) for (let b = Math.max(0, cj - R); b <= Math.min(NX - 1, cj + R); b++)
          if (Math.hypot((b + 0.5) * CELL - s.x, (a + 0.5) * CELL - s.z) <= S.coverage.radius) g[a * NX + b] = 1; }
    }
    if (!added) break;
  }
}

// 4. output (sorted, one spot per line)
spots.sort((a, b) => (a.id < b.id ? -1 : 1));
const byChunk = {};
for (const s of spots) (byChunk[`c${Math.floor(s.x / chunk)}_${Math.floor(s.z / chunk)}`] ||= []).push(s.id);
const sortedChunks = Object.keys(byChunk).sort((a, b) => { const [ax, az] = a.slice(1).split('_').map(Number), [bx, bz] = b.slice(1).split('_').map(Number); return az - bz || ax - bx; });
const confSha = createHash('sha256').update(readFileSync(CONF)).digest('hex').slice(0, 12);
const out = `{\n"version": 1,\n"_note": "Generated by tools/seed_resource_spots.mjs from world.json + resource_spots.json. Do not edit by hand.",\n"seed": ${conf.seed},\n"configSha": "${confSha}",\n"chunkSize": ${chunk},\n"spots": [\n${spots.map(s => JSON.stringify(s)).join(',\n')}\n],\n"byChunk": {\n${sortedChunks.map(k => `"${k}": ${JSON.stringify(byChunk[k])}`).join(',\n')}\n}\n}\n`;

// ---- coverage report ----
const lines = [];
const count = {}; for (const s of spots) count[s.kind] = (count[s.kind] || 0) + 1;
lines.push(`spots: ${spots.length} (${Object.entries(count).map(([k, v]) => k + ' ' + v).join(', ')}); deposits ${nodes.length} (${depositsOnRock} on unbuildable ground)`);
const cov = { timber: coverage('timber'), stone: coverage('stone'), fish: null };
const rows = {};
let total = 0;
for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) {
  const x = (j + 0.5) * CELL, z = (i + 0.5) * CELL;
  if (!buildable(world, x, z)) continue;
  const b = islandBiome(world, x, z), r = rows[b] ||= { n: 0, t: 0, s: 0, both: 0 };
  r.n++; total++;
  if (cov.timber[i * NX + j]) r.t++;
  if (cov.stone[i * NX + j]) r.s++;
  if (cov.timber[i * NX + j] && cov.stone[i * NX + j]) r.both++;
}
lines.push(`share of buildable land with the kind within ${S.coverage.radius} units:`);
const pct = (a, n) => (n ? (100 * a / n).toFixed(1) : '0.0') + '%';
for (const [b, r] of Object.entries(rows).sort()) lines.push(`  ${b.padEnd(7)} cells ${String(r.n).padStart(6)}  timber ${pct(r.t, r.n).padStart(6)}  stone ${pct(r.s, r.n).padStart(6)}  both ${pct(r.both, r.n).padStart(6)}`);
const all = Object.values(rows).reduce((a, r) => ({ n: a.n + r.n, t: a.t + r.t, s: a.s + r.s, both: a.both + r.both }), { n: 0, t: 0, s: 0, both: 0 });
lines.push(`  ${'ALL'.padEnd(7)} cells ${String(all.n).padStart(6)}  timber ${pct(all.t, all.n).padStart(6)}  stone ${pct(all.s, all.n).padStart(6)}  both ${pct(all.both, all.n).padStart(6)}`);
const pieces = spots.reduce((a, s) => a + s.pieces.length, 0);
lines.push(`pieces: ${pieces} total; file ${(out.length / 1024).toFixed(0)} KB`);

if (check) {
  let disk = ''; try { disk = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
  if (disk !== out) { console.error('world_spots.json is out of date: run node tools/seed_resource_spots.mjs'); process.exit(1); }
  console.log('world_spots.json matches (' + spots.length + ' spots)');
} else {
  writeFileSync(OUT, out);
  console.log(lines.join('\n'));
  console.log('wrote ' + OUT);
}
