// Building panel wording (src/building_panel.js) and where crew are (selection_panel unitWhere), from real game states.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { buildingInfo } from '../src/building_panel.js';
import { unitWhere } from '../src/selection_panel.js';

const data = f => JSON.parse(fs.readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json'), district = data('data/waterfront.json'), info = data('data/buildings.json');
const g = createGame({
  district, catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units,
});
g.clans.addClan('player', { name: 'Your clan' });
g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
const idx = art => district.buildings.findIndex(b => b.art === art);
const at = (i) => buildingInfo({ state: g.state, district, info, units }, i, 'player');
const row = (d, k) => d.rows.find(r => r[0] === k)?.[1];

// every street building is on the scenery with its index, and every one has a name
district.buildings.forEach((b, i) => {
  assert.ok(g.scenery.some(s => s.building === i), `scenery for ${b.art}`);
  assert.ok(info.names[b.art], `name for ${b.art}`);
});

const tea = idx('teahouse');
let d = at(tea);
assert.equal(d.name, 'Teahouse');
assert.equal(d.owner, 'Unclaimed');
assert.equal(row(d, 'Role'), 'Hire crew (H inside)');
assert.equal(row(d, 'Enter'), 'Yes, Space at the door');
assert.equal(row(d, 'If held'), '+3 crew slots');
assert.equal(row(d, 'Hiring'), 'Nobody waiting');
assert.equal(row(d, 'Inside'), 'None of yours');

// a hero inside, owning it, with a hire waiting
const biz = g.state.businesses[`b${tea}`];
const hero = g.spawn('hero', 'ronin', 0, 0, { owner: 'player', place: biz.room });
g.clans.setOwner(biz.id, 'player');
g.state.clans.player.queue.push({ unit: 'thug', business: biz.id, left: 7.2 });
d = at(tea);
assert.equal(d.owner, 'Yours');
assert.equal(row(d, 'Gives'), '+3 crew slots');
assert.equal(row(d, 'Hiring'), '1 waiting, 8 s left');
assert.equal(row(d, 'Inside'), '1 of your units');
g.clans.setOwner(biz.id, 'kuroda');
assert.equal(at(tea).owner, 'Kuroda clan');

d = at(idx('clinic'));
assert.equal(d.name, "Bonesetter's clinic");
assert.equal(row(d, 'Enter'), 'Clinic menu, Space at the ring');
assert.equal(row(d, 'Patients'), 'None of yours');
assert.equal(row(d, 'Inside'), undefined);

d = at(idx('inn'));
assert.deepEqual(d, { name: 'Inn', owner: 'No business here yet', rows: [] });

assert.equal(unitWhere(g.state.entities[hero], g.state, district, info), 'Teahouse · Waterfront');
assert.equal(unitWhere({ place: 'street' }, g.state, district, info), 'Waterfront');
const den = g.state.businesses[`b${idx('gambling_den')}`];
assert.equal(unitWhere({ place: den.room }, g.state, district, info), 'Gambling den · Waterfront');
console.log('building panel ok');
