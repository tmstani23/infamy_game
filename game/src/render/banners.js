// Clan banners (Tim OK'd the mock 2026-10-19, business_visuals/ownership_mock_v2.png): a tall
// nobori in the owner's colour beside the door of every owned business, with a thin glowing
// outline and a faint ring at its foot; it swaps when the business changes hands. Reads
// state.businesses and state.clans only. The crest is also drawn for the clan badge (src/clan_badge.js).
import * as THREE from 'three';
import { CAM_QUAT, CAM_UP } from './iso.js';
import { Thing } from './scenery.js';

const W = 112, H = 300;                      // canvas pixels
const WORLD_H = 2.4,   // about a third of a building, a little taller than a person (Tim 2026-10-19)
      WORLD_W = WORLD_H * W / H;

// War Lantern (Tim OK'd business_visuals/war_lantern_mock_v3.png): art/props/war_lantern.png, the
// lantern post recoloured crimson with a gold crest, planted at a raid's lantern spot (sim/businesses.js)
const LW = 220, LH = 486, L_H = 2.9, L_W = L_H * LW / LH,
      L_FOOT = 72 / LW, L_PAPER = [168 / LW, 214 / LH];   // foot of the post, centre of the paper (texture uv from top-left)
const PULSE = 2 * Math.PI / 1.6;                           // a gentle beat, about every 1.6 s

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,110,70,1)'); grad.addColorStop(0.4, 'rgba(230,50,30,0.45)'); grad.addColorStop(1, 'rgba(200,30,20,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  return `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
};

// the clan crest (mon): a ring with three commas, in cream, centred on (cx, cy) with radius r
export function drawCrest(g, cx, cy, r, color = '#f0e8d6') {
  g.save();
  g.strokeStyle = g.fillStyle = color; g.lineWidth = r * 0.14;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094 - 1.57, bx = cx + Math.cos(a) * r * 0.42, by = cy + Math.sin(a) * r * 0.42;
    g.beginPath(); g.arc(bx, by, r * 0.27, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx, cy, r * 0.64, a, a + 1.2); g.stroke();
  }
  g.restore();
}

function bannerTexture(color) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = 22, top = 22, foot = H - 4, cb = top + 12;
  const x0 = px + 4, x1 = px + 56, y0 = cb + 4, y1 = foot - 96;
  const shape = () => {
    g.fillRect(px - 3, top, 6, foot - top);                       // pole
    g.fillRect(px, cb - 2, 58, 5);                                  // crossbar
    g.beginPath();                                                  // cloth with a forked hem
    g.moveTo(x0, y0); g.lineTo(x1, y0); g.lineTo(x1, y1 + 14); g.lineTo((x0 + x1) / 2, y1 + 5); g.lineTo(x0, y1 + 14); g.closePath(); g.fill();
  };
  // thin glowing outline: the silhouette drawn with a coloured blur behind everything
  g.save();
  g.shadowColor = shade(color, 1.5); g.shadowBlur = 7; g.fillStyle = shade(color, 1.3);
  g.globalAlpha = 0.7; shape();
  g.restore();
  // pole: black lacquer, a highlight, gold finial
  g.fillStyle = '#16100e'; g.fillRect(px - 3, top, 6, foot - top);
  g.fillStyle = '#50403a'; g.fillRect(px - 1, top, 1, foot - top);
  g.fillStyle = '#d4aa5a';
  g.beginPath(); g.moveTo(px, top - 16); g.lineTo(px - 5, top); g.lineTo(px + 5, top); g.closePath(); g.fill();
  g.beginPath(); g.arc(px, top + 2, 4, 0, Math.PI * 2); g.fill();
  // crossbar with a gold cap
  g.fillStyle = '#16100e'; g.fillRect(px, cb - 2, 58, 5);
  g.fillStyle = '#d4aa5a'; g.beginPath(); g.arc(px + 58, cb, 4, 0, Math.PI * 2); g.fill();
  // cloth: lighter at the top, darker toward the hem
  const grad = g.createLinearGradient(0, y0, 0, y1 + 14);
  grad.addColorStop(0, shade(color, 1.25)); grad.addColorStop(1, shade(color, 0.6));
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.lineTo(x1, y1 + 14); g.lineTo((x0 + x1) / 2, y1 + 5); g.lineTo(x0, y1 + 14); g.closePath(); g.fill();
  // gold border, loops on the pole
  g.strokeStyle = '#d4aa5a'; g.lineWidth = 1.2; g.strokeRect(x0 + 3.5, y0 + 3.5, x1 - x0 - 7, y1 - y0 - 4);
  g.fillStyle = '#1e1612'; for (let y = y0 + 10; y < y1; y += 26) g.fillRect(px - 4, y, 10, 4);
  // crest and brush strokes
  const cx = (x0 + x1) / 2;
  drawCrest(g, cx, y0 + 26, 14);
  g.strokeStyle = '#f0e8d6'; g.lineCap = 'round';
  [[0.22, 0.78], [0.3, 0.7], [0.18, 0.82]].forEach(([a, b], i) => {
    const y = y0 + 56 + i * 19;
    g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + (x1 - x0) * a, y); g.lineTo(x0 + (x1 - x0) * b, y + 2); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.moveTo(cx, y - 6); g.lineTo(cx - 2, y + 7); g.stroke();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function createBanners({ scene }) {
  const textures = new Map();          // colour -> texture
  const shown = new Map();             // business id -> { owner, mesh, ring, thing }
  const RING_GEO = new THREE.RingGeometry(0.46, 0.51, 48);
  const things = [];
  const holds = new Map();           // business id -> back-room ring
  const HOLD_GEO = new THREE.RingGeometry(0.93, 1, 64);

  const lanterns = new Map();        // business id -> { mesh, glow, pool, ring, thing }
  const knocks = new Map();          // business id -> the knock-down progress ring
  let lanternTex = null, glowTex = null;
  const POOL_GEO = new THREE.CircleGeometry(1, 48), LRING_GEO = new THREE.RingGeometry(0.97, 1, 64);

  function addLantern(x, z) {
    if (!lanternTex) {
      lanternTex = new THREE.TextureLoader().load('art/props/war_lantern.png');
      lanternTex.colorSpace = THREE.NoColorSpace;
      glowTex = glowTexture();
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(CAM_QUAT);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: lanternTex, transparent: true, depthWrite: false }));
    mesh.quaternion.copy(CAM_QUAT);
    mesh.scale.set(L_W, L_H, 1);
    mesh.position.set(x, 0, z).addScaledVector(CAM_UP, L_H / 2 - 0.02).addScaledVector(right, L_W * (0.5 - L_FOOT));
    mesh.frustumCulled = false;
    // soft red glow around the paper, drawn over the sprite
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.quaternion.copy(CAM_QUAT);
    glow.position.copy(mesh.position).addScaledVector(right, L_W * (L_PAPER[0] - 0.5)).addScaledVector(CAM_UP, L_H * (0.5 - L_PAPER[1]));
    glow.frustumCulled = false; glow.renderOrder = 4;
    // a faint pool of red light and a thin ring on the ground
    const pool = new THREE.Mesh(POOL_GEO, new THREE.MeshBasicMaterial({ color: 0xc82818, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Mesh(LRING_GEO, new THREE.MeshBasicMaterial({ color: 0xff7850, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (const m of [pool, ring]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); m.renderOrder = 2; }
    const thing = new Thing(mesh, { minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
    thing.extras.push(glow);
    scene.add(mesh, glow, pool, ring);
    things.push(thing);
    return { mesh, glow, pool, ring, thing };
  }
  function dropLantern(id) {
    const l = lanterns.get(id);
    scene.remove(l.mesh, l.glow, l.pool, l.ring);
    for (const m of [l.mesh, l.glow]) { m.geometry.dispose(); m.material.dispose(); }
    l.pool.material.dispose(); l.ring.material.dispose();
    things.splice(things.indexOf(l.thing), 1);
    lanterns.delete(id);
  }

  // beside the door ring, a step along the front of the building
  const spot = b => {
    const [rx, rz] = b.ring || b.door || [b.x, b.z];
    const ox = rx - b.x, oz = rz - b.z, len = Math.hypot(ox, oz) || 1;
    return [rx - oz / len * 1.6, rz + ox / len * 1.6];
  };

  function add(b, color) {
    if (!textures.has(color)) textures.set(color, bannerTexture(color));
    const [x, z] = spot(b);
    const mat = new THREE.MeshBasicMaterial({ map: textures.get(color), transparent: true, opacity: 0.82, depthWrite: false });   // a little see-through (Tim: subtle)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.quaternion.copy(CAM_QUAT);
    mesh.scale.set(WORLD_W, WORLD_H, 1);
    // the pole's foot (canvas x 22 of 112, bottom) stands on the spot
    mesh.position.set(x, 0, z).addScaledVector(CAM_UP, WORLD_H / 2 - 0.02);
    mesh.position.add(new THREE.Vector3(1, 0, 0).applyQuaternion(CAM_QUAT).multiplyScalar(WORLD_W * (0.5 - 22 / W)));
    mesh.frustumCulled = false;
    const ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.03, z); ring.renderOrder = 2;
    const thing = new Thing(mesh, { minX: x - 0.1, maxX: x + 0.1, minZ: z - 0.1, maxZ: z + 0.1 });
    scene.add(mesh, ring);
    things.push(thing);
    return { mesh, ring, thing };
  }
  function drop(id) {
    const s = shown.get(id);
    if (!s) return;
    scene.remove(s.mesh, s.ring);
    s.mesh.geometry.dispose(); s.mesh.material.dispose(); s.ring.material.dispose();
    things.splice(things.indexOf(s.thing), 1);
    shown.delete(id);
  }

  // every frame: banners follow ownership; returns the businesses that just changed hands to a clan
  function update(state, time) {
    const claimed = [];
    for (const b of Object.values(state.businesses)) {
      const s = shown.get(b.id);
      if ((s?.owner || null) === (b.owner || null)) continue;
      drop(b.id);
      if (!b.owner) continue;
      const color = state.clans?.[b.owner]?.color || '#b02424';
      shown.set(b.id, { owner: b.owner, ...add(b, color) });
      if (s !== undefined || state.tick > 1) claimed.push(b);
    }
    // the glow breathes a little
    const k = 0.25 + 0.08 * Math.sin(time * 2.2);
    for (const s of shown.values()) s.ring.material.opacity = k;
    // the back room to hold during an attack (sim/businesses.js): a gold ring on the floor,
    // bright and pulsing while the timer runs, dim while it waits (placeholder look)
    for (const [id, r] of holds) if (state.attacks?.[id]?.phase !== 'hold') { scene.remove(r); r.material.dispose(); holds.delete(id); }
    for (const a of Object.values(state.attacks || {})) {
      if (a.phase !== 'hold') continue;
      let r = holds.get(a.business);
      if (!r) {
        r = new THREE.Mesh(HOLD_GEO, new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        r.rotation.x = -Math.PI / 2; r.position.set(a.hold.x, 0.05, a.hold.z); r.scale.setScalar(a.hold.r); r.renderOrder = 3;
        scene.add(r); holds.set(a.business, r);
      }
      r.material.opacity = a.holding ? 0.6 + 0.3 * Math.sin(time * 6) : 0.25;
    }
    // War Lanterns planted for raids: the glow and the ground ring breathe together, softly
    for (const id of [...lanterns.keys()]) if (!state.attacks?.[id]?.lantern) dropLantern(id);
    const beat = 0.5 + 0.5 * Math.sin(time * PULSE);
    for (const a of Object.values(state.attacks || {})) {
      if (!a.lantern) continue;
      let l = lanterns.get(a.business);
      if (!l) { l = addLantern(a.lantern.x, a.lantern.z); lanterns.set(a.business, l); }
      l.glow.scale.setScalar(0.9 + 0.15 * beat);
      l.glow.material.opacity = 0.3 + 0.3 * beat;
      const r = 0.85 + 0.15 * beat;
      l.pool.scale.setScalar(r); l.ring.scale.setScalar(r);
      l.pool.material.opacity = 0.08 + 0.08 * beat;
      l.ring.material.opacity = 0.25 + 0.35 * beat;
    }
    // someone knocking a War Lantern down (Tim 2026-10-20): a red ring at his feet fills over the channel
    for (const [id, m] of knocks) if (!state.attacks?.[id]?.knock) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); knocks.delete(id); }
    for (const a of Object.values(state.attacks || {})) {
      const k = a.knock;
      if (!k) continue;
      let m = knocks.get(a.business);
      if (!m) {
        m = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 48, 1, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3c28, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
        scene.add(m); knocks.set(a.business, m);
      }
      const u = state.entities[k.by] || k;
      m.position.set(u.x, 0.05, u.z);
      m.geometry.setDrawRange(0, Math.ceil(Math.min(1, (state.tick - k.start) / (k.ticks || 80)) * 48) * 6);
      m.material.opacity = 0.65 + 0.3 * Math.sin(time * 10);
    }
    return claimed;
  }
  return { update, things, spot };
}
