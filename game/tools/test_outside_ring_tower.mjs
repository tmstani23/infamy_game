// Tim 2026-11-21: a watchtower may stand outside the town ring only beside one of the town's own built work camps,
// one per work camp (frontier.json tiers.outsideRing).
//   node game/tools/test_outside_ring_tower.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { inCore, cellOffset } from '../src/sim/frontier/town_grid.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const frontier = { ...data('data/frontier.json'), railways: data('data/railways.json'), fixtureTowns: false, dev: true };
const o = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), frontier };
const g = createGame(o); setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: o.district.spawns, test: { playerRyo: 5000, botRyo: 5000 }, seed: 5 });
const site = o.world.sites.find(s => s.id === 'S05');
const t = g.frontier.world.addTown({ id: 'tt', name: 'tt', owner: 'player', x: site.x, z: site.z, site: site.id, pop: 10, stock: { food: 5000, ryo: 9000, timber: 6000, stone: 6000, goods: 300 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
t.founded = -1e6; g.step([]);
const PL = g.frontier.modules.find(m => m.name === 'placement').placement, n = t.grid.n, use = t.grid.use;
const cells = [...use].map((c, i) => i).filter(i => use[i] === '.' && t.grid.ground[i] !== 'x' && !inCore(t, i, frontier));
const far = cells.sort((a, b) => Math.hypot(...cellOffset(t, b)) - Math.hypot(...cellOffset(t, a)))[40];
const try1 = cell => PL.check(t, { kind: 'watchtower', cells: [cell] });
assert.match(try1(far).reason, /beside one of your work camps/, 'no work camp: not outside the ring');
// a built lumber camp at a far cell, then a tower next to it
const lcCell = far; t.buildings.push({ id: 'lc', type: 'lumber_camp', cell: lcCell, stage: 'built' }); t.grid.use = use.slice(0, lcCell) + 'B' + use.slice(lcCell + 1);
const nextTo = cells.filter(i => i !== lcCell && t.grid.use[i] === '.').sort((a, b) => Math.hypot(...cellOffset(t, a).map((v, k) => v - cellOffset(t, lcCell)[k])) - Math.hypot(...cellOffset(t, b).map((v, k) => v - cellOffset(t, lcCell)[k])));
let ok = null; for (const c of nextTo.slice(0, 12)) if (try1(c).ok) { ok = c; break; }
assert.ok(ok != null, 'beside its own lumber camp: allowed');
assert.match(try1(nextTo.at(-1)).reason, /outside the town ring/, 'far from the work camp: not allowed');
t.buildings.push({ id: 'tw1', type: 'watchtower', cell: ok, stage: 'built' });
assert.ok(nextTo.slice(0, 20).filter(c => c !== ok).map(try1).every(r => !r.ok), 'one tower per work camp');
assert.ok(nextTo.slice(0, 20).filter(c => c !== ok).map(try1).some(r => /per work camp/.test(r.reason)), 'says why');
console.log('test_outside_ring_tower: ok');
