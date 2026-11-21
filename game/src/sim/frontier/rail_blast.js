// Train robbery R1 (Tim 2026-11-20; plan in project files war_build/train_robbery/plan.md): blasting a line.
// Any clan's hero lays a charge on any open line, war or not ({ type: 'frontier', action: 'rail', mode: 'blast' },
// standing on the track). After robbery.fuseSeconds it blows a gap there: the line is closed for robbery.closeDays
// (half a day) while a repair crew hammers at the gap, and the line can't be blasted (or robbed) again until
// robbery.cooldownDays after the blast. The repair crew can't be attacked by anyone (e.untouchable).
// A train running into the gap stops robbery.stopGap short of it and stands robbery.stopSeconds (3 minutes; R2: its
// guards are out), then backs up to the last station it passed and is held there like on any closed line.
// State on the link: l.charge = { d, by, at } while the fuse burns; l.blast = { d, by, at, until, safeUntil, crew }
// (until: the line opens again; safeUntil: end of the cooldown). On a train: t.stopped = { at, until, d } at the gap,
// t.backing while it backs off.
export function createRailBlast({ state, data, rec, pointAt, say, placeName, dayTicks = 12000, runtime = () => null, hooks = {} }) {
  const B = () => data.railways?.robbery || {};
  const now = () => state.tick ?? 0;
  const lineName = l => `${placeName(l.from)} to ${placeName(l.to)}`;

  // the nearest point of a line to (x, z): distance along it and distance off it
  function nearestOn(l, x, z) {
    const p = l.points, dist = l.dist;
    let best = { d: 0, off: Infinity };
    for (let i = 1; i < p.length; i++) {
      const [ax, az] = p[i - 1], [bx, bz] = p[i], dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const off = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (off < best.off) best = { d: dist[i - 1] + (dist[i] - dist[i - 1]) * t, off };
    }
    return best;
  }
  const active = l => !!l.blast && now() < l.blast.until;
  const safe = l => !!l.blast && now() < l.blast.safeUntil;

  // where e could set a charge now: { l, n }, or why not (a string)
  function layCheck(e) {
    if (e.type !== 'hero' || e.place !== 'world' || e.aboard || e.mounted || e.dead || e.downed) return 'Only your hero can set a charge, on foot on the island';
    const reach = B().reach ?? 6;
    let pick = null;
    for (const l of Object.values(rec().links)) {
      if (!l.done || !l.points?.length) continue;
      const n = nearestOn(l, e.x, e.z);
      if (n.off <= reach && (!pick || n.off < pick.n.off)) pick = { l, n };
    }
    if (!pick) return 'Stand on a railway line to set a charge';
    const { l, n } = pick, end = (B().stopGap ?? 12) * 2;
    if (n.d < end || n.d > l.length - end) return 'Too close to the station';
    if (l.charge) return 'A charge is already set on this line';
    if (safe(l)) return 'This line was blown up recently';
    return pick;
  }
  function lay(e) {
    const p = layCheck(e);
    if (typeof p === 'string') return say(e.owner, p);
    const { l, n } = p;
    l.charge = { d: Math.round(n.d * 10) / 10, by: e.owner, at: now(), fuse: B().fuseSeconds ?? 8 };
    return say(e.owner, `Charge set. Get clear!`);
  }

  function blow(l) {
    const c = l.charge, day = dayTicks;
    delete l.charge;
    l.blast = { d: c.d, by: c.by, at: now(), until: now() + Math.round((B().closeDays ?? 0.5) * day), safeUntil: now() + Math.round((B().cooldownDays ?? 2.5) * day), crew: [] };
    const p = pointAt(l, c.d);
    (state.casts ||= []).push({ kind: 'railBlast', x: p.x, z: p.z, heading: p.heading, place: 'world', link: l.id, by: c.by });
    if (l.owner !== c.by) say(l.owner, `Your line ${lineName(l)} was blown up. Repairs take half a day.`);
    say(c.by, l.owner === c.by ? `You blew up your own line ${lineName(l)}` : `Line blown: ${lineName(l)}`);
  }

  // R1 repair crew: real units only near someone on the island (like the rail gang), hammering at the gap
  function crew(l) {
    const rt = runtime(), b = l.blast, C = B().crew || {}, size = C.size ?? 3;
    b.crew = (b.crew || []).filter(id => state.entities?.[id] && !state.entities[id].dead);
    if (!rt?.spawn) return;
    // Tim 2026-11-20: the crew comes once the stopped train has backed away (and not in the first crew.delaySeconds), so
    // they are not standing in the robbery; the repair time itself runs from the blast
    if (now() - b.at < (C.delaySeconds ?? 60) * 20 || Object.values(rec().trains || {}).some(t => t.link === l.id && t.stopped)) { drop(l); return; }
    const p = pointAt(l, b.d), r = C.spawnRadius ?? 300;
    const near = Object.values(state.entities || {}).some(e => e.place === 'world' && e.owner && !e.railGang && !e.railRepair && e.type !== 'civilian' && !e.dead && Math.hypot(e.x - p.x, e.z - p.z) <= r);
    if (!near) { drop(l); return; }
    const nx = Math.cos(p.heading), nz = -Math.sin(p.heading), ax = Math.sin(p.heading), az = Math.cos(p.heading);
    for (let k = b.crew.length; k < size; k++) {
      const side = k % 2 ? 1 : -1, along = (k - (size - 1) / 2) * 1.5;
      const x = p.x + nx * side * 1.6 + ax * along, z = p.z + nz * side * 1.6 + az * along;
      b.crew.push(rt.spawn('civilian', C.model || 'rail_worker', x, z, { place: 'world', area: 'world', railRepair: l.id, untouchable: true, holdFire: true, hp: 120, maxHp: 120, anim: C.anim || 'hammer', dir: 0 }));
    }
    for (const id of b.crew) { const e = state.entities[id]; if (e) e.anim = C.anim || 'hammer'; }
  }
  function drop(l) {
    const rt = runtime();
    for (const id of l.blast?.crew || []) if (state.entities?.[id]) rt?.remove?.(id);
    if (l.blast) l.blast.crew = [];
  }

  // once a tick, before the trains move
  function tick() {
    for (const l of Object.values(rec().links)) {
      if (l.charge && now() - l.charge.at >= (l.charge.fuse ?? B().fuseSeconds ?? 8) * 20) blow(l);
      if (!l.blast) continue;
      if (active(l)) {
        if (!l.closed) { l.closed = true; l.cutBy = 'blast'; }
        crew(l);
        continue;
      }
      if (l.blast.crew?.length) drop(l);
      if (l.closed && l.cutBy === 'blast') {
        l.closed = false; delete l.cutBy;
        say(l.owner, `Line repaired: ${lineName(l)}`);
      }
      if (!safe(l)) delete l.blast;
    }
  }

  // a train about to move: true while it stands at the gap. Stops it short of a gap it is running into.
  function gate(t, l, v) {
    if (t.d <= 0 || t.d >= l.length) { delete t.backing; hooks.station?.(t); }
    if (t.stopped) {
      if (now() < t.stopped.until) { t.v = 0; return true; }
      delete t.stopped;
      hooks.go?.(t);   // guards back aboard (rail_robbery.js)
      t.dir = -t.dir; t.backing = true;   // back to the last station it passed
      return false;
    }
    if (!active(l) || t.wait > 0 || t.backing) return false;
    const stopAt = l.blast.d - t.dir * (B().stopGap ?? 12);
    if (t.dir * (l.blast.d - t.d) <= 0) return false;   // running away from the gap
    if (t.dir * (stopAt - t.d) > v / 20) return false;   // not there yet
    if (t.dir * (stopAt - t.d) > 0) t.d = stopAt;
    t.stopped = { at: now(), until: now() + Math.round((B().stopSeconds ?? 180) * 20), d: t.d };
    t.v = 0;
    hooks.stop?.(t, l);   // guards out (rail_robbery.js)
    say(l.owner, `A train stopped at the blown track on ${lineName(l)}`);
    return true;
  }
  // Skip can't jump a train over a gap
  const blocks = (t, l) => !!t.stopped || active(l);

  return { lay, layCheck, tick, gate, blocks, nearestOn, active, safe };
}
