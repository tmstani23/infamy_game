// Hover tooltip and right-click on a founded town's buildings (frontier E5, Tim 2026-11-04). Reads the
// frontier snapshot only; right-click opens the town panel for that town and flashes the plot.
import { drawableTowns, townPlots, plotInfo } from './town_props.js';

export function createTownHover({ game, view, heroId, tipEl, flashEl, openTown, frontierData }) {
  let plots = [], sig = '', mouse = { x: -1, y: -1 };
  const owner = () => game.state.entities[heroId]?.owner;
  const onIsland = () => game.state.entities[heroId]?.place === 'world';
  function refresh() {
    const towns = drawableTowns(game.state.frontier, owner());
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
      if (dx <= 5 * k && dy >= -7 * k && dy <= 3 * k && dx + Math.abs(dy) < bestD) { best = p; bestD = dx + Math.abs(dy); }
    }
    return best;
  }
  function flash(p) {
    const u = view.unitToScreen(p.x, p.z, 1.5);
    Object.assign(flashEl.style, { left: `${u.x}px`, top: `${u.y}px` });
    flashEl.hidden = false; flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
  }
  addEventListener('mousemove', e => {
    mouse = { x: e.clientX, y: e.clientY };
    const blocked = e.target?.closest?.('button, #townpanel, #townsoverview, #bar, #selpanel, #controls, #characterpage, #deploymentpanel');
    const p = blocked ? null : plotAt(e.clientX, e.clientY), info = p && plotInfo(game.state.frontier, p, frontierData);
    if (!info) { tipEl.hidden = true; return; }
    const html = `<b>${info.title}</b>${info.lines.map(l => `<div>${l}</div>`).join('')}`;
    if (tipEl.dataset.html !== html) { tipEl.innerHTML = html; tipEl.dataset.html = html; }
    tipEl.hidden = false;
    tipEl.style.left = `${Math.min(innerWidth - 260, e.clientX + 16)}px`; tipEl.style.top = `${Math.min(innerHeight - 110, e.clientY + 16)}px`;
  });
  // capture phase so the crew's right-click "go there" order does not also fire
  addEventListener('mousedown', e => {
    if (e.button !== 2 || e.ctrlKey || e.target?.closest?.('button, #townpanel, #townsoverview, #bar, #selpanel, #controls')) return;
    const p = plotAt(e.clientX, e.clientY);
    if (!p) return;
    e.stopImmediatePropagation(); e.preventDefault();
    flash(p); openTown(p.town);
  }, { capture: true });
  return {};
}
