// Dropped bag items on the ground (2026-11-26; sim/ground_items.js): a small furoshiki cloth bundle lying where the
// hero dropped it, painted like the item icons (render/wild_drop_fx.js style): a low cloth body spreading into two
// corners on the grass, gathered into one knot with a long and a short tail, fold creases, a pale dot band, top-left
// light, the scene's haze and grain, a darker edge on the shadow side only. It stands up toward the camera as a picture
// with a soft green-brown contact shadow on the ground and a lantern-amber rim breathing behind it so it can be found
// again (see-through, 15% to 45%, 2026-11-23). Three dyes, each with its own pose, by bundle; blind critic 2026-11-26.
import * as THREE from 'three';
import { CAM_QUAT, CAM_UP } from './iso.js';
import { onFxLayer } from './bloom.js';
import { groundY } from '../castle_height.js';

const W = 40, H = 34, S = 4, P = 10;   // picture size in page pixels, drawn at S times; P: the rim's margin
const WIDE = 1.15;                      // world width of the picture
const DYES = [
  { cloth: '#5a6c7c', light: '#7f8f9a', dark: '#323e4a', ink: 'rgba(216,210,190,.42)' },  // faded indigo
  { cloth: '#7e5440', light: '#9c745c', dark: '#4a2e22', ink: 'rgba(232,210,178,.34)' },   // persimmon
  { cloth: '#a08860', light: '#bfa77c', dark: '#5e4c32', ink: 'rgba(58,42,26,.5)' },      // tea-stained cotton
];
// three ways a bundle lies (by bundle): squat, fuller, slumped over on one side
const POSES = [{ w: 1, h: .92, lean: 0 }, { w: .9, h: 1.14, lean: -.05 }, { w: 1.06, h: .84, lean: .24 }];
// the body: wide and low, the cloth spreading into two corners on the grass, gathered up to one knot on top
function body(g) {
  g.beginPath();
  g.moveTo(5, 28); g.lineTo(1.5, 32); g.quadraticCurveTo(6, 31.6, 10, 31.2);
  g.quadraticCurveTo(21, 33.6, 31, 31); g.quadraticCurveTo(35, 31.8, 38.5, 31.5); g.lineTo(35.5, 27.5);
  g.bezierCurveTo(38, 21, 32, 15, 23.5, 14.5); g.lineTo(18.5, 14.5);
  g.bezierCurveTo(9, 15, 2.5, 21, 5, 28); g.closePath();
}
// the knot and its two tails: one long, flopping over to the right, one short stub to the left
function knot(g) {
  g.beginPath(); g.ellipse(21, 13.2, 3.4, 2.4, -.15, 0, Math.PI * 2);
  g.moveTo(23.5, 12); g.quadraticCurveTo(29, 8, 33.5, 13.5); g.quadraticCurveTo(29.5, 12, 23.8, 14.4);
  g.moveTo(18.4, 12.2); g.quadraticCurveTo(15.5, 8.5, 12.5, 10.5); g.quadraticCurveTo(15.5, 11.8, 18.2, 14);
}
function shape(g) { body(g); g.fill(); knot(g); g.fill(); }   // the whole outline (rim)
function paint(dye, pose) {
  const d = DYES[dye], p = POSES[pose], c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const g = c.getContext('2d'); g.scale(S, S); g.lineJoin = 'round'; g.lineCap = 'round';
  g.translate(20, 32); g.transform(p.w, 0, -p.lean, p.h, 0, 0); g.translate(-20, -32);   // pose: about the ground point
  body(g); g.fillStyle = d.cloth; g.fill();
  g.save(); body(g); g.clip();
  const lit = g.createLinearGradient(6, 12, 32, 33); lit.addColorStop(0, d.light); lit.addColorStop(.42, 'rgba(0,0,0,0)'); lit.addColorStop(1, d.dark);
  g.globalAlpha = .9; g.fillStyle = lit; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  g.fillStyle = d.ink;   // one bold motif that holds at play size: a pale band of three big dots across the cloth
  for (const [x, y] of [[12, 22], [20.5, 23.5], [29, 22]]) { g.beginPath(); g.ellipse(x, y, 2.3, 1.7, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(15,10,6,.38)'; g.lineWidth = 1;   // folds gathered into the knot
  for (const [x1, x2, y2] of [[19, 9, 28], [20.5, 16, 31], [22, 26, 31], [23, 33, 27]]) { g.beginPath(); g.moveTo(x1, 15); g.quadraticCurveTo((x1 + x2) / 2, (15 + y2) / 2 - 1, x2, y2); g.stroke(); }
  g.fillStyle = 'rgba(30,34,20,.4)'; g.fillRect(0, 29.5, W, 6);   // ground colour reflected low down
  g.restore();
  // a darker edge of the cloth's own colour, on the shadow side only (no ink outline)
  g.save(); g.beginPath(); g.moveTo(40, 8); g.lineTo(40, 40); g.lineTo(0, 40); g.lineTo(0, 30); g.lineTo(24, 18); g.closePath(); g.clip();
  body(g); g.strokeStyle = d.dark; g.lineWidth = 1.1; g.stroke(); g.restore();
  knot(g); g.fillStyle = d.cloth; g.fill();
  g.save(); knot(g); g.clip(); const kl = g.createLinearGradient(14, 8, 30, 15); kl.addColorStop(0, d.light); kl.addColorStop(1, d.dark); g.fillStyle = kl; g.globalAlpha = .75; g.fillRect(0, 0, W, H); g.restore();
  g.strokeStyle = d.dark; g.lineWidth = .7; knot(g); g.stroke();
  g.globalCompositeOperation = 'source-atop'; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(112,118,104,.16)'; g.fillRect(0, 0, c.width, c.height);   // the scene's haze
  g.globalCompositeOperation = 'source-over';
  const img = g.getImageData(0, 0, c.width, c.height);   // painterly grain
  let seed = 7 + dye * 13 + pose * 5;
  for (let i = 0; i < img.data.length; i += 4) { if (!img.data[i + 3]) continue; seed = (seed * 16807) % 2147483647; const n = (seed / 2147483647 - .5) * 22; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return c;
}
// the rim: the same outline, blurred warm, drawn behind the picture
function rim(pose) {
  const p = POSES[pose], c = document.createElement('canvas'); c.width = (W + P * 2) * S; c.height = (H + P * 2) * S;
  const g = c.getContext('2d'); g.scale(S, S); g.translate(P, P);
  g.translate(20, 32); g.transform(p.w, 0, -p.lean, p.h, 0, 0); g.translate(-20, -32);
  g.fillStyle = 'rgba(232,176,96,.24)';   // lantern amber, the outline grown out in soft steps
  for (let k = 4; k >= 1; k--) { g.save(); g.translate(20, 24); g.scale(1 + k * .06, 1 + k * .075); g.translate(-20, -24); shape(g); g.restore(); }
  return c;
}
const radial = stops => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, s] of stops) gr.addColorStop(o, s); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); };
const tex = new Map(), rims = []; let shadowTex = null;
const texOf = (dye, pose) => { const k = `${dye}:${pose}`; if (!tex.has(k)) { const t = new THREE.CanvasTexture(paint(dye, pose)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; tex.set(k, t); } return tex.get(k); };
const shadow = () => shadowTex ||= radial([[0, 'rgba(22,24,12,.7)'], [.55, 'rgba(22,24,12,.6)'], [.8, 'rgba(22,24,12,.25)'], [1, 'rgba(22,24,12,0)']]);   // dark green-brown, not black
// a picture standing up toward the camera, its bottom edge on the ground point
function card(map, w, h, order) {
  const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
  m.quaternion.copy(CAM_QUAT); m.renderOrder = order; m.frustumCulled = false; return m;
}

export function createGroundItemsFx({ scene }) {
  const shown = new Map();   // bundle id -> { pic, glow, under, ph }
  let time = 0;
  // place: the ground being drawn ('world' on the island, 'street' in the city); bundles: state.groundItems.items
  function update(place, bundles, dt) {
    time += dt;
    const want = place ? Object.values(bundles || {}).filter(b => b.place === place) : [];
    const keep = new Set(want.map(b => b.id));
    for (const [id, s] of shown) if (!keep.has(id)) { scene.remove(s.pic, s.glow, s.under); shown.delete(id); }
    for (const b of want) {
      let s = shown.get(b.id);
      if (!s) {
        const n = parseInt(b.id.slice(1), 10) || 0, h = WIDE * H / W;
        const dye = n % 3, pose = [0, 2, 1][dye], pic = card(texOf(dye, pose), WIDE, h, 99795);
        rims[pose] ||= new THREE.CanvasTexture(rim(pose));
        const glow = onFxLayer(card(rims[pose], WIDE * (W + P * 2) / W, h * (H + P * 2) / H, 99794));
        glow.material.blending = THREE.AdditiveBlending; glow.material.depthTest = false;
        const under = new THREE.Mesh(new THREE.PlaneGeometry(WIDE * 1.5, WIDE * 1.6), new THREE.MeshBasicMaterial({ map: shadow(), transparent: true, depthWrite: false }));
        under.rotation.x = -Math.PI / 2; under.renderOrder = 3; under.frustumCulled = false;
        if (n % 2) pic.scale.x = glow.scale.x = -1;   // every other one lies mirrored, each tipped a few degrees its own way
        pic.rotateZ(((n * 37) % 9 - 4) * .015); glow.rotateZ(((n * 37) % 9 - 4) * .015);
        scene.add(under, glow, pic); shown.set(b.id, s = { pic, glow, under, ph: n * 1.3 });
      }
      const y = place === 'world' ? groundY(b.x, b.z) : 0;
      s.under.position.set(b.x + .18, y + .05, b.z + .06);   // a touch toward the side away from the upper-left sun
      s.pic.position.set(b.x, y + .02, b.z);
      s.glow.position.set(b.x, y + .02, b.z).addScaledVector(CAM_UP, -WIDE * P / W);   // centred on the picture
      s.glow.material.opacity = .3 + .15 * Math.sin(time * 3.6 + s.ph);   // breathes on a ~1.7 s cycle, 15% to 45%
    }
  }
  return { update };
}
