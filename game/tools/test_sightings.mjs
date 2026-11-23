// Remembered sight (Tim 2026-11-18, war test item 7, sim/sightings.js): a rival town and an enemy camp show only what
// your units or watchtowers have had in sight; buildings as you last saw them; grid layers only in seen blocks.
// Run: node game/tools/test_sightings.mjs
import assert from 'node:assert/strict';
import { createSightings, maskGrid, BLOCK } from '../src/sim/sightings.js';
import { frontierFor } from '../src/sim_snapshot.js';
import { cellToWorld } from '../src/sim/frontier/town_grid.js';

const n = 30, cell = 11, N = n * n;
const grid = { n, cell, ground: 'c'.repeat(N), use: 'r'.repeat(N), zone: 'h'.repeat(N), by: 'g'.repeat(N), stage: '2'.repeat(N) };
const t = { id: 'tR', name: 'Rivalton', owner: 'rival', x: 5000, z: 5000, tier: 2, grid, buildings: [
  { id: 'b1', type: 'barracks', cell: 0, stage: 'built' },            // far corner
  { id: 'b2', type: 'watchtower', cell: N - 1, stage: 'built' } ] };   // the other corner
const camp = { x: 6000, z: 5000, buildings: [{ id: 'c1', type: 'barracks', x: 6000, z: 5000, stage: 'built' }] };
const state = { tick: 0, night: false, clans: { player: {}, rival: { bot: true } }, entities: {},
  frontier: { settlements: { tR: t }, wars: { list: { w1: { id: 'w1', town: 'tP', attacker: 'rival', defender: 'player', camp } } } } };
const S = createSightings({ state, sight: { dayRange: 80, range: 60 } });
const run = () => { state.tick += S.EVERY; S.tick(); };
const at = c => cellToWorld(t, c);
// nobody near: nothing known
run();
assert.equal(S.seenMask('player', 'tR'), null);
assert.deepEqual(S.remembered('player', 'tR'), {});
// a unit by the first corner sees b1 and the blocks round it, not the far corner
const [x0, z0] = at(0);
state.entities.u = { id: 'u', owner: 'player', place: 'world', x: x0 - 20, z: z0 - 20 };
run();
assert.ok(S.remembered('player', 'tR').b1, 'b1 seen');
assert.ok(!S.remembered('player', 'tR').b2, 'b2 not seen');
const mask = S.seenMask('player', 'tR'), nb = Math.ceil(n / BLOCK);
assert.equal(mask[0], '1'); assert.equal(mask[nb * nb - 1], '0');
assert.ok(!S.remembered('rival', 'tR').b1 && !state.sightings.rival, 'bots keep no memory');
// the unit walks off; b1 burns down: still remembered standing
state.entities.u.x = 9000; run();
t.buildings[0].stage = 'ruined'; run();
assert.equal(S.remembered('player', 'tR').b1.stage, 'built', 'remembered as last seen');
// a new building near b1 is not known until looked at again
t.buildings.push({ id: 'b3', type: 'stockade', cell: 1, stage: 'built' });
run(); assert.ok(!S.remembered('player', 'tR').b3, 'new one hidden');
state.entities.u.x = x0 - 20; run();
assert.equal(S.remembered('player', 'tR').b1.stage, 'ruined', 'seen again: the ruin');
assert.ok(S.remembered('player', 'tR').b3, 'seen again: the new one');
// removed while you look: forgotten
t.buildings = t.buildings.filter(b => b.id !== 'b3'); run();
assert.ok(!S.remembered('player', 'tR').b3);
// a downed unit sees nothing; by night the range is shorter
state.entities.u.x = 9000; run();
const [x1, z1] = at(N - 1);
state.entities.u = { id: 'u', owner: 'player', place: 'world', x: x1 + 55, z: z1, downed: true }; run();
assert.ok(!S.remembered('player', 'tR').b2, 'downed: no sight');
delete state.entities.u.downed; state.night = true; run();
assert.ok(!S.remembered('player', 'tR').b2, 'night: 60 does not reach the block middle (66 off)');
state.night = false; run();
assert.ok(S.remembered('player', 'tR').b2, 'day: 80 reaches');
// the enemy camp: its building only once in sight
assert.deepEqual(S.campRemembered('player', 'w1'), {});
state.entities.u.x = camp.x + 50; state.entities.u.z = camp.z; run();
assert.ok(S.campRemembered('player', 'w1').c1, 'camp building seen');
// the grid mask: unseen cells empty, seen cells as they are, ground untouched
const m = maskGrid(grid, S.seenMask('player', 'tR'));
assert.equal(m.use[0], 'r'); assert.equal(m.zone[0], 'h');
const mid = Math.floor(n / 2) * n + Math.floor(n / 2);
assert.equal(m.use[mid], '.'); assert.equal(m.stage[mid], '0'); assert.equal(m.ground, grid.ground);
assert.equal(maskGrid(grid, null).zone, '.'.repeat(N));
// the snapshot sends the rival only the remembered buildings and the masked grid; the owner the real town
const disc = { siteDiscovered: () => false, isDiscovered: () => true };
const view = frontierFor(state.frontier, 'player', disc, [], null, null, null, null, S);
assert.deepEqual(view.settlements.tR.buildings.map(b => b.id).sort(), ['b1', 'b2']);
assert.equal(view.settlements.tR.grid.use[mid], '.');
assert.deepEqual(view.wars.list.w1.camp.buildings.map(b => b.id), ['c1']);
const own = frontierFor(state.frontier, 'rival', disc, [], null, null, null, null, S);
assert.equal(own.settlements.tR.grid, grid, 'the owner sees his own town');
// captured: the memory is dropped
t.owner = 'player'; run();
assert.equal(state.sightings.player['town:tR'], undefined);
// a rival castle keeps its walls, gates, moat and cliffs in unseen blocks (Tim 2026-11-23); everything else is hidden
{ const g = { n: 3, use: 'wgm.Bk.rw', zone: '.........', by: '.........', stage: '000000000' };
  assert.equal(maskGrid(g, null, BLOCK, 'mkwg').use, 'wgm..k..w');
  assert.equal(maskGrid(g, '0', BLOCK, 'mkwg').use, 'wgm..k..w');
  assert.equal(maskGrid(g, null).use, '..m..k...'); }
console.log('test_sightings: ok');
