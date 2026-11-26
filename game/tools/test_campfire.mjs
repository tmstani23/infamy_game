// World variety P1 (2026-11-25, sim/campfire.js): N makes camp on the island. The hero lights a fire and sits,
// his following crew walk to seats round it and sit, everyone seated heals fast; a hit, the hero walking off or N
// again ends it; refused in a war circle or right after a fight; the fire is a light for island sight.
// Built on the war_test_yakuza save, with the hero and crew taken well away from the war and the towns.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { loadSave } from '../src/sim/save.js';
import { build } from './make_dev_save.mjs';
import { createSnapshotEncoder } from '../src/sim_snapshot.js';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  frontier: { ...data('data/frontier.json'), railways: data('data/railways.json'), castleBlueprint: data('data/castle_default.json'), campaignZones: data('data/campaign_zones.json') } });
const RULES = options().units.rules.campfire;
assert.ok(RULES?.healPerSecond > 0, 'rules.campfire data');
const file = JSON.stringify(build('war_test_yakuza', { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 6, warTest: true }));

// a fresh game with the hero and three crew standing in the wild, the crew following him
function wild() {
  const g = createGame(options()), S = g.state; loadSave(g, JSON.parse(file));
  const hero = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === 'player');
  const crew = Object.values(S.entities).filter(e => e.owner === 'player' && e.type !== 'hero' && !e.warTroop && !e.worker && e.type !== 'settler' && !e.vehicle && e.type !== 'horse' && !e.dead && e.place).slice(0, 3);
  assert.equal(crew.length, 3, 'three crew to sit with him');
  const towns = Object.values(S.frontier.settlements).filter(s => Number.isFinite(s.x)), wars = Object.values(S.frontier.wars.list);
  const far = (x, z) => towns.every(s => Math.hypot(s.x - x, s.z - z) > 800) && wars.every(w => [w.camp, S.frontier.settlements[w.town]].every(p => !p || Math.hypot(p.x - x, p.z - z) > 1200));
  let spot = null;
  for (let k = 0; k < 400 && !spot; k++) { const x = 500 + (k * 977) % 13000, z = 500 + (k * 613) % 7000; if (!far(x, z)) continue; g.areas.update([{ x, z, place: 'world' }]); const p = g.areas.nav.nearestFree(x, z); if (p) spot = p; }
  assert.ok(spot, 'a spot in the wild');
  Object.assign(hero, { x: spot[0], z: spot[1], place: 'world', dir: 0 }); delete hero.mounted; delete hero.ride;
  crew.forEach((u, i) => { Object.assign(u, { x: spot[0] + 2 + i, z: spot[1] + 2, place: 'world', order: { kind: 'follow', target: hero.id } }); delete u.mounted; delete u.ride; delete u.hitAt; delete u.foughtAt; });
  delete hero.hitAt; delete hero.foughtAt;
  g.areas.update(Object.values(S.entities));
  g.step([]);
  return { g, S, hero, crew };
}
// Shift+N: break camp at once, or Preparing fire for castSeconds, then the fire catches
const camp = (g, hero) => { g.step([{ id: hero.id, type: 'campfire' }]); for (let i = 0; i < RULES.castSeconds * 20 + 2 && hero.campCast; i++) g.step([]); };
const fireOf = (S, hero) => Object.values(S.campfires || {}).find(f => f.hero === hero.id && !f.out);

// make camp: a fire ahead of him, he sits at once, the crew walk over and sit facing it
{ const { g, S, hero, crew } = wild();
  camp(g, hero);
  const f = fireOf(S, hero);
  assert.ok(f, 'a fire is lit');
  assert.ok(hero.sitting && hero.campfire === f.id, 'the hero sits');
  assert.equal(f.seats.length, 4, 'a seat each');
  for (let i = 0; i < 200 && !crew.every(u => u.sitting); i++) g.step([]);
  assert.ok(crew.every(u => u.sitting), 'the crew sit down');
  { const packet = JSON.stringify(createSnapshotEncoder(g, 'player').encode({}));   // the game draws from the worker's snapshot
    assert.ok(packet.includes('"s:campfires"') && packet.includes('"sitting":true'), 'the snapshot carries the fire and the sitters'); }
  for (const u of crew) assert.ok(Math.hypot(u.x - f.x, u.z - f.z) < RULES.seatRadius + 1.5, 'round the fire');
  assert.ok(g.campfires.lightsNear(f.x + 5, f.z, 18).length === 1, 'the fire is a light for island sight');
  // the heal: everyone seated gets healPerSecond of max health a second on top of passive recovery
  const u = crew[0]; u.hp = u.maxHp * 0.3; const h0 = u.hp, rate = g.stats.regeneration(u).current;
  assert.ok(rate >= u.maxHp * RULES.healPerSecond, 'the fire adds its heal to recovery');
  for (let i = 0; i < 100; i++) g.step([]);
  assert.ok(u.hp - h0 > u.maxHp * RULES.healPerSecond * 4.5, `healed fast (${Math.round(u.hp - h0)} in 5 s)`);
  // one of the crew sent off gets up and goes; the camp carries on
  g.step([{ id: hero.id, type: 'order', kind: 'move', units: [crew[2].id], place: 'world', x: crew[2].x + 10, z: crew[2].z }]);
  g.step([]);
  assert.ok(!crew[2].sitting && !crew[2].campfire, 'sent off: up and away');
  assert.ok(fireOf(S, hero) && crew[0].sitting, 'the others stay');
  // a hit breaks the camp: everyone up, the crew back to following him
  crew[0].hitAt = S.tick; g.step([]);
  assert.ok(!fireOf(S, hero), 'a hit breaks camp');
  assert.ok(!hero.sitting && !crew[0].sitting && !crew[1].sitting, 'everyone stands');
  assert.equal(crew[1].order?.kind, 'follow', 'the crew follow him again');
  assert.ok(Object.values(S.campfires).some(x => x.out), 'the fire burns down');
  for (let i = 0; i < RULES.emberSeconds * 20 + 5; i++) g.step([]);
  assert.ok(!Object.keys(S.campfires).length, 'and is gone'); }

// N again breaks camp; the hero walking off does too
{ const { g, S, hero } = wild();
  camp(g, hero); assert.ok(fireOf(S, hero)); camp(g, hero);
  assert.ok(!fireOf(S, hero) && !hero.sitting, 'N again breaks camp');
  camp(g, hero); assert.ok(fireOf(S, hero), 'and makes it again');
  assert.equal(Object.keys(S.campfires).length, 1, 'one camp per clan: the old fire is cleared before the new one');
  hero.x += 2; g.step([]);
  assert.ok(!fireOf(S, hero) && !hero.sitting, 'walking off breaks camp'); }

// Preparing fire: a short cast with a bar; moving, a hit or Shift+N again stops it and says so
{ const { g, S, hero } = wild();
  g.step([{ id: hero.id, type: 'campfire' }]);
  assert.ok(hero.campCast && !fireOf(S, hero), 'Preparing fire first, no fire yet');
  assert.ok(JSON.stringify(createSnapshotEncoder(g, 'player').encode({})).includes('"campCast"'), 'the snapshot carries the cast for the bar');
  for (let i = 0; i < RULES.castSeconds * 20 + 2 && hero.campCast; i++) g.step([]);
  assert.ok(fireOf(S, hero) && hero.sitting, 'then the fire catches');
  g.step([{ id: hero.id, type: 'campfire' }]);
  g.step([{ id: hero.id, type: 'campfire' }]); hero.x += 2; g.step([]);
  assert.ok(!hero.campCast && !fireOf(S, hero), 'moving stops the cast');
  assert.match(S.clans.player.notice?.text || '', /moved/);
  hero.x -= 2; g.step([{ id: hero.id, type: 'campfire' }]); hero.hitAt = S.tick; g.step([]);
  assert.ok(!hero.campCast && !fireOf(S, hero), 'a hit stops the cast');
  delete hero.hitAt; S.tick += RULES.calmSeconds * 20;
  g.step([{ id: hero.id, type: 'campfire' }]); assert.ok(hero.campCast); g.step([{ id: hero.id, type: 'campfire' }]);
  assert.ok(!hero.campCast, 'Shift+N again stops it');
  assert.equal(S.clans.player.notice?.camp, 'no', 'refusals are marked for the callout'); }

// right-click the fire after walking off: back to his seat, the fire keeps going, the crew sit again
{ const { g, S, hero, crew } = wild();
  camp(g, hero);
  for (let i = 0; i < 200 && !crew.every(u => u.sitting); i++) g.step([]);
  const f = fireOf(S, hero);
  { const [x, z] = g.areas.nav.nearestFree(hero.x + 6, hero.z); Object.assign(hero, { x, z }); } g.step([]);
  assert.ok(!fireOf(S, hero) && S.campfires[f.id]?.out, 'walked off: the fire burns down');
  for (let i = 0; i < 40; i++) g.step([]);
  g.step([{ id: hero.id, type: 'campfire', action: 'back', fire: f.id }]);
  for (let i = 0; i < 400 && hero.campBack; i++) g.step([]);
  assert.ok(fireOf(S, hero)?.id === f.id && hero.sitting && hero.campfire === f.id, 'back by the same fire, burning again');
  for (let i = 0; i < 200 && !crew.every(u => u.sitting); i++) g.step([]);
  assert.ok(crew.every(u => u.sitting && u.campfire === f.id), 'the crew sit down again'); }

// refused right after a fight, and inside a war circle
{ const { g, S, hero, crew } = wild();
  crew[1].hitAt = S.tick - 20; camp(g, hero);
  assert.ok(!fireOf(S, hero), 'not right after a fight');
  assert.match(S.clans.player.notice?.text || '', /fighting/);
  for (let i = 0; i < RULES.calmSeconds * 20; i++) g.step([]);
  camp(g, hero); assert.ok(fireOf(S, hero), 'fine once things are calm'); }
{ const { g, S, hero } = wild();
  const w = Object.values(S.frontier.wars.list)[0], hall = w.camp.buildings.find(b => b.type === 'camp_hall');
  const [x, z] = g.areas.nav.nearestFree(hall.x + 20, hall.z) ; Object.assign(hero, { x, z });
  camp(g, hero);
  assert.ok(!fireOf(S, hero), 'no camp in a war circle');
  assert.match(S.clans.player.notice?.text || '', /war circle/); }
console.log('campfire ok');
