// Loop 1: the 17 river crossings (9 bridges, 8 fords) sit on their river, have walkable banks, are
// the only way over (or the only short way), and real island routes (sim/areas.js HPA*) use them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAreas } from '../src/sim/areas.js';
import { existsSync } from 'node:fs';
import { terrainAt, passable } from '../src/sim/world_data.js';
import { createPaint } from '../src/world_paint.js';
import { crossingPropsInChunk, riverDirection } from '../src/world_features.js';

const data = f => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
const world = data('world'), cfg = data('world_chunks');
const R = world.rules.fordRadius;
assert.equal(world.fords.length, 17);
assert.equal(world.fords.filter(f => f.kind === 'bridge').length, 9);
assert.equal(world.fords.filter(f => f.kind === 'ford').length, 8);

// distance of a point to a river polyline, and the local direction
function riverNear(f) {
  const r = world.rivers.find(r => r.id === f.river);
  let best = { d: Infinity };
  for (let i = 0; i < r.points.length - 1; i++) {
    const [a, b] = [r.points[i], r.points[i + 1]], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((f.x - a[0]) * dx + (f.z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(a[0] + t * dx - f.x, a[1] + t * dz - f.z);
    if (d < best.d) best = { d, dx, dz, r };
  }
  const n = Math.hypot(best.dx, best.dz);
  return { ...best, nx: -best.dz / n, nz: best.dx / n };
}
// first walkable land point leaving the crossing along the river's normal, on each side
function bank(f, k, sign) {
  for (let s = 60; s <= 420; s += 20) {
    const x = f.x + sign * k.nx * s, z = f.z + sign * k.nz * s;
    if (terrainAt(world, x, z) !== 'r' && passable(world, x, z)) return [x + sign * k.nx * 60, z + sign * k.nz * 60];
  }
  return null;
}
// distance from a point to the nearest part of a path
function near(points, f) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]], dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((f.x - a[0]) * dx + (f.z - a[1]) * dz) / L));
    best = Math.min(best, Math.hypot(a[0] + t * dx - f.x, a[1] + t * dz - f.z));
  }
  return best;
}

const areas = createAreas({ world, cfg, seed: 1 });
const bad = [];
for (const f of world.fords) {
  const k = riverNear(f);
  assert.equal(terrainAt(world, f.x, f.z), 'r', `${f.id} sits on a river cell`);
  assert.ok(k.d < 30, `${f.id} sits on its river line (${k.d.toFixed(0)} u off)`);
  const A = bank(f, k, 1), B = bank(f, k, -1);
  assert.ok(A && B, `${f.id} has walkable banks on both sides`);
  assert.ok(passable(world, f.x, f.z), `${f.id} is walkable`);
  const r = areas.route(A[0], A[1], B[0], B[1]);
  assert.ok(r && r.points.length, `${f.id} has a route across`);
  const pts = [A, ...r.points];
  const used = near(pts, f);
  // a route may use a nearer crossing, but it never fords the river anywhere else
  for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t <= 1; t += 0.05) {
    const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    if (terrainAt(world, x, z) === 'r') assert.ok(world.fords.some(c => Math.hypot(c.x - x, c.z - z) < R + 1), `${f.id}: route wades river at ${x | 0},${z | 0} away from every crossing`);
  }
  if (used > R) bad.push(`${f.id} (route passes ${used.toFixed(0)} u away, via another crossing)`);
}
// Drawing: gravel bar at every ford (not elsewhere), plank strip across the river at every bridge.
const pc = { ...data('world_paint'), ...data('world_crossings') }, paint = createPaint(world, pc);
for (const f of world.fords.filter(f => f.kind === 'ford')) {
  assert.ok(paint.fordAt(f.x, f.z) > 0.9, `${f.id} has a gravel bar`);
  assert.equal(paint.fordAt(f.x + 400, f.z + 400), 0, `${f.id} gravel stays local`);
  const o = paint.paintChunk(Math.floor(f.x / 250) * 250, Math.floor(f.z / 250) * 250, 250, { segs: [], stamps: [] });
  const k = Math.floor((f.z - Math.floor(f.z / 250) * 250) / 250 * (o.N - 2) + 1) * o.N + Math.floor((f.x - Math.floor(f.x / 250) * 250) / 250 * (o.N - 2) + 1);
  assert.ok(o.O[k * 4] < 0.5 * 255, `${f.id}: ford water is thin`);
  assert.ok(o.O[k * 4 + 1] > 150, `${f.id}: ford has the clear shallow look`);
}
for (const f of world.fords.filter(f => f.kind === 'bridge')) assert.equal(paint.fordAt(f.x, f.z), 0, `${f.id} bridges get no gravel bar`);
const decals = [];
for (let z = 0; z < world.size.h; z += 250) for (let x = 0; x < world.size.w; x += 250) decals.push(...crossingPropsInChunk(world, x, z, 250, pc.bridge, paint.waterAt));
assert.equal(decals.length, 9, 'one plank strip per bridge');
assert.ok(existsSync(new URL('../art/props/bridge_planks.png', import.meta.url)), 'plank art exists');
for (const d of decals) {
  const f = world.fords.find(f => f.id === d.feature), r = riverDirection(world, f);
  assert.ok(Math.abs(Math.cos(d.angle) * r.tx + Math.sin(d.angle) * r.tz) < 1e-6, `${d.feature} strip runs across the river`);
  assert.ok(d.width > 8 && d.width < 280, `${d.feature} strip spans the painted water, not far past it (${d.width.toFixed(0)} u)`);
  assert.equal(d.reach, d.width / 2);
}
console.log('crossings routed through another crossing:', bad.length ? bad.join('; ') : 'none');
console.log('test_crossings: 17 crossings on the river, banks walkable, routes only wade at crossings, 8 gravel fords, 9 plank bridges');
