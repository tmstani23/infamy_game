// Town building card (war 7c-3b, Tim 2026-11-12): every building of your towns, and of a town in a war you are in,
// can be clicked. Left-click it (away from any unit) and a small card shows its name, its health and a garrison
// icon with the number of troops inside. On your own houses, workshops and farmhouses it also has Garrison selected
// and Send all out. Right-click one of those with troops selected: they walk over and go in (up to the cap).
// Small number badges float over every garrisoned house you can see. Presentation only: it reads the game's
// structures (sim/frontier/structures.js) and sends the frontier 'garrison' command with a structure key.
import { healthBar } from './render/health.js';

const CSS = `
#structcard{position:fixed;left:380px;top:110px;width:250px;box-sizing:border-box;padding:10px 12px 12px;z-index:34;background:linear-gradient(180deg,#171c21,#0f1317);border:1px solid #4d3b2a;border-top:2px solid #c9473d;border-radius:8px;box-shadow:0 8px 30px #000a;color:#eadfc6;font:13px/1.35 system-ui,sans-serif}
#structcard[hidden]{display:none}
#structcard .sub{font:600 10px/12px system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#e0786c}
#structcard h1{margin:2px 0 6px;font:500 19px/22px system-ui,sans-serif}
#structcard .bar{height:8px;background:#22262e;border-radius:4px;overflow:hidden;border:1px solid #000}#structcard .bar i{display:block;height:100%}
#structcard .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}
#structcard .gar{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:radial-gradient(#3a2a20,#151514);box-shadow:0 0 0 2px #826f4c;font:700 14px system-ui;color:#f6e6bf}
#structcard .dim{color:#9aa3a6;font-size:11px}
#structcard button{font:600 12px/14px system-ui,sans-serif;color:#eadfc6;background:#20262d;border:1px solid #61543e;border-radius:5px;padding:4px 10px;cursor:pointer}#structcard button:hover:not(:disabled){border-color:#ffe0a1}#structcard button:disabled{opacity:.4;cursor:default}
#structcard .x{position:absolute;top:8px;right:10px;padding:2px 7px}
.zonegar{position:fixed;transform:translate(-50%,-100%);pointer-events:none;min-width:18px;height:18px;border-radius:9px;padding:0 5px;box-sizing:border-box;display:grid;place-items:center;font:700 11px system-ui;color:#f6e6bf;background:rgba(20,16,12,.9);border:1px solid #d8b56c}
.zonegar.foe{border-color:#e0786c}`;
const NAMES = { town_hall: 'Town hall', housing: 'House', work: 'Workshop', farm: 'Farmhouse', wall: 'Wall', gate: 'Gate', camp_hall: 'Camp hall' };
const nice = t => NAMES[t] || (t || 'building').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createStructureCard({ game, view, heroId, frontierData, send, selected = () => [], badgeRoot = null }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const root = document.createElement('div'); root.id = 'structcard'; root.hidden = true; document.body.append(root);
  const owner = () => game.state.entities[heroId]?.owner;
  const onIsland = () => game.state.entities[heroId]?.place === 'world';
  const ST = () => game.frontier?.structures, GA = () => game.frontier?.garrison;
  const Z = () => frontierData?.war?.structures?.zoneGarrison || {};
  let key = null, sig = '';
  const wars = () => Object.values(game.state.frontier?.wars?.list || {});
  // structures you may look at: your own towns, and the town or camp of a war you are in
  function visible() {
    const me = owner(), mine = wars().filter(w => w.attacker === me || w.defender === me);
    return (ST()?.list?.() || []).filter(st => st.town ? st.owner === me || mine.some(w => w.town === st.town) : mine.some(w => w.id === st.war));
  }
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
    const next = [key, hp, n, troopsSelected().length].join('|'); if (next === sig) return; sig = next;
    const { frac, color } = healthBar(hp, st.max), town = st.town ? game.state.frontier?.settlements?.[st.town] : null;
    root.innerHTML = `<button class="x" data-x="1">Esc</button><div class="sub">${esc(own ? 'Your town' : st.war ? 'Enemy war camp' : `${town?.name || 'Enemy town'}, at war`)}</div><h1>${esc(nice(st.type))}</h1>
      <div class="bar" title="Health ${hp} of ${st.max}"><i style="width:${Math.round(frac * 100)}%;background:rgb(${color.map(c => Math.round(c * 255)).join(',')})"></i></div>
      <div class="row"><span class="dim">Health ${hp} of ${st.max}</span><span title="${esc(zoneOk(st) || st.type === 'stockade' ? 'Troops inside' : 'Nobody can garrison this')}"><span class="gar">${n}</span>${canG ? `<span class="dim"> of ${cap}</span>` : ''}</span></div>
      ${canG ? `<div class="row"><button data-in="1"${troopsSelected().length ? '' : ' disabled'} title="Your selected troops walk over and go in. Melee troops inside cannot fight; ranged troops shoot out. Hits on them go to the building.">Garrison selected</button><button data-out="1"${n ? '' : ' disabled'}>Send all out</button></div>
        <div class="dim" style="margin-top:6px">Right-click it with troops selected to send them in.</div>` : ''}`;
    root.hidden = false;
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
  addEventListener('mousedown', e => { if (e.button === 0) down = { x: e.clientX, y: e.clientY }; });
  addEventListener('mouseup', e => {
    if (e.button !== 0 || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    if (e.target?.closest?.('button, #structcard, #townpanel, #townsoverview, #bar, #selpanel, #controls, #garrisoncard, #warcamp, #crewcommands')) return;
    if (unitNear(e.clientX, e.clientY)) return;
    const st = at(e.clientX, e.clientY);
    if (st && !(st.war && st.owner === owner()) && !(st.type === 'stockade' && st.owner === owner())) open(st);   // your own camp's buildings open the camp menu, your stockade its garrison card
  });
  // right-click your own house, workshop or farmhouse with troops selected: they go in (capture: before move orders)
  addEventListener('mousedown', e => {
    if (e.button !== 2 || e.ctrlKey || e.target?.closest?.('button, #structcard, #townpanel, #bar, #selpanel, #warcamp')) return;
    const ids = troopsSelected(); if (!ids.length) return;
    const st = at(e.clientX, e.clientY);
    if (!st || st.owner !== owner() || !zoneOk(st)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'enter', structure: st.key, walk: true, units: ids });
  }, { capture: true });
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
