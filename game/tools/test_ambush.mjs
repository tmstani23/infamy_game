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
  intelligence: { known: () => true }, recovery: { request: (clan, id, reason) => { withdrawals.push(reason); delete own.sectors[id].operation; own.sectors[id].recovery ||= { state: 'Withdrawing' }; },
    requestHome: (clan,id,reason,ids) => {withdrawals.push(reason);delete own.sectors[id].operation;own.sectors[id].recovery={home:true,required:ids.length};return true;} },
  clearCombat: () => {}, attackStep: () => {}, executeStep: () => {}, finishTarget: () => {} });
ambush.tick(); assert.equal(own.sectors.left.operation.target, target.id, 'standing Ambush jumps clan target despite eight additional defenders');
state.entities.l0.downed = true; ambush.tick();
assert.equal(own.sectors.left.recovery.home,true,'first casualty recalls an active ambush to HQ');
assert.equal(own.sectors.left.recovery.required,3);assert.equal(withdrawals.length,1);
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
delete own.sectors.left.operation;delete own.sectors.left.recovery;
state.entities.l1.deployment.duty={manual:true};state.entities.l2.deployment.duty={manual:true};state.entities.l0.hp=30;
ambush.tick();assert.ok(own.sectors.left.operation,'a solo crewman can still start an ambush');ambush.tick();
assert.equal(withdrawals.at(-1),'Crew in danger','the existing solo one-third-health escape remains an extra trigger');
own.sectors.left.operation={kind:'ambush',target:far.id,units:['l0'],state:'Regrouping'};
own.sectors.left.recovery={home:true,resumePoint:{x:-4,z:0,place:'street'}};
own.hunt={target:far.id,committedSector:'left'};far.dead=true;ambush.tick();
assert.equal(own.hunt,undefined,'a target defeated during HQ recovery cannot leave an impossible pending hunt');
assert.equal(own.sectors.left.operation,undefined);assert.equal(own.sectors.left.recovery.home,true,'target defeat retains the HQ regroup requirement');
delete own.sectors.left.recovery;far.dead=false;far.downed=true;state.entities.l0.hp=100;own.hunt={target:far.id};ambush.tick();
assert.equal(own.sectors.left.operation?.target,far.id,'a selected downed target can be locally reacquired for ordinary execution');
console.log('Ambush: first-casualty HQ recall, solo low-HP escape, indefinite exact-target wait, no chase, cancel and defeated/downed target recovery passed');
