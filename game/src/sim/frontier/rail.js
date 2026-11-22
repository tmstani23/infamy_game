// Railway links (train plan step 2, project files steam_trains/plan.md). Lines run between your stations:
// a town's built omnibus station (stable.js 'station', standing in for a railway station until it has its
// own art) and the capital (just outside the island gate). The game picks the route (rail_route.js); a link
// is the whole track between two stations and always takes data.railways.link.seconds to lay, whatever its
// length. It is paid a stretch at a time from the ordering town's stock and waits while that stock is short.
// Enemies nearby never stop it (Tim 2026-11-07). The rail gang (a few laborers) works at the railhead; they
// are real units only near someone on the island, like town workers, and pure decoration for now.
// State: state.frontier.rail = { seq, links: { id: { id, owner, from, to, payer, points, dist, length, bridges,
//   built, paid, started, done, waiting, gang: [entity ids] } },
//   trains: { id: { id, link, owner, d, dir, wait, cars } } }   (from/to = town id or 'capital'; d = distance along the
//   link from its `from` end, dir +1 toward `to`, -1 back; wait = ticks left standing at a station)
// Command { type: 'frontier', action: 'rail', mode: 'link', town, to } | { ..., mode: 'cancel', link }
//   | { ..., mode: 'board', train } (step 4: at a station where that train stands) | { ..., mode: 'skip' } (aboard,
//   after ride.skipSeconds: straight to the far station). Riders carry e.aboard = 'rail:<train id>' (hidden, out
//   of fights, like the omnibus) and e.railRide = { train, since }; they get off at the train's next station.
// 8e-4 (2026-11-16) camp spur: a war camp with a built camp station (war.buildings.camp_station) gets a line of its
//  own, ordered by itself, from the station (node 'camp:<war id>') to the station of the nearest own town that has
//  one. It lays like any line (rail gang, link.seconds, costPer100 a stretch) but is paid from the camp stores. When
//  it opens, war.camp.station.linked is set; the train then serves the camp like a town (shipments.js).
// 8e-6 the supply line in war: when the spur opens, the stretch inside the war circle gets war.supply.sections marked
//  rail sections (camp buildings of type 'rail_section', on the camp's morale bar, hit like any camp building). With
//  the camp station or any one section down the line closes: the camp is cut off. It opens again once the station and
//  every section stand again (war.js campRebuild: a ruined station or section is rebuilt in place). When the
//  war is over the spur goes: after a capture it becomes a normal line from the captured town; after a sack, burn
//  or a call-off half its rail cost goes back to the town it ran to; a fallen camp gives nothing back.
// createRail({ state, data, world, worldData }) -> { command, tick, econTick, attach, endpoint, preview, linksOf }
import { crewCommandGroup } from '../deployment_rally.js';
import { createRailGrid, routeRail, pointAt, measure, roundCorners, openRun, nearestOpen, laidStretches } from './rail_route.js';
import { townExit, railCellsFor, clearRun } from './rail_town.js';
import { stationParts } from './station_layout.js';
import { tierOf } from './tiers.js';
import { modeRules } from '../modes/index.js';
import { dirIndex } from '../geometry.js';
import { castleBox } from './castle.js';
import { createRailBlast } from './rail_blast.js';
import { createRailRobbery } from './rail_robbery.js';

export function createRail({ state, data, world, worldData, stable, dayTicks = 12000 }) {
  const R = data.railways, L = () => R?.link || {}, GANG = () => R?.gang || {};
  let grid = null, runtime = null, arriveHook = null, departHook = null, tearHook = null, trainHook = null, cutHook = null;
  const G = () => grid ||= worldData && R?.route ? createRailGrid(worldData, R.route) : null;
  const rec = () => { const r = state.frontier.rail ||= { seq: 0, links: {} }; r.trains ||= {}; return r; };
  const T = () => R?.train || {};
  const linksOf = owner => Object.values(rec().links).filter(l => l.owner === owner);
  const town = id => id === 'capital' ? null : state.frontier.settlements?.[id];
  // Z4f (Tim 2026-11-19): a clan with a castle has its rail hub there. The node is still called 'capital' (shipments,
  // orders and saves keep working), but its track ends at the castle's station like a town's, and you board and get
  // off there on the island. A clan with no castle (rivals until Z5) keeps the city end.
  const hub = owner => owner == null ? null : Object.values(state.frontier.settlements || {}).find(s => s.castle && s.owner === owner && stable?.of(s, 'station')) || null;
  const node = (owner, id) => id === 'capital' ? hub(owner) : town(id);
  const hubReach = t => t.castle ? (Math.hypot(...(data.castleBlueprint?.size || [36, 43])) / 2 + 4) * t.grid.cell : undefined;
  const secs = () => Math.max(1, data.cadenceTicks || 20) / 20;
  const isCamp = id => typeof id === 'string' && id.startsWith('camp:');
  const warOfNode = id => state.frontier.wars?.list?.[String(id).slice(5)] || null;
  const campStation = w => w?.camp?.buildings?.find(b => b.type === 'camp_station' && b.stage === 'built' && !(b.hp <= 0)) || null;

  // where a station's track ends: the capital end just outside the island gate, a town's at its station
  function endpoint(owner, id) {
    if (id === 'capital' && hub(owner)) return stationEnd(hub(owner));
    if (id === 'capital') { const g = runtime?.gate?.rail || runtime?.gate?.island; return g ? { x: g[0], z: g[1] } : null; }   // east of the city station (Tim 2026-11-10), else the gate
    if (isCamp(id)) { const w = warOfNode(id), b = campStation(w); return b && (owner == null || w.attacker === owner) ? { x: b.x, z: b.z } : null; }   // 8e-4
    const s = town(id);
    return s && s.owner === owner ? stationEnd(s) : null;
  }
  // the straight run out of a castle (castle_default.json rail_gate and rail_bridge): the point out in front of the bridge,
  // on the line through the middle of the gate, where the track may start to turn
  function castleStraight(c) {
    const bp = data.castleBlueprint, g = bp?.gates?.find(q => q.id === 'rail_gate'), br = bp?.bridges?.find(q => q.id === 'rail_bridge');
    if (!g || !br || !c?.castle) return null;
    const along = g.rect[2] - g.rect[0] < g.rect[3] - g.rect[1] ? 'x' : 'z';   // a gate one cell thick in x: the track runs along x
    const out = bp.railOut ?? 4, sgn = along === 'x' ? Math.sign(br.rect[0] - g.rect[0]) || 1 : Math.sign(br.rect[1] - g.rect[1]) || 1;
    const mid = along === 'x' ? (g.rect[1] + g.rect[3] - 1) / 2 : (g.rect[0] + g.rect[2] - 1) / 2;
    const far = along === 'x' ? (sgn > 0 ? br.rect[2] - 1 : br.rect[0]) + sgn * out : (sgn > 0 ? br.rect[3] - 1 : br.rect[1]) + sgn * out;
    const [bx, bz] = along === 'x' ? [far, mid] : [mid, far];
    let dx = bx - bp.hall[0], dz = bz - bp.hall[1];
    for (let k = 0; k < c.castle.rot; k++) [dx, dz] = [-dz, dx];
    return { out: [c.x + dx * c.grid.cell, c.z + dz * c.grid.cell] };
  }
  function stationEnd(s) {
    const b = stable?.of(s, 'station');
    if (!b) return null;
    const parts = stationParts(s, b);   // the 3x2 station (Tim 2026-11-07): the line ends in its shed
    if (parts) return { x: s.x + parts.shed[0], z: s.z + parts.shed[1] };
    const [x, z] = stable.centre(s, b);
    return { x, z };
  }
  const receipt = (e, ok, reason = '') => {
    const fr = state.frontier;
    fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    fr.receipts.push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: 'rail', ok, reason });
    if (state.clans?.[e.owner] && reason) state.clans[e.owner].notice = { tick: state.tick, text: reason };
    return true;
  };
  const linked = (owner, a, b) => linksOf(owner).some(l => (l.from === a && l.to === b) || (l.from === b && l.to === a));

  // the town cells under a line are kept clear: no buildings or zones on the track (roads may cross)
  function reserve(l) {
    const near = Object.values(state.frontier.settlements || {}).filter(t => t.grid && !t.capital
      && l.points.some(([x, z]) => Math.hypot(x - t.x, z - t.z) < (t.grid.n / 2 + 1) * t.grid.cell));
    for (const t of near) for (const i of railCellsFor(t, l.points, 2)) (t.railCells ||= {})[i] = l.id;
  }
  function unreserve(l) {
    for (const t of Object.values(state.frontier.settlements || {})) if (t.railCells)
      for (const [i, id] of Object.entries(t.railCells)) if (id === l.id) delete t.railCells[i];
  }
  // why a link can't be ordered (or null), plus the route when it can
  function preview(owner, from, to, relay = null) {   // relay: a link being re-routed (capitalEnds), not counted as laid
    const camp = isCamp(from), s = camp ? null : town(from);
    if (!camp && (!s || s.owner !== owner)) return { error: 'not your town' };
    if (to !== 'capital' && town(to)?.owner !== owner) return { error: 'Lines only run to your own towns' };
    if (from === to) return { error: 'pick another town' };
    if (!camp && (tierOf(s, data) && (s.tier || 1) < (L().minTier ?? 2))) return { error: `${s.name} needs a bigger town hall first` };
    const a = endpoint(owner, from), b = endpoint(owner, to);
    if (!a) return { error: camp ? 'Build the camp station first' : `Build a railway station in ${s.name} first` };
    if (!b) return { error: to === 'capital' ? 'The capital end is not ready' : `Build a railway station in ${town(to).name} first` };
    if (!relay && linked(owner, from, to)) return { error: 'Those stations are already linked' };
    const g = G();
    if (!g) return { error: 'no railway data' };
    // the capital: routed to a point out in front of the wall, then straight in through it to the end (Tim 2026-11-10)
    const H = to === 'capital' ? hub(owner) : null, dest = H || town(to);   // the far end's town grid, if it has one
    const ap = to === 'capital' && !H && runtime?.gate?.rail && runtime.gate.railApproach, target = ap ? { x: ap[0], z: ap[1] } : b;
    // a camp station off the route grid: from the nearest open cell, then a short straight run to the station
    const open0 = camp ? nearestOpen(g, a.x, a.z) : null;
    let coarse = routeRail(g, open0 || a, target, { reuse: linksOf(owner).filter(l => l !== relay) });
    if (coarse && open0) coarse = { ...coarse, points: [[a.x, a.z], ...coarse.points] };
    if (!coarse) return { error: 'No way to lay track there' };
    // inside the end towns the track takes a fine path round buildings and houses (Tim 2026-11-07)
    // a 3x2 station (Tim 2026-11-07): out of the shed straight through the railway slot, then round the town
    const exitOf = (t, route) => { const st = stable.of(t, 'station'), parts = st && stationParts(t, st);
      if (!parts) return townExit(t, data, st ? (st.cells || [st.cell]) : [], route, { reach: hubReach(t) });
      const far = [t.x + parts.slotFar[0], t.z + parts.slotFar[1]], r = townExit(t, data, parts.slotCells, [far, ...route.slice(1)], { dir: parts.dir, reach: hubReach(t) });
      return r && [route[0], ...r]; };
    const boxed = t => stationParts(t, stable.of(t, 'station')) ? `No room for a train to curve out of ${t.name}'s station: turn it (R) or clear a way`
      : `Buildings box in ${t.name}'s station: clear a way out`;
    let pts = camp ? coarse.points : exitOf(s, coarse.points);   // a camp station stands in the open
    if (!pts) return { error: boxed(s) };
    if (dest) {
      const back = exitOf(dest, [...pts].reverse());
      if (!back) return { error: boxed(dest) };
      pts = back.reverse();
    } else if (ap) pts.push([b.x, b.z]);
    // a castle end (Tim 2026-11-19): dead straight from the station through the middle of the rail gate and over the rail
    // bridge, out to open ground beyond the moat, and only there does the track turn toward the route
    if (H?.castle) { const st = castleStraight(H); if (st) {
      const box = castleBox(data.castleBlueprint, H.x, H.z, H.castle.rot, H.grid.cell), inBox = ([x, z]) => x > box.minX - H.grid.cell && x < box.maxX + H.grid.cell && z > box.minZ - H.grid.cell && z < box.maxZ + H.grid.cell;
      let j = pts.length - 2; while (j > 0 && inBox(pts[j])) j--;
      pts = [...pts.slice(0, j + 1), st.out, [b.x, b.z]];
    } }
    // round every corner to a curve a train could take (Tim 2026-11-08), keeping clear of rock, water and buildings
    const ends = [s, dest].filter(t => t?.grid).map(t => { const st = stable.of(t, 'station'); return [t, new Set(st ? (st.cells || [st.cell]) : [])]; });
    // strict first (a cell clear of rock and water), then just off rock and buildings where the strict curve won't fit
    const ok = [(p, q) => openRun(g, p, q) && ends.every(([t, mine]) => clearRun(t, p, q, mine, true)),
      (p, q) => openRun(g, p, q, 0) && ends.every(([t, mine]) => clearRun(t, p, q, mine))];
    pts = roundCorners(pts.filter((p, k) => !k || k === pts.length - 1 || Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) > 4), g.cfg.minRadius ?? 0, ok, 3, 0.5);   // half the slot stays straight
    const line = measure(g, pts.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]));
    line.cost = coarse.cost;
    const cost = {};
    for (const [r, n] of Object.entries((camp ? L().campCostPer100 : null) || L().costPer100 || {})) cost[r] = Math.ceil(n * line.length / 100);
    return { line, seconds: L().seconds ?? 600, cost };
  }

  function command(e, c) {
    if (c.action !== 'rail') return false;
    if (c.mode === 'cancel') {
      const l = rec().links[c.link];
      if (!l || l.owner !== e.owner || l.done) return receipt(e, false, 'no such line being built');
      dropGang(l); unreserve(l); delete rec().links[l.id];
      return receipt(e, true, 'Line cancelled (track laid so far is lost)');
    }
    if (c.mode === 'board') return board(e, c.train) || true;
    if (c.mode === 'skip') return skip(e) || true;
    if (c.mode === 'blast') return blast.lay(e) || true;   // train robbery R1 (rail_blast.js)
    if (c.mode === 'rob') return robbery.rob(e) || true;   // R2: hold on a stopped train's freight wagon (rail_robbery.js)
    if (c.mode === 'chest') return robbery.grab(e) || true;   // R3: pick up a stolen chest
    if (c.mode === 'cashChest') return robbery.cash(e) || true;   // R3: cash it at an own town hall or war camp
    if (c.mode === 'tear') return tearSpur(e, c.link);
    if (c.mode !== 'link') return receipt(e, false, 'link or cancel');
    if (linksOf(e.owner).filter(l => !l.done).length >= (L().maxBuilding ?? 1)) return receipt(e, false, 'A line is already being laid');
    const p = preview(e.owner, c.town, c.to);
    if (p.error) return receipt(e, false, p.error);
    const id = `r${++rec().seq}`, { points, dist, length, bridges } = p.line;
    rec().links[id] = { id, owner: e.owner, from: c.town, to: c.to, payer: c.town, points, dist, length, bridges,
      built: 0, paid: 0, started: state.tick ?? 0, done: false, waiting: null, gang: [] };
    reserve(rec().links[id]);
    return receipt(e, true, `Rail gang heading out: ${town(c.town).name} to ${c.to === 'capital' ? 'the capital' : town(c.to).name}`);
  }

  // a town's railway lines, laid or being laid (Tim 2026-11-07: removing its station tears them up; lay them again
  // from the new station). Riders get off where the train is.
  const linesAt = (owner, id) => linksOf(owner).filter(l => l.from === id || l.to === id);
  function tearUp(owner, id) {
    const gone = linesAt(owner, id);
    for (const l of gone) {
      for (const t of Object.values(rec().trains)) if (t.link === l.id) { for (const u of ridersOf(t.id)) { delete u.aboard; delete u.railRide; } delete rec().trains[t.id]; }
      dropGang(l); unreserve(l); delete rec().links[l.id];
    }
    if (gone.length) tearHook?.(id, owner);   // shipments: yard cargo into the town, stranded reservations released
    if (gone.length && state.clans?.[owner]) state.clans[owner].notice = { tick: state.tick, text: `${gone.length === 1 ? 'Its railway line was' : `${gone.length} railway lines were`} torn up with the station` };
    return gone.length;
  }

  // one economy tick: each unfinished link moves on by length / seconds, buying the next stretch when needed
  function econTick() {
    campSpurs();
    campLines();
    townStations();
    for (const l of Object.values(rec().links)) {
      if (l.done) continue;
      const camp = isCamp(l.payer) ? warOfNode(l.payer)?.camp || null : null, s = camp ? null : town(l.payer);
      if (camp ? !campStation(warOfNode(l.payer)) : (!s || s.owner !== l.owner)) { dropGang(l); unreserve(l); delete rec().links[l.id]; if (camp?.station?.link === l.id) delete camp.station; continue; }   // the town was lost, or the camp station is down
      const stock = camp ? camp.stock : s.stock;
      const step = l.length / Math.max(1, L().seconds ?? 600) * secs();
      if (l.built + step > l.paid + 1e-6 && l.paid < l.length) {
        const stretch = Math.min(L().stretch ?? 100, l.length - l.paid), cost = Object.entries((camp ? L().campCostPer100 : null) || L().costPer100 || {}).map(([r, n]) => [r, n * stretch / 100]);
        const short = cost.find(([r, n]) => (stock[r] || 0) < n);
        if (short) { l.waiting = short[0]; continue; }
        for (const [r, n] of cost) { if (camp) stock[r] = Math.round(((stock[r] || 0) - n) * 100) / 100; else world.change(s.id, r, -n, 'rail'); }
        l.paid += stretch; l.spent = l.spent || {}; for (const [r, n] of cost) l.spent[r] = Math.round(((l.spent[r] || 0) + n) * 100) / 100;
      }
      l.waiting = null;
      l.built = Math.min(l.length, l.built + step);
      if (l.built >= l.length - 1e-6) {
        l.built = l.length; l.done = true; l.finished = state.tick ?? 0; dropGang(l);
        addTrain(l);
        const clan = state.clans?.[l.owner];
        if (isCamp(l.from)) { const c = warOfNode(l.from)?.camp; if (c) c.station = { ...(c.station || {}), node: l.from, link: l.id, linked: true }; }
        if (clan) clan.notice = { tick: state.tick, text: isCamp(l.from) ? `Camp station linked by rail to ${placeName(l.to)}` : `Rail line open: ${town(l.from)?.name || 'the capital'} to ${l.to === 'capital' ? 'the capital' : town(l.to)?.name}` };
      }
    }
  }

  // 8e-4: every camp with a built camp station and no spur orders one, to the nearest own town with a station.
  // No such town: it says why on the camp (war.camp.station.why) and tries again a little later.
  function campSpurs() {
    for (const w of Object.values(state.frontier.wars?.list || {})) {
      const c = w.camp, b = campStation(w), node = `camp:${w.id}`;
      if (!c || !b) continue;
      if (Object.values(rec().links).some(l => l.from === node || l.to === node)) continue;
      if (c.station?.retry > (state.tick ?? 0)) continue;
      const towns = Object.values(state.frontier.settlements || {}).filter(t => t.owner === w.attacker && !t.capital && endpoint(w.attacker, t.id))
        .sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z));
      let why = towns.length ? null : 'Needs one of your towns with a railway station';
      for (const t of towns) {
        const p = preview(w.attacker, node, t.id);
        if (p.error) { why ||= p.error; continue; }
        const id = `r${++rec().seq}`, { points, dist, length, bridges } = p.line;
        rec().links[id] = { id, owner: w.attacker, from: node, to: t.id, payer: node, camp: w.id, points, dist, length, bridges,
          built: 0, paid: 0, started: state.tick ?? 0, done: false, waiting: null, gang: [] };
        reserve(rec().links[id]);
        c.station = { node, link: id, linked: false, to: t.id };
        const clan = state.clans?.[w.attacker];
        if (clan) clan.notice = { tick: state.tick, text: `Rail gang laying the camp spur to ${t.name}` };
        why = null; break;
      }
      if (why) c.station = { node, linked: false, why, retry: (state.tick ?? 0) + 600 };
    }
  }

  const W8 = () => data.war || {};
  const down = b => !b || b.stage !== 'built';
  function makeSections(w, l) {
    const t = town(w.town), R0 = W8().circleRadius ?? 900, N = Math.max(1, W8().supply?.sections ?? 3);
    if (!t) return;
    let dIn = 0;
    for (let d = 0; d <= l.length; d += 4) { const p = pointAt(l, d); if (Math.hypot(p.x - t.x, p.z - t.z) <= R0) dIn = d; else break; }
    if (dIn <= 0) dIn = Math.min(l.length, 40);
    // Tim 2026-11-17: N short pieces in a row just outside the camp (sectionStart from the camp station, sectionLength
    // each, sectionGap between), squeezed to fit when less track lies inside the war circle. The red piece is what is hit.
    const S = W8().supply || {}, r1 = v => Math.round(v * 10) / 10;
    let start = S.sectionStart ?? 60, len = S.sectionLength ?? 30, gap = S.sectionGap ?? 10;
    const need = start + N * len + (N - 1) * gap;
    if (need > dIn) { const f = dIn / need; start *= f; len *= f; gap *= f; }
    for (let k = 0; k < N; k++) {
      const d0 = start + k * (len + gap), d1 = d0 + len, p = pointAt(l, (d0 + d1) / 2), pad = S.sectionWidth ?? 3, boxes = [];
      for (let d = d0; d < d1 - 0.01; d += 5) {   // hit boxes along the red piece, a box per 5 units of track
        const a = pointAt(l, d), b = pointAt(l, Math.min(d1, d + 5));
        boxes.push({ minX: r1(Math.min(a.x, b.x) - pad), maxX: r1(Math.max(a.x, b.x) + pad), minZ: r1(Math.min(a.z, b.z) - pad), maxZ: r1(Math.max(a.z, b.z) + pad) });
      }
      w.camp.buildings.push({ id: `${w.id}:rail${k + 1}`, type: 'rail_section', stage: 'built', x: r1(p.x), z: r1(p.z),
        rail: { link: l.id, d0: r1(d0), d1: r1(d1) }, hitBoxes: boxes, n: k + 1, of: N });
    }
    w.camp.sectionsMade = l.id;
    // once per clan (Tim 2026-11-17): a one-time tip to a player defending against a camp whose spur just linked (no notice)
    const dc = state.clans?.[w.defender];
    if (dc && !dc.bot && !dc.supplyTipSeen) { dc.supplyTipSeen = true; (state.news ||= []).push({ kind: 'supplyLineTip', clan: w.defender, war: w.id, townName: t.name }); }
  }
  // Tim 2026-11-17: a town whose railway station is a ruin runs no trains. Every finished line at that town is
  // closed (cutBy 'station', cutAt the town) until the station is rebuilt; routes through the town are blocked with
  // it (shipments route over open lines only), open orders wait. Both sides of a war on the town get a notice.
  const stationDown = id => { const st = (town(id)?.buildings || []).filter(b => b.type === 'station'); return st.length > 0 && st.every(b => b.stage === 'ruined'); };
  function townStations() {
    for (const l of Object.values(rec().links)) {
      if (!l.done || (l.closed && l.cutBy !== 'station')) continue;
      const at = [l.from, l.to].find(id => id !== 'capital' && !isCamp(id) && stationDown(id));
      if (at && !l.closed) {
        l.closed = true; l.cutBy = 'station'; l.cutAt = at;
        const s = town(at), text = `${s?.name || 'A town'} has lost its railway station: no trains run there until it is rebuilt`;
        const tell = new Set([l.owner, s?.owner, ...Object.values(state.frontier?.wars?.list || {}).filter(w => w.town === at).map(w => w.attacker)]);
        for (const o of tell) { const cl = state.clans?.[o]; if (cl) cl.notice = { tick: state.tick, text }; }
      } else if (!at && l.closed) { l.closed = false; delete l.cutBy; delete l.cutAt; }
    }
  }
  function campLines() {
    for (const l of Object.values(rec().links)) {
      if (!isCamp(l.from)) continue;
      const w = warOfNode(l.from);
      if (!w) { endSpur(l); continue; }
      const c = w.camp;
      if (!l.done || !c) continue;
      if (c.sectionsMade !== l.id) makeSections(w, l);
      const secs = c.buildings.filter(b => b.type === 'rail_section' && b.rail?.link === l.id);
      const cut = down(c.buildings.find(b => b.type === 'camp_station')) || secs.some(down);   // Tim 2026-11-17: any break stops the trains; all must be whole again
      const say2 = text => { for (const o of [w.attacker, w.defender]) { const cl = state.clans?.[o]; if (cl) cl.notice = { tick: state.tick, text }; } };
      if (cut && !l.closed) { l.closed = true; l.cutBy = 'war'; c.station = { ...(c.station || {}), linked: false, cut: true }; cutHook?.(l.from, l.id); say2(`The ${placeName(l.from).replace(/^the /, '')} is cut off from the rail network`); }
      else if (!cut && l.closed && l.cutBy === 'war') { l.closed = false; delete l.cutBy; c.station = { ...(c.station || {}), linked: true, cut: false }; }
    }
  }
  // the war of a camp line is over (8e-6)
  function endSpur(l) {
    const old = (state.frontier.wars?.history || []).find(x => x.id === l.camp) || null, result = old?.result || 'ended';
    for (const t of Object.values(rec().trains)) if (t.link === l.id) { trainHook?.(t); for (const u of ridersOf(t.id)) { delete u.aboard; delete u.railRide; } delete rec().trains[t.id]; }
    dropGang(l); unreserve(l); delete rec().links[l.id];
    tearHook?.(l.from, l.owner);
    if (!l.done || result === 'campFell' || result === 'attackerSurrendered') return;
    const to = town(l.to);
    if (result === 'captured' && old && town(old.town)?.owner === l.owner && endpoint(l.owner, old.town) && !linked(l.owner, old.town, l.to)) {
      const p = preview(l.owner, old.town, l.to);
      if (!p.error) {
        const id = `r${++rec().seq}`, { points, dist, length, bridges } = p.line;
        rec().links[id] = { id, owner: l.owner, from: old.town, to: l.to, payer: old.town, points, dist, length, bridges, built: length, paid: length, started: state.tick ?? 0, done: true, finished: state.tick ?? 0, waiting: null, gang: [], spur: true, spent: { ...(l.spent || {}) } };
        reserve(rec().links[id]); addTrain(rec().links[id]);
        return;
      }
    }
    if (to && to.owner === l.owner) spurBack(l, to);
  }
  const spurBack = (l, to) => { for (const [r, n] of Object.entries(l.spent || {})) { const k = Math.floor(n * (W8().supply?.spurRefund ?? 0.5)); if (k > 0) world.change(to.id, r, k, 'camp spur torn up'); } };
  // 8e-6: a spur that became a line to a captured town can be torn up by its owner any time, half its cost back
  function tearSpur(e, id) {
    const l = rec().links[id];
    if (!l || l.owner !== e.owner || !l.spur) return receipt(e, false, 'Only a captured camp spur can be torn up');
    for (const t of Object.values(rec().trains)) if (t.link === l.id) { trainHook?.(t); for (const u of ridersOf(t.id)) { delete u.aboard; delete u.railRide; } delete rec().trains[t.id]; }
    dropGang(l); unreserve(l); delete rec().links[l.id];
    tearHook?.(l.from, l.owner); tearHook?.(l.to, l.owner);
    const to = town(l.to)?.owner === l.owner ? town(l.to) : town(l.from)?.owner === l.owner ? town(l.from) : null;
    if (to) spurBack(l, to);
    return receipt(e, true, `Spur torn up${to ? `: materials back to ${to.name}` : ''}`);
  }

  // step 3: one train per open link, standing at the `from` station first
  function addTrain(l) {
    const id = `t${++rec().seq}`;
    rec().trains[id] = { id, link: l.id, owner: l.owner, d: 0, dir: 1, wait: Math.round((T().stopSeconds ?? 20) * 20), cars: T().cars ?? 3, speed: T().speed ?? 36 };
    return id;
  }
  // trains run every sim tick: along the line, then a stop at the far station, then back
  function runTrains() {
    const has = new Set(Object.values(rec().trains).map(t => t.link));
    for (const l of Object.values(rec().links)) if (l.done && !has.has(l.id)) addTrain(l);   // older saves
    for (const t of Object.values(rec().trains)) {
      const l = rec().links[t.link];
      if (!l?.done) { for (const u of ridersOf(t.id)) { delete u.aboard; delete u.railRide; } delete rec().trains[t.id]; continue; }
      t.speed = T().speed ?? 36;
      if (T().consist) t.consist = T().consist; else delete t.consist;   // its cars, for the renderer (render/rail_track.js)
      // Tim 2026-11-07: on screen it runs a little slower than a horse (train.viewSpeed); with nobody near it
      // runs at full speed, so shipments keep their arrival times. Checked twice a second.
      if (!((state.tick ?? 0) % 10) || t.seen === undefined) t.seen = watched(t, l);
      const v = t.seen ? Math.min(t.speed, T().viewSpeed ?? 20) : t.speed;
      t.v = v;
      if (t.call && (state.tick ?? 0) >= t.call.until) allAboard(t);   // the boarding call ran out
      // a closed line (its camp's supply line cut, or a town station in ruins): the train stays at the station it is
      // at, or runs on to the next one and stays there (Tim 2026-11-17)
      // Tim 2026-11-21: a line blown by a charge still lets its train set out once (it stops at the gap, guards out, then
      // backs up to its station and is held there until the repair), so the blast need not be timed
      if (l.closed && (t.d <= 0 || t.d >= l.length) && !(l.cutBy === 'blast' && l.blast && !l.blast.sortie)) t.wait = Math.max(t.wait, 2);
      if (!l.closed && t.held) { delete t.held; arriveHook?.(t, l, t.d <= 0 ? l.from : l.to); }   // open again: it unloads and loads where it stood
      if (blast.gate(t, l, v)) continue;   // standing at a blown track (train robbery R1)
      if (t.wait > 0) { t.wait--; if (!t.wait) departHook?.(t, l, t.d <= 0 ? l.from : l.to); }   // last chance to load before it leaves
      else {
        const d0 = t.d;
        t.d += t.dir * v / 20;
        if (t.d >= l.length || t.d <= 0) { t.d = t.d >= l.length ? l.length : 0; arrive(t); continue; }
        runOver(t, l, d0);
      }
      // riders go along with the engine (the camera follows the hero: ride along and watch)
      const head = pointAt(l, t.d);
      for (const u of ridersOf(t.id)) { u.x = head.x; u.z = head.z; u.place = 'world'; u.anim = 'idle'; }
    }
  }
  // the 2026-11-07 rule (built with train robbery, Tim 2026-11-20): anyone standing on the track where the engine passes
  // goes down (heroes and crew come round at their nearest town hall, island_respawn.js). Townsfolk, workers and the
  // rail crews step aside. Only near someone on the island (unwatched units are not on the track).
  function runOver(t, l, d0) {
    if (!t.seen) return;
    const r = (data.railways?.robbery?.runOverReach ?? 1.6);
    const a = pointAt(l, d0), b = pointAt(l, t.d), dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz || 1;
    for (const u of Object.values(state.entities || {})) {
      if (u.place !== 'world' || u.dead || u.downed || u.aboard || u.untouchable || u.railGang || u.trainGuard || u.worker || u.civilian || u.type === 'civilian' || u.vehicle || u.type === 'horse' || u.animal) continue;
      if (Math.abs(u.x - a.x) > 40 || Math.abs(u.z - a.z) > 40) continue;
      const k = Math.max(0, Math.min(1, ((u.x - a.x) * dx + (u.z - a.z) * dz) / len2));
      if (Math.hypot(a.x + dx * k - u.x, a.z + dz * k - u.z) > r) continue;
      u.anim = 'death'; delete u.order; runtime?.forget?.(u.id);
      if (u.type === 'hero') { u.dead = true; u.diedAt = state.tick ?? 0; (state.news ||= []).push({ kind: 'bossDown', clan: u.owner, hero: u.id, by: null, x: u.x, z: u.z }); }
      else if (u.warTroop || u.settler || u.type === 'settler') { u.dead = true; u.diedAt = state.tick ?? 0; }
      else { u.downed = true; u.downedAt = state.tick ?? 0; }
      say(u.owner, u.type === 'hero' ? 'Your hero was hit by a train' : 'One of yours was hit by a train');
    }
  }
  // someone is riding it, or a player's hero on the island is within train.viewRange of the engine (the camera
  // stays on the hero)
  function watched(t, l) {
    if (ridersOf(t.id).length) return true;
    const head = pointAt(l, t.d), r = T().viewRange ?? 140;
    return Object.values(state.entities).some(u => u.type === 'hero' && u.place === 'world' && !u.dead && !state.clans?.[u.owner]?.bot
      && Math.abs(u.x - head.x) < r && Math.abs(u.z - head.z) < r);
  }
  // ---- riding (step 4) ----------------------------------------------------------------------------------
  const RIDE = () => R?.ride || {};
  const say = (owner, text) => { const clan = state.clans?.[owner]; if (clan) clan.notice = { tick: state.tick, text }; return true; };
  const ridersOf = id => Object.values(state.entities).filter(u => u.aboard === `rail:${id}`);
  // seats: the carriages of train.consist (Tim 2026-11-07), else every car but the last
  const seats = t => Math.max(1, T().consist ? T().consist.filter(k => k === 'carriage').length : (t.cars ?? 3) - 1) * (RIDE().seatsPerCar ?? 8);
  const placeName = id => id === 'capital' ? 'the capital' : isCamp(id) ? `the ${town(warOfNode(id)?.town)?.name || ''} camp`.replace('the  camp', 'the camp') : town(id)?.name || id;
  const robRefs = {};   // war, shipments, world: set by frontier.js (setRobbery), made after the rail
  const robbery = createRailRobbery({ state, data, rec, pointAt, say, placeName, dayTicks, runtime: () => runtime, refs: robRefs });   // train robbery R2-R3
  const blast = createRailBlast({ state, data, rec, pointAt, say, placeName, dayTicks, runtime: () => runtime,
    hooks: { stop: (t, l) => { gapOff(t, l); robbery.guardsOut(t, l); }, go: robbery.guardsIn, station: robbery.atStation } });   // train robbery R1
  // is e standing at station `id` (a town's station on the island, or the capital: either side of the gate)?
  function atStation(e, owner, id) {
    if (id === 'capital' && !hub(owner)) {
      const g = runtime?.gate; if (!g) return false;
      const st = g.station || g.city;   // the city railway station (Tim 2026-11-07), else the gate
      // with a city station the train stands inside the wall: boarding only at the station in the city (Tim 2026-11-10)
      return (e.place === 'street' && Math.hypot(e.x - st[0], e.z - st[1]) <= (RIDE().gateReach ?? 6))
        || (!g.rail && e.place === 'world' && Math.hypot(e.x - (g.rail || g.island)[0], e.z - (g.rail || g.island)[1]) <= (RIDE().reach ?? 18) + 6);
    }
    const p = endpoint(owner, id);
    return !!p && e.place === 'world' && Math.hypot(e.x - p.x, e.z - p.z) <= (RIDE().reach ?? 18);
  }
  // trains standing at a station the hero is at, with where each goes next
  function boardable(e) {
    if (!e || e.type !== 'hero') return [];
    return Object.values(rec().trains).filter(t => t.owner === e.owner).map(t => {
      const at = stationOf(t), l = rec().links[t.link];
      if (!at && gapAt(t, e)) { const to = t.dir > 0 ? l.from : l.to; return { train: t.id, at: 'gap', to, toName: placeName(to), riders: ridersOf(t.id).length, seats: seats(t) }; }
      return at && atStation(e, e.owner, at) ? { train: t.id, at, to: at === l.from ? l.to : l.from, toName: placeName(at === l.from ? l.to : l.from), riders: ridersOf(t.id).length, seats: seats(t) } : null;
    }).filter(Boolean);
  }
  // every train serving one station of this owner: standing there now (eta 0) or seconds until it comes in
  // (the station clock over each station reads this too, Tim 2026-11-08)
  function serviceAt(owner, at) {
    const stop = (T().stopSeconds ?? 60) * 20;
    return Object.values(rec().trains).filter(t => t.owner === owner).flatMap(t => {
      const l = rec().links[t.link]; if (!l || (l.from !== at && l.to !== at)) return [];
      const end = at === l.to ? l.length : 0, to = at === l.from ? l.to : l.from, run = d => Math.abs(d) / Math.max(1, t.speed) * 20;
      let ticks;
      if (stationOf(t) === at) ticks = 0;
      else if ((end - t.d) * t.dir > 0) ticks = Math.max(0, t.wait) + run(end - t.d);   // heading here
      else ticks = Math.max(0, t.wait) + run(t.dir > 0 ? l.length - t.d : t.d) + stop + run(l.length);   // out to the far end first
      return [{ train: t.id, at, to, toName: placeName(to), eta: Math.ceil(ticks / 20), leaves: ticks === 0 ? Math.ceil(Math.max(0, t.wait) / 20) : null, riders: ridersOf(t.id).length, seats: seats(t), ...(l.closed ? { closed: true } : {}) }];
    }).sort((a, b) => a.eta - b.eta);
  }
  // every train serving a station the hero stands at
  function service(e) {
    if (!e || e.type !== 'hero') return [];
    const ids = [...new Set(linksOf(e.owner).flatMap(l => [l.from, l.to]))].filter(id => atStation(e, e.owner, id));
    return ids.flatMap(id => serviceAt(e.owner, id)).sort((a, b) => a.eta - b.eta);
  }
  // Boarding (Tim 2026-11-08): picking a train calls "All aboard!": a big zone (ride.zoneRadius) shows on the ground
  // round the station for ride.callSeconds, or less if the train leaves sooner. When it runs out, everyone of yours standing in
  // the zone gets on (horses and vehicles stay at the station), so crew you leave outside stay in town. Picking the
  // train again (Space) boards at once. The hero must still be in the zone.
  function board(e, trainId) {
    if (e.type !== 'hero' || e.dead || e.downed || e.jailed) return;
    if (String(e.aboard || '').startsWith('rail:')) return say(e.owner, 'Already on a train');   // in a rickshaw or omnibus: he steps out to board
    if (e.chest) return say(e.owner, 'No stolen chest on the train: ride or run it home');   // train robbery (Tim 2026-11-20)
    const t = rec().trains[trainId], at = t && (stationOf(t) || gapAt(t, e));
    if (t?.call?.hero === e.id) return allAboard(t);   // Space again: on at once (anywhere in the zone)
    if (!t || t.owner !== e.owner || !at || !atStation(e, e.owner, at)) return say(e.owner, 'No train standing here');
    // no leaving the capital with a Rally up (Tim 2026-11-10): rallied sector crew rode out, the Hero group went far over
    // six on the island and the city was left short. Once the Rally is over only the Hero group boards (inZone).
    if (at === 'capital' && !hub(e.owner) && e.place === 'street' && rallyUp(e.owner)) return say(e.owner, 'A Rally is up: the train waits until your crew are back at their posts');
    if (t.call) return say(e.owner, 'Boarding is already called');
    // the call never holds the train (Tim 2026-11-08): with less than callSeconds before it leaves, that is all you get
    const ticks = Math.max(1, Math.min(Math.round((RIDE().callSeconds ?? 10) * 20), t.wait - 1));
    // the zone lies on the ground round the station (Tim 2026-11-08): a town's shed, the city railway station, or the
    // line's end outside the island gate
    const g = runtime?.gate, p = at === 'gap' ? { x: e.x, z: e.z } : at === 'capital' && !hub(e.owner) ? (e.place === 'street' ? (g?.station && { x: g.station[0], z: g.station[1] }) : endpoint(e.owner, 'capital')) : endpoint(e.owner, at);
    t.call = { hero: e.id, x: p?.x ?? e.x, z: p?.z ?? e.z, place: e.place, r: RIDE().zoneRadius ?? 25, until: (state.tick ?? 0) + ticks, ticks };
    return say(e.owner, 'All aboard! Get your crew into the zone (Space boards now)');
  }
  // who is in the boarding zone: the hero and every unit of his on foot or on horseback (not horses, vehicles, workers)
  const rallyUp = owner => { const r = state.deployment?.clans?.[owner]?.rally; return !!r?.active && r.endsAt > (state.tick ?? 0); };
  function inZone(t) {
    const c = t.call, e = c && state.entities[c.hero];
    if (!e) return [];
    // crew sitting in a rickshaw or omnibus count where the vehicle stands (they climb out; it stays, empty)
    const at = u => { const v = vehicleOf(u); return v || u; };
    // in the capital only the boss's own party boards: Hero group (or Rally) crew and settlers, never sector crew or
    // HQ reserves walking past the station (Tim 2026-11-08: sector crew rode out to the island and could not be ordered)
    const party = u => u.place !== 'street' || !u.deployment || (!u.deployment.transfer && (u.deployment.group || 'hero') === 'hero');
    const ok = u => u.owner === e.owner && u.type !== 'hero' && !u.dead && !u.downed && !u.jailed && !u.garrison && (!u.aboard || vehicleOf(u)) && !u.worker && !u.railGang && party(u)
      && u.type !== 'horse' && u.type !== 'rickshaw' && u.type !== 'omnibus' && !u.vehicle && at(u).place === c.place && Math.hypot(at(u).x - c.x, at(u).z - c.z) <= c.r;
    return Object.values(state.entities).filter(ok).sort((a, b) => Math.hypot(at(a).x - c.x, at(a).z - c.z) - Math.hypot(at(b).x - c.x, at(b).z - c.z));
  }
  // the rickshaw or omnibus a unit sits in, if any
  function vehicleOf(u) {
    const v = u.aboard && !String(u.aboard).startsWith('rail:') && state.entities[u.aboard];
    return v && (v.type === 'rickshaw' || v.type === 'omnibus') ? v : null;
  }
  // out of the vehicle, which stays where it is, parked
  function leaveVehicle(u) {
    const v = vehicleOf(u); if (!v) return;
    delete u.aboard; if (u.ride?.kind === 'omnibus') delete u.ride;
    if (v.driver === u.id) { delete v.driver; v.heading = u.heading ?? v.heading; }
    v.anim = 'idle'; v.trail = []; v.vorder = { kind: 'stay' };
  }
  function allAboard(t) {
    const c = t.call, e = c && state.entities[c.hero];
    delete t.call;
    if (!e || e.dead || e.downed || e.jailed || String(e.aboard || '').startsWith('rail:')) return;
    const at = stationOf(t) || (t.stopped ? 'gap' : null);
    if (!at) return say(e.owner, 'The train left without you');
    if (e.place !== c.place || Math.hypot(e.x - c.x, e.z - c.z) > c.r) { t.wait = Math.min(t.wait, 20); return say(e.owner, 'Boarding called off: you left the zone'); }
    if (c.place === 'street' && rallyUp(e.owner)) return say(e.owner, 'Boarding called off: a Rally is up');
    if (e.mounted) { delete e.mounted; delete e.ride; }   // the horse stays at the station
    const group = inZone({ call: c });
    const room = seats(t) - ridersOf(t.id).length, party = [e, ...group].slice(0, Math.max(0, room));
    if (!party.length) return say(e.owner, 'The train is full');
    const head = pointAt(rec().links[t.link], t.d);
    for (const u of party) {
      leaveVehicle(u);   // rickshaws and omnibuses stay at the station, empty (Tim 2026-11-08)
      if (u.mounted) { delete u.mounted; delete u.ride; }   // crew horses stay at the station
      delete u.order; delete u.attackTarget; delete u.swing; delete u.execute; runtime?.forget?.(u.id);
      Object.assign(u, { aboard: `rail:${t.id}`, railRide: { train: t.id, since: state.tick ?? 0 }, place: 'world', x: head.x, z: head.z, anim: 'idle' });
    }
    t.wait = Math.min(t.wait, Math.round((RIDE().departSeconds ?? 3) * 20));
    const left = group.length + 1 - party.length;
    const L0 = rec().links[t.link], dest = at === 'gap' ? (t.dir > 0 ? L0.from : L0.to) : at === L0.from ? L0.to : L0.from;   // from the gap it backs to where it came from
    return say(e.owner, `All aboard for ${placeName(dest)}${left ? ` (${left} could not fit and stayed)` : ''}`);
  }
  // Skip: after a few seconds aboard, the train is at the far station at once
  function skip(e) {
    const t = e.railRide && rec().trains[e.railRide.train];
    if (!t || e.aboard !== `rail:${t.id}`) return say(e.owner, 'Not on a train');
    if ((state.tick ?? 0) - e.railRide.since < (RIDE().skipSeconds ?? 5) * 20) return say(e.owner, 'Skip in a moment');
    const l = rec().links[t.link];
    if (blast.blocks(t, l)) return say(e.owner, 'The line ahead is blown up');
    if (t.wait > 0 && stationOf(t)) t.wait = 0;   // still at the platform: off it goes
    t.d = t.dir > 0 ? l.length : 0;
    arrive(t);
    return true;
  }
  // the train has reached a station: stand there, turn round, let everyone off
  function arrive(t) {
    const l = rec().links[t.link], at = t.d >= l.length ? l.to : l.from;
    t.dir = at === l.to ? -1 : 1; t.wait = Math.round((T().stopSeconds ?? 20) * 20);
    t.arrived = { at, tick: state.tick ?? 0 };
    if (l.closed) t.held = true;   // a closed line: its cargo stays aboard until the line opens again (Tim 2026-11-17)
    else arriveHook?.(t, l, at);   // shipments: unload and load cargo
    const riders = ridersOf(t.id);
    if (!riders.length) return;
    const hero = riders.find(u => u.type === 'hero') || riders[0];
    let place = 'world', px, pz;
    if (at === 'capital' && !hub(t.owner)) { place = 'street'; [px, pz] = runtime?.gate?.station || runtime?.gate?.inside || runtime?.gate?.city || [hero.x, hero.z]; }
    else { const p = endpoint(t.owner, at) || pointAt(l, t.d); px = p.x + 6; pz = p.z + 6; }
    letOff(riders, place, px, pz, `Arrived at ${placeName(at)}`);
  }
  // train robbery (Tim 2026-11-20): riders get off beside a train stopped at a blown track, to fight
  function gapOff(t, l) {
    const riders = ridersOf(t.id);
    if (!riders.length) return;
    const p = pointAt(l, t.d), nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
    letOff(riders, 'world', p.x + nx * 5, p.z + nz * 5, 'The line ahead is blown up: everyone off!');
  }
  function letOff(riders, place, px, pz, text) {
    const hero = riders.find(u => u.type === 'hero') || riders[0];
    const grid = runtime?.navOf?.(place);
    riders.forEach((u, k) => {
      const [ox, oz] = k ? (runtime?.followOffset?.(k % 36) || [k, 0]) : [0, 0];
      const [x, z] = grid?.nearestFree?.(px + ox * 0.8, pz + oz * 0.8) || [px + ox * 0.8, pz + oz * 0.8];
      delete u.aboard; delete u.railRide;
      Object.assign(u, { x, z, place, anim: 'idle' }); runtime?.forget?.(u.id);
      if (u !== hero) { u.order = { kind: 'follow', target: hero.id }; u.order.slot = runtime?.freeSlot?.(hero.id, u.id); }
    });
    if (place === 'world') runtime?.areas?.update?.(Object.values(state.entities));
    say(hero.owner, text);
  }

  // a train of yours standing at a blown track, with e near it: 'gap' (train robbery, Tim 2026-11-20)
  const gapAt = (t, e) => { if (!t.stopped || t.owner !== e.owner || e.place !== 'world') return null; const l = rec().links[t.link], p = l && pointAt(l, t.d); return p && Math.hypot(p.x - e.x, p.z - e.z) <= (RIDE().zoneRadius ?? 25) ? 'gap' : null; };
  // which station a standing train is at (null while it runs)
  const stationOf = t => { const l = rec().links[t.link]; return !l || t.wait <= 0 ? null : (t.d <= 0 ? l.from : t.d >= l.length ? l.to : null); };

  function dropGang(l) {
    for (const id of l.gang || []) if (state.entities?.[id]) runtime?.remove(id);
    l.gang = [];
  }

  // the drawn railhead's pace (Tim 2026-11-22): what the gang can follow at its walking pace (gang.speed over the share
  // of the cycle spent walking, less a margin), never ahead of the true progress; the line opens at link.seconds
  function walkPace() {
    const g = GANG(), hammer = Math.round((g.hammerSeconds ?? 3) * 20), cycle = hammer + 40, walkShare = Math.max(0.2, (cycle - hammer) / cycle);
    return (g.speed ?? 4.5) * walkShare / 1.3;
  }
  // the gang at the drawn railhead: spawn near someone on the island, hammer a few seconds, catch up, repeat
  function tick() {
    if (runtime?.gate) capitalEnds();
    blast.tick();   // charges, gaps and repair crews (train robbery R1)
    robbery.tick();   // holds, dropped and carried chests (R2-R3)
    runTrains();
    if (!runtime?.spawn) return;
    const enabled = modeRules(state).island, g = GANG(), size = g.size ?? 3;
    const anchors = enabled ? Object.values(state.entities).filter(e => e.place === 'world' && !e.worker && !e.railGang && e.type !== 'civilian' && e.owner && !e.dead && !e.downed) : [];
    for (const l of Object.values(rec().links)) {
      if (l.done) continue;
      l.shown = Math.min(l.built, (l.shown ?? l.built) + walkPace() / 20);   // lines begun before 2026-11-22 show what is laid
      l.gang = (l.gang || []).filter(id => { const e = state.entities?.[id]; return e && !e.dead; });
      laidStretches(l).forEach(([, d], c) => {
        const head = pointAt(l, d), near = anchors.some(e => Math.hypot(e.x - head.x, e.z - head.z) <= (g.spawnRadius ?? 160));
        const mine = l.gang.filter(id => (state.entities[id].railCrew || 0) === c);
        if (!near) { for (const id of mine) runtime?.remove(id); l.gang = l.gang.filter(id => !mine.includes(id)); return; }
        for (let k = mine.length; k < size; k++) {
          const spot = gangSpot(l, k, d);
          const id = runtime.spawn('civilian', g.model || 'laborer', spot.x, spot.z, { place: 'world', area: 'world', railGang: l.id, railCrew: c, seenBy: l.owner, town: l.payer, holdFire: true, hp: 120, maxHp: 120, anim: 'idle' });
          l.gang.push(id); mine.push(id);
        }
        gangMoves(l, mine, d, head);
      });
    }
  }
  // one crew's gang: hammer in place, then walk up beside its railhead at d
  function gangMoves(l, ids, at, head) {
    const g = GANG();
    const ahead = [Math.sin(head.heading), Math.cos(head.heading)];   // heading = atan2(dx, dz)
    const cycle = Math.round(((g.hammerSeconds ?? 3) + 2) * 20);
    ids.forEach((id, k) => {
      const e = state.entities[id]; if (!e) return;
      const t = ((state.tick ?? 0) + k * 13) % cycle, working = t < (g.hammerSeconds ?? 3) * 20;
      // while hammering they keep their spot; then they run up to their place beside the new railhead
      if (!working || e.railSpot == null) e.railSpot = at;
      const spot = gangSpot(l, k, e.railSpot), dx = spot.x - e.x, dz = spot.z - e.z, d = Math.hypot(dx, dz);
      // they walk at gang.speed (below the hero's run, Tim 2026-11-07); the drawn railhead moves at walkPace, so they
      // keep up between swings (Tim 2026-11-22); a long gap (spawning in) closes at once
      const v = (g.speed ?? 4.5) / 20;
      if (d > 40) { e.x = spot.x; e.z = spot.z; }
      else if (d > 0.05) { const m = Math.min(1, v / d); e.x += dx * m; e.z += dz * m; e.dir = dirIndex(dx, dz); }
      e.anim = d > 0.3 ? (g.anim?.move || 'run') : (g.anim?.work || 'bow');
      if (d <= 0.3) e.dir = dirIndex(...ahead);
    });
  }
  // gang member k's place: just behind the railhead, alternating sides of the track
  function gangSpot(l, k, d) {
    const behind = pointAt(l, Math.max(0, d - 1.5 - k * 1.2)), head = behind, side = (k % 2 ? 1 : -1) * (1.6 + (k >> 1) * 0.6);
    const nx = Math.cos(head.heading), nz = -Math.sin(head.heading);
    return { x: behind.x + nx * side, z: behind.z + nz * side };
  }

  function attach(services) { runtime = services; }
  // Lines laid before the capital end moved from the gate to the station (Tim 2026-11-10): routed again to the new end,
  // once; trains and laying progress keep their share of the way. A line with no way there keeps its old end.
  function capitalEnds() {
    const city = endpoint(null, 'capital'), r = rec(); if (!city) return;
    // each clan's own end (Z4f): its castle station, else the city's
    const hubs = Object.values(state.frontier.settlements || {}).filter(s => s.castle && s.owner != null).map(s => [s.owner, endpoint(s.owner, 'capital')]);
    const key = [`${city.x},${city.z}`, ...hubs.map(([o, q]) => `${o}:${q.x},${q.z}`)].join('|'); if (r.capitalEnd === key) return;
    r.capitalEnd = key;
    for (const l of Object.values(r.links)) {
      const p = endpoint(l.owner, 'capital') || city;
      const end = l.to === 'capital' && l.points?.at(-1);
      if (!end || Math.hypot(end[0] - p.x, end[1] - p.z) < 1) continue;
      const n = preview(l.owner, l.from, 'capital', l).line; if (!n) continue;
      const k = n.length / (l.length || n.length);
      for (const t of Object.values(r.trains)) if (t.link === l.id) t.d = t.d >= l.length - 0.01 ? n.length : Math.max(0, Math.min(n.length, t.d * k));
      unreserve(l);
      Object.assign(l, { points: n.points, dist: n.dist, length: n.length, bridges: n.bridges, built: Math.min(n.length, (l.built || 0) * k) });
      if (l.shown != null) l.shown = Math.min(n.length, l.shown * k);
      reserve(l);
    }
  }
  const setShipping = (arrive, depart, tear = null, gone = null, cut = null) => { arriveHook = arrive; departHook = depart; tearHook = tear; trainHook = gone; cutHook = cut; };
  // what Space does for e here (main.js 'use', and its prompt): cash a carried chest, rob a stopped train's wagon, or set
  // a charge on the track; a robbery in progress shows its count down
  function prompt(e) {
    if (!e || e.place !== 'world') return null;
    if (e.robbing) return null;   // the ROBBING channel bar shows instead (Tim 2026-11-21)
    if (e.chest) return robbery.cashPoint(e) ? { mode: 'cashChest', text: 'Space  Cash in the stolen chest' } : null;
    if (typeof robbery.robCheck(e) !== 'string') return { mode: 'rob', text: 'Space  Rob the freight wagon' };
    if (typeof blast.layCheck(e) !== 'string') return { mode: 'blast', text: 'Space  Set a charge on the line' };
    return null;
  }
  return { prompt, command, tick, econTick, attach, hubOf: hub, endpoint, preview, campSpurs, isCamp, linksOf, linesAt, tearUp, addTrain, stationOf, boardable, service, serviceAt, atStation, inZone, setShipping, trains: () => Object.values(rec().trains), blast, robbery, setRobbery: refs => Object.assign(robRefs, refs) };
}
