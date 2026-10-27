import assert from 'node:assert/strict';
import { createNav } from '../src/sim/nav.js';
import { createDeployment } from '../src/sim/deployment.js';
import { createSectorRecovery, withdrawalReason } from '../src/sim/sector_recovery.js';

function fixture(kind = 'yakuza') {
  const district = { bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 }, buildings: [] }, nav = createNav([], district.bounds);
  const state = { tick: 0, clans: { p: { id: 'p', kind } }, businesses: {}, entities: {} };
  let seq = 0, blocked = false, attacks = 0;
  const deployment = createDeployment({ state, district, nav, moveTo: (e, unit, x, z) => {
    if (blocked) return false;
    const dist = Math.hypot(x - e.x, z - e.z), k = dist ? Math.min(.5, dist) / dist : 0;
    e.x += (x - e.x) * k; e.z += (z - e.z) * k; return true;
  } });
  deployment.enable();
  const sector = state.deployment.sectors[0], task = state.deployment.clans.p.sectors[sector.id];
  const add = (extra = {}) => {
    const e = { id: String(++seq), owner: 'p', type: 'thug', hp: 100, maxHp: 100, place: 'street', ...sector.anchor,
      deployment: { group: sector.id }, foughtAt: 0, ...extra };
    state.entities[e.id] = e; return e;
  };
  const team = [add(), add(), add()];
  const recovery = createSectorRecovery({ state, deployment, rally: { participating: e => !!e.rallied },
    vision: { canSee: (clan, e) => !e.hidden }, clearCombat: e => { delete e.swing; delete e.execute; },
    attackStep: () => attacks++ });
  return { state, deployment, sector, task, team, add, recovery, block: b => { blocked = b; }, attacks: () => attacks };
}

const units = { a: { hp: 100, maxHp: 100 }, b: { hp: 100, maxHp: 100 }, c: { hp: 100, maxHp: 100 } };
units.a.downed = true;
assert.equal(withdrawalReason(units, ['a', 'b', 'c']), null, 'first casualty alone keeps fighting');
units.b.hp = 100 / 3;
assert.ok(withdrawalReason(units, ['a', 'b', 'c']), 'one casualty plus one-third HP withdraws');
units.b.hp = 100; units.c.dead = true;
assert.ok(withdrawalReason(units, ['a', 'b', 'c']), 'second casualty withdraws immediately');
assert.equal(withdrawalReason(units, ['b']), null); units.b.hp = 33;
assert.ok(withdrawalReason(units, ['b']), 'solo threshold');

for (const kind of ['yakuza', 'kuroda', 'ninja']) {
  const f = fixture(kind), [a, b, c] = f.team;
  f.recovery.tick(); a.downed = true; b.hp = 30;
  const enemy = f.add({ owner: 'rival', x: b.x + 1 });
  f.recovery.tick();
  assert.equal(f.task.recovery.state, 'Withdrawing', `${kind} uses shared casualty rules`);
  const p = f.task.recovery.point;
  assert.equal(f.deployment.sectorAt(p.x, p.z), f.sector.id);
  assert.ok(Math.hypot(p.x - enemy.x, p.z - enemy.z) > Math.hypot(b.x - enemy.x, b.z - enemy.z), 'fallback increases distance');
  for (let i = 0; i < 160; i++) {
    f.state.tick++; for (const e of [b, c]) f.recovery.step(e, { attackRange: 1 }); f.recovery.tick();
  }
  assert.equal(f.task.recovery.state, 'Recovering', 'low health waits after gathering');
  assert.equal(b.hp, 30, 'recovery never invents healing');
  b.hp = 70; f.recovery.tick();
  assert.equal(f.task.recovery, undefined, 'healthy gathered survivors resume without waiting for casualty');
  assert.equal(b.deployment.duty.status, 'Returning');
}

{
  const f = fixture(); f.recovery.request('p', f.sector.id);
  f.recovery.tick(); const p = { ...f.task.recovery.point };
  f.add({ owner: 'rival', x: p.x, z: p.z }); f.state.tick = 20; f.recovery.tick();
  assert.notDeepEqual(f.task.recovery.point, p, 'visible threat at regroup point forces replanning');
  f.team[0].deployment.duty = { manual: true };
  assert.equal(f.recovery.step(f.team[0], {}), false, 'explicit manual override takes priority');
  f.team[1].rallied = true;
  assert.equal(f.recovery.step(f.team[1], {}), false, 'Rally takes priority');
  f.team[2].deployment.transfer = { to: 'home' };
  assert.equal(f.recovery.step(f.team[2], {}), false, 'physical transfer takes priority');
  f.recovery.tick(); assert.equal(f.task.recovery, undefined, 'no automated survivors cannot deadlock');
}
{
  const a = fixture(), b = fixture();
  a.add({ owner: 'rival', hidden: true, x: a.sector.anchor.x + 2 });
  a.recovery.request('p', a.sector.id); b.recovery.request('p', b.sector.id);
  a.recovery.tick(); b.recovery.tick();
  assert.deepEqual(a.task.recovery.point, b.task.recovery.point, 'unseen enemies cannot affect fallback selection');
  a.task.recovery.point = { x: a.team[0].x + 5, z: a.team[0].z, place: 'street' };
  a.block(true); a.add({ owner: 'rival', x: a.team[0].x + .5 });
  a.recovery.step(a.team[0], { attackRange: 1 });
  assert.equal(a.attacks(), 1, 'trapped units defend at melee range instead of teleporting');
  assert.doesNotThrow(() => JSON.stringify(a.state));
}
console.log('Sector recovery: all-clan casualties, reachable local fallback, physical retreat, recovery/health, replanning, overrides, hidden-data isolation and trapped defense passed');
