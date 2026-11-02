// Town panel (frontier plan F4.4). A DOM window built from reportRows (frontier_report.js), in the
// look of the building panel. It only reads the snapshot copy of state.frontier and sends
// { type: 'frontier', action, ... } commands for the hero; rejections show the receipt's reason.
// Talk to the governor is a button for now; the Space-at-the-town-hall version arrives with the town in the world (E5).
import { bindTips } from './frontier_tips.js';
import { reportRows, governorSays, talkCommand } from './frontier_report.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tip = t => t ? ` data-tip="${esc(t)}"` : '';
const arrow = { up: '<span class="up">▲</span>', down: '<span class="dn">▼</span>', flat: '<span class="dim">–</span>' };

export function ownTowns(frontier, clan) {
  return Object.values(frontier?.settlements || {}).filter(s => s.owner === clan && !s.capital && s.stock);
}

export function createFrontierPanel({ root, game, heroId, clan = 'player', send, onOpen = () => {}, onClose = () => {} }) {
  let selected = null, mode = 'town', prevStock = {}, prevAt = 0, lastHtml = '', failure = null;
  const tips = bindTips(root);
  const cmd = c => send({ id: heroId, type: 'frontier', ...c });
  const towns = () => ownTowns(game.state.frontier, clan);
  function pick() {
    const list = towns();
    if (!list.find(s => s.id === selected)) selected = list[0]?.id ?? null;
    return list.find(s => s.id === selected) || null;
  }
  function render() {
    if (root.hidden) return;
    const s = pick();
    if (!s) { root.innerHTML = '<h1>Towns</h1><div class="sub">You have no town yet.</div>'; return; }
    // arrows compare with the numbers from about a second ago
    const now = Date.now();
    if (now - prevAt > 1000) { prevAt = now; prevStock[s.id] = { prev: prevStock[s.id]?.cur, cur: structuredClone(s) }; }
    const rows = reportRows(s, prevStock[s.id]?.prev);
    const list = towns();
    let h = '';
    if (list.length > 1) h += '<div class="tabs">' + list.map(t => `<button data-act="town" data-id="${t.id}" class="${t.id === s.id ? 'on' : ''}">${esc(t.name)}</button>`).join('') + '</div>';
    if (mode === 'talk') {
      const say = governorSays(rows);
      h += `<h1>Governor</h1><div class="sub">${esc(rows.title)}</div><div class="chat">“${esc(say.text)}”</div><div class="choices">`
        + say.choices.map(c => `<button data-act="talk" data-id="${c.id}">${esc(c.label)}</button>`).join('') + '</div>';
    } else {
      const mood = rows.mood;
      h += `<div class="row"><div><h1>${esc(rows.title)}</h1><div class="sub">Yours · mood <b${tip(mood.tip)}>${mood.value}</b> / 100</div></div><button data-act="talk"${tip('Talk to the governor: his report, and ways to steer the town.')}>Governor</button></div>`;
      h += '<div class="lab">Stock</div><div class="stock">' + rows.stock.map(r => `<div${tip(r.tip)}>${esc(r.label)}<b>${r.value}</b>${arrow[r.arrow]}</div>`).join('') + '</div>';
      h += `<div class="lab">People</div><div class="row"><span>${esc(rows.pop.text)}</span><span class="dim"${tip(rows.jobsTip)}>${esc(rows.jobsText)}</span></div><div class="bar"><i style="width:${Math.round(rows.pop.fill * 100)}%"></i></div>`;
      h += `<div class="row" style="margin-top:5px"><span>Mood</span><span class="dim">${mood.why.length ? esc(mood.why.map(w => w.text).join(' · ')) : 'Content'}</span></div><div class="bar m"><i style="width:${mood.value}%"></i></div>`;
      if (mood.why.length) h += '<div class="hint">' + esc(mood.why.map(w => w.hint).join(' · ')) + '</div>';
      h += `<div class="lab">Governor says</div><div>Doing: <b>${esc(rows.doing || 'Nothing yet')}</b></div>` + (rows.next ? `<div>Next: <span class="dim">${esc(rows.next)}</span></div>` : '')
        + rows.waiting.map(w => `<span class="pill red">${esc(w)}</span>`).join(' ');
      if (rows.projects.length) h += '<div class="lab">Projects</div>' + rows.projects.map(p => `<div class="row"><span>${esc(p.label)} <span class="dim">· ${esc(p.status)}${p.canAuthorize ? ' · ' + esc(p.cost) : ''}</span></span><span>${p.canAuthorize ? `<button data-act="authorize" data-id="${p.id}">OK</button> ` : ''}<button class="no" data-act="cancel" data-id="${p.id}">Cancel</button></span></div>`).join('');
      if (rows.suggestions.length) h += `<div class="lab"${tip(rows.suggestionsTip)}>Suggestions</div>` + rows.suggestions.map(x => `<div class="row"><span>${esc(x.label)} <span class="dim">· ${esc(x.reason)}</span></span><button data-act="approve" data-id="${x.index}">Approve</button></div>`).join('');
      const st = rows.steer, b = (act, val, label, on) => `<button data-act="${act}" data-id="${val}" class="${on ? 'on' : ''}">${label}</button>`;
      h += '<div class="lab">Steer</div>';
      h += `<div class="row"><span${tip(st.tips.focus)}>Focus</span><span>${['grow', 'produce', 'trade', 'fortify'].map(p => b('priority', p, p[0].toUpperCase() + p.slice(1), st.priority === p)).join(' ')}</span></div>`;
      h += `<div class="row"><span${tip(st.tips.tax)}>Taxes</span><span>${['low', 'normal', 'high'].map(p => b('tax', p, p[0].toUpperCase() + p.slice(1), st.taxLocked && st.tax === p)).join(' ')} ${b('tax', 'auto', 'Auto', !st.taxLocked)}</span></div>`;
      h += `<div class="row"><span${tip(st.tips.initiative)}>Governor takes initiative</span><span>${b('auto', 'off', 'Ask first', !st.autoBuild)} ${b('auto', 'on', 'On', st.autoBuild)}</span></div>`;
    }
    if (failure && Date.now() - failure.at < 5000) h += `<div class="why">${esc(failure.text)}</div>`;
    if (h !== lastHtml) { root.innerHTML = h; lastHtml = h; }
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const s = pick(), id = b.dataset.id, sid = s?.id;
    switch (b.dataset.act) {
      case 'town': selected = id; mode = 'town'; break;
      case 'talk': if (id && s) { const c = id === 'close' ? null : talkCommand(id, reportRows(s)); if (c) cmd(c); mode = id === 'close' ? 'town' : 'talk'; } else mode = mode === 'talk' ? 'town' : 'talk'; break;
      case 'authorize': cmd({ action: 'authorize', project: id }); break;
      case 'cancel': cmd({ action: 'cancel', project: id }); break;
      case 'approve': cmd({ action: 'approveSuggestion', settlement: sid, index: Number(id) }); break;
      case 'priority': cmd({ action: 'setPriority', settlement: sid, priority: id }); break;
      case 'tax': cmd({ action: 'setTax', settlement: sid, level: id }); break;
      case 'auto': cmd({ action: 'setAutoBuild', settlement: sid, on: id === 'on' }); break;
    }
    lastHtml = ''; render(); b.blur?.();
  });
  // rejected commands: show the newest rejection's reason for a few seconds
  let seen = 0;
  function watchReceipts() {
    for (const r of game.state.frontier?.receipts || []) if (r.clan === clan && r.seq > seen) { seen = r.seq; if (!r.ok) failure = { text: `Not possible: ${r.reason}`, at: Date.now() }; }
  }
  setInterval(() => { watchReceipts(); render(); }, 1000);
  function open(id) { if (id) selected = id; mode = 'town'; root.hidden = false; lastHtml = ''; render(); onOpen(); }
  function close() { if (!root.hidden) { root.hidden = true; tips.hide(); onClose(); } }
  return { open, close, toggle() { root.hidden ? open() : close(); }, isOpen: () => !root.hidden, talk(id) { open(id); mode = 'talk'; render(); }, render };
}
