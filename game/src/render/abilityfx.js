// Ability effects drawn from the sim's per-tick casts list and the buffs in the state:
// dash streak, intimidate shockwave and aura, rally ring and aura, red lantern glow.
// Purely visual: nothing here changes the game state.
import * as THREE from 'three';

const flat = (geo, color, opacity) => {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  m.frustumCulled = false;
  return m;
};
const WAVE_GEO = new THREE.RingGeometry(0.86, 1, 64), DISC_GEO = new THREE.CircleGeometry(1, 40), AURA_GEO = new THREE.RingGeometry(0.5, 0.78, 40);
const STREAK_GEO = new THREE.PlaneGeometry(1, 1);
const AURAS = {
  lantern: { color: 0xff3a1e, size: 1.25, geo: DISC_GEO, opacity: 0.45 },
  intimidated: { color: 0x7a3cff, size: 1, geo: AURA_GEO, opacity: 0.55 },
  rally: { color: 0x9fe060, size: 1, geo: AURA_GEO, opacity: 0.5 },
  downed: { color: 0xc01810, size: 1.1, geo: AURA_GEO, opacity: 0.7 },
};

export function createAbilityFx({ scene, overlay, posOf, unitToScreen }) {
  const waves = [], streaks = [], auras = new Map();   // auras: "id:buff" -> mesh
  const bars = new Map();                             // execute channel bars: unit id -> HTML element

  function wave(x, z, radius, color, life, delay = 0) {
    const m = flat(WAVE_GEO, color, 0.9);
    m.position.set(x, 0.04, z);
    m.visible = false;
    scene.add(m);
    waves.push({ m, radius, life, age: -delay });
  }

  return {
    // c: one entry of state.casts
    cast(c) {
      if (c.kind === 'dash') {
        const m = flat(STREAK_GEO, 0xcfe0ff, 0.8);
        scene.add(m);
        streaks.push({ m, id: c.a, x: c.x, z: c.z, age: 0, done: null });
      }
      if (c.kind === 'intimidate') { wave(c.x, c.z, c.radius, 0x8a40ff, 0.45); wave(c.x, c.z, c.radius * 0.7, 0x3a1060, 0.5, 0.08); }
      if (c.kind === 'rally') { wave(c.x, c.z, c.radius, 0xffd060, 0.6); wave(c.x, c.z, c.radius, 0x9fe060, 0.7, 0.12); }
      if (c.kind === 'execute') { wave(c.x, c.z, 1.8, 0xff2010, 0.45); wave(c.x, c.z, 1.1, 0x600000, 0.5, 0.05); }
      if (c.kind === 'lantern') { wave(c.x, c.z, 2.4, 0xff4020, 0.5); wave(c.x, c.z, 1.6, 0xffa040, 0.4, 0.06); }
    },

    update(dt, state) {
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.age += dt;
        if (w.age < 0) continue;
        const k = w.age / w.life;
        if (k >= 1) { scene.remove(w.m); w.m.material.dispose(); waves.splice(i, 1); continue; }
        const r = w.radius * (0.15 + 0.85 * (1 - (1 - k) ** 3));
        w.m.visible = true;
        w.m.scale.set(r, r, 1);
        w.m.material.opacity = 0.9 * (1 - k);
      }

      // dash: a pale streak along the ground from the start point to the hero, fading after
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i], e = state.entities[s.id], p = posOf(s.id);
        if (!s.done && (!e || !e.dash) && s.age > 0.05) s.done = s.age;
        s.age += dt;
        const fade = s.done ? 1 - (s.age - s.done) / 0.3 : 1;
        if (fade <= 0 || !p) { scene.remove(s.m); s.m.material.dispose(); streaks.splice(i, 1); continue; }
        const dx = p.x - s.x, dz = p.z - s.z, len = Math.hypot(dx, dz);
        s.m.position.set(s.x + dx / 2, 0.05, s.z + dz / 2);
        s.m.rotation.set(-Math.PI / 2, 0, -Math.atan2(dz, dx));
        s.m.scale.set(Math.max(len, 0.01), 0.55 * fade + 0.1, 1);
        s.m.material.opacity = 0.75 * fade;
      }

      // auras under units with an active buff
      const seen = new Set();
      for (const e of Object.values(state.entities)) {
        if ((!e.buffs && !e.downed) || e.dead) continue;
        const p = posOf(e.id);
        if (!p) continue;
        for (const name of [...Object.keys(e.buffs || {}), ...(e.downed ? ['downed'] : [])]) {
          const a = AURAS[name];
          if (!a) continue;
          const key = `${e.id}:${name}`;
          seen.add(key);
          let m = auras.get(key);
          if (!m) { m = flat(a.geo, a.color, a.opacity); scene.add(m); auras.set(key, m); }
          const pulse = 1 + 0.08 * Math.sin(performance.now() / 160 + e.id * 1.7);
          m.position.set(p.x, 0.035, p.z);
          m.scale.set(a.size * pulse, a.size * pulse, 1);
        }
      }
      for (const [key, m] of auras) if (!seen.has(key)) { scene.remove(m); m.material.dispose(); auras.delete(key); }

      // execute channel bars over whoever is finishing someone off
      const busy = new Set();
      for (const e of Object.values(state.entities)) {
        const x = e.execute, p = posOf(e.id);
        if (!x || x.start === null || !p || !overlay) continue;
        busy.add(e.id);
        let el = bars.get(e.id);
        if (!el) { el = document.createElement('div'); el.className = 'channel'; el.innerHTML = '<i></i><span>Execute</span>'; overlay.appendChild(el); bars.set(e.id, el); }
        const k = Math.min(1, (state.tick - x.start) / x.len), s = unitToScreen(p.x, p.z, 2.75);
        el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
        el.firstChild.style.width = `${k * 100}%`;
      }
      for (const [id, el] of bars) if (!busy.has(id)) { el.remove(); bars.delete(id); }
    },
  };
}
