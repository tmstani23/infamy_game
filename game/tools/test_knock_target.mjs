// A rival knocking down your War Lantern (Tim 2026-10-20): the channel carries its length for the
// bars, Tab picks the knocker first, and a hit on him stops it. Run: node tools/test_knock_target.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { tabTarget } from '../src/crew_input.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const g = createGame({
  district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...data('data/settings.json'), dayNight: { auto: false } },
});
const RD = g.settings.units.rules.raid || {}, S = g.state.entities;
g.clans.addClan('player', { name: 'Your clan' });
g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
const den = Object.values(g.state.businesses).find(b => b.kind === 'gambling_den');
g.clans.setOwner(den.id, 'kuroda');
g.step([{ type: 'time', night: true }]);
const hero = g.spawn('hero', 'ronin', den.ring[0], den.ring[1], { owner: 'player' });
g.state.clans.player.lanterns = 1;
g.step([{ id: hero, type: 'business', action: 'raid', business: den.id }]);
const a = g.state.attacks[den.id];
assert.ok(a?.lantern, 'lantern planted');
// the Kuroda boss at the lantern, a thug of his nearer to your hero
const boss = g.spawn('hero', 'rival_yakuza', a.lantern.x, a.lantern.z, { owner: 'kuroda' });
const thug = g.spawn('thug', 'thug', (S[hero].x + a.lantern.x) / 2, (S[hero].z + a.lantern.z) / 2, { owner: 'kuroda' });
assert.notEqual(tabTarget(g.state, hero, undefined), boss, 'not knocking yet: nearest first');
g.step([{ id: boss, type: 'business', action: 'knock', business: den.id }]);
const k = a.knock;
assert.ok(k && k.by === boss, 'the boss is knocking');
assert.equal(k.ticks, Math.round((RD.knockSeconds || 4) * 20), 'channel length for the bars');
assert.equal(tabTarget(g.state, hero, undefined), boss, 'Tab picks the knocker first');
assert.equal(tabTarget(g.state, hero, thug), boss, 'from anyone else too');
assert.notEqual(tabTarget(g.state, hero, boss), boss, 'Tab again moves on');
// a hit stops the channel
S[boss].hp -= 10;
g.step();
assert.ok(!a.knock, 'a hit interrupts the knock-down');
console.log('knock-down targeting ok');

// the bot boss, hit while knocking the lantern down, fights back instead of re-channelling forever
{
  const { createBot } = await import('../src/sim/bot.js');
  const g2 = createGame({
    district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: { ...data('data/settings.json'), dayNight: { auto: false } },
  });
  g2.clans.addClan('player', { name: 'Your clan' });
  g2.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
  const den2 = Object.values(g2.state.businesses).find(b => b.kind === 'gambling_den');
  g2.clans.setOwner(den2.id, 'kuroda');
  g2.step([{ type: 'time', night: true }]);
  const E = g2.state.entities, iz = Object.values(g2.state.businesses).find(b => b.hideout === 'kuroda');
  const kb = g2.spawn('hero', 'rival_yakuza', iz.ring[0], iz.ring[1], { owner: 'kuroda' });
  Object.assign(E[kb], { hp: 1e6, maxHp: 1e6 });
  const bot = createBot(g2, { clan: 'kuroda', hero: kb, rules: { ...data('data/bots.json').levels.easy, patrolChance: 0, raidChance: 0, attackChance: 0 } });
  const me = g2.spawn('hero', 'ronin', den2.ring[0], den2.ring[1], { owner: 'player' });
  Object.assign(E[me], { hp: 1e6, maxHp: 1e6 });
  g2.state.clans.player.lanterns = 1;
  g2.step([{ id: me, type: 'business', action: 'raid', business: den2.id }]);
  const a2 = g2.state.attacks[den2.id];
  let swung = 0, i = 0;
  for (; i < 40 * 20 && g2.state.attacks[den2.id]; i++) {
    const cmds = bot.tick();
    if (a2.knock && !E[me].attackTarget) { Object.assign(E[me], { x: E[kb].x + 0.8, z: E[kb].z }); cmds.push({ id: me, type: 'attack', target: kb }); }
    g2.step(cmds);
    if (E[kb].swing?.target === me) swung++;
  }
  assert.ok(swung > 0, 'the boss swings back at whoever stops his knock-down');
  // you stop and step away: he goes back and knocks it down
  g2.step([{ id: me, type: 'stopattack' }]);
  Object.assign(E[me], { x: E[me].x + 8 });
  for (let j = 0; j < 30 * 20 && g2.state.attacks[den2.id]; j++) g2.step(bot.tick());
  assert.match(g2.state.clans.player.notice.text, /knocked down/, 'then he knocks the lantern down');
  console.log('bot fights back, then knocks it down ok');
}
