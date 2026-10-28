import assert from 'node:assert/strict';
import { createDeployment, storedDeployment, restoredDeployment } from '../src/sim/deployment.js';
import { createNav } from '../src/sim/nav.js';

function fixture({ bot = false, reserveTarget = 2 } = {}) {
  const district = { bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, buildings: [] };
  const street = createNav([], district.bounds), room = createNav([], { minX: 100, maxX: 110, minZ: 100, maxZ: 110 });
  let blocked = false, seq = 1;
  const nav = { ...street, findPath: (...a) => blocked ? null : street.findPath(...a) };
  const h = { id: '1', owner: 'p', type: 'hero', x: -8, z: -8, place: 'street' };
  const state = { tick: 0, clans: { p: { id: 'p', kind: 'yakuza', bot }, enemy: { id: 'enemy', kind: 'ninja' } }, entities: { 1: h },
    businesses: { hq: { hideout: 'p', owner: 'p', room: 'hq', ring: [-8, -8] } } };
  const d = createDeployment({ state, district, nav, navOf: p => p === 'hq' ? room : nav,
    doors: [{ x: -8, z: -8, place: 'hq', to: { x: 101, z: 101 } }, { x: 101, z: 101, place: 'street', to: { x: -8, z: -8 } }],
    moveTo: (e, unit, x, z) => {
      if (blocked) return false;
      const dist = Math.hypot(x - e.x, z - e.z), k = Math.min(.4, dist) / dist;
      e.x += (x - e.x) * k; e.z += (z - e.z) * k; return true;
    } });
  d.enable();
  if(reserveTarget!==null)d.command(h,{action:'reserveTarget',value:reserveTarget});
  d.command(h,{action:'autoSector',sector:state.deployment.sectors[0].id});
  const add = (group = 'home', extra = {}) => {
    const e = { id: String(++seq), owner: 'p', type: 'thug', hp: 200, maxHp: 200, x: 102, z: 102, place: 'hq', deployment: { group, everAssigned: true }, ...extra };
    state.entities[e.id] = e; d.onSpawn(e); return e;
  };
  const command = c => d.command(h, c);
  const sync = tick => { state.tick = tick; d.sync(); };
  return { state, h, d, add, command, sync, sectors: state.deployment.sectors.map(s => s.id), block: v => { blocked = v; } };
}

for (const bot of [false, true]) {
  const defaults=fixture({bot,reserveTarget:null});assert.equal(defaults.state.deployment.clans.p.reserveTarget,0,'new clans default to no standing HQ reserve');
  const f = fixture({ bot }), crew = Array.from({ length: 5 }, () => f.add());
  f.sync(0);
  assert.equal(crew.filter(e => e.deployment.transfer).length, 3, 'two ready reserves retained for players and bots');
  assert.deepEqual(f.sectors.map(s => f.d.counts('p')[s]), [3, 0, 0, 0], 'inbound reservations fill the chosen sector first');
  assert.ok(crew.every(e => e.order?.kind !== 'follow'));
  f.command({ action: 'reserveTarget', value: 20 }); f.sync(20);
  assert.equal(crew.filter(e => e.deployment.transfer).length, 3, 'raising target does not recall or cancel dispatched crew');
  assert.equal(f.d.counts('p').hero, 0, 'automation never fills the hero group');
}

{
  const f = fixture(), crew = [f.add(), f.add(), f.add()];
  f.command({ action: 'keepAtHQ', units: [crew[2].id], value: true }); f.sync(0);
  assert.equal(crew[2].deployment.transfer, undefined, 'pinned ready crew count toward the ready target');
  assert.ok(crew[1].deployment.transfer);
  assert.equal(crew[0].deployment.transfer, undefined);
  const invalid = [-1, 1.5, NaN, Infinity, '2'];
  for (const value of invalid) f.command({ action: 'reserveTarget', value });
  assert.equal(f.state.deployment.clans.p.reserveTarget, 2, 'invalid settings rejected by authoritative sim');
  const enemy = f.add('home', { owner: 'enemy' });
  f.command({ action: 'keepAtHQ', units: [crew[0].id, enemy.id], value: true });
  assert.equal(crew[0].deployment.keepAtHQ, false, 'foreign/mixed ownership batch is rejected atomically');
  f.command({ action: 'reserveTarget', value: 0 }); f.sync(20);
  assert.ok(crew[0].deployment.transfer);
  assert.equal(crew[2].deployment.transfer, undefined);
  const record = { deployment: storedDeployment(crew[2]) };
  assert.equal(restoredDeployment(record).keepAtHQ, true, 'pin persists through medical/jail records');
  f.command({ action: 'keepAtHQ', units: [crew[2].id], value: false }); f.sync(40);
  assert.ok(crew[2].deployment.transfer, 'unpinning permits deployment on next policy pass');
}

{
  const f = fixture(), crew = Array.from({ length: 4 }, () => f.add());
  f.h.hitAt = 0; f.sync(0); f.sync(100);
  assert.equal(crew.filter(e => e.deployment.transfer).length, 0);
  assert.equal(crew.filter(e => e.deployment.automatic?.status === 'queued').length, 2);
  assert.equal(f.d.counts('p')[f.sectors[0]], 0, 'combat queue does not reserve slots before dispatch');
  f.sync(120);
  assert.equal(crew.filter(e => e.deployment.transfer).length, 2, 'dispatch after full six-second hero quiet period');
  const traveler = crew.find(e => e.deployment.transfer), start = [traveler.x, traveler.z];
  f.h.foughtAt = 121;
  for (let i = 0; i < 250 && traveler.deployment.transfer; i++) { f.state.tick++; f.d.travelStep(traveler, {}); }
  assert.equal(traveler.deployment.transfer, undefined, 'hero combat after initiation does not cancel automatic travel');
  assert.notDeepEqual([traveler.x, traveler.z], start);
  assert.notEqual(traveler.order.kind, 'follow');
}

{
  const f = fixture(); f.command({ action: 'reserveTarget', value: 0 });
  const hurt = f.add('home', { hp: 199 }), busy = f.add('home', { order: { kind: 'attack', target: '999' } });
  const woundedRecently = f.add('home', { foughtAt: 0 });
  f.sync(0);
  assert.equal(hurt.deployment.transfer, undefined); assert.match(f.d.reserveStatus(hurt), /full health/);
  assert.equal(busy.deployment.transfer, undefined, 'manual jobs are not interrupted by automation');
  assert.equal(woundedRecently.deployment.transfer, undefined);
  hurt.hp = 200; f.sync(20); assert.ok(hurt.deployment.transfer, 'healed idle surplus deploys');
  f.sync(120); assert.ok(woundedRecently.deployment.transfer, 'own recent combat also protects crew');
  const recovering = f.add('home', { hp: 100, place: 'street', x: 6, z: 6, deployment: { group: 'home', savedGroup: 'hero', keepAtHQ: true } });
  f.sync(140);
  assert.equal(recovering.deployment.transfer.to, 'home', 'injured returnees physically travel home, rather than teleport or rejoin hero');
}

{
  const f = fixture(); f.command({ action: 'reserveTarget', value: 0 });
  for (let i = 0; i < 5; i++) f.add('hero');
  for (const sector of f.sectors) for (let i = 0; i < 3; i++) f.add(sector);
  const extra = f.add(); f.sync(0);
  assert.equal(extra.deployment.transfer, undefined, 'all normal sectors full but hero not full: no new overflow');
  f.add('hero'); f.sync(20); assert.equal(extra.deployment.transfer.to, f.sectors[0]);
  const second = f.add(); f.sync(40); assert.equal(second.deployment.transfer.to, f.sectors[1], 'overflow balances incoming reservations');
  const casualty = f.d.members('p', f.sectors[2])[0]; casualty.dead = true;
  const replacement = f.add(); f.sync(60);
  assert.equal(replacement.deployment.transfer.to, f.sectors[2], 'casualty normal vacancy fills before new overflow');
  assert.equal(f.d.counts('p')[f.sectors[0]], 4, 'existing overflow is not recalled');
}

{
  const f = fixture(); f.command({ action: 'reserveTarget', value: 0 });
  const e = f.add(); f.block(true); f.sync(0);
  assert.equal(e.deployment.transfer, undefined);
  assert.equal(e.deployment.automatic.status, 'blocked');
  assert.equal(f.d.counts('p')[f.sectors[0]], 0, 'failed route preflight cannot consume slots');
  f.block(false); f.sync(20); assert.ok(e.deployment.transfer, 'failed automatic routes retry without teleporting');
  e.dead = true; f.sync(40); assert.equal(f.d.counts('p')[f.sectors[0]], 0, 'death releases automatic reservation');
  assert.doesNotThrow(() => JSON.stringify(f.state));
}
// New crew fill the hero group up to six before any sector or HQ reserve (Tim 2026-10-27).
{
  const f = fixture({ bot: false }), fresh = Array.from({ length: 8 }, () => f.add('home', { deployment: { group: 'home' } }));
  f.sync(0);
  assert.equal(fresh.filter(e => e.deployment.transfer?.to === 'hero').length, 6, 'six new crew run to the hero group');
  assert.ok(fresh.every(e => e.order?.kind !== 'follow'), 'joining never issues Follow');
}
// Pending returns must not fall through into surplus sector deployment.
for (const unavailable of ['downed', 'dead', 'jailed']) {
  const f = fixture(); f.command({ action: 'reserveTarget', value: 0 });
  f.h[unavailable] = true;
  const e = f.add('home', { deployment: { group: 'home', savedGroup: 'hero', everAssigned: true } });
  f.sync(0);
  assert.equal(e.deployment.transfer, undefined, `${unavailable} hero's returnee waits at HQ`);
  assert.equal(e.deployment.savedGroup, 'hero');
  delete f.h[unavailable]; f.sync(20);
  assert.equal(e.deployment.transfer?.to, 'hero', 'return resumes when hero is available');
}
{
  const f = fixture(); f.command({ action: 'reserveTarget', value: 0 });
  const to = f.sectors[2], e = f.add('home', { deployment: { group: 'home', savedGroup: to, everAssigned: true } });
  f.block(true); f.sync(0);
  assert.equal(e.deployment.savedGroup, to);
  assert.equal(e.deployment.automatic?.to, to, 'blocked return retains its original destination');
  f.block(false); f.sync(20);
  assert.equal(e.deployment.transfer?.to, to);
}
console.log('Deployment automation: configured reserves/pins, sequential filling, combat queue, health/jobs, physical returns, overflow, blockage/death and shared bot rules passed');
{
  const f = fixture(); f.command({ action: 'reserveTarget', value: 0 });
  for (const sector of f.sectors) f.command({ action: 'staffing', sector, value: 0 });
  const crew = [f.add(), f.add(), f.add()]; f.sync(0);
  assert.ok(crew.every(e => !e.deployment.transfer), 'zero goals keep surplus at HQ');
  f.command({ action: 'staffing', sector: f.sectors[1], value: 1 }); f.sync(20);
  assert.equal(crew.filter(e => e.deployment.transfer?.to === f.sectors[1]).length, 1, 'staff only requested vacancy');
  f.command({ action: 'staffing', sector: f.sectors[1], value: 0 }); f.sync(40);
  assert.equal(crew.filter(e => e.deployment.transfer).length, 1, 'lower goals do not recall field/incoming crew');
  f.command({ action: 'staffing', sector: f.sectors[1], value: -1 });
  assert.equal(f.state.deployment.clans.p.sectors[f.sectors[1]].desired, 0, 'invalid goals rejected');
}
