// Landable shore (ships S6b, plan 1.5 helpers 1 and 2). While anyone of yours is aboard a ship, the shore a ship can
// land its people on shows as a soft pale line at the water's edge: in the world (render/shore_line.js), on the minimap
// and on the World map. Blocked coast (cliffs, mountain, outside the war circle) stays dark. The line runs on the drawn
// shore (sim/shoreline.js fillets, as render/coastline.js) wherever the water grid (sim/frontier/water_nav.js) says the
// land beside it is landable for that ship's water. While ships take your right-click, the cursor shows an anchor over
// landable shore and a red mark over blocked coast. Pure functions of the world and the state (Node-tested); the
// drawing helper needs a 2D canvas.
//   shoreWanted(game, owner) -> [{ key, box, water }]   the war circles your people are afloat in
//   shoreLine(world, box, water) -> [[{ x, z, nx, nz, s }, ...], ...]   landable stretches, normal toward the water
//   landMark(world, x, z, water, box) -> 'anchor' | 'blocked' | null
//   drawShore(ctx, runs, project, width)   the pale line on a map
import { coastSamples } from './world_coast.js';
import { terrainAt } from './sim/world_data.js';
import { waterGrid, landable, waterAt, sailable } from './sim/frontier/water_nav.js';
import { SIZE, SEE } from './cursors.js';

const WET = c => c === 'w' || c === 'r';
const inBox = (box, x, z) => !box || Math.hypot(x - box.x, z - box.z) <= box.r;

export function shoreWanted(game, owner) {
  const st = game?.state, out = new Map();
  if (!st || owner == null || !game.ships?.boxOf) return [];
  for (const u of Object.values(st.entities)) {
    if (!u.inShip || u.dead || u.owner !== owner) continue;
    const s = st.entities[u.inShip]; if (!s?.ship || s.dead) continue;
    const box = game.ships.boxOf(s); if (!box) continue;
    const water = game.frontier?.data?.war?.ships?.kinds?.[s.warUnit]?.water || 'big';
    const key = `${Math.round(box.x)},${Math.round(box.z)},${Math.round(box.r)},${water}`;
    if (!out.has(key)) out.set(key, { key, box, water });
  }
  return [...out.values()];
}

const lines = new WeakMap();
export function shoreLine(world, box, water = 'big', step = 3) {
  let per = lines.get(world); if (!per) lines.set(world, per = new Map());
  const key = `${Math.round(box.x)},${Math.round(box.z)},${Math.round(box.r)},${water},${step}`;
  if (per.has(key)) return per.get(key);
  const g = waterGrid(world), runs = [], pad = box.r + 40;
  for (const loop of coastSamples(world, { sampleStep: step, miterLimit: 1.5, inland: { enabled: true } })) {
    if (!loop.points.some(v => Math.abs(v.p[0] - box.x) < pad && Math.abs(v.p[1] - box.z) < pad)) continue;
    let run = null;
    const end = () => { if (run && run.length > 2) runs.push(run); run = null; };
    for (const v of loop.points) {
      const [x, z] = v.p, nx = -v.normal[0], nz = -v.normal[1];   // the sampled normal points to the land: ours to the water
      const ok = inBox(box, x, z) && [6, 14].some(k => landable(g, x - nx * k, z - nz * k, water));
      if (!ok) { end(); continue; }
      (run ||= []).push({ x, z, nx, nz, s: v.s });
    }
    end();
  }
  per.set(key, runs);
  return runs;
}

export function landMark(world, x, z, water = 'big', box = null) {
  const g = waterGrid(world);
  if (waterAt(g, x, z) || WET(terrainAt(world, x, z))) return null;   // over water: a plain sail order
  const c = g.cell, near = (r, test) => { for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (test(x + di * c, z + dj * c)) return true; return false; };
  // landable shore at the spot or the cell beside it: the ship lands right there
  if (near(1, (px, pz) => inBox(box, px, pz) && landable(g, px, pz, water))) return 'anchor';
  // blocked coast: land within two cells of the ship's water with no landable shore beside it
  return near(2, (px, pz) => sailable(g, px, pz, water)) ? 'blocked' : null;
}

export function drawShore(ctx, runs, project, r = 1.2, step = 5) {
  if (!runs?.length) return;
  ctx.save(); ctx.fillStyle = '#f2dfae'; ctx.strokeStyle = 'rgba(78,50,22,.6)'; ctx.lineWidth = 0.8; ctx.shadowColor = 'rgba(40,25,10,.55)'; ctx.shadowBlur = 2.5;   // a thin sepia rim: reads on snow and pale land too
  // soft, slightly uneven sand dots, like brush marks, along the shore smoothed a little at the corners
  for (const run of runs) {
    let pts = run.map(p => project(p.x, p.z));
    for (let k = 0; k < 2; k++) pts = pts.map((p, i) => i && i < pts.length - 1 ? [(pts[i - 1][0] + 2 * p[0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * p[1] + pts[i + 1][1]) / 4] : p);
    let next = 0, n = 0;   // distance along this segment to the next dot
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay);
      for (; next <= d; next += step, n++) {
        const q = Math.sin(n * 12.9898 + run[0].x) * 43758.5453, rr = r * (0.8 + 0.35 * (q - Math.floor(q)));
        ctx.beginPath(); ctx.ellipse(ax + (bx - ax) * next / (d || 1), ay + (by - ay) * next / (d || 1), rr * 1.15, rr * 0.85, Math.atan2(by - ay, bx - ax), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      next -= d;
    }
  }
  ctx.restore();
}

// the cursors (drawn on 40, shown at cursors.js SIZE, hot spot in the middle): a dark ink anchor on a cream disc; the same anchor struck through in
// vermilion for blocked coast, so the two read as a pair
const disc = "<circle cx='20' cy='20' r='17.6' fill='#efe4c6' stroke='#1d1208' stroke-width='3'/>";
const ANCHOR = "<g fill='none' stroke='#1d1208' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><circle cx='20' cy='10.6' r='2.4'/><path d='M20 13v18.4M14.6 16.4h10.8M10.8 24c1 4.8 4.4 7.2 9.2 7.2s8.2-2.4 9.2-7.2M8.8 26.2l2-2.4 2.8 1.2M31.2 26.2l-2-2.4-2.8 1.2'/></g>";
const svg = body => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${SIZE}' height='${SIZE}' viewBox='0 0 40 40'><g opacity='${SEE}'>${disc}${body}</g></svg>`)}") ${SIZE / 2} ${SIZE / 2}`;   // the size of the other pointers (src/cursors.js)
const STRIKE = "<path d='M8.6 31.4L31.4 8.6' stroke='#efe4c6' stroke-width='5.4' stroke-linecap='round'/><path d='M8.6 31.4L31.4 8.6' stroke='#b0443a' stroke-width='2.8' stroke-linecap='round'/>";
export const SHORE_CURSOR = { anchor: `${svg(ANCHOR)}, pointer`, blocked: `${svg(ANCHOR + STRIKE)}, not-allowed` };
