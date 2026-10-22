// Plain math shared by the game rules and the renderer. No three.js and no DOM,
// so a Node server can use it too.

// Camera angle and scale of the sprite exporter (look_tests/sprite_render_test.html)
export const ELEVATION = Math.atan(0.5);
export const PPU = 160 / 3;            // screen pixels per world unit at zoom 1

// Ground directions that point right and down on screen
const S = Math.SQRT1_2;
export const SCREEN_RIGHT = { x: S, z: -S };
export const SCREEN_DOWN = { x: S, z: S };

export const rect = (cx, cz, a, b) => ({ minX: cx - a / 2, maxX: cx + a / 2, minZ: cz - b / 2, maxZ: cz + b / 2 });

// Sprite row for a ground direction: 0..7 = S, SW, W, NW, N, NE, E, SE
export function dirIndex(dx, dz) {
  const sx = dx * SCREEN_RIGHT.x + dz * SCREEN_RIGHT.z, sy = dx * SCREEN_DOWN.x + dz * SCREEN_DOWN.z;
  return ((Math.round(Math.atan2(-sx, sy) / (Math.PI / 4)) % 8) + 8) % 8;
}

// A catalog entry with its defaults filled in. kind: buildings, props or interior.
export function artItem(catalog, name) {
  const a = catalog.items[name];
  if (!a) throw new Error(`"${name}" is not in data/art.json`);
  const kind = a.kind || 'props';
  const building = kind === 'buildings';
  return {
    kind,
    scale: a.scale ?? (building ? catalog.buildingScale : 1),
    solid: a.solid ?? (building ? 0.82 : 0.8),
    lights: a.lights ?? [], flames: a.flames ?? [], glows: !!a.glows, foot: a.foot,
    lift: a.lift ?? 0,                 // drawn this far above the floor (hanging lanterns)
    corner: !!a.corner,
    cord: a.cord ?? null,              // [x, y] art pixel where a hanging cord starts                // the art's lowest pixel is the front corner of a long box (alcoves, shelves)
    file: a.file ?? `art/${kind}/${name}.png`,
  };
}

// Footprint of a piece of art in world units, and the art pixel that sits on its centre.
// Buildings: the left, bottom and right extremes of the art are the footprint corners.
// Props: the footprint comes from the catalog and its centre sits just above the art's lowest point.
// flip: the art is mirrored left to right, which swaps the footprint's two sides.
export function footprint(item, meta, flip = false) {
  const k = item.scale / PPU;          // world units per art pixel
  const s = Math.sin(ELEVATION);
  let fa, fb, center;
  if (item.foot) {
    [fa, fb] = item.foot;
    center = [item.corner ? meta.bottomX + S * (fb - fa) / 2 / k : meta.w / 2, meta.bottomY - (fa + fb) / 2 * S * s / k];
  } else {
    fa = (meta.bottomX - meta.left) * k / S;
    fb = (meta.right - meta.bottomX) * k / S;
    center = [meta.bottomX + S * (fb - fa) / 2 / k, meta.bottomY - s * S * (fa + fb) / 2 / k];
    // thin pieces such as walls still get some thickness, centred on their base line
    fa = Math.max(fa, 0.35); fb = Math.max(fb, 0.35);
  }
  if (flip) { [fa, fb] = [fb, fa]; center = [meta.w - center[0], center[1]]; }
  return { fa, fb, center, k };
}

// Look up the art for one placed piece and work out its footprint and blocking box.
// entry: { name, x, z, flip?, indoor?, business? }
export function placePiece(entry, catalog, cutouts) {
  const item = artItem(catalog, entry.name);
  const meta = cutouts[`${item.kind}/${entry.name}`];
  if (!meta) { console.warn(`No cutout for ${entry.name}; run tools/cut_environment.py`); return null; }
  const f = footprint(item, meta, !!entry.flip);
  const shrink = item.kind === 'buildings' ? 0.9 : 1;
  return {
    flip: false, indoor: false, ...entry, item, meta, ...f,
    foot: rect(entry.x, entry.z, f.fa * shrink, f.fb * shrink),
    // Interior parts already provide their exact blockers, including surface-mounted props.
    solid: !entry.roomProp && item.solid > 0 ? rect(entry.x, entry.z, f.fa * item.solid, f.fb * item.solid) : null,
  };
}

// Every building and prop of a district
export function placeScenery(district, catalog, cutouts) {
  return [
    ...district.buildings.map((b, i) => ({ name: b.art, x: b.x, z: b.z, flip: !!b.flip, business: b.business || null, building: i })),
    // a prop is [name, x, z] or [name, x, z, { flip: true }] (mirrored, so a wall runs along z instead of x)
    ...district.props.map(([name, x, z, o], i) => ({ name, x, z, flip: !!o?.flip, prop: i })),   // prop: its index (lanterns snuffed out, sim/stealth.js)
  ].map(e => placePiece(e, catalog, cutouts)).filter(Boolean);
}

// --- Ground shapes -------------------------------------------------------------------
// A district ground zone is [type, minX, minZ, maxX, maxZ, blur] (a box) or [type, shape, blur],
// where a shape is { poly: [[x, z], ...] } (a filled outline) or { line: [[x, z], ...], w } (a band
// w wide along a bending line: roads, the canal). Boxes may stand in for shapes too: [minX, minZ, maxX, maxZ].
export const asShape = s => Array.isArray(s) ? { poly: [[s[0], s[1]], [s[2], s[1]], [s[2], s[3]], [s[0], s[3]]] } : s;

function segDist(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

// How far point (x, z) is inside the shape: positive inside, negative outside (world units)
export function shapeDistance(shape, x, z) {
  const s = asShape(shape);
  if (s.line) {
    let d = Infinity;
    for (let i = 1; i < s.line.length; i++) d = Math.min(d, segDist(x, z, s.line[i - 1], s.line[i]));
    return s.w / 2 - d;
  }
  const P = s.poly;
  let d = Infinity, inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    d = Math.min(d, segDist(x, z, P[j], P[i]));
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside ? d : -d;
}

// The box round a shape
export function shapeBox(shape) {
  const s = asShape(shape), pts = s.poly || s.line, r = s.line ? s.w / 2 : 0;
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  return { minX: Math.min(...xs) - r, maxX: Math.max(...xs) + r, minZ: Math.min(...zs) - r, maxZ: Math.max(...zs) + r };
}

// A ground zone as { type, shape, blur }, whichever way it is written
export const groundZone = z => typeof z[1] === 'object'
  ? { type: z[0], shape: z[1], blur: z[2] ?? 0 }
  : { type: z[0], shape: [z[1], z[2], z[3], z[4]], blur: z[5] ?? 0 };

// Walls for the walk rules from a district's blockShapes (water, the canal) minus its walkShapes
// (piers, bridges): the shapes are laid on a grid of `cell` and each row's runs become boxes,
// with equal runs in neighbouring rows joined, so the rules keep using plain boxes.
export function shapeBlockers(district, cell = 0.5) {
  const block = district.blockShapes || [], walk = district.walkShapes || [];
  if (!block.length) return [];
  const B = district.bounds, x0 = B.minX - 2, z0 = B.minZ - 2;
  const W = Math.ceil((B.maxX + 2 - x0) / cell), H = Math.ceil((B.maxZ + 2 - z0) / cell);
  const boxes = [], open = new Map();   // "i0,i1" -> box still growing upward
  for (let j = 0; j < H; j++) {
    const z = z0 + (j + 0.5) * cell, runs = [];
    let start = -1;
    for (let i = 0; i <= W; i++) {
      const x = x0 + (i + 0.5) * cell;
      const on = i < W && block.some(s => shapeDistance(s, x, z) >= 0) && !walk.some(s => shapeDistance(s, x, z) >= 0);
      if (on && start < 0) start = i;
      if (!on && start >= 0) { runs.push(`${start},${i}`); start = -1; }
    }
    const next = new Map();
    for (const key of runs) {
      const box = open.get(key);
      if (box) { box.maxZ = z0 + (j + 1) * cell; next.set(key, box); continue; }
      const [a, b] = key.split(',').map(Number);
      const nb = { minX: x0 + a * cell, maxX: x0 + b * cell, minZ: z0 + j * cell, maxZ: z0 + (j + 1) * cell };
      boxes.push(nb); next.set(key, nb);
    }
    open.clear(); for (const [k, v] of next) open.set(k, v);
  }
  return boxes;
}
