// Hover tooltip and right-click on a founded town's buildings (frontier E5, Tim 2026-11-04). Reads the
// frontier snapshot only; right-click opens the town panel for that town and flashes the plot.
import { drawableTowns, drawableWarSites, townPlots, garrisonCount } from './town_props.js';
import { pointAt } from './sim/frontier/rail_route.js';

// the worker icon on the small hall pill (Tim 2026-11-22)
// Tim 2026-11-25: the camp hall shelter button is a small noren curtain hanging from a wooden bar, not a wide text pill:
// the count of workers inside painted on it (a door mark when nobody is in); it glows red while some hide from an attack;
// the words are in its hover
const shelterIcon = (n, attack) => `<svg viewBox="0 0 36 42" aria-hidden="true"><defs><linearGradient id="shcloth${attack ? 'a' : ''}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${attack ? '#a3342a' : '#2c3550'}"/><stop offset="1" stop-color="${attack ? '#5a140e' : '#151a2a'}"/></linearGradient></defs>`
  + `<rect x="1" y="2" width="34" height="5" rx="1" fill="#7a5530" stroke="#0a0604" stroke-width="1.2"/><circle cx="4" cy="4.5" r="1.1" fill="#e2b96e"/><circle cx="32" cy="4.5" r="1.1" fill="#e2b96e"/>`
  + `<path d="M3 7h30v26l-5 3-5-3-5 3-5-3-5 3-5-3Z" fill="url(#shcloth${attack ? 'a' : ''})" stroke="#0a0604" stroke-width="1.2"/><path d="M13 9v24M23 9v24" stroke="#0a0604" stroke-width="1.4" opacity=".7"/>`
  + `<path d="M3 9h30" stroke="${attack ? '#ff9d7d' : '#c9a04e'}" stroke-width="1" opacity=".55"/>`
  + (n ? `<text x="18" y="27" text-anchor="middle" font-family="Lantern, Georgia, serif" font-weight="800" font-size="${n > 9 ? 15 : 17}" fill="#f6e6bf" stroke="#0a0604" stroke-width="2.4" paint-order="stroke">${n}</text>`
    : `<rect x="12.5" y="14" width="11" height="17" fill="#ffcf7a" stroke="#0a0604" stroke-width="1.2"/><rect x="14.5" y="16" width="7" height="15" fill="#f6a24a"/><path d="M11 14h14" stroke="#7a5530" stroke-width="2"/>`) + `</svg>`;
const HALL_PILL_ICON = '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><circle cx="7" cy="4" r="2.7" fill="#f2e6c9"/><path d="M1.6 13.5c.4-3.6 2.5-5.4 5.4-5.4s5 1.8 5.4 5.4Z" fill="#f2e6c9"/></svg>';

export function createTownHover({ game, view, heroId, tipEl, flashEl, openTown, frontierData, send = () => {}, selected = () => [], badgeEl = null, openGarrison = null, openCamp = null, openTownWar = null }) {
  let plots = [], sig = '', mouse = { x: -1, y: -1 };
  const owner = () => game.state.entities[heroId]?.owner;
  const onIsland = () => game.state.entities[heroId]?.place === 'world';
  function refresh() {
    // own towns plus rival towns you have seen (their hover shows stores once you walk up; F6 war)
    const towns = drawableTowns(game.state.frontier, owner()).concat(drawableWarSites(game.state.frontier, owner()).filter(s => s.camp || s.grid && game.state.frontier?.settlements?.[s.id]));   // war camps too (checkpoint 4)
    const key = towns.map(s => `${s.id}${s.buildings.length}${s.projects.length}`).join();
    if (key !== sig) { sig = key; plots = townPlots(towns); }
  }
  // the plot under the pointer: near its footprint on screen, taller towards the top (the art stands up)
  function plotAt(x, y) {
    if (!onIsland()) return null;
    refresh();
    let best = null, bestD = Infinity;
    for (const p of plots) {
      const u = view.unitToScreen(p.x, p.z, 0), a = view.unitToScreen(p.x + 1, p.z, 0), k = Math.hypot(a.x - u.x, a.y - u.y) || 1;
      const dx = Math.abs(x - u.x), dy = y - u.y;
      // a stockade is 4 cells of tall art: a wider, taller hit area than a one-cell building (Tim 2026-11-07)
      const wide = p.type === 'stockade' ? 11 : 5, up = p.type === 'stockade' ? 12 : 7, down = p.type === 'stockade' ? 6 : 3;
      if (dx <= wide * k && dy >= -up * k && dy <= down * k && dx + Math.abs(dy) < bestD) { best = p; bestD = dx + Math.abs(dy); }
    }
    return best;
  }
  // a steam train under the pointer (Tim 2026-11-07: hover says it's a train, with some stats): engine to last car
  // its cars after the engine and tender (train.consist, Tim 2026-11-07) and their lengths (render/rail_track.js CAR_ART)
  const CAR_LEN = { engine: 6.4, tender: 4.3, carriage: 6.3, goods: 4.2, guard: 5.4 };
  const consistOf = t => Array.isArray(t.consist) && t.consist.length ? t.consist : null;
  const trainLength = (t, T) => { const c = consistOf(t); return c ? ['engine', 'tender', ...c].reduce((a, k) => a + (CAR_LEN[k] ?? 5) + 0.35, 0) - 3.2 : 4.4 + (t.cars ?? 3) * (T.gap ?? 7); };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function carsLine(t) {
    const c = consistOf(t); if (!c) return `Engine, tender, ${(t.cars ?? 3) - 1} carriages and a goods wagon`;
    const n = k => c.filter(x => x === k).length, parts = [n('carriage') && plural(n('carriage'), 'carriage', 'carriages'), n('goods') && plural(n('goods'), 'goods wagon', 'goods wagons'), n('guard') && plural(n('guard'), 'brake van', 'brake vans')].filter(Boolean);
    return `Engine, tender, ${parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0] || 'no cars'}`;
  }
  function trainAt(x, y) {
    if (!onIsland()) return null;
    const R = game.state.frontier?.rail, T = frontierData?.railways?.train || {};
    if (!R?.trains) return null;
    let best = null, bestD = Infinity;
    for (const t of Object.values(R.trains)) {
      const l = R.links?.[t.link]; if (!l?.points) continue;
      const len = trainLength(t, T);
      for (let o = 0; o <= len; o += 2.5) {
        const p = pointAt(l, Math.max(0, Math.min(l.length, t.d - t.dir * o))), u = view.unitToScreen(p.x, p.z, 1.2), a = view.unitToScreen(p.x + 1, p.z, 1.2);
        const k = Math.hypot(a.x - u.x, a.y - u.y) || 1, d = Math.hypot(x - u.x, (y - u.y) * 1.3);
        if (d <= 2.6 * k && d < bestD) { best = t; bestD = d; }
      }
    }
    return best;
  }
  function trainInfo(t) {
    const st = game.state, R = st.frontier.rail, l = R.links[t.link], T = frontierData?.railways || {};
    const name = id => id === 'capital' ? 'the capital' : st.frontier.settlements?.[id]?.name || id;
    const to = t.dir > 0 ? l.to : l.from, from = t.dir > 0 ? l.from : l.to, mine = t.owner === owner();
    const seats = Math.max(1, consistOf(t) ? consistOf(t).filter(k => k === 'carriage').length : (t.cars ?? 3) - 1) * (T.ride?.seatsPerCar ?? 8);
    const riders = Object.values(st.entities).filter(u => u.aboard === `rail:${t.id}`).length;
    const speed = t.v ?? t.speed ?? 36, left = t.dir > 0 ? l.length - t.d : t.d;
    const atEnd = t.wait > 0 && (t.d <= 0.01 || t.d >= l.length - 0.01);
    const lines = [
      atEnd ? `Standing at ${name(t.d <= 0.01 ? l.from : l.to)}, leaves in ${Math.ceil(t.wait / 20)} s` : `${name(from)} to ${name(to)}: arrives in ${Math.ceil(left / Math.max(1, speed))} s`,
      `Line ${name(l.from)} – ${name(l.to)}, ${Math.round(l.length)} long`,
      carsLine(t),
      `${riders} / ${seats} aboard · speed ${Math.round(speed)} (you run at 6)`,
    ];
    if (mine) lines.push('Board at your station: Space');
    return { title: mine ? 'Steam train (yours)' : `Steam train · ${st.clans?.[t.owner]?.name || t.owner}`, lines };
  }
  // the governor's salute cannons by your halls (Tim 2026-11-07): hover for a card (with the cooldown), click to fire
  const CANNON_NAMES = { cannon_field: 'Brass field gun', cannon_wooden: 'Wooden gun' };
  function cannonAt(x, y) {
    if (!onIsland()) return null;
    let best = null, bestD = Infinity;
    for (const s of drawableTowns(game.state.frontier, owner())) for (const id of s.cannons || []) {
      const e = game.state.entities[id]; if (!e || e.dead) continue;
      const u = view.unitToScreen(e.x, e.z, 0), a = view.unitToScreen(e.x + 1, e.z, 0), k = Math.hypot(a.x - u.x, a.y - u.y) || 1;
      const dx = Math.abs(x - u.x), dy = y - u.y;
      if (dx <= 2.3 * k && dy >= -3.2 * k && dy <= 1.2 * k && dx + Math.abs(dy) < bestD) { best = { e, town: s }; bestD = dx + Math.abs(dy); }
    }
    return best;
  }
  function cannonInfo({ e, town }) {
    const left = Math.max(0, Math.ceil(((town.saluteReadyAt ?? 0) - game.state.tick) / 20));
    const status = town.salute ? 'Firing the salute' : left ? `Guns being cleaned: ready in ${left} s` : 'Ready: click to fire a salute';
    return { title: `${CANNON_NAMES[e.model] || 'Cannon'} · ${town.name || 'your town'}`, lines: ['Ceremonial guns: they never shoot at anyone', status] };
  }
  const hl = document.createElement('div');   // a soft gold ring under the hovered cannon
  Object.assign(hl.style, { position: 'fixed', zIndex: 28, width: '96px', height: '44px', margin: '-22px 0 0 -48px', border: '2px solid #f2c75c', borderRadius: '50%', boxShadow: '0 0 14px #f2c75c88', pointerEvents: 'none', display: 'none' });
  document.body.appendChild(hl);
  let hoverCannon = null;
  function showCannon(c, x, y) {
    hoverCannon = c;
    view.setHoverUnit?.(c ? c.e.id : null);
    if (!c) { hl.style.display = 'none'; return; }
    const u = view.unitToScreen(c.e.x, c.e.z, 0);
    Object.assign(hl.style, { display: 'block', left: `${u.x}px`, top: `${u.y}px` });
    const info = cannonInfo(c), html = `<b>${info.title}</b>${info.lines.map(l => `<div>${l}</div>`).join('')}`;
    if (tipEl.dataset.html !== html) { tipEl.innerHTML = html; tipEl.dataset.html = html; }
    tipEl.hidden = false;
    tipEl.style.left = `${Math.min(innerWidth - 260, x + 16)}px`; tipEl.style.top = `${Math.min(innerHeight - 110, y + 16)}px`;
  }
  const overUi = t => t?.closest?.('button, #townpanel, #townsoverview, #bar, #selpanel, #controls, #characterpage, #deploymentpanel, #garrisoncard, #warcamp, #townwar');
  // keeps the cooldown counting down while the pointer rests on a gun
  setInterval(() => { if (hoverCannon) { const c = cannonAt(mouse.x, mouse.y); showCannon(c, mouse.x, mouse.y); if (!c) tipEl.hidden = true; } }, 250);

  function flash(p) {
    const u = view.unitToScreen(p.x, p.z, 1.5);
    Object.assign(flashEl.style, { left: `${u.x}px`, top: `${u.y}px` });
    flashEl.hidden = false; flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
  }
  addEventListener('mousemove', e => {
    mouse = { x: e.clientX, y: e.clientY };
    const blocked = e.target?.closest?.('button, #townpanel, #townsoverview, #bar, #selpanel, #controls, #characterpage, #deploymentpanel, #garrisoncard, #warcamp, #townwar');
    const cn = blocked ? null : cannonAt(e.clientX, e.clientY);
    if (cn || hoverCannon) { showCannon(cn, e.clientX, e.clientY); if (cn) return; }
    // trains only: buildings have no hover tooltip any more (Tim 2026-11-20: it got in the way of moving units); a left-click shows their card
    const tr = blocked ? null : trainAt(e.clientX, e.clientY), info = tr ? trainInfo(tr) : null;
    if (!info) { tipEl.hidden = true; return; }
    const html = `<b>${info.title}</b>${info.lines.map(l => `<div>${l}</div>`).join('')}`;
    if (tipEl.dataset.html !== html) { tipEl.innerHTML = html; tipEl.dataset.html = html; }
    tipEl.hidden = false;
    tipEl.style.left = `${Math.min(innerWidth - 260, e.clientX + 16)}px`; tipEl.style.top = `${Math.min(innerHeight - 110, e.clientY + 16)}px`;
  });
  // left-click a gun: the governor fires the salute (before the crew clicks see it)
  addEventListener('mousedown', e => {
    if (e.button !== 0 || e.ctrlKey || overUi(e.target)) return;
    const c = cannonAt(e.clientX, e.clientY);
    if (!c) return;   // Tim 2026-11-12: then 2026-11-19: a left-click on your building opens its menu (menuAt); 2026-11-20: with its card beside it
    e.stopImmediatePropagation(); e.preventDefault();
    send({ id: heroId, type: 'frontier', action: 'salute', settlement: c.town.id });
  }, { capture: true });
  // a unit under the pointer (an enemy, or one of yours) wins over the building behind it (Tim 2026-11-19: right-click on an
  // enemy attacking your building opened the building's menu instead of attacking it)
  const unitNear = (x, y) => Object.values(game.state.entities || {}).some(e => e.place === 'world' && !e.dead && !e.garrison && !e.hidden && e.type !== 'horse' && !e.stored && (() => { const u = view.unitToScreen(e.x, e.z, 1); return Math.hypot(u.x - x, u.y - y) < 26; })());
  // right-click is always an order (Tim 2026-11-19): on your own buildings it is the crew's move order (no menu); Ctrl +
  // right-click your stockade sends them in; an enemy building of your war is attacked. Menus open on a left-click (menuAt).
  // capture phase so the crew's right-click "go there" order does not also fire
  addEventListener('mousedown', e => {
    if (e.button !== 2 || e.target?.closest?.('button, #townpanel, #townsoverview, #bar, #selpanel, #controls, #garrisoncard, #warcamp, #townwar, #structcard')) return;
    if (unitNear(e.clientX, e.clientY)) return;   // crew_input.js: attack the enemy, follow the hero, and so on
    const p = plotAt(e.clientX, e.clientY);
    if (!p) return;
    // war checkpoint 6: right-click an enemy building of a war you are in (the town you attack, or the camp attacking
    // you): the selected crew walk over and attack it; with the hero selected or nothing selected he goes too
    if (!e.ctrlKey && p.kind === 'building' && (p.foreign || p.camp) && !(p.camp && game.state.frontier?.wars?.list?.[p.camp]?.attacker === owner())) {
      if (e.shiftKey) return;   // Shift + right-click is Torch: crew_input.js hands it to ability_rows.js (Tim 2026-11-13: it was taken here as a plain attack)
      const w = p.camp ? game.state.frontier?.wars?.list?.[p.camp] : Object.values(game.state.frontier?.wars?.list || {}).find(x => x.town === p.town);
      const s = p.camp ? null : game.state.frontier?.settlements?.[p.town], b = (p.camp ? w?.camp?.buildings : s?.buildings)?.find(x => x.id === p.id);
      if (w && (p.camp ? w.defender === owner() : w.attacker === owner()) && b?.stage === 'built' && p.type !== 'war_banner') {
        e.stopImmediatePropagation(); e.preventDefault(); flash(p);
        const sel = selected(), ents = game.state.entities || {};
        send({ id: heroId, type: 'order', kind: 'raze', x: p.x, z: p.z, slack: 6, units: sel.filter(id => id !== heroId && ents[id]?.type !== 'hero'), hero: !sel.length || sel.includes(heroId) });
      }
      return;
    }
    // Ctrl + right-click your finished stockade (Tim 2026-11-07, Ctrl since 2026-11-12): the selected go in (far ones walk
    // over first); the hero goes when he is selected or nothing is selected, and his following crew with him
    const s = p.camp ? null : game.state.frontier?.settlements?.[p.town], b = s?.buildings?.find(x => x.id === p.id);
    if (e.ctrlKey && !p.foreign && p.kind === 'building' && p.type === 'stockade' && b?.stage === 'built' && s.owner === owner()) {
      e.stopImmediatePropagation(); e.preventDefault(); flash(p);
      const ids = selected().length ? selected() : [heroId], ents = game.state.entities || {}, group = [...ids];
      const heroGoes = ids.includes(heroId) || !selected().length;
      if (heroGoes && !group.includes(heroId)) group.push(heroId);
      if (heroGoes) for (const u of Object.values(ents)) if (u.owner === owner() && u.order?.kind === 'follow' && u.order.target === heroId && !group.includes(u.id)) group.push(u.id);   // his following crew come too
      send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'enter', town: p.town, building: p.id, walk: true, units: group });
    }
    // anything else (your own buildings, a rival town's): the right-click goes on as a normal order
  }, { capture: true });
  // left-click on one of your buildings with no unit there (Tim 2026-11-19): its menu. War camp buildings: the camp menu;
  // military buildings: their town war menu (the town hall too while your town is attacked); the stockade: its garrison
  // card. Anything else (the hall in peace, houses, farms, ruins): false, and the click shows the building's card as
  // before (frontier_build_ui.js town card, structure_card.js pane). True when a menu opened.
  function menuAt(x, y) {
    if (unitNear(x, y)) return false;
    const p = plotAt(x, y);
    // your own war camp's plots are tagged foreign too (town_props.js drawableWarSites), so the camp check comes first (Tim 2026-11-25)
    if (!p || p.kind !== 'building') return false;
    if (p.camp) {
      const w = game.state.frontier?.wars?.list?.[p.camp], b = w?.camp?.buildings?.find(x => x.id === p.id);
      if (!openCamp || w?.attacker !== owner() || b?.stage === 'ruined') return false;
      if (openCamp(p.camp, p.id)) { flash(p); return true; }
      return false;
    }
    if (p.foreign) return false;
    const s = game.state.frontier?.settlements?.[p.town], b = s?.buildings?.find(x => x.id === p.id);
    if (!s || s.owner !== owner() || !b || b.stage === 'ruined') return false;
    if (openTownWar) {
      const defending = Object.values(game.state.frontier?.wars?.list || {}).some(w => w.town === p.town && w.defender === owner());
      if (p.type === 'town_hall' ? defending && openTownWar(p.town, null) : openTownWar(p.town, p.id)) { flash(p); return true; }
    }
    if (p.type === 'stockade' && openGarrison?.(p.town, p.id)) { flash(p); return true; }
    return false;
  }
  // the garrison count over each of your stockades, with a click to walk everyone out (and Shift+K does it from anywhere)
  const badges = new Map();
  function evacuate(town, building) { send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'leave', town, ...(building != null ? { building } : {}) }); }
  function evacuateAll() {
    for (const s of drawableTowns(game.state.frontier, owner())) if (garrisonCount(game.state.frontier, game.state.entities, s)) evacuate(s.id);
    // the hero in a house, workshop, farmhouse or camp stockade (Tim 2026-11-19) steps out too; troops there stay
    const h = game.state.entities[heroId];
    if (h?.garrison?.zone) send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'leave', structure: h.garrison.key, units: [heroId] });
  }
  setInterval(() => {
    if (!badgeEl) return;
    const want = new Set();
    if (onIsland()) for (const s of drawableTowns(game.state.frontier, owner())) for (const b of s.buildings.filter(x => x.type === 'stockade' && x.stage === 'built')) {   // one badge per stockade
      const n = garrisonCount(game.state.frontier, game.state.entities, s, b);
      if (!n) continue;
      const pl = townPlots([s]).find(q => q.id === b.id); if (!pl) continue;
      const bk = `${s.id}|${b.id}`;
      want.add(bk);
      let el = badges.get(bk);
      if (!el) { el = document.createElement('button'); el.className = 'garrisonbadge'; el.addEventListener('click', ev => { ev.stopPropagation(); evacuate(s.id, b.id); }); badgeEl.appendChild(el); badges.set(bk, el); }
      const u = view.unitToScreen(pl.x, pl.z, 3), cap = frontierData?.buildings?.stockade?.garrison?.capacity;
      el.textContent = `Inside ${n}${cap ? ` / ${cap}` : ''} · Evacuate`; el.title = 'Everyone inside walks out (Shift+K)';
      el.style.left = `${u.x}px`; el.style.top = `${u.y}px`;
    }
    // the town hall (Tim 2026-11-19): workers sheltering inside. Tim 2026-11-22: a small worker icon and the number, not
    // a big chip; it lets clicks through to the hall, whose card has the details, Back to work and (in a war) Send the
    // others in. A red rim while any hide from an attack.
    if (onIsland()) for (const s of drawableTowns(game.state.frontier, owner()).filter(t => t.owner === owner() && !t.capital)) {
      const hall = (s.buildings || []).find(x => x.type === 'town_hall' && x.stage === 'built'); if (!hall || !s.workers?.length) continue;
      const inside = s.workers.filter(w => w.shelter), n = inside.length;
      if (!n) continue;
      const pl = townPlots([s]).find(q => q.id === hall.id); if (!pl) continue;
      const bk = `${s.id}|hall`; want.add(bk);
      let el = badges.get(bk);
      if (!el) { el = document.createElement('div'); el.className = 'hallpill'; badgeEl.appendChild(el); badges.set(bk, el); }
      const attack = inside.some(w => !w.shelter.manual && !w.shelter.wait && !w.wait), html = `${HALL_PILL_ICON}<span>${n}</span>`;
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
      el.classList.toggle('attack', attack);
      el.title = `${n} worker${n > 1 ? 's' : ''} in shelter. Click the hall for details and Back to work`;
      const u = view.unitToScreen(pl.x, pl.z, 3); el.style.left = `${u.x}px`; el.style.top = `${u.y}px`;
    }
    // a tired work camp (Tim 2026-11-22): more workers on its spots than they keep busy (workers.js s.tiredCamps). An
    // amber pill that pulses over the camp, lets clicks through to it; its card has Move extras.
    if (onIsland()) for (const s of drawableTowns(game.state.frontier, owner()).filter(t => t.owner === owner() && !t.capital)) for (const c of s.tiredCamps || []) {
      const pl = townPlots([s]).find(q => q.id === c.id); if (!pl) continue;
      const bk = `${s.id}|tired|${c.id}`; want.add(bk);
      let el = badges.get(bk);
      if (!el) { el = document.createElement('div'); el.className = 'hallpill camptired'; badgeEl.appendChild(el); badges.set(bk, el); }
      const html = `<i><span>!</span></i>${HALL_PILL_ICON.replace(/#f2e6c9/g, '#f6e7cc')}<span>${c.extra} too many</span>`;
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
      el.title = `${c.n} workers on this camp's spots, which keep ${c.max} busy: ${c.extra} over the max. Click the camp, then Move extras`;
      const u = view.unitToScreen(pl.x, pl.z, 3); el.style.left = `${u.x}px`; el.style.top = `${u.y}px`;
    }
    // a war camp's hall (Tim 2026-11-21): recall the camp's workers into it, and send them back, like a town hall
    if (onIsland()) for (const w of Object.values(game.state.frontier?.wars?.list || {})) {
      if (w.attacker !== owner() || !w.camp?.workers?.length) continue;
      const hall = (w.camp.buildings || []).find(x => x.type === 'camp_hall' && x.stage === 'built'); if (!hall || !Number.isFinite(hall.x)) continue;
      const n = w.camp.workers.filter(k => k.shelter).length, bk = `${w.id}|camphall`; want.add(bk);
      let el = badges.get(bk);
      if (!el) { el = document.createElement('button'); el.className = 'garrisonbadge shelterbadge'; el.addEventListener('click', ev => { ev.stopPropagation(); send({ id: heroId, type: 'frontier', action: 'hallShelter', town: w.id, mode: el.dataset.mode }); }); badgeEl.appendChild(el); badges.set(bk, el); }
      el.dataset.mode = n ? 'leave' : 'enter';
      const attack = w.camp.workers.some(k => k.shelter && !k.shelter.manual), html = shelterIcon(n, attack);
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
      el.classList.toggle('attack', attack);
      el.title = n ? `${n} worker${n > 1 ? 's' : ''} in shelter${attack ? ', some hiding from the attack' : ''}. Click: every sheltering worker goes back to the job they had. The camp hall menu has a Shelter tab` : 'Shelter workers: every camp worker runs to the camp hall and waits inside, safe, until you release them';
      const u = view.unitToScreen(hall.x, hall.z, 3); el.style.left = `${u.x}px`; el.style.top = `${u.y}px`;
    }
    for (const [id, el] of badges) if (!want.has(id)) { el.remove(); badges.delete(id); }
  }, 150);
  return { evacuateAll, menuAt };
}
