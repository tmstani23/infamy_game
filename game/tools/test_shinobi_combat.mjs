import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { createRewards } from '../src/sim/rewards.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json');
const A = units.models.ninja_leader.abilities;
const make = () => {
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'),
    cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'),
    parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: structuredClone(units) });
  g.clans.addClan('player', { kind: 'ninja' }); g.clans.addClan('rival');
  const spawn = (type, x, z, extra = {}) => g.state.entities[g.spawn(type, type === 'hero' ? 'ninja_leader' : type === 'ninja' ? 'ninja_grunt' : type,
    x, z, { owner: 'player', holdFire: true, order: { kind: 'stop' }, ...extra })];
  return { g, spawn, hero: spawn('hero', -8, 1) };
};
const advance = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
function assassinate(g, hero, target) {
  Object.assign(hero, { hidden: true, hiddenAt: g.state.tick - 80, revealUntil: 0, cooldowns: { F: 0 } });
  g.step([{ id: hero.id, type: 'ability', slot: 'F', target: target.id }]);
}

// Rewards credit the attacking clan, including crew actions; no civilians,
// wildlife, police, guards, friendly units or non-Shinobi clan rewards.
{
  const state = { tick: 0, news: [], casts: [], ryoGains: [], clans: {
    s: { id: 's', kind: 'ninja', renown: 0, ryo: 0 }, r: { id: 'r', kind: 'yakuza', ryo: 0 } } };
  const rewards = createRewards(state, units.rules), attacker = { id: 'a', owner: 's', type: 'ninja' };
  const victim = { id: 'v', owner: 'r', type: 'thug', x: 0, z: 0 };
  rewards.crewExecuted(attacker, victim); assert.equal(state.clans.s.renown, 2);
  for (const v of [{ ...victim, owner: 's' }, { ...victim, guard: true },
    ...['civilian', 'bandit', 'night_brute', 'junsa', 'hero'].map(type => ({ ...victim, type }))]) rewards.crewExecuted(attacker, v);
  rewards.crewExecuted({ ...attacker, owner: 'r' }, { ...victim, owner: 's' });
  assert.equal(state.clans.s.renown, 2); assert.equal(state.clans.r.renown, undefined);
  state.contracts = { active: { s: { kind: 'boss', hero: 'boss', takenAt: 0 } } };
  rewards.leaderDown(attacker, { ...victim, id: 'boss', type: 'hero' });
  assert.equal(state.clans.s.renown, 10, 'combat Renown is paid even with an active boss contract');
  assert.equal(state.clans.s.ryo, 0, 'contract still replaces cash bounty');
}
{
  const { g, hero, spawn } = make();
  const victim = spawn('thug', -7, 1, { owner: 'rival', downed: true, downedAt: 0 });
  const crew = spawn('ninja', -8, 2);
  g.step([{ id: hero.id, type: 'execute', target: victim.id, units: [crew.id] }]);
  advance(g, 100);
  assert.ok(victim.dead, 'crew execution finishes');
  assert.equal(g.state.clans.player.renown, 2, 'actual crew execution awards Renown once');
}
{
  const { g, hero, spawn } = make();
  const crew = spawn('ninja', -9, 1), far = spawn('ninja', -22, 1);
  const indoor = spawn('ninja', -8, 1, { place: g.rooms[0].name });
  const guard = spawn('guard', -9, 2, { guard: true });
  const enemy = spawn('thug', -7, 1, { owner: 'rival' });
  g.step([{ id: hero.id, type: 'ability', slot: 'F', target: enemy.id }]);
  assert.ok(!hero.buffs?.ambush, 'failed Assassinate grants no buff');
  assassinate(g, hero, enemy);
  assert.ok(enemy.downed); assert.equal(g.state.clans.player.renown, 0, 'knockdown is not an execution');
  assert.equal(hero.buffs.ambush.critChance, .2); assert.equal(crew.buffs.ambush.critChance, .2);
  for (const e of [far, indoor, guard]) assert.ok(!e.buffs?.ambush, 'only nearby crew in the same place gain crit');
  const firstEnd = hero.buffs.ambush.until;
  const second = spawn('thug', hero.x + 1, hero.z, { owner: 'rival' });
  assassinate(g, hero, second);
  assert.equal(hero.buffs.ambush.critChance, .2, 'reapplication refreshes rather than stacks');
  assert.ok(hero.buffs.ambush.until > firstEnd);
  advance(g, 161); assert.ok(!hero.buffs?.ambush && !crew.buffs?.ambush, 'crit buff expires');
}
// Actual combat rolls gain additive critical chance for both hero and crew.
for (const type of ['hero', 'ninja']) {
  const { g, hero, spawn } = make();
  const attacker = type === 'hero' ? hero : spawn('ninja', -8, 1);
  const target = spawn('hero', -7, 1, { owner: 'rival', model: 'ronin' });
  target.hp = target.maxHp = 100000;
  attacker.buffs = { ambush: { until: 10000, critChance: .2 } };
  const stats = type === 'hero' ? g.settings.units.models.ninja_leader : g.settings.units.types.ninja;
  stats.critChance = 0;
  let critical = 0, hits = 0;
  for (let i = 0; i < 100; i++) {
    attacker.swing = { start: g.state.tick, strike: g.state.tick, len: 8, target: target.id };
    if (type === 'ninja') attacker.order = { kind: 'attack', target: target.id };
    g.step();
    for (const hit of g.state.hits.filter(h => h.a === attacker.id)) { hits++; if (hit.crit) critical++; }
  }
  assert.ok(hits > 90 && critical > 5 && critical < 40, `${type}: crit buff changes real rolls (${critical}/${hits})`);
  delete attacker.buffs;
  attacker.swing = { start: g.state.tick, strike: g.state.tick, len: 8, target: target.id };
  g.step(); assert.equal(g.state.hits.find(h => h.a === attacker.id)?.crit, false, 'crit chance returns to base');
}
{
  const { g, hero, spawn } = make();
  const inside = spawn('hero', -4.1, 1, { owner: 'rival', model: 'ronin' });
  const outside = spawn('hero', -3.8, 1, { owner: 'rival', model: 'ronin' });
  assert.equal(A.E.snareRadius, units.types.hero.abilities.E.radius);
  g.step([{ id: hero.id, type: 'ability', slot: 'E', x: -8, z: 1 }]);
  assert.equal(inside.buffs?.snared?.speed, .5); assert.ok(!outside.buffs?.snared);
  advance(g, 60); assert.ok(!inside.buffs?.snared, 'snare lasts 3 seconds');
}
function smokeFixture() {
  const f = make(), { g, hero, spawn } = f;
  const crew = spawn('ninja', -9, 1), far = spawn('ninja', -16, 1);
  const rival = spawn('hero', -6, 1, { owner: 'rival', model: 'ronin' });
  g.step([{ id: hero.id, type: 'ability', slot: 'R' }]);
  hero.hiddenAt = null;
  const until = g.state.smokes[0].until;
  while (g.state.tick <= until) g.step();
  return { ...f, crew, far, rival };
}
{
  const { g, hero, crew, far, rival } = smokeFixture();
  assert.ok(!g.state.smokes); assert.ok(g.stealth.veiled(hero) && g.stealth.veiled(crew));
  assert.ok(!g.stealth.veiled(far), 'units outside the cloud gain no veil');
  assert.equal(A.R.fadeSeconds, 4);
  assert.equal(hero.buffs.veil.until - (g.state.tick - 1), 80, 'exactly four seconds after mechanical cloud expiry');
  g.stealth.reveal(hero); assert.ok(hero.hidden, 'incoming reveal ignored');
  // Area damage can still hurt a veiled ninja, without revealing him.
  const before = hero.hp;
  g.step([{ id: rival.id, type: 'ability', slot: 'Q', x: hero.x, z: hero.z }]);
  advance(g, 5);
  assert.ok(hero.hp < before, 'veil does not prevent damage');
  assert.ok(hero.hidden && g.stealth.veiled(hero), 'damage cannot reveal the veil');
  const until = hero.buffs.veil.until;
  while (g.state.tick <= until) g.step();
  assert.ok(!hero.hidden && !g.stealth.veiled(hero), 'nearby enemies detect normally after four seconds');
}
{
  const { g, hero, crew, rival } = smokeFixture();
  assert.equal(hero.hiddenAt, null, 'smoke did not satisfy ordinary hiding timer');
  const hp = rival.hp;
  g.step([{ id: hero.id, type: 'ability', slot: 'F', target: rival.id }]);
  assert.ok(rival.hp < hp && hero.cooldowns.F > g.state.tick, 'Assassinate immediately usable in the window');
  assert.ok(!g.stealth.veiled(hero) && !hero.hidden, 'Assassinate consumes only attacker veil');
  assert.ok(g.stealth.veiled(crew) && crew.hidden);
}
{
  const { g, hero, crew, rival } = smokeFixture();
  let hit = false;
  g.step([{ id: hero.id, type: 'order', kind: 'attack', target: rival.id, units: [crew.id] }]);
  for (let i = 0; i < 30 && !hit; i++) { g.step(); hit = g.state.hits.some(h => h.a === crew.id); }
  assert.ok(hit && !g.stealth.veiled(crew) && !crew.hidden, 'crew attack consumes its own veil');
  assert.ok(g.stealth.veiled(hero) && hero.hidden, 'crew attacking does not reveal hero');
}
console.log('Shinobi combat: Renown, executions, crit recipients/rolls/expiry, snare radius, smoke veil/expiry/damage and immediate Assassinate ok');
