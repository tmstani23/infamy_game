// Storage caps (economy balance B2, Tim 2026-11-05). Pure helpers over data/frontier.json "storage":
// cap = caps[tier - 1] + perStorehouse x built storehouses. The capital and uncapped resources (ryo) have none.
const EPS = 1e-9;
export function storageCap(s, data, resource) {
  const st = data.storage;
  if (!st || !s || s.capital || st.uncapped?.includes(resource)) return Infinity;
  const caps = st.caps || [];
  const base = caps[Math.min(caps.length, Math.max(1, s.tier || 1)) - 1] ?? Infinity;
  const stores = (s.buildings || []).filter(b => b.type === 'storehouse' && b.stage === 'built').length;
  return base + (st.perStorehouse || 0) * stores;
}
// Default keep amount (Tim 2026-11-09): half the town's storage cap for that resource (railways.ship.keepShare), so it
// grows with storehouses and the hall tier. A keep the player sets wins. No cap: the old fixed defaults.
export function defaultKeep(s, data, resource) {
  const cap = storageCap(s, data, resource), share = data.railways?.ship?.keepShare;   // 0 / missing: fixed defaults
  if (share > 0 && Number.isFinite(cap)) return Math.floor(cap * share);
  return resource === 'goods' ? data.market?.keep ?? 0 : data.railways?.ship?.keep?.[resource] ?? 0;
}
// "Full" means within 1% of the cap (at least 1 unit), so steady eating just under the cap still reads as full.
export function isFull(s, data, resource) {
  const cap = storageCap(s, data, resource);
  return Number.isFinite(cap) && (s.stock?.[resource] ?? 0) >= cap - Math.max(1, cap * 0.01) - EPS;
}
