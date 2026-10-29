// Small effect toolkit shared by abilityfx.js and hitfx.js: textures painted on a canvas
// at start-up (no art files), a pooled particle system (sparkles, embers, petals), sprite
// after-images, star glints and blade strokes. Purely visual.
import * as THREE from 'three';
import { CAM_QUAT } from './iso.js';
import { onFxLayer } from './bloom.js';

// pixels per world unit for the target being drawn; view.js sets it before each render
export const fxShared = { uPx: { value: 100 } };

// ---- canvas textures ------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
// particle atlas, 4 cells in a row: soft dot, 4-point sparkle, petal, ember streak
const ATLAS_CELLS = 5;
let atlas = null;
const getAtlas = () => atlas ||= canvasTex(64 * ATLAS_CELLS, 64, (g) => {
  // soft dot
  let r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  // sparkle: thin cross with a bright core
  g.save(); g.translate(96, 32);
  for (const [len, wid] of [[30, 2.2], [17, 1.4]]) {
    g.rotate(len === 30 ? 0 : Math.PI / 4);
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      const lg = g.createLinearGradient(0, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(0, -wid); g.lineTo(len, 0); g.lineTo(0, wid); g.fill();
    }
  }
  r = g.createRadialGradient(0, 0, 0, 0, 0, 9);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(-10, -10, 20, 20);
  g.restore();
  // petal (white, tinted per particle)
  g.save(); g.translate(160, 32); g.rotate(-0.5);
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(0, -22); g.bezierCurveTo(16, -12, 14, 14, 0, 22); g.bezierCurveTo(-14, 14, -16, -12, 0, -22); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(-5, -24); g.lineTo(0, -14); g.lineTo(5, -24); g.fill();
  g.restore();
  // ember: small hot core with a soft halo
  r = g.createRadialGradient(224, 32, 0, 224, 32, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(192, 0, 64, 64);
  g.save();g.translate(288,32);g.fillStyle='#fff';g.beginPath();g.moveTo(0,23);g.bezierCurveTo(-40,-1,-25,-35,0,-13);g.bezierCurveTo(25,-35,40,-1,0,23);g.fill();g.restore();
});
export const SHAPE = { dot: 0, sparkle: 1, petal: 2, ember: 3, heart:4 };

// big 4-point star for glints on steel
let starTex = null;
const getStar = () => starTex ||= canvasTex(256, 256, (g) => {
  g.translate(128, 128);
  for (const [len, wid, rot] of [[126, 5, 0], [70, 3, Math.PI / 4]]) {
    g.save(); g.rotate(rot);
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      const lg = g.createLinearGradient(0, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,1)'); lg.addColorStop(0.5, 'rgba(255,255,255,.35)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(0, -wid); g.lineTo(len, 0); g.lineTo(0, wid); g.fill();
    }
    g.restore();
  }
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 40);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(-40, -40, 80, 80);
});

// blade stroke: long tapered streak, hot white core, cool edge
let strokeTex = null;
const getStroke = () => strokeTex ||= canvasTex(512, 64, (g, w, h) => {
  for (const [half, a] of [[26, 0.25], [12, 0.6], [4, 1]]) {
    const lg = g.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, `rgba(255,255,255,0)`); lg.addColorStop(0.35, `rgba(255,255,255,${a})`);
    lg.addColorStop(0.75, `rgba(255,255,255,${a})`); lg.addColorStop(1, `rgba(255,255,255,0)`);
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(0, h / 2); g.quadraticCurveTo(w * 0.55, h / 2 - half, w, h / 2); g.quadraticCurveTo(w * 0.55, h / 2 + half, 0, h / 2); g.fill();
  }
});

// kanji seal for ground decals: double ring with ticks and a character, drawn white
const sealTex = {};
const getSeal = (ch) => sealTex[ch] ||= canvasTex(512, 512, (g) => {
  g.translate(256, 256);
  g.strokeStyle = '#fff';
  g.lineWidth = 12; g.beginPath(); g.arc(0, 0, 236, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 200, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 24; i++) {
    g.rotate(Math.PI / 12);
    g.lineWidth = i % 2 ? 3 : 7;
    g.beginPath(); g.moveTo(204, 0); g.lineTo(i % 2 ? 216 : 230, 0); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.font = '700 230px "Yu Mincho", "MS Mincho", "Hiragino Mincho ProN", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 0, 10);
});

// rough ink-brush ring (drawn dark, normal blending)
let inkTex = null;
const getInk = () => inkTex ||= canvasTex(512, 512, (g) => {
  g.translate(256, 256);
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2, r = 200 + (Math.random() - 0.5) * 50 * Math.random(), s = 4 + Math.random() * 16;
    g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.5})`;
    g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r, s * 2.2, s * 0.7, a + Math.PI / 2, 0, Math.PI * 2); g.fill();
  }
});

// light pillar: bright at the foot, fading upward and to the sides
let pillarTex = null;
const getPillar = () => pillarTex ||= canvasTex(64, 256, (g, w, h) => {
  const v = g.createLinearGradient(0, h, 0, 0);
  v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.5, 'rgba(255,255,255,.45)'); v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const x = g.createLinearGradient(0, 0, w, 0);
  x.addColorStop(0, 'rgba(0,0,0,0)'); x.addColorStop(0.5, 'rgba(0,0,0,1)'); x.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = x; g.fillRect(0, 0, w, h);
});

// red paper lantern (chochin): ribbed body, black caps, glowing middle
let lanternTex = null;
export const getLantern = () => lanternTex ||= canvasTex(128, 192, (g) => {
  const cx = 64, cy = 100, rx = 46, ry = 62;
  const body = g.createRadialGradient(cx, cy, 4, cx, cy, ry);
  body.addColorStop(0, '#fff2b0'); body.addColorStop(0.3, '#ff9440'); body.addColorStop(0.75, '#e0281a'); body.addColorStop(1, '#7a0c08');
  g.fillStyle = body;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(90,10,5,.55)'; g.lineWidth = 2;
  for (let i = -5; i <= 5; i++) {
    const y = cy + i * ry / 6, half = rx * Math.sqrt(Math.max(0, 1 - (i / 6) ** 2));
    g.beginPath(); g.moveTo(cx - half, y); g.quadraticCurveTo(cx, y + 4, cx + half, y); g.stroke();
  }
  g.fillStyle = '#140c08';
  g.fillRect(cx - 26, cy - ry - 8, 52, 14); g.fillRect(cx - 26, cy + ry - 6, 52, 14);
  g.fillRect(cx - 2, 6, 4, cy - ry - 10);
  g.fillStyle = 'rgba(40,6,4,.75)';
  g.font = '700 46px "Yu Mincho", "MS Mincho", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('灯', cx, cy + 2);
});

// ---- particles ------------------------------------------------------------------------
const P_VERT = /* glsl */`
uniform float uPx;
attribute vec4 aColor;    // rgb, alpha
attribute vec3 aInfo;     // size (world units), atlas cell, spin angle
varying vec4 vColor;
varying vec2 vInfo;
void main() {
  vColor = aColor;
  vInfo = aInfo.yz;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  gl_PointSize = aInfo.x * uPx;
}`;
const P_FRAG = /* glsl */`
uniform sampler2D uAtlas;
varying vec4 vColor;
varying vec2 vInfo;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vInfo.y), s = sin(vInfo.y);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
  vec4 t = texture2D(uAtlas, vec2((vInfo.x + p.x) / ${ATLAS_CELLS.toFixed(1)}, 1.0 - p.y));
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
}`;

// additive: glows and goes through bloom; normal: solid things like petals
export function createParticles(scene, { max = 1500, additive = true } = {}) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), info = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: { uPx: fxShared.uPx, uAtlas: { value: getAtlas() } },
    vertexShader: P_VERT, fragmentShader: P_FRAG, transparent: true, depthTest: false, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  points.renderOrder = additive ? 99820 : 99810;
  points.frustumCulled = false;
  if (additive) onFxLayer(points);
  scene.add(points);
  const list = [];

  return {
    clear(){list.length=0;geo.setDrawRange(0,0);},
    // o: { x, y, z, vx, vy, vz, life, size, color: [r, g, b], shape, gravity, drag, grow, spin, twinkle, sway }
    emit(o) {
      if (list.length >= max) return;
      list.push({ vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, grow: 0, spin: 0, twinkle: 0, sway: 0, shape: 0, alpha: 1,
        ...o, age: 0, rot: o.rot ?? Math.random() * 6.28, seed: Math.random() * 100 });
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) { list[i] = list[list.length - 1]; list.pop(); continue; }
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.orbit) {   // spiral around a point: { x, z, r, w (radians a second), a (angle) }
          const o = p.orbit;
          o.a += o.w * dt;
          p.x = o.x + Math.cos(o.a) * o.r; p.z = o.z + Math.sin(o.a) * o.r;
        }
        if (p.sway) { p.x += Math.sin(p.age * 3 + p.seed) * p.sway * dt; p.z += Math.cos(p.age * 2.3 + p.seed) * p.sway * dt; }
        p.rot += p.spin * dt;
      }
      list.forEach((p, i) => {
        const k = p.age / p.life;
        let a = p.alpha * Math.min(1, p.age / 0.05) * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
        if (p.twinkle) a *= 1 - p.twinkle + p.twinkle * (0.5 + 0.5 * Math.sin(p.age * 38 + p.seed));
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 4] = p.color[0]; col[i * 4 + 1] = p.color[1]; col[i * 4 + 2] = p.color[2]; col[i * 4 + 3] = a;
        info[i * 3] = p.size * (1 + p.grow * k); info[i * 3 + 1] = p.shape; info[i * 3 + 2] = p.rot;
      });
      geo.setDrawRange(0, list.length);
      for (const n of ['position', 'aColor', 'aInfo']) geo.attributes[n].needsUpdate = true;
    },
  };
}

// ---- short-lived camera-facing cards (glints, strokes, after-images) -----------------
const CARD_GEO = new THREE.PlaneGeometry(1, 1);
const GHOST_VERT = 'uniform vec4 uFrame; varying vec2 vUv; void main() { vUv = uFrame.xy + uv * uFrame.zw; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const GHOST_FRAG = /* glsl */`
uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
varying vec2 vUv;
void main() {
  float a = texture2D(uMap, vUv).a;
  if (a < 0.05) discard;
  gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
}`;

export function createCards(scene) {
  const cards = [];
  function add(mesh, life, tick, flat = false) {
    if (flat) mesh.rotation.x = -Math.PI / 2;
    else mesh.quaternion.copy(CAM_QUAT);
    mesh.frustumCulled = false;
    onFxLayer(mesh);
    scene.add(mesh);
    cards.push({ mesh, life, tick, age: 0 });
    return mesh;
  }
  const basic = (map, color) => new THREE.MeshBasicMaterial({
    map, color, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
  });

  return {
    clear(){for(const c of cards){scene.remove(c.mesh);c.mesh.material.dispose();}cards.length=0;},
    // fading copy of a character sprite's current frame (sprite: a CharacterSprite)
    ghost(sprite, color = [0.55, 0.7, 1], life = 0.32, opacity = 0.75) {
      const u = sprite.material.uniforms;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: u.uMap.value }, uFrame: { value: u.uFrame.value.clone() }, uColor: { value: new THREE.Color(...color) }, uOpacity: { value: opacity } },
        vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
      });
      const m = new THREE.Mesh(CARD_GEO, mat);
      m.position.copy(sprite.thing.mesh.position);
      m.scale.copy(sprite.thing.mesh.scale);
      m.renderOrder = 99640;
      add(m, life, (k) => { mat.uniforms.uOpacity.value = opacity * (1 - k) ** 1.5; });
      m.quaternion.copy(CAM_QUAT);
    },
    // four-point star flash on steel at a world point
    glint(x, y, z, size = 1.4, color = 0xffffff, life = 0.3) {
      const m = new THREE.Mesh(CARD_GEO, basic(getStar(), color));
      m.position.set(x, y, z);
      m.renderOrder = 99830;
      const spin = (Math.random() - 0.5) * 2;
      add(m, life, (k, dt) => {
        const s = size * (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75 * 0.6);
        m.scale.set(s, s, 1);
        m.material.opacity = k < 0.25 ? 1 : 1 - (k - 0.25) / 0.75;
        m.rotateZ(spin * dt);
      });
    },
    // tapered blade stroke through a world point, at a screen angle (radians)
    stroke(x, y, z, angle, length = 2.6, width = 0.32, color = 0xeef4ff, life = 0.26) {
      const m = new THREE.Mesh(CARD_GEO, basic(getStroke(), color));
      m.position.set(x, y, z);
      m.renderOrder = 99835;
      add(m, life, (k) => {
        const grow = Math.min(1, k / 0.2);
        m.quaternion.copy(CAM_QUAT);
        m.rotateZ(angle);
        m.scale.set(length * (0.4 + 0.6 * grow), width * (1 - 0.6 * k), 1);
        m.material.opacity = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
      });
    },
    // kanji seal on the ground; follow() may return a moving centre
    seal(x, z, radius, ch, color, life, { spin = 0.6, follow = null, opacity = 0.9 } = {}) {
      const m = new THREE.Mesh(CARD_GEO, basic(getSeal(ch), color));
      m.position.set(x, 0.045, z);
      m.renderOrder = 4;
      add(m, life, (k, dt) => {
        const p = follow?.();
        if (p) m.position.set(p.x, 0.045, p.z);
        const s = radius * 2 * (k < 0.15 ? 0.6 + 0.4 * (1 - (1 - k / 0.15) ** 3) : 1);
        m.scale.set(s, s, 1);
        m.rotateZ(spin * dt);
        m.material.opacity = opacity * (k < 0.15 ? k / 0.15 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      }, true);
    },
    // dark ink ring rolling outward
    ink(x, z, radius, life = 0.7, color = 0x12061c) {
      const m = new THREE.Mesh(CARD_GEO, new THREE.MeshBasicMaterial({ map: getInk(), color, transparent: true, depthTest: false, depthWrite: false }));
      m.position.set(x, 0.04, z);
      m.renderOrder = 3;
      m.rotation.z = Math.random() * 6;
      add(m, life, (k) => {
        const s = radius * 2 * (0.2 + 0.8 * (1 - (1 - k) ** 2));
        m.scale.set(s, s, 1);
        m.material.opacity = 0.75 * (1 - k);
      }, true);
      m.layers.disable(1);   // dark: keep it out of the glow pass
    },
    // pillar of light standing on a unit; follow() gives its feet
    pillar(follow, color, life = 1.1, height = 4.6, width = 1.1) {
      const m = new THREE.Mesh(CARD_GEO, basic(getPillar(), color));
      m.renderOrder = 99645;
      add(m, life, (k) => {
        const p = follow();
        if (p) m.position.set(p.x, 0, p.z).addScaledVector(new THREE.Vector3(0, 1, 0), height / 2 * (k < 0.2 ? k / 0.2 : 1));
        const grow = k < 0.2 ? k / 0.2 : 1;
        m.scale.set(width * (1 - 0.5 * k), height * grow, 1);
        m.material.opacity = k < 0.2 ? 1 : 1 - (k - 0.2) / 0.8;
      });
    },
    update(dt) {
      for (let i = cards.length - 1; i >= 0; i--) {
        const c = cards[i];
        c.age += dt;
        const k = c.age / c.life;
        if (k >= 1) { scene.remove(c.mesh); c.mesh.material.dispose(); cards.splice(i, 1); continue; }
        c.tick(k, dt);
      }
    },
  };
}
