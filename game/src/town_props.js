// Founded towns on screen (frontier E5). Pure: turns settlement records into the list of things the
// island renderer draws, so the drawing always follows the record (never the chunks). An unbuilt
// project is a flat dirt footprint; a project with work done is its building at half opacity; a
// finished building is drawn as normal. Art names come from data/frontier.json "townArt".
import { townSlot } from './sim/frontier/town_layout.js';
import { cellOffset } from './sim/frontier/town_grid.js';
// grid towns (L3.1) give cells as grid indices; a town not migrated yet still holds spiral slots
const slotOf = (s, c) => (s.grid ? cellOffset(s, c) : townSlot(c));

// Which towns to draw: your own (full records, with a position) from the frontier snapshot.
export function drawableTowns(frontier, clan) {
  return Object.values(frontier?.settlements || {}).filter(s => s.owner === clan && !s.capital && Number.isFinite(s.x) && Array.isArray(s.buildings));
}

// A short string that changes whenever a drawn thing would change (so the renderer only rebuilds then).
export function townSignature(towns) {
  return towns.map(s => `${s.id}@${s.x},${s.z}:${s.buildings.map(b => `${b.type}${b.cell}${b.stage}`).join('/')}|${s.projects.map(p => `${p.type}${p.cell}${p.paid ? (p.progress > 0 ? 'f' : 'p') : 'u'}`).join('/')}`).join(';');
}

export function townProps(towns, townArt, townLights = {}) {
  const out = [];
  for (const s of towns) {
    s.buildings.forEach((b, i) => {
      const art = townArt[b.type], [ox, oz] = slotOf(s, b.cell ?? i);
      if (art) out.push({ key: `${s.id}:${b.id}:${b.stage}`, art, x: s.x + ox, z: s.z + oz, opacity: b.stage === 'built' ? 1 : 0.5 });
      // stone lanterns beside finished buildings: they light the town at night (townLights = how many per type)
      if (b.stage === 'built') for (let k = 0; k < (townLights[b.type] || 0); k++) out.push({ key: `${s.id}:${b.id}:lamp${k}`, art: townLights.art || 'stone_lantern', x: s.x + ox + (k ? 4.6 : -4.6), z: s.z + oz + 3.8 });
    });
    s.projects.forEach((p, i) => {
      const art = townArt[p.type], [ox, oz] = slotOf(s, p.cell ?? s.buildings.length + i);
      const x = s.x + ox, z = s.z + oz;
      if (p.paid && p.progress > 0 && art) out.push({ key: `${s.id}:${p.id}:frame`, art, x, z, opacity: 0.5 });
      else out.push({ key: `${s.id}:${p.id}:dirt`, dirt: true, width: 8, height: 6, x, z });
    });
  }
  return out;
}

// ---- hover and right-click on a plot (frontier E5, Tim 2026-11-04) ----
// Every building and project of your towns is a plot: { town, kind: 'building' | 'project', id, x, z }.
export function townPlots(towns) {
  const out = [];
  for (const s of towns) {
    s.buildings.forEach((b, i) => { const [ox, oz] = slotOf(s, b.cell ?? i); out.push({ town: s.id, kind: 'building', id: b.id, x: s.x + ox, z: s.z + oz }); });
    s.projects.forEach((p, i) => { const [ox, oz] = slotOf(s, p.cell ?? s.buildings.length + i); out.push({ town: s.id, kind: 'project', id: p.id, x: s.x + ox, z: s.z + oz }); });
  }
  return out;
}

const nice = t => (t || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
// { title, lines } for a plot, read from the live snapshot so numbers stay current.
export function plotInfo(frontier, plot, data) {
  const s = frontier?.settlements?.[plot.town];
  if (!s) return null;
  const lines = [];
  if (plot.kind === 'project') {
    const p = s.projects.find(x => x.id === plot.id);
    if (!p) return null;
    lines.push(!p.paid ? (p.authorized ? 'Waiting for materials' : 'Planned: not started') : `Under construction: ${Math.round(100 * p.progress / Math.max(1, p.need))}%`);
    lines.push(`Cost: ${Object.entries(p.cost).map(([r, n]) => `${n} ${r}`).join(', ') || 'free'}`);
    lines.push(`${s.name}`);
    return { title: nice(p.type), lines: [...lines, 'Right-click: open the town panel'] };
  }
  const b = s.buildings.find(x => x.id === plot.id);
  if (!b) return null;
  const t = data?.buildings?.[b.type] || {};
  if (b.type === 'town_hall') lines.push(`${s.name}: ${s.pop} people, housing ${s.housing}`, `Food ${Math.floor(s.stock.food)} · Timber ${Math.floor(s.stock.timber)} · Stone ${Math.floor(s.stock.stone)}`, ...(s.mood !== undefined ? [`Mood ${Math.round(s.mood)}`] : []));
  else {
    if (t.jobs) lines.push(`Workers ${b.workers}/${t.jobs}`);
    if (t.housing) lines.push(`Houses ${t.housing} people`);
    if (t.output) lines.push(`Makes ${Object.keys(t.output).join(', ')}`);
    if (!lines.length) lines.push(nice(b.type));
    lines.push(s.name);
  }
  return { title: nice(b.type), lines: [...lines, 'Right-click: open the town panel'] };
}
