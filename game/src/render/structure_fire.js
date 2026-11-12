// Fires on torched war structures (war checkpoint 6): the small-flame look of the HQ fire (render/hq_fire.js)
// as a ground patch at each burning structure. Reads state.frontier.structures (the snapshot lists the damaged
// or burning structures of the player's wars); drawing only.
import { createGroundFirePatch } from './hq_fire.js';
import { createParticles, SHAPE } from './vfx.js';

export function createStructureFire({ scene }) {
  const burning = new Map();
  function drop(key) { const m = burning.get(key); if (!m) return; scene.remove(m); m.material.dispose(); burning.delete(key); }
  function update(state, place) {
    const list = place === 'world' ? (state.frontier?.structures || []).filter(s => s.fire) : [];
    const want = new Set(list.map(s => s.key));
    for (const key of [...burning.keys()]) if (!want.has(key)) drop(key);
    for (const s of list) {
      if (burning.has(s.key)) continue;
      const mesh = createGroundFirePatch(s.x, s.z, Math.max(2.5, Math.min(7, s.r || 4)), (s.x * 7 + s.z * 13) % 97);
      scene.add(mesh); burning.set(s.key, mesh);
    }
  }
  // 7c (Tim 2026-11-12): the smoke over a ruin moves. Slow grey puffs rise and drift from every ruined building in the
  // drawn towns and camps (setRuins: the ruin props from town_props.js; broken palisade and gate pieces give none).
  const smoke = createParticles(scene, { max: 700, additive: false });
  const GREY = [[0.2, 0.19, 0.18], [0.3, 0.29, 0.27], [0.4, 0.39, 0.37], [0.14, 0.13, 0.13]];
  let ruins = [], owed = 0;
  function setRuins(list) { ruins = list.slice(0, 60); }
  function updateSmoke(dt, place) {
    if (place === 'world' && ruins.length) {
      owed += Math.min(dt, 0.1) * 2.2 * ruins.length;   // about two puffs a second from each ruin
      while (owed >= 1) {
        owed--;
        const r = ruins[Math.floor(Math.random() * ruins.length)], w = r.w || 4;
        smoke.emit({ x: r.x + (Math.random() - 0.5) * w, y: 1 + Math.random() * 1.5, z: r.z + (Math.random() - 0.5) * w, vx: 0.35 + Math.random() * 0.3, vy: 0.9 + Math.random() * 0.7, vz: (Math.random() - 0.5) * 0.3,
          drag: 0.15, sway: 0.5, life: 3.5 + Math.random() * 2.5, size: 1.6 + Math.random() * 1.6, grow: 0.7, color: GREY[Math.floor(Math.random() * GREY.length)], alpha: 0.3 + Math.random() * 0.2, shape: SHAPE.dot, spin: (Math.random() - 0.5) * 0.6 });
      }
    } else owed = 0;
    smoke.update(dt);
  }
  return { update, setRuins, updateSmoke };
}
