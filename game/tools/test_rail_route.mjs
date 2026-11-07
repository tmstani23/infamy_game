// Train plan step 1: railway route finder. Run from the repo root: node game/tools/test_rail_route.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRailGrid, routeRail, pointAt, lineCells } from '../src/sim/frontier/rail_route.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const world = read('../data/world.json'), cfg = read('../data/railways.json').route;

// tiny world: 40 x 24 cells of 50 u, sea ring, a mountain wall at column 20 with one pass at row 18,
// a river at column 10 (rows 1-22), a lake blob in the east
const NX = 40, NZ = 24, CELL = 50;
const rows = [];
for (let i = 0; i < NZ; i++) rows.push([...Array(NX)].map((_, j) => (i === 0 || j === 0 || i === NZ - 1 || j === NX - 1) ? 'w' : 'p'));
for (let i = 1; i < NZ - 1; i++) { rows[i][20] = 'm'; rows[i][10] = 'r'; }
rows[18][20] = 'h';
for (let i = 4; i < 20; i++) for (let j = 28; j < 36; j++) rows[i][j] = 'w';
const tiny = { terrain: { cell: CELL, rows: rows.map(r => r.join('')) } };
const G = createRailGrid(tiny, cfg);
const codeAt = (x, z) => rows[Math.floor(z / CELL)][Math.floor(x / CELL)];

// through the pass, across the river on a bridge, never on the mountain
const a = { x: 125, z: 125 }, b = { x: 1325, z: 125 };
const line = routeRail(G, a, b);
assert.ok(line, 'route found');
assert.deepEqual(line.points[0], [a.x, a.z]); assert.deepEqual(line.points.at(-1), [b.x, b.z]);
for (const k of lineCells(G, line)) assert.notEqual(tiny.terrain.rows[(k / NX) | 0][k % NX], 'm', 'never on a mountain');
const pass = line.points.some(([x, z]) => Math.floor(x / CELL) === 20 && Math.floor(z / CELL) === 18) || [...lineCells(G, line)].includes(18 * NX + 20);
assert.ok(pass, 'goes through the pass');
assert.ok(line.length > Math.hypot(b.x - a.x, b.z - a.z) + 600, 'detours to the pass');
assert.equal(line.bridges.length, 1, 'one bridge over the river');
const [d0, d1] = line.bridges[0];
assert.equal(codeAt(pointAt(line, (d0 + d1) / 2).x, pointAt(line, (d0 + d1) / 2).z), 'r', 'the bridge is over the river');
assert.ok(d1 - d0 < 200, 'short bridge');

// a wide lake is too long to bridge, so the route goes round it
const c = { x: 1125, z: 600 }, d = { x: 1875, z: 600 };
const round = routeRail(G, c, d);
assert.ok(round, 'route round the lake');
assert.ok(round.bridges.every(([s, e]) => e - s <= cfg.maxBridge + CELL), 'no long bridge');
assert.ok(round.length > 800, 'went round');

// blocked: a point inside the mountain wall
assert.equal(routeRail(G, a, { x: 1025, z: 300 }), null, 'no route onto a mountain');

// reuse: a second link from near the first line leans onto it
const branch = routeRail(G, { x: 125, z: 1025 }, b, { reuse: [line] });
const shared = [...lineCells(G, branch)].filter(k => lineCells(G, line).has(k)).length;
assert.ok(shared > 20, `branch shares track (${shared} cells)`);

// pointAt walks the line
const mid = pointAt(line, line.length / 2);
assert.ok(Number.isFinite(mid.x) && Number.isFinite(mid.heading));
assert.deepEqual([pointAt(line, -5).x, pointAt(line, -5).z], [a.x, a.z]);

// the real island: capital to every site, fast, never on mountains or long water
const RG = createRailGrid(world, cfg);
const code = (x, z) => world.terrain.rows[Math.floor(z / 50)]?.[Math.floor(x / 50)];
let worst = 0, missing = [];
for (const s of world.sites) {
  const t0 = performance.now(), l = routeRail(RG, world.capital, s);
  worst = Math.max(worst, performance.now() - t0);
  if (!l) { missing.push(s.id); continue; }
  for (const k of lineCells(RG, l)) assert.notEqual(world.terrain.rows[(k / RG.nx) | 0][k % RG.nx], 'm', `${s.id} not on a mountain`);
  for (const [s0, s1] of l.bridges) assert.ok(s1 - s0 <= cfg.maxBridge + 100, `${s.id} bridge ${Math.round(s1 - s0)} too long`);
  assert.ok(code(l.points[1][0], l.points[1][1]) !== 'm');
}
assert.ok(missing.length <= 3, `routes to almost every site (missing ${missing.join(',')})`);
assert.ok(worst < 400, `each route under 400 ms (worst ${Math.round(worst)})`);
console.log(`rail route OK (island: ${world.sites.length - missing.length}/${world.sites.length} sites, worst ${Math.round(worst)} ms${missing.length ? ', unreachable ' + missing.join(',') : ''})`);
