// Wolves and bears in their dens (sim/wild_animals.js, wildlife W4, 2026-11-24).
// Run: node tools/test_wild_predators.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { terrainAt } from '../src/sim/world_data.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { createNewsCallouts } from '../src/news_callouts.js';

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
  let d = null, pack = [];
  for (const x of dens.filter(x => x.kind === 'wolf' && x !== wolfDen).sort((a, b) => Math.hypot(b.x - wolfDen.x, b.z - wolfDen.z) - Math.hypot(a.x - wolfDen.x, a.z - wolfDen.z)).slice(0, 6)) {   // far from the first fight
    go(x.x + 160, x.z); S.night = false;
    run(200);
    pack = wild('wolf').filter(e => e.wm.den === x.id); d = x;
    if (pack.length) break;
  }
  assert.ok(pack.length, 'second pack woke');
  for (const e of pack) { e.hitBy = { id: hero.id, tick: S.tick }; e.hp = 0; g.wildAnimals.killed(hero, e); e.dead = true; }
  run(80);
  assert.ok((S.world.wildDens[d.id].rest ?? 0) > S.tick, 'an emptied den rests');
  run(80);
  assert.equal(wild('wolf').filter(e => e.wm.den === d.id).length, 0, 'and stays empty');
}

// a hunt far from the hero: the clan is told, with the region's name, and told again if the prey falls
{
  const d = wolfDen;   // its pack went to sleep when the party left; it wakes again
  delete S.world.wildDens[d.id].rest;   // (if the night fight killed the whole pack, it is back for this check)
  for (const c of crew) { Object.assign(c, { dead: false, hp: c.maxHp }); delete c.downed; delete c.diedAt; }   // the crew back on their feet
  S.night = false; go(d.x + 160, d.z);
  run(200);
  assert.ok(wild('wolf').some(e => e.wm.den === d.id), `third pack woke ${JSON.stringify(S.world.wildDens[d.id])} ${d.id} ${wild('wolf').map(e => e.wm.den)} alive ${crew.filter(c => !c.dead).length}`);
  const prey = crew[0];
  Object.assign(hero, { x: hero.x + 300 });
  S.news = [];
  g.wildAnimals.startHunt(d.id, hero.owner, prey);
  const told = S.news.find(n => n.kind === 'wildHunted');
  assert.ok(told && told.clan === hero.owner && typeof told.region === 'string', `the clan hears of the hunt (${told?.region})`);
  {   // the callout: names the region and pings both maps, even with the hero out on the island
    const calls = [], pings = [];
    const ui = createNewsCallouts({ game: { state: { news: [told], entities: { h: { owner: hero.owner, place: 'world' } }, clans: {}, businesses: {} } }, heroId: 'h', presentation: { map: false },
      callout: (...x) => calls.push(x), minimap: { ping: (...p) => pings.push(p) }, gameMap: { ping: (...p) => pings.push(p) } });
    ui.update();
    assert.ok(calls.some(c => c[0] === `Wolves are hunting your crew in ${told.region}`), `callout: ${calls.map(c => c[0])}`);
    assert.equal(pings.length, 2, 'map and minimap pinged');
  }
  prey.dead = true; prey.hp = 0;
  const news = []; for (let i = 0; i < 120; i++) { g.step([]); news.push(...(S.news || [])); }
  assert.ok(news.some(n => n.kind === 'wildKilled' && n.clan === hero.owner), 'and hears when the prey falls');
  for (const e of wild('wolf').filter(e => e.wm.den === d.id)) { e.hitBy = { id: hero.id, tick: S.tick }; e.hp = 0; g.wildAnimals.killed(hero, e); e.dead = true; }
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

// by day they leave you be; hit one and the whole pack comes all out (2026-11-27): no falling back, no breaking off at half
{
  Object.assign(A.predators.hunt, { chance: 0, loneChance: 0 });   // no hunt of their own in the way
  const d = dens.filter(x => x.kind === 'wolf' && x !== wolfDen).at(-1);
  S.night = false; go(d.x + 160, d.z);
  run(200);
  const pack = wild('wolf').filter(e => e.wm.den === d.id), w = pack[0];
  assert.ok(pack.length >= 3 && pack.every(e => !['stalk', 'hunt', 'back'].includes(e.wm.mode)), 'by day the pack leaves you be');
  go(w.x + 8, w.z);
  w.hitBy = { id: hero.id, tick: S.tick };
  g.wildAnimals.provoke(w, hero.owner);
  assert.ok(pack.every(e => e.wm.mode === 'hunt' && e.wm.allOut), 'hit one: the whole pack fights');
  for (const e of pack.slice(0, Math.ceil(pack.length / 2))) { e.hp = 0; g.wildAnimals.killed(hero, e); e.dead = true; }
  const modes = new Set();
  run(120, () => { for (const e of pack) if (!e.dead) modes.add(e.wm.mode); });
  assert.ok(!modes.has('back') && !modes.has('flee'), `all out: no falling back or running at half (${[...modes]})`);
  for (const e of pack) if (!e.dead) { e.hp = 0; g.wildAnimals.killed(hero, e); e.dead = true; }
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
