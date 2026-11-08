// The town railway station (Tim 2026-11-07): one 3x2 placement with the ticket hall, the engine shed and the
// railway slot in a row along the track. rot 0..3 = the track leaves toward +x, +z, -x, -z (R turns the ghost
// while placing, src/frontier_build_ui.js). The slot is kept clear for the track; the line ends in the shed.
// A station with no rot (or not 6 cells) is an old 2x2 one and keeps working as before.
//   shapeOf(spec, rot) -> [cols, rows] or null when the building has no shape (then size x size)
//   stationParts(s, b) -> { rot, dir, hallCells, shedCells, slotCells, hall, shed, slot, slotFar } (offsets from the
//                         town's middle, like cellOffset) or null for an old station
import { cellOffset } from './town_grid.js';

export const TRACK_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function shapeOf(spec, rot = 0) {
  const sh = spec?.shape;
  if (!Array.isArray(sh) || sh.length !== 2) return null;
  return rot % 2 ? [sh[1], sh[0]] : [sh[0], sh[1]];
}

export function stationParts(s, b) {
  if (!s?.grid || !Number.isInteger(b?.rot) || b.cells?.length !== 6) return null;
  const { n, cell } = s.grid, rot = ((b.rot % 4) + 4) % 4, [dx, dz] = TRACK_DIRS[rot];
  const c0 = Math.min(...b.cells.map(i => i % n)), r0 = Math.min(...b.cells.map(i => Math.floor(i / n)));
  // 0 = hall, 1 = shed, 2 = slot, counted along the track
  const along = i => { const c = i % n - c0, r = Math.floor(i / n) - r0; return rot === 0 ? c : rot === 2 ? 2 - c : rot === 1 ? r : 2 - r; };
  const part = k => b.cells.filter(i => along(i) === k);
  const mid = cells => { const o = cells.map(i => cellOffset(s, i)); return [o.reduce((a, p) => a + p[0], 0) / o.length, o.reduce((a, p) => a + p[1], 0) / o.length]; };
  const hallCells = part(0), shedCells = part(1), slotCells = part(2);
  if (hallCells.length !== 2 || shedCells.length !== 2 || slotCells.length !== 2) return null;
  const hall = mid(hallCells), shed = mid(shedCells), slot = mid(slotCells);
  return { rot, dir: [dx, dz], hallCells, shedCells, slotCells, hall, shed, slot, slotFar: [slot[0] + dx * cell / 2, slot[1] + dz * cell / 2] };
}
