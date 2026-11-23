// Ships plan S1 (Tim 2026-11-22): the water grid, landable shore and ship paths (sim/frontier/water_nav.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { waterGrid, waterAt, sailable, landable, nearestSailable, landingFor, shipPath, shoreCells, cellCentre } from '../src/sim/frontier/water_nav.js';
import { passable } from '../src/sim/world_data.js';

const world = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url)));
const t0 = performance.now(), g = waterGrid(world), buildMs = performance.now() - t0;
assert.equal(waterGrid(world), g, 'cached per world');
// every 5 units along the path is water of the mask, or within half a cell of it (a river step passes a corner)
const near = (x, z, water) => [[0, 0], [g.cell / 2, 0], [-g.cell / 2, 0], [0, g.cell / 2], [0, -g.cell / 2]].some(([dx, dz]) => sailable(g, x + dx, z + dz, water));
const along = (path, water) => path.every(([x, z], i) => { if (!i) return true; const [px, pz] = path[i - 1], n = Math.ceil(Math.hypot(x - px, z - pz) / 5);
  for (let s = 1; s < n; s++) if (!near(px + (x - px) * s / n, pz + (z - pz) * s / n, water)) return false; return true; });
const length = p => p.reduce((n, q, i) => i ? n + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0);
const tangent = f => { const r = world.rivers.find(v => v.id === f.river); let best = Infinity, t = [1, 0];
  for (let k = 0; k < r.points.length - 1; k++) { const a = r.points[k], b = r.points[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, u = Math.max(0, Math.min(1, ((f.x - a[0]) * dx + (f.z - a[1]) * dz) / l)), d = Math.hypot(a[0] + u * dx - f.x, a[1] + u * dz - f.z); if (d < best) { best = d; t = [dx / Math.sqrt(l), dz / Math.sqrt(l)]; } } return t; };

// kinds: open sea is big water; lakes are fishing boat water only (no main river runs into one); streams too
assert.equal(waterAt(g, 100, 100), 'sea'); assert.ok(sailable(g, 100, 100, 'big'));
for (const l of world.lakes) { assert.equal(waterAt(g, l.x, l.z), 'lake', l.id); assert.ok(!sailable(g, l.x, l.z, 'big') && sailable(g, l.x, l.z, 'small'), `${l.id}: fishing boats only`); }
{ let n = 0; for (const s of world.streams) for (let k = 1; k < s.points.length - 1; k++) { const [x, z] = s.points[k]; if (waterAt(g, x, z) !== 'stream') continue; n++; assert.ok(sailable(g, x, z, 'small') && !sailable(g, x, z, 'big')); } assert.ok(n > 40, `stream points are stream water (${n})`); }
// every bridge and ford stops big ships and lets fishing boats through (plan 1.4)
for (const f of world.fords) {
  const [tx, tz] = tangent(f), D = f.kind === 'bridge' ? 60 : 130, box = { x: f.x, z: f.z, r: D + 120 };
  const up = nearestSailable(g, f.x - tx * D, f.z - tz * D, 'big', 60), dn = nearestSailable(g, f.x + tx * D, f.z + tz * D, 'big', 60);
  assert.ok(up && dn, `${f.id}: river water each side`);
  assert.equal(shipPath(g, [up.x, up.z], [dn.x, dn.z], { box, ends: 5 }), null, `${f.id}: a ${f.kind} stops big ships`);
  const p = shipPath(g, [up.x, up.z], [dn.x, dn.z], { box, ends: 5, water: 'small' });
  assert.ok(p && along(p, 'small'), `${f.id}: fishing boats pass the ${f.kind}`);
}
// the sea reaches the river below its last crossing (V1 below the Heron's last bridge), not above it
{ const sea = nearestSailable(g, 13800, 4000, 'big', 300), r = world.rivers.find(v => v.id === 'V1'), m = r.points.at(-3), top = r.points[2];
  const low = nearestSailable(g, m[0], m[1], 'big', 40), high = nearestSailable(g, top[0], top[1], 'big', 40);
  const t = performance.now(), p = shipPath(g, [sea.x, sea.z], [low.x, low.z]), ms = performance.now() - t;
  assert.ok(p && along(p, 'big'), 'sea to the Heron mouth');
  assert.equal(shipPath(g, [sea.x, sea.z], [high.x, high.z]), null, 'not past the bridges');
  console.log(`  sea to Heron mouth: ${p.length} points, ${Math.round(length(p))} long, ${ms.toFixed(1)} ms (grid built in ${Math.round(buildMs)} ms)`); }

// landable shore: walkable land beside the water; mountain or cliff coast is not
{ const shore = shoreCells(g, { x: 13625, z: 4925, r: 900 }, 'big');   // the ship_test town Kurominato (site S48)
  assert.ok(shore.length >= 15, `shore round a harbour town (${shore.length})`);
  for (const k of shore) { const [x, z] = cellCentre(g, k); assert.ok(passable(world, x, z) && landable(g, x, z, 'big')); }
  // its harbour: a ship lands there without being sent elsewhere
  const h = world.sites.find(s => s.id === 'S48').harbor, L = landingFor(g, h.x, h.z, 'big');
  assert.ok(L && L.berth && sailable(g, L.berth.x, L.berth.z, 'big') && Math.hypot(L.land.x - h.x, L.land.z - h.z) < 120, 'lands at the harbour');
  assert.ok(Math.hypot(L.land.x - L.berth.x, L.land.z - L.berth.z) < g.cell * 1.5, 'the berth is beside the landing'); }
{ // a mountain cell on the sea: blocked coast, the landing goes to the nearest landable shore
  let k = -1;
  for (let j = 1; j < g.H - 1 && k < 0; j++) for (let i = 1; i < g.W - 1; i++) { const q = j * g.W + i; if (g.kind[q] || g.walk[q]) continue;
    if ([q - 1, q + 1, q - g.W, q + g.W].some(n => g.kind[n] === 1)) { const [x, z] = cellCentre(g, q); if (landingFor(g, x, z, 'big', { maxR: 400 })) { k = q; break; } } }
  assert.ok(k >= 0, 'a cliff on the sea');
  const [x, z] = cellCentre(g, k), L = landingFor(g, x, z, 'big', { maxR: 400 });
  assert.ok(!landable(g, x, z, 'big') && L.blocked && landable(g, L.land.x, L.land.z, 'big'), 'blocked coast sends the ship to landable shore'); }
// inside a war circle (box): the path never leaves it, and a short path is quick
{ const box = { x: 13625, z: 4925, r: 900 }, a = nearestSailable(g, 13650, 5100, 'big', 200), b = nearestSailable(g, 13700, 4300, 'big', 300);
  assert.ok(a && b, 'water near Kurominato');
  const t = performance.now(), p = shipPath(g, [a.x, a.z], [b.x, b.z], { box }), ms = performance.now() - t;
  assert.ok(p && along(p, 'big') && p.every(([x, z]) => Math.hypot(x - box.x, z - box.z) <= box.r + 1), 'stays in the circle');
  assert.ok(ms < 50, `quick in a circle (${ms.toFixed(1)} ms)`);
  // land as a target: the path ends on the water nearest the click
  const L = landingFor(g, 13625, 5000, 'big', { box }), q = shipPath(g, [a.x, a.z], [L.berth.x, L.berth.z], { box });
  assert.ok(q && sailable(g, ...q.at(-1), 'big'), 'sails to the berth'); }
// no water path: null
assert.equal(shipPath(g, [3700, 2150], [100, 100], { water: 'big' }), null, 'a lake is not joined to the sea for big ships');
console.log('water nav: ok');
