// Loop 3, card L3.3: zones, health and growth. Run: node game/tools/test_frontier_zones.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { gridSize, centreCell } from '../src/sim/frontier/town_grid.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
delete data.tiers; delete data.upkeep;   // B3 tiers and B5 upkeep are covered by test_frontier_tiers.mjs / test_frontier_upkeep.mjs
const Z = data.zones, K = Z.kinds, cad = data.cadenceTicks;
const n = gridSize(data), C = centreCell(n);
const at = (dx, dz) => C + dz * n + dx;
const colRow = i => [i % n, Math.floor(i / n)];
const me = { owner: 'player' };

function fresh({ pop = 6, stock = { food: 500, timber: 500, stone: 200 }, buildings = [{ type: 'town_hall', cell: 0 }], grid = true } = {}) {
  const state = { tick: 0 };
  const fr = createFrontier({ state, data });
  fr.world.addTown({ id: 't', name: 'T', region: null, owner: 'player', x: grid ? 3000 : undefined, z: grid ? 3000 : undefined, site: null,
    traits: { soil: 2, water: 2, defense: 2, nodes: {} }, pop, stock, buildings });
  void fr.world;
  const s = state.frontier.settlements.t;
  const send = c => { fr.command(me, { type: 'frontier', town: 't', ...c }); return state.frontier.receipts.at(-1); };
  const econ = k => { for (let i = 0; i < k * cad; i++) { fr.tick(); state.tick++; } };
  return { state, fr, s, send, econ };
}
const rectOf = (i, j = i) => [...colRow(i), ...colRow(j)];
const ch = kind => K[kind].char;
const housingMax = K.housing.stages.length;

// 0. the zone action: core only, unbuildable/used skipped or refused, receipts
{
  const { s, send } = fresh();
  const far = at(Math.ceil(data.townGrid.coreRadius / data.townGrid.cellSize) + 3, 0);
  assert.equal(send({ action: 'zone', kind: 'housing', rect: rectOf(far) }).reason, 'outside the town ring');
  assert.equal(send({ action: 'zone', kind: 'farm', rect: rectOf(far) }).reason, 'outside the town ring', 'B3: farms stay inside the ring too');
  assert.equal(send({ action: 'zone', kind: 'nope', rect: rectOf(at(1, 1)) }).reason, 'unknown zone kind');
  const r = send({ action: 'zone', kind: 'housing', rect: rectOf(at(-1, -1), at(1, 1)) });
  assert.equal(r.ok, true); assert.equal(r.cells.length, 8, 'the hall cell is skipped');
  assert.equal(s.grid.zone[at(1, 1)], ch('housing')); assert.equal(s.grid.by[at(1, 1)], 'p');
  assert.equal(send({ action: 'zone', kind: 'work', rect: rectOf(at(1, 1)) }).reason, 'occupied');
  const before = JSON.stringify(s);
  send({ action: 'zone', kind: 'work', rect: rectOf(at(2, 2)), dryRun: true });
  assert.equal(JSON.stringify(s), before, 'dry run changes nothing');
  assert.equal(send({ action: 'remove', cells: [at(1, 1)] }).ok, true, 'the eraser unzones');
  assert.equal(s.grid.zone[at(1, 1)], '.');
}

// 1. housing next to a road grows hut -> house -> large house; one with no road stays at 0 with 'needs road'
{
  const { s, send, econ } = fresh();
  const reach = K.housing.needs.roadReach;
  const roadCell = at(reach + 6, 0), near = at(reach + 6, 1), lonely = at(0, -(reach + 6));
  assert.equal(send({ action: 'place', kind: 'road', cells: [roadCell] }).ok, true);
  assert.equal(send({ action: 'zone', kind: 'housing', rect: rectOf(near) }).ok, true);
  assert.equal(send({ action: 'zone', kind: 'housing', rect: rectOf(lonely) }).ok, true);
  const seen = [];
  for (let t = 0; t < K.housing.growTicks * housingMax + 5; t++) { econ(1); const st = +s.grid.stage[near]; if (seen.at(-1) !== st) seen.push(st); }
  assert.deepEqual(seen, [0, 1, 2, 3].slice(0, housingMax + 1), 'one stage at a time');
  assert.equal(+s.grid.stage[lonely], 0, 'no road: stays at stage 0');
  assert.ok(s.report.waiting.includes('needs road'));
  assert.equal(s.zones.housing.noRoad, 1);
  assert.equal(s.housing, data.buildings.town_hall.housing + K.housing.housing * housingMax, 'housing from the grown cell');
}

// 2. starving a farm zone for abandonTicks sets its output to 0; feeding it again recovers it
{
  const { s, send, econ, fr } = fresh({ pop: 6 });
  assert.equal(send({ action: 'zone', kind: 'farm', rect: rectOf(at(1, 0), at(2, 1)) }).ok, true);
  econ(K.farm.growTicks + 2);
  assert.ok(s.zones.farm.output > 0, 'grown farm makes food');
  const pop = s.pop;
  fr.world.changePop('t', -pop, 'test: workers gone');
  econ(K.farm.abandonTicks - 1);
  assert.equal(s.zones.farm.abandoned, false, 'not yet');
  econ(2);
  assert.equal(s.zones.farm.abandoned, true);
  assert.equal(s.zones.farm.output, 0);
  assert.equal(+s.grid.stage[at(1, 0)], 1, 'stage kept: nothing destroyed');
  fr.world.changePop('t', pop, 'test: workers back');
  econ(2);
  assert.equal(s.zones.farm.abandoned, false, 'recovers when needs return');
  assert.ok(s.zones.farm.output > 0);
}

// 3. the governor never changes a 'p' cell, and zones untouched cells itself
{
  const { s, send, econ } = fresh({ pop: 12 });
  s.autoBuild = true;
  assert.equal(send({ action: 'zone', kind: 'work', rect: rectOf(at(-2, -2), at(2, -1)) }).ok, true);
  const mine = [...s.grid.by].map((b, i) => b === 'p' ? i : -1).filter(i => i >= 0);
  const snap = () => mine.map(i => s.grid.zone[i] + s.grid.by[i]).join();
  const before = snap();
  econ(data.governor.reviewTicks * 30);
  assert.equal(snap(), before, 'player cells untouched');
  assert.ok(s.grid.by.includes('g'), 'the governor zoned something');
  for (let i = 0; i < s.grid.by.length; i++) if (s.grid.by[i] === 'g') assert.notEqual(s.grid.zone[i], '.');
}

// 4. a migrated old town keeps pop, food and goods within 5% over 100 economy ticks
{
  const old = [{ type: 'town_hall', cell: 0 }, { type: 'house', cell: 1 }, { type: 'house', cell: 2 }, { type: 'farm', cell: 3 }, { type: 'workshop', cell: 4 }];
  const opts = { pop: 10, stock: { food: 60, timber: 300, stone: 200 }, buildings: old };
  const a = fresh({ ...opts, grid: false }), b = fresh({ ...opts });
  assert.equal(a.s.grid, null, 'legacy town: no grid');
  a.econ(100); b.econ(100);
  assert.ok(!b.s.buildings.some(x => Z.fromBuilding[x.type]), 'old buildings became zones');
  for (const k of Object.values(Z.fromBuilding)) assert.ok(b.s.grid.zone.includes(K[k].char), `has ${k} zone`);
  const within = (x, y, what) => assert.ok(Math.abs(x - y) <= 0.05 * Math.max(1, Math.abs(y)), `${what}: ${x} vs ${y}`);
  within(b.s.pop, a.s.pop, 'pop'); within(b.s.housing, a.s.housing, 'housing');
  within(b.s.stock.food, a.s.stock.food, 'food'); within(b.s.stock.goods, a.s.stock.goods, 'goods');
  assert.ok(a.s.stock.goods > 0);
  b.fr.world.checkInvariants();
}

// 5. no zone kind or number is hard-coded in zones.js
{
  let src = readFileSync(new URL('../src/sim/frontier/zones.js', import.meta.url), 'utf8');
  src = src.replace(/\/\/.*$/gm, '');
  for (const kind of Object.keys(K)) assert.ok(!new RegExp(`['"\`]${kind}['"\`]`).test(src), `kind ${kind} hard-coded`);
  const code = src.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
  const nums = (code.match(/(?<![\w.])\d+(\.\d+)?(e-?\d+)?/g) || []).filter(x => !['0', '1'].includes(x));
  assert.deepEqual(nums, [], 'only 0 and 1 as literals');
}

console.log('test_frontier_zones: all passed');
