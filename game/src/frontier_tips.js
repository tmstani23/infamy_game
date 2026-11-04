import { createZones } from './sim/frontier/zones.js';

export const townName = value => String(value || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

// Reads only: the inspector and build overlay share the simulation's road query.
export function townCellTip(s, cell, data) {
  if (!s?.grid || cell < 0 || cell >= s.grid.n * s.grid.n) return null;
  const g = s.grid, b = s.buildings.find(b => (b.cells || [b.cell]).includes(cell));
  const p = s.projects.find(p => (p.cells || [p.cell]).includes(cell));
  const entry = Object.entries(data.zones.kinds).find(([, k]) => k.char === g.zone[cell]);
  if (!b && !p && !entry && !'rwg'.includes(g.use[cell])) return null;
  const [kind, def] = entry || [], zone = s.zones?.[kind];
  const lines = [`Town: ${s.name}`, `Zone: ${kind ? townName(kind) : 'none (placed structure)'}`];
  if (p) lines.push(`State: ${townName(p.phase || (p.paid ? 'frame' : 'planned'))} · ${Math.round(100 * p.progress / Math.max(1, p.need))}%`);
  else if (b) lines.push(`State: ${townName(b.stage)}`);
  else if (entry) lines.push(`State: ${g.ground[cell] === 'o' ? 'Clearing' : def.stages[Number(g.stage[cell]) - 1] || 'Zoned ground'}`);
  else lines.push('State: finished');
  if (entry) {
    lines.push(`Zone state: ${zone?.abandoned ? 'abandoned' : 'active'} · health ${Math.round((zone?.health ?? 1) * 100)}%`);
    if (!createZones({ data }).roadNear(s, cell, def.needs?.roadReach)) lines.push('Needs road to grow');
  } else lines.push('Zone state: not zoned');
  return { title: townName(b?.type || p?.type || kind || ({ r: 'road', w: 'wall', g: 'gate' }[g.use[cell]])), lines, hall: b?.type === 'town_hall' && b.stage === 'built' };
}

// One floating tooltip for anything with a data-tip attribute inside `root` (frontier F4: panel, overview).
// Tips only go on things a player cannot guess or needs for a decision (Tim, 2026-11-02).
export function bindTips(root) {
  let el = document.getElementById?.('fptip');
  if (!el) { el = document.createElement('div'); el.id = 'fptip'; el.hidden = true; document.body.appendChild(el); }
  const hide = () => { el.hidden = true; };
  root.addEventListener('mouseover', e => {
    const t = e.target.closest?.('[data-tip]'); if (!t) { hide(); return; }
    el.textContent = t.dataset.tip; el.style.visibility = 'hidden'; el.hidden = false;
    const r = t.getBoundingClientRect(), w = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w.width - 8))}px`;
    el.style.top = `${r.bottom + 6 + w.height < innerHeight ? r.bottom + 6 : Math.max(8, r.top - w.height - 6)}px`;
    el.style.visibility = '';
  });
  root.addEventListener('mouseleave', hide);
  return { hide };
}
