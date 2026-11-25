// Building pane (war 7c-3b, Tim 2026-11-12): left-click any building on the island, yours or an enemy's, town or
// war camp (away from any unit) and a small pane shows its name, its health, what it is doing (building, training,
// burning, ruined) and a garrison icon with the number of troops inside. A building with a menu (town_hover.js menuAt)
// opens it with this pane beside it (Tim 2026-11-20; no hover pane). Right-click is an order. On your own houses, workshops and farmhouses
// the pane also has Garrison selected and Send all out; Ctrl + right-click one with troops selected sends them in.
// Small number badges float over every garrisoned house you can see. Presentation only: it reads the game's
// structures (sim/frontier/structures.js) and sends the frontier 'garrison' command with a structure key.
import { healthBar } from './render/health.js';
import { cellToWorld } from './sim/frontier/town_grid.js';
import { openMenu, placeBeside, unplace } from './card_beside.js';
import { structureDmgKind } from './damage_tip.js';

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
#garhint[hidden]{display:none}
#structcard .bar.build i{background:#d8b56c}`;
const NAMES = { town_hall: 'Town hall', housing: 'House', work: 'Workshop', farm: 'Farmhouse', wall: 'Wall', gate: 'Gate', camp_hall: 'Camp hall' };
const nice = t => NAMES[t] || (t || 'building').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createStructureCard({ game, view, heroId, frontierData, send, selected = () => [], badgeRoot = null, menuAt = () => false }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  // the pane is a layout panel (Edit layout: Building pane), so index.html holds its element; small, above the action bar
  const root = document.getElementById('structcard') || Object.assign(document.createElement('div'), { id: 'structcard', hidden: true }); if (!root.parentNode) document.body.append(root);
  const owner = () => game.state.entities[heroId]?.owner;
  const onIsland = () => game.state.entities[heroId]?.place === 'world';
  const ST = () => game.frontier?.structures, GA = () => game.frontier?.garrison;
  const Z = () => frontierData?.war?.structures?.zoneGarrison || {};
  let key = null, sig = '', pinned = false, withMenu = false;   // pinned: opened by a click (stays); withMenu: beside the building's menu (Tim 2026-11-20)
  const wars = () => Object.values(game.state.frontier?.wars?.list || {});
  // structures you may look at: your own towns, and the town or camp of a war you are in
  function visible() { return ST()?.list?.() || []; }   // Tim 2026-11-12: any building, yours or the enemy's
  const inside = st => Object.values(game.state.entities || {}).filter(e => !e.dead && !!e.garrison && !e.garrison.hall && (e.garrison.key === st.key || (st.b && !e.garrison.zone && e.garrison.town === st.town && e.garrison.building === st.b.id))).length;
  // troops go in from this card: houses, workshops and farmhouses, and a war camp's stockade (a town stockade has its own garrison card)
  const campFort = st => !!st.war && st.kind === 'building' && st.type === 'stockade' && !!frontierData?.buildings?.stockade?.garrison;
  const zoneOk = st => ((Z().types || []).includes(st.type) && (st.kind === 'zone' || st.kind === 'building')) || campFort(st);
  const capOf = st => st.type === 'stockade' ? frontierData?.buildings?.stockade?.garrison?.capacity ?? 0 : Z().byType?.[st.type]?.capacity ?? Z().capacity ?? 10;
  function at(x, y) {
    if (!onIsland()) return null;
    let best = null, bd = Infinity;
    for (const st of [...visible(), ...sites()]) {
      const u = view.unitToScreen(st.x, st.z, 0), a = view.unitToScreen(st.x + 1, st.z, 0), k = Math.hypot(a.x - u.x, a.y - u.y) || 1;
      const big = st.kind === 'building' ? Math.max(1, (st.r || 5) / 5.5) : 1, dx = Math.abs(x - u.x), dy = y - u.y;
      if (dx <= 5 * k * big && dy >= -7 * k * big && dy <= 3 * k * big && dx + Math.abs(dy) < bd) { best = st; bd = dx + Math.abs(dy); }
    }
    return best;
  }
  // a unit under the pointer wins over the building behind it
  const unitNear = (x, y) => Object.values(game.state.entities || {}).some(e => e.place === 'world' && !e.dead && !e.garrison && !e.hidden && (() => { const u = view.unitToScreen(e.x, e.z, 1); return Math.hypot(u.x - x, u.y - y) < 26; })());
  // the selected troops and crew, and the hero when he is selected (Tim 2026-11-19: he may garrison too); nothing selected: the hero
  const troopsSelected = () => { const sel = selected(); return (sel.length ? sel : [heroId]).filter(id => { const e = game.state.entities[id]; return e && e.owner === owner() && !e.worker && !e.garrison; }); };
  // Tim 2026-11-13: a building being built gets the pane too (it is not a structure until it stands): its builders,
  // how much faster they make it and a build bar. Camp sites and camp hall upgrades gain one point of work per builder
  // at the site each tick (sim/frontier/workers.js campBuild); a town's project gains the town's builders each
  // economy tick, one project at a time (sim/frontier/construction.js).
  const WD = () => frontierData?.war || {};
  function sites() {
    const out = [];
    for (const w of wars()) for (const b of w.camp?.buildings || []) if (b.stage === 'site' && Number.isFinite(b.x))
      out.push({ key: `site|c|${w.id}|${b.id}`, site: true, kind: 'building', war: w.id, owner: w.attacker, type: b.type, job: b, workers: Array.isArray(w.camp.workers) ? w.camp.workers : [], id: b.id, x: b.x, z: b.z, r: WD().buildings?.[b.type]?.radius ?? 8 });
    for (const s of Object.values(game.state.frontier?.settlements || {})) {
      if (!s.grid) continue;
      for (const p of s.projects || []) {
        const cs = p.cells?.length ? p.cells : Number.isInteger(p.cell) ? [p.cell] : [];
        if (!p.authorized || !cs.length) continue;
        const pts = cs.map(i => cellToWorld(s, i)), x = pts.reduce((a, q) => a + q[0], 0) / pts.length, z = pts.reduce((a, q) => a + q[1], 0) / pts.length;
        out.push({ key: `site|t|${s.id}|${p.id}`, site: true, kind: 'building', town: s.id, owner: s.owner, type: p.type, job: p, s, x, z, r: Math.sqrt(cs.length) * s.grid.cell / 2 });
      }
    }
    return out;
  }
  const findAny = k => typeof k === 'string' && k.startsWith('site|') ? sites().find(x => x.key === k) || null : ST()?.find?.(k);
  // the build lines for a site or an upgrade: { pct, text, tip }
  function buildInfo(st) {
    const own = st.owner === owner(), j = st.job, pct = Math.round(100 * (j.progress || 0) / Math.max(1, j.need || 1));
    if (st.town) {
      const s = st.s, auth = s.projects.filter(x => x.authorized), first = auth.find(x => x.paid) || auth.find(x => Object.entries(x.cost || {}).every(([r, k]) => (s.stock?.[r] ?? 0) + 1e-9 >= k)) || auth[0], n = first === j && j.paid ? s.builders || 0 : 0;
      const wait = !j.paid ? 'Waiting for its materials' : first !== j ? 'Waiting for the project ahead' : j.phase === 'clearing' ? 'Workers clearing the ground' : null;
      if (!own) return { pct, text: `${pct}% built`, tip: '' };
      return { pct, text: wait || (n ? `${n} of ${frontierData?.rates?.maxBuilders ?? 3} builders, ${n === 1 ? 'one builder pace' : `${n} times as fast as one`}` : 'No builders free'),
        tip: 'A town builds one project at a time. Each builder adds the same amount of work, so 3 builders finish it 3 times as fast as one.' };
    }
    const ws = (st.workers || []).filter(w => w.project === (st.id ?? st.b?.id)), at = ws.filter(w => !w.trip).length;
    const left = Math.max(0, (j.need || 0) - (j.progress || 0)), secs = at ? Math.ceil(left / at / 20) : null;
    if (!own) return { pct, text: `${pct}% built`, tip: '' };
    return { pct, text: ws.length ? `${ws.length} builder${ws.length === 1 ? '' : 's'}${ws.length > 1 ? `, ${ws.length} times as fast as one` : ''}${secs != null ? `, about ${secs} s left` : ', walking over'}` : 'No builders. Send camp workers to it.',
      tip: 'Each camp worker at the site adds the same work, so 3 builders finish it 3 times as fast as one. Select workers and right-click the site to send them.' };
  }
  function drawSite(st) {
    const own = st.owner === owner(), info = buildInfo(st), town = st.town ? game.state.frontier?.settlements?.[st.town] : null;
    const next = [st.key, info.pct, info.text].join('|'); if (next === sig) return; sig = next;
    const sub = st.war ? (own ? 'Your war camp' : 'Enemy war camp') : own ? (town?.name || 'Your town') : (town?.name || 'Enemy town');
    root.innerHTML = `<button class="x" data-x="1">Esc</button><div class="sub">${esc(sub)}</div><h1>${esc(nice(st.type))}</h1>
      <div class="stat">Under construction</div>
      <div class="bar build" title="${info.pct}% built"><i style="width:${info.pct}%"></i></div>
      <div class="row"><span class="dim">${info.pct}% built</span></div>
      <div class="dim" style="margin-top:4px"${info.tip ? ` title="${esc(info.tip)}"` : ''}>${esc(info.text)}</div>`;
    root.hidden = false;
  }
  function draw() {
    if (!key) return;
    const st = findAny(key);
    if (!st) { close(); return; }
    if (st.site) return drawSite(st);
    const hp = Math.ceil(ST().hpOf(st)), n = inside(st), own = st.owner === owner(), canG = own && zoneOk(st), cap = capOf(st);
    const up = st.war && st.b?.upgrade ? buildInfo({ ...st, job: st.b.upgrade, id: st.b.id, workers: (wars().find(w => w.id === st.war)?.camp?.workers) || [] }) : null;   // the camp hall upgrade
    const town = st.town ? game.state.frontier?.settlements?.[st.town] : null, stores = !own && st.type === 'town_hall' && town ? rivalStores(town) : '';
    const stat = status(st, hp), next = [key, hp, n, troopsSelected().length, stat, up?.pct, up?.text, stores].join('|'); if (next === sig) return; sig = next;
    const { frac, color } = healthBar(hp, st.max);
    const atWar = st.town ? wars().some(w => w.town === st.town) : true;
    const sub = st.war ? (own ? 'Your war camp' : 'Enemy war camp') : own ? (town?.name || 'Your town') : `${town?.name || 'Enemy town'}${atWar ? ', at war' : ''}`;
    const supply = st.type === 'rail_section' ? `Camp supply line, section ${st.b?.n || 1} of ${st.b?.of || 1}.` : st.type === 'camp_station' ? 'Camp station.' : '';   // 8e-6
    const hint = supply ? `${supply} ${own ? 'Defend it: if the camp station or any red rail section goes down, the camp is cut off until all are rebuilt (camp station menu).' : 'Destroy the camp station or any red rail section to cut the camp off from the rail network.'}` : own ? (st.type === 'stockade' ? 'Ctrl + right-click it with crew or troops selected to send them in. In a war, ranged units inside shoot out.' : '') : atWar ? 'Right-click it with troops selected to attack it.' : '';
    root.innerHTML = `<button class="x" data-x="1">Esc</button><div class="sub">${esc(sub)}</div><h1>${esc(st.type === 'rail_section' ? `Rail section ${st.b?.n || 1} of ${st.b?.of || 1}` : nice(st.type))}</h1>
      <div class="bar" data-dmg="${structureDmgKind(frontierData, st)}"><i style="width:${Math.round(frac * 100)}%;background:rgb(${color.map(c => Math.round(c * 255)).join(',')})"></i></div>
      <div class="stat">${esc(stat)}</div>
      ${stores ? `<div class="dim" style="margin:-2px 0 6px">${esc(stores)}</div>` : ''}
      ${up ? `<div class="bar build" title="${up.pct}% upgraded"><i style="width:${up.pct}%"></i></div><div class="dim" style="margin:4px 0 2px"${up.tip ? ` title="${esc(up.tip)}"` : ''}>${esc(up.text)}</div>` : ''}
      <div class="row"><span class="dim">Health ${hp} of ${st.max}</span><span title="${esc(zoneOk(st) || st.type === 'stockade' ? 'Troops inside' : 'Nobody can garrison this')}"><span class="gar">${n}</span>${canG ? `<span class="dim"> of ${cap}</span>` : ''}</span></div>
      ${canG ? `<div class="row"><button data-in="1"${troopsSelected().length ? '' : ' disabled'} title="Your selected troops walk over and go in. Melee troops inside cannot fight; ranged troops shoot out. Hits on them go to the building.${st.type === 'stockade' ? ' Troops inside a stockade recover faster.' : st.type === 'watchtower' ? ' Ranged troops in a watchtower reach further.' : ''}">Garrison selected</button><button data-out="1"${n ? '' : ' disabled'}>Send all out</button></div>
        <div class="dim" style="margin-top:6px">Ctrl + right-click it with troops selected to send them in.</div>` : ''}${hint ? `<div class="dim" style="margin-top:6px">${esc(hint)}</div>` : ''}`;
    root.hidden = false;
  }
  // a rival town hall's people and stores, once you have been close (were in the hover tooltip, town_props.js rivalPlotInfo)
  function rivalStores(t) {
    const f = v => Math.floor(v || 0);
    if (!t.scouted || !t.stock) return 'Come closer to see its stores and people';
    return `${f(t.pop)} people, ${f(t.workerCount)} workers. Food ${f(t.stock.food)}, Timber ${f(t.stock.timber)}, Stone ${f(t.stock.stone)}, Goods ${f(t.stock.goods)}, Ryo ${f(t.stock.ryo)}`;
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
  function open(st, pin = true, menu = false) { if (key !== st.key || pin) sig = ''; key = st.key; pinned = pin || (pinned && key === st.key); withMenu = menu; if (!menu) unplace(root); draw(); beside(); }
  function close() { key = null; pinned = false; withMenu = false; root.hidden = true; unplace(root); }
  // beside its menu: follows the menu, goes when the menu closes
  function beside() { if (!key || !withMenu) return; const m = openMenu(); if (!m) close(); else placeBeside(root, m); }
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
  // left-click (no drag) on a building with no unit there (Tim 2026-11-19): your building's menu (town_hover.js menuAt);
  // houses, workshops, farmhouses and enemy buildings have no menu: this pane, pinned (it has the garrison buttons)
  let down = null;
  // capture phase: other click handlers (crew selection, town tools) must not keep it from seeing the click
  addEventListener('mousedown', e => { if (e.button === 0) down = { x: e.clientX, y: e.clientY }; }, { capture: true });
  addEventListener('mouseup', e => {
    if (e.button !== 0 || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    if (e.target?.closest?.('button, #structcard, #townpanel, #townsoverview, #bar, #selpanel, #controls, #garrisoncard, #warcamp, #townwar, #crewcommands')) return;
    if (unitNear(e.clientX, e.clientY)) return;   // a unit: the crew's click (selection); the pane stays as it is
    // a menu opened: the Building pane beside it (Tim 2026-11-20); your own town's buildings get their town card instead (frontier_build_ui.js)
    if (menuAt(e.clientX, e.clientY)) { const m = at(e.clientX, e.clientY); if (m && !(m.town && m.owner === owner())) open(m, true, true); else close(); return; }
    const st = at(e.clientX, e.clientY);
    if (st) open(st); else if (pinned && !withMenu) close();   // beside a menu it stays until the menu closes   // a click on open ground puts a pinned pane away; another building swaps to it
  }, { capture: true });
  // no pane on hover any more (Tim 2026-11-20, was 2026-11-19: it got in the way of moving units): a left-click shows it
  // Ctrl + right-click your own house, workshop or farmhouse with troops selected: they go in (capture: before move orders)
  addEventListener('mousedown', e => {
    if (e.button !== 2 || !e.ctrlKey || e.target?.closest?.('button, #structcard, #townpanel, #bar, #selpanel, #warcamp, #townwar')) return;
    const ids = troopsSelected(); if (!ids.length) return;
    const st = at(e.clientX, e.clientY);
    if (!st || st.site || st.owner !== owner() || !zoneOk(st)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'enter', structure: st.key, walk: true, units: ids });
  }, { capture: true });
  // a nudge (Tim 2026-11-12): with troops selected, pointing at your own house, workshop or farmhouse shows how to garrison
  const nudge = Object.assign(document.createElement('div'), { id: 'garhint', hidden: true, textContent: 'Ctrl + right-click to garrison' }); document.body.append(nudge);
  let nudgeAt = 0;
  addEventListener('mousemove', e => {
    const now = performance.now(); if (now - nudgeAt < 80) return; nudgeAt = now;
    const st = !e.target?.closest?.('button, #structcard, #townpanel, #bar, #selpanel, #warcamp, #townwar') && troopsSelected().length ? at(e.clientX, e.clientY) : null;
    const show = !!st && !st.site && st.owner === owner() && zoneOk(st) && ST().hpOf(st) > 0;
    nudge.hidden = !show;
    if (show) { nudge.style.left = `${e.clientX + 16}px`; nudge.style.top = `${e.clientY + 18}px`; }
  });
  // number badges over garrisoned houses you can see
  const badges = new Map();
  setInterval(() => {
    draw(); beside();
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
