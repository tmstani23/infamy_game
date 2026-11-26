// 2026-11-22: once a town has a built work camp of a kind, the governor's workers take that resource only at the
// spots beside one (workers.campSide). With no place left they wait in the town hall, he trains nobody meanwhile and
// builds another camp when he can. The player can call them out and give them a job; his own picks never move.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { ensureGrid } from '../src/sim/frontier/town_grid.js';
import { workerStatus } from '../src/worker_panel.js';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const data = read('frontier.json'), wd = read('world.json'); data.settlements = {}; data.roads = {};
for (const t of data.tiers?.list || []) delete t.workers;   // this test floods the town with workers; the hall tier limit (and its release of extras) is not its subject
const state = { tick: 0, entities: {}, news: [], clans: { player: {} } };
const fr = createFrontier({ state, data, world: wd, spotData: read('world_spots.json'), spotRules: read('resource_spots.json') });
const site = wd.sites[0], R = data.workers;
const s = fr.world.addTown({ id: 't', name: 'T', owner: 'player', x: site.x, z: site.z, pop: data.founding.minSettlers, stock: { ...data.founding.startStock }, roadReserve: data.townGrid.hallRoadReserve || 0, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
ensureGrid(s, wd, data); s.autoBuild = true;
s.workerTraining = Array.from({ length: data.founding.startWorkers || 0 }, () => ({ id: fr.world.newId('w'), readyAt: 0 }));
const W = fr.modules.find(m => m.name === 'workers').workers;
const run = n => { for (let i = 0; i < n; i++) { state.tick++; fr.tick(); state.news = []; } };
const kindOf = w => R.resources[W.index.get(w.spot)?.kind];
const built = t => s.buildings.some(b => b.type === t && b.stage === 'built');

// 1. the town grows by itself until it has a lumber camp
for (let m = 0; m < 240 && !built('lumber_camp'); m++) run(1200);
assert.ok(built('lumber_camp'), 'the governor built a lumber camp');
run(2400);
let side = W.campSide(s);
assert.ok(side.timber?.size, 'timber is held to the lumber camp');
// no worker of his heads for trees away from the camp (one still carrying a load may finish his trip)
W.assignIdle(s);
const awayNow = () => s.workers.filter(w => w.by !== 'p' && w.spot && kindOf(w) && side[kindOf(w)] && !side[kindOf(w)].has(w.spot) && !(w.carrying > 0));
assert.equal(awayNow().length, 0, 'his workers keep to the spots beside the camps');

// 2. the player's own pick is never moved
const far = W.reachSpots(s).filter(p => R.resources[p.kind] === 'timber' && !side.timber.has(p.id))[0];
if (far) {
  const mine = s.workers.find(w => w.spot && !w.project);
  assert.ok(W.assign(s, [mine.id], far.id, 'p').ok, 'the player may send a worker to a spot away from the camps');
  run(600); W.assignIdle(s);
  assert.ok(mine.spot === far.id || mine.nextSpot === far.id, 'the player\'s pick stays');
}

// 3. more workers than the camp spots hold: the rest wait in the hall, and he trains nobody
s.projects.length = 0;
const before = s.workers.length;
s.stock.timber = 0; s.stock.stone = 0;   // nothing to build another camp with
for (let i = 0; i < 60; i++) s.workerTraining.push({ id: fr.world.newId('w'), readyAt: 0 });
run(1200);
side = W.campSide(s);
const waiting = () => s.workers.filter(w => w.wait);
assert.ok(s.workers.length > before + 40, 'the new workers came');
assert.ok(waiting().length > 0, 'some wait for a spot');
assert.ok(waiting().every(w => !w.spot && w.by !== 'p'), 'waiting workers have no spot and stay the governor\'s');
assert.match(workerStatus(waiting().find(w => w.shelter?.in) || waiting()[0], W.index), /^Waiting/, 'the roster says they wait');
assert.ok(waiting().some(w => w.shelter?.wait), 'they wait in the town hall');
assert.equal(awayNow().length, 0, 'none of them went off into the wild');
const count = {}; for (const w of s.workers) if (w.spot) count[w.spot] = (count[w.spot] || 0) + 1;
s.stock.ryo = 5000; s.stock.goods = 500; s.report.idle = 5;
const n0 = s.workers.length + s.workerTraining.length;
run(1200);
assert.equal(s.workers.length + s.workerTraining.length, n0, 'no worker is trained while one waits');
assert.match(s.report.spare || s.report.next || '', /no spot beside a camp/, 'the report says workers have no camp spot');

// 4. the player calls them out of the hall: they are left alone for a while, and a job by hand ends the wait
const inHall = waiting().filter(w => w.shelter?.wait).map(w => w.id);
fr.command({ id: 'hero', owner: 'player' }, { type: 'frontier', action: 'hallShelter', town: 't', mode: 'leave' });
const out = s.workers.filter(w => inHall.includes(w.id));
assert.ok(out.every(w => !w.shelter && w.wait && w.waitFree > state.tick), 'called out, they stand free for a while');
run(200);
assert.ok(out.every(w => !w.shelter), 'the governor leaves them alone meanwhile');
if (far) {
  assert.ok(W.assign(s, [out[0].id], far.id, 'p').ok, 'the player gives one a job');
  assert.ok(!out[0].wait && out[0].by === 'p' && out[0].spot === far.id, 'and he stops waiting');
}
run((R.waitGraceTicks ?? 1200) + 400);
assert.ok(out.slice(1).every(w => w.spot || w.shelter?.wait || w.wait), 'afterwards the rest go back to waiting or to a spot');
assert.ok(out.slice(1).some(w => w.shelter?.wait) || !out.slice(1).some(w => w.wait), 'back inside the hall');

// 5. with materials he builds another camp for them
s.stock.timber = 2000; s.stock.stone = 2000;
const campsBefore = s.buildings.filter(b => R.gatherBuildings.includes(b.type)).length + s.projects.filter(p => R.gatherBuildings.includes(p.type)).length;
let grew = false;
for (let m = 0; m < 30 && !grew; m++) { run(1200); grew = s.buildings.filter(b => R.gatherBuildings.includes(b.type)).length + s.projects.filter(p => R.gatherBuildings.includes(p.type)).length > campsBefore; }
assert.ok(grew || /no camp slot|no free ground/.test(s.report.spare || ''), 'he builds another camp, or says why he cannot');
console.log('test_camp_side: ok', JSON.stringify({ workers: s.workers.length, waiting: waiting().length, camps: s.buildings.filter(b => R.gatherBuildings.includes(b.type)).map(b => b.type), spare: s.report.spare || '' }));
