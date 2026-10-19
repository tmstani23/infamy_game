// Defending a business (sim/businesses.js + game.js, plan checkpoint 5): the owner's boss knocks a
// raider's War Lantern down with a channel (a hit or a step cancels it), and right-clicking your
// own business sends the selected crew in to hold it.
// Run: node tools/test_defend.mjs
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
const RD = g.settings.units.rules.raid, knockTicks = (RD.knockSeconds ?? 4) * 20;
g.clans.addClan('player', { name: 'Your clan' });
g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
const biz = k => Object.values(g.state.businesses).find(b => b.kind === k);
const den = biz('gambling_den');
g.clans.setOwner(den.id, 'player');
g.step([{ type: 'time', night: true }]);
const raider = g.spawn('hero', 'ronin', den.ring[0], den.ring[1], { owner: 'kuroda' });
g.state.clans.kuroda.lanterns = 1;
g.step([{ id: raider, type: 'business', action: 'raid', business: den.id }]);
const a = g.state.attacks[den.id];
assert.ok(a?.lantern, 'raid with a lantern');
const raiderE = g.state.entities[raider];
Object.assign(raiderE, { x: den.ring[0] + 8, z: den.ring[1] + 8, hp: 1e6, maxHp: 1e6 });   // out of the way

const hero = g.spawn('hero', 'ronin', a.lantern.x + 6, a.lantern.z, { owner: 'player' });
const h = g.state.entities[hero];
const knock = () => g.step([{ id: hero, type: 'business', action: 'knock', business: den.id }]);
assert.match(g.businesses.canKnock(hero, den.id).why, /Walk up/);
assert.match(g.businesses.canKnock(raider, den.id).why, /Not your/);
Object.assign(h, { x: a.lantern.x + 0.8, z: a.lantern.z });
assert.ok(g.businesses.canKnock(hero, den.id).ok);

// a hit cancels the channel
knock();
assert.ok(a.knock, 'channel started');
h.hp -= 5;
g.step();
assert.ok(!a.knock, 'a hit cancels it');
// a step cancels it
knock();
h.x += 0.5;
g.step();
assert.ok(!a.knock, 'moving cancels it');
console.log('knock-down cancels ok');

// a full channel knocks the lantern down and ends the raid
Object.assign(h, { x: a.lantern.x + 0.8, z: a.lantern.z });
knock();
for (let i = 0; i < knockTicks + 2 && g.state.attacks[den.id]; i++) g.step();
assert.ok(!g.state.attacks[den.id], 'raid over');
assert.equal(den.owner, 'player');
assert.match(g.state.clans.player.notice.text, /knocked down/);
assert.match(g.state.clans.kuroda.notice.text, /knocked down/);
console.log('knock-down ends the raid ok');

// right-click your own business: the selected crew walk to the door, go in and hold there
Object.assign(h, { x: den.ring[0] + 3, z: den.ring[1] + 3 });
const crew = [0, 1, 2].map(i => g.spawn('thug', 'thug', den.ring[0] + 4 + i * 0.6, den.ring[1] + 4, { owner: 'player', order: { kind: 'follow', target: hero } }));
g.step([{ id: hero, type: 'order', units: crew, kind: 'enter', business: biz('teahouse').id }]);
assert.equal(g.state.entities[crew[0]].order.kind, 'follow', 'not ours: ignored');
g.step([{ id: hero, type: 'order', units: crew, kind: 'enter', business: den.id }]);
for (let i = 0; i < 20 * 20 && crew.some(id => g.state.entities[id].place !== den.room); i++) g.step();
for (const id of crew) {
  const u = g.state.entities[id];
  assert.equal(u.place, den.room, 'went in');
  assert.equal(u.order.kind, 'station', 'holding the room');
}
assert.equal(h.place, 'street', 'the boss stays outside');
console.log('send crew into your business ok');

// channelling: the boss doesn't swing at a raider standing next to him
{
  const g2 = createGame({
    district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: { ...data('data/settings.json'), dayNight: { auto: false } },
  });
  g2.clans.addClan('player', { name: 'Your clan' });
  g2.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
  const d2 = Object.values(g2.state.businesses).find(b => b.kind === 'gambling_den');
  g2.clans.setOwner(d2.id, 'player');
  g2.step([{ type: 'time', night: true }]);
  const r = g2.spawn('hero', 'ronin', d2.ring[0], d2.ring[1], { owner: 'kuroda' });
  g2.state.clans.kuroda.lanterns = 1;
  g2.step([{ id: r, type: 'business', action: 'raid', business: d2.id }]);
  const a2 = g2.state.attacks[d2.id];
  Object.assign(g2.state.entities[r], { x: a2.lantern.x + 8, z: a2.lantern.z + 8 });
  // a passive raider thug (stop order) right next to the lantern: in reach, never hits back
  const re = g2.state.entities[g2.spawn('thug', 'thug', a2.lantern.x - 0.6, a2.lantern.z, { owner: 'kuroda', order: { kind: 'stop' } })];
  const hh = g2.spawn('hero', 'ronin', a2.lantern.x + 0.6, a2.lantern.z, { owner: 'player' });
  g2.step([{ id: hh, type: 'business', action: 'knock', business: d2.id }]);
  const hp0 = re.hp;
  for (let i = 0; i < 40; i++) g2.step();
  assert.ok(a2.knock, 'still channelling');
  assert.equal(re.hp, hp0, 'no swings while channelling');
  console.log('no auto attack while channelling ok');
}
