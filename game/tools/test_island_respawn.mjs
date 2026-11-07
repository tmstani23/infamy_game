// Tim 2026-11-06: knocked out on the island, the hero and his crew come round at the clan's nearest
// town hall at low health (units.json rules.islandRespawn); Hero-group crew follow him again.
// Without a town the hero wakes by the island side of the city gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), U = data('data/units.json');
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier };
const R = U.rules.islandRespawn, DT = 1 / 20;
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 77 });
const hero = g.state.entities[m.heroId], clan = g.state.clans.player;
assert.ok(g.islandRespawn, 'campaign games have island respawn');
const knockOut = () => { Object.assign(hero, { dead: true, hp: 0 }); hero.diedAt = g.state.tick - Math.ceil(U.rules.heroRespawnSeconds / DT) - 1; };

// --- no town yet: the hero wakes by the gate on the island, not back in the city -------------------
const [gx, gz] = g.gate.island;
Object.assign(hero, { place: 'world', x: gx + 40, z: gz });
knockOut();
g.step([]);
assert.ok(!hero.dead && hero.place === 'world', `hero up on the island (${hero.place})`);
assert.ok(Math.hypot(hero.x - gx, hero.z - gz) < 15, 'beside the gate');
assert.ok(Math.abs(hero.hp - hero.maxHp * R.hpShare) < 2, `low health (${hero.hp})`);

// --- two towns: he wakes at the nearer hall ---------------------------------------------------------
const sites = (world.sites || []).slice(0, 12);
const add = (id, s) => g.frontier.world.addTown({ id, name: id, owner: 'player', x: s.x, z: s.z, pop: 3, stock: {}, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const near = sites[0], far = sites.reduce((a, b) => Math.hypot(b.x - near.x, b.z - near.z) > Math.hypot(a.x - near.x, a.z - near.z) ? b : a);
add('tNear', near); add('tFar', far);
Object.assign(hero, { place: 'world', x: near.x + 60, z: near.z + 60 });
knockOut();
g.step([]);
assert.ok(!hero.dead && hero.place === 'world');
assert.ok(Math.hypot(hero.x - near.x, hero.z - near.z) < 40, `at the nearer hall (${Math.round(Math.hypot(hero.x - near.x, hero.z - near.z))} away)`);

// --- Hero-group crew downed on the island come round at the hall, at low health, following him ---------
const id = g.spawn('thug', 'thug', hero.x + 2, hero.z, { owner: 'player', place: 'world', hp: 100, order: { kind: 'follow', target: hero.id } });
const thug = g.state.entities[id];
assert.equal(thug.deployment?.group, 'hero', 'a follower joins the Hero group');
assert.ok(g.clans.carryOff(thug), 'carried off');
delete g.state.entities[id];
const r = clan.respawning.find(x => x.island);
assert.ok(r && r.town === 'tNear', 'queued at the nearer town');
for (let t = 0; t < Math.ceil(R.crewSeconds / DT) + 2; t++) g.islandRespawn.tick(DT, U.types);
assert.ok(!clan.respawning.some(x => x.island), 'came round');
const back = Object.values(g.state.entities).find(e => e.owner === 'player' && e.type === 'thug' && e.place === 'world');
assert.ok(back, 'back on the island');
assert.ok(Math.hypot(back.x - near.x, back.z - near.z) < 40, 'at the hall');
assert.equal(back.hp, Math.round(U.types.thug.hp * R.hpShare), 'low health');
assert.equal(back.deployment.group, 'hero');
assert.equal(back.order?.kind, 'follow'); assert.equal(back.order.target, hero.id);

// --- city crew still use the city rules -------------------------------------------------------------
const cid = g.spawn('thug', 'thug', 0, 0, { owner: 'player', place: 'street', hp: 100 });
const before = clan.respawning.filter(x => x.island).length;
g.clans.carryOff(g.state.entities[cid]);
assert.equal(clan.respawning.filter(x => x.island).length, before, 'street crew not sent to a town');

console.log('island respawn: ok');

// --- an infirmary in the town: come round there at full health; units near it heal faster (Tim 2026-11-06) -------
{
  const town = g.state.frontier.settlements.tNear;
  g.step([]);   // the town gets its grid
  const cell = town.grid.use.split('').findIndex((c, i) => c === '.' && i !== 0);
  town.buildings.push({ id: 'inf1', type: 'infirmary', cell, stage: 'built' });
  const [ix, iz] = g.frontier.infirmary.centre(town, town.buildings.at(-1));
  Object.assign(hero, { place: 'world', x: near.x + 60, z: near.z + 60 });
  knockOut();
  g.step([]);
  assert.ok(!hero.dead && Math.hypot(hero.x - ix, hero.z - iz) < 25, 'up at the infirmary');
  assert.ok(hero.hp >= hero.maxHp - 1, `full health (${hero.hp})`);
  assert.match(clan.notice?.text || '', /infirmary/);
  for (let i = 0; i < 10; i++) g.step([]);
  assert.equal(hero.infirmary, frontier.buildings.infirmary.infirmary.healFactor, 'heals faster near it');
  Object.assign(hero, { x: ix + 200, z: iz });
  for (let i = 0; i < 10; i++) g.step([]);
  assert.equal(hero.infirmary, undefined, 'not when far away');
  console.log('island respawn infirmary: ok');
  // no governor figure any more (Tim 2026-11-07): Space at your town hall talks to its governor
  for (let i = 0; i < 20; i++) g.step([]);
  assert.ok(!Object.values(g.state.entities).some(e => e.governor), 'no governor figure in the town');
  Object.assign(hero, { place: 'world', x: near.x + 5, z: near.z, dead: false });
  assert.equal(g.governorNear(hero.id)?.governor, 'tNear', 'Space by the hall talks to its governor');
  Object.assign(hero, { x: near.x + 60 });
  assert.equal(g.governorNear(hero.id), null, 'not from far away');
  console.log('town governor: ok');
}
