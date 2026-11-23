// The castle dock drawn as a real wharf on piles (Tim 2026-11-23, look B in /mnt/project-files/dock_look): drawing
// only, the sim's dock cells (blueprint pier, use '.') stay as they are. No three.js here, so Node tests can check it.
//   dockShape(c) -> { land, water, boardsAlongX } or null: c is a castle prepared by src/castle_height.js (x, z, n, cell,
//     mid, use, pier); land / water = merged cell edges of the dock against the castle ground / the sea, each
//     { a: [x, z], b: [x, z], n: [nx, nz] } with n pointing out of the dock
//   dockShape(c, opts): opts overrides DOCK for this dock (the city's piers: data/port_town.json docks)
//   deckY(shape, x, z): the deck height, rising from DOCK.lip at the land edge to DOCK.deck over DOCK.ramp units
//   dockPieces(c, shape, out): pushes quads into out.pier (deck boards), dockBeam (edge beam), dockPile (piles),
//     dockWet (wet tide band on the piles), dockDark (bracing) for render/world_ground.js
// DOCK: placeholders, Tim to tune (world units)
export const DOCK = {
  deck: 1.6,       // deck height over the water
  lip: 0.3,        // deck height where it meets the castle ground
  ramp: 7,         // units over which the deck rises from the land edge
  beam: 1.35,      // edge beam height below the deck top
  beamOut: 0.3,    // edge beam set out past the cell edge
  pileGap: 5.5,    // spacing of the piles along each water edge
  pileR: 0.42,     // pile radius (each varies a little)
  pileOut: 0.62,   // pile centres out past the cell edge
  sink: 0.4,       // piles start this far below the water line
  wet: 0.95,       // the dark wet band up from the water
  brace: 0.18,     // bracing timber width
  wale: 0.62,      // height of the low horizontal timber between piles
};

const DOCK_DEFAULT = DOCK;
const hash = (x, z, k = 0) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };

export function dockShape(c, opts = null) {
  const pier = new Set(c.pier || []); if (!pier.size) return null;
  const n = c.n, s = c.cell, edges = { land: [], water: [] };
  for (const i of pier) {
    const col = i % n, row = (i - col) / n, x0 = c.x + (col - c.mid - 0.5) * s, z0 = c.z + (row - c.mid - 0.5) * s, x1 = x0 + s, z1 = z0 + s;
    for (const [dc, dr, a, b, nx, nz] of [[-1, 0, [x0, z0], [x0, z1], -1, 0], [1, 0, [x1, z0], [x1, z1], 1, 0], [0, -1, [x0, z0], [x1, z0], 0, -1], [0, 1, [x0, z1], [x1, z1], 0, 1]]) {
      const cc = col + dc, rr = row + dr, j = cc < 0 || rr < 0 || cc >= n || rr >= n ? -1 : rr * n + cc;
      if (j >= 0 && pier.has(j)) continue;
      // outside the castle (level '.') past the dock's end is open sea
      (j < 0 || c.use?.[j] === 'm' || c.level?.[j] === '.' ? edges.water : edges.land).push({ a, b, n: [nx, nz] });
    }
  }
  // join edges on one line with the same side into long runs
  const merge = list => {
    const key = e => `${e.n[0]},${e.n[1]},${e.n[0] ? e.a[0] : e.a[1]}`, groups = new Map();
    for (const e of list) { const k = key(e); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    const out = [];
    for (const g of groups.values()) {
      const ax = g[0].n[0] ? 1 : 0;   // the coordinate that runs along the edge
      g.sort((p, q) => p.a[ax] - q.a[ax]);
      let cur = { a: [...g[0].a], b: [...g[0].b], n: g[0].n };
      for (const e of g.slice(1)) { if (Math.abs(e.a[ax] - cur.b[ax]) < 1e-6) cur.b = [...e.b]; else { out.push(cur); cur = { a: [...e.a], b: [...e.b], n: e.n }; } }
      out.push(cur);
    }
    return out;
  };
  const land = merge(edges.land), water = merge(edges.water);
  // boards run across the dock: the dock runs away from its land edge
  const boardsAlongX = land.length ? land.some(e => e.n[1] !== 0) : true;
  return { land, water, boardsAlongX, D: opts ? { ...DOCK, ...opts } : DOCK };   // D: this dock's sizes (a city pier sits lower)
}

const segDist = (x, z, e) => { const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1], L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - e.a[0]) * dx + (z - e.a[1]) * dz) / L)); return Math.hypot(x - e.a[0] - dx * t, z - e.a[1] - dz * t); };
export function deckY(shape, x, z) {
  const DOCK = shape?.D || DOCK_DEFAULT;
  if (!shape?.land.length) return DOCK.deck;
  let d = Infinity; for (const e of shape.land) d = Math.min(d, segDist(x, z, e));
  const t = Math.min(1, d / DOCK.ramp), k = t * t * (3 - 2 * t);
  return DOCK.lip + (DOCK.deck - DOCK.lip) * k;
}

// light on a face by its outward direction: the camera looks from +x, +z (south-east); lit from the south-west a little
const faceShade = (nx, nz) => 0.62 + 0.32 * Math.max(0, nx * 0.45 + nz * 0.89);

export function dockPieces(c, shape, out) {
  if (!shape) return out;
  const DOCK = shape.D || DOCK_DEFAULT;
  for (const k of ['pier', 'dockBeam', 'dockPile', 'dockWet', 'dockDark']) out[k] ||= [];
  const n = c.n, s = c.cell, Y = (x, z) => deckY(shape, x, z), bx = shape.boardsAlongX;
  const tex = (x, z) => bx ? [x, z] : [z, x];
  // deck: each dock cell in 4 x 4 pieces so it follows the rise off the land
  const SUB = 4;
  for (const i of c.pier || []) {
    const col = i % n, row = (i - col) / n, x0 = c.x + (col - c.mid - 0.5) * s, z0 = c.z + (row - c.mid - 0.5) * s, d = s / SUB;
    for (let a = 0; a < SUB; a++) for (let b = 0; b < SUB; b++) {
      const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => { const x = x0 + (a + u) * d, z = z0 + (b + v) * d; return [x, Y(x, z), z]; });
      out.pier.push({ q, uvw: q.map(([x, , z]) => tex(x, z)), cell: i, shade: 1 });
    }
  }
  const STEP = s / 4;
  for (const e of shape.water) {
    const [nx, nz] = e.n, len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), tx = (e.b[0] - e.a[0]) / len, tz = (e.b[1] - e.a[1]) / len;
    const along = (t, o) => [e.a[0] + tx * t + nx * o, e.a[1] + tz * t + nz * o];
    const runC = (x, z) => tx ? x : z;   // texture position along the edge
    // the edge beam: an upright face just outside the deck edge and the strip joining it to the deck
    for (let t = 0; t < len - 1e-6; t += STEP) {
      const t1 = Math.min(len, t + STEP), [ax, az] = along(t, 0), [bx2, bz] = along(t1, 0), [ox, oz] = along(t, DOCK.beamOut), [px, pz] = along(t1, DOCK.beamOut);
      const ya = Y(ax, az) + 0.06, yb = Y(bx2, bz) + 0.06;
      const face = [[ox, ya, oz], [px, yb, pz], [px, ya - DOCK.beam, pz], [ox, yb - DOCK.beam, oz]];
      face[3][1] = ya - DOCK.beam;
      out.dockBeam.push({ q: face, uvw: face.map(([x, y, z]) => [runC(x, z), y]), shade: faceShade(nx, nz) });
      const top = [[ax, ya, az], [bx2, yb, bz], [px, yb, pz], [ox, ya, oz]];
      out.dockBeam.push({ q: top, uvw: top.map(([x, , z]) => tex(x, z)), shade: 1 });
    }
    // piles along the edge, a little uneven; doubled at the far corners
    const count = Math.max(1, Math.round(len / DOCK.pileGap)), spots = [];
    for (let k = 0; k <= count; k++) spots.push(len * k / count);
    const piles = spots.map(t => { const [x, z] = along(t, DOCK.pileOut); return { x, z }; });
    for (const p of piles) pile(p.x, p.z, Y(p.x - nx * DOCK.pileOut, p.z - nz * DOCK.pileOut) - 0.04);
    for (const t of [0, len]) { const [x, z] = along(t + (t ? 0.95 : -0.95), DOCK.pileOut + 0.35); pile(x, z, Y(x - nx, z - nz) - 0.2); }
    // bracing between neighbouring piles: two crossed timbers and a low wale, set just in front of the piles
    for (let k = 0; k < piles.length - 1; k++) {
      if (hash(piles[k].x, piles[k].z, 3) < 0.15) continue;   // a few bays with their bracing gone
      const o = DOCK.pileOut + DOCK.pileR + 0.05, [ax, az] = along(spots[k], o), [bx2, bz] = along(spots[k + 1], o);
      const top = Math.min(Y(ax - nx * o, az - nz * o), Y(bx2 - nx * o, bz - nz * o)) - DOCK.beam + 0.1;
      strip([ax, 0.15, az], [bx2, top, bz], nx, nz); strip([ax, top, az], [bx2, 0.15, bz], nx, nz);
      strip([ax, DOCK.wale, az], [bx2, DOCK.wale, bz], nx, nz);
    }
  }
  function strip(p0, p1, nx, nz) {   // a flat timber facing out from the dock, DOCK.brace wide
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], L = Math.hypot(dx, dy, dz) || 1;
    // across the timber within the face plane: perpendicular to its run and to the face normal
    let ux = dz * 0 - dy * nz, uy = dz * nx - dx * nz, uz = dx * 0 - dy * nx; const ul = Math.hypot(ux, uy, uz) || 1;
    ux *= DOCK.brace / 2 / ul; uy *= DOCK.brace / 2 / ul; uz *= DOCK.brace / 2 / ul;
    const q = [[p0[0] + ux, p0[1] + uy, p0[2] + uz], [p1[0] + ux, p1[1] + uy, p1[2] + uz], [p1[0] - ux, p1[1] - uy, p1[2] - uz], [p0[0] - ux, p0[1] - uy, p0[2] - uz]];
    out.dockDark.push({ q, uvw: [[0, 0], [L, 0], [L, 0.3], [0, 0.3]], shade: faceShade(nx, nz) });
  }
  function pile(x, z, top) {
    const r = DOCK.pileR * (0.85 + 0.35 * hash(x, z)), lean = (hash(x, z, 1) - 0.5) * 0.12, leanZ = (hash(x, z, 2) - 0.5) * 0.12;
    top += (hash(x, z, 4) - 0.35) * 0.4;
    const SIDES = 8, ring = (y, rr) => Array.from({ length: SIDES }, (_, k) => { const a = k / SIDES * Math.PI * 2; return [x + Math.cos(a) * rr + lean * (y + DOCK.sink), y, z + Math.sin(a) * rr + leanZ * (y + DOCK.sink)]; });
    const body = (kind, y0, y1, rr) => {
      const lo = ring(y0, rr), hi = ring(y1, rr);
      for (let k = 0; k < SIDES; k++) { const k1 = (k + 1) % SIDES, a = (k + 0.5) / SIDES * Math.PI * 2;
        const q = [hi[k], hi[k1], lo[k1], lo[k]];
        out[kind].push({ q, uvw: [[y1, k * rr], [y1, (k + 1) * rr], [y0, (k + 1) * rr], [y0, k * rr]], shade: faceShade(Math.cos(a), Math.sin(a)) }); }
      return hi;
    };
    const hi = body('dockPile', -DOCK.sink, top, r);
    body('dockWet', -DOCK.sink, Math.min(DOCK.wet * (0.8 + 0.4 * hash(x, z, 5)), top - 0.15), r * 1.05);   // never above the pile's own top (short piles at the land end)
    for (let k = 0; k < SIDES; k += 2) out.dockPile.push({ q: [[x + lean * (top + DOCK.sink), top, z + leanZ * (top + DOCK.sink)], hi[k], hi[(k + 1) % SIDES], hi[(k + 2) % SIDES]], uvw: [[0, 0], [r, 0], [r, r], [0, r]], shade: 0.95 });
  }
  return out;
}

// The dock as a frame for placing things on it (src/town_props.js): origin at the middle of its land edge, `along`
// pointing out to sea, `across` to one side; spot(a, b) = world [x, z] at a (0..1 across, below 0 or over 1 is the
// water beside it) and b (0 at the land edge, 1 at the sea end). null without a dock.
export function dockFrame(c) {
  const shape = dockShape(c); if (!shape) return null;
  const n = c.n, s = c.cell;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const i of c.pier) { const col = i % n, row = (i - col) / n, x = c.x + (col - c.mid) * s, z = c.z + (row - c.mid) * s;
    x0 = Math.min(x0, x - s / 2); x1 = Math.max(x1, x + s / 2); z0 = Math.min(z0, z - s / 2); z1 = Math.max(z1, z + s / 2); }
  const ln = shape.land[0]?.n || [0, 1];   // points from the dock to the land
  const along = [-ln[0], -ln[1]], across = [-along[1], along[0]];
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, len = ln[0] ? x1 - x0 : z1 - z0, wid = ln[0] ? z1 - z0 : x1 - x0;
  const spot = (a, b) => [cx + along[0] * (b - 0.5) * len + across[0] * (a - 0.5) * wid, cz + along[1] * (b - 0.5) * len + across[1] * (a - 0.5) * wid];
  return { along, across, len, wid, spot };
}
