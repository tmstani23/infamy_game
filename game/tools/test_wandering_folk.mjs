// Wandering folk (world variety P2, 2026-11-26, sim/wandering_folk.js): scenes come round the player's people out
// on the island, out of sight; nobody can hit the folk; they react to who passes; shots, armies and war circles scatter
// them; they go once nobody of the player's is near.
// Run: node tools/test_wandering_folk.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { terrainAt } from '../src/sim/world_data.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), W = data('data/wildlife.json'), art = data('data/art.json');
const FOLK = structuredClone(W.folk);
FOLK.rules.firstSeconds = [0, 0];
FOLK.rules.everySeconds = [120, 240]; FOLK.rules.restSeconds = 600;   // the shipped pace, whatever the data is set to for playtests
FOLK.scenes.peddler.threatSeconds = [10, 10];   // quick to the robbery
const options = { district: data('data/port_town.json'), catalog: art, cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json'), folk: FOLK, animals: W.animals };

// the data: every scene's people have their sprites and the clips the scene plays
const NEEDS = { hermit: ['bow', 'pick', 'mix', 'feed', 'walk', 'idle', 'scared', 'death'], duel: ['idle', 'walk', 'run', 'attack', 'death'], peddler: ['scared', 'bow', 'walk', 'idle'], pilgrims: ['bow', 'walk', 'idle', 'scared'], camp: ['sit', 'idle', 'walk'] };
assert.ok(art.characters[FOLK.scenes.camp.watchModel]?.idle, 'the watchman has sprites');
for (const [k, sc] of Object.entries(FOLK.scenes)) for (const m of sc.models || []) {
  assert.ok(art.characters?.[m], `${k}: ${m} has sprites`);
  for (const a of NEEDS[k] || []) assert.ok(art.characters[m][a], `${k}: ${m} has a ${a} clip`);
}

const g = createGame(options);
const match = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 77 });
const S = g.state, hero = S.entities[match.heroId];
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const folk = () => Object.values(S.entities).filter(e => e.folk);
// open hill or snow country well away from the gate, towns and camps
const [gx, gz] = g.gate.island;
let spot = null;
for (let z = 300; z < world.size.h - 300 && !spot; z += 50) for (let x = 300; x < world.size.w - 300 && !spot; x += 50) {
  if (Math.hypot(x - gx, z - gz) < 700 || (world.camps || []).some(c => Math.hypot(c.x - x, c.z - z) < 300) || (world.sites || []).some(c => Math.hypot(c.x - x, c.z - z) < 300)) continue;
  let n = 0; for (let dz = -100; dz <= 100; dz += 25) for (let dx = -100; dx <= 100; dx += 25) n += ['h', 'p', 'd'].includes(terrainAt(world, x + dx, z + dz));
  if (n > 75) spot = [x, z];
}
assert.ok(spot, 'open country to stand in');
const crew = Object.values(S.entities).filter(e => e.owner === hero.owner && e.type !== 'hero');
for (const e of [hero, ...crew]) Object.assign(e, { place: 'world', area: 'world', x: spot[0] + (e === hero ? 0 : 1.5), z: spot[1] + (e === hero ? 0 : 1.5) });
for (const e of crew) e.order = { kind: 'move', x: e.x, z: e.z, arrived: true };
g.areas.update(Object.values(S.entities));
const p0 = g.areas.nav.nearestFree(...spot); Object.assign(hero, { x: p0[0], z: p0[1] });
S.night = false;
run(80);

// a scene comes on its own, out of sight of everyone
for (let i = 0; i < 1200 && !g.folk.scenes().length; i++) g.step([]);
const first = g.folk.scenes()[0];
assert.ok(first, 'a scene comes round the player');
const near = Math.min(...folk().map(e => Math.hypot(e.x - hero.x, e.z - hero.z)));
assert.ok(near > FOLK.rules.spawnRing[0] * 0.7, `out of sight when it comes (${near.toFixed(0)})`);
for (const sc of g.folk.scenes()) g.folk.end(sc.id);
S.world.folk.rest = {};

// on the move, a scene starts ahead of him, not behind (2026-11-26)
for (let k = 0; k < 4; k++) { S.world.folk.rest = {};
  const heading = k * Math.PI / 2, sc = g.folk.startScene('hermit', { x: hero.x, z: hero.z, heading });
  if (!sc) continue;
  const off = Math.atan2(sc.z - hero.z, sc.x - hero.x) - heading;
  assert.ok(Math.cos(off) > Math.cos(FOLK.rules.aheadCone) - 0.05, 'ahead of the way he is going');
  g.folk.end(sc.id);
}
S.world.folk.rest = {};

// the hermit: an old herbalist with deer about him; he picks herbs, mixes them, and the brew goes off
{ const sc = g.folk.startScene('hermit', { x: hero.x, z: hero.z });
  assert.ok(sc, 'a hermit scene');
  const e = S.entities[sc.members[0]];
  assert.equal(e.type, 'civilian'); assert.ok(e.untouchable && e.folk === sc.id, 'folk are townsfolk nobody can touch');
  assert.ok(FOLK.scenes.hermit.models.includes(e.model), 'a monk');
  assert.ok(!g.attackAllowed(hero, e), 'the hero cannot attack him');
  assert.ok(!sc.props.length, 'no log and no fire');
  const deer = Object.values(S.entities).filter(a => a.wildlife && a.wm?.friend === e.id);
  assert.ok(deer.length >= 1, 'deer come along with him');
  const seen = new Set(), pops = [], start = [e.x, e.z];
  let fled = false, farthest = 0;
  for (let i = 0; i < 20 * 150 && pops.length < 1; i++) { g.step([]); seen.add(e.anim); for (const c of S.casts) if (c.kind === 'folkPop' && c.scene === sc.id) pops.push(c); farthest = Math.max(farthest, Math.hypot(e.x - start[0], e.z - start[1])); }
  assert.ok(seen.has('walk') && farthest > 3, 'he roams');
  assert.ok(seen.has(FOLK.scenes.hermit.clips.pick), 'stoops to pick');
  assert.ok(seen.has(FOLK.scenes.hermit.clips.mix), 'mixes his flasks');
  assert.equal(pops.length, 1, 'and it goes off');
  fled = deer.some(a => a.wm?.mode === 'flee');
  assert.ok(fled, 'the deer bolt at the pop');
  run(8); assert.ok(['scared', 'death', 'run', 'walk'].includes(e.anim), 'he flinches, scurries or is knocked flat');
  let back = false;
  for (let i = 0; i < 20 * 60 && !back; i++) { g.step([]); const live = deer.filter(a => S.entities[a.id] && !a.dead); back = live.length > 0 && live.every(a => a.wm.mode !== 'flee' && Math.hypot(a.x - e.x, a.z - e.z) < 12); }
  assert.ok(back, 'and they come back to him');
  // walk up to him and stop: he turns to you and bows
  for (let i = 0; i < 400 && S.casts.every(c => c.kind !== 'folkPop') && sc.m[e.id].mode !== 'stand'; i++) g.step([]);
  const p = g.areas.nav.nearestFree(e.x + 3, e.z + 1);
  for (const u of [hero, ...crew]) Object.assign(u, { x: p[0], z: p[1] });
  let bowed = false;
  for (let i = 0; i < 600 && !bowed; i++) { if (Math.hypot(hero.x - e.x, hero.z - e.z) > 4) { const q = g.areas.nav.nearestFree(e.x + 3, e.z + 1); for (const u of [hero, ...crew]) Object.assign(u, { x: q[0], z: q[1] }); } g.step([]); bowed = sc.m[e.id]?.mode === 'bow'; }
  assert.ok(bowed, 'he bows to one who stops beside him');
  // shots close by: he jumps up and runs, and is gone once out of everyone's sight
  g.folk.scatter(sc.id, [hero.x, hero.z]);
  run(10);
  assert.equal(e.anim, 'scared', 'a moment of fright');
  run(40);
  assert.ok(Math.hypot(e.x - hero.x, e.z - hero.z) > 4, 'then runs off');
  for (let i = 0; i < 1400 && S.entities[e.id]; i++) { for (const u of crew) Object.assign(u, { x: hero.x, z: hero.z }); g.step([]); }   // the crew kept by the hero (they wander after the deer)
  assert.ok(!S.entities[e.id], 'gone once out of sight');
  run(2);
  assert.ok(!g.folk.scenes().find(s => s.id === sc.id), 'the scene is over');
}

// walking away: a scene is taken off once nobody of the player's is near
{ S.world.folk.rest = {};
  const sc = g.folk.startScene('hermit', { x: hero.x, z: hero.z });
  assert.ok(sc);
  const far = g.areas.nav.nearestFree(hero.x + 400, hero.z) || [hero.x + 400, hero.z];
  for (const u of [hero, ...crew]) Object.assign(u, { x: far[0], z: far[1] });
  g.areas.update(Object.values(S.entities));
  run(70);
  assert.ok(!g.folk.scenes().find(s => s.id === sc.id) && !folk().some(e => e.folk === sc.id), 'gone when nobody is near');
}

// never in a town ring: no scene round a unit standing in one
{ const town = Object.values(S.frontier?.settlements || {}).find(s => Number.isFinite(s.x));
  if (town) { const a = g.folk.anchors(); const was = [hero.x, hero.z]; Object.assign(hero, { x: town.x, z: town.z }); for (const u of crew) Object.assign(u, { x: town.x, z: town.z });
    assert.ok(!g.folk.anchors().length, 'nothing comes round people in a town'); Object.assign(hero, { x: was[0], z: was[1] }); void a; }
}
// the ronin duel: face off, circle, clash a round or two, one falls and the winner walks off
{ S.world.folk.rest = {};
  // stand 90 off a bridge or ford well away from everything
  const ford = world.fords.find(f => Math.hypot(f.x - gx, f.z - gz) > 700 && (world.sites || []).every(c => Math.hypot(c.x - f.x, c.z - f.z) > 400) && (world.camps || []).every(c => Math.hypot(c.x - f.x, c.z - f.z) > 300));
  assert.ok(ford, 'a crossing out in the wild');
  for (const u of [hero, ...crew]) Object.assign(u, { x: ford.x + 90, z: ford.z });
  g.areas.update(Object.values(S.entities));
  let q = null;
  for (let k = 0; k < 16 && !q; k++) { const a = k / 16 * Math.PI * 2, x = ford.x + Math.cos(a) * 90, z = ford.z + Math.sin(a) * 90; for (const u of [hero, ...crew]) Object.assign(u, { x, z }); g.areas.update(Object.values(S.entities)); q = g.areas.nav.nearestFree(x, z); }
  assert.ok(q, 'dry ground by the crossing');
  for (const u of [hero, ...crew]) Object.assign(u, { x: q[0], z: q[1] });
  run(5);
  const sc = g.folk.startScene('duel', { x: hero.x, z: hero.z });
  assert.ok(sc, 'a duel scene');
  const [a, b] = sc.members.map(id => S.entities[id]);
  assert.ok(a && b && a.model !== b.model, 'two different swordsmen');
  assert.ok(!g.attackAllowed(hero, a), 'nobody can cut in on them');
  const seen = new Set(), casts = new Set();
  for (let i = 0; i < 1200 && sc.phase !== 'fallen'; i++) { g.step([]); seen.add(sc.phase); for (const c of S.casts) if (c.scene === sc.id) casts.add(c.kind); }
  assert.equal(sc.phase, 'fallen', 'the duel ends');
  for (const p of ['face', 'circle', 'clash', 'part']) assert.ok(seen.has(p), `they ${p}`);
  for (const k of ['folkShout', 'folkClash', 'folkFall']) assert.ok(casts.has(k), `a ${k} for the sound`);
  const loser = [a, b][sc.loser], winner = [a, b][1 - sc.loser];
  assert.equal(loser.anim, 'death', 'one falls');
  const w0 = [winner.x, winner.z];
  run(200);
  assert.ok(Math.hypot(winner.x - w0[0], winner.z - w0[1]) > 5, 'the winner walks off');
  assert.equal(loser.anim, 'death', 'the body lies there');
}

// a rider coming close stops the duel: both stare him down, then go on once he has passed
{ S.world.folk.rest = {};
  const sc = g.folk.startScene('duel', { x: hero.x, z: hero.z });
  assert.ok(sc, 'another duel');
  for (let i = 0; i < 200 && sc.phase !== 'circle'; i++) g.step([]);
  const [a, b] = sc.members.map(id => S.entities[id]);
  const was = [hero.x, hero.z], p = g.areas.nav.nearestFree(sc.x + 8, sc.z);
  Object.assign(hero, { x: p[0], z: p[1], mounted: true });
  run(3);
  assert.equal(sc.phase, 'stare', 'they stop for the rider');
  assert.ok(a.anim === 'idle' && b.anim === 'idle', 'and stand');
  const pd = Math.round(Math.atan2(0, 0)); void pd;
  hero.mounted = false; Object.assign(hero, { x: was[0], z: was[1] });
  run(60);
  assert.notEqual(sc.phase, 'stare', 'and go on once he is gone');
  delete hero.mounted;
  g.folk.end(sc.id);
}
// the peddler held up: real bandits round a trader nobody can hurt
const peddler = () => { S.world.folk.rest = {}; const sc = g.folk.startScene('peddler', { x: hero.x, z: hero.z }); assert.ok(sc, 'a hold-up'); return sc; };
// ride past: one of them cuts him down, they take his goods and go; he lies there and is no shop (2026-11-26)
{ const sc = peddler();
  const v = S.entities[sc.victim], gang = sc.members.map(id => S.entities[id]).filter(e => e.owner === 'bandits');
  assert.equal(v.model, 'merchant');
  assert.ok(gang.length >= 2 && gang.every(b => b.type === 'bandit' && b.wild), 'two or three real bandits');
  assert.ok(!g.attackAllowed(hero, v) && g.attackAllowed(hero, gang[0]), 'the bandits can be fought, he cannot be hurt');
  const casts = new Set();
  for (let i = 0; i < 1400 && sc.phase !== 'robbed'; i++) { g.step([]); for (const c of S.casts) if (c.scene === sc.id) casts.add(c.kind); }
  assert.equal(sc.phase, 'robbed', 'left alone, they rob him');
  assert.ok(casts.has('folkShove') && casts.has('folkRobbed'), 'shoves and the robbery for the sounds');
  assert.ok(casts.has('folkHit') && casts.has('folkSay'), 'blood when a blow lands, and words over their heads');
  const b0 = [gang[0].x, gang[0].z], v0 = [v.x, v.z];
  run(200);
  const moved = (e, p) => !S.entities[e.id] || Math.hypot(e.x - p[0], e.z - p[1]) > 5;
  assert.ok(moved(gang[0], b0), 'and the gang goes');
  assert.ok(v.anim === 'death' && !moved(v, v0) && !v.peddlerShop, 'he lies where they left him, nothing to sell');
  g.folk.end(sc.id);
}
// step in: hit one and they fight; with them dead he bows to his rescuer
{ const sc = peddler();
  const v = S.entities[sc.victim], gang = sc.members.map(id => S.entities[id]).filter(e => e.owner === 'bandits');
  Object.assign(hero, { hp: 99999, maxHp: 99999 });
  for (const b of gang) b.hp = 5;
  const p = g.areas.nav.nearestFree(gang[0].x + 2, gang[0].z); Object.assign(hero, { x: p[0], z: p[1] });
  g.step([{ id: hero.id, type: 'attack', target: gang[0].id }]);
  let fought = false;
  for (let i = 0; i < 600 && sc.phase !== 'saved'; i++) {
    const alive = gang.filter(b => S.entities[b.id] && !b.dead);
    if (alive.length && !hero.order?.target) g.step([{ id: hero.id, type: 'attack', target: alive[0].id }]); else g.step([]);
    fought ||= sc.phase === 'fight';
  }
  assert.ok(fought, 'they fight');
  assert.equal(sc.phase, 'saved', 'all down');
  run(5);
  assert.equal(v.anim, 'bow', 'he bows');
  assert.match(S.clans[hero.owner].notice?.text || '', /thanks/, 'his thanks');
  // saved, he trades: the hero at his elbow can buy and sell as at a town's merchant, and he does not walk off on him
  run(80);
  assert.ok(sc.phase === 'trade' && v.peddlerShop, 'he opens his pack');
  const home = [hero.x, hero.z], q = g.areas.nav.nearestFree(v.x + 2, v.z); Object.assign(hero, { x: q[0], z: q[1] });
  assert.equal(g.itemServices.merchantNear(hero)?.id, v.id, 'the hero can trade with him');
  const at = [v.x, v.z];
  run(20 * 150);
  assert.ok(v.peddlerShop && Math.hypot(v.x - at[0], v.z - at[1]) < 1, 'he stays while the hero is by him');
  Object.assign(hero, { x: home[0], z: home[1] });
  g.folk.end(sc.id);
}
// pilgrims: a line along the road with a bell, a stop to bow at a roadside shrine, off the road for a rider
{ S.world.folk.rest = {};
  let sc = null;
  for (let k = 0; k < 8 && !sc; k++) sc = g.folk.startScene('pilgrims', { x: hero.x, z: hero.z });
  assert.ok(sc, 'pilgrims on the road');
  const line = sc.members.map(id => S.entities[id]);
  assert.ok(line.length >= 3 && line.length <= 5, 'three to five');
  assert.ok(sc.route.length > 5, 'a stretch of road ahead');
  // a shrine by the road a little way on
  const q = sc.route[5]; sc.shrine = { x: q[0] + 4, z: q[1], art: 'plains_roadside_shrine', at: 5 };
  const bells = [];
  let row = false;
  for (let i = 0; i < 2400 && !row; i++) { g.step([]); for (const c of S.casts) if (c.scene === sc.id && c.kind === 'folkBell') bells.push(c); row = sc.phase === 'shrine' && line.every(e => e.anim === 'bow'); }
  assert.ok(bells.length >= 1, 'the bell rings');
  assert.ok(row, 'they bow together at the shrine');
  for (const e of line) assert.ok(Math.hypot(e.x - sc.shrine.x, e.z - sc.shrine.z) < 6, 'before the shrine');
  for (let i = 0; i < 400 && sc.phase === 'shrine'; i++) g.step([]);
  assert.equal(sc.phase, 'walk', 'and go on');
  run(100);
  const gaps = line.slice(1).map((e, i) => Math.hypot(e.x - line[i].x, e.z - line[i].z));
  assert.ok(gaps.every(d => d < 5), `in a line (${gaps.map(d => d.toFixed(1))})`);
  // a rider: they step off the road and wait
  const was = [hero.x, hero.z], p = g.areas.nav.nearestFree(line[0].x + 9, line[0].z);
  const before = line.map(e => [e.x, e.z]);
  Object.assign(hero, { x: p[0], z: p[1] });
  for (let i = 0; i < 40; i++) { hero.mounted = true; g.step([]); }   // (no real horse under him: the mounts rules would take him off it)
  assert.equal(sc.phase, 'aside', 'they make way');
  assert.ok(line.some((e, i) => Math.hypot(e.x - before[i][0], e.z - before[i][1]) > 2), 'off the road');
  Object.assign(hero, { x: was[0], z: was[1] }); delete hero.mounted;
  run(80);
  assert.equal(sc.phase, 'walk', 'and walk on once he has passed');
  g.folk.end(sc.id);
}
// a night camp: round a fire on logs, one on watch; the one on his feet calls out at riders, the rest stay sitting; at dawn the fire goes out
{ S.world.folk.rest = {}; S.night = true;
  run(3);
  let sc = null;
  for (let k = 0; k < 6 && !sc; k++) sc = g.folk.startScene('camp', { x: hero.x, z: hero.z });
  assert.ok(sc, 'a night camp');
  const fire = sc.props.find(p => p.fire), sit = sc.members.map(id => S.entities[id]).filter(e => e.id !== sc.watch), w = S.entities[sc.watch];
  assert.ok(fire && fire.art === 'campfire', 'a fire');
  assert.ok(sit.length >= 3 && sit.every(e => e.anim === 'sit'), 'three or four sit round it');
  assert.equal(sc.props.filter(p => p.seat).length, sit.length, 'each on a log');
  assert.ok(w && w.model === FOLK.scenes.camp.watchModel, 'one on his feet');
  assert.ok(sc.members.every(id => !/ronin|swordsman|lookout/.test(S.entities[id].model)), 'nobody armed');
  assert.equal(new Set(sc.members.map(id => S.entities[id].name)).size, sc.members.length, 'each his own name');
  { const at = [w.x, w.z]; let moved = 0; for (let i = 0; i < 600; i++) { g.step([]); moved = Math.max(moved, Math.hypot(w.x - at[0], w.z - at[1])); } assert.ok(moved > 1, 'he strolls round the camp'); assert.ok(Math.hypot(w.x - fire.x, w.z - fire.z) < 8, 'and stays by it'); }
  run(10);
  assert.ok(sit.every(e => e.anim === 'sit'), 'still sitting');
  // a rider comes: the watch calls out, they get up and face him
  const p = g.areas.nav.nearestFree(fire.x + 15, fire.z), was = [hero.x, hero.z];
  Object.assign(hero, { x: p[0], z: p[1], mounted: true });
  const calls = [];
  for (let i = 0; i < 5; i++) { g.step([]); for (const c of S.casts) if (c.scene === sc.id) calls.push(c.kind); }
  assert.ok(calls.includes('folkCall'), 'the watchman calls');
  assert.ok(sit.every(e => e.anim === 'sit'), 'the rest stay sitting');
  Object.assign(hero, { x: was[0], z: was[1] }); delete hero.mounted;
  run(120);
  assert.ok(sit.every(e => e.anim === 'sit'), 'and sit again once he has gone');
  // dawn
  S.night = false; run(5);
  assert.ok(fire.out, 'the fire is put out at dawn');
  run(200);
  assert.ok(sit.some(e => !S.entities[e.id] || Math.hypot(e.x - fire.x, e.z - fire.z) > 5), 'and they go on');
  g.folk.end(sc.id);
}
console.log('wandering folk ok');
