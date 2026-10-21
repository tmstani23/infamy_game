// Checks the hero abilities in the sim: node game/tools/test_abilities.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json'), T = units.types, A = T.hero.abilities;
const newGame = () => {
  const g = createGame({
    district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units,
  });
  g.clans.addClan('player'); g.clans.addClan('kuroda', { bot: true });
  return g;
};
const run = (g, n, cmds = []) => { g.step(cmds); for (let i = 1; i < n * 20; i++) g.step(); };
const cast = (g, id, slot, x, z) => g.step([{ id, type: 'ability', slot, x, z }]);

// Dash: moves the hero, cuts each enemy passed once for 150%, then cools down
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player' });
  const a = g.spawn('thug', 'thug', -4, 1, { owner: 'kuroda' }), b = g.spawn('thug', 'thug', -2.5, 1, { owner: 'kuroda' });
  S[a].hp = S[b].hp = 1e6;
  cast(g, hero, 'Q', 4, 1);
  assert.equal(g.state.casts.length, 1);
  run(g, 0.3);
  assert.ok(S[hero].x > -6 + A.Q.range - 0.5, `dashed ${S[hero].x}`);
  const want = Math.round(T.hero.damage * A.Q.damageMultiplier);
  assert.equal(1e6 - S[a].hp >= want && (1e6 - S[a].hp) % 1 === 0, true);
  assert.ok(1e6 - S[b].hp >= want, 'second enemy cut too');
  delete S[a]; delete S[b];
  cast(g, hero, 'Q', -20, 1);
  assert.equal(g.state.casts.length, 0, 'on cooldown');
  run(g, A.Q.cooldown);
  cast(g, hero, 'Q', -20, 1);
  assert.equal(g.state.casts.length, 1, 'ready again');
  console.log('dash ok');
}

// Intimidate: nearby enemies hit for 30% less, far ones do not; wears off
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player' });
  const near = g.spawn('thug', 'thug', -5, 1, { owner: 'kuroda', order: { kind: 'attack', target: hero } }), far = g.spawn('thug', 'thug', 6, 1, { owner: 'kuroda' });
  cast(g, hero, 'E');
  assert.ok(S[near].buffs?.intimidated && !S[far].buffs);
  const distract = units.models.ninja_leader.abilities.E;
  assert.equal(A.E.snareSpeed, distract.snareSpeed);
  assert.equal(A.E.snareSeconds, distract.snareSeconds);
  assert.equal(S[near].buffs?.snared?.speed, distract.snareSpeed, 'Intimidate also applies the matching snare');
  assert.ok(!S[far].buffs?.snared, 'outside the radius is not snared');
  S[hero].hp = 1e6; S[near].hp = 1e6;
  S[near].x = -5.2;
  let seen = [];
  for (let i = 0; i < 60; i++) { g.step(); seen.push(...g.state.hits.filter(h => h.a === near && !h.crit).map(h => h.damage)); }
  assert.ok(seen.length && seen.every(d => d === Math.round(T.thug.damage * A.E.enemyDamage)), `weakened hits ${seen}`);
  run(g, A.E.seconds);
  assert.ok(!S[near].buffs, 'wore off');
  console.log('intimidate ok');
}

// Rally: own crew in range heal 15% over 6 s and swing faster; enemies and far crew untouched
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player' });
  const mine = g.spawn('thug', 'thug', -4, 1, { owner: 'player' }), away = g.spawn('thug', 'thug', 10, 1, { owner: 'player' });
  S[mine].hp = 100; S[away].hp = 100;
  cast(g, hero, 'R');
  // heal over time: the first share at once, the rest one a second (A.R.heal in all over healTicks)
  assert.ok(Math.abs(S[mine].hp - (100 + T.thug.hp * A.R.heal / A.R.healTicks)) < 1, `first rally tick ${S[mine].hp}`);
  assert.ok(S[mine].buffs?.rally && !S[away].buffs);
  assert.ok(S[hero].buffs?.rally, 'rally buffs the hero too');
  const awayHp = S[away].hp;   // regeneration adds a little on top for both
  for (let i = 0; i < 20 * 6; i++) g.step();
  assert.ok(S[mine].hp >= 100 + T.thug.hp * A.R.heal - 1, `rally healed ${S[mine].hp}`);
  assert.ok(S[mine].hp - 100 - T.thug.hp * A.R.heal < (S[away].hp - awayHp) + 1, 'no more than its share plus regen');
  assert.ok(S[away].hp - awayHp < T.thug.hp * 0.05, 'far crew not healed by rally');
  // swing gap: count hits on a tough dummy over 6 s with and without rally
  const count = rally => {
    const g2 = newGame(), E = g2.state.entities;
    const h = g2.spawn('hero', 'ronin', -30, 1, { owner: 'player' });
    const t = g2.spawn('thug', 'thug', -4, 1, { owner: 'player', order: { kind: 'station', x: -4, z: 1 } });
    const d = g2.spawn('brute', 'brute', -3, 1, { owner: 'kuroda', order: { kind: 'station', x: -3, z: 1 } });
    E[d].hp = 1e6; E[t].hp = 1e6;
    if (rally) { E[h].x = -5; cast(g2, h, 'R'); E[h].x = -30; } 
    let n = 0;
    for (let i = 0; i < 120; i++) { g2.step(); n += g2.state.hits.filter(x => x.a === t).length; }
    return n;
  };
  const slow = count(false), fast = count(true);
  assert.ok(fast > slow, `rally ${fast} vs ${slow}`);
  console.log('rally ok');
}

// Red Lantern: 50% more damage and heals 20% of it; cleared when knocked out
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player' });
  const foe = g.spawn('brute', 'brute', -4.6, 1, { owner: 'kuroda', order: { kind: 'attack', target: hero } });
  S[foe].hp = 1e6;
  cast(g, hero, 'F');
  S[hero].hp = 100;
  const hits = [];
  let dealt = 0, taken = 0;
  for (let i = 0; i < 80; i++) {
    g.step();
    hits.push(...g.state.hits.filter(h => h.a === hero && !h.crit));
    for (const h of g.state.hits) { if (h.a === hero) dealt += h.damage; if (h.t === hero) taken += h.damage; }
  }
  assert.ok(hits.length && hits.every(h => h.damage === Math.round(T.hero.damage * A.F.damage)), 'boosted');
  assert.ok(Math.abs(S[hero].hp - (100 - taken + dealt * A.F.lifesteal)) < 2, `lifesteal ${S[hero].hp} ${taken} ${dealt}`);
  S[hero].hp = 1;
  run(g, 3);
  assert.ok(!S[hero].buffs, 'buffs cleared on knock-out');
  cast(g, hero, 'Q', 0, 1);
  assert.equal(g.state.casts.length, 0, 'no abilities while knocked out');
  console.log('lantern ok');
}

// Crew cannot cast, and unknown slots are ignored
{
  const g = newGame(), S = g.state.entities;
  const t = g.spawn('thug', 'thug', -4, 1, { owner: 'player' });
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player' });
  cast(g, t, 'F'); cast(g, hero, 'Z');
  assert.equal(g.state.casts.length, 0);
  assert.ok(!S[t].buffs);
  console.log('checks ok');
}
console.log('ability tests passed');
