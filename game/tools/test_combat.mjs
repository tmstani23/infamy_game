// Checks the fighting rules in the sim: node game/tools/test_combat.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json'), T = units.types;
const newGame = () => {
  const g = createGame({
    district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units,
  });
  g.clans.addClan('player'); g.clans.addClan('kuroda', { bot: true });
  return g;
};
const secs = (g, n, cmds = []) => { g.step(cmds); for (let i = 1; i < n * 20; i++) g.step(); };
const alive = (g, id) => g.state.entities[id] && !g.state.entities[id].dead && !g.state.entities[id].downed;

// Street spot with room around it: the crossroads at x 0, z 1
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player', home: [-6, 1] });
  assert.equal(S[hero].hp, T.hero.hp);
  const thug = g.spawn('thug', 'thug', -4, 1, { owner: 'player', order: { kind: 'follow', target: hero } });
  assert.equal(S[thug].hp, T.thug.hp);
  assert.equal(S[thug].maxHp, T.thug.hp);
  const thug2 = g.spawn('thug', 'thug', -4, 2, { owner: 'player', order: { kind: 'follow', target: hero } });

  // An enemy wanders into range: the follower picks the fight on its own and wins (2 vs 1)
  const foe = g.spawn('thug', 'thug', 1, 1, { owner: 'kuroda', order: { kind: 'station', x: 1, z: 1 } });
  secs(g, 2);
  assert.ok(S[foe].hp < T.thug.hp, 'enemy took hits');
  secs(g, 25);
  assert.ok(!alive(g, foe), 'enemy fell');
  assert.ok(S[foe].downed, 'crew go down, not dead');
  g.step([{ id: hero, type: 'execute', target: foe, units: [thug] }]);   // finish it off
  secs(g, 9);
  assert.equal(S[foe], undefined, 'executed body removed after the fall');
  assert.ok(alive(g, thug) && alive(g, thug2), 'two beat one');
  delete S[thug2];

  // Focus: right-click order on one enemy; crew go for it even past a nearer one
  const near = g.spawn('thug', 'thug', 0, 5, { owner: 'kuroda', order: { kind: 'station', x: 0, z: 5 } });
  const far = g.spawn('brute', 'brute', 16, 1, { owner: 'kuroda', order: { kind: 'station', x: 16, z: 1 } });
  S[near].hp = S[far].hp = S[thug].hp = 1e9;                      // nobody dies here; just watch who gets hit
  g.step([{ id: hero, type: 'order', units: [thug], kind: 'attack', target: far }]);
  secs(g, 6);
  assert.ok(S[far].hp < 1e9, 'focused target was hit');
  assert.equal(S[thug].order.kind, 'attack');

  // A plain move walks past enemies without fighting
  S[hero].x = -30; S[hero].z = 1;                       // hero out of the way (it would hit back)
  const before = S[near].hp;
  g.step([{ id: hero, type: 'order', units: [thug], kind: 'move', x: -14, z: 1 }]);
  delete S[far]; secs(g, 3);
  assert.equal(S[near].hp, before, 'move does not fight on the way');
  S[near].x = 0; S[near].z = 5;                        // (it chased; put it back)
  secs(g, 5);
  assert.ok(Math.hypot(S[thug].x + 14, S[thug].z - 1) < 1);

  // Attack-move fights what it meets on the way
  g.step([{ id: hero, type: 'order', units: [thug], kind: 'attackmove', x: 0, z: 8 }]);
  secs(g, 6);
  assert.ok(S[near].hp < before, 'attack-move picked the fight');

  // Orders are checked: no attacking your own side, no ordering another clan's crew
  g.step([{ id: hero, type: 'order', units: [thug], kind: 'attack', target: hero }]);
  assert.notEqual(S[thug].order.target, hero);
  console.log('crew combat ok');
}

// The hero hits enemies in reach when standing still, and is knocked out, not killed
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', 0, 1, { owner: 'player', home: [-6, 1] });
  const foe = g.spawn('brute', 'brute', 1.4, 1, { owner: 'kuroda', order: { kind: 'station', x: 1.4, z: 1 } });
  secs(g, 3);
  assert.ok(S[foe].hp < T.brute.hp, 'hero auto-attacks');
  // walking means no attacks
  const hp = S[foe].hp;
  for (let i = 0; i < 20; i++) g.step([{ id: hero, type: 'move', right: -1, down: 0 }]);
  g.step([{ id: hero, type: 'move', right: 0, down: 0 }]);
  assert.ok(S[foe].hp >= hp - T.hero.damage, 'no hitting while running');
  // a crowd beats the hero down: knocked out, then back up at the clinic's door ring at full health
  for (let i = 0; i < 6; i++) g.spawn('swordsman', 'swordsman', S[hero].x + 1 + (i % 3) * 0.5, S[hero].z + (i < 3 ? 1 : -1), { owner: 'kuroda', order: { kind: 'station', x: S[hero].x, z: S[hero].z } });
  let down = false;
  for (let i = 0; i < 20 * 30 && !down; i++) { g.step(); down = S[hero].dead; }
  assert.ok(down, 'hero went down');
  assert.equal(S[hero].anim, 'death');
  assert.ok(S[hero], 'hero is not removed');
  g.step([{ id: hero, type: 'move', right: 1, down: 0 }]);   // cannot move while down
  let ticks = 0;
  while (S[hero].dead && ticks < 20 * 30) { g.step(); ticks++; }
  assert.ok(!S[hero].dead && S[hero].hp === S[hero].maxHp, 'hero got back up');
  assert.ok(Math.abs(ticks / 20 - units.rules.heroRespawnSeconds) < 0.2, 'after heroRespawnSeconds');
  const ring = g.doors.find(d => d.menu === 'clinic');
  assert.deepEqual([S[hero].x, S[hero].z, S[hero].place], [ring.x, ring.z, 'street'], 'at the clinic');
  assert.deepEqual(JSON.parse(JSON.stringify(g.state)), g.state);
  console.log('hero combat ok');
}
// The stand-in rivals main.js puts outside the den stand on open street
{
  const g = newGame();
  const den = Object.values(g.state.businesses).find(b => b.kind === 'gambling_den');
  for (let i = 0; i < 3; i++) {
    const x = den.door[0] - 1.2 + i * 1.2, z = den.door[1] + 4;
    assert.ok(g.nav.clearLine(x, z, x, z), `rival spot ${x},${z} is open`);
  }
}
// Slow regen: nothing for a few seconds after a hit, then a little every second, never past max
{
  const g = newGame(), S = g.state.entities, R = units.rules;
  const u = g.spawn('thug', 'thug', 0, 1, { owner: 'player' });
  S[u].hp = 50; S[u].hitAt = g.state.tick;
  secs(g, R.regenAfterSeconds - 1);
  assert.equal(S[u].hp, 50, 'no regen right after a hit');
  secs(g, 11);
  assert.ok(S[u].hp > 50 && S[u].hp < 50 + S[u].maxHp * R.regenPerSecond * 11, 'slow regen');
  S[u].hp = S[u].maxHp - 0.01; secs(g, 2);
  assert.equal(S[u].hp, S[u].maxHp);
}
// Swings: the wind-up shows first, damage lands on the strike, and each hit is reported once
{
  const g = newGame(), S = g.state.entities;
  const a = g.spawn('swordsman', 'swordsman', 0, 1, { owner: 'player', order: { kind: 'station', x: 0, z: 1 } });
  const t = g.spawn('brute', 'brute', 1.6, 1, { owner: 'kuroda', order: { kind: 'station', x: 1.6, z: 1 } });
  S[t].damage = 0;
  let swing = null, hits = [], firstDrop = null;
  for (let i = 0; i < 40; i++) {
    g.step();
    if (!swing && S[a].swing) swing = { ...S[a].swing };
    hits.push(...g.state.hits.filter(h => h.a === a));
    if (firstDrop === null && S[t].hp < T.brute.hp) firstDrop = g.state.tick - 1;
  }
  assert.ok(swing, 'a swing started');
  assert.equal(firstDrop, swing.strike, 'damage lands on the strike tick, not at the start');
  assert.ok(swing.strike > swing.start);
  assert.ok(hits.length >= 1 && hits.every(h => h.t === t && (h.damage === T.swordsman.damage || h.crit && h.damage === T.swordsman.damage * 2)));
  assert.equal(T.brute.hp - S[t].hp, hits.reduce((n, h) => n + h.damage, 0), 'hits list matches the damage done');
}

// Crits: about 1 in 10, double damage
{
  const g = newGame(), S = g.state.entities;
  const a = g.spawn('thug', 'thug', 0, 1, { owner: 'player', order: { kind: 'station', x: 0, z: 1 } });
  const t = g.spawn('thug', 'thug', 1.2, 1, { owner: 'kuroda', order: { kind: 'station', x: 1.2, z: 1 } });
  S[t].hp = S[t].maxHp = S[a].hp = S[a].maxHp = 1e9;
  const hits = [];
  for (let i = 0; i < 20 * 400; i++) { g.step(); hits.push(...g.state.hits.filter(h => h.a === a)); }
  const crits = hits.filter(h => h.crit);
  assert.ok(hits.length > 300);
  assert.ok(crits.length / hits.length > 0.06 && crits.length / hits.length < 0.14, `crit share ${crits.length}/${hits.length}`);
  assert.ok(crits.every(h => h.damage === T.thug.damage * 2));
}

// Surround: four crew on one target end up on different sides of it
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -10, 1, { owner: 'player' });
  const t = g.spawn('brute', 'brute', 0, 1, { owner: 'kuroda', order: { kind: 'station', x: 0, z: 1 } });
  S[t].hp = S[t].maxHp = 1e9; S[t].damage = 0;
  const crew = [0, 1, 2, 3].map(i => g.spawn('thug', 'thug', -6 - i * 0.3, 1 + (i % 2) * 0.5, { owner: 'player', order: { kind: 'move', x: -6, z: 1 } }));
  g.step([{ id: hero, type: 'order', units: crew, kind: 'attack', target: t }]);
  secs(g, 6);
  const angles = crew.map(id => Math.atan2(S[id].z - S[t].z, S[id].x - S[t].x));
  const spread = Math.max(...angles) - Math.min(...angles);
  assert.ok(crew.every(id => Math.hypot(S[id].x - S[t].x, S[id].z - S[t].z) < 2.2), 'all in reach');
  assert.ok(spread > 1.2, `crew spread round the target (${spread.toFixed(2)} rad)`);
}

// Hero lock-on: the attack command never chases; the hero hits the target only in reach,
// WASD keeps the lock, and it drops when the target goes far away
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player' });
  const t = g.spawn('brute', 'brute', 0, 1, { owner: 'kuroda', order: { kind: 'station', x: 0, z: 1 } });
  S[t].hp = S[t].maxHp = 1e9; S[t].damage = 0;
  g.step([{ id: hero, type: 'attack', target: t }]);
  secs(g, 2);
  assert.deepEqual([S[hero].x, S[hero].z], [-6, 1], 'no chasing');
  assert.equal(S[t].hp, 1e9, 'out of reach: no hits');
  assert.equal(S[hero].attackTarget, t, 'still locked');
  S[hero].x = S[t].x - T.hero.attackRange; S[hero].z = S[t].z;   // in reach
  secs(g, 2);
  assert.ok(S[t].hp < 1e9, 'hits it once in reach');
  g.step([{ id: hero, type: 'move', right: -1, down: 0 }]);
  assert.equal(S[hero].attackTarget, t, 'WASD keeps the lock');
  assert.equal(S[hero].swing, undefined, 'but cancels the swing');
  g.step([{ id: hero, type: 'move', right: 0, down: 0 }]);
  S[hero].x = S[t].x - 20;
  g.step();
  assert.equal(S[hero].attackTarget, undefined, 'far away: lock dropped');
  // cannot attack your own side
  const mine = g.spawn('thug', 'thug', -8, 1, { owner: 'player' });
  g.step([{ id: hero, type: 'attack', target: mine }]);
  assert.equal(S[hero].attackTarget, undefined);
}
console.log('combat tests passed');
