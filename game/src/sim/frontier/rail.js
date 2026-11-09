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
// createRail({ state, data, world, worldData }) -> { command, tick, econTick, attach, endpoint, preview, linksOf }
import { crewCommandGroup } from '../deployment_rally.js';
import { createRailGrid, routeRail, pointAt, measure, roundCorners, openRun } from './rail_route.js';
import { townExit, railCellsFor, clearRun } from './rail_town.js';
import { stationParts } from './station_layout.js';
import { tierOf } from './tiers.js';
import { modeRules } from '../modes/index.js';
import { dirIndex } from '../geometry.js';

export function createRail({ state, data, world, worldData, stable }) {
  const R = data.railways, L = () => R?.link || {}, GANG = () => R?.gang || {};
  let grid = null, runtime = null, arriveHook = null, departHook = null;
  const G = () => grid ||= worldData && R?.route ? createRailGrid(worldData, R.route) : null;
  const rec = () => { const r = state.frontier.rail ||= { seq: 0, links: {} }; r.trains ||= {}; return r; };
  const T = () => R?.train || {};
  const linksOf = owner => Object.values(rec().links).filter(l => l.owner === owner);
  const town = id => id === 'capital' ? null : state.frontier.settlements?.[id];
  const secs = () => Math.max(1, data.cadenceTicks || 20) / 20;

  // where a station's track ends: the capital end just outside the island gate, a town's at its station
  function endpoint(owner, id) {
    if (id === 'capital') { const g = runtime?.gate?.island; return g ? { x: g[0], z: g[1] } : null; }
    const s = town(id), b = s && s.owner === owner && stable?.of(s, 'station');
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
  function preview(owner, from, to) {
    const s = town(from);
    if (!s || s.owner !== owner) return { error: 'not your town' };
    if (to !== 'capital' && town(to)?.owner !== owner) return { error: 'Lines only run to your own towns' };
    if (from === to) return { error: 'pick another town' };
    if ((tierOf(s, data) && (s.tier || 1) < (L().minTier ?? 2))) return { error: `${s.name} needs a bigger town hall first` };
    const a = endpoint(owner, from), b = endpoint(owner, to);
    if (!a) return { error: `Build a railway station in ${s.name} first` };
    if (!b) return { error: to === 'capital' ? 'The capital end is not ready' : `Build a railway station in ${town(to).name} first` };
    if (linked(owner, from, to)) return { error: 'Those stations are already linked' };
    const g = G();
    if (!g) return { error: 'no railway data' };
    const coarse = routeRail(g, a, b, { reuse: linksOf(owner).map(l => l) });
    if (!coarse) return { error: 'No way to lay track there' };
    // inside the end towns the track takes a fine path round buildings and houses (Tim 2026-11-07)
    // a 3x2 station (Tim 2026-11-07): out of the shed straight through the railway slot, then round the town
    const exitOf = (t, route) => { const st = stable.of(t, 'station'), parts = st && stationParts(t, st);
      if (!parts) return townExit(t, data, st ? (st.cells || [st.cell]) : [], route);
      const far = [t.x + parts.slotFar[0], t.z + parts.slotFar[1]], r = townExit(t, data, parts.slotCells, [far, ...route.slice(1)], { dir: parts.dir });
      return r && [route[0], ...r]; };
    const boxed = t => stationParts(t, stable.of(t, 'station')) ? `No room for a train to curve out of ${t.name}'s station: turn it (R) or clear a way`
      : `Buildings box in ${t.name}'s station: clear a way out`;
    let pts = exitOf(s, coarse.points);
    if (!pts) return { error: boxed(s) };
    if (to !== 'capital') {
      const back = exitOf(town(to), [...pts].reverse());
      if (!back) return { error: boxed(town(to)) };
      pts = back.reverse();
    }
    // round every corner to a curve a train could take (Tim 2026-11-08), keeping clear of rock, water and buildings
    const ends = [s, town(to)].filter(t => t?.grid).map(t => { const st = stable.of(t, 'station'); return [t, new Set(st ? (st.cells || [st.cell]) : [])]; });
    // strict first (a cell clear of rock and water), then just off rock and buildings where the strict curve won't fit
    const ok = [(p, q) => openRun(g, p, q) && ends.every(([t, mine]) => clearRun(t, p, q, mine, true)),
      (p, q) => openRun(g, p, q, 0) && ends.every(([t, mine]) => clearRun(t, p, q, mine))];
    pts = roundCorners(pts.filter((p, k) => !k || k === pts.length - 1 || Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) > 4), g.cfg.minRadius ?? 0, ok, 3, 0.5);   // half the slot stays straight
    const line = measure(g, pts.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]));
    line.cost = coarse.cost;
    const cost = {};
    for (const [r, n] of Object.entries(L().costPer100 || {})) cost[r] = Math.ceil(n * line.length / 100);
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
    if (gone.length && state.clans?.[owner]) state.clans[owner].notice = { tick: state.tick, text: `${gone.length === 1 ? 'Its railway line was' : `${gone.length} railway lines were`} torn up with the station` };
    return gone.length;
  }

  // one economy tick: each unfinished link moves on by length / seconds, buying the next stretch when needed
  function econTick() {
    for (const l of Object.values(rec().links)) {
      if (l.done) continue;
      const s = town(l.payer);
      if (!s || s.owner !== l.owner) { dropGang(l); delete rec().links[l.id]; continue; }   // the town was lost
      const step = l.length / Math.max(1, L().seconds ?? 600) * secs();
      if (l.built + step > l.paid + 1e-6 && l.paid < l.length) {
        const stretch = Math.min(L().stretch ?? 100, l.length - l.paid), cost = Object.entries(L().costPer100 || {}).map(([r, n]) => [r, n * stretch / 100]);
        const short = cost.find(([r, n]) => (s.stock[r] || 0) < n);
        if (short) { l.waiting = short[0]; continue; }
        for (const [r, n] of cost) world.change(s.id, r, -n, 'rail');
        l.paid += stretch;
      }
      l.waiting = null;
      l.built = Math.min(l.length, l.built + step);
      if (l.built >= l.length - 1e-6) {
        l.built = l.length; l.done = true; l.finished = state.tick ?? 0; dropGang(l);
        addTrain(l);
        const clan = state.clans?.[l.owner];
        if (clan) clan.notice = { tick: state.tick, text: `Rail line open: ${town(l.from)?.name || 'the capital'} to ${l.to === 'capital' ? 'the capital' : town(l.to)?.name}` };
      }
    }
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
      if (t.wait > 0) { t.wait--; if (!t.wait) departHook?.(t, l, t.d <= 0 ? l.from : l.to); }   // last chance to load before it leaves
      else {
        t.d += t.dir * v / 20;
        if (t.d >= l.length || t.d <= 0) { t.d = t.d >= l.length ? l.length : 0; arrive(t); continue; }
      }
      // riders go along with the engine (the camera follows the hero: ride along and watch)
      const head = pointAt(l, t.d);
      for (const u of ridersOf(t.id)) { u.x = head.x; u.z = head.z; u.place = 'world'; u.anim = 'idle'; }
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
  const placeName = id => id === 'capital' ? 'the capital' : town(id)?.name || id;
  // is e standing at station `id` (a town's station on the island, or the capital: either side of the gate)?
  function atStation(e, owner, id) {
    if (id === 'capital') {
      const g = runtime?.gate; if (!g) return false;
      const st = g.station || g.city;   // the city railway station (Tim 2026-11-07), else the gate
      return (e.place === 'street' && Math.hypot(e.x - st[0], e.z - st[1]) <= (RIDE().gateReach ?? 6))
        || (e.place === 'world' && Math.hypot(e.x - g.island[0], e.z - g.island[1]) <= (RIDE().reach ?? 18) + 6);
    }
    const p = endpoint(owner, id);
    return !!p && e.place === 'world' && Math.hypot(e.x - p.x, e.z - p.z) <= (RIDE().reach ?? 18);
  }
  // trains standing at a station the hero is at, with where each goes next
  function boardable(e) {
    if (!e || e.type !== 'hero') return [];
    return Object.values(rec().trains).filter(t => t.owner === e.owner).map(t => {
      const at = stationOf(t), l = rec().links[t.link];
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
      return [{ train: t.id, at, to, toName: placeName(to), eta: Math.ceil(ticks / 20), leaves: ticks === 0 ? Math.ceil(Math.max(0, t.wait) / 20) : null, riders: ridersOf(t.id).length, seats: seats(t) }];
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
    const t = rec().trains[trainId], at = t && stationOf(t);
    if (t?.call?.hero === e.id) return allAboard(t);   // Space again: on at once (anywhere in the zone)
    if (!t || t.owner !== e.owner || !at || !atStation(e, e.owner, at)) return say(e.owner, 'No train standing here');
    if (t.call) return say(e.owner, 'Boarding is already called');
    // the call never holds the train (Tim 2026-11-08): with less than callSeconds before it leaves, that is all you get
    const ticks = Math.max(1, Math.min(Math.round((RIDE().callSeconds ?? 10) * 20), t.wait - 1));
    // the zone lies on the ground round the station (Tim 2026-11-08): a town's shed, the city railway station, or the
    // line's end outside the island gate
    const g = runtime?.gate, p = at === 'capital' ? (e.place === 'street' ? (g?.station && { x: g.station[0], z: g.station[1] }) : g?.island && { x: g.island[0], z: g.island[1] }) : endpoint(e.owner, at);
    t.call = { hero: e.id, x: p?.x ?? e.x, z: p?.z ?? e.z, place: e.place, r: RIDE().zoneRadius ?? 25, until: (state.tick ?? 0) + ticks, ticks };
    return say(e.owner, 'All aboard! Get your crew into the zone (Space boards now)');
  }
  // who is in the boarding zone: the hero and every unit of his on foot or on horseback (not horses, vehicles, workers)
  function inZone(t) {
    const c = t.call, e = c && state.entities[c.hero];
    if (!e) return [];
    // crew sitting in a rickshaw or omnibus count where the vehicle stands (they climb out; it stays, empty)
    const at = u => { const v = vehicleOf(u); return v || u; };
    // in the capital only the boss's own party boards: Hero group (or Rally) crew and settlers, never sector crew or
    // HQ reserves walking past the station (Tim 2026-11-08: sector crew rode out to the island and could not be ordered)
    const party = u => u.place !== 'street' || !u.deployment || (!u.deployment.transfer && crewCommandGroup(state, u) !== null && ['hero', 'rally'].includes(crewCommandGroup(state, u)));
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
    const at = stationOf(t);
    if (!at) return say(e.owner, 'The train left without you');
    if (e.place !== c.place || Math.hypot(e.x - c.x, e.z - c.z) > c.r) { t.wait = Math.min(t.wait, 20); return say(e.owner, 'Boarding called off: you left the zone'); }
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
    return say(e.owner, `All aboard for ${placeName(at === rec().links[t.link].from ? rec().links[t.link].to : rec().links[t.link].from)}${left ? ` (${left} could not fit and stayed)` : ''}`);
  }
  // Skip: after a few seconds aboard, the train is at the far station at once
  function skip(e) {
    const t = e.railRide && rec().trains[e.railRide.train];
    if (!t || e.aboard !== `rail:${t.id}`) return say(e.owner, 'Not on a train');
    if ((state.tick ?? 0) - e.railRide.since < (RIDE().skipSeconds ?? 5) * 20) return say(e.owner, 'Skip in a moment');
    if (t.wait > 0 && stationOf(t)) t.wait = 0;   // still at the platform: off it goes
    const l = rec().links[t.link];
    t.d = t.dir > 0 ? l.length : 0;
    arrive(t);
    return true;
  }
  // the train has reached a station: stand there, turn round, let everyone off
  function arrive(t) {
    const l = rec().links[t.link], at = t.d >= l.length ? l.to : l.from;
    t.dir = at === l.to ? -1 : 1; t.wait = Math.round((T().stopSeconds ?? 20) * 20);
    t.arrived = { at, tick: state.tick ?? 0 };
    arriveHook?.(t, l, at);   // shipments: unload and load cargo
    const riders = ridersOf(t.id);
    if (!riders.length) return;
    const hero = riders.find(u => u.type === 'hero') || riders[0];
    let place = 'world', px, pz;
    if (at === 'capital') { place = 'street'; [px, pz] = runtime?.gate?.station || runtime?.gate?.inside || runtime?.gate?.city || [hero.x, hero.z]; }
    else { const p = endpoint(t.owner, at) || pointAt(l, t.d); px = p.x + 6; pz = p.z + 6; }
    const grid = runtime?.navOf?.(place);
    riders.forEach((u, k) => {
      const [ox, oz] = k ? (runtime?.followOffset?.(k % 36) || [k, 0]) : [0, 0];
      const [x, z] = grid?.nearestFree?.(px + ox * 0.8, pz + oz * 0.8) || [px + ox * 0.8, pz + oz * 0.8];
      delete u.aboard; delete u.railRide;
      Object.assign(u, { x, z, place, anim: 'idle' }); runtime?.forget?.(u.id);
      if (u !== hero) { u.order = { kind: 'follow', target: hero.id }; u.order.slot = runtime?.freeSlot?.(hero.id, u.id); }
    });
    if (place === 'world') runtime?.areas?.update?.(Object.values(state.entities));
    say(hero.owner, `Arrived at ${placeName(at)}`);
  }

  // which station a standing train is at (null while it runs)
  const stationOf = t => { const l = rec().links[t.link]; return !l || t.wait <= 0 ? null : (t.d <= 0 ? l.from : t.d >= l.length ? l.to : null); };

  function dropGang(l) {
    for (const id of l.gang || []) if (state.entities?.[id]) runtime?.remove(id);
    l.gang = [];
  }

  // the gang at the railhead: spawn near someone on the island, hammer a few seconds, catch up, repeat
  function tick() {
    runTrains();
    if (!runtime?.spawn) return;
    const enabled = modeRules(state).island, g = GANG(), size = g.size ?? 3;
    const anchors = enabled ? Object.values(state.entities).filter(e => e.place === 'world' && !e.worker && !e.railGang && e.type !== 'civilian' && e.owner && !e.dead && !e.downed) : [];
    for (const l of Object.values(rec().links)) {
      if (l.done) continue;
      const head = pointAt(l, l.built), near = anchors.some(e => Math.hypot(e.x - head.x, e.z - head.z) <= (g.spawnRadius ?? 160));
      l.gang = (l.gang || []).filter(id => { const e = state.entities?.[id]; return e && !e.dead; });
      if (!near) { dropGang(l); continue; }
      const ahead = [Math.sin(head.heading), Math.cos(head.heading)];   // heading = atan2(dx, dz)
      for (let k = l.gang.length; k < size; k++) {
        const spot = gangSpot(l, k, l.built);
        l.gang.push(runtime.spawn('civilian', g.model || 'laborer', spot.x, spot.z, { place: 'world', area: 'world', railGang: l.id, seenBy: l.owner, town: l.payer, holdFire: true, hp: 120, maxHp: 120, anim: 'idle' }));
      }
      const cycle = Math.round(((g.hammerSeconds ?? 3) + 2) * 20);
      l.gang.forEach((id, k) => {
        const e = state.entities[id]; if (!e) return;
        const t = ((state.tick ?? 0) + k * 13) % cycle, working = t < (g.hammerSeconds ?? 3) * 20;
        // while hammering they keep their spot; then they run up to their place beside the new railhead
        if (!working || e.railSpot == null) e.railSpot = l.built;
        const spot = gangSpot(l, k, e.railSpot), dx = spot.x - e.x, dz = spot.z - e.z, d = Math.hypot(dx, dz);
        // they keep up without racing ahead of a hero on foot (Tim 2026-11-07): gang.speed (below the hero's run),
        // but at least 1.3 times the railhead's own pace counting the time they stand hammering (they only walk
        // between swings, Tim 2026-11-07: the track ran ahead of them); a long gap (spawning in) closes at once
        const hammer = Math.round((g.hammerSeconds ?? 3) * 20), walkShare = Math.max(0.2, (cycle - hammer) / cycle);
        const v = Math.max(g.speed ?? 4.5, 1.3 * l.length / Math.max(1, L().seconds ?? 600) / walkShare) / 20;
        if (d > 40) { e.x = spot.x; e.z = spot.z; }
        else if (d > 0.05) { const m = Math.min(1, v / d); e.x += dx * m; e.z += dz * m; e.dir = dirIndex(dx, dz); }
        e.anim = d > 0.3 ? (g.anim?.move || 'run') : (g.anim?.work || 'bow');
        if (d <= 0.3) e.dir = dirIndex(...ahead);
      });
    }
  }
  // gang member k's place: just behind the railhead, alternating sides of the track
  function gangSpot(l, k, d) {
    const behind = pointAt(l, Math.max(0, d - 1.5 - k * 1.2)), head = behind, side = (k % 2 ? 1 : -1) * (1.6 + (k >> 1) * 0.6);
    const nx = Math.cos(head.heading), nz = -Math.sin(head.heading);
    return { x: behind.x + nx * side, z: behind.z + nz * side };
  }

  function attach(services) { runtime = services; }
  const setShipping = (arrive, depart) => { arriveHook = arrive; departHook = depart; };
  return { command, tick, econTick, attach, endpoint, preview, linksOf, linesAt, tearUp, addTrain, stationOf, boardable, service, serviceAt, atStation, inZone, setShipping, trains: () => Object.values(rec().trains) };
}
