// Town card Shipments tab (rail shipments S4, Tim 2026-11-08/09; mock project files shipments_mock/
// shipments_menus_mock_v2.png). Menu restyle (Tim 2026-11-10): one row per resource with an icon, a stock bar to the
// storage cap with a tick at the keep amount, a typeable amount box, one Order button and the cost as a coin chip.
// Low rows light up red; a row that can't order says why instead of greying out. Tabs Order / Sell / Keep / Open /
// Ledger (the Rail ledger at full size). No scrollbars: the Open list pages. Reads the snapshot only and sends
// { type: 'frontier', action: 'ship', ... } commands (sim/frontier/shipments.js).
// createShipmentsTab({ game, data, cmd, usage }) -> { html(s), click(dataset, s), input(dataset, value, s) }   (usage = resourceUsage)
import { createRailLedger } from './rail_ledger.js';
import { defaultKeep } from './sim/frontier/storage.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tip = t => t ? ` data-tip="${esc(t)}"` : '';
const cap1 = r => r[0].toUpperCase() + r.slice(1);
const PAGE = 4;

export function createShipmentsTab({ game, data, cmd, usage = null }) {
  const SH = () => data?.railways?.ship || {};
  const RES = () => SH().resources || ['food', 'timber', 'stone', 'goods'];
  let sub = 'new', page = 0;
  const ledger = createRailLedger({ game, inCard: true, head: false });   // the Ledger tab (Tim 2026-11-10)
  const amts = {}, samts = {};   // typed amounts per resource (Order and Sell rows)
  const amt = r => amts[r] ?? 100, samt = r => samts[r] ?? 100;
  const form = { pin: null, urgent: false, ryo: null };   // shared order options; ryo null = full: enough to buy it all (Tim 2026-11-09)
  const F = () => game.state.frontier || {};
  const orders = () => Object.values(F().shipping?.orders || {});
  const links = owner => Object.values(F().rail?.links || {}).filter(l => l.owner === owner && l.done && !l.closed);
  const hasLine = s => links(s.owner).some(l => l.from === s.id || l.to === s.id);
  const name = id => id === 'capital' ? 'the capital' : F().settlements?.[id]?.name || id;
  const keepOf = (s, r) => (r === 'goods' && data?.market ? s.marketKeep : s.keep?.[r]) ?? (data ? defaultKeep(s, data, r) : 0);   // goods = the market hold-back
  const capOf = (s, r) => { const st = data?.storage; if (!st || st.uncapped?.includes(r)) return Infinity; const c = st.caps || []; return (c[Math.min(c.length, Math.max(1, s.tier || 1)) - 1] ?? Infinity) + (st.perStorehouse || 0) * (s.buildings || []).filter(b => b.type === 'storehouse' && b.stage === 'built').length; };
  const moving = id => { let n = 0; for (const t of Object.values(F().rail?.trains || {})) for (const c of t.freight || []) if (c.order === id) n += c.amount; return n; };
  const incoming = (s, r) => orders().filter(o => o.state === 'open' && o.to === s.id && o.resource === r).reduce((a, o) => a + o.amount - o.got, 0);
  const room = (s, r) => Math.max(0, Math.floor(capOf(s, r) - (s.stock[r] ?? 0) - incoming(s, r)));
  const price = r => SH().buyPrice?.[r] ?? 5;
  const PORT_TIP = r => `Buying from the capital: the capital keeps no stock, but its port wholesale houses (tonya) sell anything for ryo. Your towns with spare ${r} send it first, for free. Only what they can't cover is bought from the capital: the ryo is paid from this town at once, the cargo is loaded at the capital station and comes by the next train. ${cap1(r)} costs ${price(r)} ryo each there (selling there pays less). Cancel an order and the ryo for anything not loaded yet comes back. Budget 0 = never buy from the capital, wait for your towns.`;
  // linked towns of yours (for the source pin)
  const peers = s => { const seen = new Set([s.id]), todo = [s.id], L = links(s.owner); while (todo.length) { const a = todo.pop(); for (const l of L) { const n = l.from === a ? l.to : l.to === a ? l.from : null; if (n && !seen.has(n)) { seen.add(n); todo.push(n); } } } seen.delete(s.id); seen.delete('capital'); return [...seen]; };

  // what the order form would cost now: own towns' spare first (free), the rest bought from the capital within budget
  function estimate(s, r, n = amt(r)) {
    const spareOf = t => Math.max(0, Math.floor((t.stock?.[r] ?? 0) - keepOf(t, r) - (t.reserved?.[r] ?? 0)));
    const src = form.pin ? [form.pin] : peers(s);
    const towns = Math.min(n, src.reduce((a, id) => a + spareOf(F().settlements?.[id] || {}), 0));
    const can = form.pin ? 0 : Math.floor(Math.min(form.ryo ?? n * price(r), Math.floor(s.stock.ryo ?? 0)) / price(r));
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
  const bar = f => `<span class="shbar"><i style="width:${Math.round(Math.max(0, Math.min(1, f)) * 100)}%"></i></span>`;
  function orderRow(s, o, cancel) {
    const into = o.to === s.id, f = (o.got + moving(o.id)) / Math.max(1, o.amount);
    const src = o.kind === 'sell' ? 'to the capital (sale)' : into ? (o.sources?.length ? 'from ' + [...new Set(o.sources.map(x => name(x.from)))].join(', ') : o.got || moving(o.id) ? 'on the way' : 'finding a source') : `to ${name(o.to)}`;
    const st = moving(o.id) ? 'on the train' : o.got >= o.amount ? 'delivered' : 'waiting';
    return `<div class="shrow"><span>${into ? '<span class="dn tri"></span>' : '<span class="up tri"></span>'} ${cap1(o.resource)} ${o.amount}${o.urgent ? ' <b class="gold">urgent</b>' : ''}${o.auto ? ' <span class="dim">auto</span>' : ''}<br><span class="dim">${esc(src)}</span></span><span>${bar(f)} <span class="dim">${st}</span>${cancel && into && !o.auto ? ` <button data-act="ship" data-id="cancel:${o.id}" title="Cancel order">Cancel</button>` : ''}</span></div>`;
  }
  const mine = s => orders().filter(o => o.state === 'open' && (o.to === s.id || o.sellFrom === s.id || o.sources?.some(x => x.from === s.id)));

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
  // why a row can't order or sell right now, said in the row (Tim 2026-11-10), or '' when it can
  function why(n, rm, q, spare = null) {
    if (spare != null && spare < n) return spare < (SH().minOrder ?? 10) ? ['Nothing spare', 'No spare stock to sell (reserved stock is already promised to a train)'] : [`Spare ${spare}`, `Only ${spare} spare to sell: type a smaller amount`];
    if (rm != null && rm < n) return rm < (SH().minOrder ?? 10) ? ['Storage full', 'Storage is full, counting what is already on the way. Storehouses and a bigger town hall raise it.'] : [`Room for ${rm}`, `Storage has room for only ${rm} more (stock plus what is on the way): type a smaller amount`];
    if (q.left < n) return q.left < (SH().minOrder ?? 10) ? ['Cap reached', 'Order cap reached: it frees up as trains deliver'] : [`Cap ${q.left}`, `Order cap: only ${q.left} more until trains deliver: type a smaller amount`];
    return null;
  }
  const act = (id, label, go, t) => `<button class="shgo${go ? ' go' : ''}" data-act="ship" data-id="${id}"${tip(t)}>${label}</button>`;
  const blocked = w => `<span class="shwhy red"${tip(w[1])}>${esc(w[0])}</span>`;

  function orderTab(s) {
    const q = queue(s, false), pins = peers(s); if (form.pin && !pins.includes(form.pin)) form.pin = null;
    let h = '';
    for (const r of RES()) {
      const st = status(s, r), rm = room(s, r), n = amt(r), w = why(n, rm, q), c = estimate(s, r, n), cap = capOf(s, r);
      const cost = `~${c.ryo} ryo`, ct = `${c.towns} free from your towns${c.buy ? `, ${c.buy} bought at the capital for ${price(r)} each` : ''}${c.short ? `, ${c.short} must wait for stock` : ''}. ${PORT_TIP(r)}`;
      h += `<div class="shres${st.low ? ' low' : ''}">${icon(r)}<span class="shmid"><span class="shline"><span><b>${cap1(r)}</b> ${Math.floor(s.stock[r] ?? 0)}${Number.isFinite(cap) ? `<span class="dim"> / ${Math.floor(cap)}</span>` : ''}</span><span class="${st.low ? 'red' : 'dim'}">${esc(st.text)}</span></span>${meter(s, r)}</span>`
        + `<span class="shact">${num('amt:' + r, n)}${w ? blocked(w) : act('order:' + r, 'Order', st.low, `Order ${n} ${r}`)}${w ? '' : chip(cost, ct)}</span></div>`;
    }
    h += `<div class="shopts"><span${tip('Nearest: the clerk picks your town with spare stock nearest by rail, then buys from the capital. Pin one town to ship only from there.')}>Source <button data-act="ship" data-id="pin">${esc(form.pin ? name(form.pin) : 'Nearest')}</button></span>`
      + `<span${tip('Urgent orders are filled before others.')}>Urgent <button data-act="ship" data-id="urgent" class="${form.urgent ? 'on' : ''}">${form.urgent ? 'On' : 'Off'}</button></span>`
      + `<span${tip('The most ryo one order may spend buying from the capital. Leave it empty for Full: enough to buy all of it. 0 = never buy, wait for your towns.')}>Capital budget ${num('cbud', form.ryo ?? '', 50, ' placeholder="Full"')}</span></div>`;
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
      h += `<div class="shres">${icon(r)}<span class="shmid"><span class="shline"><span><b>${cap1(r)}</b> <span class="dim">spare ${spare(r)}</span></span><span class="dim">${sp(r)} ryo each</span></span>${meter(s, r)}</span>`
        + `<span class="shact">${num('samt:' + r, n)}${w ? blocked(w) : act('sell:' + r, 'Sell', false, T)}${w ? '' : chip(`~${Math.floor(n * sp(r))} ryo`, 'Paid when the cargo reaches the capital')}</span></div>`;
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
    // Tim 2026-11-09: say clearly, and briefly, that auto ordering is the governor's job and only while he is on auto
    h += s.autoBuild
      ? `<div class="shauto on"${tip('While the governor is on auto, his rail clerk orders what this town lacks (below its keep amounts), takes spare stock from your other towns first, buys the rest from the capital within the auto-buy budget, and sells spare goods.')}>Auto orders <b>on</b>, the governor keeps stock at your keep amounts</div>`
      : `<div class="shauto"${tip('Turn the governor to auto (Governor tab, Initiative On) and his rail clerk orders what this town lacks by himself. Your own orders always ship.')}>Auto orders <b>off</b>, governor not on auto</div>`;
    if (!hasLine(s)) return h + '<div class="shcard off"><b>Needs a rail line</b><br><span class="dim">Lay a line from this town\'s railway station (Link to...).</span></div>';
    const open = mine(s), T = (id, label, t) => `<button data-act="ship" data-id="sub:${id}" class="${sub === id ? 'on' : ''}"${tip(t)}>${label}</button>`;
    h += `<div class="shtabs five">${T('new', 'Order')}${T('sell', 'Sell')}${T('keep', 'Keep')}${T('open', `Open ${open.length}`)}${T('ledger', 'Ledger', 'All your rail shipments: open, delivered and lost')}</div>`;
    if (sub === 'new') h += orderTab(s);
    else if (sub === 'sell') h += sellTab(s);
    else if (sub === 'keep') h += keepTab(s);
    else if (sub === 'ledger') h += ledger.html().replace(/data-ledger="([^"]*)"/g, 'data-act="ship" data-id="lg~$1"');
    else {
      const pages = Math.max(1, Math.ceil(open.length / PAGE)); page = Math.min(page, pages - 1);
      h += open.length ? open.slice(page * PAGE, page * PAGE + PAGE).map(o => orderRow(s, o, true)).join('') : '<div class="dim shnote">No open orders.</div>';
      if (pages > 1) h += `<div class="shrow"><button data-act="ship" data-id="page:-1"${page ? '' : ' disabled'}>Prev</button><span class="dim">${page + 1} / ${pages}</span><button data-act="ship" data-id="page:1"${page < pages - 1 ? '' : ' disabled'}>Next</button></div>`;
    }
    return h;
  }

  // returns true when it handled the click
  function click(d, s) {
    if (d.act !== 'ship' || !s) return false;
    if (String(d.id).startsWith('lg~')) { ledger.click(d.id.slice(3)); return true; }
    const [k, a] = String(d.id).split(':');
    switch (k) {
      case 'sub': sub = a; page = 0; break;
      case 'page': page = Math.max(0, page + Number(a)); break;
      case 'cancel': cmd({ action: 'ship', mode: 'cancel', order: a }); break;
      case 'order': { const n = amt(a); cmd({ action: 'ship', mode: 'order', town: s.id, resource: a, amount: n, pin: form.pin, urgent: form.urgent, ryo: Math.min(form.ryo ?? n * price(a), Math.floor(s.stock.ryo ?? 0)) }); break; }
      case 'sell': cmd({ action: 'ship', mode: 'sell', town: s.id, resource: a, amount: samt(a) }); break;
      case 'urgent': form.urgent = !form.urgent; break;
      case 'pin': { const p = [null, ...peers(s)], i = p.indexOf(form.pin); form.pin = p[(i + 1) % p.length]; break; }
      case 'autobuy': cmd({ action: 'ship', mode: 'budget', town: s.id, autoBuy: s.autoBuy === false }); break;
      default: return false;
    }
    return true;
  }
  return { html, click, input };
}
