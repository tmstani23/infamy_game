// Z4f (2026-11-19): a clan with a castle has its rail hub at the castle station. The node keeps the name 'capital';
// the track runs out of the station, through the rail gate and over the rail bridge; trains are boarded and left at
// the castle on the island. A clan with no castle keeps the city end. Run: node game/tools/test_castle_rail.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { castleIndex } from '../src/sim/frontier/castle.js';
import { worldToCell } from '../src/sim/frontier/town_grid.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json'), bp = data('data/castle_default.json');
railways.link.seconds = 20;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'),
  frontier: { ...frontier, railways, fixtureTowns: false, castleBlueprint: bp, campaignZones: data('data/campaign_zones.json') } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId], clan = S.clans.player, rail = g.frontier.rail, c = g.castles.castleOf('player');
assert.ok(c, 'the player has a castle');

// --- the hub: the castle station for its clan, the city for a clan with no castle ---------------------------
const end = rail.endpoint('player', 'capital'), city = rail.endpoint('bot1', 'capital');
const at = castleIndex(bp, c.grid.n, c.castle.rot), stB = c.buildings.find(b => b.type === 'station');
assert.ok(stB.cells.includes(worldToCell(c, end.x, end.z)), 'the line ends in the castle station');
assert.ok(Math.abs(city.x - g.gate.rail[0]) < 1 && Math.abs(city.z - g.gate.rail[1]) < 1, 'a clan with no castle keeps the city end');

// --- a line from a town: out through the rail gate and over the rail bridge, never through wall or moat -----
const site = world.sites.filter(s => Math.hypot(s.x - c.x, s.z - c.z) > 1200).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
g.frontier.world.addTown({ id: 'tR', name: 'Railton', owner: 'player', x: site.x, z: site.z, pop: 3, stock: { food: 500, goods: 300, timber: 4000, stone: 2000 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
g.step([]);
const town = S.frontier.settlements.tR; town.tier = railways.link.minTier;
const nearCell = s => { let best = -1, bd = Infinity; s.grid.use.split('').forEach((ch, i) => { if (ch !== '.') return; const [x, z] = g.frontier.stable.centre(s, { cell: i }), d = Math.hypot(x - s.x, z - s.z); if (d > 25 && d < bd) { bd = d; best = i; } }); return best; };
town.buildings.push({ id: 'st1', type: 'station', cell: nearCell(town), stage: 'built' });
const p = rail.preview('player', 'tR', 'capital');
assert.ok(p.line && !p.error, `a route to the castle (${p.error})`);
const cellsOf = rect => { const out = new Set(); for (let z = rect[1]; z < rect[3]; z++) for (let x = rect[0]; x < rect[2]; x++) out.add(at(x, z)); return out; };
const gate = cellsOf(bp.gates.find(x => x.id === 'rail_gate').rect), bridge = cellsOf(bp.bridges.find(x => x.id === 'rail_bridge').rect);
const walk = line => { const seen = new Set(), pts = line.points;
  for (let k = 1; k < pts.length; k++) { const [ax, az] = pts[k - 1], [bx, bz] = pts[k], L = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d <= L; d += 2) { const i = worldToCell(c, ax + (bx - ax) * d / (L || 1), az + (bz - az) * d / (L || 1)); if (i >= 0) seen.add(i); } }
  return seen; };
const under = walk(p.line);
assert.ok([...gate].some(i => under.has(i)), 'through the rail gate');
assert.ok([...bridge].some(i => under.has(i)), 'over the rail bridge');
for (const i of under) {
  assert.ok(!'mkw'.includes(c.grid.use[i]), 'no track through moat, cliff or wall');
  assert.ok(!(c.grid.level[i] > '0') && c.grid.slope[i] === '.', 'the track stays in the yard');
  if (c.grid.use[i] === 'B') assert.ok(stB.cells.includes(i), 'no track through a castle building');
}

// --- lay it, ride it: off the train at the castle, on the island; back from the castle station ---------------
g.step([{ id: hero.id, type: 'frontier', action: 'rail', town: 'tR', mode: 'link', to: 'capital' }]);
const l = Object.values(S.frontier.rail.links)[0];
assert.ok(l, 'the line is ordered');
for (let t = 0; t < 20 * 20 * 3 && !l.done; t++) g.step([]);
assert.ok(l.done, 'the line is laid');
assert.ok(Math.hypot(l.points.at(-1)[0] - end.x, l.points.at(-1)[1] - end.z) < 1, 'it ends at the castle station');
const tr = rail.trains().find(t => t.link === l.id) || rail.addTrain?.(l.id);
assert.ok(tr, 'a train runs on it');
const T = railways.train, R4 = railways.ride, st = rail.endpoint('player', 'tR');
Object.assign(tr, { d: 0, dir: 1, wait: T.stopSeconds * 20 });
Object.assign(hero, { place: 'world', x: st.x + 3, z: st.z + 3 }); hero.hitAt = -1e9;
const board = () => g.step([{ id: hero.id, type: 'frontier', action: 'rail', mode: 'board', train: tr.id }]);
board(); board();
assert.equal(hero.aboard, `rail:${tr.id}`, 'aboard in town');
for (let t = 0; t < (R4.departSeconds + T.stopSeconds) * 20 + Math.ceil(l.length / T.viewSpeed * 20) + 60 && hero.aboard; t++) g.step([]);
assert.ok(!hero.aboard && hero.place === 'world', 'off the train on the island');
assert.ok(Math.hypot(hero.x - end.x, hero.z - end.z) < 40, 'at the castle station');
assert.match(clan.notice?.text || '', /Arrived at the capital/);
assert.ok(rail.atStation(hero, 'player', 'capital'), 'standing at the castle station');
Object.assign(tr, { d: l.length, dir: -1, wait: T.stopSeconds * 20 });
board(); board();
assert.equal(hero.aboard, `rail:${tr.id}`, 'aboard at the castle');
for (let t = 0; t < (R4.departSeconds + T.stopSeconds) * 20 + Math.ceil(l.length / T.viewSpeed * 20) + 60 && hero.aboard; t++) g.step([]);
assert.ok(!hero.aboard && Math.hypot(hero.x - st.x, hero.z - st.z) < 40, 'back in town');

// --- a line laid to the city before the castle stood is routed to the castle, once ---------------------------
l.points = [...l.points.slice(0, 2), [city.x, city.z]]; S.frontier.rail.capitalEnd = '';
g.step([]);
assert.ok(Math.hypot(l.points.at(-1)[0] - end.x, l.points.at(-1)[1] - end.z) < 1, 'an old city line now ends at the castle');
console.log('castle rail hub OK (station end, gate and bridge, ride both ways, old lines moved)');
