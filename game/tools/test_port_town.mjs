// Checks the 2x map (data/port_town.json) in the sim: node game/tools/test_port_town.mjs
// Buildings don't overlap, every door, townsfolk spot and bandit way-in can be walked to from the
// hero's start, the canal is crossed only on bridges and the pleasure quarter only through its gate.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { shapeDistance } from '../src/sim/geometry.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const district = data('data/port_town.json');
const t0 = Date.now();
const g = createGame({
  district, catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
});
g.clans.addClan('player');
console.log(`built in ${Date.now() - t0} ms, ${g.blockers.length} walls, ${g.scenery.length} pieces`);
const hit = (a, b) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const [hx, hz] = district.spawns.hero;
assert.ok(g.nav.free(hx, hz), 'hero starts on open ground');

// Buildings don't overlap each other or the water, and no solid prop stands in a building
{
  const street = g.scenery.filter(s => !s.indoor && s.x < 200);
  const blds = street.filter(s => s.item.kind === 'buildings');
  const problems = [];
  for (let i = 0; i < blds.length; i++) for (let j = i + 1; j < blds.length; j++)
    if (hit(blds[i].foot, blds[j].foot)) problems.push(`${blds[i].name} overlaps ${blds[j].name}`);
  const water = g.blockers.filter(b => !street.some(s => s.solid === b) && b.minX > -200 && b.maxX < 200 && b.maxX - b.minX < 300);
  for (const s of street.filter(s => s.solid && s.name !== 'rowboat'))
    for (const b of blds) if (s !== b && s.item.kind !== 'buildings' && hit(s.solid, b.foot)) problems.push(`${s.name} at ${s.x},${s.z} stands in the ${b.name}`);
  assert.equal(blds.length, 43, '33 buildings, a second police box and the 9 of the Shinobi village');
  assert.deepEqual(problems, [], problems.join('\n'));
  console.log('buildings ok');
}

// Doors, townsfolk spots and bandit way-ins can all be reached from the hero's start
{
  const miss = [];
  for (const d of g.doors.filter(d => d.x < 200)) if (!g.nav.findPath(hx, hz, d.x, d.z) || !g.nav.free(d.x, d.z)) miss.push(`door ${d.label} at ${d.x.toFixed(1)},${d.z.toFixed(1)}`);
  for (const p of g.civilians.spots) if (!g.nav.findPath(hx, hz, p.x, p.z)) miss.push(`spot ${p.id}`);
  for (const [x, z] of district.edges) { const f = g.nav.nearestFree(x, z); if (!f || !g.nav.findPath(hx, hz, ...f)) miss.push(`edge ${x},${z}`); }
  assert.deepEqual(miss, [], miss.join('\n'));
  const kinds = Object.values(g.state.businesses).map(b => b.kind).sort();
  assert.deepEqual(kinds, ['bathhouse', 'clinic', 'contract_board', 'customs_house', 'dojo', 'gambling_den', 'hideout', 'hideout', 'hideout', 'manor', 'moneylender', 'pawnshop', 'police_box', 'police_box', 'police_hq', 'sake_brewery', 'shop', 'teahouse', 'tenements', 'warehouse']);
  assert.equal(g.rooms.length, 14, 'ten public interiors, three hideouts and the Shinobi dojo');
  console.log('doors, spots and edges ok');
}

// The canal is crossed on a bridge, the pleasure quarter is entered through the gate
{
  const t = Date.now();
  const across = g.nav.findPath(-53, 6, 30, -7);
  console.log(`long path in ${Date.now() - t} ms`);
  const onBridge = ([x, z]) => district.walkShapes.some(([x0, z0, x1, z1]) => x >= x0 - 1 && x <= x1 + 1 && z >= z0 - 1 && z <= z1 + 1);
  const pts = [[-53, 6], ...across];
  let crossed = false;
  for (let i = 1; i < pts.length; i++) for (let k = 0; k <= 20; k++) {
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 20, z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 20;
    if (shapeDistance(district.blockShapes[1], x, z) > 0) { assert.ok(onBridge([x, z]), `crossed the canal off a bridge at ${x},${z}`); crossed = true; }
  }
  assert.ok(crossed, 'the path crosses the canal');
  const den = g.civilians.spots.find(p => p.id === 'den');
  const path = [[hx, hz], ...g.nav.findPath(hx, hz, den.x, den.z)];
  // the quarter wall: south side z 13 with the gate (x 25.6-30.4), west x 6 and east x 51 sides
  // with a side opening at z 29.5-34.7 (Tim 2026-10-21, c6c8653)
  let gate = false;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    if ((az - 13) * (bz - 13) <= 0) { const x = ax + (bx - ax) * (13 - az) / (bz - az || 1); if (x > 6 && x < 51) { assert.ok(x > 25.6 && x < 30.4, `walked through the quarter wall at x ${x}`); gate = true; } }
    for (const wx of [6, 51]) if ((ax - wx) * (bx - wx) <= 0) { const z = az + (bz - az) * (wx - ax) / (bx - ax || 1); if (z > 13 && z < 46) { assert.ok(z > 29.5 && z < 34.7, `walked through the quarter wall at ${wx},${z}`); gate = true; } }
  }
  assert.ok(gate, 'the way to the den goes through a gate');
  console.log('bridges and gate ok');
}

// A day and a night run without errors: townsfolk, police and bandits on the new map
{
  for (let i = 0; i < 20 * 20; i++) g.step();
  g.step([{ type: 'time', night: true }]);
  for (let i = 0; i < 20 * 60; i++) g.step();
  const civs = Object.values(g.state.entities).filter(e => e.type === 'civilian');
  const inWall = e => e.place === 'street' && g.blockers.some(b => e.x > b.minX && e.x < b.maxX && e.z > b.minZ && e.z < b.maxZ);
  assert.ok(!Object.values(g.state.entities).some(inWall), 'nobody inside a wall or the water');
  console.log(`day and night ok (${civs.length} townsfolk out at night, ${Object.values(g.state.entities).filter(e => e.type === 'bandit' || e.type === 'night_brute').length} bandits)`);
}
console.log('port town ok');
