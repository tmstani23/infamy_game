// Shared crowd avoidance for noncombatants. A fight needs two clans with at least five
// standing participants each, locally engaged in combat; a gathering alone is safe.
const cache = new WeakMap();
export function largeFights(state) {
  const old = cache.get(state);
  if (old?.tick === state.tick) return old.zones;
  const live = Object.values(state.entities).filter(e => !e.dead && !e.downed && !e.jailed && state.clans?.[e.owner]);
  const active = new Set();
  for (const e of live) {
    const target = state.entities[e.swing?.target];
    if (target && target.owner !== e.owner && target.place === e.place && !target.dead && !target.downed
      && Math.hypot(e.x - target.x, e.z - target.z) <= 14) { active.add(e.id); active.add(target.id); }
    if (state.tick - (e.foughtAt ?? -Infinity) <= 60) active.add(e.id);
  }
  const pending = live.filter(e => active.has(e.id)), zones = [];
  while (pending.length) {
    const group = [pending.pop()];
    for (let i = 0; i < group.length; i++) {
      for (let j = pending.length - 1; j >= 0; j--) {
        const e = pending[j], p = group[i];
        if (e.place === p.place && Math.hypot(e.x - p.x, e.z - p.z) <= 14) group.push(...pending.splice(j, 1));
      }
    }
    const sides = {};
    for (const e of group) sides[e.owner] = (sides[e.owner] || 0) + 1;
    const large = Object.values(sides).filter(n => n >= 5).length >= 2;
    // Once a large fight starts, attrition does not invite bystanders back into it.
    const continuing = Object.keys(sides).length >= 2 && old?.zones.some(zone => group.some(e => e.place === zone.place
      && Math.hypot(e.x - zone.x, e.z - zone.z) <= zone.radius));
    if (!large && !continuing) continue;
    const x = group.reduce((n, e) => n + e.x, 0) / group.length, z = group.reduce((n, e) => n + e.z, 0) / group.length;
    zones.push({ x, z, place: group[0].place, radius: Math.max(...group.map(e => Math.hypot(e.x - x, e.z - z))) + 10 });
  }
  cache.set(state, { tick: state.tick, zones });
  return zones;
}

// Keep the same battle under observation after reaching safety, until combat ends.
export function retreatZone(e, mind, zones) {
  const zone = zones.find(z => z.place === e.place && (Math.hypot(e.x - z.x, e.z - z.z) <= z.radius
    || mind.retreat && mind.retreat.place === z.place && Math.hypot(mind.retreat.x - z.x, mind.retreat.z - z.z) <= z.radius));
  if (zone) mind.retreat = zone;
  else delete mind.retreat;
  return zone;
}

export function retreatSpot(e, zone, nav) {
  let dx = e.x - zone.x, dz = e.z - zone.z, len = Math.hypot(dx, dz);
  if (len < 0.1) { dx = 1; dz = 0; len = 1; }
  // Try several outward directions if a wall blocks the direct escape.
  for (const angle of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const ux = (dx * Math.cos(angle) - dz * Math.sin(angle)) / len;
    const uz = (dx * Math.sin(angle) + dz * Math.cos(angle)) / len;
    const spot = nav.nearestFree(zone.x + ux * (zone.radius + 4), zone.z + uz * (zone.radius + 4));
    if (spot && Math.hypot(spot[0] - zone.x, spot[1] - zone.z) >= zone.radius && (!nav.findPath || nav.findPath(e.x, e.z, ...spot))) return spot;
  }
  return null;
}
