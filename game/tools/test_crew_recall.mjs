import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));

function fixture(kind, smoke = false) {
  const units = data('data/units.json');
  // These checks exercise actual hits during retreat without dodge obscuring them.
  units.types.ninja.dodgeChance = 0;
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'),
    cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'),
    parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units });
  g.clans.addClan('player', { kind }); g.clans.addClan('rival');
  const S = g.state.entities;
  const hero = S[g.spawn('hero', kind === 'ninja' ? 'ninja_leader' : 'ronin', -8, 1, { owner: 'player', holdFire: true })];
  const type = kind === 'ninja' ? 'ninja' : 'thug';
  const crew = [-7, -7.5].map((x, i) => S[g.spawn(type, units.types[type].sprite, x, 1 + i * .5,
    { owner: 'player', hp: 10000, maxHp: 10000, order: { kind: 'follow', target: hero.id } })]);
  const enemy = S[g.spawn('hero', 'ronin', -2, 1, { owner: 'rival', holdFire: true, hp: 10000, maxHp: 10000 })];
  g.step();
  if (smoke) g.step([{ id: hero.id, type: 'ability', slot: 'R' }]);
  g.step([{ id: hero.id, type: 'attack', target: enemy.id, assist: true, units: crew.map(e => e.id) }]);
  for (let i = 0; i < 25; i++) g.step();
  assert.equal(crew[0].order.kind, 'attack', 'setup: selected crew pursue the hero target');
  return { g, hero, crew, enemy };
}

for (const kind of ['yakuza', 'ninja']) for (const order of ['move', 'follow']) {
  const { g, hero, crew: [a, b], enemy } = fixture(kind);
  a.swing = { start: g.state.tick, strike: g.state.tick + 2, len: 9, target: enemy.id };
  enemy.swing = { start: g.state.tick, strike: g.state.tick, len: 9, target: a.id };
  const hp = a.hp;
  g.step([{ id: hero.id, type: 'order', kind: order, units: [a.id], x: hero.x, z: hero.z }]);
  assert.equal(a.order.kind, order);
  assert.ok(!a.swing, 'recall immediately cancels the old attack windup');
  assert.ok(!hero.assistCrew.includes(a.id), 'old hero target cannot overwrite the recall');
  assert.ok(hero.assistCrew.includes(b.id) && b.order.kind === 'attack', 'unselected crew retain their attack');
  assert.ok(a.hp < hp, 'an actual incoming hit lands during retreat');
  let retaliated = false;
  for (let i = 0; i < 65; i++) {
    g.step();
    retaliated ||= g.state.hits.some(h => h.a === a.id);
  }
  assert.ok(!retaliated, 'retreat hits do not restart the old fight, including after arrival');
  assert.equal(a.order.kind, order);
  assert.ok(Math.hypot(a.x - hero.x, a.z - hero.z) < 2.2, `${kind} ${order}: crew reach their formation within its arrival tolerance`);
  assert.ok(!a.order.regrouping, 'Follow finishes its return phase');
  if (order === 'move') assert.ok(a.order.arrived);
  assert.ok(!a.smokePassive && !a.holdFire, 'ordinary recall grants no lasting smoke passivity');
  // A new deliberate attack still recruits this unit normally.
  g.step([{ id: hero.id, type: 'attack', target: enemy.id, assist: true, units: [a.id] }]);
  assert.equal(a.order.kind, 'attack');
  assert.ok(hero.assistCrew.includes(a.id));
}

for (const order of ['move', 'follow']) {
  const { g, hero, crew: [a, b], enemy } = fixture('ninja', true);
  const cloud = g.state.smokes[0];
  assert.ok(Math.hypot(a.x - cloud.x, a.z - cloud.z) > cloud.r, 'setup: attacking ninja chased outside the cloud');
  enemy.swing = { start: g.state.tick, strike: g.state.tick, len: 9, target: a.id };
  g.step([{ id: hero.id, type: 'order', kind: order, units: [a.id], x: hero.x, z: hero.z }]);
  while (g.state.tick <= cloud.until) g.step();
  assert.ok(a.smokePassive && g.stealth.veiled(a), 'recalled crew make it back inside before expiry and gain passive Vanish');
  assert.ok(!b.smokePassive, 'unrecalled crew outside at expiry do not gain passivity');
}
{
  const { g, hero, crew: [a], enemy } = fixture('yakuza');
  g.step([{ id: hero.id, type: 'order', kind: 'move', units: [a.id], x: hero.x, z: hero.z }]);
  for (let i = 0; i < 40; i++) g.step();
  assert.ok(a.order.arrived);
  Object.assign(enemy, { x: a.x + .8, z: a.z });
  enemy.swing = { start: g.state.tick, strike: g.state.tick, len: 9, target: a.id };
  g.step();
  let defended = false;
  for (let i = 0; i < 35; i++) { g.step(); defended ||= g.state.hits.some(h => h.a === a.id); }
  assert.ok(defended, 'a fresh assault after arrival still permits normal defense outside smoke');
}
console.log('Crew recall: both clans cancel attacks on Move/Follow, ignore retreat hits, detach selected assistance, reach goals and preserve Smoke expiry rules');
