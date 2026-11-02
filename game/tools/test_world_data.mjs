// W1.2: world format and validator. Run from the repo root: node game/tools/test_world_data.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terrainAt, passable, buildable, validateWorld, countRoutes } from '../src/sim/world_data.js';

const shell = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url)));
assert.equal(shell.version, 1);
for (const k of ['rules', 'terrain', 'sites', 'nodes', 'camps', 'passes', 'fords', 'corridors', 'seaLanes'])
  assert.ok(k in shell, `world.json has ${k}`);

// Tiny island: 40 x 24 cells of 100 u. Sea ring, a mountain wall at column 20 with three
// gaps (passes), capital in the east, two sites west of the wall and one east.
const NX = 40, NZ = 24, CELL = 100;
function tiny(edit) {
  const g = [];
  for (let i = 0; i < NZ; i++) g.push([...Array(NX)].map((_, j) => (i === 0 || j === 0 || i === NZ - 1 || j === NX - 1) ? 'w' : 'p'));
  for (let i = 1; i < NZ - 1; i++) g[i][20] = 'm';
  for (const i of [4, 12, 20]) g[i][20] = 'h';
  const w = {
    version: 1, size: { w: NX * CELL, h: NZ * CELL }, rules: structuredClone(shell.rules),
    capital: { x: 3550, z: 1250, port: { x: 3850, z: 1250 } },
    coast: [[100, 100], [3900, 100], [3900, 2300], [100, 2300]], islets: [],
    terrain: { cell: CELL, codes: shell.terrain.codes, rows: null },
    passes: [{ id: 'P1', x: 2050, z: 450 }, { id: 'P2', x: 2050, z: 1250 }, { id: 'P3', x: 2050, z: 2050 }],
    fords: [],
    sites: [
      { id: 'A', x: 850, z: 650 },
      { id: 'B', x: 850, z: 1850 },
      { id: 'C', x: 2950, z: 1850, harbor: { x: 2950, z: 2250 } }
    ],
    nodes: [{ id: 'N1', kind: 'forest', x: 1550, z: 1050 }],
    camps: [{ id: 'K1', kind: 'bandit', x: 1550, z: 1650 }],
    seaLanes: [{ id: 'L1', from: 'capital', to: 'C', points: [[3950, 1250], [3950, 2350], [2950, 2350]] }],
    corridors: []
  };
  edit?.(w, g);
  w.terrain.rows = g.map(r => r.join(''));
  return w;
}
const codes = (problems) => problems.map(p => p.code);

// helpers
const ok = tiny();
assert.equal(terrainAt(ok, 50, 50), 'w');
assert.equal(terrainAt(ok, 2050, 1250), 'h');
assert.equal(terrainAt(ok, -10, 500), 'w', 'off the grid is sea');
assert.equal(passable(ok, 2050, 850), false, 'mountain blocks');
assert.equal(passable(ok, 2050, 1250), true, 'pass is walkable');
assert.equal(buildable(ok, 850, 650), true);
assert.equal(countRoutes(ok, 850, 650).routes, 3);

// the good world passes
assert.deepEqual(validateWorld(ok), [], JSON.stringify(validateWorld(ok)));

// site in water
let p = validateWorld(tiny(w => { w.sites[0].x = 50; }));
assert.ok(codes(p).includes('bad_ground'), JSON.stringify(p));
assert.ok(p.some(q => q.id === 'A'));

// two sites too close
p = validateWorld(tiny(w => { w.sites[1].z = 1050; }));
assert.ok(codes(p).includes('too_close'), JSON.stringify(p));

// one-pass island: the only pass seals the west, and western sites have one route
p = validateWorld(tiny((w, g) => { g[12][20] = 'm'; g[20][20] = 'm'; w.passes = [w.passes[0]]; }));
assert.ok(p.some(q => q.code === 'pass_seals' && q.id === 'P1'), JSON.stringify(p));
assert.ok(p.some(q => q.code === 'few_routes' && q.id === 'A'));

// a river with one ford cuts off the far west: one route, but no pass seals anything
p = validateWorld(tiny((w, g) => { for (let i = 1; i < NZ - 1; i++) g[i][10] = 'r'; w.fords = [{ id: 'F1', x: 1050, z: 1250 }]; }));
assert.ok(p.some(q => q.code === 'few_routes' && q.id === 'A'), JSON.stringify(p));
assert.ok(p.some(q => q.code === 'few_routes' && q.id === 'B'));
assert.ok(!codes(p).includes('pass_seals'));
assert.ok(!p.some(q => q.id === 'C'), 'east site is unaffected');

// harbor in the sea and a lane over land
p = validateWorld(tiny(w => { w.sites[2].harbor = { x: 2950, z: 2350 }; }));
assert.ok(codes(p).includes('bad_harbor'));
p = validateWorld(tiny(w => { w.seaLanes[0].points = [[3950, 1250], [2950, 1250], [2950, 2350]]; }));
assert.ok(codes(p).includes('bad_lane'), JSON.stringify(p));

// too much unbuildable land
p = validateWorld(tiny((w, g) => { for (let i = 1; i < NZ - 1; i++) for (let j = 21; j < 34; j++) g[i][j] = 'k'; }));
assert.ok(codes(p).includes('too_unbuildable'), JSON.stringify(p));

// reads never write
const before = JSON.stringify(ok);
validateWorld(ok); countRoutes(ok, 850, 650);
assert.equal(JSON.stringify(ok), before);

console.log('test_world_data: ok');
