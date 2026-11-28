// War 7c-2 (2026-11-12): torch rules (1 second cast, who can torch, the fire burns until doused), the fire bomb as a
// channelled special with a ground marker, and a spearman for every clan.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { terrainAt } from '../src/sim/world_data.js';
import { townBlockersIn, cellToWorld, centreCell } from '../src/sim/frontier/town_grid.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'), frontier: { ...frontier, dev: true, railways: data('data/railways.json') } });
const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
const hero = g.state.entities[m.heroId], war = g.frontier.war, fw = g.frontier.world, ST = g.frontier.structures;
const rival = Object.keys(g.state.clans).find(c => c !== 'player');
const third = Object.keys(g.state.clans).find(c => c !== 'player' && c !== rival);
const open = (x, z, r) => { for (let dx = -r; dx <= r; dx += 50) for (let dz = -r; dz <= r; dz += 50) if (terrainAt(world, x + dx, z + dz) !== 'p') return false; return true; };
const spots = [];
for (let z = 500; z < world.size.h - 500 && spots.length < 2; z += 50) for (let x = 500; x < world.size.w - 500 && spots.length < 2; x += 50) {
  if (Math.hypot(x - world.capital.x, z - world.capital.z) < 1600 || spots.some(s => Math.hypot(x - s[0], z - s[1]) < 2000)) continue;
  if (open(x, z, 500)) spots.push([x, z]);
}
assert.equal(spots.length, 2, 'test spots exist');
const addTown = (id, owner, [x, z]) => fw.addTown({ id, name: id, region: null, owner, x, z, site: null, traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 5, stock: { ...frontier.founding.startStock, ryo: 0 }, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
const enemy = addTown('enemyTown', rival, spots[0]), mine = addTown('myTown', 'player', spots[1]);
g.step([]);
const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
Object.assign(hero, { x: enemy.x + 300, z: enemy.z, place: 'world' });
{ const r = cmd({ action: 'devStartWar', town: 'enemyTown', side: 'attack' }); assert.ok(r?.ok, r?.reason); }
const rec = war.warOn('enemyTown'), W = frontier.war, R = W.circleRadius;
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const ids = () => new Set(Object.keys(g.state.entities));
const U = data('data/units.json').types, S = W.structures;
const spawn = (unit, x, z, owner) => { const b = ids(); war.spawnTroop(rec, unit, x, z, owner); return g.state.entities[Object.keys(g.state.entities).find(id => !b.has(id))]; };
const hall = ST.list().find(s => s.town === 'enemyTown' && s.type === 'town_hall'); assert.ok(hall, 'the enemy town hall is a structure');
const fireOn = st => g.state.frontier.fires?.[st.key];

// ---- spearmen for every clan ------------------------------------------------------------------------------
{ const R2 = W.units; assert.ok(R2.grunt && R2.spearman, 'the roster has a sword grunt and a spearman');
  assert.deepEqual(R2.spearman.at, ['barracks']); assert.ok(war.trainsAt('barracks', 'player').includes('spearman') && war.trainsAt('barracks', 'player').includes('grunt'));
  for (const f of ['yakuza', 'kuroda', 'shinobi']) {
    const a = U[R2.grunt.type[f]], b = U[R2.spearman.type[f]]; assert.ok(a && b && R2.grunt.type[f] !== R2.spearman.type[f], `${f} has two barracks grunts`);
    assert.ok(b.attackRange > a.attackRange, `${f} spearman reaches further`);
    assert.ok(b.damage / b.attackSpeed > a.damage / a.attackSpeed, `${f} spearman does more damage a second`);
    assert.ok(b.hp < a.hp && b.hp > a.hp * 0.7, `${f} spearman has a little less health`);
    assert.ok(S.torch.types.includes(R2.grunt.type[f]) && S.torch.types.includes(R2.spearman.type[f]), `${f} grunts and spearmen can torch`); } }

// ---- who can torch ----------------------------------------------------------------------------------------
const gr = spawn('grunt', hall.x + 16, hall.z + 16), sp = spawn('spearman', hall.x + 18, hall.z + 16), brute = spawn('brute', hall.x + 20, hall.z + 16),
  enf = spawn('enforcer', hall.x + 22, hall.z + 16), rider = spawn('sword_rider', hall.x + 24, hall.z + 20), arch = spawn('archer', hall.x + 26, hall.z + 16);
assert.equal(ST.torchers([gr.id, sp.id, brute.id, enf.id, rider.id, arch.id]), 4, 'every barracks unit can torch, not riders or archers');
assert.ok(ST.canTorch(hero, g.units?.types?.hero || U.hero) === !U.hero.projectile, 'a melee hero can torch');
g.step([{ id: hero.id, type: 'order', kind: 'raze', torch: true, structure: hall.key, units: [gr.id, sp.id, brute.id, enf.id, rider.id, arch.id] }]);
assert.ok(gr.order?.torch && sp.order?.torch && brute.order?.torch && enf.order?.torch, 'they take the Torch order');
assert.ok(!rider.order?.torch && !arch.order?.torch, 'the others keep what they were doing');
brute.dead = enf.dead = true;

// ---- one caster at a time (2026-11-28): of two at the hall only the first casts, the other hits it ------------
{ let both = false, one = false;
  for (let t = 0; t < 600 && !fireOn(hall); t++) { g.step([]); const n = [gr, sp].filter(u => u.order?.cast).length; if (n > 1) both = true; if (n === 1) one = true; }
  assert.ok(one && !both, 'only one of them casts'); assert.ok(fireOn(hall), 'and the hall burns');
  ST.douse(hall); gr.order = { kind: 'stop' }; sp.order = { kind: 'stop' }; run(2);
  g.step([{ id: hero.id, type: 'order', kind: 'raze', torch: true, structure: hall.key, units: [gr.id] }]); }

// ---- the cast: 1 second, broken by a stun, not by a plain hit; then one fire and they keep hitting ------------
{ sp.dead = true;   // one caster, to time it
  let castAt = null, t = 0;
  for (; t < 600 && castAt == null; t++) { g.step([]); if (gr.order?.cast) castAt = gr.order.cast.start + 1; }   // he may already stand at the hall from the one-caster check
  assert.ok(castAt != null, 'the grunt starts the cast at the hall'); assert.equal(fireOn(hall), undefined, 'no fire yet');
  const until0 = gr.order.cast.until; assert.ok(Math.abs(until0 - castAt - S.torch.castTicks) <= 1, 'the cast lasts castTicks');   // castAt is read after the tick advanced
  gr.hp -= 5; gr.hitAt = g.state.tick; run(3); assert.equal(gr.order.cast?.until, until0, 'a plain hit does not break it');
  (gr.buffs ||= {}).stunned = { until: g.state.tick + 8 }; run(S.torch.castTicks);
  assert.equal(fireOn(hall), undefined, 'a stun breaks the cast'); assert.ok(!gr.order?.torch, 'a broken cast ends his Torch (2026-11-28)');
  g.step([{ id: hero.id, type: 'order', kind: 'raze', torch: true, structure: hall.key, units: [gr.id] }]);
  for (t = 0; t < 200 && !fireOn(hall); t++) g.step([]);
  assert.ok(fireOn(hall), 'given Torch again he casts and the hall burns'); assert.ok(gr.order.cast == null || !gr.order.cast, 'the cast is over');
  const hp0 = ST.hpOf(hall); let hits = 0; for (t = 0; t < 200; t++) { g.step([]); hits += (g.state.structureHits || []).filter(h => h.a === gr.id).length; }
  assert.ok(hits > 0, 'once it burns he keeps hitting it');
  assert.ok(fireOn(hall), 'the fire does not die by itself'); assert.equal(Object.keys(g.state.frontier.fires).length, 1, 'one fire');
  assert.ok(hp0 - ST.hpOf(hall) >= S.fire.damage * 9, `the fire burns every second (${hp0 - ST.hpOf(hall)})`);
  gr.order = { kind: 'stop' }; run(5);
  assert.ok(ST.douse(hall), 'dousing puts it out'); const hp1 = ST.hpOf(hall); run(60); assert.equal(ST.hpOf(hall), hp1, 'no more burning'); assert.equal(g.state.frontier.fires, undefined); }

// ---- fire bomb: a weak knife, and the bomb as a channelled special -----------------------------------------------
{ const B = U.fire_bomber.bomb; assert.ok(B && !U.fire_bomber.projectile, 'the bomb is no longer the normal attack');
  assert.ok(U.fire_bomber.damage < 12 && U.fire_bomber.attackRange < 2, 'the normal attack is a weak knife');
  assert.ok(B.range < U.army_archer.attackRange && B.range < U.army_rifleman.attackRange, 'bomb range is shorter than archers and riflemen');
  assert.ok(B.cooldownTicks >= 200 && B.channelTicks > 0, 'a channel and a long cooldown');
  // on troops: the marker shows, the spot is fixed, everyone in the ring is hurt
  const bx = rec.camp.x + 60, bz = rec.camp.z + 60;
  const bomber = spawn('fire_bomber', bx, bz), f1 = spawn('grunt', bx + 4, bz, rival), f2 = spawn('grunt', bx + 5, bz + 1, rival), far = spawn('grunt', bx + 4 + B.radius + 3, bz, rival);
  for (const e of [f1, f2, far]) { e.order = { kind: 'hold' }; e.holdFire = true; }
  let mark = null, burst = null, t = 0;
  for (; t < 60 && !mark; t++) { g.step([]); mark = g.state.casts.find(c => c.kind === 'firebombMark' && c.a === bomber.id) || null; }
  assert.ok(mark, 'the ground marker shows when the channel starts'); assert.ok(bomber.bomb.channel, 'he channels');
  assert.ok(Math.hypot(mark.x - bomber.x, mark.z - bomber.z) <= B.range + 0.01, 'the spot is in range');
  const h1 = f1.hp, h2 = f2.hp, hf = far.hp, ch = { ...bomber.bomb.channel };
  run(5); assert.equal(f1.hp, h1, 'nothing lands during the channel');
  for (t = 0; t < 200 && !burst; t++) { g.step([]); burst = g.state.casts.find(c => c.kind === 'firebombBurst' && c.a === bomber.id) || null; }
  assert.ok(burst && burst.x === ch.x && burst.z === ch.z, 'the bomb lands on the marked spot');
  assert.ok(f1.hp < h1 && f2.hp < h2, 'everyone in the ring is hurt'); assert.equal(far.hp, hf, 'not one outside it');
  assert.ok(bomber.bomb.readyAt - g.state.tick > B.cooldownTicks - 100, 'the long cooldown runs');
  // interrupted channel: no bomb, short retry
  bomber.bomb.readyAt = 0; f1.hp = f1.maxHp; f2.hp = f2.maxHp; f1.dead = f2.dead = false;
  for (t = 0; t < 60 && !bomber.bomb.channel; t++) g.step([]);
  assert.ok(bomber.bomb.channel, 'he channels again'); (bomber.buffs ||= {}).stunned = { until: g.state.tick + 6 }; run(8);
  assert.ok(!bomber.bomb.channel && !(g.state.bombs || []).length, 'a stun breaks the channel, no bomb flies');
  // auto off: nothing on his own; an asked-for cast still goes
  for (const e of [f1, f2, far]) e.dead = true; run(2);
  g.step([{ id: hero.id, type: 'special', ability: 'firebomb', units: [bomber.id], auto: false }]); assert.equal(bomber.autoCast, false);
  // on buildings: wood burns, stone takes less and does not
  bomber.bomb.readyAt = 0; Object.assign(bomber, { x: hall.x + 12, z: hall.z + 12, order: { kind: 'stop' } }); run(40);
  assert.ok(!bomber.bomb.channel, 'auto off: he does not throw on his own');
  const hp0 = ST.hpOf(hall);
  const d = Math.hypot(bomber.x - hall.x, bomber.z - hall.z), k = Math.max(0, (ST.gap(hall, bomber.x, bomber.z) - B.range + 1) / d);
  Object.assign(bomber, { x: bomber.x + (hall.x - bomber.x) * k, z: bomber.z + (hall.z - bomber.z) * k });
  g.step([{ id: hero.id, type: 'special', ability: 'firebomb', units: [bomber.id], x: hall.x, z: hall.z }]);
  for (t = 0; t < 200 && ST.hpOf(hall) === hp0; t++) g.step([]);
  assert.equal(hp0 - ST.hpOf(hall), B.structureDamage * S.damage.bomb * S.stone.bomb, 'stone takes reduced bomb damage');
  assert.equal(fireOn(hall), undefined, 'and does not catch fire');
}

// ---- 7c-4 workers douse and repair, paid from the camp stock; a resource camp may stand outside the area ------------
{ const campHall = rec.camp.buildings.find(b => b.type === 'camp_hall'), sc = ST.find(`c|${rec.id}|${campHall.id}`);
  assert.ok(sc && ST.damage(rival, sc, 400, 'siege') && ST.ignite(rival, sc), 'the camp hall is hit and burning');
  const hpLow = ST.hpOf(sc), t0 = rec.camp.stock.timber = 500;
  { const r = cmd({ action: 'workerOrder', town: rec.id, workers: rec.camp.workers.map(w => w.id), kind: 'work', target: sc.key }); assert.ok(r?.ok, r?.reason); }
  assert.ok(rec.camp.workers.every(w => w.job?.key === sc.key), 'the workers take the job');
  let out = null, t = 0, spent = {}; for (; t < 4000 && ST.hpOf(sc) < sc.max; t++) { g.step([]); if (out == null && !fireOn(sc)) out = t; for (const c of g.state.casts || []) if (c.kind === 'repairSpend') for (const [r, n] of Object.entries(c.spent)) spent[r] = (spent[r] || 0) + n; }
  assert.ok(out != null, `they put the fire out (${out} ticks)`);
  assert.equal(ST.hpOf(sc), sc.max, `and repair it to full (${t} ticks, from ${hpLow})`);
  assert.ok(rec.camp.stock.timber < t0, 'repairs are paid from the camp stock');
  assert.ok(spent.timber > 0 && spent.timber <= t0 - rec.camp.stock.timber, 'the spend pops show what it took (2026-11-24): ' + JSON.stringify(spent));
  run(5); assert.ok(rec.camp.workers.every(w => !w.job), 'the job ends when it is done');
  assert.match(war.campCheck(rec.id, 'barracks', { x: campHall.x + W.chainDistance + 60, z: campHall.z }).reason || '', /Outside the build area/);
  assert.match(war.campCheck(rec.id, 'lumber_camp', { x: campHall.x + W.chainDistance + 60, z: campHall.z }).reason || 'ok', /must stand by|ok|circle|ring|close/, 'a lumber camp out there only needs its resource'); }

// ---- 7c-4 a ruined town hall: no placing in that town ------------------------------------------------------------
{ ST.damage('player', hall, ST.hpOf(hall) * 10 + 1e5, 'siege');
  const pl = g.frontier.modules.find(m => m.name === 'placement').placement;
  fw.change('enemyTown', 'timber', 500, 'test'); fw.change('enemyTown', 'stone', 500, 'test');
  const r = pl.check(enemy, { kind: 'house', cells: [centreCell(enemy) + 3] });
  assert.ok(!r.ok && /ruin/i.test(r.reason || ''), `placing is blocked while the hall is a ruin (${r.reason})`); }

console.log('test_cp7c2 ok');
