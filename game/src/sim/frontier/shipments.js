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
//   (pin: a town of yours, or 'capital' = buy it all there, Tim 2026-11-25)
//   | { mode: 'cancel', order } | { mode: 'keep', town, resource, keep } | { mode: 'budget', town, ryo, [autoBuy] }
// createShipments({ state, data, world }) -> { command, linked, keepOf, reservedOf, free, openIncoming, accept, release }
import { storageCap, defaultKeep } from './storage.js';
import { nextTier } from './tiers.js';
import { debitRyo, creditRyo } from '../treasury.js';
import { addCampStock } from './camp_stock.js';
// 8e-1 (2026-11-16) ryo by train: an order of kind 'ryo' carries ryo from the Clan treasury (source 'capital') or a
//  town's coffers to an own town's coffers (into 'coffers', manual only), a defending town's war chest or a camp's
//  war chest (into 'chest', war id). The ryo leaves its pot when the order is placed (sources[].paid); it rides the
//  guard car (railways.ship.ryoPerTrain a train, no wagon room) by the fewest stops. On arrival it goes into its pot;
//  a war that ended first sends a defending chest's ryo to that town's coffers and a camp's back to the treasury.
//  Cancel refunds what is not loaded yet. Robbed ryo is lost (the order shrinks, nothing is re-sent).
// 8e-2 auto ryo orders (governor, generals): war chests only, only while that war is on; from the treasury never
//  below the clan's keep line (clan.treasuryKeep, default war.supply.treasuryKeep) and at most war.supply.autoShare
//  of the treasury above it per game day (clan.autoRyo = { day, used }); manual orders ignore both.
// Command { type: 'frontier', action: 'ship', mode: 'ryo', from: 'treasury'|townId, to, into: 'coffers'|'chest', war, amount, [auto] }
//   | { mode: 'treasuryKeep', ryo }

export function createShipments({ state, data, world, dayTicks = 12000 }) {
  const S = () => data.railways?.ship || {};
  const RES = () => S().resources || ['food', 'timber', 'stone', 'goods'];
  const rec = () => { const r = state.frontier.shipping ||= { seq: 0, orders: {} }; r.yards ||= {}; return r; };
  const orders = () => Object.values(rec().orders);
  const town = id => id === 'capital' ? null : state.frontier.settlements?.[id];
  // 8e-5: a linked war camp takes timber and stone orders like a town (node 'camp:<war id>', stock = the camp stores,
  // no storage cap, never a source for other orders). Tim 2026-11-17: it may sell its stores to the capital (the ryo
  // goes into its war chest) and buy at the capital with ryo from its war chest (an order's ryo offer)
  const isCampNode = id => typeof id === 'string' && id.startsWith('camp:');
  function campDest(id, owner) {
    const w = isCampNode(id) && state.frontier.wars?.list?.[id.slice(5)];
    if (!w?.camp || (owner != null && w.attacker !== owner) || !w.camp.station?.linked || w.camp.station.node !== id) return null;
    return { id, owner: w.attacker, name: `the ${state.frontier.settlements?.[w.town]?.name || ''} camp`.replace('the  camp', 'the camp'), stock: w.camp.stock, reserved: w.camp.reserved ||= {}, camp: true, war: w.id, w };
  }
  const dest = (id, owner) => town(id) || campDest(id, owner);

  // goods: ONE level with the market's hold-back (Tim 2026-11-09), s.marketKeep (default data.market.keep)
  const keepOf = (s, res) => (res === 'goods' && data.market ? s.marketKeep : s.keep?.[res]) ?? defaultKeep(s, data, res);
  const reservedOf = (s, res) => s.reserved?.[res] ?? 0;
  const free = (s, res, o = null) => Math.max(0, (s.stock?.[res] ?? 0) - keepFor(s, res, o) - reservedOf(s, res));
  // Tim 2026-11-17: a bot's town fills its own camp's orders down to war.supply.botCampKeepShare of its storage (it
  // keeps that share of its coffers for ryo too); other orders, and a player's towns, keep the town's keep amount
  function keepFor(s, res, o) {
    const k = keepOf(s, res);
    if (!o?.camp || o.kind === 'sell' || !state.clans?.[s.owner]?.bot) return k;
    const cap = storageCap(s, data, res);
    return Number.isFinite(cap) ? Math.min(k, Math.floor(cap * (W().supply?.botCampKeepShare ?? 0.25))) : k;
  }
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
  // sortie: a line closed only by a blast whose train has not made its one run to the gap yet counts as open, so that
  // train loads as usual (Tim 2026-11-21: it sets out, stops at the gap, and the cargo stays aboard until the repair)
  function route(owner, a, b, sortie = false) {
    const open = l => !l.closed || (sortie && l.cutBy === 'blast' && l.blast && !l.blast.sortie);
    const links = Object.values(state.frontier.rail?.links || {}).filter(l => l.owner === owner && l.done && open(l));
    const prev = { [a]: null }, todo = [a];
    while (todo.length) {
      const at = todo.shift();
      if (at === b) { const path = []; for (let n = b; n != null; n = prev[n]) path.unshift(n); return path; }
      for (const l of links) { const n = l.from === at ? l.to : l.to === at ? l.from : null; if (n && !(n in prev)) { prev[n] = at; todo.push(n); } }
    }
    return null;
  }
  const hopFrom = (owner, at, to, sortie = false) => route(owner, at, to, sortie)?.[1] ?? null;

  // reserve `amount` of an order's resource at source town `from` (S3 clerk calls this). Never below keep.
  function accept(orderId, from, amount) {
    const o = rec().orders[orderId], s = town(from);
    if (o && o.state === 'open' && from === 'capital' && amount > 0) {   // port wholesale house: pay now, cargo appears at the capital station
      const t = dest(o.to, o.owner), price = S().buyPrice?.[o.resource] ?? 5, purse = t?.camp ? t.w.camp.chest || 0 : t?.stock.ryo ?? 0;
      const n = Math.min(Math.floor(amount), Math.floor(purse / price), o.amount - o.got - inFlight(o.id) - o.sources.reduce((a, x) => a + x.amount, 0));
      if (!t || n <= 0) return 0;
      if (t.camp) t.w.camp.chest = Math.round((purse - n * price) * 100) / 100;   // a camp pays from its war chest
      else world.change(t.id, 'ryo', -n * price, 'ship buy');
      o.ryoPaid = (o.ryoPaid || 0) + n * price;
      o.sources.push({ from: 'capital', amount: n, price });
      return n;
    }
    if (!o || o.state !== 'open' || !s || !(amount > 0)) return 0;
    const take = Math.min(amount, free(s, o.resource, o), o.amount - o.got - inFlight(o.id) - o.sources.reduce((a, x) => a + x.amount, 0));
    if (take <= 0) return 0;
    (s.reserved ||= {})[o.resource] = reservedOf(s, o.resource) + take;
    o.sources.push({ from, amount: take });
    return take;
  }
  const wagonLoad = () => S().wagonLoad ?? 60;
  const wagons = t => Math.max(1, t.consist ? t.consist.filter(k => k === 'goods').length : Math.max(1, (t.cars ?? 3) - 1));
  const onBoard = t => (t.freight || []).reduce((a, c) => a + (c.resource === 'ryo' ? 0 : c.amount), 0);
  const ryoOnBoard = t => (t.freight || []).reduce((a, c) => a + (c.resource === 'ryo' ? c.amount : 0), 0);

  // A train has reached station `at` of its line l (rail.js arrive). Far end = where it goes next.
  function arrive(t, l, at) {
    const freight = t.freight ||= [];
    // unload what ends its ride here
    for (const c of freight) {   // the train came here because this was the next stop of its cargo
      const o = rec().orders[c.order];
      if (!o) continue;
      if (o.to === at) {
        if (o.kind === 'ryo') deliverRyo(o, c.amount);
        else if (at === 'capital' && o.kind === 'sell') { const s = town(o.sellFrom), pay = Math.floor(c.amount * (S().sellPrice?.[c.resource] ?? 2)); if (s) world.change(s.id, 'ryo', pay, 'ship sale'); else if (o.camp) campSale(o, pay); o.got += c.amount; }
        else if (town(at)) { world.change(at, c.resource, c.amount, 'ship'); o.got += c.amount; }
        else if (isCampNode(at)) { const d = campDest(at, o.owner); if (d) addCampStock(d.w.camp, c.resource, c.amount); o.got += c.amount; }
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
    for (const c of rec().yards[at] || []) { const o = rec().orders[c.order]; if (o && hopFrom(t.owner, at, o.to, true) === far) waiting.push({ c, from: 'yard' }); }
    for (const o of Object.values(rec().orders)) {
      if (o.state !== 'open' || o.owner !== t.owner) continue;
      for (const x of o.sources) if (x.from === at && x.amount > 0 && hopFrom(t.owner, at, o.to, true) === far) waiting.push({ o, x, resource: o.resource, from: 'town' });
    }
    let room = wagons(t) * wagonLoad() - onBoard(t), ryoRoom = Math.max(0, (S().ryoPerTrain ?? 2000) - ryoOnBoard(t));
    const take = (w, max) => {
      const res0 = w.from === 'yard' ? w.c.resource : w.resource, isRyo = res0 === 'ryo';
      const have = w.from === 'yard' ? w.c.amount : w.x.amount;
      let n = Math.min(have, isRyo ? Infinity : max, isRyo ? ryoRoom : room);
      // reserved stock may have been spent (builds, war pack): load what is there, drop the rest of that reservation
      const srcStock = w.from === 'yard' || isRyo || at === 'capital' ? Infinity : isCampNode(at) ? (campDest(at)?.stock?.[w.resource] || 0) : (town(at)?.stock?.[w.resource] || 0);
      if (n > srcStock) {
        n = Math.max(0, srcStock);
        const s = isCampNode(at) ? campDest(at) : town(at), gone = w.x.amount - n;
        if (s) (s.reserved ||= {})[w.resource] = Math.max(0, reservedOf(s, w.resource) - gone);
        w.x.amount = n;
      }
      if (n <= 0) return 0;
      if (w.from === 'yard') w.c.amount -= n;
      else if (isRyo || at === 'capital') w.x.amount -= n;   // ryo was paid when ordered; bought cargo is made at the station
      else if (isCampNode(at)) { const d = campDest(at); if (!d) return 0; addCampStock(d.w.camp, w.resource, -n); w.x.amount -= n; d.reserved[w.resource] = Math.max(0, reservedOf(d, w.resource) - n); }   // a camp's sale leaves its stores
      else { world.change(at, w.resource, -n, 'ship'); w.x.amount -= n; const s = town(at); s.reserved[w.resource] = Math.max(0, reservedOf(s, w.resource) - n); }
      const id = w.from === 'yard' ? w.c.order : w.o.id, res = w.from === 'yard' ? w.c.resource : w.resource, mine = t.freight.find(c => c.order === id);
      if (mine) mine.amount += n; else t.freight.push({ order: id, resource: res, amount: n });
      if (isRyo) ryoRoom -= n; else room -= n;
      return n;
    };
    // Tim 2026-11-22 (fix list 17): your own orders ride first: urgent ones, then your other orders, then auto orders
    // (oldest first in each). Each group gets one wagon-load per order in turn, then the spare room, before the next.
    const rank = o => !o ? 3 : o.auto ? 2 : o.urgent ? 0 : 1;
    const orderOf = w => w.from === 'yard' ? rec().orders[w.c.order] : w.o;
    const groups = [[], [], [], []];
    for (const w of waiting) groups[rank(orderOf(w))].push(w);
    for (const g of groups) {
      g.sort((a, b) => (orderOf(a)?.created ?? 0) - (orderOf(b)?.created ?? 0));
      for (const w of g) take(w, wagonLoad());           // one wagon-load per waiting order, in turn
      for (const w of g) take(w, Infinity);              // then fill the spare room
    }
    if (rec().yards[at]) rec().yards[at] = rec().yards[at].filter(c => c.amount > 0);
    for (const o of Object.values(rec().orders)) o.sources = o.sources.filter(x => x.amount > 0);
  }

  // Tim 2026-11-17: a camp's sale pays into its side's war chest; the war over, into the Clan treasury
  function campSale(o, pay) {
    const w = warOf(o.war);
    if (w?.camp && w.attacker === o.owner) { w.camp.chest = Math.round(((w.camp.chest || 0) + pay) * 100) / 100; addSource(w.camp.sources ||= {}, 'sale', pay); return; }
    const clan = state.clans?.[o.owner]; if (clan) { creditRyo(state, clan, pay, 'Camp sale'); world.syncCapital?.(); }
  }
  // give back every reservation of an order (cancelled, or what the train never loaded)
  function release(o) {
    for (const x of o.sources) {
      if (o.kind === 'ryo') { if (x.amount > 0) { refundRyo(o, x.from, x.amount); o.amount = Math.max(o.got, o.amount - x.amount); } continue; }
      if (x.from === 'capital') { const t = town(o.to); if (t && x.amount > 0) world.change(t.id, 'ryo', x.amount * x.price, 'ship refund'); o.ryoPaid = Math.max(0, (o.ryoPaid || 0) - x.amount * x.price); continue; }
      const s = dest(x.from); if (s?.reserved) s.reserved[o.resource] = Math.max(0, reservedOf(s, o.resource) - x.amount);
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
    const s = typeof c.town === 'string' ? town(c.town) || campDest(c.town, e.owner) : null;
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
    rec().orders[id] = { id, owner: e.owner, to: 'capital', kind: 'sell', sellFrom: s.id, resource: c.resource, amount, got: 0, ryo: 0, pin: null, urgent: false, auto: false, state: 'open', sources: [{ from: s.id, amount }], created: state.tick ?? 0, ...(s.camp ? { war: s.war, camp: true } : {}) };
    (s.reserved ||= {})[c.resource] = reservedOf(s, c.resource) + amount;
    return receipt(e, true, `For sale: ${amount} ${c.resource}, pays about ${Math.floor(amount * (S().sellPrice?.[c.resource] ?? 2))} ryo ${s.camp ? 'into the war chest ' : ''}when it reaches the capital`);
  }
  let lastId = null;
  function place(e, c) {
    const s = typeof c.town === 'string' ? dest(c.town, e.owner) : null;
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
    if (c.pin === 'capital') {   // Tim 2026-11-25: capital only, buy it all (order slip)
      if (!route(e.owner, 'capital', s.id)) return receipt(e, false, 'Needs a rail line to the capital');
    } else if (c.pin != null) {
      const p = town(c.pin);
      if (!p || p.owner !== e.owner || p.id === s.id) return receipt(e, false, 'Pinned source must be another of your towns');
      if (!linked(e.owner, p.id, s.id)) return receipt(e, false, 'No rail line to that source');
    } else if (!Object.values(state.frontier.rail?.links || {}).some(l => l.owner === e.owner && l.done && !l.closed && (l.from === s.id || l.to === s.id))) {
      return receipt(e, false, 'Needs a rail line');
    }
    if (s.camp && !['timber', 'stone'].includes(c.resource)) return receipt(e, false, 'A camp takes timber and stone');
    const room = (s.camp ? Infinity : storageCap(s, data, c.resource)) - (s.stock[c.resource] ?? 0) - openIncoming(s.id, c.resource);
    if (amount > room + 1e-9) return receipt(e, false, room > 0 ? `Storage has room for ${Math.floor(room)}` : 'Storage is full');
    // Tim 2026-11-09: queue cap. Your own undelivered orders into a town may add up to queueTrips trainloads per
    // line at that town (one trainload = goods wagons x wagonLoad), so a new order arrives within a few trips.
    if (!auto) {
      const T = data.railways?.train || {}, load = Math.max(1, T.consist ? T.consist.filter(k => k === 'goods').length : 1) * (S().wagonLoad ?? 60);
      const lines = Object.values(state.frontier.rail?.links || {}).filter(l => l.owner === e.owner && l.done && !l.closed && (l.from === s.id || l.to === s.id)).length;
      const cap = (S().queueTrips ?? 3) * load * Math.max(1, lines);
      const queued = orders().filter(o => o.state === 'open' && o.to === s.id && !o.auto && o.kind !== 'ryo').reduce((a, o) => a + o.amount - o.got, 0);   // (ryo rides the guard car: it takes no wagon room)
      if (queued + amount > cap) return receipt(e, false, queued >= cap ? `Trains are booked up: ${Math.round(queued)} already on order (max ${cap})` : `At most ${Math.floor(cap - queued)} more can be ordered for now`);
    }
    const ryo = Math.max(0, Math.floor(c.ryo ?? 0));   // what it may spend buying at the capital (a camp: from its war chest)
    if (ryo > (s.camp ? s.w.camp.chest || 0 : s.stock.ryo ?? 0) + 1e-9) return receipt(e, false, s.camp ? 'Not enough ryo in the war chest' : 'Not enough ryo');
    const id = `o${++rec().seq}`; lastId = id;
    rec().orders[id] = { id, owner: e.owner, to: s.id, resource: c.resource, amount, got: 0, ryo, pin: c.pin ?? null, urgent: !!c.urgent, auto, state: 'open', sources: [], created: state.tick ?? 0, ...(s.camp ? { war: s.war, camp: true } : {}) };
    cover(s, rec().orders[id]);
    return receipt(e, true, `Order placed: ${amount} ${c.resource} for ${s.name}`);
  }

  // ---- 8e-1 ryo by train ------------------------------------------------------------------------------------
  const W = () => data.war || {};
  const warOf = id => state.frontier.wars?.list?.[id] || null;
  const keepLine = clan => clan?.treasuryKeep ?? W().supply?.treasuryKeep ?? 1000;
  const dayOf = () => Math.floor((state.tick ?? 0) / Math.max(1, dayTicks));
  // what auto orders may still take from a clan's treasury today
  function autoRoom(clan) {
    if (!clan) return 0;
    const above = Math.max(0, (clan.ryo ?? 0) - keepLine(clan)), a = clan.autoRyo;
    const used = a && a.day === dayOf() ? a.used : 0, start = a && a.day === dayOf() ? a.above : above + used;
    return Math.max(0, Math.min(above, Math.floor(start * (W().supply?.autoShare ?? 0.25)) - used));
  }
  // the rail node a chest order goes to: the defending town, or the camp's station node once linked (8e-4)
  function chestNode(w, owner) {
    if (!w) return null;
    if (w.defender === owner) return w.town;
    if (w.attacker === owner) return w.camp?.station?.node && w.camp.station.linked ? w.camp.station.node : null;
    return null;
  }
  function refundRyo(o, from, n) {
    if (!(n > 0)) return;
    const clan = state.clans?.[o.owner];
    if (from === 'capital') { if (clan) { creditRyo(state, clan, n, 'Ryo by train returned'); world.syncCapital?.(); } return; }
    const s = town(from);
    if (s && s.owner === o.owner) world.change(s.id, 'ryo', n, 'ryo by train returned');
    else if (clan) { creditRyo(state, clan, n, 'Ryo by train returned'); world.syncCapital?.(); }
  }
  function addSource(rec0, from, n) { const k = from === 'capital' ? 'treasury' : from; rec0[k] = Math.round(((rec0[k] || 0) + n) * 100) / 100; }
  function deliverRyo(o, n) {
    o.got += n;
    const w = o.war ? warOf(o.war) : null, clan = state.clans?.[o.owner], s = town(o.to);
    if (o.into === 'chest' && w && w.defender === o.owner && w.town === o.to) {
      const d = w.defense ||= { chest: 0, put: 0 };
      d.chest = Math.round(((d.chest || 0) + n) * 100) / 100; addSource(d.sources ||= {}, o.from, n); return;
    }
    if (o.into === 'chest' && w && w.attacker === o.owner && w.camp) {
      w.camp.chest = Math.round(((w.camp.chest || 0) + n) * 100) / 100; addSource(w.camp.sources ||= {}, o.from, n); return;
    }
    // coffers, or the war ended first: a defending town's coffers; a camp's ryo goes back to the treasury
    const defended = o.into === 'chest' && o.defend;
    if ((o.into === 'coffers' || defended) && s && s.owner === o.owner) { world.change(s.id, 'ryo', n, o.into === 'coffers' ? 'ryo by train' : 'war chest returned'); return; }
    if (clan) { creditRyo(state, clan, n, o.into === 'coffers' ? 'Ryo by train returned' : 'War chest returned'); world.syncCapital?.(); }
  }
  // ryo on its way into a pot: { treasury: n, <townId>: n } for a war's chest (war id + side) or a town's coffers
  function ryoOnTheWay(owner, { war = null, to = null } = {}) {
    const out = {};
    for (const o of orders()) {
      if (o.kind !== 'ryo' || o.owner !== owner || (o.state !== 'open' && o.state !== 'cancelled')) continue;
      if (war ? o.war !== war : (o.into !== 'coffers' || o.to !== to)) continue;
      const left = o.amount - o.got;
      if (left > 1e-9) addSource(out, o.from, left);
    }
    return out;
  }
  function ryoOrder(e, c) {
    const clan = state.clans?.[e.owner];
    if (!clan) return receipt(e, false, 'No clan');
    const amount = Math.floor(c.amount), min = S().ryoMin ?? 10, auto = !!c.auto;
    if (!(amount >= min)) return receipt(e, false, `Send at least ${min} ryo`);
    const from = c.from === 'treasury' || c.from === 'capital' ? 'capital' : c.from;
    const src = from === 'capital' ? null : town(from);
    if (from !== 'capital' && (!src || src.owner !== e.owner)) return receipt(e, false, 'Not your town');
    let to = c.to, w = null;
    if (c.into === 'chest') {
      w = warOf(c.war);
      if (!w) return receipt(e, false, 'That war is over');
      to = chestNode(w, e.owner);
      if (!to) return receipt(e, false, w.attacker === e.owner ? 'The camp has no linked camp station' : 'Not your war');
    } else if (c.into === 'coffers') {
      if (auto) return receipt(e, false, 'Auto orders go to war chests only');
      const s = town(to);
      if (!s || s.owner !== e.owner) return receipt(e, false, 'Not your town');
    } else return receipt(e, false, 'Send into coffers or a war chest');
    if (to === from) return receipt(e, false, 'Already there');
    if (!route(e.owner, from, to)) return receipt(e, false, from === 'capital' ? 'Needs a rail line from the capital' : 'Needs a rail line between them');
    if (from === 'capital') {
      if (amount > (clan.ryo ?? 0) + 1e-9) return receipt(e, false, `The Clan treasury has only ${Math.floor(clan.ryo ?? 0)} ryo`);
      if (auto && amount > autoRoom(clan)) return receipt(e, false, 'Above the treasury keep line or today\'s share');
    } else if (amount > (src.stock.ryo ?? 0) + 1e-9) return receipt(e, false, `${src.name} has only ${Math.floor(src.stock.ryo ?? 0)} ryo`);
    // pay now
    if (from === 'capital') {
      if (auto) { const room0 = (clan.ryo ?? 0) - keepLine(clan); if (!clan.autoRyo || clan.autoRyo.day !== dayOf()) clan.autoRyo = { day: dayOf(), used: 0, above: Math.max(0, room0) }; clan.autoRyo.used += amount; }
      debitRyo(state, clan, amount, 'Ryo by train'); world.syncCapital?.();
    } else world.change(src.id, 'ryo', -amount, 'ryo by train');
    const id = `o${++rec().seq}`; lastId = id;
    rec().orders[id] = { id, owner: e.owner, kind: 'ryo', resource: 'ryo', from, to, into: c.into, war: w?.id ?? null, defend: !!(w && w.defender === e.owner),
      amount, got: 0, ryo: 0, pin: null, urgent: false, auto, state: 'open', sources: [{ from, amount, paid: true }], created: state.tick ?? 0 };
    return receipt(e, true, `${amount} ryo on its way by train`);
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
    // the ryo an open order may spend buying at the capital (Tim 2026-11-17; a camp's comes from its war chest)
    if (c.mode === 'offer') {
      const o = rec().orders[c.order], s = o && dest(o.to, e.owner);
      if (!o || o.owner !== e.owner || o.state !== 'open' || o.kind === 'ryo' || o.kind === 'sell' || !s) return receipt(e, false, 'No such open order');
      const ryo = Math.floor(Number(c.ryo));
      if (!(ryo >= (o.ryoPaid || 0))) return receipt(e, false, 'Offer must cover what is already paid');
      if (ryo - (o.ryoPaid || 0) > (s.camp ? s.w.camp.chest || 0 : s.stock.ryo ?? 0) + 1e-9) return receipt(e, false, s.camp ? 'Not enough ryo in the war chest' : 'Not enough ryo');
      o.ryo = ryo; cover(s, o);
      return receipt(e, true, `Up to ${ryo} ryo for buying at the capital`);
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
    if (c.mode === 'ryo') return ryoOrder(e, c);
    // 8e-7: a general's auto refill of its side's war chest from the Clan treasury (keep line and daily share apply)
    if (c.mode === 'autoChest') {
      const w = warOf(c.war);
      if (!w || (w.attacker !== e.owner && w.defender !== e.owner)) return receipt(e, false, 'Not your war');
      // held: ryo of a camp chest the general keeps back for the camp hall upgrade (never more than its price); the
      // chest counts as low without it (Tim 2026-11-17: a camp saving for the upgrade still gets its refill)
      autoChest(e.owner, w, w.attacker === e.owner ? Math.max(0, Math.min(+c.held || 0, W().hallUpgrade?.cost?.ryo || 0)) : 0);
      return true;
    }
    if (c.mode === 'treasuryKeep') {
      const clan = state.clans?.[e.owner];
      if (!clan) return receipt(e, false, 'No clan');
      if (!Number.isFinite(c.ryo) || c.ryo < 0) return receipt(e, false, 'Keep line must be 0 or more');
      clan.treasuryKeep = Math.round(c.ryo);
      return receipt(e, true);
    }
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
  // perLoad (train robbery, Tim 2026-11-20 "50% of all"): share of every load aboard, so each order loses the same share
  function rob(t, share, by = null, perLoad = false) {
    const freight = (t?.freight || []).filter(c => c.amount > 0);
    if (perLoad) { const k = Math.max(0, Math.min(1, share)); return takeLoot(t, freight, new Map(freight.map(c => [c, c.amount * k])), by); }
    let left = Math.min(freight.reduce((a, c) => a + c.amount, 0), Math.ceil(freight.reduce((a, c) => a + c.amount, 0) * Math.max(0, Math.min(1, share))));
    const take = new Map();
    let open = [...freight];
    while (left > 1e-9 && open.length) {
      const each = left / open.length;
      for (const c of open) { const n = Math.min(c.amount - (take.get(c) || 0), each); take.set(c, (take.get(c) || 0) + n); left -= n; }
      open = open.filter(c => c.amount - (take.get(c) || 0) > 1e-9);
    }
    return takeLoot(t, freight, take, by);
  }
  function takeLoot(t, freight, take, by) {
    const loot = {};
    for (const [c, n0] of take) {
      const n = Math.round(n0 * 100) / 100;
      if (n <= 0) continue;
      c.amount -= n; loot[c.resource] = (loot[c.resource] || 0) + n;
      const o = rec().orders[c.order];
      if (o) {
        o.lost = (o.lost || 0) + n; (o.losses ||= []).push({ tick: state.tick ?? 0, amount: n, train: t.id, by });
        // a sale that was robbed is a smaller sale (nothing re-sends it); done when what is left has arrived
        if ((o.kind === 'sell' || o.kind === 'ryo') && o.state === 'open') { o.amount = Math.max(o.got, o.amount - n); if (o.got >= o.amount - 1e-9) { o.state = 'done'; o.done = state.tick ?? 0; } }
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
  // Tim 2026-11-23 (last resort): a town whose workers cannot supply a resource any more (workers.js rebalance:
  // s.gov.handsDone) buys it with a budget of ship.budgetShare of its ryo, when that is more than the flat budget.
  // A budget the player typed always stands.
  const trainload = () => { const T = data.railways?.train || {}; return Math.max(1, T.consist ? T.consist.filter(k => k === 'goods').length : 1) * wagonLoad(); };
  const budgetOf = (s, res = null) => s.shipBudget ?? Math.max(S().budget ?? 150, res && s.gov?.handsDone === res ? Math.floor(Math.min((s.stock?.ryo || 0) * (S().budgetShare ?? 0), trainload() * (S().buyPrice?.[res] ?? 5))) : 0);
  const spentOf = s => orders().filter(o => o.state === 'open' && o.to === s.id && o.auto).reduce((a, o) => a + (o.ryoPaid || 0), 0);

  function cover(s, o) {
    const need = () => o.amount - o.got - inFlight(o.id) - o.sources.reduce((a, x) => a + x.amount, 0);
    if (need() <= 0) return;
    const peers = o.pin === 'capital' ? [] : o.pin ? [town(o.pin)] : Object.values(state.frontier.settlements).filter(t => t.owner === s.owner && !t.capital && t.id !== s.id);
    const cand = peers.filter(t => t && free(t, o.resource, o) > 0).map(t => [routeLen(s.owner, t.id, s.id), t]).filter(([d]) => d < Infinity).sort((a, b) => a[0] - b[0]);
    for (const [, t] of cand) { if (need() <= 0) return; accept(o.id, t.id, need()); }
    if (need() <= 0 || (o.pin && o.pin !== 'capital') || (s.camp && !(o.ryo > 0))) return;   // a camp buys only with a ryo offer (Tim 2026-11-17)
    if (o.auto && (S().noCapitalBuy || ['goods']).includes(o.resource)) return;   // Tim 2026-11-22: goods refills come from your own towns only
    const price = S().buyPrice?.[o.resource] ?? 5, left = o.auto ? (s.autoBuy === false ? 0 : budgetOf(s, o.resource) - spentOf(s)) : (o.ryo || 0) - (o.ryoPaid || 0);
    const n = Math.min(need(), Math.floor(left / price));
    if (n > 0 && route(s.owner, 'capital', s.id)) accept(o.id, 'capital', n);
  }

  // Your own orders ship whatever the governor setting (Tim 2026-11-09): sources are found when placed and again
  // every governor review (stock that turned up since), before the clerk's auto orders.
  function coverManual() {
    const open = orders().filter(o => o.state === 'open' && !o.auto && o.kind !== 'sell' && o.kind !== 'ryo').sort((a, b) => b.urgent - a.urgent || a.created - b.created);
    for (const o of open) { const s = dest(o.to, o.owner); if (s && s.owner === o.owner) cover(s, o); }
  }
  function econTick() {
    // 8e-1: a war that ended: its open ryo orders are cancelled (what is not loaded goes back to its pot; ryo already
    // on a train or in a yard arrives and falls back to the town coffers or the treasury, deliverRyo)
    for (const o of orders()) if ((o.kind === 'ryo' || o.camp) && o.state === 'open' && o.war && !warOf(o.war)) { release(o); o.state = o.got >= o.amount - 1e-9 ? 'done' : 'cancelled'; o.done = state.tick ?? 0; }
    // keep the newest ended orders for the Rail ledger's Delivered / Losses tabs, drop older ones
    const ended = orders().filter(o => o.state !== 'open').sort((a, b) => (b.done ?? 0) - (a.done ?? 0));
    for (const o of ended.slice(S().keepEnded ?? 40)) if (inFlight(o.id) <= 1e-9) delete rec().orders[o.id];   // cargo still on its way keeps its order (it is delivered on arrival)
    if ((state.frontier.econTick ?? 0) % (data.governor?.reviewTicks || 1) === 0) coverManual();
  }

  // 8e-2: an auto ryo order into a war chest when it runs low (war.supply.chestLow), one open at a time per war and
  // side: refill ryo from the treasury within today's share above the keep line. The governor (clerk) calls it for a
  // defending town; the generals (war_general_brain.js) for camps and defending towns. Returns the amount ordered.
  function autoChest(owner, w, held = 0) {
    const P = W().supply || {}, clan = state.clans?.[owner];
    if (!w || !clan) return 0;
    const defend = w.defender === owner, chest = defend ? w.defense?.chest || 0 : w.camp?.chest || 0;
    if (chest - held >= (P.chestLow ?? 300)) return 0;
    if (orders().some(o => o.kind === 'ryo' && o.state === 'open' && o.owner === owner && o.war === w.id && o.auto)) return 0;
    const to = chestNode(w, owner);
    if (!to || !route(owner, 'capital', to)) return 0;
    const n = Math.floor(Math.min(P.refill ?? 500, autoRoom(clan)));
    if (n < (S().ryoMin ?? 10)) return 0;
    return ryoOrder({ owner, quiet: true }, { from: 'treasury', into: 'chest', war: w.id, amount: n, auto: true }) ? n : 0;
  }

  function clerk(s) {
    if (!s || s.capital || !s.owner) return;
    const owner = s.owner;
    for (const w of Object.values(state.frontier.wars?.list || {})) if (w.defender === owner && w.town === s.id) autoChest(owner, w);   // 8e-2
    if (!Object.values(state.frontier.rail?.links || {}).some(l => l.owner === owner && l.done && !l.closed && (l.from === s.id || l.to === s.id))) return;
    const min = S().minOrder ?? 10;
    // 1. auto orders for what the town lacks against its keep amount. Tim 2026-11-22 (fix list 13): only once the stock
    // (with what is already on its way) falls below ship.refillBelow of the keep, then one order back up to the keep, so
    // the market selling down to the keep never sets off small refills from far away
    const below = S().refillBelow ?? 0.5;
    for (const res of RES()) {
      const have = (s.stock[res] ?? 0) + openIncoming(s.id, res), keep = keepOf(s, res);
      if (have >= keep * below) continue;
      const lack = Math.min(keep - have, storageCap(s, data, res) - have);
      if (lack >= min) place({ owner, quiet: true }, { town: s.id, resource: res, amount: lack, auto: true });
    }
    for (const o of orders().filter(o => o.state === 'open' && o.to === s.id && !o.auto && o.kind !== 'ryo')) cover(s, o);   // your own orders first
    const mine = orders().filter(o => o.state === 'open' && o.to === s.id && o.auto && o.kind !== 'ryo').sort((a, b) => b.urgent - a.urgent || a.created - b.created);
    for (const o of mine) {   // 2. sources for auto orders (manual ones are covered first)
      cover(s, o);
      // an auto order shrinks to what could be sourced, so it always completes (and frees its budget); the next
      // review orders the rest again. Nothing sourced at all: it is dropped.
      const short = o.amount - o.got - inFlight(o.id) - o.sources.reduce((a, x) => a + x.amount, 0);
      if (short > 0) { o.amount -= short; if (o.amount <= 1e-9) delete rec().orders[o.id]; }
    }
    // 3. Tim 2026-11-22 (replaces the 2026-11-17 full-store rule): what is above the keep goes to the capital for ryo,
    // goods, timber and stone (ship.sell.resources), one batch per resource at a time, only once at least sell.min is
    // spare. The keep (plus reserved stock and the next hall tier cost) is what stays, war or not (Tim 2026-11-22: the
    // keep can be raised for a war); food is never sold on its own.
    const sell = S().sell || {};
    if (sell.on !== false && s.autoBuy !== false && route(owner, s.id, 'capital')) {
      const tierCost = nextTier(s, data)?.upgrade?.cost || {};
      for (const res of sell.resources || ['goods', 'timber', 'stone']) {
        if (orders().some(o => o.state === 'open' && o.kind === 'sell' && o.sellFrom === s.id && o.resource === res)) continue;
        const hold = Math.max(keepOf(s, res), tierCost[res] || 0) + reservedOf(s, res);
        const n = Math.floor(Math.min((s.stock[res] ?? 0) - hold, sell.batch ?? 240));
        if (n < Math.max(min, sell.min ?? 60)) continue;
        const id = `o${++rec().seq}`;
        rec().orders[id] = { id, owner, to: 'capital', kind: 'sell', sellFrom: s.id, resource: res, amount: n, got: 0, ryo: 0, pin: null, urgent: false, auto: true, state: 'open', sources: [], created: state.tick ?? 0 };
        accept(id, s.id, n);
      }
    }
  }

  // A station was torn up (rail.js tearUp, after its lines are gone): cargo waiting in its yard goes into that town's
  // stock (it stood at the town's own station), orders into a town with no line left are cancelled (their
  // reservations released), and a source that can no longer reach its order gives its reserved stock back.
  function tearDown(at) {
    const yard = rec().yards[at] || [];
    for (const c of yard) {
      if (!(c.amount > 0)) continue;
      const o = rec().orders[c.order];
      if (c.resource === 'ryo') { if (o) { refundRyo(o, o.from || 'capital', c.amount); o.amount = Math.max(o.got, o.amount - c.amount); } continue; }
      if (town(at)) world.change(at, c.resource, c.amount, 'ship');
    }
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

  // a camp cut off from the rail network (Tim 2026-11-17: orders wait and resume, as at a town whose station is a
  // ruin; before, they stopped and undelivered ryo went back): open orders into it stay open, cargo on a train or in
  // a yard waits there, and all carries on when the line is whole again. A war that ends first settles them as
  // before (econTick, trainGone).
  function campCut() {}
  // 8e-6: a train taken off its line with cargo aboard (a camp spur gone with its war): ryo goes back to where it
  // came from, other cargo is lost with the train
  function trainGone(t) {
    for (const c of t?.freight || []) {
      const o = rec().orders[c.order];
      if (!o || !(c.amount > 0)) continue;
      if (c.resource === 'ryo') refundRyo(o, o.from || 'capital', c.amount);
      o.amount = Math.max(o.got, o.amount - c.amount); o.lost = (o.lost || 0) + (c.resource === 'ryo' ? 0 : c.amount);
      if (o.state === 'open' && o.got >= o.amount - 1e-9) { o.state = 'done'; o.done = state.tick ?? 0; }
    }
    if (t) t.freight = [];
  }
  return { trainGone, campCut, clerk, coverManual, econTick, command, linked, route, keepOf, reservedOf, free, openIncoming, inFlight, accept, release, arrive, load, rob, tearDown, ryoOrder: (e, c) => ryoOrder(e, c), autoChest, autoRoom, keepLine, ryoOnTheWay };
}
