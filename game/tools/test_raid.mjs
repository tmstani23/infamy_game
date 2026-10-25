// War Lantern raids (sim/businesses.js, plan checkpoint 4): buy at the moneylender's, raid a rival's
// business at night, the warm-up keeps raiders out, then hold the back room (paused by defenders).
// Run: node tools/test_raid.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const g = createGame({
  district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...data('data/settings.json'), dayNight: { auto: false } },
});
const RD = g.settings.units.rules.raid;
assert.equal(RD.lanternPrice, 1200);
g.clans.addClan('player', { name: 'Your clan' });
g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
const clan = g.state.clans.player;
const biz = k => Object.values(g.state.businesses).find(b => b.kind === k);
const ml = biz('moneylender'), den = biz('gambling_den');
g.clans.setOwner(den.id, 'kuroda');
g.step();
const hero = g.spawn('hero', 'ronin', ml.ring[0], ml.ring[1], { owner: 'player' });
const h = g.state.entities[hero];
const cmd = (action, b) => g.step([{ id: hero, type: 'business', action, business: b.id }]);

// the lantern: price, carry one
clan.ryo = 100;
assert.equal(g.businesses.canBuyLantern(hero, ml.id).why, `Need ${RD.lanternPrice} ryo`);
clan.ryo = RD.lanternPrice * 2 + 50;
cmd('lantern', ml);
assert.equal(clan.lanterns, 1); assert.equal(clan.ryo, RD.lanternPrice + 50);
cmd('lantern', ml);
assert.equal(clan.lanterns, 1, 'carry one');
console.log('buy a War Lantern ok');

// raid: night only, at the door, only a rival's business
Object.assign(h, { x: den.ring[0], z: den.ring[1] });
assert.equal(g.businesses.canRaid(hero, den.id).why, 'Raid at night');
g.step([{ type: 'time', night: true }]);
assert.ok(g.businesses.canRaid(hero, den.id).ok);
assert.match(g.businesses.canRaid(hero, biz('teahouse').id).why, /Unclaimed/);
const crew = [0, 1].map(i => g.spawn('thug', 'thug', den.ring[0] + i * 0.5, den.ring[1] + 0.5, { owner: 'player', order: { kind: 'follow', target: hero } }));
cmd('raid', den);
const a = g.state.attacks[den.id];
assert.ok(a && a.mode === 'raid' && a.phase === 'warmup');
assert.equal(clan.lanterns, 0, 'lantern used up');
assert.match(g.state.clans.kuroda.notice.text, /being raided/);
assert.deepEqual(g.state.news.filter(n => n.kind === 'businessAttack'), [
  { kind: 'businessAttack', clan: 'kuroda', business: den.id, name: 'Gambling den', raider: 'player' },
], 'raid start alert names the building and explicitly addresses only its owner');
// the doors stay shut during the warm-up
g.step([{ id: hero, type: 'use', units: crew }]);
assert.equal(h.place, 'street', 'no way in during the warm-up');
// the boss knocked out in the warm-up doesn't end the raid (Tim 2026-10-20); only the lantern knocked down does
Object.assign(h, { hp: 0, dead: true, diedAt: g.state.tick });
g.step();
assert.ok(g.state.attacks[den.id], 'raid goes on with the boss down');
for (let i = 0; i < RD.warmupSeconds * 20; i++) g.step();
assert.equal(a.phase, 'hold');
assert.ok(!h.dead, 'he is back up');
h.place = 'street';
g.step();
assert.ok(a.away > 0 && g.state.attacks[den.id], 'doors open, nobody inside yet: the get-inside countdown runs');
assert.ok(!a.lantern && a.spot, 'the lantern burns out when the doors open');
Object.assign(h, { x: den.ring[0], z: den.ring[1] });
g.step([{ id: hero, type: 'use', units: crew }]);
assert.equal(h.place, den.room, 'in after the warm-up');
assert.ok(crew.every(id => g.state.entities[id].place === den.room), 'crew came along');
console.log('warm-up keeps raiders out ok');
// inside a raided business everyone fights on their own (Tim 2026-10-20): the raiding crew go for a
// defender who never touched them
{
  const [x, z] = [a.hold.x, a.hold.z];
  const d = g.spawn('thug', 'thug', x, z, { owner: 'kuroda', place: a.room, hp: 1e6, maxHp: 1e6, order: { kind: 'stop' } });
  for (const id of crew) Object.assign(g.state.entities[id], { x: x + 1, z, hp: 1e6, maxHp: 1e6 });
  let hit = false;
  for (let i = 0; i < 20 * 4 && !hit; i++) { g.step(); hit = g.state.hits.some(h => h.t === d && crew.includes(h.a)); }
  assert.ok(hit, 'raiders attack a defender in the room unprompted');
  delete g.state.entities[d];
  for (const id of crew) Object.assign(g.state.entities[id], { x: h.x, z: h.z });   // back by the door, off the back-room spot
  g.step();
  console.log('raid room: everyone fights ok');
}

// defenders in the back room hold the timer; with them gone it runs down and the den changes hands
const guards = () => Object.values(g.state.entities).filter(e => e.guard === den.id && !e.dead);
assert.equal(guards().length, 2);
Object.assign(h, { hp: 1e6, maxHp: 1e6 });
for (const id of crew) Object.assign(g.state.entities[id], { hp: 1e6, maxHp: 1e6 });
const gd = guards()[0];
Object.assign(gd, { x: a.hold.x, z: a.hold.z });
Object.assign(h, { x: a.hold.x + 0.5, z: a.hold.z });
const left = a.holdLeft;
g.step();
assert.equal(a.holdLeft, left, 'a defender in the back room holds the timer');
assert.ok(g.state.news.some(n => n.kind === 'backRoom' && n.state === 'contested'), 'contested alert');
for (const e of guards()) { e.dead = true; e.diedAt = g.state.tick; }
Object.assign(h, { x: a.hold.x, z: a.hold.z }); g.step();
assert.ok(g.state.news.some(n => n.kind === 'backRoom' && n.state === 'taking'), 'being taken alert');
for (let i = 0; i < RD.holdSeconds * 20 + 20 && g.state.attacks[den.id]; i++) { Object.assign(h, { x: a.hold.x, z: a.hold.z }); g.step(); }
assert.equal(den.owner, 'player', 'raid won');
assert.match(g.state.clans.kuroda.notice.text, /lost/);
g.step();
assert.ok(guards().every(e => e.owner === 'player'), 'new guards are ours');
console.log('back-room hold and takeover ok');
