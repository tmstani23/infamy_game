// Frontier W2.3: island discovery, scouting, last-seen markers, snapshot privacy, save/load.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDiscovery } from '../src/sim/discovery.js';
import { createGame } from '../src/sim/game.js';
import { createSnapshotEncoder } from '../src/sim_snapshot.js';
import { makeSave, loadSave } from '../src/sim/save.js';

const data = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url)));
const world = data('data/world.json');
const R = world.rules.discovery;

// --- pure module: walking reveals cells along the path only ---------------------------
{
  const state = { tick: 0, clans: { player: {}, rival: {} }, entities: {
    h: { id: 'h', type: 'hero', owner: 'player', area: 'world', x: 2000, z: 4000 },
    r: { id: 'r', type: 'thug', owner: 'rival', area: 'world', x: 5200, z: 4000, dir: 2 } } };
  const d = createDiscovery({ state, world });
  const run = () => { state.tick = Math.ceil((state.tick + 1) / R.everyTicks) * R.everyTicks; d.tick(); };
  run();
  assert.ok(d.isDiscovered('player', 2000, 4000), 'start cell known');
  assert.ok(!d.isDiscovered('player', 5000, 4000), 'far cell unknown');
  const before = JSON.stringify(state);
  d.viewFor('player'); d.isDiscovered('player', 1, 1);
  assert.equal(JSON.stringify(state), before, 'reads never write');
  for (let x = 2000; x <= 5000; x += 100) { state.entities.h.x = x; run(); }
  for (let x = 2000; x <= 5000; x += 250) assert.ok(d.isDiscovered('player', x, 4000), 'path cell ' + x);
  assert.ok(!d.isDiscovered('player', 3500, 4000 + R.revealHero + 300), 'off-path cell stays fogged');
  assert.ok(!d.isDiscovered('player', 3500, 4000 - R.revealHero - 300));
  assert.ok(!d.isDiscovered('rival', 3500, 4000), 'other clan learns nothing from my walk');
  // enemy in sight -> marker now; walk away -> last-seen stays where it was, with direction
  assert.equal(state.world.lastSeen.player.r.now, true);
  state.entities.h.x = 2000; run(); state.entities.r.x = 6000; run();
  const m = state.world.lastSeen.player.r;
  assert.equal(m.now, false); assert.equal(m.x, 5200); assert.equal(m.dir, 2);
  state.entities.r.dead = true; run();
  assert.equal(state.world.lastSeen.player.r, undefined, 'dead units drop off');
  // scouting a site: only within scoutRadius of the hero
  const s = world.sites[5];
  state.entities.h.x = s.x + R.scoutRadius + 50; state.entities.h.z = s.z; run();
  assert.ok(!state.world.scouted.player.includes(s.id), 'not scouted from outside the radius');
  state.entities.h.x = s.x + R.scoutRadius - 10; run();
  assert.ok(state.world.scouted.player.includes(s.id), 'scouted within the radius');
  assert.equal(typeof state.world.discovered.player, 'string', 'plain string grid');
}

// --- in the game: city units count as at the capital; snapshot privacy; save/load ------------
function fixture() {
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'),
    cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'),
    parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), world });
  g.clans.addClan('player', { faction: 'yakuza', kind: 'yakuza', bot: false });
  g.clans.addClan('rival');
  g.spawn('hero', 'ronin', -8, 1, { owner: 'player', holdFire: true });
  g.spawn('hero', 'ronin', 8, 1, { owner: 'rival', holdFire: true });
  return g;
}
const g = fixture();
for (let i = 0; i < R.everyTicks * 2; i++) g.step([]);
assert.ok(g.discovery.isDiscovered('player', world.capital.x, world.capital.z), 'capital known at start');
assert.ok(!g.discovery.isDiscovered('player', 2000, 4000), 'west unknown at start');
// a rival walking the island: its discovery must not reach the player's snapshot
g.state.world.discovered.rival = g.state.world.discovered.rival.replace(/0/g, '1');
const packet = createSnapshotEncoder(g, 'player').encode({ map: true });
const w = packet.set.find(([k]) => k === 's:world')[1];
assert.deepEqual(Object.keys(w.discovered), ['player']);
assert.deepEqual(Object.keys(w.scouted), ['player']);
assert.deepEqual(Object.keys(w.lastSeen), ['player']);
assert.ok(!JSON.stringify(packet).includes('"rival":"1'), 'no rival grid anywhere in the packet');
// save / load keeps discovery
g.state.world.scouted.player.push('S01');
const save = JSON.parse(JSON.stringify(makeSave(g)));
const g2 = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'),
  cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'),
  parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json'), world });
loadSave(g2, save);
assert.equal(g2.state.world.discovered.player, g.state.world.discovered.player);
assert.deepEqual(g2.state.world.scouted.player, g.state.world.scouted.player);
// map pins: command adds/removes own pins only; rejected commands change nothing; cap from rules
{
  const hero = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === 'player');
  const rivalHero = Object.values(g.state.entities).find(e => e.type === 'hero' && e.owner === 'rival');
  g.step([{ id: hero.id, type: 'world', action: 'pin', x: 5000, z: 3000, note: 'x'.repeat(200) }]);
  const pins = g.state.world.pins.player;
  assert.equal(pins.length, 1); assert.equal(pins[0].note.length, R.pinNoteChars);
  const before = JSON.stringify(g.state.world);
  g.discovery.command(hero, { type: 'world', action: 'pin', x: -5, z: 3000 });
  g.discovery.command(hero, { type: 'world', action: 'unpin', pin: 'nope' });
  g.discovery.command(rivalHero, { type: 'world', action: 'unpin', pin: pins[0].id });
  assert.equal(JSON.stringify(g.state.world), before, 'rejected pin commands change nothing');
  const p2 = createSnapshotEncoder(g, 'player').encode({ map: true }).set.find(([k]) => k === 's:world')[1];
  assert.deepEqual(Object.keys(p2.pins), ['player']); assert.equal(p2.pins.player.length, 1);
  for (let i = 0; i < R.maxPins + 5; i++) g.discovery.command(hero, { type: 'world', action: 'pin', x: 100 + i, z: 100 });
  assert.equal(g.state.world.pins.player.length, R.maxPins, 'pin cap');
  g.discovery.command(hero, { type: 'world', action: 'unpin', pin: pins[0].id });
  assert.equal(g.state.world.pins.player.length, R.maxPins - 1);
}
// a game without world data runs as before
const plain = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'),
  cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'),
  parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json') });
plain.step([]); assert.equal(plain.state.world, undefined);
console.log('test_discovery: ok');
