import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHQCamping } from '../src/sim/hq_camping.js';
import { createGame } from '../src/sim/game.js';
import { policeMapColor } from '../src/minimap.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
function timer() {
  const state = { tick: 0, clans: { home: {}, visitor: {} },
    businesses: { hq: { id: 'hq', hideout: 'home', owner: 'home', ring: [10, 10] } },
    entities: { hero: { type: 'hero', owner: 'visitor', place: 'street', x: 10, z: 10 },
      crew: { type: 'thug', owner: 'visitor', place: 'street', x: 10, z: 10 } } };
  let heat = 0;
  const system = createHQCamping({ state, addHeat: (_, n) => { heat += n; } });
  const run = seconds => { for (let i = 0; i < Math.round(seconds * 20); i++) { state.tick++; system.tick(); } };
  const inside = yes => { for (const e of Object.values(state.entities)) e.x = yes ? 10 : 100; };
  return { state, run, inside, heat: () => heat, visit: () => state.hqCamping.visits[0] };
}
{
  const t = timer();
  t.run(19.95); assert.equal(t.visit(), undefined);
  t.run(.05); assert.equal(t.visit().seconds, 20); assert.equal(t.visit().active, false);
  assert.deepEqual(t.state.hqCamping.zones[0], { business: 'hq', owner: 'home', x: 10, z: 10, radius: 12 });
  t.run(10); assert.equal(t.visit().active, true); assert.equal(t.heat(), 0);
  t.run(5); assert.equal(t.heat(), 12, 'hero plus crew incur one fixed camping charge');
  t.inside(false); const h = t.heat(); t.run(10); assert.equal(t.heat(), h);
  t.inside(true); t.run(.05); assert.equal(t.visit().active, true, 're-entry immediately resumes the latch');
  t.run(5); assert.equal(t.heat(), h + 12);
}
{
  const t = timer(); t.run(55);
  for (let i = 0; i < 3; i++) { t.inside(false); t.run(.1); t.inside(true); t.run(.1); }
  assert.equal(t.visit().remaining, 30, 'every re-entry restarts the full clear period');
  const h = t.heat(); t.inside(false); t.run(59); assert.equal(t.heat(), h);
  assert.equal(t.visit(), undefined, 'a continuous absence clears the alarm');
  t.inside(true); t.run(1); assert.equal(t.visit(), undefined, 'full decay restores normal grace');
}
{
  const t = timer(); t.run(70); assert.equal(t.visit().active, true, 'remaining inside never clears the penalty');
  t.inside(false); t.run(.05); assert.ok(t.visit().active, 'stepping out after the original minute does not clear the alarm');
  assert.equal(t.visit().remaining, 29.95);
  t.run(29.85); assert.ok(t.visit().active);
  t.inside(true); t.run(.05); assert.equal(t.visit().remaining, 30, 'last-moment re-entry resets decay');
  t.inside(false); t.run(29.95); assert.ok(t.visit().active);
  t.run(.05); assert.equal(t.visit(), undefined, 'all 30 consecutive seconds are required');
  const split = timer(); split.run(30);
  split.state.entities.hero.x = 100; split.run(2);
  split.state.entities.hero.x = 10; split.run(2);
  assert.equal(split.visit().remaining, 30, 'one crew member remaining inside prevents any decay');
  split.state.entities.hero.place = 'inn'; split.state.entities.crew.place = 'shop';
  const heat = split.heat(); split.run(5); assert.equal(split.heat(), heat, 'all indoor presence is excluded');
  const friendly = timer(); for (const e of Object.values(friendly.state.entities)) e.owner = 'home';
  friendly.run(65); assert.equal(friendly.heat(), 0); assert.equal(friendly.visit(), undefined);
  const rolling = timer(); rolling.run(15); rolling.inside(false); rolling.run(10); rolling.inside(true); rolling.run(15);
  assert.equal(rolling.visit().active, true, 'separate visits accumulate inside the rolling minute');
}
console.log('camping: warning, street-only clan presence, paused charges and 30 continuous seconds clear with re-entry reset ok');

{
  const state = { tick: 100, entities: { hero: { owner: 'player' }, rival: { owner: 'kuroda' } } };
  const officer = { cop: true, clan: 'player' };
  assert.equal(policeMapColor(officer, 'player', state), '#72aaff', 'assignment alone is not hostility');
  officer.angry = { kuroda: 200 };
  assert.equal(policeMapColor(officer, 'player', state), '#72aaff', 'police fighting someone else stay blue');
  officer.angry.player = 200;
  assert.equal(policeMapColor(officer, 'player', state), '#ff4632');
  state.tick = 201;
  assert.equal(policeMapColor(officer, 'player', state), '#72aaff', 'calm officers return to blue');
  officer.swing = { target: 'hero' };
  assert.equal(policeMapColor(officer, 'player', state), '#ff4632', 'an attack still winding up is red');
}

const district = data('data/port_town.json'), settings = data('data/settings.json');
function world({ night = false, camping = false } = {}) {
  const game = createGame({ district: { ...district, banditCamps: [] }, catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: { ...settings, dayNight: { auto: false, startAtNight: night }, townsfolk: { total: 0 },
      bandits: { ...settings.bandits, maxOut: 0, perNight: 0 }, hqCamping: { ...settings.hqCamping, enabled: camping } } });
  game.clans.addClan('player'); game.clans.addClan('kuroda');
  return game;
}
const run = (g, seconds) => { for (let i = 0; i < Math.round(seconds * 20); i++) g.step(); };
const routine = g => Object.values(g.state.entities).filter(e => e.routine && !e.dead);
{
  const g = world({ night: true }); run(g, 15); assert.equal(routine(g).length, 0);
  g.step([{ type: 'time', night: false }]); run(g, 20);
  const patrol = routine(g); assert.equal(patrol.length, 8);
  const stations = Object.groupBy(patrol, o => o.station);
  assert.deepEqual(Object.fromEntries(Object.entries(stations).map(([id, list]) => [g.state.businesses[id].kind + ':' + id, list.length])),
    { 'police_hq:b3': 4, 'police_box:b1': 2, 'police_box:b33': 2 });
  assert.ok(patrol.every(o => !o.clan && !o.angry), 'quiet routine police are neutral');
  const positions = patrol.map(o => [o.x, o.z]); run(g, 10);
  assert.ok(patrol.some((o, i) => Math.hypot(o.x - positions[i][0], o.z - positions[i][1]) > 1), 'routine patrols move');
  g.step([{ type: 'time', night: true }]);
  assert.ok(routine(g).every(o => g.police.mind[o.id].leaving));
  for (const o of routine(g)) {
    const home = district.buildings[Number(o.station.slice(1))];
    const m = g.police.mind[o.id];
    assert.ok(m.deadline && home.door, 'return route belongs to its issuing station');
  }
  // Dawn before every returning officer has arrived cannot create a second shift.
  g.step([{ type: 'time', night: false }]); run(g, 2); assert.equal(routine(g).length, 8);
  g.step([{ type: 'time', night: true }]); run(g, 120); assert.equal(routine(g).length, 0);
}
console.log('day police: eight officers from all three stations, moving patrols, night return and dawn deduplication ok');
{
  const g = world(); run(g, 20);
  const officer = routine(g)[0], station = officer.station;
  officer.dead = true; g.police.knockedOut(officer);
  run(g, 59); assert.equal(routine(g).length, 7, 'knocked-out patrol officers are not replaced immediately');
  run(g, 2); assert.equal(routine(g).length, 8);
  assert.equal(routine(g).filter(o => o.station === station).length, 4, 'replacement belongs to its original station');
}
{
  const g = world(); run(g, 20);
  const cop = routine(g)[0], point = g.nav.nearestFree(40, 8);
  Object.assign(cop, { x: point[0], z: point[1] });
  const h = g.spawn('hero', 'ronin', point[0] + 1, point[1], { owner: 'player', hp: 1e6, maxHp: 1e6 });
  const rival = g.spawn('thug', 'thug', point[0] + 2, point[1], { owner: 'kuroda', hp: 1e6, maxHp: 1e6, order: { kind: 'stop' } });
  run(g, .1); // refresh vision for the newly spawned hero before issuing attacks
  g.step([{ id: h, type: 'attack', target: rival }]); run(g, 1);
  assert.ok(!cop.angry, 'ordinary fighting at Quiet does not provoke routine officers');
  const civilian = g.spawn('civilian', 'merchant', point[0] + 1.5, point[1], { hp: 1e6, maxHp: 1e6 });
  Object.assign(cop, { x: point[0], z: point[1] });
  g.step([{ id: h, type: 'attack', target: civilian }]); run(g, 2);
  assert.ok(g.state.entities[civilian].hp < 1e6, 'the assault actually landed');
  assert.ok((cop.angry?.player || 0) > g.state.tick, 'witnessed civilian assault draws immediate police response');
  assert.equal(cop.clan, 'player');
  g.step([{ type: 'time', night: true }]);
  assert.equal(g.police.mind[cop.id].leaving, false, 'active incident continues after dusk');
  Object.assign(g.state.entities[h], { place: 'inn' });
  run(g, 120); assert.equal(routine(g).length, 0, 'routine officers return after the response ends');
}
{
  const g = world(); run(g, 20);
  const officer = routine(g)[0], [x, z] = g.nav.nearestFree(40, 8);
  const hero = g.spawn('hero', 'ronin', x + 1, z, { owner: 'player' });
  const body = g.spawn('civilian', 'merchant', x + 1.4, z, { hp: 0, downed: true, downedAt: g.state.tick });
  run(g, .1);
  Object.assign(officer, { x, z });
  g.step([{ id: hero, type: 'execute', target: body }]); run(g, 4);
  assert.ok(g.state.entities[body]?.dead, 'civilian execution completes');
  assert.ok((officer.angry?.player || 0) > g.state.tick, 'a witnessed civilian execution also draws a response');
}
{
  const g = world({ camping: true });
  const rival = Object.values(g.state.businesses).find(b => b.hideout === 'kuroda');
  const h = g.spawn('hero', 'ronin', ...rival.ring, { owner: 'player', hp: 1e6, maxHp: 1e6 });
  const charges = [];
  for (let i = 0; i < 40 * 20; i++) {
    g.step();
    charges.push(...g.state.heatGains.filter(e => e.reason === 'Camping a rival HQ'));
  }
  assert.equal(charges.length, 2, 'five-second camping penalty interval is unchanged');
  assert.ok(charges.every(e => e.amount === 12), 'camping heat is exactly 12 even for the top-infamy clan');
  assert.equal(g.state.clans.player.infamy, 24, 'each camping tick also adds exactly 12 lifetime infamy');
  const visit = g.state.hqCamping.visits.find(v => v.clan === 'player' && v.business === rival.id);
  assert.deepEqual([visit.x, visit.z, visit.radius], [...rival.ring, 12]);
  g.state.clans.player.heat = 65; run(g, 20);
  assert.ok(Object.values(g.state.entities).some(e => e.cop && !e.routine && e.clan === 'player'), 'wanted reinforcements operate alongside routine patrols');
  g.step([{ type: 'time', night: true }]); run(g, 3);
  assert.ok(Object.values(g.state.entities).some(e => e.cop && !e.routine && e.clan === 'player'), 'heat-based police remain active at night');
  assert.ok(g.state.entities[h]);
}
console.log('civilian assault, dusk response completion, camping heat and nighttime reinforcements ok');

// Regular police require explicit orders; no-infamy business-wave officers
// remain valid automatic targets for retaliation, attack-move and stationed crew.
for (const wave of [false, true]) {
  const g = world({ night: true }), [x, z] = g.nav.nearestFree(40, 8);
  const h = g.spawn('hero', 'ronin', x, z, { owner: 'player', hp: 1e6, maxHp: 1e6 });
  const crew = ['follow', 'station', 'attackmove'].map((kind, i) =>
    g.spawn('thug', 'thug', x + .4, z + i * .2, { owner: 'player', hp: 1e6, maxHp: 1e6,
      order: kind === 'follow' ? { kind, target: h } : { kind, x: x + .4, z: z + i * .2 } }));
  const officer = g.spawn('junsa', 'police', x + 1, z, { owner: 'police', cop: true, clan: 'player',
    angry: { player: 1e9 }, hp: 1e6, maxHp: 1e6, ...(wave ? { wave: 'test', waveClan: 'player' } : {}) });
  run(g, 4);
  assert.ok(g.state.entities[h].hitBy || crew.some(id => g.state.entities[id].hitBy), 'officer actually attacked the squad');
  if (wave) {
    assert.ok(g.state.entities[officer].hp < 1e6, 'business-wave officers are attacked automatically');
    assert.equal(g.state.clans.player.infamy || 0, 0, 'wave hits add no infamy');
    continue;
  }
  assert.equal(g.state.entities[officer].hp, 1e6, 'no automatic retaliation against street police');
  g.step([{ id: h, type: 'attack', target: officer }]); run(g, 2);
  const afterHero = g.state.entities[officer].hp;
  assert.ok(afterHero < 1e6, 'explicit hero attack works');
  assert.ok(crew.every(id => g.state.entities[id].order.kind !== 'attack'), 'crew do not join without an explicit command');
  g.step([{ id: h, type: 'stopattack' }, { id: h, type: 'order', kind: 'attack', units: crew, target: officer }]);
  run(g, 2); assert.ok(g.state.entities[officer].hp < afterHero, 'explicit crew attack works');
}
console.log('police: street officers require explicit orders; business-wave auto-combat adds no infamy');
