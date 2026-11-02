// Save and load (frontier F1): dawn saves replay exactly; any-time saves keep the important state.
// Runs a full 3-clan match with bots, like the worker. About a minute.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), frontier: data('data/frontier.json') };   // frontier towns run inside the match (F2.10)
const clan = process.argv[2] || 'yakuza', dawns = +(process.argv[3] || 2);
const match = { clan, difficulty: 'medium', bots: data('data/bots.json'), spawns: options.district.spawns, test: {} };

function newMatch() {
  const game = createGame(options), m = setupMatch(game, match);
  game.civilians.populate();
  return { game, bots: makeBots(game, m.rivals) };
}
const run = (m, n) => { for (let i = 0; i < n; i++) m.game.step(m.bots.flatMap(b => b.tick())); };
const roundTrip = save => JSON.parse(JSON.stringify(save));   // saves go through a JSON file
function load(save) { const game = createGame(options); return { game, bots: loadSave(game, roundTrip(save)) }; }
function diffKeys(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const out = keys.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (out.includes('entities')) {
    const ids = [...new Set([...Object.keys(a.entities), ...Object.keys(b.entities)])]
      .filter(id => JSON.stringify(a.entities[id]) !== JSON.stringify(b.entities[id]));
    const fields = new Set();
    for (const id of ids) for (const f of new Set([...Object.keys(a.entities[id] || {}), ...Object.keys(b.entities[id] || {})]))
      if (JSON.stringify(a.entities[id]?.[f]) !== JSON.stringify(b.entities[id]?.[f])) fields.add(`${a.entities[id]?.type ?? b.entities[id]?.type}.${f}`);
    out[out.indexOf('entities')] = `entities(${ids.length}: ${[...fields].slice(0, 12).join(' ')})`;
  }
  return out;
}

const t0 = Date.now();
const A = newMatch();
let seen = 0;
while (seen < dawns) { run(A, 1); if (A.game.state.dawn) seen++; }
// F2.10: a frontier project is half done at the dawn save (shipments in flight join after F3)
{ const s = A.game.state.frontier.settlements.s_frontier_1;
  s.projects.push({ id: A.game.frontier.world.newId('p'), type: 'stockade', cell: null, cost: { timber: 40 }, paid: true, progress: 10, need: 60, authorized: true }); }
const econAtSave = A.game.state.frontier.econTick;
const dawnSave = makeSave(A.game, { bots: A.bots });
assert.equal(dawnSave.tick, A.game.state.tick);

// Dawn case: exact replay
run(A, 300);
const C = load(dawnSave);
run(C, 300);
const diff = diffKeys(A.game.state, C.game.state);
console.log(`dawn at tick ${dawnSave.tick} (${Date.now() - t0} ms), save ${Math.round(JSON.stringify(dawnSave).length / 1024)} KB`);
if (diff.length) console.log('dawn parity diff keys:', diff.join(', '));
assert.deepEqual(diff, [], 'dawn save replays exactly');

// F2.10: 50 economy ticks after the dawn save, the loaded game's frontier equals the straight run
run(A, 700); run(C, 700);
assert.equal(A.game.state.frontier.econTick - econAtSave, 50, '50 economy ticks since the save');
assert.equal(JSON.stringify(C.game.state.frontier), JSON.stringify(A.game.state.frontier), 'frontier survives the dawn save');
{ const s = C.game.state.frontier.settlements.s_frontier_1;
  assert.equal(s.projects.length, 0, 'the half-done project finished');
  assert.ok(s.buildings.some(b => b.type === 'stockade'), 'and became a building');
  C.game.frontier.world.checkInvariants(); }

// Any-time case: mid-fight
let guard = 0;
while (!Object.values(A.game.state.entities).some(e => e.swing && !e.dead) && guard++ < 8000) run(A, 1);
assert.ok(guard < 8000, 'found a fight to save in');
const fightSave = makeSave(A.game, { bots: A.bots });
const D = load(fightSave);
const key = e => ({ owner: e.owner, hp: e.hp, place: e.place, type: e.type, order: e.order?.kind ?? null });
for (const [id, e] of Object.entries(A.game.state.entities)) {
  const d = D.game.state.entities[id];
  assert.ok(d, `entity ${id} kept`);
  assert.deepEqual(key(d), key(e), `entity ${id} kept owner, hp, place, order`);
  assert.ok(Math.hypot(d.x - e.x, d.z - e.z) <= 0.01, `entity ${id} position`);
}
assert.deepEqual(Object.keys(D.game.state.entities).sort(), Object.keys(A.game.state.entities).sort());
for (const c of Object.keys(A.game.state.clans)) assert.equal(D.game.state.clans[c].ryo, A.game.state.clans[c].ryo);
for (const [id, b] of Object.entries(A.game.state.businesses)) assert.equal(D.game.state.businesses[id].owner, b.owner);
for (const c of Object.keys(A.game.state.clans)) {
  const e = Object.values(D.game.state.entities).find(u => u.type === 'hero' && u.owner === c);
  if (e) assert.equal(e.equipment, D.game.state.clans[c].inventory.equipment, 'hero equipment linked to clan inventory');
}
run(A, 600); run(D, 600);   // keeps running with no thrown error
assert.deepEqual(diffKeys(A.game.state, D.game.state), [], 'any-time save keeps running the same');

// Version check
assert.throws(() => loadSave(createGame(options), { ...dawnSave, version: 999 }), /different version/);
console.log(`test_save: ok (${Date.now() - t0} ms)`);
