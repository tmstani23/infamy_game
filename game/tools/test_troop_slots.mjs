// 2026-11-21: guns take more troop places (war.units[unit].slots) and supply tents unlock per tier
// (war.buildings.supply_tents.maxByTier: camp before / after the hall upgrade, town by town hall tier).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tierMax, militaryWhy } from '../src/sim/frontier/town_military.js';
const F = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const W = F.war, T = W.buildings.supply_tents;
assert.equal(W.units.gatling.slots, 2); assert.equal(W.units.cannon.slots, 3); assert.equal(W.units.wooden_cannon.slots, 3);
assert.equal(W.units.grunt?.slots ?? 1, 1);
assert.equal(W.troopCap.max, 100);
assert.deepEqual([1, 2].map(t => tierMax(T, 'camp', t)), [4, 12]);
assert.deepEqual([1, 2, 3].map(t => tierMax(T, 'town', t)), [4, 12, 12]);
assert.equal(W.troopCap.base + tierMax(T, 'camp', 2) * T.cap >= W.troopCap.max, true, 'an upgraded camp reaches the cap');
assert.equal(tierMax({ max: 3 }, 'town', 1), 3, 'no list: the flat max');
// a town with 4 tents cannot place a fifth before the town hall war upgrade; after it, it can
const town = up => ({ tier: 3, ...(up ? { warHall: true } : {}), owner: 'p', buildings: Array.from({ length: 4 }, (_, i) => ({ id: i, type: 'supply_tents', stage: 'built' })), projects: [] });
assert.match(militaryWhy(town(false), 'supply_tents', F, { clans: {} }) || '', /at most 4/);
assert.equal(militaryWhy(town(true), 'supply_tents', F, { clans: {} }), null);
console.log('test_troop_slots: ok');
