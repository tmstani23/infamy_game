// Usage page model (Tim 2026-11-05): stock flows by reason, per minute. Run: node game/tools/test_frontier_usage.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { foldFlow } from '../src/sim/frontier/flow.js';
import { usageView, housingView, flowLabel } from '../src/sim/frontier/usage_view.js';
const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const state = { tick: 0, clans: {} };
const fr = createFrontier({ state, data });
const t = fr.world.addTown({ id: 'u', name: 'U', owner: 'player', x: 3000, z: 3000, pop: 5, stock: { food: 400, timber: 100 }, buildings: [{ type: 'town_hall' }] });
// one second per economy tick: +1 timber gathered, -0.5 eaten food, every tick for five minutes
for (let i = 0; i < 300; i++) { fr.world.change(t.id, 'timber', 1, 'gather'); fr.world.change(t.id, 'food', -0.5, 'eat'); foldFlow(t, 1); }
const tim = usageView(t, 'timber', data), food = usageView(t, 'food', data);
assert.equal(tim.incoming[0].name, 'Workers gathering');
assert.ok(Math.abs(tim.incoming[0].rate - 60) < 1, 'about 60 timber per minute');
assert.ok(Math.abs(food.outgoing[0].rate + 30) < 1, 'about 30 food per minute eaten');
assert.match(food.eta, /runs out/);
assert.equal(flowLabel('upkeep:zone:farm', data), 'Upkeep: farms');
assert.equal(flowLabel('work zone', data), 'Workshops');
// flows fade when they stop
for (let i = 0; i < 900; i++) foldFlow(t, 1);
assert.equal(usageView(t, 'timber', data).incoming.length, 0);
const h = housingView(t, data);
assert.equal(h.pop, 5); assert.ok(Array.isArray(h.uses));
console.log('test_frontier_usage: ok');
