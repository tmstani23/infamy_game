// Hit effects drawn from the sim's per-tick hits list: floating damage numbers (HTML
// overlay, League-style pop), slash trails and impact sparks (three.js, additive).
// Purely visual: nothing here changes the game state.
import * as THREE from 'three';
import { CAM_QUAT, CAM_RIGHT } from './iso.js';
import { onFxLayer } from './bloom.js';
import { groundY } from '../castle_height.js';

const BLADES = new Set(['ronin', 'swordsman', 'rival_yakuza', 'kuroda_spearman', 'ninja_leader', 'ninja_grunt', 'ninja_tanto']);
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
  // a small green "+N" for a heal tick (Rally, Tim 2026-10-19)
  function addHeal(x, z, amount) {
    const el = document.createElement('div');
    el.className = 'dmg heal';
    el.textContent = `+${amount}`;
    overlay.appendChild(el);
    // lower and off to the left of the unit, rising slower, so it never sits on the damage numbers (Tim)
    numbers.push({ el, x, z, age: 0, drift: -6 - Math.random() * 8, big: 1, ox: -34, low: true });
    while (numbers.length > MAX_NUMBERS) numbers.shift().el.remove();
  }
  function addDodge(h) {
    const el = document.createElement('div');
    el.className = 'dmg dodge'; el.textContent = 'DODGE';
    overlay.appendChild(el);
    numbers.push({ el, x: h.x, z: h.z, age: 0, drift: (Math.random() - 0.5) * 18, big: 0.85, subtle: true });
    while (numbers.length > MAX_NUMBERS) numbers.shift().el.remove();
  }
  // a refused order over the unit (Tim 2026-11-08: crew sent onto the boss's horse): a red cross and a short word
  function addRefuse(x, z, text, cls = 'refuse', mark = '✕') {
    const el = document.createElement('div');
    el.className = 'dmg ' + cls; el.innerHTML = `<b>${mark}</b> ${text}`;
    overlay.appendChild(el);
    numbers.push({ el, x, z, age: 0, drift: 0, big: 1 });
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
      const pop = !n.subtle && n.age < 0.12 ? 1.7 - 0.7 * (n.age / 0.12) : 1;
      const rise = n.low ? 6 + 30 * k : 38 + 70 * (1 - (1 - k) * (1 - k));
      n.el.style.transform = `translate(${s.x + (n.ox || 0) + n.drift * k}px, ${s.y - rise}px) translate(-50%, -50%) scale(${pop * n.big})`;
      n.el.style.opacity = (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4) * (n.subtle ? 0.85 : 1);
    }
  }

  // ---- slash trails -----------------------------------------------------------------
  const trails = [];
  // Tim 2026-11-13: the hard-edged band read as blocky. A tapered brush stroke instead: thin at both ends, thickest
  // just past the middle, faded at the tail (vertex alpha), so it reads painted rather than pixel cut.
  function strokeGeo(r, w, a0, span, n = 28) {
    const p = [], c = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = a0 + span * u, t = w * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.7), al = Math.sin(Math.PI * u) * (0.35 + 0.65 * u);
      for (const rr of [r - t / 2, r + t / 2]) { p.push(Math.cos(a) * rr, Math.sin(a) * rr, 0); c.push(1, 1, 1, al); }
      if (i) { const k = 2 * i; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 4)); g.setIndex(idx);
    return g;
  }
  const bladeGeo = strokeGeo(0.64, 0.16, -0.2, 2.3);
  const clubGeo = strokeGeo(0.58, 0.3, -0.1, 1.9, 22);
  function addTrail(attacker, blade) {
    const mat = new THREE.MeshBasicMaterial({
      color: blade ? 0xd8dde6 : 0xb08a60, vertexColors: true, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
      blending: THREE.NormalBlending, depthTest: false, depthWrite: false,   // Tim 2026-11-12: several swings at once added up to a bright blob; plain blending no longer stacks to white
    });
    const m = new THREE.Mesh(blade ? bladeGeo : clubGeo, mat);
    m.quaternion.copy(CAM_QUAT);
    // swing across the side the attacker faces on screen
    const right = new THREE.Vector3(attacker.fx, 0, attacker.fz).dot(CAM_RIGHT) >= 0;
    m.scale.set(right ? 1 : -1, 1, 1);
    m.position.set(attacker.x + attacker.fx * 0.5, 1.15 + groundY(attacker.x, attacker.z), attacker.z + attacker.fz * 0.5);
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
      t.m.material.opacity = 0.12 * (1 - k);   // Tim 2026-11-12: much dimmer (was 0.9)
      t.m.rotateZ(dt * 9 * Math.sign(t.m.scale.x));
      const s = 1 + 0.25 * k;
      t.m.scale.set(Math.sign(t.m.scale.x) * s, s, 1);
    }
  }

  // ---- impact sparks (pooled points, blood and dust) --------------------------------------
  // Tim 2026-11-13: blood instead of sparks. Dark red droplets spray from the hit and fall (normal blending, so they read
  // as paint, not light); hits on carts, guns and vehicles throw a little brown dust instead.
  // Tim 2026-11-13: square points looked like pixel blocks; each spark is now a soft round dab (radial falloff)
  const dab = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const x = cv.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(cv);
  })();
  // two layers: blood droplets 4 px (Tim 2026-11-13: 8 was too big, 1.6 too small), dust puffs 8 px
  const layer = size => {
    const pos = new Float32Array(MAX_SPARKS * 3), col = new Float32Array(MAX_SPARKS * 4), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size, map: dab, sizeAttenuation: false, vertexColors: true, transparent: true,
      blending: THREE.NormalBlending, depthTest: false, depthWrite: false,
    }));
    points.renderOrder = 99800;
    points.frustumCulled = false;
    scene.add(onFxLayer(points));
    return { pos, col, geo };
  };
  const bloodLayer = layer(4), dustLayer = layer(8);
  const sparks = [];
  const BLOOD = [new THREE.Color(0.55, 0.05, 0.04), new THREE.Color(0.68, 0.08, 0.06), new THREE.Color(0.42, 0.03, 0.03)], DUST = new THREE.Color(0.45, 0.38, 0.3);
  function addSparks(h, blade, bleeds = true) {
    const n = (h.crit ? 12 : h.kill ? 10 : 5) + (blade ? 2 : 0);
    for (let i = 0; i < n && sparks.length < MAX_SPARKS; i++) {
      const a = Math.random() * Math.PI * 2, up = 1 + Math.random() * 2.2, sp = 0.8 + Math.random() * (h.crit ? 3 : 1.8);
      sparks.push({ x: h.x, y: 1.0 + Math.random() * 0.3, z: h.z, vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp, age: 0, life: 0.45 + Math.random() * 0.35, c: bleeds ? BLOOD[i % 3] : DUST, a: bleeds ? 0.9 : 0.45 });
    }
  }
  function updateSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age >= p.life) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt; p.vy -= 9 * dt; if (p.y <= 0.05) p.vx = p.vz = 0;   // droplets land and stop
    }
    for (const L of [bloodLayer, dustLayer]) {
      let i = 0;
      for (const p of sparks) {
        if ((p.c === DUST) !== (L === dustLayer)) continue;
        L.pos.set([p.x, p.y, p.z], i * 3);
        const f = 1 - p.age / p.life;
        L.col.set([p.c.r, p.c.g, p.c.b, p.a * Math.sqrt(f)], i * 4);
        i++;
      }
      L.geo.setDrawRange(0, i);
      L.geo.attributes.position.needsUpdate = L.geo.attributes.color.needsUpdate = true;
    }
  }

  return {
    heal: addHeal,
    dodge: addDodge,
    refuse: addRefuse,
    note: (x, z, text) => addRefuse(x, z, text, 'boarded', '▲'),   // a gold confirmation over a unit (crew popped into a vehicle)
    // h: one entry of state.hits; attacker: its entity (for facing), mine: the victim is on my side
    // quiet: no floating damage number (Tim 2026-11-12: none on the frontier)
    hit(h, attacker, mine, quiet = false, bleeds = true) {
      const blade = BLADES.has(h.weapon);
      if (!quiet) addNumber(h, mine);
      addSparks(h, blade, bleeds);
      const d = attacker ? Math.hypot(h.x - attacker.x, h.z - attacker.z) || 1 : 0;
      if (attacker && d <= 4) {   // a swing trail only for a close-up hit, not at an archer or rifleman far away
        addTrail({ x: attacker.x, z: attacker.z, fx: (h.x - attacker.x) / d, fz: (h.z - attacker.z) / d }, blade);
      }
    },
    update(dt) { updateNumbers(dt); updateTrails(dt); updateSparks(dt); },
  };
}
