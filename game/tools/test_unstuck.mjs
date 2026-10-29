// Phase 5 (docs/playtest_followup_plan.md, 2026-10-29): stealth close detection and the hero's Unstuck command.
// Run: node game/tools/test_unstuck.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json');
const newGame = kind => {
  const g = createGame({
    district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: { ...settings, dayNight: { auto: false } },
  });
  g.clans.addClan('player', { name: 'Player clan', ...(kind ? { kind } : {}) });
  g.clans.addClan('kuroda', { bot: true });
  return g;
};

// close detection: an enemy facing away still senses a ninja within closeRange, not further
{
  const g = newGame('ninja');
  const S = g.settings.units.rules.stealth;
  g.step([{ type: 'time', night: true }]);
  const dark = (() => { for (let x = -60; x < 60; x += 2) for (let z = -20; z < 60; z += 2) if (!g.stealth.lit(x, z) && g.nav.free(x, z) && g.nav.free(x + 2, z)) return [x, z]; })();
  const n = g.state.entities[g.spawn('ninja', 'ninja_grunt', dark[0], dark[1], { owner: 'player', order: { kind: 'stop' } })];
  const t = g.state.entities[g.spawn('thug', 'thug', dark[0] + 30, dark[1], { owner: 'kuroda', order: { kind: 'stop' } })];
  const watch = (dx, dir) => { // fresh: far away until hidden, then stand at dx facing dir for suspicionSeconds
    Object.assign(t, { x: dark[0] + 30 }); n.revealUntil = null;
    for (let i = 0; i < 20 * (S.revealSeconds + 1); i++) g.step();
    assert.equal(n.hidden, true);
    Object.assign(t, { x: dark[0] + dx, dir });
    for (let i = 0; i < 20 * S.suspicionSeconds + 4; i++) { t.dir = dir; g.step(); }
    return n.hidden;
  };
  const behind = [0, 1, 2, 3, 4, 5, 6, 7].find(d => watch(S.darkRange - 0.3, d));
  assert.ok(behind !== undefined, 'some facing does not see him from 1.7 away (behind)');
  assert.equal(watch(S.closeRange - 0.3, behind), false, 'too close: sensed from behind');
  console.log('close detection ok');
}

// Unstuck: 3 s still, then inside the hideout; cooldown; hits cancel; blocked after combat and during an HQ raid
{
  const g = newGame();
  const U = g.settings.units.rules.unstuck;
  const hero = g.state.entities[g.spawn('hero', 'ronin', 6, 8, { owner: 'player' })];
  const hide = Object.values(g.state.businesses).find(b => b.hideout === 'player' && b.owner === 'player');
  assert.ok(hide, 'player has a hideout');
  const run = n => { for (let i = 0; i < n; i++) g.step(); };
  g.step([{ id: hero.id, type: 'unstuck' }]);
  assert.ok(hero.unstuck, 'channel started');
  run(20 * U.channelSeconds - 5);
  assert.equal(hero.place, 'street', 'not yet');
  run(10);
  assert.equal(hero.place, hide.room, 'inside the hideout');
  assert.equal(g.state.stuckSpots.length, 1, 'stuck spot logged');
  // cooldown
  Object.assign(hero, { place: 'street', x: 6, z: 8 });
  g.step([{ id: hero.id, type: 'unstuck' }]);
  assert.ok(!hero.unstuck, 'on cooldown');
  assert.match(g.unstuck.why(hero), /ready in/);
  // a hit cancels the channel; a recent fight blocks a new one
  hero.unstuckReady = 0;
  g.step([{ id: hero.id, type: 'unstuck' }]);
  assert.ok(hero.unstuck);
  run(5); hero.hitAt = g.state.tick; run(1);
  assert.ok(!hero.unstuck, 'hit cancels');
  g.step([{ id: hero.id, type: 'unstuck' }]);
  assert.ok(!hero.unstuck, 'blocked right after a fight');
  run(20 * U.combatSeconds);
  // moving cancels
  g.step([{ id: hero.id, type: 'unstuck' }]);
  assert.ok(hero.unstuck);
  g.step([{ id: hero.id, type: 'move', right: 1, down: 0 }]);
  assert.ok(!hero.unstuck, 'moving cancels');
  g.step([{ id: hero.id, type: 'move', right: 0, down: 0 }]);
  // HQ raid on you blocks it
  g.state.attacks[hide.id] = { mode: 'raid', business: hide.id, defender: 'player', clan: 'kuroda' };
  assert.match(g.unstuck.why(hero), /raided/);
  delete g.state.attacks[hide.id];
  assert.equal(g.unstuck.why(hero), null, 'ready again');
  console.log('unstuck ok');
}
