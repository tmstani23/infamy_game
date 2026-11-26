// Z4a: the default castle stamped on the town grid (sim/frontier/castle.js, data/castle_default.json).
//   node game/tools/test_castle.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { addCastle, castleIndex, CASTLE_BLOCK } from '../src/sim/frontier/castle.js';
import { centreCell, townCellBoxes } from '../src/sim/frontier/town_grid.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const bp = JSON.parse(readFileSync(new URL('../data/castle_default.json', import.meta.url)));
function castle(rot = 0, kind = 'yakuza') {
  const state = { tick: 0 }, world = createFrontierWorld({ state, data });
  return addCastle({ world, data, bp, id: 'castle_a', name: 'Castle', owner: 'a', x: 5000, z: 5000, rot, kind });
}
const count = (str, ch) => str.split(ch).length - 1;

const s = castle(), g = s.grid, n = g.n, at = castleIndex(bp, n, 0);
assert.ok(s.castle && s.tier === 3 && s.owner === 'a');
assert.ok(s.capital && s.founded === undefined, 'a castle is its clan capital, not a founded town');
assert.equal(g.use[centreCell(n)], 'B'); assert.equal(s.buildings[0].type, 'town_hall'); assert.equal(s.buildings[0].cell, centreCell(n));
assert.equal(at(...bp.hall), centreCell(n), 'the keep is the middle of the grid');
// every building stands, on its own cells, on B cells only
const seen = new Set();
for (const b of s.buildings) { assert.equal(b.stage, 'built'); for (const i of b.cells || [b.cell]) { assert.equal(g.use[i], 'B', `${b.type} cell`); assert.ok(!seen.has(i), `${b.type} overlaps`); seen.add(i); } }
assert.equal(count(g.use, 'B'), seen.size);
const types = s.buildings.map(b => b.type);
for (const t of ['clan_hall', 'kennel', 'armory', 'foundry', 'supply_tents', 'field_clinic', 'barracks', 'rifle_range', 'stable', 'market', 'station']) assert.ok(types.includes(t), `has ${t}`);
assert.equal(types.filter(t => t === 'watchtower').length, 16); assert.equal(types.filter(t => t === 'stockade').length, 2);
assert.ok(castle(0, 'ninja').buildings.some(b => b.type === 'hidden_dojo'), 'the clan slot takes the clan special');
const st = s.buildings.find(b => b.type === 'station'); assert.equal(st.cells.length, 6); assert.equal(st.rot, 0);

// --- who can walk where: a flood from the open ground south of the drawbridge -------------------------------
// open(i): free ground and roads; gates count as open when `gates` says so, walls when `walls` says so (broken)
function reach(S, { gates = () => true, walls = () => false } = {}, rot = 0) {
  const G = S.grid, N = G.n, A = castleIndex(bp, N, rot), start = A(13, 29), seenC = new Uint8Array(N * N), stack = [start];
  // a terrace edge is a thin cliff on the cell line: no step between two levels except off the top of a land bridge
  const edge = (i, j) => { const a = G.level[i], b = G.level[j]; return a === b || a === '.' || b === '.' || G.slope[i] !== '.' || G.slope[j] !== '.'; };
  const open = i => G.use[i] === '.' || G.use[i] === 'r' || (G.use[i] === 'g' && gates(i)) || (G.use[i] === 'w' && walls(i));
  assert.ok(open(start)); seenC[start] = 1;
  // stay inside the blueprint box (plus a rim on the land sides), so the test sea is not walked round
  const inBox = new Set(); for (let z = 3; z < bp.size[1] + 3; z++) for (let x = -3; x < bp.size[0] + 3; x++) inBox.add(A(x, z));
  while (stack.length) { const i = stack.pop(), c = i % N;
    for (const j of [c > 0 ? i - 1 : -1, c < N - 1 ? i + 1 : -1, i - N, i + N]) if (j >= 0 && j < N * N && !seenC[j] && inBox.has(j) && open(j) && edge(i, j)) { seenC[j] = 1; stack.push(j); } }
  return (x, z) => !!seenC[A(x, z)];
}
const idsOf = rect => { const out = new Set(); for (let z = rect[1]; z < rect[3]; z++) for (let x = rect[0]; x < rect[2]; x++) out.add(at(x, z)); return out; };
const gate = id => idsOf(bp.gates.find(x => x.id === id).rect), inner = idsOf(bp.terraces[0].gate), keep = idsOf(bp.terraces[1].gate);
const YARD = [5, 23], TERRACE = [9, 19], KEEP = [12, 17], HARBOUR = [13, 4], RIM = [-2, 20];
// all gates shut: the moat keeps everyone on the two bridges
let r = reach(s, { gates: () => false });
assert.ok(r(12, 27) && r(26, 10), 'both bridges are walked'); assert.ok(r(...RIM), 'the land round the moat');
assert.ok(!r(...YARD) && !r(...TERRACE) && !r(...KEEP));
// the land gate broken: the yard, not the terrace
r = reach(s, { gates: i => gate('land_gate').has(i) });
assert.ok(r(...YARD) && r(4, 16), 'the yard and the foot of the west land bridge'); assert.ok(!r(...TERRACE) && !r(...KEEP));
// the rail gate alone also opens the yard (the second, weaker way in)
assert.ok(reach(s, { gates: i => gate('rail_gate').has(i) })(...YARD));
// every wall in the castle broken, the inner gate still shut: the cliff holds, no way up
r = reach(s, { gates: i => gate('land_gate').has(i), walls: () => true });
assert.ok(r(...YARD) && !r(...TERRACE) && !r(...KEEP), 'cliffs cannot be broken');
// inner gate open: the terrace, not the keep; keep gate open too: the keep
r = reach(s, { gates: i => gate('land_gate').has(i) || inner.has(i) });
assert.ok(r(...TERRACE) && r(12, 10) && !r(...KEEP));
r = reach(s, { gates: i => gate('land_gate').has(i) || inner.has(i), walls: () => true });
assert.ok(!r(...KEEP), 'the keep cliff holds with its wall down');
r = reach(s, {});
assert.ok(r(...KEEP) && r(...TERRACE) && r(...YARD), 'all gates open: the keep');
assert.ok(r(...HARBOUR), 'the harbour gate leads out to the pier');
// no land reaches the pier: with the harbour gate shut the strip by the sea is cut off
assert.ok(!reach(s, { gates: i => !gate('harbour_gate').has(i) })(...HARBOUR));
// every building has open ground beside it that the flood reaches with all gates open
for (const b of s.buildings) { const cs = b.cells || [b.cell];
  assert.ok(cs.some(i => [i - 1, i + 1, i - n, i + n].some(j => { const x = j % n, z = Math.floor(j / n), c = (n - 1) / 2; return r(x - c + bp.hall[0], z - c + bp.hall[1]); })), `${b.type} at ${b.cell} can be reached`); }

// --- turned: the same castle, the sea side to the east, south, west ------------------------------------------
for (const rot of [1, 2, 3]) {
  const t = castle(rot);
  for (const ch of ['w', 'g', 'm', 'k', 'B']) assert.equal(count(t.grid.use, ch), count(g.use, ch), `rot ${rot}: as many ${ch} cells`);
  assert.equal(t.castle.rot, rot); assert.equal(t.buildings.find(b => b.type === 'station').rot, rot);
  const rr = reach(t, {}, rot); assert.ok(rr(...KEEP), `rot ${rot}: the keep is reached`);
  assert.ok(!reach(t, { gates: () => false }, rot)(...YARD));
}
{ const t = castle(1), A = castleIndex(bp, n, 1), c = (n - 1) / 2, i = A(12, 2);   // the pier, 14 cells north of the hall
  assert.deepEqual([i % n - c, Math.floor(i / n) - c], [14, 0], 'a quarter turn puts the sea side east'); assert.equal(t.grid.use[i], '.'); }

// --- moat and cliff cells are solid for everyone ---------------------------------------------------------------
const boxes = townCellBoxes(s, data);
const solid = (x, z) => (boxes.get(at(x, z)) || []).length > 0;
assert.ok(solid(1, 20), 'moat');
// thin cliffs: the terrace's west ring cell carries a thin solid edge on its low (west) side beside its wall; the keep's too
{ const thinX = (x, z) => (boxes.get(at(x, z)) || []).filter(b => b.maxX - b.minX <= 1.01 && b.maxZ - b.minZ > 10);
  const c0 = s.x + (at(7, 12) % n - (n - 1) / 2) * g.cell;
  assert.ok(thinX(7, 12).some(b => Math.abs(b.minX - (c0 - g.cell / 2)) < 1e-6), 'inner terrace cliff edge'); assert.ok(thinX(10, 17).length > 0, 'keep cliff edge');
  assert.equal(thinX(7, 16).length, 0, 'no cliff across the top of the land bridge'); assert.equal(count(g.use, 'k'), 0); }
assert.ok(!solid(12, 27), 'the drawbridge is open ground'); assert.ok(!solid(5, 16), 'the land bridge is open ground');
assert.ok(CASTLE_BLOCK.includes('m') && CASTLE_BLOCK.includes('k'));
// a castle gate is open only in its doorway (2026-11-20): the run's ends beside the gatehouse block like wall
{ const D = data.townGrid.castleGateDoor, ids = [...gate('land_gate')], bs = ids.flatMap(i => boxes.get(i) || []);
  assert.equal(bs.length, 2, 'one wall box each side of the doors');
  const cx = ids.reduce((t, i) => t + s.x + (i % n - (n - 1) / 2) * g.cell, 0) / ids.length, cz = s.z + (Math.floor(ids[0] / n) - (n - 1) / 2) * g.cell;
  const inside = (x, z) => bs.some(b => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
  assert.ok(!inside(cx, cz) && !inside(cx + D / 2 - 0.1, cz) && !inside(cx - D / 2 + 0.1, cz), 'the doorway is open');
  assert.ok(inside(cx + D / 2 + 1, cz) && inside(cx - D / 2 - 1, cz) && inside(cx + g.cell - 0.5, cz), 'beside the doors is wall'); }

{ const { drawableTowns, drawableWarSites } = await import('../src/town_props.js'), fr = { settlements: { castle_a: s } };
  assert.equal(drawableTowns(fr, 'a').length, 1); assert.equal(drawableWarSites(fr, 'b').length, 1); }
// the drawing: no castle tiles any more; the terraces, cliffs and land bridges are raised ground (Z4h, below)
{ const { townCellsToProps } = await import('../src/town_props.js');
  const props = townCellsToProps(s.grid, data.townArt, {});
  assert.equal(props.filter(p => p.key?.includes('castle:')).length, 0, 'no grey block tiles');
  assert.equal(count(g.level, '2') > 0 && count(g.level, '1') > count(g.level, '2'), true);
  assert.ok(!props.some(p => p.key?.endsWith(':clear') && 'mk'.includes(g.use[p.cell])), 'no dirt patches on the moat or cliffs'); }

// --- Z4h: land bridges (ramps), fenced at their sides --------------------------------------------------------------
{ assert.equal(s.castle.ramps.length, 2);
  const inner = s.castle.ramps.find(r => r.id === 'inner'), keep = s.castle.ramps.find(r => r.id === 'keep');
  assert.ok(inner.dir === 'E' && inner.lo === 0 && inner.hi === 1 && inner.len === 2 && inner.cells.length === 6, 'inner land bridge rises east from the yard');
  assert.ok(keep.dir === 'S' && keep.lo === 1 && keep.hi === 2 && keep.len === 2 && keep.cells.length === 4, 'keep land bridge rises south from the inner terrace');
  assert.equal(count(g.slope, '.'), n * n - 10);
  // its long sides are a thin solid edge, its middle and ends open
  const bx = i => boxes.get(i) || [];
  const side = bx(at(6, 15)), mid = bx(at(6, 16)), end = bx(at(5, 16));
  assert.equal(side.length, 1, 'north side of the inner land bridge'); assert.ok(side[0].maxZ - side[0].minZ <= 1.01);
  assert.equal(mid.length, 0, 'middle of the land bridge is open'); assert.equal(end.length, 0, 'its low end is open');
  // turned, the ramp turns with it
  assert.equal(castle(2).castle.ramps.find(r => r.id === 'inner').dir, 'W'); assert.equal(castle(1).castle.ramps.find(r => r.id === 'keep').dir, 'W'); }

// --- Z4h: the drawn height of the castle (src/castle_height.js) ----------------------------------------------------
{ const { townProps } = await import('../src/town_props.js'), H = data.townArt._castle.levelHeight;
  const { createHeightField, terrainPieces, setHeightField, groundY, nearCastle, maxGroundY } = await import('../src/castle_height.js');
  const props = townProps([s], data.townArt), cw = props.castleWater[0];
  assert.ok(cw.level && cw.slope && cw.ramps.length === 2 && props.castleArt?.pieces, 'castle levels and ramps go to the drawing');
  const f = createHeightField(props.castleWater, { levelHeight: H }), mid = (n - 1) / 2;
  const w = (x, z) => { const i = at(x, z); return [s.x + (i % n - mid) * g.cell, s.z + (Math.floor(i / n) - mid) * g.cell]; };
  assert.equal(f.at(...w(5, 23)), 0, 'yard'); assert.equal(f.at(...w(9, 19)), H, 'inner terrace'); assert.equal(f.at(...w(12, 17)), 2 * H, 'keep');
  assert.equal(f.at(...w(7, 12)), H, 'the terrace wall ring at its terrace height'); assert.equal(f.at(...w(1, 20)), 0, 'moat');
  assert.equal(f.at(s.x + 2000, s.z), 0, 'off the castle');
  const [rx0, rz] = w(5, 16), [rx1] = w(6, 16), lo = f.at(rx0 - g.cell / 2 + 0.01, rz), hi = f.at(rx1 + g.cell / 2 - 0.01, rz);
  assert.ok(lo < 0.1 && Math.abs(hi - H) < 0.1, `inner land bridge climbs 0 to ${H} (${lo.toFixed(2)}..${hi.toFixed(2)})`);
  assert.ok(Math.abs(f.at(...w(5, 16)) - H * 0.5 / 2) < 1e-6, 'smooth along the ramp');
  const [kx, kz0] = w(13, 11), [, kz1] = w(13, 12);
  assert.ok(Math.abs(f.at(kx, kz0 - g.cell / 2 + 0.01) - H) < 0.1 && Math.abs(f.at(kx, kz1 + g.cell / 2 - 0.01) - 2 * H) < 0.1, 'keep land bridge climbs a level');
  assert.equal(f.max, 2 * H);
  const pc = terrainPieces(f.list[0], H);
  assert.ok(pc.top1.length > 100 && pc.top2.length > 30 && pc.rim.length === 0 && pc.ramp.length === 10 && pc.face.length > 35);
  assert.ok(pc.face.every(q => q.side === 'E' || q.side === 'S'), 'only the faces the camera sees');
  assert.equal(s.castle.pier.length, 24); assert.equal(pc.pier.length, 24 * 16, 'the dock deck is drawn as planks');
  { const { DOCK } = await import('../src/dock_shape.js'), d = f.list[0].dock;
    assert.ok(d && d.land.length >= 1 && d.water.length === 3, `dock edges: land ${d?.land.length}, water ${d?.water.length}`);
    assert.ok(pc.dockPile.length > 100 && pc.dockBeam.length > 0 && pc.dockDark.length > 0 && pc.dockWet.length > 0, 'piles, beam and bracing');
    const pi = s.castle.pier[0], [px, pz] = [s.x + (pi % n - mid) * g.cell, s.z + (Math.floor(pi / n) - mid) * g.cell];
    const ys = s.castle.pier.map(i => f.at(s.x + (i % n - mid) * g.cell, s.z + (Math.floor(i / n) - mid) * g.cell));
    assert.ok(Math.max(...ys) === DOCK.deck && Math.min(...ys) > DOCK.lip - 1e-9 && Math.min(...ys) < DOCK.deck, `the deck rises off the land (${Math.min(...ys).toFixed(2)}..${Math.max(...ys)})`);
    assert.equal(f.max, 2 * H, 'the dock is lower than the keep'); } assert.ok(s.castle.pier.every(i => g.use[i] === '.'));
  assert.ok(pc.face.every(q => q.q[0][1] > q.q[3][1] - 1e-9 && q.q[1][1] >= q.q[2][1] - 1e-9), 'faces run from the top down');
  // the south face of the inner terrace stands from the yard to the terrace top; the land bridge has side faces
  assert.ok(pc.face.some(q => q.cell === at(9, 22) && q.side === 'S' && Math.abs(q.q[0][1] - H) < 1e-9 && Math.abs(q.q[3][1]) < 1e-9));
  assert.ok(pc.rampFace.some(q => q.cell === at(6, 17) && q.side === 'S') && !pc.face.some(q => q.cell === at(6, 17)), 'the land bridge side shows a cut-stone face');
  // 2026-11-20 stone ramp: steps run across the climb, a low parapet on each open side, capped at its ends
  assert.ok(pc.ramp.every(q => q.uvw?.length === 4), 'land bridge steps follow the climb');
  assert.ok(pc.parapet.length >= 10 * 3, 'parapets along the land bridges');
  setHeightField(f); assert.equal(groundY(...w(12, 17)), 2 * H); assert.ok(nearCastle(...w(5, 23), 0)); assert.equal(maxGroundY(), 2 * H);
  setHeightField(null); assert.equal(groundY(...w(12, 17)), 0);
  // a rival castle's moat and cliffs show with its ground, before its buildings are seen
  const { maskGrid } = await import('../src/sim/sightings.js'), m = maskGrid(g, null);
  assert.equal(count(m.use, 'm'), count(g.use, 'm')); assert.equal(count(m.use, 'k'), count(g.use, 'k')); assert.equal(count(m.use, 'B'), 0); assert.equal(m.level, g.level); }

// --- in a campaign game: the player's castle stands on the East Plains cape -----------------------------------
{ const { createGame } = await import('../src/sim/game.js'), { setupMatch } = await import('../src/sim/setup_match.js');
  const file = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
  const frontier = { ...data, castleBlueprint: bp, campaignZones: file('data/campaign_zones.json'), fixtureTowns: false };
  const options = { district: file('data/port_town.json'), catalog: file('data/art.json'), cutouts: file('art/cutouts.json'), interiors: file('data/interiors.json'),
    parts: file('data/interior_parts.json'), recipes: file('data/room_recipes.json'), units: file('data/units.json'), civilians: file('data/civilians.json'),
    bandits: file('data/bandits.json'), police: file('data/police.json'), settings: file('data/settings.json'), world: file('data/world.json'),
    worldChunks: file('data/world_chunks.json'), frontier, resourceSpots: file('data/world_spots.json'), resourceSpotRules: file('data/resource_spots.json') };
  const game = createGame(options);
  setupMatch(game, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: file('data/bots.json'), spawns: options.district.spawns, seed: 77 });
  const c = game.castles.castleOf('player');
  assert.ok(c && c.castle.rot === 2 && c.x === 13055 && c.z === 2180, 'the player castle, dock facing south');
  assert.equal(game.castles.place('player', 'east_plains'), c, 'one castle a clan');
  for (let k = 0; k < 60; k++) game.step([]);
  assert.ok(game.state.frontier.settlements[c.id]?.castle, 'it survives the frontier ticks');
  assert.equal(c.stock.ryo, game.state.clans.player.ryo, 'its ryo is the clan treasury');
  assert.equal(game.landOffice.townsOf('player'), 0, 'not a town for the founding limit');
  // Z4h high ground: a shooter on a higher terrace reaches a little further down, never up
  { const A2 = castleIndex(bp, c.grid.n, 2), m2 = (c.grid.n - 1) / 2, w = (x, z) => { const i = A2(x, z); return { x: c.x + (i % c.grid.n - m2) * c.grid.cell, z: c.z + (Math.floor(i / c.grid.n) - m2) * c.grid.cell, place: 'world' }; };
    const yard = w(5, 23), inner = w(9, 19), keep = w(12, 17), per = bp.highGround.rangePerLevel;
    assert.equal(game.castles.levelAt(yard.x, yard.z), 0); assert.equal(game.castles.levelAt(inner.x, inner.z), 1); assert.equal(game.castles.levelAt(keep.x, keep.z), 2);
    assert.ok(Math.abs(game.castles.rangeScale(inner, yard) - (1 + per)) < 1e-9 && Math.abs(game.castles.rangeScale(keep, yard) - (1 + 2 * per)) < 1e-9);
    assert.equal(game.castles.rangeScale(yard, keep), 1); assert.equal(game.castles.rangeScale({ ...inner, place: 'street' }, yard), 1); }
  // its ground fits the island: every castle cell north of the dock strip stands on plain
  const { terrainAt } = await import('../src/sim/world_data.js');
  const A = castleIndex(bp, c.grid.n, 2), mid = (c.grid.n - 1) / 2;
  for (let z = 6; z < bp.size[1]; z++) for (let x = 0; x < bp.size[0]; x++) { const i = A(x, z);
    assert.equal(terrainAt(options.world, c.x + (i % c.grid.n - mid) * c.grid.cell, c.z + (Math.floor(i / c.grid.n) - mid) * c.grid.cell), 'p', `castle cell ${x},${z} on plain`); }
  // the castle_test dev save (make_dev_save.mjs): the hero starts in front of the drawbridge and walks to it
  { const { build } = await import('./make_dev_save.mjs'), { loadSave, heroOf } = await import('../src/sim/save.js');
    const file2 = build('castle_test', { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 20, realGame: true, castleTest: true, castleTour: true });
    const t = createGame(options); loadSave(t, file2);
    const h = t.state.entities[heroOf(t)], p = t.castles.approach('player');
    assert.equal(h.place, 'world'); assert.ok(Math.hypot(h.x - p.x, h.z - p.z) < 2); assert.ok(p.z < c.z - 120, 'north of the castle, the land side');
    for (let k = 0; k < 40; k++) t.step([{ id: h.id, type: 'move', right: 0, down: 1 }]);
    assert.ok(h.z > p.z + 3 && h.place === 'world', 'walks toward the drawbridge');
    // every castle's dock is walkable end to end (2026-11-20: stuck right past the snow castle's harbour gate, the
    // island's sea under the planks blocked), and the sea beside it still blocks
    const { cellToWorld } = await import('../src/sim/frontier/town_grid.js');
    const walkTo = (pts, max = 400) => { for (const [x, z] of pts) for (let k = 0; k < max; k++) { const vx = x - h.x, vz = z - h.z, l = Math.hypot(vx, vz); if (l < 1.5) break;
      t.step([{ id: h.id, type: 'move', right: (vx - vz) / l / Math.SQRT2, down: (vx + vz) / l / Math.SQRT2 }]); } return h; };
    const tour = Object.values(t.state.frontier.settlements).filter(s => s.castle);
    assert.equal(tour.length, 5, 'castle_test shows all five castles');
    for (const s of tour) { const I = castleIndex(bp, s.grid.n, s.castle.rot), W = (x, z) => cellToWorld(s, I(x, z));
      const mid = r => { const [a, b] = [W(12, r), W(13, r)]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
      for (const col of [11, 14]) { Object.assign(h, { x: mid(8)[0], z: mid(8)[1] });
        const end = W(col, 0); walkTo([mid(7), mid(5), end]);
        assert.ok(Math.hypot(h.x - end[0], h.z - end[1]) < 2, `${s.id}: the far corner of the dock (column ${col}) is reachable`); }
      const side = W(9, 3); walkTo([W(11, 3), side], 120);
      assert.ok(Math.hypot(h.x - side[0], h.z - side[1]) > 8, `${s.id}: the sea beside the dock blocks`); } }
  const none = createGame(options); setupMatch(none, { clan: 'yakuza', difficulty: 'easy', mode: 'classic', bots: file('data/bots.json'), spawns: options.district.spawns, seed: 77 });
  assert.equal(none.castles?.castleOf('player') ?? null, null, 'classic: no castle'); }

// --- the moat is painted as real water; the castle spots are clear of the island's trees and rocks ---------------
{ const { createPaint } = await import('../src/world_paint.js'), { townProps } = await import('../src/town_props.js');
  const { castleClearings } = await import('../src/sim/castles.js'), { buildChunk } = await import('../src/sim/chunk_gen.js');
  const file = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
  const world = file('data/world.json'), chunks = file('data/world_chunks.json'), paintCfg = { ...file('data/world_paint.json'), ...file('data/world_crossings.json') };
  const t = castle(2); t.x = 13055; t.z = 2180;   // the East Plains castle, dock south
  const A = castleIndex(bp, t.grid.n, 2), mid = (t.grid.n - 1) / 2, at2 = (x, z) => { const i = A(x, z); return [t.x + (i % t.grid.n - mid) * 11, t.z + (Math.floor(i / t.grid.n) - mid) * 11]; };
  const paint = createPaint(world, paintCfg), props = townProps([t], data.townArt);
  assert.equal(props.castleWater.length, 1);
  assert.ok(paint.waterAt(...at2(1, 20)) < 0.5, 'plain before the moat is set');
  paint.setExtraWater(props.castleWater);
  assert.ok(paint.waterAt(...at2(1, 20)) > 0.9, 'west moat is water'); assert.ok(paint.waterAt(...at2(10, 26)) > 0.9, 'south moat'); assert.ok(paint.waterAt(...at2(12, 26)) < 0.1, 'the drawbridge is dry');
  assert.ok(paint.waterAt(...at2(5, 23)) < 0.1, 'the yard is dry'); assert.ok(paint.waterAt(...at2(9, 19)) < 0.1);
  const [ex, ez] = at2(2.5, 20), [wx] = at2(4.5, 20); void wx;
  assert.ok(Math.abs(paint.waterAt(ex, ez) - 0.5) < 0.2, 'the moat bank is the cell edge');
  assert.ok(!props.some(p => p.key?.includes('castle:m')), 'no moat tiles: the ground paints it');
  paint.setExtraWater([]);
  const boxes = castleClearings(world, { ...data, castleBlueprint: bp, campaignZones: file('data/campaign_zones.json') });
  assert.equal(boxes.length, 5);
  const e = boxes[0]; assert.ok(e.maxX - e.minX > 303 && e.maxX - e.minX < 313 && e.maxZ - e.minZ > 336 && e.maxZ - e.minZ < 346);
  const w2 = { ...world, castleClear: boxes }, cfg = { ...chunks, paint: paintCfg };
  let inside = 0, before = 0;
  for (let cx = Math.floor(e.minX / cfg.chunk); cx <= Math.floor(e.maxX / cfg.chunk); cx++) for (let cz = Math.floor(e.minZ / cfg.chunk); cz <= Math.floor(e.maxZ / cfg.chunk); cz++) {
    const inBox = p => p.x > e.minX && p.x < e.maxX && p.z > e.minZ && p.z < e.maxZ;
    before += buildChunk(world, cfg, cx, cz, 1).props.filter(inBox).length;
    inside += buildChunk(w2, cfg, cx, cz, 1).props.filter(p => inBox(p) && !p.art && !p.feature).length; }
  assert.equal(inside, 0, `no generated props on the castle spot (${before} before)`); }

console.log('test_castle: ok');
