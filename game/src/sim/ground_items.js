// Dropped bag items (Tim 2026-11-26, plan in project files war_build/drop_and_merchant/plan.md). A hero drops a bag
// item outdoors (city street or island): it lies there as a small cloth bundle for GROUND_ITEMS.lifeSeconds, then is
// gone. Anyone can take it, rivals included: a player hero with Space beside it ({ type: 'groundItem', action: 'pick' }),
// a rival bot's hero simply by walking past it. The bundle: state.groundItems.items[id] = { id, item, place, x, z, at, by }.
// Drawn by render/ground_items.js; sent per clan by sim_snapshot.js (own bundles always, others on seen ground).
import { canInteract } from './interactions.js';
import { noticeFor } from './util.js';
import { ITEMS, INVENTORY_SLOTS, GROUND_ITEMS } from './gear_catalog.js';

export const OUTDOORS = ['street', 'world'];
export function createGroundItems({ state, give, moveTo = null }) {
  const say = noticeFor(state), now = () => state.tick ?? 0, life = () => Math.round(GROUND_ITEMS.lifeSeconds * 20);
  const rec = () => state.groundItems ||= { seq: 0, items: {} };
  const items = () => rec().items;
  const canDrop = e => canInteract(e) && e.type === 'hero' && OUTDOORS.includes(e.place) && !e.aboard && !e.garrison;
  const near = (e, b) => b.place === e.place && Math.hypot(b.x - e.x, b.z - e.z) <= GROUND_ITEMS.reach;
  // the bundle a hero stands by: the nearest one within reach
  const nearest = e => !e ? null : Object.values(items()).filter(b => near(e, b)).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z) || (a.id < b.id ? -1 : 1))[0] || null;
  function drop(e, index) {
    const clan = state.clans[e?.owner], bag = clan?.inventory?.bag;
    if (!bag || !Number.isInteger(index) || index < 0 || index >= INVENTORY_SLOTS || !ITEMS[bag[index]]) return false;
    if (!canDrop(e)) { if (canInteract(e) && e.type === 'hero') say(clan, 'Drop items outdoors'); return false; }
    const id = `g${++rec().seq}`;
    items()[id] = { id, item: bag[index], place: e.place, x: Math.round(e.x * 10) / 10, z: Math.round(e.z * 10) / 10, at: now(), by: e.owner };
    bag[index] = null;
    say(clan, `Dropped ${ITEMS[items()[id].item].name}`);
    return id;
  }
  function take(e, b) {
    if (!give(e.owner, b.item)) { if (!state.clans[e.owner]?.bot) say(state.clans[e.owner], 'Personal inventory is full'); return false; }
    delete items()[b.id]; return true;
  }
  function pick(e, bundleId) {
    if (!canInteract(e) || e.type !== 'hero' || e.aboard) return false;
    const b = bundleId ? items()[bundleId] : nearest(e);
    if (!b || !near(e, b)) return false;
    return take(e, b);
  }
  // right-click a bundle (Tim 2026-11-26): the hero walks over and picks it up (e.fetchBundle; WASD or another order ends it)
  function fetch(e, bundleId) {
    const b = items()[bundleId];
    if (!b || !canInteract(e) || e.type !== 'hero' || e.aboard || b.place !== e.place) return false;
    if (near(e, b)) return take(e, b);
    delete e.lootTarget; e.fetchBundle = b.id; return true;
  }
  // one tick of the walk; true while still walking
  function fetchStep(e, unit) {
    const b = items()[e.fetchBundle];
    if (!b || b.place !== e.place || !canInteract(e)) { delete e.fetchBundle; return false; }
    if (near(e, b)) { delete e.fetchBundle; take(e, b); e.anim = 'idle'; return false; }
    if (!moveTo?.(e, unit, b.x, b.z, false)) { delete e.fetchBundle; return false; }
    return true;
  }
  function command(e, c) {
    if (c.action === 'drop') return drop(e, c.index);
    if (c.action === 'pick') return pick(e, c.bundle);
    if (c.action === 'fetch') return fetch(e, c.bundle);
  }
  function tick() {
    const all = Object.values(items()); if (!all.length) return;
    for (const b of all) if (now() - b.at > life()) delete items()[b.id];
    if (now() % 10) return;   // rival bot heroes pick up what they walk past (twice a second is plenty)
    for (const e of Object.values(state.entities || {})) {
      if (e.type !== 'hero' || !state.clans[e.owner]?.bot || !canInteract(e) || e.aboard) continue;
      const b = nearest(e); if (b) take(e, b);
    }
  }
  const secondsLeft = b => Math.max(0, Math.ceil((life() - (now() - b.at)) / 20));
  return { drop, pick, fetch, fetchStep, command, tick, nearest, canDrop, items, secondsLeft };
}
// what one clan is sent (sim_snapshot.js): its own bundles always; others in the city, or on discovered island ground
export function groundItemsFor(state, clan, discovery) {
  const list = state.groundItems?.items; if (!list || !Object.keys(list).length) return null;
  return Object.fromEntries(Object.entries(list).filter(([, b]) => b.by === clan || b.place !== 'world' || discovery?.isDiscovered?.(clan, b.x, b.z)));
}
