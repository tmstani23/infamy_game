// Checks the night bandits in the sim: node game/tools/test_bandits.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const B = data('data/bandits.json');
const newGame = () => {
  const g = createGame({
    district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: B,
  });
  g.clans.addClan('player');
  return g;
};
const run = (g, s, cmds = []) => { g.step(cmds); for (let i = 1; i < s * 20; i++) g.step(); };
const bandits = g => Object.values(g.state.entities).filter(e => e.owner === 'bandits' && !e.dead);
const inWall = (g, e) => g.blockers.some(b => e.x > b.minX && e.x < b.maxX && e.z > b.minZ && e.z < b.maxZ);

const waitingBandit = (g, x, z, type = 'bandit') => {
  const id = g.spawn(type, type === 'night_brute' ? 'brute' : 'bandit', x, z, { owner: 'bandits', wild: true });
  g.bandits.mind[id] = { spot: 'stay', until: 1e9 };
  return g.state.entities[id];
};

// Sight starts fights at four units, not at the old eight-unit assistance radius.
{
  const g = newGame(), b = waitingBandit(g, -8, 1), friend = waitingBandit(g, -4, 1);
  const h = g.state.entities[g.spawn('hero', 'ronin', -12.25, 1, { owner: 'player' })];
  g.step(); assert.ok(!b.angry, 'outside sight range stays calm');
  h.x = -11.75; g.step();
  assert.ok(b.angry?.player, 'sight alone starts a fight inside four units');
  assert.ok(!friend.angry, 'sighting does not give friends an eight-unit vision radius');
  const hp = h.hp;
  run(g, 2);
  assert.ok(h.hp < hp, 'bandit approaches and attacks without player input');
  h.x = -40; h.z = 1; run(g, 2);
  assert.ok(!b.angry, 'pursuit ends after the target escapes');
  console.log('four-unit sight, local acquisition, actual damage and escape ok');
}

// Vision must respect walls, hidden ninja, smoke, and invalid combat targets.
{
  const g = newGame();
  let pair;
  for (const b of g.blockers) {
    const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    const axisX = b.maxX - b.minX < b.maxZ - b.minZ;
    const a = g.nav.nearestFree(axisX ? b.minX - .8 : x, axisX ? z : b.minZ - .8);
    const t = g.nav.nearestFree(axisX ? b.maxX + .8 : x, axisX ? z : b.maxZ + .8);
    if (a && t && Math.hypot(a[0] - t[0], a[1] - t[1]) < 4 && !g.nav.clearLine(...a, ...t)) { pair = [a, t]; break; }
  }
  assert.ok(pair, 'map has a short line blocked by scenery');
  const b = waitingBandit(g, ...pair[0]);
  g.spawn('hero', 'ronin', ...pair[1], { owner: 'player' });
  g.step(); assert.ok(!b.angry, 'does not spot through scenery');
}
{
  const g = newGame();
  g.state.clans.player.kind = 'ninja';
  g.state.night = true; Object.assign(g.bandits.night, { on: true, came: B.rules.perNight });
  const b = waitingBandit(g, -30, 30);
  const h = g.state.entities[g.spawn('hero', 'ninja_leader', -33.5, 30, { owner: 'player' })];
  assert.ok(!g.stealth.lit(h.x, h.z), 'ninja fixture is in darkness');
  run(g, 1);
  assert.ok(h.hidden && !b.angry, 'hidden ninja is not spotted');
  g.stealth.reveal(h); g.step();
  assert.ok(b.angry?.player, 'revealed ninja is spotted at the same distance');
  delete b.angry;
  g.state.smokes = [{ clan: 'player', place: 'street', x: h.x, z: h.z, r: 4, until: g.state.tick + 100 }];
  g.step(); assert.ok(!b.angry, 'smoke blocks acquisition');
}
{
  const g = newGame(), b = waitingBandit(g, -8, 1);
  g.spawn('civilian', 'geisha', -9, 1, { owner: 'player' });
  g.spawn('hero', 'ronin', -9, 2, { owner: 'player', downed: true });
  g.spawn('hero', 'ronin', -7, 1, { owner: 'player', jailed: true });
  g.spawn('hero', 'ronin', -8, 1, { owner: 'player', place: 'another_room' });
  g.step(); assert.ok(!b.angry, 'ignores civilians, downed/jailed units and other rooms');
  g.clans.addClan('kuroda');
  g.spawn('thug', 'thug', -9, 1, { owner: 'kuroda', order: { kind: 'stop' } });
  g.step(); assert.ok(b.angry?.kuroda, 'bot clan crew trigger the same aggression');
  console.log('walls, stealth, smoke and fair clan targeting ok');
}

// Actual roaming bandits receive their stronger stats and pay 50 on the body.
for (const type of ['bandit', 'night_brute']) {
  const g = newGame(), b = waitingBandit(g, -8, 1, type), profile = B.types[type].roamerStats;
  const hero = g.spawn('hero', 'ronin', -8.8, 1, { owner: 'player' });
  assert.equal(b.maxHp, profile.hp);
  let hit;
  for (let i = 0; i < 60 && !hit; i++) { g.step(); hit = g.state.hits.find(h => h.a === b.id && h.t === hero); }
  assert.ok(hit && hit.damage === profile.damage * (hit.crit ? 2 : 1), `${type} uses roaming damage`);
  b.hp = 1;
  const ryo = g.state.clans.player.ryo;
  g.step([{ id: hero, type: 'attack', target: b.id }]);
  for (let i = 0; i < 80 && !b.dead; i++) g.step();
  assert.ok(b.dead);
  assert.equal(b.loot, 50);
  assert.equal(g.state.clans.player.ryo, ryo, 'no automatic kill payment');
  g.step([{ id: hero, type: 'loot', target: b.id }]);
  run(g, 1);
  assert.equal(g.state.clans.player.ryo - ryo, 50, 'actually looting pays 50');
}

// Every way in leads to the town's spots, and the art exists
{
  const g = newGame(), art = data('data/art.json'), units = data('data/units.json');
  assert.ok(g.bandits.ways.length >= 4, 'ways in');
  for (const w of g.bandits.ways) assert.ok(g.nav.findPath(w[0], w[1], g.bandits.spots[0].x, g.bandits.spots[0].z), `no path from ${w}`);
  for (const k of Object.keys(B.types)) assert.ok(art.characters[units.types[k].sprite], `no art for ${k}`);
  console.log('ways ok');
}

// Day: none. Night: 2 at once at the edge, then more up to the cap, never more than perNight a night
{
  const g = newGame();
  const hero = g.spawn('hero', 'ronin', -8, 1, { owner: 'player' });
  run(g, 30);
  assert.equal(bandits(g).length, 0, 'none by day');
  g.step([{ type: 'time', night: true }]);
  assert.equal(bandits(g).length, B.rules.firstWave, 'first wave at nightfall');
  for (const b of bandits(g)) {
    assert.ok(Math.abs(b.x) > 40 || Math.abs(b.z) > 40, `spawned at the edge (${b.x.toFixed(1)},${b.z.toFixed(1)})`);
    assert.ok(Math.hypot(b.x - g.state.entities[hero].x, b.z - g.state.entities[hero].z) >= B.rules.minDistance, 'out of sight');
  }
  // Stay indoors while observing their ordinary roaming/spawn lifecycle.
  const room = g.rooms[0];
  Object.assign(g.state.entities[hero], { place: room.name, x: room.spawn.x, z: room.spawn.z });
  let most = 0, seen = new Set();
  for (let i = 0; i < 20 * 400; i++) {
    g.step();
    const list = bandits(g);
    most = Math.max(most, list.length);
    list.forEach(b => { seen.add(b.id); assert.ok(!inWall(g, b), `bandit ${b.id} in a wall`); assert.ok(!b.swing, 'street bandits cannot see into rooms'); });
  }
  assert.equal(most, B.rules.maxOut, 'fills up to the cap');
  assert.ok(seen.size <= B.rules.perNight, 'no more than perNight');
  const walked = bandits(g).filter(b => Math.abs(b.x) < 38 && Math.abs(b.z) < 38).length;
  assert.ok(walked >= bandits(g).length / 2, `they walk into town (${walked})`);
  assert.equal(g.state.entities[hero].hp, g.state.entities[hero].maxHp, 'hero safe indoors');
  // dawn: they all walk out
  g.step([{ type: 'time', night: false }]);
  run(g, 120);
  assert.equal(bandits(g).length, 0, 'gone by day');
  console.log(`night ok (max ${most}, ${seen.size} came)`);
}

// Hit one: it and its friends fight back; killed, they leave ryo on the body to loot, no heat, no downing
{
  const g = newGame();
  g.step([{ type: 'time', night: true }]);
  for (const b of bandits(g)) delete g.state.entities[b.id];
  g.bandits.night.came = B.rules.perNight;            // no more come in during the test
  const a = g.spawn('bandit', 'bandit', -8, 1, { owner: 'bandits', wild: true }); g.bandits.mind[a] = { spot: 'stay', until: 1e9 };
  const b = g.spawn('bandit', 'bandit', -6, 2, { owner: 'bandits', wild: true }); g.bandits.mind[b] = { spot: 'stay', until: 1e9 };
  const far = g.spawn('bandit', 'bandit', 20, 1, { owner: 'bandits', wild: true }); g.bandits.mind[far] = { spot: 'stay', until: 1e9 };
  const hero = g.spawn('hero', 'ronin', -8.8, 1, { owner: 'player', hp: 100000 });
  run(g, 3);
  assert.ok(g.state.entities[a].angry?.player, 'spots and attacks the nearby hero without being hit first');
  const ryo0 = g.state.clans.player.ryo;
  const gains = [];
  g.step([{ id: hero, type: 'attack', target: a }]);
  for (let i = 0; i < 20 * 30 && g.state.entities[a] && !g.state.entities[a].dead; i++) { g.step(); gains.push(...g.state.ryoGains); }
  assert.ok(!g.state.entities[a] || g.state.entities[a].dead, 'killed');
  assert.ok(!g.state.entities[a]?.downed, 'not downed');
  assert.ok(g.state.entities[b].angry?.player, 'the one nearby joins in');
  assert.ok(!g.state.entities[far].angry, 'the far one does not');
  assert.ok(g.state.hits.length >= 0 && g.state.entities[hero].hp < 100000, 'they hit back');
  const got = g.state.clans.player.ryo - ryo0, base = B.rules.roamerLoot, k = B.rules.ryoSpread;
  assert.equal(got, 0, 'no ryo for the kill itself (Tim 2026-10-19)');
  const loot = g.state.entities[a].loot;
  assert.ok(loot >= Math.round(base * (1 - k)) && loot <= Math.round(base * (1 + k)), `loot ${loot}`);
  assert.equal(gains.length, 0);
  assert.equal(g.state.clans.player.heat, 0, 'no heat');
  // the friend gives up once the hero is far away
  g.state.entities[hero].x = -40; g.state.entities[hero].z = 1;
  run(g, 2);
  assert.ok(!g.state.entities[b].angry, 'gives up when far');
  // right-click the body: the hero walks back and loots it
  g.state.entities[hero].x = -22;   // back in sight of the body
  g.step([{ id: hero, type: 'loot', target: a }]);
  run(g, 12);
  assert.equal(g.state.clans.player.ryo - ryo0, loot, 'looted the ryo');
  assert.ok(!g.state.entities[a]?.loot, 'body empty');
  console.log(`fight and loot ok (+${loot} ryo)`);
}

// Killed ones are replaced up to perNight; crew sent at a calm bandit attack it
{
  const g = newGame();
  const hero = g.spawn('hero', 'ronin', -8, 1, { owner: 'player' });
  g.step([{ type: 'time', night: true }]);
  const seen = new Set();
  for (let i = 0; i < 20 * 600; i++) {
    g.step();
    for (const b of bandits(g)) { seen.add(b.id); if (i % 200 === 0) b.hp = 0, b.dead = true, b.diedAt = g.state.tick; }
  }
  assert.equal(seen.size, B.rules.perNight, `perNight come when killed (${seen.size})`);
  const t = g.spawn('night_brute', 'brute', -1, 4, { owner: 'bandits', wild: true }); g.bandits.mind[t] = { spot: 'stay', until: 1e9 };
  const crew = g.spawn('thug', 'thug', -7, 3, { owner: 'player', order: { kind: 'follow', target: hero } });
  run(g, 2);
  assert.ok(!g.state.entities[crew].swing, 'crew ignore calm bandits');
  g.step([{ id: hero, type: 'order', units: [crew], kind: 'attack', target: t }]);
  run(g, 3);
  assert.ok(g.state.entities[t].hp < g.state.entities[t].maxHp, 'crew attack on order');
  assert.ok(g.state.entities[t].angry?.player, 'and it fights back');
  console.log('refill + crew ok');
}


// Crew loot with Ctrl + right-click; an unlooted body fades after lootSeconds
{
  const g = newGame();
  const hero = g.spawn('hero', 'ronin', -8, 1, { owner: 'player' });
  const crew = g.spawn('thug', 'thug', -4, 1, { owner: 'player', order: { kind: 'move', x: -4, z: 1 } });
  const body = g.spawn('bandit', 'bandit', 4, 1, { owner: 'bandits', wild: true, dead: true, diedAt: 0, loot: 25 });
  const left = g.spawn('bandit', 'bandit', -20, 1, { owner: 'bandits', wild: true, dead: true, diedAt: 0, loot: 25 });
  const ryo0 = g.state.clans.player.ryo;
  g.step([{ id: hero, type: 'loot', target: body, units: [crew] }]);
  run(g, 6);
  assert.equal(g.state.clans.player.ryo - ryo0, 25, 'crew looted it');
  assert.ok(Math.hypot(g.state.entities[hero].x + 8, g.state.entities[hero].z - 1) < 0.5, 'the hero stayed put');
  run(g, (B.rules.lootSeconds ?? 60) - 4);
  assert.ok(!g.state.entities[left], 'unlooted body faded');
  console.log('crew loot and fade ok');
}
console.log('bandits ok');
