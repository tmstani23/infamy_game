// Castle terraces drawn raised (Z4h, Tim 2026-11-19: "the raised terraces and land bridge"). Drawing only: the sim
// stays flat, and the castle's cliff cells and fenced land bridges (sim/frontier/castle.js, town_grid.js) keep
// walkers from ever stepping across a height jump. No three.js here, so Node tests can check it.
//   createHeightField(castles, { levelHeight }) -> { at(x, z), near(x, z, margin), list }
//     castles: [{ id, x, z, n, cell, level, slope, ramps }] from town_props.js (castle grids: level '.' outside the
//     castle, 0 yard, 1 inner terrace, 2 keep; slope and ramps from castle.js)
//   terrainPieces(c, H) -> { top1, top2, rim, ramp, face }: quads ([x, y, z] x4 and a shade) for render/world_ground.js
//   groundY(x, z): the drawn ground height at a point, from the field set by setHeightField (0 with none)
//   nearCastle(x, z, margin): inside a castle's box (things there are depth tested against the terraces)
const EPS = 1e-4, PIER_Y = 0.03;

function prep(c) {
  const mid = (c.n - 1) / 2, ramp = new Map();
  for (const r of c.ramps || []) for (const [i, along] of r.cells) ramp.set(i, { along, len: r.len, lo: r.lo, hi: r.hi, dir: r.dir });
  const half = (c.n / 2) * c.cell;
  // the box of the castle's own cells (anything marked with a level)
  let c0 = c.n, c1 = -1, r0 = c.n, r1 = -1;
  for (let i = 0; i < c.n * c.n; i++) if (c.level[i] !== '.') { const col = i % c.n, row = (i - col) / c.n; c0 = Math.min(c0, col); c1 = Math.max(c1, col); r0 = Math.min(r0, row); r1 = Math.max(r1, row); }
  const box = c1 < 0 ? null : { minX: c.x + (c0 - mid - 0.5) * c.cell, maxX: c.x + (c1 - mid + 0.5) * c.cell, minZ: c.z + (r0 - mid - 0.5) * c.cell, maxZ: c.z + (r1 - mid + 0.5) * c.cell };
  return { ...c, mid, ramp, half, box };
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
    return cellLevel(c, row * c.n + col, fx - col, fz - row) * H;
  }
  let top = 0;
  for (const c of list) { for (const ch of c.level) if (ch !== '.' && Number(ch) > top) top = Number(ch); for (const r of c.ramps || []) top = Math.max(top, r.hi); }
  return { at, near: (x, z, m = 0) => !!owner(x, z, m), list, levelHeight: H, max: top * H };
}

// The raised pieces of one castle (prepared by createHeightField): every cell above the ground gets a top quad
// (cliff cells, ramps and the two terrace levels apart, for their own looks); every cell edge where this side is
// higher than the next gets an upright face, but only on the sides the camera sees (east and south: it looks from +x, +z).
export function terrainPieces(c, H) {
  const out = { top1: [], top2: [], rim: [], ramp: [], face: [], pier: [] }, n = c.n, s = c.cell;
  const P = (col, row, u, v, h) => [c.x + (col - c.mid - 0.5 + u) * s, h, c.z + (row - c.mid - 0.5 + v) * s];
  const lv = (i, u, v) => cellLevel(c, i, u, v) * H;
  for (let i = 0; i < n * n; i++) {
    if (c.level[i] === '.') continue;
    const col = i % n, row = (i - col) / n;
    const h00 = lv(i, 0, 0), h10 = lv(i, 1, 0), h01 = lv(i, 0, 1), h11 = lv(i, 1, 1);
    if (Math.max(h00, h10, h01, h11) > EPS) {
      const kind = c.ramp.has(i) ? 'ramp' : c.use?.[i] === 'k' ? 'rim' : c.level[i] === '2' ? 'top2' : 'top1';
      out[kind].push({ q: [P(col, row, 0, 0, h00), P(col, row, 1, 0, h10), P(col, row, 1, 1, h11), P(col, row, 0, 1, h01)], cell: i });
    }
    // east edge (u = 1) against the next cell's west edge, south edge (v = 1) against the next cell's north edge
    const east = col + 1 < n ? i + 1 : -1, south = row + 1 < n ? i + n : -1;
    const nb = (j, u, v) => j < 0 || c.level[j] === '.' ? 0 : lv(j, u, v);
    const e0 = nb(east, 0, 0), e1 = nb(east, 0, 1);
    if (h10 > e0 + EPS || h11 > e1 + EPS)
      out.face.push({ q: [P(col, row, 1, 0, h10), P(col, row, 1, 1, h11), P(col, row, 1, 1, Math.min(e1, h11)), P(col, row, 1, 0, Math.min(e0, h10))], side: 'E', cell: i });
    const s0 = nb(south, 0, 0), s1 = nb(south, 1, 0);
    if (h01 > s0 + EPS || h11 > s1 + EPS)
      out.face.push({ q: [P(col, row, 0, 1, h01), P(col, row, 1, 1, h11), P(col, row, 1, 1, Math.min(s1, h11)), P(col, row, 0, 1, Math.min(s0, h01))], side: 'S', cell: i });
    // a west or north neighbour higher than this cell shows its face toward the camera too: drawn from that cell's
    // side when it is the one in the loop (east and south edges), so nothing more here
  }
  // the dock: flat planks just over the ground on its cells (PIER_Y keeps them clear of the island ground's depth)
  for (const i of c.pier || []) { const col = i % n, row = (i - col) / n;
    out.pier.push({ q: [P(col, row, 0, 0, PIER_Y), P(col, row, 1, 0, PIER_Y), P(col, row, 1, 1, PIER_Y), P(col, row, 0, 1, PIER_Y)], cell: i }); }
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
