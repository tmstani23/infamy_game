// The capital stable (Tim 2026-11-07, sim/frontier/stable.js buyCapital): the old rickshaw station in the city sells
// horses, rickshaws and omnibuses for clan ryo to permit holders; what you buy waits on the island side of the gate,
// counts toward your stables' room (stable.capital.room) and can be recalled and stored there.
// Run: node game/tools/test_capital_stable.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const frontier = data('data/frontier.json'), P = frontier.buildings.stable.stable.capital;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways: data('data/railways.json'), fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId], clan = S.clans.player, [gx, gz] = g.gate.island;
const buy = c => g.step([{ id: hero.id, type: 'frontier', action: 'stable', town: 'capital', ...c }]);
const mine = type => Object.values(S.entities).filter(e => e.type === type && !e.dead && (type === 'horse' ? e.horseOwner : e.omnibusOwner) === 'player');

assert.ok(g.doors.some(d => d.menu === 'capital_stable'), 'a door ring at the capital stable');
// no permit: nothing for sale
clan.ryo = 5000; delete clan.permit;
buy({ mode: 'horse', kind: 'calico' });
assert.match(S.frontier.receipts.at(-1)?.reason || '', /permit/, 'permit holders only');
assert.equal(clan.ryo, 5000);
// with a permit: a horse for ryo, waiting by the gate on the island
clan.permit = true;
buy({ mode: 'horse', kind: 'calico' }); g.step([]);
assert.equal(clan.ryo, 5000 - P.prices.calico, 'paid in clan ryo');
const h = mine('horse')[0];
assert.ok(h && h.place === 'world' && Math.hypot(h.x - gx, h.z - gz) < 12, `the horse waits outside the gate (${h && [h.x, h.z]})`);
// room: the capital stable alone holds P.room
buy({ mode: 'horse', kind: 'black_beauty', count: 5 }); g.step([]);
assert.equal(mine('horse').length, P.room.horse, 'no more than the capital stable has room for');
const last = () => S.frontier.receipts.at(-1);
buy({ mode: 'horse', kind: 'calico' });
assert.ok(!last().ok && /room/.test(last().reason), `full (${last().reason})`);
// vehicles too; short of ryo says so
buy({ mode: 'omnibus' }); g.step([]);
assert.equal(mine('omnibus').length, 1, 'an omnibus');
clan.ryo = 10;
buy({ mode: 'rickshaw' });
assert.ok(!last().ok && /ryo/.test(last().reason), 'short of ryo'); g.step([]);
assert.equal(mine('rickshaw').length, 0);
// it counts as a stable: recall stores there, take out parks by the gate
const bus = mine('omnibus')[0];
g.step([{ id: hero.id, type: 'garage', action: 'recall', unit: bus.id }]);
for (let t = 0; t < 40 && !bus.stored; t++) g.step([]);
assert.equal(bus.stored?.town, 'capital', 'stored in the capital stable');
g.step([{ id: hero.id, type: 'garage', action: 'takeout', unit: bus.id }]);
assert.ok(!bus.stored && bus.place === 'world' && Math.hypot(bus.x - gx, bus.z - gz) < 30, 'out again by the gate');
console.log('capital stable OK');
