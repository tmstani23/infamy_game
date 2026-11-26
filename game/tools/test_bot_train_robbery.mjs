// Train robbery R5 (sim/war_general_brain.js rob): a bot's hero walks to another clan's line, waits beside it for a
// loaded train, sets the charge ahead of it, holds on the freight wagon of the stopped train and carries the chest to
// its own town hall. Peace case with the crew rule switched off; numbers from data/railways.json robbery.bots.
// Run: node game/tools/test_bot_train_robbery.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { createGeneralBrain } from '../src/sim/war_general_brain.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
railways.train.stopSeconds = 2;
Object.assign(railways.robbery.bots, { days: { default: { war: [0.001, 0.002], peace: [0.001, 0.002] } }, peaceCrew: 0, holdGuards: 6, retryDays: 0.001 });
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false, dev: true } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, F = S.frontier, hall = frontier.founding.townHall;
const rival = Object.keys(S.clans).find(k => k !== 'player');
const s0 = world.sites[3], s1 = world.sites[4];
g.frontier.world.addTown({ id: 'tR', name: 'tR', owner: rival, x: s0.x, z: s0.z, pop: 3, founded: true, stock: { food: 50 }, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
g.frontier.world.addTown({ id: 'tP', name: 'tP', owner: 'player', x: s1.x, z: s1.z, pop: 3, founded: true, stock: { food: 50 }, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
g.step([]);
const ax = s0.x + 60, az = s0.z + 70, L = 1000;
F.rail.links.r1 = { id: 'r1', owner: 'player', from: 'tP', to: 'tP', done: true, length: L, points: [[ax, az], [ax + L, az]], dist: [0, L] };
if (g.frontier.rivalCampaign) { g.frontier.rivalCampaign.knows = () => true; g.frontier.rivalCampaign.mayWar = () => false; }
const hero = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === rival);
Object.assign(hero, { place: 'world', area: 'world', x: ax + 480, z: az + 40, hp: 1e6, maxHp: 1e6 });
g.step([]);
const brain = createGeneralBrain(g, { clan: rival });
const train = () => Object.values(F.rail.trains).find(t => t.link === 'r1');
const ryo0 = S.clans[rival].ryo || 0;
let blown = false, robbed = false, cashed = false, loot = null;
for (let i = 0; i < 20 * 60 * 14 && !cashed; i++) {
  const t = train();
  if (t && !t.stopped && !robbed) t.freight = [{ order: 'o1', resource: 'ryo', amount: 400 }, { order: 'o2', resource: 'timber', amount: 200 }];
  Object.assign(hero, { hp: 1e6, downed: false, dead: false });
  if (t?.stopped) for (const e of Object.values(S.entities)) if (e.trainGuard === t.id) e.dead = true;   // the guards fight for real now (2026-11-21); this lone test hero has no escort to beat them
  g.step(brain.tick());
  if (F.rail.links.r1.blast?.by === rival) blown = true;
  if (hero.chest && !robbed) { robbed = true; loot = { ...hero.chest.loot }; }
  if (robbed && !hero.chest) cashed = true;
}
assert.ok(blown, `the bot blew the line (view ${JSON.stringify(brain.view().rob)}, hero ${Math.round(hero.x - ax)},${Math.round(hero.z - az)})`);
assert.ok(robbed, `the bot robbed the train (view ${JSON.stringify(brain.view().rob)})`);
assert.equal(Math.round(loot.ryo), 200, 'half the ryo in the chest');
assert.ok(cashed, 'the chest was cashed at its town hall');
assert.equal(Math.round((S.clans[rival].ryo || 0) - ryo0), 200, 'ryo to the bot treasury');
assert.equal(brain.view().rob, null, 'the robbery is over');
// its memory goes into the save
const b2 = createGeneralBrain(g, { clan: rival }); b2.loadState(brain.saveState());
assert.ok(Number.isFinite(b2.saveState().robLast), 'the robbery clock is saved');
console.log('test_bot_train_robbery: ok');
