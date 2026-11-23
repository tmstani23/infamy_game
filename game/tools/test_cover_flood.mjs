// The trap check's short cut (2026-11-22): coverKeepsFlood says when blocking a footprint cannot cut any other flooded
// cell off, so placement.check and buildingSafety need no second flood of the whole town grid. Whenever it says yes,
// a real second flood must give the old flood less the footprint, cell for cell.
// Run: node game/tools/test_cover_flood.mjs
import assert from 'node:assert/strict';
import { coverKeepsFlood } from '../src/sim/frontier/building_safety.js';

let seed = 3; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const n = 22, N = n * n, border = i => { const c = i % n, r = (i - c) / n; return c === 0 || r === 0 || c === n - 1 || r === n - 1; };
function flood(open) {
  const seen = new Uint8Array(N), stack = [];
  for (let i = 0; i < N; i++) if (border(i) && open[i]) { seen[i] = 1; stack.push(i); }
  while (stack.length) { const i = stack.pop(), c = i % n; for (const j of [c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1, i - n, i + n]) if (j >= 0 && j < N && !seen[j] && open[j]) { seen[j] = 1; stack.push(j); } }
  return seen;
}
let yes = 0, no = 0, cut = 0;
for (let g = 0; g < 400; g++) {
  const open = new Uint8Array(N), fill = 0.15 + rnd() * 0.4; for (let i = 0; i < N; i++) open[i] = rnd() > fill ? 1 : 0;
  const before = flood(open);
  for (let k = 0; k < 40; k++) {
    const a = Math.floor(rnd() * N), col = a % n, shape = Math.floor(rnd() * 4), cover = [];
    const [w, h] = shape === 0 ? [1, 1] : shape === 1 ? [2, 2] : shape === 2 ? [3, 2] : rnd() < 0.5 ? [1 + Math.floor(rnd() * 8), 1] : [1, 1 + Math.floor(rnd() * 8)];
    for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) { const j = a + dz * n + dx; if (col + dx < n && j < N && open[j]) cover.push(j); }
    if (!cover.length) continue;
    const what = open.slice(); for (const j of cover) what[j] = 0;
    const after = flood(what); let same = true;
    for (let i = 0; i < N; i++) if (after[i] !== (cover.includes(i) ? 0 : before[i])) { same = false; break; }
    if (!same) cut++;
    if (coverKeepsFlood(before, n, cover, border)) { yes++; assert.ok(same, `grid ${g} cover ${cover}: said safe but the second flood differs`); } else no++;
  }
}
assert.ok(yes > 3000 && cut > 300, `enough cases of both kinds (${yes} safe, ${cut} really cut)`);
assert.equal(coverKeepsFlood(new Uint8Array(N).fill(1), n, [0], border), false, 'a footprint on a start cell is never sure');
assert.equal(coverKeepsFlood(new Uint8Array(N).fill(1), n, [-1], border), false, 'nor one off the grid');
console.log('test_cover_flood: ok', JSON.stringify({ yes, no, cut }));
