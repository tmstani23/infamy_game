// Guarded places (world variety P4, 2026-11-27, sim/guarded_places.js): guards and a boss at each hidden place; the
// first clear gives the clan the place's relic, a later clear pays repeatRyo; guards return after respawnDays; animals
// hunt when you come close; bots get nothing; saves carry it.
// Run: node tools/test_guarded_places.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { ITEMS } from '../src/sim/inventory.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const HP = data('data/hidden_places.json'), G = HP.guards;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json'),
  animals: data('data/wildlife.json').animals, hidden: HP };

// the data: all seven places guarded, each with its own relic, boss and one ability
const relics = HP.places.map(p => p.guard?.relic);
assert.equal(relics.length, 7); assert.equal(new Set(relics).size, 7, 'one relic each');
for (const p of HP.places) {
  assert.ok(ITEMS[p.guard.relic]?.slot === 'relic', `${p.id}: a relic item`);
  assert.ok(HP.types[p.guard.boss.type], `${p.id}: a boss type`);
  assert.ok(p.guard.boss.ability?.kind && p.guard.boss.title, `${p.id}: the boss has a title and one ability`);
  assert.ok(p.guard.boss.scale > 1, `${p.id}: the boss is bigger`);
}

const g = createGame(options);
const match = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 91 });
const S = g.state, hero = S.entities[match.heroId], me = hero.owner;
assert.ok(g.guarded?.enabled, 'guarded places are on in an island game');
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const put = (x, z) => Object.assign(hero, { place: 'world', area: 'world', x, z, path: null, order: null });
for (const e of Object.values(S.entities)) if (e.owner === me && e.type !== 'hero') Object.assign(e, { place: 'world', area: 'world', x: 60, z: 60 });
const P = HP.places.find(p => p.id === 'wreck_cove');
const guardsOf = id => Object.values(S.entities).filter(e => e.guarded === id && e.type !== 'horse');
const kill = (list, by) => { for (const e of list) Object.assign(e, { hp: 0, dead: true, diedAt: S.tick, hitBy: { id: by.id, tick: S.tick } }); };

// 1. ride out there: the guards and the boss are on the map, the boss bigger and named
put(P.x + 30, P.z); run(40);
let guards = guardsOf(P.id);
const want = P.guard.members.reduce((n, [, k]) => n + k, 0) + 1;
assert.equal(guards.length, want, 'every guard and the boss');
const boss = guards.find(e => e.boss);
assert.ok(boss, 'one boss');
assert.equal(boss.type, P.guard.boss.type); assert.equal(boss.boss.title, P.guard.boss.title);
assert.ok(boss.boss.scale > 1 && boss.boss.ability.kind === 'keg', 'his look and ability ride on him');
assert.ok(guards.every(e => e.owner === 'bandits' && Math.hypot(e.x - P.x, e.z - P.z) <= G.leash), 'bandits, round the place');
assert.equal(boss.maxHp, HP.types[P.guard.boss.type].hp, 'boss numbers from data');
// patrols (2026-11-28): the guards spread out round the boss, not in a knot
run(20 * 45);
{ const far = guardsOf(P.id).filter(e => !e.boss).map(e => Math.hypot(e.x - P.x, e.z - P.z));
  assert.ok(Math.max(...far) > G.spawnRadius + 1, `the guards walk patrols out to ${G.patrol[1]} (farthest ${Math.max(...far).toFixed(1)})`);
  assert.ok(far.every(d => d <= G.patrol[1] + 2), 'but stay near the boss'); }
// one hit = the whole band comes
{ const list = guardsOf(P.id), hit = list.find(e => !e.boss);
  g.bandits.provoke(hit, me);
  assert.ok(list.every(e => e.angry?.[me]), 'every guard and the boss rally');
  assert.ok(list.filter(e => e !== hit).every(e => e.rally), 'running to where it happened');
  for (const e of list) { delete e.angry; delete e.rally; delete e.kite; } }
// ranged guards kite: a foe close by = run off a few steps, then shoot again
{ const archer = guardsOf(P.id).find(e => e.type === 'guard_archer');
  put(archer.x + 1.5, archer.z); (archer.angry ||= {})[me] = S.tick + 400;
  run(3); assert.ok(archer.kite, 'the archer starts to kite');
  run(30); const d = Math.hypot(archer.x - hero.x, archer.z - hero.z);
  assert.ok(d > 3, `got away from the foe (${d.toFixed(1)})`);
  let shot = 0; for (let i = 0; i < 20 * 3; i++) { run(1); if (archer.swing) shot++; }
  assert.ok(shot > 0, 'then stands and shoots');
  put(P.x + 30, P.z); for (const e of guardsOf(P.id)) { delete e.angry; delete e.rally; delete e.kite; } run(20 * 3); }
// they see you coming from farther than a night bandit
put(P.x + G.sight - 2, P.z); run(30);
assert.ok(guardsOf(P.id).some(e => e.angry?.[me]), 'the guards go for you inside their sight');

// 2. clear it: the relic, a notice, the timer
const bag0 = S.clans[me].inventory.bag.filter(Boolean).length;
kill(guardsOf(P.id), hero); run(5);
let rec = S.world.guarded[P.id];
assert.ok(rec.cleared, 'cleared'); assert.equal(rec.claimed[me], true);
assert.ok(S.clans[me].inventory.bag.includes(P.guard.relic), 'the relic goes in the bag');
assert.equal(S.clans[me].inventory.bag.filter(Boolean).length, bag0 + 1);
assert.match(S.clans[me].notice.text, /cleared\. You took the/);
let view = g.guarded.viewFor(me, P.id);
assert.ok(view.cleared && view.held && view.backInTicks > 0, 'the card: cleared, relic held, guards back in');
// the relic cannot be sold or dropped
assert.ok(!ITEMS[P.guard.relic].sell, 'never sold');

// 3. five days on: the guards are back; the second clear pays ryo, no second relic
const dayTicks = view.dayTicks;
S.tick += G.respawnDays * dayTicks + 1; run(5);
assert.equal(S.world.guarded[P.id].cleared, false, 'guards return');
run(20);
assert.equal(guardsOf(P.id).filter(e => !e.dead).length, want, 'all back');
const ryo0 = S.clans[me].ryo;
kill(guardsOf(P.id), hero); run(5);
assert.equal(S.clans[me].ryo, ryo0 + G.repeatRyo, `a repeat clear pays ${G.repeatRyo} ryo`);
assert.equal(S.clans[me].inventory.bag.filter(id => id === P.guard.relic).length, 1, 'each relic once per clan');

// 4. the cave bear: one huge wild bear that hunts when you come close
const C = HP.places.find(p => p.id === 'hermit_cave');
put(C.x + 40, C.z); run(40);
const bear = guardsOf(C.id)[0];
assert.ok(bear?.wildlife && bear.boss && bear.type === 'boss_great_bear', 'the cave bear is a wild bear and the boss');
assert.equal(guardsOf(C.id).length, 1);
put(C.x + G.aggro - 3, C.z); run(20);
assert.ok(bear.angry?.[me] || bear.wm?.clan === me, 'he hunts you once you come close');
// mounted raiders at the caravan
const R = HP.places.find(p => p.id === 'buried_caravan');
put(R.x + 30, R.z); run(40);
const raiders = guardsOf(R.id);
assert.ok(raiders.length === 5 && raiders.every(e => e.mounted && state(e.ride?.horse)), 'the raiders and their chief ride');
function state(id) { return S.entities[id]; }

// 5. a bot that clears a place gets nothing
const bot = Object.keys(S.clans).find(c => S.clans[c].bot);
const F = HP.places.find(p => p.id === 'frozen_shrine');
put(F.x + 30, F.z); run(40);
const bu = Object.values(S.entities).find(e => e.owner === bot && !e.dead);
if (bu) {
  const bag = S.clans[bot].inventory?.bag?.slice() || [];
  kill(guardsOf(F.id), bu); run(5);
  assert.ok(S.world.guarded[F.id].cleared, 'cleared by the bot');
  assert.ok(!S.world.guarded[F.id].claimed[bot], 'a bot never claims');
  assert.deepEqual(S.clans[bot].inventory?.bag || [], bag, 'and gets no relic');
}

// 6. saves carry it (state.world is plain data)
const g2 = createGame(options); g2.state.world = JSON.parse(JSON.stringify(S.world));
assert.equal(g2.guarded.viewFor(me, P.id).held, true, 'held after a save');
console.log('test_guarded_places: ok');
