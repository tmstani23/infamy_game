// Autonomous indoor duties and explicit overrides, using the real simulation only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { unitStatus } from '../src/selection_panel.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
function setup(owner = 'player', kind = 'teahouse') {
  const units = data('data/units.json');
  units.rules.houseGuards.count = 0; units.rules.houseGuards.hideoutCount = 0;
  const g = createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units });
  g.clans.addClan('player'); g.clans.addClan('rival');
  const b = Object.values(g.state.businesses).find(b => b.kind === kind);
  g.clans.setOwner(b.id, owner);
  const room = g.rooms.find(r => r.name === b.room), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', b.ring[0], b.ring[1], { owner });
  const crew = g.spawn('thug', 'thug', b.ring[0] + .5, b.ring[1], { owner, order: { kind: 'follow', target: hero, slot: 0 } });
  const order = (kind, extra = {}) => g.step([{ id: hero, type: 'order', units: [crew], kind, ...extra }]);
  order('enter', { business: b.id });
  for (let i = 0; i < 600 && S[crew].place !== room.name; i++) g.step();
  assert.equal(S[crew].place, room.name);
  return { g, S, b, room, hero, crew, u: S[crew], h: S[hero], owner, order };
}
function run(g, seconds, until = () => false) {
  for (let i = 0; i < seconds * 20; i++) { g.step(); if (until()) return true; }
  return false;
}
function leave({ g, h, room, hero }, units = []) {
  Object.assign(h, { x: room.exit.x, z: room.exit.z });
  g.step([{ id: hero, type: 'use', units }]);
  assert.equal(h.place, 'street');
}
for (const owner of ['player', 'rival']) {
  const t = setup(owner), { g, u, h, b, hero, room, order } = t;
  assert.ok(u.order.garrison, 'enter orders establish a default indoor garrison');
  const start = { x: u.x, z: u.z }, goals = new Set();
  let moved = false;
  run(g, 45, () => {
    goals.add(`${u.order.x},${u.order.z}`);
    moved ||= Math.hypot(u.x - start.x, u.z - start.z) > 1;
    assert.equal(u.place, room.name, 'patrol remains in its own building');
    return false;
  });
  assert.ok(moved && goals.size >= 3, `${owner} crew walks a multi-stop guard patrol`);
  assert.equal(unitStatus(u, g.state), 'Patrolling');
  // Returning does not silently recruit the garrison into the hero's escort.
  Object.assign(h, { x: b.ring[0], z: b.ring[1] });
  g.step([{ id: hero, type: 'use', units: [] }]);
  assert.equal(h.place, room.name); assert.ok(u.patrol, 'hero entering alone keeps patrol active');
  const waiting = { x: u.x, z: u.z };
  run(g, 10);
  assert.ok(Math.hypot(u.x - waiting.x, u.z - waiting.z) > .1, 'unselected garrison keeps patrolling with leader present');
  assert.equal(u.order.kind, 'station'); assert.ok(u.order.patrol);
  leave(t); run(g, 15);
  assert.ok(u.patrol && u.order.patrol, 'patrol continues when leader leaves again');
  order('stop'); const stopped = { x: u.x, z: u.z };
  run(g, 15);
  assert.equal(u.order.kind, 'stop'); assert.equal(u.patrol, undefined);
  assert.ok(Math.hypot(u.x - stopped.x, u.z - stopped.z) < .05, 'explicit Stop remains passive while hero is absent');
  Object.assign(h, { place: room.name, x: room.spawn.x, z: room.spawn.z });
  order('station', { x: u.x, z: u.z }); leave(t); run(g, 15);
  assert.ok(u.order.garrison && u.patrol, 'leaving manual crew alone restores patrol without re-entering the building');
  const current = u.order; order('follow');
  assert.equal(u.order, current, 'outside follow commands never replace indoor duties');
  const streetFoe = g.spawn('thug', 'thug', h.x + 1, h.z, { owner: owner === 'player' ? 'rival' : 'player', order: { kind: 'stop' } });
  order('attack', { target: streetFoe });
  assert.equal(u.order, current, 'outside attack orders cannot pull an indoor crew member out');
  run(g, 20); assert.equal(u.place, room.name, 'follow cannot recall crew through a door');
  order('move', { x: h.x, z: h.z });
  assert.ok(run(g, 60, () => u.place === 'street'), 'explicit street movement brings selected crew out');
  assert.equal(u.order.kind, 'move');
}
{
  const t = setup(), { g, S, u, h, b, hero, crew, room } = t;
  Object.assign(h, { x: b.ring[0], z: b.ring[1] });
  g.step([{ id: hero, type: 'use', units: [] }]);
  const foe = g.spawn('thug', 'thug', u.x + .5, u.z, { owner: 'rival', place: room.name, hp: 1e6, maxHp: 1e6, order: { kind: 'stop' } });
  g.step([{ id: hero, type: 'attack', target: foe, assist: true, units: [crew] }]);
  assert.equal(u.order.assist, hero, 'selected normal attack takes control of a patrolling garrison');
  assert.equal(u.patrol, undefined);
  delete S[foe];
  g.step([{ id: hero, type: 'stopattack', units: [crew] }]);
  assert.equal(u.order.garrison, undefined, 'normal control remains after the selected attack ends');
  leave(t); run(g, 15);
  assert.ok(u.order.garrison && u.patrol, 'leaving the manually commanded crew inside restores patrol');
}
{
  const t = setup(), { g, u, h, hero, room, order, crew } = t;
  Object.assign(h, { place: room.name, x: room.exit.x, z: room.exit.z });
  order('follow'); leave(t, []);
  run(g, 25);
  assert.equal(u.place, room.name, 'followers left unselected at the hero exit stay inside');
  assert.ok(u.order.garrison && u.order.patrol, 'left-behind followers adopt indoor duties');
  // Their autonomous combat uses the same visibility/hostility rules as guards.
  const foe = g.spawn('thug', 'thug', u.x + .5, u.z, { owner: 'rival', place: room.name, order: { kind: 'stop' }, hp: 1e6, maxHp: 1e6 });
  assert.ok(run(g, 10, () => g.state.hits.some(hit => hit.a === crew && hit.t === foe)), 'garrison attacks an intruder without waiting to be hit');
  delete g.state.entities[foe];
  const old = { x: u.x, z: u.z };
  assert.ok(run(g, 35, () => Math.hypot(u.x - old.x, u.z - old.z) > 1 && u.anim === 'walk'), 'patrol resumes after combat');
  assert.equal(u.place, room.name);
  // Explicit indoor movement also remains in force after the leader leaves.
  Object.assign(h, { place: room.name, x: room.spawn.x, z: room.spawn.z });
  order('move', { x: room.spawn.x, z: room.spawn.z }); leave(t);
  run(g, 25);
  assert.ok(u.order.garrison && u.patrol, 'after an indoor move finishes, left-behind crew resume patrol');
}
{
  const t = setup(), { g, u, h, hero, crew, room, order } = t;
  Object.assign(h, { place: room.name, x: room.spawn.x, z: room.spawn.z });
  leave(t, [crew]);
  assert.equal(u.place, room.name, 'selection alone never pulls patrolling crew through the exit');
  Object.assign(h, { place: room.name, x: room.spawn.x, z: room.spawn.z });
  order('follow');
  assert.ok(u.order.exitWithHero, 'Follow issued indoors authorizes accompanying the hero');
  leave(t, [crew]);
  assert.equal(u.place, 'street', 'selected indoor followers come outside with the hero');
  assert.equal(u.order.kind, 'follow'); assert.equal(u.order.target, hero);
  assert.equal(u.patrol, undefined);
  run(g, 3); assert.equal(u.place, 'street');
}
{
  const t = setup(), { g, u, order } = t;
  u.hp = 50;
  order('heal');
  run(g, 20);
  assert.equal(u.place, t.room.name, 'clinic cannot pull indoor crew outside');
  assert.ok(u.order.garrison && u.patrol);
}
for (const kind of ['shop', 'warehouse', 'gambling_den', 'tenements', 'pawnshop', 'bathhouse', 'sake_brewery', 'manor', 'customs_house']) {
  const { g, u, room } = setup('player', kind), start = { x: u.x, z: u.z };
  assert.ok(run(g, 35, () => Math.hypot(u.x - start.x, u.z - start.z) > 1), kind + ' crew patrols on the live map');
  assert.equal(u.place, room.name);
}
console.log('indoor crew: patrols, visits, manual control, resumption, outside Follow blocked, selected indoor Follow exits and defense ok');
