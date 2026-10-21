// Night bandits (data/bandits.json). At night bandits and night brutes walk in from the
// edge of the map, a few at a time, and roam between the district's spots like the
// townsfolk. Roamers and camp residents attack clans they spot within sightRange.
// Hitting one also angers nearby bandits. Bodies hold ryo until somebody loots them.
// At dawn the ones left walk back out. Plain sim code, no three.js.
const TICK_RATE = 20, DT = 1 / TICK_RATE;
export const WILD = 'bandits';     // the owner every bandit has (not a clan: nobody hires or runs it)

// state: the game state; data: bandits.json; units: units.json; pois / edges: the district's
// spots and its way-in spots; spawn / moveTo / stopPath / remove / fightStep / statsOf come from the game rules
export function createBandits({ state, data, units, camps = [], pois = [], edges = [], nav, spawn, moveTo, stopPath, remove, fightStep, statsOf, canSee = () => true, seed = 4242 }) {
  const R = data?.rules || {}, types = data?.types || {};
  const secs = s => Math.round(s / DT);
  const snap = ([x, z]) => nav.nearestFree(x, z) || [x, z];
  const spots = pois.map(p => { const [x, z] = snap([p.x, p.z]); return { id: p.id, x, z }; });
  const ways = edges.map(snap);
  const mind = {};       // per bandit: { spot, x, z, until, deadline, leaving } (server-side only)
  const campList = state.banditCamps = camps.map(c => ({ ...c, kind: 'bandit_camp', units: [], initialized: false, clearedAt: null }));
  const campOf = Object.fromEntries(campList.map(c => [c.id, c]));
  // this night: is it night, how many came, when the next one comes
  const night = { on: false, came: 0, next: 0 };
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
  const out = () => Object.values(state.entities).filter(e => e.owner === WILD && !e.camp && !e.dead);

  // Residents do not count against the night-roamer cap. At dawn/dusk, replace
  // missing residents while preserving survivors and unlooted bodies.
  function fillCamp(c) {
    c.units = c.members.map((kind, k) => {
      const previous = state.entities[c.units[k]];
      if (previous && !previous.dead) return previous.id;
      const angle = k * Math.PI * 2 / c.members.length;
      const point = nav.nearestFree(c.x + Math.cos(angle) * 2.2, c.z + Math.sin(angle) * 2.2);
      if (!point || !nav.findPath(c.x, c.z, ...point)) throw new Error(`No resident path for camp ${c.id}`);
      const id = spawn(kind, statsOf(kind).sprite || kind, ...point, { owner: WILD, wild: true, camp: c.id });
      mind[id] = { camp: c.id, spot: null };
      return id;
    });
    c.initialized = true; c.clearedAt = null;
  }
  function campsTick() {
    for (const c of campList) {
      if (!c.initialized) { fillCamp(c); continue; }
      if (state.dawn || state.dusk) { fillCamp(c); continue; }
      if (c.units.some(id => state.entities[id] && !state.entities[id].dead)) continue;
      c.clearedAt ??= state.tick;
    }
  }

  function patrolCamp(e, m, c) {
    if (m.until != null && state.tick < m.until) { e.anim = 'idle'; return; }
    if (!m.spot) {
      const angle = rng() * Math.PI * 2, radius = 1.5 + rng() * 2;
      const point = nav.nearestFree(c.x + Math.cos(angle) * radius, c.z + Math.sin(angle) * radius);
      if (!point) return;
      goTo(e, m, { id: 'camp', x: point[0], z: point[1] });
    }
    if (Math.hypot(m.x - e.x, m.z - e.z) < 0.6 || state.tick > m.deadline || !moveTo(e, statsOf(e), m.x, m.z, true)) {
      stopPath(e); e.anim = 'idle'; m.spot = null;
      m.until = state.tick + secs(range(R.staySeconds || [6, 15]));
    }
  }

  // A random type by weight
  function pickType() {
    const list = Object.entries(types);
    let r = rng() * list.reduce((n, [, t]) => n + (t.weight || 1), 0);
    for (const [k, t] of list) if ((r -= t.weight || 1) < 0) return k;
    return list[0]?.[0];
  }
  // A way in at least minDistance from every hero and crew member (out of sight), or the farthest one
  function wayIn() {
    const watchers = Object.values(state.entities).filter(e => e.owner && e.owner !== WILD && e.type !== 'civilian' && e.place === 'street' && !e.dead);
    const gap = w => Math.min(Infinity, ...watchers.map(e => Math.hypot(e.x - w[0], e.z - w[1])));
    const far = ways.filter(w => gap(w) >= (R.minDistance ?? 25));
    return far.length ? pick(far) : ways.slice().sort((a, b) => gap(b) - gap(a))[0];
  }

  function add(kind = pickType()) {
    const w = wayIn();
    if (!w || !kind) return null;
    const id = spawn(kind, statsOf(kind).sprite || kind, w[0], w[1], { owner: WILD, wild: true });
    mind[id] = { spot: null };
    night.came++;
    return id;
  }

  function goTo(e, m, p) {
    Object.assign(m, { spot: p.id, x: p.x, z: p.z, until: null });
    m.deadline = state.tick + secs(Math.hypot(p.x - e.x, p.z - e.z) / statsOf(e).walk * 2.5 + 8);
  }

  // Hit by someone of a clan: it and the bandits near it fight that clan (e.angry: clan -> tick it ends)
  function provoke(t, clan) {
    if (!clan || clan === WILD) return;
    for (const b of Object.values(state.entities)) {
      if (b.owner !== WILD || b.dead || b.place !== t.place || Math.hypot(b.x - t.x, b.z - t.z) > (R.joinRadius ?? 8)) continue;
      (b.angry ||= {})[clan] = state.tick + secs(R.angrySeconds ?? 10);
    }
  }
  // Killed: the ryo stays on the body (t.loot) for whoever loots it with a right-click, not the
  // killer (Tim 2026-10-19); the body lies there lootSeconds, then fades (sim/game.js loot)
  function killed(a, t) {
    const base = (t.camp ? types[t.type]?.ryo : R.roamerLoot ?? types[t.type]?.ryo) || 0;
    if (!base) return;
    const k = R.ryoSpread ?? 0;
    t.loot = Math.round(base * (1 - k + rng() * 2 * k));
  }

  // One bandit, one tick
  function step(e) {
    const m = mind[e.id];
    if (!m || e.dead) return;
    // anger ends after angrySeconds, or when nobody of that clan is within giveUpDistance
    if (e.angry) {
      for (const [clan, until] of Object.entries(e.angry)) {
        const near = Object.values(state.entities).some(o => o.owner === clan && !o.dead && !o.downed && !o.jailed && o.place === e.place && Math.hypot(o.x - e.x, o.z - e.z) <= (R.giveUpDistance ?? 6));
        if (state.tick >= until || !near) delete e.angry[clan];
      }
      if (!Object.keys(e.angry).length) { delete e.angry; delete e.swing; stopPath(e); }
    }
    const camp = campOf[m.camp];
    if (camp && Math.hypot(e.x - camp.x, e.z - camp.z) > (camp.leash ?? 10)) {
      delete e.angry; delete e.swing; m.spot = null; m.until = null;
      moveTo(e, statsOf(e), camp.x, camp.z, true);
      return;
    }
    // Each bandit acquires its own visible targets; stealth and walls still hide them.
    for (const t of Object.values(state.entities)) {
      if (!state.clans?.[t.owner] || t.owner === WILD || t.type === 'civilian' || t.dead || t.downed || t.jailed || t.place !== e.place) continue;
      if (Math.hypot(t.x - e.x, t.z - e.z) > (R.sightRange ?? 6)) continue;
      if (camp && Math.hypot(t.x - camp.x, t.z - camp.z) > (camp.leash ?? 10)) continue;
      if (canSee(e, t)) (e.angry ||= {})[t.owner] = state.tick + secs(R.angrySeconds ?? 10);
    }
    if (fightStep(e, R.giveUpDistance ?? 6)) { m.spot = null; m.until = null; return; }
    const unit = statsOf(e);
    if (camp) {
      const distraction = e.distracted;
      if (distraction && state.tick < distraction.until && Math.hypot(distraction.x - camp.x, distraction.z - camp.z) <= (camp.leash ?? 10)) {
        m.spot = null; m.until = null;
        if (Math.hypot(distraction.x - e.x, distraction.z - e.z) < 0.8 || !moveTo(e, unit, distraction.x, distraction.z, true)) { e.anim = 'idle'; stopPath(e); }
        return;
      }
      patrolCamp(e, m, camp);
      return;
    }
    // dawn: walk to the nearest way out and go
    if (!state.night) {
      if (!m.leaving) {
        const w = ways.slice().sort((a, b) => Math.hypot(a[0] - e.x, a[1] - e.z) - Math.hypot(b[0] - e.x, b[1] - e.z))[0];
        if (!w) { remove(e.id); return; }
        goTo(e, m, { id: 'out', x: w[0], z: w[1] });
        m.leaving = true;
      }
      if (Math.hypot(m.x - e.x, m.z - e.z) < 0.6 || state.tick > m.deadline || !moveTo(e, unit, m.x, m.z, true)) remove(e.id);
      return;
    }
    if (m.leaving) { m.leaving = false; m.spot = null; m.until = null; }   // night again before it got out
    // a ninja's pebble (Distract, sim/game.js): walk over and look round there for a while
    const dz = e.distracted;
    if (dz && state.tick < dz.until) { m.spot = null; m.until = null; if (Math.hypot(dz.x - e.x, dz.z - e.z) < 0.8 || !moveTo(e, unit, dz.x, dz.z, true)) { e.anim = 'idle'; stopPath(e); } return; }
    // staying at a spot
    if (m.until != null) {
      e.anim = 'idle';
      if (state.tick < m.until) return;
      m.until = null;
      m.spot = null;
    }
    // walking to a spot
    if (m.spot == null) {
      const p = pick(spots.filter(q => q.id !== m.last));
      if (!p) return;
      goTo(e, m, p);
    }
    if (Math.hypot(m.x - e.x, m.z - e.z) < 0.6 || state.tick > m.deadline || !moveTo(e, unit, m.x, m.z, true)) {
      stopPath(e);
      e.anim = 'idle';
      m.last = m.spot;
      m.until = state.tick + secs(range(R.staySeconds || [6, 15]));
    }
  }

  // Called once per tick after the units moved
  function tick() {
    campsTick();
    // nightfall: a new night's count; firstWave come at once, then one every everySeconds
    if (state.night && !night.on) Object.assign(night, { came: 0, next: state.tick });
    night.on = state.night;
    if (state.night && night.came < (R.perNight ?? 12) && state.tick >= night.next && out().length < (R.maxOut ?? 6)) {
      const n = night.came === 0 ? (R.firstWave ?? 1) : 1;
      for (let i = 0; i < n && night.came < (R.perNight ?? 12) && out().length < (R.maxOut ?? 6); i++) add();
      night.next = state.tick + secs(R.everySeconds ?? 20);
    }
    for (const e of Object.values(state.entities)) if (e.owner === WILD) step(e);
    for (const id of Object.keys(mind)) if (!state.entities[id]) delete mind[id];
  }

  return { tick, add, provoke, killed, mind, night, spots, ways };
}
