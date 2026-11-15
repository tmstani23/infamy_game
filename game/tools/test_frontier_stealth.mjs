// Frontier stealth and the Smoke Bomb rule (Tim 2026-11-09, built 2026-11-15; sim/stealth.js, game.js islandCover /
// islandLit, hero_abilities.js, ninja_bot.js): day and night ranges on the island, cover, lights, riding reveals,
// and the ninja hero veiled by his own smoke (also in a war circle) for smokeLinger s after leaving it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { terrainAt } from '../src/sim/world_data.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), U = data('data/units.json'), FR = U.rules.stealth.frontier;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'shinobi', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 5 });
const S = g.state, hero = S.entities[m.heroId];
assert.equal(S.clans.player.kind, 'ninja', 'a Shinobi game');
// open plain far from towns and camps, and a forest cell
const far = (x, z) => Math.hypot(x - world.capital.x, z - world.capital.z) > 1500 && (world.camps || []).every(c => Math.hypot(x - c.x, z - c.z) > 200) && world.sites.every(s => Math.hypot(x - s.x, z - s.z) > 800);
let plain = null, forest = null;
for (let z = 400; z < world.size.h - 400 && !(plain && forest); z += 25) for (let x = 400; x < world.size.w - 400 && !(plain && forest); x += 25) {
  if (!far(x, z)) continue; const t = terrainAt(world, x, z);
  if (!plain && t === 'p' && terrainAt(world, x + 30, z) === 'p') plain = [x, z];
  if (!forest && t === 'f' && terrainAt(world, x + 10, z) === 'f') forest = [x, z];
}
assert.ok(plain && forest, 'plain and forest ground');
const step = () => { S.tick++; g.stealth.tick(); };
const place = ([x, z]) => { Object.assign(hero, { place: 'world', x, z, anim: 'idle', mounted: false, dead: false, downed: false }); delete hero.revealUntil; delete hero.buffs; };
// by day: dayRange on open ground, shortened in cover
S.night = false; place(plain); step();
assert.equal(hero.stealthStatus.range, FR.dayRange, 'day range on open ground');
place(forest); step();
assert.equal(hero.stealthStatus.range, FR.dayRange * FR.coverFactor, 'cover shortens it');
// at night: dark range, or the lit range inside a town ring
S.night = true; place(plain); step();
assert.equal(hero.stealthStatus.range, FR.darkRange, 'dark range at night');
const site = world.sites.find(s => Math.hypot(s.x - world.capital.x, s.z - world.capital.z) > 1500);
g.frontier.world.addTown({ id: 'tL', name: 'Lamps', owner: Object.keys(S.clans).find(c => c !== 'player'), x: site.x, z: site.z, pop: 3, founded: true, stock: { food: 100 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const inRing = [site.x + 60, site.z]; place(inRing); step();
assert.equal(hero.stealthStatus.range, FR.litRange * (terrainAt(world, inRing[0], inRing[1]) && ['f', 'b', 'k'].includes(terrainAt(world, inRing[0], inRing[1])) ? FR.coverFactor : 1), 'a town ring is lit at night');
// riding reveals him
place(plain); step(); assert.equal(hero.hidden, true, 'hidden alone on the plain');
hero.mounted = true; step(); assert.equal(hero.hidden, false, 'riding reveals him'); hero.mounted = false;
// Smoke Bomb: veiled in his own smoke, and smokeLinger s after walking out, until he attacks
place(plain); S.smokes = [{ clan: 'player', place: 'world', x: hero.x, z: hero.z, r: 3, until: S.tick + 200 }]; step();
assert.ok(g.stealth.veiled(hero) && hero.hidden, 'veiled in his smoke');
hero.x += 10; S.smokes = []; for (let i = 0; i < 20 * (U.rules.stealth.smokeLinger - 1); i++) step();
assert.ok(g.stealth.veiled(hero), 'still veiled after leaving the smoke');
for (let i = 0; i < 40; i++) step();
assert.ok(!g.stealth.veiled(hero), 'the veil runs out');
// in a war circle the hero is not hidden, except while his smoke veils him
const rival = Object.keys(S.clans).find(c => c !== 'player');
S.frontier.wars ||= { list: {}, cooldown: {}, history: [] };
S.frontier.wars.list.w9 = { id: 'w9', town: 'tL', attacker: 'player', defender: S.frontier.settlements.tL.owner, x: site.x - 350, z: site.z, started: S.tick, state: 'active', camp: { x: site.x - 350, z: site.z, chest: 0, stock: { timber: 0, stone: 0 }, brought: {}, workers: [], workerTraining: [], buildings: [{ id: 'w9:hall', type: 'camp_hall', stage: 'built', x: site.x - 350, z: site.z }] } };
place([site.x - 200, site.z]); step(); assert.equal(hero.hidden, false, 'in a war circle he is seen');
S.smokes = [{ clan: 'player', place: 'world', x: hero.x, z: hero.z, r: 3, until: S.tick + 200 }]; step();
assert.ok(hero.hidden && g.stealth.veiled(hero), 'his smoke hides him in a war circle too');
hero.swing = { t: 1 }; step(); assert.equal(hero.hidden, false, 'attacking shows him'); delete hero.swing;
// Assassinate is ready at once while veiled (no hidden time)
S.smokes = [{ clan: 'player', place: 'world', x: hero.x, z: hero.z, r: 3, until: S.tick + 200 }]; delete hero.buffs; step();
hero.hiddenAt = S.tick; S.clans.player.notice = null;
g.step([{ id: hero.id, type: 'ability', slot: 'F', x: hero.x + 1, z: hero.z }]);
assert.ok(!/stay hidden/.test(S.clans.player.notice?.text || ''), `no hidden-time wait while veiled (${S.clans.player.notice?.text})`);
// without the veil the hidden time still applies
S.smokes = []; delete hero.buffs; Object.assign(hero, { hidden: true, hiddenAt: S.tick }); delete hero.cooldowns; S.clans.player.notice = null;
const sw = S.frontier.wars.list.w9; delete S.frontier.wars.list.w9;
g.step([{ id: hero.id, type: 'ability', slot: 'F', x: hero.x + 1, z: hero.z }]);
assert.match(S.clans.player.notice?.text || '', /stay hidden/, 'real stealth keeps the wait');
S.frontier.wars.list.w9 = sw;
console.log('test_frontier_stealth: ok');
