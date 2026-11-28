// Hidden place marks (world variety P3, 2026-11-27; mock and critic rounds in project files war_build/world_variety/p3_discovery).
// Drawn on the minimap and the World map from game.hidden.viewFor(clan) (sim/hidden_places.js), which only ever lists
// places the clan was told of or reached:
//   rumour  a loose sepia ink wash over the area (the place is somewhere inside, never at the middle)
//   near    the place's mark in ink with a soft lantern glow breathing under it; the first second and a half after it
//           comes near, a vermilion brush circle spreads round it and fades (with the chime, render/sound.js)
//   found   the mark stamped: a vermilion seal behind the ink mark
// The marks are drawn in code for now; the painted marks (prompt: art_prompts/icons_and_crests/relics_and_map_marks_prompt.md
// sheet B) replace markImage() when they arrive as art/ui/map/hidden_<kind>.png.
const FLASH_MS = 1600;
const wob = (i, k) => { const n = x => { const t = Math.sin(x * 127.1 + k * 311.7) * 43758.5453; return (t - Math.floor(t)) * 2 - 1; }; const a = i / 6, f = Math.floor(a), q = a - f, sm = q * q * (3 - 2 * q); return 0.7 * (n(f) * (1 - sm) + n(f + 1) * sm) + 0.3 * n(i * 0.37 + k); };
const seedOf = id => { let h = 7; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 9973; return h; };

// painted marks (2026-11-27, cut from assets/ui/raw/hidden_place_marks.png): art/ui/map/hidden_relic.png, hidden_cache.png,
// hidden_sight.png, hidden_seal.png; a missing file stays null and the drawn stand-in shows
const IMG = {};
function markImage(name) {
  if (typeof Image === 'undefined') return null;
  if (!(name in IMG)) { IMG[name] = null; const im = new Image(); im.onload = () => { IMG[name] = im; }; im.src = `art/ui/map/hidden_${name}.png`; }
  return IMG[name];
}

// the stand-in marks: relic site (a shrine with crossed roof beams and a sealed door), cache (a banded strongbox half sunk)
function inkMark(ctx, kind, u, a) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    if (kind === 'cache') {
      ctx.moveTo(-4.6 * u, -0.4 * u); ctx.lineTo(4.6 * u, -0.4 * u); ctx.lineTo(4.6 * u, 3.6 * u); ctx.lineTo(-4.6 * u, 3.6 * u); ctx.closePath();
      ctx.moveTo(-4.6 * u, -0.4 * u); ctx.lineTo(-4 * u, -3 * u); ctx.lineTo(4.2 * u, -3.6 * u); ctx.lineTo(4.6 * u, -0.4 * u);
      ctx.moveTo(-2.2 * u, -3.2 * u); ctx.lineTo(-2.2 * u, 3.6 * u); ctx.moveTo(2.2 * u, -3.4 * u); ctx.lineTo(2.2 * u, 3.6 * u);
      ctx.moveTo(-6 * u, 4.4 * u); ctx.quadraticCurveTo(0, 3.4 * u, 6 * u, 4.4 * u);
    } else {
      ctx.moveTo(-5.6 * u, -0.6 * u); ctx.lineTo(0, -3.4 * u); ctx.lineTo(5.6 * u, -0.6 * u);
      ctx.moveTo(-4.4 * u, -5.4 * u); ctx.lineTo(-6.2 * u, -0.6 * u); ctx.moveTo(-6.2 * u, -5.4 * u); ctx.lineTo(-4.2 * u, -0.8 * u);
      ctx.moveTo(4.4 * u, -5.4 * u); ctx.lineTo(6.2 * u, -0.6 * u); ctx.moveTo(6.2 * u, -5.4 * u); ctx.lineTo(4.2 * u, -0.8 * u);
      ctx.moveTo(-3.6 * u, -1.6 * u); ctx.lineTo(-3.6 * u, 4.2 * u); ctx.moveTo(3.6 * u, -1.6 * u); ctx.lineTo(3.6 * u, 4.2 * u);
      ctx.moveTo(-5 * u, 4.6 * u); ctx.lineTo(5 * u, 4.6 * u);
    }
  };
  path(); ctx.strokeStyle = `rgba(240,226,190,${0.6 * a})`; ctx.lineWidth = 2.6 * u; ctx.stroke();   // paper edge, as the other map symbols
  path(); ctx.strokeStyle = `rgba(36,20,8,${0.92 * a})`; ctx.lineWidth = 1.05 * u; ctx.stroke();
  if (kind !== 'cache') { ctx.beginPath(); ctx.rect(-1.5 * u, 1 * u, 3 * u, 2.6 * u); ctx.fillStyle = `rgba(156,59,34,${a})`; ctx.fill(); }
  else { ctx.beginPath(); ctx.rect(-4.2 * u, 0, 8.4 * u, 3.2 * u); ctx.fillStyle = `rgba(201,154,58,${0.45 * a})`; ctx.fill(); }
}
function drawMark(ctx, kind, x, y, scale, a = 1) {
  const im = markImage(kind === 'cache' ? 'cache' : kind === 'sight' ? 'sight' : 'relic'), s = 26 * scale;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.08);
  if (im) { ctx.globalAlpha = a; ctx.drawImage(im, -s / 2, -s / 2, s, s); }
  else inkMark(ctx, kind, 1.45 * scale, a);
  ctx.restore();
}
// the found seal: worn vermilion square, ragged edge, ink thin in patches
function seal(ctx, x, y, scale, seed) {
  const im = markImage('seal'), h = 10 * scale;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.1);
  if (im) { const k = 1.45 * h; ctx.globalAlpha = 0.95; ctx.drawImage(im, -k, -k, 2 * k, 2 * k); ctx.restore(); return; }
  ctx.beginPath(); const n = 10;
  for (let side = 0; side < 4; side++) for (let i = 0; i < n; i++) {
    const t = i / n, j = wob(side * n + i, seed) * 0.9;
    const p = [[-h + 2 * h * t, -h + j], [h + j, -h + 2 * h * t], [h - 2 * h * t, h + j], [-h + j, h - 2 * h * t]][side];
    (side || i) ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
  }
  ctx.closePath(); ctx.fillStyle = 'rgba(146,48,30,.78)'; ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.arc(wob(i * 3, seed + 7) * h, wob(i * 3, seed + 8) * h, 0.4 + 0.9 * Math.abs(wob(i, seed + 9)), 0, 7); ctx.fillStyle = `rgba(0,0,0,${0.2 + 0.3 * Math.abs(wob(i, seed + 10))})`; ctx.fill(); }
  ctx.restore();
}
// the flash: one tapered dry-brush circle, heavy at the start, breaking up toward the tail, spreading and fading once
function enso(ctx, x, y, r, a, w, seed) {
  ctx.save(); ctx.lineCap = 'round';
  const start = -1.9, span = Math.PI * 1.8, n = 90;
  for (let bristle = 0; bristle < 5; bristle++) {
    const off = (bristle - 2) / 2 * w * 0.45;
    for (let i = 0; i < n; i++) {
      const t = i / n, a0 = start + t * span, a1 = start + (i + 1.25) / n * span;
      const press = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - t * 0.7);
      const dry = 0.5 + 0.5 * wob(i + bristle * 37, seed); if (dry < 0.12 + t * 0.55) continue;
      const rr = r * (1 + 0.06 * wob(i * 0.5, seed + 11)) + off * press;
      ctx.beginPath(); ctx.ellipse(x, y, rr * 1.04, rr * 0.96, 0.3, a0, a1);
      ctx.strokeStyle = `rgba(${130 + bristle * 3},${38 + bristle * 2},26,${a * (0.4 + 0.6 * dry)})`; ctx.lineWidth = w * 0.22 * press + 0.2; ctx.stroke();
    }
  }
  ctx.restore();
}
function glow(ctx, x, y, r, a) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, `rgba(255,232,176,${0.7 * a})`); g.addColorStop(0.6, `rgba(250,206,120,${0.32 * a})`); g.addColorStop(1, 'rgba(250,206,120,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// one place at canvas point (x, y). scale 1 = minimap size. nearAt: performance.now() when it first came near (for the flash)
export function drawHiddenPlace(ctx, v, x, y, { scale = 1, now = performance.now(), nearAt = null } = {}) {
  const seed = seedOf(v.id);
  const kind = v.placeKind || v.kind;
  if (v.state === 'found') { seal(ctx, x, y, scale, seed); drawMark(ctx, kind, x, y, scale * (markImage('seal') ? 0.82 : 0.92)); return; }
  if (v.state === 'all') { drawMark(ctx, kind, x, y, scale, 0.92); return; }   // Show everything (test): the plain mark, no seal, no glow
  const breathe = 0.65 + 0.35 * Math.sin(now / 650);
  glow(ctx, x, y, 20 * scale * (0.9 + 0.1 * breathe), breathe);
  const age = nearAt == null ? Infinity : now - nearAt;
  if (age < FLASH_MS) { const k = age / FLASH_MS; enso(ctx, x, y, (16 + 16 * k) * scale, 0.62 * (1 - k * k), 8 * scale, seed); }
  drawMark(ctx, kind, x, y, scale, 0.92);
}
// the rumour wash over an area: centre (x, y), radius r in canvas pixels; loose, see-through, darker at a broken rim
export function drawRumourWash(ctx, id, x, y, r) {
  const seed = seedOf(id), n = 72;
  ctx.save();
  const blot = (rr, amp, k) => { ctx.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, q = rr * (1 + amp * wob(i % n, seed + k)); i ? ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q) : ctx.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath(); };
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.05);
  g.addColorStop(0, 'rgba(92,60,30,.10)'); g.addColorStop(0.75, 'rgba(92,60,30,.16)'); g.addColorStop(1, 'rgba(60,36,16,.28)');
  blot(r, 0.08, 1); ctx.fillStyle = g; ctx.fill();
  blot(r, 0.08, 1); ctx.strokeStyle = 'rgba(60,36,16,.38)'; ctx.lineWidth = Math.max(1, r * 0.025); ctx.setLineDash([r * 0.18, r * 0.07, r * 0.05, r * 0.06]); ctx.stroke();
  ctx.restore();
}
// hover words for a place (real names and numbers; no special characters)
export function hiddenTip(v) {
  if (v.state === 'rumour') return { name: `Rumour: ${v.name}`, note: `Somewhere in this area, ${v.where}. Ride in and it flashes on your minimap.` };
  if (v.state === 'near') return { name: `${v.name} (${v.label})`, note: 'Close by. Ride to the mark to find it.' };
  return { name: `${v.name} (${v.label})`, note: v.what || '' };
}
