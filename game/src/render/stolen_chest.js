// Stolen chest (train robbery R3/R4, Tim 2026-11-20): the chest of loot a hero carries after robbing a train, shown
// floating over their head, and a dropped chest lying on the ground (state.frontier.rail.chests) with a slow gold glint
// so it can be found again. Sim: sim/frontier/rail_robbery.js. Drawn in the painted look: a small wooden chest with
// iron bands, each face lit by the same upper-left sun as the rail blast debris.
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

export function createStolenChests({ scene }) {
  const shown = new Map();   // key -> { g, glint }
  let time = 0;
  function make() {
    const g = chestMesh();
    const glint = onFxLayer(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: glow(), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })));
    glint.quaternion.copy(CAM_QUAT); glint.renderOrder = 99796; glint.frustumCulled = false;
    scene.add(g, glint);
    return { g, glint };
  }
  // show: on the island view; chests: state.frontier.rail.chests; carriers: [{ id, x, y, z }] heroes with a chest (sprite spots);
  // robbed: [{ id, x, z, fast }] freight wagons of trains stopped at a blown gap and not yet robbed: they flash, faster
  //  while a hold runs (Tim 2026-11-20)
  function update(show, chests, carriers, dt, robbed = []) {
    time += dt;
    const want = new Map();
    if (show) {
      for (const c of Object.values(chests || {})) want.set(`g:${c.id}`, { x: c.x, y: groundY(c.x, c.z), z: c.z, ground: true });
      for (const h of carriers) want.set(`h:${h.id}`, { x: h.x, y: h.y + 2.1 + Math.sin(time * 2.4) * .06, z: h.z });
      for (const r of robbed) want.set(`w:${r.id}`, { x: r.x, y: groundY(r.x, r.z), z: r.z, wagon: true, fast: r.fast });
    }
    for (const [k, s] of shown) if (!want.has(k)) { scene.remove(s.g, s.glint); shown.delete(k); }
    for (const [k, w] of want) {
      let s = shown.get(k); if (!s) { shown.set(k, s = make()); if (w.wagon) { s.g.visible = false; s.glint.scale.setScalar(4.5); s.glint.material.color.set(0xff9a50); } }
      if (w.wagon) { s.glint.position.set(w.x, w.y + 1.3, w.z); s.glint.material.opacity = Math.max(0, Math.sin(time * (w.fast ? 11 : 4.5))) * .85; continue; }   // a hard warm flash on the wagon
      s.g.position.set(w.x, w.y, w.z);
      s.g.rotation.y = w.ground ? .6 : .6 + Math.sin(time * .9) * .25;
      s.g.scale.setScalar(w.ground ? 1.15 : .85);
      s.glint.position.set(w.x, w.y + .3, w.z);
      s.glint.material.opacity = w.ground ? .35 + .3 * Math.sin(time * 3) : .25;
    }
  }
  return { update };
}
