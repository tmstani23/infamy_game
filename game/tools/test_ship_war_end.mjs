// Ships plan S7: war end on the ship_test dev save. A ship with the hero and crew aboard first sails to its landing
// (the attacker: the shore by its slipway) and puts only them off, then sails away and fades and leaves the map with
// the troops in its hold; a ship with nobody of note aboard sails off and fades at once; no gun fires on the way out.
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
const file = build('ship_test', { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 6, shipTest: true });
const g = createGame(options()), S = g.state; loadSave(g, JSON.parse(JSON.stringify(file)));
const F = options().frontier, R = F.war.rout;
const rec = Object.values(S.frontier.wars.list)[0];
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const hero = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === 'player');
assert.equal(rec.attacker, 'player', 'the player attacks in ship_test');
const ours = Object.values(S.entities).filter(e => e.ship && e.owner === 'player' && !e.dead);
const carrier = ours.find(e => e.warUnit === 'transport') || ours[0], other = ours.find(e => e !== carrier);
assert.ok(carrier && other, 'two ships of ours');

// put the hero, two crew and two troops in the carrier's hold
const crew = Object.values(S.entities).filter(e => e.owner === 'player' && e.crew && !e.dead && e.type !== 'hero').slice(0, 2);
const troops = [0, 1].map(k => S.entities[g.frontier.war.spawnTroop(rec, 'grunt', carrier.x + k, carrier.z, 'player')]);
for (const u of [hero, ...crew, ...troops]) { if (u.mounted) delete u.mounted; Object.assign(u, { aboard: carrier.id, inShip: carrier.id, x: carrier.x, z: carrier.z, place: 'world' }); delete u.order; }
run(2);
assert.equal(g.ships.riders(carrier).length, 1 + crew.length + troops.length, 'all aboard');

// --- the war ends ---
const slip = rec.camp.buildings.find(b => b.type === 'slipway');
g.frontier.warEnd.finish(rec, 'calledOff');
run(1);
assert.ok(other.leave?.off && other.rout, 'a ship with nobody of note aboard sails off and fades at once');
assert.ok(carrier.leave && !carrier.leave.off && !carrier.rout, 'the carrier lands its people first');
assert.equal(carrier.sorder.kind, 'land', 'it sails to a landing');
assert.ok(Math.hypot(carrier.sorder.land.x - slip.x, carrier.sorder.land.z - slip.z) < 80, 'the attacker lands by its slipway');
const fired = carrier.firedAt ?? null, ofired = other.firedAt ?? null;

// it gets there, puts off the hero and crew only, then goes
let t = 0;
for (; t < 20 * 120 && !carrier.leave?.off && !carrier.dead && S.entities[carrier.id]; t++) g.step([]);
assert.ok(carrier.leave?.off, `it puts them off and goes (${t} ticks)`);
assert.ok([hero, ...crew].every(u => !u.inShip && !u.aboard), 'the hero and crew are ashore');
assert.ok(troops.every(u => u.inShip === carrier.id || !S.entities[u.id]), 'the troops go with the ship');

// it fades and leaves the map with its troops
run(Math.round(R.seconds * 20) + 10);
assert.ok(!S.entities[carrier.id], 'the carrier has left the map');
assert.ok(!S.entities[other.id], 'and the other');
assert.ok(troops.every(u => !S.entities[u.id]), 'with the troops in its hold');
assert.ok(S.entities[hero.id] && !S.entities[hero.id].dead, 'the hero stays, on land');
assert.equal(carrier.firedAt ?? null, fired, 'no gun fired on the way out');
console.log('test_ship_war_end: ok');
