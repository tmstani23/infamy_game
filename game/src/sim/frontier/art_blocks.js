// Blocking that matches the art (war collision checkpoint 5b-0, Tim 2026-11-11). Pure: no DOM, no randomness.
// Every town, zone and war camp building blocks the ground its art stands on: art/cutouts.json "blocks"
// (tools/build_art_blockers.py reads them from the art's outline), scaled to the size the art is drawn at
// (render: catalog scale, shrunk to maxFootprint, the same sum as render/world_ground.js).
// Art with a hand-set footprint (art.json "foot") blocks that footprint times its solid share.
// frontier.json townArt._noBlock lists art that blocks nothing.
import { artItem, footprint, PPU } from '../geometry.js';

const registry = new WeakMap();
let last = null;
// called once when a game is made (sim/game.js): the frontier data gets its art, so the town grid can ask for boxes
export function registerTownArt(data, catalog, cutouts) {
  if (!data || !catalog || !cutouts) return;
  registry.set(data, { catalog, cutouts, memo: new Map() });
  last = data;
}
// callers that pass no data get the game's own (one frontier data set per process)
export const townArtData = data => data && registry.has(data) ? data : last;

// Boxes of one piece of art, as offsets from the spot it is drawn at: [{minX, maxX, minZ, maxZ}], or null
// when the art is unknown (the caller keeps its old rule). An empty list blocks nothing.
export function artBoxes(data, name, maxFootprint = 0, flip = false) {
  const reg = data && registry.get(data);
  if (!reg || !name) return null;
  const key = `${name}:${maxFootprint}:${flip ? 1 : 0}`;
  if (reg.memo.has(key)) return reg.memo.get(key);
  let out = null;
  const entry = reg.catalog.items?.[name];
  if (entry) {
    const item = artItem(reg.catalog, name), meta = reg.cutouts[`${item.kind}/${name}`];
    if (data.townArt?._noBlock?.includes(name)) out = [];
    else if (meta) {
      const f = footprint(item, meta, flip), fit = maxFootprint ? Math.min(1, maxFootprint / (2 * Math.max(f.fa, f.fb))) : 1;
      if (meta.blocks && !item.foot) {
        const k = item.scale / PPU * fit;
        out = meta.blocks.map(([x0, z0, x1, z1]) => flip ? { minX: z0 * k, maxX: z1 * k, minZ: x0 * k, maxZ: x1 * k } : { minX: x0 * k, maxX: x1 * k, minZ: z0 * k, maxZ: z1 * k });
      } else {
        const share = (item.solid > 0 ? item.solid : 0.82) * fit, a = f.fa * share / 2, b = f.fb * share / 2;
        out = [{ minX: -a, maxX: a, minZ: -b, maxZ: b }];
      }
    }
  }
  reg.memo.set(key, out);
  return out;
}
