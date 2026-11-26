// 2026-11-14: war camp stables (sim/vehicle_garage.js): a built camp stable stores and brings out your horses and vehicles,
// adds no room; when the war ends what is stored there and what stands empty in the war area goes to the nearest town stable.
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
const nearCell = s => { let best = -1, bd = Infinity; s.grid.use.split('').forEach((c, i) => { if (c !== '.') return; const [x, z] = g.frontier.stable.centre(s, { cell: i }), d = Math.hypot(x - s.x, z - s.z); if (d > 25 && d < bd) { bd = d; best = i; } }); return best; };
town.buildings.push({ id: 'st1', type: 'stable', cell: nearCell(town), stage: 'built' });
town.tier = 2; town.stock.timber = 2000; town.stock.goods = 2000; town.stock.food = 2000;
cmd({ mode: 'horse', kind: 'calico' }); cmd({ mode: 'horse', kind: 'calico' }); cmd({ mode: 'rickshaw' });
for (let t = 0; t < 200 * 20; t++) g.step([]);
const horses = Object.values(S.entities).filter(e => e.type === 'horse' && e.horseOwner === 'player'), [h1, h2] = horses;
const rk = Object.values(S.entities).find(e => e.type === 'rickshaw' && e.omnibusOwner === 'player');
assert.ok(h1 && h2 && rk, 'two horses and a rickshaw from the stable');
const gcmd = (action, unit, at) => g.step([{ id: hero.id, type: 'garage', action, unit, ...(at ? { at } : {}) }]);
const roomBefore = ['horse', 'rickshaw', 'omnibus'].map(c => g.frontier.stable.room('player', c));

// a war against a rival town 2000 away, its camp with a built stable (the war record as war.js keeps it)
const rival = Object.keys(S.clans).find(c => c !== 'player');
const ex = town.x + 2000 < world.size.w - 300 ? town.x + 2000 : town.x - 2000, ez = town.z;
g.frontier.world.addTown({ id: 'tE', name: 'Enemyton', owner: rival, x: ex, z: ez, pop: 3, stock: { food: 100 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
g.step([]);
const cx = ex - 350, cz = ez, war = g.frontier.war; war.active();
S.frontier.wars.list.w1 = { id: 'w1', town: 'tE', attacker: 'player', defender: rival, x: cx, z: cz, started: S.tick, state: 'active',
  camp: { x: cx, z: cz, chest: 0, stock: { timber: 0, stone: 0 }, brought: {}, workers: [], workerTraining: [], buildings: [{ id: 'w1:hall', type: 'camp_hall', stage: 'built', x: cx, z: cz }, { id: 'w1:st', type: 'stable', stage: 'site', x: cx + 30, z: cz }] } };

// take out at the camp: any stored one comes out beside the camp stable
for (const e of [h1, h2, rk]) if (!e.stored) gcmd('recall', e.id);
for (let t = 0; t < 40 * 20 && ![h1, h2, rk].every(e => e.stored); t++) g.step([]);
assert.ok([h1, h2, rk].every(e => e.stored?.town === 'tS'), 'all three stored at the town stable');
gcmd('takeout', h1.id, 'war:w1');
assert.match(clan.notice?.text || '', /stable in the war camp first/, 'a camp stable still being built does nothing');
S.frontier.wars.list.w1.camp.buildings[1].stage = 'built';
gcmd('takeout', h1.id, 'war:w1'); gcmd('takeout', rk.id, 'war:w1'); gcmd('takeout', h2.id, 'war:w1');
for (const e of [h1, h2, rk]) assert.ok(!e.stored && e.place === 'world' && Math.hypot(e.x - (cx + 30), e.z - cz) < 60, `${e.type} out beside the camp stable`);
assert.match(clan.notice?.text || '', /at the war camp/);
assert.deepEqual(['horse', 'rickshaw', 'omnibus'].map(c => g.frontier.stable.room('player', c)), roomBefore, 'the camp stable adds no room');
// recall near the camp: stored at the camp stable
gcmd('recall', h2.id);
for (let t = 0; t < 20 * 20 && !h2.stored; t++) g.step([]);
assert.equal(h2.stored?.town, 'war:w1', 'recalled near the camp: stored in the camp stable');
assert.equal(g.frontier.stable.have('player', 'horse'), 2, 'still counted');
// a camp-stored one comes out at the camp stable by a plain Take out too
gcmd('takeout', h2.id); assert.ok(!h2.stored && Math.hypot(h2.x - (cx + 30), h2.z - cz) < 60, 'plain take out of a camp-stored one: beside the camp stable');
gcmd('recall', h2.id); for (let t = 0; t < 20 * 20 && !h2.stored; t++) g.step([]);
assert.equal(h2.stored?.town, 'war:w1');

// war cavalry horses are troops: not counted, not garaged
const cav = S.entities[g.spawn('horse', 'mare_saddled', cx + 10, cz + 10, { horseOwner: 'player', warTroop: 'w1', cavalry: true, place: 'world', area: 'world', hp: 100, maxHp: 100 })];
assert.equal(g.frontier.stable.have('player', 'horse'), 2, 'a cavalry horse takes no stable room');
gcmd('recall', cav.id); assert.ok(!cav.recall && !cav.stored, 'a cavalry horse cannot be recalled');

// the war ends: the camp-stored horse and the empty rickshaw in the war area go to the nearest town stable,
// the horse the hero rides stays with him, and one left out far from the war stays where it is
Object.assign(hero, { place: 'world', x: h1.x + 1, z: h1.z }); g.step([{ id: hero.id, type: 'mount', horse: h1.id }]);
assert.ok(hero.mounted, 'the hero rides h1');
Object.assign(rk, { x: cx - 100, z: cz + 40 });
const far = S.entities[g.spawn('horse', 'calico', town.x + 80, town.z + 80, { horseOwner: 'player', place: 'world', area: 'world', hp: 100, maxHp: 100 })];
assert.ok(war.end('w1', 'called off'));
for (let t = 0; t < 21; t++) g.step([]);
assert.ok(h2.stored && h2.stored.town !== 'war:w1', `camp-stored horse moved to a town stable (${h2.stored?.town})`);
assert.ok(rk.stored && !String(rk.stored.town).startsWith('war:'), 'the empty rickshaw in the war area is stored at home');
assert.ok(!h1.stored && hero.mounted, 'the ridden horse stays with the hero');
assert.ok(!far.stored && far.place === 'world', 'a horse left far from the war stays out');
assert.ok(cav.dead || !cav.stored, 'cavalry never stored');
console.log('war camp stable ok');
