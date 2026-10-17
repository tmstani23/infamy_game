// Checks the clinic menu and fighting townsfolk in the sim: node game/tools/test_clinic_townsfolk.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { unitStatus, unitName } from '../src/selection_panel.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json'), R = units.rules, civData = data('data/civilians.json'), heat = R.civilianHeat;
const newGame = () => {
  const g = createGame({
    district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units, civilians: civData,
  });
  g.clans.addClan('player'); g.clans.addClan('kuroda', { bot: true, aggression: 1 });
  return g;
};
const run = (g, s, cmds = []) => { g.step(cmds); for (let i = 1; i < s * 20; i++) g.step(); };

// The clinic has a menu door ring; Space ('use') there moves nobody
{
  const g = newGame(), S = g.state.entities, C = g.state.clans;
  const door = g.doors.find(d => d.menu === 'clinic');
  assert.ok(door, 'clinic door ring');
  // every street ring sits out in the open, clear of walls and building footprints
  for (const d of g.doors.filter(d => d.label !== 'Leave'))
    assert.ok(!g.blockers.some(b => d.x > b.minX && d.x < b.maxX && d.z > b.minZ && d.z < b.maxZ), `ring at ${d.x},${d.z} is clear`);
  const hero = g.spawn('hero', 'ronin', door.x, door.z, { owner: 'player' });
  assert.equal(g.doorNear(hero)?.menu, 'clinic');
  g.step([{ id: hero, type: 'use' }]);
  assert.equal(S[hero].place, 'street');

  // Revive now: a carried-off thug walks out at once for reviveNowCostShare of the price
  C.player.clinic.push({ unit: 'thug', model: 'thug', kind: 'recover', left: 30, cost: 15, hp: 0 });
  const ryo = C.player.ryo, cost = Math.round(units.types.thug.price * R.reviveNowCostShare);
  g.step([{ id: hero, type: 'clinic', action: 'revive', patient: 0 }]);
  assert.equal(C.player.clinic.length, 0);
  assert.equal(C.player.ryo, ryo - cost, 'paid the revive price');
  const back = Object.values(S).find(e => e.type === 'thug' && e.owner === 'player')?.id;
  assert.ok(back && S[back].hp === S[back].maxHp && S[back].order.kind === 'follow', 'out and following');
  // broke: stays in
  C.player.clinic.push({ unit: 'thug', model: 'thug', kind: 'recover', left: 30, cost: 15, hp: 0 });
  C.player.ryo = 0;
  g.step([{ id: hero, type: 'clinic', action: 'revive', patient: 0 }]);
  assert.equal(C.player.clinic.length, 1, 'cannot afford it');

  // Heal: the hero and nearby crew to full, paid per HP; far crew are left out
  C.player.ryo = 1000;
  const far = g.spawn('thug', 'thug', door.x + 20, door.z, { owner: 'player' });
  S[hero].hp = S[hero].maxHp - 100; S[back].hp = 50; S[far].hp = 50;
  const want = Math.ceil((100 + S[back].maxHp - 50) * R.healCostPerHp);
  g.step([{ id: hero, type: 'clinic', action: 'heal' }]);
  assert.equal(S[hero].hp, S[hero].maxHp);
  assert.equal(S[back].hp, S[back].maxHp);
  assert.ok(S[far].hp < S[far].maxHp, 'far crew not healed');
  assert.equal(C.player.ryo, 1000 - want, 'paid per HP');
  // only at the clinic door
  S[hero].x += 10; S[hero].hp = 10;
  g.step([{ id: hero, type: 'clinic', action: 'heal' }]);
  assert.ok(S[hero].hp < 20, 'not away from the door');
  console.log('clinic menu ok');
}

// Townsfolk: nobody picks fights with them, but an order to attack one works; they run
// when hit, go down at 0 HP, and the same execute kills them. Heat for each step.
{
  const g = newGame(), S = g.state.entities, C = g.state.clans;
  const id = g.civilians.add('merchant', -8, 1);
  assert.equal(S[id].hp, civData.rules.hp);
  const hero = g.spawn('hero', 'ronin', -9.2, 1, { owner: 'player' });
  const bot = g.spawn('thug', 'thug', -6.8, 1, { owner: 'kuroda', order: { kind: 'station', x: -6.8, z: 1 } });
  run(g, 2);
  assert.equal(S[id].hp, S[id].maxHp, 'no auto attacks on townsfolk');
  delete S[bot];
  S[id].hp = 1e4; S[id].maxHp = 1e4;
  g.step([{ id: hero, type: 'attack', target: id }]);
  let first = null;
  for (let i = 0; i < 20 * 6 && first === null; i++) { g.step(); if (g.state.hits.some(h => h.t === id)) first = g.state.tick; }
  assert.ok(first !== null, 'the hero hits a townsperson when told to');
  assert.equal(C.player.heat, heat.hit, 'heat for a hit');
  assert.deepEqual(g.state.heatGains, [{ clan: 'player', amount: heat.hit, reason: 'Assault' }], 'a notice for it');
  g.step();
  assert.ok(S[id].flee && !S[id].scared, 'runs at once, no freezing');
  assert.equal(unitStatus(S[id], g.state), 'Running away');
  assert.equal(unitName(units, 'old_woman'), 'Old woman');
  // goes down at 0 HP
  S[id].hp = 1; S[id].maxHp = civData.rules.hp;
  let down = false;
  for (let i = 0; i < 20 * 10 && !down; i++) { g.step(); down = !!S[id].downed; }
  assert.ok(down, 'downed');
  assert.equal(C.player.heat, heat.hit * 2 + heat.down, 'heat for downing');
  // bots never finish townsfolk off
  const bot2 = g.spawn('thug', 'thug', S[id].x + 1, S[id].z, { owner: 'kuroda' });
  run(g, 1.5);
  assert.ok(!S[bot2].execute, 'bots leave townsfolk alone');
  delete S[bot2];
  // the same execute kills them
  g.step([{ id: hero, type: 'execute', target: id }]);
  let dead = false;
  const gains = [];
  for (let i = 0; i < 20 * 10 && !dead; i++) { g.step(); gains.push(...g.state.heatGains); dead = !!S[id]?.dead; }
  assert.ok(dead, 'executed');
  assert.equal(C.player.heat, heat.hit * 2 + heat.down + heat.kill, 'heat for a kill');
  assert.deepEqual(gains, [{ clan: 'player', amount: heat.kill, reason: 'Townsperson killed' }], 'a notice for the kill');
  // heat cools, a new townsperson of the same kind comes out later
  const h0 = C.player.heat;
  run(g, R.heatCoolSeconds * 3 + 0.1);
  assert.ok(C.player.heat <= h0 - 3 && C.player.heat >= h0 - 4, 'heat cools');
  run(g, civData.rules.replaceSeconds + 1);
  assert.ok(Object.values(S).some(e => e.type === 'civilian' && e.civ === 'merchant'), 'a new merchant walked out');
  console.log('townsfolk fight ok');
}

// Crew attack a townsperson on order; a downed one left alone is helped home
{
  const g = newGame(), S = g.state.entities, C = g.state.clans;
  const hero = g.spawn('hero', 'ronin', -30, 1, { owner: 'player' });
  const t = g.spawn('thug', 'thug', -10, 1, { owner: 'player' });
  const id = g.civilians.add('laborer', -8, 1);
  g.step([{ id: hero, type: 'order', units: [t], kind: 'attack', target: id }]);
  let hits = 0;
  for (let i = 0; i < 20 * 12 && !S[id]?.downed; i++) { g.step(); hits += g.state.hits.filter(h => h.a === t && h.t === id).length; }
  assert.ok(hits > 0 && S[id].downed, 'crew chase and down a townsperson');
  assert.ok(C.player.heat > 0);
  S[t].x = -40;
  run(g, R.carryAfterSeconds + 1);
  assert.equal(S[id], undefined, 'helped home');
  console.log('crew vs townsfolk ok');
}
// Only the player's own crew go to the clinic and come back from it: downed enemies left
// alone are taken away, never listed, never walk out of the clinic
{
  const g = newGame(), S = g.state.entities, C = g.state.clans;
  const hero = g.spawn('hero', 'ronin', -30, 1, { owner: 'player' });
  const mine = g.spawn('thug', 'thug', -2, 1, { owner: 'player' });
  const foe = g.spawn('thug', 'thug', 2, 1, { owner: 'kuroda' });
  const civ = g.civilians.add('merchant', 4, 1);
  for (const id of [mine, foe, civ]) Object.assign(S[id], { hp: 0, downed: true, downedAt: 0 });
  run(g, R.carryAfterSeconds + 1);
  assert.ok(!S[mine] && !S[foe] && !S[civ], 'all three carried away');
  assert.equal(C.player.clinic.length, 1, 'our crew member is in the clinic');
  assert.equal(C.kuroda.clinic.length, 0, 'enemies never are');
  C.player.ryo = 1000;
  run(g, units.types.thug.recoverSeconds + 1);
  const out = Object.values(S).filter(e => e.type === 'thug');
  assert.equal(out.length, 1, 'only one walks out');
  assert.ok(out[0].owner === 'player' && out[0].order?.kind === 'follow' && out[0].order.target === hero, 'ours, following the hero');
  console.log('clinic only for our crew ok');
}
// Bystanders only flinch briefly before running (Tim: the scared clip was too long), and a
// runner jammed in a crowd gives up instead of pushing on
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -9.2, 1, { owner: 'player' });
  const victim = g.civilians.add('merchant', -8, 1), near = g.civilians.add('geisha', -7, 2);
  g.step([{ id: hero, type: 'attack', target: victim }]);
  let scaredAt = null;
  for (let i = 0; i < 60 && scaredAt === null; i++) { g.step(); if (S[near].scared) scaredAt = g.state.tick; }
  assert.ok(scaredAt !== null, 'the bystander flinches');
  let ticks = 0;
  while (S[near].scared && ticks < 60) { g.step(); ticks++; }
  assert.ok(ticks <= civData.rules.scaredSeconds * 20 + 1 && S[near].flee, 'short flinch, then runs');
  // jammed: stuck in place for a second ends the run
  const j = g.civilians.add('laborer', -20, 1);
  S[j].flee = { x: -20 + 12, z: 1, until: g.state.tick + 200 };
  for (let i = 0; i < 30; i++) { S[j].x = -20; S[j].z = 1; g.step(); }
  assert.ok(!S[j].flee, 'a jammed runner stops');
  console.log('flinch and jam ok');
}
// Doors: selected crew go in with the hero, the rest stay outside; all come out with him
{
  const g = newGame(), S = g.state.entities;
  const door = g.doors.find(d => d.label === 'Enter the Teahouse');
  const hero = g.spawn('hero', 'ronin', door.x, door.z, { owner: 'player' });
  const a = g.spawn('thug', 'thug', door.x + 1, door.z + 1, { owner: 'player', order: { kind: 'follow', target: hero } });
  const b = g.spawn('thug', 'thug', door.x - 1, door.z + 1, { owner: 'player', order: { kind: 'follow', target: hero } });
  const far = g.spawn('thug', 'thug', door.x + 30, door.z, { owner: 'player' });
  const [bx, bz] = [S[b].x, S[b].z];
  g.step([{ id: hero, type: 'use', units: [a, far] }]);
  assert.equal(S[hero].place, door.place);
  assert.equal(S[a].place, door.place, 'selected crew came in');
  assert.ok(Math.hypot(S[a].x - S[hero].x, S[a].z - S[hero].z) < 4, 'next to the hero');
  assert.ok(!g.blockers.some(k => S[a].x > k.minX && S[a].x < k.maxX && S[a].z > k.minZ && S[a].z < k.maxZ), 'not in a wall');
  assert.equal(S[b].place, 'street', 'unselected crew stay out');
  assert.equal(S[far].place, 'street', 'selected but far away: stays');
  run(g, 2);
  assert.ok(Math.hypot(S[b].x - bx, S[b].z - bz) < 0.5, 'and wait where they were');
  // out again: the one inside comes too
  const exit = g.doors.find(d => d.label === 'Leave' && d.to.x === door.x && d.to.z === door.z);
  S[hero].x = exit.x; S[hero].z = exit.z;
  g.step([{ id: hero, type: 'use' }]);
  assert.equal(S[hero].place, 'street');
  assert.equal(S[a].place, 'street', 'came out with the hero');
  assert.equal(S[a].order.kind, 'follow');
  console.log('crew through doors ok');
}
console.log('clinic and townsfolk tests passed');
