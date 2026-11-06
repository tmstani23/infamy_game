// Stockade garrison (Tim 2026-11-06): 4-cell building, enter/leave, heal factor, safe from attack.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createGarrison } from '../src/sim/frontier/garrison.js';
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
// hits on people inside go to the stockade; at 0 it is ruined and everyone piles out (Tim 2026-11-06)
{
  const town3 = { id: 't3', owner: 'c1', x: 0, z: 0, grid: town.grid, buildings: [{ id: 'b3', type: 'stockade', cells: [12, 13, 17, 18], stage: 'built' }], workers: [] };
  const st3 = { tick: 1, frontier: { receipts: [], settlements: { t3: town3 } }, entities: {} };
  for (let i = 0; i < 3; i++) st3.entities['p' + i] = { id: 'p' + i, owner: 'c1', type: i ? 'crew' : 'hero', place: 'world', x: 5, z: 5, hp: 50, maxHp: 100 };
  const g3 = createGarrison({ state: st3, data, world: { settlement: id => st3.frontier.settlements[id] } });
  g3.command(st3.entities.p0, { action: 'garrison', mode: 'enter', town: 't3', units: ['p0', 'p1', 'p2'] });
  g3.tick();
  const [cx, cz] = [st3.entities.p0.x, st3.entities.p0.z];   // they stand at the stockade's centre
  const b = town3.buildings[0], max = st.garrison.hp, p1 = st3.entities.p1;
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
