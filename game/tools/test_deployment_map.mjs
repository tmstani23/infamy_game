import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { sectorOutlines, hexCells } from '../src/deployment_map_geometry.js';
import { createDeploymentMapData, LAST_KNOWN_TICKS } from '../src/deployment_map_data.js';
import { createDeploymentMapOverlay } from '../src/deployment_map_overlay.js';
import { contractMapLocation } from '../src/contract_map_marker.js';

// Room-local objective coordinates and unseen boss movement must never reach the outdoor map.
{
  const target={id:'boss',x:80,z:90,place:'street'}, business={x:40,z:50,room:'shop'};
  let visible=false;
  const state={tick:100,contracts:{active:{player:{kind:'steal',business:'shop',spot:{x:1000,z:1000}}}},
    businesses:{shop:business},entities:{boss:target},deployment:{clans:{player:{sightings:{}}}}};
  const game={state,vision:{canSee:()=>visible}};
  assert.deepEqual(contractMapLocation(game,'player'),{x:40,z:50},'theft uses the outdoor business location');
  state.contracts.active.player.kind='mark';
  assert.deepEqual(contractMapLocation(game,'player'),{x:40,z:50},'mark uses the outdoor business location');
  state.contracts.active.player={kind:'boss',hero:'boss'};
  assert.equal(contractMapLocation(game,'player'),null,'unseen boss has no live marker');
  visible=true;
  assert.deepEqual(contractMapLocation(game,'player'),{x:80,z:90});
  target.place='shop';target.x=1000;target.z=1000;
  assert.deepEqual(contractMapLocation(game,'player'),{x:40,z:50},'visible interior boss maps to the building');
  target.hidden=true;
  assert.equal(contractMapLocation(game,'player'),null,'hidden boss cannot leak coordinates');
  const report={x:10,z:20,seenAt:100};state.deployment.clans.player.sightings.boss=report;
  assert.deepEqual(contractMapLocation(game,'player'),{x:10,z:20},'hidden boss uses only the watcher report');
  target.x=2000;
  assert.deepEqual(contractMapLocation(game,'player'),{x:10,z:20},'unobserved movement cannot update the marker');
  state.tick=300;
  assert.equal(contractMapLocation(game,'player'),null,'last-known marker expires after ten seconds');
}

const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const district = read('data/port_town.json');
const game = createGame({ district, catalog: read('data/art.json'), cutouts: read('art/cutouts.json'), interiors: read('data/interiors.json'),
  parts: read('data/interior_parts.json'), recipes: read('data/room_recipes.json'), units: read('data/units.json') });
const { heroId } = setupMatch(game, { clan: 'shinobi', difficulty: 'easy', bots: read('data/bots.json') });
const st = game.state, hero = st.entities[heroId], grid = game.deployment.cellGrid();
const gridBefore = grid.cells.slice(), sectors = sectorOutlines(grid, st.deployment.sectors);
const inside = (p, polygon) => {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
};
assert.equal(new Set(sectors.map(s => s.color)).size, 4);
for (const [label, s] of sectors.entries()) {
  assert.ok(s.loops.some(loop => inside([s.anchor.x, s.anchor.z], loop)), `${s.name} outline contains its actual anchor`);
  assert.ok(s.loops.flat().every(([x, z]) => Number.isFinite(x) && Number.isFinite(z) && x >= grid.bounds.minX && x <= grid.bounds.maxX && z >= grid.bounds.minZ && z <= grid.bounds.maxZ));
  for (let k = 0; k < grid.cells.length; k += 53) if (grid.cells[k] === label) {
    const p = [grid.bounds.minX + (k % grid.w + .5) * grid.cell, grid.bounds.minZ + (Math.floor(k / grid.w) + .5) * grid.cell];
    assert.ok(s.loops.some(loop => inside(p, loop)), 'public walkable sector cells remain inside the bold exterior');
  }
}
const hexes = hexCells(grid.bounds, (x, z) => game.deployment.sectorAt(x, z));
assert.ok(hexes.length > 100 && hexes.every(h => h.points.length === 6));
assert.deepEqual(grid.cells, gridBefore, 'visual outlines and hexes cannot alter navigation or assignment cells');

const data = createDeploymentMapData({ game, clan: 'player' });
const enemyOwner = Object.keys(st.clans).find(c => c !== 'player');
const enemy = st.entities[game.spawn('thug', 'thug', hero.x + 3, hero.z, { owner: enemyOwner })];
const secret = enemy.deployment;
Object.defineProperty(enemy, 'deployment', { configurable: true, get() { throw Error('Rival deployment data must never be queried'); } });
let snapshot = data.update(true, true);
assert.ok(snapshot.contacts.some(c => c.id === enemy.id && c.live));
assert.ok(!('deployment' in snapshot.contacts.find(c => c.id === enemy.id)));
st.tick++; enemy.x += 1; snapshot = data.update(true, true);
const seen = snapshot.contacts.find(c => c.id === enemy.id);
assert.deepEqual(seen.direction, { x: 1, z: 0 });
enemy.hidden = true; enemy.x += 40; st.tick++;
const hidden = st.entities[game.spawn('thug', 'thug', hero.x + 2, hero.z, { owner: enemyOwner, hidden: true })];
snapshot = data.update(true, true);
assert.ok(!snapshot.contacts.some(c => c.id === hidden.id), 'unseen hidden enemies never create contacts');
const lost = snapshot.contacts.find(c => c.id === enemy.id);
assert.equal(lost.live, false); assert.equal(lost.x, seen.x, 'last-known marker never follows hidden movement');
enemy.dead = true; st.tick++;
assert.ok(data.update(true, true).contacts.some(c => c.id === enemy.id), 'unseen death does not secretly remove the last-known marker');
st.tick = seen.seenAt + LAST_KNOWN_TICKS;
assert.ok(!data.update(true, true).contacts.some(c => c.id === enemy.id), 'last-known contact expires after ten seconds');
Object.defineProperty(enemy, 'deployment', { configurable: true, value: secret, writable: true });

// Own assignments, reservations, health and interior locations remain available
// while KO. A visible rival sharing the sector adds presence, never ownership.
const s = st.deployment.sectors[0], room = Object.values(st.businesses).find(b => b.room && game.deployment.sectorAt(...b.ring) === s.id);
const crew = st.entities[game.spawn('ninja', 'ninja', room.ring[0], room.ring[1], { owner: 'player', deployment: { group: s.id } })];
crew.place = room.room; crew.x = 999; crew.z = 999; crew.hp = crew.maxHp / 2;
const incoming = st.entities[game.spawn('ninja', 'ninja', s.anchor.x + 1, s.anchor.z, { owner: 'player', deployment: { group: 'home' } })];
incoming.deployment.transfer = { to: s.id, status: 'blocked', target: { place: room.room, x: 999, z: 999 } };
const visibleEnemy = st.entities[game.spawn('thug', 'thug', room.ring[0], room.ring[1], { owner: enemyOwner })];
const eye = st.entities[game.spawn('ninja', 'ninja', room.ring[0], room.ring[1], { owner: 'player', deployment: { group: s.id } })];
hero.downed = true; st.tick++;
snapshot = data.update(true, true);
const sector = snapshot.sectors.find(x => x.id === s.id);
assert.equal(sector.count, 3); assert.equal(sector.incoming, 1); assert.equal(sector.status, 'Transfer blocked');
assert.ok(sector.hp < sector.maxHp);
assert.ok(sector.presence.some(c => c.owner === 'player') && sector.presence.some(c => c.owner === enemyOwner));
assert.ok(!('owner' in sector), 'geographic sectors have shared presence, never exclusive ownership');
assert.deepEqual(snapshot.transfers[0].to, { x: room.ring[0], z: room.ring[1] }, 'interior transfer marker uses the public entrance');
assert.equal(snapshot.own.find(e => e.id === crew.id).x, room.ring[0], 'own interior crew marker uses the entrance, not remote room coordinates');
const before = JSON.stringify(st); data.update(true, true);
assert.equal(JSON.stringify(st), before, 'map data queries issue no commands or sim mutations');
assert.ok(snapshot.contacts.some(c => c.id === visibleEnemy.id && c.live));

// Exercise projection/selection with a lightweight canvas adapter in Node. Tim
// checks the visual result; this verifies markers and picks do not issue orders.
let picked = null, hovered = null, strokes = 0;
const ctx = new Proxy({}, { get: (_, k) => k === 'measureText' ? s => ({ width: s.length * 6 }) : k === 'stroke' ? () => { strokes++; } : () => {}, set: () => true });
const overlay = createDeploymentMapOverlay({ game, clan: 'player', data, selectedSector: () => s.id,
  onPick: id => { picked = id; }, onHover: value => { hovered = value?.id; } });
const toMap = (x, z) => [300 + x * 2, 300 + z * 2];
overlay.ground({ ctx, toMap, now: 1000, size: 700 }); overlay.markers({ ctx, toMap, size: 700 });
assert.ok(strokes > 100);
assert.equal(overlay.pick(s.anchor), true); assert.equal(picked, s.id);
assert.equal(overlay.hover(s.anchor, {}), true); assert.equal(hovered, s.id);
assert.equal(overlay.pick({ x: Infinity, z: Infinity }), false);
assert.equal(JSON.stringify(st), before, 'drawing and picking remain presentation-only');
console.log('Deployment map: real outlines, unchanged nav, hexes, truthful contact/direction/expiry, shared presence, KO/interior/reservation status and draw/pick checks passed');
{
  const previous=globalThis.document;let canvases=0;
  globalThis.document={createElement(){canvases++;return {width:0,height:0,getContext:()=>ctx};}};
  try{
    overlay.ground({ctx,toMap,now:2000,size:700});const painted=overlay.diagnostics().groundPaints;
    overlay.ground({ctx,toMap,now:2005,size:700});assert.equal(overlay.diagnostics().groundPaints,painted,'steady map reuses the honeycomb bitmap');
    overlay.ground({ctx,toMap,now:2150,size:700});assert.equal(overlay.diagnostics().groundPaints,painted+1,'slow ripple stays animated');
    overlay.ground({ctx,toMap:(x,z)=>[x*3,z*3],now:2150,size:700});assert.equal(overlay.diagnostics().groundPaints,painted+2,'zoom invalidates immediately');
    for(let i=0;i<100;i++)overlay.ground({ctx,toMap,now:2200+i,size:700});
    assert.equal(canvases,1,'repeated drawing retains only one canvas');
  }finally{globalThis.document=previous;}
}
