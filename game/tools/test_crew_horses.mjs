// Tim 2026-11-07: crew horses (sim/mounts.js mountUp): Shift+H puts the hero and his crew on horses; settlers never ride; hits put crew off; vehicles take crew without the hero (sim/omnibus.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), U = data('data/units.json');
const SB = frontier.buildings.stable.stable, M = U.rules.mount;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId], clan = S.clans.player;
const site = world.sites.find(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700) || world.sites[0];
g.frontier.world.addTown({ id: 'tS', name: 'Stableton', owner: 'player', x: site.x, z: site.z, pop: 3, stock: { food: 500, goods: 300, timber: 400, stone: 200 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const town = S.frontier.settlements.tS;
const cmd = c => g.step([{ id: hero.id, type: 'frontier', action: 'stable', town: 'tS', ...c }]);
Object.assign(hero, { place: 'world', x: site.x + 60, z: site.z + 60 });
g.step([]);   // the town gets its grid

// --- no stable: nothing to make ---------------------------------------------------------------------
const nearCell = s => { let best = -1, bd = Infinity; s.grid.use.split('').forEach((c, i) => { if (c !== '.') return; const [x, z] = g.frontier.stable.centre(s, { cell: i }), d = Math.hypot(x - s.x, z - s.z); if (d > 25 && d < bd) { bd = d; best = i; } }); return best; };
town.buildings.push({ id: 'st1', type: 'stable', cell: nearCell(town), stage: 'built' });
town.tier = 2; town.stock.timber = 2000; town.stock.goods = 2000; town.stock.food = 2000;
const [sx, sz] = g.frontier.stable.centre(town, town.buildings.at(-1));
for (const n of [3, 1]) { for (let k = 0; k < n; k++) cmd({ mode: 'horse', kind: 'calico' }); for (let t = 0; t < n * 60 * 20 + 40; t++) g.step([]); }
const myHorses = () => Object.values(S.entities).filter(e => e.type === 'horse' && e.horseOwner === 'player' && !e.dead);
assert.ok(myHorses().length >= 4, `horses ready (${myHorses().length})`);
Object.assign(hero, { place: 'world', x: sx + 30, z: sz + 30 }); hero.hitAt = -1e9;
const crew = [0, 1, 2].map(k => S.entities[g.spawn('thug', 'thug', hero.x + 2 + k, hero.z + 2, { owner: 'player', place: 'world', hp: 100, order: { kind: 'follow', target: hero.id } })]);
const settler = S.entities[g.spawn('settler', 'laborer', hero.x - 2, hero.z + 2, { owner: 'player', place: 'world', holdFire: true, order: { kind: 'follow', target: hero.id } })];
for (const h of myHorses()) Object.assign(h, { x: hero.x + 8, z: hero.z - 4 });
const up = () => g.step([{ id: hero.id, type: 'mount', group: true }]);
up();
for (let t = 0; t < 60; t++) g.step([]);
assert.ok(hero.mounted, 'the hero is up');
assert.ok(crew.every(u => u.mounted && u.ride?.kind === 'horse'), `crew are up (${crew.map(u => !!u.mounted)})`);
assert.ok(!settler.mounted, 'settlers never ride');
// crew follow at horse speed
const x0 = crew[0].x;
for (let t = 0; t < 60; t++) g.step([{ id: hero.id, type: 'move', right: 1, down: 0 }]);
for (let t = 0; t < 20; t++) g.step([]);
assert.ok(Math.hypot(crew[0].x - hero.x, crew[0].z - hero.z) < 20, `mounted crew kept up (${Math.hypot(crew[0].x - hero.x, crew[0].z - hero.z).toFixed(1)})`);
const ridden = state => myHorses().find(h => h.rider === crew[1].id);
const h1 = ridden();
assert.ok(h1 && Math.hypot(h1.x - crew[1].x, h1.z - crew[1].z) < 0.01, 'the horse is under him');
// a hit puts him off; the horse waits there
crew[1].hitBy = { id: 'x', tick: S.tick }; g.step([]);
assert.ok(!crew[1].mounted && !h1.rider, 'off when hit');
// Shift+H again: everyone off
up();
assert.ok(!hero.mounted && crew.every(u => !u.mounted), 'everyone off');
// short of horses: a note
for (let k = 0; k < 4; k++) crew.push(S.entities[g.spawn('thug', 'thug', hero.x + 3, hero.z + 3 + k, { owner: 'player', place: 'world', hp: 100, order: { kind: 'follow', target: hero.id } })]);
up();
assert.match(clan.notice?.text || '', /no horse/, `short of horses (${clan.notice?.text})`);
up(); for (let t = 0; t < 5; t++) g.step([]);
// crew into a rickshaw without the hero (Tim 2026-11-07): they walk over and get in, two seats
for (const u of crew) if (u.mounted) g.step([{ id: hero.id, type: 'mount', group: true }]);
cmd({ mode: 'rickshaw' }); for (let t = 0; t < 50 * 20; t++) g.step([]);
const rk = Object.values(S.entities).find(e => e.type === 'rickshaw' && e.omnibusOwner === 'player');
assert.ok(rk, 'a rickshaw');
Object.assign(rk, { x: hero.x + 20, z: hero.z });
const three = crew.filter(u => !u.dead && !u.mounted).slice(0, 3);
g.step([{ id: hero.id, type: 'omnibus', action: 'board', omnibus: rk.id, units: three.map(u => u.id), crewOnly: true }]);
for (let t = 0; t < 200 && Object.values(S.entities).filter(u => u.aboard === rk.id).length < 2; t++) g.step([]);
const inside = Object.values(S.entities).filter(u => u.aboard === rk.id);
assert.equal(inside.length, 2, `two crew got in (${inside.length})`);
assert.ok(!hero.aboard, 'the hero stayed out');
const rx = rk.x; for (let t = 0; t < 40; t++) g.step([]);
assert.ok(Math.abs(rk.x - rx) < 0.5, 'it stays put until told');
g.step([{ id: hero.id, type: 'omnibus', action: 'deploy', vehicles: [rk.id] }]);
assert.equal(Object.values(S.entities).filter(u => u.aboard === rk.id).length, 0, 'let out');
// one at a time: a second crew member joins the one already inside (Tim 2026-11-07: same as the omnibus)
for (const u of three.slice(0, 2)) {
  g.step([{ id: hero.id, type: 'omnibus', action: 'board', omnibus: rk.id, units: [u.id], crewOnly: true }]);
  for (let t = 0; t < 200 && u.aboard !== rk.id; t++) g.step([]);
  assert.equal(u.aboard, rk.id, 'got in one at a time');
}
g.step([{ id: hero.id, type: 'omnibus', action: 'board', omnibus: rk.id, units: [three[2].id], crewOnly: true }]);
assert.ok(!three[2].boardBus, 'full: no third');
console.log('test_crew_horses: ok');
