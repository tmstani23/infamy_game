// The authoritative watcher reports belonging to this clan; no entity lookup.
export function drawWatchMarkers({ ctx, toMap, state, clan, scale = 1 }) {
  const contacts = Object.values(state.deployment?.clans[clan]?.sightings || {});
  ctx.save();
  for (const c of contacts) {
    const age = (state.tick - c.seenAt) / 20;
    if (age >= 10) continue;
    const [u, v] = toMap(c.x, c.z), r = (c.priority ? 6 : 4) * scale;
    ctx.globalAlpha = c.live ? .9 : Math.max(.12, .55 * (1 - age / 10));
    ctx.strokeStyle = c.priority ? '#f2c569' : '#c6a6f2'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = c.priority ? 1.6 : 1;
    if (!c.live) ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(u, v-r); ctx.lineTo(u+r, v); ctx.lineTo(u, v+r); ctx.lineTo(u-r, v); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    if (c.priority) { ctx.font = `bold ${Math.round(10 * scale)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', u, v); }
    if (!c.live && c.direction) { const p = toMap(c.x + c.direction.x * 5, c.z + c.direction.z * 5); ctx.beginPath(); ctx.moveTo(u,v); ctx.lineTo(...p); ctx.stroke(); }
  }
  ctx.restore();
}
