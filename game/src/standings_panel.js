// The Standings panel (Tim 2026-11-10): click a clan chip in the top bar. A tab per clan, coins on the left,
// where its Influence (campaign) or season points (classic) come from, and the tiers, paged (no scrollbars).
// Reads the state only; the numbers come from standingsModel / standingsDetail (src/top_bar_standings.js).
import { msInstall, msShell, msSec, msRow, msPager, msNote, msProg, msEsc } from './menu_shell.js';
import { standingsModel, standingsDetail } from './top_bar_standings.js';
const PER = 5;
export function createStandingsPanel({ root, game, heroId }) {
  let open = false, shown = '', tab = null, page = 0;
  const owner = () => game.state.entities[heroId]?.owner;
  msInstall(root, () => close());
  root.addEventListener('click', ev => {
    const b = ev.target.closest?.('button'); if (!b || b.disabled) return;
    if (b.dataset.sclan) { tab = b.dataset.sclan; page = 0; update(); }
    if (b.dataset.spage) { page += Number(b.dataset.spage); update(); }
  });
  for (const t of ['mousedown', 'mouseup', 'contextmenu', 'wheel']) root.addEventListener(t, ev => { ev.stopPropagation(); if (t === 'contextmenu') ev.preventDefault(); });
  function close() { open = false; root.hidden = true; shown = ''; }
  function update() {
    if (!open) return;
    const m = standingsModel(game, owner()); if (!m) return close();
    if (!m.rows.some(r => r.clan === tab)) tab = m.rows[0]?.clan;
    const d = standingsDetail(game, owner(), tab); if (!d) return close();
    const aside = `<aside class="ms-aside"><div class="ms-art"><span class="st-crest" style="--c:${msEsc(d.color || '#888')}"></span></div><span class="ms-tier">${msEsc(d.me ? 'Your clan' : 'Rival clan')}</span>`
      + `<div class="ms-coins">${d.coins.map(c => `<div class="ms-coin${c.red ? ' red' : ''}"${c.tip ? ` title="${msEsc(c.tip)}"` : ''}><b>${msEsc(c.v)}</b><span>${msEsc(c.label)}</span></div>`).join('')}</div></aside>`;
    let body = `<div class="ms-tabs">${m.rows.map(r => `<button class="ms-tab${r.clan === tab ? ' on' : ''}" data-sclan="${msEsc(r.clan)}" title="${msEsc(r.hover)}">${msEsc(r.name)} ${r.big}</button>`).join('')}</div>`;
    if (d.from.length) body += msSec('Where the Influence comes from', '', 'Influence = Renown + businesses held each day + town trade') + d.from.map(r => msRow({ name: msEsc(r.name), sub: msEsc(r.sub), right: `<b>${msEsc(r.right)}</b>` })).join('');
    if (d.campaign) body += msSec('Next tier', d.next ? `${d.next.left} to go` : 'All reached', d.next ? `At ${d.next.at} Influence: ${d.next.label}` : '') + (d.next ? msProg(d.next.frac) + msNote(d.next.label, true) : '');
    const pages = Math.max(1, Math.ceil(d.rows.length / PER)); page = Math.max(0, Math.min(page, pages - 1));
    body += msSec(d.listTitle, d.rows.length ? `${d.rows.length}` : '');
    body += d.rows.slice(page * PER, page * PER + PER).map(r => msRow({ name: msEsc(r.name), sub: msEsc(r.sub), right: `<b>${msEsc(r.right)}</b>`, off: r.off })).join('') || msNote('Nothing yet.');
    if (pages > 1) body += msPager(pages, page, 'data-spage');
    body += msNote(d.renownWhy);
    const html = msShell({ eyebrow: d.campaign ? 'Campaign standings' : 'Season standings', title: d.name, escTip: 'Close (Esc)', aside, body });
    if (html !== shown) { root.innerHTML = html; shown = html; }
    root.hidden = false;
  }
  return { update, close, isOpen: () => open, open(clan) { if (open && clan === tab) return close(); open = true; tab = clan || tab; page = 0; update(); } };
}
