// Building pane (war 7c-3b, Tim 2026-11-12): left-click any building on the island, yours or an enemy's, town or
// war camp (away from any unit) and a small pane shows its name, its health, what it is doing (building, training,
// burning, ruined) and a garrison icon with the number of troops inside. Right-click is the action: your own
// buildings open their menu (town_hover.js), enemy ones are attacked. On your own houses, workshops and farmhouses
// the pane also has Garrison selected and Send all out; Ctrl + right-click one with troops selected sends them in.
// Small number badges float over every garrisoned house you can see. Presentation only: it reads the game's
// structures (sim/frontier/structures.js) and sends the frontier 'garrison' command with a structure key.
import { healthBar } from './render/health.js';

const CSS = `
#structcard{position:fixed;right:560px;bottom:175px;width:200px;box-sizing:border-box;padding:7px 9px 9px;z-index:34;background:linear-gradient(180deg,#171c21,#0f1317);border:1px solid #4d3b2a;border-top:2px solid #c9473d;border-radius:8px;box-shadow:0 8px 30px #000a;color:#eadfc6;font:13px/1.35 system-ui,sans-serif}
#structcard[hidden]{display:none}
#structcard .sub{font:600 10px/12px system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#e0786c}
#structcard h1{margin:1px 0 4px;font:500 15px/18px system-ui,sans-serif}
#structcard .bar{height:8px;background:#22262e;border-radius:4px;overflow:hidden;border:1px solid #000}#structcard .bar i{display:block;height:100%}
#structcard .row{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:6px}
#structcard .gar{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:radial-gradient(#3a2a20,#151514);box-shadow:0 0 0 2px #826f4c;font:700 14px system-ui;color:#f6e6bf}
#structcard .dim{color:#9aa3a6;font-size:11px}
#structcard .stat{color:#e9d6a8;font-size:12px;margin:-2px 0 6px}
#structcard button{font:600 12px/14px system-ui,sans-serif;color:#eadfc6;background:#20262d;border:1px solid #61543e;border-radius:5px;padding:4px 10px;cursor:pointer}#structcard button:hover:not(:disabled){border-color:#ffe0a1}#structcard button:disabled{opacity:.4;cursor:default}
#structcard .x{position:absolute;top:5px;right:6px;padding:1px 6px;font-size:10px}
#structcard button{font-size:11px;padding:3px 7px}
.zonegar{position:fixed;transform:translate(-50%,-100%);pointer-events:none;min-width:18px;height:18px;border-radius:9px;padding:0 5px;box-sizing:border-box;display:grid;place-items:center;font:700 11px system-ui;color:#f6e6bf;background:rgba(20,16,12,.9);border:1px solid #d8b56c}
.zonegar.foe{border-color:#e0786c}
#garhint{position:fixed;z-index:60;pointer-events:none;padding:3px 8px;border-radius:5px;background:rgba(12,14,18,.92);border:1px solid #d8b56c;color:#f6e6bf;font:600 11px/14px system-ui,sans-serif;white-space:nowrap}
#garhint[hidden]{display:none}`;
const NAMES = { town_hall: 'Town hall', housing: 'House', work: 'Workshop', farm: 'Farmhouse', wall: 'Wall', gate: 'Gate', camp_hall: 'Camp hall' };
const nice = t => NAMES[t] || (t || 'building').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createStructureCard({ game, view, heroId, frontierData, send, selected = () => [], badgeRoot = null }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  // the pane is a layout panel (Edit layout: Building pane), so index.html holds its element; small, above the action bar
  const root = document.getElementById('structcard') || Object.assign(document.createElement('div'), { id: 'structcard', hidden: true }); if (!root.parentNode) document.body.append(root);
  const owner = () => game.state.entities[heroId]?.owner;
  const onIsland = () => game.state.entities[heroId]?.place === 'world';
  const ST = () => game.frontier?.structures, GA = () => game.frontier?.garrison;
  const Z = () => frontierData?.war?.structures?.zoneGarrison || {};
  let key = null, sig = '';
  const wars = () => Object.values(game.state.frontier?.wars?.list || {});
  // structures you may look at: your own towns, and the town or camp of a war you are in
  function visible() { return ST()?.list?.() || []; }   // Tim 2026-11-12: any building, yours or the enemy's
  const inside = st => Object.values(game.state.entities || {}).filter(e => !e.dead && (e.garrison?.zone ? e.garrison.key === st.key : st.type === 'stockade' && e.garrison?.town === st.town && !e.garrison.hall)).length;
  const zoneOk = st => (Z().types || []).includes(st.type) && (st.kind === 'zone' || st.kind === 'building');
  function at(x, y) {
    if (!onIsland()) return null;
    let best = null, bd = Infinity;
    for (const st of visible()) {
      const u = view.unitToScreen(st.x, st.z, 0), a = view.unitToScreen(st.x + 1, st.z, 0), k = Math.hypot(a.x - u.x, a.y - u.y) || 1;
      const big = st.kind === 'building' ? Math.max(1, (st.r || 5) / 5.5) : 1, dx = Math.abs(x - u.x), dy = y - u.y;
      if (dx <= 5 * k * big && dy >= -7 * k * big && dy <= 3 * k * big && dx + Math.abs(dy) < bd) { best = st; bd = dx + Math.abs(dy); }
    }
    return best;
  }
  // a unit under the pointer wins over the building behind it
  const unitNear = (x, y) => Object.values(game.state.entities || {}).some(e => e.place === 'world' && !e.dead && !e.garrison && !e.hidden && (() => { const u = view.unitToScreen(e.x, e.z, 1); return Math.hypot(u.x - x, u.y - y) < 26; })());
  const troopsSelected = () => selected().filter(id => { const e = game.state.entities[id]; return e && e.owner === owner() && e.type !== 'hero' && !e.worker && !e.garrison; });
  function draw() {
    if (!key) return;
    const st = ST()?.find?.(key);
    if (!st) { close(); return; }
    const hp = Math.ceil(ST().hpOf(st)), n = inside(st), own = st.owner === owner(), canG = own && zoneOk(st), cap = Z().capacity ?? 10;
    const stat = status(st, hp), next = [key, hp, n, troopsSelected().length, stat].join('|'); if (next === sig) return; sig = next;
    const { frac, color } = healthBar(hp, st.max), town = st.town ? game.state.frontier?.settlements?.[st.town] : null;
    const atWar = st.town ? wars().some(w => w.town === st.town) : true;
    const sub = st.war ? (own ? 'Your war camp' : 'Enemy war camp') : own ? (town?.name || 'Your town') : `${town?.name || 'Enemy town'}${atWar ? ', at war' : ''}`;
    const hint = own ? (st.war ? 'Right-click it for its menu.' : st.type === 'stockade' ? 'Right-click it for its garrison card. Ctrl + right-click with crew selected sends them in.' : 'Right-click it for the town panel.') : atWar ? 'Right-click it with troops selected to attack it.' : '';
    root.innerHTML = `<button class="x" data-x="1">Esc</button><div class="sub">${esc(sub)}</div><h1>${esc(nice(st.type))}</h1>
      <div class="bar" title="Health ${hp} of ${st.max}"><i style="width:${Math.round(frac * 100)}%;background:rgb(${color.map(c => Math.round(c * 255)).join(',')})"></i></div>
      <div class="stat">${esc(stat)}</div>
      <div class="row"><span class="dim">Health ${hp} of ${st.max}</span><span title="${esc(zoneOk(st) || st.type === 'stockade' ? 'Troops inside' : 'Nobody can garrison this')}"><span class="gar">${n}</span>${canG ? `<span class="dim"> of ${cap}</span>` : ''}</span></div>
      ${canG ? `<div class="row"><button data-in="1"${troopsSelected().length ? '' : ' disabled'} title="Your selected troops walk over and go in. Melee troops inside cannot fight; ranged troops shoot out. Hits on them go to the building.">Garrison selected</button><button data-out="1"${n ? '' : ' disabled'}>Send all out</button></div>
        <div class="dim" style="margin-top:6px">Ctrl + right-click it with troops selected to send them in.</div>` : ''}${hint ? `<div class="dim" style="margin-top:6px">${esc(hint)}</div>` : ''}`;
    root.hidden = false;
  }
  // what it is doing, in a few words
  function status(st, hp) {
    if (hp <= 0) return 'Ruined';
    const fire = game.state.frontier?.fires?.[st.key];
    const parts = [];
    if (st.war) {
      const b = game.state.frontier?.wars?.list?.[st.war]?.camp?.buildings?.find(x => x.id === st.id), q = b?.queue?.[0];
      if (b?.stage === 'site') parts.push(`Being built, ${Math.round(100 * (b.progress || 0) / Math.max(1, b.need || 1))}%`);
      else if (b?.upgrade) parts.push('Upgrading');
      else if (q && st.owner === owner()) parts.push(`Training ${nice(q.unit).toLowerCase()}, ${Math.ceil(q.left / 20)} s${b.queue.length > 1 ? `, ${b.queue.length - 1} more queued` : ''}`);
    }
    if (fire) parts.unshift('Burning');
    else if (hp < st.max) parts.push('Damaged');
    return parts.join('. ') || 'Standing';
  }
  function open(st) { key = st.key; sig = ''; draw(); }
  function close() { key = null; root.hidden = true; }
  root.addEventListener('mousedown', e => e.stopPropagation());
  root.addEventListener('click', e => {
    const b = e.target.closest?.('[data-x],[data-in],[data-out]'); if (!b) return;
    const st = key && ST()?.find?.(key);
    if (b.dataset.x) return close();
    if (!st) return;
    if (b.dataset.in) send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'enter', structure: st.key, walk: true, units: troopsSelected() });
    if (b.dataset.out) send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'leave', structure: st.key });
    sig = '';
  });
  addEventListener('keydown', e => { if (key && e.code === 'Escape') { close(); } });
  // left-click (no drag) on a building with no unit there: its card
  let down = null;
  // capture phase: other click handlers (crew selection, town tools) must not keep it from seeing the click
  addEventListener('mousedown', e => { if (e.button === 0) down = { x: e.clientX, y: e.clientY }; }, { capture: true });
  addEventListener('mouseup', e => {
    if (e.button !== 0 || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    if (e.target?.closest?.('button, #structcard, #townpanel, #townsoverview, #bar, #selpanel, #controls, #garrisoncard, #warcamp, #crewcommands')) return;
    if (unitNear(e.clientX, e.clientY)) { close(); return; }
    const st = at(e.clientX, e.clientY);
    if (st) open(st); else close();   // a click on open ground or a unit puts it away; another building swaps to it
  }, { capture: true });
  // Ctrl + right-click your own house, workshop or farmhouse with troops selected: they go in (capture: before move orders)
  addEventListener('mousedown', e => {
    if (e.button !== 2 || !e.ctrlKey || e.target?.closest?.('button, #structcard, #townpanel, #bar, #selpanel, #warcamp')) return;
    const ids = troopsSelected(); if (!ids.length) return;
    const st = at(e.clientX, e.clientY);
    if (!st || st.owner !== owner() || !zoneOk(st)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'enter', structure: st.key, walk: true, units: ids });
  }, { capture: true });
  // a nudge (Tim 2026-11-12): with troops selected, pointing at your own house, workshop or farmhouse shows how to garrison
  const nudge = Object.assign(document.createElement('div'), { id: 'garhint', hidden: true, textContent: 'Ctrl + right-click to garrison' }); document.body.append(nudge);
  let nudgeAt = 0;
  addEventListener('mousemove', e => {
    const now = performance.now(); if (now - nudgeAt < 80) return; nudgeAt = now;
    const st = !e.target?.closest?.('button, #structcard, #townpanel, #bar, #selpanel, #warcamp') && troopsSelected().length ? at(e.clientX, e.clientY) : null;
    const show = !!st && st.owner === owner() && zoneOk(st) && ST().hpOf(st) > 0;
    nudge.hidden = !show;
    if (show) { nudge.style.left = `${e.clientX + 16}px`; nudge.style.top = `${e.clientY + 18}px`; }
  });
  // number badges over garrisoned houses you can see
  const badges = new Map();
  setInterval(() => {
    draw();
    if (!badgeRoot) return;
    const want = new Set(), me = owner(), counts = new Map();
    if (onIsland()) for (const e of Object.values(game.state.entities || {})) if (e.garrison?.zone && !e.dead) counts.set(e.garrison.key, (counts.get(e.garrison.key) || 0) + 1);
    for (const [k, n] of counts) {
      const st = ST()?.find?.(k); if (!st) continue;
      const u = view.unitToScreen(st.x, st.z, 5); if (u.x < -40 || u.y < -40 || u.x > innerWidth + 40 || u.y > innerHeight + 40) continue;
      want.add(k);
      let el = badges.get(k); if (!el) { el = document.createElement('div'); badgeRoot.append(el); badges.set(k, el); }
      el.className = `zonegar${st.owner === me ? '' : ' foe'}`; el.textContent = String(n); el.title = `${n} troops inside`;
      el.style.left = `${u.x}px`; el.style.top = `${u.y}px`;
    }
    for (const [k, el] of badges) if (!want.has(k)) { el.remove(); badges.delete(k); }
  }, 150);
  return { open, close, isOpen: () => !!key };
}
