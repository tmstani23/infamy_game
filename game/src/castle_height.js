// Castle terraces drawn raised (Z4h, Tim 2026-11-19: "the raised terraces and land bridge"). Drawing only: the sim
// stays flat, and the castle's cliff cells and fenced land bridges (sim/frontier/castle.js, town_grid.js) keep
// walkers from ever stepping across a height jump. No three.js here, so Node tests can check it.
//   createHeightField(castles, { levelHeight }) -> { at(x, z), near(x, z, margin), list }
//     castles: [{ id, x, z, n, cell, level, slope, ramps }] from town_props.js (castle grids: level '.' outside the
//     castle, 0 yard, 1 inner terrace, 2 keep; slope and ramps from castle.js)
//   terrainPieces(c, H) -> { top1, top2, rim, ramp, face }: quads ([x, y, z] x4 and a shade) for render/world_ground.js
//   groundY(x, z): the drawn ground height at a point, from the field set by setHeightField (0 with none)
//   nearCastle(x, z, margin): inside a castle's box (things there are depth tested against the terraces)
import { dockShape, deckY, dockPieces, DOCK } from './dock_shape.js';
const EPS = 1e-4;
const PARAPET = { w: 1, h: 1.6, shadeIn: 0.8, shadeOut: 0.92 };
// footing along the bottom of a face: out over the ground (w), up the face (h); wobble/wobbleUp vary its edges, fade/fadeUp are the soft edges (world units)
const FOOT = { w: 2.6, h: 1.8, wobble: 0.65, wobbleUp: 0.45, steps: 8, fade: 2.2, fadeUp: 1.6, lift: 0.04 };

function prep(c) {
  const mid = (c.n - 1) / 2, ramp = new Map();
  for (const r of c.ramps || []) for (const [i, along] of r.cells) ramp.set(i, { along, len: r.len, lo: r.lo, hi: r.hi, dir: r.dir });
  const half = (c.n / 2) * c.cell;
  // the box of the castle's own cells (anything marked with a level)
  let c0 = c.n, c1 = -1, r0 = c.n, r1 = -1;
  for (let i = 0; i < c.n * c.n; i++) if (c.level[i] !== '.') { const col = i % c.n, row = (i - col) / c.n; c0 = Math.min(c0, col); c1 = Math.max(c1, col); r0 = Math.min(r0, row); r1 = Math.max(r1, row); }
  const box = c1 < 0 ? null : { minX: c.x + (c0 - mid - 0.5) * c.cell, maxX: c.x + (c1 - mid + 0.5) * c.cell, minZ: c.z + (r0 - mid - 0.5) * c.cell, maxZ: c.z + (r1 - mid + 0.5) * c.cell };
  const prepped = { ...c, mid, ramp, half, box, pierSet: new Set(c.pier || []) };
  prepped.dock = dockShape(prepped);   // the dock drawn on piles (src/dock_shape.js)
  return prepped;
}

// height of cell i at (u, v) across it (u along +x, v along +z, 0..1), in levels
function cellLevel(c, i, u, v) {
  const r = c.ramp.get(i);
  if (r) {
    const t = r.dir === 'E' ? u : r.dir === 'W' ? 1 - u : r.dir === 'S' ? v : 1 - v;
    return r.lo + (r.hi - r.lo) * (r.along + t) / r.len;
  }
  const l = c.level[i];
  return l === '.' || l === undefined ? 0 : Number(l) || 0;
}

export function createHeightField(castles, { levelHeight = 6 } = {}) {
  const list = (castles || []).filter(c => c?.level && c.n && c.cell).map(prep).filter(c => c.box);
  const H = levelHeight;
  function owner(x, z, m = 0) {
    for (const c of list) if (x >= c.box.minX - m && x <= c.box.maxX + m && z >= c.box.minZ - m && z <= c.box.maxZ + m) return c;
    return null;
  }
  function at(x, z) {
    const c = owner(x, z);
    if (!c) return 0;
    const fx = (x - c.x) / c.cell + c.mid + 0.5, fz = (z - c.z) / c.cell + c.mid + 0.5;
    const col = Math.floor(fx), row = Math.floor(fz);
    if (col < 0 || row < 0 || col >= c.n || row >= c.n) return 0;
    if (c.dock && c.pierSet.has(row * c.n + col)) return deckY(c.dock, x, z);   // on the dock's deck
    return cellLevel(c, row * c.n + col, fx - col, fz - row) * H;
  }
  let top = 0;
  for (const c of list) { for (const ch of c.level) if (ch !== '.' && Number(ch) > top) top = Number(ch); for (const r of c.ramps || []) top = Math.max(top, r.hi); }
  const dockTop = list.some(c => c.dock) ? DOCK.deck : 0;
  return { at, near: (x, z, m = 0) => !!owner(x, z, m), list, levelHeight: H, max: Math.max(top * H, dockTop) };
}

// The raised pieces of one castle (prepared by createHeightField): every cell above the ground gets a top quad
// (cliff cells, ramps and the two terrace levels apart, for their own looks); every cell edge where this side is
// higher than the next gets an upright face, but only on the sides the camera sees (east and south: it looks from +x, +z).
export function terrainPieces(c, H) {
  const out = { top1: [], top2: [], rim: [], ramp: [], face: [], rampFace: [], parapet: [], footing: [], footFade: [], pier: [], dockBeam: [], dockPile: [], dockWet: [], dockDark: [] }, n = c.n, s = c.cell;
  const P = (col, row, u, v, h) => [c.x + (col - c.mid - 0.5 + u) * s, h, c.z + (row - c.mid - 0.5 + v) * s];
  const lv = (i, u, v) => cellLevel(c, i, u, v) * H;
  // the footing (Tim 2026-11-20, "the base line"): a sloped skirt of rubble stone along the bottom of every face the camera
  // sees, FOOT.h up the face and FOOT.w out over the ground below, so a face never meets the ground in a hard line.
  // a, b: [face top, ground] heights at the two ends of the face edge (a at its north or west end)
  const footAt = new Map();   // cell -> sides with a footing, for the caps and corners below
  // the outer edge wanders (FOOT.wobble of FOOT.w, by world position, so neighbouring cells meet): never a straight line
  const wide = (x, z) => { const t = Math.sin(x * 0.41 + z * 0.37) * 0.45 + Math.sin(x * 0.17 - z * 0.23 + 1.3) * 0.35 + Math.sin(x * 1.31 + z * 1.17 + 2.1) * 0.2;
    return FOOT.w * (1 + FOOT.wobble * t) / s; };
  // and so does its top edge up the face (Tim 2026-11-20: no straight line on the top part either)
  const high = (x, z) => FOOT.h * (1 + FOOT.wobbleUp * (Math.sin(x * 0.53 - z * 0.47 + 0.7) * 0.6 + Math.sin(x * 1.7 + z * 1.9 + 2.9) * 0.4));
  const riseAt = (x, z, top, g) => g + Math.min(high(x, z), Math.max(0, top - g));
  function footing(side, col, row, a, b) {
    const E = side === 'E', K = FOOT.steps;
    const at = t => { const u = E ? 1 : t, v = E ? t : 1, [x, , z] = P(col, row, u, v, 0), w = wide(x, z);
      const top = a[0] + (b[0] - a[0]) * t, g = a[1] + (b[1] - a[1]) * t, y = riseAt(x, z, top, g);
      // the soft top: the footing's stone fading out up the face, just in front of it
      const up = Math.min(FOOT.fadeUp * (0.7 + 0.3 * Math.abs(Math.sin(x * 0.9 - z * 0.8))), Math.max(0, top - y)), [fx, fz] = E ? [FOOT.lift, 0] : [0, FOOT.lift];
      const [ix, , iz] = P(col, row, u, v, 0);
      return { inner: P(col, row, u, v, y), outer: P(col, row, E ? 1 + w : u, E ? v : 1 + w, g), base: [ix + fx, y - 0.05, iz + fz], tip: [ix + fx, y + up, iz + fz] }; };
    for (let k = 0; k < K; k++) {
      const p0 = at(k / K), p1 = at((k + 1) / K), q = [p0.inner, p1.inner, p1.outer, p0.outer];
      out.footing.push({ q, uvw: q.map(([x, , z]) => [x, z]), cell: col + row * n, side, ends: [a, b], last: k === K - 1 });
      // the soft edge: the same stone laid out a little further over the ground, fading to nothing (footFade)
      const fo = (p, t) => { const [x, y, z] = p, d = FOOT.fade * (0.6 + 0.4 * Math.abs(Math.sin(x * 0.7 + z * 0.9))); return E ? [x + d, y + FOOT.lift, z] : [x, y + FOOT.lift, z + d]; };
      const lift = p => [p[0], p[1] + FOOT.lift, p[2]], fq = [lift(p0.outer), lift(p1.outer), fo(p1.outer), fo(p0.outer)];
      out.footFade.push({ q: fq, uvw: fq.map(([x, , z]) => [x, z]), alpha: [1, 1, 0, 0], cell: col + row * n });
      const tq = [p0.tip, p1.tip, p1.base, p0.base];
      if (tq[0][1] - tq[3][1] > 0.1 || tq[1][1] - tq[2][1] > 0.1)
        out.footFade.push({ q: tq, uvw: tq.map(([x, y, z]) => [E ? z : x, y]), alpha: [0, 0, 1, 1], cell: col + row * n, shade: 0.85 });
    }
    const k = col + row * n; footAt.set(k, (footAt.get(k) || '') + side);
  }
  for (let i = 0; i < n * n; i++) {
    if (c.level[i] === '.') continue;
    const col = i % n, row = (i - col) / n;
    const h00 = lv(i, 0, 0), h10 = lv(i, 1, 0), h01 = lv(i, 0, 1), h11 = lv(i, 1, 1);
    if (Math.max(h00, h10, h01, h11) > EPS) {
      const kind = c.ramp.has(i) ? 'ramp' : c.use?.[i] === 'k' ? 'rim' : c.level[i] === '2' ? 'top2' : 'top1';
      const q = [P(col, row, 0, 0, h00), P(col, row, 1, 0, h10), P(col, row, 1, 1, h11), P(col, row, 0, 1, h01)];
      // a land bridge's steps run across it: its texture's rows follow the way it rises (uvw: texture position in world units)
      const r = c.ramp.get(i), across = r && (r.dir === 'E' || r.dir === 'W');
      out[kind].push({ q, cell: i, ...(r ? { uvw: q.map(([x, , z]) => across ? [z, x] : [x, z]) } : {}) });
    }
    // east edge (u = 1) against the next cell's west edge, south edge (v = 1) against the next cell's north edge
    const east = col + 1 < n ? i + 1 : -1, south = row + 1 < n ? i + n : -1;
    const nb = (j, u, v) => j < 0 || c.level[j] === '.' ? 0 : lv(j, u, v);
    const e0 = nb(east, 0, 0), e1 = nb(east, 0, 1), faces = c.ramp.has(i) ? out.rampFace : out.face;   // a land bridge's sides are cut stone
    if (h10 > e0 + EPS || h11 > e1 + EPS)
      { faces.push({ q: [P(col, row, 1, 0, h10), P(col, row, 1, 1, h11), P(col, row, 1, 1, Math.min(e1, h11)), P(col, row, 1, 0, Math.min(e0, h10))], side: 'E', cell: i });
        footing('E', col, row, [h10, e0], [h11, e1]); }
    const s0 = nb(south, 0, 0), s1 = nb(south, 1, 0);
    if (h01 > s0 + EPS || h11 > s1 + EPS)
      { faces.push({ q: [P(col, row, 0, 1, h01), P(col, row, 1, 1, h11), P(col, row, 1, 1, Math.min(s1, h11)), P(col, row, 0, 1, Math.min(s0, h01))], side: 'S', cell: i });
        footing('S', col, row, [h01, s0], [h11, s1]); }
    // a west or north neighbour higher than this cell shows its face toward the camera too: drawn from that cell's
    // side when it is the one in the loop (east and south edges), so nothing more here
  }
  // footing ends: where a run of footing stops, its open triangle end is closed (only the far ends face the camera: the south
  // end of an east run, the east end of a south run); where an east and a south run meet at a corner, a wedge fills the gap
  for (const f of out.footing.filter(f => f.last)) {
    const k = f.cell, col = k % n, row = (k - col) / n, E = f.side === 'E', [cx, , cz] = P(col, row, 1, 1, 0), w = wide(cx, cz);
    const nextCell = E ? (row + 1 < n ? k + n : -1) : (col + 1 < n ? k + 1 : -1);
    const [top, g] = f.ends[1], y = riseAt(cx, cz, top, g);
    if ((footAt.get(k) || '').includes('E') && (footAt.get(k) || '').includes('S')) {
      if (E) { const q = [P(col, row, 1, 1, y), P(col, row, 1 + w, 1, g), P(col, row, 1 + w * 0.8, 1 + w * 0.8, g), P(col, row, 1, 1 + w, g)];
        out.footing.push({ q, uvw: q.map(([x, , z]) => [x, z]), cell: k, side: 'C' }); }
      continue;
    }
    if (nextCell >= 0 && (footAt.get(nextCell) || '').includes(f.side)) continue;
    if (y - g < EPS) continue;
    const q = [P(col, row, 1, 1, y), P(col, row, 1, 1, y), P(col, row, E ? 1 + w : 1, E ? 1 : 1 + w, g), P(col, row, 1, 1, g)];
    out.footing.push({ q, uvw: q.map(([x, y2, z]) => [E ? x : z, y2]), cell: k, side: 'cap', shade: 0.75 });
  }
  // the land bridges' parapets (Tim 2026-11-20, stone ramp with low parapets): a low stone wall along each open long side
  // of a ramp (the sides the sim fences, town_grid.js), climbing with it; PARAPET.w thick inside the cell, PARAPET.h high
  const W = PARAPET.w / s;
  for (const [i, r] of c.ramp) {
    const col = i % n, row = (i - col) / n, ew = r.dir === 'E' || r.dir === 'W';
    // a = along the ramp (u for an east-west ramp, v for a north-south one), b = across it
    const uv = (a, b) => ew ? [a, b] : [b, a];
    const cellAt = (dc, dr) => (col + dc >= 0 && col + dc < n && row + dr >= 0 && row + dr < n ? (row + dr) * n + col + dc : -1);
    const side = b0 => ew ? cellAt(0, b0 ? 1 : -1) : cellAt(b0 ? 1 : -1, 0), end = a0 => ew ? cellAt(a0 ? 1 : -1, 0) : cellAt(0, a0 ? 1 : -1);
    for (const b0 of [0, 1]) {
      if (c.ramp.has(side(b0))) continue;
      const bIn = b0 ? 1 - W : W, bOut = b0, pt = (a, b, up) => { const [u, v] = uv(a, b); return P(col, row, u, v, lv(i, u, v) + (up ? PARAPET.h : 0)); };
      const run = (a, b) => { const [u, v] = uv(a, b); return ew ? c.x + (col - c.mid - 0.5 + u) * s : c.z + (row - c.mid - 0.5 + v) * s; };
      const wall = (b, shade) => { const q = [pt(0, b, true), pt(1, b, true), pt(1, b, false), pt(0, b, false)];
        out.parapet.push({ q, shade, uvw: q.map(([, y], k) => [run(k === 1 || k === 2 ? 1 : 0, b), y]), cell: i }); };
      wall(bIn, PARAPET.shadeIn); wall(bOut, PARAPET.shadeOut);
      const top = [pt(0, bIn, true), pt(1, bIn, true), pt(1, bOut, true), pt(0, bOut, true)];
      out.parapet.push({ q: top, shade: 1, uvw: top.map(([x, , z]) => [x, z]), cell: i });
      for (const a0 of [0, 1]) if (!c.ramp.has(end(a0))) {   // the open ends of the run: a cap
        const cap = [pt(a0, bIn, true), pt(a0, bOut, true), pt(a0, bOut, false), pt(a0, bIn, false)];
        out.parapet.push({ q: cap, shade: PARAPET.shadeIn, uvw: cap.map(([x, y, z]) => [ew ? z : x, y]), cell: i });
      }
    }
  }
  // the dock (Tim 2026-11-23): a raised deck on piles with an edge beam and bracing (src/dock_shape.js)
  dockPieces(c, c.dock, out);
  // faces of higher cells looking west or north are hidden behind their own tops; faces of a higher cell to the east or
  // south of a lower one face away from the camera (also hidden)
  return out;
}

let current = null;
export function setHeightField(f) { current = f && f.list.length ? f : null; }
export const heightField = () => current;
export const groundY = (x, z) => current ? current.at(x, z) : 0;
export const maxGroundY = () => current ? current.max : 0;
export const nearCastle = (x, z, margin = 0) => !!current && current.near(x, z, margin);
