// Tim 2026-11-25: idle war troops on the island run at a war enemy within war.spot.range (not the old 6 step reach)
// and shoot from their full range; only the player's own Z keeps them passive. A stop the game gives (pulled back at
// the war circle edge, a ceasefire, off an omnibus) is a plain hold that still fights. Built on the war_test_yakuza save.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { loadSave } from '../src/sim/save.js';
import { build } from './make_dev_save.mjs';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  frontier: { ...data('data/frontier.json'), railways: data('data/railways.json'), castleBlueprint: data('data/castle_default.json'), campaignZones: data('data/campaign_zones.json') } });
const SPOT = options().frontier.war.spot;
assert.ok(SPOT.range > 6 && SPOT.leash >= SPOT.range, 'war.spot data');
const file = JSON.stringify(build('war_test_yakuza', { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 6, warTest: true }));

// one of our troops of this unit and one enemy troop d away, everyone else sent far off; foe hp after n ticks
function duel(unit, d, order, n = 100) {
  const g = createGame(options()), S = g.state; loadSave(g, JSON.parse(file));
  const rec = Object.values(S.frontier.wars.list)[0], hall = rec.camp.buildings.find(x => x.type === 'camp_hall');
  for (const e of Object.values(S.entities)) if (e.warTroop && !e.ship) e.x += 3000;   // only the two of them near
  const x = hall.x + 40, z = hall.z;
  const a = S.entities[g.frontier.war.spawnTroop(rec, unit, x, z, rec.attacker)], b = S.entities[g.frontier.war.spawnTroop(rec, 'grunt', x + d, z, rec.defender)];
  assert.ok(a && b && a.owner === 'player', `a ${unit} and an enemy grunt`);
  a.order = order ? order(a) : { kind: 'move', x, z, arrived: true };   // standing, as new troops gather
  Object.assign(b, { order: { kind: 'stop', z: true }, holdFire: true });
  const hp = b.hp;
  for (let i = 0; i < n; i++) g.step([]);
  return { hurt: b.hp < hp, a, b, g };
}

// standing (an arrived move, as new troops gather), inside the spot range: runs up and attacks
for (const d of [8, 15]) assert.ok(duel('spearman', d).hurt, `spearman attacks an enemy ${d} away`);
// a rifleman shoots from where he stands, out past the old 6
{ const r = duel('rifleman', 9); assert.ok(r.hurt, 'rifleman shoots at 9'); }
// outside the spot range: left alone
assert.ok(!duel('spearman', SPOT.range + 5).hurt, 'nobody past the spot range');
// a stop the game gave (war circle edge, ceasefire, omnibus) is a hold, not Z
assert.ok(duel('spearman', 10, () => ({ kind: 'stop' })).hurt, 'a game stop still fights');
// the player's Z: passive even with an enemy next to him
assert.ok(!duel('spearman', 3, () => ({ kind: 'stop', z: true })).hurt, 'Z stays passive');
// Tim 2026-11-25: field cannons sent by attack-move to one spot get room for their width and then hold still
// (they bunched and ran in place, switching run and idle every tick)
{ const g = createGame(options()), S = g.state; loadSave(g, JSON.parse(file));
  const rec = Object.values(S.frontier.wars.list)[0], hall = rec.camp.buildings.find(x => x.type === 'camp_hall'), t = S.frontier.settlements[rec.town];
  const hero = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === 'player');
  const d = Math.hypot(t.x - hall.x, t.z - hall.z), ux = (t.x - hall.x) / d, uz = (t.z - hall.z) / d, tx = hall.x + ux * (d - 150), tz = hall.z + uz * (d - 150);
  const ids = [0, 1, 2, 3, 4].map(i => g.frontier.war.spawnTroop(rec, 'cannon', tx - ux * (15 + i * 3), tz - uz * (15 + i * 3), rec.attacker));
  g.step([{ id: hero.id, type: 'order', kind: 'attackmove', units: ids, x: tx, z: tz }]);
  for (let i = 0; i < 350; i++) g.step([]);
  let flips = 0; const last = {};
  for (let i = 0; i < 100; i++) { g.step([]); for (const id of ids) { const a = S.entities[id].anim; if (last[id] && last[id] !== a) flips++; last[id] = a; } }
  assert.ok(ids.every(id => S.entities[id].order?.arrived), 'every cannon got there');
  assert.ok(flips <= 2, `cannons hold still once there (${flips} run/idle switches)`);
  const P = ids.map(id => S.entities[id]);
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) assert.ok(Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) > 1.2, 'not stacked'); }
console.log('war spot ok');
