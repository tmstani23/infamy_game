// Town growth effects (economy balance B7, mock approved by Tim 2026-11-05). Draw only: reads the town
// records' fx list (sim/frontier/arrivals.js) and paints, on a 2D canvas over the world view:
//   level  - a thin isometric scaffold round the house plus a muted dust cloud, and the new house's name
//            rising in small gold letters (combat-text style)
//   arrive - a small "+1" rising over the house a newcomer walked into
// Positions are world points projected with view.unitToScreen(x, z, height), so the scaffold follows the
// ground diamond of the cell. No glow, no textures. fxTicks (data.arrivals) sets how long each shows.
import { cellToWorld } from './sim/frontier/town_grid.js';

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
  function label(p, text, alpha, rise, size = 13, gold = false) {
    ctx.font = `${size > 13 || gold ? 700 : 600} ${size}px Georgia, serif`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = 3; ctx.strokeStyle = `rgba(30,24,18,${0.85 * alpha})`; ctx.fillStyle = gold ? `rgba(242,196,84,${alpha})` : `rgba(240,226,180,${alpha})`;
    ctx.strokeText(text, p.x, p.y - rise); ctx.fillText(text, p.x, p.y - rise);
  }
  function update(towns, tick, show = true) {
    if (canvas.width !== innerWidth || canvas.height !== innerHeight) { canvas.width = innerWidth; canvas.height = innerHeight; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!show) return;
    for (const s of towns || []) for (const f of s.fx || []) {
      if (!s.grid) continue;
      const k = (tick - f.tick) / life;
      if (k < 0 || k > 1) continue;
      if (f.kind === 'level') scaffold(s, f, k);
      else if (f.kind === 'arrive') { const [x, z] = cellToWorld(s, f.cell); label(P(x, z, s.grid.cell * 0.9), '+1', k > 0.6 ? (1 - k) / 0.4 : 1, k * 24, 18); }
    }
  }
  return { update };
}
