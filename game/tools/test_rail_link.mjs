// Train plan step 2: railway links (sim/frontier/rail.js). The game picks the route; a link always takes
// link.seconds whatever its length; paid a stretch at a time from the ordering town's stock, waiting when
// short; lines only between your own stations (town omnibus stations and the capital gate); a rail gang of
// laborers works at the railhead while someone is near. Run: node game/tools/test_rail_link.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { pointAt } from '../src/sim/frontier/rail_route.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
const SECONDS = 30;   // a short link for the test (the real one is railways.link.seconds)
railways.link.seconds = SECONDS;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId], clan = S.clans.player;
const gx = g.gate.island[0], gz = g.gate.island[1];
const site = world.sites.filter(s => Math.hypot(s.x - gx, s.z - gz) > 1200).sort((a, b) => Math.hypot(a.x - gx, a.z - gz) - Math.hypot(b.x - gx, b.z - gz))[0];
g.frontier.world.addTown({ id: 'tR', name: 'Railton', owner: 'player', x: site.x, z: site.z, pop: 3, stock: { food: 500, goods: 300, timber: 400, stone: 200 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const town = S.frontier.settlements.tR;
const rail = g.frontier.rail;
const cmd = c => g.step([{ id: hero.id, type: 'frontier', action: 'rail', town: 'tR', ...c }]);
g.step([]);   // the town gets its grid

// --- needs a bigger town hall and a station ----------------------------------------------------------
town.tier = 1;
cmd({ mode: 'link', to: 'capital' });
assert.match(clan.notice?.text || '', /bigger town hall/i, 'tier gate');
town.tier = railways.link.minTier;
cmd({ mode: 'link', to: 'capital' });
assert.match(clan.notice?.text || '', /station/i, 'needs a station');
const nearCell = s => { let best = -1, bd = Infinity; s.grid.use.split('').forEach((c, i) => { if (c !== '.') return; const [x, z] = g.frontier.stable.centre(s, { cell: i }), d = Math.hypot(x - s.x, z - s.z); if (d > 25 && d < bd) { bd = d; best = i; } }); return best; };
town.buildings.push({ id: 'st1', type: 'station', cell: nearCell(town), stage: 'built' });

// --- only to your own towns ---------------------------------------------------------------------------
const other = world.sites.find(s => s !== site && Math.hypot(s.x - site.x, s.z - site.z) > 1600);
g.frontier.world.addTown({ id: 'tX', name: 'Rivalburg', owner: 'bot1', x: other.x, z: other.z, pop: 3, stock: { food: 100 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
cmd({ mode: 'link', to: 'tX' });
assert.match(clan.notice?.text || '', /own towns/i, 'no line to a rival town');

// --- order the capital link: the route ends at the station and at the island gate ---------------------
const p = rail.preview('player', 'tR', 'capital');
assert.ok(p.line && !p.error, 'preview has a route');
cmd({ mode: 'link', to: 'capital' });
const links = Object.values(S.frontier.rail.links);
assert.equal(links.length, 1, 'one link');
const l = links[0];
const [sx, sz] = g.frontier.stable.centre(town, town.buildings.find(b => b.type === 'station'));
assert.deepEqual(l.points[0], [Math.round(sx * 10) / 10, Math.round(sz * 10) / 10], 'starts at the station');
assert.ok(Math.hypot(l.points.at(-1)[0] - gx, l.points.at(-1)[1] - gz) < 1, 'ends at the island gate');
assert.ok(l.length > 1000, 'a real distance');
cmd({ mode: 'link', to: 'capital' });
assert.match(clan.notice?.text || '', /already being laid|already linked/i, 'one at a time');

// --- progress: steady, paid by stretches from town stock, gang at the railhead when someone is near ------
Object.assign(hero, { place: 'world' });
const timber0 = town.stock.timber;
const stepFor = s => { for (let t = 0; t < s * 20; t++) { const head = pointAt(l, l.built); Object.assign(hero, { x: head.x + 8, z: head.z + 8 }); g.step([]); } };
stepFor(SECONDS / 3);
const share = l.built / l.length;
assert.ok(share > 0.28 && share < 0.39, `a third of the way after a third of the time (${share.toFixed(2)})`);
assert.ok(town.stock.timber < timber0, 'timber paid');
const per100 = railways.link.costPer100.timber, paid = timber0 - town.stock.timber;
assert.ok(paid <= per100 * (l.built + railways.link.stretch) / 100 + 1, 'paid only as it goes');
const gang = l.gang.map(id => S.entities[id]).filter(Boolean);
assert.equal(gang.length, railways.gang.size, 'the gang is out');
const head = pointAt(l, l.built);
for (const e of gang) { assert.equal(e.model, railways.gang.model); assert.ok(Math.hypot(e.x - head.x, e.z - head.z) < l.length / SECONDS * (railways.gang.hammerSeconds + 2) + 25, 'near the railhead'); }

// --- short of timber: the gang waits; restock and it carries on ----------------------------------------
town.stock.timber = 0;
const before = l.built;
stepFor(5);
assert.equal(l.waiting, 'timber', 'waiting for timber');
assert.ok(l.built - before <= railways.link.stretch + 1, 'stops at the paid stretch');
const stuck = l.built;
stepFor(2);
assert.equal(l.built, stuck, 'no track without timber');
town.stock.timber = 400;

// --- nobody near: the gang goes, the track still grows ----------------------------------------------------
Object.assign(hero, { x: gx + 5, z: gz + 5 });
for (let t = 0; t < 40; t++) g.step([]);
assert.equal(l.gang.length, 0, 'gang gone when nobody is near');
const mid = l.built;
for (let t = 0; t < SECONDS * 20 * 2; t++) g.step([]);
assert.ok(l.done && l.built === l.length && l.built > mid, 'finished off screen');
assert.match(clan.notice?.text || '', /Rail line open/i, 'line open notice');

// --- the snapshot shows own links only; a second link leans on the first ---------------------------------
const { frontierFor } = await import('../src/sim_snapshot.js');
assert.ok(frontierFor(S.frontier, 'player').rail.links[l.id], 'own link in the snapshot');
assert.ok(!frontierFor(S.frontier, 'bot1').rail.links[l.id], 'not in a rival snapshot');
// --- step 3: the open line gets a train; it stands at the first station, runs to the far end, waits, comes back
const T = railways.train, trains = rail.trains();
assert.equal(trains.length, 1, 'one train on the open line');
const tr = trains[0];
Object.assign(tr, { d: 0, dir: 1, wait: T.stopSeconds * 20 });   // it has been running while the test waited; start it over
// with nobody near it runs at full speed (Tim 2026-11-07: slower only on screen); park the hero in the city
const parked = { place: hero.place, x: hero.x, z: hero.z };
Object.assign(hero, { place: 'street', x: g.gate.inside[0], z: g.gate.inside[1] });
assert.equal(rail.stationOf(tr), 'tR', 'standing at the first station');
const runTicks = Math.ceil(l.length / T.speed * 20);
for (let t = 0; t < T.stopSeconds * 20 + 2; t++) g.step([]);
assert.ok(tr.d > 0 && rail.stationOf(tr) === null, 'left the station');
for (let t = 0; t < runTicks + 5; t++) g.step([]);
assert.equal(rail.stationOf(tr), 'capital', 'at the capital end');
assert.equal(tr.dir, -1, 'turns round');
assert.ok(tr.arrived?.at === 'capital', 'arrival recorded');
for (let t = 0; t < T.stopSeconds * 20 + runTicks + 10; t++) g.step([]);
assert.equal(rail.stationOf(tr), 'tR', 'back home');
assert.ok(frontierFor(S.frontier, 'player').rail.trains[tr.id], 'train in the snapshot');
// someone beside the track: it slows to viewSpeed
Object.assign(hero, parked, { place: 'world' });
Object.assign(tr, { d: 300, dir: 1, wait: 0, seen: undefined });
{ const head = pointAt(l, tr.d); Object.assign(hero, { x: head.x + 10, z: head.z }); }
const d0 = tr.d; for (let t = 0; t < 20; t++) g.step([]);
assert.ok(Math.abs(tr.d - d0 - T.viewSpeed) < 2, `watched: about viewSpeed a second (${(tr.d - d0).toFixed(1)})`);
Object.assign(hero, { place: 'street', x: g.gate.inside[0], z: g.gate.inside[1] });
for (let t = 0; t < 10; t++) g.step([]);   // it looks round twice a second
const d1 = tr.d; for (let t = 0; t < 20; t++) g.step([]);
assert.ok(Math.abs(tr.d - d1 - T.speed) < 2, `unwatched: full speed (${(tr.d - d1).toFixed(1)})`);
console.log(`rail link OK (length ${Math.round(l.length)}, ${l.bridges.length} bridges)`);
// --- step 4: board at the station with a follower, Skip only after a few seconds, get off at the capital; ride back from the city side
const R4 = railways.ride, mate = Object.values(S.entities).find(u => u.owner === 'player' && u.type !== 'hero' && !u.dead && !u.worker && !u.railGang && !u.civilian);
assert.ok(mate, 'a crew member to bring along');
const st = rail.endpoint('player', 'tR');
Object.assign(tr, { d: 0, dir: 1, wait: T.stopSeconds * 20 });
Object.assign(hero, { place: 'world', x: st.x + 3, z: st.z + 3 }); hero.hitAt = -1e9;
Object.assign(mate, { place: 'world', x: st.x + 5, z: st.z + 3, order: { kind: 'follow', target: hero.id } });
// boarding zone (Tim 2026-11-08): anyone of yours standing in it comes, following or not; one outside it stays
const pal = S.entities[g.spawn(mate.type, mate.model, st.x + 12, st.z + 10, { owner: 'player', place: 'world', hp: mate.maxHp, maxHp: mate.maxHp, deployment: { ...(mate.deployment || {}), group: 'hero' } })];
const far = S.entities[g.spawn(mate.type, mate.model, st.x + 30, st.z - 20, { owner: 'player', place: 'world', hp: mate.maxHp, maxHp: mate.maxHp, deployment: { ...(mate.deployment || {}), group: 'hero' } })];
g.step([]);
const sv = rail.service(hero);
assert.ok(sv.length && sv[0].eta === 0 && sv[0].to === 'capital', `the train here shows in service (${JSON.stringify(sv)})`);
assert.equal(sv[0].toName, 'the capital');
g.step([{ id: hero.id, type: 'frontier', action: 'rail', mode: 'board', train: tr.id }]);
assert.ok(tr.call && !hero.aboard, 'All aboard is called: a zone, nobody on yet');
assert.match(clan.notice?.text || '', /All aboard! Get your crew/);
assert.equal(rail.inZone(tr).length, 2, 'the follower and the one about town are in the zone');
for (let t = 0; t < R4.callSeconds * 20 + 2 && !hero.aboard; t++) g.step([]);
assert.ok(!tr.call, 'the call ran out');
assert.equal(hero.aboard, `rail:${tr.id}`, 'hero aboard');
assert.equal(mate.aboard, `rail:${tr.id}`, 'follower aboard');
assert.equal(pal.aboard, `rail:${tr.id}`, 'a crewman standing in the zone came along');
assert.ok(!far.aboard, 'one outside the zone stays in town');
assert.match(clan.notice?.text || '', /All aboard for the capital/);
g.step([{ id: hero.id, type: 'frontier', action: 'rail', mode: 'skip' }]);
assert.match(clan.notice?.text || '', /in a moment/, 'no Skip straight away');
assert.equal(hero.aboard, `rail:${tr.id}`, 'still aboard');
for (let t = 0; t < R4.skipSeconds * 20; t++) g.step([]);
assert.ok(tr.d > 0 && Math.hypot(hero.x - pointAt(l, tr.d).x, hero.z - pointAt(l, tr.d).z) < 2, 'riders move with the engine');
g.step([{ id: hero.id, type: 'frontier', action: 'rail', mode: 'skip' }]);
assert.ok(!hero.aboard && !mate.aboard, 'off the train');
assert.equal(hero.place, 'street', 'into the city');
assert.ok(g.gate.station && Math.hypot(hero.x - g.gate.station[0], hero.z - g.gate.station[1]) < 12, 'at the city railway station by the gate');
assert.equal(mate.place, 'street', 'the follower came too');
assert.equal(rail.stationOf(tr), 'capital', 'the train stands at the capital');
// from the city railway station (Tim 2026-11-07): ride along all the way, no Skip; the gate itself is no station
Object.assign(hero, { x: g.gate.city[0] + 1, z: g.gate.city[1] });
assert.equal(rail.service(hero).length, 0, 'no trains at the gate itself');
Object.assign(hero, { x: g.gate.station[0] + 1, z: g.gate.station[1] });
const sc = rail.service(hero);
assert.ok(sc.length && sc[0].at === 'capital' && sc[0].eta === 0, 'the train shows at the city station');
assert.ok(g.doors.some(d => d.menu === 'rail_station'), 'the station door ring opens the station menu');
g.step([{ id: hero.id, type: 'frontier', action: 'rail', mode: 'board', train: tr.id }]);
g.step([{ id: hero.id, type: 'frontier', action: 'rail', mode: 'board', train: tr.id }]);   // Space again: on at once
assert.equal(hero.aboard, `rail:${tr.id}`, 'aboard from the city');
for (let t = 0; t < R4.departSeconds * 20 + Math.ceil(l.length / T.viewSpeed * 20) + 30 && hero.aboard; t++) g.step([]);
assert.ok(!hero.aboard && hero.place === 'world', 'got off on the island');
assert.ok(Math.hypot(hero.x - st.x, hero.z - st.z) < 25, 'at Railton station');
assert.match(clan.notice?.text || '', /Arrived at Railton/);
console.log('rail ride OK (board, Skip after 5 s, ride along, both ends)');
// --- through town (Tim 2026-11-07: track ran through buildings): never on a building or house, its cells reserved ----
{
  const { worldToCell } = await import('../src/sim/frontier/town_grid.js');
  const stCells = new Set(town.buildings.filter(b => b.type === 'station').flatMap(b => b.cells || [b.cell]));
  for (let d = 0; d < l.length; d += 1) { const p = pointAt(l, d), i = worldToCell(town, p.x, p.z);
    if (i >= 0 && !stCells.has(i)) assert.ok(town.grid.use[i] !== 'B' && !'hk'.includes(town.grid.zone[i]), `track at ${Math.round(d)} on a building or house`); }
  const reserved = Object.keys(town.railCells || {}).map(Number);
  assert.ok(reserved.length > 3, 'the track cells are reserved');
  const free = reserved.find(i => town.grid.use[i] === '.' && town.grid.zone[i] === '.');
  if (free !== undefined) {
    g.step([{ id: hero.id, type: 'frontier', action: 'zone', town: 'tR', kind: 'farm', cells: [free] }]);
    assert.equal(town.grid.zone[free], '.', 'no zoning on the track');
  }
  console.log(`rail through town OK (${reserved.length} cells kept clear)`);
}
