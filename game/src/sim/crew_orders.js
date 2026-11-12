// Crew orders: follow slots, giving orders, walking out of buildings and moving.
// Moved out of sim/game.js (phase 7 split, 2026-10-29); game.js passes in what it shares.
import { allowCharmAttack } from './charm_rules.js';
import { dirIndex, blockOffset } from './geometry.js';
import { stunned } from './kuroda.js';
import { DT } from './game.js';
export function createCrewOrders({ roomOf, clans, contracts, crewJobs, deployment, doors, endAttack, fair, fight, manualCrew, nav, navOf, paths, rally, resumable, rooms, rules = null, sees, state, stats, tryMove }) {
  // Places around a hero for followers: rings of 6, 12 and 18 (enough for 36 crew)
  function followOffset(k) {
    for (const [r, n] of [[1.5, 6], [2.7, 12], [3.9, 18]]) {
      if (k < n) { const a = k / n * 2 * Math.PI + (r > 2 ? Math.PI / n : 0); return [Math.cos(a) * r, Math.sin(a) * r]; }
      k -= n;
    }
    return [0, 0];
  }
  // The lowest ring place nobody following this hero uses yet
  function freeSlot(heroId, self) {
    const used = new Set(Object.values(state.entities)
      .filter(u => u.id !== self && u.order?.kind === 'follow' && u.order.target === heroId).map(u => u.order.slot));
    let k = 0;
    while (used.has(k)) k++;
    return k;
  }
  // ---- group moves on the island (war collision checkpoint 5b-3, Tim 2026-11-11) ----
  // One move order for a group works out one route; every unit walks it in its own lane (a small sideways offset)
  // and ends in a loose scattered spread round the clicked spot: no rows. Numbers: units.json rules.groupMove.
  const GM = () => ({ spacing: 2, mountedSpacing: 3.2, jitter: 0.3, lane: 1.2, joinPoints: 3, legReach: 8, legTicks: 100, ...(rules?.groupMove || {}) });
  // a steady number from 0 to 1 out of a unit's id (the same in every replay and for every player)
  function idShare(id, salt = 0) {
    let h = 2166136261 ^ salt;
    for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  // place k of n in the spread: a sunflower spiral (even, no rows) that grows with the group, shaken by the unit's id
  function spreadOffset(k, n, id, spacing) {
    const G = GM(), R = spacing * 0.7 * Math.sqrt(n), r = n > 1 ? R * Math.sqrt((k + 0.5) / n) : 0, a = k * 2.399963;
    const j = spacing * G.jitter, ja = idShare(id, 1) * 2 * Math.PI, jr = idShare(id, 2) * j;
    return [Math.cos(a) * r + Math.cos(ja) * jr, Math.sin(a) * r + Math.sin(ja) * jr];
  }
  // a unit's own copy of a shared route: joined at the furthest of its first points the unit can walk straight to,
  // each detailed waypoint moved sideways into the unit's lane where that ground is free. null: the unit cannot
  // join it (something is in the way), so it finds its own path as before.
  function laneCopy(u, grid, route, goal, wide) {
    if (!route?.length || !grid?.clearLine) return null;
    const G = GM();
    let j = -1;
    for (let i = Math.min(G.joinPoints, route.length) - 1; i >= 0 && j < 0; i--) if (grid.clearLine(u.x, u.z, route[i][0], route[i][1])) j = i;
    if (j < 0) return null;
    const lane = (idShare(u.id, 3) * 2 - 1) * G.lane * wide, rough = route.replanAt || 0, pts = [];
    let prev = [u.x, u.z];
    for (let i = j; i < route.length; i++) {
      let pt = route[i];
      const last = i === route.length - 1;
      if (last && !rough) pt = goal;
      else if (i < route.length - rough && !last) {
        const a = route[Math.max(0, i - 1)], b = route[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        if (len > 1e-6) {
          const q = [pt[0] - dz / len * lane, pt[1] + dx / len * lane];
          if ((!grid.free || grid.free(q[0], q[1])) && grid.clearLine(prev[0], prev[1], q[0], q[1]) && grid.clearLine(q[0], q[1], b[0], b[1])) pt = q;
        }
      }
      pts.push(pt); prev = pt;
    }
    if (rough) pts.replanAt = rough;
    return pts;
  }
  // long trips are walked a part at a time (replanAt): the first of a group to need the next part searches, the
  // others near that spot take a lane copy of it
  const groupLegs = new Map();
  function groupLeg(e, grid, gx, gz) {
    const id = e.order?.group;
    if (!id || !grid?.findPath) return null;
    const G = GM(), wide = e.mounted ? 1.8 : 1;
    let legs = groupLegs.get(id);
    if (legs) for (const leg of legs) {
      if (state.tick - leg.tick > G.legTicks || Math.hypot(leg.from[0] - e.x, leg.from[1] - e.z) > G.legReach) continue;
      const pts = laneCopy(e, grid, leg.pts, [gx, gz], wide);
      if (pts) return pts;
    }
    const pts = grid.findPath(e.x, e.z, gx, gz) || [];
    if (pts.length) {
      if (!legs) { groupLegs.set(id, legs = []); if (groupLegs.size > 64) groupLegs.delete(groupLegs.keys().next().value); }
      legs.push({ tick: state.tick, from: [e.x, e.z], pts }); if (legs.length > 8) legs.shift();
    }
    return pts;
  }

  // order command from a hero for some of its own crew in the same place (street or room):
  // follow (the hero), move (go there and wait) or station (go there and hold it; defends later)
  function giveOrder(hero, c) {
    if (hero.type !== 'hero' || !Array.isArray(c.units) || !['follow', 'move', 'station', 'attack', 'attackmove', 'heal', 'stop', 'enter', 'resume'].includes(c.kind)) return;
    // enter (right-click your own business, checkpoint 5): walk to its door, go in and hold the room
    // or right-click the business of an active Shinobi infiltration job: use its back window
    const eb = c.kind === 'enter' && state.businesses[c.business];
    const door = eb && (eb.owner === hero.owner ? doors.find(d => d.to && d.place === eb.room)
      : contracts?.mayClimb(hero, eb.room) && doors.find(d => d.to && d.ninja && d.place === eb.room));
    if (c.kind === 'enter' && !door) return;
    if (c.kind === 'attack' && !(fair(hero, state.entities[c.target]) && sees(hero, state.entities[c.target]))
      && !(c.place === state.entities[c.target]?.place && c.units.some(id => {
        const u = state.entities[id]; return u && u.owner === hero.owner && fair(u, state.entities[c.target]) && sees(u, state.entities[c.target]);
      }))) return;
    if (!['follow', 'attack', 'heal', 'stop', 'enter', 'resume'].includes(c.kind) && !(Number.isFinite(c.x) && Number.isFinite(c.z))) return;
    const crew = c.units.map(id => state.entities[id])
      .filter(u => u && !u.dead && !u.downed && !u.jailed && u.owner === hero.owner && u.type !== 'hero' && !u.guard && (!c.broadcast || u.place === 'street')
        // a lieutenant's order (sim/lieutenant.js gates it; the boss is out on the island) reaches crew left in the city
        && (u.place === hero.place || (c.by === 'lieutenant' && c.kind !== 'follow' && u.place !== 'world' && (!c.place || c.place === u.place || c.kind === 'move')) || (c.kind === 'follow' && u.place === 'street') || (hero.place === 'street' && ['move', 'stop', 'resume'].includes(c.kind))
          || (c.place === 'street' && (u.place === 'street' || (c.kind === 'move' && u.place !== 'street')))
          || (c.kind==='attack'&&c.place===u.place&&state.entities[c.target]?.place===u.place)
          || ((hero.dead || hero.downed || hero.jailed) && c.kind === 'attack' && state.entities[c.target]?.place === u.place))
        && !(u.place !== 'street' && ['heal', 'enter'].includes(c.kind))
        && (c.kind === 'follow' || !c.place || u.place === c.place || (c.place === 'street' && c.kind === 'move' && u.place !== 'street'))
        && deployment.allowsOrder(u, c, hero, door));
    if(state.deployment.restrictionsEnabled){
      // settlers (and other escorts) carry no deployment record: they travel with the hero group
      const group=u=>{const g=u.deployment?.group ?? 'hero';return rally.status(hero.owner).active&&(g==='hero'||rally.participating(u))?'rally':g;};
      if(new Set(crew.map(group)).size>1)return;
    }
    const recalling = c.kind === 'move' || c.kind === 'follow';
    if (recalling && Array.isArray(hero.assistCrew)) hero.assistCrew = hero.assistCrew.filter(id => !crew.some(u => u.id === id));
    // a group move on the island: one route for all, a loose spread at the end (5b-3)
    const grouped = ['move', 'station', 'attackmove'].includes(c.kind) && (c.place || hero.place) === 'world' && crew.length > 1 && navOf('world');
    let shared = null;
    const taken = [], groupId = grouped ? `${hero.id}:${state.tick}` : null;
    if (grouped) {
      const cx = crew.reduce((n, u) => n + u.x, 0) / crew.length, cz = crew.reduce((n, u) => n + u.z, 0) / crew.length;
      const lead = crew.filter(u => u.place === 'world').sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz) || (a.id < b.id ? -1 : 1))[0];
      const pts = lead && grouped.findPath(lead.x, lead.z, c.x, c.z);
      if (pts?.length) { shared = pts; groupLegs.set(groupId, [{ tick: state.tick, from: [lead.x, lead.z], pts }]); if (groupLegs.size > 64) groupLegs.delete(groupLegs.keys().next().value); }
    }
    crew.forEach((u, k) => {
      if(crewJobs?.intercept(u,c))return;
      manualCrew(u);
      if(c.kind==='attack')allowCharmAttack(u,state.entities[c.target],state);
      delete u.lootEscort;
      delete paths[u.id];
      delete u.patrol;
      if (u.indoorDuty) u.indoorDuty.resume = false;
      delete u.execute;
      const attacking = c.kind === 'attack' || c.kind === 'attackmove';
      if (!u.smokePassive || attacking) delete u.holdFire;
      if (attacking) delete u.smokePassive;
      if (fight[u.id]) delete fight[u.id].target;
      // stop (Z, Tim 2026-10-18): stand still and stay passive, no auto attack even when hit,
      // until the next order of any kind replaces this one
      // resume (a second T, Tim 2026-10-19): call off the T attack, back to the order before it
      if (c.kind === 'resume') { if (u.order?.kind === 'attack') { delete u.swing; endAttack(u, true); } return; }
      if (c.kind === 'stop') { delete u.swing; u.order = { kind: 'stop' }; u.anim = 'idle'; return; }
      if (recalling) delete u.swing;
      if (c.kind === 'follow') { u.order = { kind: 'follow', target: hero.id, regrouping: true, ...(hero.place !== 'street' ? { exitWithHero: true } : {}) }; u.order.slot = freeSlot(hero.id, u.id); return; }
      // resume (T, Tim 2026-10-19): when the attack ends they go back to what they were doing
      if (c.kind === 'attack') {
        if (u.swing?.target !== c.target) delete u.swing;
        const follow = c.followOnDefeat === true || c.assist || (Array.isArray(c.followOnDefeat) && c.followOnDefeat.includes(u.id));
        const t=state.entities[c.target];
        u.order = { kind: 'attack', target: c.target, lastSeen:{x:t.x,z:t.z,place:t.place}, ...(follow ? { followLeader: hero.id } : {}), ...(c.resume ? { prev: resumable(u) } : {}), ...(c.broadcast ? { broadcast: true } : {}) }; return;
      }
      if (c.kind === 'heal') {
        const b = clans?.clinicOf();
        if (!b || u.hp >= u.maxHp) return;
        const [x, z] = nav.nearestFree(...(b.door || [b.x, b.z])) || [b.x, b.z];
        u.order = { kind: 'heal', x, z };
        return;
      }
      if (c.kind === 'enter') {
        if (u.place !== 'street') return;
        const [x, z] = nav.nearestFree(door.x, door.z) || [door.x, door.z];
        u.order = { kind: 'enter', room: door.place, x, z, k, n: crew.length, ...(door.ninja ? { window: true } : {}) };
        return;
      }
      // riders need a horse length each (Tim 2026-11-10: a mounted group clustered on one spot and ran in place)
      const place = c.place || hero.place;
      if (grouped) {
        const G = GM(), riders = crew.some(m => m.mounted), spacing = riders ? G.mountedSpacing : G.spacing;
        // the unit's place in the spread; a place another unit already took (two snapped onto one free cell) moves on round the spiral
        let x = c.x, z = c.z;
        for (let t = 0; t < 12; t++) {
          const [ox, oz] = spreadOffset(k + t * crew.length, crew.length * (t + 1), u.id, spacing);
          [x, z] = grouped.nearestFree(c.x + ox, c.z + oz) || [c.x, c.z];
          if (!taken.some(p => Math.hypot(p[0] - x, p[1] - z) < spacing * 0.75)) break;
        }
        taken.push([x, z]);
        u.order = { kind: c.kind, x, z, place, group: groupId };
        const pts = u.place === 'world' && laneCopy(u, grouped, shared, [x, z], u.mounted ? 1.8 : 1);
        if (pts) paths[u.id] = pts.replanAt ? { pts, gx: x, gz: z, replanAt: pts.replanAt, at: state.tick } : { pts, gx: x, gz: z, at: state.tick };
        return;
      }
      const [ox, oz] = blockOffset(k, crew.length, crew.some(m => m.mounted) ? 2.8 : 1.1);
      const grid = (place === 'street' ? deployment.navFor({ ...u, place }) : null) || navOf(place);
      const [x, z] = grid?.nearestFree(c.x + ox, c.z + oz) || [c.x, c.z];
      u.order = { kind: c.kind, x, z, place };
    });
  }

  // Crew inside a building whose order is out on the street (Tim 2026-10-19): walk to the room's
  // way out and step out of the front door, then carry on with the order. True while doing that
  function crewOut(e, unit) {
    if (e.place === 'street') return false;
    const o = e.order || {};
    if (o.kind !== 'move' || o.place !== 'street') return false;
    const room = rooms.find(r => r.name === e.place);
    const d = room && doors.find(d => d.place === 'street' && d.to && d.x === room.exit.x && d.z === room.exit.z);
    if (!d) return false;
    if (Math.hypot(d.x - e.x, d.z - e.z) > 0.6) { if (!moveTo(e, unit, d.x, d.z, false)) e.anim = 'idle'; return true; }
    const [x, z] = nav.nearestFree(d.to.x, d.to.z) || [d.to.x, d.to.z];
    state.news.push({ kind: 'crewOut', clan: e.owner, building: Number(Object.keys(roomOf).find(k => roomOf[k] === e.place)) });   // the screen flashes the building
    Object.assign(e, { x, z, place: 'street', anim: 'idle' });
    delete paths[e.id]; delete e.swing;
    if (fight[e.id]) delete fight[e.id].target;
    return true;
  }

  // Where a crew member wants to be right now, or null to stand still
  function crewGoal(e) {
    const o = e.order;
    if (!o || o.kind === 'stop') return null;
    // a ninja's pebble (Distract): house guards go and look where it fell
    const dz = e.distracted;
    if (dz && state.tick < dz.until) return { x: dz.x, z: dz.z, near: 0.8, walk: true };
    if (o.kind === 'follow') {
      const h = state.entities[o.target];
      if (!h || h.place !== e.place || h.dead) return null;   // hero indoors or knocked out: wait
      // on horseback (him or them) the ring is wider: a horse is longer than a man (Tim 2026-11-07)
      const wide = e.mounted || h.mounted ? 1.8 : 1, [ox, oz] = followOffset(o.slot).map(v => v * wide);
      // a hero on the move: keep pace with the slot instead of stopping on arrival and catching up the next tick
      // (Tim 2026-11-08: crew on horses stuttered, moving every other tick)
      const going = h.anim && h.anim !== 'idle';
      // standing, a follower that gets no closer to its place for half a second (shoved by the spacing push, or the
      // place is blocked) stops where it is until the hero moves on (Tim 2026-11-08: loaded horses ran on the spot)
      const gx = h.x + ox, gz = h.z + oz, d = Math.hypot(gx - e.x, gz - e.z);
      if (going) delete o.hold;
      else if (!o.hold || d < o.hold.d - 0.1 || Math.hypot(gx - o.hold.gx, gz - o.hold.gz) > 0.5) o.hold = { d, gx, gz, tick: state.tick };   // a new spot (he jumped, got out) starts the wait again
      else if (state.tick - o.hold.tick > 10 && d < 3 * wide) return { x: gx, z: gz, near: Infinity };
      return { x: gx, z: gz, near: going ? 0.05 : Math.hypot(e.x - h.x, e.z - h.z) < 2.2 + o.slot * 0.08 ? 0.6 : 0.3, walk: h.anim === 'walk' };
    }
    if (o.kind === 'attack') return null;
    return { x: o.x, z: o.z, near: 0.25, walk: !!o.patrol, stroll: !!o.patrol };   // patrol (house guards): walk the whole way
  }

  // Walk one tick toward (gx, gz) along a street path; false when there is no way
  function moveTo(e, unit, gx, gz, walk) {
    if (stunned(e, state.tick)) { e.anim = 'idle'; return true; }
    const grid = deployment.navFor(e) || navOf(e.place);
    if (!grid) paths[e.id] = { pts: [[gx, gz]], gx, gz };   // a place with no walk grid: walk straight
    let p = paths[e.id];
    // replanAt (island paths, sim/areas.js): only the first part of a long trip is walked in detail;
    // when just the rough waypoints are left, ask again from here
    // perf 2026-11-07: a goal that moved (a walking hero) keeps the path when its last leg still
    // sees the new goal, or when it moved little next to how far away it is; otherwise a fresh
    // search at most every 5 ticks per unit (20 on a long trip)
    let hold = false;
    const moved = p ? Math.hypot(p.gx - gx, p.gz - gz) : 0;
    if (p && p.pts.length && moved > 1.2) {
      const from = p.pts.length > 1 ? p.pts[p.pts.length - 2] : [e.x, e.z];
      if (!p.replanAt && grid?.clearLine?.(from[0], from[1], gx, gz)) { p.pts[p.pts.length - 1] = [gx, gz]; p.gx = gx; p.gz = gz; }
      else if (moved <= 0.1 * Math.hypot(gx - e.x, gz - e.z) || state.tick < (p.at ?? -Infinity) + (p.replanAt ? 20 : 5)) {
        if (!p.replanAt) p.pts[p.pts.length - 1] = [gx, gz];
        hold = true;
      }
    }
    // lag fix (Tim 2026-11-10): a search that found no way is not run again every tick (a failed search is the dearest
    // kind: it walks the whole reachable grid). The same goal is tried again once a second.
    if (p?.failed && Math.hypot(p.gx - gx, p.gz - gz) <= 1.2 && state.tick < p.at + 20) return false;
    if (!p || (!hold && Math.hypot(p.gx - gx, p.gz - gz) > 1.2) || !p.pts.length || (p.replanAt && p.pts.length <= p.replanAt)) {
      const pts = groupLeg(e, grid, gx, gz) || grid.findPath(e.x, e.z, gx, gz) || [];
      p = paths[e.id] = pts.replanAt ? { pts, gx, gz, replanAt: pts.replanAt, at: state.tick } : { pts, gx, gz, at: state.tick };
      if (!p.pts.length) { p.failed = true; return false; }
    }
    // the last leg goes straight at the live goal (keeps up with a moving hero or enemy)
    let [wx, wz] = p.pts.length === 1 ? [gx, gz] : p.pts[0];
    // a waypoint counts as reached when close and the next one is in clear view (else cutting
    // the corner snags a wide body on the furniture), or when right on it
    const near = Math.hypot(wx - e.x, wz - e.z);
    if (p.pts.length > 1 && (near < 0.05 || (near < 0.35 && grid?.clearLine(e.x, e.z, ...p.pts[1])))) { p.pts.shift(); [wx, wz] = p.pts.length === 1 ? [gx, gz] : p.pts[0]; }
    const dx = wx - e.x, dz = wz - e.z, len = Math.hypot(dx, dz);
    if (len < 1e-6) return true;
    e.anim = walk ? 'walk' : 'run';
    const want = dirIndex(dx, dz), turn = (want - e.dir + 8) % 8;
    const patrolling = walk && (e.perceptionPatrol || e.order?.patrol || e.distracted || (e.guard && e.order?.kind === 'station')) && !fight[e.id]?.target;
    if (patrolling && turn) {
      if (state.tick >= (e.patrolTurnAt ?? 0)) { e.dir = (e.dir + (turn <= 4 ? 1 : 7)) % 8; e.patrolTurnAt = state.tick + 2; }
      if (e.dir !== want) { e.anim = 'idle'; return true; }
    } else e.dir = want;
    // crew know their own streets: crewSpeed times as fast in their clan's territory (sim/territory.js)
    const d = Math.min(stats.movement(e, e.anim) * DT, len) / len;
    tryMove(e, unit.radius, dx * d, 0);
    tryMove(e, unit.radius, 0, dz * d);
    return true;
  }
  return { blockOffset, crewGoal, crewOut, followOffset, freeSlot, giveOrder, moveTo };
}
