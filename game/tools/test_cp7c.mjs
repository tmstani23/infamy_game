// War checkpoint 7c-1 (Tim 2026-11-12): field clinic heal, watchtower sight, the war circle leash.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { terrainAt } from '../src/sim/world_data.js';
import { townBlockersIn, cellToWorld, centreCell } from '../src/sim/frontier/town_grid.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'), frontier: { ...frontier, dev: true, railways: data('data/railways.json') } });
const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
const hero = g.state.entities[m.heroId], war = g.frontier.war, fw = g.frontier.world, ST = g.frontier.structures;
const rival = Object.keys(g.state.clans).find(c => c !== 'player');
const third = Object.keys(g.state.clans).find(c => c !== 'player' && c !== rival);
const open = (x, z, r) => { for (let dx = -r; dx <= r; dx += 50) for (let dz = -r; dz <= r; dz += 50) if (terrainAt(world, x + dx, z + dz) !== 'p') return false; return true; };
const spots = [];
for (let z = 500; z < world.size.h - 500 && spots.length < 2; z += 50) for (let x = 500; x < world.size.w - 500 && spots.length < 2; x += 50) {
  if (Math.hypot(x - world.capital.x, z - world.capital.z) < 1600 || spots.some(s => Math.hypot(x - s[0], z - s[1]) < 2000)) continue;
  if (open(x, z, 500)) spots.push([x, z]);
}
assert.equal(spots.length, 2, 'test spots exist');
const addTown = (id, owner, [x, z]) => fw.addTown({ id, name: id, region: null, owner, x, z, site: null, traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 5, stock: { ...frontier.founding.startStock, ryo: 0 }, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
const enemy = addTown('enemyTown', rival, spots[0]), mine = addTown('myTown', 'player', spots[1]);
g.step([]);
const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
Object.assign(hero, { x: enemy.x + 300, z: enemy.z, place: 'world' });
{ const r = cmd({ action: 'devStartWar', town: 'enemyTown', side: 'attack' }); assert.ok(r?.ok, r?.reason); }
const rec = war.warOn('enemyTown'), W = frontier.war, R = W.circleRadius;
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const ids = () => new Set(Object.keys(g.state.entities));
const troop = (x, z) => { const b = ids(); war.spawnTroop(rec, 'grunt', x, z); return g.state.entities[Object.keys(g.state.entities).find(id => !b.has(id))]; };

// ---- field clinic: troops, hero and crew near the finished clinic recover faster ---------------------
{ const C = W.buildings.field_clinic.heal; assert.ok(C.radius > 0 && C.healFactor > 1, 'clinic heal data');
  const cx = rec.camp.x + 20, cz = rec.camp.z;
  const b = { id: 'clinicT', type: 'field_clinic', stage: 'site', x: cx, z: cz }; rec.camp.buildings.push(b);
  const near = troop(cx + 5, cz + 5), far = troop(cx + C.radius + 40, cz);
  Object.assign(hero, { x: cx - 4, z: cz });
  run(11); assert.ok(!near.infirmary, 'an unfinished clinic heals nobody');
  b.stage = 'built'; run(11);
  assert.equal(near.infirmary, C.healFactor, 'a troop near the clinic'); assert.equal(hero.infirmary, C.healFactor, 'the hero near the clinic'); assert.ok(!far.infirmary, 'not one far from it');
  near.hp = near.maxHp * 0.5; far.hp = far.maxHp * 0.5; near.hitAt = far.hitAt = -1e6; near.order = far.order = { kind: 'stop' };
  const n0 = near.hp, f0 = far.hp; run(100);
  assert.ok(near.hp - n0 > (far.hp - f0) * 3, `the near one heals much faster (${(near.hp - n0).toFixed(1)} against ${(far.hp - f0).toFixed(1)})`);
  b.stage = 'ruined'; run(11); assert.ok(!near.infirmary, 'a ruined clinic heals nobody'); }

// ---- watchtower: its owner sees units near it with nobody standing there -------------------------------
{ const T = W.structures.tower; assert.ok(T.sight > 0, 'tower sight data');
  const tx = rec.camp.x - 120, tz = rec.camp.z + 120;
  const foe = troop(tx + T.sight - 3, tz); foe.owner = rival;
  for (const e of Object.values(g.state.entities)) if (e.owner === 'player' && e.place === 'world') Object.assign(e, { x: rec.camp.x + 20, z: rec.camp.z });
  run(1); assert.ok(!g.vision.canSee('player', foe), 'nobody near: not seen');
  const b = { id: 'towerT', type: 'watchtower', stage: 'site', x: tx, z: tz }; rec.camp.buildings.push(b);
  run(1); assert.ok(!g.vision.canSee('player', foe), 'an unfinished tower sees nothing');
  b.stage = 'built'; run(1); assert.ok(g.vision.canSee('player', foe), 'a built tower sees it');
  assert.ok(!g.vision.canSee(rival, hero) || Math.hypot(hero.x - foe.x, hero.z - foe.z) < 40, 'the tower gives the other side nothing');
  Object.assign(foe, { x: tx + T.sight + 30, z: tz }); run(1); assert.ok(!g.vision.canSee('player', foe), 'not past its sight');
  foe.dead = true; }

// ---- leash: war troops stay inside their war circle -----------------------------------------------------
{ const dx = rec.camp.x - enemy.x, dz = rec.camp.z - enemy.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
  const t = troop(enemy.x + ux * (R - 6), enemy.z + uz * (R - 6));
  g.step([{ id: hero.id, type: 'order', kind: 'move', units: [t.id], x: enemy.x + ux * (R + 80), z: enemy.z + uz * (R + 80) }]);
  let worst = 0; for (let i = 0; i < 400; i++) { g.step([]); worst = Math.max(worst, Math.hypot(t.x - enemy.x, t.z - enemy.z)); }
  assert.ok(worst <= R + 3, `never well past the edge (${worst.toFixed(1)} of ${R})`);
  assert.ok(Math.hypot(t.x - enemy.x, t.z - enemy.z) <= R + 0.01, 'ends inside the circle');
  assert.ok(Math.hypot(t.order.x ?? t.x, t.order.z ?? t.z, 0) > 0 && Math.hypot((t.order.x ?? t.x) - enemy.x, (t.order.z ?? t.z) - enemy.z) <= R, 'its order ends inside too');
  Object.assign(t, { x: enemy.x + ux * (R + 50), z: enemy.z + uz * (R + 50) }); run(6);
  assert.ok(Math.hypot(t.x - enemy.x, t.z - enemy.z) <= R + 0.01, 'one that got outside is set back on the edge');
  const before = [hero.x, hero.z]; Object.assign(hero, { x: enemy.x + ux * (R + 50), z: enemy.z + uz * (R + 50) }); run(6);
  assert.ok(Math.hypot(hero.x - enemy.x, hero.z - enemy.z) > R, 'the hero is not leashed'); Object.assign(hero, { x: before[0], z: before[1] }); }

fw.checkInvariants();
console.log('test_cp7c: ok');
