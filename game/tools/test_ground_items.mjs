// Dropped bag items (sim/ground_items.js, Tim 2026-11-26): drop outdoors only, bundle lies 15 minutes, anyone takes it.
import assert from 'node:assert/strict';
import { createInventory } from '../src/sim/inventory.js';
import { createItemServices } from '../src/sim/item_services.js';
import { createGroundItems, groundItemsFor } from '../src/sim/ground_items.js';
import { GROUND_ITEMS } from '../src/sim/gear_catalog.js';

const state = { tick: 0, entities: {}, clans: { player: { id: 'player', kind: 'yakuza', ryo: 0 }, rival: { id: 'rival', kind: 'yakuza', ryo: 0, bot: true } }, businesses: {}, ryoGains: [], news: [], banditCamps: [] };
const inventory = createInventory({ state, baseHp: () => 400 });
const h = { id: 'h', owner: 'player', type: 'hero', place: 'world', x: 10, z: 10, hp: 400, maxHp: 400 };
const r = { id: 'r', owner: 'rival', type: 'hero', place: 'world', x: 80, z: 80, hp: 400, maxHp: 400 };
state.entities = { h, r }; inventory.initialize(h); inventory.initialize(r);
const items = createItemServices({ state });
const ground = createGroundItems({ state, give: items.give });
const bag = state.clans.player.inventory.bag;
bag[3] = 'honed_weapon';
// indoors: refused, item stays
h.place = 'room_1'; assert.equal(ground.command(h, { action: 'drop', index: 3 }), false); assert.equal(bag[3], 'honed_weapon');
h.place = 'world';
const id = ground.command(h, { action: 'drop', index: 3 });
assert.ok(id, 'dropped outdoors'); assert.equal(bag[3], null);
const b = state.groundItems.items[id];
assert.deepEqual([b.item, b.place, b.x, b.z, b.by], ['honed_weapon', 'world', 10, 10, 'player']);
assert.equal(ground.command(h, { action: 'drop', index: 3 }), false, 'empty slot drops nothing');
// pick it back up, then drop again
assert.equal(ground.command(h, { action: 'pick' }), true); assert.ok(bag.includes('honed_weapon'));
const id2 = ground.command(h, { action: 'drop', index: bag.indexOf('honed_weapon') });
// out of reach: no pick
h.x += GROUND_ITEMS.reach + 1; assert.equal(ground.command(h, { action: 'pick' }), false); h.x = 10;
// full bag: stays on the ground
bag.fill('focus_charm'); assert.equal(ground.command(h, { action: 'pick' }), false); assert.ok(state.groundItems.items[id2]); bag.fill(null);
// snapshot: rival sees it only on discovered ground
assert.ok(groundItemsFor(state, 'player', null)[id2], 'own bundle always sent');
assert.equal(groundItemsFor(state, 'rival', { isDiscovered: () => false })[id2], undefined);
assert.ok(groundItemsFor(state, 'rival', { isDiscovered: () => true })[id2]);
// a rival bot hero walking past takes it (wears it if it beats its empty slot)
r.x = 10.5; r.z = 10; state.tick = 10; ground.tick();
assert.equal(state.groundItems.items[id2], undefined, 'rival bot picked it up');
const rv = state.clans.rival.inventory; assert.ok(rv.equipment.weapon === 'honed_weapon' || rv.bag.includes('honed_weapon'));
// expiry after lifeSeconds
r.x = 80; bag[0] = 'heirloom_yakuza'; const id3 = ground.command(h, { action: 'drop', index: 0 });
state.tick += GROUND_ITEMS.lifeSeconds * 20 - 5; ground.tick(); assert.ok(state.groundItems.items[id3], 'still there just before');
state.tick += 10; ground.tick(); assert.equal(state.groundItems.items[id3], undefined, 'gone after 15 minutes');
// downed or aboard: no drop
bag[0] = 'honed_weapon'; h.downed = true; assert.equal(ground.command(h, { action: 'drop', index: 0 }), false); delete h.downed;
h.aboard = 'ship1'; assert.equal(ground.command(h, { action: 'drop', index: 0 }), false); delete h.aboard;
// right-click a bundle: the hero walks over (one step a tick) and takes it on arrival
{ const walk = (e, u, x, z) => { const d = Math.hypot(x - e.x, z - e.z), s = Math.min(d, 0.5); e.x += (x - e.x) / d * s; e.z += (z - e.z) / d * s; return true; };
  const g2 = createGroundItems({ state, give: items.give, moveTo: walk });
  bag.fill(null); bag[0] = 'focus_charm'; h.x = 0; h.z = 0; const id4 = g2.command(h, { action: 'drop', index: 0 }); h.x = 6;
  assert.equal(g2.command(h, { action: 'fetch', bundle: id4 }), true); assert.equal(h.fetchBundle, id4);
  let n = 0; while (g2.fetchStep(h, {}) && n++ < 50);
  assert.ok(bag.includes('focus_charm'), 'walked over and picked it up'); assert.equal(h.fetchBundle, undefined); assert.equal(state.groundItems.items[id4], undefined); }
console.log('Ground items: outdoor drop, pick up, reach, full bag, per-clan view, rival bot pickup, right-click fetch and 15 minute expiry passed');
