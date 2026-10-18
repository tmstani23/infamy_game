// Townsfolk (docs/civilians_plan.md). Each civilian walks the street paths to a spot
// on the map (a "poi" in the district data) that its type likes, stays a while (idles,
// bows at the shrine, or chats with someone already there), then picks the next.
// At night most walk home and go in; a few stay out at night spots. A fight or a
// killing nearby scares them: they freeze, then run away, and are marked as witnesses.
// Plain sim code, no three.js: the server runs the same townsfolk in multiplayer.
import { dirIndex } from './geometry.js';

const TICK_RATE = 20, DT = 1 / TICK_RATE;

// state: the game state; data: civilians.json; pois: the district's spots;
// nav: street paths; spawn / moveTo / stopPath / statsOf come from the game rules
export function createCivilians({ state, data, pois = [], nav, spawn, moveTo, stopPath, statsOf, seed = 777 }) {
  const R = data?.rules || {}, types = data?.types || {};
  const secs = s => Math.round(s / DT);
  // spots snapped to free ground, so every one can be walked to
  const spots = pois.map(p => { const [x, z] = nav.nearestFree(p.x, p.z) || [p.x, p.z]; return { ...p, x, z }; });
  const homes = spots.filter(p => p.home);
  // the buildings a type lives in (civilians.json "homes": poi ids in front of them; default every
  // home): townsfolk only ever go in and come out there, never at the map edge (Tim 2026-10-18)
  const homesOf = kind => { const ids = types[kind]?.homes; const l = ids ? spots.filter(p => ids.includes(p.id)) : homes; return l.length ? l : homes; };
  // one fixed total (every type's count): out + indoors + waiting to come back never goes above it
  const TOTAL = Object.values(types).reduce((n, t) => n + (t.count || 0), 0);
  const mind = {};       // per civilian: { kind, nightOut, home, spot, x, z, until, deadline } (server-side only)
  const away = [];       // civilians indoors for the night: { kind, nightOut, home }
  const lost = [];       // killed or helped home hurt: { kind, nightOut, home, at } (a new one walks out at tick `at`)
  let s = seed >>> 0;
  function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }
  const pick = list => list[Math.floor(rng() * list.length)];
  const range = ([a, b]) => a + rng() * (b - a);

  // A spot this civilian would go to now (never the one it stands at)
  function nextSpot(m) {
    const ok = spots.filter(p => p.id !== m.spot && p.tags.some(t => types[m.kind].likes.includes(t)) && (!state.night || p.night));
    return ok.length ? pick(ok) : null;
  }
  // A place to stand at a spot: a little apart from the spot itself, on free ground
  function standAt(p) {
    const a = rng() * 2 * Math.PI, r = 0.4 + rng() * 0.9;
    return nav.nearestFree(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) || [p.x, p.z];
  }
  function goTo(e, m, p) {
    const [x, z] = standAt(p);
    Object.assign(m, { spot: p.id, x, z, until: null, act: p.act || null });
    // give up on a trip that takes far longer than it should (blocked by a crowd)
    m.deadline = state.tick + secs(Math.hypot(x - e.x, z - e.z) / statsOf('civilian').walk * 2.5 + 8);
    delete e.talk;
  }

  // One civilian of a type from civilians.json; returns its id
  function add(kind, x, z, extra = {}) {
    const t = types[kind];
    const id = spawn('civilian', t.model, x, z, { civ: kind, hp: R.hp ?? 60 });
    mind[id] = { kind, nightOut: extra.nightOut ?? rng() < (t.nightOut || 0), home: extra.home || (homesOf(kind).length ? pick(homesOf(kind)).id : null), spot: extra.spot || null };
    return id;
  }

  // Fill the streets: every type's count, each starting at one of its own homes (so where a
  // type appears depends on its buildings; by day they still walk anywhere they like, Tim 2026-10-18)
  function populate() {
    for (const [kind, t] of Object.entries(types)) {
      for (let i = 0; i < (t.count || 0); i++) {
        const own = homesOf(kind);
        const p = own.length ? pick(own) : spots[0];
        if (!p) return;
        const [x, z] = standAt(p);
        const id = add(kind, x, z, { spot: p.id, home: own.length ? p.id : null });
        mind[id].until = state.tick + secs(range(R.staySeconds || [4, 12]) * rng());
      }
    }
  }

  // --- Fear ------------------------------------------------------------------------
  // Every hit and every execute this tick scares civilians within fearRadius:
  // e.scared (tick it ends) while they freeze, then e.flee { x, z, until } as they run.
  // e.witness = { tick, clan, x, z } stays on them, for heat later.
  function frighten() {
    const sources = [
      ...state.hits.map(h => ({ x: h.x, z: h.z, a: h.a, t: h.t })),
      ...state.casts.filter(c => c.kind === 'execute').map(c => ({ x: c.x, z: c.z, a: c.a })),
    ];
    if (!sources.length) return;
    const radius = R.fearRadius ?? 8;
    for (const e of Object.values(state.entities)) {
      if (e.type !== 'civilian' || e.place !== 'street' || e.downed || e.dead) continue;
      // hit themselves this tick: that counts before anything else nearby
      const own = sources.find(src => src.t === e.id);
      for (const src of own ? [own] : sources) {
        if (Math.hypot(src.x - e.x, src.z - e.z) > radius) continue;
        e.witness = { tick: state.tick, clan: state.entities[src.a]?.owner || null, x: src.x, z: src.z };
        if (src.t === e.id) {                     // hit themselves: no freezing, run from the attacker at once
          const by = state.entities[src.a] || src;
          delete e.scared; delete e.danger; delete e.talk;
          stopPath(e);
          e.flee = fleeFrom(e, { x: by.x, z: by.z });
          break;
        }
        if (e.flee) { e.flee = fleeFrom(e, src); break; }          // already running: keep running away
        if (e.scared) break;
        // reacted lately (Tim: no chains of reactions): no flinch this time, just move off
        if (state.tick - (mind[e.id]?.reactAt ?? -Infinity) < secs(R.reactSeconds ?? 3)) {
          delete e.talk; stopPath(e);
          e.flee = fleeFrom(e, src);
          break;
        }
        if (mind[e.id]) mind[e.id].reactAt = state.tick;
        e.scared = state.tick + secs(R.scaredSeconds ?? 1.2);
        e.danger = [src.x, src.z];
        e.anim = 'scared';
        e.dir = dirIndex(src.x - e.x, src.z - e.z);
        delete e.talk;
        stopPath(e);
        break;
      }
    }
  }
  // A spot about fleeDistance away from the danger, on free ground
  function fleeFrom(e, src) {
    let dx = e.x - src.x, dz = e.z - src.z, len = Math.hypot(dx, dz);
    if (len < 0.1) { const a = rng() * 2 * Math.PI; dx = Math.cos(a); dz = Math.sin(a); len = 1; }
    const d = R.fleeDistance ?? 14;
    const [x, z] = nav.nearestFree(e.x + dx / len * d, e.z + dz / len * d) || [e.x, e.z];
    return { x, z, until: state.tick + secs(R.fleeSeconds ?? 6) };
  }

  // --- One civilian, one tick ------------------------------------------------------
  function step(e) {
    const m = mind[e.id], unit = statsOf('civilian');
    if (!m || e.place !== 'street') return;
    // down (or finished off): lies there; the rules carry them off or clear the body
    if (e.downed || e.dead) {
      const o = state.entities[e.talk];
      if (o?.talk === e.id) { delete o.talk; if (o.anim === 'talk') o.anim = 'idle'; }
      delete e.talk; delete e.scared; delete e.flee;
      return;
    }
    // frozen in fright, then run
    if (e.scared) {
      if (state.tick < e.scared) { e.anim = 'scared'; return; }
      delete e.scared;
      e.flee = fleeFrom(e, { x: e.danger[0], z: e.danger[1] });
      delete e.danger;
    }
    if (e.flee) {
      const f = e.flee;
      // jammed against others or a wall (under 0.4 moved in the last second): stop running
      if (!f.chk || state.tick - f.chk.tick >= TICK_RATE) {
        const stuck = f.chk && Math.hypot(e.x - f.chk.x, e.z - f.chk.z) < 0.4;
        f.chk = { tick: state.tick, x: e.x, z: e.z };
        if (stuck) f.until = state.tick;
      }
      if (state.tick < f.until && Math.hypot(f.x - e.x, f.z - e.z) > 0.5 && moveTo(e, unit, f.x, f.z, false)) return;
      delete e.flee;
      stopPath(e);
      e.anim = 'idle';
      Object.assign(m, { spot: null, until: state.tick + secs(R.calmSeconds ?? 4), x: e.x, z: e.z, act: null });
      return;
    }
    // night: those who don't stay out walk home and go in
    if (state.night && !m.nightOut && m.home) {
      const h = spots.find(p => p.id === m.home);
      if (m.spot !== h.id) { goTo(e, m, h); m.x = h.x; m.z = h.z; }
      if (Math.hypot(h.x - e.x, h.z - e.z) < 0.6 || state.tick > m.deadline) { goIn(e, m); return; }
      if (!moveTo(e, { ...unit, walk: unit.walk * (R.homeSpeed ?? 1) }, h.x, h.z, true)) goIn(e, m);
      return;
    }
    // staying at a spot
    if (m.until !== null && m.until !== undefined) {
      if (e.talk) {
        const o = state.entities[e.talk];
        if (o?.talk === e.id) e.dir = dirIndex(o.x - e.x, o.z - e.z);
        else { delete e.talk; e.anim = 'idle'; }          // the other one left
      }
      else if (e.anim === 'bow' && state.tick - m.arrived >= secs(R.bowSeconds ?? 2)) e.anim = 'idle';
      // a night spot closes at night: move on early
      const here = spots.find(p => p.id === m.spot);
      if (state.tick < m.until && !(state.night && here && !here.night)) return;
      if ((state.tick + Number(e.id)) % TICK_RATE) return;           // rethink about once a second
      const p = nextSpot(m);
      if (!p) { m.until = state.tick + secs(2); return; }
      goTo(e, m, p);
      return;
    }
    // walking to a spot
    if (m.spot === null || m.spot === undefined) { const p = nextSpot(m); if (p) goTo(e, m, p); else return; }
    const d = Math.hypot(m.x - e.x, m.z - e.z);
    if (d < 0.4) arrive(e, m, true);
    else if (state.tick > m.deadline || !moveTo(e, unit, m.x, m.z, true)) arrive(e, m, false);   // blocked: give up there
  }

  // reached = got to the spot itself; a walker that gave up (blocked by a crowd) only stands
  // there, it never starts a chat with whoever it bumped into (that read as a hit reaction)
  function arrive(e, m, reached = true) {
    stopPath(e);
    m.arrived = state.tick;
    m.until = state.tick + secs(range(R.staySeconds || [4, 12]));
    e.anim = m.act === 'bow' ? 'bow' : 'idle';
    if (m.act === 'bow') { const p = spots.find(q => q.id === m.spot); if (p?.face) e.dir = dirIndex(p.face[0] - e.x, p.face[1] - e.z); return; }
    // someone idle here already, nobody to talk to: chat with them (at most once per reactSeconds)
    if (!reached || state.tick - (m.reactAt ?? -Infinity) < secs(R.reactSeconds ?? 3)) return;
    if (rng() >= (R.chatChance ?? 0.6)) return;
    const other = Object.values(state.entities).find(o => o !== e && o.type === 'civilian' && !o.talk && !o.scared && !o.flee
      && mind[o.id]?.until != null && o.anim === 'idle' && Math.hypot(o.x - e.x, o.z - e.z) < (R.chatRadius ?? 2.5));
    if (!other) return;
    const until = Math.max(m.until, mind[other.id].until);
    m.until = mind[other.id].until = until;
    e.talk = other.id; other.talk = e.id;
    m.reactAt = mind[other.id].reactAt = state.tick;
    e.anim = other.anim = 'talk';
    e.dir = dirIndex(other.x - e.x, other.z - e.z);
    other.dir = dirIndex(e.x - other.x, e.z - other.z);
  }

  // Into the house for the night: off the map until morning
  function goIn(e, m) {
    away.push({ kind: m.kind, nightOut: m.nightOut, home: m.home });
    remove(e.id);
  }
  function remove(id) {
    const e = state.entities[id];
    if (e?.talk && state.entities[e.talk]) { delete state.entities[e.talk].talk; if (state.entities[e.talk].anim === 'talk') state.entities[e.talk].anim = 'idle'; }
    stopPath({ id });
    delete state.entities[id];
    delete mind[id];
  }

  // Called once per tick after the units moved (so this tick's hits are known)
  function tick() {
    frighten();
    for (const e of Object.values(state.entities)) if (e.type === 'civilian') step(e);
    // townsfolk killed or helped home hurt stay gone for replaceSeconds (5 min), so an area can be
    // cleared; then a new one of the same kind walks out of the same home
    for (const id of Object.keys(mind)) {
      if (state.entities[id]) continue;
      const m = mind[id];
      lost.push({ kind: m.kind, nightOut: m.nightOut, home: m.home, at: state.tick + secs(R.replaceSeconds ?? 300) });
      delete mind[id];
    }
    const due = lost.findIndex(l => state.tick >= l.at && (!state.night || l.nightOut));
    if (due >= 0) {
      const [l] = lost.splice(due, 1), h = spots.find(p => p.id === l.home) || pick(homesOf(l.kind));
      if (h && count().out < TOTAL) add(l.kind, h.x, h.z, l);
    }
    // morning: those indoors come back out, a few each second
    if (!state.night && away.length && state.tick % secs(1 / (R.returnPerSecond || 1)) === 0) {
      const a = away.shift(), h = spots.find(p => p.id === a.home) || pick(homesOf(a.kind));
      if (h && count().out < TOTAL) add(a.kind, h.x, h.z, a);
    }
  }

  // how many townsfolk there are: out (on the map, bodies too), indoors for the night, and
  // killed or helped home waiting out replaceSeconds; together never more than the total
  function count() {
    const out = Object.keys(mind).length;
    return { out, away: away.length, lost: lost.length, total: TOTAL, all: out + away.length + lost.length };
  }

  return { populate, add, tick, count, spots, away, lost, mind };
}
