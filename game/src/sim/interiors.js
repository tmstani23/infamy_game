// Lays out 3D rooms from templates (data/interiors.json or the room generator). Rooms sit in the same
// world as the street, just far off the map, so raids and multiplayer work the
// same inside and out.
export const INTERIOR_ORIGIN = { x: 300, z: 0, spacing: 60 };
// ---------- 3D rooms (spec: docs/interiors_spec.md, parts: data/interior_parts.json) ----------
// Everything is on a grid of 1-unit cells. The room's floor runs from (0, 0) to its size;
// walls stand just outside it. Far walls (north = low z, west = low x) are full height,
// near walls (south, east) are cut low so you can see in.

export const SIDES = ['north', 'west', 'south', 'east'];
const NEAR = { south: true, east: true };
// Size of a part on the ground after turning it: [x extent, z extent]
export const turned = ([a, b], rot) => (rot / 90) % 2 ? [b, a] : [a, b];
// Facing (degrees about y) of a part with its back against each wall
export const WALL_ROT = { north: 0, west: 90, south: 180, east: 270 };

// Where a prop sits in room cells: { x0, z0, x1, z1, rot }
export function propRect(p, def, size) {
  const [X, Z] = size;
  if (def.rule === 'wall') {
    const [ex, ez] = turned(def.size, WALL_ROT[p.wall]);
    const s = p.at;
    const x0 = { north: s, south: s, west: 0, east: X - ex }[p.wall];
    const z0 = { north: 0, south: Z - ez, west: s, east: s }[p.wall];
    return { x0, z0, x1: x0 + ex, z1: z0 + ez, rot: WALL_ROT[p.wall] };
  }
  const rot = p.rot || 0;
  const [ex, ez] = turned(def.size, rot);
  return { x0: p.at[0], z0: p.at[1], x1: p.at[0] + ex, z1: p.at[1] + ez, rot };
}

export const overlap = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
const inside = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

// Lays out a room from its template. Pure data: the sim uses the blockers, the renderer
// builds the 3D shapes from walls and props.
export function buildRoom3d(name, template, parts, ox, oz, { quiet = false } = {}) {
  const W = parts.wall, [X, Z] = template.size;
  const problems = [];

  // walls: one list of bay types per side; near walls default to plain bays
  const walls = SIDES.map(side => {
    const length = side === 'north' || side === 'south' ? X : Z;
    const bays = Math.round(length / W.bay);
    if (bays * W.bay !== length) problems.push(`${side} wall: ${length} cells is not a whole number of ${W.bay}-cell bays`);
    const list = template.walls[side] || [template.walls.near || 'plaster'];
    const types = Array.from({ length: bays }, (_, i) => list[i % list.length]);
    types.forEach(t => { if (!parts.bays[t]) problems.push(`${side} wall: unknown bay "${t}"`); });
    return { side, length, low: !!NEAR[side], height: NEAR[side] ? W.low : W.height, bays: types };
  });

  // inner walls split the room: { along: 'x' | 'z', at, door: bay index of the opening, fill }.
  // They run the full width or depth, are cut low like the front walls, and one bay is open.
  const inner = (template.inner || []).map(w => {
    const length = w.along === 'x' ? X : Z, bays = Math.round(length / W.bay);
    if (!(w.at > 0 && w.at < (w.along === 'x' ? Z : X))) problems.push(`inner wall at ${w.at}: not inside the room`);
    if (!(w.door >= 0 && w.door < bays)) problems.push(`inner wall at ${w.at}: needs a doorway bay`);
    const r = (a, b) => w.along === 'x' ? { x0: a, x1: b, z0: w.at - W.thickness / 2, z1: w.at + W.thickness / 2 }
      : { x0: w.at - W.thickness / 2, x1: w.at + W.thickness / 2, z0: a, z1: b };
    const d0 = w.door * W.bay, d1 = d0 + W.bay;
    const segments = [r(0, d0), r(d1, length)].filter(q => q.x1 - q.x0 > 1e-6 && q.z1 - q.z0 > 1e-6);
    const clear = w.along === 'x' ? { x0: d0, x1: d1, z0: w.at - 1, z1: w.at + 1 } : { x0: w.at - 1, x1: w.at + 1, z0: d0, z1: d1 };
    return { along: w.along, at: w.at, length, bays, door: w.door, fill: w.fill || 'plaster', segments, clear };
  });
  const innerSegments = inner.flatMap(w => w.segments);

  // Blueprint partitions are finite wall runs, unlike the older full-span
  // `inner` walls. Each opening has a stable id for visual and collision state.
  const partitions = (template.partitions || []).map((w, wi) => {
    const length = w.along === 'z' ? Z : X;
    if (!['x', 'z'].includes(w.along) || !(w.at > 0 && w.at < (w.along === 'z' ? X : Z)))
      problems.push(`partition ${wi}: invalid axis or position`);
    const spans = [...w.segments, ...(w.doorSpans || [])];
    for (const [a, b] of spans) if (!(a >= 0 && b <= length && a < b)) problems.push(`partition ${wi}: invalid span ${a}-${b}`);
    const rect = ([a, b]) => w.along === 'z'
      ? { x0: w.at - W.thickness / 2, x1: w.at + W.thickness / 2, z0: a, z1: b }
      : { x0: a, x1: b, z0: w.at - W.thickness / 2, z1: w.at + W.thickness / 2 };
    return { ...w, segments: w.segments.map(span => ({ span, rect: rect(span) })),
      doors: (w.doorSpans || []).map((span, di) => ({ id: `${name}:${wi}:${di}`, span, rect: rect(span),
        x: ox + (w.along === 'z' ? w.at : (span[0] + span[1]) / 2),
        z: oz + (w.along === 'z' ? (span[0] + span[1]) / 2 : w.at) })) };
  });
  const partitionSegments = partitions.flatMap(w => w.segments.map(s => s.rect));
  const interiorDoors = partitions.flatMap(w => w.doors);

  // hanging props hang low enough that their cord shows, so they go where nobody walks:
  // over furniture or close to a wall
  const nearWall = (x, z) => Math.min(x, z, X - x, Z - z) <= 1
    || inner.some(w => Math.abs((w.along === 'x' ? z : x) - w.at) <= 1)
    || partitions.some(w => Math.abs((w.along === 'z' ? x : z) - w.at) <= 1);

  // props, in template order so surfaces exist before what stands on them
  const props = [];
  for (const p of template.props) {
    const def = parts.props[p.type];
    if (!def) { problems.push(`unknown prop "${p.type}"`); continue; }
    const r = propRect(p, def, template.size);
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    let y = 0, on = null;
    if (def.rule === 'ceiling') {
      y = def.light?.y ?? W.lintel;
      const over = props.some(q => q.stands && inside(q.rect, cx, cz));
      if (!over && !nearWall(cx, cz) && !p.ceilingMount) problems.push(`${p.type} at ${p.at}: hang it over furniture or within a cell of a wall`);
    }
    else {
      on = props.find(q => q.def.surface && q.rule !== 'ceiling' && inside(q.rect, cx, cz)) || null;
      if (on) y = on.def.surface;
      else if (def.rule === 'top') problems.push(`${p.type} at ${p.at}: needs something with a surface under it`);
    }
    if (r.x0 < 0 || r.z0 < 0 || r.x1 > X || r.z1 > Z) problems.push(`${p.type} at ${p.at}: outside the room`);
    const stands = def.rule !== 'ceiling' && !on;
    if (stands) for (const q of props) if (q.stands && overlap(r, q.rect)) problems.push(`${p.type} at ${p.at} overlaps ${q.type}`);
    if (stands && [...innerSegments, ...partitionSegments].some(q => overlap(r, q))) problems.push(`${p.type} at ${p.at} crosses an inner wall`);
    if (stands && (inner.some(w => overlap(r, w.clear)) || interiorDoors.some(d => overlap(r, d.rect))))
      problems.push(`${p.type} at ${p.at} blocks an inner doorway`);
    // Painted furniture is used only at its authored orientation; other sides keep the 3D model.
    const cutout = def.cutout || (def.painted?.rotations.includes(r.rot) ? def.painted.cutout : null);
    props.push({ type: p.type, def, rule: def.rule, rect: r, rot: r.rot, y, stands, cx, cz, cutout,
      artAngle: p.artAngle ?? def.painted?.angle ?? 0, artOffset: p.artOffset || [0, 0], lightPixel: p.lightPixel });
  }

  // the door: a bay in a far wall, with clear floor in front of it
  const { side, bay } = template.door;
  const wall = walls.find(w => w.side === side);
  if (!wall || wall.low || !parts.bays[wall.bays[bay]]?.door) problems.push(`door: bay ${bay} of the ${side} wall is not a door bay`);
  const along = (bay + 0.5) * W.bay;
  const clear = side === 'north' ? { x0: along - 1, x1: along + 1, z0: 0, z1: 2.5 } : { x0: 0, x1: 2.5, z0: along - 1, z1: along + 1 };
  for (const q of props) if (q.stands && overlap(clear, q.rect)) problems.push(`${q.type} blocks the door`);
  if ([...innerSegments, ...partitionSegments].some(q => overlap(clear, q))) problems.push(`an inner wall blocks the door`);

  // zones: named areas in cells (raids, guard posts and loot read these); default is the whole room
  const zones = (template.zones || [{ name: 'main', rect: [0, 0, X, Z] }]).map(z => {
    const [x0, z0, x1, z1] = z.rect;
    if (x0 < 0 || z0 < 0 || x1 > X || z1 > Z || x1 <= x0 || z1 <= z0) problems.push(`zone "${z.name}": rect outside the room`);
    return { name: z.name, rect: z.rect, minX: ox + x0, minZ: oz + z0, maxX: ox + x1, maxZ: oz + z1 };
  });
  if (problems.length && !quiet) console.warn(`Room "${name}":\n  ${problems.join('\n  ')}`);

  // blocking boxes in world units: the walls, and the solid part of each prop
  const t = W.thickness, blockers = [
    { minX: ox - t, maxX: ox + X + t, minZ: oz - t, maxZ: oz },
    { minX: ox - t, maxX: ox + X + t, minZ: oz + Z, maxZ: oz + Z + t },
    { minX: ox - t, maxX: ox, minZ: oz - t, maxZ: oz + Z + t },
    { minX: ox + X, maxX: ox + X + t, minZ: oz - t, maxZ: oz + Z + t },
  ];
  for (const q of props) {
    if (!q.def.solid || !(q.stands || q.rule === 'ceiling')) continue;
    const [sx, sz] = turned(q.def.solid, q.rot);
    blockers.push({ minX: ox + q.cx - sx / 2, maxX: ox + q.cx + sx / 2, minZ: oz + q.cz - sz / 2, maxZ: oz + q.cz + sz / 2 });
  }
  for (const [x0, z0, x1, z1] of template.furnishingRects || [])
    blockers.push({ minX: ox + x0, minZ: oz + z0, maxX: ox + x1, maxZ: oz + z1 });
  for (const q of innerSegments) blockers.push({ minX: ox + q.x0, maxX: ox + q.x1, minZ: oz + q.z0, maxZ: oz + q.z1 });
  for (const q of partitionSegments) blockers.push({ minX: ox + q.x0, maxX: ox + q.x1, minZ: oz + q.z0, maxZ: oz + q.z1 });

  // props drawn as painted cut-outs instead of 3D (see "cutout" in interior_parts.json)
  const pieces = (template.scenePainting ? [] : props.filter(q => q.cutout))
    .map(q => {
      const [dx, dz] = q.def.painted?.offset || [0, 0];
      return { name: q.cutout, x: ox + q.cx + dx + q.artOffset[0], z: oz + q.cz + dz + q.artOffset[1],
        indoor: true, lift: q.y, depth: true, roomProp: true, angle: q.artAngle,
        artAnchor: q.def.painted?.anchor, shear: q.def.painted?.shear || 0,
        topShear: q.def.painted?.topShear || 0 };
    });
  for (const q of template.scenePainting ? [] : props) for (const decoration of q.def.decorations || []) {
    pieces.push({ name: decoration.cutout, x: ox + q.cx + decoration.offset[0],
      z: oz + q.cz + decoration.offset[1], indoor: true, lift: 0,
      depth: true, roomProp: true, angle: 0 });
  }

  const exit = side === 'north' ? { x: ox + along, z: oz + 1.3 } : { x: ox + 1.3, z: oz + along };
  const spawn = side === 'north' ? { x: ox + along, z: oz + 2.2 } : { x: ox + 2.2, z: oz + along };
  const room = {
    name, kind: '3d', origin: { x: ox, z: oz }, size: [X, Z], template, walls, inner, partitions, interiorDoors, zones, props, blockers, pieces, exit, spawn, problems,
    floor: { texture: template.floor, minX: ox, maxX: ox + X, minZ: oz, maxZ: oz + Z },
  };
  const scale = template.worldScale || 1;
  if (scale === 1) return room;
  const point = p => ({ ...p, x: ox + (p.x - ox) * scale, z: oz + (p.z - oz) * scale });
  const bounds = b => ({ ...b,
    minX: ox + (b.minX - ox) * scale, maxX: ox + (b.maxX - ox) * scale,
    minZ: oz + (b.minZ - oz) * scale, maxZ: oz + (b.maxZ - oz) * scale });
  const rect = r => ({ ...r, x0: r.x0 * scale, x1: r.x1 * scale, z0: r.z0 * scale, z1: r.z1 * scale });
  return { ...room, renderLayout: room, worldScale: scale, size: [X * scale, Z * scale],
    blockers: blockers.map(bounds),
    interiorDoors: interiorDoors.map(d => ({ ...d, ...point(d), rect: rect(d.rect) })),
    zones: zones.map(z => ({ ...bounds(z), rect: z.rect.map(v => v * scale) })),
    props: props.map(p => ({ ...p, rect: rect(p.rect), cx: p.cx * scale, cz: p.cz * scale, y: p.y * scale })),
    pieces: pieces.map(point), exit: point(exit), spawn: point(spawn),
    floor: { ...room.floor, maxX: ox + X * scale, maxZ: oz + Z * scale },
  };
}
