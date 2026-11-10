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
#garrisoncard{position:fixed;left:380px;top:110px;width:340px;box-sizing:border-box;padding:10px;z-index:34;background:rgba(12,14,18,.95);border:1px solid #5c4a2c;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.6);font:12px/16px system-ui,sans-serif;color:#e8e2d4}
#garrisoncard[hidden]{display:none}
#garrisoncard h1{margin:0;font:700 16px/20px system-ui,sans-serif;color:#e9d6a8}
#garrisoncard .sub{font:italic 11px/14px system-ui,sans-serif;color:#b8b0a0}
#garrisoncard .lab{color:#8c8476;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin:9px 0 4px;border-top:1px solid #2c2a26;padding-top:6px;display:flex;justify-content:space-between}
#garrisoncard .bar{height:6px;background:#22262e;border-radius:3px;margin-top:3px;overflow:hidden}#garrisoncard .bar i{display:block;height:100%}
#garrisoncard .grid{display:grid;grid-template-columns:repeat(8,1fr);gap:4px}
#garrisoncard .s{aspect-ratio:1;border-radius:4px;background:#101318 center/cover no-repeat;border:1px solid #23262d;position:relative;overflow:hidden;cursor:pointer}
#garrisoncard .s.e{border:1px dashed #3a352c;background:none;cursor:default}
#garrisoncard .s .h{position:absolute;left:2px;right:2px;bottom:2px;height:3px;background:#22262e}#garrisoncard .s .h i{display:block;height:100%}
#garrisoncard .s.hero{border-color:#e9c27a}#garrisoncard .s.rest{opacity:.7}
#garrisoncard .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}
#garrisoncard .dim{color:#8c8476}
#garrisoncard button{font:600 11px/14px system-ui,sans-serif;color:#f2d48a;background:#1b1e25;border:1px solid rgba(233,194,122,.5);border-radius:4px;padding:3px 8px;cursor:pointer}
#garrisoncard button:disabled{opacity:.4;cursor:default}
#garrisoncard .x{position:absolute;top:8px;right:10px}`;

export function createGarrisonCard({ game, heroId, frontierData, units, catalog, send, select }) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'garrisoncard'; root.hidden = true; document.body.appendChild(root);
  let site = null, page = 0, sig = '';   // site = { town, building id }
  const nice = t => (t || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  const rulesOf = type => frontierData?.buildings?.[type]?.garrison || null;
  const css = c => `rgb(${c.map(v => Math.round(v)).join(',')})`;

  // everyone inside the town's garrison: entities plus resting workers with no entity right now
  function members(s) {
    const out = Object.values(game.state.entities).filter(e => e.garrison?.town === s.id).map(e => ({ id: e.id, e }));
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
    const key = [site.town, page, Math.round(b.hp ?? 0), ...mem.map(m => m.id + ':' + Math.round(m.e?.hp ?? 0))].join();
    if (key === sig) return;
    sig = key;
    root.hidden = false;
    const hp = b.hp ?? R.hp, hpLine = R.hp ? `<div style="margin-top:6px"${tip(`Hits on units inside land on the building instead. If it breaks, everyone inside piles out and the governor rebuilds it.`)}>Health ${Math.round(hp)} / ${R.hp}</div><div class="bar"><i style="width:${100 * Math.min(1, hp / R.hp)}%;background:#7fa66a"></i></div>` : '';
    let slots = '';
    for (let i = page * PER_PAGE; i < Math.min(cap, (page + 1) * PER_PAGE); i++) {
      const m = mem[i];
      if (!m) { slots += '<div class="s e" title="Empty slot"></div>'; continue; }
      if (m.rest) { slots += `<div class="s rest" data-id="${m.id}" title="Worker, resting inside. Click: walk out"></div>`; continue; }
      const e = m.e, { frac, color } = healthBar(e.hp, e.maxHp), url = portrait(catalog, e.model);
      const name = (e.cannon || e.surveyor) && e.name || entityName(units, e, e.civ || e.type);
      slots += `<div class="s${e.id === heroId ? ' hero' : ''}" data-id="${m.id}" style="${url ? `background-image:url(${url})` : ''}" title="${name}: ${Math.ceil(e.hp)} / ${e.maxHp}, healing ${R.healFactor ?? 1}x. Click: walk out"><div class="h"><i style="width:${frac * 100}%;background:${css(color)}"></i></div></div>`;
    }
    root.innerHTML = `<button class="x" data-act="close">X</button><h1>${nice(b.type)}</h1><div class="sub">${s.name || 'Your town'} - garrison</div>${hpLine}
      <div class="lab"><span>Inside ${mem.length} / ${cap}</span><span>${pages > 1 ? `Page ${page + 1} of ${pages}` : ''}</span></div>
      <div class="grid">${slots}</div>
      <div class="row"><span class="dim"${tip(`Units inside heal ${R.healFactor ?? 1}x faster and cannot be attacked.`)}>Heal ${R.healFactor ?? 1}x inside</span><span>${pages > 1 ? `<button data-act="prev"${page ? '' : ' disabled'}>Prev</button> <button data-act="next"${page < pages - 1 ? '' : ' disabled'}>Next</button> ` : ''}<button data-act="out"${mem.length ? '' : ' disabled'}${tip('Everyone inside walks out (Shift+K)')}>Evacuate</button></span></div>`;
  }
  function tip(t) { return ` title="${t.replace(/"/g, '&quot;')}"`; }

  // act on mousedown: the card redraws as units heal, which would swallow a click between press and release
  root.addEventListener('click', ev => ev.stopPropagation());
  root.addEventListener('mousedown', ev => {
    ev.stopPropagation();
    if (ev.button !== 0) return;
    const a = ev.target.closest('[data-act]')?.dataset.act, slot = ev.target.closest('.s[data-id]');
    if (a === 'close') return close();
    if (a === 'prev') page--; else if (a === 'next') page++;
    else if (a === 'out') send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'leave', town: site.town });
    else if (slot) send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'leave', town: site.town, units: [slot.dataset.id] });   // click a unit: it walks out (Tim 2026-11-10)
    sig = ''; render();
  });
  setInterval(render, 250);
  return { open, close, isGarrisonable, isOpen: () => !!site };
}
