// War checkpoint 7-2: siege units. Cannons (siege rate, ball as a projectile, heavy), fire-bomb throwers (area damage,
// fire on wood, reduced on stone), ranged hits on structures fly as projectiles, foundry training, save parity.
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
const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);
const G = enemy.grid, n = G.n, C = centreCell(n);
const WALL = C + 6, GATE = C + 6 + n, HOUSE = C - 6, STORE = C + 5 * n;
G.use = put(put(G.use, WALL, 'w'), GATE, 'g');
const house = () => { G.ground = put(G.ground, HOUSE, 'c'); G.zone = put(G.zone, HOUSE, 'h'); G.stage = put(G.stage, HOUSE, '2'); };
house();
G.use = put(G.use, STORE, 'B'); enemy.buildings.push({ type: 'storehouse', stage: 'built', cell: STORE });
const stockadeCells = [C - 5 * n, C - 5 * n + 1, C - 4 * n, C - 4 * n + 1];
for (const i of stockadeCells) G.use = put(G.use, i, 'B');
enemy.buildings.push({ id: 'stk', type: 'stockade', stage: 'built', cell: stockadeCells[0], cells: stockadeCells });
const hall = enemy.buildings.find(b => b.type === 'town_hall');
const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
const key = cell => `t|enemyTown|${cell}`;
// ---- a war: the attacker may damage the town, nobody else -------------------------------------
Object.assign(hero, { x: enemy.x + 300, z: enemy.z, place: 'world' });
{ const r = cmd({ action: 'devStartWar', town: 'enemyTown', side: 'attack' }); assert.ok(r?.ok, r?.reason); }
const rec = war.warOn('enemyTown');
const S = frontier.war.structures, U = data('data/units.json').types;
const sStore = ST.find(key(STORE)), sWall = ST.find(key(WALL));
const run = (n, fn) => { for (let i = 0; i < n; i++) { g.step([]); if (fn?.()) return i + 1; } return n; };
const order = (ids, st, extra = {}) => g.step([{ id: hero.id, type: 'order', kind: 'raze', structure: st.key, units: ids, ...extra }]);

// ---- data and training ----------------------------------------------------------------------------
assert.ok(U.field_cannon.siege && U.wooden_cannon.siege && U.fire_bomber.projectile.bomb && U.fire_bomber.projectile.area.radius > 0);
assert.deepEqual(war.trainsAt('foundry', 'player'), ['wooden_cannon'], 'a Yakuza foundry trains the wooden cannon only');
assert.deepEqual(war.trainsAt('foundry').sort(), ['cannon', 'fire_bomber', 'gatling', 'wooden_cannon'], 'each clan has its siege weapon, the Kuroda also the Gatling crew');
assert.ok(S.damage.bomb > 0 && S.stone.types.includes('wall') && S.stone.bomb < 1);

// ---- cannon: the ball flies, lands for the siege rate, and it cannot torch ---------------------------
const cannon = war.spawnTroop(rec, 'wooden_cannon', sStore.x + 10, sStore.z + 10);
assert.equal(ST.torchers([cannon]), 0, 'a cannon cannot torch');
order([cannon], sStore);
{ let ball = null, boom = false, hp0 = sStore.b.hp ?? sStore.max;
  const t = run(600, () => { ball ||= g.state.projectiles.find(p => p.kind === 'cannonball' && p.structure === sStore.key) || null; boom ||= g.state.casts.some(c => c.kind === 'cannonFire' && c.a === cannon); return (sStore.b.hp ?? sStore.max) < hp0; });
  assert.ok(ball && boom, 'a cannon ball is drawn and the shot has its flash');
  assert.ok(g.state.tick >= ball.until, 'the damage lands with the ball, not before');
  assert.equal(hp0 - sStore.b.hp, U.wooden_cannon.damage * S.damage.siege, `one ball does siege damage (after ${t} ticks)`);
  assert.equal(g.state.frontier.fires?.[sStore.key], undefined, 'a ball starts no fire');
  assert.ok(Math.hypot(g.state.entities[cannon].x - sStore.x, g.state.entities[cannon].z - sStore.z) > 6, 'it shoots from range'); }
g.state.entities[cannon].order = { kind: 'stop' };
run(60);

// ---- heavy: a cannon barely moves when infantry stands in it, the infantry is pushed out ---------------
{ const c = g.state.entities[cannon], gid = war.spawnTroop(rec, 'grunt', c.x + 0.3, c.z), u = g.state.entities[gid];
  const c0 = [c.x, c.z], u0 = [u.x, u.z];
  run(40);
  const dc = Math.hypot(c.x - c0[0], c.z - c0[1]), du = Math.hypot(u.x - u0[0], u.z - u0[1]);
  assert.ok(du > 0.3 && dc < du / 3, `the grunt gives way (${du.toFixed(2)}), the cannon hardly (${dc.toFixed(2)})`);
  u.dead = true; }

// ---- fire bombs: wood burns, stone does not and takes less -------------------------------------------
const bomber = war.spawnTroop(rec, 'fire_bomber', sStore.x + 8, sStore.z + 8);
order([bomber], sStore);
{ let bomb = false, burst = false;
  run(400, () => { bomb ||= g.state.projectiles.some(p => p.kind === 'firebomb'); burst ||= g.state.casts.some(c => c.kind === 'firebombBurst'); return !!g.state.frontier.fires?.[sStore.key]; });
  assert.ok(bomb && burst && g.state.frontier.fires?.[sStore.key], 'a bomb on a wooden building starts its fire');
  assert.equal(Object.keys(g.state.frontier.fires).length, 1); }
order([bomber], sWall);
{ const hp0 = ST.hpOf(sWall);
  run(600, () => ST.hpOf(sWall) < hp0);
  assert.equal(hp0 - ST.hpOf(sWall), U.fire_bomber.damage * S.damage.bomb * S.stone.bomb, 'stone takes reduced bomb damage');
  assert.equal(g.state.frontier.fires?.[sWall.key], undefined, 'and does not catch fire'); }
g.state.entities[bomber].order = { kind: 'stop' };

// ---- fire bombs on troops: everyone around the target is hurt ------------------------------------------
{ const b = g.state.entities[bomber], foes = [0, 1, 2].map(k => g.state.entities[war.spawnTroop(rec, 'grunt', b.x + 4 + k * 0.8, b.z + 3, rival)]);
  const far = g.state.entities[war.spawnTroop(rec, 'grunt', b.x + 4, b.z + 12, rival)];
  for (const e of [...foes, far]) { e.holdFire = true; e.order = { kind: 'station', x: e.x, z: e.z }; }
  const hp0 = foes.map(e => e.hp), farHp = far.hp;
  g.step([{ id: hero.id, type: 'order', kind: 'attack', target: foes[1].id, units: [bomber] }]);
  run(300, () => foes[1].hp < hp0[1]);
  assert.ok(foes[1].hp < hp0[1], 'the target is hit');
  assert.ok(foes[0].hp < hp0[0] && foes[2].hp < hp0[2], 'those beside it too');
  assert.ok(hp0[0] - foes[0].hp < hp0[1] - foes[1].hp, 'for a share of the damage');
  assert.equal(far.hp, farHp, 'not the one far off');
  for (const e of [...foes, far]) e.dead = true; b.order = { kind: 'stop' }; }

// ---- ranged troops' shots at a structure are drawn too ---------------------------------------------------
{ const archer = war.spawnTroop(rec, 'archer', sWall.x + 5, sWall.z + 5); order([archer], sWall);
  let arrow = false; run(300, () => (arrow ||= g.state.projectiles.some(p => p.kind === 'arrow' && p.structure === sWall.key)));
  assert.ok(arrow, 'an archer shooting a wall shows its arrow'); }

// ---- save and load with a shot in flight -------------------------------------------------------------------
{ order([cannon], sWall);
  run(600, () => !!g.state.frontier.shots?.length);
  assert.ok(g.state.frontier.shots?.length, 'a shot is in flight');
  const save = JSON.parse(JSON.stringify(makeSave(g)));
  const g2 = createGame(options()); loadSave(g2, save);
  assert.deepEqual(g2.state.frontier.shots, g.state.frontier.shots);
  for (let i = 0; i < 100; i++) { g.step([]); g2.step([]); }
  assert.deepEqual(g2.state.frontier.settlements.enemyTown.cellHp, enemy.cellHp, 'same after 100 ticks'); }
fw.checkInvariants();
console.log('test_siege: ok');
