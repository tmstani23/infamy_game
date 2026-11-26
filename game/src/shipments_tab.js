// Town card Shipments tab (rail shipments S4, 2026-11-08/09; mock project files shipments_mock/
// shipments_menus_mock_v2.png). Menu restyle (2026-11-10): one row per resource with an icon, a stock bar to the
// storage cap with a tick at the keep amount, a typeable amount box, one Order button and the cost as a coin chip.
// Low rows light up red; a row that can't order says why instead of greying out. Tabs Order / Sell / Keep / Ledger
// (2026-11-23: the old Open tab merged into the Rail ledger, with This town / All towns and a countdown per row). Reads the snapshot only and sends
// { type: 'frontier', action: 'ship', ... } commands (sim/frontier/shipments.js).
// createShipmentsTab({ game, data, cmd, usage }) -> { html(s), click(dataset, s), input(dataset, value, s) }   (usage = resourceUsage)
import { createRailLedger } from './rail_ledger.js';
import { defaultKeep } from './sim/frontier/storage.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tip = t => t ? ` data-tip="${esc(t)}"` : '';
const cap1 = r => r[0].toUpperCase() + r.slice(1);

export function createShipmentsTab({ game, data, cmd, usage = null }) {
  const SH = () => data?.railways?.ship || {};
  const RES = () => SH().resources || ['food', 'timber', 'stone', 'goods'];
  let sub = 'new';
  const ledger = createRailLedger({ game, data, inCard: true, head: false });   // the Ledger tab (2026-11-10; replaces Open 2026-11-23)
  const amts = {}, samts = {};   // typed amounts per resource (Order and Sell rows)
  let ryoAmt = 500;   // 8e-3: the Ryo row's typed amount (from the Clan treasury)
  const amt = r => amts[r] ?? 100, samt = r => samts[r] ?? 100;
  const form = { urgent: false, ryo: null };   // shared order options (the source is picked in the order slip); ryo null = full: enough to buy it all (2026-11-09)
  const F = () => game.state.frontier || {};
  const orders = () => Object.values(F().shipping?.orders || {});
  const links = owner => Object.values(F().rail?.links || {}).filter(l => l.owner === owner && l.done && !l.closed);
  const hasLine = s => links(s.owner).some(l => l.from === s.id || l.to === s.id);
  const name = id => id === 'capital' ? 'the capital' : F().settlements?.[id]?.name || id;
  const keepOf = (s, r) => (r === 'goods' && data?.market ? s.marketKeep : s.keep?.[r]) ?? (data ? defaultKeep(s, data, r) : 0);   // goods = the market hold-back
  const capOf = (s, r) => { const st = data?.storage; if (!st || st.uncapped?.includes(r)) return Infinity; const c = st.caps || []; return (c[Math.min(c.length, Math.max(1, s.tier || 1)) - 1] ?? Infinity) + (st.perStorehouse || 0) * (s.buildings || []).filter(b => b.type === 'storehouse' && b.stage === 'built').length; };
  const incoming = (s, r) => orders().filter(o => o.state === 'open' && o.to === s.id && o.resource === r).reduce((a, o) => a + o.amount - o.got, 0);
  const room = (s, r) => Math.max(0, Math.floor(capOf(s, r) - (s.stock[r] ?? 0) - incoming(s, r)));
  const price = r => SH().buyPrice?.[r] ?? 5;
  // 8e-1: a town of yours joined to the capital by open lines (through any chain of your towns)
  const toCapital = s => { const seen = new Set([s.id]), todo = [s.id], L = links(s.owner); while (todo.length) { const a = todo.pop(); if (a === 'capital') return true; for (const l of L) { const n = l.from === a ? l.to : l.to === a ? l.from : null; if (n && !seen.has(n)) { seen.add(n); todo.push(n); } } } return false; };
  const treasury = s => Math.floor(game.state.clans?.[s.owner]?.ryo ?? 0);
  const keepLine = s => game.state.clans?.[s.owner]?.treasuryKeep ?? data?.war?.supply?.treasuryKeep ?? 1000;
  const RYO_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#e8b23a" stroke="#8a5e12" stroke-width="2"/><rect x="9.5" y="9.5" width="5" height="5" fill="#8a5e12"/></svg>';
  // 8e-3 (mock d, 2026-11-16): ryo sent by train from the Clan treasury into this town's coffers
  function ryoRow(s) {
    const n = ryoAmt, left = treasury(s) - n, kl = keepLine(s);
    const w = !toCapital(s) ? ['Needs a line', 'Needs a rail line from the capital to this town (through any of your towns)'] : n > treasury(s) ? ['Treasury short', `The Clan treasury has only ${treasury(s)} ryo`] : null;
    const T = `Send ${n} ryo from the Clan treasury into ${s.name} coffers. It leaves the treasury now and rides the guard car of the next train from the capital (no wagon space). Cancel before it is loaded and it comes back. Robbers can take it on the way. The treasury keep line (${kl}) only holds back auto orders, never yours.`;
    return `<div class="shres" data-row="ryo">${`<span class="shico">${RYO_ICON}</span>`}<span class="shmid"><span class="shline"><span><b>Ryo</b> ${Math.floor(s.stock.ryo ?? 0)} <span class="dim">coffers</span></span></span><span class="${left < kl ? 'red' : 'dim'} shsub"${tip(`Clan treasury ${treasury(s)}, keep line ${kl}`)}>From Clan treasury, keeps ${Math.max(0, left).toLocaleString('en-US')}</span></span>`
      + `<span class="shact">${num('ramt', n)}${w ? blocked(w) : act('ryoopen', 'Send', false, T)}${w ? '' : chip(String(n), 'Paid from the Clan treasury now')}</span></div>`;
  }
  const PORT_TIP = r => `Buying from the capital: the capital keeps no stock, but its port wholesale houses (tonya) sell anything for ryo. Your towns with spare ${r} send it first, for free. Only what they can't cover is bought from the capital: the ryo is paid from this town at once, the cargo is loaded at the capital station and comes by the next train. ${cap1(r)} costs ${price(r)} ryo each there (selling there pays less). Cancel an order and the ryo for anything not loaded yet comes back. Budget 0 = never buy from the capital, wait for your towns.`;
  // linked towns of yours (for the source pin)
  const peers = s => { const seen = new Set([s.id]), todo = [s.id], L = links(s.owner); while (todo.length) { const a = todo.pop(); for (const l of L) { const n = l.from === a ? l.to : l.to === a ? l.from : null; if (n && !seen.has(n)) { seen.add(n); todo.push(n); } } } seen.delete(s.id); seen.delete('capital'); return [...seen]; };

  // what the order form would cost now: own towns' spare first (free), the rest bought from the capital within budget
  function estimate(s, r, n = amt(r)) {
    const spareOf = t => Math.max(0, Math.floor((t.stock?.[r] ?? 0) - keepOf(t, r) - (t.reserved?.[r] ?? 0)));
    const src = peers(s);
    const towns = Math.min(n, src.reduce((a, id) => a + spareOf(F().settlements?.[id] || {}), 0));
    const can = Math.floor(Math.min(form.ryo ?? n * price(r), Math.floor(s.stock.ryo ?? 0)) / price(r));
    const buy = Math.min(n - towns, can);
    return { towns, buy, ryo: buy * price(r), short: n - towns - buy };
  }
  // queue cap, same rule as the sim: your own open orders into (or sales out of) a town may add up to queueTrips
  // trainloads per line at that town
  function queue(s, sell) {
    const T = data?.railways?.train || {}, load = Math.max(1, T.consist ? T.consist.filter(k => k === 'goods').length : 1) * (SH().wagonLoad ?? 60);
    const lines = links(s.owner).filter(l => l.from === s.id || l.to === s.id).length;
    const cap = (SH().queueTrips ?? 3) * load * Math.max(1, lines);
    const queued = Math.round(orders().filter(o => o.state === 'open' && !o.auto && (sell ? o.kind === 'sell' && o.sellFrom === s.id : o.to === s.id && o.kind !== 'sell')).reduce((a, o) => a + o.amount - o.got, 0));
    return { cap, queued, left: Math.max(0, Math.floor(cap - queued)) };
  }
  const CAP_TIP = 'Order cap: your own open orders into this town can add up to 3 trainloads for each rail line here, so new orders arrive within a few trips. It frees up as cargo is delivered. Build more lines to this town to raise it.';
  const capLine = (q, word) => `<div class="shnote dim"${tip(CAP_TIP.replace('3', SH().queueTrips ?? 3).replace('orders into', word === 'sell' ? 'sales out of' : 'orders into'))}>Order cap: <b class="gold">${q.left}</b> more now, ${q.queued} / ${q.cap} booked on trains</div>`;
  // typed amounts (Order / Sell boxes)
  function input(d, v, s) {
    const raw = Math.max(0, Math.round(Number(v)) || 0), n = Math.max(SH().minOrder ?? 10, raw);
    const [k, r] = String(d.id).split(':');
    if (k === 'amt' && RES().includes(r)) amts[r] = n;
    else if (k === 'samt' && RES().includes(r)) samts[r] = n;
    else if (k === 'ramt') ryoAmt = n;
    else if (k === 'cbud') form.ryo = String(v).trim() === '' ? null : raw;
    else if (k === 'keep' && s && RES().includes(r)) cmd({ action: 'ship', mode: 'keep', town: s.id, resource: r, keep: raw });
    else if (k === 'bud' && s) cmd({ action: 'ship', mode: 'budget', town: s.id, ryo: raw });
    else return false;
    return true;
  }
  function status(s, r) {
    const have = s.stock[r] ?? 0, u = usage?.(s, r, data), net = u?.net ?? 0;
    if (net < -1e-6 && have > 0) { const min = have / -net / 60; if (min < 15) return { text: `out in about ${Math.max(1, Math.round(min))} min`, low: true }; }
    if (have < keepOf(s, r)) return { text: 'below keep', low: true };
    return { text: incoming(s, r) > 0 ? 'more on the way' : 'fine', low: false };
  }

  // drawn resource icons (no glyphs), in the Pack for war style
  const ICON = {
    food: '<svg viewBox="0 0 22 18"><g stroke="#2a1d10" stroke-width="1"><rect x="2.5" y="3" width="17" height="12" rx="6" fill="#d8bf78"/><path d="M7 3.4v11.2M11 3v12M15 3.4v11.2" stroke="#8a6a32" stroke-width="1.6"/><ellipse cx="3.6" cy="9" rx="1.6" ry="5.2" fill="#c4a35c"/></g></svg>',
    timber: '<svg viewBox="0 0 22 18"><g stroke="#2a1d10" stroke-width="1"><rect x="4" y="9.5" width="12" height="7" rx="2" fill="#7a4f2a"/><ellipse cx="4" cy="13" rx="2.6" ry="3.5" fill="#d9a866"/><rect x="9" y="9.5" width="12" height="7" rx="2" fill="#7a4f2a"/><ellipse cx="9" cy="13" rx="2.6" ry="3.5" fill="#d9a866"/><rect x="6.5" y="3.5" width="12" height="7" rx="2" fill="#7a4f2a"/><ellipse cx="6.5" cy="7" rx="2.6" ry="3.5" fill="#d9a866"/></g></svg>',
    stone: '<svg viewBox="0 0 22 16"><g stroke="#2a1d10" stroke-width="1"><path d="M11 1 19 4.5 11 8 3 4.5Z" fill="#d4d0c4"/><path d="M3 4.5 11 8 11 15 3 11.5Z" fill="#9c988c"/><path d="M19 4.5 11 8 11 15 19 11.5Z" fill="#7d796f"/></g></svg>',
    goods: '<svg viewBox="0 0 22 18"><g stroke="#2a1d10" stroke-width="1"><path d="M3 8h16l-1.5 8h-13z" fill="#6a4a8a"/><path d="M3 8c2-3 5-4 8-4s6 1 8 4z" fill="#7d5aa0"/><path d="M9 4.5c-1.5-2.5 1.2-3.6 2-1.2.8-2.4 3.5-1.3 2 1.2" fill="#7d5aa0"/><path d="M5.5 11.5h11" stroke="#c9b07a" stroke-width="1.2"/></g></svg>',
  };
  const icon = r => `<span class="shico">${ICON[r] || ''}</span>`;
  const chip = (text, t) => `<span class="shchip"${tip(t)}><i></i>${text}</span>`;
  const num = (id, v, step = 10, extra = '') => `<input class="shnum" type="number" min="0" step="${step}" data-act="shipinput" data-id="${id}" value="${v}"${extra}>`;
  // stock bar filled to the storage cap, with a tick at the keep amount
  function meter(s, r) {
    const have = s.stock[r] ?? 0, keep = keepOf(s, r), cap = capOf(s, r);
    const top = Number.isFinite(cap) ? cap : Math.max(have, keep, 1) * 1.25, pc = x => Math.round(Math.max(0, Math.min(1, x / Math.max(1, top))) * 100);
    return `<span class="shmeter"${tip(`Stock ${Math.floor(have)}${Number.isFinite(cap) ? ` of ${Math.floor(cap)} storage` : ''}. The tick is your keep amount, ${keep}.`)}><i style="width:${pc(have)}%"></i><b style="left:${pc(keep)}%"></b></span>`;
  }
  // why a row can't order or sell right now, said in the row (2026-11-10), or '' when it can
  function why(n, rm, q, spare = null) {
    if (spare != null && spare < n) return spare < (SH().minOrder ?? 10) ? ['Nothing spare', 'No spare stock to sell (reserved stock is already promised to a train)'] : [`Spare ${spare}`, `Only ${spare} spare to sell: type a smaller amount`];
    if (rm != null && rm < n) return rm < (SH().minOrder ?? 10) ? ['Storage full', 'Storage is full, counting what is already on the way. Storehouses and a bigger town hall raise it.'] : [`Room for ${rm}`, `Storage has room for only ${rm} more (stock plus what is on the way): type a smaller amount`];
    if (q.left < n) return q.left < (SH().minOrder ?? 10) ? ['Cap reached', 'Order cap reached: it frees up as trains deliver'] : [`Cap ${q.left}`, `Order cap: only ${q.left} more until trains deliver: type a smaller amount`];
    return null;
  }
  const act = (id, label, go, t) => `<button class="shgo${go ? ' go' : ''}" data-act="ship" data-id="${id}"${tip(t)}>${label}</button>`;
  const blocked = w => `<span class="shwhy red"${tip(w[1])}>${esc(w[0])}</span>`;

  // ---- the order slip (2026-11-25, mock project files order_confirm/mock_r5.png): Order, Sell and Send ryo open
  // a paper slip beside the row: pick the source (Nearest first / one of your towns / the capital), see what each
  // sends, the cost and about when it arrives, then Send (Enter) or close (Esc). Nothing is sent before that.
  let slip = null;   // { kind: 'order'|'sell'|'ryo', r, town, pin: null|townId|'capital' }
  const T0 = () => data?.railways?.train || {};
  // rail distance and stops from a to b over your open lines (Dijkstra on link length)
  function railTo(owner, a, b) {
    const L = links(owner), dist = { [a]: 0 }, hops = { [a]: 0 }, done = new Set();
    for (;;) {
      let u = null; for (const k in dist) if (!done.has(k) && (u == null || dist[k] < dist[u])) u = k;
      if (u == null) return null; if (u === b) return { d: dist[u], hops: hops[u] }; done.add(u);
      for (const l of L) { const v = l.from === u ? l.to : l.to === u ? l.from : null; if (!v || done.has(v)) continue; const nd = dist[u] + (l.length || 0); if (dist[v] == null || nd < dist[v]) { dist[v] = nd; hops[v] = hops[u] + 1; } }
    }
  }
  // about how long by rail (estimate: run time plus a stop at every station on the way and one wait for the train)
  const etaSecs = (owner, a, b) => { const p = railTo(owner, a, b); if (!p) return null; const T = T0(); return p.d / Math.max(1, T.speed ?? 36) + (p.hops + 1) * (T.stopSeconds ?? 60); };
  const mins = sec => sec == null ? '' : `${Math.max(1, Math.round(sec / 60))} min`;
  const spareAt = (t, r) => Math.max(0, Math.floor((t.stock?.[r] ?? 0) - keepOf(t, r) - (t.reserved?.[r] ?? 0)));
  const coffers = s => Math.floor(s.stock.ryo ?? 0);
  const fmt = n => Math.floor(n).toLocaleString('en-US');
  // what each source choice would do for n of r into town s
  function plan(s, r, n, pin) {
    const towns = peers(s).map(id => F().settlements?.[id]).filter(Boolean).map(t => ({ t, spare: spareAt(t, r), eta: etaSecs(s.owner, t.id, s.id) })).filter(x => x.eta != null).sort((a, b) => a.eta - b.eta);
    const capEta = etaSecs(s.owner, 'capital', s.id), p = price(r), budget = Math.min(form.ryo ?? n * p, coffers(s));
    if (pin === 'capital') { const cost = n * p; return { sends: [], buy: n, cost, short: 0, eta: capEta, can: capEta != null && budget >= cost }; }
    if (pin) { const x = towns.find(x => x.t.id === pin), k = Math.min(n, x?.spare ?? 0); return { sends: x && k ? [{ name: x.t.name, n: k }] : [], buy: 0, cost: 0, short: n - k, eta: x?.eta ?? null, can: !!x && k > 0 }; }
    const sends = []; let left = n, eta = 0;
    for (const x of towns) { if (left <= 0) break; const k = Math.min(left, x.spare); if (k > 0) { sends.push({ name: x.t.name, n: k }); left -= k; eta = Math.max(eta, x.eta); } }
    const buy = capEta == null ? 0 : Math.min(left, Math.floor(budget / p)); if (buy > 0) eta = Math.max(eta, capEta);
    return { sends, buy, cost: buy * p, short: left - buy, eta: sends.length || buy ? eta : null, can: true };
  }
  function slipHtml(s) {
    if (!slip || slip.town !== s.id) return '';
    const k = slip.kind, r = slip.r;
    let h = `<div class="shslip" data-slip="${k === 'ryo' ? 'ryo' : r}"><i class="shtail"></i>`;
    const head = (kick, n, id, what, to) => `<div class="shkick">${kick}</div><div class="shhead">${k === 'ryo' ? `<span class="shico">${RYO_ICON}</span>` : icon(r)}<span class="shamtbox">${num(id, n)}</span><b>${what}</b></div><div class="shto">${to}</div><i class="shbrush"></i>`;
    const foot = (label, ok, why) => `<div class="shsfoot">${ok ? `<button class="shseal" data-act="ship" data-id="slipsend">${label}</button>` : `<span class="shseal off">${esc(why || label)}</span>`}<span class="shkeys">Enter sends<br>Esc closes</span></div>`;
    if (k === 'order') {
      const n = amt(r), q = queue(s, false), w = why(n, room(s, r), q), cur = plan(s, r, n, slip.pin);
      h += head('Rail order', n, 'amt:' + r, cap1(r), `to ${esc(s.name)}, on the next trains`);
      h += '<div class="shcols"><span>Ship from</span><span>Sends</span><span>Arrives</span></div>';
      const row = (pin, title, sub, sends, small, eta, off, t) => `<button class="shsrc${slip.pin === pin ? ' on' : ''}${off ? ' off' : ''}" data-act="ship" data-id="src:${pin ?? 'near'}"${off ? ' disabled' : ''}${tip(t)}><i class="shmark"></i><span class="shsn"><b>${esc(title)}</b><small${off === 'red' ? ' class="red"' : ''}>${esc(sub)}</small></span><span class="shsv"><b>${sends}</b><small>${esc(small)}</small></span><span class="shse">${eta}</span></button>`;
      const near = plan(s, r, n, null);
      const nearSub = near.sends.length ? near.sends.map(x => x.name).join(', then ') + (near.buy ? ', then the capital' : '') : near.buy ? 'the capital' : 'no spare anywhere yet';
      h += row(null, 'Nearest first', nearSub, `${fmt(n - near.short)} of ${fmt(n)}`, near.cost ? `${fmt(near.cost)} ryo` : near.short ? `${fmt(near.short)} on later trains` : 'free', mins(near.eta), false, 'Your towns with spare stock send first, nearest by rail, free. What they cannot cover is bought at the capital within the capital budget.');
      for (const id of peers(s)) {
        const t = F().settlements?.[id]; if (!t) continue;
        const sp = spareAt(t, r), e = etaSecs(s.owner, id, s.id), k2 = Math.min(n, sp);
        h += row(id, t.name, sp > 0 ? `${fmt(sp)} spare` : 'nothing spare above its keep', `${fmt(k2)} of ${fmt(n)}`, k2 < n ? `${fmt(n - k2)} on later trains` : 'free', mins(e), sp <= 0 || e == null, `Only from ${t.name}: it sends its spare ${r} above its keep amount, free. The rest follows on later trains as it gets spare. Never bought at the capital.`);
      }
      const cp = plan(s, r, n, 'capital'), noLine = cp.eta == null;
      h += row('capital', 'The capital', noLine ? 'needs a rail line to the capital' : cp.can ? `buy it all, ${price(r)} ryo each` : `${fmt(cp.cost)} ryo, you have ${fmt(Math.min(form.ryo ?? Infinity, coffers(s)))}`, `${fmt(n)} of ${fmt(n)}`, `${fmt(cp.cost)} ryo`, mins(cp.eta), noLine ? true : cp.can ? false : 'red', `Buy all of it at the capital wholesale houses, ${price(r)} ryo each, paid from ${s.name} coffers now${form.ryo != null ? ` (capital budget ${form.ryo})` : ''}. Cancel and the ryo for anything not loaded comes back.`);
      h += `<i class="shbrush"></i><div class="shtot"><b>Cost: ${cur.cost ? `${fmt(cur.cost)} ryo` : 'free'}</b><span>${cur.eta != null ? `arrives in about ${mins(cur.eta)}` : 'waits for spare stock'}</span></div>`;
      h += `<button class="shurg${form.urgent ? ' on' : ''}" data-act="ship" data-id="urgent"${tip('Urgent orders are filled before your others.')}><i></i><b>Urgent</b> fill this before other orders</button>`;
      h += foot('Send order', !w && (slip.pin == null || cur.can), w ? w[0] : 'Pick a source');
    } else if (k === 'sell') {
      const n = samt(r), sp = SH().sellPrice?.[r] ?? 2, spare = Math.max(0, Math.floor((s.stock[r] ?? 0) - (s.reserved?.[r] ?? 0))), w = why(n, null, queue(s, true), spare), e = etaSecs(s.owner, s.id, 'capital');
      h += head('Rail sale', n, 'samt:' + r, cap1(r), `from ${esc(s.name)} to the capital`);
      h += `<div class="shbill"><span>Spare here</span><b>${fmt(spare)}</b><span>Capital pays</span><b>${sp} ryo each</b><span>Reaches the capital</span><b>about ${mins(e)}</b></div>`;
      h += `<i class="shbrush"></i><div class="shtot"><b>Pays about ${fmt(n * sp)} ryo</b><span>into ${esc(s.name)} coffers on arrival</span></div>`;
      h += foot('Send sale', !w, w?.[0]);
    } else {
      const n = ryoAmt, have = treasury(s), kl = keepLine(s), e = etaSecs(s.owner, 'capital', s.id);
      const w = !toCapital(s) ? 'Needs a line' : n > have ? 'Treasury short' : null;
      h += head('Ryo by train', n, 'ramt', 'ryo', `from the Clan treasury to ${esc(s.name)} coffers`);
      h += `<div class="shbill"><span>Clan treasury</span><b>${fmt(have)}</b><span>Left after</span><b class="${have - n < kl ? 'red' : ''}">${fmt(Math.max(0, have - n))}</b><span>Arrives</span><b>about ${mins(e)}</b></div>`;
      h += `<i class="shbrush"></i><div class="shtot"><b>Paid from the treasury now</b><span>rides the guard car</span></div>`;
      h += foot('Send ryo', !w, w);
    }
    return h + '</div>';
  }
  function send(s) {
    if (!slip || slip.town !== s.id) return;
    const r = slip.r;
    if (slip.kind === 'order') { const n = amt(r), pin = slip.pin; cmd({ action: 'ship', mode: 'order', town: s.id, resource: r, amount: n, pin, urgent: form.urgent, ryo: pin && pin !== 'capital' ? 0 : Math.min(form.ryo ?? n * price(r), coffers(s)) }); }
    else if (slip.kind === 'sell') cmd({ action: 'ship', mode: 'sell', town: s.id, resource: r, amount: samt(r) });
    else cmd({ action: 'ship', mode: 'ryo', from: 'treasury', into: 'coffers', to: s.id, amount: ryoAmt });
    slip = null; form.urgent = false;
  }
  // Enter sends, Esc closes while a slip is open (the panel calls this from a capture key listener)
  function key(e, s) {
    if (!slip || !s) return false;
    if (e.code === 'Escape') { slip = null; return true; }
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return false;
    const t = e.target;
    if (t?.dataset?.act === 'shipinput') { if (!t.closest?.('.shslip')) return false; input(t.dataset, t.value, s); t.blur?.(); }
    const ok = slip.kind === 'order' ? (() => { const n = amt(slip.r); return !why(n, room(s, slip.r), queue(s, false)) && (slip.pin == null || plan(s, slip.r, n, slip.pin).can); })() : true;
    if (ok) send(s);
    return true;
  }
  // place the slip beside its row (left of the buttons, inside the tab), after each draw
  function fit(root) {
    const el = root?.querySelector?.('.shslip'), box = el?.parentElement; if (!el || !box) return;
    const row = box.querySelector(`[data-row="${el.dataset.slip}"]`); if (!row) return;
    const narrow = box.clientWidth < el.offsetWidth + 170; el.classList.toggle('wide', narrow);
    const tabs = box.querySelector('.shtabs'), floor = tabs ? tabs.offsetTop + tabs.offsetHeight + 4 : 0;   // never over the tab bar
    const top = Math.max(floor, Math.min(row.offsetTop - 12, box.scrollHeight - el.offsetHeight - 4));
    el.style.top = `${top}px`;
    const tail = el.querySelector('.shtail'); if (tail) tail.style.top = `${Math.max(10, row.offsetTop + row.offsetHeight / 2 - top - 9)}px`;
  }

  function orderTab(s) {
    const q = queue(s, false);
    let h = '';
    for (const r of RES()) {
      const st = status(s, r), rm = room(s, r), n = amt(r), w = why(n, rm, q), c = estimate(s, r, n), cap = capOf(s, r);
      const cost = `~${c.ryo} ryo`, ct = `${c.towns} free from your towns${c.buy ? `, ${c.buy} bought at the capital for ${price(r)} each` : ''}${c.short ? `, ${c.short} must wait for stock` : ''}. ${PORT_TIP(r)}`;
      h += `<div class="shres${st.low ? ' low' : ''}${slip?.kind === 'order' && slip.r === r ? ' slipped' : ''}" data-row="${r}">${icon(r)}<span class="shmid"><span class="shline"><span><b>${cap1(r)}</b> ${Math.floor(s.stock[r] ?? 0)}${Number.isFinite(cap) ? `<span class="dim"> / ${Math.floor(cap)}</span>` : ''}</span><span class="${st.low ? 'red' : 'dim'}">${esc(st.text)}</span></span>${meter(s, r)}</span>`
        + `<span class="shact">${num('amt:' + r, n)}${w ? blocked(w) : act('open:' + r, 'Order', st.low, `Order ${n} ${r}: pick where it comes from, then send`)}${w ? '' : chip(cost, ct)}</span></div>`;
    }
    h += ryoRow(s);
    h += `<div class="shopts"><span${tip('The most ryo one order may spend buying from the capital. Leave it empty for Full: enough to buy all of it. 0 = never buy, wait for your towns.')}>Capital budget ${num('cbud', form.ryo ?? '', 50, ' placeholder="Full"')}</span></div>`;
    h += `<div class="shnote dim"${tip(`The capital keeps no stock, but its wholesale houses sell anything for ryo, paid from this town when you order. Prices each: ${RES().map(r => `${r} ${price(r)}`).join(', ')}. Cancel and the ryo for anything not loaded yet comes back.`)}>Your other towns send spare stock free. Only the rest is bought from the capital</div>` + capLine(q, 'order');
    return h;
  }
  function sellTab(s) {
    const sp = r => SH().sellPrice?.[r] ?? 2, spare = r => Math.max(0, Math.floor((s.stock[r] ?? 0) - (s.reserved?.[r] ?? 0)));
    const toCap = links(s.owner).length && (() => { const seen = new Set([s.id]), todo = [s.id], L = links(s.owner); while (todo.length) { const a = todo.pop(); if (a === 'capital') return true; for (const l of L) { const n = l.from === a ? l.to : l.to === a ? l.from : null; if (n && !seen.has(n)) { seen.add(n); todo.push(n); } } } return false; })();
    if (!toCap) return '<div class="shcard off"><b>Needs a rail line to the capital</b></div>';
    const q = queue(s, true);
    let h = '';
    for (const r of RES()) {
      const n = samt(r), w = why(n, null, q, spare(r)), T = `Sell ${n} ${r} to the capital: the cargo leaves on the next train and the ryo comes to this town when it reaches the capital. The capital pays less than it charges (${cap1(r)}: sells for ${sp(r)}, buys for ${price(r)}). Keep amounts are not checked here: you choose.`;
      h += `<div class="shres" data-row="${r}">${icon(r)}<span class="shmid"><span class="shline"><span><b>${cap1(r)}</b> <span class="dim">spare ${spare(r)}</span></span><span class="dim">${sp(r)} ryo each</span></span>${meter(s, r)}</span>`
        + `<span class="shact">${num('samt:' + r, n)}${w ? blocked(w) : act('sellopen:' + r, 'Sell', false, T)}${w ? '' : chip(`~${Math.floor(n * sp(r))} ryo`, 'Paid when the cargo reaches the capital')}</span></div>`;
    }
    return h + capLine(q, 'sell');
  }
  function keepTab(s) {
    let h = '<div class="dim shnote">Never shipped out below the keep amount. The governor orders up to it. Goods: the same level as the market hold-back.</div>';
    for (const r of RES()) h += `<div class="shres keep">${icon(r)}<span class="shmid"><span class="shline"><span><b>${cap1(r)}</b> <span class="dim">stock ${Math.floor(s.stock[r] ?? 0)}${s.reserved?.[r] ? `, reserved ${Math.floor(s.reserved[r])}` : ''}</span></span></span>${meter(s, r)}</span><span class="shact">${num('keep:' + r, keepOf(s, r))}</span></div>`;
    const bud = s.shipBudget ?? SH().budget ?? 150;
    h += `<div class="shopts"><span${tip('Auto orders may buy from the capital with up to this much ryo tied up at once. Off: the governor never buys or sells from the capital.')}>Auto-buy from the capital <button data-act="ship" data-id="autobuy" class="${s.autoBuy === false ? '' : 'on'}">${s.autoBuy === false ? 'Off' : 'On'}</button></span><span>Budget ${num('bud', bud, 50)} ryo</span></div>`;
    return h;
  }

  function html(s) {
    let h = `<h1>${esc(s.name)}</h1>`;
    // 2026-11-09: say clearly, and briefly, that auto ordering is the governor's job and only while he is on auto
    h += s.autoBuild
      ? `<div class="shauto on"${tip('While the governor is on auto, his rail clerk orders what this town lacks (below its keep amounts), takes spare stock from your other towns first, buys the rest from the capital within the auto-buy budget, and sells goods, timber and stone above your keep amounts to the capital.')}>Auto orders <b>on</b>, the governor keeps stock at your keep amounts</div>`
      : `<div class="shauto"${tip('Turn the governor to auto (Governor tab, Initiative On) and his rail clerk orders what this town lacks by himself. Your own orders always ship.')}>Auto orders <b>off</b>, governor not on auto</div>`;
    if (!hasLine(s)) return h + '<div class="shcard off"><b>Needs a rail line</b><br><span class="dim">Lay a line from this town\'s railway station (Link to...).</span></div>';
    const T = (id, label, t) => `<button data-act="ship" data-id="sub:${id}" class="${sub === id ? 'on' : ''}"${tip(t)}>${label}</button>`;
    h += `<div class="shtabs four">${T('new', 'Order')}${T('sell', 'Sell')}${T('keep', 'Keep')}${T('ledger', 'Ledger', 'Rail shipments of this town or all towns: open with countdowns, delivered and lost')}</div>`;
    if (slip && (slip.town !== s.id || (slip.kind === 'sell') !== (sub === 'sell') || sub === 'keep' || sub === 'ledger')) slip = null;
    if (sub === 'new') h += orderTab(s) + slipHtml(s);
    else if (sub === 'sell') h += sellTab(s) + slipHtml(s);
    else if (sub === 'keep') h += keepTab(s);
    else h += ledger.html(s.id).replace(/data-ledger="([^"]*)"/g, 'data-act="ship" data-id="lg~$1"');
    return h;
  }

  // returns true when it handled the click
  function click(d, s) {
    if (d.act !== 'ship' || !s) return false;
    if (String(d.id).startsWith('lg~')) { const r = ledger.click(d.id.slice(3)); if (r?.cancel) cmd({ action: 'ship', mode: 'cancel', order: r.cancel }); return true; }
    const [k, a] = String(d.id).split(':');
    switch (k) {
      case 'sub': sub = a === 'open' ? 'ledger' : a; break;
      case 'cancel': cmd({ action: 'ship', mode: 'cancel', order: a }); break;
      case 'open': slip = slip?.kind === 'order' && slip.r === a ? null : { kind: 'order', r: a, town: s.id, pin: null }; form.urgent = false; break;
      case 'sellopen': slip = slip?.kind === 'sell' && slip.r === a ? null : { kind: 'sell', r: a, town: s.id }; break;
      case 'ryoopen': slip = slip?.kind === 'ryo' ? null : { kind: 'ryo', town: s.id }; break;
      case 'src': if (slip) slip.pin = a === 'near' ? null : a; break;
      case 'slipsend': send(s); break;
      case 'slipclose': slip = null; break;
      case 'urgent': form.urgent = !form.urgent; break;
      case 'autobuy': cmd({ action: 'ship', mode: 'budget', town: s.id, autoBuy: s.autoBuy === false }); break;
      default: return false;
    }
    return true;
  }
  return { html, click, input, key, fit, slipOpen: () => !!slip };
}
