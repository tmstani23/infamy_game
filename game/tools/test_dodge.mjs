import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json');
function fixture(type = 'hero', chance = .15) {
  const u = structuredClone(units);
  u.rules.regenPerSecond = 0;
  if (type === 'hero') u.models.ninja_leader.dodgeChance = chance;
  else u.types[type].dodgeChance = chance;
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'),
    cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'),
    parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: u });
  g.clans.addClan('player', { kind: 'ninja' }); g.clans.addClan('rival');
  const target = g.state.entities[g.spawn(type, type === 'hero' ? 'ninja_leader' : u.types[type].sprite, -7, 1,
    { owner: 'player', holdFire: true, order: { kind: 'stop' } })];
  const attacker = g.state.entities[g.spawn('hero', 'ronin', -8, 1, { owner: 'rival', holdFire: true })];
  target.hp = target.maxHp = 100000;
  g.step(); // populate both clans' vision before forcing strike ticks
  // a spawned ninja starts hidden; reveal it and let stealth update once, or the first forced strike can't see him
  target.revealUntil = g.state.tick + 200; g.step();
  const strike = () => {
    target.revealUntil = g.state.tick + 200;
    attacker.swing = { start: g.state.tick, strike: g.state.tick, len: 8, target: target.id };
    g.step();
    return g.state.dodges.some(d => d.a === attacker.id && d.t === target.id);
  };
  return { g, target, attacker, strike };
}
assert.equal(units.models.ninja_leader.dodgeChance, .15);
for (const type of ['ninja', 'ninja_tanto']) assert.equal(units.types[type].dodgeChance, .15);
for (const type of ['hero', 'thug', 'brute', 'swordsman', 'junsa']) assert.ok(!units.types[type].dodgeChance);
for (const type of ['hero', 'ninja', 'ninja_tanto']) {
  const { g, target, strike } = fixture(type);
  let dodges = 0, damage = 0;
  for (let i = 0; i < 400; i++) {
    const before = target.hp, hitAt = target.hitAt;
    if (strike()) {
      dodges++;
      assert.equal(target.hp, before, 'dodge prevents damage');
      assert.equal(target.hitAt, hitAt, 'dodge is not a hit or regeneration interruption');
      assert.equal(g.state.hits.length, 0, 'no impact/crit/lifesteal event for a miss');
    } else {
      assert.equal(g.state.hits.length, 1);
      damage += g.state.hits[0].damage;
    }
  }
  assert.ok(dodges >= 35 && dodges <= 85, `${type}: seeded dodge frequency near 15% (${dodges}/400)`);
  assert.equal(target.hp, target.maxHp - damage);
}
{
  const a = fixture(), b = fixture();
  assert.deepEqual(Array.from({ length: 80 }, a.strike), Array.from({ length: 80 }, b.strike), 'identical seeds replay identical dodge outcomes');
}
{
  const { g, target, attacker, strike } = fixture('hero', 1);
  g.state.clans.rival.kind = 'ninja';
  attacker.hp = attacker.maxHp - 100;
  attacker.buffs = { lantern: { until: 1000, damage: 1.5, lifesteal: .2 }, veil: { until: 1000 } };
  attacker.hidden = true;
  const before = attacker.hp;
  assert.ok(strike());
  assert.equal(attacker.hp, before, 'dodged attacks provide no lifesteal');
  assert.ok(!g.stealth.veiled(attacker), 'attempting a dodged attack still ends the attacker veil');
  g.step(); assert.equal(g.state.dodges.length, 0, 'dodge events last one sim tick');
  g.step([{ id: attacker.id, type: 'ability', slot: 'Q', x: target.x + 3, z: target.z }]);
  let dashed = g.state.hits.some(h => h.t === target.id && h.kind === 'dash');
  for (let i = 0; i < 6; i++) { g.step(); dashed ||= g.state.hits.some(h => h.t === target.id && h.kind === 'dash'); }
  assert.ok(dashed, 'Iaido Dash damage bypasses even 100% weapon dodge');
}
for (const slot of ['Q', 'F']) {
  const { g, target, attacker } = fixture('ninja', 1);
  attacker.model = 'ninja_leader';
  Object.assign(attacker, { hidden: true, hiddenAt: -100, revealUntil: 0 });
  target.revealUntil = 1000;
  const hp = target.hp;
  g.step([{ id: attacker.id, type: 'ability', slot, target: target.id, x: target.x, z: target.z }]);
  assert.ok(target.hp < hp, `${slot}: direct Shinobi ability bypasses dodge`);
  assert.equal(g.state.dodges.length, 0);
}
{
  const { g, target, attacker } = fixture('ninja', 1);
  target.hp = 0; target.downed = true; target.downedAt = g.state.tick;
  g.step([{ id: attacker.id, type: 'execute', target: target.id }]);
  for (let i = 0; i < 62; i++) g.step();
  assert.ok(target.dead, 'executions bypass dodge');
  assert.equal(g.state.dodges.length, 0);
}
console.log('Dodge: 15% on all Shinobi, seeded weapon misses, no damage/hit/lifesteal effects, one-tick events and direct abilities/executions bypass ok');
