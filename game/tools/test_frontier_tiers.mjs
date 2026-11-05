// Economy balance B3: town hall tiers (ring, zone cell caps, placed counts, worker cap, upgrade).
// Run from the repo root: node game/tools/test_frontier_tiers.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { centreCell } from '../src/sim/frontier/town_grid.js';
import { tierOf, placedRoom, upgradeCheck } from '../src/sim/frontier/tiers.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const T = data.tiers.list, cs = data.townGrid.cellSize;
function fresh(stock = { food: 500, timber: 900, stone: 900, goods: 100, ryo: 900 }) {
  const state = { tick: 0, entities: {}, news: [] };
  const fr = createFrontier({ state, data });
  fr.world.addTown({ id: 't', name: 'Town', owner: 'player', x: 3000, z: 3000, pop: 30, stock, buildings: [{ type: 'town_hall', cell: 0 }] });
  void fr.world;
  const s = state.frontier.settlements.t, n = s.grid.n, C = centreCell(n);
  for (let i = 0; i < s.grid.ground.length; i++) if (s.grid.ground[i] !== 'x') s.grid.ground = s.grid.ground.slice(0, i) + 'c' + s.grid.ground.slice(i + 1);
  const at = (x, z) => C + z * n + x;
  const send = c => { fr.command({ owner: 'player' }, { type: 'frontier', town: 't', settlement: 't', ...c }); return state.frontier.receipts.at(-1); };
  const econ = k => { for (let i = 0; i < k * data.cadenceTicks; i++) { state.tick++; fr.tick(); } };
  return { state, fr, s, at, send, econ };
}
const cellsOut = r => Math.floor(r / cs);

// tier 1: ring, zone cell cap, placed counts, worker cap
{
  const { s, at, send } = fresh();
  assert.equal(tierOf(s, data).name, T[0].name);
  const edge = cellsOut(T[0].ring), past = edge + 2;
  assert.equal(send({ action: 'zone', kind: 'farm', cells: [at(past, 0)] }).reason, 'outside the town ring');
  assert.equal(send({ action: 'place', kind: 'storehouse', cells: [at(past, 0)] }).reason, 'outside the town ring');
  assert.equal(send({ action: 'place', kind: 'road', cells: [at(past, 0)] }).ok, true, 'roads go outside the ring');
  assert.equal(send({ action: 'place', kind: 'wall', cells: [at(past, 2)] }).reason, 'outside the town ring', 'walls stay inside');
  // work zone cap (tier 1 = T[0].cells.work cells)
  const cap = T[0].cells.work, cells = Array.from({ length: cap + 1 }, (_, k) => at(-3 + (k % 3), 3 + Math.floor(k / 3)));
  const r = send({ action: 'zone', kind: 'work', cells });
  assert.equal(r.ok, false); assert.equal(r.reason, 'town hall tier limit');
  assert.equal(send({ action: 'zone', kind: 'work', cells: cells.slice(0, cap) }).ok, true);
  // placed count: storehouses
  assert.equal(placedRoom(s, 'storehouse', data), T[0].placed.storehouse);
  assert.equal(placedRoom(s, 'stockade', data), 0);
  assert.equal(send({ action: 'place', kind: 'stockade', cells: [at(4, -4)] }).reason, 'town hall tier limit');
  // worker cap
  s.workers = Array.from({ length: T[0].workers }, (_, k) => ({ id: `w${k}`, entity: null, spot: null, carrying: 0 }));
  assert.equal(send({ action: 'train', count: 1 }).reason, 'town hall tier worker limit');
}

// upgrade: needs people and stock, pays at once, arrives after its ticks, ring and caps grow, alert fires
{
  const { state, fr, s, at, send, econ } = fresh({ food: 500, timber: 10, stone: 900, goods: 100, ryo: 900 });
  assert.match(send({ action: 'upgradeHall' }).reason, /needs .* timber/);
  fr.world.change('t', 'timber', 890, 'test');
  s.pop = 5; assert.match(upgradeCheck(s, data).reason, /needs \d+ people/); s.pop = 30;
  const up = T[1].upgrade;
  assert.equal(send({ action: 'upgradeHall' }).ok, true);
  assert.equal(s.stock.timber, 900 - up.cost.timber);
  assert.equal(send({ action: 'upgradeHall' }).reason, 'upgrade already under way');
  econ(up.ticks - 1); assert.equal(s.tier || 1, 1);
  econ(1); assert.equal(s.tier, 2);
  const mid = cellsOut(T[0].ring) + 2;
  assert.equal(send({ action: 'zone', kind: 'farm', cells: [at(mid, 0)] }).ok, true, 'tier 2 ring is wider');
}
console.log('test_frontier_tiers: ok');
