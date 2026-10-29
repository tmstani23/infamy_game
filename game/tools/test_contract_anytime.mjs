import assert from 'node:assert/strict';
import { createContracts } from '../src/sim/contracts.js';
const state = { tick: 0, night: false, dawn: false, news: [], hits: [], ryoGains: [],
  clans: { s: { id: 's', kind: 'ninja', ryo: 0 }, r: { id: 'r', kind: 'yakuza', ryo: 1000 } },
  entities: { s: { id: 's', owner: 's', type: 'hero', place: 'room', hp: 100, x: 0, z: 0, hidden: true }, r: { id: 'r', owner: 'r', type: 'hero', hp: 100, place: 'street' } },
  businesses: { b: { id: 'b', kind: 'shop', owner: 'r', room: 'room', x: 10, z: 20 } } };
// Isolate local objective counters from acceptance pacing (tested separately).
const c = createContracts({ state, scores: { shop: 1 }, rules: { acceptIntervalSeconds: 0, scout: { seconds: 1 }, mark: { plantSeconds: 1, holdSeconds: 2 }, steal: { seconds: 1 } }, backRoom: () => ({ x: 0, z: 0 }) });
const tick = () => { state.tick++; c.tick(); state.dawn = false; state.hits = []; };
tick(); const C = state.contracts;
function take(kind) {
  let j;
  for (let k = 0; k < 30 && !j; k++) { c.post(); j = C.board.find(j => j.kind === kind); }
  assert.ok(j); c.command(state.entities.s, { action: 'take', job: j.id }, { menu: 'contracts' });
  return C.active.s;
}
let job = take('mark');
for (let i = 0; i < 21; i++) tick();
assert.ok(job.mark, 'sabotage plants during daytime');
state.night = true; tick(); state.night = false; state.dawn = true; tick();
assert.equal(C.active.s, job, 'dawn retains active contract and progress');
while (C.active.s) tick();
assert.ok(state.businesses.b.sabotaged, 'local hold completes in daytime without waiting for payout');
assert.ok(state.clans.s.ryo > 0);
job = take('steal'); state.entities.s.place = 'street';
for (let i = 0; i < 30; i++) tick(); assert.equal(job.progress, 0, 'wrong place never progresses');
state.entities.s.place = 'room'; tick();
assert.equal(job.counter.place, 'room'); assert.ok(job.counter.need > 0);
state.dawn = true; tick(); assert.ok(job.progress > 0);
while (C.active.s) tick();
assert.equal(C.active.s, undefined);
const until = C.cooldowns['steal:b:r']; assert.ok(until > state.tick);
c.post(); assert.ok(!C.board.some(j => j.kind === 'steal' && j.business === 'b'), 'completed site repeat is time-gated independently');
const active = take('boss'); state.dawn = true; tick(); assert.equal(C.active.s, active);
const refresh = C.nextRefresh; state.tick = refresh; tick(); assert.equal(C.active.s, active, 'rolling board refresh preserves accepted terms');
assert.ok(C.nextRefresh > state.tick);
c.command(state.entities.s, { action: 'drop' });
assert.equal(C.cooldowns['boss:r:r'], state.tick + c.rules.failedRepeatSeconds * 20, 'cancel cooldown prevents immediate accept/drop reroll');
console.log('All-day contracts: daytime planting/completion, dusk/dawn persistence, local counters, wrong-site rejection, independent refill/repeat/cancel and active reward retention passed');
