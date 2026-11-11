// War checkpoint 5 Node speed benchmark (f6 plan changes): two wars at full troop caps, 60 troops a side
// (240 fighting), a mix of the shared roster. Prints sim ms per tick with and without the battles.
// Run from the repo root: node game/tools/bench_war.mjs [ticks]
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { terrainAt } from '../src/sim/world_data.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'), frontier: { ...frontier, dev: true, railways: data('data/railways.json') } });
const TICKS = Number(process.argv[2]) || 600, SIDE = frontier.war.troopCap.max;
const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
const hero = g.state.entities[m.heroId], war = g.frontier.war, fw = g.frontier.world;
const rival = Object.keys(g.state.clans).find(c => c !== 'player');
const open = (x, z, r) => { for (let dx = -r; dx <= r; dx += 50) for (let dz = -r; dz <= r; dz += 50) if (terrainAt(world, x + dx, z + dz) !== 'p') return false; return true; };
const spots = [];
for (let z = 500; z < world.size.h - 500 && spots.length < 2; z += 50) for (let x = 500; x < world.size.w - 500 && spots.length < 2; x += 50) {
  if (Math.hypot(x - world.capital.x, z - world.capital.z) < 1600 || spots.some(s => Math.hypot(x - s[0], z - s[1]) < 2000)) continue;
  if (open(x, z, 500)) spots.push([x, z]);
}
const addTown = (id, owner, [x, z]) => fw.addTown({ id, name: id, region: null, owner, x, z, site: null, traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 5, stock: frontier.founding.startStock, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
addTown('enemyTown', rival, spots[0]); addTown('myTown', 'player', spots[1]);
g.step([]);
const run = c => g.step([{ id: hero.id, type: 'frontier', ...c }]);
run({ action: 'devStartWar', town: 'enemyTown', side: 'attack' }); run({ action: 'devStartWar', town: 'myTown', side: 'defend' });
const wars = war.active();
if (wars.length !== 2) throw new Error(`expected 2 wars, got ${wars.length}`);
for (let i = 0; i < 60; i++) g.step([]);
const time = n => { const t = []; for (let i = 0; i < n; i++) { const a = performance.now(); g.step([]); t.push(performance.now() - a); } t.sort((a, b) => a - b); return { avg: t.reduce((s, v) => s + v, 0) / n, p95: t[Math.floor(n * 0.95)], max: t.at(-1) }; };
const base = time(200);
// 60 a side per war, the roster mix, 40 apart on open ground beside the camp, told to attack-move at each other
const mix = ['grunt', 'grunt', 'grunt', 'brute', 'enforcer', 'archer', 'archer', 'rifleman', 'sword_rider', 'mounted_pikeman'];
for (const w of wars) {
  const cx = w.camp.x + 60, cz = w.camp.z;
  for (const [side, owner, dx] of [[0, w.attacker, -20], [1, w.defender, 20]]) for (let i = 0; i < SIDE; i++) {
    const x = cx + dx + (side ? 1 : -1) * Math.floor(i / 10) * 2.5, z = cz + (i % 10) * 2.5 - 12;
    const id = war.spawnTroop(w, mix[i % mix.length], x, z, owner), e = g.state.entities[id];
    e.order = { kind: 'attackmove', x: cx - dx, z: cz };
  }
}
const alive = () => Object.values(g.state.entities).filter(e => e.warTroop && e.type !== 'horse' && !e.dead).length;
const start = alive();
const fight = time(TICKS);
const ms = v => v.toFixed(2);
console.log(`bench_war: ${start} troops in 2 wars (${SIDE} a side), ${TICKS} ticks; entities ${Object.keys(g.state.entities).length}`);
console.log(`  no battles: avg ${ms(base.avg)} ms, p95 ${ms(base.p95)}, max ${ms(base.max)}`);
console.log(`  battles   : avg ${ms(fight.avg)} ms, p95 ${ms(fight.p95)}, max ${ms(fight.max)}  (one tick = 50 ms at 20 Hz)`);
console.log(`  troops still standing: ${alive()} of ${start}`);
