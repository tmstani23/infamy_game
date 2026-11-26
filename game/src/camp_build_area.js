// War camp build area while placing a camp building (7c-4, 2026-11-12: the rings go).
// One outline round the whole buildable area (the ground within chainDistance of a normal camp building, merged
// into one shape), and the ground outside it is darkened. Resource camps (lumber camp, quarry) do not extend the
// area, so they are not part of the outline; a new building near the edge pushes the outline out once it stands
// there. While a resource camp is being placed the outside is only lightly dimmed, because it may also stand out
// there by its resource. Presentation only: the rule itself is sim/frontier/war.js placeWhy.
const STEPS = 72;
export function buildAreaAnchors(war, resourceTypes = []) {
  return (war?.camp?.buildings || []).filter(b => Number.isFinite(b.x) && !resourceTypes.includes(b.type));
}
export function inBuildArea(anchors, chain, x, z) { return anchors.some(b => Math.hypot(b.x - x, b.z - z) <= chain); }
// ctx: a full-screen 2D canvas context; view: unitToScreen(x, z, y); W: frontier.json war; resourceTypes: workers.gatherBuildings
export function drawBuildArea(ctx, view, war, W, placingKind = null, resourceTypes = []) {
  const chain = W?.chainDistance ?? 120, anchors = buildAreaAnchors(war, resourceTypes);
  if (!anchors.length) return;
  const pt = (b, i) => { const a = i / STEPS * Math.PI * 2; return [b.x + Math.cos(a) * chain, b.z + Math.sin(a) * chain]; };
  const scr = ([x, z]) => view.unitToScreen(x, z, 0);
  // darken everything, then cut the buildable area back out
  ctx.save();
  ctx.fillStyle = resourceTypes.includes(placingKind) ? 'rgba(6,8,12,.2)' : 'rgba(6,8,12,.45)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
  for (const b of anchors) {
    ctx.beginPath();
    for (let i = 0; i <= STEPS; i++) { const p = scr(pt(b, i)); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // the merged outline: of every circle only the parts that lie outside all the others
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [width, color] of [[5, 'rgba(20,16,10,.55)'], [2.2, 'rgba(240,200,110,.95)']]) {
    ctx.beginPath();
    for (const b of anchors) for (let i = 1; i <= STEPS; i++) {
      const mid = pt(b, i - 0.5);
      if (anchors.some(o => o !== b && Math.hypot(o.x - mid[0], o.z - mid[1]) < chain - 0.01)) continue;   // inside another circle: not part of the outline
      const a = scr(pt(b, i - 1)), c = scr(pt(b, i));
      ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  ctx.restore();
}
