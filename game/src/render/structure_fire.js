// Fires on torched war structures (war checkpoint 6): the small-flame look of the HQ fire (render/hq_fire.js)
// as a ground patch at each burning structure. Reads state.frontier.structures (the snapshot lists the damaged
// or burning structures of the player's wars); drawing only.
import { createGroundFirePatch } from './hq_fire.js';

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
  return { update };
}
