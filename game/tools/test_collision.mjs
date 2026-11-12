// War collision checkpoint (5b): buildings block the ground their art stands on (town buildings, grown houses and
// workshops, built war camp buildings), units caught inside step out, fields, roads and building sites stay open.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { terrainAt } from '../src/sim/world_data.js';
import { townBlockersIn, cellToWorld, centreCell } from '../src/sim/frontier/town_grid.js';
import { artBoxes } from '../src/sim/frontier/art_blocks.js';
import { artItem, footprint } from '../src/sim/geometry.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), settings = data('data/settings.json');
const opt = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'), frontier: { ...frontier, dev: true, railways: data('data/railways.json') } };
const g = createGame(opt), F = opt.frontier;
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: opt.district.spawns, test: { playerRyo: 5000 } });
const hero = g.state.entities[m.heroId], fw = g.frontier.world, rival = Object.keys(g.state.clans).find(c => c !== 'player');

// ---- 5b-0: the shapes --------------------------------------------------------------------------
const art = F.townArt, names = Object.entries(art).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string').map(([, v]) => v);
for (const name of new Set(names)) {
  const bs = artBoxes(F, name);
  assert.ok(Array.isArray(bs), `${name} has a blocking shape`);
  if (name === 'war_banner') { assert.equal(bs.length, 0, 'the war banner blocks nothing (Tim 2026-11-11)'); continue; }
  assert.ok(bs.length > 0 && bs.length <= 16, `${name}: a few boxes (${bs.length})`);
  if (opt.catalog.items[name].blockShape) continue;   // a hand-made outline (stockade, town hall) is cut to the art itself by the tool, not to the measured footprint
  // no blocked edge reaches beyond the art's own footprint
  const item = artItem(opt.catalog, name), f = footprint(item, opt.cutouts[`${item.kind}/${name}`]);
  for (const b of bs) assert.ok(b.minX >= -f.fa / 2 - 0.01 && b.maxX <= f.fa / 2 + 0.01 && b.minZ >= -f.fb / 2 - 0.01 && b.maxZ <= f.fb / 2 + 0.01, `${name} stays inside its art`);
}
{ const full = artBoxes(F, 'smithy'), small = artBoxes(F, 'smithy', 5), mirrored = artBoxes(F, 'smithy', 0, true);
  assert.ok(small[0].maxX - small[0].minX < full[0].maxX - full[0].minX, 'art drawn smaller blocks less');
  assert.equal(mirrored[0].minX, full[0].minZ, 'mirrored art swaps its sides'); }

// ---- a town of mine and a rival town on open plains ------------------------------------------------
const open = (x, z, r) => { for (let dx = -r; dx <= r; dx += 50) for (let dz = -r; dz <= r; dz += 50) if (terrainAt(world, x + dx, z + dz) !== 'p') return false; return true; };
const spots = [];
for (let z = 500; z < world.size.h - 500 && spots.length < 2; z += 50) for (let x = 500; x < world.size.w - 500 && spots.length < 2; x += 50) {
  if (Math.hypot(x - world.capital.x, z - world.capital.z) < 1600 || spots.some(s => Math.hypot(x - s[0], z - s[1]) < 2000)) continue;
  if (open(x, z, 500)) spots.push([x, z]);
}
const addTown = (id, owner, [x, z]) => fw.addTown({ id, name: id, region: null, owner, x, z, site: null, traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 5, stock: frontier.founding.startStock, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
const enemy = addTown('enemyTown', rival, spots[0]), mine = addTown('myTown', 'player', spots[1]);
g.step([]);
const at = (x, z, pad = 0) => townBlockersIn(g.state.frontier, x - pad, z - pad, x + pad, z + pad);
const near = (x, z, r) => townBlockersIn(g.state.frontier, x - r, z - r, x + r, z + r);
const area = bs => bs.reduce((n, b) => n + (b.maxX - b.minX) * (b.maxZ - b.minZ), 0);
const same = (a, b, why) => assert.ok(Math.abs(a - b) < 0.05, `${why}: ${a} vs ${b}`);

// the town hall blocks the ground its art stands on, not a square share of its tile
{ const hall = artBoxes(F, art.town_hall), got = near(mine.x, mine.z, 40);
  same(area(got), area(hall), 'the hall blocks exactly its art shape');
  const b = hall[0]; assert.ok(at(mine.x + (b.minX + b.maxX) / 2, mine.z + (b.minZ + b.maxZ) / 2).length, 'inside the hall art is blocked'); }

// ---- 5b-1: grown houses and workshops block; plots, fields and roads do not --------------------------
const G = mine.grid, c = centreCell(G.n), put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);
const setCell = (i, zone, stage, use = '.') => { G.ground = put(G.ground, i, 'c'); G.zone = put(G.zone, i, zone); G.stage = put(G.stage, i, String(stage)); G.use = put(G.use, i, use); };
const house = c + 6, shop = c + 9, field = c + 12, road = c + 15, plot = c + 18;
const round = i => near(...cellToWorld(mine, i), G.cell / 2 - 0.2);
setCell(house, 'h', 3); setCell(shop, 'k', 1); setCell(field, 'f', 1); setCell(road, '.', 0, 'r'); setCell(plot, 'h', 0);
g.frontier.tick?.(); g.step([]);
// the zone sim may change stages as it runs; put the cells back and look the same tick
const fresh = () => { setCell(house, 'h', 3); setCell(shop, 'k', 1); setCell(field, 'f', 1); setCell(road, '.', 0, 'r'); setCell(plot, 'h', 0); };
fresh();
assert.ok(round(house).length, 'a grown house blocks');
assert.ok(round(shop).length, 'a grown workshop blocks');
assert.equal(round(field).length, 0, 'a farm field never blocks');
assert.equal(round(road).length, 0, 'a road never blocks');
assert.equal(round(plot).length, 0, 'an empty housing plot stays open');
{ const zf = art._ground.zoneFootprint * G.cell, shape = artBoxes(F, art._zones.h.stages[2], zf);
  same(area(round(house)), area(shape), 'the house blocks its art shape at the size it is drawn'); }

// a unit standing where a house grows steps out to open ground
{ const grow = c + 21, [x, z] = cellToWorld(mine, grow);
  setCell(grow, 'h', 0); g.step([]); fresh(); setCell(grow, 'h', 0);
  const shape = artBoxes(F, art._zones.h.stages[2], art._ground.zoneFootprint * G.cell)[0];
  Object.assign(hero, { place: 'world', area: 'world', x: x + (shape.minX + shape.maxX) / 2, z: z + (shape.minZ + shape.maxZ) / 2 });
  const from = [hero.x, hero.z];
  g.step([]); fresh(); setCell(grow, 'h', 0);
  assert.equal(at(hero.x, hero.z).length, 0, 'an empty plot does not move anyone');
  Object.assign(hero, { x: from[0], z: from[1] });
  setCell(grow, 'h', 3); g.step([]); g.step([]);
  assert.equal(at(hero.x, hero.z).length, 0, 'the unit is out of the new house');
  const d = Math.hypot(hero.x - from[0], hero.z - from[1]);
  assert.ok(d > 0 && d < 12, `it stepped to the nearest open ground (${d.toFixed(1)})`); }

// ---- 5b-2: war camp buildings block once built; sites stay open ----------------------------------------
{ const W = F.war, ring = frontier.tiers.list[0].ring, mid = ring + (W.band.inner + W.band.outer) / 2, hx = enemy.x + mid, hz = enemy.z;
  Object.assign(hero, { x: hx, z: hz, place: 'world', area: 'world' });
  g.step([{ id: hero.id, type: 'frontier', action: 'plantBanner', town: 'enemyTown', x: hx, z: hz }]);
  const rec = Object.values(g.state.frontier.wars.list)[0];
  assert.ok(rec?.camp, 'the war camp stands');
  g.step([]); g.step([]);
  const hall = rec.camp.buildings.find(b => b.type === 'camp_hall');
  same(area(near(hall.x, hall.z, 14)), area(artBoxes(F, art.camp_hall, 11 * art._placedFootprint.camp_hall)), 'the camp hall blocks its art shape');
  assert.equal(at(hero.x, hero.z).length, 0, 'the hero who planted the banner is not left inside the hall');
  const bx = hall.x + 40, bz = hall.z, site = { id: 'site1', type: 'barracks', stage: 'site', x: bx, z: bz, progress: 0, need: 1e9 };
  rec.camp.buildings.push(site); g.step([]); g.step([]);
  assert.equal(near(bx, bz, 12).length, 0, 'a building site stays open');
  site.stage = 'built'; delete site.progress; delete site.need; g.step([]); g.step([]);
  const shape = artBoxes(F, art.barracks, 11 * art._placedFootprint.barracks);
  same(area(near(bx, bz, 14)), area(shape), 'the built barracks blocks its art shape');
  // trained troops appear just outside their building, never inside it
  const r = (W.buildings.barracks.radius || 0) + 2;
  for (let k = 0; k < 12; k++) assert.equal(at(bx + Math.cos(k * Math.PI / 6) * r, bz + Math.sin(k * Math.PI / 6) * r).length, 0, `spawn point ${k} is outside the barracks`);
  for (const [type, def] of Object.entries(W.buildings)) {
    const s2 = artBoxes(F, art[type], 11 * (art._placedFootprint[type] || 0)), rr = (def.radius || 0) + 2;
    if (!s2) continue;
    for (let k = 0; k < 12; k++) { const x = Math.cos(k * Math.PI / 6) * rr, z = Math.sin(k * Math.PI / 6) * rr;
      assert.ok(!s2.some(b => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ), `${type}: spawn point ${k} is outside its art`); }
  }
}
// ---- 5b-3: a group move works out one route; the group ends in a loose spread ----------------------------
{ const rec = Object.values(g.state.frontier.wars.list)[0], hall = rec.camp.buildings.find(b => b.type === 'camp_hall'), war = g.frontier.war;
  const sx = hall.x, sz = hall.z + 45, ids = [];
  const before = new Set(Object.keys(g.state.entities));
  for (let k = 0; k < 20; k++) war.spawnTroop(rec, 'grunt', sx + (k % 5) * 1.5, sz + Math.floor(k / 5) * 1.5);
  for (const id of Object.keys(g.state.entities)) if (!before.has(id)) ids.push(id);
  assert.equal(ids.length, 20, 'twenty troops stand ready');
  Object.assign(hero, { x: sx - 4, z: sz, place: 'world', area: 'world' });
  g.step([]);
  const nav = g.areas.nav, find = nav.findPath; let searches = 0;
  nav.findPath = (...a) => { searches++; return find(...a); };
  const tx = sx + 10, tz = sz + 70, order = () => g.step([{ id: hero.id, type: 'order', kind: 'move', units: ids, x: tx, z: tz }]);
  order();
  const units = ids.map(id => g.state.entities[id]), spots = units.map(u => [u.order.x, u.order.z]);
  assert.ok(units.every(u => u.order?.kind === 'move' && u.order.group), 'every unit took the group order');
  assert.equal(searches, 1, `one route for the whole group (${searches} searches)`);
  const G = opt.units.rules.groupMove, R = (G.spacing * 0.7 * Math.sqrt(20) + G.spacing * G.jitter) * 1.5 + 1;
  for (const [x, z] of spots) assert.ok(Math.hypot(x - tx, z - tz) <= R, 'every place is inside the spread');
  for (let i = 0; i < spots.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) > G.spacing * 0.7, 'no two units share a place, each has room');
  // no rows: the old block put every unit on one of five lines each way
  assert.ok(new Set(spots.map(p => p[0].toFixed(2))).size > 8, 'the spread is not a block of rows');   // 7c: the spread is twice as tight, so two decimals
  const at0 = units.map(u => [u.x, u.z]);
  order();
  assert.deepEqual(units.map(u => [u.order.x, u.order.z]), spots, 'the same order gives the same places again');
  for (let i = 0; i < 500; i++) g.step([]);
  nav.findPath = find;
  units.forEach((u, i) => assert.ok(u.dead || Math.hypot(u.x - spots[i][0], u.z - spots[i][1]) < 2.5, `unit ${i} reached its place (${Math.hypot(u.x - spots[i][0], u.z - spots[i][1]).toFixed(1)} away, from ${at0[i].map(v => v.toFixed(0))})`));
  assert.ok(searches <= 6, `the walk needed few searches (${searches})`);
}
console.log('test_collision: ok');
