// War checkpoint 8a-1 (Tim 2026-11-14): the morale bar of each side of a war (sim/frontier/war_morale.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), U = data('data/units.json');
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId];
const rival = Object.keys(S.clans).find(c => c !== 'player');
const site = world.sites.find(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700) || world.sites[0];
g.frontier.world.addTown({ id: 'tE', name: 'Enemyton', owner: rival, x: site.x, z: site.z, pop: 3, stock: { food: 100 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const town = S.frontier.settlements.tE;
Object.assign(hero, { place: 'world', x: site.x + 400, z: site.z });
g.step([]);   // the town gets its grid
const free = town.grid.use.split('').findIndex((c, i) => c === '.' && i !== town.buildings[0].cell && !(town.buildings[0].cells || []).includes(i));
town.buildings.push({ id: 'sk1', type: 'stockade', cell: free, stage: 'built' });
const war = g.frontier.war, ST = g.frontier.structures, MO = g.frontier.warMorale, W = frontier.war.morale.weights;
S.frontier.wars ||= { list: {}, cooldown: {}, history: [] };
const cx = site.x - 350, cz = site.z;
const camp = { x: cx, z: cz, chest: 0, stock: { timber: 0, stone: 0 }, brought: {}, workers: [], workerTraining: [], buildings: [
  { id: 'w1:hall', type: 'camp_hall', stage: 'built', x: cx, z: cz }, { id: 'w1:b1', type: 'barracks', stage: 'built', x: cx + 30, z: cz },
  { id: 'w1:wt', type: 'watchtower', stage: 'built', x: cx, z: cz + 30 }, { id: 'w1:tent', type: 'supply_tents', stage: 'built', x: cx - 30, z: cz },
  { id: 'w1:pal', type: 'palisade', stage: 'built', x: cx - 40, z: cz + 40 }, { id: 'w1:site', type: 'rifle_range', stage: 'site', x: cx + 60, z: cz, progress: 0, need: 100 }] };
S.frontier.wars.list.w1 = { id: 'w1', town: 'tE', attacker: 'player', defender: rival, x: cx, z: cz, started: S.tick, state: 'active', camp };
assert.equal(MO.view('w1').town.pct, 0, 'nothing seen before the first tick (and the view creates no record)');
assert.equal(S.frontier.wars.list.w1.morale, undefined);
g.step([]);
let v = MO.view('w1');
assert.equal(v.town.total, W.town_hall + W.stockade); assert.equal(v.town.pct, 100);
assert.equal(v.camp.total, W.camp_hall + W.barracks + W.watchtower, 'tents, palisade and a site do not count'); assert.equal(v.camp.pct, 100);
assert.ok(!v.town.ready && !v.camp.ready && !v.last);

// the stockade falls (the attacker's damage, through the real ruin path)
const key = b => `t|tE|${(b.cells || [b.cell])[0]}`, ruin = (clan, k) => { const st = ST.find(k); assert.ok(st, k); assert.ok(ST.damage(clan, st, 1e9, 'fire'), `damage ${k}`); };
ruin('player', key(town.buildings[1]));
assert.equal(town.buildings[1].stage, 'ruined');
g.step([]);
v = MO.view('w1');
const want = Math.round(100 * W.town_hall / (W.town_hall + W.stockade));
assert.equal(v.town.pct, want); assert.deepEqual(v.town.down.map(d => d.type), ['stockade']);
const drop = S.news.find(n => n.kind === 'moraleDrop');
assert.deepEqual(drop, { kind: 'moraleDrop', war: 'w1', side: 'town', type: 'stockade', amount: 100 - want, pct: want });
assert.deepEqual({ ...v.last, tick: 0 }, { side: 'town', type: 'stockade', amount: 100 - want, pct: want, tick: 0 });
g.step([]); assert.ok(!S.news.some(n => n.kind === 'moraleDrop'), 'one drop, once');

// camp side: tents and palisade never move it; the barracks does
ruin(rival, 'c|w1|w1:tent'); ruin(rival, 'c|w1|w1:pal'); g.step([]);
assert.equal(MO.pct('w1', 'camp'), 100);
ruin(rival, 'c|w1|w1:b1'); g.step([]);
assert.equal(MO.pct('w1', 'camp'), Math.round(100 * (W.camp_hall + W.watchtower) / (W.camp_hall + W.barracks + W.watchtower)));
// a new building built mid-war counts from the moment it stands; a repaired one comes back
Object.assign(camp.buildings.find(b => b.id === 'w1:site'), { stage: 'built' }); g.step([]);
v = MO.view('w1');
assert.equal(v.camp.total, W.camp_hall + W.barracks + W.watchtower + W.rifle_range);
assert.equal(v.camp.standing, W.camp_hall + W.watchtower + W.rifle_range);
Object.assign(camp.buildings.find(b => b.id === 'w1:b1'), { stage: 'built' }); g.step([]);
assert.equal(MO.pct('w1', 'camp'), 100, 'repaired: back to full');
assert.ok(!S.news.some(n => n.kind === 'moraleDrop'));

// the town hall falls too: the town is ready for the channel; the camp is not
ruin('player', key(town.buildings[0])); g.step([]);
v = MO.view('w1');
assert.equal(v.town.pct, 0); assert.ok(v.town.ready && MO.ready('w1', 'town') && !MO.ready('w1', 'camp'));
assert.equal(v.last.type, 'town_hall');
// two at once: each gets its own news line and the amounts add up to the whole drop
const before = MO.pct('w1', 'camp');
ruin(rival, 'c|w1|w1:b1'); ruin(rival, 'c|w1|w1:wt'); g.step([]);
const drops = S.news.filter(n => n.kind === 'moraleDrop');
assert.equal(drops.length, 2); assert.ok(Math.abs(drops.reduce((n, d) => n + d.amount, 0) - (before - MO.pct('w1', 'camp'))) <= 1);
// saved with the war record
assert.deepEqual(JSON.parse(JSON.stringify(S.frontier.wars.list.w1.morale)), S.frontier.wars.list.w1.morale);
assert.equal(MO.view('nope'), null);
console.log('war morale ok');
