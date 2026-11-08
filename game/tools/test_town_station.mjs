// The town railway station (Tim 2026-11-07, sim/frontier/station_layout.js): one 3x2 placement, ticket hall, engine
// shed and railway slot in a row; rot turns it (the track leaves +x, +z, -x, -z). A line ends in the shed and leaves
// through the slot. Removing a station with lines needs confirmLines, then its lines are torn up.
// Run: node game/tools/test_town_station.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { stationParts, shapeOf } from '../src/sim/frontier/station_layout.js';
import { pointAt } from '../src/sim/frontier/rail_route.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
railways.link.seconds = 30;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId], clan = S.clans.player;
const [gx, gz] = g.gate.island;
const site = world.sites.filter(s => Math.hypot(s.x - gx, s.z - gz) > 1200).sort((a, b) => Math.hypot(a.x - gx, a.z - gz) - Math.hypot(b.x - gx, b.z - gz))[0];
g.frontier.world.addTown({ id: 'tS', name: 'Stationton', owner: 'player', x: site.x, z: site.z, pop: 3, stock: { food: 900, goods: 900, timber: 900, stone: 900 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const town = S.frontier.settlements.tS;
g.step([]);
town.tier = Math.max(town.tier || 1, railways.link.minTier);
const placement = g.frontier.modules.find(x => x.name === 'placement').placement, { n } = town.grid;

// --- the shape: 3x2, turned 2x3 -----------------------------------------------------------------------------------
assert.deepEqual(shapeOf(frontier.buildings.station, 0), [3, 2]);
assert.deepEqual(shapeOf(frontier.buildings.station, 1), [2, 3]);
let spot = -1, rot = 0;
for (const r of [0, 1, 2, 3]) { for (let i = 0; i < n * n && spot < 0; i++) if (placement.check(town, { kind: 'station', cells: [i], rot: r }).ok) { spot = i; rot = r; } if (spot >= 0) break; }
assert.ok(spot >= 0, 'somewhere to put a station');
const chk = placement.check(town, { kind: 'station', cells: [spot], rot });
assert.equal(chk.cells.length, 6, 'six cells');
const cols = new Set(chk.cells.map(i => i % n)).size, rows = new Set(chk.cells.map(i => Math.floor(i / n))).size;
assert.deepEqual([cols, rows], rot % 2 ? [2, 3] : [3, 2], 'turned by rot');
g.step([{ id: hero.id, type: 'frontier', action: 'place', town: 'tS', kind: 'station', cells: [spot], rot }]);
const proj = town.projects.find(p => p.type === 'station');
assert.ok(proj && proj.cells.length === 6 && proj.rot === rot, 'a 3x2 project that remembers its turn');
// --- the parts, and a line out through the slot ---------------------------------------------------------------------
town.projects.splice(town.projects.indexOf(proj), 1);
const st = { id: 'stS', type: 'station', cell: proj.cells[0], cells: proj.cells, rot: 0, stage: 'built' };
// use an unturned 3x2 for the geometry checks
const anchor = (() => { for (let i = 0; i < n * n; i++) { const c = placement.footprint(town, 'station', [i], 0); if (c && c.every(j => town.grid.use[j] === '.' || proj.cells.includes(j))) return c; } })();
for (const i of proj.cells) town.grid.use = town.grid.use.slice(0, i) + '.' + town.grid.use.slice(i + 1);
st.cells = anchor; st.cell = anchor[0];
for (const i of anchor) town.grid.use = town.grid.use.slice(0, i) + 'B' + town.grid.use.slice(i + 1);
town.buildings.push(st);
const parts = stationParts(town, st);
assert.ok(parts.hall[0] < parts.shed[0] && parts.shed[0] < parts.slot[0], 'hall, shed, slot along +x');
const rail = g.frontier.rail, end = rail.endpoint('player', 'tS');
assert.ok(Math.hypot(end.x - (town.x + parts.shed[0]), end.z - (town.z + parts.shed[1])) < 0.01, 'the line ends in the shed');
const pv = rail.preview('player', 'tS', 'capital'); assert.ok(!pv.error, pv.error);
if (!pv.error) {
  const [a, b] = pv.line.points;
  assert.ok(b[0] > a[0] + 2 && Math.abs(b[1] - a[1]) < 3, `out of the shed through the slot (${JSON.stringify([a, b])})`);
}
// --- every turn of the station: the track leaves straight out of the mouth and never bends tighter than a train can
// (Tim 2026-11-08: no hairpin back past the shed), one town cell clear of water and cliffs where the town allows
const radiusAt = (l, d, w = 8) => { const a = pointAt(l, d - w), b = pointAt(l, d), c = pointAt(l, d + w);
  const A = Math.hypot(b.x - c.x, b.z - c.z), B = Math.hypot(a.x - c.x, a.z - c.z), C = Math.hypot(a.x - b.x, a.z - b.z);
  const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)); return area2 < 1e-6 ? Infinity : A * B * C / (2 * area2); };
const tight = [];
{
  const keepUse = town.grid.use, keepB = [...town.buildings];
  town.buildings.splice(town.buildings.indexOf(st), 1);
  for (const i of anchor) town.grid.use = town.grid.use.slice(0, i) + '.' + town.grid.use.slice(i + 1);
  const base = town.grid.use;
  for (const r of [0, 1, 2, 3]) {
    town.grid.use = base;
    // the first legal spot whose mouth has room to curve out (one facing a cliff is refused, never a hairpin)
    let tst = null, v = null, refused = 0;
    for (let i = 0; i < n * n && !tst; i++) {
      const c = placement.check(town, { kind: 'station', cells: [i], rot: r });
      if (!c.ok) continue;
      town.grid.use = base;
      for (const j of c.cells) town.grid.use = town.grid.use.slice(0, j) + 'B' + town.grid.use.slice(j + 1);
      const tryst = { id: 'stR' + r, type: 'station', cell: c.cells[0], cells: c.cells, rot: r, stage: 'built' };
      town.buildings.push(tryst);
      v = rail.preview('player', 'tS', 'capital');
      if (!v.error) tst = tryst;
      else { assert.match(v.error, /turn it \(R\)|No way to lay/, v.error); refused++; town.buildings.splice(town.buildings.indexOf(tryst), 1); }
    }
    assert.ok(tst, `a station turned ${r} that can link (${refused} refused)`);
    const p = stationParts(town, tst);
    const l = v.line, [dx, dz] = p.dir;
    // out of the shed and on past the slot heading the way the arrow points
    const q = pointAt(l, 16);
    assert.ok(Math.abs(Math.cos(q.heading) * dx + Math.sin(q.heading) * dz) > 0.9 || Math.abs((q.x - l.points[0][0]) * dx + (q.z - l.points[0][1]) * dz) > 12,
      `rot ${r}: leaves through the mouth`);
    let minR = Infinity;
    for (let d = 10; d < l.length - 10; d += 2) minR = Math.min(minR, radiusAt(l, d));
    tight.push(Math.round(minR));
    assert.ok(minR > 8, `rot ${r}: no hairpin (tightest curve radius ${minR.toFixed(1)})`);
    town.buildings.splice(town.buildings.indexOf(tst), 1);
  }
  town.grid.use = keepUse; town.buildings.length = 0; town.buildings.push(...keepB);
}
g.step([{ id: hero.id, type: 'frontier', action: 'rail', mode: 'link', town: 'tS', to: 'capital' }]);
const line = Object.values(S.frontier.rail.links).find(l => l.from === 'tS');
assert.ok(line, `a line is being laid (${clan.notice?.text})`);
// --- removing the station: refused without confirmLines; then its lines go too ---------------------------------------
g.step([{ id: hero.id, type: 'frontier', action: 'remove', town: 'tS', cells: [st.cells[0]] }]);
assert.ok(town.buildings.includes(st) && S.frontier.rail.links[line.id], 'not without confirming');
assert.match(S.frontier.receipts.at(-1)?.reason || '', /erase it again/);
g.step([{ id: hero.id, type: 'frontier', action: 'remove', town: 'tS', cells: [st.cells[0]], confirmLines: true }]);
assert.ok(!town.buildings.includes(st), 'the station is gone');
assert.ok(!S.frontier.rail.links[line.id], 'its line is torn up');
assert.ok(!Object.values(town.railCells || {}).includes(line.id), 'its track cells are free again');
console.log(`town station OK (tightest curve out of each turn: ${tight.join(', ')})`);
