// Built-in island roads as textured strips (src/road_strips.js, Tim 2026-11-21).
//   node game/tools/test_road_strips.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createPaint } from '../src/world_paint.js';
import { roadLines, smoothLine, buildStrip, buildFillets, linesNear, roadClearSegments } from '../src/road_strips.js';
import { trailSegments } from '../src/world_paint.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), pc = data('data/world_paint.json'), RS = pc.trail.strips, P = createPaint(world, pc);
assert.ok(existsSync(new URL(`../${RS.art}`, import.meta.url)), 'road strip art is built (tools/build_road_strips.py)');
for (const b of pc.biomes) assert.ok(RS.types[b] >= 0 && RS.types[b] < 6, `biome ${b} has a road type`);
assert.equal(RS.tone.length, 6, 'one tone per road type');

assert.equal(roadLines(world, pc.paths?.list).length, world.corridors.length + (pc.paths?.list.length || 0), 'without a network every corridor and path is a road');
const lines = roadLines(world, pc.paths?.list, RS), NW = RS.network;
assert.ok(NW, 'roads are joined and shaped (strips.network)');
assert.strictEqual(roadLines(world, pc.paths?.list, RS), lines, 'the network is built once');
// natural roads (Tim 2026-11-25): every piece belongs to exactly one joined road, fewer roads than pieces
const pieces = lines.flatMap(l => l.id.split('+'));
assert.equal(new Set(pieces).size, pieces.length, 'no piece is drawn twice');
assert.equal(pieces.length, world.corridors.length + (pc.paths?.list.length || 0), 'every corridor and path is drawn');
assert.ok(lines.length < pieces.length / 2, 'pieces are joined into whole roads');
// a plain join is never a road end; the straightest pair runs through a crossroads
const ends = new Map(); for (const c of world.corridors) for (const p of [c.points[0], c.points[c.points.length - 1]]) ends.set(p.join(), (ends.get(p.join()) || 0) + 1);
for (const l of lines) for (const e of [0, 1]) { const p = e ? l.points[l.points.length - 1] : l.points[0]; if (l.ends[e] === 'free') assert.notEqual(ends.get(p.join()), 2, `road ${l.id} does not stop at a plain join`); }
// shaped roads stay near their corridors (wander + branch curves), and are smooth (no sharp kinks)
const raw = world.corridors.flatMap(c => c.points.slice(1).map((b, k) => [c.points[k], b])).concat((pc.paths?.list || []).flatMap(p => p.slice(1).map((b, k) => [p[k], b])));
const sd = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
for (const l of lines.filter((_, i) => i % 5 === 0)) {
  for (let i = 0; i < l.points.length; i += 7) { const [x, z] = l.points[i]; if (world.fords.some(f => Math.hypot(f.x - x, f.z - z) < 2 * NW.crossReach + NW.crossLead)) continue;   // pulled onto a bridge or ford (checked below)
    assert.ok(Math.min(...raw.map(([a, b]) => sd(x, z, a, b))) < NW.meander + NW.branchR * 0.4, `road ${l.id} stays near its corridor`); }
  for (let i = 2; i < l.points.length; i++) {
    const [a, b, c] = [l.points[i - 2], l.points[i - 1], l.points[i]], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    const cos = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1);
    assert.ok(cos > 0.5, `road ${l.id} has no sharp kink`);
  }
}
// roads onto bridges and fords (Tim 2026-11-26): every crossing a road runs through gets that road dead straight
// across it, square to the flow, over the water on both sides
{
  const { riverDirection } = await import('../src/world_features.js');
  let met = 0;
  for (const f of world.fords) {
    const { tx, tz } = riverDirection(world, f), n = [-tz, tx];
    let best = null;
    for (const l of lines) for (let k = 1; k < l.points.length; k++) { const d = sd(f.x, f.z, l.points[k - 1], l.points[k]); if (!best || d < best.d) best = { d, l }; }
    if (best.d > 1) continue;   // no road comes this way
    met++;
    // the middle of the river (a junction on a bank can start its curve a little over the water's edge)
    for (let v = -24; v <= 24; v += 4) {
      const x = f.x + n[0] * v, z = f.z + n[1] * v;
      assert.ok(best.l.points.slice(1).some((q, k) => sd(x, z, best.l.points[k], q) < 1.5), `road ${best.l.id} runs straight over crossing ${f.id}`);
    }
  }
  assert.ok(met >= 13, `roads run over their crossings (${met})`);
}
// props keep clear of the shaped roads
const [x0, z0] = lines[0].points[Math.floor(lines[0].points.length / 2)].map(v => v - 100);
const near = trailSegments(world, x0, z0, x0 + 200, z0 + 200, 10, pc.paths?.list, RS);
assert.ok(near.length && near.every(s => roadClearSegments(world, pc.paths?.list, RS, x0, z0, x0 + 200, z0 + 200, 10).some(t => t[0] === s[0])), 'prop clearance follows the shaped roads');

// smoothing keeps the ends (roads still meet at junctions) and stays near the line
const sq = smoothLine([[0, 0], [100, 0], [100, 100]], RS.step, RS.smooth);
assert.deepEqual(sq[0], [0, 0]); assert.deepEqual(sq[sq.length - 1], [100, 100]);
for (const [x, z] of sq) assert.ok(Math.min(Math.hypot(x - Math.min(x, 100), z), Math.abs(x - 100)) < 15, 'smoothed road stays near its line');

// a sample of real roads: width, continuous uv, type weights sum to 1, fade only over water
let wet = 0;
for (const l of lines.filter((_, i) => i % 12 === 0)) {
  const r = buildStrip(l, P, RS);
  assert.ok(r.n > 2, `road ${l.id} has points`);
  for (let i = 0; i < r.n; i++) {
    const w = Math.hypot(r.pos[i * 4] - r.pos[i * 4 + 2], r.pos[i * 4 + 1] - r.pos[i * 4 + 3]), at = r.uv[i * 4 + 1] * RS.repeat;
    const mid = at > NW.branchR && r.length - at > NW.branchR;   // away from the road's ends
    const vary = NW.widthVary || 0;
    if (mid) assert.ok(Math.abs(w - RS.width) <= RS.width * vary + 1e-3, `road ${l.id} is ${RS.width} wide, give or take ${vary * 100}%`);
    else assert.ok(Math.abs(w - RS.width) <= RS.width * vary + 1e-3, `road ${l.id} keeps its width to the end`);
    for (const s of [0, 1]) assert.ok(r.side[i * 2 + s] >= 0 && r.side[i * 2 + s] <= 1 && (r.side[i * 2 + s] === 1 || r.tip[i]), 'only a branch or crossing end fades a side');
    if (i) assert.ok(r.uv[i * 4 + 1] >= r.uv[(i - 1) * 4 + 1], 'texture runs forward along the road');
    let s = 0; for (let k = 0; k < 6; k++) s += r.types[i * 6 + k];
    assert.ok(Math.abs(s - 1) < 1e-4, 'road type weights sum to 1');
    const x = (r.pos[i * 4] + r.pos[i * 4 + 2]) / 2, z = (r.pos[i * 4 + 1] + r.pos[i * 4 + 3]) / 2;
    if (i === 0 || i === r.n - 1) assert.ok(r.fade[i] < 0.01, 'road ends fade out (no square caps)');
    if (r.fade[i] < 1 && mid) { wet++; assert.ok(P.waterAt(x, z) > RS.waterFade[0], 'a road only fades over water'); }
  }
  assert.ok(Math.abs(r.uv[(r.n - 1) * 4 + 1] * RS.repeat - r.length) < 1e-2, 'uv follows the length');
  assert.equal(JSON.stringify(buildStrip(l, P, RS).types), JSON.stringify(r.types), 'same road twice is identical');
}
// snowy roads use the snow strip
const snowy = lines.find(l => { const [x, z] = l.points[1]; return P.biomes[P.gridAt(x, z)] === 'snow'; });
if (snowy) { const r = buildStrip(snowy, P, RS); assert.ok(Math.max(...Array.from({ length: r.n }, (_, i) => r.types[i * 6 + 5])) > 0.5, 'a road through snow uses the snow strip'); }
assert.ok(linesNear(lines, lines[0].points[0][0], lines[0].points[0][1], 10).includes(lines[0]), 'a road is found near its own start');
// junctions: a branch end curves onto the road it meets, and its side lying over that road fades out
const branches = lines.filter(l => l.joins?.some(Boolean));
assert.ok(branches.length > 20, 'branches curve into the roads they meet');
for (const l of branches.slice(0, 10)) {
  const e = l.joins[0] ? 0 : 1, j = l.joins[e], end = e ? l.points[l.points.length - 1] : l.points[0];
  assert.ok(Math.hypot(end[0] - j.at[0], end[1] - j.at[1]) < 1e-6, `branch ${l.id} ends on the road it meets`);
  const r = buildStrip(l, P, RS), near = Array.from({ length: r.n }, (_, i) => i).filter(i => r.tip[i] && (e ? i > r.n / 2 : i < r.n / 2));
  assert.ok(near.length && near.some(i => Math.min(r.side[i * 2], r.side[i * 2 + 1]) < 0.5), `branch ${l.id} fades into the road it meets`);
}
// rounded corners at junctions: arcs within filletR, fading in from both ends, on the land near their junction
const filleted = lines.filter(l => l.fillets?.length);
assert.ok(filleted.length > 20, 'junction corners are rounded');
for (const l of filleted.slice(0, 10)) {
  for (const f of l.fillets) assert.ok(f.r >= 2 && f.r <= NW.filletR * 1.3 + 1e-6, `corner radius ${f.r} in range`);
  const m = buildFillets(l, P, RS), K = m.n / l.fillets.length / 4;
  assert.ok(m.idx.length && m.idx.every(i => i < m.n), 'corner mesh indices are valid');
  for (let i = 0; i < m.n; i++) assert.ok(m.fade[i] >= 0 && m.fade[i] <= 1, 'corner alpha 0..1');
  for (let q = 0; q < l.fillets.length; q++) for (const k of [0, K - 1]) assert.ok(m.fade[(q * K + k) * 4] < 0.01, 'a corner fades into the roads\' own verges at its ends');
}
console.log(`road strips ok (${lines.length} roads, ${wet} faded points over water in the sample)`);
