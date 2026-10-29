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
// Assassinate scales from current HP for either hero model, including repeated
// hits below the old max-health threshold. Non-hero executions stay covered above.
for (const model of ['ronin', 'ninja_leader']) {
  const { g, hero, spawn } = make();
  const target = spawn('hero', -7, 1, { owner: 'rival', model });
  for (const [before, after] of [[300,150],[180,90],[100,50],[301,151],[1,1],[.5,.5]]) {
    target.hp = before;
    assassinate(g, hero, target);
    assert.equal(target.hp, after, `${model}: ${before} current HP becomes ${after}`);
    assert.ok(!target.dead && !target.downed);
  }
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
  assert.ok(!g.stealth.veiled(hero), 'veil expires after four seconds');
  rival.dir = 3; rival.x = hero.x + 1; rival.z = hero.z;
  advance(g, Math.ceil(g.stealth.rules.suspicionSeconds * 20) + 2);
  assert.equal(hero.hidden, false, 'facing enemy detects after normal suspicion buildup');
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
{
  const { g, hero, crew, far, rival } = smokeFixture();
  assert.equal(crew.order.kind, 'move', 'smoke holds without auto-follow');
  assert.ok(crew.smokePassive && crew.holdFire);
  assert.equal(far.order.kind, 'stop', 'outside crew keep their orders');
  for (const kind of ['follow', 'move']) {
    g.step([{ id: hero.id, type: 'order', kind, units: [crew.id], x: -10, z: 1 }]);
    assert.ok(crew.smokePassive && crew.holdFire, `${kind} preserves passive escort`);
  }
  g.step([{ id: hero.id, type: 'order', kind: 'follow', units: [crew.id] }]);
  advance(g, 85);
  Object.assign(rival, { x: crew.x + .6, z: crew.z, attackTarget: crew.id });
  let foughtBack = false;
  for (let i = 0; i < 45; i++) { g.step(); foughtBack ||= g.state.hits.some(h => h.a === crew.id); }
  assert.ok(!foughtBack && crew.holdFire, 'passivity survives Vanish expiry and incoming attacks');
  g.step([{ id: hero.id, type: 'attack', target: rival.id, assist: true, units: [crew.id] }]);
  assert.ok(!crew.smokePassive && !crew.holdFire, 'explicit hero attack releases selected assistance');
}
{
  const { g, hero, crew } = smokeFixture();
  g.step([{ id: hero.id, type: 'order', kind: 'attackmove', units: [crew.id], x: -6, z: 1 }]);
  assert.ok(!crew.smokePassive && !crew.holdFire, 'attack-move releases passive escort');
}
{
  const { g, hero, spawn } = make();
  const enemy = spawn('hero', -20, 1, { owner: 'rival', model: 'ronin' });
  const far = spawn('ninja', -21, 1, { holdFire: false, order: { kind: 'attack', target: enemy.id } });
  g.step([{ id: hero.id, type: 'ability', slot: 'R' }]);
  assert.equal(far.order.kind, 'attack'); assert.ok(!far.holdFire, 'casting only holds units inside the cloud');
}
{
  const { g, hero, crew, rival, spawn } = smokeFixture();
  g.state.clans.player.bot = true; g.state.clans.player.aggression = 1;
  rival.x = -40;
  const downed = spawn('thug', crew.x + .5, crew.z, { owner: 'rival', downed: true, downedAt: g.state.tick });
  advance(g, 120);
  assert.ok(!downed.dead && !crew.execute, 'passive bot crew never auto-execute');
}
{
  const { g, hero, spawn } = make(), room = g.rooms[0];
  Object.assign(hero, { place: room.name, x: room.exit.x, z: room.exit.z });
  const crew = spawn('ninja', hero.x + .2, hero.z, { place: room.name });
  g.step([{ id: hero.id, type: 'ability', slot: 'R' }]);
  g.step([{ id: hero.id, type: 'use', units: [] }]);
  assert.equal(hero.place, 'street');
  advance(g, 140);
  assert.equal(crew.place, room.name, 'automatic escort cannot pull indoor crew outside');
  assert.ok(crew.smokePassive && !crew.order.exitWithHero);
}
console.log('Smoke escort: scoped regroup, passive movement/retaliation, explicit attack release and indoor/bot safeguards ok');
{
  const { g, hero, spawn } = make();
  const target = spawn('hero', -6, 1, { owner: 'rival', model: 'ronin', hp: 10000, maxHp: 10000 });
  g.step([{ id: hero.id, type: 'ability', slot: 'R' }]);
  const expiry = g.state.smokes[0].until;
  while (g.state.tick < expiry) g.step();
  hero.holdFire = false; hero.attackTarget = target.id;
  hero.swing = { start: g.state.tick, strike: g.state.tick + 3, len: 10, target: target.id };
  g.step();
  assert.ok(hero.holdFire && !hero.attackTarget && !hero.swing, 'Vanish cancels old hero auto-attacks and windups');
  target.attackTarget = hero.id;
  let heroHits = 0;
  for (let i = 0; i < 100; i++) { g.step(); heroHits += g.state.hits.filter(h => h.a === hero.id).length; }
  assert.equal(heroHits, 0, 'hero stays passive through Vanish expiry and incoming attacks');
  g.step([{ id: hero.id, type: 'attack', target: target.id }]);
  assert.ok(!hero.holdFire && hero.attackTarget === target.id, 'new specific attack resumes hero auto-attacks');
}
{
  const { g, hero, spawn } = make();
  g.step([{ id: hero.id, type: 'ability', slot: 'R' }]);
  advance(g, 95);
  const target = spawn('thug', hero.x + .5, hero.z, { owner: 'rival', downed: true, downedAt: g.state.tick });
  g.step([{ id: hero.id, type: 'execute', target: target.id }]);
  const expiry = g.state.smokes[0].until;
  while (g.state.tick <= expiry) g.step();
  assert.ok(hero.execute?.target === target.id, 'automatic Vanish never cancels the hero execute channel');
}
console.log('Vanish: hero old targets/windups and retaliation held until a fresh attack; existing execution remains protected');
