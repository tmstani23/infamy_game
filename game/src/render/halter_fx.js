// Catching a wild horse (wildlife W6, Tim 2026-11-24): the hero walks up to the horse's head and slips a rope
// halter over its muzzle, Misaki herder style. Nothing is thrown (Tim 2026-11-24: a thrown loop reads as a lasso,
// and no Wild West). The noseband slides up the muzzle and snugs on, the crown strap goes up behind the ears, and a
// short slack lead hangs back to his hand, then it all fades. Soft tan, a little see-through.
// Sim: a 'halterThrow' cast { a: hero id, horse: the tamed horse's id, x, z, tx, tz } (sim/wild_animals.js catchHorse).
import * as THREE from 'three';
import { CAM_RIGHT, CAM_UP, VIEW_DIR } from './iso.js';
import { groundY } from '../castle_height.js';

const SLIP = 0.4, HOLD = 1.3, FADE = 0.45, END = SLIP + HOLD;
const WIDTH = 0.075, ALPHA = 0.66, MAXV = 1800;
// where the head is on a horse sprite cell, by facing (0 S .. 7 SE), as cell fractions (mare/warhorse sheets)
const HEAD = [[0.5, 0.38], [0.34, 0.43], [0.235, 0.38], [0.34, 0.3], [0.5, 0.22], [0.67, 0.29], [0.765, 0.37], [0.66, 0.475]];

const v3 = () => new THREE.Vector3();
const scr = (o, u, v) => o.clone().addScaledVector(CAM_RIGHT, u).addScaledVector(CAM_UP, v);   // a point in the screen plane round o
const loop = (c, rx, ry, n, sag = 0, tilt = 0) => {   // a rope loop round c, its lower side drooping by sag
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n * Math.PI * 2 + Math.PI / 2, x = Math.cos(t) * rx, y = Math.sin(t) * ry;
    out.push(scr(c, x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt) + Math.min(0, y) * sag));
  }
  return out;
};
const sagLine = (a, b, n, sag) => {   // a hanging rope from a to b, lowest in the middle
  const out = [];
  for (let i = 0; i <= n; i++) { const k = i / n; out.push(a.clone().lerp(b, k).addScaledVector(CAM_UP, -Math.sin(Math.PI * k) * sag)); }
  return out;
};

// look(id): { pos (feet, THREE.Vector3), centre (sprite centre), cell (world size of the sprite cell), dir } or null
export function createHalterFx({ scene }) {
  const pos = new Float32Array(MAXV * 3), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(194 / 255, 164 / 255, 116 / 255, THREE.SRGBColorSpace),
    transparent: true, opacity: ALPHA, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 99300; mesh.visible = false; scene.add(mesh);
  const live = [];
  let nv = 0;
  const strip = (pts, w) => {   // a camera-facing ribbon along pts
    const side = v3(), seg = v3();
    for (let i = 0; i + 1 < pts.length && nv + 6 <= MAXV; i++) {
      const a = pts[i], b = pts[i + 1];
      seg.subVectors(b, a); if (seg.lengthSq() < 1e-8) continue;
      side.crossVectors(seg, VIEW_DIR).normalize().multiplyScalar(w / 2);
      for (const p of [a.clone().add(side), a.clone().sub(side), b.clone().add(side), b.clone().add(side), a.clone().sub(side), b.clone().sub(side)]) {
        pos[nv * 3] = p.x; pos[nv * 3 + 1] = p.y; pos[nv * 3 + 2] = p.z; nv++;
      }
    }
  };
  function cast(c) {
    live.push({ t: 0, hero: c.a, horse: c.horse, from: { x: c.x, z: c.z }, to: { x: c.tx, z: c.tz }, hand: null, head: null });
  }
  function update(dt, look, show = true) {
    nv = 0;
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i];
      f.t += dt;
      if (f.t >= END) { live.splice(i, 1); continue; }
      const h = look(f.hero), m = look(f.horse);
      if (h) f.hand = h.pos.clone().add(new THREE.Vector3(0, 1.15, 0));
      else if (!f.hand) f.hand = new THREE.Vector3(f.from.x, groundY(f.from.x, f.from.z) + 1.15, f.from.z);
      if (m) { const [u, v] = HEAD[((m.dir ?? 2) % 8 + 8) % 8]; f.head = scr(m.centre, (u - 0.5) * m.cell, (0.5 - v) * m.cell); f.back = u > 0.55 ? -1 : u < 0.45 ? 1 : 0; }   // back: which way the ears and neck lie on screen
      else if (!f.head) f.head = new THREE.Vector3(f.to.x, groundY(f.to.x, f.to.z) + 1.6, f.to.z);
      const side = Math.sign(f.head.clone().sub(f.hand).dot(CAM_RIGHT)) || 1;
      const hand = scr(f.hand, side * 0.22, 0), head = f.head;
      const k = Math.min(1, f.t / SLIP), e = k * k * (3 - 2 * k);
      const nose = scr(head, -(f.back ?? side) * 0.1 * (1 - e), -0.05 - 0.06 * (1 - e));   // slides up from the nose tip
      const r = 0.1 + 0.06 * (1 - e);
      strip(loop(nose, r, r * 0.62, 16), WIDTH);                                                        // the noseband
      const back = f.back ?? side, cheek = scr(nose, back * r * 0.9, 0.02), poll = scr(nose, back * 0.26, 0.28 * e + 0.06);
      strip([cheek, cheek.clone().lerp(poll, 0.5).addScaledVector(CAM_UP, 0.02), poll], WIDTH);   // the crown strap up behind the ears
      const knot = scr(nose, -side * 0.02, -r * 0.62);
      strip(sagLine(hand, knot, 12, 0.28 + 0.1 * Math.sin(Math.min(1, f.t / (SLIP + 0.3)) * Math.PI)), WIDTH);   // a short slack lead to his hand, one small tug
    }
    const fade = live.reduce((o, f) => Math.max(o, f.t > END - FADE ? (END - f.t) / FADE : 1), 0);
    mat.opacity = ALPHA * fade;
    geo.attributes.position.needsUpdate = true;
    geo.setDrawRange(0, nv);
    mesh.visible = show && nv > 0;
  }
  function clear() { live.length = 0; mesh.visible = false; }
  return { cast, update, clear };
}
