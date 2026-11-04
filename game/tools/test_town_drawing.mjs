// L3.7: presentation follows saved grid/spot state through the actual snapshot boundary.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { townCellsToProps, townProps, townSignature } from '../src/town_props.js';
import { spotPiecesToProps, visibleSpots, coveredBySpot, spotInfo } from '../src/resource_spot_props.js';
import { makeSpotIndex } from '../src/sim/resource_spots.js';
import { placePiece } from '../src/sim/geometry.js';
import { frontierFor, createSnapshotEncoder, FRONTIER_EVERY } from '../src/sim_snapshot.js';
import { createWorldMap, worldToCanvas, WORLD_LAYERS } from '../src/world_map.js';

const data = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url)));
const frontier = data('data/frontier.json'), art = frontier.townArt, catalog = data('data/art.json'), cutouts = data('art/cutouts.json');
const grid = { n: 5, cell: 11, ground: 'c'.repeat(24) + 'x', use: '.....' + '.www.' + '.rBg.' + '.rr..' + '.....',
  zone: 'hhh..' + '.....' + '.....' + '.....' + 'ffk..', stage: '12300' + '00000' + '00000' + '00000' + '11100' };
const town = { id: 't', name: 'Town', owner: 'player', x: 100, z: 100, grid, zones: { housing: { health: 1 }, farm: { health: 1 }, work: { health: 1 } },
  buildings: [{ id: 'hall', type: 'town_hall', stage: 'built', cell: 12 }], projects: [] };
const spot = { id: 'sp1', kind: 'timber', x: 100, z: 100, deposit: null, pieces: [[0, 0, 0], [5, 0, 1], [10, 0, 2]] };
const unknown = { ...spot, id: 'sp2', x: 600 }, outside = { ...spot, id: 'sp3', x: 2000 };
const spots = { spots: [spot, unknown, outside], chunkSize: 250, byChunk: { c0_0: ['sp1'], c2_0: ['sp2'], c8_0: ['sp3'] } };
const index = makeSpotIndex(spots), known = (x, z) => x < 500;
const f = { version: 5, econTick: 0, settlements: { t: town, enemy: { ...town, id: 'enemy', owner: 'rival', site: 'secret' } }, spots: { sp1: 'fhs', sp2: 'hhh' }, roads: {}, shipments: {}, receipts: [] };
const before = JSON.stringify(f);
const discovery = { isDiscovered: (clan, x, z) => known(x, z), siteDiscovered: () => false };
const view = frontierFor(f, 'player', discovery, [], index);
assert.deepEqual(view.settlements.t.grid, grid, 'the replica gets complete authoritative cell strings');
assert.equal(view.settlements.enemy, undefined, 'unknown rival towns stay hidden');
assert.deepEqual(view.spots, { sp1: 'fhs' }, 'only discovered changed spot stages cross the snapshot boundary');
const cells = townCellsToProps(view.settlements.t.grid, art, town.zones);
assert.deepEqual(cells.filter(p => p.key.includes(':zone:') && p.cell < 3).map(p => p.art), ['thatched_hut', 'townhouse', 'longhouse']);
assert.ok(cells.some(p => p.key.includes(':clear') && p.cell === 12), 'founding clearing under the hall');
assert.ok(cells.some(p => p.key === '16:road:0:-1'), 'vertical road connections reach the neighbouring cell');
assert.ok(cells.some(p => p.key === '16:road:1:0'), 'road bends join both axes');
assert.ok(cells.some(p => p.art === 'bamboo_fence') && cells.some(p => p.art === 'village_gate'));
assert.ok(cells.filter(p => p.art === 'bamboo_fence').some(p => p.flip === false));
assert.ok(cells.some(p => p.key.endsWith(':field')) && cells.some(p => p.key.includes(':crop:')), 'farm cells become crop fields');
assert.equal(cells.some(p => p.cell === 24), false, 'unbuildable cells have no props');
assert.equal(townCellsToProps({ n: 5, cell: 11 }, art).length, 0, 'old partial replicas do not crash');
const abandoned = structuredClone(town); abandoned.zones.housing.abandoned = true;
const rundown = townCellsToProps(grid, art, abandoned.zones).filter(p => p.cell < 3 && p.art);
assert.ok(rundown.every(p => p.noLights && p.tint === art._ground.abandonedTint), 'abandoned houses keep their stage, darken and have no lights');
assert.notEqual(townSignature([town]), townSignature([abandoned]), 'abandonment invalidates rendering without growth');
const roadEdit = structuredClone(town); roadEdit.grid.use = 'r' + roadEdit.grid.use.slice(1);
assert.notEqual(townSignature([town]), townSignature([roadEdit]), 'road edits invalidate rendering');
const recovering = structuredClone(town); recovering.zones.housing.health = 0.5;
assert.equal(townSignature([town]), townSignature([recovering]), 'health bookkeeping alone does not rebuild unchanged art');
const corner = structuredClone(grid); corner.use = '......ww...w.............';
const cornerProps = townCellsToProps(corner, art).filter(p => p.cell === 6 && p.art === 'bamboo_fence');
assert.ok(cornerProps.some(p => p.flip) && cornerProps.some(p => !p.flip), 'wall corners join both directions');
const worldProps = townProps([town], art, frontier.townLights);
assert.ok(worldProps.some(p => p.art === 'manor' && p.x === 100 && p.z === 100));
assert.ok(worldProps.some(p => p.cell === 0 && p.x === 78 && p.z === 78), 'local grid instructions are translated once');
const buildingTown = structuredClone(town);
buildingTown.projects = [{ id: 'build', type: 'quarry', cell: 6, cells: [6, 7, 11, 12], phase: 'clearing', paid: false, progress: 0 }];
assert.equal(townProps([buildingTown], art).some(p => p.key === 't:build:dirt'), false, 'a project still clearing ground does not draw a cleared footprint early');
buildingTown.projects[0].phase = 'cleared';
const footprint = townProps([buildingTown], art).find(p => p.key === 't:build:dirt');
assert.deepEqual([footprint.x, footprint.z, footprint.width, footprint.height], [94.5, 94.5, 22, 22], 'large projects cover their actual footprint');
buildingTown.projects[0].paid = true; buildingTown.projects[0].progress = 1;
assert.ok(townProps([buildingTown], art).some(p => p.key === 't:build:frame' && p.opacity === 0.5));

const pieces = spotPiecesToProps(spot, view.spots.sp1, catalog.spotArt, art._spots);
assert.deepEqual(pieces.map(p => p.art), ['pine_tree', 'snow_stump', 'pine_tree']);
assert.equal(pieces[2].s, art._spots.scales.timber.s);
assert.deepEqual(pieces.map(p => p.x), [100, 105, 110]);
assert.ok(spotPiecesToProps(spot, undefined, catalog.spotArt, art._spots).every(p => p.key.endsWith(':f')), 'untouched spots are full');
assert.equal(coveredBySpot({ x: 105, z: 101 }, [spot], art._spots.clearance), true);
assert.equal(coveredBySpot({ x: 150, z: 150 }, [spot], art._spots.clearance), false);
assert.match(spotInfo(spot, 'fhs').lines[0], /1 full.*1 harvested.*1 regrowing/);
for (const kind of ['timber', 'stone', 'fish', 'forage']) for (const stage of ['f', 'h', 's']) {
  const p = { ...spot, kind };
  for (const piece of spotPiecesToProps(p, stage.repeat(3), catalog.spotArt, art._spots)) {
    const placed = placePiece({ name: piece.art, x: piece.x, z: piece.z }, catalog, cutouts);
    assert.ok(placed && existsSync(new URL(`../${placed.item.file}`, import.meta.url)), `existing asset for ${kind}/${stage}`);
  }
}
for (const def of Object.values(art._zones)) if (def.stages) for (const name of def.stages) assert.ok(placePiece({ name, x: 0, z: 0 }, catalog, cutouts));
assert.equal(visibleSpots(index, { x: 100, z: 100, radius: 700, known, zoom: 1, minZoom: art._spots.minimapZoom }).length, 0);
assert.deepEqual(visibleSpots(index, { x: 100, z: 100, radius: 700, known, zoom: 2, minZoom: art._spots.minimapZoom }).map(p => p.id), ['sp1']);

// Real encoder: stable between refreshes, changed stages on the next snapshot, no shared sim references.
const state = { tick: 0, frontier: f, entities: {}, clans: {}, deployment: { clans: {} } };
const game = { state, discovery, frontier: { modules: [{ name: 'workers', workers: { index } }] }, vision: { canSee: () => false, grid: () => ({ visible: new Uint8Array(4), explored: new Uint8Array(4) }) } };
const encoder = createSnapshotEncoder(game), packet = () => new Map(encoder.encode({ map: true }).set).get('s:frontier');
const first = packet(); assert.deepEqual(first.settlements.t.grid, grid); assert.deepEqual(first.spots, { sp1: 'fhs' });
assert.notEqual(first.settlements.t.grid, grid);
state.tick = 1; f.spots.sp1 = 'hhh'; assert.equal(packet(), undefined, 'no frontier delta before the existing cadence');
state.tick = FRONTIER_EVERY; assert.deepEqual(packet().spots, { sp1: 'hhh' });
f.spots.sp1 = 'fhs'; state.tick = 0;

// Canvas double exercises the shipped Spots toggle, drawing, hit test and fog in Node.
const oldDocument = globalThis.document;
const canvas = () => ({ width: 800, height: 460, clientWidth: 800, clientHeight: 460,
  getContext: () => new Proxy({ measureText: s => ({ width: s.length * 7 }) }, { get: (o, k) => o[k] || (() => {}) }) });
try {
  globalThis.document = { createElement: canvas };
  const world = data('data/world.json'), discovered = '1' + '0'.repeat(2000);
  const map = createWorldMap({ canvas: canvas(), world, resourceSpots: spots, getState: () => ({ discovered }) });
  assert.ok(WORLD_LAYERS.some(l => l.id === 'spots' && !l.on));
  assert.equal(map.items().some(p => p.kind === 'spot'), false);
  map.setLayer('spots', true); map.frame(1);
  assert.deepEqual(map.items().filter(p => p.kind === 'spot').map(p => p.id), ['sp1'], 'map spots obey discovery');
  const at = worldToCanvas(spot.x, spot.z, map.view);
  assert.equal(map.hit(at.px, at.py)?.id, spot.id, 'the drawn spot is the hover target');
  map.setLayer('spots', false); assert.equal(map.items().some(p => p.kind === 'spot'), false);
} finally { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; }
assert.equal(JSON.stringify(f), before, 'all presentation queries leave simulation state unchanged');
console.log('test_town_drawing: ok');
