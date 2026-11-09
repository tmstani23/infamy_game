// Town card Shipments tab (rail shipments S4, Tim 2026-11-08/09; mock project files shipments_mock/
// shipments_menus_mock_v2.png). Deployment-panel look. Simple mode: one card per resource with Order 50 / Order 100.
// Advanced: New order / Keep / Open tabs. No scrollbars: the Open list pages. Reads the snapshot only and sends
// { type: 'frontier', action: 'ship', ... } commands (sim/frontier/shipments.js).
// createShipmentsTab({ game, data, cmd, usage }) -> { html(s), click(dataset, s) }   (usage = resourceUsage)
import { createRailLedger } from './rail_ledger.js';
import { defaultKeep } from './sim/frontier/storage.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tip = t => t ? ` data-tip="${esc(t)}"` : '';
const cap1 = r => r[0].toUpperCase() + r.slice(1);
const PAGE = 4;

export function createShipmentsTab({ game, data, cmd, usage = null }) {
  const SH = () => data?.railways?.ship || {};
  const RES = () => SH().resources || ['food', 'timber', 'stone', 'goods'];
  let mode = 'simple', sub = 'new', page = 0, ledgerOn = false;
  const ledger = createRailLedger({ game, inCard: true });   // Tim 2026-11-09: the Rail ledger from the Shipments tab too, with Back
  const sale = { resource: 'goods', amount: 100 };
  const form = { resource: 'timber', amount: 100, pin: null, urgent: false, ryo: null };   // ryo null = full: enough to buy it all (Tim 2026-11-09)
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
  const full = () => form.amount * price(form.resource);
  const PORT_TIP = r => `Buying from the capital: the capital keeps no stock, but its port wholesale houses (tonya) sell anything for ryo. Your towns with spare ${r} send it first, for free. Only what they can't cover is bought from the capital: the ryo is paid from this town at once, the cargo is loaded at the capital station and comes by the next train. ${cap1(r)} costs ${price(r)} ryo each there (selling there pays less). Cancel an order and the ryo for anything not loaded yet comes back. Budget 0 = never buy from the capital, wait for your towns.`;
  // linked towns of yours (for the source pin)
  const peers = s => { const seen = new Set([s.id]), todo = [s.id], L = links(s.owner); while (todo.length) { const a = todo.pop(); for (const l of L) { const n = l.from === a ? l.to : l.to === a ? l.from : null; if (n && !seen.has(n)) { seen.add(n); todo.push(n); } } } seen.delete(s.id); seen.delete('capital'); return [...seen]; };

  // what the order form would cost now: own towns' spare first (free), the rest bought from the capital within budget
  function estimate(s) {
    const r = form.resource, n = form.amount;
    const spareOf = t => Math.max(0, Math.floor((t.stock?.[r] ?? 0) - keepOf(t, r) - (t.reserved?.[r] ?? 0)));
    const src = form.pin ? [form.pin] : peers(s);
    const towns = Math.min(n, src.reduce((a, id) => a + spareOf(F().settlements?.[id] || {}), 0));
    const can = form.pin ? 0 : Math.floor(Math.min(form.ryo ?? full(), Math.floor(s.stock.ryo ?? 0)) / price(r));
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
  const capLine = (q, word) => `<div class="shnote dim"${tip(CAP_TIP.replace('3', SH().queueTrips ?? 3).replace('orders into', word === 'sell' ? 'sales out of' : 'orders into'))}>Order cap ⓘ: <b class="gold">${q.left}</b> more now · ${q.queued} / ${q.cap} booked on trains</div>`;
  // typed amounts (Order / Sell boxes)
  function input(d, v, s) {
    const raw = Math.max(0, Math.round(Number(v)) || 0), n = Math.max(SH().minOrder ?? 10, raw);
    const [k, r] = String(d.id).split(':');
    if (k === 'amt') form.amount = n;
    else if (k === 'samt') sale.amount = n;
    else if (k === 'keep' && s && RES().includes(r)) cmd({ action: 'ship', mode: 'keep', town: s.id, resource: r, keep: raw });
    else if (k === 'bud' && s) cmd({ action: 'ship', mode: 'budget', town: s.id, ryo: raw });
    else return false;
    return true;
  }
  function status(s, r) {
    const have = s.stock[r] ?? 0, u = usage?.(s, r, data), net = u?.net ?? 0;
    if (net < -1e-6 && have > 0) { const min = have / -net / 60; if (min < 15) return { text: `out in about ${Math.max(1, Math.round(min))} min`, low: true }; }
    if (have < keepOf(s, r)) return { text: 'below its keep amount', low: true };
    return { text: incoming(s, r) > 0 ? 'more on the way' : 'fine', low: false };
  }
  const bar = f => `<span class="shbar"><i style="width:${Math.round(Math.max(0, Math.min(1, f)) * 100)}%"></i></span>`;
  function orderRow(s, o, cancel) {
    const into = o.to === s.id, f = (o.got + moving(o.id)) / Math.max(1, o.amount);
    const src = o.kind === 'sell' ? 'to the capital (sale)' : into ? (o.sources?.length ? 'from ' + [...new Set(o.sources.map(x => name(x.from)))].join(', ') : o.got || moving(o.id) ? 'on the way' : 'finding a source') : `to ${name(o.to)}`;
    const st = moving(o.id) ? 'on the train' : o.got >= o.amount ? 'delivered' : 'waiting';
    return `<div class="shrow"><span>${into ? '▼' : '▲'} ${cap1(o.resource)} ${o.amount}${o.urgent ? ' <b class="gold">urgent</b>' : ''}${o.auto ? ' <span class="dim">auto</span>' : ''}<br><span class="dim">${esc(src)}</span></span><span>${bar(f)} <span class="dim">${st}</span>${cancel && into && !o.auto ? ` <button data-act="ship" data-id="cancel:${o.id}" title="Cancel order">✕</button>` : ''}</span></div>`;
  }
  const mine = s => orders().filter(o => o.state === 'open' && (o.to === s.id || o.sellFrom === s.id || o.sources?.some(x => x.from === s.id)));

  function html(s) {
    if (ledgerOn) return ledger.html().replace(/data-ledger="([^"]*)"/g, 'data-act="ship" data-id="lg~$1"');
    let h = `<div class="shrow"><h1>${esc(s.name)}</h1><button data-act="ship" data-id="ledger" title="All your rail shipments: open, delivered and lost">Rail ledger ▸</button></div><div class="shtabs two"><button data-act="ship" data-id="mode:simple" class="${mode === 'simple' ? 'on' : ''}">Simple</button><button data-act="ship" data-id="mode:advanced" class="${mode === 'advanced' ? 'on' : ''}">Advanced</button></div>`;
    // Tim 2026-11-09: say clearly, and briefly, that auto ordering is the governor's job and only while he is on auto
    h += s.autoBuild
      ? `<div class="shauto on"${tip('While the governor is on auto, his rail clerk orders what this town lacks (below its keep amounts), takes spare stock from your other towns first, buys the rest from the capital within the auto-buy budget, and sells spare goods.')}>Auto orders <b>on</b> · the governor keeps stock at your keep amounts</div>`
      : `<div class="shauto"${tip('Turn the governor to auto (Governor tab, Initiative On) and his rail clerk orders what this town lacks by himself. Your own orders always ship.')}>Auto orders <b>off</b> · governor not on auto</div>`;
    if (!hasLine(s)) return h + '<div class="shcard off"><b>Needs a rail line</b><br><span class="dim">Lay a line from this town\'s railway station (Link to…).</span></div>';
    if (mode === 'simple') {
      const q = queue(s, false);
      for (const r of RES()) {
        const st = status(s, r), rm = room(s, r);
        const btn = n => `<button class="shbig${st.low ? ' go' : ''}" data-act="ship" data-id="quick:${r}:${n}"${rm < n || q.left < n ? ' disabled' : ''}${tip(rm < n ? `Storage has room for only ${rm} more ${r} (stock plus what is on the way)` : q.left < n ? `Order cap: only ${q.left} more can be ordered until trains deliver` : '')}>Order ${n}<br><small>up to ${n * price(r)} ryo</small></button>`;
        h += `<div class="shcard${st.low ? ' low' : ''}"><div class="shrow"><span><b>${cap1(r)} ${Math.floor(s.stock[r] ?? 0)}</b>${Number.isFinite(capOf(s, r)) ? `<span class="dim"${tip(`Storage for ${r}: ${Math.floor(capOf(s, r))} (each resource has its own; storehouses and a bigger town hall raise it). Room for orders: ${rm}, counting what is already on the way.`)}> / ${Math.floor(capOf(s, r))}</span>` : ''} · <span class="${st.low ? 'red' : 'dim'}">${esc(st.text)}</span></span></div><div class="shbtns">${btn(50)}${btn(100)}</div></div>`;
      }
      h += `<div class="shnote dim"${tip(`The capital keeps no stock, but its wholesale houses sell anything for ryo, paid from this town when you order. Prices each: ${RES().map(r => `${r} ${price(r)}`).join(', ')}. Cancel and the ryo for anything not loaded yet comes back.`)}>Your other towns send spare stock free. Only the rest is bought from the capital ⓘ</div>` + capLine(q, 'order');
      // Tim 2026-11-09: one line per resource (all its orders together), so many orders never get cut off
      const inc = mine(s).filter(o => o.to === s.id);
      if (inc.length) h += '<div class="shsec">On the way</div>' + RES().map(r => {
        const os = inc.filter(o => o.resource === r); if (!os.length) return '';
        const want = os.reduce((a, o) => a + o.amount, 0), done = os.reduce((a, o) => a + o.got + moving(o.id), 0), aboard = os.reduce((a, o) => a + moving(o.id), 0);
        return `<div class="shrow"><span>▼ ${cap1(r)} ${want - os.reduce((a, o) => a + o.got, 0)}<br><span class="dim">${os.length} order${os.length > 1 ? 's' : ''}${aboard ? ` · ${aboard} on the train` : ' · waiting for a train'}</span></span><span>${bar(done / Math.max(1, want))}</span></div>`;
      }).join('') + '<div class="dim shnote">Each order: Advanced › Open.</div>';
      return h;
    }
    const open = mine(s);
    h += `<div class="shtabs four"><button data-act="ship" data-id="sub:new" class="${sub === 'new' ? 'on' : ''}">Order</button><button data-act="ship" data-id="sub:sell" class="${sub === 'sell' ? 'on' : ''}">Sell</button><button data-act="ship" data-id="sub:keep" class="${sub === 'keep' ? 'on' : ''}">Keep</button><button data-act="ship" data-id="sub:open" class="${sub === 'open' ? 'on' : ''}">Open ${open.length}</button></div>`;
    if (sub === 'new') {
      const pins = peers(s); if (form.pin && !pins.includes(form.pin)) form.pin = null;
      h += `<div class="shcard"><div class="shrow"><b>Resource</b><span class="seg">${RES().map(r => `<button data-act="ship" data-id="res:${r}" class="${form.resource === r ? 'on' : ''}">${cap1(r)}</button>`).join('')}</span></div></div>`
        + `<div class="shcard"><div class="shrow"><b>Amount</b><span class="shamt"><button data-act="ship" data-id="amt:-100">−100</button><button data-act="ship" data-id="amt:-10">−10</button><input type="number" min="0" step="10" data-act="shipinput" data-id="amt" value="${form.amount}"><button data-act="ship" data-id="amt:10">+10</button><button data-act="ship" data-id="amt:100">+100</button> <span class="dim">${form.resource} room ${room(s, form.resource)}</span></span></div></div>`
        + `<div class="shcard"><div class="shrow"><b${tip('Nearest: the clerk picks your town with spare stock nearest by rail, then buys from the capital. Pin one town to ship only from there.')}>Source</b><button data-act="ship" data-id="pin">${esc(form.pin ? name(form.pin) : 'Nearest')} ▸</button></div></div>`
        + `<div class="shcard"><div class="shrow"><b${tip('Urgent orders are filled before others.')}>Urgent</b><button data-act="ship" data-id="urgent" class="${form.urgent ? 'on' : ''}">${form.urgent ? 'On' : 'Off'}</button></div></div>`
        + `<div class="shcard"${tip(PORT_TIP(form.resource))}><div class="shrow"><b>Capital budget ⓘ</b><span><button data-act="ship" data-id="ryo:-50">−</button> <b class="gold">${form.ryo == null ? `Full · ~${full()} ryo` : `${form.ryo} ryo`}</b> <button data-act="ship" data-id="ryo:50">+</button></span></div></div>`
        + (() => { const c = estimate(s); return `<div class="shcard"${tip('Estimate. Your own towns send their spare stock (above their keep amounts) for free. Only the rest is bought from the capital, paid from this town when the order is placed.')}><div class="shrow"><b>Cost ⓘ</b><span><b class="gold">~${c.ryo} ryo</b> <span class="dim">${c.towns} free from your towns${c.buy ? ` · ${c.buy} bought at ${price(form.resource)} each` : ''}${c.short ? ` · ${c.short} must wait` : ''}</span></span></div></div>`; })()
        + capLine(queue(s, false), 'order')
        + `<button class="shbig go wide" data-act="ship" data-id="place"${form.amount > queue(s, false).left || form.amount > room(s, form.resource) ? ' disabled' : ''}${tip('Free from your own towns. Only what is bought from the capital costs ryo.')}>Place order · ~${estimate(s).ryo} ryo</button>`;
    } else if (sub === 'sell') {
      const sp = r => SH().sellPrice?.[r] ?? 2, spare = r => Math.max(0, Math.floor((s.stock[r] ?? 0) - (s.reserved?.[r] ?? 0)));
      const toCap = links(s.owner).length && (() => { const seen = new Set([s.id]), todo = [s.id], L = links(s.owner); while (todo.length) { const a = todo.pop(); if (a === 'capital') return true; for (const l of L) { const n = l.from === a ? l.to : l.to === a ? l.from : null; if (n && !seen.has(n)) { seen.add(n); todo.push(n); } } } return false; })();
      if (!toCap) return h + '<div class="shcard off"><b>Needs a rail line to the capital</b></div>';
      const SELL_TIP = `Sell to the capital: the cargo leaves on the next train and the ryo comes to this town when it reaches the capital. The capital pays less than it charges (${cap1(sale.resource)}: sells for ${sp(sale.resource)}, buys for ${price(sale.resource)}). Keep amounts are not checked here: you choose.`;
      h += `<div class="shcard"><div class="shrow"><b>Resource</b><span class="seg">${RES().map(r => `<button data-act="ship" data-id="sres:${r}" class="${sale.resource === r ? 'on' : ''}">${cap1(r)}</button>`).join('')}</span></div></div>`
        + `<div class="shcard"><div class="shrow"><b>Amount</b><span class="shamt"><button data-act="ship" data-id="samt:-100">−100</button><button data-act="ship" data-id="samt:-10">−10</button><input type="number" min="0" step="10" data-act="shipinput" data-id="samt" value="${sale.amount}"><button data-act="ship" data-id="samt:10">+10</button><button data-act="ship" data-id="samt:100">+100</button> <span class="dim">${sale.resource} spare ${spare(sale.resource)}</span></span></div></div>`
        + `<div class="shcard"${tip(SELL_TIP)}><div class="shrow"><b>Pays ⓘ</b><b class="gold">~${Math.floor(sale.amount * sp(sale.resource))} ryo</b></div></div>`
        + capLine(queue(s, true), 'sell')
        + `<button class="shbig go wide" data-act="ship" data-id="sellgo"${sale.amount > spare(sale.resource) || sale.amount > queue(s, true).left ? ' disabled' : ''}${tip(SELL_TIP)}>Sell ${sale.amount} ${sale.resource}</button>`;
    } else if (sub === 'keep') {
      h += '<div class="dim shnote">Never shipped out below the keep amount. The governor orders up to it. Goods: the same level as the market hold-back.</div>';
      for (const r of RES()) h += `<div class="shrow keeprow"><span>${cap1(r)} <span class="dim">· stock ${Math.floor(s.stock[r] ?? 0)}${s.reserved?.[r] ? ` · reserved ${Math.floor(s.reserved[r])}` : ''}</span></span><span class="shamt"><button data-act="ship" data-id="keep:${r}:-100">−100</button><input type="number" min="0" step="10" data-act="shipinput" data-id="keep:${r}" value="${keepOf(s, r)}"><button data-act="ship" data-id="keep:${r}:100">+100</button></span></div>`;
      const bud = s.shipBudget ?? SH().budget ?? 150;
      h += `<div class="shrow keeprow"><span${tip('Auto orders may buy from the capital with up to this much ryo tied up at once. Off: the governor never buys or sells from the capital.')}>Auto-buy from the capital</span><span><button data-act="ship" data-id="autobuy" class="${s.autoBuy === false ? '' : 'on'}">${s.autoBuy === false ? 'Off' : 'On'}</button> <span class="shamt"><button data-act="ship" data-id="bud:-100">−100</button><input type="number" min="0" step="50" data-act="shipinput" data-id="bud" value="${bud}"><button data-act="ship" data-id="bud:100">+100</button></span></span></div>`;
    } else {
      const pages = Math.max(1, Math.ceil(open.length / PAGE)); page = Math.min(page, pages - 1);
      h += open.length ? open.slice(page * PAGE, page * PAGE + PAGE).map(o => orderRow(s, o, true)).join('') : '<div class="dim shnote">No open orders.</div>';
      if (pages > 1) h += `<div class="shrow"><button data-act="ship" data-id="page:-1"${page ? '' : ' disabled'}>◀ Prev</button><span class="dim">${page + 1} / ${pages}</span><button data-act="ship" data-id="page:1"${page < pages - 1 ? '' : ' disabled'}>Next ▶</button></div>`;
    }
    return h;
  }

  // returns true when it handled the click
  function click(d, s) {
    if (d.act !== 'ship' || !s) return false;
    if (String(d.id).startsWith('lg~')) { const id = d.id.slice(3); if (id === 'close') ledgerOn = false; else ledger.click(id); return true; }
    if (d.id === 'ledger') { ledgerOn = true; return true; }
    const [k, a, b] = String(d.id).split(':');
    switch (k) {
      case 'mode': mode = a; break;
      case 'sub': sub = a; page = 0; break;
      case 'page': page = Math.max(0, page + Number(a)); break;
      case 'quick': { const n = Number(b); cmd({ action: 'ship', mode: 'order', town: s.id, resource: a, amount: n, ryo: Math.min(Math.floor(s.stock.ryo ?? 0), n * price(a)) }); break; }
      case 'cancel': cmd({ action: 'ship', mode: 'cancel', order: a }); break;
      case 'res': form.resource = a; break;
      case 'amt': form.amount = Math.max(SH().minOrder ?? 10, form.amount + Number(a)); break;
      case 'ryo': { const v = Math.max(0, (form.ryo ?? full()) + Number(a)); form.ryo = v >= full() ? null : v; break; }
      case 'urgent': form.urgent = !form.urgent; break;
      case 'sres': sale.resource = a; break;
      case 'samt': sale.amount = Math.max(SH().minOrder ?? 10, sale.amount + Number(a)); break;
      case 'sellgo': cmd({ action: 'ship', mode: 'sell', town: s.id, resource: sale.resource, amount: sale.amount }); sub = 'open'; break;
      case 'pin': { const p = [null, ...peers(s)], i = p.indexOf(form.pin); form.pin = p[(i + 1) % p.length]; break; }
      case 'place': cmd({ action: 'ship', mode: 'order', town: s.id, resource: form.resource, amount: form.amount, pin: form.pin, urgent: form.urgent, ryo: Math.min(form.ryo ?? full(), Math.floor(s.stock.ryo ?? 0)) }); sub = 'open'; break;
      case 'keep': cmd({ action: 'ship', mode: 'keep', town: s.id, resource: a, keep: Math.max(0, keepOf(s, a) + Number(b)) }); break;
      case 'autobuy': cmd({ action: 'ship', mode: 'budget', town: s.id, autoBuy: s.autoBuy === false }); break;
      case 'bud': cmd({ action: 'ship', mode: 'budget', town: s.id, ryo: Math.max(0, (s.shipBudget ?? SH().budget ?? 150) + Number(a)) }); break;
      default: return false;
    }
    return true;
  }
  return { html, click, input };
}
