// 8e-9 armory upgrades (sim/frontier/war_armory.js): bought at a built armory for one side of one war, troops only,
// one group for all troops (Tim 2026-11-25, was four), weapons and armor tracks, ryo halved (50/100/150), gone with the war.
// Run: node game/tools/test_armory_upgrades.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json');
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 43 });
const S = g.state, F = S.frontier, hero = S.entities[m.heroId], War = g.frontier.war, AR = War.armory, A = frontier.war.armory;
const rival = Object.keys(S.clans).find(c => c !== 'player'), rh = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === rival);
const site = world.sites[3];
g.frontier.world.addTown({ id: 'tX', name: 'Rivalburg', owner: rival, x: site.x, z: site.z, pop: 3, stock: { food: 100, timber: 300, stone: 300 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }, { id: 'arX', type: 'armory', stage: 'built', cell: 5 }] });
g.step([]);
const cx = site.x + 300, cz = site.z;
F.wars ||= { list: {}, cooldown: {}, history: [] };
const arm = { id: 'w1:armory', type: 'armory', stage: 'built', x: cx + 20, z: cz };
const w = F.wars.list.w1 = { id: 'w1', town: 'tX', attacker: 'player', defender: rival, x: cx, z: cz, started: S.tick, state: 'active', defense: { chest: 500, put: 500 },
  camp: { x: cx, z: cz, chest: 1000, stock: { timber: 500, stone: 500 }, brought: {}, workers: [], workerTraining: [], buildings: [{ id: 'w1:hall', type: 'camp_hall', stage: 'built', x: cx, z: cz }, arm] } };
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const buy = (e, group, track, war = 'w1') => { g.step([{ id: e.id, type: 'frontier', action: 'armoryUp', war, group, track }]); return F.receipts.findLast(r => r.action === 'armoryUp'); };
const secs = Math.round(A.seconds * 20);

const grunt = S.entities[War.spawnTroop(w, 'grunt', cx + 5, cz)], archer = S.entities[War.spawnTroop(w, 'archer', cx + 6, cz)];
assert.ok(grunt && archer, 'troops');
assert.deepEqual(A.cost.map(c => c.ryo), [50, 100, 150], 'ryo halved at every level (Tim 2026-11-25)');
assert.equal(grunt.warUp, undefined, 'no upgrades yet');
// buy melee weapons level 1: paid from the war chest and the camp stock
let r = buy(hero, 'all', 'weapons');
assert.ok(r.ok, r.reason);
assert.equal(w.camp.chest, 1000 - A.cost[0].ryo);
assert.equal(w.camp.stock.timber, 500 - A.cost[0].timber);
assert.equal(w.camp.stock.stone, 500 - A.cost[0].stone);
// Tim 2026-11-18: a second buy waits in the queue, paid now; a waiting one cancels for its full price back
const chest1 = w.camp.chest, t1 = w.camp.stock.timber;
r = buy(hero, 'all', 'armor');
assert.ok(r.ok, r.reason);
assert.equal(w.camp.chest, chest1 - A.cost[0].ryo, 'queued: paid now');
assert.equal(w.armory.attacker.queue.length, 1);
assert.equal(AR.view('w1', 'player').queue[0].level, 1);
g.step([{ id: hero.id, type: 'frontier', action: 'armoryCancel', war: 'w1', index: 0 }]);
assert.equal(w.armory.attacker.queue.length, 0, 'cancelled');
assert.equal(w.camp.chest, chest1, 'full ryo back'); assert.equal(w.camp.stock.timber, t1, 'full timber back');
// queued levels of one track count up: melee weapons 2 can wait behind level 1 in the work, at the level 2 price
r = buy(hero, 'all', 'weapons'); assert.ok(r.ok, r.reason);
assert.equal(w.camp.chest, chest1 - (A.cost[1] || A.cost[0]).ryo, 'level 2 price');
assert.equal(AR.view('w1', 'player').groups.find(x => x.group === 'all').tracks.find(t => t.track === 'weapons').queued, 2);
// cancelling it refunds it; the queue cap holds
g.step([{ id: hero.id, type: 'frontier', action: 'armoryCancel', war: 'w1', index: 0 }]);
assert.equal(w.camp.chest, chest1);
const cap = A.queue ?? 5; w.camp.chest = 99999; Object.assign(w.camp.stock, { timber: 99999, stone: 99999 });
for (const tr of ['armor', 'armor', 'armor', 'weapons'].slice(0, cap - 1)) assert.ok(buy(hero, 'all', tr).ok);
r = buy(hero, 'all', 'weapons');
assert.ok(!r.ok && /queue is full/i.test(r.reason), 'queue cap');
// clear the queue for the checks below (full refunds)
while (w.armory.attacker.queue.length) g.step([{ id: hero.id, type: 'frontier', action: 'armoryCancel', war: 'w1', index: 0 }]);
assert.equal(w.camp.chest, 99999, 'all refunded');
w.camp.chest = chest1; Object.assign(w.camp.stock, { timber: t1, stone: 500 - A.cost[0].stone });
// a queued level starts when the one in the work is done
r = buy(hero, 'all', 'armor'); assert.ok(r.ok, r.reason);
// the work stops while the armory is down
arm.stage = 'ruined'; run(secs + 5);
assert.equal(grunt.warUp, undefined, 'paused with the armory down');
arm.stage = 'built'; run(secs + 5);
assert.equal(grunt.warUp?.damage, 1 + A.step, 'troops on the field hit harder');
assert.equal(grunt.warUp?.taken, 1, 'armor unchanged');
assert.deepEqual(archer.warUp, grunt.warUp, 'every troop gets them, ranged too');
assert.equal(hero.warUp, undefined, 'the hero is never changed');
assert.match(S.clans.player.notice?.text || '', /troop weapons level 1/i);
// armor: less damage taken; a troop trained later has the upgrades too
assert.equal(w.armory.attacker.work?.track, 'armor', 'the queued armor level started next'); run(secs + 5);
assert.equal(grunt.warUp.taken, 1 - A.step);
const g2 = S.entities[War.spawnTroop(w, 'spearman', cx + 7, cz)];
assert.deepEqual(g2.warUp, grunt.warUp, 'a new troop gets them');
// the stats read it
assert.ok(Math.abs(g.stats.damage(grunt) / g.stats.damage({ ...grunt, warUp: undefined }) - (1 + A.step)) < 1e-9, 'stats damage');
assert.ok(Math.abs(g.stats.damageTaken(grunt) / g.stats.damageTaken({ ...grunt, warUp: undefined }) - (1 - A.step)) < 1e-9, 'stats damage taken');
// up to the last level, then no more; cost by level
for (let k = 1; k < A.levels; k++) { r = buy(hero, 'all', 'weapons'); assert.ok(r.ok, r.reason); run(secs + 5); }
assert.equal(grunt.warUp.damage, Math.round((1 + A.step * A.levels) * 1000) / 1000);
r = buy(hero, 'all', 'weapons');
assert.ok(!r.ok && /fully/i.test(r.reason));
// short of ryo
w.camp.chest = 5;
r = buy(hero, 'all', 'armor');
assert.ok(!r.ok && /ryo/i.test(r.reason));
// the defender buys at the town armory, from its war chest and the town stock; the sides are apart
const tx0 = F.settlements.tX.stock.timber;
r = buy(rh, 'all', 'weapons');
assert.ok(r.ok, r.reason);
assert.equal(w.defense.chest, 500 - A.cost[0].ryo);
assert.ok(Math.abs(F.settlements.tX.stock.timber - (tx0 - A.cost[0].timber)) < 1, 'town timber paid');
const da = S.entities[War.spawnTroop(w, 'archer', site.x + 5, site.z, rival)];
run(secs + 5);
assert.equal(da.warUp?.damage, 1 + A.step, 'defender archers upgraded');
assert.equal(archer.warUp.damage, Math.round((1 + A.step * A.levels) * 1000) / 1000, 'the attacker keeps its own levels');
// no armory: refused
assert.equal(AR.why('w1', 'player', 'all', 'armor') !== '', true);
arm.stage = 'ruined';
assert.match(AR.why('w1', 'player', 'all', 'armor'), /armory/i);
// the view
const v = AR.view('w1', 'player');
assert.equal(v.groups.length, 1);
assert.equal(v.groups.find(x => x.group === 'all').tracks.find(t => t.track === 'weapons').level, A.levels);
// gone with the war: a new war starts from nothing
War.end('w1', 'ended');
const w2 = F.wars.list.w2 = { ...JSON.parse(JSON.stringify(w)), id: 'w2', state: 'active' }; delete w2.armory; arm.stage = 'built';
const g3 = S.entities[War.spawnTroop(w2, 'grunt', cx + 5, cz)];
assert.equal(g3.warUp, undefined, 'a new war starts without upgrades');
// an older save's per-group levels fold into one: the best level of each track
{ const old = { levels: { melee: { weapons: 2, armor: 0 }, ranged: { weapons: 1, armor: 1 } }, work: { group: 'siege', track: 'armor', left: 10 }, queue: [] };
  w2.armory = { attacker: old };
  const v2 = AR.view('w2', 'player'), t = tr => v2.groups[0].tracks.find(x => x.track === tr);
  assert.equal(t('weapons').level, 2); assert.equal(t('armor').level, 1); assert.equal(v2.work.group, 'all', 'old work goes on for all'); }
console.log('armory upgrades ok');
