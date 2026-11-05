// Economy balance B7: growth and level-up records, cosmetic walkers. Run: node game/tools/test_frontier_arrivals.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { centreCell, cellToWorld } from '../src/sim/frontier/town_grid.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
delete data.tiers; delete data.upkeep;
const state = { tick: 0, entities: {}, news: [], match: { mode: 'campaign' } };
const fr = createFrontier({ state, data });
fr.world.addTown({ id: 't', name: 'Town', owner: 'player', x: 3000, z: 3000, pop: 6, stock: { food: 5000, timber: 500, stone: 50, goods: 500, ryo: 50 }, buildings: [{ type: 'town_hall', cell: 0 }] });
void fr.world;
const s = state.frontier.settlements.t, n = s.grid.n, C = centreCell(n), at = (x, z) => C + z * n + x;
const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);
for (const i of [at(1, 1), at(2, 1)]) { s.grid.zone = put(s.grid.zone, i, data.zones.kinds.housing.char); s.grid.stage = put(s.grid.stage, i, '1'); s.grid.ground = put(s.grid.ground, i, 'c'); }
fr.command({ owner: 'player' }, { type: 'frontier', town: 't', action: 'place', kind: 'road', cells: [at(1, 0)] });
// a fake runtime: spawn/remove entities, straight-line paths; a player unit stands next to the town
let nextId = 1;
const runtime = { spawn: (type, model, x, z, extra) => { const id = `e${nextId++}`; state.entities[id] = { id, type, model, x, z, ...extra }; return id; },
  remove: id => { delete state.entities[id]; },
  areas: { nav: { workerPath: (ax, az, bx, bz) => [[ax, az], [bx, bz]], nearestFree: (x, z) => [x, z] } } };
fr.attach(runtime);
state.entities.h = { id: 'h', type: 'hero', owner: 'player', place: 'world', x: 3000, z: 3000 };
const pop0 = s.pop;
let sawWalker = false, sawLevel = false, sawArrive = false, models = new Set();
for (let i = 0; i < 20 * 60 * 6; i++) {
  state.tick++; fr.tick();
  const w = Object.values(state.entities).filter(e => e.arrival);
  if (w.length) { sawWalker = true; w.forEach(e => models.add(e.model)); }
  if (s.fx?.some(f => f.kind === 'level')) sawLevel = true;
  if (s.fx?.some(f => f.kind === 'arrive')) sawArrive = true;
}
assert.ok(s.pop > pop0, 'the town grew');
assert.ok(sawWalker, 'a newcomer walked in');
assert.ok(![...models].includes(data.workers.model), 'newcomers do not look like workers');
assert.ok(sawArrive, '+1 record when they arrive');
assert.ok(sawLevel, 'a house levelled up and left a scaffold record');
assert.ok((s.fx || []).every(f => state.tick - f.tick <= data.arrivals.fxTicks), 'old effects are pruned');
assert.deepEqual(JSON.parse(JSON.stringify(s.arrivals || [])), s.arrivals || [], 'plain saved data');
// with nobody near, people simply arrive (no walker)
state.entities.h.x = 99999;
for (let i = 0; i < 20 * 60 * 3; i++) { state.tick++; fr.tick(); }
assert.equal(Object.values(state.entities).filter(e => e.arrival).length, 0);
console.log('test_frontier_arrivals: ok', [...models].join(','));
