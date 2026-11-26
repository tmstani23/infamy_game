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
  const N = Math.round(30 / P.length) + 1;
  assert.equal(line.r.points.length, N, '30 long, a piece every length'); assert.deepEqual(line.r.cost, { timber: N * P.cost.timber }, 'cost for the whole run');
  assert.ok(!war.campCheck(rec.id, 'palisade', line.a).ok, 'a palisade is not placed as a single building');
  { const far = war.campLineCheck(rec.id, { x: hallB.x + 400, z: hallB.z }, { x: hallB.x + 430, z: hallB.z }); assert.ok(!far.ok && /within/.test(far.reason), far.reason); }
  { const long = war.campLineCheck(rec.id, line.a, { x: line.a.x + P.length * (P.lineMax + 5), z: line.a.z }); assert.ok(!long.ok && /At most/.test(long.reason), long.reason); }
  const t0 = camp.stock.timber;
  { const r = cmd({ action: 'campLine', war: rec.id, x0: line.a.x, z0: line.a.z, x1: line.b.x, z1: line.b.z }); assert.ok(r?.ok, r?.reason); }
  const pieces = camp.buildings.filter(b => b.type === 'palisade');
  assert.equal(pieces.length, N); assert.equal(camp.stock.timber, t0 - N * P.cost.timber, 'paid at once'); assert.ok(pieces.every(b => b.stage === 'site' && b.rot === 0));
  assert.ok(!war.campLineCheck(rec.id, line.a, line.b).ok, 'not twice on the same ground');
  // 2026-11-15: a run snaps to world x or z (the two diagonals the art is drawn for), and is one job
  { const slant = war.campLineCheck(rec.id, { x: line.a.x, z: line.a.z + 40 }, { x: line.a.x + 30, z: line.a.z + 52 });
    assert.ok(slant.points.length === N && slant.points.every(p => p.z === line.a.z + 40) && slant.rot === 0, 'a slanted drag runs along x');
    const steep = war.campLineCheck(rec.id, { x: line.a.x, z: line.a.z + 40 }, { x: line.a.x + 12, z: line.a.z + 70 });
    assert.ok(steep.points.every(p => p.x === line.a.x) && Math.abs(Math.abs(steep.rot) - 1.571) < 0.01, 'a steep one along z'); }
  assert.ok(pieces[0].line && pieces.every(b => b.line === pieces[0].line), 'the pieces of a run share its line id');
  // 2026-11-15: pieces stand exactly one length apart; a new run locks onto the end of the wall and meets it square
  const near = (a, b, e = 0.02) => Math.abs(a - b) <= e, GL = frontier.war.buildings.gate.length;
  assert.ok(pieces.every((b, i) => !i || near(b.x - pieces[i - 1].x, P.length)), 'a piece every length, no gaps');
  assert.equal(GL, 2 * P.length, 'a gate is two palisade pieces long');
  const endJ = { x: pieces[N - 1].x + P.length / 2, z: pieces[N - 1].z };
  { const on = war.campLineCheck(rec.id, { x: endJ.x + 2, z: endJ.z + 1 }, { x: endJ.x + 12, z: endJ.z + 2 });
    assert.ok(on.ok && on.locks.start && near(on.locks.start.x, endJ.x) && near(on.points[0].x, endJ.x + P.length / 2) && near(on.points[0].z, endJ.z), 'carrying on: the run locks onto the wall end ' + on.reason);
    const corner = war.campLineCheck(rec.id, { x: endJ.x + 1, z: endJ.z + 2 }, { x: endJ.x + 2, z: endJ.z + 14 });
    assert.ok(corner.ok && corner.locks.start && near(corner.points[0].x, endJ.x) && near(corner.points[0].z, endJ.z + P.length / 2) && Math.abs(Math.abs(corner.rot) - 1.571) < 0.01, 'a corner: the other direction starts at the same joint ' + corner.reason);
    const free = war.campLineCheck(rec.id, { x: endJ.x + 12, z: endJ.z + 20 }, { x: endJ.x + 12, z: endJ.z + 30 });
    assert.ok(!free.locks.start && !free.locks.end, 'no lock away from any wall');
    // the far end locks onto a wall end on its line: the pieces close up to meet it exactly
    const back = war.campLineCheck(rec.id, { x: endJ.x + 21, z: endJ.z }, { x: endJ.x + 1, z: endJ.z });
    const last = back.points.at(-1), step = Math.abs(back.points[0].x - back.points[1].x);
    assert.ok(back.ok && back.locks.end && !back.locks.end.level && step <= P.length + 0.01 && near(last.x - step / 2, endJ.x, 0.03), 'the far end locks onto the wall end ' + back.reason);
    // level with a wall end off its line
    const level = war.campLineCheck(rec.id, { x: endJ.x + 20, z: endJ.z + 25 }, { x: endJ.x + 1.5, z: endJ.z + 25 });
    assert.ok(level.locks.end?.level && near(level.points.at(-1).x - Math.abs(level.points[0].x - level.points[1].x) / 2, endJ.x, 0.03), 'the far end comes level with a wall end beside it'); }
  // a gate on the wall is set into it in place of two pieces (never in front of or behind it)
  const mid = pieces[3], chk = war.campCheck(rec.id, 'gate', { x: mid.x + 1, z: mid.z + 3 });
  assert.ok(chk.ok && chk.replaces.length === 2 && chk.replaces.includes(mid.id) && chk.replaces.includes(pieces[4].id) && near(chk.point.x, (mid.x + pieces[4].x) / 2) && near(chk.point.z, mid.z) && chk.rot === 0, chk.reason);
  // by the end of the run it locks on and carries the run on; R (turn) stands it square to the run; alone it turns too
  { const on = war.campCheck(rec.id, 'gate', { x: endJ.x + 2.5, z: endJ.z + 1 });
    assert.ok(on.ok && !on.replaces.length && on.lock && near(on.point.x, endJ.x + GL / 2) && near(on.point.z, endJ.z) && on.rot === 0, 'a gate carries the run on from its end ' + on.reason);
    const sq = war.campCheck(rec.id, 'gate', { x: endJ.x + 2.5, z: endJ.z + 1 }, { turn: true });
    assert.ok(sq.ok && near(sq.point.x, endJ.x) && near(sq.point.z, endJ.z + GL / 2) && sq.rot === 1.571, 'turned: square to the run on the cursor side ' + sq.reason);
    const al = war.campCheck(rec.id, 'gate', { x: endJ.x + 14, z: endJ.z + 22 }), alT = war.campCheck(rec.id, 'gate', { x: endJ.x + 14, z: endJ.z + 22 }, { turn: true });
    assert.ok(al.rot === 0 && alT.rot === 1.571 && !al.lock, 'a gate on open ground turns with R'); }
  { const r = cmd({ action: 'campPlace', war: rec.id, kind: 'gate', x: mid.x + 1, z: mid.z + 3 }); assert.ok(r?.ok, r?.reason); }
  const gate = camp.buildings.find(b => b.type === 'gate');
  assert.ok(gate && near(gate.x, (mid.x + pieces[4].x) / 2) && !camp.buildings.includes(mid) && !camp.buildings.includes(pieces[4]) && camp.buildings.filter(b => b.type === 'palisade').length === N - 2, 'the gate replaced two pieces');
  // the Eraser (2026-11-15): everything a building cost comes back; the hall stays
  { const t1 = camp.stock.timber, far = { x: endJ.x + 12, z: endJ.z + 20 };
    { const r = cmd({ action: 'campLine', war: rec.id, x0: far.x, z0: far.z, x1: far.x, z1: far.z + 6 }); assert.ok(r?.ok, r?.reason); }
    const extra = camp.buildings.filter(b => b.type === 'palisade' && near(b.x, far.x, 0.1));
    assert.ok(extra.length >= 2 && camp.stock.timber === t1 - extra.length * P.cost.timber);
    extra[0].stage = 'built';
    const ck = war.campEraseCheck(rec.id, { x: extra[0].x + 0.5, z: extra[0].z });
    assert.ok(ck.ok && ck.building === extra[0].id && ck.refund.timber === P.cost.timber, ck.reason);
    for (const b of extra) { const r = cmd({ action: 'campErase', war: rec.id, building: b.id }); assert.ok(r?.ok, r?.reason); }
    assert.ok(camp.stock.timber === t1 && !camp.buildings.some(b => extra.includes(b)), 'erased: full refund, built or site');
    const hallCk = war.campEraseCheck(rec.id, { x: hallB.x, z: hallB.z }); assert.ok(!hallCk.ok && /hall/.test(hallCk.reason), 'the camp hall cannot be erased');
    assert.ok(!war.campEraseCheck(rec.id, { x: hallB.x + 300, z: hallB.z }).ok, 'nothing under the cursor'); }
  assert.equal(gate.line, pieces[0].line, 'a gate in a run belongs to the run');
  // sites do not block; built pieces block everyone, the gate only the defender
  const solid = (x, z) => townBlockersIn(g.state.frontier, x - 0.2, z - 0.2, x + 0.2, z + 0.2, frontier).length > 0;
  g.step([]); assert.ok(!solid(pieces[0].x, pieces[0].z), 'a site is open');
  // workers sent to one piece build on along the whole run, gate included
  { const two = camp.workers.slice(0, 2).map(w => w.id);
    const r = cmd({ action: 'workerOrder', town: rec.id, workers: two, kind: 'work', target: pieces[0].id }); assert.ok(r?.ok, r?.reason);
    const todo = () => camp.buildings.filter(b => b.line === pieces[0].line && b.stage === 'site').length;
    for (let i = 0; i < 4000 && todo(); i++) g.step([]);
    assert.equal(todo(), 0, 'two workers sent to the first piece finish the run'); }
  for (const b of camp.buildings) if (b.type === 'palisade' || b.type === 'gate') { b.stage = 'built'; delete b.progress; }
  g.step([]);
  assert.ok(solid(pieces[0].x, pieces[0].z) && solid(pieces[0].x + P.length / 2, pieces[0].z), 'a built palisade blocks, with no hole between pieces');
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
