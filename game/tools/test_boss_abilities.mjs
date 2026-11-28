// Boss abilities (world variety P4, 2026-11-27, sim/boss_abilities.js): each of the seven bosses uses its one ability
// in a fight, with the casts the render draws and the effect the sim deals.
// Run: node tools/test_boss_abilities.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const HP = data('data/hidden_places.json');
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json'),
  animals: data('data/wildlife.json').animals, hidden: HP };

function arena(placeId) {
  const g = createGame(options);
  const match = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 5 });
  const S = g.state, hero = S.entities[match.heroId], me = hero.owner, P = HP.places.find(p => p.id === placeId);
  const crew = Object.values(S.entities).filter(e => e.owner === me && e.type !== 'hero' && e.hp > 0).slice(0, 4);
  const at = (e, x, z) => Object.assign(e, { place: 'world', area: 'world', x, z, path: null, order: null });
  at(hero, P.x + 40, P.z); for (const c of crew) at(c, P.x + 45, P.z + 3);
  for (let i = 0; i < 40; i++) g.step([]);
  const boss = Object.values(S.entities).find(e => e.guarded === P.id && e.boss);
  // everyone stands round the boss, in two bunches; nobody dies of the test
  at(hero, boss.x + 3, boss.z - 4); crew.forEach((c, i) => at(c, boss.x + 3 + (i % 2), boss.z + (i < 2 ? 4 : 5)));
  for (const u of [hero, ...crew]) { u.maxHp = u.hp = 50000; }
  for (const e of Object.values(S.entities)) if (e.guarded === P.id) { e.angry = { [me]: S.tick + 2000 }; if (e.wm) Object.assign(e.wm, { mode: 'hunt', clan: me }); }
  const casts = [], hits = [];
  const step = n => { for (let i = 0; i < n; i++) { g.step([]); casts.push(...(S.casts || []).filter(c => /^boss/.test(c.kind))); hits.push(...(S.hits || [])); for (const e of Object.values(S.entities)) if (e.guarded === P.id && !e.dead) e.angry = { [me]: S.tick + 2000 }; } };
  return { g, S, hero, crew, me, P, boss, casts, hits, step, A: P.guard.boss.ability };
}
const has = (casts, kind) => casts.some(c => c.kind === kind);

{ // keg: a fuse ring at your bunch, then the blast hurts and knocks back
  const t = arena('wreck_cove'); t.step(20 * 6);
  assert.ok(has(t.casts, 'bossKeg') && has(t.casts, 'bossKegBlast'), 'keg thrown and blown');
  const k = t.casts.find(c => c.kind === 'bossKeg'), b = t.casts.find(c => c.kind === 'bossKegBlast');
  assert.ok(t.hits.some(h => h.kind === 'bossKeg'), 'the blast hurts');
  assert.equal(k.ticks, Math.round(t.A.fuse * 20), `fuse ${t.A.fuse} s`);
  console.log('  keg ok', b.r);
}
{ // slam: rears 1.5 s, then a stun for everyone close
  const t = arena('hermit_cave'); t.step(20 * 6);
  assert.ok(has(t.casts, 'bossRear') && has(t.casts, 'bossSlam'), 'reared and slammed');
  assert.ok(t.hits.some(h => h.kind === 'bossSlam'), 'the slam hurts');
  assert.equal(t.casts.find(c => c.kind === 'bossRear').ticks, 30, 'a 1.5 s warning');
  console.log('  slam ok');
}
{ // howl: wolves come and the pack is enraged
  const t = arena('frozen_shrine'); t.step(20 * 12);
  assert.ok(has(t.casts, 'bossHowl'), 'howled');
  const adds = Object.values(t.S.entities).filter(e => e.bossAdd === t.boss.id);
  assert.equal(adds.length, t.A.adds, `${t.A.adds} wolves come`);
  assert.ok(Object.values(t.S.entities).some(e => e.buffs?.bossRage), 'the pack is enraged');
  console.log('  howl ok');
}
{ // net: the hero pinned, then a burst
  const t = arena('ferry_house'); t.step(20 * 7);
  assert.ok(has(t.casts, 'bossNet'), 'net thrown');
  assert.ok(t.casts.find(c => c.kind === 'bossNet').t === t.hero.id, 'at the hero');
  assert.ok(t.hits.filter(h => h.kind === 'bossShot').length >= t.A.burst, 'the burst');
  console.log('  net ok');
}
{ // arrow storm: fire arrow up, mark, storm; more arrows with the lookouts alive
  const t = arena('watch_ruin'); t.step(20 * 10);
  for (const k of ['bossFireArrow', 'bossStormMark', 'bossStorm']) assert.ok(has(t.casts, k), k);
  const st = t.casts.find(c => c.kind === 'bossStorm');
  assert.ok(st.count >= t.A.arrows + t.A.perLookout, 'the lookouts add arrows');
  assert.ok(t.hits.some(h => h.kind === 'bossStorm'), 'arrows land');
  console.log('  storm ok', st.count);
}
{ // flicker: one crit slash in each of your groups, then the rally heals his band
  const t = arena('old_manor'); t.step(20 * 8);
  const fl = t.casts.filter(c => c.kind === 'bossFlicker');
  assert.ok(fl.length >= 2, 'blinks between your two bunches');
  assert.ok(t.hits.some(h => h.kind === 'bossFlicker' && h.crit), 'crit slashes');
  assert.ok(has(t.casts, 'bossRally'), 'then the rally cry');
  assert.ok(Object.values(t.S.entities).some(e => e.buffs?.bossMend), 'his band mends');
  console.log('  flicker ok', fl.length);
}
{ // dust and bleed: the raider chief
  const t = arena('buried_caravan'); t.step(20 * 9);
  assert.ok(has(t.casts, 'bossDust'), 'dust thrown');
  assert.ok([t.hero, ...t.crew].some(u => u.buffs?.dusted), 'your people in it are dusted');
  t.boss.boss.ability = null;   // only his spear now
  for (const u of [t.hero, ...t.crew]) Object.assign(u, { x: t.boss.x + 1.5, z: t.boss.z });
  t.step(20 * 8);
  assert.ok(t.hits.some(h => h.kind === 'bleed'), 'his hits bleed');
  console.log('  dust and bleed ok');
}
console.log('test_boss_abilities: ok');
