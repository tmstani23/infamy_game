// Fixed execution pay and per-victim leader bounties, including Shinobi contracts.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const make = (ninja = false) => {
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), bandits: data('data/bandits.json'), police: data('data/police.json') });
  g.clans.addClan('player', { kind: ninja ? 'ninja' : 'yakuza' });
  g.clans.addClan('rival');
  const hero = g.spawn('hero', ninja ? 'ninja_leader' : 'ronin', -8, 1, { owner: 'player' });
  return { g, hero, clan: g.state.clans.player };
};
const until = (g, check, seconds = 8) => { for (let i = 0; i < seconds * 20 && !check(); i++) g.step(); assert.ok(check()); };
const resetVictim = (g, id) => {
  Object.assign(g.state.entities[id], { hp: 1, dead: false, downed: false, x: -6, z: 1, place: 'street' });
  delete g.state.entities[id].diedAt;
};
const defeat = (g, hero, victim) => {
  g.step([{ id: hero, type: 'attack', target: victim }]);
  until(g, () => g.state.entities[victim].dead);
  g.step([{ id: hero, type: 'stopattack' }]);
};

{
  const { g, hero, clan } = make();
  const victim = g.spawn('hero', 'rival_yakuza', -6, 1, { owner: 'rival', hp: 1 });
  const before = clan.ryo;
  defeat(g, hero, victim);
  assert.equal(clan.ryo - before, 250);
  assert.equal(g.state.bounties.claimed[victim], 'player');
  // Allow the actual respawn, then defeat the same leader again.
  until(g, () => !g.state.entities[victim].dead, 22);
  resetVictim(g, victim);
  defeat(g, hero, victim);
  assert.equal(clan.ryo - before, 250, 'respawning does not reset the reward');
  g.clans.addClan('third');
  Object.assign(g.state.entities[hero], { x: -30, z: 30 });
  const third = g.spawn('hero', 'ronin', -8, 1, { owner: 'third' });
  const thirdBefore = g.state.clans.third.ryo;
  resetVictim(g, victim);
  defeat(g, third, victim);
  assert.equal(g.state.clans.third.ryo, thirdBefore, 'another clan cannot claim the same bounty');
  g.step([{ type: 'time', night: true }]);
  g.step([{ type: 'time', night: false }]);
  resetVictim(g, victim);
  defeat(g, third, victim);
  assert.equal(g.state.clans.third.ryo - thirdBefore, 250, 'bounty becomes available at dawn');
  console.log('250-ryo leader bounty, actual respawn, shared claim limit and dawn reset ok');
}

for (const type of ['thug', 'brute', 'swordsman', 'ninja']) {
  const { g, hero, clan } = make();
  const victim = g.spawn(type, g.settings.units.types[type].sprite, -6, 1, { owner: 'rival', hp: 1, order: { kind: 'stop' } });
  const before = clan.ryo;
  g.step([{ id: hero, type: 'attack', target: victim }]);
  until(g, () => g.state.entities[victim]?.downed);
  assert.equal(clan.ryo, before, 'downing crew alone does not pay');
  g.step([{ id: hero, type: 'execute', target: victim }]);
  until(g, () => g.state.entities[victim]?.dead);
  assert.equal(clan.ryo - before, 50, `${type} execution pays exactly 50`);
  g.step([{ id: hero, type: 'execute', target: victim }]);
  assert.equal(clan.ryo - before, 50, 'cannot execute twice for another reward');
}
console.log('all four crew types: 50 ryo per execution, no down or duplicate reward');

{
  const { g, hero, clan } = make(true);
  const victim = g.spawn('hero', 'rival_yakuza', -6, 1, { owner: 'rival', hp: 1 });
  g.state.contracts.active.player = { kind: 'boss', clan: 'player', hero: victim, target: 'rival',
    ryo: 400, renown: 40, label: 'Boss contract', takenAt: 0, progress: 0 };
  const before = clan.ryo;
  defeat(g, hero, victim);
  assert.equal(clan.ryo - before, 400, 'contract replaces the ordinary bounty');
  assert.equal(clan.renown, 40);
  assert.equal(g.state.contracts.active.player, undefined);
  resetVictim(g, victim);
  defeat(g, hero, victim);
  assert.equal(clan.ryo - before, 400, 'cannot collect a bounty after the contract on the same cycle');
  // Shadow Step deals damage during command handling, including on a dawn transition.
  g.step([{ type: 'time', night: true }]);
  resetVictim(g, victim);
  Object.assign(g.state.entities[hero], { x: -8, z: 1 });
  g.step([{ type: 'time', night: false }, { id: hero, type: 'ability', slot: 'Q', x: -6, z: 1, target: victim }]);
  assert.ok(g.state.entities[victim].dead);
  assert.equal(clan.ryo - before, 650, 'dawn resets the claim before immediate ability damage');
  console.log('Shinobi contract pays 400 plus Renown without stacking, dawn ability bounty ok');
}

{
  const { g, hero, clan } = make(true);
  const victim = g.spawn('hero', 'rival_yakuza', -6, 1, { owner: 'rival', hp: 1 });
  g.state.contracts.active.player = { kind: 'boss', clan: 'player', hero: victim, target: 'rival',
    ryo: 400, renown: 40, label: 'Expiring contract', takenAt: 0, progress: 0 };
  g.step([{ type: 'time', night: true }]);
  const before = clan.ryo;
  g.step([{ type: 'time', night: false }, { id: hero, type: 'ability', slot: 'Q', x: -6, z: 1, target: victim }]);
  assert.equal(clan.ryo - before, 250, 'an expired contract cannot swallow the normal bounty');
  assert.equal(clan.renown, 0);
}
