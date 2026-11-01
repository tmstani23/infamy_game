import { canInteract } from './interactions.js';
import { noticeFor } from './util.js';

export const INVENTORY_SLOTS = 12;
export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory'];
// Modest tradeoffs on existing weapon shapes. No loot generation in this checkpoint.
export const ITEMS = {
  weighted_edge: { name: 'Weighted edge', slot: 'weapon', about: '+8% normal-hit power; 6% longer attack interval.', modifiers: { damage: 1.08, attackInterval: 1.06 }, glow: [1, .52, .18] },
  light_lamellar: { name: 'Light lamellar', slot: 'armor', about: '6% less incoming damage; 5% slower running.', modifiers: { damageTaken: .94, run: .95 } },
  scouts_knot: { name: "Scout’s knot", slot: 'accessory', about: '+5% run speed; 3% more incoming damage.', modifiers: { run: 1.05, damageTaken: 1.03 } },
};
export function gearMultiplier(e, key) {
  if (e?.type !== 'hero') return 1;
  return EQUIPMENT_SLOTS.reduce((n, slot) => n * (ITEMS[e.equipment?.[slot]]?.slot === slot ? ITEMS[e.equipment[slot]].modifiers[key] ?? 1 : 1), 1);
}
export function gearSources(e, key) {
  if (e?.type !== 'hero') return [];
  return EQUIPMENT_SLOTS.flatMap(slot => {
    const item = ITEMS[e.equipment?.[slot]], value = item?.slot === slot ? item.modifiers[key] : null;
    return value == null ? [] : [`${item.name} ×${value}`];
  });
}
export function createInventory({state}) {
  const say = noticeFor(state);
  const atHQ = e => !!e && e.place !== 'street' && Object.values(state.businesses).some(b => b.hideout === e.owner && b.owner === e.owner && b.room === e.place);
  function initialize(e) {
    const clan = state.clans[e.owner];
    if (e.type !== 'hero' || !clan) return;
    // Clan storage survives recovery; spawning again cannot mint starter items.
    clan.inventory ||= { bag: [...Object.keys(ITEMS), ...Array(INVENTORY_SLOTS - Object.keys(ITEMS).length).fill(null)],
      stash: Array(INVENTORY_SLOTS).fill(null), equipment: Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s, null])) };
    e.equipment = clan.inventory.equipment;
  }
  const status = e => ({ atHQ: atHQ(e), available: canInteract(e) && e.type === 'hero', ...state.clans[e?.owner]?.inventory });
  function command(e, c) {
    if (!canInteract(e) || e.type !== 'hero') return;
    const clan = state.clans[e.owner], inv = clan?.inventory;
    if (!inv) return;
    if (c.action === 'unequip') {
      if (!EQUIPMENT_SLOTS.includes(c.slot) || !inv.equipment[c.slot]) return;
      const empty = inv.bag.indexOf(null);
      if (empty < 0) return say(clan, 'Personal inventory is full');
      inv.bag[empty] = inv.equipment[c.slot]; inv.equipment[c.slot] = null;
    } else {
      const index = c.index;
      if (!Number.isInteger(index) || index < 0 || index >= INVENTORY_SLOTS) return;
      if (c.action === 'equip') {
        const item = ITEMS[inv.bag[index]]; if (!item) return;
        const old = inv.equipment[item.slot]; inv.equipment[item.slot] = inv.bag[index]; inv.bag[index] = old;
      } else if (['deposit', 'withdraw'].includes(c.action)) {
        if (!atHQ(e)) return say(clan, 'Visit your HQ to use its stash');
        const [from, to] = c.action === 'deposit' ? [inv.bag, inv.stash] : [inv.stash, inv.bag];
        if (!from[index]) return;
        const empty = to.indexOf(null);
        if (empty < 0) return say(clan, c.action === 'deposit' ? 'HQ stash is full' : 'Personal inventory is full');
        to[empty] = from[index]; from[index] = null;
      } else return;
    }
    e.equipment = inv.equipment;
  }
  return { initialize, command, status, atHQ };
}
