// Stolen chest (train robbery R3/R4, Tim 2026-11-20): the chest of loot a hero carries after robbing a train, shown
// floating over their head, and a dropped chest lying on the ground (state.frontier.rail.chests) with a slow gold glint
// so it can be found again. Sim: sim/frontier/rail_robbery.js. Drawn in the painted look: a small wooden chest with
// iron bands, each face lit by the same upper-left sun as the rail blast debris.
// The guard's lantern (Tim 2026-11-21, replaces the hard warm flash): a small iron lantern with red glass hangs on the
// camera side of a stopped train's freight wagon and swings a little; lights() gives a real soft red light for view.js,
// so it pools on the ground like a city lantern. The sim counts that pool as lit for stealth (sim/game.js islandLit).
import * as THREE from 'three';
import { CAM_QUAT } from './iso.js';
import { onFxLayer } from './bloom.js';
import { groundY } from '../castle_height.js';

const SUN = new THREE.Vector3(-.45, .75, .5).normalize();
function shadedBox(w, h, d, hex) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed(); geo.computeVertexNormals();
  const n = geo.attributes.normal, base = new THREE.Color(hex), col = new Float32Array(n.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    const k = .45 + .75 * Math.max(0, v.dot(SUN));
    col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
}
function chestMesh() {
  const g = new THREE.Group();
  const body = shadedBox(.62, .34, .4, 0x5a3e26); body.position.y = .17; g.add(body);
  const lid = shadedBox(.64, .14, .42, 0x664629); lid.position.y = .41; g.add(lid);
  for (const x of [-.22, .22]) { const b = shadedBox(.06, .5, .44, 0x3b3a3a); b.position.set(x, .26, 0); g.add(b); }   // iron bands
  const lock = shadedBox(.1, .1, .03, 0xb08a3e); lock.position.set(0, .33, .215); g.add(lock);   // brass lock
  g.traverse(m => { m.renderOrder = 99795; m.frustumCulled = false; });
  return g;
}
let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,214,140,.9)'); gr.addColorStop(.4, 'rgba(230,170,80,.35)'); gr.addColorStop(1, 'rgba(200,140,60,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return glowTex = new THREE.CanvasTexture(c);
}

function lanternMesh() {
  const g = new THREE.Group();
  const frame = shadedBox(.22, .3, .22, 0x2a1d16); frame.position.y = -.2; g.add(frame);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(.17, .22, .235), new THREE.MeshBasicMaterial({ color: 0xff5a2e })); glass.position.y = -.2; g.add(glass);
  const glass2 = new THREE.Mesh(new THREE.BoxGeometry(.235, .22, .17), new THREE.MeshBasicMaterial({ color: 0xff5a2e })); glass2.position.y = -.2; g.add(glass2);
  const cap = shadedBox(.26, .06, .26, 0x1e1510); cap.position.y = -.03; g.add(cap);
  const hook = shadedBox(.03, .14, .03, 0x1e1510); hook.position.y = .06; g.add(hook);
  g.traverse(m => { m.renderOrder = 99795; m.frustumCulled = false; if (m.material) m.material.depthTest = false; });   // hangs on the near side: drawn over the wagon art
  return { g, glass: [glass, glass2] };
}
// a four-point gold sparkle (loot here) and the lantern's turning beam on the ground (the alarm)
let starTex = null, beamTex = null;
function star() {
  if (starTex) return starTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,246,214,1)'); g.addColorStop(.25, 'rgba(255,214,130,.55)'); g.addColorStop(1, 'rgba(255,190,90,0)');
  x.fillStyle = g; x.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 4 : 30; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  x.closePath(); x.fill();
  return starTex = new THREE.CanvasTexture(c);
}
function beam() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), img = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const dx = (i - 64) / 64, dy = (j - 64) / 64, r = Math.hypot(dx, dy), a = Math.abs(Math.atan2(dy, dx));   // a soft wedge toward +x
    const k = Math.max(0, 1 - a / .42) ** 1.5 * Math.max(0, 1 - r) ** 1.2 * Math.min(1, r * 6);
    const o = (j * 128 + i) * 4; img.data[o] = 255; img.data[o + 1] = 120; img.data[o + 2] = 70; img.data[o + 3] = k * 255;
  }
  x.putImageData(img, 0, 0);
  return beamTex = new THREE.CanvasTexture(c);
}
// the ground side of the camera: lanterns hang on the wagon's near side
const NEAR = (() => { const v = new THREE.Vector3(0, 0, 1).applyQuaternion(CAM_QUAT); v.y = 0; return v.normalize(); })();

export function createStolenChests({ scene }) {
  const shown = new Map();   // key -> { g, glint }
  const lamps = new Map();   // train id -> { g, glass, halo, light }
  let time = 0;
  function make() {
    const g = chestMesh();
    const glint = onFxLayer(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: glow(), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })));
    glint.quaternion.copy(CAM_QUAT); glint.renderOrder = 99796; glint.frustumCulled = false;
    scene.add(g, glint);
    return { g, glint };
  }
  // show: on the island view; chests: state.frontier.rail.chests; carriers: [{ id, x, y, z }] heroes with a chest (sprite spots);
  // wagons: [{ id, x, z, fast }] freight wagons of trains stopped at a blown gap: each gets the guard's lantern, a touch
  //  brighter while a hold runs
  function update(show, chests, carriers, dt, robbed = []) {
    time += dt;
    const want = new Map();
    if (show) {
      for (const c of Object.values(chests || {})) want.set(`g:${c.id}`, { x: c.x, y: groundY(c.x, c.z), z: c.z, ground: true });
      for (const h of carriers) want.set(`h:${h.id}`, { x: h.x, y: h.y + 2.1 + Math.sin(time * 2.4) * .06, z: h.z });
    }
    for (const [k, s] of shown) if (!want.has(k)) { scene.remove(s.g, s.glint); shown.delete(k); }
    for (const [k, w] of want) {
      let s = shown.get(k); if (!s) shown.set(k, s = make());
      s.g.position.set(w.x, w.y, w.z);
      s.g.rotation.y = w.ground ? .6 : .6 + Math.sin(time * .9) * .25;
      s.g.scale.setScalar(w.ground ? 1.15 : .85);
      s.glint.position.set(w.x, w.y + .3, w.z);
      s.glint.material.opacity = w.ground ? .35 + .3 * Math.sin(time * 3) : .25;
    }
    // the guard's lanterns
    const lit = new Set();
    if (show) for (const r of robbed) {
      lit.add(r.id);
      let L = lamps.get(r.id);
      if (!L) {
        const m = lanternMesh();
        const halo = onFxLayer(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glow(), color: 0xff6a3a, transparent: true, opacity: .32, depthTest: false, depthWrite: false })));
        halo.quaternion.copy(CAM_QUAT); halo.renderOrder = 99794; halo.frustumCulled = false;
        const sweep = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: beam(), transparent: true, opacity: .2, depthWrite: false, blending: THREE.AdditiveBlending }));
        sweep.rotation.x = -Math.PI / 2; sweep.renderOrder = 3; sweep.frustumCulled = false;
        const stars = [0, 1, 2, 3, 4].map(i => { const st = onFxLayer(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: star(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })));
          st.quaternion.copy(CAM_QUAT); st.renderOrder = 99796; st.frustumCulled = false; st.userData = { ph: Math.random() * 6.3, sp: 1.6 + Math.random() * 1.4, ox: (Math.random() - .5) * 2.6, oz: (Math.random() - .5) * 1.2, oy: 1.3 + Math.random() * .7 }; return st; });
        scene.add(sweep, ...stars); m.sweep = sweep; m.stars = stars; m.spin = Math.random() * 6.3;
        L = { ...m, halo, light: { pos: new THREE.Vector3(), radius: 6, color: new THREE.Color(0.9, 0.3, 0.12), fire: true, seed: Math.random() * 10 }, seed: Math.random() * 6 };
        scene.add(L.g, halo); lamps.set(r.id, L);
      }
      const y = groundY(r.x, r.z) + 1.75, x = r.x + NEAR.x * 1.15, z = r.z + NEAR.z * 1.15, sw = Math.sin(time * 1.6 + L.seed) * .16;   // a slow swing on its hook
      L.g.position.set(x, y, z); L.g.rotation.z = sw;
      const lx = x - Math.sin(sw) * .2, ly = y - .2;
      L.halo.position.set(lx, ly, z); L.halo.scale.setScalar(r.fast ? 1.1 : .9);
      L.light.pos.set(lx, ly, z); L.light.color.setRGB(r.fast ? 1 : .9, .3, .12);
      // the alarm: a soft red beam turning on the ground round the lantern, faster while the wagon is being robbed
      L.spin += dt * (r.fast ? 4.2 : 1.5);
      L.sweep.position.set(lx, groundY(lx, z) + .06, z); L.sweep.rotation.z = L.spin; L.sweep.material.opacity = r.fast ? .3 : .18;
      // loot to take: gold sparkles twinkling over the wagon until it has been robbed
      for (const st of L.stars) { const u = st.userData, tw = Math.max(0, Math.sin(time * u.sp + u.ph)) ** 3;
        st.visible = !r.robbed; st.position.set(r.x + u.ox, groundY(r.x, r.z) + u.oy, r.z + u.oz); st.scale.setScalar(.25 + .55 * tw); st.material.opacity = .9 * tw; st.material.rotation = time * .6 + u.ph; }
    }
    for (const [id, L] of lamps) if (!lit.has(id)) { scene.remove(L.g, L.halo, L.sweep, ...L.stars); lamps.delete(id); }
  }
  // real lights for view.js updateLights (the ground pool)
  const lights = () => [...lamps.values()].map(L => L.light);
  return { update, lights };
}
