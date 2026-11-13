// Camp storage and ox carts (Tim 2026-11-06, rich nodes CP5). Pure sim, integer ticks, no randomness.
// Work camps (workers.gatherBuildings) keep what workers drop off in b.store. Each camp has `free` carts on a relay
// (cart k starts k x tripTicks / carts later, so one leaves as the next arrives); a cart arriving at the camp loads
// `share` of each stored resource (at most `maxLoad` in total), drives to the town's nearest hall or storehouse at
// `speed`, unloads through world.change, and drives back. A full camp (store >= cap) takes no more drop-offs, so
// workers walk to the hall or a storehouse instead. A 3rd cart can be bought at the camp (buyCart, cost from data).
// Numbers: frontier.json workers.carts.
// Moving carts show as an ox cart near the player's units (cartPoint; spawned by workers.js).
// 7c-5 (Tim 2026-11-12): a cart can be recalled (orderCarts 'recall'): it finishes its delivery or turns round, drives
// to the town and stays parked there (at: 'parked'), also during a war; 'send' sends parked carts back to their camp.
// In a war on the town the attacker can destroy a cart on the road (workers.js: its unit at 0 health): it is a wreck
// (at: 'wrecked', its load lost) and a new one stands at the camp after carts.replaceTicks.
export const cartRules = data => data.workers?.carts || null;
export const isCamp = (data, b) => (data.workers?.gatherBuildings || []).includes(b.type);
export const campStock = b => Object.values(b.store || {}).reduce((a, v) => a + v, 0);
export const campFull = (data, b) => { const C = cartRules(data); return !!C && campStock(b) >= C.cap; };

// ticks for one way between a camp and its nearest home drop-off (hall or storehouse), straight line x roadFactor
export function tripTicks(C, from, to) {
  const d = Math.hypot(from[0] - to[0], from[1] - to[1]) * (C.roadFactor ?? 1.2);
  return Math.max(1, Math.ceil(d / C.speed * 20));
}

export function ensureCarts(C, b, oneWay) {
  if (b.carts && b.carts.length >= C.free) return b.carts;
  b.carts ||= [];
  while (b.carts.length < C.free) { const k = b.carts.length; b.carts.push({ at: 'camp', t: Math.round(k * 2 * oneWay / C.free), load: null }); }
  return b.carts;
}

// One sim tick for every camp of town s. home(b) -> [x, z] of the drop-off a cart unloads at; pos(b) -> camp [x, z].
export function stepCarts(s, data, change, pos, home) {
  const C = cartRules(data); if (!C) return;
  for (const b of s.buildings || []) {
    if (b.stage !== 'built' || !isCamp(data, b)) continue;
    const h = home(s, b); if (!h) continue;
    const oneWay = tripTicks(C, pos(s, b), h);
    b.cartTicks = oneWay;
    // carts leave the camp at least a round trip / carts apart (Tim 2026-11-07: after an empty camp they all left
    // together and drove on top of each other)
    if (b.cartGap > 0) b.cartGap--;
    const carts = ensureCarts(C, b, oneWay);
    for (const c of carts) {
      if (c.at === 'parked') continue;
      if (c.t > 0) { c.t--; continue; }
      if (c.at === 'wrecked') { c.at = 'camp'; c.t = 0; c.load = null; delete c.recall; continue; }   // its replacement
      if (c.at === 'camp' && c.recall) { c.at = 'out'; c.t = oneWay; c.load = null; continue; }      // recalled: drives in empty
      if (c.at === 'camp') {
        const total = campStock(b);
        if (total <= 0) { c.t = C.waitTicks ?? 20; continue; }   // empty camp: wait a moment and look again
        if (b.cartGap > 0) { c.t = b.cartGap; continue; }          // the cart before it only just left
        b.cartGap = Math.max(1, Math.round(2 * oneWay / carts.length));
        const take = Math.min(total * C.share, C.maxLoad) / total, load = {};
        for (const [r, v] of Object.entries(b.store)) { const n = Math.round(v * take * 100) / 100; if (n > 0) { load[r] = n; b.store[r] = Math.round((v - n) * 100) / 100; if (b.store[r] <= 0) delete b.store[r]; } }
        c.load = load; c.at = 'out'; c.t = oneWay;
      } else if (c.at === 'out') {
        for (const [r, v] of Object.entries(c.load || {})) change(s.id, r, v, 'cart');
        c.delivered = (c.delivered || 0) + campStockOf(c.load);
        c.load = null;
        if (c.recall) { delete c.recall; c.at = 'parked'; c.t = 0; } else { c.at = 'back'; c.t = oneWay; }
      } else { c.at = 'camp'; c.t = 0; }
    }
  }
}
const campStockOf = l => Object.values(l || {}).reduce((a, v) => a + v, 0);

// Recall or send out a town's carts (7c-5). mode 'recall': every cart on the road or at its camp heads for the town and
// parks there; 'send': parked carts drive back to their camp. buildingId = only that camp's carts. Returns how many.
export function orderCarts(s, data, mode, buildingId = null) {
  const C = cartRules(data); if (!C) return 0;
  let n = 0;
  for (const b of s.buildings || []) {
    if (b.stage !== 'built' || !isCamp(data, b) || (buildingId && b.id !== buildingId)) continue;
    const oneWay = b.cartTicks || 1;
    for (const c of b.carts || []) {
      if (mode === 'recall' && c.at !== 'parked' && c.at !== 'wrecked' && !c.recall) {
        c.recall = true; n++;
        if (c.at === 'back') { c.at = 'out'; c.t = Math.max(0, oneWay - (c.t || 0)); c.load = null; }   // turns round
      } else if (mode === 'send' && (c.at === 'parked' || c.recall)) {
        if (c.at === 'parked') { c.at = 'back'; c.t = oneWay; }
        delete c.recall; n++;
      }
    }
  }
  return n;
}
// A cart on the road was destroyed (7c-5): its load is lost; a new one stands at the camp after carts.replaceTicks
export function wreckCart(data, c) { const C = cartRules(data); c.at = 'wrecked'; c.t = C?.replaceTicks ?? 2400; c.load = null; delete c.recall; c.entity = null; }

// Workers a camp's carts keep up with: cart throughput per minute / one worker's gather rate per minute.
export function cartWorkerLimit(data, b, workerPerMin) {
  const C = cartRules(data); if (!C || !b.cartTicks || !workerPerMin) return null;
  const perMin = (b.carts?.length || C.free) * C.maxLoad * (60 * 20) / (2 * b.cartTicks);
  return Math.floor(perMin / workerPerMin);
}

// Buy one more cart at a camp (up to C.max). pay(cost) -> true when the town could afford it.
export function buyCart(s, data, b, pay) {
  const C = cartRules(data);
  if (!C || !b || !isCamp(data, b) || b.stage !== 'built') return 'not a work camp';
  if ((b.carts?.length || 0) >= C.max) return `at most ${C.max} carts`;
  if (!pay(C.extraCost)) return 'not enough stock';
  b.carts ||= []; b.carts.push({ at: 'camp', t: 0, load: null, bought: true });
  return null;
}

// Where a moving cart is: 'out' runs camp -> home, 'back' home -> camp; t counts down the one-way ticks. null at the camp.
export function cartPoint(c, camp, home, oneWay) {
  if (c.at !== 'out' && c.at !== 'back') return null;
  const f = 1 - Math.max(0, Math.min(1, c.t / Math.max(1, oneWay))), [a, b] = c.at === 'out' ? [camp, home] : [home, camp];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, b[0] - a[0], b[1] - a[1]];
}
