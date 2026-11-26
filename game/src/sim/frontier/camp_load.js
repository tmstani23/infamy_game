// Work camp load (2026-11-22): the spots that count for a work camp, the workers on them and the camp's max.
// One rule for the sim (tired camps, Move extras), the camp card, the Workers view, the map marker and the governor:
// - a spot's max is supportsWorkers, the fixed number the governor fills a spot to, whatever the walk (a max that
//   shrank with a long walk called healthy far spots over, and the governor put back whoever Move extras took off);
// - a spot counts for one camp only: the nearest built camp of the town that takes its resource, within campReach
//   (one spot showed under three camps).
import { supportsWorkers } from '../resource_spots.js';
import { cellToWorld } from './town_grid.js';
export const campPoint = (s, b) => s.grid && Number.isInteger(b.cell) ? cellToWorld(s, b.cell) : Number.isFinite(b.x) && Number.isFinite(b.z) ? [b.x, b.z] : [s.x, s.z];
// workers per spot over all the given sites; one already told off his spot (w.offSpot, handing his load in) no longer counts
export function spotCounts(sites) {
  const c = {};
  for (const t of sites) for (const w of t.workers || []) if (w.spot && !w.offSpot) c[w.spot] = (c[w.spot] || 0) + 1;
  return c;
}
// { n, max, extra, spots: [{ p, n, max }] } for work camp b of town s, or null when b is no built work camp.
// R = data.workers, index = spot index, stages = resource_spots.json stages, count = spotCounts(...), known = optional (x, z) => seen
export function campLoad(s, b, { R, index, stages, count, known = null }) {
  const takes = R?.campTakes?.[b?.type];
  if (!takes || !stages || !s || b.stage !== 'built') return null;
  const camps = (s.buildings || []).filter(x => x.stage === 'built' && R.campTakes?.[x.type]).map(x => ({ x, pt: campPoint(s, x) }));
  const here = campPoint(s, b), dist = (pt, p) => Math.hypot(pt[0] - p.x, pt[1] - p.z), spots = [];
  let n = 0, max = 0, extra = 0;
  for (const p of index.spotsNear(here[0], here[1], R.campReach || 0)) {
    const res = R.resources?.[p.kind];
    if (!takes.includes(res) || (known && !known(p.x, p.z))) continue;
    const d = dist(here, p);
    // another camp of this resource is nearer (ties: the lower id): the spot is that camp's
    if (camps.some(c => c.x !== b && R.campTakes[c.x.type].includes(res) && (dist(c.pt, p) < d || (dist(c.pt, p) === d && String(c.x.id) < String(b.id))))) continue;
    const k = count[p.id] || 0, m = supportsWorkers(p, stages) ?? k;
    spots.push({ p, n: k, max: m }); n += k; max += m; extra += Math.max(0, k - m);
  }
  return { n, max, extra, spots };
}
