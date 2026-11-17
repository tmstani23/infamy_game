// 8e-3 (mock A and B, Tim 2026-11-16): the War chest tab's "Send by train" rows, shared by the war camp panel and the
// town war window. Ryo from the Clan treasury, or from another of your towns' coffers, rides the next train into this
// war's chest (sim/frontier/shipments.js ryo orders). Each row says what the pot keeps after sending (red below its
// keep line); a pot with no rail line to the chest is greyed with the reason. Then the orders on the way (Cancel before
// loading gives it back) and where this war's chest came from.
// chestSendHtml({ game, war, owner, counts, data }) -> html; chestSendSig(game, war, owner) -> string (redraw key)
// Clicks: data-rsend="<capital|townId>" (amount in the box data-n="rs:<from>"), data-rcancel="<order id>".
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const ROWS = 3;

export const CHEST_SEND_CSS = sel => `
${sel} .rsec{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#a9a294;border-bottom:1px solid #ffffff1a;padding:12px 0 6px;margin-top:4px}
${sel} .rsec b{color:#e0b85a;font-weight:600}
${sel} .rrow{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #ffffff12}
${sel} .rrow .rn{font-size:15px;color:#f3e3bd}${sel} .rrow .rk{font-size:12px;color:#a9a294}${sel} .rrow .rk.red{color:#ee8a7c}
${sel} .rrow.off .rn,${sel} .rrow.off .rk{color:#7d776c}
${sel} .rrow input{width:76px;text-align:right}
${sel} .rway{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #ffffff12;font-size:14px}
${sel} .rpill{font-size:11px;border:1px solid #6fae6a;color:#a8dca2;border-radius:10px;padding:1px 8px}
${sel} .rpill.wait{border-color:#a9894a;color:#e0c890}
${sel} .rsrc{font-size:12px;color:#a9a294;margin-top:8px}
${sel} .rhead{font-size:16px;color:#f3e3bd}`;

function nodeOf(w, owner) {
  if (w.defender === owner) return w.town;
  const st = w.camp?.station;
  return st?.node && st.linked ? st.node : null;
}
// fewest-stops reach over the owner's open lines (same as the sim's route)
function reaches(game, owner, from, to) {
  if (!from || !to) return false;
  const L = Object.values(game.state.frontier?.rail?.links || {}).filter(l => l.owner === owner && l.done && !l.closed);
  const seen = new Set([from]), todo = [from];
  while (todo.length) { const a = todo.pop(); if (a === to) return true; for (const l of L) { const n = l.from === a ? l.to : l.to === a ? l.from : null; if (n && !seen.has(n)) { seen.add(n); todo.push(n); } } }
  return false;
}
const ordersOf = (game, w, owner) => Object.values(game.state.frontier?.shipping?.orders || {}).filter(o => o.kind === 'ryo' && o.owner === owner && o.war === w.id && o.state === 'open');
function whereIs(game, o) {
  const F = game.state.frontier || {}, name = id => id === 'capital' ? 'the capital' : F.settlements?.[id]?.name || id;
  // Tim 2026-11-17: a cut line (a camp's supply line broken, or a town's station in ruins) holds the order until it is mended
  if (Object.values(F.rail?.links || {}).some(l => l.owner === o.owner && l.done && l.closed && (l.from === o.to || l.to === o.to))) return { text: 'line cut: waiting', on: false };
  for (const t of Object.values(F.rail?.trains || {})) if ((t.freight || []).some(c => c.order === o.id && c.amount > 0)) return { text: 'on the train', on: true };
  for (const [at, yard] of Object.entries(F.shipping?.yards || {})) if ((yard || []).some(c => c.order === o.id && c.amount > 0)) return { text: `waiting at ${name(at)} station`, on: false };
  return { text: 'waiting for the train', on: false };
}

export function chestSendSig(game, w, owner) {
  const c = game.state.clans?.[owner];
  return JSON.stringify([Math.floor(c?.ryo ?? 0), c?.treasuryKeep, nodeOf(w, owner), w.camp?.station?.cut, ordersOf(game, w, owner).map(o => [o.id, o.amount, o.got, whereIs(game, o).text]),
    Object.values(game.state.frontier?.settlements || {}).filter(s => s.owner === owner).map(s => Math.floor(s.stock?.ryo || 0)), w.camp?.sources, w.defense?.sources]);
}

export function chestSendHtml({ game, war: w, owner, counts = {}, data = {} }) {
  const F = game.state.frontier || {}, clan = game.state.clans?.[owner], node = nodeOf(w, owner), defend = w.defender === owner;
  const keepLine = clan?.treasuryKeep ?? data.war?.supply?.treasuryKeep ?? 1000, GEN = game.frontier?.warGeneral, GR = GEN?.rules?.() || data.war?.general || {};
  const amt = (from, d) => counts[`rs:${from}`] ?? d;
  const num = (from, d, off) => `<input class="num" type="text" inputmode="numeric" data-n="rs:${esc(from)}" value="${esc(amt(from, d))}"${off ? ' disabled' : ''}>`;
  const box = (from, d, off, t) => `${num(from, d, off)}<button class="go" data-rsend="${esc(from)}"${off ? ' disabled' : ''} title="${esc(t)}">Send</button>`;
  const n = from => Math.max(0, Math.floor(Number(amt(from, from === 'capital' ? 500 : 300)) || 0));
  let h = `<div class="rsec"><span>${defend ? 'Send by train' : 'From'}</span><b>Keeps after sending</b></div>`;
  // Clan treasury
  { const ok = reaches(game, owner, 'capital', node), left = Math.floor((clan?.ryo ?? 0) - n('capital'));
    const why = !node ? 'Needs the camp station linked by rail' : !ok ? `Needs a rail line from the capital to ${defend ? F.settlements?.[w.town]?.name || 'the town' : 'the camp'}` : '';
    h += `<div class="rrow${why ? ' off' : ''}"><div><div class="rn">Clan treasury</div><div class="rk${!why && left < keepLine ? ' red' : ''}" title="${esc(`Clan treasury ${fmt(clan?.ryo ?? 0)}. The keep line (${fmt(keepLine)}) only holds back auto orders from your governors and general, never yours.`)}">${why ? esc(why) : `Keeps ${fmt(Math.max(0, left))} (keep line ${fmt(keepLine)})`}</div></div>${box('capital', 500, !!why, 'Leaves the Clan treasury now and rides the guard car of the next train from the capital')}</div>`; }
  // other towns' coffers (the defending town puts its own coffers in above)
  const towns = Object.values(F.settlements || {}).filter(s => s.owner === owner && !s.capital && !(defend && s.id === w.town))
    .map(s => ({ s, ok: reaches(game, owner, s.id, node) })).sort((a, b) => (b.ok - a.ok) || (Math.hypot(a.s.x - (w.x ?? 0), a.s.z - (w.z ?? 0)) - Math.hypot(b.s.x - (w.x ?? 0), b.s.z - (w.z ?? 0))));
  for (const { s, ok } of towns.slice(0, ROWS)) {
    const left = Math.floor((s.stock?.ryo || 0) - n(s.id)), line = Math.floor((s.stock?.ryo || 0) * (GEN?.keepOf?.(s) ?? GR.keepShare ?? 0.5));
    const why = !node ? 'Needs the camp station linked by rail' : !ok ? `Needs a rail line to ${defend ? F.settlements?.[w.town]?.name || 'the town' : 'the camp'}` : '';
    h += `<div class="rrow${why ? ' off' : ''}"><div><div class="rn">${esc(s.name)} coffers</div><div class="rk${!why && left < line ? ' red' : ''}" title="${esc(`${s.name} coffers ${fmt(s.stock?.ryo || 0)}. Its defence line (General tab keep share) is what your general leaves in the coffers.`)}">${why ? esc(why) : `Keeps ${fmt(Math.max(0, left))}${left < line ? ', below its defence line' : ''}`}</div></div>${box(s.id, 300, !!why, `Leaves ${s.name} coffers now and rides the next train`)}</div>`;
  }
  if (towns.length > ROWS) h += `<div class="small" style="margin-top:4px">${towns.length - ROWS} more of your towns: send from their Shipments tab</div>`;
  // on the way
  const on = ordersOf(game, w, owner);
  if (on.length) {
    const name = id => id === 'capital' ? 'Treasury' : `${F.settlements?.[id]?.name || id} coffers`;
    h += `<div class="rsec"><span>On the way</span><b>${on.length} order${on.length > 1 ? 's' : ''}</b></div>`;
    h += on.slice(0, ROWS).map(o => { const at = whereIs(game, o); return `<div class="rway"><span>${esc(name(o.from))} ${fmt(o.amount - o.got)}${o.auto ? ' <span class="small" style="display:inline">auto</span>' : ''}</span><span class="rpill${at.on ? '' : ' wait'}">${esc(at.text)}</span>${o.auto ? '<span></span>' : `<button data-rcancel="${esc(o.id)}" title="Cancel: what is not loaded yet goes back where it came from">Cancel</button>`}</div>`; }).join('');
    if (on.length > ROWS) h += `<div class="small" style="margin-top:4px">and ${on.length - ROWS} more</div>`;
  }
  // where the chest came from
  const src = defend ? w.defense?.sources || {} : w.camp?.sources || {}, parts = [];
  if (defend) { if (w.defense?.put) parts.push(`${F.settlements?.[w.town]?.name || 'Town'} coffers ${fmt(w.defense.put)}`); }
  else if (w.camp?.brought?.ryo) parts.push(`hero's pack ${fmt(w.camp.brought.ryo)}`);
  for (const [k, v] of Object.entries(src)) parts.push(`${k === 'treasury' ? 'Treasury' : `${F.settlements?.[k]?.name || k} coffers`} by train ${fmt(v)}`);
  if (parts.length) h += `<div class="rsrc">Sources this war: ${esc(parts.join(', '))}.</div>`;
  h += `<div class="rsrc">${defend ? `If the war ends first, the ryo goes into ${esc(F.settlements?.[w.town]?.name || 'the town')} coffers.` : 'If the war ends first or the line is cut, ryo not yet here goes back where it came from.'}</div>`;
  return h;
}

// what the Send / Cancel buttons send (both panels)
export function chestSendClick(d, { war: w, heroId, counts, send }) {
  if (d.rcancel) { send({ id: heroId, type: 'frontier', action: 'ship', mode: 'cancel', order: d.rcancel }); return ''; }
  if (!d.rsend) return null;
  const n = Math.floor(Number(counts[`rs:${d.rsend}`] ?? (d.rsend === 'capital' ? 500 : 300)));
  if (!Number.isSafeInteger(n) || n < 1) return 'Type how much';
  send({ id: heroId, type: 'frontier', action: 'ship', mode: 'ryo', from: d.rsend === 'capital' ? 'treasury' : d.rsend, into: 'chest', war: w.id, amount: n });
  return '';
}
