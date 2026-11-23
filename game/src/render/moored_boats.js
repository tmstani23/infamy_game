// Boats tied up at every castle dock, for the look only (Tim 2026-11-23: "1 fishing boat and coastal ship and sometimes
// a warship at the dock too, just as art though not usable"). The coastal ship is the ferry (render/ferry_ships.js);
// this adds fishing boats (boat_river) along the sides, a cargo ship (ship_coastal) lying at anchor offshore, and on
// some days a warship (ship_war) off one side (Tim 2026-11-23: "some fishing boats and a stalled cargo ship").
// Nothing in the sim: they cannot be selected or boarded. Placement: data/campaign_zones.json ship.berth.moored
// (placeholders): fishing = [[across, along, turn], ...], cargo / war = [across, along] in dock positions
// (src/dock_shape.js dockFrame: across 0..1, outside = the water beside the dock; along 0 at the land edge to 1 at the
// sea end, over 1 = out to sea), turn = quarter turns off pointing out to sea; sizes; warChance = share of days a
// warship lies there.
// createMooredBoats({ scene, carSprite, rules }) -> { update(state, showWorld, dt), things(), dispose() }
import { dockFrame } from '../dock_shape.js';
import { dirIndex } from '../sim/geometry.js';

const DEFAULTS = { fishing: [[1.22, 0.72, 0], [1.3, 0.3, 0], [-0.18, 0.25, 2]], fishingSize: 1, cargo: [0.15, 1.75], cargoTurn: 1, cargoSize: 1.4, war: [-0.42, 0.62], warSize: 1.15, warChance: 0.45, dayTicks: 12000 };
const roll = (id, day) => { let h = 2166136261; for (const ch of `${id}:${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

export function createMooredBoats({ scene, carSprite, rules }) {
  const M = () => ({ ...DEFAULTS, ...(rules?.ship?.berth?.moored || {}) });
  const boats = new Map();   // key -> { sprite, gone }
  function get(key, model) {
    let b = boats.get(key);
    if (!b) { b = { sprite: null, gone: false }; boats.set(key, b);
      carSprite(model).then(sp => { if (b.gone) { scene.remove(sp.thing.mesh, sp.shadow); sp.dispose(); } else { b.sprite = sp; sp.thing.mesh.visible = sp.shadow.visible = false; } }).catch(() => {}); }
    return b;
  }
  const show = (b, on) => { if (b.sprite) b.sprite.thing.mesh.visible = b.sprite.shadow.visible = on; };
  const frames = new Map();   // settlement id -> dock frame (castles never move)
  function update(state, showWorld, dt) {
    const seen = new Set(), m = M(), day = Math.floor((state?.tick ?? 0) / m.dayTicks);
    if (showWorld) for (const s of Object.values(state?.frontier?.settlements || {})) {
      if (!s.castle?.pier?.length || !s.grid) continue;
      let f = frames.get(s.id);
      if (f === undefined) { const g = s.grid; f = dockFrame({ x: s.x, z: s.z, n: g.n, cell: g.cell, mid: (g.n - 1) / 2, use: g.use, level: g.level, pier: s.castle.pier }); frames.set(s.id, f); }
      if (!f) continue;
      const dir = dirIndex(f.along[0], f.along[1]);   // bow out to sea; turn = quarter turns (2 of the 8 directions each)
      const put = (key, model, [a, b], size, turn = 0) => { const bt = get(key, model); seen.add(key); if (!bt.sprite) return;
        const [x, z] = f.spot(a, b); bt.sprite.update(dt, x, z, (dir + turn * 2) % 8, 'idle', null, size); show(bt, true); };
      const fishing = Array.isArray(m.fishing[0]) ? m.fishing : [m.fishing];
      fishing.forEach(([a, b, turn], k) => put(`fish${k}:${s.id}`, 'boat_river', [a, b], m.fishingSize, turn || 0));
      if (m.cargo) put(`cargo:${s.id}`, 'ship_coastal', m.cargo, m.cargoSize, m.cargoTurn || 0);
      if (roll(s.id, day) < m.warChance) put(`war:${s.id}`, 'ship_war', m.war, m.warSize);
    }
    for (const [k, b] of boats) if (!seen.has(k)) show(b, false);
  }
  const things = () => [...boats.values()].filter(b => b.sprite?.thing.mesh.visible).map(b => b.sprite.thing);
  const dispose = () => { for (const b of boats.values()) { b.gone = true; if (b.sprite) { scene.remove(b.sprite.thing.mesh, b.sprite.shadow); b.sprite.dispose(); } } boats.clear(); };
  return { update, things, dispose };
}
