// Garrison card (Tim 2026-11-10): left-click one of your finished buildings that has garrison data
// (data.buildings.<type>.garrison, today the stockade) to see who is inside and the empty slots.
// Generic: later garrisonable buildings (town hall, war-update houses) only need garrison data.
// Reads the snapshot; leaving goes through the same frontier 'garrison' command as the town panel.
import { garrisonCount } from './town_props.js';
import { healthBar } from './render/health.js';
import { portrait } from './portraits.js';
import { entityName } from './selection_panel.js';

const PER_PAGE = 24;
const CSS = `
#garrisoncard{position:fixed;left:380px;top:110px;width:340px;box-sizing:border-box;padding:10px 12px 12px;z-index:34;background:linear-gradient(180deg,#171c21,#0f1317);border:1px solid #4d3b2a;border-top:2px solid var(--ms-accent);border-radius:8px;box-shadow:0 12px 44px #000b,0 0 0 1px #000;font:12px/16px system-ui,sans-serif;color:#eadfc6}
#garrisoncard[hidden]{display:none}
#garrisoncard h1{margin:2px 0 0;font:500 19px/22px system-ui,sans-serif;color:#eadfc6}
#garrisoncard .sub{font:600 10px/12px system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--ms-accent-lt)}
#garrisoncard .lab{color:#9b9c98;font-size:10px;text-transform:uppercase;letter-spacing:.12em;margin:9px 0 6px;border-bottom:1px solid #3c3b36;padding-bottom:5px;display:flex;justify-content:space-between}#garrisoncard .lab span:last-child{color:#d8b56c}
#garrisoncard .bar{height:6px;background:#22262e;border-radius:3px;margin-top:3px;overflow:hidden}#garrisoncard .bar i{display:block;height:100%}
#garrisoncard .grid{display:grid;grid-template-columns:repeat(8,1fr);gap:4px}
#garrisoncard .s{aspect-ratio:1;border-radius:5px;background:#1d1a16 center/cover no-repeat;border:1px solid #665944;position:relative;overflow:hidden;cursor:pointer}
#garrisoncard .s.e{border:1px dashed #3a352c;background:none;cursor:default}
#garrisoncard .s .h{position:absolute;left:2px;right:2px;bottom:2px;height:3px;background:#22262e}#garrisoncard .s .h i{display:block;height:100%}
#garrisoncard .s .ini{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 14px system-ui,sans-serif;color:#8c8476}
#garrisoncard .s.hero{border-color:var(--ms-accent);box-shadow:0 0 6px color-mix(in srgb, var(--ms-accent) 53%, transparent)}#garrisoncard .s.rest{opacity:.7}
#garrisoncard .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}
#garrisoncard .dim{color:#8c8476}
#garrisoncard button{font:600 12px/14px system-ui,sans-serif;color:#eadfc6;background:#20262d;border:1px solid #61543e;border-radius:5px;padding:4px 10px;cursor:pointer}#garrisoncard button:hover:not(:disabled){border-color:#ffe0a1;background:#262d35}#garrisoncard button[data-act=out]{border-color:var(--ms-go-line);background:linear-gradient(var(--ms-go1),var(--ms-dk1));color:var(--ms-on-text)}
#garrisoncard button:disabled{opacity:.4;cursor:default}
#garrisoncard .x{position:absolute;top:8px;right:10px}`;

export function createGarrisonCard({ game, heroId, frontierData, units, catalog, send, select, selected = () => [] }) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'garrisoncard'; root.hidden = true; document.body.appendChild(root);
  let site = null, page = 0, sig = '';   // site = { town, building id }
  const nice = t => (t || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  const rulesOf = type => frontierData?.buildings?.[type]?.garrison || null;
  const css = c => `rgb(${c.map(v => Math.round(v)).join(',')})`;

  // everyone inside the town's garrison: entities plus resting workers with no entity right now
  function members(s) {
    const out = Object.values(game.state.entities).filter(e => e.garrison?.town === s.id && !e.garrison.hall).map(e => ({ id: e.id, e }));
    for (const w of s.workers || []) if (w.garrison && !game.state.entities[w.entity]) out.push({ id: 'w:' + w.id, rest: true });
    return out;
  }
  const isGarrisonable = (s, b) => !!(s && b && b.stage === 'built' && rulesOf(b.type) && !s.capital);

  function open(townId, buildingId) { site = { town: townId, building: buildingId }; page = 0; sig = ''; render(); }
  function close() { site = null; root.hidden = true; sig = ''; }

  function render() {
    if (!site) return;
    const fr = game.state.frontier, s = fr?.settlements?.[site.town], b = s?.buildings?.find(x => x.id === site.building);
    if (!isGarrisonable(s, b) || game.state.entities[heroId]?.place !== 'world') { close(); return; }
    const R = rulesOf(b.type), cap = R.capacity || 0, mem = members(s);
    const pages = Math.max(1, Math.ceil(cap / PER_PAGE)); page = Math.min(page, pages - 1);
    // rebuild the grid only when who is inside, the page or the capacity changes; health just updates in place,
    // so the native tooltip under the cursor is not destroyed every time someone heals (Tim 2026-11-10)
    const key = [site.town, site.building, page, cap, ...mem.map(m => m.id)].join();
    root.hidden = false;
    const hp = b.hp ?? R.hp;
    if (key === sig) { updateInPlace(mem, R, hp); return; }
    sig = key;
    const hpLine = R.hp ? `<div class="bh" style="margin-top:6px"${tip(`Hits on units inside land on the building instead. If it breaks, everyone inside piles out and the governor rebuilds it.`)}><span>Health ${Math.round(hp)} / ${R.hp}</span></div><div class="bar"><i class="bhi" style="width:${100 * Math.min(1, hp / R.hp)}%;background:#7fa66a"></i></div>` : '';
    let slots = '';
    for (let i = page * PER_PAGE; i < Math.min(cap, (page + 1) * PER_PAGE); i++) {
      const m = mem[i];
      if (!m) { slots += '<div class="s e" title="Empty slot"></div>'; continue; }
      if (m.rest) { slots += `<div class="s rest" data-id="${m.id}" title="Worker, resting inside. Click: walk out"><b class="ini">W</b></div>`; continue; }
      const e = m.e, { frac, color } = healthBar(e.hp, e.maxHp), url = portrait(catalog, e.model, () => { sig = ''; });   // null while the picture loads: the next render fills it
      const name = (e.cannon || e.surveyor) && e.name || entityName(units, e, e.civ || e.type);
      slots += `<div class="s${e.id === heroId ? ' hero' : ''}" data-id="${m.id}" style="${url ? `background-image:url(${url})` : ''}" title="${name}: ${Math.ceil(e.hp)} / ${e.maxHp}, healing ${R.healFactor ?? 1}x. Click: walk out">${url ? '' : `<b class="ini">${initial(e)}</b>`}<div class="h"><i style="width:${frac * 100}%;background:${css(color)}"></i></div></div>`;
    }
    root.innerHTML = `<button class="x" data-act="close" title="Close">Close</button><div class="sub">${s.name || 'Your town'}, garrison</div><h1>${nice(b.type)}</h1>${hpLine}
      <div class="lab"><span>Inside ${mem.length} / ${cap}</span><span>${pages > 1 ? `Page ${page + 1} of ${pages}` : ''}</span></div>
      <div class="grid">${slots}</div>
      <div class="row"><span class="dim"${tip(`Units must stand within ${R.range ?? ''} of the building to go in.`)}>Send in</span><span><button data-act="in-sel"${tip('Send your selected units inside')}>Selected</button> <button data-act="in-crew"${tip('Send your hero and crew inside')}>Hero and crew</button></span></div>
      <div class="row"><span class="dim"${tip(`Units inside heal ${R.healFactor ?? 1}x faster and cannot be attacked.`)}>Heal ${R.healFactor ?? 1}x inside</span><span>${pages > 1 ? `<button data-act="prev"${page ? '' : ' disabled'}>Prev</button> <button data-act="next"${page < pages - 1 ? '' : ' disabled'}>Next</button> ` : ''}<button data-act="out"${mem.length ? '' : ' disabled'}${tip('Everyone inside walks out (Shift+K)')}>Evacuate</button></span></div>`;
  }
  function updateInPlace(mem, R, hp) {
    const bt = root.querySelector('.bh span'), bi = root.querySelector('.bhi');
    if (bt) { const t = `Health ${Math.round(hp)} / ${R.hp}`; if (bt.textContent !== t) bt.textContent = t; }
    if (bi) bi.style.width = `${100 * Math.min(1, hp / R.hp)}%`;
    for (const m of mem) {
      if (!m.e) continue;
      const el = root.querySelector(`.s[data-id="${m.id}"]`); if (!el) continue;
      const e = m.e, { frac, color } = healthBar(e.hp, e.maxHp), i = el.querySelector('.h i');
      if (!el.style.backgroundImage) { const u = portrait(catalog, e.model, () => { sig = ''; }); if (u) { el.style.backgroundImage = `url(${u})`; el.querySelector('.ini')?.remove(); } }
      if (i) { i.style.width = `${frac * 100}%`; i.style.background = css(color); }
      const name = (e.cannon || e.surveyor) && e.name || entityName(units, e, e.civ || e.type), t = `${name}: ${Math.ceil(e.hp)} / ${e.maxHp}, healing ${R.healFactor ?? 1}x. Click: walk out`;
      if (el.title !== t) el.title = t;
    }
  }
  const initial = e => String(e.civ || e.type || '?').charAt(0).toUpperCase();   // a chip with no portrait shows its type's initial
  function tip(t) { return ` title="${t.replace(/"/g, '&quot;')}"`; }

  // act on mousedown: the card redraws as units heal, which would swallow a click between press and release
  root.addEventListener('click', ev => ev.stopPropagation());
  root.addEventListener('mousedown', ev => {
    ev.stopPropagation();
    if (ev.button !== 0) return;
    const a = ev.target.closest('[data-act]')?.dataset.act, slot = ev.target.closest('.s[data-id]');
    if (a === 'close') return close();
    if (a === 'prev') page--; else if (a === 'next') page++;
    else if (a === 'in-sel' || a === 'in-crew') {   // Tim 2026-11-11: moved here from the Governor tab
      const mine = game.state.entities[heroId]?.owner;
      const ids = a === 'in-sel' ? selected() : Object.values(game.state.entities).filter(u => u.owner === mine && !u.garrison && u.place === 'world' && !u.worker && u.type !== 'civilian').map(u => u.id);
      if (ids.length) send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'enter', town: site.town, units: ids });
    }
    else if (a === 'out') send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'leave', town: site.town });
    else if (slot) send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'leave', town: site.town, units: [slot.dataset.id] });   // click a unit: it walks out (Tim 2026-11-10)
    sig = ''; render();
  });
  setInterval(render, 250);
  return { open, close, isGarrisonable, isOpen: () => !!site };
}
