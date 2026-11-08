// The eraser frees a building's tier cap (Tim 2026-11-07): for every building type a town hall tier limits
// (frontier.json tiers.list[].placed), placing one uses a slot and erasing it, as a plan or finished, gives the
// slot back. A new capped building type is covered here automatically; one the eraser cannot free fails.
// Run: node game/tools/test_eraser_caps.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { placedRoom, placedGroup } from '../src/sim/frontier/tiers.js';
const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
data.settlements = {}; data.roads = {}; data.rates.food = 0; data.rates.growthTicks = 1e9;
const tiers = data.tiers.list, top = tiers.length;
const capped = Object.keys(data.buildings).filter(t => data.buildings[t].size > 0 || data.buildings[t].shape)
  .filter(t => t !== data.founding.townHall && tiers.some(x => x.placed?.[placedGroup(t, data)] !== undefined));
assert.ok(capped.includes('station') && capped.includes('storehouse'), 'capped types found');
for (const type of capped) {
  const state = { tick: 0 }, fr = createFrontier({ state, data });
  fr.world.addTown({ id: 't', owner: 'p', name: 'Cap test', x: 1000, z: 1000, pop: 10, stock: { food: 5000, timber: 5000, stone: 5000, goods: 5000, ryo: 5000 }, buildings: [{ type: data.founding.townHall, cell: 0 }] });
  const s = fr.world.settlement('t'), { n } = s.grid;
  s.tier = top;
  const placement = fr.modules.find(x => x.name === 'placement').placement;
  const send = c => { fr.command({ owner: 'p' }, { town: 't', ...c }); return state.frontier.receipts.at(-1); };
  const room0 = placedRoom(s, type, data);
  assert.ok(room0 >= 1, `${type}: room at the top tier`);
  for (const finished of [false, true]) {
    let spot = -1;
    for (let i = 0; i < n * n && spot < 0; i++) if (placement.check(s, { kind: type, cells: [i], rot: 0 }).ok) spot = i;
    assert.ok(spot >= 0, `${type}: somewhere to place it`);
    const r = send({ action: 'place', kind: type, cells: [spot], rot: 0 });
    assert.equal(r.ok, true, `${type}: placed (${r.reason})`);
    assert.equal(placedRoom(s, type, data), room0 - 1, `${type}: the plan takes a slot`);
    const p = s.projects.find(x => x.type === type);
    let cells = p.cells || [p.cell];
    if (finished) {
      Object.assign(p, { paid: true, progress: p.need, phase: 'frame', authorized: true });
      for (let k = 0; k < 40 && s.projects.includes(p); k++) { state.tick++; fr.tick(); }
      const b = s.buildings.find(x => x.type === type);
      assert.ok(b, `${type}: finished`);
      assert.equal(placedRoom(s, type, data), room0 - 1, `${type}: the building takes the slot`);
      cells = b.cells || [b.cell];
    }
    const e = send({ action: 'remove', cells: [cells[0]] });
    assert.equal(e.ok, true, `${type}: erased (${e.reason})`);
    assert.equal(placedRoom(s, type, data), room0, `${type}: erasing the ${finished ? 'building' : 'plan'} frees its slot`);
    assert.ok(!s.buildings.some(x => x.type === type) && !s.projects.some(x => x.type === type), `${type}: nothing left in the sim`);
    for (const i of cells) assert.equal(s.grid.use[i], '.', `${type}: its cells are free again`);
  }
  fr.world.checkInvariants();
}
console.log(`test_eraser_caps: ok (${capped.length} capped types: ${capped.join(', ')})`);
