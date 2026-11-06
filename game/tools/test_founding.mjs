// Frontier E2 + E3 + E4: settlers are hired at the Land Office in a campaign (E1 2026-11-05: no longer at HQ), and five of them with the hero
// found a town on buildable ground. Bad spots change nothing. A founded town survives save/load,
// its traits change its output, and its economy runs the same whether or not anyone is near.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { terrainAt } from '../src/sim/world_data.js';
import { townSlot } from '../src/sim/frontier/town_layout.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier });
function match(mode) {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
  return { g, hero: g.state.entities[m.heroId], clan: g.state.clans.player };
}
const U = data('data/units.json');

// --- E2: price, campaign only, not crew ------------------------------------------------
{
  const cl = match('classic');
  assert.equal(cl.g.clans.hirePrice('player', 'settler'), null, 'no settlers in Classic');
}
const { g, hero, clan } = match('campaign');
assert.equal(g.clans.hirePrice('player', 'settler'), U.types.settler.price);
const hq = Object.values(g.state.businesses).find(b => b.kind === 'hideout' && b.owner === 'player');
hero.place = hq.room;
g.step([{ id: hero.id, type: 'hire', business: hq.id, unit: 'settler' }]);
assert.equal(clan.queue.length, 0, 'E1: no settlers at HQ any more');
const office = Object.values(g.state.businesses).find(b => b.kind === 'land_office');
Object.assign(hero, { place: 'street', x: office.ring[0], z: office.ring[1] });
const crewBefore = g.clans.crewCount('player'), ryoBefore = clan.ryo;
for (let i = 0; i < 5; i++) g.step([{ id: hero.id, type: 'hire', business: office.id, unit: 'settler' }]);
assert.equal(clan.queue.length, 5);
assert.equal(clan.ryo, ryoBefore - 5 * U.types.settler.price, 'flat price each');
assert.equal(g.clans.hirePrice('player', 'settler'), U.types.settler.price, 'price does not climb');
for (let i = 0; i < 1300 && (clan.settlersWaiting || 0) < 5; i++) g.step([]);
assert.equal(clan.settlersWaiting, 5, 'settlers wait safely at the HQ (Tim 2026-11-06)');
assert.equal(g.clans.settlersOf('player').length, 0, 'no settler units in the city');
assert.equal(g.clans.crewCount('player'), crewBefore, 'settlers are not crew');
// the gate turns them into units beside the hero (test_land_office); here they are placed directly
clan.settlersWaiting = 0;
for (let i = 0; i < 5; i++) g.spawn('settler', U.types.settler.sprite, hero.x + 1 + i * 0.6, hero.z + 1, { owner: 'player', hp: U.types.settler.hp, holdFire: true });
const settlers = g.clans.settlersOf('player');
assert.equal(settlers.length, 5);
assert.equal(g.clans.crewOf('player').filter(u => u.type === 'settler').length, 0);
for (const u of settlers) u.order = { kind: 'follow', target: hero.id };
assert.ok(!settlers[0].deployment, 'settlers are outside the deployment groups');
// Regression (Tim 2026-11-05): right-clicking with settlers and crew selected while deployment rules are on
// must not crash ("u.deployment is undefined"); settlers count as the hero group.
{
  const restricted = g.state.deployment.restrictionsEnabled;
  g.state.deployment.restrictionsEnabled = true;
  const units = [...settlers.map(u => u.id), ...g.clans.crewOf('player').map(u => u.id)];
  for (const kind of ['move', 'follow', 'stop']) g.step([{ id: hero.id, type: 'order', place: hero.place, units, kind, x: hero.x + 3, z: hero.z + 3, target: hero.id }]);
  g.state.deployment.restrictionsEnabled = restricted;
  for (const u of settlers) u.order = { kind: 'follow', target: hero.id };
}

// --- E3: where it is allowed -------------------------------------------------------------
const spot = (pred) => { for (let z = 100; z < world.size.h; z += 50) for (let x = 100; x < world.size.w; x += 50) if (pred(x, z)) return [x, z]; };
const far = (x, z) => Math.hypot(x - world.capital.x, z - world.capital.z) > 1500;
const plain = spot((x, z) => far(x, z) && [-100, 0, 100].every(d => terrainAt(world, x + d, z) === 'p' && terrainAt(world, x, z + d) === 'p'));
const mountain = spot((x, z) => far(x, z) && terrainAt(world, x, z) === 'm');
assert.ok(plain && mountain, 'test spots exist');
const put = (x, z, n = settlers.length) => {
  Object.assign(hero, { x, z, place: 'world' });
  settlers.forEach((u, i) => Object.assign(u, { x: x + 1 + i * 0.5, z: z + 1, place: 'world', dead: i >= n }));
};
const snap = () => JSON.stringify([Object.keys(g.state.frontier.settlements), clan.ryo, Object.values(g.state.entities).filter(u => u.type === 'settler' && !u.dead).length]);
const found = () => { g.step([{ id: hero.id, type: 'frontier', action: 'found' }]); return g.state.frontier.receipts.find(r => r.action === 'found'); };
const rejected = (why, re) => { const before = snap(), r = found(); assert.ok(r && !r.ok && re.test(r.reason), `${why}: ${r?.reason}`); assert.equal(snap(), before, `${why}: nothing changed`); };

put(plain[0], plain[1]);                         rejected('no permit', /founding permit/);
clan.permit = true;   // E1: bought at the Land Office (tools/test_land_office.mjs)
put(plain[0], plain[1], 4);                      rejected('too few settlers', /at least 5/);
put(mountain[0], mountain[1]);                   rejected('unbuildable ground', /cannot be built/);
put(world.capital.x + 200, world.capital.z - 300); rejected('next to the capital', /capital/);
put(plain[0], plain[1]); clan.ryo = 100;         rejected('no money', /500 ryo/);
clan.ryo = 5000;
hero.place = 'street';                           rejected('not on the island', /out on the island/);

// --- E3: the real thing --------------------------------------------------------------------
put(plain[0], plain[1]);
const towns = Object.keys(g.state.frontier.settlements).length, ryo0 = clan.ryo, ids = settlers.map(u => u.id);
const ok = found();
assert.ok(ok?.ok, ok?.reason);
const fr = g.state.frontier, town = Object.values(fr.settlements).find(s => s.founded !== undefined);
assert.equal(Object.keys(fr.settlements).length, towns + 1, 'exactly one settlement');
assert.ok(ids.every(id => !g.state.entities[id]), 'exactly those settlers are gone');
assert.equal(clan.ryo, ryo0 - frontier.founding.cost);
assert.equal(clan.permit, false, 'the permit is used up');
assert.equal(town.foundedTick, g.state.tick - 1, 'grace counts from founding');
assert.equal(town.owner, 'player'); assert.equal(town.pop, 5); assert.equal(town.x, Math.round(plain[0]+frontier.townGrid.cellSize*2));
assert.ok(Math.abs(hero.x-town.x)>frontier.townGrid.cellSize/2,'legacy founding commands also leave the hero outside the hall');
assert.ok(town.traits.soil >= 1 && town.traits.soil <= 3 && town.traits.water >= 1 && town.traits.defense >= 1, 'traits computed');
assert.deepEqual(town.buildings.map(b => b.type), ['town_hall']); assert.equal(town.housing, 6);
assert.deepEqual(town.projects, [], 'founding leaves the next construction choice to the player');
assert.equal((town.workerTraining?.length || 0) + (town.workers?.length || 0), frontier.founding.startWorkers, 'economy pass 2: new towns start with free workers');
assert.ok(town.grid && town.roadReserve === 1, 'new town reserves a one-cell road ring');
assert.ok(town.stock.ryo >= frontier.workers.cost, 'starter stock can train the first worker');
assert.equal(town.buildings[0].cell, (town.grid.n * town.grid.n - 1) / 2, 'town hall takes the centre cell');
assert.notDeepEqual(townSlot(0), townSlot(1)); assert.equal(new Set([...Array(40).keys()].map(i => townSlot(i).join())).size, 40, 'slots are all different');
g.frontier.world.checkInvariants();
// a second town too close to the first is refused
const after = snap(); put(plain[0] + 400, plain[1]);
hero.owner = 'player'; settlers.forEach(u => { u.dead = false; g.state.entities[u.id] = u; }); clan.permit = true;
const r2 = found(); assert.ok(r2 && !r2.ok && /Too close to/.test(r2.reason), r2?.reason);
// Tim 2026-11-06: the capital keeps only capitalSpacing (600), not the 1600 between towns
{
  const C = world.capital, gap = frontier.founding.capitalSpacing, at = (dx, dz) => { put(C.x + dx, C.z + dz); return g.frontier.founding.check(hero, undefined, { x: C.x + dx, z: C.z + dz }).reason || ''; };
  assert.ok(gap < frontier.founding.minSpacing, 'capital gap is the smaller one');
  assert.match(at(-(gap - 100), 0), /Too close to the capital/);
  for (const [dx, dz] of [[-(gap + 150), 0], [0, gap + 150], [0, -(gap + 150)]]) assert.doesNotMatch(at(dx, dz), /capital/, `${dx},${dz} is far enough from the capital`);
}

// --- save / load keeps the town -----------------------------------------------------------
{
  const file = JSON.parse(JSON.stringify(makeSave(g, { bots: [] })));
  const g2 = createGame(options());
  loadSave(g2, file);
  const t2 = g2.state.frontier.settlements[town.id];
  assert.equal(t2?.name, town.name); assert.deepEqual(t2.traits, town.traits); assert.equal(t2.owner, 'player');
  g2.frontier.world.checkInvariants();
}

// --- E4: traits change output --------------------------------------------------------------
{
  const mk = (traits) => {
    const gg = createGame({ ...options() });
    const w = gg.frontier.world;
    w.addTown({ id: 'tx', name: 'X', region: null, owner: 'player', x: 3000, z: 3000, site: null, traits, pop: 8, stock: { food: 500, timber: 100 },
      buildings: [{ type: 'town_hall' }, { type: 'farm' }, { type: 'lumber_camp' }] });
    for (let i = 0; i < 200; i++) gg.step([]);
    return gg.state.frontier.settlements.tx;
  };
  const good = mk({ soil: 3, water: 2, defense: 2, nodes: { forest: 3 } }), poor = mk({ soil: 1, water: 2, defense: 2, nodes: {} });
  assert.ok(good.stock.food > poor.stock.food, `soil: ${good.stock.food} vs ${poor.stock.food}`);
  assert.ok(good.stock.timber > poor.stock.timber, `forest nodes: ${good.stock.timber} vs ${poor.stock.timber}`);
}

// --- a founded town with no timber and no camp is never stuck: people forage ---
{
  const gg = createGame(options());
  gg.frontier.world.addTown({ id: 'tf', name: 'F', region: null, owner: 'player', x: 3000, z: 3000, site: null, traits: { soil: 2, water: 2, defense: 2, nodes: {} },
    pop: 6, stock: { food: 100 }, buildings: [{ type: 'town_hall' }] });
  for (let i = 0; i < 1000; i++) gg.step([]);
  const t = gg.state.frontier.settlements.tf;
  assert.ok(t.stock.timber > 0 && t.stock.timber <= frontier.forage.cap + 1e-6, `foraged timber ${t.stock.timber}`);
  gg.frontier.world.checkInvariants();
}

console.log('test_founding: ok');
