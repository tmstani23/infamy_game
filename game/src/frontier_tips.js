import { createZones } from './sim/frontier/zones.js';
import {BUILD_DETAILS} from './build_tooltips.js';

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
    if(def.needs?.food && (s.foodShortage || (s.stock.food || 0)<data.rates.food*s.pop))lines.push(`Needs food: ${Number((data.rates.food*s.pop).toFixed(2))} per economy tick for ${s.pop} people`);
    if(def.needs?.workersPerCell && (zone?.workers || 0)<(zone?.wanted || 0))lines.push(`Needs townspeople: ${zone?.workers || 0} / ${zone?.wanted || 0} zone jobs filled; trained gatherers are separate`);
    if(def.inputs)for(const [r,amount] of Object.entries(def.inputs))lines.push(`Input: ${amount} ${r} per goods produced${(s.stock[r] || 0)<=0?' · missing':''}`);
    if(g.ground[cell]==='o')lines.push('Needs ground clearing before growth');
    if(Number(g.stage[cell])<def.stages.length)lines.push(`Growth: ${s.zoneGrow?.[cell] || 0} / ${def.growTicks} healthy economy ticks`);
    if(zone?.abandoned)lines.push('Recovery: restore food/workers to raise zone health; road access is required for growth');
  } else lines.push('Zone state: not zoned');
  const details=BUILD_DETAILS[b?.type || p?.type];if(details)lines.push(...details);
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
