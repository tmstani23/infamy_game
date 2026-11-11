// Tim 2026-11-07: crew horses (sim/mounts.js mountUp): Shift+H puts the hero and his crew on horses; settlers never ride; hits put crew off; vehicles take crew without the hero (sim/omnibus.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), U = data('data/units.json');
const SB = frontier.buildings.stable.stable, M = U.rules.mount;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId], clan = S.clans.player;
const site = world.sites.find(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700) || world.sites[0];
g.frontier.world.addTown({ id: 'tS', name: 'Stableton', owner: 'player', x: site.x, z: site.z, pop: 3, stock: { food: 500, goods: 300, timber: 400, stone: 200 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const town = S.frontier.settlements.tS;
const cmd = c => g.step([{ id: hero.id, type: 'frontier', action: 'stable', town: 'tS', ...c }]);
Object.assign(hero, { place: 'world', x: site.x + 60, z: site.z + 60 });
g.step([]);   // the town gets its grid

// --- no stable: nothing to make ---------------------------------------------------------------------
const nearCell = s => { let best = -1, bd = Infinity; s.grid.use.split('').forEach((c, i) => { if (c !== '.') return; const [x, z] = g.frontier.stable.centre(s, { cell: i }), d = Math.hypot(x - s.x, z - s.z); if (d > 25 && d < bd) { bd = d; best = i; } }); return best; };
town.buildings.push({ id: 'st1', type: 'stable', cell: nearCell(town), stage: 'built' });
town.tier = 2; town.stock.timber = 2000; town.stock.goods = 2000; town.stock.food = 2000;
const [sx, sz] = g.frontier.stable.centre(town, town.buildings.at(-1));
for (const n of [3, 1]) { for (let k = 0; k < n; k++) cmd({ mode: 'horse', kind: 'calico' }); for (let t = 0; t < n * 60 * 20 + 40; t++) g.step([]); }
const myHorses = () => Object.values(S.entities).filter(e => e.type === 'horse' && e.horseOwner === 'player' && !e.dead);
assert.ok(myHorses().length >= 4, `horses ready (${myHorses().length})`);
Object.assign(hero, { place: 'world', x: sx + 30, z: sz + 30 }); hero.hitAt = -1e9;
const crew = [0, 1, 2].map(k => S.entities[g.spawn('thug', 'thug', hero.x + 2 + k, hero.z + 2, { owner: 'player', place: 'world', hp: 100, order: { kind: 'follow', target: hero.id } })]);
const settler = S.entities[g.spawn('settler', 'laborer', hero.x - 2, hero.z + 2, { owner: 'player', place: 'world', holdFire: true, order: { kind: 'follow', target: hero.id } })];
for (const h of myHorses()) Object.assign(h, { x: hero.x + 8, z: hero.z - 4 });
const up = () => g.step([{ id: hero.id, type: 'mount', group: true }]);
up();
for (let t = 0; t < 60; t++) g.step([]);
assert.ok(hero.mounted, 'the hero is up');
assert.ok(crew.every(u => u.mounted && u.ride?.kind === 'horse'), `crew are up (${crew.map(u => !!u.mounted)})`);
assert.ok(!settler.mounted, 'settlers never ride');
// crew follow at horse speed
const x0 = crew[0].x;
for (let t = 0; t < 60; t++) g.step([{ id: hero.id, type: 'move', right: 1, down: 0 }]);
for (let t = 0; t < 20; t++) g.step([]);
assert.ok(Math.hypot(crew[0].x - hero.x, crew[0].z - hero.z) < 20, `mounted crew kept up (${Math.hypot(crew[0].x - hero.x, crew[0].z - hero.z).toFixed(1)})`);
// a group move while mounted (Tim 2026-11-10): riders end a horse length apart and the horses stand still
{
  const tx = hero.x + 30, tz = hero.z + 20;
  g.step([{ id: hero.id, type: 'order', units: crew.map(u => u.id), kind: 'move', x: tx, z: tz }]);
  for (let t = 0; t < 20 * 15; t++) g.step([]);
  for (const u of crew) {
    assert.ok(u.mounted && Math.hypot(u.x - tx, u.z - tz) < 8, `rider got there (${Math.hypot(u.x - tx, u.z - tz).toFixed(1)})`);
    for (const o of crew) if (o !== u) assert.ok(Math.hypot(o.x - u.x, o.z - u.z) > 2, `riders not clustered (${Math.hypot(o.x - u.x, o.z - u.z).toFixed(1)})`);
  }
  let running = 0;
  for (let t = 0; t < 40; t++) { g.step([]); running += myHorses().filter(h => h.rider && h.rider !== hero.id && h.anim !== 'idle').length; }
  assert.equal(running, 0, 'stopped horses stand still');
  g.step([{ id: hero.id, type: 'order', units: crew.map(u => u.id), kind: 'follow' }]);
  for (let t = 0; t < 20 * 10; t++) g.step([]);
}
const ridden = state => myHorses().find(h => h.rider === crew[1].id);
const h1 = ridden();
assert.ok(h1 && Math.hypot(h1.x - crew[1].x, h1.z - crew[1].z) < 0.01, 'the horse is under him');
// a hit puts him off; the horse waits there
crew[1].hitBy = { id: 'x', tick: S.tick }; g.step([]);
assert.ok(!crew[1].mounted && !h1.rider, 'off when hit');
// Shift+H again: everyone off
up();
assert.ok(!hero.mounted && crew.every(u => !u.mounted), 'everyone off');
// short of horses: a note
for (let k = 0; k < 4; k++) crew.push(S.entities[g.spawn('thug', 'thug', hero.x + 3, hero.z + 3 + k, { owner: 'player', place: 'world', hp: 100, order: { kind: 'follow', target: hero.id } })]);
up();
assert.match(clan.notice?.text || '', /no horse/, `short of horses (${clan.notice?.text})`);
up(); for (let t = 0; t < 5; t++) g.step([]);
// crew into a rickshaw without the hero (Tim 2026-11-07): they walk over and get in, two seats
for (const u of crew) if (u.mounted) g.step([{ id: hero.id, type: 'mount', group: true }]);
cmd({ mode: 'rickshaw' }); for (let t = 0; t < 50 * 20; t++) g.step([]);
// right-click one horse with a group selected (Tim 2026-11-10): only the nearest runs over and rides her, no other horse moves
{
  for (const u of crew) if (u.mounted) g.step([{ id: hero.id, type: 'mount', horse: u.ride.horse, units: [u.id] }]);
  if (hero.mounted) g.step([{ id: hero.id, type: 'mount' }]);
  const frees = myHorses().filter(h => !h.rider && h.id !== clan.mount && !h.stored && h.place === 'world');
  const one = frees[0], others = frees.slice(1).map(h => [h, h.x, h.z]);
  crew.forEach((u, k) => Object.assign(u, { x: one.x + 20 + k * 3, z: one.z, order: { kind: 'stop' } }));
  g.step([{ id: hero.id, type: 'mount', horse: one.id, units: crew.map(u => u.id) }]);
  assert.ok(!crew.some(u => u.mounted), 'nobody is up at once from 20 away');
  for (let t = 0; t < 20 * 8 && !one.rider; t++) g.step([]);
  assert.equal(one.rider, crew[0].id, 'the nearest ran over and rides her');
  assert.equal(crew.filter(u => u.mounted).length, 1, 'only one of the group mounted');
  for (const [h, x, z] of others) assert.ok(!h.called && Math.hypot(h.x - x, h.z - z) < 0.5, 'no other horse came running');
  g.step([{ id: hero.id, type: 'mount', horse: one.id, units: [crew[0].id] }]);
}
const rk = Object.values(S.entities).find(e => e.type === 'rickshaw' && e.omnibusOwner === 'player');
assert.ok(rk, 'a rickshaw');
Object.assign(rk, { x: hero.x + 20, z: hero.z });
const three = crew.filter(u => !u.dead && !u.mounted).slice(0, 3);
g.step([{ id: hero.id, type: 'omnibus', action: 'board', omnibus: rk.id, units: three.map(u => u.id), crewOnly: true }]);
for (let t = 0; t < 200 && Object.values(S.entities).filter(u => u.aboard === rk.id).length < 2; t++) g.step([]);
const inside = Object.values(S.entities).filter(u => u.aboard === rk.id);
assert.equal(inside.length, 2, `two crew got in (${inside.length})`);
assert.ok(!hero.aboard, 'the hero stayed out');
const rx = rk.x; for (let t = 0; t < 40; t++) g.step([]);
assert.ok(Math.abs(rk.x - rx) < 0.5, 'it stays put until told');
g.step([{ id: hero.id, type: 'omnibus', action: 'deploy', vehicles: [rk.id] }]);
assert.equal(Object.values(S.entities).filter(u => u.aboard === rk.id).length, 0, 'let out');
// one at a time: a second crew member joins the one already inside (Tim 2026-11-07: same as the omnibus)
for (const u of three.slice(0, 2)) {
  g.step([{ id: hero.id, type: 'omnibus', action: 'board', omnibus: rk.id, units: [u.id], crewOnly: true }]);
  for (let t = 0; t < 200 && u.aboard !== rk.id; t++) g.step([]);
  assert.equal(u.aboard, rk.id, 'got in one at a time');
}
g.step([{ id: hero.id, type: 'omnibus', action: 'board', omnibus: rk.id, units: [three[2].id], crewOnly: true }]);
assert.ok(!three[2].boardBus, 'full: no third');
// the hero gets in with nobody selected (Tim 2026-11-10): a man standing by him (stepped out earlier, told to stay) comes too
{
  g.step([{ id: hero.id, type: 'omnibus', action: 'deploy', vehicles: [rk.id] }]);
  assert.equal(Object.values(S.entities).filter(u => u.aboard === rk.id).length, 0, 'rickshaw emptied');
  if (hero.mounted) g.step([{ id: hero.id, type: 'mount' }]);
  for (const u of crew) Object.assign(u, { x: rk.x + 60, z: rk.z, order: { kind: 'stop' } });
  Object.assign(hero, { x: rk.x + 2, z: rk.z + 1 }); Object.assign(crew[0], { x: rk.x + 4, z: rk.z + 2 });
  g.step([{ id: hero.id, type: 'omnibus', action: 'board', omnibus: rk.id, units: [], crewOnly: false }]);
  assert.equal(hero.aboard, rk.id, 'the hero is in');
  assert.equal(crew[0].aboard, rk.id, 'and the man standing by him');
  // his own seat: only he steps out, the vehicle waits with the other aboard
  g.step([{ id: hero.id, type: 'omnibus', action: 'deploy', vehicles: [rk.id], units: [hero.id], hero: true }]);
  assert.ok(!hero.aboard && crew[0].aboard === rk.id && rk.vorder?.kind === 'stay', 'only the hero stepped out');
  // and back into the loaded one (Tim 2026-11-10: he could not board with crew already aboard)
  Object.assign(hero, { x: rk.x + 2, z: rk.z + 1 });
  g.step([{ id: hero.id, type: 'omnibus', action: 'board', omnibus: rk.id, units: [], crewOnly: false }]);
  assert.ok(hero.aboard === rk.id && crew[0].aboard === rk.id, 'the hero gets into a vehicle with crew aboard');
  assert.equal(Object.values(S.entities).filter(u => u.aboard === rk.id).length, 2, 'two seats, two riders');
}
console.log('test_crew_horses: ok');
