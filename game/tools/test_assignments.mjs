import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const create = clan => {
  const game = createGame({ district: read('data/port_town.json'), catalog: read('data/art.json'), cutouts: read('art/cutouts.json'), interiors: read('data/interiors.json'),
    parts: read('data/interior_parts.json'), recipes: read('data/room_recipes.json'), units: read('data/units.json'), settings: { ...read('data/settings.json'), dayNight: { auto: false } } });
  const { heroId } = setupMatch(game, { clan, difficulty: 'easy', bots: read('data/bots.json') });
  for (const e of Object.values(game.state.entities)) { e.holdFire = true; if (e.type !== 'hero') e.order = { kind: 'stop' }; }
  return { game, heroId };
};
const { game: g, heroId } = create('yakuza'), h = g.state.entities[heroId], s = g.state.deployment.sectors[0];
const e = g.state.entities[g.spawn('thug', 'thug', s.anchor.x, s.anchor.z, { owner: 'player', deployment: { group: s.id }, holdFire: true })];
const send = c => g.step([{ id: heroId, type: 'deployment', ...c }]);
g.step(); assert.equal(e.deployment.duty.status, 'Patrolling');
const start = [e.x, e.z];
for (let i = 0; i < 80; i++) { g.step(); assert.equal(g.deployment.sectorAt(e.x, e.z), s.id); }
assert.ok(Math.hypot(e.x - start[0], e.z - start[1]) > 1);
send({ action: 'assignment', sector: s.id, task: 'hold', objective: s.anchor, fallback: s.anchor });
for (let i = 0; i < 80; i++) g.step();
assert.equal(e.deployment.duty.status, 'Holding');
const point = g.deployment.navFor(e).nearestFree(e.x + 3, e.z);
g.step([{ id: heroId, type: 'order', kind: 'move', place: 'street', units: [e.id], x: point[0], z: point[1] }]);
assert.equal(e.deployment.duty.manual, true);
for (let i = 0; i < 50; i++) g.step();
assert.equal(e.deployment.duty.manual, true, 'completed temporary move stays manual until group change/Return');
send({ action: 'return', units: [e.id] });
for (let i = 0; i < 100; i++) g.step();
assert.equal(e.deployment.duty.manual, false); assert.equal(e.deployment.duty.status, 'Holding');
const saved = structuredClone(g.state.deployment.clans.player.sectors[s.id]);
send({ action: 'assignment', sector: s.id, task: 'hold', objective: g.state.deployment.sectors[1].anchor });
assert.deepEqual(g.state.deployment.clans.player.sectors[s.id], saved, 'cross-sector objectives rejected atomically');

// Guard assignment uses a real owned room, crosses its door normally and stays local.
const b = Object.values(g.state.businesses).find(b => b.room && b.kind !== 'hideout' && g.deployment.sectorAt(...b.ring) === s.id);
g.clans.setOwner(b.id, 'player');
send({ action: 'assignment', sector: s.id, task: 'guard', business: b.id });
for (let i = 0; i < 1200 && e.place !== b.room; i++) g.step();
assert.equal(e.place, b.room); g.step(); assert.equal(e.deployment.duty.status, 'Guarding');
assert.notEqual(e.order.kind, 'follow');
h.downed = true;
send({ action: 'assignment', sector: s.id, task: 'hold', objective: s.anchor });
for (let i = 0; i < 1200 && e.place !== 'street'; i++) g.step();
assert.equal(e.place, 'street', 'remote task change during KO walks crew out normally');
assert.equal(g.deployment.sectorAt(e.x, e.z), s.id);

const { game: n, heroId: ninjaHero } = create('shinobi'), ns = n.state.deployment.sectors[0];
const watcher = n.state.entities[n.spawn('ninja', 'ninja', ns.anchor.x, ns.anchor.z, { owner: 'player', deployment: { group: ns.id } })];
const foe = n.state.entities[n.spawn('thug', 'thug', ns.anchor.x + 2, ns.anchor.z, { owner: Object.keys(n.state.clans).find(c => c !== 'player'), holdFire: true, order: { kind: 'stop' }, deployment: { group: 'hero' } })];
for (let i = 0; i < 30; i++) n.step();
assert.equal(watcher.deployment.duty.status, 'Watching');
assert.ok(!n.state.hits.some(hit => hit.a === watcher.id)); assert.equal(watcher.swing, undefined, 'Watch does not initiate on passing enemies');
n.step([{ id: ninjaHero, type: 'order', units: [watcher.id], place: 'street', kind: 'attack', target: foe.id }]);
assert.equal(watcher.deployment.duty.manual, true, 'manual local attacks can override Watch');
n.step([{ id: ninjaHero, type: 'deployment', action: 'return', units: [watcher.id] }]);
assert.equal(watcher.deployment.duty.manual, false);
console.log('Assignments: local patrol, hold, manual/return, route validation, real guard entry/exit, KO control and passive Watch passed');
