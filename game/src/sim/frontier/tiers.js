// Town hall tiers (economy balance B3, Tim 2026-11-05). Pure helpers over data/frontier.json "tiers".
// A town's tier is s.tier (1 when missing). Each tier sets the build ring, zone cell caps, placed
// building counts and the worker cap. Towns without tier data (old fixtures) are unlimited.
export function tierOf(s, data) {
  const list = data.tiers?.list;
  if (!list?.length) return null;
  return list[Math.min(list.length, Math.max(1, s.tier || 1)) - 1];
}
export const nextTier = (s, data) => data.tiers?.list?.[(s.tier || 1)] || null;
// placed-count group: work camps share one count
export const placedGroup = (type, data) => data.tiers?.camps?.includes(type) ? 'camps' : type;
export function placedCount(s, type, data) {
  const group = placedGroup(type, data), same = t => placedGroup(t, data) === group;
  const built = (s.buildings || []).filter(b => same(b.type) && b.stage !== 'ruined').length;
  const queued = (s.projects || []).filter(p => same(p.type) && !p.replaces).length;   // buildings appear only when a project finishes
  return built + queued;
}
// room left for one more of this placed type (Infinity when the tier does not limit it)
export function placedRoom(s, type, data) {
  const t = tierOf(s, data), max = t?.placed?.[placedGroup(type, data)];
  return max === undefined ? Infinity : max - placedCount(s, type, data);
}
// Can this town start the next town hall upgrade? { ok, reason, cost, ticks }
export function upgradeCheck(s, data) {
  const next = nextTier(s, data), up = next?.upgrade;
  if (!up) return { ok: false, reason: 'already the highest tier' };
  if (s.tierUpgrade) return { ok: false, reason: 'upgrade already under way' };
  if (!(s.buildings || []).some(b => b.type === 'town_hall' && b.stage === 'built')) return { ok: false, reason: 'needs a town hall' };
  const people = (s.pop || 0) + (s.workers?.length || 0) + (s.workerTraining?.length || 0);
  if (people < (up.pop || 0)) return { ok: false, reason: `needs ${up.pop} people`, cost: up.cost, ticks: up.ticks };
  const short = Object.entries(up.cost || {}).find(([r, v]) => (s.stock?.[r] ?? 0) < v);
  if (short) return { ok: false, reason: `needs ${short[1]} ${short[0]}`, cost: up.cost, ticks: up.ticks };
  return { ok: true, reason: '', cost: { ...(up.cost || {}) }, ticks: up.ticks || 1 };
}
// Start the next upgrade (players via the upgradeHall command, bot governors directly): pay now, arrive later.
export function startUpgrade(s, data, world) {
  const r = upgradeCheck(s, data);
  if (!r.ok) return r;
  for (const [res, v] of Object.entries(r.cost)) world.change(s.id, res, -v, 'upgrade');
  s.tierUpgrade = { to: (s.tier || 1) + 1, left: r.ticks };
  return r;
}
// One economy tick of a running upgrade; true on the tick the new tier arrives.
export function upgradeTick(s) {
  const u = s.tierUpgrade;
  if (!u) return false;
  if (--u.left > 0) return false;
  s.tier = u.to; delete s.tierUpgrade; return true;
}
export function zoneCells(s, char) {
  let n = 0; const z = s.grid?.zone || '';
  for (let i = 0; i < z.length; i++) if (z[i] === char) n++;
  return n;
}
export const cellCap = (s, kind, data) => tierOf(s, data)?.cells?.[kind] ?? Infinity;
export const workerCap = (s, data) => tierOf(s, data)?.workers ?? Infinity;
