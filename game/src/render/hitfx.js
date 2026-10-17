// Hit effects drawn from the sim's per-tick hits list: floating damage numbers (HTML
// overlay, League-style pop), slash trails and impact sparks (three.js, additive).
// Purely visual: nothing here changes the game state.
import * as THREE from 'three';
import { CAM_QUAT, CAM_RIGHT } from './iso.js';
import { onFxLayer } from './bloom.js';

const BLADES = new Set(['ronin', 'swordsman', 'rival_yakuza', 'ninja_leader', 'ninja_grunt']);
const MAX_NUMBERS = 40, NUMBER_LIFE = 0.85, TRAIL_LIFE = 0.16, SPARK_LIFE = 0.32, MAX_SPARKS = 400;

export function createHitFx({ scene, overlay, unitToScreen }) {
  // ---- floating numbers -------------------------------------------------------------
  const numbers = [];
  function addNumber(h, mine) {
    const el = document.createElement('div');
    el.className = 'dmg' + (h.crit ? ' crit' : '') + (mine ? ' mine' : '') + (h.kill ? ' kill' : '');
    el.textContent = h.crit ? `${h.damage}!` : `${h.damage}`;
    overlay.appendChild(el);
    numbers.push({ el, x: h.x, z: h.z, age: 0, drift: (Math.random() - 0.5) * 50, big: h.crit ? 1.35 : 1 });
    while (numbers.length > MAX_NUMBERS) numbers.shift().el.remove();
  }
  function updateNumbers(dt) {
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i];
      n.age += dt;
      const k = n.age / NUMBER_LIFE;
      if (k >= 1) { n.el.remove(); numbers.splice(i, 1); continue; }
      const s = unitToScreen(n.x, n.z);
      // pop in big, settle, then rise and fade
      const pop = n.age < 0.12 ? 1.7 - 0.7 * (n.age / 0.12) : 1;
      const rise = 38 + 70 * (1 - (1 - k) * (1 - k));
      n.el.style.transform = `translate(${s.x + n.drift * k}px, ${s.y - rise}px) translate(-50%, -50%) scale(${pop * n.big})`;
      n.el.style.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }
  }

  // ---- slash trails -----------------------------------------------------------------
  const trails = [];
  const bladeGeo = new THREE.RingGeometry(0.55, 0.72, 24, 1, -0.2, 2.3);
  const clubGeo = new THREE.RingGeometry(0.4, 0.75, 18, 1, -0.1, 1.9);
  function addTrail(attacker, blade) {
    const mat = new THREE.MeshBasicMaterial({
      color: blade ? 0xe4ecff : 0xe0a060, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    });
    const m = new THREE.Mesh(blade ? bladeGeo : clubGeo, mat);
    m.quaternion.copy(CAM_QUAT);
    // swing across the side the attacker faces on screen
    const right = new THREE.Vector3(attacker.fx, 0, attacker.fz).dot(CAM_RIGHT) >= 0;
    m.scale.set(right ? 1 : -1, 1, 1);
    m.position.set(attacker.x + attacker.fx * 0.5, 1.15, attacker.z + attacker.fz * 0.5);
    m.renderOrder = 99700;
    m.frustumCulled = false;
    scene.add(onFxLayer(m));
    trails.push({ m, age: 0 });
  }
  function updateTrails(dt) {
    for (let i = trails.length - 1; i >= 0; i--) {
      const t = trails[i];
      t.age += dt;
      const k = t.age / TRAIL_LIFE;
      if (k >= 1) { scene.remove(t.m); t.m.material.dispose(); trails.splice(i, 1); continue; }
      t.m.material.opacity = 0.9 * (1 - k);
      t.m.rotateZ(dt * 9 * Math.sign(t.m.scale.x));
      const s = 1 + 0.25 * k;
      t.m.scale.set(Math.sign(t.m.scale.x) * s, s, 1);
    }
  }

  // ---- impact sparks (one pooled points cloud) --------------------------------------
  const pos = new Float32Array(MAX_SPARKS * 3), col = new Float32Array(MAX_SPARKS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 5, sizeAttenuation: false, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
  }));
  points.renderOrder = 99800;
  points.frustumCulled = false;
  scene.add(onFxLayer(points));
  const sparks = [];
  const STEEL = new THREE.Color(0.85, 0.92, 1), DUST = new THREE.Color(1, 0.72, 0.4), GOLD = new THREE.Color(1, 0.82, 0.3);
  function addSparks(h, blade) {
    const n = h.crit ? 16 : h.kill ? 14 : 8, c = h.crit ? GOLD : blade ? STEEL : DUST;
    for (let i = 0; i < n && sparks.length < MAX_SPARKS; i++) {
      const a = Math.random() * Math.PI * 2, up = 1.5 + Math.random() * 2.5, sp = 1.5 + Math.random() * (h.crit ? 4 : 2.5);
      sparks.push({ x: h.x, y: 1.1, z: h.z, vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp, age: 0, life: SPARK_LIFE * (0.6 + Math.random() * 0.6), c });
    }
  }
  function updateSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age >= p.life) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 9 * dt;
    }
    sparks.forEach((p, i) => {
      pos.set([p.x, p.y, p.z], i * 3);
      const f = 1 - p.age / p.life;
      col.set([p.c.r * f, p.c.g * f, p.c.b * f], i * 3);
    });
    geo.setDrawRange(0, sparks.length);
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
  }

  return {
    // h: one entry of state.hits; attacker: its entity (for facing), mine: the victim is on my side
    hit(h, attacker, mine) {
      const blade = BLADES.has(h.weapon);
      addNumber(h, mine);
      addSparks(h, blade);
      if (attacker) {
        const d = Math.hypot(h.x - attacker.x, h.z - attacker.z) || 1;
        addTrail({ x: attacker.x, z: attacker.z, fx: (h.x - attacker.x) / d, fz: (h.z - attacker.z) / d }, blade);
      }
    },
    update(dt) { updateNumbers(dt); updateTrails(dt); updateSparks(dt); },
  };
}
