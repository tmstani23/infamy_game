import assert from 'node:assert/strict';
import { largeFights } from '../src/sim/large_fights.js';
import { createCivilians } from '../src/sim/civilians.js';
import { createPolice } from '../src/sim/police.js';

const state = { tick: 100, clans: { a: { id: 'a' }, b: { id: 'b' } }, entities: {}, hits: [], casts: [], news: [] };
for (const owner of ['a', 'b']) for (let i = 0; i < 5; i++) {
  const id = `${owner}${i}`;
  state.entities[id] = { id, owner, type: 'thug', place: 'street', x: i, z: owner === 'a' ? 1 : -1 };
}
assert.equal(largeFights(state).length, 0, 'a peaceful crowd is safe');
for (const e of Object.values(state.entities)) e.attackTarget = `${e.owner === 'a' ? 'b' : 'a'}0`;
state.tick++;
assert.equal(largeFights(state).length, 0, 'target locks alone do not count as fighting');
state.entities.a0.swing = { target: 'b0' };
state.tick++;
assert.equal(largeFights(state).length, 0, 'one fighting pair does not recruit idle nearby units');
delete state.entities.a0.swing;
state.tick++;
for (const e of Object.values(state.entities)) e.foughtAt = state.tick;
assert.equal(largeFights(state).length, 1, '5v5 fighting creates one avoidance zone');
const nav = { nearestFree: (x, z) => [x, z], findPath: () => [[0, 0]] };
const moves = [];
const moveTo = (e, unit, x, z) => { moves.push(e.id); e.x = x; e.z = z; return true; };
const stopPath = e => { delete e.path; };
const statsOf = () => ({ walk: 2, run: 4 });
const civilians = createCivilians({ state, data: { types: { worker: { count: 0, model: 'worker', likes: ['street'] } } },
  pois: [{ id: 'home', home: true, tags: ['street'], x: 1, z: 0 }], nav,
  spawn: (type, model, x, z, extra) => { state.entities.c = { id: 'c', type, model, place: 'street', x, z, ...extra }; return 'c'; }, moveTo, stopPath, statsOf });
civilians.add('worker', 1, 0);
const cop = state.entities.p = { id: 'p', owner: 'police', cop: true, place: 'street', x: 1, z: 0, angry: { a: 9999 } };
let engagements = 0, arrests = 0;
const police = createPolice({ state, data: { rules: { dayPatrol: { hq: 0, box: 0 } } }, units: {},
  district: { buildings: [], edges: [[80, 80]] }, nav, moveTo, stopPath, statsOf, remove: id => delete state.entities[id],
  act: { swing: () => false, arresting: e => { if (e.execute) { arrests++; return true; } return false; },
    hostile: () => true, engage: () => engagements++, arrest: () => {} } });
civilians.tick(); police.tick();
assert.ok(moves.includes('c') && moves.includes('p'), 'both civilians and police retreat');
assert.equal(engagements, 0, 'police do not join the large fight');
assert.ok(civilians.mind.c.retreat && police.mind.p.retreat);
state.entities.b4.downed = true;
state.tick++;
moves.length = 0;
civilians.tick(); police.tick();
assert.equal(moves.length, 0, 'remain safely outside while battle continues');
assert.ok(civilians.mind.c.retreat && police.mind.p.retreat);
assert.equal(largeFights(state).length, 1, 'an established battle stays dangerous after casualties');
state.entities.b4.downed = false;
// An ongoing arrest is allowed to finish instead of being cancelled by avoidance.
Object.assign(cop, { x: 1, z: 0, execute: { target: 'a0' } });
state.tick++; police.tick();
assert.equal(arrests, 1);
delete cop.execute;
state.tick += 61;
civilians.tick(); police.tick();
assert.equal(civilians.mind.c.retreat, undefined, 'civilian routine resumes after fight ends');
assert.equal(police.mind.p?.retreat, undefined, 'police routine resumes after fight ends');
state.tick++;
for (const e of Object.values(state.entities)) if (e.owner === 'a' || e.owner === 'b') e.foughtAt = state.tick;
state.entities.b4.downed = true;
assert.equal(largeFights(state).length, 0, '5v4 does not meet large battle threshold');
state.entities.b4.downed = false;
state.entities.b4.place = 'indoors';
state.tick++;
assert.equal(largeFights(state).length, 0, 'separate rooms do not combine their crowds');
console.log('large fight detection, civilian/police retreat, arrest preservation, and recovery ok');
