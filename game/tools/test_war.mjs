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
const pack = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
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

// ---- checkpoint 4: camp buildings, hall upgrade, training queues, troop cap ------------------------
{
  const B = W.buildings, U = W.units;
  const cmd = (c, who = hero) => { g.step([{ id: who.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
  Object.assign(rec.camp.stock, { timber: 5000, stone: 5000 }); rec.camp.chest = 5000;
  const hall = rec.camp.buildings.find(b => b.type === 'camp_hall');
  const out = [(hall.x - ex) / Math.hypot(hall.x - ex, hall.z - ez), (hall.z - ez) / Math.hypot(hall.x - ex, hall.z - ez)];
  const spotFor = (type, near = hall) => { for (const d of [35, 55, 75, 95]) for (let a = 0; a < 24; a++) { const r = war.campCheck(rec.id, type, { x: near.x + Math.cos(a * Math.PI / 12) * d, z: near.z + Math.sin(a * Math.PI / 12) * d }); if (r.ok) return r.point; } return null; };
  assert.match(war.campCheck(rec.id, 'rifle_range', { x: hall.x + out[0] * 40, z: hall.z + out[1] * 40 }).reason, /Needs a built barracks/, 'locked until a barracks stands');
  assert.match(war.campCheck(rec.id, 'barracks', { x: hall.x + out[0] * (W.chainDistance + 40), z: hall.z + out[1] * (W.chainDistance + 40) }).reason, /within 120 of another camp building/, 'chain distance');
  assert.match(war.campCheck(rec.id, 'barracks', { x: hall.x + 3, z: hall.z }).reason, /Too close to the camp hall/, 'spacing');
  assert.match(war.campCheck(rec.id, 'barracks', { x: ex + 10, z: ez }).reason, /town ring|war circle|within/, 'never in the town ring');
  const p1 = spotFor('barracks');
  assert.ok(p1, 'a barracks spot exists next to the hall');
  { const defenderHero = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === rival);
    war.command(defenderHero, { action: 'campPlace', war: rec.id, kind: 'barracks', ...p1 }); const r = g.state.frontier.receipts.at(-1);   // (bot heroes' step commands are not taken, so ask the war module directly)
    assert.ok(r && r.action === 'campPlace' && !r.ok && /Not your war camp/.test(r.reason), 'only the attacker builds the camp'); }
  const t0 = rec.camp.stock.timber, s0 = rec.camp.stock.stone;
  { const r = cmd({ action: 'campPlace', war: rec.id, kind: 'barracks', ...p1 }); assert.ok(r?.ok, r?.reason); }
  assert.deepEqual([rec.camp.stock.timber, rec.camp.stock.stone], [t0 - B.barracks.cost.timber, s0 - B.barracks.cost.stone], 'paid from the camp stock');
  const barracks = rec.camp.buildings.at(-1);
  assert.equal(barracks.stage, 'site');
  // a second site, cancelled before any work: full refund
  { const p2 = spotFor('supply_tents'); assert.ok(cmd({ action: 'campPlace', war: rec.id, kind: 'supply_tents', ...p2 })?.ok);
    const tents = rec.camp.buildings.at(-1); tents.progress = 0;
    assert.ok(cmd({ action: 'campCancel', war: rec.id, building: tents.id })?.ok);
    assert.ok(!rec.camp.buildings.includes(tents)); }
  for (let i = 0; i < 8000 && barracks.stage !== 'built'; i++) g.step([]);
  assert.equal(barracks.stage, 'built', 'camp workers build the barracks');
  assert.ok(rec.camp.workers.every(w => !w.project), 'builders go back to gathering');
  assert.doesNotMatch(war.campCheck(rec.id, 'rifle_range', spotFor('rifle_range') || { x: 0, z: 0 }).reason || '', /Needs/, 'the barracks unlocks the rifle range');
  assert.match(war.campBuildList(rec.id).find(b => b.type === 'stable').reason, /camp hall upgrade/, 'stables wait for the hall upgrade');
  // the camp hall upgrade
  const chestU = rec.camp.chest;
  { const r = cmd({ action: 'campUpgrade', war: rec.id }); assert.ok(r?.ok, r?.reason); }
  assert.equal(rec.camp.chest, chestU - W.hallUpgrade.cost.ryo, 'the upgrade takes ryo from the war chest');
  for (let i = 0; i < 8000 && hall.tier !== 2; i++) g.step([]);
  assert.equal(hall.tier, 2, 'workers build the upgrade');
  assert.ok(war.upgraded(rec.camp) && war.campBuildList(rec.id).find(b => b.type === 'stable').ok, 'the upgrade unlocks stables');
  // training and the troop cap
  assert.deepEqual(war.troopView(rec.id), { troops: 0, queued: 0, cap: W.troopCap.base });
  { const r = cmd({ action: 'campTrain', war: rec.id, building: barracks.id, unit: 'grunt', count: W.troopCap.base + 1 }); assert.ok(r && !r.ok && /Troop cap/.test(r.reason), 'over the cap is refused'); }
  const chestT = rec.camp.chest;
  { const r = cmd({ action: 'campTrain', war: rec.id, building: barracks.id, unit: 'grunt', count: 3 }); assert.ok(r?.ok, r?.reason); }
  assert.equal(rec.camp.chest, chestT - 3 * U.grunt.ryo, 'troops paid from the war chest');
  { const r = cmd({ action: 'campUntrain', war: rec.id, building: barracks.id }); assert.ok(r?.ok, r?.reason); }
  assert.equal(rec.camp.chest, chestT - 2 * U.grunt.ryo, 'cancelling the last one refunds it');
  for (let i = 0; i < U.grunt.trainTicks * 2 + 5; i++) g.step([]);
  const troops = Object.values(g.state.entities).filter(e => e.warTroop === rec.id);
  assert.equal(troops.length, 2, 'two troops trained');
  assert.ok(troops.every(e => e.owner === 'player' && e.type === U.grunt.type[g.state.clans.player.faction] && e.place === 'world'), 'clan grunts of the attacker');
  assert.ok(troops.every(e => Math.hypot(e.x - barracks.x, e.z - barracks.z) < 20), 'they appear at their barracks');
  assert.deepEqual(war.troopView(rec.id), { troops: 2, queued: 0, cap: W.troopCap.base });
  // supply tents raise the cap
  { const p3 = spotFor('supply_tents'); assert.ok(cmd({ action: 'campPlace', war: rec.id, kind: 'supply_tents', ...p3 })?.ok); }
  const tents = rec.camp.buildings.at(-1);
  for (let i = 0; i < 8000 && tents.stage !== 'built'; i++) g.step([]);
  assert.equal(war.troopView(rec.id).cap, W.troopCap.base + B.supply_tents.cap, 'supply tents raise the troop cap');
  g.frontier.world.checkInvariants();
}

// ---- checkpoint 5: shared roster, clan bonuses, cavalry ----------------------------------------------
{
  const U = W.units, types = options().units.types;
  const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
  rec.camp.chest = 20000; Object.assign(rec.camp.stock, { timber: 5000, stone: 5000 });
  const hall = rec.camp.buildings.find(b => b.type === 'camp_hall');
  const spotFor = type => { for (const d of [35, 55, 75, 95, 115]) for (let a = 0; a < 24; a++) { const r = war.campCheck(rec.id, type, { x: hall.x + Math.cos(a * Math.PI / 12) * d, z: hall.z + Math.sin(a * Math.PI / 12) * d }); if (r.ok) return r.point; } return null; };
  // every roster unit is trained somewhere, and war-only types are never for hire in the city
  for (const [id, u] of Object.entries(U)) if (id !== '_note') {
    assert.ok(u.at?.length && u.ryo > 0 && u.trainTicks > 0, `${id} has a building, ryo and train time`);
    for (const fct of ['yakuza', 'kuroda', 'shinobi']) {
      const t = typeof u.type === 'string' ? u.type : u.type[fct];
      assert.ok(types[t], `${id}: ${t} is a units.json type`);
      assert.ok(u.model?.[fct], `${id} has a ${fct} body`);
      if (types[t].war) assert.ok(!types[t].price && g.clans.hirePrice('player', t) == null, `${t} is war-only`);
    }
  }
  assert.deepEqual(war.trainsAt('barracks').sort(), ['brute', 'enforcer', 'grunt'], 'enforcers train at the barracks (Tim 2026-11-11)');
  assert.deepEqual(war.trainsAt('rifle_range').sort(), ['archer', 'rifleman']);
  assert.deepEqual(war.trainsAt('stable').sort(), ['mounted_pikeman', 'sword_rider']);
  // archers fire faster at shorter range, riflemen slower, harder, farther; similar damage per second
  { const a = types.army_archer, r = types.army_rifleman, dps = t => t.damage / t.attackSpeed;
    assert.ok(a.attackSpeed < r.attackSpeed && a.attackRange < r.attackRange && a.damage < r.damage && !a.projectile.hamstring && !r.rifle);
    assert.ok(Math.abs(dps(a) - dps(r)) / dps(a) < 0.25, 'similar damage per second'); }
  // clan bonuses on cost
  const clan = g.state.clans.player, was = clan.faction;
  clan.faction = 'kuroda'; assert.equal(war.ryoOf('player', 'rifleman'), Math.round(U.rifleman.ryo * W.clanBonus.kuroda.rifleman.ryo), 'Kuroda riflemen cost less');
  clan.faction = 'shinobi'; assert.equal(war.ryoOf('player', 'archer'), Math.round(U.archer.ryo * W.clanBonus.shinobi.archer.ryo), 'Shinobi archers cost less');
  clan.faction = was;
  // build a rifle range and stables, then train one of everything
  const built = type => { const p = spotFor(type); assert.ok(p, `room for a ${type}`); const r = cmd({ action: 'campPlace', war: rec.id, kind: type, ...p }); assert.ok(r?.ok, r?.reason);
    const b = rec.camp.buildings.at(-1); for (let i = 0; i < 12000 && b.stage !== 'built'; i++) g.step([]); assert.equal(b.stage, 'built', `${type} built`); return b; };
  const range = built('rifle_range'), stable = built('stable'), barracks = rec.camp.buildings.find(b => b.type === 'barracks' && b.stage === 'built');
  const before = new Set(Object.keys(g.state.entities));
  const chest0 = rec.camp.chest;
  for (const [b, unit] of [[barracks, 'brute'], [barracks, 'enforcer'], [range, 'archer'], [range, 'rifleman'], [stable, 'sword_rider'], [stable, 'mounted_pikeman']]) {
    const r = cmd({ action: 'campTrain', war: rec.id, building: b.id, unit, count: 1 }); assert.ok(r?.ok, `${unit}: ${r?.reason}`);
  }
  assert.equal(rec.camp.chest, chest0 - ['brute', 'enforcer', 'archer', 'rifleman', 'sword_rider', 'mounted_pikeman'].reduce((n, u) => n + war.ryoOf('player', u), 0), 'paid with clan prices');
  { const r = cmd({ action: 'campTrain', war: rec.id, building: range.id, unit: 'grunt', count: 1 }); assert.ok(r && !r.ok && /does not train/.test(r.reason), 'a building trains only its own units'); }
  for (let i = 0; i < 2000 && rec.camp.buildings.some(b => b.queue?.length); i++) g.step([]);
  const fresh = Object.values(g.state.entities).filter(e => !before.has(e.id) && e.warTroop === rec.id);
  const by = unit => fresh.find(e => e.warUnit === unit && e.type !== 'horse');
  for (const unit of ['brute', 'enforcer', 'archer', 'rifleman', 'sword_rider', 'mounted_pikeman']) assert.ok(by(unit), `${unit} trained`);
  assert.equal(by('enforcer').model, U.enforcer.model.yakuza, 'the clan body');
  assert.equal(by('enforcer').maxHp, Math.round(types.war_enforcer.hp * W.clanBonus.yakuza.enforcer.hp), 'Yakuza melee are tougher');
  assert.ok(!by('enforcer').taunt && !types.war_enforcer.taunt, 'no taunt in war');
  assert.equal(war.troopView(rec.id).troops, 8, 'two grunts plus six; horses are not troops');
  // cavalry: on the horse from the start, and never get off
  const rider = by('sword_rider'), horse = g.state.entities[rider.ride?.horse];
  assert.ok(rider.mounted && rider.cavalry && horse?.type === 'horse' && horse.rider === rider.id && horse.cavalry, 'cavalry spawn mounted');
  assert.ok(g.stats.effective(rider).run > types.sword_rider.run * 1.5, 'cavalry ride fast');
  g.mounts.dismount(rider);
  assert.ok(rider.mounted, 'cavalry cannot be told to get off');
  { // save and load keep the cavalry on their horses and the clan bonuses on the troops
    const g2 = createGame(options());
    setupMatch(g2, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
    loadSave(g2, JSON.parse(JSON.stringify(makeSave(g))));
    const r2 = g2.state.entities[rider.id], h2 = g2.state.entities[horse.id];
    assert.ok(r2?.mounted && r2.cavalry && r2.ride?.horse === horse.id && h2?.rider === rider.id && h2.cavalry, 'cavalry survive save/load');
    assert.equal(g2.state.entities[by('enforcer').id]?.maxHp, by('enforcer').maxHp, 'bonus health survives save/load');
    for (let i = 0; i < 25; i++) g2.step([]);
    assert.ok(g2.state.entities[rider.id]?.mounted && g2.state.entities[horse.id], 'still riding after load');
  }
  const foe = g.state.entities[g.spawn('swordsman', 'swordsman', rider.x + 3, rider.z, { owner: rival, place: 'world', area: 'world', order: { kind: 'stop' } })];
  const foeHp = foe.hp;
  rider.hp = rider.maxHp * 0.2;   // below the throw share
  rider.order = { kind: 'attack', target: foe.id };
  for (let i = 0; i < 80; i++) g.step([]);
  assert.ok(rider.mounted && g.state.entities[horse.id], 'still in the saddle after attacking, being hit and dropping low');
  assert.ok(foe.dead || !g.state.entities[foe.id] || foe.hp < foeHp, 'cavalry fight from the saddle');
  // rider and horse fall together
  rider.dead = true;
  for (let i = 0; i < 6; i++) g.step([]);
  assert.ok(!g.state.entities[horse.id], 'the horse goes with her fallen rider');
  // tidy: remove the new troops so the stand-in test below sees the old field
  for (const e of fresh) delete g.state.entities[e.id];
  if (g.state.entities[foe.id]) delete g.state.entities[foe.id];
  g.frontier.world.checkInvariants();
}

// ---- checkpoint 4: stand-in defender and the dev war command ----------------------------------------
{
  const S = W.standIn;
  const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
  assert.ok(g.state.clans[rival].bot, 'the defender is a bot clan');
  fw.change(enemy.id, 'ryo', S.ryo * 3 - (enemy.stock.ryo || 0), 'test');
  for (let i = 0; i < S.trainTicks * 4 + 40; i++) g.step([]);
  const defenders = () => Object.values(g.state.entities).filter(e => e.warTroop === rec.id && e.owner === rival && !e.dead);
  assert.ok(defenders().length >= 2 && defenders().length <= 3, 'the stand-in defender trains grunts while the coffers last');
  assert.ok(enemy.stock.ryo < S.ryo, 'paid from the town coffers');
  assert.ok(defenders().every(d => Math.hypot(d.x - ex, d.z - ez) < 40 && d.type === S.type[g.state.clans[rival].faction]), 'they guard the town hall');
  const raider = Object.values(g.state.entities).find(e => e.warTroop === rec.id && e.owner === 'player' && !e.dead);
  Object.assign(raider, { x: ex + 25, z: ez });
  for (let i = 0; i < 21; i++) g.step([]);
  assert.ok(defenders().some(d => d.order?.kind === 'attack' && d.order.target === raider.id), 'they go for an attacker inside the town ring');
  // dev war: a rival attacks the player's own town
  { const r = cmd({ action: 'devStartWar', town: 'myTown', side: 'defend' }); assert.ok(r?.ok, r?.reason); }
  const dw = war.warOn('myTown');
  assert.ok(dw && dw.defender === 'player' && dw.attacker !== 'player' && war.check(hero, 'myTown').band, 'dev war on your own town');
  assert.equal(dw.camp.workers.length, W.camp.startWorkers);
  assert.deepEqual(dw.camp.stock, { timber: W.dev.camp.timber, stone: W.dev.camp.stone });
  { const r = cmd({ action: 'devStartWar', town: 'myTown', side: 'defend' }); assert.ok(r && !r.ok && /already at war/.test(r.reason)); }
  { const r = cmd({ action: 'devEndWar', war: dw.id }); assert.ok(r?.ok); }
  g.state.frontier.wars.cooldown = Object.fromEntries(Object.entries(g.state.frontier.wars.cooldown).filter(([k]) => k !== 'myTown'));
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
for (let i = 0; i < 20; i++) g.step([]);
assert.ok(!Object.values(g.state.entities).some(e => e.warTroop === rec.id), 'troops disband when the war ends');
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
