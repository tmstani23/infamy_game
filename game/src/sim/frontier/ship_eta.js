// Shipment countdowns (2026-11-23, mock project files ledger_merge/mock_final.png): when an open rail order
// should arrive, read from the trains' places on their lines. Read only: the Rail ledger (map and town card) draws it.
// Same timing as rail.js serviceAt: a train runs its line at train.speed and stands stopSeconds at each end. It is an
// estimate where cargo still waits (trains are shared, big orders need several trips, a watched train runs slower);
// exact only for cargo already aboard a train bound straight for the order's town.
// shipEta({ frontier, data, tick, order }) -> { status: 'train'|'waiting'|'nosource'|'cut'|'done'|'cancelled',
//   secs (to the whole order arrived, or to the clerk's next look for nosource), exact, train, steps: [{ text, secs?, word? }] }
// data = frontier data (railways, governor, cadenceTicks).
const name = (F, id) => id === 'capital' ? 'the capital' : String(id).startsWith('camp:') ? 'the camp' : F.settlements?.[id]?.name || id;

export function shipEta({ frontier: F = {}, data = {}, tick = 0, order: o }) {
  if (!o) return null;
  if (o.state === 'done') return { status: 'done', secs: null, exact: true, steps: [] };
  if (o.state === 'cancelled') return { status: 'cancelled', secs: null, exact: true, steps: [] };
  const T = data.railways?.train || {}, SH = data.railways?.ship || {};
  const stop = (T.stopSeconds ?? 60) * 20, speed0 = T.speed ?? 36;
  const links = Object.values(F.rail?.links || {}).filter(l => l.owner === o.owner && l.done && !l.closed);
  const trains = Object.values(F.rail?.trains || {});
  const trainOn = l => trains.find(t => t.link === l.id) || null;
  const run = (t, d) => Math.abs(d) / Math.max(1, t?.speed || speed0) * 20;
  const room = t => t && o.resource === 'ryo' ? (SH.ryoPerTrain ?? 2000) : Math.max(1, t?.consist ? t.consist.filter(k => k === 'goods').length : (T.consist ? T.consist.filter(k => k === 'goods').length : Math.max(1, (t?.cars ?? 3) - 1))) * (SH.wagonLoad ?? 60);
  function route(a, b) {
    const prev = { [a]: null }, todo = [a];
    while (todo.length) {
      const at = todo.shift();
      if (at === b) { const p = []; for (let n = b; n != null; n = prev[n]) p.unshift(n); return p; }
      for (const l of links) { const n = l.from === at ? l.to : l.to === at ? l.from : null; if (n && !(n in prev)) { prev[n] = at; todo.push(n); } }
    }
    return null;
  }
  const linkOf = (a, b) => links.find(l => (l.from === a && l.to === b) || (l.from === b && l.to === a));
  // first tick (from now) when the train of line l pulls out of station `at` toward the far end, at or after `after`
  function departs(l, at, after = 0) {
    const t = trainOn(l); if (!t) return null;
    const end = at === l.to ? l.length : 0, standing = t.wait > 0 && (t.d <= 0 ? l.from : t.d >= l.length ? l.to : null) === at;
    let d;
    if (standing) d = t.wait;
    else if ((end - t.d) * t.dir > 0) d = Math.max(0, t.wait) + run(t, end - t.d) + stop;   // heading here
    else d = Math.max(0, t.wait) + run(t, t.dir > 0 ? l.length - t.d : t.d) + stop + run(t, l.length) + stop;   // out to the far end first
    const period = 2 * (stop + run(t, l.length));
    if (d < after) d += Math.ceil((after - d) / period) * period;
    return d;
  }
  // ticks until cargo leaving node `at` (no sooner than `after`) reaches o.to, over the route; null when cut off
  function ride(at, after) {
    const p = route(at, o.to); if (!p) return null;
    let now = after;
    for (let i = 0; i + 1 < p.length; i++) {
      const l = linkOf(p[i], p[i + 1]), dep = departs(l, p[i], now);
      if (dep == null) return null;
      now = dep + run(trainOn(l), l.length);
    }
    return now;
  }
  const secs = ticks => Math.max(0, Math.ceil(ticks / 20));
  const steps = [], ends = [];
  let status = null, train = null, exact = true, cut = false;
  if (o.got > 0) steps.push({ text: `${Math.floor(o.got)} arrived`, word: 'done' });
  // aboard trains
  for (const t of trains) {
    const n = (t.freight || []).filter(c => c.order === o.id).reduce((a, c) => a + c.amount, 0);
    if (!(n > 0)) continue;
    const l = F.rail?.links?.[t.link]; if (!l) continue;
    const next = t.dir > 0 ? l.to : l.from;   // (on arrival rail.js turns it round, so dir always points at its next stop)
    const left = next === l.to ? l.length - t.d : t.d, there = Math.max(0, t.wait) + run(t, left);
    const at = next === o.to ? there : ride(next, there);
    if (at == null) { cut = true; continue; }
    if (next !== o.to) exact = false;
    status ||= 'train'; train ||= t.id;
    steps.push({ text: `${Math.floor(n)} on train ${String(t.id).replace(/^t/, '')} to ${name(F, next)}`, word: 'on board', secs: secs(there) });
    ends.push(at);
  }
  // waiting in station yards on the way
  for (const [node, list] of Object.entries(F.shipping?.yards || {})) {
    const n = (list || []).filter(c => c.order === o.id).reduce((a, c) => a + c.amount, 0);
    if (!(n > 0)) continue;
    const at = ride(node, 0); exact = false;
    if (at == null) { cut = true; continue; }
    status ||= 'waiting';
    steps.push({ text: `${Math.floor(n)} waiting at ${name(F, node)} station`, secs: secs(at) });
    ends.push(at);
  }
  // reserved at its sources: one trainload a trip (other orders share the train, so this is the best case)
  for (const x of o.sources || []) {
    if (!(x.amount > 0)) continue;
    const p = route(x.from, o.to); exact = false;
    const l = p && linkOf(p[0], p[1]);
    if (!l) { cut = true; continue; }
    const per = room(trainOn(l)), trips = Math.max(1, Math.ceil(x.amount / per));
    const first = departs(l, x.from, 0); if (first == null) { cut = true; continue; }
    const tt = trainOn(l), period = 2 * (stop + run(tt, l.length));
    const at = ride(x.from, first + (trips - 1) * period);   // the last trip pulls out at its departure: ride from there
    if (at == null) { cut = true; continue; }
    status ||= 'waiting';
    steps.push({ text: `${Math.floor(x.amount)} loads at ${name(F, x.from)}${trips > 1 ? `, ${trips} trips` : ''}`, secs: secs(first) });
    ends.push(at);
  }
  // nothing found for the rest yet: the clerk looks again at the next governor review
  const aboard = trains.reduce((a, t) => a + (t.freight || []).filter(c => c.order === o.id).reduce((b, c) => b + c.amount, 0), 0);
  const yard = Object.values(F.shipping?.yards || {}).reduce((a, list) => a + (list || []).filter(c => c.order === o.id).reduce((b, c) => b + c.amount, 0), 0);
  const short = o.amount - (o.got || 0) - aboard - yard - (o.sources || []).reduce((a, x) => a + Math.max(0, x.amount), 0);
  const every = Math.max(1, data.governor?.reviewTicks || 1), cad = Math.max(1, data.cadenceTicks || 20);
  const econ = F.econTick ?? 0, look = secs((every - (econ % every || 0) || every) * cad - ((tick % cad) + 1));
  if (short > 1e-6 && o.kind !== 'sell' && o.kind !== 'ryo') {
    exact = false;
    steps.push({ text: `${Math.ceil(short)} still needs a source`, secs: look, word: 'clerk' });
    if (!ends.length) return { status: cut ? 'cut' : 'nosource', secs: look, exact: false, train: null, steps };
  }
  if (!ends.length) return { status: cut ? 'cut' : 'nosource', secs: cut ? null : look, exact: false, train: null, steps };
  const all = secs(Math.max(...ends));
  steps.push({ text: o.kind === 'sell' ? 'Sold at the capital' : o.kind === 'ryo' ? `Into ${o.into === 'chest' ? 'the war chest' : `${name(F, o.to)} coffers`}` : `Into ${name(F, o.to)} stock`, secs: all });
  return { status: status || 'waiting', secs: all, exact: exact && !cut, train, steps };
}
