// Checks downed crew and executes in the sim: node game/tools/test_downed.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json'), R = units.rules;
const newGame = () => {
  const g = createGame({
    district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units,
  });
  g.clans.addClan('player'); g.clans.addClan('kuroda', { bot: true });
  return g;
};
const run = (g, s, cmds = []) => { g.step(cmds); for (let i = 1; i < s * 20; i++) g.step(); };

// 0 HP crew go down: they stay, stop acting, nobody keeps hitting them, no regen
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player' });
  const foe = g.spawn('thug', 'thug', -4.4, 1, { owner: 'kuroda' });
  S[foe].hp = 1;
  run(g, 2);
  assert.ok(S[foe] && S[foe].downed && !S[foe].dead && S[foe].hp === 0, 'down, not dead');
  const n = g.state.tick;
  let hitsOnIt = 0;
  for (let i = 0; i < 60; i++) { g.step(); hitsOnIt += g.state.hits.filter(h => h.t === foe).length; }
  assert.equal(hitsOnIt, 0, 'downed units are not attacked');
  assert.equal(S[foe].hp, 0, 'no regen while down');
  void n;
  console.log('downed ok');

  // Execute by the hero: walks up, channels executeSeconds, then the unit is dead and removed
  S[hero].x = -9;
  g.step([{ id: hero, type: 'execute', target: foe }]);
  assert.ok(S[hero].execute);
  let killedAt = null;
  for (let i = 0; i < 20 * 8 && killedAt === null; i++) { g.step(); if (S[foe]?.dead) killedAt = g.state.tick; }
  assert.ok(killedAt !== null, 'executed');
  assert.ok(g.state.tick >= R.executeSeconds * 20, 'took the channel time');
  run(g, 4);
  assert.equal(S[foe], undefined, 'body removed');
  console.log('execute ok');
}

// Channel breaks on a hit and on WASD movement; own units and the standing cannot be executed
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player' });
  const down = g.spawn('thug', 'thug', -5, 1, { owner: 'kuroda' });
  Object.assign(S[down], { hp: 0, downed: true, anim: 'death' });
  g.step([{ id: hero, type: 'execute', target: down }]);
  run(g, 1);
  assert.ok(S[hero].execute?.start !== null, 'channelling');
  g.step([{ id: hero, type: 'move', right: 1, down: 0 }]);
  assert.equal(S[hero].execute, undefined, 'moving breaks it');
  g.step([{ id: hero, type: 'move', right: 0, down: 0 }]);
  // a hit breaks it too
  g.step([{ id: hero, type: 'execute', target: down }]);
  run(g, 1);
  const shooter = g.spawn('thug', 'thug', S[hero].x + 1, S[hero].z + 0.5, { owner: 'kuroda' });
  let broke = false;
  for (let i = 0; i < 60 && !broke; i++) { g.step(); broke = !S[hero].execute; }
  assert.ok(broke && S[down].downed, 'hit breaks the channel; target still down');
  delete S[shooter];
  const mine = g.spawn('thug', 'thug', -7, 1, { owner: 'player' });
  Object.assign(S[mine], { hp: 0, downed: true });
  g.step([{ id: hero, type: 'execute', target: mine }]);
  assert.equal(S[hero].execute, undefined, 'cannot execute your own');
  const standing = g.spawn('thug', 'thug', -4, 3, { owner: 'kuroda' });
  g.step([{ id: hero, type: 'execute', target: standing }]);
  assert.equal(S[hero].execute, undefined, 'only downed units');
  console.log('interrupts ok');
}

// Crew execute when ordered (nearest selected one), and defenders go for the executor first
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -30, 1, { owner: 'player' });
  const near = g.spawn('thug', 'thug', -2, 1, { owner: 'player', order: { kind: 'station', x: -2, z: 1 } });
  const far = g.spawn('thug', 'thug', -12, 1, { owner: 'player', order: { kind: 'station', x: -12, z: 1 } });
  const down = g.spawn('brute', 'brute', 0, 1, { owner: 'kuroda' });
  Object.assign(S[down], { hp: 0, downed: true });
  g.step([{ id: hero, type: 'execute', target: down, units: [far, near] }]);
  assert.ok(S[near].execute && !S[far].execute, 'nearest crew member does it');
  // an enemy guard nearby stops it: it attacks the executor, not the other thug
  const guard = g.spawn('swordsman', 'swordsman', 3, 1, { owner: 'kuroda', order: { kind: 'station', x: 3, z: 1 } });
  let target = null;
  for (let i = 0; i < 40 && !target; i++) { g.step(); target = g.state.hits.find(h => h.a === guard)?.t; }
  assert.equal(target, near, 'defender hits the executor');
  assert.ok(S[down].downed, 'execute was broken');
  void far;
  console.log('crew execute ok');
}
console.log('downed tests passed');

// Bots: finish downed enemies when safe, by aggression, pricier types first
{
  const setup = aggression => {
    const g = newGame(), S = g.state.entities;
    g.clans.addClan('kuroda', { bot: true, aggression });
    const bot = g.spawn('thug', 'thug', 0, 1, { owner: 'kuroda', order: { kind: 'station', x: 0, z: 1 } });
    const cheap = g.spawn('thug', 'thug', 2, 2.5, { owner: 'player' }), dear = g.spawn('swordsman', 'swordsman', 2, -0.5, { owner: 'player' });
    for (const id of [cheap, dear]) Object.assign(S[id], { hp: 0, downed: true });
    return { g, S, bot, cheap, dear };
  };
  { const { g, S, bot, dear } = setup(1); run(g, 1.2); assert.equal(S[bot].execute?.target, dear, 'pricier first'); }
  { const { g, S, bot } = setup(0); run(g, 5); assert.ok(!S[bot].execute, 'aggression 0 never executes'); }
  { // not safe: a standing enemy next to the downed units
    const { g, S, bot, cheap, dear } = setup(1);
    const guard = g.spawn('hero', 'ronin', 3, 1, { owner: 'player' });
    S[guard].hp = 1e6;
    S[bot].hp = 1e6;
    run(g, 3);
    assert.ok(S[bot].execute === undefined || ![cheap, dear].includes(S[bot].execute?.target) || false, 'no execute while unsafe');
  }
  { // a bot that rolls no keeps rolling: at aggression 0.5 it still finishes both (the bug Tim hit 2026-10-17)
    const { g, S, cheap, dear } = setup(0.5);
    run(g, 20);
    assert.ok(!S[cheap] && !S[dear], 'a no is not forever');
  }
  { // the real fight: the player's crew attack the den guards, the hero stays well away,
    // and the guards finish off every crew member they put down
    const g = newGame(), S = g.state.entities;
    const den = Object.values(g.state.businesses).find(b => b.kind === 'gambling_den');
    const foes = [0, 1, 2].map(i => { const x = den.door[0] - 1.2 + i * 1.2, z = den.door[1] + 4;
      return g.spawn('thug', 'thug', x, z, { owner: 'kuroda', order: { kind: 'station', x, z } }); });
    for (const f of foes) S[f].hp = 1e5;
    const [hx, hz] = [den.door[0] + 14, den.door[1] + 4];
    const hero = g.spawn('hero', 'ronin', hx, hz, { owner: 'player' });
    const crew = [0, 1, 2].map(i => g.spawn('thug', 'thug', hx - 1, hz + i - 1, { owner: 'player' }));
    g.step([{ id: hero, type: 'order', units: crew, kind: 'attack', target: foes[1] }]);
    let executed = 0;
    for (let i = 0; i < 60 * 20; i++) { g.step(); executed += g.state.casts.filter(c => c.kind === 'execute' && crew.includes(c.target)).length; }
    assert.equal(executed, 3, 'every downed crew member was executed');
  }
  { // full run: the bot finishes both
    const { g, S, cheap, dear } = setup(1);
    run(g, 15);
    assert.ok(!S[cheap] && !S[dear], 'both finished and removed');
  }
  console.log('bot execute ok');
}
console.log('bot tests passed');

// Carried off: a downed unit left alone goes to the clinic, recovers, pays, walks out
{
  const g = newGame(), S = g.state.entities, C = g.state.clans;
  g.clans.addClan('kuroda', { bot: true, aggression: 0 });     // a guard that never finishes anyone off
  const hero = g.spawn('hero', 'ronin', -30, 1, { owner: 'player' });
  const t = g.spawn('thug', 'thug', -2, 1, { owner: 'player' });
  const foe = g.spawn('thug', 'thug', 0, 1, { owner: 'kuroda' });
  Object.assign(S[t], { hp: 0, downed: true, downedAt: 0 });
  S[foe].hp = 1e6;
  run(g, R.carryAfterSeconds + 1);
  assert.ok(S[t], 'not carried while an enemy stands close');
  delete S[foe];
  run(g, R.carryAfterSeconds + 0.2);
  assert.equal(S[t], undefined, 'carried off');
  assert.equal(C.player.clinic.length, 1);
  assert.equal(g.clans.crewCount('player'), 1, 'still counts for the cap');
  const ryo = C.player.ryo, cost = Math.round(units.types.thug.price * R.recoverCostShare);
  run(g, units.types.thug.recoverSeconds + 0.5);
  assert.equal(C.player.clinic.length, 0);
  assert.equal(C.player.ryo, ryo - cost, 'paid on leaving');
  const back = Object.values(S).find(e => e.type === 'thug' && e.owner === 'player');
  const clinic = g.clans.clinicOf();
  assert.ok(back && back.hp === back.maxHp && Math.hypot(back.x - clinic.door[0], back.z - clinic.door[1]) < 6, 'walked out at full health');
  assert.equal(back.order.kind, 'follow');
  void hero;
  // broke clans wait until they can pay
  const t2 = g.spawn('thug', 'thug', -2, 1, { owner: 'player' });
  Object.assign(S[t2], { hp: 0, downed: true, downedAt: g.state.tick });
  C.player.ryo = 0;
  run(g, R.carryAfterSeconds + units.types.thug.recoverSeconds + 2);
  assert.equal(C.player.clinic.length, 1, 'waits when broke');
  C.player.ryo = 100;
  run(g, 0.2);
  assert.equal(C.player.clinic.length, 0, 'leaves once paid');
  console.log('carry off ok');
}

// Heal order: hurt crew walk to the clinic, pay per HP, come back healed
{
  const g = newGame(), S = g.state.entities, C = g.state.clans;
  const hero = g.spawn('hero', 'ronin', -9, 17, { owner: 'player' });
  const t = g.spawn('thug', 'thug', -8, 17, { owner: 'player' });
  S[t].hp = 100;
  const ryo = C.player.ryo;
  g.step([{ id: hero, type: 'order', units: [t], kind: 'heal' }]);
  let inside = false;
  for (let i = 0; i < 20 * 20 && !inside; i++) { g.step(); inside = !S[t]; }
  assert.ok(inside, 'walked into the clinic');
  assert.equal(C.player.ryo, ryo - Math.ceil(100 * R.healCostPerHp), 'paid for the missing HP');
  run(g, 100 / R.healPerSecond + 1);
  const back = Object.values(S).find(e => e.type === 'thug');
  assert.ok(back && back.hp === back.maxHp, 'back at full health');
  // full health: heal order does nothing
  g.step([{ id: hero, type: 'order', units: [back.id], kind: 'heal' }]);
  assert.notEqual(back.order.kind, 'heal');
  console.log('heal ok');
}
console.log('clinic tests passed');
