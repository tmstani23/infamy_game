// The gear ladder (wildlife W7, 2026-11-24): shop item < city drop (Fine) < frontier gear < castle heirloom,
// for every stat. Frontier gear and heirlooms have no fixed numbers (sim/gear_catalog.js works them out at load),
// so this checks the order holds, that wolves and bears name real items, and that a fallen castle gives its blade.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS, GEAR, RARITIES, SHOP_ITEM_IDS, FRONTIER_GEAR, HEIRLOOMS, heirloomFor } from '../src/sim/gear_catalog.js';
import { createItemServices } from '../src/sim/item_services.js';

const shopVal = (id, stat) => { const it = ITEMS[id], g = GEAR[id.replace(/_green$/, '')]; return g?.bonuses?.[stat] != null ? g.bonuses[stat] * RARITIES[it.rarity].bonusScale : null; };
const valueOf = (id, stat) => ['common', 'green'].includes(ITEMS[id]?.rarity) ? shopVal(id, stat) : ITEMS[id]?.bonuses?.[stat] ?? (stat === 'damageReduction' && ITEMS[id]?.modifiers?.damageTaken ? 1 - ITEMS[id].modifiers.damageTaken : null);
const shopIds = SHOP_ITEM_IDS, dropIds = SHOP_ITEM_IDS.map(id => id + '_green');
const bestOf = (ids, stat) => Math.max(-Infinity, ...ids.map(id => valueOf(id, stat)).filter(v => v != null));

// shop < drop for every shop stat
for (const id of shopIds) for (const [k, v] of Object.entries(GEAR[id].bonuses)) assert.ok(valueOf(id + '_green', k) > valueOf(id, k) && valueOf(id, k) === v, `${id} ${k}: drop beats shop`);
// frontier beats every shop item and drop on each of its stats
for (const [id, g] of Object.entries(FRONTIER_GEAR)) {
  const it = ITEMS[id];
  assert.ok(it && it.rarity === 'frontier' && it.slot === g.slot, `${id} compiled`);
  for (const k of g.stats) {
    const v = valueOf(id, k), shop = bestOf(shopIds, k), drop = bestOf(dropIds, k);
    assert.ok(v > 0, `${id} ${k} > 0`);
    if (drop > -Infinity) assert.ok(v > drop && drop > shop, `${id} ${k}: ${shop} < ${drop} < ${v}`);
    else assert.ok(v > valueOf('light_lamellar', k), `${id} ${k} beats the starter gear`);
  }
  assert.ok(it.sell > 0 && /\d/.test(it.about), `${id} sells and shows its live numbers`);
}
// heirlooms beat every other weapon and gear piece on their stat, and cannot be sold
for (const f of Object.keys(HEIRLOOMS)) {
  const id = `heirloom_${f}`, it = ITEMS[id], [k] = Object.keys(it.bonuses);
  const others = Object.keys(ITEMS).filter(o => o !== id && !ITEMS[o].heirloom);
  assert.ok(it.slot === 'weapon' && it.heirloom && !it.sell, `${id} is a keepsake weapon`);
  assert.ok(it.bonuses[k] > bestOf(others, k), `${id} ${k} tops the ladder`);
  assert.ok(it.bonuses[k] > bestOf(shopIds.filter(o => ITEMS[o].slot === 'weapon'), k), `${id} beats the best shop weapon`);
}
assert.equal(heirloomFor({ faction: 'kuroda' }), 'heirloom_kuroda');
assert.equal(heirloomFor({ kind: 'ninja', faction: 'shinobi' }), 'heirloom_shinobi');
assert.equal(heirloomFor({ faction: 'yakuza' }), 'heirloom_yakuza');

// wolves and bears drop real frontier items
const wild = JSON.parse(readFileSync(new URL('../data/wildlife.json', import.meta.url))).animals.species;
for (const sp of ['wolf', 'bear']) {
  assert.ok(wild[sp].gear?.chance > 0.15 && wild[sp].gear.chance < 0.3, `${sp} drops gear about 1 kill in 4 to 5`);
  for (const id of wild[sp].gear.items) assert.equal(ITEMS[id]?.rarity, 'frontier', `${sp} drops ${id}`);
}

// a castle falls: its clan's blade goes to the clan that took it; a full bag keeps it waiting (never sold)
const bag = () => ({ bag: Array(12).fill(null), stash: Array(12).fill(null), equipment: { weapon: null, armor: null, accessory: null } });
const state = { tick: 1, entities: {}, ryoGains: [], itemGains: [], news: [], clans: {
  me: { id: 'me', ryo: 0, inventory: bag() }, ku: { id: 'ku', faction: 'kuroda', bot: true }, full: { id: 'full', ryo: 0, inventory: { ...bag(), bag: Array(12).fill('honed_weapon') } } } };
const items = createItemServices({ state });
state.news = [{ kind: 'warEnded', result: 'captured', attacker: 'me', defender: 'ku' }];
items.castles();
assert.ok(!state.clans.me.inventory.bag.includes('heirloom_kuroda'), 'a captured town gives no heirloom');
state.news = [{ kind: 'warEnded', result: 'fell', attacker: 'me', defender: 'ku' }, { kind: 'warEnded', result: 'fell', attacker: 'full', defender: 'ku' }];
items.castles();
assert.ok(state.clans.me.inventory.bag.includes('heirloom_kuroda'), 'the fallen castle gives its blade');
assert.deepEqual(state.itemGains.find(g => g.clan === 'me'), { clan: 'me', id: 'heirloom_kuroda' }, 'the loot notice shows it');
assert.deepEqual(state.clans.full.inventory.pending, ['heirloom_kuroda'], 'a full bag keeps it waiting at the shop');
assert.equal(state.clans.full.ryo, 0, 'never sold');
// frontier gear from a kill goes through the same grant
assert.ok(items.grant('me', 'wolf_fur_cloak') && state.clans.me.inventory.bag.includes('wolf_fur_cloak'), 'grant puts frontier gear in the bag');
console.log('gear ladder ok', Object.fromEntries(Object.keys(FRONTIER_GEAR).concat(Object.keys(HEIRLOOMS).map(f => 'heirloom_' + f)).map(id => [id, ITEMS[id].about.split('. ')[0]])));
