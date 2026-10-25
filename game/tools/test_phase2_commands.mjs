import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { tabTarget } from '../src/crew_input.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
function fixture() {
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'),
    cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'),
    parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json') });
  g.clans.addClan('player'); g.clans.addClan('rival');
  const hero = g.spawn('hero', 'ronin', 0, 0, { owner: 'player', holdFire: true });
  const a = g.spawn('thug', 'thug', 1, 0, { owner: 'player', holdFire: true, order: { kind: 'follow', target: hero } });
  const b = g.spawn('thug', 'thug', 2, 0, { owner: 'player', holdFire: true, order: { kind: 'follow', target: hero } });
  return { g, S: g.state.entities, hero, a, b };
}

{
  const { g, S, hero, a } = fixture();
  S[hero].dead = true; S[hero].diedAt = g.state.tick;
  g.step([{ id: hero, type: 'order', units: [a], kind: 'move', x: 4, z: 0 }]);
  assert.equal(S[a].order.kind, 'move', 'crew remains commandable while hero is knocked out');
  const foe = g.spawn('hero', 'ronin', 5, 0, { owner: 'rival', holdFire: true, hp: 10000, maxHp: 10000 });
  const officer = g.spawn('junsa', 'police', 4, 0, { owner: 'police', cop: true });
  assert.equal(tabTarget(g.state, hero), foe, 'Tab skips police even while the hero is knocked out');
  g.step([{ id: hero, type: 'order', units: [a], kind: 'attack', target: foe }]);
  assert.equal(S[a].order.target, foe);
  S[foe].x = 30; S[foe].z = 30;
  g.step();
  assert.equal(S[a].order.target, foe, 'explicit pursuit persists when the target leaves sight');
  g.step([{ id: hero, type: 'order', units: [a], kind: 'stop' }]);
  assert.equal(S[a].order.kind, 'stop', 'recall ends pursuit');
}

{
  const { g, S, hero, a, b } = fixture();
  const body = g.spawn('thug', 'thug', 0.4, 0, { owner: 'rival' });
  Object.assign(S[body], { dead: true, diedAt: g.state.tick, loot: 50 });
  g.step([{ id: hero, type: 'loot', target: body, units: [a, b], preferHeroInRange: true }]);
  assert.equal(S[body].loot, undefined, 'hero in reach loots');
  assert.equal(S[a].order.kind, 'follow', 'crew keeps following');
}

{
  const { g, S, hero, a, b } = fixture();
  S[hero].x = -7; S[hero].dead = true; S[hero].diedAt = g.state.tick;
  const body = g.spawn('thug', 'thug', 1.2, 0, { owner: 'rival' });
  Object.assign(S[body], { dead: true, diedAt: g.state.tick, loot: 50 });
  g.step([{ id: hero, type: 'loot', target: body, units: [a, b], preferHeroInRange: true }]);
  assert.equal(S[body].loot, undefined, 'nearest selected crew loots when hero is unavailable');
  assert.equal(S[a].order.kind, 'follow', 'looter resumes following afterward');
  assert.equal(S[b].order.kind, 'follow', 'the following group does not break formation');
}

{
  const { g, S, hero, a, b } = fixture();
  S[hero].x = -7;
  S[a].order = { kind: 'station', x: 1, z: 0 };
  S[b].order = { kind: 'station', x: 2, z: 0 };
  const body = g.spawn('thug', 'thug', 4, 0, { owner: 'rival' });
  Object.assign(S[body], { dead: true, diedAt: g.state.tick, loot: 50 });
  g.step([{ id: hero, type: 'loot', target: body, units: [a, b], preferHeroInRange: true }]);
  assert.equal(S[b].order.kind, 'loot', 'nearest selected crew takes the task');
  assert.equal(S[a].order.target, b, 'other selected crew escorts the looter');
  for (let i = 0; i < 100 && S[body]?.loot; i++) g.step();
  g.step();
  assert.equal(S[a].order.kind, 'station', 'escort resumes its previous station');
  assert.equal(S[b].order.kind, 'station', 'looter resumes its previous station');
}

{
  const { g, S, hero, a, b } = fixture();
  const foe = g.spawn('thug', 'thug', 0.7, 0, { owner: 'rival', holdFire: true });
  S[foe].downed = true;
  g.step([{ id: hero, type: 'execute', target: foe, units: [a, b], preferHeroInRange: true }]);
  assert.equal(S[hero].execute?.target, foe, 'nearby hero executes');
  assert.equal(S[a].execute, undefined);
  S[hero].x = -7; delete S[hero].execute;
  g.step([{ id: hero, type: 'execute', target: foe, units: [a, b], preferHeroInRange: true }]);
  assert.equal(S[a].execute?.target, foe, 'nearest selected crew executes when hero is far away');
  assert.equal(S[b].execute, undefined, 'only one crew member executes');
}

{
  const { g, S, hero, a, b } = fixture();
  S[hero].place = Object.values(g.state.businesses).find(b => b.room)?.room;
  const foe = g.spawn('thug', 'thug', 3, 0, { owner: 'rival', holdFire: true, hp: 10000, maxHp: 10000 });
  g.step([{ id: hero, type: 'order', place: 'street', units: [a], kind: 'attack', target: foe }]);
  assert.equal(S[a].order.target, foe, 'indoor hero can command an exterior crew attack');
  g.step([{ id: hero, type: 'order', place: 'street', units: [a], kind: 'move', x: 5, z: 0 }]);
  assert.equal(S[a].order.place, 'street', 'indoor hero can redirect exterior crew');
  const body = g.spawn('thug', 'thug', S[b].x, S[b].z, { owner: 'rival' });
  Object.assign(S[body], { dead: true, diedAt: g.state.tick, loot: 50 });
  g.step([{ id: hero, type: 'loot', target: body, units: [b], preferHeroInRange: true }]);
  assert.equal(S[body].loot, undefined, 'exterior crew can loot while hero is inside');
  S[foe].downed = true;
  g.step([{ id: hero, type: 'execute', target: foe, units: [b], preferHeroInRange: true }]);
  assert.equal(S[b].execute?.target, foe, 'exterior crew can execute while hero is inside');
}

{
  const { g, S, hero, a } = fixture();
  const tea = Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
  const door = g.doors.find(d => d.place === tea.room && d.to);
  Object.assign(S[hero], { place: tea.room, x: door.to.x, z: door.to.z });
  Object.assign(S[a], { x: door.x, z: door.z, order: { kind: 'stop' } });
  g.step([{ id: hero, type: 'order', place: tea.room, units: [a], kind: 'follow' }]);
  assert.equal(S[a].place, tea.room, 'explicit Follow brings outdoor crew into the hero building');
  assert.equal(S[a].order.target, hero);
  assert.equal(S[a].order.exitWithHero, true);
}

console.log('KO orders, persistent pursuit, loot priority, execution and indoor Follow routing passed');
