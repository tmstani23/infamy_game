// Hover tooltip and right-click on a founded town's buildings (frontier E5, Tim 2026-11-04). Reads the
// frontier snapshot only; right-click opens the town panel for that town and flashes the plot.
import { drawableTowns, drawableWarSites, townPlots, plotInfo, garrisonCount } from './town_props.js';
import { pointAt } from './sim/frontier/rail_route.js';

export function createTownHover({ game, view, heroId, tipEl, flashEl, openTown, frontierData, send = () => {}, selected = () => [], badgeEl = null, openGarrison = null, openCamp = null }) {
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
  const overUi = t => t?.closest?.('button, #townpanel, #townsoverview, #bar, #selpanel, #controls, #characterpage, #deploymentpanel, #garrisoncard, #warcamp');
  // keeps the cooldown counting down while the pointer rests on a gun
  setInterval(() => { if (hoverCannon) { const c = cannonAt(mouse.x, mouse.y); showCannon(c, mouse.x, mouse.y); if (!c) tipEl.hidden = true; } }, 250);

  function flash(p) {
    const u = view.unitToScreen(p.x, p.z, 1.5);
    Object.assign(flashEl.style, { left: `${u.x}px`, top: `${u.y}px` });
    flashEl.hidden = false; flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
  }
  addEventListener('mousemove', e => {
    mouse = { x: e.clientX, y: e.clientY };
    const blocked = e.target?.closest?.('button, #townpanel, #townsoverview, #bar, #selpanel, #controls, #characterpage, #deploymentpanel, #garrisoncard, #warcamp');
    const cn = blocked ? null : cannonAt(e.clientX, e.clientY);
    if (cn || hoverCannon) { showCannon(cn, e.clientX, e.clientY); if (cn) return; }
    const tr = blocked ? null : trainAt(e.clientX, e.clientY), p = blocked || tr ? null : plotAt(e.clientX, e.clientY), info = tr ? trainInfo(tr) : p && plotInfo(game.state.frontier, p, frontierData, game.state.entities, owner());
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
    if (!c) {
      // left-click one of your war camp's buildings: the camp panel (checkpoint 4)
      const cp = openCamp && plotAt(e.clientX, e.clientY);
      if (cp?.camp && game.state.frontier?.wars?.list?.[cp.camp]?.attacker === owner() && openCamp(cp.camp)) { e.stopImmediatePropagation(); e.preventDefault(); return; }
      // left-click one of your garrisoned buildings: the garrison card (Tim 2026-11-10)
      const p = openGarrison && plotAt(e.clientX, e.clientY), s = p && game.state.frontier?.settlements?.[p.town];
      if (p?.kind === 'building' && s?.owner === owner() && openGarrison(p.town, p.id)) { e.stopImmediatePropagation(); e.preventDefault(); }
      return;
    }
    e.stopImmediatePropagation(); e.preventDefault();
    send({ id: heroId, type: 'frontier', action: 'salute', settlement: c.town.id });
  }, { capture: true });
  // capture phase so the crew's right-click "go there" order does not also fire
  addEventListener('mousedown', e => {
    if (e.button !== 2 || e.ctrlKey || e.target?.closest?.('button, #townpanel, #townsoverview, #bar, #selpanel, #controls, #garrisoncard, #warcamp')) return;
    const p = plotAt(e.clientX, e.clientY);
    // war checkpoint 6: right-click an enemy building of a war you are in (the town you attack, or the camp attacking
    // you): the selected crew walk over and attack it; with the hero selected or nothing selected he goes too
    if (p?.kind === 'building' && (p.foreign || p.camp)) {
      const w = p.camp ? game.state.frontier?.wars?.list?.[p.camp] : Object.values(game.state.frontier?.wars?.list || {}).find(x => x.town === p.town);
      const s = p.camp ? null : game.state.frontier?.settlements?.[p.town], b = (p.camp ? w?.camp?.buildings : s?.buildings)?.find(x => x.id === p.id);
      if (w && (p.camp ? w.defender === owner() : w.attacker === owner()) && b?.stage === 'built' && p.type !== 'war_banner') {
        e.stopImmediatePropagation(); e.preventDefault(); flash(p);
        const sel = selected(), ents = game.state.entities || {};
        send({ id: heroId, type: 'order', kind: 'raze', x: p.x, z: p.z, slack: 6, units: sel.filter(id => id !== heroId && ents[id]?.type !== 'hero'), hero: !sel.length || sel.includes(heroId) });
      }
      return;
    }
    if (!p || p.foreign) return;   // a rival town's building: the right-click stays a normal move order
    e.stopImmediatePropagation(); e.preventDefault();
    flash(p);
    // right-click your finished stockade with crew selected (Tim 2026-11-07): they go in (far ones walk over first)
    const s = game.state.frontier?.settlements?.[p.town], ids = selected().length ? selected() : [heroId], b = s?.buildings?.find(x => x.id === p.id);
    if (p.kind === 'building' && p.type === 'stockade' && b?.stage === 'built' && s.owner === owner() && ids.length) {
      // the hero goes in only when he is selected or nothing is selected; crew selected without him go alone (Tim 2026-11-10)
      const ents = game.state.entities || {}, group = [...ids];
      const heroGoes = ids.includes(heroId) || !selected().length;
      if (heroGoes && !group.includes(heroId)) group.push(heroId);
      if (heroGoes) for (const u of Object.values(ents)) if (u.owner === owner() && u.order?.kind === 'follow' && u.order.target === heroId && !group.includes(u.id)) group.push(u.id);   // his following crew come too
      send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'enter', town: p.town, walk: true, units: group });
      return;
    }
    openTown(p.town);
  }, { capture: true });
  // the garrison count over each of your stockades, with a click to walk everyone out (and Shift+K does it from anywhere)
  const badges = new Map();
  function evacuate(town) { send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'leave', town }); }
  function evacuateAll() {
    for (const s of drawableTowns(game.state.frontier, owner())) if (garrisonCount(game.state.frontier, game.state.entities, s)) evacuate(s.id);
  }
  setInterval(() => {
    if (!badgeEl) return;
    const want = new Set();
    if (onIsland()) for (const s of drawableTowns(game.state.frontier, owner())) {
      const b = s.buildings.find(x => x.type === 'stockade' && x.stage === 'built'), n = b ? garrisonCount(game.state.frontier, game.state.entities, s) : 0;
      if (!n) continue;
      const pl = townPlots([s]).find(q => q.id === b.id); if (!pl) continue;
      want.add(s.id);
      let el = badges.get(s.id);
      if (!el) { el = document.createElement('button'); el.className = 'garrisonbadge'; el.addEventListener('click', ev => { ev.stopPropagation(); evacuate(s.id); }); badgeEl.appendChild(el); badges.set(s.id, el); }
      const u = view.unitToScreen(pl.x, pl.z, 3), cap = frontierData?.buildings?.stockade?.garrison?.capacity;
      el.textContent = `Inside ${n}${cap ? ` / ${cap}` : ''} · Evacuate`; el.title = 'Everyone inside walks out (Shift+K)';
      el.style.left = `${u.x}px`; el.style.top = `${u.y}px`;
    }
    for (const [id, el] of badges) if (!want.has(id)) { el.remove(); badges.delete(id); }
  }, 150);
  return { evacuateAll };
}
