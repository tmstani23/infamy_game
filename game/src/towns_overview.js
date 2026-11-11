// All-towns overview (frontier plan F4.4b): one window, one row per town you own, key Y.
// Reads the snapshot copy of state.frontier; sends frontier commands only. Drag a row to change the
// priority list (setTownOrder); click a row to open that town's panel; click a column to sort the view.
import { overviewRows, SORTS } from './frontier_report.js';
import { bindTips } from './frontier_tips.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const arrow = { up: '<span class="up tri"></span>', down: '<span class="dn tri"></span>', flat: '<span class="dim">-</span>' }   // drawn triangles, no glyphs (Tim 2026-11-10);
const NEED = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', ok: 'OK' };
const COLS = [['rank', '#', 'Priority list. The top town gets capital supplies, imports and new recruits first. Drag a row to reorder.'], ['need', 'Need', 'How badly the town needs you: Urgent (attacked, lost a building), High (road blocked, food running out, very low mood), down to OK. Click to list the worst first. Hover a Need cell for why.'], ['name', 'Town'], ['pop', 'Pop'], ['mood', 'Mood', 'How content the town is, and the worst thing dragging it down.'],
  ['food', 'Food', 'Arrow: food going up or down. Down for long means a farm is needed.'], ['ryo', 'Ryo', 'Ryo in the town treasury and its trend.'], ['shortage', 'Short of'], ['project', 'Building'], ['road', 'Road', 'Whether goods can travel between this town and the capital.'], ['garrison', 'Garrison'], ['priority', 'Focus', 'What the governor builds first.'], ['tax', 'Tax', 'Ryo per person against mood. Auto lets the governor pick.']];

export function createTownsOverview({ root, game, heroId, clan = 'player', send, openTown = () => {}, onOpen = () => {}, onClose = () => {} }) {
  const PER = 10;   // towns a page (no scrollbars, Tim 2026-11-10)
  let page = 0;
  let sort = 'rank', dragId = null, lastHtml = '', prev = {}, cur = {}, prevAt = 0;
  const alerts = {}, flash = {};   // alerts[id] = [text]; flash[id] = time it stops flashing
  const tips = bindTips(root);
  const cmd = c => send({ id: heroId, type: 'frontier', ...c });
  function rows() {
    const f = game.state.frontier, now = Date.now();
    if (f && now - prevAt > 1000) { prevAt = now; prev = cur; cur = structuredClone(Object.fromEntries(Object.entries(f.settlements || {}).filter(([, s]) => s.owner === clan))); }
    const r = overviewRows(f, clan, prev, alerts);
    return sort === 'rank' ? r : r.sort(SORTS[sort] || (() => 0));
  }
  function render() {
    if (root.hidden) return;
    const all = rows(), now = Date.now(), pages = Math.max(1, Math.ceil(all.length / PER));
    page = Math.max(0, Math.min(page, pages - 1));
    const list = all.slice(page * PER, page * PER + PER);
    let h = '<h1>Your towns</h1><table><tr>' + COLS.map(([k, t, tip]) => `<th data-sort="${k}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${t}${sort === k ? ' <span class="dn tri"></span>' : ''}</th>`).join('') + '</tr>';
    for (const r of list) {
      const road = r.road === 'working' ? '<span class="up">OK</span>' : r.road === 'none' ? '<span class="dim">-</span>' : `<span class="dn">${esc(r.road)}</span>`;
      h += `<tr draggable="${sort === 'rank'}" data-id="${r.id}" class="${flash[r.id] > now ? 'flash' : ''}"><td><span class="grip"></span>${r.rank}</td><td class="need ${r.need}" data-tip="${esc(r.needWhy.join('\n') || 'Nothing wrong right now.')}">${NEED[r.need]}</td><td><b>${esc(r.name)}</b>${r.alerts.map(a => ` <span class="pill">${esc(a)}</span>`).join('')}</td><td>${r.pop}</td>`
        + `<td data-tip="${esc(r.moodTip)}" class="${r.mood < 40 ? 'dn' : ''}">${r.mood}${r.moodWhy ? ` <span class="dim">${esc(r.moodWhy)}</span>` : ''}</td><td data-tip="${esc(r.foodTip)}">${r.foodValue} ${arrow[r.food]}</td><td>${r.ryo} ${arrow[r.ryoArrow]}</td>`
        + `<td data-tip="${esc(r.shortageTip)}">${esc(r.shortage.replace('Waiting for ', ''))}</td><td>${esc(r.project)}</td><td>${road}</td><td>${r.garrison}</td>`
        + `<td><select data-act="priority" data-id="${r.id}">${['grow', 'produce', 'trade', 'fortify'].map(p => `<option value="${p}"${p === r.priority ? ' selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></td>`
        + `<td><select data-act="tax" data-id="${r.id}">${['auto', 'low', 'normal', 'high'].map(p => `<option value="${p}"${p === r.tax ? ' selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></td></tr>`;
    }
    h += '</table>' + (pages > 1 ? `<div class="pager"><span class="dim">Page ${page + 1} of ${pages}</span> <button data-page="-1"${page ? '' : ' disabled'}>Prev</button> <button data-page="1"${page < pages - 1 ? '' : ' disabled'}>Next</button></div>` : '') + (list.length ? '<div class="sub">Click a row to open its panel. Drag rows by the grip to change the priority list (works when sorted by #).</div>' : '<div class="sub">You have no town yet.</div>');
    if (h !== lastHtml && document.activeElement?.tagName !== 'SELECT') { root.innerHTML = h; lastHtml = h; }   // never rebuild under an open dropdown
  }
  root.addEventListener('click', e => {
    const pg = e.target.closest?.('[data-page]'); if (pg?.dataset?.page !== undefined) { page += Number(pg.dataset.page); lastHtml = ''; render(); return; }
    const th = e.target.closest?.('th[data-sort]'); if (th) { sort = th.dataset.sort; lastHtml = ''; render(); return; }
    if (e.target.closest?.('select')) return;
    const tr = e.target.closest?.('tr[data-id]'); if (tr) openTown(tr.dataset.id);
  });
  root.addEventListener('change', e => {
    const s = e.target; if (!s?.dataset?.act) return;
    if (s.dataset.act === 'priority') cmd({ action: 'setPriority', settlement: s.dataset.id, priority: s.value });
    if (s.dataset.act === 'tax') cmd({ action: 'setTax', settlement: s.dataset.id, level: s.value });
    lastHtml = '';
  });
  root.addEventListener('dragstart', e => { const tr = e.target.closest?.('tr[data-id]'); dragId = tr?.dataset.id ?? null; });
  root.addEventListener('dragover', e => { if (dragId) e.preventDefault?.(); });
  root.addEventListener('drop', e => {
    const tr = e.target.closest?.('tr[data-id]'); if (!dragId || !tr || tr.dataset.id === dragId) { dragId = null; return; }
    e.preventDefault?.();
    const order = rows().map(r => r.id).filter(id => id !== dragId);
    order.splice(order.indexOf(tr.dataset.id), 0, dragId);
    // dropping on a row puts the dragged town in front of it
    cmd({ action: 'setTownOrder', order }); dragId = null; lastHtml = '';
  });
  function open() { root.hidden = false; lastHtml = ''; render(); onOpen(); }
  // Tim 2026-11-06: a town alert opens this window with the worst towns first and that town's row flashing
  function showNeed(id) { sort = 'need'; if (id) flash[id] = Date.now() + 4000; open(); }
  function close() { if (!root.hidden) { root.hidden = true; tips.hide(); onClose(); } }
  setInterval(render, 1000);
  return { open, showNeed, close, toggle() { root.hidden ? open() : close(); }, isOpen: () => !root.hidden, render,
    // F4.4c: the news feed calls this; urgent alerts flash the row for 8 s
    alert(id, text, urgent) { (alerts[id] ||= []); if (!alerts[id].includes(text)) alerts[id] = [...alerts[id], text].slice(-3); if (urgent) flash[id] = Date.now() + 8000; setTimeout(() => { alerts[id] = (alerts[id] || []).filter(t => t !== text); lastHtml = ''; }, 30000); lastHtml = ''; render(); } };
}
