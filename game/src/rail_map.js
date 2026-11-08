// Railway lines on the World map and the island minimap (Tim 2026-11-07): laid track glows amber, the rest of a
// line still being laid shows as a faint dashed route, and the railhead (the rail gang) gets a dot with
// "42% · 6 min" beside it. Reads the frontier view only (state.frontier.rail.links, your own links).
// drawRailLines(ctx, links, at, { width, label, seconds }) where at(x, z) -> [px, py] in canvas pixels.
import { pointAt } from './sim/frontier/rail_route.js';

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

export function drawRailLines(ctx, links, at, { width = 3, label = true, seconds = 600 } = {}) {
  const list = Object.values(links || {}).filter(l => l.points?.length > 1 && l.dist?.length === l.points.length && l.length > 0);
  if (!list.length) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const l of list) {
    const built = l.done ? l.length : Math.max(0, Math.min(l.length, l.built || 0));
    if (built < l.length) {   // the route still to lay: faint, dashed
      // a dark casing under bright dashes, so it reads over any ground (Tim 2026-11-08: hard to see)
      const rest = stretch(l, built, l.length), dw = Math.max(1.5, width * 0.8);
      ctx.setLineDash([]); ctx.strokeStyle = 'rgba(28,18,10,.6)'; ctx.lineWidth = dw + 2.5; stroke(ctx, rest, at);
      ctx.setLineDash([width * 2.2, width * 1.6]); ctx.strokeStyle = 'rgba(255,232,170,.98)'; ctx.lineWidth = dw;
      stroke(ctx, rest, at);
      ctx.setLineDash([]);
    }
    if (built > 0.5) {   // laid track: an amber glow with a dark rail line down the middle
      const laid = stretch(l, 0, built);
      ctx.shadowColor = 'rgba(255,190,80,.95)'; ctx.shadowBlur = width * 3;
      ctx.strokeStyle = 'rgba(255,196,96,.9)'; ctx.lineWidth = width * 1.6; stroke(ctx, laid, at);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(52,34,20,.95)'; ctx.lineWidth = Math.max(1, width * 0.55); stroke(ctx, laid, at);
    }
    if (!l.done) {   // the railhead: where the gang is, and how far along
      const head = pointAt(l, built), [u, v] = at(head.x, head.z);
      ctx.shadowColor = 'rgba(255,190,80,.95)'; ctx.shadowBlur = width * 3;
      ctx.beginPath(); ctx.arc(u, v, width * 1.4, 0, Math.PI * 2); ctx.fillStyle = '#ffd27a'; ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(40,24,10,.9)'; ctx.stroke();
      if (label) {
        const share = built / l.length, mins = Math.max(1, Math.ceil((1 - share) * seconds / 60));
        const text = `${Math.floor(share * 100)}% · ${mins} min${l.waiting ? ` · waiting for ${l.waiting}` : ''}`;
        ctx.font = '600 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,24,28,.9)'; ctx.strokeText(text, u + 9, v);
        ctx.fillStyle = l.waiting ? '#ff9a6a' : '#ffe2a0'; ctx.fillText(text, u + 9, v);
      }
    }
  }
  ctx.restore();
}
