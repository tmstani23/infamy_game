// Townsfolk in frontier towns (Tim 2026-11-07): in peacetime each of your towns has a few citizens wandering
// its roads and buildings, like the capital's. How many: one per perPeople of its population, capped by the
// town hall tier (max[tier]). At night, or while enemies are inside the town ring (a stand-in for war until wars
// exist; s.war also counts), they walk back to the town hall and go in. Decoration only: they exist only while
// one of your units is within viewRadius of the hall, and nobody can lose a person this way.
// Tim 2026-11-08: they are the capital's mix of townsfolk (every civilians.json walker type, picked at random by its
// count), and they keep near the town hall: within roam[tier] world units of it, a bit further each tier.
// Records (plain data, saved): s.folk = [{ entity, path, step, wait, home }].
// createTownsfolk({ state, data, civilians }) -> { tick, attach }   data.townsfolk (frontier.json), civilians.json
import { cellToWorld, ringRadius } from './town_grid.js';
import { dirIndex } from '../geometry.js';
import { modeRules } from '../modes/index.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const HZ = 20;

export function createTownsfolk({ state, data, civilians = null }) {
  const T = data.townsfolk;
  // the capital's walkers, each as many times as its count (vehicles drive, they don't walk round a town)
  const mix = Object.values(civilians?.types || {}).filter(t => !t.vehicle && t.model).flatMap(t => Array(Math.max(1, t.count || 1)).fill(t.model));
  const roamOf = s => T.roam?.[s.tier || 1] ?? T.roam?.[1] ?? Infinity;
  let runtime = null, danger = new Map();   // town id -> enemies inside the ring (refreshed once a second)
  const towns = () => Object.values(state.frontier?.settlements || {}).filter(s => !s.capital && s.grid && s.owner && s.founded !== undefined && Number.isFinite(s.x));
  // seeded per town and step, so the same game wanders the same way
  const roll = (s, k) => { let x = (state.tick ?? 0) * 2654435761 ^ k * 40503 ^ s.id.length * 977; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  function hostile(s) {
    const r = ringRadius(s, data), [x, z] = [s.x, s.z];
    return Object.values(state.entities || {}).some(e => e.place === 'world' && !e.dead && !e.downed && e.owner && e.owner !== s.owner
      && (state.clans?.[e.owner] || e.owner === 'bandits') && Math.hypot(e.x - x, e.z - z) <= r);
  }
  // somewhere worth walking to near the hall: a built building or a road cell of the town within roam of it,
  // else just a spot within roam
  function target(s, k) {
    const g = s.grid, cells = [], roam = roamOf(s);
    for (const b of s.buildings || []) if (b.stage === 'built' && b.type !== 'town_hall') cells.push(...(b.cells?.length ? b.cells : [b.cell]).filter(Number.isInteger));
    for (let i = 0; i < g.use.length; i += 3) if (g.use[i] === 'r') cells.push(i);
    const near = cells.filter(i => { const [x, z] = cellToWorld(s, i); return Math.hypot(x - s.x, z - s.z) <= roam; });
    if (!near.length) {
      if (!Number.isFinite(roam)) return null;
      const a = roll(s, k) * Math.PI * 2, d = roam * (0.35 + 0.65 * roll(s, k + 1)), x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      return runtime.areas.nav.nearestFree?.(x, z) || [x, z];
    }
    const [x, z] = cellToWorld(s, near[Math.floor(roll(s, k) * near.length)]);
    return runtime.areas.nav.nearestFree?.(x + (roll(s, k + 1) - 0.5) * 4, z + (roll(s, k + 2) - 0.5) * 4) || [x, z];
  }
  const door = s => { const step = (s.grid.cell || 11) * 0.9; return runtime.areas.nav.nearestFree?.(s.x + step * 0.7, s.z + step * 0.7) || [s.x, s.z]; };
  function remove(s, f) { if (f.entity && state.entities?.[f.entity]) runtime.remove(f.entity); s.folk.splice(s.folk.indexOf(f), 1); }
  function route(f, from, to) { const p = runtime.areas.nav.workerPath(...from, ...to); f.path = p?.length ? p : null; f.step = 0; return !!f.path; }

  function tick() {
    if (!T || !runtime) return;
    const now = state.tick ?? 0, enabled = modeRules(state).island;
    const anchors = enabled ? Object.values(state.entities || {}).filter(e => e.place === 'world' && e.owner && e.type !== 'civilian' && !e.worker && !e.dead) : [];
    if (now % HZ === 0) { danger = new Map(); for (const s of towns()) danger.set(s.id, !!s.war || hostile(s)); }
    for (const s of towns()) {
      s.folk ||= [];
      for (const f of [...s.folk]) if (!state.entities?.[f.entity]) s.folk.splice(s.folk.indexOf(f), 1);
      const near = anchors.some(e => e.owner === s.owner && distance([e.x, e.z], [s.x, s.z]) <= (T.viewRadius ?? 250));
      if (!enabled || !near) { for (const f of [...s.folk]) remove(s, f); continue; }
      const calm = !state.night && !danger.get(s.id);
      const want = calm ? Math.min(T.max?.[s.tier || 1] ?? T.max?.[1] ?? 4, Math.floor((s.pop || 0) / (T.perPeople || 10))) : 0;
      // too many (night, danger, people left): the extras head home
      const out = s.folk.filter(f => !f.home);
      for (const f of out.slice(want)) { const e = state.entities[f.entity]; f.home = true; route(f, [e.x, e.z], door(s)); }
      // too few: one walks out of the hall each second
      if (out.length < want && now % HZ === 0) {
        const at = door(s), k = s.folk.length + now, models = T.models || (mix.length ? mix : null) || data.arrivals?.models || ['old_woman'];
        const id = runtime.spawn('civilian', models[Math.floor(roll(s, k) * models.length)], ...at, { place: 'world', area: 'world', townsfolk: s.id, seenBy: s.owner, holdFire: true, hp: 60, maxHp: 60 });
        const f = { entity: id, path: null, step: 0, wait: 0, home: false };
        s.folk.push(f);
        const to = target(s, k); if (to) route(f, at, to);
      }
      for (const f of [...s.folk]) {
        const e = state.entities[f.entity];
        if (!f.path) {
          if (f.home) { remove(s, f); continue; }
          e.anim = 'idle';
          if (now < f.wait) continue;
          const to = target(s, now + f.entity.length * 31);
          if (!to || !route(f, [e.x, e.z], to)) f.wait = now + HZ * 3;
          continue;
        }
        let left = (T.speed ?? 2.2) * (f.home && !calm ? (T.hurry ?? 1.8) : 1) / HZ;
        while (left > 0 && f.step < f.path.length - 1) {
          const to = f.path[f.step + 1], d = distance([e.x, e.z], to);
          if (d > 0) e.dir = dirIndex(to[0] - e.x, to[1] - e.z);
          if (d <= left) { [e.x, e.z] = to; f.step++; left -= d; }
          else { e.x += (to[0] - e.x) * left / d; e.z += (to[1] - e.z) * left / d; left = 0; }
        }
        e.anim = f.home && !calm ? 'run' : 'walk';
        if (f.step >= f.path.length - 1) {
          f.path = null;
          if (f.home) { remove(s, f); continue; }
          const [a, b] = T.idleSeconds || [4, 12];
          f.wait = now + Math.round((a + roll(s, f.step + now) * (b - a)) * HZ);
        }
      }
    }
  }
  return { tick, attach(services) { runtime = services; } };
}
