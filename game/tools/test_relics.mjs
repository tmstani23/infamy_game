// Relic tricks (world variety P4, 2026-11-27, sim/relics.js): the spyglass, the fox mask, the smoke lantern,
// the pilgrim's gourd, the conch horn, the ferryman's charm and the climber's hook, worn in the hero's Relic slot.
// Run: node tools/test_relics.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { passable } from '../src/sim/world_data.js';
import { createRelics } from '../src/sim/relics.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const HP = data('data/hidden_places.json');
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json'),
  animals: data('data/wildlife.json').animals, hidden: HP };

function setup(relic, placeId = 'frozen_shrine') {
  const g = createGame(options);
  const match = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 5 });
  const S = g.state, hero = S.entities[match.heroId], me = hero.owner, P = HP.places.find(p => p.id === placeId);
  const crew = Object.values(S.entities).filter(e => e.owner === me && e.type !== 'hero' && e.hp > 0).slice(0, 4);
  const at = (e, x, z) => Object.assign(e, { place: 'world', area: 'world', x, z, path: null, order: null });
  at(hero, P.x + 40, P.z); crew.forEach((c, i) => at(c, P.x + 41 + i * .8, P.z + 2));
  hero.equipment.relic = relic;
  const casts = [];
  const step = (n, cmds = []) => { for (let i = 0; i < n; i++) { g.step(i ? [] : cmds); casts.push(...(S.casts || []).filter(c => /^relic/.test(c.kind))); } };
  step(10);
  return { g, S, hero, crew, me, P, at, casts, step };
}

// Ferryman's charm (2026-11-28): the wearer's crew walk straight across a river away from any ford, slowed in the water;
// without it the same order never sets foot in the river water
for (const relic of ['relic_ferryman_charm', null]) {
  const t = setup(relic), W = options.world, c = t.crew[0];
  t.at(t.hero, 9512, 1540); t.at(c, 9515, 1525); t.crew.slice(1).forEach((u, i) => t.at(u, 9505 - i, 1540));
  t.step(5);
  t.step(1, [{ id: t.hero.id, type: 'order', kind: 'move', units: [c.id], hero: true, place: 'world', x: 9640, z: 1525 }]);
  let wet = 0, i = 0;
  for (; i < 900 && Math.hypot(c.x - 9640, c.z - 1525) > 2; i++) { t.step(1); if (!passable(W, c.x, c.z)) wet++; }
  if (relic) {
    assert.ok(Math.hypot(c.x - 9640, c.z - 1525) <= 2, `waded across (${Math.round(c.x)}, ${Math.round(c.z)})`);
    assert.ok(wet > 0, 'through the water');
    t.hero.equipment.relic = null; t.step(2);
    assert.ok(!t.g.relics.wades(c), 'taken off: no more wading');
    console.log(`  ferryman's charm ok (${i} ticks, ${wet} in the water)`);
  } else assert.equal(wet, 0, 'without it, never in the river water');
}
{ // climber's hook (2026-11-28): the Relic key takes the hero and crew within 8 over the nearest wall within 4 in 3 s
  const wall = { minX: 10, maxX: 10.8, minZ: -20, maxZ: 20 }, house = { minX: -6, maxX: 0, minZ: 6, maxZ: 12 };
  const hero = { id: 'h', type: 'hero', owner: 'p', place: 'world', x: 7.5, z: 0, hp: 100, maxHp: 100, equipment: { relic: 'relic_climber_hook' } };
  const crew = [1, 2, 3].map(i => ({ id: 'c' + i, type: 'thug', owner: 'p', place: 'world', x: 6 - i, z: i, hp: 50, maxHp: 50 }));
  const far = { id: 'f', type: 'thug', owner: 'p', place: 'world', x: -20, z: 0, hp: 50, maxHp: 50 };
  const state = { tick: 0, casts: [], clans: { p: {} }, entities: Object.fromEntries([hero, ...crew, far].map(e => [e.id, e])) };
  const R = createRelics({ state, addBuff: () => {}, wallsNear: () => [wall, house], freeAt: (x, z) => (x > 10 && x < 10.8) ? null : [x, z] });
  R.command(hero, { type: 'relic' });
  assert.ok(state.casts.some(c => c.kind === 'relicClimb'), 'cast');
  for (let i = 0; i < 20 * 3 + 6; i++) { state.tick++; R.tick(); }
  assert.ok(hero.x > 10.8 && crew.every(c => c.x > 10.8), `over the wall (${hero.x.toFixed(1)}, ${crew.map(c => c.x.toFixed(1))})`);
  assert.ok(far.x < 0, 'crew farther than 8 stay');
  assert.ok(!hero.relicClimb, 'done');
  assert.ok(R.blocked(hero)?.includes('ready in'), 'cooldown');
  hero.relicReady = {}; Object.assign(hero, { x: -3, z: 3 });
  assert.ok(R.blocked(hero)?.startsWith('No wall'), 'a house is not a wall');
  console.log('  climber\'s hook ok');
}
{ // spyglass: always on, the hero's sight 60% farther on the island
  const t = setup('relic_spyglass'); t.step(10);
  assert.equal(t.hero.sightK, 1.6, 'sees 60% farther');
  t.hero.equipment.relic = null; t.step(10);
  assert.ok(t.hero.sightK == null, 'gone when taken off');
  console.log('  spyglass ok');
}
{ // gourd: the Relic key heals half over 3 s, then 180 s cooldown
  const t = setup('relic_pilgrim_gourd');
  t.hero.hp = Math.round(t.hero.maxHp * 0.3); const hp0 = t.hero.hp;
  t.step(20 * 3 + 2, [{ id: t.hero.id, type: 'relic' }]);
  assert.ok(t.casts.some(c => c.kind === 'relicHeal'), 'cast');
  assert.ok(Math.abs(t.hero.hp - hp0 - t.hero.maxHp * 0.5) < t.hero.maxHp * 0.03, `healed 50% (${hp0} -> ${Math.round(t.hero.hp)})`);
  const hp1 = t.hero.hp; t.step(5, [{ id: t.hero.id, type: 'relic' }]);
  assert.ok(t.hero.hp <= hp1 + 1, 'not again in the cooldown');
  assert.equal(t.S.clans[t.me].notice?.text.startsWith("Pilgrim's gourd ready in"), true, 'says when it is ready');
  console.log('  gourd ok');
}
{ // smoke lantern: a cloud of radius 8 for 6 s that no shot passes through
  const t = setup('relic_smoke_lantern');
  t.step(1, [{ id: t.hero.id, type: 'relic' }]); t.step(1);
  assert.ok(t.casts.some(c => c.kind === 'relicSmoke'), 'cast');
  const s = t.S.relicSmokes?.[0]; assert.ok(s && s.r === 8, 'a cloud of radius 8');
  const a = { place: 'world', x: s.x - 20, z: s.z }, b = { place: 'world', x: s.x + 20, z: s.z }, c = { place: 'world', x: s.x - 20, z: s.z + 15 }, d = { place: 'world', x: s.x + 20, z: s.z + 15 };
  assert.ok(t.g.relics.smokeBlocks(a, b), 'a shot across the cloud is stopped');
  assert.ok(!t.g.relics.smokeBlocks(c, d), 'a shot past it is not');
  // hidden inside it (2026-11-28), anyone of the clan, ninja or not; attacking shows him, for 3 s after
  t.step(10);
  assert.ok(t.hero.hidden, 'the hero is hidden in his cloud');
  const foe = Object.values(t.S.entities).find(e => e.guarded && !e.dead); assert.ok(foe, 'a guard to go for');
  t.step(3, [{ id: t.hero.id, type: 'attack', target: foe.id }]);
  delete t.hero.attackTarget; t.step(30); assert.ok(!t.hero.hidden, 'still seen 1.5 s after the attack');
  t.step(40); assert.ok(t.hero.hidden, 'hidden again 3 s after');
  t.step(20 * 6 + 2);
  assert.ok(!t.S.relicSmokes, 'gone after 6 s');
  t.step(10); assert.ok(!t.hero.hidden, 'seen again once the cloud is gone');
  console.log('  smoke lantern ok');
}
{ // fox mask (2026-11-28): crew within 20 only; rival clans' troops and heroes see the masked only within 6
  const t = setup('relic_fox_mask'), far = t.crew[t.crew.length - 1];
  t.at(far, t.hero.x + 30, t.hero.z); t.step(20);
  assert.ok(t.hero.relicUnseen && (t.crew.length < 2 || t.crew[0].relicUnseen) && !far.relicUnseen, 'crew within 20 masked, one at 30 not');
  const rival = Object.values(t.S.entities).find(e => e.owner !== t.me && t.S.clans[e.owner] && e.type !== 'civilian' && e.hp > 0 && !e.vehicle && e.type !== 'horse');
  assert.ok(rival, 'a rival unit');
  t.at(rival, t.hero.x - 10, t.hero.z); t.step(3);
  assert.ok(t.hero.hidden && !t.g.state.entities[t.hero.id].dead, 'a rival at 10 does not see him');
  t.at(rival, t.hero.x - 4, t.hero.z); t.step(3);
  assert.ok(!t.hero.hidden, 'a rival at 4 does');
  console.log('  fox mask rival sight ok');
}
{ // fox mask: the pack does not notice the hero and crew walking in, until they attack
  const t = setup('relic_fox_mask');
  t.step(20);
  for (const u of [t.hero, ...t.crew]) t.at(u, t.P.x + 9, t.P.z + 2);
  t.step(20 * 4);
  assert.ok(t.hero.relicUnseen && t.crew.every(c => c.relicUnseen), 'hero and crew unseen');
  const pack = Object.values(t.S.entities).filter(e => e.guarded === t.P.id && !e.dead);
  assert.ok(pack.length && pack.every(e => !e.angry?.[t.me]), 'the pack has not noticed');
  // the hero bites first: the mask is broken for 20 s
  t.S.hits = [{ a: t.hero.id, t: pack[0].id }]; t.g.relics.tick();
  assert.ok(t.hero.relicSpotted > t.S.tick && t.casts.length >= 0, 'spotted after an attack');
  t.step(6);
  assert.ok(!t.hero.relicUnseen, 'seen again');
  console.log('  fox mask ok');
}
{ // conch horn (2026-11-28): every enemy within 60 is shown to the clan for 15 s, a hidden one too; nobody near says so
  const t = setup('relic_conch_horn'); t.step(40);   // the shrine's 'Found' notice first
  const foe = Object.values(t.S.entities).find(e => e.owner !== t.me && t.S.clans[e.owner] && e.type !== 'hero' && !e.dead);
  for (const e of Object.values(t.S.entities)) if (e.owner !== t.me && e.place === 'world' && Math.hypot(e.x - t.hero.x, e.z - t.hero.z) <= 60) t.at(e, t.hero.x + 500, t.hero.z);
  t.step(1, [{ id: t.hero.id, type: 'relic' }]);
  assert.ok(/nobody within 60/.test(t.S.clans[t.me].notice?.text || ''), 'nobody near: says so (' + JSON.stringify(t.S.clans[t.me].notice) + ')');
  t.hero.relicReady = {};
  t.at(foe, t.hero.x + 45, t.hero.z); foe.hidden = true;
  assert.ok(!t.g.vision.canSee(t.me, foe), 'hidden and far: not seen');
  t.step(2, [{ id: t.hero.id, type: 'relic' }]);
  assert.ok(t.casts.some(c => c.kind === 'relicConch' && c.n >= 1), 'cast');
  assert.ok(t.g.vision.canSee(t.me, foe), 'shown, hidden or not');
  assert.ok(foe.relicMarked > t.S.tick && !foe.hidden, 'marked: no stealth meanwhile');
  t.step(20 * 15 + 5);
  assert.ok(!(foe.detectedBy?.[t.me] > t.S.tick) && !(foe.relicMarked > t.S.tick), 'mark gone after 15 s');
  console.log('  conch horn ok');
}

console.log('relics: all ok');
