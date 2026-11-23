// War ships on the water (ships S2, plan war_build/ships/ships_plan.md 3b): a ring at the waterline sized to the hull in
// the side's colour (a soft fill inside while selected), a plate over the masthead (health bar and hold sockets with
// a count, in the lacquer and gold of the unit plates, replacing the small unit bar), and foam: a wake from the stern
// and a bow wave while the ship is under way, none when it lies still. Reads the view only.
// createShipMarks({ scene, types, holdOf }) -> { update(state, sprites, side, selected, dt), dispose() }
import * as THREE from 'three';
import { CAM_QUAT, VIEW_DIR } from './iso.js';
import { fxShared } from './vfx.js';

const FOAM = [0.8, 0.88, 0.9];   // off-white toward the sea
const OWN = 0x3fb6a8, FOE = 0xc4432c;   // softer than the unit rings: your teal, vermilion
const PLATE_PX = [330, 80], PLATE_W = 6.4;

// ---- foam particles: soft painted flecks lying on the water, under the ships -------------------------------
const F_VERT = /* glsl */`
uniform float uPx;
attribute vec2 aInfo;   // size (world units), alpha
varying float vA;
void main() { vA = aInfo.y; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); gl_PointSize = aInfo.x * uPx; }`;
const F_FRAG = /* glsl */`
uniform sampler2D uTex; uniform vec3 uColor;
varying float vA;
void main() { vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(uColor * t.rgb, t.a * vA); }`;
function fleckTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  // a few overlapping soft blobs, flattened as foam lying on the water seen from above at an angle
  for (const [x, y, r, a] of [[32, 33, 20, 0.7], [24, 30, 12, 0.5], [41, 35, 11, 0.5], [33, 27, 9, 0.45]]) {
    const q = g.createRadialGradient(x, y, 0, x, y, r);
    q.addColorStop(0, `rgba(255,255,255,${a})`); q.addColorStop(0.6, `rgba(255,255,255,${a * 0.45})`); q.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = q; g.beginPath(); g.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
export function createFoam(scene, max = 1600, color = FOAM, order = 2, tex = null) {   // ships S6: ship_fx.js uses it too
  const pos = new Float32Array(max * 3), info = new Float32Array(max * 2), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: { uPx: fxShared.uPx, uTex: { value: tex || fleckTexture() }, uColor: { value: new THREE.Vector3(...color) } },
    vertexShader: F_VERT, fragmentShader: F_FRAG, transparent: true, depthWrite: false }));
  points.renderOrder = order;   // with the unit rings: on the water, under the ships
  points.frustumCulled = false;
  scene.add(points);
  const list = [];
  return {
    emit(p) { if (list.length < max) list.push({ age: 0, grow: 1, drag: 1, ...p }); },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.age += dt;
        if (p.age >= p.life) { list[i] = list[list.length - 1]; list.pop(); continue; }
        const d = Math.exp(-p.drag * dt); p.vx *= d; p.vz *= d; p.x += p.vx * dt; p.z += p.vz * dt;
      }
      list.forEach((p, i) => {
        const k = p.age / p.life;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        info[i * 2] = p.size * (1 + (p.grow - 1) * k); info[i * 2 + 1] = p.alpha * Math.min(1, p.age / 0.12) * (1 - k) ** 1.3;
      });
      geo.setDrawRange(0, list.length);
      geo.attributes.position.needsUpdate = geo.attributes.aInfo.needsUpdate = true;
    },
    dispose() { scene.remove(points); geo.dispose(); points.material.uniforms.uTex.value.dispose(); points.material.dispose(); },
  };
}

const VG = new THREE.Vector3(VIEW_DIR.x, 0, VIEW_DIR.z).normalize();   // down-screen on the ground
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const q = g.createRadialGradient(32, 32, 2, 32, 32, 31); q.addColorStop(0, 'rgba(255,255,255,1)'); q.addColorStop(0.5, 'rgba(255,255,255,.6)'); q.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = q; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
// ---- the plate: health bar over hold sockets, cut corners, lacquer with a warm gold edge ---------------------
function drawPlate(g, { frac, enemy, n, hold, mend = null }) {
  const W = PLATE_PX[0], H = (hold ? PLATE_PX[1] : PLATE_PX[1] / 2) - 7, c = 12;
  g.clearRect(0, 0, W, PLATE_PX[1]);
  const cut = (x0, y0, x1, y1, k) => { g.beginPath(); g.moveTo(x0 + k, y0); g.lineTo(x1 - k, y0); g.lineTo(x1, y0 + k); g.lineTo(x1, y1 - k); g.lineTo(x1 - k, y1); g.lineTo(x0 + k, y1); g.lineTo(x0, y1 - k); g.lineTo(x0, y0 + k); g.closePath(); };
  cut(2, 2, W - 2, H - 2, c);
  const lac = g.createLinearGradient(0, 0, 0, H); lac.addColorStop(0, 'rgba(38,24,17,.92)'); lac.addColorStop(1, 'rgba(18,11,8,.92)');
  g.fillStyle = lac; g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(10,6,4,.9)'; g.stroke();
  cut(4, 4, W - 4, H - 4, c - 1); g.lineWidth = 1.6; g.strokeStyle = 'rgba(190,150,82,.85)'; g.stroke();
  // a small tab under the middle, pointing down at the masthead
  g.beginPath(); g.moveTo(W / 2 - 9, H - 3); g.lineTo(W / 2, H + 6); g.lineTo(W / 2 + 9, H - 3); g.closePath(); g.fillStyle = 'rgba(18,11,8,.95)'; g.fill();
  g.lineWidth = 1.6; g.strokeStyle = 'rgba(190,150,82,.85)'; g.beginPath(); g.moveTo(W / 2 - 9, H - 3); g.lineTo(W / 2, H + 6); g.lineTo(W / 2 + 9, H - 3); g.stroke();
  // health: a sunk trough, the fill with a lighter top edge (yours muted green, enemies red)
  const bx = 16, by = hold ? 13 : 12, bw = W - 32, bh = 16;
  g.fillStyle = '#080504'; g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  g.fillStyle = '#1c130e'; g.fillRect(bx, by, bw, bh);
  const [r, gg, b] = enemy ? [176, 62, 44] : [104, 160, 70];
  g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(bx, by, bw * frac, bh);
  g.fillStyle = 'rgba(255,240,200,.22)'; g.fillRect(bx, by, bw * frac, 4);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(bx, by + bh - 3, bw * frac, 3);
  if (mend != null && frac < 1) {   // ships S6: mending at the yard, a bright highlight running along the fill
    const x = bx + bw * frac * mend, q = g.createLinearGradient(x - 14, 0, x + 3, 0);
    q.addColorStop(0, 'rgba(244,250,214,0)'); q.addColorStop(0.8, 'rgba(244,250,214,0.75)'); q.addColorStop(1, 'rgba(255,255,236,0.95)');
    g.save(); g.beginPath(); g.rect(bx, by, bw * frac, bh); g.clip(); g.fillStyle = q; g.fillRect(x - 14, by, 17, bh); g.restore();
  }
  if (!hold) return;
  // hold: a small figure (men aboard), then one socket a place, then the count
  const y = 38, s = 14, gap = 3, ax = 25, ay = y + s / 2;
  g.fillStyle = '#d2a85a';
  g.beginPath(); g.arc(ax, ay - 5, 3.6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(ax - 7, ay + 8); g.quadraticCurveTo(ax, ay - 4, ax + 7, ay + 8); g.closePath(); g.fill();
  let x = 40;
  for (let i = 0; i < hold; i++) {
    if (i < n) {
      g.fillStyle = '#3a2814'; g.fillRect(x, y, s, s);
      const q = g.createLinearGradient(0, y, 0, y + s); q.addColorStop(0, '#f0cd7c'); q.addColorStop(1, '#b8873c');
      g.fillStyle = q; g.fillRect(x + 1.5, y + 1.5, s - 3, s - 3);
    } else {
      g.fillStyle = '#060403'; g.fillRect(x, y, s, s);
      g.fillStyle = '#1a120d'; g.fillRect(x + 2, y + 2, s - 3, s - 3);   // a recessed socket: dark top-left lip
    }
    x += s + gap;
  }
  g.font = '700 26px Georgia, "Times New Roman", serif'; g.textBaseline = 'middle'; g.textAlign = 'right';
  g.fillStyle = 'rgba(0,0,0,.7)'; g.fillText(`${n}/${hold}`, W - 13, ay + 2);
  g.fillStyle = '#ead7a6'; g.fillText(`${n}/${hold}`, W - 14, ay + 1);
}

export function createShipMarks({ scene, types, holdOf }) {
  const foam = createFoam(scene);
  const marks = new Map();   // ship id -> { ring, glow, fill, plate, key, last, carry }
  const RING_GEO = new THREE.RingGeometry(0.95, 1, 96), GLOW_GEO = new THREE.RingGeometry(0.935, 1.015, 96), DISC_GEO = new THREE.CircleGeometry(1, 48);
  const WASH = shadowTexture(), WASH_GEO = new THREE.PlaneGeometry(1, 1);
  function make(id) {
    const flat = (geo, opacity, order) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = order; scene.add(m); return m; };
    const canvas = document.createElement('canvas'); [canvas.width, canvas.height] = PLATE_PX;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    plate.scale.set(PLATE_W, PLATE_W * PLATE_PX[1] / PLATE_PX[0], 1); plate.quaternion.copy(CAM_QUAT); plate.renderOrder = 99600; scene.add(plate);
    // a soft dark band where the hull meets the water, along the heading (so a ship lying still sits in the sea)
    const wash = new THREE.Group(), band = new THREE.Mesh(WASH_GEO, new THREE.MeshBasicMaterial({ map: WASH, color: 0x050b14, transparent: true, opacity: 0.5, depthWrite: false }));
    band.rotation.x = -Math.PI / 2; band.renderOrder = 1; wash.add(band); scene.add(wash);
    const m = { wash, fill: flat(DISC_GEO, 0.06, 1), glow: flat(GLOW_GEO, 0.35, 2), ring: flat(RING_GEO, 0.85, 2.05), plate, g: canvas.getContext('2d'), tex, key: '', last: null, carry: 0, fwd: null };
    marks.set(id, m); return m;
  }
  function drop(id) {
    const m = marks.get(id); if (!m) return;
    for (const o of [m.fill, m.glow, m.ring, m.plate]) { scene.remove(o); if (o === m.plate) o.material.map?.dispose(); o.material.dispose(); }
    scene.remove(m.wash); m.wash.children[0].material.dispose();
    m.plate.geometry.dispose(); marks.delete(id);
  }
  const show = (m, on) => { for (const o of [m.fill, m.glow, m.ring, m.plate, m.wash]) o.visible = on; };

  // side: { colourOf(e) -> 0xRRGGBB (the side's unit ring colour), enemyOf(e), own(e) -> bool }, selected: Set of ids;
  // call after the units are placed each frame
  function update(state, sprites, side, selected, dt) {
    const seen = new Set();
    for (const e of Object.values(state.entities)) {
      if (!e.ship) continue;
      const s = sprites.get(e.id); if (!s) continue;
      seen.add(e.id);
      const m = marks.get(e.id) || make(e.id);
      const on = !e.dead && s.thing.mesh.visible;
      const barOn = s.bar.visible;   // view.js decided it (alive, not routing)
      s.bar.visible = false; if (s.ring) s.ring.visible = false; if (s.team) s.team.visible = false;   // the small unit marks stay off
      show(m, on);
      if (!on) { m.last = null; continue; }
      const CW = s.cellWorld ?? 16, R = CW * 0.4, sel = selected?.has(e.id), enemy = !!side.enemyOf?.(e), col = enemy ? FOE : side.own?.(e) ? OWN : side.colourOf(e);
      const p = s.pos, y = p.y + 0.02;
      // the hull's footprint on the water lies a little up-screen of the ship's point (the sheets stand it there)
      const up = CW * 0.13, cx = p.x - VG.x * up, cz = p.z - VG.z * up;
      for (const o of [m.ring, m.glow, m.fill]) { o.position.set(cx, y, cz); o.scale.setScalar(R); o.material.color.setHex(col); }
      m.glow.material.color.setHex(0x05080c);   // a thin dark edge so the ring holds on the water
      m.ring.material.opacity = sel ? 0.9 : 0.55; m.glow.material.opacity = sel ? 0.4 : 0.25; m.fill.visible = !!sel;
      const h = e.heading ?? 0, fwd = m.fwd || [Math.sin(h), Math.cos(h)];
      m.wash.position.set(cx, p.y + 0.015, cz); m.wash.rotation.y = Math.atan2(fwd[0], fwd[1]); m.wash.children[0].scale.set(CW * 0.2, CW * 0.66, 1);
      // the plate just over the masthead
      m.plate.visible = barOn;
      m.plate.position.set(p.x, p.y + (s.feetUp ?? 3.2) + (s.cellWorld ?? 16) * 0.36, p.z);
      const hold = holdOf(e), n = Object.values(state.entities).filter(u => u.inShip === e.id && !u.dead).length;
      const frac = Math.max(0, Math.min(1, (e.hp ?? 0) / (e.maxHp || 1)));
      const rows = enemy ? 0 : hold;   // an enemy's hold is not shown (with Board armed, S8)
      const mend = e.mending ? ((state.tick ?? 0) % 24) / 24 : null;   // ships S6
      const key = `${Math.round(frac * 100)}|${n}|${rows}|${enemy ? 1 : 0}|${mend}`;
      if (key !== m.key) { m.key = key; drawPlate(m.g, { frac, enemy, n, hold: rows, mend }); m.tex.needsUpdate = true;
        m.tex.repeat.set(1, rows ? 1 : 0.5); m.tex.offset.set(0, rows ? 0 : 0.5); m.plate.scale.y = PLATE_W * PLATE_PX[1] / PLATE_PX[0] * (rows ? 1 : 0.5); }
      // foam while under way: from how far the drawn ship moved this frame
      if (m.last && dt > 0) {
        const dx = p.x - m.last.x, dz = p.z - m.last.z, sp = Math.hypot(dx, dz) / dt;
        if (sp > 0.4 && sp < 40) { m.fwd = [dx / (sp * dt), dz / (sp * dt)]; emitFoam(m, { x: cx, y: p.y, z: cz }, m.fwd[0], m.fwd[1], sp, CW * 0.31, dt); }
      }
      m.last = { x: p.x, z: p.z };
    }
    for (const id of [...marks.keys()]) if (!seen.has(id)) drop(id);
    foam.update(dt);
  }
  // fx, fz: heading on the ground (unit); stern and bow along it from the centre
  function emitFoam(m, p, fx, fz, sp, half, dt) {
    const lx = -fz, lz = fx, y = p.y + 0.03, k = Math.min(1, sp / 5);
    m.carry += dt * 170 * k;
    while (m.carry >= 1) {
      m.carry -= 1;
      const r = Math.random();
      if (r < 0.42) {   // the two arms of the wake: flecks pushed out sideways from the stern, lingering
        const side = Math.random() < 0.5 ? -1 : 1, off = 0.5 + Math.random() * 0.6, out = (0.9 + Math.random() * 0.6) * k;
        foam.emit({ x: p.x - fx * half + lx * off * side, y, z: p.z - fz * half + lz * off * side, vx: lx * side * out - fx * 0.2, vz: lz * side * out - fz * 0.2,
          drag: 0.5, life: 2.4 + Math.random() * 0.8, size: 0.7 + Math.random() * 0.6, grow: 1.7, alpha: 0.32 + Math.random() * 0.16 });
      } else if (r < 0.6) {   // churn right behind the stern
        foam.emit({ x: p.x - fx * (half + Math.random() * 0.6) + lx * (Math.random() - 0.5) * 0.8, y, z: p.z - fz * (half + Math.random() * 0.6) + lz * (Math.random() - 0.5) * 0.8,
          vx: -fx * 0.3, vz: -fz * 0.3, drag: 1.2, life: 1.2 + Math.random() * 0.6, size: 1.0 + Math.random() * 0.6, grow: 1.6, alpha: 0.34 });
      } else {   // bow wave: thrown out both sides of the stem, short-lived, brightest
        const side = Math.random() < 0.5 ? -1 : 1, out = (1.4 + Math.random()) * k, a = Math.random() * 0.5;
        foam.emit({ x: p.x + fx * half * (1.08 - a * 0.6) + lx * (0.5 + a * 1.4) * side, y, z: p.z + fz * half * (1.08 - a * 0.6) + lz * (0.5 + a * 1.4) * side, vx: lx * side * out + fx * 0.2 * sp, vz: lz * side * out + fz * 0.2 * sp,
          drag: 2.0, life: 0.7 + Math.random() * 0.35, size: 0.5 + Math.random() * 0.4, grow: 1.5, alpha: 0.9 });
      }
    }
  }
  const dispose = () => { for (const id of [...marks.keys()]) drop(id); foam.dispose(); RING_GEO.dispose(); GLOW_GEO.dispose(); DISC_GEO.dispose(); WASH.dispose(); WASH_GEO.dispose(); };
  return { update, dispose };
}
