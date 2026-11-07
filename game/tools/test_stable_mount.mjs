// Tim 2026-11-06: the stable (sim/frontier/stable.js) makes horses and omnibuses by hand on a production bar,
// paid in town stock; the hero's horse (sim/mounts.js): H rides, gets off or calls her; 3.5x run speed; no
// fighting on horseback; thrown off at low health; off at the gate. Bot towns raise one horse for their boss.
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
cmd({ mode: 'horse', kind: 'calico' });
assert.match(clan.notice?.text || '', /stable first/i);
const nearCell = s => { let best = -1, bd = Infinity; s.grid.use.split('').forEach((c, i) => { if (c !== '.') return; const [x, z] = g.frontier.stable.centre(s, { cell: i }), d = Math.hypot(x - s.x, z - s.z); if (d > 25 && d < bd) { bd = d; best = i; } }); return best; };
const cell = nearCell(town);
town.buildings.push({ id: 'st1', type: 'stable', cell, stage: 'built' });
const stable = town.buildings.at(-1);

// --- nothing is made on its own for the player -------------------------------------------------------
for (let t = 0; t < 40; t++) g.step([]);
assert.equal((stable.stableJobs || []).length, 0, 'no horse made by itself');

// --- raise Black Beauty: paid from town stock, ready after its seconds, becomes the mount -----------------
const food = town.stock.food;
cmd({ mode: 'horse', kind: 'black_beauty' });
assert.equal(stable.stableJobs.length, 1, 'on the bar');
assert.ok(Math.abs(town.stock.food - (food - SB.kinds.black_beauty.cost.food)) < 2, 'food paid');
cmd({ mode: 'horse', kind: 'calico' });
cmd({ mode: 'cancel' });
assert.equal(stable.stableJobs.length, 1, 'the last job cancelled');
for (let t = 0; t < SB.kinds.black_beauty.seconds * 20 + 5; t++) g.step([]);
const horses = () => Object.values(S.entities).filter(e => e.type === 'horse' && e.horseOwner === 'player');
assert.equal(horses().length, 1, 'a horse at the stable');
const bb = horses()[0];
assert.equal(bb.name, 'Black Beauty'); assert.equal(bb.model, M.models.black_beauty);
assert.equal(clan.mount, bb.id, 'the first horse is the mount');

// --- H far away: she gallops to the hero and he gets on --------------------------------------------------
const d0 = Math.hypot(bb.x - hero.x, bb.z - hero.z);
assert.ok(d0 > M.reach, 'she starts away from him');
g.step([{ id: hero.id, type: 'mount' }]);
assert.ok(bb.called, 'called');
for (let t = 0; t < 200 && !hero.mounted; t++) g.step([]);
assert.ok(hero.mounted && hero.ride?.horse === bb.id, 'she came and he got on');

// --- riding: 3.5x run speed, no fighting -------------------------------------------------------------------
assert.ok(Math.abs(g.stats.movement(hero, 'run') - 6 * M.speed) < 1e-6, `3.5x run (${g.stats.movement(hero, 'run')})`);
const x0 = hero.x;
for (let t = 0; t < 40; t++) g.step([{ id: hero.id, type: 'move', right: 1, down: 0 }]);
assert.ok(hero.x - x0 > 20, `galloped (${(hero.x - x0).toFixed(1)} in 2 s)`);
assert.ok(Math.hypot(bb.x - hero.x, bb.z - hero.z) < 1e-6, 'the horse is under him');
const foe = S.entities[g.spawn('thug', 'thug', hero.x + 1, hero.z, { owner: 'kuroda', place: 'world', hp: 100 })];
g.step([{ id: hero.id, type: 'attack', target: foe.id }]);
assert.ok(!hero.attackTarget, 'no fighting on horseback');
assert.match(clan.notice?.text || '', /Get off/);
delete S.entities[foe.id];

// --- H again: off; H beside her: on; thrown off at low health ---------------------------------------------------
g.step([{ id: hero.id, type: 'mount' }]);
assert.ok(!hero.mounted && !hero.ride && !bb.rider, 'got off');
g.step([{ id: hero.id, type: 'mount' }]);
assert.ok(hero.mounted, 'got on beside her');
hero.hp = hero.maxHp * 0.2;
g.step([]);
assert.ok(!hero.mounted, 'thrown off');
assert.match(clan.notice?.text || '', /Thrown/);
hero.hp = hero.maxHp;

// --- a second horse, chosen as the mount; the stable holds maxHorses --------------------------------------------
cmd({ mode: 'horse', kind: 'calico' });
for (let t = 0; t < SB.kinds.calico.seconds * 20 + 5; t++) g.step([]);
const cal = horses().find(h => h.horseKind === 'calico');
assert.ok(cal, 'a calico');
assert.equal(clan.mount, bb.id, 'Black Beauty is still the mount');
cmd({ mode: 'choose', horse: cal.id });
assert.equal(clan.mount, cal.id, 'chose the calico');
for (let k = horses().length; k < SB.maxHorses; k++) cmd({ mode: 'horse', kind: 'calico' });
cmd({ mode: 'horse', kind: 'calico' });
assert.match(clan.notice?.text || '', /holds/);

// --- the omnibus station: rickshaws and omnibuses come out empty and park there ----------------------------------
const SN = frontier.buildings.station.station;
if (hero.mounted) g.step([{ id: hero.id, type: 'mount' }]);
const scell = (() => { let best = -1, bd = Infinity; town.grid.use.split('').forEach((c, i) => { if (c !== '.' || i === cell) return; const [x, z] = g.frontier.stable.centre(town, { cell: i }), d = Math.hypot(x - town.x, z - town.z); if (d > 45 && d < bd) { bd = d; best = i; } }); return best; })();
town.buildings.push({ id: 'sn1', type: 'station', cell: scell, stage: 'built' });
const station = town.buildings.at(-1);
const scmd = c => g.step([{ id: hero.id, type: 'frontier', action: 'station', town: 'tS', ...c }]);
const mineV = k => Object.values(S.entities).filter(v => v.type === k && v.omnibusOwner === 'player');
scmd({ mode: 'rickshaw' }); scmd({ mode: 'rickshaw' });
for (let t = 0; t < SN.kinds.rickshaw.seconds * 40 + 10; t++) g.step([]);
assert.equal(mineV('rickshaw').length, 2, 'two rickshaws parked');
scmd({ mode: 'omnibus' });
for (let t = 0; t < SN.kinds.omnibus.seconds * 20 + 5; t++) g.step([]);
assert.equal(mineV('omnibus').length, 1, 'an empty omnibus parked');
assert.ok(!Object.values(S.entities).some(u => u.aboard), 'they come out empty');

// --- a rickshaw: 2 seats, 3.5x ------------------------------------------------------------------------------------
const rk = mineV('rickshaw')[0], mate = S.entities[g.spawn('thug', 'thug', rk.x + 1, rk.z, { owner: 'player', place: 'world', hp: 100, order: { kind: 'follow', target: hero.id } })];
const mate2 = S.entities[g.spawn('thug', 'thug', rk.x + 1.5, rk.z, { owner: 'player', place: 'world', hp: 100, order: { kind: 'follow', target: hero.id } })];
Object.assign(hero, { x: rk.x + 1, z: rk.z });
g.step([{ id: hero.id, type: 'omnibus', action: 'board', omnibus: rk.id, units: [mate.id, mate2.id] }]);
assert.equal(hero.aboard, rk.id, 'driving the rickshaw');
assert.equal(Object.values(S.entities).filter(u => u.aboard === rk.id).length, 2, 'two seats');
assert.ok(Math.abs(g.stats.movement(hero, 'run') - 6 * U.rules.rickshaw.speed) < 1e-6, 'rickshaw speed');
g.step([{ id: hero.id, type: 'omnibus', action: 'deploy' }]);
assert.ok(!hero.aboard, 'out');

// --- rickshaw travel: to another town with a station, then to the capital and back ---------------------------------
const site3 = world.sites.find(s => Math.hypot(s.x - site.x, s.z - site.z) > 1700 && Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700) || world.sites[2];
g.frontier.world.addTown({ id: 'tT', name: 'Farside', owner: 'player', x: site3.x, z: site3.z, pop: 3, stock: {}, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
g.step([]);
const t2 = S.frontier.settlements.tT, c3 = nearCell(t2);
t2.buildings.push({ id: 'sn2', type: 'station', cell: c3, stage: 'built' });
const [sx, sz] = g.frontier.stable.centre(town, station);
Object.assign(hero, { x: sx + 3, z: sz + 3 }); hero.hitAt = -1e9;
for (const u of [mate, mate2]) Object.assign(u, { x: sx + 4, z: sz + 3, order: { kind: 'follow', target: hero.id } });
for (const v of mineV('rickshaw')) Object.assign(v, { x: sx + 6, z: sz + 6 });
const menu = g.stationTravel.destinations(hero);
assert.ok(menu && menu.list.some(d => d.id === 'tT') && menu.list.some(d => d.id === 'capital'), `the menu lists Farside and the capital (${JSON.stringify(menu)})`);
assert.equal(menu.rickshaws, 2);
// Tim 2026-11-07 (train plan): instant rickshaw trips are off by default; the rest of this section turns them back on
g.step([{ id: hero.id, type: 'rickshaw', to: 'tT' }]);
assert.match(clan.notice?.text || '', /take the train/i, 'no instant rickshaw trips');
assert.ok(Math.hypot(hero.x - sx, hero.z - sz) < 10, 'still at the station');
g.settings.units.rules.rickshaw.instantTravel = true;   // the game's own copy of units.json
g.step([{ id: hero.id, type: 'rickshaw', to: 'tT' }]);
const [fx, fz] = g.frontier.stable.centre(t2, t2.buildings.at(-1));
assert.ok(Math.hypot(hero.x - fx, hero.z - fz) < 40, `hero at Farside (${Math.round(Math.hypot(hero.x - fx, hero.z - fz))})`);
assert.ok([mate, mate2].every(u => Math.hypot(u.x - hero.x, u.z - hero.z) < 10), 'the two followers came (2 rickshaws, 3 people)');
assert.equal(mineV('rickshaw').filter(v => Math.hypot(v.x - fx, v.z - fz) < 40).length, 2, 'the rickshaws parked at Farside');
hero.hitAt = S.tick;
g.step([{ id: hero.id, type: 'rickshaw', to: 'capital' }]);
assert.match(clan.notice?.text || '', /fight/, 'not straight after a hit');
hero.hitAt = -1e9;
g.step([{ id: hero.id, type: 'rickshaw', to: 'capital' }]);
assert.equal(hero.place, 'street', 'in the city');
assert.ok(Math.hypot(hero.x - g.gate.inside[0], hero.z - g.gate.inside[1]) < 5, 'just inside the gate');
Object.assign(hero, { x: g.gate.city[0], z: g.gate.city[1] });
const fromGate = g.stationTravel.destinations(hero);
assert.ok(fromGate?.capital && fromGate.list.some(d => d.id === 'tS'), 'the island gate (gate menu) lists your towns');
g.step([{ id: hero.id, type: 'rickshaw', to: 'tS' }]);
assert.equal(hero.place, 'world', 'back out at Stableton');
assert.ok(Math.hypot(hero.x - sx, hero.z - sz) < 40);

// --- in the city: H is the hire menu (main.js), the horse command says island only --------------------------------
Object.assign(hero, { place: 'street', x: 0, z: 0 });
g.step([{ id: hero.id, type: 'mount' }]);
assert.ok(!hero.mounted); assert.match(clan.notice?.text || '', /island/);

// --- a bot town with a stable raises one horse for its boss -------------------------------------------------------
const bot = Object.values(S.clans).find(c => c.bot);
const site2 = world.sites.find(s => Math.hypot(s.x - site.x, s.z - site.z) > 1700) || world.sites[1];
g.frontier.world.addTown({ id: 'tB', name: 'Botton', owner: bot.id, x: site2.x, z: site2.z, pop: 3, stock: { food: 500, goods: 300 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
g.step([]);
const tb = S.frontier.settlements.tB, c2 = nearCell(tb);
tb.buildings.push({ id: 'st2', type: 'stable', cell: c2, stage: 'built' });
g.step([]);
assert.equal(tb.buildings.at(-1).stableJobs?.length, 1, 'the bot town queued a horse for its boss');
console.log('test_stable_mount: ok');
