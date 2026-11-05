// Usage page model (Tim 2026-11-05 redesign). Pure and read-only: turns a town record into the rows
// the town panel's Usage page draws. Per-minute rates come from s.flow (flow.js); one-time costs and
// map focus points come from resourceUsage (resource_usage.js).
import { resourceUsage } from './resource_usage.js';
import { workerCount, residents } from './people.js';
import { tierOf, zoneCells, cellCap, workerCap } from './tiers.js';
import { cellToWorld } from './town_grid.js';

const nice = s => s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const ONCE = new Set(['build', 'train', 'upgrade', 'refund']);   // paid once, not a running flow
// a readable name for each world.change reason
export function flowLabel(why, data) {
  if (why === 'gather') return 'Workers gathering';
  if (why === 'forage') return 'Hand foraging';
  if (why === 'eat') return 'Everyone eats';
  if (why === 'tax') return 'Taxes';
  if (why === 'build') return 'Construction';
  if (why === 'train') return 'Training workers';
  if (why === 'upgrade') return 'Town hall upgrade';
  if (why === 'refund') return 'Refunds';
  if (why === 'upkeep:wages') return 'Worker wages';
  if (why === 'upkeep:goods') return 'Houses want goods';
  if (why === 'upkeep:buildings') return 'Upkeep: buildings';
  if (why === 'upkeep:lines') return 'Upkeep: walls and gates';
  if (why.startsWith('upkeep:zone:')) return `Upkeep: ${zoneName(why.slice(12))}`;
  if (why.endsWith(' zone')) return nice(zoneName(why.slice(0, -5)));
  return nice(why);
}
const zoneName = k => ({ housing: 'houses', farm: 'farms', work: 'workshops' }[k] || k);

// one resource: { stock, cap, net, eta, incoming[], outgoing[], once[], inSum, outSum }
export function usageView(s, r, data) {
  const flow = s.flow?.[r] || {}, old = resourceUsage(s, r, data);
  const cap = s.storageCaps?.[r] ?? null, stock = s.stock?.[r] || 0, paid = s.upkeepPaid?.[r] ?? 1;
  const rows = Object.entries(flow).filter(([, v]) => Math.abs(v) >= 0.05).map(([why, v]) => ({ id: why, name: flowLabel(why, data), rate: v, once: ONCE.has(why), state: rowState(s, r, why, v, paid, data) }));
  const incoming = rows.filter(x => x.rate > 0).sort((a, b) => b.rate - a.rate);
  const outgoing = rows.filter(x => x.rate < 0).sort((a, b) => a.rate - b.rate);
  const inSum = incoming.reduce((n, x) => n + x.rate, 0), outSum = -outgoing.reduce((n, x) => n + x.rate, 0);
  const net = inSum - outSum;
  let eta = '';
  if (net < -0.2) eta = stock > 0 ? `runs out in ${mins(stock / -net)}` : 'empty';
  else if (cap != null && stock >= cap * 0.99) eta = 'store full';
  else if (net > 0.2 && cap != null) eta = `full in ${mins((cap - stock) / net)}`;
  const once = old.entries.filter(e => e.once).map(e => ({ id: e.id, name: nice(e.name), amount: e.once, state: e.state }));
  return { resource: r, stock, cap, net, eta, incoming, outgoing, once, inSum, outSum };
}
const mins = m => m < 1 ? 'under a minute' : m < 90 ? `~${Math.round(m)} min` : `~${Math.round(m / 60)} h`;

function rowState(s, r, why, v, paid, data) {
  if (why === 'gather') { const n = (s.workers || []).filter(w => w.trip?.resource === r).length; return n ? `${n} worker${n > 1 ? 's' : ''}` : 'recent'; }
  if (why === 'forage') return 'idle workers';
  if (why === 'eat') return s.foodShortage ? 'short' : 'fed';
  if (why.startsWith('upkeep:')) return paid < 1 - 1e-6 ? 'short' : 'paid';
  if (why === 'tax') return `${s.taxLevel || 'normal'} tax`;
  if (why.endsWith(' zone')) { const z = s.zones?.[why.slice(0, -5)]; return z?.abandoned ? 'abandoned' : (z?.health ?? 1) < (data.zones?.healthyAt ?? 0.5) ? 'unhealthy' : v > 0 ? 'producing' : 'using'; }
  return '';
}

// the Housing tab
export function housingView(s, data) {
  const k = data.zones?.kinds?.housing, U = data.upkeep || {}, out = { levels: [], uses: [], limits: [] };
  const beds = Math.floor(s.housing || 0), crew = workerCount(s), used = residents(s);
  Object.assign(out, { beds, used, pop: s.pop || 0, workers: crew, growth: s.report?.growth?.text || '', growthBlock: s.report?.growth?.block || null });
  if (k && s.grid) {
    const count = (k.stages || []).map(() => 0);
    for (let i = 0; i < s.grid.zone.length; i++) if (s.grid.zone[i] === k.char) { const st = Number(s.grid.stage[i]) || 0; if (st > 0) count[st - 1]++; }
    out.levels = (k.stages || []).map((name, i) => {
      const goods = U.goodsByStage?.[i] || 0;
      return { name: nice(name), count: count[i], bedsEach: (k.housing || 0) * (i + 1), beds: count[i] * (k.housing || 0) * (i + 1),
        needs: i === 0 ? 'needs a road and food' : goods ? `+ goods, ${(goods * 60).toFixed(2)}/min each` : 'no extra needs' };
    });
    const other = beds - out.levels.reduce((n, l) => n + l.beds, 0);
    if (other > 0) out.levels.push({ name: 'Other buildings', count: '', bedsEach: '', beds: other, needs: 'town hall and placed houses' });
    out.empty = 0;
    for (let i = 0; i < s.grid.zone.length; i++) if (s.grid.zone[i] === k.char && !(Number(s.grid.stage[i]) > 0)) out.empty++;
  }
  const secs = (data.cadenceTicks || 20) / 20;
  const food = -(s.flow?.food?.eat ?? -(data.rates?.food || 0) * used * 60 / secs);
  out.uses.push({ name: `Food (${used} people eat)`, rate: food, state: s.foodShortage ? 'short' : 'fed' });
  const goods = -(s.flow?.goods?.['upkeep:goods'] || 0);
  out.uses.push({ name: 'Goods (houses level 2+)', rate: goods, state: s.goodsShort ? 'short' : goods > 0 ? 'paid' : 'not needed yet' });
  for (const [r, v] of Object.entries(s.flow || {})) { const x = -(v['upkeep:zone:housing'] || 0); if (x > 0.01) out.uses.push({ name: `${nice(r)} upkeep`, rate: x, state: (s.upkeepPaid?.[r] ?? 1) < 1 - 1e-6 ? 'short' : 'paid' }); }
  const t = tierOf(s, data);
  if (k && Number.isFinite(cellCap(s, 'housing', data))) out.limits.push({ name: 'Housing cells', value: `${zoneCells(s, k.char)} / ${cellCap(s, 'housing', data)}`, full: zoneCells(s, k.char) >= cellCap(s, 'housing', data), note: t?.name || '' });
  if (Number.isFinite(workerCap(s, data))) out.limits.push({ name: 'Workers', value: `${crew} / ${workerCap(s, data)}`, full: crew >= workerCap(s, data), note: t?.name || '' });
  return out;
}

// where a Usage row is on the map ([x, z] or null): zone rows go to a cell of that kind, building
// rows to that building, one-time rows to their project.
export function flowFocus(s, id, r, data) {
  const kinds = data.zones?.kinds || {};
  const kind = id.endsWith(' zone') ? id.slice(0, -5) : id.startsWith('upkeep:zone:') ? id.slice(12) : null;
  if (kind && kinds[kind] && s.grid) { const i = s.grid.zone.indexOf(kinds[kind].char); if (i >= 0) return pointOf(s, i, data); }
  const b = (s.buildings || []).find(b => b.type === id);
  if (b?.cell != null) return pointOf(s, b.cell, data);
  const e = resourceUsage(s, r, data).entries.find(e => e.id === id);
  return e ? [e.x, e.z] : null;
}
const pointOf = (s, cell) => cellToWorld(s, cell);
