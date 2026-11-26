// Stockade garrison (2026-11-06): 4-cell building, enter/leave, heal factor, safe from attack.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createGarrison, stockadeHp } from '../src/sim/frontier/garrison.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/frontier.json', import.meta.url)));
const st = data.buildings.stockade;
assert.equal(st.size, 2, 'stockade is 4 cells');
assert.equal(st.garrison.capacity, 40);
assert.ok(st.garrison.healFactor > 1);
const town = { id: 't1', owner: 'c1', x: 0, z: 0, grid: { n: 5, cell: 10, use: '.'.repeat(25), zone: '.'.repeat(25), ground: 'c'.repeat(25), stage: '0'.repeat(25), by: '.'.repeat(25) }, buildings: [{ id: 'b1', type: 'stockade', cells: [12, 13, 17, 18], stage: 'built' }] };
const state = { tick: 1, frontier: { receipts: [], settlements: { t1: town } }, entities: {} };
for (let i = 0; i < 45; i++) state.entities['u' + i] = { id: 'u' + i, owner: 'c1', type: i ? 'crew' : 'hero', place: 'world', x: 5, z: 5, hp: 10, maxHp: 100 };
state.entities.foe = { id: 'foe', owner: 'c2', type: 'crew', place: 'world', x: 5, z: 5 };
const g = createGarrison({ state, data, world: { settlement: id => state.frontier.settlements[id] } });
const hero = state.entities.u0, ids = Object.keys(state.entities).filter(k => k.startsWith('u'));
const last = () => state.frontier.receipts.at(-1);
g.command(hero, { action: 'garrison', mode: 'enter', town: 't1', units: ['foe'] });
assert.equal(last().ok, false, 'not your unit');
g.command(hero, { action: 'garrison', mode: 'enter', town: 't1', units: ids });
assert.equal(g.members(town).length, 40, 'capacity 40');
assert.equal(last().ok, true);
assert.equal(state.entities.u44.garrison, undefined, 'the 41st stays out');
assert.equal(hero.garrison.heal, st.garrison.healFactor);
g.tick();
assert.ok(Math.hypot(hero.x - 15, hero.z - 5) < 11, 'stands at the stockade');
g.command(hero, { action: 'garrison', mode: 'leave', town: 't1', units: ['u1'] });
assert.equal(state.entities.u1.garrison, undefined);
assert.equal(g.members(town).length, 39);
town.buildings[0].stage = 'ruin'; g.tick();
assert.equal(g.members(town).length, 0, 'no stockade, nobody inside');
console.log('garrison ok');
// workers: garrisoned = idle with the status text, and they come out again
const town2 = { id: 't2', owner: 'c1', x: 0, z: 0, grid: town.grid, buildings: [{ id: 'b2', type: 'stockade', cells: [12, 13, 17, 18], stage: 'built' }], workers: [{ id: 'w1', spot: 's', trip: {}, entity: 'e9' }] };
const st2 = { tick: 1, frontier: { receipts: [], settlements: { t2: town2 } }, entities: { e9: { id: 'e9', type: 'civilian', worker: 'w1', workerOwner: 'c1', place: 'world', x: 5, z: 5 }, h: { id: 'h', owner: 'c1', type: 'hero', place: 'world', x: 5, z: 5 } } };
const g2 = createGarrison({ state: st2, data, world: { settlement: id => st2.frontier.settlements[id] } });
g2.command(st2.entities.h, { action: 'garrison', mode: 'enter', town: 't2', units: ['e9'] });
assert.equal(town2.workers[0].garrison, true);
assert.equal(town2.workers[0].order.kind, 'hold');
assert.equal(town2.workers[0].spot, null);
const { workerStatus, workerIdle } = await import('../src/worker_panel.js');
assert.equal(workerStatus(town2.workers[0], new Map()), 'Garrisoned in stockade');
assert.ok(workerIdle(town2.workers[0], new Map()), 'garrisoned workers count as idle');
g2.command(st2.entities.h, { action: 'garrison', mode: 'leave', town: 't2' });
assert.equal(town2.workers[0].garrison, undefined);
console.log('garrison workers ok');
// hits on people inside go to the stockade; at 0 it is ruined and everyone piles out (2026-11-06)
{
  const town3 = { id: 't3', owner: 'c1', x: 0, z: 0, grid: town.grid, buildings: [{ id: 'b3', type: 'stockade', cells: [12, 13, 17, 18], stage: 'built' }], workers: [] };
  const st3 = { tick: 1, frontier: { receipts: [], settlements: { t3: town3 } }, entities: {} };
  for (let i = 0; i < 3; i++) st3.entities['p' + i] = { id: 'p' + i, owner: 'c1', type: i ? 'crew' : 'hero', place: 'world', x: 5, z: 5, hp: 50, maxHp: 100 };
  const g3 = createGarrison({ state: st3, data, world: { settlement: id => st3.frontier.settlements[id] } });
  g3.command(st3.entities.p0, { action: 'garrison', mode: 'enter', town: 't3', units: ['p0', 'p1', 'p2'] });
  g3.tick();
  const [cx, cz] = [st3.entities.p0.x, st3.entities.p0.z];   // they stand at the stockade's centre
  const b = town3.buildings[0], max = stockadeHp(data, town3.tier), p1 = st3.entities.p1;   // by town hall tier (hpByTier)
  assert.ok(max > 0, 'stockade has health');
  assert.equal(g3.shelter(p1, 60), true, 'absorbed');
  assert.equal(p1.hp, 50, 'the person inside is not hurt');
  assert.equal(b.hp, max - 60, 'the stockade is');
  assert.equal(g3.shelter(p1, max), true);
  assert.equal(b.stage, 'ruined', 'broken');
  assert.equal(g3.members(town3).length, 0, 'everyone piles out');
  for (const id of ['p0', 'p1', 'p2']) {
    const u = st3.entities[id];
    assert.ok(!u.garrison && Math.hypot(u.x - cx, u.z - cz) >= 10, `${id} out round the ruin (${u.x},${u.z} from ${cx},${cz})`);
  }
  assert.equal(g3.shelter(p1, 10), false, 'outside again: hits land as normal');
  console.log('garrison stockade health ok');
}
// right-click walk-in, count and evacuate (2026-11-07)
{
  const { garrisonCount } = await import('../src/town_props.js');
  const t = { id: 't4', owner: 'c1', x: 0, z: 0, grid: town.grid, buildings: [{ id: 'b4', type: 'stockade', cells: [12, 13, 17, 18], stage: 'built' }], workers: [] };
  const s4 = { tick: 1, frontier: { receipts: [], settlements: { t4: t } }, entities: { h: { id: 'h', owner: 'c1', type: 'hero', place: 'world', x: 90, z: 5 }, a: { id: 'a', owner: 'c1', type: 'crew', place: 'world', x: 60, z: 5 }, n: { id: 'n', owner: 'c1', type: 'crew', place: 'world', x: 16, z: 5 } } };
  const g4 = createGarrison({ state: s4, data, world: { settlement: id => s4.frontier.settlements[id] } });
  g4.command(s4.entities.h, { action: 'garrison', mode: 'enter', town: 't4', walk: true, units: ['h', 'a', 'n'] });
  assert.ok(s4.entities.n.garrison, 'near crew go in at once');
  assert.equal(s4.entities.a.order.garrisonGo, 't4', 'far crew walk over');
  assert.equal(s4.entities.h.order.garrisonGo, 't4', 'a far hero walks over too');
  g4.tick(); assert.ok(!s4.entities.a.garrison, 'not there yet');
  s4.entities.a.x = 12; g4.tick();
  assert.ok(s4.entities.a.garrison, 'goes in on arrival');
  s4.entities.h.x = 12; g4.tick();
  assert.ok(s4.entities.h.garrison, 'the hero is admitted on arrival');
  assert.equal(garrisonCount(s4.frontier, s4.entities, t), 3);
  g4.command(s4.entities.h, { action: 'garrison', mode: 'leave', town: 't4' });
  assert.equal(garrisonCount(s4.frontier, s4.entities, t), 0, 'evacuated');
  console.log('garrison walk-in ok');
}

// the stockade as a fortress (2026-11-16): health by town hall tier, several stockades, each with its own room
{
  // stockadeHp imported at the top
  const { garrisonCount, stockadeMax } = await import('../src/town_props.js');
  assert.deepEqual([2, 3].map(t => stockadeHp(data, t)), [32000, 48000], 'Village 32,000, Town 48,000 (2026-11-18: 20 percent off)');
  assert.deepEqual(data.tiers.list.map(t => t.placed.stockade), [0, 1, 3], 'none, one, three');
  const { buildingCost } = await import('../src/sim/frontier/tiers.js');
  assert.deepEqual([2, 3].map(t => buildingCost(data, 'stockade', { tier: t })), [{ timber: 400, stone: 450 }, { timber: 500, stone: 600 }], 'cost by town rank');
  assert.deepEqual(buildingCost(data, 'storehouse', { tier: 3 }), data.buildings.storehouse.cost, 'other buildings keep their one cost');
  assert.deepEqual(data.war.buildings.stockade.cost, { timber: 400, stone: 450 }, 'the camp stockade costs the Village price');
  const grid = { n: 9, cell: 10, use: '.'.repeat(81), zone: '.'.repeat(81), ground: 'c'.repeat(81), stage: '0'.repeat(81), by: '.'.repeat(81) };
  const t = { id: 't5', owner: 'c1', tier: 3, x: 0, z: 0, grid, workers: [], buildings: [{ id: 'f1', type: 'stockade', cells: [10, 11, 19, 20], stage: 'built' }, { id: 'f2', type: 'stockade', cells: [60, 61, 69, 70], stage: 'built' }] };
  const s5 = { tick: 1, frontier: { receipts: [], settlements: { t5: t } }, entities: {} };
  const g5 = createGarrison({ state: s5, data, world: { settlement: id => s5.frontier.settlements[id] } }), last5 = () => s5.frontier.receipts.at(-1);
  assert.equal(stockadeMax(data, t), 48000);
  const [c1, c2] = t.buildings.map(b => { const e = { id: 'probe' + b.id, owner: 'c1', type: 'crew', place: 'world', x: 0, z: 0 }; s5.entities[e.id] = e; g5.command(e, { action: 'garrison', mode: 'enter', town: 't5', building: b.id, units: [e.id], walk: true }); return [e.order.x, e.order.z]; });
  for (const k of Object.keys(s5.entities)) delete s5.entities[k];
  assert.ok(Math.hypot(c1[0] - c2[0], c1[1] - c2[1]) > 30, 'two stockades apart');
  for (let i = 0; i < 45; i++) s5.entities['v' + String(i).padStart(2, '0')] = { id: 'v' + String(i).padStart(2, '0'), owner: 'c1', type: i ? 'crew' : 'hero', place: 'world', x: c1[0], z: c1[1], hp: 50, maxHp: 100 };
  const hero5 = s5.entities.v00, all = Object.keys(s5.entities);
  g5.command(hero5, { action: 'garrison', mode: 'enter', town: 't5', units: all, walk: true });
  assert.equal(g5.membersIn(t, t.buildings[0]).length, 40, 'the near stockade fills');
  const rest = all.filter(id => !s5.entities[id].garrison);
  assert.equal(rest.length, 5); assert.ok(rest.every(id => s5.entities[id].order?.garrisonB === 'f2'), 'the rest walk to the one with room');
  for (const id of rest) { s5.entities[id].x = c2[0]; s5.entities[id].z = c2[1]; }
  g5.tick();
  assert.equal(g5.membersIn(t, t.buildings[1]).length, 5, 'and go in there');
  assert.equal(garrisonCount(s5.frontier, s5.entities, t), 45); assert.equal(garrisonCount(s5.frontier, s5.entities, t, t.buildings[1]), 5, 'counted per stockade');
  // a hit on someone inside lands on his own stockade; the other one is untouched
  g5.shelter(s5.entities[rest[0]], 1000, null);
  assert.equal(t.buildings[1].hp, stockadeHp(data, t.tier) - 1000); assert.equal(t.buildings[0].hp, undefined);
  g5.command(hero5, { action: 'garrison', mode: 'leave', town: 't5', building: 'f2' });
  assert.equal(g5.membersIn(t, t.buildings[1]).length, 0); assert.equal(g5.membersIn(t, t.buildings[0]).length, 40, 'leave one stockade only');
  g5.command(hero5, { action: 'garrison', mode: 'leave', town: 't5' });
  assert.equal(g5.members(t).length, 0, 'leave with no building: everyone out');
  console.log('garrison fortress ok');
}
