// Fishing poles (Tim 2026-11-23/24): rich fishing grounds sit on open shore, fish spot boats float on the water,
// bollards stand on the bank, and every fish spot has a cast point out on open water clear of its boats.
// Run: node game/tools/test_fishing.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { terrainAt, passable } from '../src/sim/world_data.js';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { workerPresentation } from '../src/worker_details.js';
const root = new URL('../data/', import.meta.url);
const world = JSON.parse(readFileSync(new URL('world.json', root), 'utf8'));
const spots = JSON.parse(readFileSync(new URL('world_spots.json', root), 'utf8')).spots;
const wet = (x, z) => 'wr'.includes(terrainAt(world, x, z));
const wetWithin = (x, z, d) => { for (let r = 0; r <= d; r += 0.5) for (let a = 0; a < 36; a++) { const t = a / 36 * Math.PI * 2; if (wet(x + Math.cos(t) * r, z + Math.sin(t) * r)) return true; } return false; };
let fails = 0; const fail = m => { fails++; console.error('FAIL', m); };

// 1. every rich fishing ground stands on walkable shore with water close by
for (const n of world.nodes.filter(n => n.kind === 'fishing')) {
  if (wet(n.x, n.z) || !passable(world, n.x, n.z)) fail(`${n.id} not on walkable land`);
  if (!wetWithin(n.x, n.z, 10)) fail(`${n.id} more than 10 units from water`);
}
// 2. fish spots: boats on water, bollards on land, a cast point on water clear of the boats, workers can stand at the centre
const fish = spots.filter(s => s.kind === 'fish');
let cast = 0;
for (const s of fish) {
  if (!s.cast) { fail(`${s.id} has no cast point`); continue; }
  cast++;
  const cx = s.x + s.cast[0], cz = s.z + s.cast[1];
  if (!wet(cx, cz)) fail(`${s.id} cast point on land`);
  if (wet(s.x, s.z)) fail(`${s.id} centre in the water`);
  const boats = s.pieces.filter(p => p[2] === 0), bollards = s.pieces.filter(p => p[2] === 1);
  for (const [dx, dz] of boats) {
    if (!wet(s.x + dx, s.z + dz)) fail(`${s.id} boat at ${dx},${dz} on land`);
    if (Math.hypot(s.x + dx - cx, s.z + dz - cz) < 2.2) fail(`${s.id} boat in the cast lane`);
  }
  for (const [dx, dz] of bollards) if (wet(s.x + dx, s.z + dz)) fail(`${s.id} bollard at ${dx},${dz} in the water`);
  if (Math.hypot(...s.cast) > 14) fail(`${s.id} casts ${Math.hypot(...s.cast).toFixed(1)} units, too far`);
}
// 3. sim: a worker harvesting a fish spot gets a cast point on its trip (spread per worker), and while it harvests it is
// shown standing (idle, no hammer) facing the water with fishing set; a timber worker still swings its hammer
{
  const data = JSON.parse(readFileSync(new URL('frontier.json', root), 'utf8'));
  data.townArt._placedFootprint.town_hall = 1; delete data.storage; data.settlements = {}; data.roads = {}; data.rates.food = 0; data.rates.growthTicks = 1e9; data.rates.maxBuilders = 1; data.mood.reviewTicks = 1e9;
  Object.assign(data.workers, { trainTicks: 2, speed: 20, harvestTicks: 40, load: 3, clearTicks: 5 });
  const list = [{ id: 'fish', kind: 'fish', x: 1000, z: 1020, cast: [0, 9] }, { id: 'wood', kind: 'timber', x: 1010, z: 1000 }];
  const spotData = { seed: 31, chunkSize: 250, spots: list.map(p => ({ ...p, pieces: [[0, 0, 0], [1, 0, 1]], deposit: null })), byChunk: {} };
  for (const p of spotData.spots) (spotData.byChunk[`c${Math.floor(p.x / 250)}_${Math.floor(p.z / 250)}`] ||= []).push(p.id);
  const state = { tick: 0 }, fr = createFrontier({ state, data, spotData, spotRules: null });
  fr.world.addTown({ id: 't', name: 'Test', owner: 'p', region: null, x: 1000, z: 1000, pop: 8, stock: { food: 100, timber: 100, stone: 100, goods: 100, ryo: 100 }, buildings: [{ type: 'town_hall', cell: 0 }] });
  const s = fr.world.settlement('t');
  const send = c => { fr.command({ owner: 'p' }, { type: 'frontier', town: 't', ...c }); return state.frontier.receipts.at(-1); };
  const run = n => { for (let i = 0; i < n; i++) { state.tick++; fr.tick(); } };
  assert.equal(send({ action: 'train', count: 3 }).ok, true); run(8);
  const [a, b, c] = s.workers;
  assert.equal(send({ action: 'assign', workers: [a.id, b.id], spot: 'fish' }).ok, true);
  assert.equal(send({ action: 'assign', workers: [c.id], spot: 'wood' }).ok, true);
  run(3);
  assert.ok(a.trip?.cast && b.trip?.cast, 'fish trips carry a cast point');
  assert.ok(Math.hypot(a.trip.cast[0] - 1000, a.trip.cast[1] - 1029) <= 3, 'cast point near the spot cast');
  assert.equal(c.trip?.cast, undefined, 'timber trips cast nothing');
  while (!(a.elapsed >= a.trip.out)) run(1);
  run(1);
  const pa = workerPresentation(a, s, data), pc = workerPresentation(c, s, data);
  assert.equal(pa.anim, 'idle'); assert.deepEqual(pa.fishing, a.trip.cast);
  if (c.trip && c.elapsed >= c.trip.out && c.elapsed < c.trip.out + c.trip.harvest) { assert.equal(pc.anim, 'hammer'); assert.equal(pc.fishing, undefined); }
  const saved = JSON.parse(JSON.stringify(a.trip)); assert.deepEqual(saved.cast, a.trip.cast);
}
console.log(`${world.nodes.filter(n => n.kind === 'fishing').length} fishing grounds, ${fish.length} fish spots, ${cast} with cast points`);
if (fails) { console.error(`${fails} failures`); process.exit(1); }
console.log('test_fishing: all passed');
