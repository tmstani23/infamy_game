// The governor's cannon salute (Tim 2026-11-07): 4 cannons by a player town hall, fired in turn
// on the first talk, after a tier upgrade and on "Fire a salute" (with a cooldown). Scenery: never hostile.
import assert from 'node:assert/strict';
import { createCannonSalute } from '../src/sim/cannon_salute.js';
const state = { tick: 0, entities: {}, casts: [], clans: { player: {}, bot: { bot: true } }, frontier: { settlements: {
  t1: { id: 't1', owner: 'player', founded: 0, x: 100, z: 100 }, t2: { id: 't2', owner: 'bot', founded: 0, x: 500, z: 500 } } } };
let n = 1;
const spawn = (type, model, x, z, extra) => { const id = String(n++); state.entities[id] = { id, type, model, x, z, ...extra }; return id; };
const removeUnit = id => delete state.entities[id];
const C = createCannonSalute({ state, spawn, removeUnit, cell: 11 });
const step = () => { state.casts = []; C.tick(); const out = state.casts; state.tick++; return out; };
step();
const t1 = state.frontier.settlements.t1;
assert.equal(t1.cannons.length, 4, 'four cannons by the hall');
assert.deepEqual(t1.cannons.map(id => state.entities[id].model), ['cannon_field', 'cannon_field', 'cannon_wooden', 'cannon_wooden']);
assert.ok(t1.cannons.every(id => state.entities[id].guide && !state.entities[id].owner), 'scenery: ownerless guides');
assert.ok(!state.frontier.settlements.t2.cannons, 'not for bots');
C.firstTalk(t1);
const shots = [];
for (let i = 0; i < 140; i++) for (const c of step()) shots.push({ ...c, tick: state.tick - 1 });
assert.equal(shots.length, 4, 'four shots');
assert.deepEqual(shots.map(s => s.a), t1.cannons, 'one after another, brass first');
assert.equal(shots[1].tick - shots[0].tick, 16);
assert.ok(!t1.salute, 'finished');
C.firstTalk(t1); assert.ok(!t1.salute, 'only the first talk');
assert.equal(C.salute(t1, true), false, 'cooldown');
assert.match(state.clans.player.notice.text, /later/);
state.tick += 120 * 20;
assert.equal(C.salute(t1, true), true, 'asked after the cooldown');
for (let i = 0; i < 140; i++) step();
t1.tierUpAt = 5; step();
assert.ok(t1.salute, 'a tier upgrade fires a salute');
console.log('test_cannon_salute: ok');
