// Attacking an unclaimed business at night (sim/businesses.js, plan checkpoint 3): police waves
// through the door, crew fight them on their own, the back-room hold, heat after a win, losing.
// Run: node tools/test_attack.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const make = () => {
  const g = createGame({
    district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: { ...data('data/settings.json'), dayNight: { auto: false } },
  });
  g.clans.addClan('player', { name: 'Your clan' });
  return g;
};
const A = data('data/units.json').rules.attack;

// --- a win ---
let g = make();
const clan = g.state.clans.player;
const tea = Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
const hero = g.spawn('hero', 'ronin', tea.ring[0], tea.ring[1], { owner: 'player' });
const attack = () => g.step([{ id: hero, type: 'business', action: 'attack', business: tea.id }]);
assert.equal(g.businesses.canAttack(hero, tea.id).why, 'Attack at night');
attack();
assert.equal(g.state.attacks[tea.id], undefined);
g.step([{ type: 'time', night: true }]);
assert.ok(g.businesses.canAttack(hero, tea.id).ok);
clan.heat = 20;
attack();
const a = g.state.attacks[tea.id];
assert.ok(a, 'attack started');
const BZ = data('data/settings.json').businesses;
assert.equal(a.waves, BZ.teahouse.attackWaves, 'Quiet: the business\'s waves only');
// a strong crew goes in with the boss and fights the officers on their own
const room = g.rooms.find(r => r.name === tea.room);
g.settings.units.types.thug.damage = 400;
for (let i = 0; i < 3; i++) g.spawn('thug', 'thug', room.spawn.x + i - 1, room.spawn.z + 1.5, { owner: 'player', place: room.name, order: { kind: 'station', x: room.spawn.x + i - 1, z: room.spawn.z + 1.5 } });
Object.assign(g.state.entities[hero], { x: room.spawn.x, z: room.spawn.z + 1, place: room.name, hp: 1e6, maxHp: 1e6 });
let waveCount = 0;
for (let i = 0; i < 20 * 120 && a.phase === 'waves'; i++) {
  const before = a.wave;
  g.step();
  if (a.wave > before) waveCount++;
  const cops = Object.values(g.state.entities).filter(u => u.wave === tea.id && !u.dead);
  assert.ok(cops.length <= Math.max(A.perWave, A.bigWave), 'one wave at a time');
}
assert.equal(a.wave, BZ.teahouse.attackWaves, 'all waves came'); assert.ok(waveCount >= a.waves - 1);
assert.equal(a.phase, 'hold');
console.log('police waves beaten by the crew ok');
// nobody in the back room: the timer waits
const left = a.holdLeft;
for (let i = 0; i < 40; i++) g.step();
assert.equal(a.holdLeft, left, 'timer waits');
// the boss stands in the back room: it counts down and the business is taken
const h = g.state.entities[hero];
h.x = a.hold.x; h.z = a.hold.z;
for (let i = 0; i < 20 * (A.holdSeconds + 2) && g.state.attacks[tea.id]; i++) { h.x = a.hold.x; h.z = a.hold.z; g.step(); }
assert.equal(tea.owner, 'player', 'taken');
assert.equal(g.state.attacks[tea.id], undefined);
assert.equal(clan.heat, 20 + A.heatAfterWin, 'heat = before + heatAfterWin');
assert.ok(!Object.values(g.state.entities).some(u => u.wave === tea.id), 'officers gone');
console.log('back-room hold and heat ok');

// --- losses: leaving the building, the boss going down ---
g = make();
const den = Object.values(g.state.businesses).find(b => b.kind === 'gambling_den');
let id = g.spawn('hero', 'ronin', den.ring[0], den.ring[1], { owner: 'player' });
g.step([{ type: 'time', night: true }]);
g.state.clans.player.heat = 65;   // Wanted: one more wave
g.step([{ id, type: 'business', action: 'attack', business: den.id }]);
assert.equal(g.state.attacks[den.id].waves, data('data/settings.json').businesses.gambling_den.attackWaves + A.wavesPerTier * 2);
for (let i = 0; i < 20 * (A.leaveSeconds + 1); i++) g.step();
assert.equal(g.state.attacks[den.id]?.phase ?? 'gone', g.state.attacks[den.id] ? 'over' : 'gone');
assert.match(g.state.clans.player.notice.text, /left the building/);
assert.equal(g.state.clans.player.heat, 65 + A.heatAfterLoss, 'loss: heat = before + heatAfterLoss');
for (let i = 0; i < 20 * 25; i++) g.step();
assert.equal(g.state.attacks[den.id], undefined); assert.equal(den.owner, null);
console.log('lost by staying outside ok');

g = make();
const wh = Object.values(g.state.businesses).find(b => b.kind === 'warehouse');
id = g.spawn('hero', 'ronin', wh.ring[0], wh.ring[1], { owner: 'player' });
g.step([{ type: 'time', night: true }]);
g.step([{ id, type: 'business', action: 'attack', business: wh.id }]);
const wr = g.rooms.find(r => r.name === wh.room);
Object.assign(g.state.entities[id], { x: wr.spawn.x, z: wr.spawn.z + 1, place: wr.name, hp: 30 });
for (let i = 0; i < 20 * 30 && !g.state.entities[id].downed && !g.state.entities[id].jailed; i++) g.step();
assert.ok(g.state.entities[id].downed || g.state.entities[id].jailed, 'officers knock the boss down');
g.step();
assert.match(g.state.clans.player.notice.text, /went down/);
for (let i = 0; i < 20 * 25; i++) g.step();
assert.equal(wh.owner, null);
assert.ok(g.state.entities[id].jailed, 'arrested');
console.log('lost when the boss goes down (arrested) ok');
