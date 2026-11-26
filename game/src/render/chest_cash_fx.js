// Cashing a stolen chest (train robbery, 2026-11-21): the loot flies from the hero into the town hall (or the war
// camp banner) as the same little load icons the workers carry (cargo_icons.js), ryo as gold koban coins. Each icon
// pops up out of the chest, arcs over and drops into the hall, a few at a time, then shrinks away.
// steal(): while a hero holds on a freight wagon, small icons hop out of the wagon into his hands, one every STEAL_EVERY s
// (2026-11-21: the hero art has no stealing animation, so the loot coming off the wagon shows it).
// Sim: rail_robbery.js cash() pushes a 'chestCashed' cast { x, z, tx, tz, loot }.
import * as THREE from 'three';
import { cargoIcon, CARGO_ICON_SIZE } from '../cargo_icons.js';
import { groundY } from '../castle_height.js';

const FLY = 1.1, STAGGER = .07, SIZE = 1.4, STEAL_EVERY = .45, STEAL_FLY = .7, STEAL_SIZE = .9;   // seconds in the air, seconds between icons, world size of an icon
const texCache = new Map();
const tex = kind => { if (!texCache.has(kind)) { const t = new THREE.CanvasTexture(cargoIcon(kind)); t.colorSpace = THREE.SRGBColorSpace; texCache.set(kind, t); } return texCache.get(kind); };
// how many icons a resource gets: a handful, a few more for a big haul
const countOf = (r, n) => r === 'ryo' ? Math.min(14, 4 + Math.round(n / 150)) : Math.min(8, 2 + Math.round(n / 40));
const kindOf = r => r === 'ryo' ? 'coin' : r === 'timber' || r === 'stone' ? r : 'sack';

export function createChestCashFx({ scene }) {
  const live = [];
  function cash(c) {
    const y0 = groundY(c.x, c.z) + 2.3, y1 = groundY(c.tx, c.tz) + 2.5, aspect = CARGO_ICON_SIZE.h / CARGO_ICON_SIZE.w;
    let k = 0;
    for (const [r, n] of Object.entries(c.loot || {})) {
      if (!(n >= 1)) continue;
      for (let i = 0, m = countOf(r, n); i < m; i++, k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(kindOf(r)), transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
        s.scale.set(SIZE, SIZE * aspect, 1); s.renderOrder = 12; scene.add(s);
        const a = Math.random() * Math.PI * 2, spread = .8 + Math.random() * 1.1;
        live.push({ s, t: -k * STAGGER, from: { x: c.x, y: y0, z: c.z }, to: { x: c.tx + (Math.random() - .5) * 1.4, y: y1, z: c.tz + (Math.random() - .5) * 1.4 },
          pop: { x: Math.cos(a) * spread, z: Math.sin(a) * spread }, arc: 3 + Math.random() * 1.6, spin: (Math.random() - .5) * 2 });
      }
    }
  }
  // robbers: [{ id, from: { x, z }, to: { x, y, z } }] heroes holding on a wagon this frame (from = the wagon, to = the sprite)
  const timers = new Map();
  function steal(robbers, dt) {
    const now = new Set();
    for (const r of robbers) {
      now.add(r.id);
      const left = (timers.get(r.id) ?? 0) - dt;
      if (left > 0) { timers.set(r.id, left); continue; }
      timers.set(r.id, STEAL_EVERY * (.8 + Math.random() * .4));
      const kind = ['coin', 'coin', 'timber', 'stone', 'sack'][Math.floor(Math.random() * 5)];
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(kind), transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      s.renderOrder = 99797; scene.add(s);   // over the train art (2026-11-21: they came in behind it)
      live.push({ s, t: 0, fly: STEAL_FLY, size: STEAL_SIZE, from: { x: r.from.x, y: groundY(r.from.x, r.from.z) + 1.5, z: r.from.z }, to: { x: r.to.x, y: r.to.y + 1.1, z: r.to.z },
        pop: { x: 0, z: 0 }, arc: 1 + Math.random() * .6, spin: (Math.random() - .5) * 1.5 });
    }
    for (const id of [...timers.keys()]) if (!now.has(id)) timers.delete(id);
  }
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i]; p.t += dt;
      if (p.t < 0) continue;
      const u = Math.min(1, p.t / (p.fly || FLY)), SZ = p.size || SIZE, e = u * u * (3 - 2 * u), out = Math.min(1, p.t / .18);   // smooth path, quick pop out of the chest
      const x = p.from.x + p.pop.x * out * (1 - e) + (p.to.x - p.from.x) * e, z = p.from.z + p.pop.z * out * (1 - e) + (p.to.z - p.from.z) * e;
      const y = p.from.y + (p.to.y - p.from.y) * e + Math.sin(Math.PI * u) * p.arc;
      const shrink = u > .85 ? 1 - (u - .85) / .15 * .7 : Math.min(1, .5 + out * .5);
      p.s.position.set(x, y, z); p.s.material.rotation = p.spin * u;
      p.s.scale.set(SZ * shrink, SZ * shrink * CARGO_ICON_SIZE.h / CARGO_ICON_SIZE.w, 1);
      p.s.material.opacity = u > .9 ? 1 - (u - .9) / .1 : out;
      if (u >= 1) { scene.remove(p.s); p.s.material.dispose(); live.splice(i, 1); }
    }
  }
  return { cash, steal, update };
}
