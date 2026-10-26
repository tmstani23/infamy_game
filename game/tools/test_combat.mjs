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
  const far = g.spawn('brute', 'brute', 11, 1, { owner: 'kuroda', order: { kind: 'station', x: 11, z: 1 } });   // within sight (fog of war)
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
// left-click elsewhere (Tim 2026-10-18): 'stopattack' drops the hero's locked target
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', 0, 1, { owner: 'player' });
  const foe = g.spawn('thug', 'thug', 1.5, 1, { owner: 'kuroda', hp: 1e6 });
  g.step([{ id: hero, type: 'attack', target: foe }]);
  assert.equal(S[hero].attackTarget, foe, 'locked on');
  g.step([{ id: hero, type: 'stopattack' }]);
  assert.equal(S[hero].attackTarget, undefined, 'target dropped');
  assert.ok(S[hero].swing?.target !== foe || !S[hero].swing, 'swing at it cancelled');
  console.log('stop attack ok');
}
// Z (Tim 2026-10-18): stopped crew stay passive, no attacking even when hit, until any new order
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player', hp: 1e6 });
  const mate = g.spawn('thug', 'thug', 0, 1, { owner: 'player', hp: 1e6 });
  const foe = g.spawn('thug', 'thug', 1, 1, { owner: 'kuroda', hp: 1e6, order: { kind: 'attack', target: mate } });
  g.step([{ id: hero, type: 'order', units: [mate], kind: 'stop' }]);
  const fhp = S[foe].hp;
  let swung = false;
  for (let i = 0; i < 20 * 6; i++) { g.step(); swung ||= !!S[mate].swing; }
  assert.ok(S[mate].hp < 1e6, 'the enemy hits him');
  assert.ok(!swung && S[foe].hp === fhp, 'passive: he never hits back');
  assert.equal(S[mate].order.kind, 'stop');
  g.step([{ id: hero, type: 'order', units: [mate], kind: 'move', x: 0, z: 1 }]);
  for (let i = 0; i < 20 * 4; i++) g.step();
  assert.ok(S[foe].hp < fhp, 'a new order ends passive: he fights again');
  console.log('stop / passive ok');
}
console.log('combat tests passed');

// T (resume, Tim 2026-10-19): a finished attack leaves player crew holding near the body, with or
// without resume (Tim 2026-10-25, crew_recruiting_plan.md); only a second T restores the old order
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -10, 1, { owner: 'player' });
  const t = g.spawn('thug', 'thug', -6, 1, { owner: 'kuroda', order: { kind: 'station', x: -6, z: 1 } });
  S[t].damage = 0;
  const a = g.spawn('thug', 'thug', -8, 1, { owner: 'player', order: { kind: 'follow', target: hero } });
  const b = g.spawn('thug', 'thug', -8, 2, { owner: 'player', order: { kind: 'station', x: -8, z: 2 } });
  const c = g.spawn('thug', 'thug', -8, 0, { owner: 'player', order: { kind: 'stop' } });
  const d = g.spawn('thug', 'thug', -9, 0, { owner: 'player', order: { kind: 'follow', target: hero } });
  g.step([{ id: hero, type: 'order', units: [a, b, c], kind: 'attack', target: t, resume: true },
    { id: hero, type: 'order', units: [d], kind: 'attack', target: t }]);
  assert.equal(S[a].order.kind, 'attack');
  for (let i = 0; i < 20 * 30 && !(S[t].dead || S[t].downed || !S[t]); i++) g.step([]);
  for (let i = 0; i < 20; i++) g.step([]);
  for (const u of [a, b, c, d]) assert.ok(S[u].order.kind === 'move' && S[u].order.arrived, 'holds where the fight ended');
}
console.log('T resume ok');

// a second T calls the attack off: back to the old order at once (Tim 2026-10-19)
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -10, 1, { owner: 'player' });
  const t = g.spawn('thug', 'thug', -2, 1, { owner: 'kuroda', order: { kind: 'station', x: -2, z: 1 } });
  const a = g.spawn('thug', 'thug', -8, 1, { owner: 'player', order: { kind: 'follow', target: hero } });
  const b = g.spawn('thug', 'thug', -8, 2, { owner: 'player', order: { kind: 'station', x: -8, z: 2 } });
  g.step([{ id: hero, type: 'order', units: [a, b], kind: 'attack', target: t, resume: true }]);
  g.step([{ id: hero, type: 'order', units: [a, b], kind: 'resume' }]);
  assert.equal(S[a].order.kind, 'follow', 'called off: following again');
  assert.deepEqual([S[b].order.kind, S[b].order.x, S[b].order.z], ['station', -8, 2], 'called off: back to its post');
}
console.log('T call-off ok');

// Tim 2026-10-19: a player's hero and crew don't pick fights with enemies standing close; they
// swing back once hit, and an attack-move still picks fights on the way
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -1, 1, { owner: 'player' });
  const thug = g.spawn('thug', 'thug', -1, 2, { owner: 'player', order: { kind: 'follow', target: hero } });
  const foe = g.spawn('thug', 'thug', 0.5, 1.5, { owner: 'kuroda', order: { kind: 'move', x: 0.5, z: 1.5 } });   // bot crew holding a spot
  secs(g, 3);
  assert.equal(S[foe].hp, T.thug.hp, 'nobody picked a fight');
  assert.equal(S[hero].hp, T.hero.hp, 'the bot crew left the hero alone too');
  S[foe].order = { kind: 'attack', target: thug };       // it goes for the crew member, who fights back
  secs(g, 4);
  assert.equal(S[thug].hitBy?.id, foe, 'crew member was hit');
  assert.ok(S[foe].hp < T.thug.hp, 'and swung back');
  console.log('no picking fights ok');
}
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player' });
  const thug = g.spawn('thug', 'thug', -4, 1, { owner: 'player', order: { kind: 'move', x: -4, z: 1 } });
  const foe = g.spawn('thug', 'thug', 0, 1, { owner: 'kuroda', order: { kind: 'stop' } });
  secs(g, 2);
  assert.equal(S[foe].hp, T.thug.hp, 'holding crew leave it alone');
  g.step([{ id: hero, type: 'order', units: [thug], kind: 'attackmove', x: 2, z: 1 }]);
  secs(g, 4);
  assert.ok(S[foe].hp < T.thug.hp, 'attack-move picks the fight');
  console.log('attack-move ok');
}

// Tim 2026-10-20: crew back each other up (a mate or the boss hit within BACKUP_RANGE), the same for every clan
{
  const g = newGame(), S = g.state.entities;
  const boss = g.spawn('hero', 'ronin', -1, 1, { owner: 'kuroda', hp: 1e6 });
  const mates = [0, 1].map(i => g.spawn('thug', 'thug', -2 - i * 0.8, 2, { owner: 'kuroda', hp: 1e6, order: { kind: 'follow', target: boss } }));
  const you = g.spawn('hero', 'ronin', 0.5, 1, { owner: 'player', hp: 1e6 });
  g.step([{ id: you, type: 'attack', target: mates[0] }]);
  secs(g, 3);
  assert.ok(S[you].hp < 1e6, 'you got hit back');
  let both = new Set();
  for (let i = 0; i < 20 * 3; i++) { g.step(); for (const h of g.state.hits) if (h.t === you) both.add(h.a); }
  assert.ok(mates.every(id => both.has(id)), 'the mate you did not touch joins in too');
  console.log('crew back each other up ok');
}
