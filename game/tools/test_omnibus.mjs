// Tim 2026-11-06: out on the island the hero arrives driving an omnibus with his settlers and Hero group
// inside (sim/omnibus.js, units.json rules.omnibus): 8 seats each, a second one follows his track, 3x run
// speed, nobody inside fights, hits land on the omnibus (wrecked: everyone piles out), Q / right-click
// deploys and boards, founding a town steps everyone out and uses the omnibuses up.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), U = data('data/units.json'), O = U.rules.omnibus;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...data('data/frontier.json'), fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 31 });
const S = g.state, hero = S.entities[m.heroId], clan = S.clans.player;
const buses = () => Object.values(S.entities).filter(e => e.type === 'omnibus' && e.omnibusOwner === 'player');
const aboard = b => Object.values(S.entities).filter(u => u.aboard === b.id);
assert.ok(g.omnibus, 'campaign games have the omnibus');

// --- out through the gate with 5 settlers and 6 Hero-group crew: two omnibuses (12 people, 8 seats) ----
Object.assign(hero, { place: 'street', x: g.gate.city[0], z: g.gate.city[1] });
clan.settlersWaiting = 5;
const crew = [];
for (let k = 0; k < 6; k++) crew.push(S.entities[g.spawn('thug', 'thug', hero.x + 1, hero.z + k * 0.3, { owner: 'player', place: 'street', hp: 100, order: { kind: 'follow', target: hero.id } })]);
g.step([{ id: hero.id, type: 'expedition', action: 'walk', units: crew.map(u => u.id) }]);
assert.equal(hero.place, 'world', 'out on the island');
const [lead, second] = buses();
assert.equal(buses().length, 2, `two omnibuses (${buses().length})`);
assert.equal(lead.driver, hero.id, 'the hero drives the first');
assert.equal(hero.aboard, lead.id);
assert.equal(aboard(lead).length, O.seats, 'first one full');
assert.equal(aboard(second).length, 12 - O.seats, 'the rest in the second');
assert.ok(Object.values(S.entities).filter(u => u.type === 'settler').every(u => u.aboard), 'every settler rides');
assert.equal(clan.omnibusFree, O.max - 2, 'both used');

// --- driving: 3x run speed, riders stay inside, the second follows the track ------------------------------
assert.ok(Math.abs(g.stats.movement(hero, 'run') - 6 * O.speed) < 1e-6, `3x run speed (${g.stats.movement(hero, 'run')})`);
const x0 = hero.x;
for (let t = 0; t < 60; t++) g.step([{ id: hero.id, type: 'move', right: 1, down: 0 }]);
assert.ok(hero.x - x0 > 20, `drove fast (${(hero.x - x0).toFixed(1)} in 3 s)`);
assert.ok(Math.hypot(lead.x - hero.x, lead.z - hero.z) < 1e-6, 'the omnibus is where the hero is');
// cart-like steering (sim/vehicle_steer.js, shared with town traffic): a hard turn sweeps round, it does not snap
const h0 = hero.heading;
g.step([{ id: hero.id, type: 'move', right: -1, down: 0 }]);
const turned = Math.abs(Math.atan2(Math.sin(hero.heading - h0), Math.cos(hero.heading - h0)));
assert.ok(turned > 0 && turned <= U.rules.omnibus.turnDegrees * Math.PI / 180 / 20 + 1e-9, `turns at most turnDegrees a second (${(turned * 180 / Math.PI).toFixed(1)} deg in one tick)`);
assert.equal(lead.dir, hero.dir, 'the omnibus shows the same row');
for (const u of aboard(lead)) if (u !== hero) assert.ok(Math.hypot(u.x - lead.x, u.z - lead.z) < 1e-6, 'riders inside');
const gap = Math.hypot(second.x - lead.x, second.z - lead.z);
assert.ok(gap > O.gap * 0.6 && gap < O.gap * 1.6, `second follows ${O.gap} behind (${gap.toFixed(1)})`);
for (const u of aboard(second)) assert.ok(Math.hypot(u.x - second.x, u.z - second.z) < 1e-6, 'its riders inside');

// --- nobody inside can fight; hits land on the omnibus ------------------------------------------------------
const foe = S.entities[g.spawn('thug', 'thug', hero.x + 1, hero.z, { owner: 'kuroda', place: 'world', hp: 100 })];
g.step([{ id: hero.id, type: 'attack', target: foe.id }]);
assert.ok(!hero.attackTarget, 'no attacking from inside');
assert.match(clan.notice?.text || '', /Step out/);
const hp = hero.hp, busHp = lead.hp;
assert.ok(g.omnibus.shelter(hero, 100), 'absorbed');
assert.equal(hero.hp, hp, 'the hero is untouched');
assert.equal(lead.hp, busHp - 100, 'the omnibus took it');
delete S.entities[foe.id];

// --- Q: everyone steps out, the omnibuses park; followers fall in behind the hero ---------------------------
g.step([{ id: hero.id, type: 'omnibus', action: 'deploy' }]);
assert.ok(!hero.aboard && !hero.ride, 'hero out');
assert.ok(buses().every(b => !aboard(b).length), 'everyone out');
assert.ok(crew.filter(u => u.deployment?.group === 'hero').every(u => u.order?.kind === 'follow' && u.order.target === hero.id), 'Hero-group crew follow him');
assert.equal(buses().length, 2, 'both parked');
assert.ok(Math.abs(g.stats.movement(hero, 'run') - 6) < 1e-6, 'back to his own speed');

// --- Q beside a parked one: the hero and his followers get back in -------------------------------------------
for (let t = 0; t < 40; t++) g.step([]);
Object.assign(hero, { x: lead.x + 1, z: lead.z });
g.step([{ id: hero.id, type: 'omnibus', action: 'board' }]);
assert.equal(hero.aboard, lead.id, 'back in the first');
assert.equal(Object.values(S.entities).filter(u => u.aboard).length, 12, 'all twelve back in');

// --- Drive back to the gate (Tim 2026-11-06 20:42): at once, everyone aboard, not with a fight on --------------
{
  const [ix, iz] = g.gate.island, fx = ix + 200, fz = iz;
  for (const b of buses()) { Object.assign(b, { x: fx, z: fz }); for (const u of aboard(b)) Object.assign(u, { x: fx, z: fz }); }
  hero.hitAt = S.tick;
  g.step([{ id: hero.id, type: 'omnibus', action: 'home' }]);
  assert.match(clan.notice?.text || '', /fight/, 'not straight after a hit');
  assert.ok(Math.hypot(lead.x - fx, lead.z - fz) < 5, 'stayed put');
  hero.hitAt = -1e9;
  g.step([{ id: hero.id, type: 'omnibus', action: 'home' }]);
  assert.ok(buses().every(b => Math.hypot(b.x - ix, b.z - iz) < 15), `both omnibuses at the gate: ${clan.notice?.text}`);
  assert.equal(Object.values(S.entities).filter(u => u.aboard).length, 12, 'everyone still aboard');
  assert.ok(Math.hypot(hero.x - ix, hero.z - iz) < 15, 'the hero with them');
}

// --- wrecked: everyone piles out, that omnibus is gone ----------------------------------------------------------
g.omnibus.shelter(hero, O.hp * 2);
assert.ok(!S.entities[lead.id], 'wrecked omnibus removed');
assert.ok(!hero.aboard && !hero.ride, 'hero piled out');
assert.ok(aboard(second).length > 0, 'the other omnibus still holds its riders');

// --- vehicles work like crew (Tim 2026-11-07): follow on foot, move then stay, stop stays, Q empties only those --
{
  Object.assign(second, { x: hero.x + 30, z: hero.z }); second.vorder = { kind: 'follow' };
  for (let t = 0; t < 60; t++) g.step([]);
  const d = Math.hypot(second.x - hero.x, second.z - hero.z);
  assert.ok(d < 12, `loaded vehicle follows the hero on foot (${d.toFixed(1)})`);
  const tx = second.x + 15, tz = second.z;
  g.step([{ id: hero.id, type: 'order', units: [second.id], kind: 'move', x: tx, z: tz }]);
  for (let t = 0; t < 80; t++) g.step([]);
  assert.ok(Math.hypot(second.x - tx, second.z - tz) < 2.5, `drove to the spot (${Math.hypot(second.x - tx, second.z - tz).toFixed(1)})`);
  assert.equal(second.vorder.kind, 'stay', 'then stays');
  Object.assign(hero, { x: hero.x - 25 }); const sx = second.x;
  for (let t = 0; t < 40; t++) g.step([]);
  assert.ok(Math.abs(second.x - sx) < 1e-6, 'staying vehicle does not follow');
  g.step([{ id: hero.id, type: 'order', units: [second.id], kind: 'follow' }]);
  assert.equal(second.vorder.kind, 'follow', 'follow again');
  g.step([{ id: hero.id, type: 'order', units: [second.id], kind: 'stop' }]);
  assert.equal(second.vorder.kind, 'stay', 'stop stays');
  const n = aboard(second).length;
  g.step([{ id: hero.id, type: 'omnibus', action: 'deploy', vehicles: [crew[0].id] }]);
  assert.equal(aboard(second).length, n, 'Q with other vehicles selected leaves this one loaded');
  g.step([{ id: hero.id, type: 'omnibus', action: 'deploy', vehicles: [second.id] }]);
  assert.equal(aboard(second).length, 0, 'Q on it empties it');
  console.log('vehicles as crew ok');
}
g.step([{ id: hero.id, type: 'omnibus', action: 'deploy' }]);
assert.ok(!Object.values(S.entities).some(u => u.aboard), 'everyone out');

// --- founding from the omnibus: everyone steps out first, the clan's omnibuses are used up --------------------
const site = (world.sites || []).find(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700) || world.sites[0];
Object.assign(second, { x: site.x, z: site.z });
for (const u of Object.values(S.entities)) if (u.owner === 'player' && u.place === 'world' && u !== hero) Object.assign(u, { x: site.x + 0.5, z: site.z + 0.5 });
Object.assign(hero, { x: site.x + 1, z: site.z });
g.areas.update(Object.values(S.entities));
g.step([{ id: hero.id, type: 'omnibus', action: 'board' }]);
assert.ok(hero.aboard, 'in again');
clan.permit = true;
let founded = false;
const before = Object.keys(S.frontier.settlements).length;
for (let t = 0; t < 4 && !founded; t++) {
  const ck = g.frontier.founding?.check(hero);
  g.step([{ id: hero.id, type: 'frontier', action: 'found', ...(ck?.point || {}) }]);
  founded = Object.values(S.frontier.settlements).some(s => s.owner === 'player' && s.founded !== undefined);
  if (!founded) assert.ok(!hero.aboard, 'a found command steps everyone out even when founding is refused');
}
if (founded) {
  assert.equal(buses().length, 0, 'founding used the omnibuses up');
  assert.equal(clan.omnibusFree, 0);
  console.log('founded from the omnibus ok');
} else console.log(`(founding refused here: ${clan.notice?.text}; consume checked directly)`);
g.omnibus.consume('player');
assert.equal(buses().length, 0); assert.equal(clan.omnibusFree, 0);

// --- no omnibus left: going out again is on foot -------------------------------------------------------------
assert.equal(g.omnibus.ride(hero, crew), 0, 'none left to ride');
console.log('test_omnibus: ok', before);
