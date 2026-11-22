// Military quarter (Tim 2026-11-21, war_build/town_plan/town_plan_spec.md section 3). In a town whose governor
// has the initiative (every bot town, and a player's town on auto) the general reserves one compact block of
// Military zone, so military buildings do not spread over the town, and lays the road to it himself.
// - First pick: it runs at the top of the governor review, before the governor zones anything, at founding and
//   again at each new tier (the block grows outward, away from the hall).
// - Spot: facing the nearest town of another clan; with none known, the own railway station; else the own
//   capital (the side the capital line comes from). Never on resource ground, railway, the hall's road ring,
//   near a cliff, beside a work camp, or on the governor's street lanes; never on a cell anybody touched.
// - A Military zone the player painted wins (no plot is made); cells the player erased are never repainted;
//   nothing is ever erased. With no room: report.military = 'No room for a military quarter: <cause>...', and it tries again every retryReviews reviews.
// - Road: from the hall (or a hall-linked road) to the block, only cells joined to the network, by = 'g'.
// Size per tier and the weights: data war.general.plot. s.milPlot = { tier, cells, road, player?, erased? }.
import { centreCell, cellOffset, cellToWorld, inCore, hallRoadCell, nearCliff } from './town_grid.js';
import { coversResources } from './resource_clearance.js';
import { route } from './streets.js';
import { fundOf, fundHas, fundPay, fundRefund } from './fund.js';

const hash = str => { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

export function createMilitaryPlot({ state, data, world, zones, placement = () => null, resourceIndex = null, lane = () => null }) {
  const P = () => data.war?.general?.plot || {}, MZ = () => data.zones?.military?.char;

  // the way the block faces, as an angle from the hall (x = column, z = row)
  function facing(s) {
    const all = Object.values(state.frontier?.settlements || {}).filter(t => t.id !== s.id && Number.isFinite(t.x) && Number.isFinite(t.z));
    const d = t => Math.hypot(t.x - s.x, t.z - s.z);
    const rival = all.filter(t => t.owner && t.owner !== s.owner).sort((a, b) => d(a) - d(b) || (a.id < b.id ? -1 : 1))[0];
    if (rival) return Math.atan2(rival.z - s.z, rival.x - s.x);
    const st = (s.buildings || []).find(b => b.type === 'station' && Number.isInteger(b.cell));
    if (st) { const [x, z] = cellOffset(s, st.cell); if (Math.hypot(x, z) > 1) return Math.atan2(z, x); }
    const home = all.filter(t => t.capital && t.owner === s.owner)[0];
    if (home) return Math.atan2(home.z - s.z, home.x - s.x);
    return hash(s.id) * Math.PI * 2;
  }

  function okCell(s, i, skip, campNear) {
    const g = s.grid;
    return inCore(s, i, data) && g.ground[i] !== 'x' && g.use[i] === '.' && g.zone[i] === '.' && g.by[i] === '.'
      && !hallRoadCell(s, i) && !s.railCells?.[i] && !nearCliff(s, i, data) && !campNear.has(i) && !skip?.has(i)
      && !coversResources(s, [i], resourceIndex, data.founding?.unitClearance);
  }
  // cells within campGap of a work camp (its side stays open for carts and workers)
  function campCells(s) {
    const g = s.grid, n = g.n, gap = P().campGap ?? 2, out = new Set();
    for (const b of s.buildings || []) {
      if (!(data.tiers?.camps || []).includes(b.type)) continue;
      for (const i of (b.cells?.length ? b.cells : [b.cell]).filter(Number.isInteger)) {
        const c = i % n, r = (i - c) / n;
        for (let rr = r - gap; rr <= r + gap; rr++) for (let cc = c - gap; cc <= c + gap; cc++) if (rr >= 0 && cc >= 0 && rr < n && cc < n) out.add(rr * n + cc);
      }
    }
    return out;
  }
  // why no block fits (Tim 2026-11-22: the panel says the cause): the main thing on the ground round the hall
  let lastWhy = '';
  function whyNoRoom(s, W, H, ok, skip, camps) {
    const g = s.grid, n = g.n, hall = centreCell(n), hc = hall % n, hr = (hall - hc) / n, minD = P().minDistance ?? 3;
    const t = { used: 0, res: 0, camp: 0, cliff: 0, rail: 0, lane: 0 };
    let free = 0;
    for (let i = 0; i < n * n; i++) {
      if (!inCore(s, i, data)) continue;
      const c = i % n, r = (i - c) / n; if (Math.hypot(c - hc, r - hr) < minD) continue;
      if (ok[i]) free++;
      else if (g.use[i] !== '.' || g.zone[i] !== '.' || g.by[i] !== '.' || hallRoadCell(s, i)) t.used++;
      else if (s.railCells?.[i]) t.rail++;
      else if (g.ground[i] === 'x' || nearCliff(s, i, data)) t.cliff++;
      else if (camps.has(i)) t.camp++;
      else if (skip?.has(i)) t.lane++;
      else t.res++;
    }
    if (free >= W * H * 2) return `the free ground is in small pieces, no ${W} by ${H} block fits`;
    const top = Object.entries(t).sort((a, b) => b[1] - a[1])[0][0];
    return { used: 'zones, roads and buildings fill the ground', res: 'trees, stone and other resources cover the free ground', camp: 'the ground round your work camps is kept clear', cliff: 'cliffs and water take the free ground', rail: 'the railway takes the free ground', lane: "the governor's street lanes take the free ground" }[top];
  }
  const noRoom = () => `No room for a military quarter: ${lastWhy || 'no free block'}. Paint a Military zone to pick a spot`;
  const rectCells = (n, c0, r0, w, h) => { const out = []; for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) out.push(r * n + c); return out; };

  // the best block of w x h (either way round) for this town; keep = cells it must contain (a block being extended)
  function pick(s, w, h, keep = []) {
    const g = s.grid, n = g.n, hall = centreCell(n), hc = hall % n, hr = (hall - hc) / n;
    const skip = lane(s), camps = campCells(s), ang = facing(s), keepSet = new Set(keep);
    const ok = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) ok[i] = keepSet.has(i) || okCell(s, i, skip, camps) ? 1 : 0;
    const minD = P().minDistance ?? 3, turn = P().turnCost ?? 6, cands = [];
    let kc0 = n, kc1 = -1, kr0 = n, kr1 = -1;
    for (const i of keep) { const c = i % n, r = (i - c) / n; kc0 = Math.min(kc0, c); kc1 = Math.max(kc1, c); kr0 = Math.min(kr0, r); kr1 = Math.max(kr1, r); }
    for (const [W, H] of w === h ? [[w, h]] : [[w, h], [h, w]]) {
      for (let r0 = 0; r0 + H <= n; r0++) for (let c0 = 0; c0 + W <= n; c0++) {
        if (keep.length && (c0 > kc0 || r0 > kr0 || c0 + W - 1 < kc1 || r0 + H - 1 < kr1)) continue;
        const cx = c0 + (W - 1) / 2 - hc, cz = r0 + (H - 1) / 2 - hr, dist = Math.hypot(cx, cz);
        // nearest edge of the block from the hall (not the centre): the block sits minD cells out at least
        const ex = Math.max(c0 - hc, 0, hc - (c0 + W - 1)), ez = Math.max(r0 - hr, 0, hr - (r0 + H - 1));
        if (Math.hypot(ex, ez) < minD) continue;
        const cells = rectCells(n, c0, r0, W, H);
        if (!cells.every(i => ok[i])) continue;
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(cz, cx) - ang), Math.cos(Math.atan2(cz, cx) - ang)));
        // a new block: near the hall, facing the rival; an extension: outward, away from the hall
        cands.push({ cells, score: keep.length ? -dist + off * turn * 0.25 : dist + off * turn });
      }
    }
    if (!cands.length) { lastWhy = whyNoRoom(s, w, h, ok, skip, camps); return null; }
    cands.sort((a, b) => a.score - b.score || a.cells[0] - b.cells[0]);
    const linked = zones.linkedRoads(s);
    for (const c of cands.slice(0, P().tries ?? 40)) {
      const road = roadTo(s, c.cells, linked);
      if (road) return { cells: c.cells, road };
    }
    lastWhy = 'no road can reach a free block';
    return null;
  }
  // road cells still to lay from the network to the block ([] when a linked road already touches it), or null
  function roadTo(s, cells, linked = zones.linkedRoads(s)) {
    const g = s.grid, n = g.n, block = new Set(cells), side = new Set();
    for (const i of cells) { const c = i % n; for (const j of [c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1, i - n, i + n]) if (j >= 0 && j < n * n && !block.has(j)) side.add(j); }
    if ([...side].some(j => linked[j] || j === centreCell(n))) return [];
    const path = route(s, data, linked, j => side.has(j), () => 0, block);
    return path ? path.filter(j => g.use[j] !== 'r' && g.use[j] !== 'g') : null;
  }

  function size(s) {
    const list = P().byTier || [[4, 3], [6, 4], [8, 6]];
    return list[Math.min(list.length, Math.max(1, s.tier || 1)) - 1];
  }

  // lay what it can of the planned road (paid like the player's roads)
  function layRoad(s) {
    const pl = placement(), mp = s.milPlot;
    if (!pl || !mp?.road?.length) return;
    const todo = mp.road.filter(i => s.grid.use[i] !== 'r' && s.grid.use[i] !== 'g');
    if (!todo.length) { mp.road = []; return; }
    // paid from the safety fund (fund.js); it waits while the fund is short
    const fund = fundOf(s, data, state), cost = { timber: todo.length * (data.placeCosts?.road?.timber ?? 1) };
    if (fund && !fundHas(fund, cost)) return;
    if (fund) fundPay(s, cost, world);
    if (pl.check(s, { kind: 'road', cells: todo }).ok && pl.place(s, { kind: 'road', cells: todo, by: 'g' }).ok) { mp.road = []; return; }
    if (fund) fundRefund(s, cost, world);   // not laid: back into the fund
    // the planned way got blocked (or it costs more than the town has): plan it again from the network as it is now
    const again = roadTo(s, mp.cells.filter(i => s.grid.zone[i] === MZ()));
    mp.road = again || mp.road;
  }

  function run(s) {
    if (!zones?.on(s) || !s.grid || s.capital || s.camp || !MZ()) return;
    const g = s.grid, n = g.n, ch = MZ();
    const mine = [], theirs = [];
    for (let i = 0; i < n * n; i++) if (g.zone[i] === ch) (g.by[i] === 'p' ? theirs : mine).push(i);
    if (theirs.length && !s.milPlot?.cells?.length) { s.milPlot = { player: true }; delete s.report.military; return; }   // he painted his own: it wins
    const mp = s.milPlot;
    if (mp?.player || mp?.erased) { if (mp.player) delete s.report.military; return; }
    if (mp?.cells?.length && !mine.length) { mp.erased = true; return; }   // he erased the whole block: never painted again
    const tier = s.tier || 1;
    // a town with no room tries again every few reviews (the player may clear ground)
    // (a message without its cause, from an older save, is looked at again at once)
    if (mp && mp.tier >= tier && (mp.cells?.length || (String(s.report?.military || '').includes(':') && (mp.retry = (mp.retry || 0) + 1) % (P().retryReviews ?? 12)))) { layRoad(s); return; }
    const [w, h] = size(s), keep = mp?.cells?.length ? mine : [];
    const got = pick(s, w, h, keep);
    if (!got) {
      s.milPlot = { ...(mp || { cells: [], road: [] }), tier };
      if (!mp?.cells?.length) s.report.military = noRoom();
      return;
    }
    const fresh = got.cells.filter(i => !keep.includes(i));
    const r = fresh.length ? zones.zone(s, { kind: 'military', cells: fresh, by: 'g' }) : { ok: true };
    if (!r.ok) { lastWhy = String(r.reason || 'the zone could not be painted').replace(/\.$/, '').replace(/^./, c => c.toLowerCase()); s.milPlot = { ...(mp || { cells: [], road: [] }), tier }; if (!mp?.cells?.length) s.report.military = noRoom(); return; }
    delete s.report.military;
    s.milPlot = { tier, cells: got.cells, road: got.road };
    layRoad(s);
  }

  // cells to keep free for the plot's road that is not laid yet (governor zoning skips them)
  const pendingRoad = s => (s.milPlot?.road || []).filter(i => s.grid?.use[i] === '.');

  return { run, facing, pendingRoad };
}
