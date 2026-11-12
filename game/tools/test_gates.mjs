// F6 war, checkpoint 6-5: during a war a town's gates let their own side through and stop the attacker.
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
const S = frontier.war.structures;
assert.ok(S && S.townHall.length === 3 && S.wall > 0 && S.gate > 0 && S.zone.length === 3 && S.damage.melee === 1 && S.damage.ranged < 1 && S.damage.siege > 1, 'structure data block');
for (const t of Object.keys(frontier.war.buildings)) assert.ok((S.camp[t] ?? S.camp.default) > 0, `camp ${t} has health`);

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
const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);

const G = enemy.grid, n = G.n, C = centreCell(n), R = 4;
// a closed square wall round the hall, 4 cells out, with one gate in the middle of its east side
for (let d = -R; d <= R; d++) for (const i of [C + d - R * n, C + d + R * n, C - R + d * n, C + R + d * n]) G.use = put(G.use, i, 'w');
const GATE = C + R; G.use = put(G.use, GATE, 'g');
const [gx, gz] = cellToWorld(enemy, GATE);
const inside = [enemy.x + 2 * G.cell, enemy.z], outside = [enemy.x + 8 * G.cell, enemy.z];
const unit = (owner, at) => { const id = g.spawn('swordsman', 'swordsman', at[0], at[1], { owner, place: 'world', area: 'world', holdFire: true, order: { kind: 'stop' } }); return g.state.entities[typeof id === 'object' ? id.id : id]; };
const isIn = e => Math.abs(e.x - enemy.x) < (R - 0.5) * G.cell && Math.abs(e.z - enemy.z) < (R - 0.5) * G.cell;
const heroOf = clan => Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === clan);
// walk a unit to a point with its own clan's route and collisions (the crew order path, sim/crew_orders.js)
const nav = g.areas.nav;
// (the order is put back every tick: fresh crew and bot crews get orders of their own)
function walk(e, to, ticks = 500) {
  for (let i = 0; i < ticks; i++) { if (e.order?.kind !== 'move' || e.order.x !== to[0]) e.order = { kind: 'move', x: to[0], z: to[1] }; else if (e.order.arrived) break; g.step([]); }
}
Object.assign(hero, { x: outside[0] + 20, z: outside[1], place: 'world', area: 'world' });
for (let i = 0; i < 5; i++) g.step([]);

// ---- no war: the gate is open to everyone -------------------------------------------------------------
{ const a = unit('player', outside); assert.equal(ST.gateBlockers(a), null); assert.equal(ST.gateNav(a), null);
  walk(a, inside); assert.ok(isIn(a), 'no war: anyone walks in through the gate'); delete g.state.entities[a.id]; }

// ---- war: the attacker is stopped, the owner and a third clan are not -----------------------------------
Object.assign(hero, { x: enemy.x + 300, z: enemy.z, place: 'world' });
{ const r = (g.step([{ id: hero.id, type: 'frontier', action: 'devStartWar', town: 'enemyTown', side: 'attack' }]), g.state.frontier.receipts.findLast(r => r.action === 'devStartWar')); assert.ok(r?.ok, r?.reason); }
const rec = war.warOn('enemyTown');
assert.equal(ST.gatesAgainst('player').length, 1, 'one gate stands against the attacker'); assert.equal(ST.gatesAgainst(rival).length, 0); assert.equal(ST.gatesAgainst(third).length, 0);
{ const b = ST.gatesAgainst('player')[0]; assert.ok(b.maxZ - b.minZ > b.maxX - b.minX, 'the gate box lies along its wall (thin across)'); }
{ const a = unit('player', outside), d = unit(rival, outside), t = unit(third, [outside[0], outside[1] + 3]);
  const gn = ST.gateNav(a); assert.ok(gn, 'the attacker has its own routes');
  assert.equal(ST.gateNav(d), null); assert.equal(ST.gateNav(t), null); assert.equal(ST.gateBlockers(d), null); assert.equal(ST.gateBlockers(t), null);
  assert.ok(nav.findPath(...outside, ...inside)?.length, 'everyone else: a route through the gate');
  const p = gn.findPath(...outside, ...inside);
  assert.ok(!p || !p.length || !isIn({ x: p.at(-1)[0], z: p.at(-1)[1] }), 'the attacker: no route in while the gate stands');
  walk(a, inside, 400); assert.ok(!isIn(a), 'the attacker does not get in');
  // pushed straight at it: the gate is solid for him
  Object.assign(a, { x: gx + 4, z: gz }); delete a.order;
  { const x0 = a.x; a.order = { kind: 'move', x: gx - 6, z: gz }; for (let i = 0; i < 80; i++) g.step([]); assert.ok(a.x > gx, `the gate is solid for him (${(a.x - gx).toFixed(1)} from ${(x0 - gx).toFixed(1)})`); }
  // (the owner and a third clan: no gate boxes and the normal routes, checked above; bot crews do not take test orders)
  // ---- the gate falls: a gap for everyone ---------------------------------------------------------------
  const sg = ST.find(`t|enemyTown|${GATE}`); assert.ok(sg && sg.kind === 'gate');
  assert.ok(ST.damage('player', sg, 99999, 'siege')); assert.equal(G.use[GATE], '.');
  g.step([]);
  assert.equal(ST.gatesAgainst('player').length, 0); assert.equal(ST.gateNav(a), null);
  Object.assign(a, { x: outside[0], z: outside[1] });
  walk(a, inside); assert.ok(isIn(a), 'through the gap'); }

// ---- 6-6 camp palisade and gate ---------------------------------------------------------------------------
{ const camp = rec.camp, hallB = camp.buildings.find(b => b.type === 'camp_hall'), P = frontier.war.buildings.palisade, GD = frontier.war.buildings.gate;
  const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
  const S = frontier.war.structures;
  // a clear line near the camp hall (try a few offsets on the open plain)
  let line = null;
  for (const [dx, dz] of [[30, 30], [-30, 30], [30, -30], [-30, -30], [40, 0], [0, 40]]) { const a = { x: hallB.x + dx, z: hallB.z + dz }, b = { x: a.x + 30, z: a.z }; const r = war.campLineCheck(rec.id, a, b); if (r.ok) { line = { a, b, r }; break; } }
  assert.ok(line, 'room for a palisade line by the camp');
  assert.equal(line.r.points.length, 7, '30 long, a piece every 5: 7 pieces'); assert.deepEqual(line.r.cost, { timber: 7 * P.cost.timber }, 'cost for the whole run');
  assert.ok(!war.campCheck(rec.id, 'palisade', line.a).ok, 'a palisade is not placed as a single building');
  { const far = war.campLineCheck(rec.id, { x: hallB.x + 400, z: hallB.z }, { x: hallB.x + 430, z: hallB.z }); assert.ok(!far.ok && /within/.test(far.reason), far.reason); }
  { const long = war.campLineCheck(rec.id, line.a, { x: line.a.x + P.length * (P.lineMax + 5), z: line.a.z }); assert.ok(!long.ok && /At most/.test(long.reason), long.reason); }
  const t0 = camp.stock.timber;
  { const r = cmd({ action: 'campLine', war: rec.id, x0: line.a.x, z0: line.a.z, x1: line.b.x, z1: line.b.z }); assert.ok(r?.ok, r?.reason); }
  const pieces = camp.buildings.filter(b => b.type === 'palisade');
  assert.equal(pieces.length, 7); assert.equal(camp.stock.timber, t0 - 7 * P.cost.timber, 'paid at once'); assert.ok(pieces.every(b => b.stage === 'site' && b.rot === 0));
  assert.ok(!war.campLineCheck(rec.id, line.a, line.b).ok, 'not twice on the same ground');
  // a gate on the middle piece takes its place
  const mid = pieces[3], chk = war.campCheck(rec.id, 'gate', { x: mid.x + 1, z: mid.z + 1 });
  assert.ok(chk.ok && chk.replaces === mid.id && chk.point.x === mid.x, chk.reason);
  { const r = cmd({ action: 'campPlace', war: rec.id, kind: 'gate', x: mid.x + 1, z: mid.z + 1 }); assert.ok(r?.ok, r?.reason); }
  const gate = camp.buildings.find(b => b.type === 'gate');
  assert.ok(gate && gate.x === mid.x && !camp.buildings.includes(mid) && camp.buildings.filter(b => b.type === 'palisade').length === 6, 'the gate replaced the piece');
  // sites do not block; built pieces block everyone, the gate only the defender
  const solid = (x, z) => townBlockersIn(g.state.frontier, x - 0.2, z - 0.2, x + 0.2, z + 0.2, frontier).length > 0;
  g.step([]); assert.ok(!solid(pieces[0].x, pieces[0].z), 'a site is open');
  for (const b of camp.buildings) if (b.type === 'palisade' || b.type === 'gate') { b.stage = 'built'; delete b.progress; }
  g.step([]);
  assert.ok(solid(pieces[0].x, pieces[0].z) && solid(pieces[0].x + 2.4, pieces[0].z), 'a built palisade blocks, with no hole between pieces');
  assert.ok(!solid(pieces[0].x, pieces[0].z + 3), 'only along the line');
  assert.ok(!solid(gate.x, gate.z), 'the gate is not a wall for everyone');
  assert.equal(ST.gatesAgainst(rival).length, 1, 'the camp gate stops the defender'); assert.equal(ST.gatesAgainst(third).length, 0);
  assert.ok(ST.gatesAgainst('player').every(b => !(gate.x >= b.minX && gate.x <= b.maxX && gate.z >= b.minZ && gate.z <= b.maxZ)), 'and not its own side');
  // health, breaking
  const sp = ST.find(`c|${rec.id}|${pieces[0].id}`), sgt = ST.find(`c|${rec.id}|${gate.id}`);
  assert.ok(sp && sp.kind === 'wall' && sp.max === S.camp.palisade && sgt && sgt.kind === 'gate' && sgt.max === S.camp.gate);
  assert.ok(ST.damage(rival, sp, 99999, 'siege')); g.step([]); assert.ok(!solid(pieces[0].x, pieces[0].z), 'a broken piece is a gap');
  assert.ok(ST.damage(rival, sgt, 99999, 'siege')); g.step([]); assert.equal(ST.gatesAgainst(rival).length, 0, 'a broken gate is open'); }

// ---- the war ends: gates are open again ------------------------------------------------------------------
{ G.use = put(G.use, GATE, 'g'); g.step([]);
  assert.equal(ST.gatesAgainst('player').length, 1);
  war.end(rec.id, 'test'); g.step([]);
  assert.equal(ST.gatesAgainst('player').length, 0, 'no war: open to all'); }
console.log('test_gates: ok');
