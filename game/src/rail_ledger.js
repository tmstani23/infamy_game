// Rail ledger (rail shipments S5, Tim 2026-11-08/09; mock project files shipments_mock/shipments_menus_mock_v2.png):
// a Deployment-style panel on the World tab of the map. Tabs Open / Delivered / Losses, pages (no scrollbars).
// Selecting a shipment lights up its train on the World map (game_map.js -> world_map.js highlightTrain).
// Reads the snapshot only: state.frontier.shipping.orders (open + recent), state.frontier.rail.{links,trains}.
// createRailLedger({ game }) -> { html(), click(id) -> bool, train() -> train id or null }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap1 = r => r[0].toUpperCase() + r.slice(1);
const PAGE = 6;

export function createRailLedger({ game, inCard = false }) {   // inCard: inside the town card (Back, no map glow)
  let tab = 'open', page = 0, sel = null;
  const F = () => game.state.frontier || {};
  const orders = () => Object.values(F().shipping?.orders || {});
  const name = id => id === 'capital' ? 'the capital' : F().settlements?.[id]?.name || id;
  const trainOf = id => Object.values(F().rail?.trains || {}).find(t => (t.freight || []).some(c => c.order === id)) || null;
  const aboard = id => { const t = trainOf(id); return t ? t.freight.filter(c => c.order === id).reduce((a, c) => a + c.amount, 0) : 0; };
  const from = o => o.kind === 'sell' ? name(o.sellFrom) : o.sources?.length ? [...new Set(o.sources.map(x => name(x.from)))].join(', ') : o.from ? name(o.from) : '…';
  const lists = () => {
    const all = orders().sort((a, b) => (b.urgent - a.urgent) || (a.created - b.created));
    return { open: all.filter(o => o.state === 'open'), done: all.filter(o => o.state === 'done').reverse(), lost: all.filter(o => (o.lost || 0) > 0).reverse() };
  };
  // where the order's train is going next and roughly when (seconds at full speed)
  function eta(o) {
    const t = trainOf(o.id), l = t && F().rail?.links?.[t.link];
    if (!t || !l) return '';
    const next = t.dir > 0 ? l.to : l.from, left = t.dir > 0 ? l.length - t.d : t.d;
    const secs = Math.round((t.wait > 0 ? t.wait / 20 : 0) + left / Math.max(1, t.speed || 36));
    return `next stop ${name(next)} in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }
  const bar = f => `<span class="lgbar"><i style="width:${Math.round(Math.max(0, Math.min(1, f)) * 100)}%"></i></span>`;
  function row(o) {
    const f = (o.got + aboard(o.id)) / Math.max(1, o.amount), t = trainOf(o.id);
    const st = o.state === 'done' ? 'delivered' : o.state === 'cancelled' ? 'cancelled' : t ? `train ${t.id.replace(/^t/, '')}` : o.sources?.length ? 'waiting' : 'no source yet';
    return `<button class="lgrow${sel === o.id ? ' sel' : ''}" data-ledger="pick:${o.id}"><span>${cap1(o.resource)} ${o.amount}${o.urgent ? ' <b class="gold">urgent</b>' : ''}<br><small>${esc(from(o))} → ${esc(o.kind === 'sell' ? 'the capital (sale)' : name(o.to))}${o.lost ? ` · <b class="red">${o.lost} lost</b>` : ''}</small></span>${bar(f)}<small>${st}</small></button>`;
  }
  function html() {
    const L = lists(), list = tab === 'done' ? L.done : tab === 'lost' ? L.lost : L.open;
    const pages = Math.max(1, Math.ceil(list.length / PAGE)); page = Math.min(page, pages - 1);
    let h = `${inCard ? '<div class="lghead"><button data-ledger="close">◀ Back to Shipments</button><b class="gold">RAIL LEDGER</b></div>' : '<header><h3>RAIL LEDGER</h3><button data-ledger="close">Close ✕</button></header>'}`
      + `<div class="tabs3"><button data-ledger="tab:open" aria-pressed="${tab === 'open'}">Open ${L.open.length}</button><button data-ledger="tab:done" aria-pressed="${tab === 'done'}">Delivered</button><button data-ledger="tab:lost" aria-pressed="${tab === 'lost'}">Losses ${L.lost.length}</button></div>`;
    h += list.length ? list.slice(page * PAGE, page * PAGE + PAGE).map(row).join('') : `<div class="lgnote">${tab === 'open' ? 'No shipments on the way.' : tab === 'done' ? 'Nothing delivered yet.' : 'No cargo lost.'}</div>`;
    if (pages > 1) h += `<div class="lgpages"><button data-ledger="page:-1"${page ? '' : ' disabled'}>◀ Prev</button><small>${page + 1} / ${pages}</small><button data-ledger="page:1"${page < pages - 1 ? '' : ' disabled'}>Next ▶</button></div>`;
    const o = sel && orders().find(x => x.id === sel);
    if (o) {
      const who = o.auto ? 'the governor' : 'you', ryo = o.kind === 'sell' ? '' : o.ryoPaid ? ` · ${o.ryoPaid} ryo from the capital` : '';
      h += `<div class="lgcard"><b>${cap1(o.resource)} ${o.amount}</b> · ${o.got} arrived<br>From ${esc(from(o))} · ordered by ${who}${ryo}${o.lost ? `<br><span class="red">${o.lost} lost to robbers, re-sent</span>` : ''}<br><small>${esc(eta(o) || (o.state === 'open' ? 'Waiting for the next train' : ''))}${trainOf(o.id) && !inCard ? ' · its train glows on the map' : ''}</small></div>`;
    } else if (list.length) h += `<div class="lgnote">${inCard ? 'Pick a shipment for its details.' : 'Pick a shipment: its train glows on the map.'}</div>`;
    return h;
  }
  function click(id) {
    const [k, a] = String(id).split(':');
    if (k === 'tab') { tab = a; page = 0; sel = null; }
    else if (k === 'page') page = Math.max(0, page + Number(a));
    else if (k === 'pick') sel = sel === a ? null : a;
    else return false;
    return true;
  }
  return { html, click, train: () => (sel && trainOf(sel)?.id) || null, clear() { sel = null; } };
}
