// The most workers a war camp holds (Tim 2026-11-25): war.camp.workerCapByTier by camp hall tier (before / after the
// camp hall upgrade), else war.camp.workerCap. camp = the war record's camp (its buildings list the camp hall).
export function campWorkerCap(camp, data) {
  const C = data?.war?.camp || {}, t = C.workerCapByTier, tier = (camp?.buildings || []).find(b => b.type === 'camp_hall')?.tier || 1;
  return t?.length ? t[Math.min(t.length, Math.max(1, tier)) - 1] : C.workerCap ?? Infinity;
}
