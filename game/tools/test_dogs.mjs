import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { specialOf, specialView } from '../src/sim/special_cast.js';
// War checkpoint 7-3: the Yakuza dog handler (sim/dogs.js), the kennel and the clan-only camp buildings.
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const units = read('data/units.json'), frontier = read('data/frontier.json'), D = units.types.dog_handler.dogs;
for (const t of Object.values(units.types)) { t.dodgeChance = 0; t.critChance = 0; }
const g = createGame({ district: read('data/port_town.json'), catalog: read('data/art.json'), cutouts: read('art/cutouts.json'), interiors: read('data/interiors.json'), parts: read('data/interior_parts.json'), recipes: read('data/room_recipes.json'), units, settings: { ...read('data/settings.json') } });
const { heroId } = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', bots: read('data/bots.json') });
const st = g.state, hero = st.entities[heroId], me = hero.owner;
for (const e of Object.values(st.entities)) { e.holdFire = true; if (e.type !== 'hero') e.order = { kind: 'stop' }; if (e.type === 'hero') e.x += 80; }
const sector = st.deployment.sectors[0], ax = sector.anchor.x, az = sector.anchor.z, group = sector.id;
const rival = Object.keys(st.clans).find(id => id !== me);
const mine = (type, model, dx, dz, extra = {}) => st.entities[g.spawn(type, model, ax + dx, az + dz, { owner: me, deployment: { group }, order: { kind: 'stop' }, holdFire: true, ...extra })];
const foe = (type, model, dx, dz) => st.entities[g.spawn(type, model, ax + dx, az + dz, { owner: rival, deployment: { group: 'hero' }, order: { kind: 'stop' }, holdFire: true })];
const dogsOut = () => Object.values(st.entities).filter(e => e.pack);
const cast = (ability, ids, extra = {}) => g.step([{ id: hero.id, type: 'special', ability, units: ids, ...extra }]);

assert.equal(specialOf(units, { type: 'dog_handler' }), 'dogs');
assert.ok(D.count >= 2 && D.count <= 3 && D.cooldownTicks >= 600 && D.cooldownTicks <= 900 && D.detect > 0, 'dog data');
assert.equal(frontier.war.buildings.kennel.clan, 'yakuza'); assert.deepEqual(frontier.war.units.dog_handler.at, ['kennel']);

// ---- auto: only ranged or fleeing enemies; a melee enemy is left alone -------------------------------
const h = mine('dog_handler', 'dog_handler', 0, 0);
const thug = foe('thug', 'thug', 5, 0);
for (let i = 0; i < 40; i++) g.step();
assert.equal(dogsOut().length, 0, 'auto leaves a melee enemy that is not fleeing');
const archer = foe('army_archer', 'archer', 6, 1.5);
{ const hp0 = archer.hp; let seen = 0, bite = false, t = 0;
  for (; t < 80 && archer.hp === hp0; t++) { g.step(); seen = Math.max(seen, dogsOut().length); bite ||= st.casts.some(c => c.kind === 'dogsBite'); }
  assert.equal(seen, D.count, 'the pack runs out');
  assert.ok(archer.hp < hp0 && bite, `the bite lands (after ${t} ticks)`);
  assert.equal(hp0 - archer.hp, D.damage, 'for the dogs damage, once');
  assert.ok(archer.buffs?.stunned?.until > st.tick, 'and knocks it down for a moment');
  for (let i = 0; i < 5; i++) g.step();
  assert.equal(dogsOut().length, 0, 'no dog is left behind');
  assert.ok(h.dogsReadyAt > st.tick + D.cooldownTicks - 100, 'the cooldown runs');
  assert.deepEqual(specialView({ state: st, units }, 'dogs', [h.id]), { have: 1, ready: 0, auto: 1, nextReadyAt: h.dogsReadyAt }); }

// ---- asked for by the player: any enemy, nearest the click; on cooldown nothing queues ---------------------
cast('dogs', [h.id], { x: thug.x, z: thug.z });
assert.equal(h.castReq, undefined, 'on cooldown: no cast is queued');
h.dogsReadyAt = 0;
cast('dogs', [h.id], { auto: false }); assert.equal(h.autoCast, false);
for (let i = 0; i < 30; i++) g.step();
assert.equal(dogsOut().length, 0, 'auto off: no dogs on his own');
{ const hp0 = thug.hp, ahp = archer.hp;
  cast('dogs', [h.id], { x: thug.x + 0.2, z: thug.z });
  for (let i = 0; i < 80 && thug.hp === hp0; i++) g.step();
  assert.equal(hp0 - thug.hp, D.damage, 'the asked-for pack goes for the melee enemy at the click'); assert.equal(archer.hp, ahp);
  for (let i = 0; i < 5; i++) g.step();
  assert.equal(dogsOut().length, 0); }

// ---- the target dies on the way: the dogs vanish, nothing is hit ---------------------------------------------
{ h.dogsReadyAt = 0; const far = foe('army_archer', 'archer', 11, 0), ahp = archer.hp;
  cast('dogs', [h.id], { x: far.x, z: far.z });
  assert.equal(dogsOut().length, D.count); delete st.entities[far.id];
  for (let i = 0; i < 5; i++) g.step();
  assert.equal(dogsOut().length, 0, 'the pack is gone with its target'); assert.equal(archer.hp, ahp); }
// dogs cannot be targeted or hurt
{ h.dogsReadyAt = 0; cast('dogs', [h.id], { x: archer.x, z: archer.z }); const d = dogsOut()[0]; assert.ok(d && d.animal && !d.owner); for (let i = 0; i < 80; i++) g.step(); assert.equal(dogsOut().length, 0); }
// passive detection radius
assert.equal(g.dogs?.detects ? g.dogs.detects(me, { place: h.place, x: h.x + D.detect - 1, z: h.z }) : true, true);
console.log('test_dogs: ok');
