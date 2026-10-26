import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { createDeployment } from '../src/sim/deployment.js';
import { createNav } from '../src/sim/nav.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const g = createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), police: data('data/police.json'), settings: { ...data('data/settings.json'), dayNight: { auto: false } } });
const { heroId } = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', bots: data('data/bots.json') });
const h = g.state.entities[heroId], u = g.clans.crewOf('player')[0];
for (const e of Object.values(g.state.entities)) { e.holdFire = true; if (e.type !== 'hero') e.order = { kind: 'stop' }; }
const sectors = g.state.deployment.sectors;
const sector = sectors.slice().sort((a, b) => Math.hypot(a.anchor.x - u.x, a.anchor.z - u.z) - Math.hypot(b.anchor.x - u.x, b.anchor.z - u.z))[0];
const send = (ids, to) => g.step([{ id: heroId, type: 'deployment', action: 'transfer', units: ids, to }]);
const finish = (e, max = 1400) => {
  for (let i = 0; i < max && e.deployment.transfer; i++) {
    g.step();
    assert.ok(!g.state.hits.some(hit => hit.a === e.id), 'transferring crew never retaliate');
  }
  assert.ok(!e.deployment.transfer, `transfer did not finish: ${JSON.stringify({ x: e.x, z: e.z, place: e.place, transfer: e.deployment.transfer })}`);
};

assert.equal(g.state.deployment.restrictionsEnabled, true);
h.hitAt = g.state.tick;
send([u.id], sector.id);
assert.equal(u.deployment.transfer, undefined);
assert.match(g.state.clans.player.notice.text, /Hero in combat/);
h.hitAt = g.state.tick - 120;
const before = [u.x, u.z];
send([u.id], sector.id);
assert.equal(u.deployment.transfer.to, sector.id);
assert.equal(g.deployment.counts('player')[sector.id], 1, 'destination slot reserved before arrival');
assert.equal(g.deployment.counts('player').hero, 0);
assert.ok(Math.hypot(u.x - before[0], u.z - before[1]) < 1, 'transfer begins with a normal movement step, not a teleport');
// Enemy lands a real attack on the traveler; the hero also enters combat after authorization.
const attacker = g.state.entities[g.spawn('thug', 'thug', u.x + .7, u.z, { owner: 'kuroda',
  holdFire: true, order: { kind: 'stop' }, deployment: { group: 'hero' } })];
attacker.swing = { start: g.state.tick, strike: g.state.tick, len: 8, target: u.id };
h.foughtAt = g.state.tick;
const hp = u.hp;
g.step();
assert.ok(u.hp < hp, 'transfers remain vulnerable to enemy attacks');
attacker.dead = true; attacker.diedAt = g.state.tick;
finish(u);
assert.equal(u.deployment.group, sector.id);
assert.equal(g.deployment.sectorAt(u.x, u.z), sector.id);
assert.notEqual(u.order.kind, 'follow');
assert.ok(u.order.arrived);

const other = sectors.find(s => s.id !== sector.id);
u.deployment.duty = { manual: true, status: 'Manual' }; // isolate manual containment from saved patrol duty
const previous = structuredClone(u.order);
g.step([{ id: heroId, type: 'order', place: 'street', kind: 'move', units: [u.id], ...other.anchor }]);
assert.deepEqual(u.order, previous, 'ordinary move cannot cross sector boundary');
g.step([{ id: heroId, type: 'order', kind: 'follow', units: [u.id] }]);
assert.notEqual(u.order.kind, 'follow', 'Follow cannot bypass hero-group transfer');
assert.match(g.state.clans.player.notice.text, /Use Deployment/);
const local = g.deployment.navFor(u).nearestFree(u.x + 2, u.z);
g.step([{ id: heroId, type: 'order', place: 'street', kind: 'move', units: [u.id], x: local[0], z: local[1] }]);
for (let i = 0; i < 35; i++) {
  g.step(); assert.equal(g.deployment.sectorAt(u.x, u.z), sector.id, 'local path smoothing never leaves the sector');
}

// Incoming transfers count against the six slots even before reaching the hero.
for (let i = 0; i < 5; i++) g.spawn('thug', 'thug', h.x + i * .5, h.z + 1, { owner: 'player', holdFire: true, deployment: { group: 'hero' }, order: { kind: 'stop' } });
const spare = g.state.entities[g.spawn('thug', 'thug', other.anchor.x, other.anchor.z,
  { owner: 'player', holdFire: true, deployment: { group: other.id } })];
h.hitAt = h.foughtAt = g.state.tick - 120;
send([u.id], 'hero');
assert.equal(g.deployment.counts('player').hero, 6);
assert.equal(g.deployment.canTransfer(heroId, [spare.id], 'hero').ok, false, 'simultaneous arrival cannot overbook the hero group');
finish(u);
assert.equal(u.deployment.group, 'hero');
assert.notEqual(u.order.kind, 'follow', 'arrival never creates automatic Follow');

// Home transfers use the real street entrance; remote management works during KO.
h.dead = true; h.diedAt = g.state.tick;
send([spare.id], 'home');
assert.ok(spare.deployment.transfer);
finish(spare);
const home = Object.values(g.state.businesses).find(b => b.hideout === 'player');
assert.equal(spare.place, home.room, 'HQ reserve arrives inside the home through its door');
assert.equal(spare.deployment.group, 'home');
assert.notEqual(spare.order.kind, 'follow');

// Remember assignment intention across a clinic trip; return to reserve without teleporting.
send([u.id], sector.id); finish(u);
u.downed = true; u.downedAt = g.state.tick;
assert.ok(g.clans.carryOff(u)); delete g.state.entities[u.id];
assert.equal(g.state.clans.player.clinic[0].deployment.savedGroup, sector.id);
const clinic = Object.values(g.state.businesses).find(b => b.kind === 'clinic');
Object.assign(h, { dead: false, hp: h.maxHp, place: 'street', x: clinic.ring[0], z: clinic.ring[1] });
g.state.clans.player.ryo = 3000;
const old = new Set(Object.keys(g.state.entities));
g.step([{ id: heroId, type: 'clinic', action: 'revive', patient: 0 }]);
const revived = Object.values(g.state.entities).find(e => e.owner === 'player' && !old.has(e.id));
assert.ok(revived);
assert.equal(revived.deployment.group, 'home');
assert.equal(revived.deployment.savedGroup, sector.id);
assert.equal(revived.order, undefined);
g.police.jail(revived); delete g.state.entities[revived.id];
assert.equal(g.state.clans.player.jail[0].deployment.savedGroup, sector.id);
const policeHQ = Object.values(g.state.businesses).find(b => b.kind === 'police_hq');
Object.assign(h, { x: policeHQ.ring[0], z: policeHQ.ring[1] });
const beforeBail = new Set(Object.keys(g.state.entities));
g.step([{ id: heroId, type: 'police', action: 'bail', prisoner: 0 }]);
const bailed = Object.values(g.state.entities).find(e => e.owner === 'player' && !beforeBail.has(e.id));
assert.ok(bailed);
assert.equal(bailed.deployment.savedGroup, sector.id);
assert.equal(bailed.deployment.group, 'home');
assert.notEqual(bailed.order?.kind, 'follow', 'bail never restarts automatic Follow in a normal match');

// Exercise Kuroda's HQ and the Shinobi village/bridge route as real players.
for (const faction of ['kuroda', 'shinobi']) {
  const game = createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), settings: { ...data('data/settings.json'), dayNight: { auto: false } } });
  const { heroId } = setupMatch(game, { clan: faction, difficulty: 'easy', bots: data('data/bots.json') });
  const member = game.clans.crewOf('player')[0];
  for (const e of Object.values(game.state.entities)) { e.holdFire = true; if (e.type !== 'hero') e.order = { kind: 'stop' }; }
  const target = game.state.deployment.sectors.slice().sort((a, b) => Math.hypot(a.anchor.x - member.x, a.anchor.z - member.z) - Math.hypot(b.anchor.x - member.x, b.anchor.z - member.z))[0].id;
  for (const to of [target, 'home', 'hero']) {
    game.step([{ id: heroId, type: 'deployment', action: 'transfer', units: [member.id], to }]);
    assert.ok(member.deployment.transfer, `${faction}: authorized transfer to ${to}`);
    for (let i = 0; i < 2200 && member.deployment.transfer; i++) game.step();
    assert.ok(!member.deployment.transfer, `${faction}: route to ${to} finished: ${JSON.stringify(member.deployment.transfer)}`);
    assert.equal(member.deployment.group, to);
    assert.notEqual(member.order.kind, 'follow');
  }
}

// Dynamic route failure retries safely while retaining its destination reservation.
{
  const district = { bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, buildings: [] };
  const base = createNav([], district.bounds); let blocked = false;
  const nav = { ...base, findPath: (...args) => blocked ? null : base.findPath(...args) };
  const e = { id: '2', owner: 'p', type: 'thug', hp: 200, maxHp: 200, place: 'street', x: -7, z: -7, deployment: { group: 'hero' } };
  const state = { tick: 0, clans: { p: { id: 'p', kind: 'yakuza' } }, entities: {
    1: { id: '1', owner: 'p', type: 'hero', x: -8, z: -8, place: 'street' }, 2: e,
  }, businesses: {} };
  const d = createDeployment({ state, district, nav, navOf: () => nav, moveTo: (e, unit, x, z) => {
    if (blocked) return false;
    const dist = Math.hypot(x - e.x, z - e.z), k = Math.min(.25, dist) / dist;
    e.x += (x - e.x) * k; e.z += (z - e.z) * k; return true;
  } });
  d.enable(); const to = state.deployment.sectors[1].id;
  d.command(state.entities[1], { action: 'transfer', units: ['2'], to });
  d.travelStep(e, {}); blocked = true; state.tick++; d.travelStep(e, {});
  assert.equal(e.deployment.transfer.status, 'blocked');
  assert.equal(d.counts('p')[to], 1);
  blocked = false;
  for (let i = 0; i < 200 && e.deployment.transfer; i++) { state.tick++; d.travelStep(e, {}); }
  assert.equal(e.deployment.group, to);
  assert.equal(e.deployment.transfer, undefined, 'dynamic blockage clears without teleporting or losing the assignment');
}
console.log('Deployment transfers: quiet period, real travel/passivity, slot reservations, sector-local paths/orders, KO control, HQ entry, clinic intention and dynamic retry passed');
