// Frontier W3.6: world walk benchmark. Run from the repo root:
//   node --expose-gc game/tools/profile_world_chunks.mjs
// A campaign match; the hero goes out of the gate with 6 crew following and walks 5,000 units along
// the island route toward the far west at running pace, while the bots play on in the city.
// Prints chunk build time (average and worst), active and cached chunks, sim tick time and memory.
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: { ...data('data/world_chunks.json'), paint: data('data/world_paint.json') } };   // W3.10: painted props, as in the game
const cfg = options.worldChunks, DISTANCE = 5000, SPEED = 5;   // units a second, a little under a crew run so the group keeps up
const mb = () => process.memoryUsage().heapUsed / 1048576;

const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns });
g.civilians?.populate?.();
const bots = makeBots(g, m.rivals), hero = g.state.entities[m.heroId];
const [gx, gz] = [options.district.islandGate.x, options.district.islandGate.z];
const crew = [];
for (let k = 0; k < 6; k++) { const u = g.state.entities[g.spawn('thug', 'thug', gx + 2 + (k % 3), gz - 1 + Math.floor(k / 3) * 2, { owner: 'player' })]; if (u.deployment) u.deployment.group = 'hero'; crew.push(u); }
Object.assign(hero, { x: gx, z: gz });
g.step([{ id: hero.id, type: 'use', units: crew.map(u => u.id) }]);
if (hero.place !== 'world') throw new Error('hero did not go through the gate');
global.gc?.(); const heap0 = mb();

// the walk: the island route toward the westmost site, cut at DISTANCE
const far = options.world.sites.reduce((a, s) => (s.x < a.x ? s : a));
const pts = g.areas.route(hero.x, hero.z, far.x, far.z).points;
const slow = [];
let walked = 0, leg = 0, maxActive = 0, ticks = 0, tickMs = 0, worstTick = 0;
while (walked < DISTANCE && leg < pts.length) {
  const [tx, tz] = pts[leg], d = Math.hypot(tx - hero.x, tz - hero.z), step = SPEED / 20;
  if (d <= step) { hero.x = tx; hero.z = tz; leg++; walked += d; }
  else { hero.x += (tx - hero.x) / d * step; hero.z += (tz - hero.z) / d * step; walked += step; }
  const t0 = performance.now();
  g.step(bots.flatMap(b => b.tick()));
  const ms = performance.now() - t0;
  if (ms > 50) slow.push([ticks, ms.toFixed(0), hero.x.toFixed(0), hero.z.toFixed(0), g.state.dawn ? 'dawn' : g.state.dusk ? 'dusk' : g.state.night ? 'night' : 'day']);
  tickMs += ms; worstTick = Math.max(worstTick, ms); ticks++;
  maxActive = Math.max(maxActive, g.areas.active().length);
}
global.gc?.();
const s = g.areas.stats(), behind = Math.max(...crew.map(u => Math.hypot(u.x - hero.x, u.z - hero.z)));
console.log(`walked ${walked.toFixed(0)} units in ${(ticks / 20).toFixed(0)} s of game time`);
console.log(`chunks built ${s.built}: average ${(s.buildMs / s.built).toFixed(1)} ms, worst ${s.worstMs.toFixed(1)} ms`);
console.log(`active chunks now ${s.active}, most at once ${maxActive}; cached ${s.cached} (limit ${cfg.keepChunks})`);
console.log(`route graph ${s.graphMs?.toFixed(0)} ms (once); sim tick average ${(tickMs / ticks).toFixed(2)} ms, worst ${worstTick.toFixed(1)} ms`);
console.log(`heap +${(mb() - heap0).toFixed(1)} MB; crew furthest behind the hero: ${behind.toFixed(1)} units (all on the island: ${crew.every(u => u.place === 'world')})`);
if (s.cached > cfg.keepChunks) throw new Error('chunk cache over its limit');
if (slow.length) console.log('ticks over 50 ms [tick, ms, x, z]:', JSON.stringify(slow.slice(0, 10)));
console.log('profile_world_chunks: ok');
