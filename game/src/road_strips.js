// Built-in island roads as textured strips (2026-11-21): the corridors of world.json (plus world_paint.json
// `paths`) were painted into the coarse ground weight maps and came out blotchy and broken, worst on snow. Now each
// is a ribbon mesh along a smoothed copy of its line, textured from the road strip sheet (six road types, one per
// kind of land, art/ground/island/road_strips.png, built by tools/build_road_strips.py). The road type follows the
// biome field and fades between types where the land changes; the road fades out over water. Pure (Node-tested,
// tools/test_road_strips.mjs); render/world_ground.js turns the arrays into meshes.
//
// Natural roads (2026-11-25): the corridors are short straight pieces meeting end to end, so drawn one strip each
// they showed square seams at every join and hard right-angle T junctions. With `strips.network` set, roadLines joins
// the pieces into whole roads (at a junction the straightest pair carries on through), gives long runs a gentle
// wander that calms down near junctions and road ends, and lets each branch curve into the road it meets (a Y, not
// a T) with a widened end that fades into it. Props keep clear of the same shaped lines (roadClearSegments, used by
// world_paint.js trailSegments). Only drawing and prop clearance follow the shape; walking and the world do not.

import { shorelineTopology } from './sim/shoreline.js';

const withBox = l => ({ ...l, box: { minX: Math.min(...l.points.map(p => p[0])), maxX: Math.max(...l.points.map(p => p[0])), minZ: Math.min(...l.points.map(p => p[1])), maxZ: Math.max(...l.points.map(p => p[1])) } });
const memo = new WeakMap();   // world -> WeakMap(network cfg -> lines)

// every road as a polyline: [{ id, points: [[x, z], ...], ends: [kind, kind], box }]. Without a network cfg each
// corridor and extra path is its own road (ends 'free'); with one they are joined and shaped (see above).
export function roadLines(world, paths = [], cfg = null) {
  const raw = [...(world.corridors || []).map((c, i) => ({ id: c.id ?? `c${i}`, points: c.points })), ...(paths || []).map((p, i) => ({ id: `path${i}`, points: p }))]
    .filter(l => l.points?.length > 1);
  const N = cfg?.network;
  if (!N) return raw.map(l => withBox({ ...l, ends: ['free', 'free'] }));
  let byCfg = memo.get(world);
  if (!byCfg) memo.set(world, byCfg = new WeakMap());
  if (!byCfg.has(N)) { const { lines, quiet } = alignCrossings(world, raw, N); byCfg.set(N, roadNetwork(lines, N, cfg.step ?? 40, cfg.smooth ?? 4, cfg.width ?? 8, quiet).map(withBox)); }
  return byCfg.get(N);
}

// Roads onto their bridges and fords (2026-11-26): world.json places each crossing (world.fords, bridge or ford)
// on its own, 20 to 120 units beside where its road's corridor crosses the river, so the road ran into the water
// beside the bridge. Each road crossing a river is matched to the nearest free crossing on that river (within
// network.crossReach), then the land round the crossing is warped: near it every road moves and turns as one piece so
// the road runs dead straight across the river through the crossing, square to the flow like the deck
// (world_features.js crossingPropsInChunk), and on past the water by crossRun each side; the pull fades out over
// crossLead. Junctions move with their roads, so nothing comes apart. Only the drawn roads and prop clearance move;
// the crossing, walking and the world do not. quiet = [{ at, r }]: no wander within r of a crossing (roadNetwork).
const flowAt = (river, x, z) => {
  let best = Infinity, t = [1, 0];
  for (let i = 0; i < river.points.length - 1; i++) { const a = river.points[i], b = river.points[i + 1], d = segDist(x, z, a, b); if (d < best) { best = d; t = unit(b[0] - a[0], b[1] - a[1]); } }
  return t;
};
function segCross(a, b, c, d) {   // where segment ab crosses cd: [t along ab] or null
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
export function alignCrossings(world, raw, N) {
  const reach = N.crossReach ?? 0, quiet = [];
  if (!(reach > 0)) return { lines: raw, quiet };
  const rivers = new Map((world.rivers || []).map(r => [r.id, r]));
  // painted water, as world_paint.js waterAt draws it (the bridge deck is as long as this water)
  const T = world.terrain, shore = T?.shoreline?.radius ? shorelineTopology(world) : null;
  const wet = (x, z) => { const raw = T?.rows?.[Math.floor(z / T.cell)]?.[Math.floor(x / T.cell)] ?? 'w'; return 'wr'.includes(shore ? shore.codeAt(x, z, raw, true) : raw); };
  // every place a road crosses a river centre line, with the crossings on that river it could take
  const hits = [];
  raw.forEach((l, li) => { let s0 = 0; for (let k = 1; k < l.points.length; k++) {
    const a = l.points[k - 1], b = l.points[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const r of rivers.values()) for (let j = 1; j < r.points.length; j++) {
      const t = segCross(a, b, r.points[j - 1], r.points[j]);
      if (t != null) hits.push({ li, s: s0 + t * len, at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], river: r.id, dir: unit(b[0] - a[0], b[1] - a[1]) });
    }
    s0 += len;
  } });
  // closest road and crossing first, each used once
  const pairs = [];
  for (const h of hits) for (const f of world.fords || []) if (f.river === h.river) { const d = Math.hypot(f.x - h.at[0], f.z - h.at[1]); if (d <= reach) pairs.push({ h, f, d }); }
  pairs.sort((p, q) => p.d - q.d);
  const usedH = new Set(), usedF = new Set(), byLine = new Map();
  for (const p of pairs) { if (usedH.has(p.h) || usedF.has(p.f)) continue; usedH.add(p.h); usedF.add(p.f); (byLine.get(p.h.li) ?? byLine.set(p.h.li, []).get(p.h.li)).push(p); }
  // each crossing pulls the land around it (a smooth warp, applied to every road near it, so junctions move with
  // their roads): within H of the crossing the road is moved and turned as one piece onto the crossing's line
  // (straight across, square to the flow); from there out to H + crossLead (+ how far it moved) the pull fades
  const warps = [];
  for (const p of pairs) if (usedH.has(p.h) && usedF.has(p.f) && byLine.get(p.h.li)?.includes(p)) {
    const { h, f } = p, r = rivers.get(f.river), [tx, tz] = flowAt(r, f.x, f.z);
    let n = [-tz, tx]; if (n[0] * h.dir[0] + n[1] * h.dir[1] < 0) n = [-n[0], -n[1]];
    const span = (sign, max = r.width || 100) => { let last = 0, dry = 0; for (let v = 0; v <= max; v += 2) {   // a lake beside the crossing does not count for the pull
      if (wet(f.x + n[0] * v * sign, f.z + n[1] * v * sign)) { last = v; dry = 0; } else if ((dry += 2) > 12 && v > 12) break; } return last; };
    const H = Math.max(span(-1), span(1), 10) + (N.crossRun ?? 20), move = [f.x - h.at[0], f.z - h.at[1]];
    const turn = Math.atan2(h.dir[0] * n[1] - h.dir[1] * n[0], h.dir[0] * n[0] + h.dir[1] * n[1]);
    // a junction this close to the crossing would land on the deck: the land round it is spread out (scale k, at most
    // crossSpread) so it lands past the straight run
    const P = raw[h.li].points, along = q => (q[0] - h.at[0]) * h.dir[0] + (q[1] - h.at[1]) * h.dir[1];   // its end junctions, measured along the crossing's line once turned onto it
    const bank = (N.crossRun ?? 20) + 5, k = Math.min(N.crossSpread ?? 2.5, Math.max(1, (span(-1) + bank) / Math.max(-along(P[0]), 1), (span(1) + bank) / Math.max(along(P[P.length - 1]), 1)));
    const deck = Math.max(span(-1, 250), span(1, 250), 10) + (N.crossRun ?? 20);   // the road itself stays straight as far as the deck goes (over a lake too)
    warps.push({ li: h.li, X: h.at, F: [f.x, f.z], n, move, turn, k, H: deck, r0: H, r1: H + Math.max((N.crossLead ?? 150) + Math.hypot(...move) * 1.2, 2 * (k - 1) * H + 50) });
    quiet.push({ at: [f.x, f.z], r: H });
  }
  // the pulls add up (each measured from where the point was), then near each crossing whatever runs along its line
  // is combed onto it, so the road over the deck is dead straight
  const comb = N.crossComb ?? 20;
  const warp = q => {
    let x = q[0], z = q[1];
    const ws = warps.map(W => { const d = Math.hypot(q[0] - W.X[0], q[1] - W.X[1]); return d >= W.r1 ? 0 : 1 - smoothstep((d - W.r0) / (W.r1 - W.r0)); });
    for (let i = 0; i < warps.length; i++) {
      const W = warps[i], w = ws[i];
      if (!w) continue;
      let keep = 1; for (let j = 0; j < ws.length; j++) if (j !== i) keep *= 1 - ws[j] * smoothstep((ws[j] - w + 0.2) / 0.4);   // where another crossing pulls harder this one lets go
      if (!keep) continue;
      const dx = (q[0] - W.X[0]) * keep, dz = (q[1] - W.X[1]) * keep, a = W.turn * w, dd = Math.hypot(q[0] - W.X[0], q[1] - W.X[1]), m = dd <= W.r0 ? W.k : 1 + (W.k - 1) * W.r0 * w / dd, c = Math.cos(a) * m, s = Math.sin(a) * m;
      x += dx * c - dz * s - dx + W.move[0] * w * keep; z += dx * s + dz * c - dz + W.move[1] * w * keep;
    }
    for (const W of warps) {
      const ax = x - W.F[0], az = z - W.F[1], along = ax * W.n[0] + az * W.n[1], off = -ax * W.n[1] + az * W.n[0];
      const k = (1 - smoothstep(Math.abs(off) / comb)) * (1 - smoothstep((Math.abs(along) - W.H) / comb));
      x += W.n[1] * off * k; z -= W.n[0] * off * k;
    }
    return [x, z];
  };
  const touched = l => warps.some(W => l.points.some((p, k) => k && segDist(W.X[0], W.X[1], l.points[k - 1], p) < W.r1));
  const lines = raw.map(l => {
    if (!touched(l)) return l;
    const dense = [l.points[0]];   // split into short steps so the warp can bend it
    for (let k = 1; k < l.points.length; k++) { const a = l.points[k - 1], b = l.points[k], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10)); for (let i = 1; i <= m; i++) dense.push([a[0] + (b[0] - a[0]) * i / m, a[1] + (b[1] - a[1]) * i / m]); }
    const pts = dense.map(warp);
    // its own crossings: the stretch of it through the crossing, out to H each side (or until it leaves the line), is
    // laid exactly on the crossing's line, easing back to its warped shape over the next crossComb x 2 units
    for (const W of warps) if (W.li === raw.indexOf(l)) {
      const rel = q => { const ax = q[0] - W.F[0], az = q[1] - W.F[1]; return [ax * W.n[0] + az * W.n[1], -ax * W.n[1] + az * W.n[0]]; };
      let i0 = 0, bd = Infinity; pts.forEach((q, i) => { const d = Math.hypot(q[0] - W.F[0], q[1] - W.F[1]); if (d < bd) { bd = d; i0 = i; } });
      for (const dir of [-1, 1]) {
        let ease = 0;
        for (let i = i0; i > 0 && i < pts.length - 1; i += dir) {
          const [along, off] = rel(pts[i]);
          if (ease || Math.abs(along) > W.H || Math.abs(off) > comb) ease += Math.hypot(pts[i][0] - pts[i - dir][0], pts[i][1] - pts[i - dir][1]);
          const k = 1 - smoothstep(ease / (2 * comb));
          if (k <= 0) break;
          pts[i] = [pts[i][0] + W.n[1] * off * k, pts[i][1] - W.n[0] * off * k];
        }
      }
    }
    return { ...l, points: pts };
  });
  return { lines, quiet };
}

// The line split every `step` units, then corner-cut `smooth` times (Chaikin), so it bends instead of zig-zagging.
// The ends stay where they were, so roads still meet at their junctions.
export function smoothLine(points, step = 40, smooth = 4) {
  let p = [];
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k], b = points[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let i = 0; i < n; i++) p.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  }
  p.push(points[points.length - 1]);
  for (let r = 0; r < smooth; r++) {
    const o = [p[0]];
    for (let k = 0; k < p.length - 1; k++) {
      const a = p[k], b = p[k + 1];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    o.push(p[p.length - 1]);
    p = o;
  }
  return p;
}

const boxOf = P => [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
const unit = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
const nodeKey = p => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
const hash = (x, z, s = 0) => { const h = Math.sin(x * 12.9898 + z * 78.233 + s * 37.719) * 43758.5453; return h - Math.floor(h); };
const smoothstep = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2));
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

// N = strips.network (data/world_paint.json, every key explained in its _note). Returns the shaped roads:
// [{ id: 'C1+C2+...', points, ends: ['free' | 'branch', ...], joins?: [{ at, dir } | null, ...], crossings?: [{ at, dir }] }]
export function roadNetwork(raw, N, step = 40, smooth = 4, width = 8, quiet = []) {
  // 1. ends at each node, with the direction leaving the node
  const nodes = new Map();
  raw.forEach((l, i) => [0, 1].forEach(e => {
    const p = e ? l.points[l.points.length - 1] : l.points[0], q = e ? l.points[l.points.length - 2] : l.points[1], k = nodeKey(p);
    if (!nodes.has(k)) nodes.set(k, { p, ends: [] });
    nodes.get(k).ends.push({ i, e, dir: unit(q[0] - p[0], q[1] - p[1]) });
  }));
  // 2. pair the ends that carry on through: always at a plain join; at a junction only the straightest pair (if it
  // bends less than mergeTurn). At a crossroads the other two ends also run through when they are near straight
  // (crossTurn): that road fades out where it lies over the first, so the crossing shows no seam
  const link = new Map(), through = new Map();   // `${i}:${e}` -> end it joins; node key -> the two ways out along the road through
  const cos = Math.cos((N.mergeTurn ?? 100) * Math.PI / 180);
  for (const [k, n] of nodes) {
    const L = n.ends;
    if (L.length < 2) continue;
    let best = null;
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
      const straight = -(L[a].dir[0] * L[b].dir[0] + L[a].dir[1] * L[b].dir[1]);   // 1 = dead straight
      if (!best || straight > best.s) best = { a, b, s: straight };
    }
    if (L.length > 2 && best.s < cos) continue;
    const A = L[best.a], B = L[best.b];
    link.set(`${A.i}:${A.e}`, B); link.set(`${B.i}:${B.e}`, A);
    through.set(k, { ways: [A.dir, B.dir], piece: A.i });
    const [C, D] = L.filter(x => x !== A && x !== B);
    if (L.length === 4 && -(C.dir[0] * D.dir[0] + C.dir[1] * D.dir[1]) >= Math.cos((N.crossTurn ?? 45) * Math.PI / 180)) {
      link.set(`${C.i}:${C.e}`, D); link.set(`${D.i}:${D.e}`, C);
      through.get(k).crosser = C.i; through.get(k).ways.push(C.dir, D.dir);
    }
  }
  // 3. walk the joined pieces into whole roads
  const used = new Set(), chains = [];
  const walk = (i, e) => {   // start at end e of piece i
    const pts = [], ids = [];
    let cur = i, from = e;
    while (cur != null && !used.has(cur)) {
      used.add(cur); ids.push(raw[cur].id);
      const p = from ? [...raw[cur].points].reverse() : raw[cur].points;
      pts.push(...(pts.length ? p.slice(1) : p));
      const nx = link.get(`${cur}:${1 - from}`);
      cur = nx?.i; from = nx?.e;
    }
    chains.push({ id: ids.join('+'), points: pts });
  };
  raw.forEach((_, i) => [0, 1].forEach(e => { if (!used.has(i) && !link.has(`${i}:${e}`)) walk(i, e); }));
  raw.forEach((_, i) => { if (!used.has(i)) walk(i, 0); });   // closed loops
  // junction points (3+ ends), where the wander calms down
  const junctions = [...nodes.values()].filter(n => n.ends.length > 2).map(n => n.p);
  // 4. shape: smooth, then wander (fading in away from junctions and road ends)
  const amp = N.meander ?? 0, [w1, w2] = N.wave ?? [160, 70], calm = N.calm ?? 40;
  const shaped = chains.map(c => {
    let p = smoothLine(c.points, step, smooth);
    if (amp > 0 && p.length > 2) {
      const xs = c.points.map(q => q[0]), zs = c.points.map(q => q[1]), [ax, bx, az, bz] = [Math.min(...xs) - calm, Math.max(...xs) + calm, Math.min(...zs) - calm, Math.max(...zs) + calm];
      const near = junctions.filter(j => j[0] > ax && j[0] < bx && j[1] > az && j[1] < bz), s = [0];
      for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      const L = s[s.length - 1], h0 = hash(c.points[0][0], c.points[0][1], 1) * 6.283, h1 = hash(c.points[0][0], c.points[0][1], 2) * 6.283, h2 = hash(c.points[0][0], c.points[0][1], 3) * 6.283;
      p = p.map((q, i) => {
        if (i === 0 || i === p.length - 1) return q;
        let dj = Math.min(s[i], L - s[i]);
        for (const j of near) { const d = Math.hypot(q[0] - j[0], q[1] - j[1]); if (d < dj) dj = d; }
        for (const c of quiet) { const d = Math.max(0, Math.hypot(q[0] - c.at[0], q[1] - c.at[1]) - c.r); if (d < dj) dj = d; }   // straight over bridges and fords
        const m = amp * smoothstep(dj / calm) * (0.55 * Math.sin(6.283 * s[i] / w1 + h0) + 0.3 * Math.sin(6.283 * s[i] / (w1 * 0.37) + h1) + 0.15 * Math.sin(6.283 * s[i] / w2 + h2));   // three unrelated waves: lazy, uneven bends
        const a = p[i - 1], b = p[i + 1], [tx, tz] = unit(b[0] - a[0], b[1] - a[1]);
        return [q[0] - tz * m, q[1] + tx * m];
      });
    }
    return { id: c.id, points: p, ends: ['free', 'free'] };
  });
  const junc = new Map();   // junction key -> { at, arms (unit directions out), owner (road that draws its corners) }
  const pieceOf = new Map(); chains.forEach((c, ci) => c.id.split('+').forEach(id => pieceOf.set(id, ci)));
  // smoothing can pull a road through a junction off the node a little: the junction sits on the drawn road
  for (const [k, t] of through) {
    if (nodes.get(k).ends.length < 3) continue;
    const p = nodes.get(k).p; let bd = Infinity;
    for (const q of shaped[pieceOf.get(raw[t.piece].id)].points) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; t.at = q; } }
  }
  // the second road through a crossroads fades out where it lies over the first
  for (const [k, t] of through) if (t.crosser != null) {
    const c = shaped[chains.findIndex(ch => ch.id.split('+').includes(raw[t.crosser].id))];
    const dir = unit(t.ways[0][0] - t.ways[1][0], t.ways[0][1] - t.ways[1][1]);
    (c.crossings ??= []).push({ at: t.at, dir });
    junc.set(k, { at: t.at, arms: t.ways.slice(), owner: shaped.indexOf(c) });
  }
  // 5. branches curve into the road they meet
  const R = N.branchR ?? 18, snap = N.snap ?? 6, landed = new Map();
  const rawSegs = raw.flatMap((l, i) => l.points.slice(1).map((b, k) => ({ i, a: l.points[k], b })));
  shaped.forEach((c, ci) => [0, 1].forEach(e => {
    const pts = e ? [...c.points].reverse() : c.points, end = pts[0], k = nodeKey(end);
    let at = null, ways = through.get(k)?.ways;
    if (ways && nodes.get(k).ends.length > 2) at = through.get(k).at;
    else if (nodes.get(k)?.ends.length === 1) {   // a loose end lying on another road
      let best = null;
      for (const sg of rawSegs) {
        if (pieceOf.get(raw[sg.i].id) === ci) continue;
        const d = segDist(end[0], end[1], sg.a, sg.b);
        if (d < snap && (!best || d < best.d)) best = { d, sg };
      }
      if (best) {
        const { a, b } = best.sg, dx = b[0] - a[0], dz = b[1] - a[1], u = Math.max(0, Math.min(1, ((end[0] - a[0]) * dx + (end[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        at = [a[0] + dx * u, a[1] + dz * u]; const t = unit(dx, dz); ways = [t, [-t[0], -t[1]]];
      }
    }
    if (!at) return;
    // where the curve starts: R back along the branch
    let d = 0, j = 1;
    for (; j < pts.length - 1; j++) { d += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); if (d >= R) break; }
    if (j >= pts.length - 2) { c.ends[e] = 'branch'; return; }   // too short to curve: just blend in
    const A = pts[j], [ux, uz] = unit(at[0] - A[0], at[1] - A[1]);   // heading into the junction
    // it arrives bent a little toward the way out that best keeps its heading (met square on: a coin toss, and a
    // second branch at the same spot bends the other way), and ends on the road it meets; rounded corners (fillets)
    // are drawn where their edges meet
    const [d0, d1] = ways.map(w => ux * w[0] + uz * w[1]), lk = k, prev = landed.get(lk);
    const o = Math.abs(d0 - d1) > 0.6 ? (d0 > d1 ? ways[0] : ways[1]) : prev ? (prev === ways[0] ? ways[1] : ways[0]) : ways[hash(at[0], at[1], 7) < 0.5 ? 0 : 1];
    landed.set(lk, o);
    const [hx, hz] = unit(ux + o[0] * (N.bend ?? 0.5), uz + o[1] * (N.bend ?? 0.5)), C = [at[0] - hx * R * 0.4, at[1] - hz * R * 0.4];
    const curve = [];
    for (let s = 1; s <= 10; s++) { const v = s / 10, w = 1 - v; curve.push([w * w * A[0] + 2 * w * v * C[0] + v * v * at[0], w * w * A[1] + 2 * w * v * C[1] + v * v * at[1]]); }
    const rest = pts.slice(j);   // A onwards, away from the junction
    const out = [...curve.reverse(), ...rest];
    c.points = e ? out.reverse() : out;
    c.ends[e] = 'branch';
    (c.joins ??= [null, null])[e] = { at, dir: unit(ways[0][0] - ways[1][0], ways[0][1] - ways[1][1]) };   // the road it meets
    // this branch as an arm of the junction, pointing out along its last stretch
    if (!junc.has(lk)) junc.set(lk, { at, arms: ways.slice(), owner: ci });
    let q = c.points[e ? c.points.length - 1 : 0], dd = 0;
    for (const p of e ? [...c.points].reverse() : c.points) { dd = Math.hypot(p[0] - at[0], p[1] - at[1]); q = p; if (dd >= (N.armLen ?? 12)) break; }
    junc.get(lk).arms.push(unit(q[0] - at[0], q[1] - at[1]));
  }));
  // arms measured on the drawn roads: each way out, re-aimed at the nearest drawn point armLen along it
  const AL = N.armLen ?? 12;
  for (const J of junc.values()) J.arms = J.arms.map(w => {
    const t = [J.at[0] + w[0] * AL, J.at[1] + w[1] * AL];
    let best = null, bd = AL * 0.6;
    for (const c of shaped) { const b = c.box ?? (c.box = boxOf(c.points)); if (t[0] < b[0] - bd || t[0] > b[2] + bd || t[1] < b[1] - bd || t[1] > b[3] + bd) continue;
      for (const p of c.points) { const d = Math.hypot(p[0] - t[0], p[1] - t[1]); if (d < bd) { bd = d; best = p; } } }
    return best ? unit(best[0] - J.at[0], best[1] - J.at[1]) : w;
  });
  for (const c of shaped) delete c.box;
  // 6. rounded corners: between each pair of neighbouring arms at a junction, an arc tangent to both road edges
  // (radius up to filletR, smaller where the corner is tight so its band still covers the grass tip it cuts off)
  const half = width / 2, rMax = N.filletR ?? 10;
  for (const J of junc.values()) {
    const arms = J.arms.map(d => ({ d, a: Math.atan2(d[1], d[0]) })).sort((p, q) => p.a - q.a);
    for (let k = 0; k < arms.length; k++) {
      const A = arms[k], B = arms[(k + 1) % arms.length];
      let th = B.a - A.a; if (th <= 0) th += Math.PI * 2;
      if (th < 0.35 || th > Math.PI - 0.15) continue;   // no corner on the straight side of a road
      const sh = Math.sin(th / 2), tip = 1 / sh - 1, r = Math.min(rMax * (0.7 + 0.6 * hash(J.at[0], J.at[1], k)), 0.85 * half / tip);   // corners vary   // the grass tip it cuts off lies r * tip inside the arc, on the band's solid part
      if (r < 2) continue;   // too tight a corner to round
      const m = unit(A.d[0] + B.d[0], A.d[1] + B.d[1]), P = [J.at[0] + m[0] * half / sh, J.at[1] + m[1] * half / sh], cc = r / sh, tt = r / Math.tan(th / 2);
      const C = [P[0] + m[0] * cc, P[1] + m[1] * cc], Ta = [P[0] + A.d[0] * tt, P[1] + A.d[1] * tt], Tb = [P[0] + B.d[0] * tt, P[1] + B.d[1] * tt];
      (shaped[J.owner].fillets ??= []).push({ C, r, a0: Math.atan2(Ta[1] - C[1], Ta[0] - C[0]), a1: Math.atan2(Tb[1] - C[1], Tb[0] - C[0]) });
    }
  }
  return shaped;
}

// Segments of the shaped roads near a box, for prop clearance and ground paint: [[[x, z], [x, z]], ...]. The dense
// shaped lines are thinned (Douglas-Peucker, within `tol` units), so long gentle runs become a few long segments.
const segMemo = new WeakMap();
export function roadClearSegments(world, paths, cfg, x0, z0, x1, z1, margin, tol = 0.5) {
  let all = segMemo.get(world)?.get(cfg);
  if (!all) {
    all = [];
    for (const l of roadLines(world, paths, cfg)) {
      const p = l.points, keep = new Uint8Array(p.length), stack = [[0, p.length - 1]];
      keep[0] = keep[p.length - 1] = 1;
      while (stack.length) {
        const [a, b] = stack.pop();
        let far = -1, fd = tol;
        for (let i = a + 1; i < b; i++) { const d = segDist(p[i][0], p[i][1], p[a], p[b]); if (d > fd) { fd = d; far = i; } }
        if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
      }
      const q = p.filter((_, i) => keep[i]);
      for (let k = 1; k < q.length; k++) all.push([q[k - 1], q[k]]);
    }
    if (!segMemo.has(world)) segMemo.set(world, new WeakMap());
    segMemo.get(world).set(cfg, all);
  }
  return all.filter(([a, b]) => !(Math.max(a[0], b[0]) < x0 - margin || Math.min(a[0], b[0]) > x1 + margin || Math.max(a[1], b[1]) < z0 - margin || Math.min(a[1], b[1]) > z1 + margin));
}

// One road's strip: two vertices per point (left, right). Returns plain arrays:
// pos [x, z, ...] per vertex, uv [u, v] (u 0 left .. 1 right, v = distance / repeat), types [6 weights] and fade per
// point, plus its box. paint = createPaint(world, paintCfg) (src/world_paint.js); cfg = paintCfg.trail.strips.
// Shaped (network) roads are used as they are, a little wider or narrower along their length (network.widthVary).
// A branch end fades out over network.blend units; a loose end fades
// over network.endFade units (no square caps). Where a branch end, or the second road through a crossroads, lies over
// the road it meets, that side fades out (side, per vertex), so none of its ruts or grassy verge cross that road.
// tip marks those points: drawn over every road body.
export function buildStrip(line, paint, cfg) {
  const N = cfg.network, pts = N ? line.points : smoothLine(line.points, cfg.step, cfg.smooth), half = cfg.width / 2, n = pts.length;
  const pos = new Float32Array(n * 4), uv = new Float32Array(n * 4), types = new Float32Array(n * 6), fade = new Float32Array(n), side = new Float32Array(n * 2).fill(1), tip = new Uint8Array(n);
  const F = new Float32Array(paint.NB), idx = paint.biomes.map(b => cfg.types[b] ?? 0), [w0, w1] = cfg.waterFade;
  const S = [0];
  for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = S[n - 1], ends = line.ends || ['free', 'free'];
  // 0 at a road end .. 1 once `len` units in; branch ends also widen
  const endK = (i, e) => { const d = e ? L - S[i] : S[i], len = ends[e] === 'branch' ? N.blend ?? 10 : N.endFade ?? 5; return smoothstep(d / len); };
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let hw = half * (1 + (N?.widthVary ?? 0) * (0.6 * Math.sin(S[i] / 53 + n) + 0.4 * Math.sin(S[i] / 21 + L))), ef = 1;   // worn a little wider and narrower along its length
    const meets = [];
    if (N) for (const e of [0, 1]) {
      const k = endK(i, e); ef *= k;
      if (ends[e] !== 'branch') continue;
      const d = (e ? L - S[i] : S[i]) / (N.branchR ?? 18);   // 0 at the end, 1 where the curve starts
      if (d < 1.5) tip[i] = 1;
      if (line.joins?.[e] && d <= 1.5) meets.push(line.joins[e]);
    }
    // a side lying over the road it meets fades out, so the branch melts into that road and none of its ruts or
    // grassy verge cross it
    for (const c of line.crossings || []) if (Math.hypot(p[0] - c.at[0], p[1] - c.at[1]) < 2 * cfg.width) { meets.push(c); tip[i] = 1; }
    for (const j of meets) {
      const over = (x, z) => { const ax = x - j.at[0], az = z - j.at[1], along = ax * j.dir[0] + az * j.dir[1]; return 1 - smoothstep((Math.hypot(ax - j.dir[0] * along, az - j.dir[1] * along) - half * (N.overIn ?? 0.3)) / (half * (N.overSoft ?? 0.6))); };
      side[i * 2] *= 1 - over(p[0] - tz * hw, p[1] + tx * hw); side[i * 2 + 1] *= 1 - over(p[0] + tz * hw, p[1] - tx * hw);
    }
    pos.set([p[0] - tz * hw, p[1] + tx * hw, p[0] + tz * hw, p[1] - tx * hw], i * 4);
    uv.set([0, S[i] / cfg.repeat, 1, S[i] / cfg.repeat], i * 4);
    paint.fieldAt(p[0], p[1], F);
    let tot = 0;
    for (let k = 0; k < F.length; k++) { types[i * 6 + idx[k]] += F[k]; tot += F[k]; }
    for (let k = 0; k < 6; k++) types[i * 6 + k] = tot > 0 ? types[i * 6 + k] / tot : k === 0 ? 1 : 0;
    const wet = paint.waterAt(p[0], p[1]);
    fade[i] = (wet <= w0 ? 1 : wet >= w1 ? 0 : (w1 - wet) / (w1 - w0)) * ef;
    minX = Math.min(minX, p[0] - hw); maxX = Math.max(maxX, p[0] + hw); minZ = Math.min(minZ, p[1] - hw); maxZ = Math.max(maxZ, p[1] + hw);
  }
  return { id: line.id, n, pos, uv, types, fade, side, tip, length: L, box: { minX, minZ, maxX, maxZ } };
}

// The rounded corners of a road's junctions (line.fillets), as one mesh: along each arc a band of road from the grassy
// verge (the arc, a little ragged: network.filletRag) inward over the corner, with the outer wheel rut swinging round. The band fades in from its ends (where it meets the roads' own verges) and
// toward the road middle. Same arrays as buildStrip plus idx (triangles); empty when it has none.
export function buildFillets(line, paint, cfg, K = 14) {
  const N = cfg.network;
  const list = line.fillets || [], per = K * 4, n = list.length * per, half = cfg.width / 2;
  const pos = new Float32Array(n * 2), uv = new Float32Array(n * 2), types = new Float32Array(n * 6), fade = new Float32Array(n), idx = [];
  const F = new Float32Array(paint.NB), tix = paint.biomes.map(b => cfg.types[b] ?? 0), across = [[0, 0.04, 1], [0.5, 0.24, 1], [0.85, 0.37, 1], [1.4, 0.45, 0]];   // [depth (x half width), u, alpha]: verge, then the outer wheel rut swinging round the corner, fading out inside
  list.forEach((f, q) => {
    paint.fieldAt(f.C[0], f.C[1], F);
    const T = new Float32Array(6); let tot = 0;
    for (let k = 0; k < F.length; k++) { T[tix[k]] += F[k]; tot += F[k]; }
    for (let k = 0; k < 6; k++) T[k] = tot > 0 ? T[k] / tot : k === 0 ? 1 : 0;
    let sweep = f.a1 - f.a0; while (sweep > Math.PI) sweep -= Math.PI * 2; while (sweep < -Math.PI) sweep += Math.PI * 2;
    for (let k = 0; k < K; k++) {
      const t = k / (K - 1), a = f.a0 + sweep * t, nx = Math.cos(a), nz = Math.sin(a), ends = smoothstep(Math.min(t, 1 - t) / 0.2), wet = paint.waterAt(f.C[0] + nx * f.r, f.C[1] + nz * f.r);
      const rag = (N?.filletRag ?? 1) * Math.sin(Math.PI * t) * Math.sin(t * 7 + f.C[0] * 0.37), [w0, w1] = cfg.waterFade, dry = wet <= w0 ? 1 : wet >= w1 ? 0 : (w1 - wet) / (w1 - w0);
      across.forEach(([depth, u, alpha], s) => {
        const v = q * per + k * 4 + s, d = f.r + depth * half + (s < 2 ? rag : 0);
        pos.set([f.C[0] + nx * d, f.C[1] + nz * d], v * 2);
        uv.set([u, Math.abs(sweep) * f.r * t / cfg.repeat], v * 2);
        types.set(T, v * 6);
        fade[v] = alpha * ends * dry;
      });
      if (k) for (let s = 0; s < 3; s++) { const a0 = q * per + (k - 1) * 4 + s, b0 = q * per + k * 4 + s; idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0); }
    }
  });
  return { n, pos, uv, types, fade, idx };
}

// lines (from roadLines) whose box comes within `margin` of the point
export const linesNear = (lines, x, z, margin) => lines.filter(({ box: b }) => x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin);
