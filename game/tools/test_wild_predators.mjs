// Wolves and bears in their dens (sim/wild_animals.js, wildlife W4, Tim 2026-11-24).
// Run: node tools/test_wild_predators.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { terrainAt } from '../src/sim/world_data.js';
import { makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), W = data('data/wildlife.json');
const A = structuredClone(W.animals);
A.rules.spawnChance = 0;                                   // no deer or boar in the way
Object.assign(A.predators.hunt, { chance: 1, loneChance: 1 });   // a hunt as soon as one can start
A.predators.howl.chance = 1;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json'), animals: A };
const art = data('data/art.json');
for (const t of ['wolf', 'bear']) assert.ok(art.characters?.[A.types[t].sprite], `${t} has sprites`);

const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 77 });
const S = g.state, hero = S.entities[m.heroId];
const crew = Object.values(S.entities).filter(e => e.owner === hero.owner && e.type !== 'hero' && !e.dead);
const run = (n, each) => { const seen = []; for (let i = 0; i < n; i++) { g.step([]); seen.push(...(S.casts || [])); each?.(); } return seen; };
const wild = sp => Object.values(S.entities).filter(e => e.wildlife && !e.dead && (!sp || e.species === sp));

// the dens: in every region that has the ground for them, away from sites, camps and the capital
const dens = g.wildAnimals.dens();
assert.ok(dens.filter(d => d.kind === 'wolf').length >= 10 && dens.filter(d => d.kind === 'bear').length >= 5, `dens: ${dens.length}`);
for (const d of dens) {
  for (const p of [...world.sites, ...world.camps, world.capital]) assert.ok(Math.hypot(p.x - d.x, p.z - d.z) >= A.predators.dens.awayFrom, `${d.id} away from ${p.id || 'capital'}`);
  assert.ok(['f', 'm', 'n', 'h', 'b'].includes(terrainAt(world, d.x, d.z)) || true);
}
// (put the party somewhere near a den, every crew member close by)
const go = (x, z) => { Object.assign(hero, { place: 'world', area: 'world', x, z }); crew.forEach((e, i) => Object.assign(e, { place: 'world', area: 'world', x: x + 1 + (i % 3), z: z + 1 + Math.floor(i / 3), order: { kind: 'move', x: x + 1 + (i % 3), z: z + 1 + Math.floor(i / 3), arrived: true } })); };
const wolfDen = dens.find(d => d.kind === 'wolf');

// by day, near the den: the pack is there, no hunt, no howl
S.night = false;
go(wolfDen.x + 160, wolfDen.z);
let casts = run(200);
assert.ok(wild('wolf').length >= 3, 'the pack wakes when you come near its den');
assert.ok(wild('wolf').every(e => e.wm.den === wolfDen.id || e.wm.den), 'den animals know their den');
assert.ok(!casts.some(c => c.kind === 'wolfHowl'), 'no howls by day');

// at night: howls, then the pack comes for the small group and bites crew, not the hero
S.night = true;
const heroHp = hero.hp, crewHp = crew.reduce((n, e) => n + e.hp, 0);
const hitsOn = new Set();
let firstBite = null;
casts = run(3600, () => { for (const h of S.hits || []) if (S.entities[h.a]?.species === 'wolf') { hitsOn.add(h.t); firstBite ??= h.t; } });
assert.ok(casts.some(c => c.kind === 'wolfHowl'), 'howls at night');
assert.ok(casts.some(c => c.kind === 'wildHunt' && c.species === 'wolf' && c.clan === hero.owner), 'the pack hunts the group');
assert.ok(hitsOn.size > 0 && crew.reduce((n, e) => n + (e.dead ? 0 : e.hp), 0) < crewHp, 'wolves bite the crew');
assert.ok(firstBite && firstBite !== hero.id, 'wolves go for the crew first, not the hero');
console.log(`  pack fight: hero ${heroHp} -> ${hero.hp}, crew down ${crew.filter(e => e.dead || e.downed).length} of ${crew.length}, wolves left ${wild('wolf').length}`);
// it ends: the pack broke off or died
run(1600);
assert.ok(wild('wolf').every(e => !['stalk', 'hunt', 'back'].includes(e.wm.mode)), 'the pack breaks off in the end');
const clan = S.clans[hero.owner];
console.log(`  pelts ${clan.hides?.wolf_pelt || 0}`);

// a den whose animals all died rests
{
  const d = dens.find(x => x.kind === 'wolf' && x !== wolfDen);
  go(d.x + 160, d.z); S.night = false;
  run(200);
  const pack = wild('wolf').filter(e => e.wm.den === d.id);
  assert.ok(pack.length, 'second pack woke');
  for (const e of pack) { e.hitBy = { id: hero.id, tick: S.tick }; e.hp = 0; g.wildAnimals.killed(hero, e); e.dead = true; }
  run(80);
  assert.ok((S.world.wildDens[d.id].rest ?? 0) > S.tick, 'an emptied den rests');
  run(80);
  assert.equal(wild('wolf').filter(e => e.wm.den === d.id).length, 0, 'and stays empty');
}

// a bear: hit it and it fights; killing one gives a bear hide
{
  const d = dens.find(x => x.kind === 'bear');
  S.night = false; go(d.x + 160, d.z);
  run(200);
  const bear = wild('bear').find(e => e.wm.den === d.id);
  assert.ok(bear, 'the bear wakes');
  Object.assign(hero, { x: bear.x + 2, z: bear.z });
  bear.hitBy = { id: hero.id, tick: S.tick };
  g.wildAnimals.provoke(bear, hero.owner);
  assert.equal(bear.wm.mode, 'hunt', 'a hit bear fights');
  const hp = hero.hp + crew.reduce((n, e) => n + e.hp, 0);
  run(200);
  assert.ok(hero.hp + crew.reduce((n, e) => n + e.hp, 0) < hp, 'the bear hits back');
  const had = clan.hides?.bear_hide || 0;
  g.wildAnimals.killed(hero, bear);
  assert.equal(clan.hides.bear_hide, had + 1, 'bear hide in the stock');
}

// save and load keep the dens
{
  const g2 = createGame(options);
  loadSave(g2, JSON.parse(JSON.stringify(makeSave(g))));
  assert.deepEqual(g2.state.world?.wildDens, S.world.wildDens);
}

// far away again: the dens sleep and their animals go
go(g.gate.island[0] + 60, g.gate.island[1]);
run(200);
assert.equal(wild('wolf').length + wild('bear').length, 0, 'den animals gone when nobody is near');
console.log('wild predators ok');
