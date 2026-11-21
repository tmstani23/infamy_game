// Train robbery R1: blasting a line (sim/frontier/rail_blast.js). A hero on the track sets a charge on anyone's
// line; it blows after the fuse, the line closes half a day with an untouchable repair crew at the gap, and it can't
// be blown again for 2.5 days. A train running into the gap stops short, stands 3 minutes, then backs to the last
// station. Run: node game/tools/test_train_blast.mjs
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
const S = g.state, F = S.frontier, hero = S.entities[m.heroId], hall = frontier.founding.townHall, day = g.dayTicks;
const rival = Object.keys(S.clans).find(k => k !== 'player');
const s0 = world.sites[3], s1 = world.sites[4];
for (const [id, s] of [['tA', s0], ['tB', s1]]) g.frontier.world.addTown({ id, name: id, owner: rival, x: s.x, z: s.z, pop: 3, stock: { food: 50 }, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
g.step([]);
const ax = s0.x + 40, az = s0.z + 40, L = 600;
F.rail.links.r1 = { id: 'r1', owner: rival, from: 'tA', to: 'tB', done: true, length: L, points: [[ax, az], [ax + L, az]], dist: [0, L] };
const run = (n, until) => { for (let i = 0; i < n; i++) { g.step([]); if (until?.()) return true; } return !until; };
const blast = c => g.step([{ id: hero.id, type: 'frontier', action: 'rail', mode: 'blast', ...c }]);
const l = F.rail.links.r1, notice = () => S.clans.player.notice?.text || '';
Object.assign(hero, { place: 'world', area: 'world', x: ax + 300, z: az + 30 });
g.step([]);
const train = () => Object.values(F.rail.trains).find(t => t.link === 'r1');
assert.ok(train(), 'the line has its train');

// off the track: refused; near a station: refused; on the track: charge set, blows after the fuse
blast(); assert.match(notice(), /stand on a railway line/i, 'must stand on the track');
Object.assign(hero, { x: ax + 5, z: az + 3 }); blast(); assert.match(notice(), /station/i, 'not beside a station');
// wait until the train is heading out toward tB and is short of the spot, then blast ahead of it
assert.ok(run(4000, () => train().dir === 1 && train().wait <= 0 && train().d > 20 && train().d < 100), 'train on its way out');
Object.assign(hero, { x: ax + 300, z: az + 2 }); blast();
assert.ok(l.charge, 'charge set');
run(Math.round(B.fuseSeconds * 20) + 1);
assert.ok(!l.charge && l.blast && l.closed && l.cutBy === 'blast', 'blown: line closed');
assert.equal(l.blast.until - l.blast.at, Math.round(B.closeDays * day), 'closed half a day');
assert.equal(l.blast.safeUntil - l.blast.at, Math.round(B.cooldownDays * day), 'cooldown 2.5 days');
assert.match(S.clans[rival].notice?.text || '', /blown up/i, 'owner told');

run(2); assert.equal(l.blast.crew.length, 0, 'no repair crew yet');

// blasting again is refused
blast(); assert.match(notice(), /recently|already/i, 'one blast at a time');

// the train stops short of the gap and stands 3 minutes
assert.ok(run(3000, () => train().stopped), 'train stopped at the gap');
const t = train();
assert.ok(Math.abs(t.d - (l.blast.d - B.stopGap)) < 0.01, 'stops stopGap short of the gap');
const d0 = t.d;
run(Math.round(B.stopSeconds * 20) - 5);
assert.equal(t.d, d0, 'stands there');
assert.equal(l.blast.crew.length, 0, 'no repair crew while the train stands at the gap');
// then backs to tA and is held there while the line is closed
assert.ok(run(4000, () => t.d <= 0), 'backs to the last station');
run(400);
assert.equal(t.d, 0, 'held at the station while the line is closed');
// the repair crew comes once the train has backed away, and can't be hurt
assert.equal(l.blast.crew.length, B.crew.size, 'repair crew at the gap');
const c0 = S.entities[l.blast.crew[0]];
assert.ok(c0.untouchable && !g.attackAllowed(hero, c0), 'repair crew cannot be attacked');
// Skip can't cross the gap (blocks)
assert.ok(g.frontier.rail.blast.blocks(t, l), 'skip blocked');

// repaired after half a day: line open, crew gone, cooldown still on
S.tick = l.blast.until; run(2);
assert.ok(!l.closed && l.blast && !l.blast.crew.length, 'repaired, crew gone');
assert.ok(run(4000, () => t.d > 50), 'train runs again');
blast(); assert.match(notice(), /recently/i, 'still on cooldown');
S.tick = l.blast.safeUntil; run(2);
assert.ok(!l.blast, 'cooldown over');

// run over (2026-11-07 rule): the hero on the track where the train passes goes down
assert.ok(run(4000, () => train().wait <= 0 && train().d > 20 && train().d < 400), 'train running');
{ const tr = train(), ahead = tr.d + tr.dir * 60; if (ahead > 10 && ahead < L - 10) { Object.assign(hero, { x: ax + ahead, z: az }); hero.order = { kind: 'stop' };
  assert.ok(run(400, () => hero.dead || hero.downed), 'hit by the train'); } }
console.log('test_train_blast: ok');
