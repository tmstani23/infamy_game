// Loop 3, card L3.2: place/remove on the town grid with the trap check. Run: node game/tools/test_frontier_place.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { gridSize, centreCell } from '../src/sim/frontier/town_grid.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const n = gridSize(data), C = centreCell(n);
const at = (dx, dz) => C + dz * n + dx;
function fresh() {
  const state = { tick: 0 };
  const fr = createFrontier({ state, data });
  fr.world.addTown({ id: 't', name: 'T', region: null, owner: 'player', x: 3000, z: 3000, site: null, traits: { soil: 2, water: 2, defense: 2, nodes: {} },
    pop: 6, stock: { food: 80, timber: 500, stone: 30 }, buildings: [{ type: 'town_hall', cell: 0 }] });
  const me = { owner: 'player' };
  void fr.world;   // runs ensure(): the town gets its grid
  const s = state.frontier.settlements.t;
  const send = c => { fr.command(me, { type: 'frontier', town: 't', ...c }); return state.frontier.receipts.at(-1); };
  return { state, fr, s, send };
}
const snap = o => JSON.stringify(o);
// ring of walls of half-width r round the hall, optionally with a gate at the south middle
const ring = (r, gate) => {
  const out = [];
  for (let d = -r; d <= r; d++) for (const [x, z] of [[d, -r], [d, r], [-r, d], [r, d]]) out.push(at(x, z));
  const cells = [...new Set(out)], g = at(0, r);
  return { walls: cells.filter(i => !(gate && i === g)), gate: g };
};

// 1. a ring with no gate is refused (hall sealed in); the same ring with a gate is accepted
{
  const { send, s } = fresh();
  const { walls, gate } = ring(6, true);
  const before = snap(s);
  const r = send({ action: 'place', kind: 'wall', cells: [...walls, gate] });   // closed ring, no gate
  assert.equal(r.ok, false); assert.equal(r.reason, 'would trap');
  assert.equal(snap(s), before, 'refusal changes nothing');
  assert.equal(send({ action: 'place', kind: 'wall', cells: walls }).ok, true, 'a ring with a gap is open, so it is fine');
  assert.equal(send({ action: 'place', kind: 'house', cells: [at(0, 0) + 2] }).ok, true, 'house inside');
  const okGate = send({ action: 'place', kind: 'gate', cells: [gate] });
  assert.equal(okGate.ok, true, okGate.reason);
  assert.equal(s.stock.timber, 500 - data.placeCosts.gate.timber - walls.length * data.placeCosts.wall.timber, 'paid per cell');
  assert.equal(s.grid.use[gate], 'g'); assert.equal(s.grid.use[walls[0]], 'w');
  assert.equal(s.stock.timber, 500 - data.placeCosts.gate.timber - walls.length * data.placeCosts.wall.timber, 'paid per cell');
}

// 2. dry run changes no state at all
{
  const { send, s, state, fr } = fresh();
  const before = snap(state.frontier);
  const { walls, gate } = ring(6, false);
  send({ action: 'place', kind: 'wall', cells: walls, dryRun: true });
  assert.equal(snap(state.frontier), before, 'dry run: deep-equal before and after');
  assert.equal(fr.modules.find(m => m.placement).placement.check(s, { kind: 'wall', cells: [at(3, 3)] }).ok, true);
  assert.equal(snap(state.frontier), before);
}

// 3. a cut that strands a house is refused (house in a one-cell corridor pocket)
{
  const { send, s, fr } = fresh();
  const P = fr.modules.find(m => m.placement).placement;
  // box of walls round (10,0) with a one-cell opening at its west side; the house sits inside
  const box = [];
  for (let d = -2; d <= 2; d++) { box.push(at(10 + d, -2), at(10 + d, 2)); box.push(at(12, d)); if (d !== 0) box.push(at(8, d)); }
  const walls = [...new Set(box)];
  assert.equal(send({ action: 'place', kind: 'wall', cells: walls }).ok, true, 'open box is fine');
  assert.equal(send({ action: 'place', kind: 'house', cells: [at(10, 0)] }).ok, true, 'house inside the box');
  const before = snap(s);
  const cut = send({ action: 'place', kind: 'wall', cells: [at(8, 0)] });
  assert.equal(cut.ok, false); assert.equal(cut.reason, 'would trap');
  assert.equal(snap(s), before);
  assert.equal(send({ action: 'place', kind: 'road', cells: [at(8, 0)] }).ok, true, 'a road in the opening is fine');
}

// 4. 2x2 over one used cell is refused; other refusals
{
  const { send, s } = fresh();
  assert.equal(send({ action: 'place', kind: 'road', cells: [at(5, 5)] }).ok, true);
  const before = snap(s);
  const r = send({ action: 'place', kind: 'quarry', cells: [at(4, 4)] });   // 2x2 covers (5,5)
  assert.equal(r.reason, 'occupied');
  assert.equal(send({ action: 'place', kind: 'road', cells: [C] }).reason, 'occupied', 'the hall cell');
  assert.equal(send({ action: 'place', kind: 'house', cells: [at(0, 54)] }).reason, 'core only');
  assert.equal(send({ action: 'place', kind: 'quarry', cells: [n - 1] }).reason, 'outside grid', '2x2 off the right edge');
  assert.equal(send({ action: 'place', kind: 'road', cells: [-1] }).reason, 'outside grid');
  s.grid.ground = s.grid.ground.slice(0, at(7, 7)) + 'x' + s.grid.ground.slice(at(7, 7) + 1);
  assert.equal(send({ action: 'place', kind: 'road', cells: [at(7, 7)] }).reason, 'unbuildable');
  s.stock.timber = 0;
  assert.equal(send({ action: 'place', kind: 'wall', cells: [at(9, 9)] }).reason, 'cannot afford');
  assert.equal(s.grid.use[at(9, 9)], '.', 'refusals leave the grid alone');
  assert.equal(snap(s).includes('"project"'), false);
  void before;
}

// 5. a placed building queues a project with the anchor cell and cleared phase; remove cancels it and the eraser clears lines
{
  const { send, s, state } = fresh();
  const r = send({ action: 'place', kind: 'quarry', cells: [at(4, 4)] });
  assert.equal(r.ok, true, r.reason);
  const p = s.projects[0];
  assert.equal(p.cell, at(4, 4)); assert.deepEqual(p.cells, [at(4, 4), at(5, 4), at(4, 5), at(5, 5)]); assert.equal(p.phase, 'cleared');
  assert.equal(s.grid.use[at(5, 5)], 'B');
  assert.equal(send({ action: 'remove', cells: [C] }).reason, 'town hall');
  assert.equal(send({ action: 'remove', cells: [at(5, 5)] }).ok, true);
  assert.equal(s.projects.length, 0); assert.equal(s.grid.use[at(5, 5)], '.');
  send({ action: 'place', kind: 'road', cells: [at(2, 2), at(3, 2)] });
  assert.equal(send({ action: 'remove', cells: [at(2, 2), at(3, 2)] }).ok, true);
  assert.equal(s.grid.use[at(2, 2)], '.');
  assert.equal(send({ action: 'remove', cells: [at(2, 2)] }).reason, 'nothing there');
  // survives a structuredClone (save shape)
  send({ action: 'place', kind: 'storehouse', cells: [at(-3, -3)] });
  assert.deepEqual(structuredClone(state.frontier).settlements.t.projects, s.projects);
}

// 6. wrong owner is refused
{
  const { fr, state, s } = fresh();
  const before = snap(s);
  fr.command({ owner: 'rival' }, { type: 'frontier', action: 'place', town: 't', kind: 'road', cells: [at(1, 1)] });
  assert.equal(state.frontier.receipts.at(-1).reason, 'not your settlement');
  assert.equal(snap(s), before);
}
console.log('test_frontier_place: ok');
