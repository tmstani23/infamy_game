// Frontier W3.5: the city gate. In a campaign the hero and his group go out onto the island and back;
// positions line up with the gate; Classic refuses; a full match with bots runs on while he is out.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json') });

function match(mode) {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: g.settings ? options().district.spawns : {} });
  return { g, m, hero: g.state.entities[m.heroId], bots: makeBots(g, m.rivals) };
}
const [cgx, cgz] = (() => { const d = options().district.islandGate; return [d.x, d.z]; })();

// --- Classic: the gate stays shut --------------------------------------------------------
{
  const { g, hero } = match('classic');
  assert.ok(g.gate, 'gate exists');
  Object.assign(hero, { x: cgx, z: cgz });
  g.step([{ id: hero.id, type: 'use', units: [] }]);
  assert.equal(hero.place, 'street', 'Classic refuses the gate');
  assert.match(g.state.clans.player.notice?.text || '', /campaign/);
}

// --- Campaign: out with the group, walk about, back in ------------------------------------
const { g, hero, bots } = match('campaign');
const run = (n, cmds = () => []) => { for (let i = 0; i < n; i++) g.step([...bots.flatMap(b => b.tick()), ...cmds(i)]); };
// two crew: one following the hero, one selected; one left far away stays in the city
const spawnCrew = (x, z) => g.state.entities[g.spawn('thug', 'thug', x, z, { owner: 'player' })];
Object.assign(hero, { x: cgx, z: cgz });
const a = spawnCrew(cgx + 3, cgz + 1), b = spawnCrew(cgx + 4, cgz - 1), far = spawnCrew(6, 8);
for (const u of [a, b, far]) if (u.deployment) u.deployment.group = 'hero';
g.step([{ id: hero.id, type: 'order', units: [a.id], kind: 'follow' }]);
Object.assign(hero, { x: cgx, z: cgz }); Object.assign(a, { x: cgx + 3, z: cgz + 1 }); Object.assign(b, { x: cgx + 4, z: cgz - 1 });
g.step([{ id: hero.id, type: 'use', units: [b.id] }]);
assert.equal(hero.place, 'world', 'hero is out on the island');
assert.ok(Math.hypot(hero.x - g.gate.island[0], hero.z - g.gate.island[1]) <= 1, 'hero stands at the island side of the gate');
assert.ok(g.areas.nav.free(hero.x, hero.z), 'island side of the gate is walkable');
assert.equal(a.place, 'world', 'the follower came along');
assert.equal(b.place, 'world', 'the selected crew came along');
assert.equal(far.place, 'street', 'crew far from the gate stay in the city');
for (const u of [a, b]) assert.ok(Math.hypot(u.x - hero.x, u.z - hero.z) < 4, 'group stands round the hero');
{ const c = g.areas.city; assert.ok(!(hero.x > c.minX && hero.x < c.maxX && hero.z > c.minZ && hero.z < c.maxZ), 'outside the city on the island'); assert.equal(g.gate.side, 'E', 'the gate is at the east trail end, away from the bandit camp and the Shinobi village'); }
// walk east for 20 s, away from the city wall (screen right-down = island east); the group follows; bots keep playing in the city
const x0 = hero.x;
run(400, () => [{ id: hero.id, type: 'move', right: 0.7, down: 0.7 }]);
assert.equal(hero.place, 'world');
assert.ok(hero.x - x0 > 30, `hero walked east on the island (${(hero.x - x0).toFixed(0)} units)`);
run(120, i => i ? [] : [{ id: hero.id, type: 'move', right: 0, down: 0 }]);   // he stops; they catch up
for (const u of [a, b]) assert.ok(Math.hypot(u.x - hero.x, u.z - hero.z) < 5, `crew caught up (${Math.hypot(u.x - hero.x, u.z - hero.z).toFixed(1)} away)`);
assert.ok(g.areas.active().length >= 9, 'chunks round the group are awake');
// save while out on the island and load it: same place, chunks wake, walking still works
{
  const save = JSON.parse(JSON.stringify(makeSave(g, { bots })));
  const g2 = createGame(options()); loadSave(g2, save);
  const h2 = g2.state.entities[hero.id];
  assert.equal(h2.place, 'world');
  g2.step([]);
  assert.equal(g2.areas.active().length, g.areas.active().length, 'the same chunks wake after a load');
  const before = h2.x;
  for (let i = 0; i < 60; i++) g2.step([{ id: h2.id, type: 'move', right: -0.7, down: -0.7 }]);
  assert.ok(before - h2.x > 5, 'walks on after a load');
}
// back to the gate and in
g.step([]);
Object.assign(hero, { x: g.gate.island[0], z: g.gate.island[1] });
const outThere = Object.values(g.state.entities).filter(u => u.place === 'world' && u.owner === 'player' && u.type !== 'hero');   // a and b, plus starting crew that followed him out
outThere.forEach((u, k) => Object.assign(u, { x: hero.x - 2 + (k % 3), z: hero.z + 1 + Math.floor(k / 3) }));
g.step([{ id: hero.id, type: 'use', units: outThere.map(u => u.id) }]);
assert.equal(hero.place, 'street', 'back in the city');
assert.ok(Math.hypot(hero.x - g.gate.inside[0], hero.z - g.gate.inside[1]) <= 1 && Math.hypot(hero.x - cgx, hero.z - cgz) < 4, 'hero stands just inside the gate');
assert.equal(a.place, 'street'); assert.equal(b.place, 'street');
run(200);
assert.equal(g.areas.active().length, 0, 'nobody on the island: every chunk asleep');
// --- Dev-only instant travel (Tim 2026-11-02): refused without the dev build, works with it -------
{
  const { g: g3, hero: h3 } = match('campaign');
  g3.step([{ id: h3.id, type: 'travel', x: 9000, z: 4000, units: [] }]);
  assert.equal(h3.place, 'street', 'no instant travel outside the dev build');
}
{
  const o = options(); o.frontier = { ...data('data/frontier.json'), dev: true };
  const g4 = createGame(o), m4 = setupMatch(g4, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: o.district.spawns });
  const h4 = g4.state.entities[m4.heroId];
  const f = g4.state.entities[g4.spawn('thug', 'thug', h4.x + 2, h4.z, { owner: 'player' })];
  if (f.deployment) f.deployment.group = 'hero';
  g4.step([{ id: h4.id, type: 'order', units: [f.id], kind: 'follow' }]);
  Object.assign(f, { x: h4.x + 2, z: h4.z });
  const [cx, cz] = [g4.areas.city.minX - 2500, g4.areas.city.minZ + 200];
  g4.step([{ id: h4.id, type: 'travel', x: cx, z: cz, units: [] }]);
  assert.equal(h4.place, 'world', 'dev travel: hero on the island');
  assert.ok(Math.hypot(h4.x - cx, h4.z - cz) < 15 && g4.areas.nav.free(h4.x, h4.z), 'dev travel: hero on free ground near the click');
  assert.equal(f.place, 'world', 'dev travel: the follower came along');
  const sea = [g4.areas.city.maxX + 3000, g4.areas.city.minZ];   // far out in the sea east of the capital
  const [hx, hz] = [h4.x, h4.z];
  g4.step([{ id: h4.id, type: 'travel', x: sea[0], z: sea[1], units: [] }]);
  assert.ok(h4.place === 'world' && Math.hypot(h4.x - hx, h4.z - hz) < 3, 'dev travel: refused onto the sea');
  g4.step([{ id: h4.id, type: 'travel', city: true, units: [] }]);
  assert.equal(h4.place, 'street', 'dev travel: back to the city from the capital');
  assert.ok(Math.hypot(h4.x - g4.gate.inside[0], h4.z - g4.gate.inside[1]) < 2, 'dev travel: lands just inside the gate');
  assert.equal(f.place, 'street', 'dev travel: the follower came home too');
}
console.log('test_world_gate: ok');
