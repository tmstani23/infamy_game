// Town growth effects (economy balance B7, mock approved by Tim 2026-11-05). Draw only: reads the town
// records' fx list (sim/frontier/arrivals.js) and paints, on a 2D canvas over the world view:
//   level  - a thin isometric scaffold round the house plus a muted dust cloud, and the new house's name
//            rising in small gold letters (combat-text style)
//   arrive - a small "+1" rising over the house a newcomer walked into
//   fireworks - a town hall tier-up or a capture: rockets from the hall for fireworksTicks (Tim 2026-11-05, restyled 2026-11-25)
// Positions are world points projected with view.unitToScreen(x, z, height), so the scaffold follows the
// ground diamond of the cell. No glow, no textures. fxTicks (data.arrivals) sets how long each shows.
import { cellToWorld, centreCell } from './sim/frontier/town_grid.js';

export function createTownGrowthFx({ view, data }) {
  const canvas = document.createElement('canvas');
  canvas.id = 'towngrowthfx';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '3' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const life = data?.arrivals?.fxTicks || 80;
  const stageName = st => data?.zones?.kinds?.housing?.stages?.[st - 1]?.replace(/_/g, ' ') || 'house';
  const P = (x, z, y) => view.unitToScreen(x, z, y);
  function line(a, b, width, alpha) {
    ctx.strokeStyle = `rgba(110,80,48,${alpha})`; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function scaffold(s, f, k) {
    const [x, z] = cellToWorld(s, f.cell), h = s.grid.cell * 0.42, top = s.grid.cell * 0.75;
    const fade = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
    // dust first (on the ground, under the poles): soft muted puffs that spread and thin out
    for (let n = 0; n < 9; n++) {
      const a = n / 9 * Math.PI * 2 + n, r = h * (0.9 + 0.5 * k) * (0.7 + (n % 3) * 0.18);
      const c = P(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.3 + (n % 2) * 0.4), size = (10 + (n % 4) * 4) * (0.8 + k);
      ctx.fillStyle = `rgba(196,180,150,${0.32 * (1 - k) * fade})`;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, size, size * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    // four corner poles on the cell's ground diamond, ledgers at three heights; back faces fainter
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([dx, dz]) => [x + dx, z + dz]);
    const screen = corners.map(([cx, cz]) => P(cx, cz, 0)), back = screen.indexOf(screen.reduce((m, p) => p.y < m.y ? p : m));
    const alphaFor = i => (i === back ? 0.35 : 0.85) * fade;
    corners.forEach(([cx, cz], i) => line(P(cx, cz, 0), P(cx, cz, top), 1.6, alphaFor(i)));
    for (const y of [top * 0.35, top * 0.7, top]) for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, a = alphaFor(i === back || j === back ? back : i);
      line(P(...corners[i], y), P(...corners[j], y), 1.2, a);
    }
    // one diagonal brace on each front face
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; if (i !== back && j !== back) line(P(...corners[i], 0), P(...corners[j], top * 0.7), 1, 0.6 * fade); }
    // combat-text style: the new house's name in small gold letters, rising and fading over about 2 s (Tim 2026-11-05)
    const tk = k * life / 40;
    if (tk <= 1) { const name = stageName(f.stage); label(P(x, z, top + 1), name[0].toUpperCase() + name.slice(1), tk > 0.6 ? (1 - tk) / 0.4 : 1, tk * 22, 12, true); }
  }
  // "+1 Homed" (Tim 2026-11-05: cooler than a plain +1): a pop, a ring of gold sparks, then the text drifts up
  function homed(p, k) {
    const a = k > 0.65 ? (1 - k) / 0.35 : 1, pop = k < 0.12 ? 0.6 + 0.4 * Math.sin(k / 0.12 * Math.PI / 2) * 1.25 : 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (k < 0.5) { const r = 6 + k * 70, sa = 1 - k / 0.5;
      ctx.strokeStyle = `rgba(255,214,120,${0.45 * sa})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      for (let n = 0; n < 10; n++) { const an = n / 10 * Math.PI * 2, rr = r * 0.9;
        ctx.fillStyle = `rgba(255,232,160,${0.8 * sa})`; ctx.beginPath(); ctx.arc(p.x + Math.cos(an) * rr, p.y + 6 + Math.sin(an) * rr * 0.5 - k * 20, 2, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
    const rise = k * 30, y = p.y - rise;
    ctx.save(); ctx.translate(p.x, y); ctx.scale(pop, pop); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = '700 22px Georgia, serif'; ctx.lineWidth = 4; ctx.strokeStyle = `rgba(30,20,10,${0.9 * a})`; ctx.fillStyle = `rgba(255,214,110,${a})`;
    ctx.strokeText('+1', -26, 0); ctx.fillText('+1', -26, 0);
    ctx.font = '700 15px Georgia, serif'; ctx.lineWidth = 3; ctx.fillStyle = `rgba(250,240,210,${a})`; ctx.textAlign = 'left';
    ctx.strokeText('Homed', -12, -2); ctx.fillText('Homed', -12, -2); ctx.restore();
  }
  function label(p, text, alpha, rise, size = 13, gold = false) {
    ctx.font = `${size > 13 || gold ? 700 : 600} ${size}px Georgia, serif`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = 3; ctx.strokeStyle = `rgba(30,24,18,${0.85 * alpha})`; ctx.fillStyle = gold ? `rgba(242,196,84,${alpha})` : `rgba(240,226,180,${alpha})`;
    ctx.strokeText(text, p.x, p.y - rise); ctx.fillText(text, p.x, p.y - rise);
  }
  // Fireworks (restyled Tim 2026-11-25, capture mock /mnt/project-files/capture_moment/): chrysanthemum bursts, mostly
  // gold with some in the town owner's colour (the victor's on a capture). Streaks shoot out from a hot core, droop,
  // end in a bright pearl and shed falling sparks; everything a little see-through. Rocket n launches every `every`
  // ticks from the hall, climbs for `climb` ticks, then bursts for `burst`. All derives from (f.tick, n), so every
  // client draws the same show with no stored particles. A tier-up also names the new tier over the hall.
  const FW = { every: 13, climb: 20, burst: 52, sparks: 44, gold: '255,200,96', see: 0.85 };
  const rnd = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  const rgbOf = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const v = parseInt(m[1], 16); return `${v >> 16},${(v >> 8) & 255},${v & 255}`; };
  function fireworks(s, f, t, life, clans) {
    const hx = s.x, hz = s.z, base = s.grid.cell * 0.9, age = t - f.tick;
    const accent = rgbOf(clans?.[f.clan ?? s.owner]?.color) || '255,150,90';
    const unit = (x, z, y) => { const a = P(x, z, y), b = P(x, z, y + 1); return Math.max(0.5, Math.hypot(a.x - b.x, a.y - b.y)); };
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let n = 0; n * FW.every <= Math.min(age, life - FW.climb - FW.burst); n++) {
      const t0 = n * FW.every + Math.floor(rnd(n, 9) * 5), k = age - t0;
      if (k < 0 || k > FW.climb + FW.burst) continue;
      const size = n % 3 === 0 ? 1.35 : 0.7 + rnd(n, 1) * 0.45, peak = base + 26 + rnd(n, 5) * 34 + size * 8;
      const dx = (rnd(n, 2) - 0.5) * s.grid.cell * 5, dz = (rnd(n, 3) - 0.5) * s.grid.cell * 5;
      const color = rnd(n, 4) < 0.34 ? accent : FW.gold;
      if (k < FW.climb) {   // the rising rocket: a fading spark trail
        const u = k / FW.climb, e = 1 - (1 - u) * (1 - u);
        for (let j = 0; j < 9; j++) {
          const v = Math.max(0, e - j * 0.035), p = P(hx + dx * v, hz + dz * v, base + (peak - base) * v);
          ctx.fillStyle = `rgba(255,214,150,${(0.85 - j * 0.09) * FW.see})`; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, 2 - j * 0.18), 0, Math.PI * 2); ctx.fill();
        }
        continue;
      }
      const u = (k - FW.climb) / FW.burst, c = P(hx + dx, hz + dz, peak), px = unit(hx + dx, hz + dz, peak);
      const reach = 26 * size * px, fade = (u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35) * FW.see;
      const at = (a, w) => { const r = reach * (1 - Math.pow(1 - w, 3)); return [c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.85 + 7 * px * w * w]; };
      if (u < 0.15) {   // the flash at the core
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, reach * 0.7 + 8);
        g.addColorStop(0, `rgba(255,246,220,${0.55 * (1 - u / 0.15)})`); g.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, reach * 0.7 + 8, 0, Math.PI * 2); ctx.fill();
      }
      const count = Math.round(FW.sparks * (0.7 + 0.5 * size));
      for (let j = 0; j < count; j++) {
        const a = j / count * Math.PI * 2 + (rnd(n, j) - 0.5) * 0.08, tw = 0.75 + 0.25 * Math.sin(t * 1.3 + j * 2.1);
        // the streak: from a bit behind the head to the head, brighter toward the head
        const head = Math.min(1, u * 1.15), tail = Math.max(0, head - 0.35);
        for (let q = 0; q < 3; q++) {
          const w0 = tail + (head - tail) * q / 3, w1 = tail + (head - tail) * (q + 1) / 3, [x0, y0] = at(a, w0), [x1, y1] = at(a, w1);
          ctx.strokeStyle = `rgba(${color},${(0.12 + 0.28 * q) * fade * tw})`; ctx.lineWidth = 1.2 + 0.4 * size;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
        const [x, y] = at(a, head);
        ctx.fillStyle = `rgba(255,240,205,${0.9 * fade * tw})`; ctx.beginPath(); ctx.arc(x, y, 1.1 + 0.6 * size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(${color},${0.16 * fade * tw})`; ctx.beginPath(); ctx.arc(x, y, 4 * size, 0, Math.PI * 2); ctx.fill();   // soft halo
        if (j % 3 === 0 && u > 0.45) for (let d = 1; d <= 3; d++) {   // falling sparks shed from the tips
          const fall = (u - 0.45) * 26 * px * d / 3, sa = fade * (1 - d / 4) * 0.8;
          ctx.fillStyle = `rgba(255,${190 - d * 25},${110 - d * 25},${sa})`; ctx.beginPath(); ctx.arc(x + Math.sin(j + d) * 1.5, y + fall, 1, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
    // a tier-up names the new tier over the hall for the first few seconds (a capture names the town in the war bar)
    const name = !f.capture && data?.tiers?.list?.[(f.tier || 2) - 1]?.name;
    if (name && age < 120) { const a = age < 10 ? age / 10 : age > 90 ? (120 - age) / 30 : 1; label(P(hx, hz, base + 8), `${name}!`, a, age * 0.15, 26, true); }
  }
  let lastTick = -1, lastAt = 0;
  function update(towns, tick, show = true, clans = null) {
    // fractional ticks between 20 Hz sim steps keep the rockets smooth at any frame rate
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (tick !== lastTick) { lastTick = tick; lastAt = now; }
    const smooth = tick + Math.min(1, (now - lastAt) / 50);
    if (canvas.width !== innerWidth || canvas.height !== innerHeight) { canvas.width = innerWidth; canvas.height = innerHeight; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!show) return;
    // a town hall upgrade in progress: a big scaffold round the hall the whole time (Tim 2026-11-05)
    for (const s of towns || []) if (s.tierUpgrade && s.grid) {
      const big = { ...s, grid: { ...s.grid, cell: s.grid.cell * 2.2 } };
      scaffold(big, { cell: centreCell(s.grid.n), stage: 1 }, 0.6 + 0.1 * Math.sin(smooth / 30));
      const u = s.tierUpgrade, P0 = P(s.x, s.z, s.grid.cell * 2.4);
      label(P0, `Upgrading · ${Math.max(0, Math.ceil(u.left))}s`, 0.9, 0, 13, true);
    }
    for (const s of towns || []) for (const f of s.fx || []) {
      if (!s.grid) continue;
      if (f.kind === 'fireworks') { const fl = data?.arrivals?.fireworksTicks || 400; if (smooth - f.tick >= 0 && smooth - f.tick <= fl) fireworks(s, f, smooth, fl, clans); continue; }
      const k = (tick - f.tick) / life;
      if (k < 0 || k > 1) continue;
      if (f.kind === 'level') scaffold(s, f, k);
      else if (f.kind === 'arrive') { const [x, z] = f.x != null ? [f.x, f.z] : cellToWorld(s, f.cell); homed(P(x, z, s.grid.cell * 0.9), k); }
    }
  }
  return { update };
}
