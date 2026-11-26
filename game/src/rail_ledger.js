// Rail ledger (rail shipments S5, 2026-11-08/09). 2026-11-23 (mock project files ledger_merge/mock_final.png):
// one ledger for the World map panel and the town card's Shipments, Ledger tab (that tab replaces the old Open tab).
// Tabs Open / Delivered / Losses, pages (no scrollbars). Every open row has its status with a live countdown under it
// (sim/frontier/ship_eta.js): TRAIN n (exact when it rides straight to the town), WAITING about ... (an estimate),
// NO SOURCE (no ETA, the clerk's next look). Open rows sort soonest first. Your own orders are marked Yours and can be
// cancelled. In the town card a This town / All towns switch picks the rows. Picking a row lists its steps with
// times, and on the World map lights up its train (game_map.js -> world_map.js highlightTrain).
// Reads the snapshot only: state.frontier.shipping (orders, yards), state.frontier.rail.{links,trains}.
// createRailLedger({ game, data, inCard, head }) -> { html(town?), click(id) -> bool | { cancel: orderId }, train(), clear() }
import { shipEta } from './sim/frontier/ship_eta.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap1 = r => r[0].toUpperCase() + r.slice(1);
// 42s, 2m 05s, 1h 04m
export const clock = s => s == null ? '' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;

export function createRailLedger({ game, data = null, inCard = false, head = true, here = 'This town' }) {   // inCard: inside the town card (no map glow); head false: no title line; here: the scope button's label (the camp station: This camp, 2026-11-25)
  let tab = 'open', page = 0, sel = null, scope = 'town';
  const PAGE = inCard ? 5 : 6;
  const F = () => game.state.frontier || {};
  const D = () => data || game.frontier?.data || {};
  const orders = () => Object.values(F().shipping?.orders || {});
  // 8e-1: a camp station node is named after its war (camp:<war id>)
  const campName = id => { const w = F().wars?.list?.[id.slice(5)] || (F().wars?.history || []).find(x => x.id === id.slice(5)); return `Siege of ${F().settlements?.[w?.town]?.name || 'the town'} camp`; };
  const name = id => id === 'capital' ? 'the capital' : String(id).startsWith('camp:') ? campName(id) : F().settlements?.[id]?.name || id;
  const toName = o => o.kind === 'sell' ? 'the capital, sale' : o.kind === 'ryo' && o.into === 'chest' ? `${name(o.to)} war chest` : name(o.to);
  const trainOf = id => Object.values(F().rail?.trains || {}).find(t => (t.freight || []).some(c => c.order === id)) || null;
  const aboard = id => { const t = trainOf(id); return t ? t.freight.filter(c => c.order === id).reduce((a, c) => a + c.amount, 0) : 0; };
  // where it comes from; an order's sources empty out as trains load them, so the names seen last are kept
  const fromSeen = new Map();
  function from(o) {
    const f = o.kind === 'sell' ? name(o.sellFrom) : o.kind === 'ryo' ? (o.from === 'capital' ? 'Treasury' : `${name(o.from)} coffers`) : o.sources?.length ? [...new Set(o.sources.map(x => name(x.from)))].join(', ') : o.from ? name(o.from) : '';
    if (f) fromSeen.set(o.id, f);
    return f || fromSeen.get(o.id) || '';
  }
  const touches = (o, town) => o.to === town || o.sellFrom === town || o.from === town || o.sources?.some(x => x.from === town);
  const eta = o => shipEta({ frontier: F(), data: D(), tick: game.state.tick ?? 0, order: o });
  const ago = o => { const s = Math.max(0, Math.floor(((game.state.tick ?? 0) - (o.done ?? 0)) / 20)); return s < 60 ? 'just now' : `${clock(s - s % 60).replace(/ 00s$/, '')} ago`; };
  function lists(town) {
    const all = orders().filter(o => !town || touches(o, town));
    const open = all.filter(o => o.state === 'open').map(o => ({ o, e: eta(o) }))
      .sort((a, b) => ((a.e?.status === 'nosource' || a.e?.status === 'cut') - (b.e?.status === 'nosource' || b.e?.status === 'cut')) || ((a.e?.secs ?? 1e9) - (b.e?.secs ?? 1e9)) || (a.o.created - b.o.created));
    const done = all.filter(o => o.state === 'done').sort((a, b) => (b.done ?? 0) - (a.done ?? 0)).map(o => ({ o }));
    const lost = all.filter(o => (o.lost || 0) > 0).sort((a, b) => (b.done ?? b.created) - (a.done ?? a.created)).map(o => ({ o }));
    return { open, done, lost };
  }
  const bar = f => `<span class="lgbar"><i style="width:${Math.round(Math.max(0, Math.min(1, f)) * 100)}%"></i></span>`;
  function status({ o, e }) {
    if (tab === 'lost') return `<span class="lgst stuck"><small>LOST</small><b>${Math.floor(o.lost)}</b></span>`;
    if (o.state === 'done') return `<span class="lgst done"><small>DELIVERED</small><b>${ago(o)}</b></span>`;
    if (o.state === 'cancelled') return '<span class="lgst stuck"><small>CANCELLED</small><b></b></span>';
    if (!e || e.status === 'nosource') return '<span class="lgst stuck"><small>NO SOURCE</small><b>no ETA</b></span>';
    if (e.status === 'cut') return '<span class="lgst stuck"><small>LINE CUT</small><b>no ETA</b></span>';
    const t = e.status === 'train' ? `TRAIN ${String(e.train).replace(/^t/, '')}` : 'WAITING', f = (o.got + aboard(o.id)) / Math.max(1, o.amount);
    return `<span class="lgst ${e.exact ? 'moving' : e.status === 'train' ? 'moving est' : 'est'}"><small>${t}</small><b>${e.exact ? '' : 'about '}${clock(e.secs)}</b>${e.status === 'train' ? bar(f) : ''}</span>`;
  }
  function row(r) {
    const o = r.o, mine = !o.auto, sub = o.state === 'open' && r.e?.status === 'nosource' ? `to ${toName(o)}, clerk looks again in ${clock(r.e.secs)}` : `${from(o) || '...'} to ${toName(o)}`;
    const btn = `<button class="lgrow${sel === o.id ? ' sel' : ''}" data-ledger="pick:${o.id}"><span><b>${cap1(o.resource)} ${Math.floor(o.amount)}</b>${mine ? ' <i class="lgyours">YOURS</i>' : ''}${o.urgent ? ' <i class="gold">urgent</i>' : ''}<br><small>${esc(sub)}${o.lost && tab !== 'lost' ? `, <b class="red">${Math.floor(o.lost)} lost</b>` : ''}</small></span>${status(r)}</button>`;
    const act = o.state === 'open' && mine ? `<button class="lgcancel" data-ledger="cancel:${o.id}" title="Cancel this order. Cargo already on a train still arrives.">Cancel</button>` : '<span></span>';
    return `<div class="lgline">${btn}${act}</div>`;
  }
  function card(o) {
    const who = o.auto ? (o.kind === 'ryo' ? 'an auto order' : 'the governor') : 'you', ryo = o.kind === 'sell' ? '' : o.ryoPaid ? `, ${o.ryoPaid} ryo paid at the capital` : '';
    let h = `<div class="lgcard"><b>${cap1(o.resource)} ${Math.floor(o.amount)}</b>, ordered by ${who}${ryo}.${trainOf(o.id) && !inCard ? ' Its train glows on the map.' : ''}${o.lost ? `<br><span class="red">${Math.floor(o.lost)} lost to robbers, re-sent</span>` : ''}`;
    if (o.state === 'open') {
      const e = eta(o);
      h += '<div class="lgsteps">' + (e?.steps || []).map(s => `<span${s.word === 'done' ? ' class="done"' : ''}>${esc(s.text)}</span><b class="${s.word === 'done' ? 'done' : s.word === 'on board' ? 'now' : ''}">${s.word === 'done' ? 'done' : s.word === 'clerk' ? `look in ${clock(s.secs)}` : s.secs != null ? `in ${clock(s.secs)}` : esc(s.word || '')}</b>`).join('') + '</div>';
    } else h += `<br><small>${o.state === 'done' ? `Delivered ${ago(o)}, ${Math.floor(o.got)} arrived` : 'Cancelled'}</small>`;
    return h + '</div>';
  }
  function html(town = null) {
    const L = lists(inCard && scope === 'town' ? town : null), list = tab === 'done' ? L.done : tab === 'lost' ? L.lost : L.open;
    const pages = Math.max(1, Math.ceil(list.length / PAGE)); page = Math.min(page, pages - 1);
    const T = (id, label) => `<button data-ledger="tab:${id}" aria-pressed="${tab === id}">${label}</button>`;
    let h = head ? (inCard ? '<div class="lghead"><button data-ledger="close">Back to Shipments</button><b class="gold">RAIL LEDGER</b></div>' : '<header><h3>RAIL LEDGER</h3><button data-ledger="close">Close</button></header>') : '';
    h += `<div class="lgtabs">${T('open', `Open ${L.open.length}`)}${T('done', 'Delivered')}${T('lost', L.lost.length ? `Losses ${L.lost.length}` : 'Losses')}</div>`;
    h += `<div class="lgscope"><small>${tab === 'open' ? 'Soonest first' : 'Newest first'}${inCard ? '' : ', all towns'}</small>${inCard ? `<span><button data-ledger="scope:town" aria-pressed="${scope === 'town'}">${esc(here)}</button><button data-ledger="scope:all" aria-pressed="${scope === 'all'}">All towns</button></span>` : ''}</div>`;
    if (list.length) h += `<div class="lghdr"><span>Shipment</span><span>${tab === 'open' ? 'Arrives in' : tab === 'done' ? 'Delivered' : 'Lost'}</span><span></span></div>`;
    h += list.length ? list.slice(page * PAGE, page * PAGE + PAGE).map(row).join('') : `<div class="lgnote">${tab === 'open' ? 'No shipments on the way.' : tab === 'done' ? 'Nothing delivered yet.' : 'No cargo lost.'}</div>`;
    const o = sel && orders().find(x => x.id === sel);
    if (o) h += card(o);
    else if (list.length) h += `<div class="lgnote">${inCard ? 'Pick a shipment for its steps.' : 'Pick a shipment for its steps: its train glows on the map.'}</div>`;
    if (pages > 1) h += `<div class="lgpages"><button data-ledger="page:-1"${page ? '' : ' disabled'}>Prev</button><small>Rows ${page * PAGE + 1} to ${Math.min(list.length, page * PAGE + PAGE)} of ${list.length}</small><button data-ledger="page:1"${page < pages - 1 ? '' : ' disabled'}>Next</button></div>`;
    return h;
  }
  function click(id) {
    const [k, a] = String(id).split(':');
    if (k === 'tab') { tab = a; page = 0; sel = null; }
    else if (k === 'scope') { scope = a; page = 0; }
    else if (k === 'page') page = Math.max(0, page + Number(a));
    else if (k === 'pick') sel = sel === a ? null : a;
    else if (k === 'cancel') { if (sel === a) sel = null; return { cancel: a }; }
    else return false;
    return true;
  }
  return { html, click, train: () => (sel && trainOf(sel)?.id) || null, clear() { sel = null; } };
}
