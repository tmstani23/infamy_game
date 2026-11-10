// Checks fog of war in the sim: node game/tools/test_vision.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json');
const newGame = () => {
  const g = createGame({
    district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  });
  g.clans.addClan('player');
  g.clans.addClan('kuroda', { bot: true });
  return g;
};
const run = (g, s, cmds = []) => { g.step(cmds); for (let i = 1; i < s * 20; i++) g.step(); };
const R = units.rules.vision.range;
const explored = (g, clan, x, z) => g.vision.grid(clan).explored[g.vision.cellOf(x, z)] === 1;

// Sight around the hero, nothing far away; explored stays once seen
{
  const g = newGame();
  const hero = g.spawn('hero', 'ronin', -8, 1, { owner: 'player' });
  const near = g.spawn('thug', 'thug', -8 + R - 2, 1, { owner: 'kuroda', order: { kind: 'station', x: -8 + R - 2, z: 1 } });
  const far = g.spawn('thug', 'thug', 30, 30, { owner: 'kuroda', order: { kind: 'station', x: 30, z: 30 } });
  g.step();
  assert.ok(g.vision.canSee('player', g.state.entities[near]), 'enemy inside range seen');
  assert.ok(!g.vision.canSee('player', g.state.entities[far]), 'enemy far away hidden');
  assert.ok(g.vision.canSee('player', g.state.entities[hero]), 'own units always seen');
  assert.ok(explored(g, 'player', -8, 1) && !explored(g, 'player', 30, 30), 'explored only near the hero');
  // walk the hero away east along the street; where he was stays explored but no longer in sight
  g.state.entities[hero].x = 28; g.state.entities[hero].z = 1;
  run(g, 1);
  assert.ok(explored(g, 'player', -8, 1), 'explored stays');
  assert.equal(g.vision.grid('player').visible[g.vision.cellOf(-20, 1)], 0, 'old spot out of sight');
  console.log('sight and explored ok');
}

// Bots get the same rule; downed units give no sight; an owned business does
{
  const g = newGame();
  const thug = g.spawn('thug', 'thug', 30, 30, { owner: 'kuroda', order: { kind: 'station', x: 30, z: 30 } });
  const hero = g.spawn('hero', 'ronin', -20, -8, { owner: 'player' });
  g.step();
  assert.ok(!g.vision.canSee('kuroda', g.state.entities[hero]), 'bot cannot see the far hero');
  const crew = g.spawn('thug', 'thug', 0, 0, { owner: 'player', downed: true });
  run(g, 1);
  assert.ok(!explored(g, 'player', 0, 0) || Math.hypot(20, 8) < R, 'downed crew give no sight');
  const den = Object.values(g.state.businesses).find(b => b.kind === 'gambling_den');
  den.owner = 'player';
  run(g, 1);
  assert.ok(explored(g, 'player', den.x, den.z), 'owned business gives sight');
  void crew;
  console.log('bots, downed, business ok');
}

// Attack orders on units the clan cannot see are refused
{
  const g = newGame();
  const hero = g.spawn('hero', 'ronin', -20, -8, { owner: 'player' });
  const far = g.spawn('thug', 'thug', 30, 30, { owner: 'kuroda', order: { kind: 'station', x: 30, z: 30 } });
  run(g, 1);
  g.step([{ id: hero, type: 'attack', target: far }]);
  assert.equal(g.state.entities[hero].attackTarget, undefined, 'hero lock on a hidden unit refused');
  const near = g.spawn('thug', 'thug', -16, -8, { owner: 'kuroda', order: { kind: 'station', x: -16, z: -8 } });
  run(g, 1);
  g.step([{ id: hero, type: 'attack', target: near }]);
  assert.equal(g.state.entities[hero].attackTarget, near, 'hero lock on a seen unit works');
  console.log('attack orders ok');
}

// Rooms: seen only with a unit of the clan in the same room
{
  const g = newGame();
  const room = g.rooms[0];
  g.spawn('hero', 'ronin', -8, 1, { owner: 'player' });
  const inside = g.spawn('thug', 'thug', room.spawn.x, room.spawn.z, { owner: 'kuroda', place: room.name, order: { kind: 'station', x: room.spawn.x, z: room.spawn.z } });
  g.step();
  assert.ok(!g.vision.canSee('player', g.state.entities[inside]), 'room hidden from the street');
  g.spawn('thug', 'thug', room.spawn.x + 1, room.spawn.z, { owner: 'player', place: room.name });
  assert.ok(g.vision.canSee('player', g.state.entities[inside]), 'room seen from inside');
  console.log('rooms ok');
}

// The state stays plain JSON (it is what gets synced)
{
  const g = newGame();
  g.spawn('hero', 'ronin', -8, 1, { owner: 'player' });
  g.step();
  assert.deepEqual(JSON.parse(JSON.stringify(g.state)), g.state);
  console.log('plain state ok');
}
// island sight by day and night (Tim 2026-11-10): data/world_chunks.json sight
{
  const { createVision } = await import('../src/sim/vision.js');
  const sight = JSON.parse((await import('node:fs')).readFileSync(new URL('../data/world_chunks.json', import.meta.url), 'utf8')).sight;
  const state = { night: false, entities: { me: { id: 'me', owner: 'p', type: 'hero', place: 'world', x: 0, z: 0 }, foe: { id: 'foe', owner: 'q', type: 'bandit', place: 'world', x: 0, z: 0 } } };
  const v = createVision(state, { minX: 0, minZ: 0, maxX: 4, maxZ: 4 }, {}, null, { ...sight, lightsNear: () => [] });
  const at = d => { state.entities.foe.x = d; return v.canSee('p', state.entities.foe); };
  state.night = false; assert.ok(at(sight.dayRange - 1) && !at(sight.dayRange + 1), 'day sight is dayRange');
  state.night = true; assert.ok(at(sight.range - 1) && !at(sight.range + 1), 'night sight is range');
  console.log('island day/night sight ok');
}
