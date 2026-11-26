// Campfires on the island (world variety P1, sim/campfire.js): the campfire art (its flames and its light) where a camp
// was made, and a log under each seat, lying along the ring (render/view.js plays the 'sit' clip on it). A fire put out burns
// down: the flames go at once and its light shrinks to nothing over rules.campfire.emberSeconds, then all of it goes.
// createCampfireFx({ scene, lights, artThing, emberSeconds }) -> { update(state, show), things() }
//   artThing(prop): a new world-ground thing for an art name (render/world_ground.js), added to the scene here
// The seat log and the sitter (Tim 2026-11-26: the near ones looked to stand on their log, then to sit in front of it).
// The coach sitting pose is chair height with the hips straight above the ground point, so the log lies at the seat
// and always draws behind the sitter, who is raised a touch onto it. A sitter with his back to the camera (sheet rows
// 3, 4, 5) has his legs over the far side: the <model>_campfire_sit sheets have nothing drawn there below the coat hem
// (28 px under the cell centre, cut into the sheet, not in a shader), and his log comes in a little toward the fire.
const LOG = { art: 'rotten_log', s: 0.5, back: -0.3, depthBias: -1.5 };
export const SIT = { lift: 0.05 };
const nearOf = (dx, dz) => Math.max(0, (dx + dz) / ((Math.hypot(dx, dz) || 1) * Math.SQRT2));   // 1 = straight toward the camera from the fire

export function createCampfireFx({ scene, lights = [], artThing = () => null, emberSeconds = () => 20 }) {
  const active = new Map();   // fire id -> { fire, logs: [], light, radius, out }
  const add = t => { scene.add(t.mesh, ...t.extras); for (const l of t.lights) lights.push(l); return t; };
  const remove = t => {
    if (!t) return;
    scene.remove(t.mesh, ...t.extras);
    for (const l of t.lights) { const i = lights.indexOf(l); if (i >= 0) lights.splice(i, 1); }
    t.mesh.material?.dispose?.(); for (const m of t.extras) m.material?.dispose?.();
  };
  function drop(id) { const a = active.get(id); if (!a) return; remove(a.fire); a.logs.forEach(remove); active.delete(id); }
  function build(f) {
    const fire = artThing({ art: 'campfire', x: f.x, z: f.z });
    if (!fire) return null;   // art still loading: next frame
    const logs = [];
    for (const s of f.seats) {
      const dx = s.x - f.x, dz = s.z - f.z, d = Math.hypot(dx, dz) || 1;
      const back = LOG.back * Math.min(1, nearOf(dx, dz) * 2);
      const t = artThing({ art: LOG.art, x: s.x + dx / d * back, z: s.z + dz / d * back, s: LOG.s, flip: Math.abs(dz) > Math.abs(dx), depthBias: LOG.depthBias, noLights: true });
      if (!t) { for (const l of logs) l.mesh.material?.dispose?.(); fire.mesh.material?.dispose?.(); return null; }
      logs.push(t);
    }
    const a = { fire: add(fire), logs: logs.map(add), out: false, radius: fire.lights.map(l => l.radius) };
    active.set(f.id, a);
    return a;
  }
  function update(state, show) {
    const fires = state.campfires || {};
    for (const id of [...active.keys()]) if (!fires[id]) drop(id);
    for (const f of Object.values(fires)) {
      const a = active.get(f.id) || build(f);
      if (!a) continue;
      const glows = new Set(a.fire.lights.map(l => l.glow));
      if (f.out) a.out = true;
      for (const t of [a.fire, ...a.logs]) { t.mesh.visible = show; for (const m of t.extras) m.visible = show && !(a.out && t === a.fire && !glows.has(m)); }   // out: no flames
      for (const l of a.fire.lights) l.off = !show;
      if (f.out) {   // burning down: the glow shrinks away
        const left = Math.max(0, 1 - ((state.tick ?? 0) - f.out) / Math.max(1, emberSeconds() * 20));
        a.fire.lights.forEach((l, i) => { l.radius = a.radius[i] * (0.25 + 0.35 * left); l.off = !show || left <= 0; if (l.glow) l.glow.visible = show && left > 0; });
      }
    }
  }
  return { update, things: () => [...active.values()].flatMap(a => [a.fire, ...a.logs]) };
}
