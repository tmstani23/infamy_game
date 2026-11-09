// Rail shipments, step S1 (Tim 2026-11-08; rules in docs/frontier_campaign_plan.md, "Rail shipments rules").
// Orders, keep amounts and reserved stock only: no trains carry anything yet (S2), no clerk (S3).
//  - keep: per town and resource, s.keep[res] (default data.railways.ship.keep[res]). A town gives nothing
//    below keep + reserved: free(s, res) = stock - keep - reserved.
//  - reserved: s.reserved[res] = stock set aside at a source for accepted orders; nothing else may spend it.
//  - orders: state.frontier.shipping = { seq, orders: { id: { id, owner, to, resource, amount, got, ryo, pin,
//      urgent, auto, state: 'open'|'done'|'cancelled', sources: [{ from, amount }], created } } }
//    The player names only the need (town, resource, amount); the source is picked later (clerk, S3) or pinned.
//  - rules: both ends yours and joined by an open rail line (capital holds no stock); an order fits the town's
//    storage room (stock + still-open orders); the ryo offered for capital buying must be in the town's stock.
// S2 (consignments): a train's cargo is a list of consignments { order, resource, amount } (train.freight); cargo
//  waiting at a station for the next line sits in state.frontier.shipping.yards[stationId] (same shape). arrive() is
//  called by rail.js whenever a train reaches a station: it unloads what ends here (delivers to the town, or leaves
//  it in the yard for the next line), then loads. Loading gives each waiting order one wagon-load in turn
//  (railways.ship.wagonLoad), then fills the spare room in the same order; what does not fit waits for the next
//  train. A closed line holds cargo; nothing is lost. A cancelled order's cargo still on its way is delivered.
// S3 (rail clerk): clerk(s) runs from the governor's review of a town, ONLY while that town's governor is on auto
//  (s.autoBuild, Tim 2026-11-09). It makes auto orders for what a town lacks against its keep amount, finds sources
//  (a pinned town, else the nearest town with surplus by line length, else the capital: port wholesale houses
//  "tonya", paid from the town's ryo within its auto-buy budget s.shipBudget, buying costs more than selling pays),
//  and sells spare goods to the capital (kind 'sell'). Manual orders are covered first. Prices: railways.ship.
// Command { type: 'frontier', action: 'ship', mode: 'order', town, resource, amount, [pin, urgent, ryo, auto] }
//   | { mode: 'cancel', order } | { mode: 'keep', town, resource, keep } | { mode: 'budget', town, ryo, [autoBuy] }
// createShipments({ state, data, world }) -> { command, linked, keepOf, reservedOf, free, openIncoming, accept, release }
import { storageCap, defaultKeep } from './storage.js';

export function createShipments({ state, data, world }) {
  const S = () => data.railways?.ship || {};
  const RES = () => S().resources || ['food', 'timber', 'stone', 'goods'];
  const rec = () => { const r = state.frontier.shipping ||= { seq: 0, orders: {} }; r.yards ||= {}; return r; };
  const orders = () => Object.values(rec().orders);
  const town = id => id === 'capital' ? null : state.frontier.settlements?.[id];

  // goods: ONE level with the market's hold-back (Tim 2026-11-09), s.marketKeep (default data.market.keep)
  const keepOf = (s, res) => (res === 'goods' && data.market ? s.marketKeep : s.keep?.[res]) ?? defaultKeep(s, data, res);
  const reservedOf = (s, res) => s.reserved?.[res] ?? 0;
  const free = (s, res) => Math.max(0, (s.stock?.[res] ?? 0) - keepOf(s, res) - reservedOf(s, res));
  const openIncoming = (id, res) => orders().filter(o => o.state === 'open' && o.to === id && o.resource === res).reduce((a, o) => a + o.amount - o.got, 0);

  // two towns of yours joined by open (finished, not closed) lines, through any chain of your towns
  function linked(owner, a, b) {
    const links = Object.values(state.frontier.rail?.links || {}).filter(l => l.owner === owner && l.done && !l.closed);
    const seen = new Set([a]), todo = [a];
    while (todo.length) {
      const at = todo.pop();
      if (at === b) return true;
      for (const l of links) { const n = l.from === at ? l.to : l.to === at ? l.from : null; if (n && !seen.has(n)) { seen.add(n); todo.push(n); } }
    }
    return false;
  }

  // cargo of an order aboard trains or waiting in yards
  function inFlight(id) {
    let n = 0;
    for (const t of Object.values(state.frontier.rail?.trains || {})) for (const c of t.freight || []) if (c.order === id) n += c.amount;
    for (const y of Object.values(rec().yards)) for (const c of y) if (c.order === id) n += c.amount;
    return n;
  }
  // the node list from a to b over open lines (breadth first), or null
  function route(owner, a, b) {
    const links = Object.values(state.frontier.rail?.links || {}).filter(l => l.owner === owner && l.done && !l.closed);
    const prev = { [a]: null }, todo = [a];
    while (todo.length) {
      const at = todo.shift();
      if (at === b) { const path = []; for (let n = b; n != null; n = prev[n]) path.unshift(n); return path; }
      for (const l of links) { const n = l.from === at ? l.to : l.to === at ? l.from : null; if (n && !(n in prev)) { prev[n] = at; todo.push(n); } }
    }
    return null;
  }
  const hopFrom = (owner, at, to) => route(owner, at, to)?.[1] ?? null;

  // reserve `amount` of an order's resource at source town `from` (S3 clerk calls this). Never below keep.
  function accept(orderId, from, amount) {
    const o = rec().orders[orderId], s = town(from);
    if (o && o.state === 'open' && from === 'capital' && amount > 0) {   // port wholesale house: pay now, cargo appears at the capital station
      const t = town(o.to), price = S().buyPrice?.[o.resource] ?? 5;
      const n = Math.min(Math.floor(amount), Math.floor((t?.stock.ryo ?? 0) / price), o.amount - o.got - inFlight(o.id) - o.sources.reduce((a, x) => a + x.amount, 0));
      if (!t || n <= 0) return 0;
      world.change(t.id, 'ryo', -n * price, 'ship buy');
      o.ryoPaid = (o.ryoPaid || 0) + n * price;
      o.sources.push({ from: 'capital', amount: n, price });
      return n;
    }
    if (!o || o.state !== 'open' || !s || !(amount > 0)) return 0;
    const take = Math.min(amount, free(s, o.resource), o.amount - o.got - inFlight(o.id) - o.sources.reduce((a, x) => a + x.amount, 0));
    if (take <= 0) return 0;
    (s.reserved ||= {})[o.resource] = reservedOf(s, o.resource) + take;
    o.sources.push({ from, amount: take });
    return take;
  }
  const wagonLoad = () => S().wagonLoad ?? 60;
  const wagons = t => Math.max(1, t.consist ? t.consist.filter(k => k === 'goods').length : Math.max(1, (t.cars ?? 3) - 1));
  const onBoard = t => (t.freight || []).reduce((a, c) => a + c.amount, 0);

  // A train has reached station `at` of its line l (rail.js arrive). Far end = where it goes next.
  function arrive(t, l, at) {
    const freight = t.freight ||= [];
    // unload what ends its ride here
    for (const c of freight) {   // the train came here because this was the next stop of its cargo
      const o = rec().orders[c.order];
      if (!o) continue;
      if (o.to === at) {
        if (at === 'capital' && o.kind === 'sell') { const s = town(o.sellFrom); if (s) world.change(s.id, 'ryo', Math.floor(c.amount * (S().sellPrice?.[c.resource] ?? 2)), 'ship sale'); o.got += c.amount; }
        else if (town(at)) { world.change(at, c.resource, c.amount, 'ship'); o.got += c.amount; }
        if (o.state === 'open' && o.got >= o.amount - 1e-9) { o.state = 'done'; o.done = state.tick ?? 0; release(o); }
      } else (rec().yards[at] ||= []).push({ ...c });
    }
    t.freight = [];
    load(t, l, at);
  }
  // load before leaving station `at` (also called just before departure, for orders placed while it stood)
  function load(t, l, at) {
    const far = at === l.to ? l.from : l.to;
    t.freight ||= [];
    // everything that could ride this train: yard cargo here, then each order's reserved stock here
    const waiting = [];
    for (const c of rec().yards[at] || []) { const o = rec().orders[c.order]; if (o && hopFrom(t.owner, at, o.to) === far) waiting.push({ c, from: 'yard' }); }
    for (const o of Object.values(rec().orders)) {
      if (o.state !== 'open' || o.owner !== t.owner) continue;
      for (const x of o.sources) if (x.from === at && x.amount > 0 && hopFrom(t.owner, at, o.to) === far) waiting.push({ o, x, resource: o.resource, from: 'town' });
    }
    let room = wagons(t) * wagonLoad() - onBoard(t);
    const take = (w, max) => {
      const have = w.from === 'yard' ? w.c.amount : w.x.amount, n = Math.min(have, max, room);
      if (n <= 0) return 0;
      if (w.from === 'yard') w.c.amount -= n;
      else if (at === 'capital') w.x.amount -= n;   // bought: the cargo is made at the station
      else { world.change(at, w.resource, -n, 'ship'); w.x.amount -= n; const s = town(at); s.reserved[w.resource] = Math.max(0, reservedOf(s, w.resource) - n); }
      const id = w.from === 'yard' ? w.c.order : w.o.id, res = w.from === 'yard' ? w.c.resource : w.resource, mine = t.freight.find(c => c.order === id);
      if (mine) mine.amount += n; else t.freight.push({ order: id, resource: res, amount: n });
      room -= n;
      return n;
    };
    for (const w of waiting) take(w, wagonLoad());           // one wagon-load per waiting order, in turn
    for (const w of waiting) take(w, Infinity);              // then fill the spare room
    if (rec().yards[at]) rec().yards[at] = rec().yards[at].filter(c => c.amount > 0);
    for (const o of Object.values(rec().orders)) o.sources = o.sources.filter(x => x.amount > 0);
  }

  // give back every reservation of an order (cancelled, or what the train never loaded)
  function release(o) {
    for (const x of o.sources) {
      if (x.from === 'capital') { const t = town(o.to); if (t && x.amount > 0) world.change(t.id, 'ryo', x.amount * x.price, 'ship refund'); o.ryoPaid = Math.max(0, (o.ryoPaid || 0) - x.amount * x.price); continue; }
      const s = town(x.from); if (s?.reserved) s.reserved[o.resource] = Math.max(0, reservedOf(s, o.resource) - x.amount);
    }
    o.sources = [];
  }

  const receipt = (e, ok, reason = '') => {
    if (e.quiet) return ok;   // the clerk's own orders: no receipt, no notice
    const fr = state.frontier;
    fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    fr.receipts.push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: 'ship', ok, reason });
    if (state.clans?.[e.owner] && reason) state.clans[e.owner].notice = { tick: state.tick, text: reason };
    return true;
  };

  // Tim 2026-11-09: sell by hand. Any resource, up to the stock not reserved (your call, keep amounts aside), rides the
  // next train to the capital and pays sellPrice each on arrival. Same queue cap as your orders (trainloads per line).
  function sellOrder(e, c) {
    const s = typeof c.town === 'string' ? town(c.town) : null;
    if (!s || s.owner == null || s.owner !== e.owner) return receipt(e, false, 'Not your town');
    if (!RES().includes(c.resource)) return receipt(e, false, 'Unknown resource');
    const amount = Math.floor(c.amount), min = S().minOrder ?? 10;
    if (!(amount >= min)) return receipt(e, false, `Sales start at ${min}`);
    if (!route(e.owner, s.id, 'capital')) return receipt(e, false, 'Needs a rail line to the capital');
    const spare = Math.floor((s.stock[c.resource] ?? 0) - reservedOf(s, c.resource));
    if (amount > spare) return receipt(e, false, `Only ${Math.max(0, spare)} ${c.resource} to spare`);
    const T = data.railways?.train || {}, load = Math.max(1, T.consist ? T.consist.filter(k => k === 'goods').length : 1) * (S().wagonLoad ?? 60);
    const lines = Object.values(state.frontier.rail?.links || {}).filter(l => l.owner === e.owner && l.done && !l.closed && (l.from === s.id || l.to === s.id)).length;
    const cap = (S().queueTrips ?? 3) * load * Math.max(1, lines);
    const queued = orders().filter(o => o.state === 'open' && o.kind === 'sell' && o.sellFrom === s.id && !o.auto).reduce((a, o) => a + o.amount - o.got, 0);
    if (queued + amount > cap) return receipt(e, false, queued >= cap ? `Trains are booked up: ${Math.round(queued)} already for sale (max ${cap})` : `At most ${Math.floor(cap - queued)} more can be sold for now`);
    const id = `o${++rec().seq}`; lastId = id;
    rec().orders[id] = { id, owner: e.owner, to: 'capital', kind: 'sell', sellFrom: s.id, resource: c.resource, amount, got: 0, ryo: 0, pin: null, urgent: false, auto: false, state: 'open', sources: [{ from: s.id, amount }], created: state.tick ?? 0 };
    (s.reserved ||= {})[c.resource] = reservedOf(s, c.resource) + amount;
    return receipt(e, true, `For sale: ${amount} ${c.resource}, pays about ${Math.floor(amount * (S().sellPrice?.[c.resource] ?? 2))} ryo when it reaches the capital`);
  }
  let lastId = null;
  function place(e, c) {
    const s = typeof c.town === 'string' ? town(c.town) : null;
    if (!s) return receipt(e, false, 'No such town');
    if (s.owner == null || s.owner !== e.owner) return receipt(e, false, 'Not your town');
    if (!RES().includes(c.resource)) return receipt(e, false, 'Unknown resource');
    const amount = Math.floor(c.amount);
    const min = S().minOrder ?? 10;
    if (!(amount >= min)) return receipt(e, false, `Orders start at ${min}`);
    const auto = !!c.auto;
    if (auto) {
      const open = orders().filter(o => o.state === 'open' && o.to === s.id && o.auto).length;
      if (open >= (S().maxAuto ?? 4)) return receipt(e, false, 'Too many open auto orders');
    }
    if (c.pin != null) {
      const p = town(c.pin);
      if (!p || p.owner !== e.owner || p.id === s.id) return receipt(e, false, 'Pinned source must be another of your towns');
      if (!linked(e.owner, p.id, s.id)) return receipt(e, false, 'No rail line to that source');
    } else if (!Object.values(state.frontier.rail?.links || {}).some(l => l.owner === e.owner && l.done && !l.closed && (l.from === s.id || l.to === s.id))) {
      return receipt(e, false, 'Needs a rail line');
    }
    const room = storageCap(s, data, c.resource) - (s.stock[c.resource] ?? 0) - openIncoming(s.id, c.resource);
    if (amount > room + 1e-9) return receipt(e, false, room > 0 ? `Storage has room for ${Math.floor(room)}` : 'Storage is full');
    // Tim 2026-11-09: queue cap. Your own undelivered orders into a town may add up to queueTrips trainloads per
    // line at that town (one trainload = goods wagons x wagonLoad), so a new order arrives within a few trips.
    if (!auto) {
      const T = data.railways?.train || {}, load = Math.max(1, T.consist ? T.consist.filter(k => k === 'goods').length : 1) * (S().wagonLoad ?? 60);
      const lines = Object.values(state.frontier.rail?.links || {}).filter(l => l.owner === e.owner && l.done && !l.closed && (l.from === s.id || l.to === s.id)).length;
      const cap = (S().queueTrips ?? 3) * load * Math.max(1, lines);
      const queued = orders().filter(o => o.state === 'open' && o.to === s.id && !o.auto).reduce((a, o) => a + o.amount - o.got, 0);
      if (queued + amount > cap) return receipt(e, false, queued >= cap ? `Trains are booked up: ${Math.round(queued)} already on order (max ${cap})` : `At most ${Math.floor(cap - queued)} more can be ordered for now`);
    }
    const ryo = Math.max(0, Math.floor(c.ryo ?? 0));
    if (ryo > (s.stock.ryo ?? 0) + 1e-9) return receipt(e, false, 'Not enough ryo');
    const id = `o${++rec().seq}`; lastId = id;
    rec().orders[id] = { id, owner: e.owner, to: s.id, resource: c.resource, amount, got: 0, ryo, pin: c.pin ?? null, urgent: !!c.urgent, auto, state: 'open', sources: [], created: state.tick ?? 0 };
    cover(s, rec().orders[id]);
    return receipt(e, true, `Order placed: ${amount} ${c.resource} for ${s.name}`);
  }

  function command(e, c) {
    if (c.action !== 'ship') return false;
    if (c.mode === 'order') return place(e, c);
    if (c.mode === 'cancel') {
      const o = rec().orders[c.order];
      if (!o || o.owner !== e.owner || o.state !== 'open') return receipt(e, false, 'No such open order');
      release(o); o.state = 'cancelled'; o.done = state.tick ?? 0;
      return receipt(e, true, 'Order cancelled');
    }
    if (c.mode === 'keep') {
      const s = typeof c.town === 'string' ? town(c.town) : null;
      if (!s || s.owner == null || s.owner !== e.owner) return receipt(e, false, 'Not your town');
      if (!RES().includes(c.resource)) return receipt(e, false, 'Unknown resource');
      const max = S().keepMax ?? 100000;
      if (!Number.isFinite(c.keep) || c.keep < 0 || c.keep > max) return receipt(e, false, `Keep must be 0 to ${max}`);
      if (c.resource === 'goods' && data.market) { s.marketKeep = Math.round(c.keep); s.marketKeepSet = true; }   // the same hold-back as the market
      else (s.keep ||= {})[c.resource] = Math.round(c.keep);
      return receipt(e, true);
    }
    if (c.mode === 'sell') return sellOrder(e, c);
    if (c.mode === 'budget') {
      const s = typeof c.town === 'string' ? town(c.town) : null;
      if (!s || s.owner == null || s.owner !== e.owner) return receipt(e, false, 'Not your town');
      if (c.ryo !== undefined) { if (!Number.isFinite(c.ryo) || c.ryo < 0) return receipt(e, false, 'Budget must be 0 or more'); s.shipBudget = Math.round(c.ryo); }
      if (c.autoBuy !== undefined) s.autoBuy = !!c.autoBuy;
      return receipt(e, true);
    }
    return receipt(e, false, 'order, cancel, keep or budget');
  }

  // ---- S6: robbery (Tim 2026-11-07 design). rob(train, share) takes `share` (0-1) of everything aboard; the loss
  // is split equally between the orders aboard (a small one gives what it has, the rest share the remainder). Each
  // order keeps o.lost and stays open, so its town (or the clerk) re-sends the shortfall; bought cargo stolen is
  // ryo lost. Returns the loot { resource: amount } for the robbers. The robbery itself (charge on the freight
  // wagon, hold ~30 s, caps) is rail step 6 and calls this.
  function rob(t, share, by = null) {
    const freight = (t?.freight || []).filter(c => c.amount > 0);
    let left = Math.min(freight.reduce((a, c) => a + c.amount, 0), Math.ceil(freight.reduce((a, c) => a + c.amount, 0) * Math.max(0, Math.min(1, share))));
    const loot = {}, take = new Map();
    let open = [...freight];
    while (left > 1e-9 && open.length) {
      const each = left / open.length;
      for (const c of open) { const n = Math.min(c.amount - (take.get(c) || 0), each); take.set(c, (take.get(c) || 0) + n); left -= n; }
      open = open.filter(c => c.amount - (take.get(c) || 0) > 1e-9);
    }
    for (const [c, n0] of take) {
      const n = Math.round(n0 * 100) / 100;
      if (n <= 0) continue;
      c.amount -= n; loot[c.resource] = (loot[c.resource] || 0) + n;
      const o = rec().orders[c.order];
      if (o) {
        o.lost = (o.lost || 0) + n; (o.losses ||= []).push({ tick: state.tick ?? 0, amount: n, train: t.id, by });
        // a sale that was robbed is a smaller sale (nothing re-sends it); done when what is left has arrived
        if (o.kind === 'sell' && o.state === 'open') { o.amount = Math.max(o.got, o.amount - n); if (o.got >= o.amount - 1e-9) { o.state = 'done'; o.done = state.tick ?? 0; } }
      }
    }
    t.freight = freight.filter(c => c.amount > 1e-9);
    t.robbed = state.tick ?? 0;
    const total = Object.values(loot).reduce((a, n) => a + n, 0), clan = state.clans?.[t.owner];
    if (clan && total > 0) clan.notice = { tick: state.tick, text: `Train robbed: ${Object.entries(loot).map(([r, n]) => `${Math.round(n)} ${r}`).join(', ')} lost. The orders stay open and are re-sent.` };
    return loot;
  }

  // ---- S3: the rail clerk -----------------------------------------------------------------------------------
  const lineLen = (owner, a, b) => { const l = Object.values(state.frontier.rail?.links || {}).find(k => k.owner === owner && k.done && !k.closed && ((k.from === a && k.to === b) || (k.from === b && k.to === a))); return l?.length ?? 0; };
  function routeLen(owner, a, b) {
    const p = route(owner, a, b);
    if (!p) return Infinity;
    let n = 0;
    for (let i = 1; i < p.length; i++) n += lineLen(owner, p[i - 1], p[i]);
    return n;
  }
  const budgetOf = s => s.shipBudget ?? S().budget ?? 150;
  const spentOf = s => orders().filter(o => o.state === 'open' && o.to === s.id && o.auto).reduce((a, o) => a + (o.ryoPaid || 0), 0);

  function cover(s, o) {
    const need = () => o.amount - o.got - inFlight(o.id) - o.sources.reduce((a, x) => a + x.amount, 0);
    if (need() <= 0) return;
    const peers = o.pin ? [town(o.pin)] : Object.values(state.frontier.settlements).filter(t => t.owner === s.owner && !t.capital && t.id !== s.id);
    const cand = peers.filter(t => t && free(t, o.resource) > 0).map(t => [routeLen(s.owner, t.id, s.id), t]).filter(([d]) => d < Infinity).sort((a, b) => a[0] - b[0]);
    for (const [, t] of cand) { if (need() <= 0) return; accept(o.id, t.id, need()); }
    if (need() <= 0 || o.pin) return;
    const price = S().buyPrice?.[o.resource] ?? 5, left = o.auto ? (s.autoBuy === false ? 0 : budgetOf(s) - spentOf(s)) : (o.ryo || 0) - (o.ryoPaid || 0);
    const n = Math.min(need(), Math.floor(left / price));
    if (n > 0 && route(s.owner, 'capital', s.id)) accept(o.id, 'capital', n);
  }

  // Your own orders ship whatever the governor setting (Tim 2026-11-09): sources are found when placed and again
  // every governor review (stock that turned up since), before the clerk's auto orders.
  function coverManual() {
    const open = orders().filter(o => o.state === 'open' && !o.auto && o.kind !== 'sell').sort((a, b) => b.urgent - a.urgent || a.created - b.created);
    for (const o of open) { const s = town(o.to); if (s && s.owner === o.owner) cover(s, o); }
  }
  function econTick() {
    // keep the newest ended orders for the Rail ledger's Delivered / Losses tabs, drop older ones
    const ended = orders().filter(o => o.state !== 'open').sort((a, b) => (b.done ?? 0) - (a.done ?? 0));
    for (const o of ended.slice(S().keepEnded ?? 40)) if (inFlight(o.id) <= 1e-9) delete rec().orders[o.id];   // cargo still on its way keeps its order (it is delivered on arrival)
    if ((state.frontier.econTick ?? 0) % (data.governor?.reviewTicks || 1) === 0) coverManual();
  }

  function clerk(s) {
    if (!s || s.capital || !s.owner) return;
    const owner = s.owner;
    if (!Object.values(state.frontier.rail?.links || {}).some(l => l.owner === owner && l.done && !l.closed && (l.from === s.id || l.to === s.id))) return;
    const min = S().minOrder ?? 10;
    for (const res of RES()) {   // 1. auto orders for what the town lacks against its keep amount
      const lack = Math.min(keepOf(s, res) - (s.stock[res] ?? 0) - openIncoming(s.id, res), storageCap(s, data, res) - (s.stock[res] ?? 0) - openIncoming(s.id, res));
      if (lack >= min) place({ owner, quiet: true }, { town: s.id, resource: res, amount: lack, auto: true });
    }
    for (const o of orders().filter(o => o.state === 'open' && o.to === s.id && !o.auto)) cover(s, o);   // your own orders first
    const mine = orders().filter(o => o.state === 'open' && o.to === s.id && o.auto).sort((a, b) => b.urgent - a.urgent || a.created - b.created);
    for (const o of mine) {   // 2. sources for auto orders (manual ones are covered first)
      cover(s, o);
      // an auto order shrinks to what could be sourced, so it always completes (and frees its budget); the next
      // review orders the rest again. Nothing sourced at all: it is dropped.
      const short = o.amount - o.got - inFlight(o.id) - o.sources.reduce((a, x) => a + x.amount, 0);
      if (short > 0) { o.amount -= short; if (o.amount <= 1e-9) delete rec().orders[o.id]; }
    }
    // 3. spare goods to the capital for ryo (only well above the keep amount, and the store is mostly full)
    const sell = S().sell || {};
    const cap = storageCap(s, data, 'goods');
    if (sell.on !== false && Number.isFinite(cap) && s.autoBuy !== false && (s.stock.goods ?? 0) >= cap * (sell.aboveShare ?? 0.7)
      && !orders().some(o => o.state === 'open' && o.kind === 'sell' && o.sellFrom === s.id) && route(owner, s.id, 'capital')) {
      // never below the market's hold-back level (Tim 2026-11-09: the two keep levels agree)
      const hold = keepOf(s, 'goods');
      const n = Math.floor(Math.min((s.stock.goods ?? 0) - hold - reservedOf(s, 'goods'), sell.batch ?? 120));
      if (n >= min) {
        const id = `o${++rec().seq}`;
        rec().orders[id] = { id, owner, to: 'capital', kind: 'sell', sellFrom: s.id, resource: 'goods', amount: n, got: 0, ryo: 0, pin: null, urgent: false, auto: true, state: 'open', sources: [], created: state.tick ?? 0 };
        accept(id, s.id, n);
      }
    }
  }

  // A station was torn up (rail.js tearUp, after its lines are gone): cargo waiting in its yard goes into that town's
  // stock (it stood at the town's own station), orders into a town with no line left are cancelled (their
  // reservations released), and a source that can no longer reach its order gives its reserved stock back.
  function tearDown(at) {
    const yard = rec().yards[at] || [];
    for (const c of yard) if (c.amount > 0 && town(at)) world.change(at, c.resource, c.amount, 'ship');
    delete rec().yards[at];
    for (const o of orders()) {
      if (o.state !== 'open') continue;
      const dest = o.kind === 'sell' ? 'capital' : o.to, from = o.kind === 'sell' ? o.sellFrom : null;
      if (o.kind === 'sell' ? !route(o.owner, from, dest) : !Object.values(state.frontier.rail?.links || {}).some(l => l.owner === o.owner && l.done && !l.closed && (l.from === dest || l.to === dest))) {
        release(o); o.state = 'cancelled'; o.done = state.tick ?? 0; continue;
      }
      for (const x of o.sources) {
        if (x.from === 'capital' || route(o.owner, x.from, dest)) continue;
        const s = town(x.from); if (s?.reserved) s.reserved[o.resource] = Math.max(0, reservedOf(s, o.resource) - x.amount);
        x.amount = 0;
      }
      o.sources = o.sources.filter(x => x.amount > 0);
    }
  }

  return { clerk, coverManual, econTick, command, linked, route, keepOf, reservedOf, free, openIncoming, inFlight, accept, release, arrive, load, rob, tearDown };
}
