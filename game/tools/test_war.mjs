// F6 war, checkpoint 1: planting the war camp banner is the declaration. One war per town, the
// banner band round the town's build ring, the cooldown after a war, and save/load of war records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { terrainAt } from '../src/sim/world_data.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'), frontier: { ...frontier, dev: true, railways: data('data/railways.json') } });
function match(mode) {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
  return { g, hero: g.state.entities[m.heroId] };
}
const W = frontier.war, dayTicks = Math.round((settings.dayNight.daySeconds + settings.dayNight.nightSeconds) * 20);
assert.ok(W && W.circleRadius === 900 && W.cooldownDays === 6, 'war data block');

const { g, hero } = match('campaign');
const war = g.frontier.war, fw = g.frontier.world;
const rival = Object.keys(g.state.clans).find(c => c !== 'player');
assert.ok(rival, 'a rival clan exists');

// two open plains far from the capital and from each other
const open = (x, z, r) => { for (let dx = -r; dx <= r; dx += 50) for (let dz = -r; dz <= r; dz += 50) if (terrainAt(world, x + dx, z + dz) !== 'p') return false; return true; };
const spots = [];
for (let z = 500; z < world.size.h - 500 && spots.length < 2; z += 50) for (let x = 500; x < world.size.w - 500 && spots.length < 2; x += 50) {
  if (Math.hypot(x - world.capital.x, z - world.capital.z) < 1600 || spots.some(s => Math.hypot(x - s[0], z - s[1]) < 2000)) continue;
  if (open(x, z, 500)) spots.push([x, z]);
}
assert.equal(spots.length, 2, 'test spots exist');
const addTown = (id, owner, [x, z]) => fw.addTown({ id, name: id, region: null, owner, x, z, site: null, traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 5, stock: frontier.founding.startStock, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
const enemy = addTown('enemyTown', rival, spots[0]), mine = addTown('myTown', 'player', spots[1]);
g.step([]);   // the hub gives both towns their grid
const ring = frontier.tiers.list[0].ring, inner = ring + W.band.inner, outer = ring + W.band.outer;
assert.deepEqual(war.band(enemy), [inner, outer], 'Camp tier band 300 to 450');

const put = (x, z) => Object.assign(hero, { x, z, place: 'world' });
war.active();   // old saves get the empty war records on first use
const snap = () => JSON.stringify(g.state.frontier.wars, (k, v) => k === 'workers' ? undefined : v);   // camp workers wake and sleep by themselves
const plant = (town, x, z) => { g.step([{ id: hero.id, type: 'frontier', action: 'plantBanner', town, x, z }]); return g.state.frontier.receipts.find(r => r.action === 'plantBanner'); };
const rejected = (why, re, town, x, z) => { const before = snap(), r = plant(town, x, z); assert.ok(r && !r.ok && re.test(r.reason), `${why}: ${r?.reason}`); assert.equal(snap(), before, `${why}: nothing changed`); };
const ex = enemy.x, ez = enemy.z, mid = (inner + outer) / 2;

put(ex + mid, ez);
rejected('own town', /your own town/, 'myTown', ex + mid, ez);
rejected('capital', /capital/, Object.values(g.state.frontier.settlements).find(s => s.capital).id, ex + mid, ez);
rejected('no such town', /No such town/, 'nowhere', ex + mid, ez);
rejected('no spot', /Choose a spot/, 'enemyTown');
put(ex + inner - 40, ez);
rejected('too close', /Too close/, 'enemyTown', ex + inner - 20, ez);
put(ex + outer + 20, ez);
rejected('too far', /Too far/, 'enemyTown', ex + outer + 20, ez);
put(ex + mid, ez);
rejected('banner far from hero', /too far from the hero/, 'enemyTown', ex, ez + mid);
put(ex + W.circleRadius + 50, ez);
rejected('hero outside the circle', /Come within/, 'enemyTown', ex + W.circleRadius + 40, ez);
put(ex + mid, ez); hero.place = 'street';
rejected('not on the island', /out on the island/, 'enemyTown', ex + mid, ez);
// a crew member cannot plant it
{
  put(ex + mid, ez);
  const before = snap();
  const crew = g.spawn('grunt', 'grunt', hero.x + 1, hero.z, { owner: 'player', place: 'world' });
  const id = typeof crew === 'object' ? crew.id : crew;
  g.step([{ id, type: 'frontier', action: 'plantBanner', town: 'enemyTown', x: ex + mid, z: ez }]);
  assert.equal(snap(), before, 'only a hero plants a banner');
}

// --- the war pack (checkpoint 2) ---------------------------------------------------------
const clan = g.state.clans.player, P = W.pack;
put(ex + mid, ez);
const pack = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.find(r => r.action === c.action); };
// out on open ground: no pot
{ const r = pack({ action: 'warPack', ryo: 100, timber: 200, stone: 100 }); assert.ok(!r.ok && /city or in one of your towns/.test(r.reason), r.reason); assert.equal(clan.warPack, undefined); }
// at the player's own town: everything from its stock
Object.assign(hero, { x: mine.x + 20, z: mine.z, place: 'world' });
fw.change('myTown', 'timber', 1000 - mine.stock.timber, 'test'); fw.change('myTown', 'stone', 500 - mine.stock.stone, 'test'); fw.change('myTown', 'ryo', 900 - mine.stock.ryo, 'test');
{ const r = pack({ action: 'warPack', ryo: 100, timber: P.max.timber + 1, stone: 100 }); assert.ok(!r.ok && /at most/.test(r.reason)); }
{ const r = pack({ action: 'warPack', ryo: 2000, timber: 200, stone: 100 }); assert.ok(!r.ok && /has only/.test(r.reason)); assert.equal(mine.stock.ryo, 900, 'a refusal changes nothing'); }
{ const r = pack({ action: 'warPack', ryo: 600, timber: 400, stone: 200 }); assert.ok(r.ok, r.reason); }
assert.deepEqual([mine.stock.ryo, mine.stock.timber, mine.stock.stone], [300, 600, 300], 'taken from the town');
assert.deepEqual([clan.warPack.ryo, clan.warPack.timber, clan.warPack.stone], [600, 400, 200]);
// in the city: only ryo, from the treasury (timber and stone must reach a town first)
hero.place = 'street';
const ryo0 = clan.ryo;
{ const r = pack({ action: 'warPack', ryo: 600, timber: 500, stone: 200 }); assert.ok(!r.ok && /packed at one of your towns/.test(r.reason), r.reason); assert.equal(clan.ryo, ryo0); }
{ const r = pack({ action: 'warPack', ryo: 700 }); assert.ok(r.ok, r.reason); }
assert.equal(clan.ryo, ryo0 - 100, 'city: 100 more ryo from the treasury');
// lowering returns the newest parts first, each where it came from (even from the city)
{ const r = pack({ action: 'warPack', ryo: 550, timber: 350 }); assert.ok(r.ok, r.reason); }
assert.equal(clan.ryo, ryo0, 'treasury part back to the treasury');
assert.equal(mine.stock.ryo, 350, 'then town ryo back to the town');
assert.equal(mine.stock.timber, 650, 'timber back to the town');
// unpack anywhere puts it all back
{ const r = pack({ action: 'warUnpack' }); assert.ok(r.ok, r.reason); }
assert.equal(clan.warPack, undefined);
assert.deepEqual([mine.stock.ryo, mine.stock.timber, mine.stock.stone], [900, 1000, 500], 'unpack restores the town');
assert.equal(clan.ryo, ryo0);
// pack again for the war
Object.assign(hero, { x: mine.x + 20, z: mine.z, place: 'world' });
{ const r = pack({ action: 'warPack', ryo: 600, timber: 400, stone: 200 }); assert.ok(r.ok, r.reason); }
fw.checkInvariants();

// the real thing
put(ex + mid, ez);
{ const before = snap(); assert.ok(war.check(hero, 'enemyTown', { x: ex + mid, z: ez + 10 }).ok, 'read-only check passes'); assert.equal(snap(), before, 'check changes nothing'); }
const ok = plant('enemyTown', ex + mid, ez + 10);
assert.ok(ok?.ok, ok?.reason);
const rec = war.warOn('enemyTown');
assert.ok(rec && rec.attacker === 'player' && rec.defender === rival && rec.state === 'active' && rec.x === Math.round(ex + mid) && rec.z === Math.round(ez + 10));
assert.match(g.state.clans[rival].notice?.text || '', /declared war on enemyTown/, 'the defender is told');
assert.deepEqual(rec.camp.brought, { ryo: 600, timber: 400, stone: 200 }, 'the pack becomes the camp');
assert.equal(rec.camp.chest, 600); assert.deepEqual(rec.camp.stock, { timber: 400, stone: 200 });
assert.equal(rec.camp.workers.length, W.camp.startWorkers, 'the camp starts with its workers'); assert.equal(rec.camp.buildings[0].type, 'camp_hall');
assert.equal(clan.warPack, undefined, 'the pack is used up');
assert.equal(war.warsAt(ex, ez).length, 1, 'the hall is inside the war circle');
assert.equal(war.warsAt(ex + W.circleRadius + 5, ez).length, 0, 'outside the circle');
assert.equal(war.warsOf(rival).length, 1);
rejected('one war per town', /already at war/, 'enemyTown', ex + mid, ez - 30);

// ---- checkpoint 3: camp workers ----------------------------------------------------------------
{
  const wk = g.frontier.modules.find(m => m.name === 'workers').workers;
  const ringR = frontier.tiers.list[0].ring;
  assert.ok(rec.camp.workers.every(w => typeof w.id === 'string'), 'camp workers are real records');
  const reach = wk.index.spotsNear(enemy.x, enemy.z, W.circleRadius).filter(p => ['timber', 'stone'].includes(frontier.workers.resources[p.kind]) && Math.hypot(p.x - enemy.x, p.z - enemy.z) > ringR);
  assert.ok(reach.length, 'resource spots exist in the war circle outside the build ring');
  const site = wk.siteOf(rec.id);
  assert.ok(site && site.camp && site.owner === 'player', 'the camp is a work site');
  const stock0 = { ...rec.camp.stock }, town0 = { timber: enemy.stock.timber, stone: enemy.stock.stone }, mine0 = { timber: mine.stock.timber, stone: mine.stock.stone };
  for (let i = 0; i < 40; i++) g.step([]);
  assert.ok(rec.camp.workers.some(w => w.spot), 'idle camp workers pick a spot by themselves');
  assert.ok(rec.camp.workers.every(w => !w.spot || reach.some(p => p.id === w.spot)), 'only timber and stone, inside the circle, outside the town ring');
  for (let i = 0; i < 6000; i++) g.step([]);
  const income = rec.camp.workerIncome || {}, gained = r => Math.round((rec.camp.stock[r] - stock0[r]) * 100) / 100;
  assert.ok((income.timber || 0) + (income.stone || 0) > 0, 'camp workers deliver to the camp hall');
  for (const r of ['timber', 'stone']) assert.equal(gained(r), Math.round((income[r] || 0) * 100) / 100, `camp ${r} gain is exactly what the workers carried`);
  assert.ok(!(income.food), 'camp workers never gather food');
  // sealed: a camp never feeds a town (the towns only change by their own workers' deliveries, tracked by their own income)
  const campIds = new Set(rec.camp.workers.map(w => w.id));
  for (const t of [enemy, mine]) assert.ok(!(t.workerLog || []).some(l => campIds.has(l.worker)), `no camp delivery reaches ${t.id}`);
  // hiring: ryo from the war chest only, fixed cap
  const chest0 = rec.camp.chest, n0 = rec.camp.workers.length, treasury0 = clan.ryo;
  g.step([{ id: hero.id, type: 'frontier', action: 'train', town: rec.id, count: 2 }]);
  assert.equal(rec.camp.chest, chest0 - 2 * W.camp.workerCost, 'hired from the war chest');
  assert.equal(rec.camp.workerTraining.length, 2);
  assert.equal(clan.ryo, treasury0, 'clan treasury not touched');
  const before = JSON.stringify(rec.camp.workerTraining);
  g.step([{ id: hero.id, type: 'frontier', action: 'train', town: rec.id, count: W.camp.workerCap }]);
  assert.equal(JSON.stringify(rec.camp.workerTraining), before, 'over the cap is refused');
  g.step([{ id: Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === rival)?.id || 'none', type: 'frontier', action: 'train', town: rec.id, count: 1 }]);
  assert.equal(rec.camp.workerTraining.length, 2, 'only the attacker hires camp workers');
  for (let i = 0; i < frontier.workers.trainTicks * 3; i++) g.step([]);
  assert.equal(rec.camp.workers.length, n0 + 2, 'trained workers join the camp');
  assert.equal(rec.camp.workerTraining.length, 0);
  assert.equal(g.state.frontier.wars.list[rec.id].camp.chest, chest0 - 2 * W.camp.workerCost, 'no wages: the chest is untouched after hiring');
  // fighting rules: camp workers carry the war id as their town
  const at = { place: 'world', area: 'world', holdFire: true, hp: 60 };
  const cw = g.state.entities[g.spawn('civilian', 'farmer', ex + 40, ez, { ...at, worker: 'wx', town: rec.id, workerOwner: 'player' })];
  const heroOf = clanId => { const h = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === clanId); return h && Object.assign(h, { place: 'world', area: 'world', x: ex + 41, z: ez }); };   // set out on the frontier for the check (nothing steps after)
  const defender = heroOf(rival);   // the defending clan's own hero
  assert.ok(defender, 'the rival clan has a hero');
  assert.equal(g.attackAllowed(defender, cw), true, 'the defender can hit camp workers');
  const third = Object.keys(g.state.clans).find(c => c !== 'player' && c !== rival);
  if (third) {
    const other = heroOf(third);
    assert.ok(other, 'a third clan hero exists');
    assert.equal(g.attackAllowed(other, cw), false, 'a third clan cannot hit camp workers');
  }
  delete g.state.entities[cw.id];
  g.frontier.world.checkInvariants();
}

// save and load keep the war
{
  const save = makeSave(g);
  const g2 = createGame(options());
  setupMatch(g2, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
  loadSave(g2, JSON.parse(JSON.stringify(save)));
  assert.deepEqual(g2.frontier.war.warOn('enemyTown'), JSON.parse(JSON.stringify(rec)), 'war survives save/load');
}

// ending a war starts the cooldown
g.step([{ id: hero.id, type: 'frontier', action: 'devEndWar', war: rec.id }]);
assert.equal(war.warOn('enemyTown'), null);
assert.equal(g.state.frontier.wars.history.at(-1).id, rec.id);
assert.equal(typeof g.state.frontier.wars.history.at(-1).camp.workers, 'number', 'history keeps a head count, not worker routes');
for (let i = 0; i < 20; i++) g.step([]);
assert.ok(!Object.values(g.state.entities).some(e => e.worker && e.town === rec.id), 'camp worker units leave with the war');
assert.equal(war.cooldownDays('enemyTown'), W.cooldownDays);
rejected('cooldown', /under truce for 6 more days/, 'enemyTown', ex + mid, ez);
g.state.tick += dayTicks * (W.cooldownDays - 1);
rejected('cooldown last day', /1 more day\b/, 'enemyTown', ex + mid, ez);
g.state.tick += dayTicks;
put(ex + mid, ez);   // no pack: planting still works, the camp starts empty
const again = plant('enemyTown', ex + mid, ez);
assert.ok(again?.ok, `after the cooldown: ${again?.reason}`);
assert.deepEqual(war.warOn('enemyTown').camp.stock, { timber: 0, stone: 0 }, 'no pack: an empty camp');

// several wars at once: a second enemy town
const third = spots[1];
fw.settlement('myTown');   // (the player's own town stays out of it)
const enemy2 = addTown('enemyTown2', rival, [third[0] + 0, third[1] + 1700 > world.size.h ? third[1] - 1700 : third[1] + 1700]);
g.step([]);
put(enemy2.x + mid, enemy2.z);
const second = plant('enemyTown2', enemy2.x + mid, enemy2.z);
if (second?.ok) assert.equal(war.warsOf('player').length, 2, 'two wars at once');
else assert.match(second.reason, /cannot be built|resource/, `second war only blocked by ground: ${second.reason}`);

// Frontier protection (Tim 2026-11-10): heroes and crews may fight anywhere; townsfolk never; a town's
// workers only by the other side of a war on that town
{
  const at = { place: 'world', area: 'world', holdFire: true, hp: 60 };
  const mk = extra => g.state.entities[g.spawn('civilian', 'farmer', hero.x + 3, hero.z, { ...at, ...extra })];
  const warWorker = mk({ worker: 'w1', town: 'enemyTown', workerOwner: rival });
  const quietWorker = mk({ worker: 'w2', town: 'quietTown', workerOwner: rival });
  const folk = mk({ townsfolk: 'enemyTown', seenBy: rival });
  assert.ok(war.warOn('enemyTown'), 'a war is on for the worker check');
  assert.equal(g.attackAllowed(hero, warWorker), true, 'workers of a town you are at war with can be hit');
  assert.equal(g.attackAllowed(hero, quietWorker), false, 'workers of a town with no war are off limits');
  assert.equal(g.attackAllowed(hero, folk), false, 'frontier townsfolk are never fair game');
  const rivalCrew = g.state.entities[g.spawn('grunt', 'grunt', hero.x + 4, hero.z, { place: 'world', area: 'world', owner: rival })];
  assert.equal(g.attackAllowed(hero, rivalCrew), true, 'rival crew can be fought anywhere on the frontier');
  for (const e of [warWorker, quietWorker, folk, rivalCrew]) delete g.state.entities[e.id];
}

// Classic has no wars
{
  const c = match('classic');
  const r = c.g.frontier?.war.check(c.hero, 'x', { x: 0, z: 0 });
  if (r) assert.match(r.reason, /campaign/);
}
g.frontier.world.checkInvariants();
console.log('test_war: ok');
