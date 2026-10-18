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
    solid: item.solid > 0 ? rect(entry.x, entry.z, f.fa * item.solid, f.fb * item.solid) : null,
  };
}

// Every building and prop of a district
export function placeScenery(district, catalog, cutouts) {
  return [
    ...district.buildings.map((b, i) => ({ name: b.art, x: b.x, z: b.z, business: b.business || null, building: i })),
    ...district.props.map(([name, x, z]) => ({ name, x, z })),
  ].map(e => placePiece(e, catalog, cutouts)).filter(Boolean);
}
