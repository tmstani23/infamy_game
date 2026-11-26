// War checkpoint 8b-2 (2026-11-15): the defending town's war chest, muster delay and training.
// (sim/frontier/war_defense.js, war.js, war_end.js settle, infirmary.js town field clinic)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { createPlacement } from '../src/sim/frontier/placement.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), U = data('data/units.json');

function scene({ trainSpeed = 1 } = {}) {
  const frontier = data('data/frontier.json');
  frontier.war.town.trainSpeed = trainSpeed;
  const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
  const g = createGame(options);
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 47 });
  g.civilians.populate();
  const S = g.state, hero = S.entities[m.heroId];
  const rival = Object.keys(S.clans).find(c => c !== 'player');
  const site = world.sites.filter(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700)[0];
  g.frontier.world.addTown({ id: 'tD', name: 'Holdfast', owner: 'player', x: site.x, z: site.z, pop: 14, founded: true,
    stock: { food: 5000, ryo: 4000, timber: 6000, stone: 6000, goods: 500 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
  const town = S.frontier.settlements.tD;
  Object.assign(hero, { place: 'world', x: site.x + 60, z: site.z });
  g.step([]);
  const P = createPlacement({ data: frontier, state: S, construction: {} });
  const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return S.frontier.receipts.findLast(r => r.action === c.action); };
  const run = n => { for (let i = 0; i < n; i++) g.step([]); };
  // a built building on cleared ground near the hall
  const build = kind => {
    const { n } = town.grid;
    const order = [...Array(n * n).keys()].sort((a, b) => Math.hypot(a % n - n / 2, Math.floor(a / n) - n / 2) - Math.hypot(b % n - n / 2, Math.floor(b / n) - n / 2) || a - b);
    for (const i of order) { const r = P.check(town, { kind, cells: [i] }); if (!r.ok || !r.cells.every(c => town.grid.ground[c] === 'c')) continue;
      const got = cmd({ action: 'place', town: 'tD', kind, cells: [i] }); if (!got.ok) continue;
      for (let k = 0; k < 4000 && town.projects.length; k++) g.step([]);
      return town.buildings.findLast(b => b.type === kind && b.stage === 'built'); }
    throw new Error('no spot for ' + kind);
  };
  return { g, S, hero, rival, town, site, cmd, run, build, frontier, options };
}
function declare(s) {
  const { S, town } = s, cx = town.x - 350, cz = town.z;
  S.frontier.wars ||= { list: {}, cooldown: {}, history: [] };
  S.frontier.wars.list.w1 = { id: 'w1', town: 'tD', attacker: s.rival, defender: 'player', x: cx, z: cz, started: S.tick, state: 'active',
    camp: { x: cx, z: cz, chest: 0, stock: { timber: 0, stone: 0 }, brought: {}, workers: [], workerTraining: [], buildings: [{ id: 'w1:hall', type: 'camp_hall', stage: 'built', x: cx, z: cz }] } };
  return S.frontier.wars.list.w1;
}
const troops = (S, owner) => Object.values(S.entities).filter(e => e.warTroop === 'w1' && e.owner === owner && !e.dead);

{
  const s = scene(), { g, S, town, cmd, frontier } = s, D = () => g.frontier.war.defense;
  const barracks = s.build('barracks'), tents = s.build('supply_tents');
  const clinic = s.build('field_clinic');
  const stable = s.build('stable');
  assert.ok(barracks && tents && clinic && stable);
  // no war: nothing to fill or train
  let r = cmd({ action: 'warChestTown', war: 'w1', amount: 100 }); assert.equal(r.reason, 'Not a war on your town');
  const w = declare(s); s.run(1);
  // the chest: from the town coffers, typeable whole amounts, never more than the coffers hold
  const coffers0 = town.stock.ryo;
  r = cmd({ action: 'warChestTown', war: 'w1', amount: 1e7 }); assert.match(r.reason, /^The town coffers have only \d+ ryo$/);
  r = cmd({ action: 'warChestTown', war: 'w1', amount: 0 }); assert.equal(r.reason, 'amount must be a positive whole number');
  r = cmd({ action: 'warChestTown', war: 'w1', amount: 1500 }); assert.ok(r.ok, r.reason);
  assert.ok(Math.abs(coffers0 - town.stock.ryo - 1500) < 5, 'out of the coffers'); assert.equal(w.defense.chest, 1500);
  { const { frontierFor } = await import('../src/sim_snapshot.js'), all = { isDiscovered: () => true };
    assert.equal(frontierFor(S.frontier, 'player', all, [], new Map()).wars.list.w1.defense.chest, 1500, 'the defender sees his chest');
    assert.equal(frontierFor(S.frontier, s.rival, all, [], new Map()).wars.list.w1.defense, undefined, 'the attacker does not'); }
  // the muster: queues stay locked for musterSeconds after the declaration
  r = cmd({ action: 'townTrain', war: 'w1', building: barracks.id, unit: 'grunt', count: 2 });
  assert.match(r.reason, /^Mustering: training opens in \d+ s$/);
  assert.equal(D().view('w1').muster > frontier.war.town.musterSeconds - 2, true);
  w.started -= frontier.war.town.musterSeconds * 20;   // the muster is over
  r = cmd({ action: 'townTrain', war: 'w1', building: barracks.id, unit: 'rifleman', count: 1 }); assert.equal(r.reason, 'The barracks does not train that');
  r = cmd({ action: 'townTrain', war: 'w1', building: stable.id, unit: 'sword_rider', count: 1 }); assert.equal(r.reason, 'Cavalry need the town hall war upgrade');
  r = cmd({ action: 'townTrain', war: 'w1', building: barracks.id, unit: 'grunt', count: 2 }); assert.ok(r.ok, r.reason);
  const grunt = g.frontier.war.ryoOf('player', 'grunt');
  assert.equal(w.defense.chest, 1500 - 2 * grunt, 'paid from the defender war chest');
  assert.equal(barracks.queue.length, 2);
  // the troop cap: base + supply tents, the same as a camp
  const cap = frontier.war.troopCap.base + frontier.war.buildings.supply_tents.cap;
  assert.equal(D().view('w1').cap, cap);
  r = cmd({ action: 'townTrain', war: 'w1', building: barracks.id, unit: 'grunt', count: cap - 1 }); assert.equal(r.reason, `Troop cap: room for ${cap - 2} more`);
  // untrain gives the ryo back
  r = cmd({ action: 'townUntrain', war: 'w1', building: barracks.id }); assert.ok(r.ok, r.reason);
  assert.equal(w.defense.chest, 1500 - grunt); assert.equal(barracks.queue.length, 1);
  // save mid-queue: the same game after load
  const save = JSON.parse(JSON.stringify(makeSave(g, { bots: [] })));
  const g2 = createGame(s.options); loadSave(g2, save);
  for (let i = 0; i < 150; i++) { g.step([]); g2.step([]); }
  { const A = JSON.stringify(g2.state), B = JSON.stringify(S); let i = 0; while (i < A.length && A[i] === B[i]) i++;
    assert.ok(A === B, `same after 150 ticks: differs at ${i}: ${A.slice(i - 150, i + 150)} | ${B.slice(i - 150, i + 150)}`); }
  // the troop comes out of the barracks as a war troop of the defender
  s.run(frontier.war.units.grunt.trainTicks + 20);
  const mine = troops(S, 'player');
  assert.equal(mine.length, 1, 'trained'); assert.ok(!barracks.queue);
  assert.equal(mine[0].warUnit, 'grunt');
  const cell = s.g.frontier.structures.list().find(st => st.b === barracks);
  assert.ok(Math.hypot(mine[0].x - cell.x, mine[0].z - cell.z) < 40, 'near its barracks');
  // a town field clinic heals its owner's units nearby
  { const cl = s.g.frontier.structures.list().find(st => st.b === clinic); Object.assign(mine[0], { x: cl.x + 3, z: cl.z }); s.run(12);
    assert.ok(mine[0].infirmary >= frontier.war.buildings.field_clinic.heal.healFactor, 'the field clinic heals: ' + mine[0].infirmary); }
  // the war upgrade opens cavalry at the town stable
  town.warHall = true;
  r = cmd({ action: 'townTrain', war: 'w1', building: stable.id, unit: 'sword_rider', count: 1 }); assert.ok(r.ok, r.reason);
  r = cmd({ action: 'townTrain', war: 'w1', building: barracks.id, unit: 'grunt', count: 3 }); assert.ok(r.ok, r.reason);
  // the war ends with a sack: chest and queued ryo go back to the coffers first, then the sack takes its share
  const chestLeft = w.defense.chest, queued = 3 * grunt + g.frontier.war.ryoOf('player', 'sword_rider');
  const before = town.stock.ryo;
  assert.ok(g.frontier.warEnd.finish(w, 'sacked', null));
  const back = Math.floor(chestLeft + queued);
  assert.equal(S.frontier.wars.history.at(-1).defense.returned, back, 'chest and queues returned');
  assert.ok(Math.abs(town.stock.ryo - Math.floor((before + back) * (1 - frontier.war.outcomes.sackShare))) <= 2, `sacked after the return: ${town.stock.ryo} vs ${(before + back) * 0.5}`);
  assert.ok(!barracks.queue && !stable.queue, 'queues cleared');
  assert.ok(troops(S, 'player').every(e => e.rout), 'defender troops rout');
}
{ // trainSpeed: towns can be made to train slower or faster (a knob for the playtest)
  const s = scene({ trainSpeed: 0.5 }), b = s.build('barracks'), w = declare(s);
  w.started -= s.frontier.war.town.musterSeconds * 20; s.run(1);
  const v = s.g.frontier.war.defense.view('w1').buildings.find(x => x.id === b.id).units.find(u => u.unit === 'grunt');
  assert.equal(v.seconds, s.g.frontier.war.ticksOf('player', 'grunt') * 2 / 20);
}
console.log('war defense ok');
