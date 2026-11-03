// Ordinary-prop clustering (groundcover clustering plan, assets/environment/island/groundcover_clustering_plan.json).
// Pure and deterministic, called from sim/chunk_gen.js paintProps. No DOM, no three.js, no Math.random.
//
// Each family (biome_props.json clustering.families) puts patch centres on its own global world-space grid.
// A centre is either a single sprite or a cluster: a footprint size preset (tiny..expansive), a layout
// (compact clump, uneven strip, two-lobed patch), a dominant kind with sparse companions, and per-member
// height tiers (short / baseline / tall, uniform scale factors on top of the kind's normal scale).
// The whole patch layout depends only on the centre's grid cell, so every chunk computes the same patch;
// a member is emitted only by the chunk that contains it, after its own checks (blocked ground, biome fade,
// trail and stamp clearings, sites / nodes / city), so wide patches never spill onto paths or water.
import { hash2 } from '../world_paint.js';

const sum = list => list.reduce((n, r) => n + r.weight, 0);
function pickWeighted(list, u) {
  let pick = u * sum(list);
  for (const r of list) if ((pick -= r.weight) < 0) return r;
  return list.at(-1);
}
const weights = obj => Object.entries(obj || {}).map(([id, weight]) => ({ id, weight }));

// The old scatter rules each family replaces, as `${biome}|${kind}` keys (kinds after replaceByBiome).
export function clusterReplaces(cl) {
  const out = new Set();
  if (!cl?.enabled) return out;
  for (const f of cl.families || []) for (const k of familyKinds(f)) out.add(`${f.biome}|${k}`);
  return out;
}
const familyKinds = f => [...(f.primary || []), ...(f.companions || [])].map(r => r.kind);

// Mean member count of a family's cluster sizes, weighted.
function meanMembers(cl, f) {
  const sz = weights(f.sizes), tot = sum(sz);
  return sz.reduce((n, s) => { const m = cl.sizes[s.id].members; return n + s.weight * (m[0] + m[1]) / 2; }, 0) / tot;
}

// Centre chance per grid cell and the share of centres that are singles, from the family's target of final
// sprites per 1000 square units (before biome / clearing rejection) and its single-sprite share.
export function familyRates(cl, f) {
  const mc = meanMembers(cl, f), single = f.singles ?? 0.3;
  const centres = f.per1000 * (single + (1 - single) / mc);
  return { chance: centres * f.grid * f.grid / 1000, singleChance: single / (single + (1 - single) / mc), mc };
}

// One patch's members (positions, kinds, tiers) from its grid cell alone. Returns [] when no centre.
function patchAt(cl, f, rates, gi, gj, seed, kindInfo) {
  const h = k => hash2(gi, gj, seed + k), hm = (j, k) => hash2(gi, gj * 131 + j, seed + k);
  if (h(0) >= rates.chance) return [];
  const g = f.grid, cx = (gi + h(1)) * g, cz = (gj + h(2)) * g;
  const dominant = pickWeighted(f.primary, h(3)).kind;
  let n = 1, D = 0, layout = 'compact';
  if (h(4) >= rates.singleChance) {
    const size = cl.sizes[pickWeighted(weights(f.sizes), h(5)).id];
    n = size.members[0] + Math.floor(h(6) * (size.members[1] - size.members[0] + 1));
    D = size.diameter[0] + (size.diameter[1] - size.diameter[0]) * h(7);
    layout = pickWeighted(weights(f.layouts || { compact: 1 }), h(8)).id;
  }
  const ang = h(9) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang), aspect = 0.7 + 0.3 * h(10);
  const R = D / 2, spacing = f.spacing ?? 1, tiers = weights(f.tiers || { baseline: 1 });
  const out = [];
  for (let m = 0; m < n && m < 30; m++) {
    let x = cx, z = cz, ok = n === 1;
    for (let t = 0; t < 4 && !ok; t++) {
      const j = m * 4 + t, u = hm(j, 11), v = hm(j, 12);
      let a, b;   // offset along / across the patch axis
      if (layout === 'strip') { a = (u - 0.5) * D; b = (v - 0.5) * D * 0.3; }
      else if (layout === 'lobed') {
        const side = hm(j, 13) < 0.5 ? -1 : 1, r = R * 0.5 * Math.sqrt(u), q = v * Math.PI * 2;
        a = side * R * 0.5 + r * Math.cos(q); b = r * Math.sin(q);
      } else { const r = R * Math.sqrt(u), q = v * Math.PI * 2; a = r * Math.cos(q); b = r * Math.sin(q) * aspect; }
      x = cx + a * ca - b * sa; z = cz + a * sa + b * ca;
      ok = out.every(p => Math.hypot(p.x - x, p.z - z) >= spacing);
    }
    if (!ok) continue;
    const c = hm(m, 14);
    let kind = dominant;
    if (f.companions?.length && c < (f.companionShare ?? 0)) kind = pickWeighted(f.companions, hm(m, 15)).kind;
    else if (f.primary.length > 1 && c < (f.companionShare ?? 0) + (f.mixShare ?? 0)) kind = pickWeighted(f.primary, hm(m, 15)).kind;
    out.push({ x, z, kind, tier: pickWeighted(tiers, hm(m, 16)).id, u: hm(m, 17) });
  }
  // at least two height tiers in a cluster of three or more
  if (out.length >= 3 && out.every(p => p.tier === out[0].tier)) out.at(-1).tier = out[0].tier === 'baseline' ? (h(18) < 0.5 ? 'short' : 'tall') : 'baseline';
  for (const p of out) {
    const info = kindInfo.get(`${f.biome}|${p.kind}`) || {}, sc = f.scale || info.scale || [0.9, 1.1];
    p.s = (sc[0] + (sc[1] - sc[0]) * p.u) * (cl.heightTiers[p.tier] ?? 1);
    p.block = f.block ?? info.block ?? 0;
  }
  return out;
}

// Appends this chunk's clustered props and blockers.
// ctx: { cl, P, F, x0, z0, size, segs, stamps, clearAt, near, kindInfo, ps, props, blockers }
// ctx also carries terrainAt(x, z), passable(x, z), coastDist(x, z) and coastDistance for the
// bamboo (terrain code) and coast families, which follow terrain or the shoreline instead of a biome.
export function clusterProps(ctx) {
  const { cl, P, F, x0, z0, size, segs, stamps, clearAt, near, kindInfo, ps, props, blockers } = ctx;
  if (!cl?.enabled) return;
  const maxD = Math.max(...Object.values(cl.sizes).map(s => s.diameter[1])), fo = P.B.forest;
  cl.families.forEach((f, fi) => {
    const mode = f.coast ? 'coast' : f.terrain ? 'terrain' : 'biome', b = P.B[f.biome];
    if (!(f.per1000 > 0)) return;
    if (mode === 'biome' && (b === undefined || !near.has(b))) return;
    if (mode === 'coast' && !ctx.coastNear) return;
    const centreOk = mode === 'coast' ? (x, z) => ctx.coastDist(x, z) <= ctx.coastDistance
      : mode === 'terrain' ? (x, z) => ctx.terrainAt(x, z) === f.terrain : (x, z) => P.gridAt(x, z) === b;
    const rates = familyRates(cl, f), seed = ps + (cl.seed ?? 200) + fi * 32;
    if (rates.chance > 1) throw new Error(`Cluster family ${f.id}: centre chance ${rates.chance.toFixed(3)} > 1; lower its grid.`);
    const halo = maxD / 2 + (f.spacing ?? 1) + 1, g = f.grid;
    for (let gj = Math.floor((z0 - halo) / g); gj <= Math.floor((z0 + size + halo) / g); gj++)
      for (let gi = Math.floor((x0 - halo) / g); gi <= Math.floor((x0 + size + halo) / g); gi++) {
        // cheap centre tests first: the centre's own biome cell and its grove preference
        if (hash2(gi, gj, seed) >= rates.chance) continue;
        const cx = (gi + hash2(gi, gj, seed + 1)) * g, cz = (gj + hash2(gi, gj, seed + 2)) * g;
        if (!centreOk(cx, cz)) continue;
        const gm = f.grove === 'in' ? P.grove(cx, cz) : f.grove === 'out' ? 1 - P.grove(cx, cz) : 1;
        if (hash2(gi, gj, seed + 19) >= gm) continue;
        const members = patchAt(cl, f, rates, gi, gj, seed, kindInfo);
        members.forEach((p, m) => {
          // Validate the coordinates that are actually emitted. Rounding after
          // land/ownership checks can move a member across a shoreline or seam.
          const x = +p.x.toFixed(2), z = +p.z.toFixed(2);
          if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) return;   // another chunk owns it
          if (P.blockedAt(x, z)) return;
          const keep = hash2(gi, gj * 131 + m, seed + 20);
          const open = P.trailClear(P.trailDist(segs, x, z)) * (1 - P.stampClear(stamps, x, z));
          if (keep >= open) return;
          if (mode === 'coast') {
            if (!ctx.passable(x, z) || ctx.coastDist(x, z) > ctx.coastDistance || !clearAt(x, z, false)) return;
          } else if (mode === 'terrain') {
            if (ctx.terrainAt(x, z) !== f.terrain || !clearAt(x, z, true)) return;
          } else {
            P.fieldAt(x, z, F);
            const wet = f.zone ? Math.min(1, P.waterFrac(x, z, 35) * 3) : 0;
            const zone = f.zone === 'surface' ? wet : f.zone === 'water' ? 0.35 + 0.65 * wet
              : f.zone === 'wooded' ? 0.3 + 0.7 * Math.min(1, F[fo] * 3) : 1;
            if (keep >= open * F[b] * zone) return;   // soft, irregular fade where the biome blends out
            if (!clearAt(x, z, true)) return;
          }
          props.push({ kind: p.kind, x, z, s: +p.s.toFixed(2) });
          if (p.block > 0) { const q = p.block * p.s; blockers.push({ minX: x - q, maxX: x + q, minZ: z - q, maxZ: z + q, kind: p.kind }); }
        });
      }
  });
}
