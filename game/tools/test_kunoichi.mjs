// War checkpoint 7-5: the Shinobi kunoichi, war stealth and detection (sim/stealth.js war stealth).
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
const run = (n, fn) => { for (let i = 0; i < n; i++) { g.step([]); if (fn?.()) return i + 1; } return n; };
const order = (ids, st, extra = {}) => g.step([{ id: hero.id, type: 'order', kind: 'raze', structure: st.key, units: ids, ...extra }]);

const U = data('data/units.json').types, K = U.kunoichi.kunoichi;
assert.deepEqual(frontier.war.units.kunoichi.at, ['hidden_dojo']); assert.equal(frontier.war.buildings.hidden_dojo.clan, 'shinobi');
assert.ok(K.revealTicks > 0 && K.ambush.damage > 1 && K.vanishCooldownTicks > 0 && U.dog_handler.detect > U.kuroda_rifleman.detect);
const bx = enemy.x + 120, bz = enemy.z + 120;   // open ground inside the war circle
const k = g.state.entities[war.spawnTroop(rec, 'kunoichi', bx, bz)];
const foe = g.state.entities[war.spawnTroop(rec, 'brute', bx + 3, bz, rival)];
foe.order = { kind: 'station', x: foe.x, z: foe.z };

// ---- hidden until she acts: the enemy beside her neither sees nor attacks her --------------------------------
run(60);
assert.equal(k.hidden, true, 'she is hidden'); assert.equal(g.vision.canSee(rival, k), false, 'the enemy clan does not see her'); assert.equal(g.vision.canSee('player', k), true);
assert.equal(k.hp, k.maxHp, 'and is not attacked'); assert.equal(foe.swing, undefined);

// ---- ambush: the first hit from hiding is heavy, once; attacking shows her ------------------------------------------
{ const hp0 = foe.hp; let amb = 0;
  g.step([{ id: hero.id, type: 'order', kind: 'attack', target: foe.id, units: [k.id] }]);
  run(200, () => { amb += g.state.casts.filter(c => c.kind === 'ambush' && c.a === k.id).length; return foe.hp < hp0; });
  const first = hp0 - foe.hp;
  assert.equal(amb, 1, 'one ambush'); assert.ok(first >= U.kunoichi.damage * K.ambush.damage * 0.8, `the ambush hit is heavy (${first})`);
  assert.equal(k.hidden, false, 'attacking shows her'); assert.ok(k.buffs?.ambush?.until > g.state.tick, 'with the short buff');
  const hp1 = foe.hp; run(200, () => { amb += g.state.casts.filter(c => c.kind === 'ambush').length; return foe.hp < hp1; });
  const second = hp1 - foe.hp;
  assert.equal(amb, 1, 'no second ambush while shown'); assert.ok(second > 0 && second < first * 0.75, `later hits are normal (${second} after ${first})`);
  run(100, () => k.hp < k.maxHp); assert.ok(k.hp < k.maxHp, 'shown, she is fought'); }

// ---- Vanish: sent away while shown she hides again at once; then it is on cooldown --------------------------------------
{ g.step([{ id: hero.id, type: 'order', kind: 'move', units: [k.id], x: k.x - 30, z: k.z }]);
  run(3); assert.equal(k.hidden, true, 'Vanish hides her as she runs'); assert.ok(k.vanishReadyAt > g.state.tick + K.vanishCooldownTicks - 20);
  const hp = k.hp; run(60); assert.equal(k.hp, hp, 'nobody follows her');
  // shown again by a hit on her: no second Vanish yet, she stays shown for revealTicks
  g.stealth?.reveal ? g.stealth.reveal(k) : (k.revealUntil = g.state.tick + K.revealTicks, k.hidden = false);
  g.step([{ id: hero.id, type: 'order', kind: 'move', units: [k.id], x: k.x - 10, z: k.z }]);
  run(10); assert.equal(k.hidden, false, 'Vanish is on cooldown');
  run(K.revealTicks + 5); assert.equal(k.hidden, true, 'hidden again after a few seconds'); }

// ---- detection: dog handler (wide), Teppo rifleman (short), a built watchtower ----------------------------------------------
{ for (const e of Object.values(g.state.entities)) if (e.owner === rival && e.warTroop) e.dead = true;
  run(10); k.order = { kind: 'stop' }; k.holdFire = true;
  const dh = g.state.entities[war.spawnTroop(rec, 'dog_handler', k.x + U.dog_handler.detect - 2, k.z, rival)]; dh.holdFire = true; dh.autoCast = false; dh.order = { kind: 'station', x: dh.x, z: dh.z };
  run(8); assert.ok(k.hidden && k.detectedBy?.[rival] > g.state.tick, 'the dog handler detects her'); assert.equal(g.vision.canSee(rival, k), true, 'so his side sees her');
  dh.x += 40; dh.order = { kind: 'station', x: dh.x, z: dh.z }; run(12); assert.equal(g.vision.canSee(rival, k), false, 'out of his radius she is hidden again');
  dh.dead = true;
  const tp = g.state.entities[war.spawnTroop(rec, 'teppo', k.x + U.kuroda_rifleman.detect + 2, k.z, rival)]; tp.holdFire = true; tp.autoCast = false; tp.order = { kind: 'station', x: tp.x, z: tp.z };
  run(8); assert.equal(g.vision.canSee(rival, k), false, 'a Teppo rifleman just outside his short radius does not');
  tp.x = k.x + U.kuroda_rifleman.detect - 1; tp.order = { kind: 'station', x: tp.x, z: tp.z }; run(8); assert.equal(g.vision.canSee(rival, k), true, 'inside it he does');
  tp.dead = true; run(12); assert.equal(g.vision.canSee(rival, k), false); }
{ // an enemy kunoichi near my camp's built watchtower is seen by my side
  const campHall = rec.camp.buildings.find(b => b.type === 'camp_hall');
  rec.camp.buildings.push({ id: 'wt1', type: 'watchtower', stage: 'built', x: campHall.x + 25, z: campHall.z });
  const ek = g.state.entities[war.spawnTroop(rec, 'kunoichi', campHall.x + 25 + frontier.war.structures.tower.range + 6, campHall.z, rival)]; ek.holdFire = true; ek.order = { kind: 'stop' };
  run(8); assert.ok(ek.hidden && !g.vision.canSee('player', ek), 'outside the tower range she is hidden from me');
  ek.x = campHall.x + 25 + 6; let seen = false, hp = ek.hp; run(8, () => (seen ||= ek.hidden && g.vision.canSee('player', ek)));
  assert.ok(seen, 'in range of my watchtower I see her while she is still hidden');
  run(80); assert.ok(ek.hp < hp, 'and the tower shoots her'); }

// ---- save and load keep her state ---------------------------------------------------------------------------------------------
{ const save = JSON.parse(JSON.stringify(makeSave(g))); const g2 = createGame(options()); loadSave(g2, save);
  const k2 = g2.state.entities[k.id]; assert.equal(k2.hidden, k.hidden); assert.equal(k2.vanishReadyAt, k.vanishReadyAt);
  for (let i = 0; i < 40; i++) { g.step([]); g2.step([]); } assert.equal(k2.hidden, k.hidden); assert.equal(k2.x, k.x); }
console.log('test_kunoichi: ok');
