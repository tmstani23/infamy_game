// Where a founded town's buildings stand (frontier E5). Slot 0 is the town hall at the town's
// spot; further slots wind outward in a square spiral, `spacing` world units apart. Pure: used by
// the sim (nothing yet) and the renderer, so the drawing follows the settlement record.
export const TOWN_SPACING = 11;

export function townSlot(i, spacing = TOWN_SPACING) {
  if (i <= 0) return [0, 0];
  // square spiral: ring r holds 8r cells; walk it in order
  let r = 1, k = i - 1;
  while (k >= 8 * r) { k -= 8 * r; r++; }
  const side = 2 * r, seg = Math.floor(k / side), t = k % side;
  const [x, z] = seg === 0 ? [-r + t, -r] : seg === 1 ? [r, -r + t] : seg === 2 ? [r - t, r] : [-r, r - t];
  return [x * spacing, z * spacing];
}
