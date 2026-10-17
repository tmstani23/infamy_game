// Health bar fill and colour for a unit: green when full, through yellow and orange,
// to dark red near death. Plain maths (no three.js) so it can be checked in Node.
const STOPS = [[0, [0.35, 0.03, 0.03]], [0.3, [0.85, 0.2, 0.1]], [0.6, [0.92, 0.75, 0.2]], [1, [0.36, 0.8, 0.3]]];

export function healthBar(hp, maxHp) {
  const frac = maxHp > 0 ? Math.min(1, Math.max(0, hp / maxHp)) : 0;
  let i = 1;
  while (i < STOPS.length - 1 && frac > STOPS[i][0]) i++;
  const [f0, c0] = STOPS[i - 1], [f1, c1] = STOPS[i], k = (frac - f0) / (f1 - f0);
  return { frac, color: c0.map((c, j) => c + (c1[j] - c) * k) };
}
