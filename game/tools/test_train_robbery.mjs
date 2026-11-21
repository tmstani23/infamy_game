// Train robbery R2-R3 (sim/frontier/rail_robbery.js): a train stopped at a blown track puts out its clan's 6 guards;
// a hero holds on its freight wagon to take half of everything aboard into a stolen chest, once per blast; the chest
// drops when the hero is knocked out, any hero picks it up, and it cashes in at an own town hall.
// Run: node game/tools/test_train_robbery.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
railways.train.stopSeconds = 2;
const B = railways.robbery;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, F = S.frontier, hero = S.entities[m.heroId], hall = frontier.founding.townHall;
const rival = Object.keys(S.clans).find(k => k !== 'player' && S.clans[k].faction === 'kuroda') || Object.keys(S.clans).find(k => k !== 'player');
const faction = S.clans[rival].faction;
const s0 = world.sites[3], s1 = world.sites[4], s2 = world.sites[6];
for (const [id, s, o] of [['tA', s0, rival], ['tB', s1, rival], ['tP', s2, 'player']]) g.frontier.world.addTown({ id, name: id, owner: o, x: s.x, z: s.z, pop: 3, stock: { food: 50 }, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
g.step([]);
const ax = s0.x + 40, az = s0.z + 40, L = 600;
F.rail.links.r1 = { id: 'r1', owner: rival, from: 'tA', to: 'tB', done: true, length: L, points: [[ax, az], [ax + L, az]], dist: [0, L] };
const run = (n, until) => { for (let i = 0; i < n; i++) { g.step([]); if (until?.()) return true; } return !until; };
const cmd = (mode, c = {}) => g.step([{ id: hero.id, type: 'frontier', action: 'rail', mode, ...c }]);
const l = F.rail.links.r1, notice = () => S.clans.player.notice?.text || '';
Object.assign(hero, { place: 'world', area: 'world', x: ax + 300, z: az + 30, hp: 1e6, maxHp: 1e6 });
g.step([]);
const train = () => Object.values(F.rail.trains).find(t => t.link === 'r1');
assert.ok(run(4000, () => train().dir === 1 && train().wait <= 0 && train().d > 20 && train().d < 100), 'train on its way out');
const t = train();
t.freight = [{ order: 'o1', resource: 'ryo', amount: 400 }, { order: 'o2', resource: 'timber', amount: 200 }];
Object.assign(hero, { x: ax + 300, z: az + 2 }); cmd('blast');
assert.ok(run(3000, () => t.stopped), 'train stopped at the gap');

// the guards: 6 of the owner's roster, round the freight wagon
const guards = () => Object.values(S.entities).filter(e => e.trainGuard === t.id && !e.dead);
assert.equal(guards().length, 6, 'six guards out');
const want = B.guards[faction].map(u => frontier.war.units[u]).map(u => typeof u.type === 'string' ? u.type : u.type[faction]).sort();
assert.deepEqual(guards().map(e => e.type).sort(), want, `${faction} guard mix`);
assert.ok(guards().every(e => e.owner === rival), 'guards are the owner\'s');

// rob: off the wagon refused; at it the hold runs holdSeconds; half of everything aboard into the chest
cmd('rob'); assert.match(notice(), /freight wagon/i, 'must stand at the wagon');
const w = g.frontier.rail.robbery.wagonAt(t, l);
Object.assign(hero, { x: w.x + 1, z: w.z }); hero.order = { kind: 'stop' };
assert.equal(g.frontier.rail.prompt(hero)?.mode, 'rob', 'Space robs at the wagon');
cmd('rob'); assert.ok(hero.robbing, 'hold started');
assert.ok(t.robbing && t.wagonSpot, 'wagon marked to flash');
assert.match(g.frontier.rail.prompt(hero)?.text || '', /Robbing the freight wagon: \d+ s/, 'hold count down shown');
assert.match(S.clans[rival].notice?.text || '', /being robbed/i, 'owner told');
// stepping off breaks it
Object.assign(hero, { x: w.x + 20, z: w.z }); run(1); assert.ok(!hero.robbing && /broken/i.test(notice()), 'stepping off breaks it');
Object.assign(hero, { x: w.x + 1, z: w.z }); cmd('rob');
for (let i = 0; i < B.holdSeconds * 20 + 2; i++) { Object.assign(hero, { x: w.x + 1, z: w.z, hp: 1e6, downed: false }); g.step([]); }
assert.ok(hero.chest, 'chest carried');
assert.equal(Math.round(hero.chest.loot.ryo), 200, 'half the ryo'); assert.equal(Math.round(hero.chest.loot.timber), 100, 'half the timber');
assert.equal(Math.round(t.freight.find(c => c.resource === 'ryo').amount), 200, 'half left aboard');
cmd('rob'); assert.match(notice(), /already carrying/i, 'one chest at a time');
g.frontier.rail.command(hero, { action: 'rail', mode: 'board', train: t.id }); assert.match(notice(), /no stolen chest on the train/i, 'no chest aboard a train');
assert.ok(l.blast.robbed, 'once per blast');

// knocked out: the chest drops; back up, walking over it picks it up
hero.downed = true; run(1);
const ground = Object.values(F.rail.chests || {});
assert.ok(!hero.chest && ground.length === 1, 'chest dropped');
assert.ok(S.clans[hero.owner].lastDown && Math.abs(S.clans[hero.owner].lastDown.x - hero.x) < 1, 'last down spot kept for the maps');
hero.downed = false; Object.assign(hero, { x: ground[0].x + 0.5, z: ground[0].z }); run(1);
assert.ok(hero.chest && !Object.keys(F.rail.chests).length, 'picked back up');
Object.assign(hero, { z: hero.z + 15 });   // off the track before the train backs out

// guards back aboard after the stop; the fallen are missing next time
const g0 = guards(); S.entities[g0[0].id].dead = true;
assert.ok(run(Math.round(railways.robbery.stopSeconds * 20) + 40, () => !t.stopped), 'train leaves the gap');
run(25);
assert.equal(guards().length, 0, 'guards back aboard');
assert.equal(t.guardsLost, 1, 'one guard missing');

// cash in: away from a hall refused; at the own town hall: ryo to the treasury, timber to the town
cmd('cashChest'); assert.match(notice(), /town halls/i, 'needs a hall');
const P = F.settlements.tP, ryo0 = S.clans.player.ryo, tim0 = P.stock.timber || 0;
Object.assign(hero, { x: P.x + 3, z: P.z + 3 }); cmd('cashChest');
assert.ok(!hero.chest, 'chest cashed');
assert.equal(Math.round(S.clans.player.ryo - ryo0), 200, 'ryo to the treasury');
assert.equal(Math.round((P.stock.timber || 0) - tim0), 100, 'timber into the town');
console.log('test_train_robbery: ok');
