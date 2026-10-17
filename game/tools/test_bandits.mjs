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
  let most = 0, seen = new Set();
  for (let i = 0; i < 20 * 400; i++) {
    g.step();
    const list = bandits(g);
    most = Math.max(most, list.length);
    list.forEach(b => { seen.add(b.id); assert.ok(!inWall(g, b), `bandit ${b.id} in a wall`); assert.ok(!b.swing, 'nobody attacks unprovoked'); });
  }
  assert.equal(most, B.rules.maxOut, 'fills up to the cap');
  assert.ok(seen.size <= B.rules.perNight, 'no more than perNight');
  const walked = bandits(g).filter(b => Math.abs(b.x) < 38 && Math.abs(b.z) < 38).length;
  assert.ok(walked >= bandits(g).length / 2, `they walk into town (${walked})`);
  assert.equal(g.state.entities[hero].hp, g.state.entities[hero].maxHp, 'hero left alone');
  // dawn: they all walk out
  g.step([{ type: 'time', night: false }]);
  run(g, 120);
  assert.equal(bandits(g).length, 0, 'gone by day');
  console.log(`night ok (max ${most}, ${seen.size} came)`);
}

// Hit one: it and its friends fight back; killed, they pay ryo, no heat, no downing
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
  assert.ok(!g.state.entities[a].angry, 'calm before');
  const ryo0 = g.state.clans.player.ryo;
  const gains = [];
  g.step([{ id: hero, type: 'attack', target: a }]);
  for (let i = 0; i < 20 * 30 && g.state.entities[a] && !g.state.entities[a].dead; i++) { g.step(); gains.push(...g.state.ryoGains); }
  assert.ok(!g.state.entities[a] || g.state.entities[a].dead, 'killed');
  assert.ok(!g.state.entities[a]?.downed, 'not downed');
  assert.ok(g.state.entities[b].angry?.player, 'the one nearby joins in');
  assert.ok(!g.state.entities[far].angry, 'the far one does not');
  assert.ok(g.state.hits.length >= 0 && g.state.entities[hero].hp < 100000, 'they hit back');
  const got = g.state.clans.player.ryo - ryo0, base = B.types.bandit.ryo, k = B.rules.ryoSpread;
  assert.ok(got >= Math.round(base * (1 - k)) && got <= Math.round(base * (1 + k)), `ryo ${got}`);
  assert.equal(gains.length, 1);
  assert.equal(g.state.clans.player.heat, 0, 'no heat');
  // the friend gives up once the hero is far away
  g.state.entities[hero].x = -40; g.state.entities[hero].z = 1;
  run(g, 2);
  assert.ok(!g.state.entities[b].angry, 'gives up when far');
  console.log(`fight ok (+${got} ryo)`);
}
console.log('bandits ok');
