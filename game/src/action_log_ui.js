// The logs of the general, the governor and the capital lieutenant (2026-11-22, mock
// /mnt/project-files/war_build/general_log): a closed section that shows the newest line, and an open view that takes
// the tab: day headers, ten lines a page, a tag per kind, and a box under the list that explains the line the mouse is
// on (no scrollbars; long text in that box). Entries from sim/frontier/action_log.js { tick, day, night, k, x, d },
// newest first. Pure HTML builders; the windows handle data-logopen, data-logback, data-lpage (-1 | 1) and call
// logHover(root, e) on mouseover.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const LOG_PER_PAGE = 10;
// the line, with how many times when it came again soon (sim/frontier/action_log.js)
const said = e => e.n > 1 ? `${e.x} (${e.n} times)` : e.x;
const TAG = { build: 'Built', land: 'Land', save: 'Saving', bad: 'Stuck', war: 'War', work: 'Workers', crew: 'Crew', order: 'Order' };
const tag = k => `<span class="ltag ${esc(k in TAG ? k : 'order')}">${TAG[k] || 'Order'}</span>`;
// how long ago, from sim ticks (20 a second)
export function ago(tick, now) {
  const s = Math.max(0, Math.round(((now ?? tick) - (tick ?? 0)) / 20));
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ${Math.floor(s % 3600 / 60)} min ago`;
}
// the closed section: title, count, the newest line (the whole row opens it)
export function logRowHtml(title, list, now, empty = 'Nothing yet') {
  const top = list?.[0];
  return `<div class="lsec"><span>${esc(title)}</span><b>${list?.length ? `${list.length} entries` : ''}</b></div><div class="lopen" data-logopen="1" title="Click to read the whole log">${top ? `${tag(top.k)}<span class="llast">${esc(said(top))}</span><span class="lago">${esc(ago(top.tick, now))}</span>` : `<span class="llast dim">${esc(empty)}</span>`}<span class="lchev">&rsaquo;</span></div>`;
}
// the open view: page p (0 = newest)
export function logPageHtml(title, list, page, now) {
  list = list || [];
  const pages = Math.max(1, Math.ceil(list.length / LOG_PER_PAGE)), p = Math.min(Math.max(0, page | 0), pages - 1), rows = list.slice(p * LOG_PER_PAGE, (p + 1) * LOG_PER_PAGE);
  let day = null;
  const body = rows.map((e, i) => { const hd = e.day !== day ? `<div class="lday">Day ${esc(day = e.day)}</div>` : '';
    return `${hd}<div class="lrow" data-li="${i}" data-lx="${esc(said(e))}" data-ld="${esc(e.d || '')}" data-lk="${esc(e.k)}" data-lw="${esc(`Day ${e.day}, ${e.night ? 'night' : 'day'}, ${ago(e.tick, now)}`)}"><span class="lago">${esc(ago(e.tick, now))}</span>${tag(e.k)}<span class="ltext">${esc(said(e))}</span></div>`; }).join('');
  return `<div class="lhead"><button data-logback="1">&lsaquo; Back</button><span class="lt">${esc(title)}</span><span class="lcount">${list.length} entries, newest first</span></div>
    <div class="lrows">${body || '<div class="ldim">Nothing logged yet.</div>'}</div>
    <div class="ldet"><span class="ldim">Point at a line to read more about it.</span></div>
    <div class="lfoot"><span>Page ${p + 1} of ${pages}</span><span><button data-lpage="-1"${p ? '' : ' disabled'}>Newer</button> <button data-lpage="1"${p < pages - 1 ? '' : ' disabled'}>Older</button></span></div>`;
}
// mouseover in a window that shows the open view: fill the box under the list from the line under the mouse
export function logHover(root, e) {
  const row = e.target?.closest?.('.lrow'); if (!row || !root.contains(row)) return;
  const box = root.querySelector('.ldet'); if (!box || box.dataset.li === row.dataset.li) return;
  root.querySelectorAll('.lrow.hov').forEach(x => x.classList.remove('hov')); row.classList.add('hov');
  box.dataset.li = row.dataset.li;
  box.innerHTML = `<b>${tag(row.dataset.lk)}<span>${esc(row.dataset.lx)}</span><em>${esc(row.dataset.lw)}</em></b>${row.dataset.ld ? `<span>${esc(row.dataset.ld)}</span>` : ''}`;
}
// page within bounds after a data-lpage click
export const logTurn = (page, step, list) => Math.min(Math.max(0, (page | 0) + step), Math.max(0, Math.ceil((list?.length || 0) / LOG_PER_PAGE) - 1));
export const LOG_CSS = id => `
${id} .lsec{display:flex;justify-content:space-between;color:#9b9c98;font-size:10px;letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid #3c3b36;padding:10px 0 5px}${id} .lsec b{color:#d8b56c;font-weight:500}
${id} .lopen{display:flex;align-items:center;gap:9px;margin-top:8px;padding:8px 10px;border:1px solid #5b4a30;border-left:3px solid #c3924a;border-radius:6px;background:linear-gradient(90deg,rgba(150,110,50,.2),rgba(20,24,28,.6) 75%);cursor:pointer}
${id} .lopen:hover{border-color:#ffe0a1}
${id} .lopen .llast{flex:1;min-width:0;color:#f3e3bd;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}${id} .lopen .lago{flex:none;color:#9aa3a6;font-size:11px}
${id} .lchev{flex:none;color:#f0cf85;font:700 20px/1 system-ui;padding:0 2px}
${id} .ltag{flex:none;display:inline-block;width:62px;text-align:center;padding:2px 0;border-radius:3px;font:700 10px system-ui;letter-spacing:.06em;text-transform:uppercase;border:1px solid}
${id} .ltag.build{color:#f0c96a;border-color:#8a6f2e;background:#2a2212}${id} .ltag.land{color:#e6d6b0;border-color:#8c7b58;background:#262119}
${id} .ltag.save,${id} .ltag.order{color:#dbe4ea;border-color:#7a8892;background:#232b32}${id} .ltag.work,${id} .ltag.crew{color:#cfe0c4;border-color:#5f7454;background:#1c241a}
${id} .ltag.bad{color:#fff0ea;border-color:#e0574a;background:#b8362c}${id} .ltag.war{color:#f0a195;border-color:#c9473d;background:#2a1513}
${id} .lhead{display:flex;align-items:center;gap:12px;border-bottom:1px solid #3c3b36;padding:9px 0 7px;white-space:nowrap}
${id} .lhead .lt{color:#f0cf85;font-size:12px;letter-spacing:.12em;text-transform:uppercase}${id} .lhead .lcount{margin-left:auto;color:#9aa3a6;font-size:11px}
${id} .lrows{margin-top:4px}
${id} .lday{margin-top:6px;padding:3px 8px;color:#f0cf85;font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;border-bottom:1px solid #3c3b36}
${id} .lrow{display:grid;grid-template-columns:86px 66px 1fr;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid #26292d;cursor:help}
${id} .lrow:nth-child(odd){background:#14181c}${id} .lrow.hov{background:#2a2620;box-shadow:inset 3px 0 0 #c3924a,inset 0 0 0 1px #8a6f3e}
${id} .lrow .lago{color:#bfc6c9;font-size:11px}${id} .lrow .ltext{color:#eadfc6;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${id} .ldet{margin-top:8px;padding:7px 10px;height:84px;box-sizing:border-box;overflow:hidden;border:1px solid #8a6f3e;border-left:3px solid #c3924a;border-radius:6px;background:#0f1215;font-size:12px;line-height:1.4;color:#d9d0bb}
${id} .ldet b{display:flex;align-items:center;gap:8px;color:#f6e6bf;font-size:12.5px;margin-bottom:2px}${id} .ldet b em{margin-left:auto;font-style:normal;font-weight:400;color:#bfc6c9;font-size:11px}
${id} .ldim{color:#9aa3a6;font-size:12px}${id} .llast.dim{color:#9aa3a6}
${id} .lfoot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;color:#d9d0bb;font-size:12px}${id} .lfoot button:disabled{opacity:.45}`;
