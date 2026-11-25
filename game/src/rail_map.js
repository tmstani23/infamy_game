// Railway lines on the World map and the island minimap (Tim 2026-11-07): laid track glows amber, the rest of a
// line still being laid shows as a faint dashed route, and the railhead (the rail gang) gets a dot with
// "42% · 6 min" beside it. Reads the frontier view only (state.frontier.rail.links, your own links).
// drawRailLines(ctx, links, at, { width, label, seconds }) where at(x, z) -> [px, py] in canvas pixels.
import { pointAt, laidStretches } from './sim/frontier/rail_route.js';

// the points of `line` from distance d0 to d1, ends included
function stretch(line, d0, d1) {
  const pts = line.points, dist = line.dist, out = [pointAt(line, d0)];
  for (let k = 0; k < pts.length; k++) if (dist[k] > d0 && dist[k] < d1) out.push({ x: pts[k][0], z: pts[k][1] });
  out.push(pointAt(line, d1));
  return out;
}
function stroke(ctx, list, at) {
  ctx.beginPath();
  list.forEach((p, k) => { const [u, v] = at(p.x, p.z); k ? ctx.lineTo(u, v) : ctx.moveTo(u, v); });
  ctx.stroke();
}

// 8e-6 (mock D): the marked rail sections of a camp spur in a war, red while they stand (wars = state.frontier.wars.list)
export function drawSupplySections(ctx, links, wars, at, width = 3) {
  ctx.save(); ctx.lineCap = 'round';
  for (const w of Object.values(wars || {})) for (const b of w.camp?.buildings || []) {
    const l = b.type === 'rail_section' && b.rail && links?.[b.rail.link]; if (!l?.points?.length || !(l.length > 0)) continue;
    ctx.strokeStyle = b.stage === 'built' ? 'rgba(232,60,44,.95)' : 'rgba(40,24,20,.85)'; ctx.lineWidth = width * 2;
    ctx.shadowColor = b.stage === 'built' ? 'rgba(255,70,50,.9)' : 'transparent'; ctx.shadowBlur = b.stage === 'built' ? width * 3 : 0;
    stroke(ctx, stretch(l, b.rail.d0, Math.max(b.rail.d0 + 1, b.rail.d1)), at);
  }
  ctx.restore();
}
// the standing marked section of a camp spur within r world units of (x, z), or null (World map hover, 8e-6)
export function supplySectionAt(links, wars, x, z, r) {
  let best = null, bd = r;
  for (const w of Object.values(wars || {})) for (const b of w.camp?.buildings || []) {
    const l = b.type === 'rail_section' && b.stage === 'built' && b.rail && links?.[b.rail.link]; if (!l?.points?.length || !(l.length > 0)) continue;
    const P = stretch(l, b.rail.d0, Math.max(b.rail.d0 + 1, b.rail.d1));
    for (let k = 1; k < P.length; k++) {
      const a = P[k - 1], c = P[k], dx = c.x - a.x, dz = c.z - a.z, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      const d = Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)); if (d <= bd) { bd = d; best = b; }
    }
  }
  return best;
}
// me + clans (train robbery, Tim 2026-11-21): a rival's line (on ground you have discovered) glows in its clan's colour
// Clan colours toned for the painted World map (Tim 2026-11-21: not so primary): mixed toward a warm sepia and eased in
// saturation, so purple reads as a dusty plum and red as a brick red. Accepts #rrggbb; anything else comes back unchanged.
export function mapTint(hex, k = 0.42) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
  const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255], grey = (c[0] + c[1] + c[2]) / 3, sepia = [138, 104, 72];
  return '#' + c.map((v, i) => Math.round((v * 0.8 + grey * 0.2) * (1 - k) + sepia[i] * k).toString(16).padStart(2, '0')).join('');
}
// inked (World map, Tim 2026-11-21): laid track drawn like a map's railway symbol to suit the painted atlas: a soft wash in
// the owner's clan colour, a dark ink rail and cream ties, no glow
export function drawRailLines(ctx, links, at, { width = 3, label = true, seconds = 600, wars = null, me = null, clans = null, inked = false } = {}) {
  const list = Object.values(links || {}).filter(l => l.points?.length > 1 && l.dist?.length === l.points.length && l.length > 0);
  if (!list.length) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const l of list) {
    const built = l.done ? l.length : Math.max(0, Math.min(l.length, l.built || 0));
    if (built < l.length) {   // the route still to lay: faint, dashed
      // a dark casing under bright dashes, so it reads over any ground (Tim 2026-11-08: hard to see)
      const parts = laidStretches(l), rest = stretch(l, parts.length > 1 ? 0 : built, l.length), dw = Math.max(1.5, width * 0.8);
      if (inked) {   // planned route: a faint wash in the owner's toned colour under sepia ink dashes
        ctx.globalAlpha = 0.3; ctx.strokeStyle = mapTint(clans?.[l.owner]?.color) || '#c49a5a'; ctx.lineWidth = width * 2.2; stroke(ctx, rest, at); ctx.globalAlpha = 1;
        ctx.setLineDash([width * 2, width * 1.6]); ctx.strokeStyle = 'rgba(52,36,24,.85)'; ctx.lineWidth = dw; stroke(ctx, rest, at); ctx.setLineDash([]);
      } else {
      ctx.setLineDash([]); ctx.strokeStyle = 'rgba(28,18,10,.6)'; ctx.lineWidth = dw + 2.5; stroke(ctx, rest, at);
      ctx.setLineDash([width * 2.2, width * 1.6]); ctx.strokeStyle = 'rgba(255,232,170,.98)'; ctx.lineWidth = dw;
      stroke(ctx, rest, at);
      ctx.setLineDash([]);
      }
    }
    if (built > 0.5) {   // laid track: an amber glow with a dark rail line down the middle (each crew's stretch)
      const laids = laidStretches(l).filter(([a, b]) => b - a > 0.5).map(([a, b]) => stretch(l, a, b));
      const rival = me && l.owner !== me && clans?.[l.owner]?.color;
      if (inked) {
        ctx.globalAlpha = 0.55; ctx.strokeStyle = mapTint(clans?.[l.owner]?.color) || '#c49a5a'; ctx.lineWidth = width * 2.6; laids.forEach(x => stroke(ctx, x, at)); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#2b1d14'; ctx.lineWidth = width * 1.15; laids.forEach(x => stroke(ctx, x, at));
        ctx.setLineDash([width * 1.4, width * 1.4]); ctx.lineCap = 'butt'; ctx.strokeStyle = '#f5e5ba'; ctx.lineWidth = width * 0.5; laids.forEach(x => stroke(ctx, x, at));
        ctx.setLineDash([]); ctx.lineCap = 'round';
      } else {
      ctx.shadowColor = rival || 'rgba(255,190,80,.95)'; ctx.shadowBlur = width * 3;
      ctx.strokeStyle = rival || 'rgba(255,196,96,.9)'; ctx.lineWidth = width * 1.6; laids.forEach(x => stroke(ctx, x, at));
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(52,34,20,.95)'; ctx.lineWidth = Math.max(1, width * 0.55); laids.forEach(x => stroke(ctx, x, at));
      }
    }
    if (!l.done) {   // the railhead: where the gang is, and how far along
      const heads = laidStretches(l).map(([, d]) => pointAt(l, d)), head = heads[0], [u, v] = at(head.x, head.z);
      for (const h of heads.slice(1)) { const [hu, hv] = at(h.x, h.z); ctx.beginPath(); ctx.arc(hu, hv, width * 1.1, 0, Math.PI * 2); ctx.fillStyle = inked ? '#dcae5c' : '#ffd27a'; ctx.fill(); }
      ctx.shadowColor = inked ? 'transparent' : 'rgba(255,190,80,.95)'; ctx.shadowBlur = inked ? 0 : width * 3;
      ctx.beginPath(); ctx.arc(u, v, width * 1.4, 0, Math.PI * 2); ctx.fillStyle = inked ? '#dcae5c' : '#ffd27a'; ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(40,24,10,.9)'; ctx.stroke();
      if (label) {
        const share = built / l.length, mins = Math.max(1, Math.ceil((1 - share) * (l.seconds ?? seconds) / 60));
        const text = `${Math.floor(share * 100)}% · ${mins} min${l.waiting ? ` · waiting for ${l.waiting}` : ''}`;
        ctx.font = '600 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,24,28,.9)'; ctx.strokeText(text, u + 9, v);
        ctx.fillStyle = l.waiting ? (inked ? '#e0906a' : '#ff9a6a') : (inked ? '#ecdcb4' : '#ffe2a0'); ctx.fillText(text, u + 9, v);
      }
    }
  }
  ctx.restore();
  if (wars) drawSupplySections(ctx, links, wars, at, width);   // 8e-6
}
