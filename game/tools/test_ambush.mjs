import assert from 'node:assert/strict';
import { createAmbush } from '../src/sim/ambush.js';
const state = { tick: 0, entities: {}, clans: { p: { kind: 'ninja' }, r: { kind: 'yakuza' } }, contracts: { active: {} },
  deployment: { clans: { p: { sectors: { left: { task: 'ambush', objective: { x: -4, z: 0 } }, right: { task: 'watch', objective: { x: 4, z: 0 } } } } } } };
const own = state.deployment.clans.p, h = { id: 'hero', owner: 'p', type: 'hero' };
const add = (id, owner, x, group) => state.entities[id] = { id, owner, type: 'ninja', hp: 100, maxHp: 100, x, z: 0, place: 'street', deployment: { group } };
for (let i = 0; i < 3; i++) add(`l${i}`, 'p', -4, 'left');
add('r0', 'p', 4, 'right');
const target = add('target', 'r', -3, 'hero');
for (let i = 0; i < 8; i++) add(`enemy${i}`, 'r', -3, 'hero');
const deployment = { members: (clan, group) => Object.values(state.entities).filter(e => e.owner === clan && e.deployment.group === group), sectorAt: x => x < 0 ? 'left' : 'right', canActAt: () => true };
const withdrawals = [];
const ambush = createAmbush({ state, deployment, assignments: {}, rally: { participating: e => !!e.rallied }, vision: { range: 5, canSee: () => false }, sees: () => true,
  intelligence: { known: () => true }, recovery: { request: (clan, id, reason) => { withdrawals.push(reason); delete own.sectors[id].operation; own.sectors[id].recovery = { state: 'Withdrawing' }; } },
  clearCombat: () => {}, attackStep: () => {}, executeStep: () => {}, finishTarget: () => {} });
ambush.tick(); assert.equal(own.sectors.left.operation.target, target.id, 'standing Ambush jumps clan target despite eight additional defenders');
state.entities.l0.downed = true; ambush.tick();
assert.ok(own.sectors.left.operation, 'one casualty alone keeps fighting');
state.entities.l1.hp = 100 / 3; ambush.tick(); assert.equal(withdrawals.length, 1, 'one casualty plus low survivor withdraws');
assert.equal(own.sectors.left.task, 'ambush', 'standing assignment survives withdrawal');
delete own.sectors.left.recovery; own.sectors.left.task = 'watch';
state.entities.l0.downed = false; state.entities.l1.hp = 100;
target.x = 40;
ambush.command(h, { action: 'armAmbush', target: target.id });
state.tick = 10000; ambush.tick();
assert.equal(own.hunt.target, target.id, 'remembered target can wait beyond old sixty-second timeout');
assert.equal(own.hunt.committedSector, undefined);
target.x = 4; ambush.tick();
assert.equal(own.hunt.committedSector, 'right', 'sector actually observing target claims coordinated order');
assert.equal(own.sectors.left.operation, undefined, 'other sector never piles in');
target.x = -4; ambush.tick();
assert.equal(own.hunt, undefined, 'leaving after commitment ends attempt instead of chaining groups');
assert.equal(own.sectors.right.recovery.state, 'Withdrawing');
ambush.command(h, { action: 'armAmbush', target: target.id }); ambush.command(h, { action: 'cancelAmbush' });
assert.equal(own.hunt, undefined);
// Standing Ambush survives a whole attempt and recovery, selecting the nearest
// detected target again rather than degrading into ordinary patrol.
delete own.sectors.left.recovery;delete own.sectors.right.recovery;delete own.sectors.left.operation;
own.sectors.left.task='ambush';target.dead=true;
const near=state.entities.enemy7,far=state.entities.enemy0;
for(let i=0;i<8;i++)state.entities[`enemy${i}`].dead=true;
near.dead=false;near.x=-3.5;far.dead=false;far.x=-1;
ambush.tick();assert.equal(own.sectors.left.operation.target,near.id,'nearest detection wins instead of insertion order');
near.dead=true;ambush.tick();assert.ok(own.sectors.left.recovery);
delete own.sectors.left.recovery;ambush.tick();
assert.equal(own.sectors.left.operation.target,far.id,'general Ambush repeats after retreat/recovery');
assert.doesNotThrow(() => JSON.stringify(state));
console.log('Ambush: standing task, larger forces, exact casualties, indefinite known-target wait, single-group handoff/commit/no chase and cancel passed');
