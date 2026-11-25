// Deer and boar on the island (sim/wild_animals.js, wildlife W3, Tim 2026-11-24).
// Run: node tools/test_wild_animals.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { terrainAt } from '../src/sim/world_data.js';
import { makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), W = data('data/wildlife.json');
const A = structuredClone(W.animals);
A.rules.spawnChance = 1;   // every look round spawns, so the test is quick
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json'), animals: A };

// the data: every species lives somewhere, every animal type has its sprite and clips
const art = data('data/art.json');
for (const [k, sp] of Object.entries(A.species)) {
  assert.ok(sp.predator || Object.values(sp.habitat).some(v => v > 0), `${k} lives somewhere`);   // wolves and bears live in dens (W4)
  for (const t of [sp.lead, sp.rest]) { assert.ok(A.types[t], `${k}: type ${t}`); assert.ok(art.characters?.[A.types[t].sprite], `${t} has sprites`); }
}

const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 77 });
const hero = g.state.entities[m.heroId], S = g.state;
const animals = () => Object.values(S.entities).filter(e => e.wildlife && !e.dead);
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
// a forest spot well away from the gate, towns and camps
const [gx, gz] = g.gate.island;
let spot = null;
for (let z = 200; z < world.size.h - 200 && !spot; z += 50) for (let x = 200; x < world.size.w - 200 && !spot; x += 50) {
  if (Math.hypot(x - gx, z - gz) < 600 || (world.camps || []).some(c => Math.hypot(c.x - x, c.z - z) < 250) || (world.sites || []).some(c => Math.hypot(c.x - x, c.z - z) < 250)) continue;
  let n = 0; for (let dz = -100; dz <= 100; dz += 25) for (let dx = -100; dx <= 100; dx += 25) n += terrainAt(world, x + dx, z + dz) === 'f';
  if (n > 70) spot = [x, z];
}
assert.ok(spot, 'a deep forest to stand in');
const crew = Object.values(S.entities).filter(e => e.owner === hero.owner && e.type !== 'hero');
for (const e of [hero, ...crew]) Object.assign(e, { place: 'world', area: 'world', x: spot[0] + (e === hero ? 0 : 1), z: spot[1] });
for (const e of crew) e.order = { kind: 'move', x: e.x, z: e.z, arrived: true };
run(400);
let list = animals();
console.log('animals', list.length, Object.entries(list.reduce((n, e) => (n[e.type] = (n[e.type] || 0) + 1, n), {})).join(' '));
assert.ok(list.length > 0, 'animals come round the hero');
assert.ok(list.length <= A.rules.maxTotal);
for (const e of list) {
  const d = Math.hypot(e.x - hero.x, e.z - hero.z);
  assert.ok(d > 20 && d < A.rules.despawnDistance, `out of sight but near: ${d.toFixed(0)}`);
  assert.equal(e.owner, 'wildlife');
}
// they live their lives: grazing, walking about near home
run(300);
assert.ok(animals().some(e => e.wm.mode === 'graze' || e.wm.mode === 'walk' || e.anim === 'graze'), 'grazing and wandering');

const deer = animals().find(e => e.species === 'deer');
// walk up to a deer: it runs
const target = deer || animals()[0];
Object.assign(hero, { x: target.x + 4, z: target.z });
run(10);
assert.equal(target.wm.mode, 'flee', 'a person close by makes it run');
const from = [target.x, target.z];
run(60);
assert.ok(Math.hypot(target.x - from[0], target.z - from[1]) > 8, 'it ran off');
assert.ok(!crew.some(c => Object.values(S.entities).some(e => e.wildlife && c.attackTarget === e.id)), 'crew leave calm animals alone');

// a gunshot far off scares them too
{
  const e = animals().find(a => a.wm.mode !== 'flee');
  assert.ok(e, 'a calm animal');
  const far = animals().filter(a => a !== e && Math.hypot(a.x - e.x, a.z - e.z) > 60 && a.wm.mode !== 'flee');
  // the shot is heard on the next look round (every few ticks), and only in earshot
  for (let i = 0; i < 5 && e.wm.mode !== 'flee'; i++) { S.casts = [{ kind: 'rifleshot', x: e.x + 20, z: e.z, place: 'world' }]; g.wildAnimals.tick(); S.tick++; }
  assert.equal(e.wm.mode, 'flee', 'a gunshot in earshot makes it run');
  assert.ok(far.every(a => a.wm.mode !== 'flee' || Math.hypot(a.x - hero.x, a.z - hero.z) < 20), 'out of earshot they keep grazing');
}

// a boar that is hit charges the clan that hit it, then runs
{
  let boar = animals().find(e => e.species === 'boar');
  if (!boar) {
    const id = g.spawn('boar', 'boar', hero.x + 30, hero.z, { owner: 'wildlife', wild: true, wildlife: true, species: 'boar', place: 'world', area: 'world', wm: { mode: 'idle', until: S.tick + 999, home: [hero.x + 30, hero.z] } });
    boar = S.entities[id];
  }
  Object.assign(hero, { x: boar.x + 1.5, z: boar.z });
  hero.hitAt = null;
  g.wildAnimals.provoke(Object.assign(boar, { hitBy: { id: hero.id, tick: S.tick } }), hero.owner);
  assert.equal(boar.wm.mode, 'charge');
  const hp = hero.hp;
  run(60);
  assert.ok(hero.hp < hp || crew.some(c => c.hp < c.maxHp), 'the boar bites');
  run(A.species.boar.charge.seconds * 20 + 20);
  assert.notEqual(boar.wm.mode, 'charge', 'then it gives up');
}

// a kill: the hide goes to the clan, news flies it to the hero
{
  const e = animals().find(a => a.species === 'deer') || animals()[0];
  const sp = A.species[e.species];
  Object.assign(hero, { x: e.x + 1, z: e.z });
  e.hp = 1;
  e.hitBy = { id: hero.id, tick: S.tick };
  const clan = S.clans[hero.owner], had = clan.hides?.[sp.drop] || 0;
  hero.attackTarget = e.id; hero.attackMode = true;
  let news = [];
  for (let i = 0; i < 200 && !e.dead; i++) { Object.assign(hero, { x: e.x + 1, z: e.z }); e.hp = Math.min(e.hp, 1); g.step([]); news.push(...(S.casts || [])); }
  assert.ok(e.dead, 'killed');
  assert.equal(clan.hides[sp.drop], had + 1, 'hide in the clan stock');
  assert.ok(news.some(n => n.kind === 'wildDrop' && n.hero === hero.id && n.item === sp.drop), 'the hide flies to the hero');
  assert.ok(!e.gearItem, 'no gear rolled off an animal');
}

// a deer can be run down: chased off again and again it tires, then stands spent and the hero lands his blows (Tim 2026-11-24)
{
  const e = animals().find(a => a.species === 'deer' && !a.dead);
  if (e) {
    Object.assign(hero, { x: e.x + 4, z: e.z });
    for (const c of crew) Object.assign(c, { x: e.x + 300, z: e.z + 300, order: { kind: 'move', x: e.x + 300, z: e.z + 300, arrived: true } });
    g.step([{ type: 'attack', id: hero.id, target: e.id }]);
    for (let i = 0; i < 2400 && !e.dead; i++) g.step([]);
    assert.ok(e.dead, `the hero runs a deer down (hp left ${e.hp})`);
  }
}

// save and load keep the animals and their minds
{
  const save = makeSave(g), g2 = createGame(options);
  loadSave(g2, JSON.parse(JSON.stringify(save)));
  const a = animals(), b = Object.values(g2.state.entities).filter(e => e.wildlife && !e.dead);
  assert.equal(b.length, a.length);
  assert.deepEqual(b.map(e => e.wm.mode).sort(), a.map(e => e.wm.mode).sort());
}

// selling hides (W5): Space at the built market of an own town sells all the clan has taken, and the coins fly in
{
  const clan = S.clans[hero.owner];
  S.frontier ||= {}; S.frontier.settlements ||= {};
  const town = { id: 'hide_test', name: 'Test Town', owner: hero.owner, x: hero.x + 30, z: hero.z, grid: { n: 5, cell: 10 }, buildings: [{ type: 'market', stage: 'built', cell: 12 }] };
  S.frontier.settlements.hide_test = town;
  clan.hides = { deer_hide: 2, bear_gall: 1 };
  const P = A.market.prices, want = 2 * P.deer_hide + P.bear_gall;
  assert.equal(g.wildAnimals.sellPrompt(hero), null, 'no prompt away from the market');
  Object.assign(hero, { x: town.x + 3, z: town.z });
  assert.ok(g.wildAnimals.sellPrompt(hero)?.text.includes(`${want} ryo`), 'the prompt names the price');
  const ryo = clan.ryo;
  S.casts = [];
  assert.ok(g.wildAnimals.sell(hero), 'sold');
  assert.equal(clan.ryo, ryo + want, 'ryo to the treasury');
  assert.deepEqual(clan.hides, {}, 'the hides are gone');
  assert.ok(S.casts.some(c => c.kind === 'hidesSold' && c.loot.ryo === want), 'the coins fly into the market');
  assert.ok(!g.wildAnimals.sell(hero), 'nothing left to sell');
  town.buildings[0].stage = 'planned'; clan.hides = { wolf_pelt: 1 };
  assert.equal(g.wildAnimals.sellPrompt(hero), null, 'only a built market buys');
  delete S.frontier.settlements.hide_test; clan.hides = {};
}

// wild horses (W6): creep up on foot and catch her (no rope); she joins the clan with her whistle and keeps her coat
{
  for (const c of crew) Object.assign(c, { x: hero.x + 200, z: hero.z + 200, order: { kind: 'move', x: hero.x + 200, z: hero.z + 200, arrived: true } });
  Object.assign(hero, { anim: 'idle' });
  const ids = g.wildAnimals.place('horse', hero.x + 12, hero.z);
  assert.ok(ids.length >= 3, `a herd (${ids.length})`);
  const mare = S.entities[ids[ids.length - 1]];
  assert.ok(['wild_mare', 'wild_stallion'].includes(mare.type), mare.type);
  assert.equal(g.wildAnimals.catchPrompt(hero), null, 'too far to throw');
  for (const id of ids) S.entities[id].wm.mode = 'idle';
  Object.assign(hero, { x: mare.x + 2, z: mare.z });
  assert.ok(g.wildAnimals.catchPrompt(hero)?.text.includes('Catch'), 'Space catches her');
  const coats = Object.fromEntries(ids.map(id => [id, S.entities[id].coat])), clan = S.clans[hero.owner], had = (clan.whistles || []).length;
  S.casts = [];
  g.step([{ type: 'catchHorse', id: hero.id }]);
  const caught = ids.find(id => !S.entities[id] || S.entities[id].dead);
  assert.ok(caught, 'one of the herd is caught');
  assert.equal(clan.whistles.length, had + 1, 'with her own whistle');
  const mine = S.entities[clan.whistles.at(-1).horse];
  assert.ok(mine?.type === 'horse' && mine.horseOwner === hero.owner && /_saddled$/.test(mine.horseKind), 'she is the clan\'s horse now');
  assert.deepEqual(mine.coat, coats[caught], 'and keeps her coat');
  assert.ok(S.casts.some(c => c.kind === 'horseCaught' && c.t === caught), 'the catch shows');
  // a running hero on foot scares the herd off
  const rest = ids.map(id => S.entities[id]).filter(e => e && !e.dead);
  if (rest.length) {
    const h = rest[0]; h.wm.mode = 'idle';
    Object.assign(hero, { x: h.x + 10, z: h.z, anim: 'run' });
    for (let i = 0; i < 10; i++) { hero.anim = 'run'; g.step([]); }
    assert.equal(h.wm.mode, 'flee', 'a running hero makes the herd bolt');
    hero.anim = 'idle';
  }
  for (const e of rest) Object.assign(e, { dead: true, hp: 0 });   // out of the way of the checks below
}

// nobody of yours near: they go
Object.assign(hero, { x: gx + 60, z: gz }); for (const e of crew) Object.assign(e, { x: gx + 61, z: gz, order: { kind: 'move', x: gx + 61, z: gz, arrived: true } });
run(200);
assert.ok(animals().every(e => Math.hypot(e.x - hero.x, e.z - hero.z) < A.rules.despawnDistance), 'far animals are gone');
assert.ok(animals().every(e => Math.hypot(e.x - gx, e.z - gz) > A.rules.awayFrom.gate - A.rules.wander), `none by the city gate (they may wander a little from where they came on) ${JSON.stringify(animals().filter(e => Math.hypot(e.x - gx, e.z - gz) <= A.rules.awayFrom.gate).map(e => [e.type, Math.round(Math.hypot(e.x - gx, e.z - gz)), e.wm?.mode]))}`);
console.log('wild animals ok');
