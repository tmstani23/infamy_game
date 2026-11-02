// Frontier W3.1: chunk prototype and measurements. Run from the repo root:
//   node game/tools/proto_chunks.mjs
// Builds island chunks with sim/areas.js, finds a fine path across chunk borders, an island route
// from the capital to the far west without loading the chunks between, edits one chunk, and prints
// build time and memory for 9, 25 and 50 chunks plus the cost of the island-wide route graph.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAreas } from '../src/sim/areas.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), cfg = data('data/world_chunks.json'), town = data('data/port_town.json');
const cap = world.capital, off = cap.cityOffset || { x: 0, z: 0 };
const city = { minX: cap.x + off.x + town.bounds.minX, maxX: cap.x + off.x + town.bounds.maxX, minZ: cap.z + off.z + town.bounds.minZ, maxZ: cap.z + off.z + town.bounds.maxZ };
const mb = () => process.memoryUsage().heapUsed / 1048576;
const out = [];
const log = s => { out.push(s); console.log(s); };

// 1. route graph over the whole island
let areas = createAreas({ world, cfg, city });
let t0 = performance.now();
const g = areas.ensureGraph();
log(`route graph: ${(performance.now() - t0).toFixed(0)} ms, ${g.cross.size} portal cells, ${[...g.borders.values()].reduce((n, l) => n + l.length, 0)} portals`);

// 2. a route from the city's west side to the far west, with no chunk loaded
const west = world.sites.reduce((a, b) => (b.x < a.x ? b : a));
t0 = performance.now();
const r = areas.route(city.minX - 30, (city.minZ + city.maxZ) / 2, west.x, west.z);
log(`route capital -> ${west.id} (x ${west.x}): ${(performance.now() - t0).toFixed(1)} ms, ${r.points.length} waypoints, ${(r.cost * world.terrain.cell).toFixed(0)} units, ${r.searched} nodes searched; chunks loaded: ${areas.cached()}`);
assert.ok(r && r.points.length > 1, 'island route found');
t0 = performance.now(); areas.route(r.points[0][0] - 50, (city.minZ + city.maxZ) / 2, west.x, west.z);
log(`same goal again from 300 units on (reuses the route): ${(performance.now() - t0).toFixed(1)} ms`);
assert.equal(areas.cached(), 0, 'no chunk loaded for an island route');

// 3. nine chunks around a point west of the city, and a path across their borders
const sx = city.minX - 200, sz = (city.minZ + city.maxZ) / 2;
const hero = { place: 'world', x: sx, z: sz };
let m0 = mb(); t0 = performance.now();
areas.update([hero]);
const nine = performance.now() - t0;
log(`9 chunks: ${nine.toFixed(0)} ms (${(nine / 9).toFixed(1)} ms each, worst ${areas.stats().worstMs.toFixed(1)} ms), heap +${(mb() - m0).toFixed(1)} MB`);
const [cx, cz] = areas.chunkOf(sx, sz);
const ax = cx * 250 + 20, az = cz * 250 + 20, bx = (cx + 1) * 250 + 200, bz = (cz + 1) * 250 + 200;
t0 = performance.now();
const p = areas.nav.findPath(...areas.nav.nearestFree(ax, az), ...areas.nav.nearestFree(bx, bz));
log(`fine path across 2 chunk borders: ${(performance.now() - t0).toFixed(1)} ms, ${p?.length} waypoints`);
assert.ok(p && p.length, 'fine path across chunk borders');
const crossX = p.some(([x]) => Math.floor(x / 250) !== cx), crossZ = p.some(([, z]) => Math.floor(z / 250) !== cz);
assert.ok(crossX || crossZ, 'path leaves the first chunk');

// 4. long walk path: refined near, coarse beyond
const lp = areas.nav.findPath(sx, sz, west.x, west.z);
assert.ok(lp && lp.replanAt > 0, 'a long path is refined near and coarse beyond');
log(`long path to ${west.id}: ${lp.length} waypoints, replan when ${lp.replanAt} are left`);

// 5. editing one chunk changes only its portals
const snap = () => JSON.stringify([...g.borders.entries()]);
const before = new Map(g.borders);
const ex = Math.floor(sx / 250) - 3, ez = Math.floor(sz / 250);
areas.editChunk(ex, ez, set => { for (let i = ez * 5; i < ez * 5 + 5; i++) set(i, ex * 5 + 2, false); });
const own = new Set([`E${ex},${ez}`, `E${ex - 1},${ez}`, `S${ex},${ez}`, `S${ex},${ez - 1}`]);
for (const [k, v] of g.borders) if (!own.has(k)) assert.equal(JSON.stringify(v), JSON.stringify(before.get(k)), `border ${k} unchanged`);
log(`edit chunk ${ex},${ez}: only its own 4 borders rebuilt`);

// 6. 25 and 50 chunks
for (const n of [25, 50]) {
  areas = createAreas({ world, cfg: { ...cfg, loadRadius: 0, keepChunks: 64 }, city });
  const side = Math.ceil(Math.sqrt(n)), units = [];
  for (let k = 0; k < n; k++) units.push({ place: 'world', x: sx - (k % side) * 250, z: sz - 500 + Math.floor(k / side) * 250 });
  global.gc?.(); m0 = mb(); t0 = performance.now();
  areas.update(units.slice(0, n));
  const ms = performance.now() - t0, s = areas.stats();
  log(`${s.active} active chunks: ${ms.toFixed(0)} ms, avg ${(s.buildMs / s.built).toFixed(1)} ms, worst ${s.worstMs.toFixed(1)} ms, heap +${(mb() - m0).toFixed(1)} MB`);
}
// one chunk's walk grid alone
log(`walk grid per chunk: ${(250 / cfg.navCell) ** 2 / 1024} KB (1 byte a cell)`);
console.log('proto_chunks: ok');
