// Visible arrivals and level-ups (economy balance B7, Tim 2026-11-05). Pure presentation support in the sim:
// growth (economy) and housing level-ups (zones) push small records onto the town; this module walks a
// cosmetic civilian from the town ring's edge to the house when the player's units are near, then
// removes it. Nobody can lose a person this way: pop already changed; the walker is decoration.
// Records (plain data, saved): s.arrivals = [{ cell, tick, entity?, path?, step? }], s.fx = [{ kind, cell, tick, stage? }].
import { cellToWorld, ringRadius } from './town_grid.js';
import { dirIndex } from '../geometry.js';
import { modeRules } from '../modes/index.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// economy/zones call these (no runtime needed)
export function noteArrival(s, data, state) {
  const g = s.grid, kinds = data.zones?.kinds || {};
  if (!g) return;
  const chars = Object.values(kinds).filter(k => k.housing).map(k => k.char), cells = [];
  for (let i = 0; i < g.zone.length; i++) if (chars.includes(g.zone[i]) && Number(g.stage[i]) > 0) cells.push(i);
  if (!cells.length) return;
  const cell = cells[(s.pop * 7919) % cells.length];   // deterministic spread over the houses
  (s.arrivals ||= []).push({ cell, tick: state?.tick ?? 0, n: s.pop });
  if (s.arrivals.length > 8) s.arrivals.splice(0, s.arrivals.length - 8);
}
export function noteLevelUp(s, cell, stage, state) {
  (s.fx ||= []).push({ kind: 'level', cell, stage, tick: state?.tick ?? 0 });
  while (s.fx.length > 12) { const i = s.fx.findIndex(f => f.kind !== 'fireworks'); if (i < 0) break; s.fx.splice(i, 1); }
}
// a town hall tier-up: fireworks from the hall (Tim 2026-11-05); kept apart from the 12-entry cap
export function noteTierUp(s, state) {
  (s.fx ||= []).push({ kind: 'fireworks', tier: s.tier || 1, tick: state?.tick ?? 0 });
}

export function createArrivals({ state, data }) {
  const A = data.arrivals, R = data.workers || {};
  let runtime = null;
  const towns = () => Object.values(state.frontier?.settlements || {}).filter(s => !s.capital && s.grid);
  function tick() {
    if (!A) return;
    const now = state.tick ?? 0, enabled = runtime && modeRules(state).island;
    const anchors = enabled ? Object.values(state.entities || {}).filter(e => e.place === 'world' && e.owner && e.type !== 'civilian' && !e.worker && !e.dead) : [];
    const near = p => anchors.some(e => distance(p, [e.x, e.z]) <= (R.spawnRadius || 160));
    for (const s of towns()) {
      if (s.fx?.length) s.fx = s.fx.filter(f => now - f.tick <= (f.kind === 'fireworks' ? A.fireworksTicks || 400 : A.fxTicks || 80));
      if (!s.arrivals?.length) continue;
      const walking = s.arrivals.filter(a => a.entity).length;
      for (const a of [...s.arrivals]) {
        const home = cellToWorld(s, a.cell), done = () => {
          const e = a.entity && state.entities?.[a.entity];
          if (e) runtime?.remove(a.entity);
          s.arrivals.splice(s.arrivals.indexOf(a), 1);
          // the +1 rises where the newcomer actually went in (the path ends beside the house, not in its centre)
          const at = e ? [e.x, e.z] : home;
          (s.fx ||= []).push({ kind: 'arrive', cell: a.cell, tick: now, x: at[0], z: at[1] });
        };
        if (!a.entity) {
          if (!enabled || !near(home) || walking >= (A.maxWalkers || 3)) { done(); continue; }
          // newcomers walk out of the town hall to their house (Tim 2026-11-05), from the hall's side facing it
          const ang = Math.atan2(home[1] - s.z, home[0] - s.x) || 0, step = (s.grid.cell || 11) * 1.2;
          const start = runtime.areas.nav.nearestFree?.(s.x + Math.cos(ang) * step, s.z + Math.sin(ang) * step) || [s.x, s.z];
          const path = runtime.areas.nav.workerPath(...start, ...home);
          if (!path?.length) { done(); continue; }
          const models = A.models || ['old_woman'];
          a.entity = runtime.spawn('civilian', models[(a.n || 0) % models.length], ...path[0], { place: 'world', area: 'world', arrival: true, town: s.id, holdFire: true, hp: 60, maxHp: 60 });
          a.path = path; a.step = 0;
          continue;
        }
        const e = state.entities?.[a.entity];
        if (!e) { done(); continue; }
        // walk along the path at A.speed units per second (20 sim ticks per second)
        let left = (A.speed || 3) / 20;
        while (left > 0 && a.step < a.path.length - 1) {
          const to = a.path[a.step + 1], d = distance([e.x, e.z], to);
          if (d > 0) e.dir = dirIndex(to[0] - e.x, to[1] - e.z);
          if (d <= left) { [e.x, e.z] = to; a.step++; left -= d; }
          else { e.x += (to[0] - e.x) * left / d; e.z += (to[1] - e.z) * left / d; left = 0; }
          e.anim = 'walk';
        }
        if (a.step >= a.path.length - 1 || now - a.tick > 20 * 60) done();
      }
    }
  }
  return { tick, attach(services) { runtime = services; } };
}
