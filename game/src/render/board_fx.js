// Boarding and clan colours on ships, drawn (ships plan S8; rules in sim/frontier/boarding.js). Drawing only.
//  - Clan sails: the sail cloth of every warship and transport takes a muted wash of its clan's colour (render/shading.js
//    uSail: the cloth is told apart by its colour, its brightness kept), and a long pennant in that colour streams from the
//    masthead. A captured ship lowers the old pennant, a puff at the masthead, and runs the new one up; its sails turn.
//  - Grapple ('boardGrapple'): three lines with hooks thrown from the boarder's rail across to the target's, then held
//    with a little sag. They slacken and fade when the fight ends, whip loose on a break off, drop on a failed grapple.
//  - The deck fight (a fight in state.frontier.boardings): sword clashes as small sparks along the two rails, pistol and
//    musket flashes with their puffs, powder smoke hanging between the hulls, and a struggling crowd of tiny figures at the
//    rails. A fighter who falls ('boardFall') goes over the side (the drowning look of render/ship_fx.js takes him).
//  - The bar over the fight: your side and theirs, their strengths, where the two meet; weakened when the boarded ship is
//    under half health.
// Every effect is somewhat see-through (Tim 2026-11-23).
//   createBoardFx({ scene }) -> { cast(c), update(state, sprites, dt, place, me) }   me: the viewer's clan
import * as THREE from 'three';
import { CAM_QUAT, VIEW_DIR, CAM_RIGHT, CAM_UP } from './iso.js';
import { createParticles, SHAPE } from './vfx.js';

const rand = (a, b) => a + Math.random() * (b - a), pick = l => l[Math.floor(Math.random() * l.length)];
const FLAME = [[1, 0.93, 0.7], [1, 0.72, 0.3], [1, 0.5, 0.16]];
const SMOKE = [[0.68, 0.64, 0.57], [0.6, 0.57, 0.51], [0.74, 0.7, 0.62]];
const DECK = { warship: 2.15, transport: 2.0 }, HALF = { warship: 4.2, transport: 3.4 };
// where the masthead is in each of the 8 sprite rows, as a share of the frame (measured from the idle sheets)
const MAST = {
  warship: [[0.502, 0.241], [0.721, 0.283], [0.603, 0.333], [0.393, 0.286], [0.493, 0.263], [0.596, 0.281], [0.395, 0.326], [0.283, 0.279]],
  transport: [[0.504, 0.286], [0.365, 0.26], [0.523, 0.24], [0.671, 0.277], [0.49, 0.309], [0.479, 0.302], [0.475, 0.259], [0.492, 0.285]],
};
// which pixels are sail cloth in each model's sheets (render/shading.js uSailKey)
const SAIL_KEY = { warship: [0.6, 0.68, 0.3, 0.42], transport: [0.53, 0.58, 0.16, 0.26] };
const OWN = '#3fb6a8', FOE = '#c4432c';   // as the ship plates (render/ship_marks.js)

// a clan colour made fit for cloth: a tint that keeps the painted cloth's warmth (Tim 2026-11-23: muted, never primaries)
function sailTint(hex, k = 0.3) {
  const c = new THREE.Color(hex), g0 = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
  c.lerp(new THREE.Color(g0, g0, g0), 0.4);   // greyed first: dyed cloth, not paint
  const l = Math.max(0.05, 0.3 * c.r + 0.59 * c.g + 0.11 * c.b);
  return [1 + (c.r / l - 1) * k, 1 + (c.g / l - 1) * k, 1 + (c.b / l - 1) * k];
}
// the pennant's own colour: the clan colour, greyed and darkened a little toward old dyed cloth
function clothColour(hex) {
  const c = new THREE.Color(hex), g = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b, m = 0.4;
  return new THREE.Color(c.r * (1 - m) + g * m, c.g * (1 - m) + g * m, c.b * (1 - m) + g * m).lerp(new THREE.Color(0.86, 0.82, 0.72), 0.14);
}

const PEN_VERT = /* glsl */`
uniform float uTime, uPhase;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float x = uv.x;   // 0 at the mast .. 1 at the tail
  p.y += sin(x * 7.0 - uTime * 6.0 + uPhase) * 0.16 * x + sin(x * 3.1 - uTime * 2.3 + uPhase) * 0.06 * x;
  p.x -= x * x * 0.12;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const PEN_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha, uTime, uPhase;
varying vec2 vUv;
void main() {
  float x = vUv.x, w = mix(1.0, 0.18, x);   // tapers to a point
  float y = abs(vUv.y - 0.5) * 2.0;
  if (y > w) discard;
  float fold = 0.82 + 0.18 * sin(x * 7.0 - uTime * 6.0 + uPhase + 1.2);
  float rim = smoothstep(w - 0.35, w, y);
  vec3 c = uColor * fold * (1.0 - rim * 0.45);
  gl_FragColor = vec4(c, uAlpha * (1.0 - smoothstep(0.86, 1.0, x) * 0.5));
}`;

export function createBoardFx({ scene, figureSprite = null }) {
  const glow = createParticles(scene, { max: 500 }), soot = createParticles(scene, { max: 1500, additive: false });
  const vg = new THREE.Vector3(VIEW_DIR.x, 0, VIEW_DIR.z).normalize();
  let clock = 0;
  const head = h => [Math.sin(h ?? 0), Math.cos(h ?? 0)];
  const later = [];

  // ---- the card point of a ship sprite: u, v a share of its frame ----
  const cardPoint = (s, u, v, out = new THREE.Vector3()) => {
    const m = s.thing.mesh, cw = s.cellWorld ?? 16;
    return out.copy(m.position).addScaledVector(CAM_RIGHT, (u - 0.5) * cw).addScaledVector(CAM_UP, (0.5 - v) * cw);
  };
  const dirOf = e => e.dir ?? 0;

  // ---- clan sails and pennants ----
  const pens = new Map();   // ship id -> { mesh, owner, raise: 0..1, old: { mesh, t } }
  const PEN_GEO = new THREE.PlaneGeometry(3.2, 0.42, 16, 1).translate(1.6, 0, 0);
  function penMesh(col) {
    const m = new THREE.Mesh(PEN_GEO, new THREE.ShaderMaterial({ vertexShader: PEN_VERT, fragmentShader: PEN_FRAG, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: clothColour(col) }, uAlpha: { value: 0.94 }, uTime: { value: 0 }, uPhase: { value: rand(0, 6) } } }));
    m.quaternion.copy(CAM_QUAT); m.renderOrder = 99650; m.frustumCulled = false; scene.add(m);
    return m;
  }
  const sailWas = new Map();   // ship id -> { from: [r,g,b], t }
  function clanLook(e, s, state, dt) {
    const kind = e.warUnit === 'transport' ? 'transport' : 'warship', col = state.clans?.[e.owner]?.color || '#888888';
    const u = s.thing.mesh.material?.uniforms;
    let tint = sailTint(col);
    const sw = sailWas.get(e.id);
    if (sw) { const k = Math.min(1, (clock - sw.t) / 1.4); tint = tint.map((v, i) => sw.from[i] + (v - sw.from[i]) * k); if (k >= 1) sailWas.delete(e.id); }
    if (u?.uSail) { u.uSail.value.set(tint[0], tint[1], tint[2], 1); u.uSailKey.value.set(...SAIL_KEY[kind]); }
    let p = pens.get(e.id);
    if (!p) { p = { mesh: penMesh(col), owner: e.owner, raise: 1, tint }; pens.set(e.id, p); }
    p.tint = tint;
    if (p.owner !== e.owner) {   // captured: the old pennant comes down, the new one runs up
      p.old = { mesh: p.mesh, t: clock }; p.mesh = penMesh(col); p.raise = 0; p.owner = e.owner; p.at = clock + 0.55;
    }
    const [mu, mv] = MAST[kind][dirOf(e)] || [0.5, 0.25], top = cardPoint(s, mu, mv);
    const mast = (s.cellWorld ?? 16) * 0.2;   // how far down the mast a lowered pennant hangs
    if (p.raise < 1 && clock >= (p.at ?? 0)) p.raise = Math.min(1, p.raise + dt / 0.9);
    const r = 1 - (1 - p.raise) ** 2;
    p.mesh.position.copy(top).addScaledVector(CAM_UP, -mast * (1 - r));
    p.mesh.material.uniforms.uTime.value = clock;
    p.mesh.material.uniforms.uAlpha.value = 0.94 * Math.min(1, p.raise * 3);
    p.mesh.visible = s.thing.mesh.visible !== false && !e.dead;
    p.mesh.renderOrder = s.thing.mesh.renderOrder + 0.5; if (p.old) p.old.mesh.renderOrder = p.mesh.renderOrder;   // with its own ship: under the plates, behind nearer ships
    if (p.old) {
      const k = (clock - p.old.t) / 0.6, m = p.old.mesh;
      m.position.copy(top).addScaledVector(CAM_UP, -mast * Math.min(1, k) ** 1.5);
      m.material.uniforms.uTime.value = clock; m.material.uniforms.uAlpha.value = 0.94 * Math.max(0, 1 - k);
      if (k >= 1) { scene.remove(m); m.material.dispose(); delete p.old; }
    }
    return top;
  }
  function captured(c, state, sprites) {
    const e = state.entities[c.a], s = sprites.get(c.a); if (!e || !s) return;
    const p = pens.get(c.a);
    sailWas.set(c.a, { from: p?.tint || [1, 1, 1], t: clock + 0.5 });
    const kind = e.warUnit === 'transport' ? 'transport' : 'warship', [mu, mv] = MAST[kind][dirOf(e)] || [0.5, 0.25], top = cardPoint(s, mu, mv);
    for (let i = 0; i < 7; i++) soot.emit({ x: top.x + rand(-0.3, 0.3), y: top.y + rand(-0.4, 0.2), z: top.z + rand(-0.3, 0.3), vx: rand(-0.4, 0.4) + 0.4, vz: rand(-0.4, 0.4), vy: rand(0.3, 0.8), drag: 1.4, sway: 0.25,
      life: rand(1.4, 2.2), size: rand(0.5, 0.9), grow: 1.8, color: pick(SMOKE), alpha: 0.4, shape: SHAPE.puff, rot: rand(-0.4, 0.4) });
    later.push({ at: clock + 1.35, fn: () => {   // the new pennant reaches the top: a glint, and a soft ring on the water round the ship
      glow.emit({ x: top.x, y: top.y, z: top.z, life: 0.5, size: 0.9, grow: 0.5, color: [1, 0.9, 0.6], alpha: 0.32, shape: SHAPE.sparkle, spin: 2 });
      const p0 = s.pos || s.thing.mesh.position, rc = clothColour(state.clans?.[c.owner]?.color || '#c8bfa8').lerp(new THREE.Color(0.9, 0.86, 0.72), 0.35), ring = [rc.r, rc.g, rc.b];
      for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2;
        soot.emit({ x: p0.x + Math.cos(a) * 5, y: 0.05, z: p0.z + Math.sin(a) * 5, vx: Math.cos(a) * 1.6, vz: Math.sin(a) * 1.6, drag: 1.2, life: rand(1, 1.4), size: rand(0.3, 0.45), grow: 0.8, color: ring, alpha: 0.4, shape: SHAPE.dot }); }
    } });
  }

  // ---- grappling lines ----
  const ROPE_N = 14;
  const lines = new Map();   // boarder id -> { a, t, born, hooks: [{ k, delay }], ropes: [mesh], state: 'hold'|'slack'|'snap'|'drop', at }
  function ropeMesh() {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array((ROPE_N + 1) * 2 * 3), idx = [];
    for (let i = 0; i < ROPE_N; i++) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x15110d, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 99640; m.frustumCulled = false; scene.add(m);
    return m;
  }
  // a small three-pronged grappling hook at the end of each line, iron dark, pointing along the line on screen (Tim 2026-11-23)
  const HOOK = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d');
    g.strokeStyle = 'rgba(20,16,12,.9)'; g.lineCap = 'round'; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(4, 16); g.lineTo(22, 16); g.stroke();   // the shank, the line comes in from the left
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(22, 16); g.quadraticCurveTo(29, 16 + sd * 2, 27, 16 + sd * 9); g.lineTo(23, 16 + sd * 7); g.stroke(); }
    g.beginPath(); g.moveTo(22, 16); g.lineTo(29, 16); g.stroke();
    g.strokeStyle = 'rgba(150,140,125,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(6, 15); g.lineTo(21, 15); g.stroke();   // a glint along the iron
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  function hookSprite() {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: HOOK, transparent: true, depthTest: false, depthWrite: false, opacity: 0.9 }));
    m.scale.set(0.62, 0.62, 1); m.renderOrder = 99641; scene.add(m); return m;
  }
  const dropLine = L => { for (const m of L.ropes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } for (const h of L.irons || []) { scene.remove(h); h.material.dispose(); } };
  const tip = new THREE.Vector3(), scr = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
  function setRope(m, pts, width) {
    const a = m.geometry.attributes.position;
    for (let i = 0; i <= ROPE_N; i++) {
      const p = pts[i], q = pts[Math.min(ROPE_N, i + 1)], o = pts[Math.max(0, i - 1)];
      tan.set(q.x - o.x, q.y - o.y, q.z - o.z).normalize();
      side.crossVectors(tan, VIEW_DIR).normalize().multiplyScalar(width / 2 * (0.55 + 0.45 * Math.sin(Math.PI * i / ROPE_N)));   // tapered to the hook and the cleat
      a.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z); a.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
    }
    a.needsUpdate = true;
  }
  // the rail points of a rope: on the boarder and on the target, k = -1, 0, 1 along the hulls
  function ends(ea, et, k) {
    const dx = et.x - ea.x, dz = et.z - ea.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    const [hx, hz] = head(et.heading), along = k * 2.4 * Math.sign(hx * hx + hz * hz);
    const ra = (HALF[ea.warUnit] ?? 4) * 0.18, rt = (HALF[et.warUnit] ?? 4) * 0.18;
    return [{ x: ea.x + ux * ra + hx * along, y: (DECK[ea.warUnit] ?? 2.1) - 0.9, z: ea.z + uz * ra + hz * along }, { x: et.x - ux * rt + hx * along * 0.9, y: (DECK[et.warUnit] ?? 2.1) - 0.8, z: et.z - uz * rt + hz * along * 0.9 }];   // at the rails
  }
  const curve = [];
  for (let i = 0; i <= ROPE_N; i++) curve.push(new THREE.Vector3());
  function drawLines(state) {
    for (const [id, L] of lines) {
      const ea = state.entities[L.a], et = state.entities[L.t];
      const age = clock - L.born, gone = !ea || !et || ea.dead || et.dead;
      if (L.state === 'hold' && (gone || !(ea.board?.t === L.t))) { L.state = 'slack'; L.at = clock; }
      const k0 = L.state === 'hold' ? 0 : (clock - L.at) / (L.state === 'snap' ? 0.9 : L.state === 'drop' ? 0.7 : 1.4);
      if (k0 >= 1) { dropLine(L); lines.delete(id); continue; }
      const A = ea || L.lastA, T = et || L.lastT; if (!A || !T) continue;
      L.lastA = { x: A.x, z: A.z, heading: A.heading, warUnit: A.warUnit }; L.lastT = { x: T.x, z: T.z, heading: T.heading, warUnit: T.warUnit };
      L.ropes.forEach((m, j) => {
        const [p0, p1] = ends(L.lastA, L.lastT, j - 1), d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
        const fly = Math.min(1, Math.max(0, (age - L.hooks[j]) / 0.42));   // the hook in flight: an arc out across the gap
        const iron = L.irons?.[j];
        if (fly <= 0) { m.visible = false; if (iron) iron.visible = false; return; }
        m.visible = true;
        let sag = 0.35 + 0.08 * Math.sin(clock * 2.2 + j * 1.7), tip = fly, snapT = 0;
        if (L.state === 'slack') sag = 0.35 + k0 * 1.4;
        if (L.state === 'snap') { snapT = k0; sag = 0.35 + Math.min(1, k0 * 3) * 1.6; }   // freed from the target: the end whips back toward the boarder and falls
        if (L.state === 'drop') { tip = 1; sag = 0.35 + k0 * 2.2; }
        for (let i = 0; i <= ROPE_N; i++) {
          const f = i / ROPE_N * tip, x = p0.x + (p1.x - p0.x) * f, z = p0.z + (p1.z - p0.z) * f;
          let y = p0.y + (p1.y - p0.y) * f;
          if (fly < 1) y += Math.sin(Math.PI * f / Math.max(tip, 0.01)) * 2.2 * (1 - fly * 0.6) * tip;   // thrown in an arc
          else y -= Math.sin(Math.PI * f) * sag;
          if (snapT > 0) { const back = f * snapT * 0.8; y -= f * f * snapT * 4.5; curve[i].set(x - (p1.x - p0.x) * back, y, z - (p1.z - p0.z) * back); }
          else curve[i].set(x, y, z);
        }
        setRope(m, curve, 0.085);   // thin dark line (Tim 2026-11-23)
        if (iron) {   // the hook rides the line's free end, turned along its last stretch as seen on screen
          const a = curve[ROPE_N - 1], b = curve[ROPE_N]; scr.subVectors(b, a);
          iron.position.copy(b); iron.material.rotation = Math.atan2(scr.dot(CAM_UP), scr.dot(CAM_RIGHT)); iron.visible = true;
          iron.material.opacity = 0.9 * (L.state === 'hold' ? 1 : 1 - k0); }
        m.material.opacity = 0.85 * (L.state === 'hold' ? 1 : 1 - k0);
        if (fly >= 1 && !L.landed?.[j]) { (L.landed ||= [])[j] = true; const p = curve[ROPE_N];   // the hook bites: a few chips off the rail
          for (let i = 0; i < 4; i++) soot.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-1.5, 1.5), vz: rand(-1.5, 1.5), vy: rand(1, 2.5), gravity: 8, life: rand(0.4, 0.7), size: rand(0.08, 0.14), color: [0.36, 0.25, 0.15], alpha: 0.75, shape: SHAPE.shard, spin: rand(-8, 8) }); }
      });
    }
  }
  function grapple(c) {
    if (lines.has(c.a)) dropLine(lines.get(c.a));
    lines.set(c.a, { a: c.a, t: c.t, born: clock, hooks: [0, 0.18, 0.34].sort(() => Math.random() - 0.5), ropes: [ropeMesh(), ropeMesh(), ropeMesh()], irons: [hookSprite(), hookSprite(), hookSprite()], state: 'hold' });
  }

  // ---- the deck fight ----
  const fightFx = new Map();   // fight key -> { next spark, next shot, crowd }
  // option b: small ink fighters (a swordsman and a rifleman, two frames each, facing right), with a white copy for the clan outline
  const FIG_PX = 64, FIG_CELLS = 4, FIG_W = 1.25;
  const figTex = mask => { const cv = document.createElement('canvas'); cv.width = FIG_PX * FIG_CELLS; cv.height = FIG_PX; const g = cv.getContext('2d');
    const INK = mask ? '#fff' : '#211912', CLOTH = mask ? '#fff' : '#2e241b', SKIN = mask ? '#fff' : '#9c7c5e', STEEL = mask ? '#fff' : '#d9d2c2', WOOD = mask ? '#fff' : '#4a3424';
    const line = (w, col, ...pts) => { g.strokeStyle = col; g.lineWidth = w * 1.7; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
    const man = (cell, { lean, step, hat, armF, armB }) => { g.save(); g.translate(cell * FIG_PX + 30, 58);
      // legs in a wide fighting stance, hakama flaring
      g.fillStyle = CLOTH; g.beginPath(); g.moveTo(-3, -20); g.lineTo(4, -20); g.lineTo(8 + step, 0); g.lineTo(3 + step * 0.5, 0); g.lineTo(0, -10); g.lineTo(-5 - step * 0.4, 0); g.lineTo(-10 - step, 0); g.closePath(); g.fill();
      line(2.4, INK, 8 + step, 0, 11 + step, 0); line(2.4, INK, -10 - step, 0, -7 - step, 0);   // feet
      // body leaning in, a sash at the waist
      g.save(); g.translate(0, -20); g.rotate(lean);
      g.fillStyle = INK; g.beginPath(); g.moveTo(-6.5, 0); g.lineTo(6.5, 0); g.lineTo(7.5, -15); g.lineTo(-5.5, -16); g.closePath(); g.fill();
      if (!mask) { g.fillStyle = '#5a4434'; g.fillRect(-5, -3, 10, 2.4); }
      g.fillStyle = SKIN; g.beginPath(); g.arc(1.5, -20, 4.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = INK;
      if (hat) { g.beginPath(); g.moveTo(-6, -20.5); g.lineTo(9, -20.5); g.lineTo(1.5, -26); g.closePath(); g.fill(); }   // a flat conical hat
      else { g.beginPath(); g.arc(1.5, -21, 4.5, Math.PI * 0.95, Math.PI * 2.05); g.fill(); line(2.2, INK, 0, -24, -3, -25.5); }   // hair and a topknot
      armB(g, line, { INK, STEEL, WOOD }); armF(g, line, { INK, STEEL, WOOD });
      g.restore(); g.restore(); };
    // swordsman: blade raised behind the head, then cut down and forward
    man(0, { lean: -0.12, step: 1, hat: false, armB: () => {}, armF: (g, l, c) => { l(3, c.INK, 3, -13, 7, -19, 4, -24); l(3.2, c.INK, 4, -24, 2, -26); l(1.8, c.STEEL, 2, -26, -10, -36, -14, -37); } });
    man(1, { lean: 0.28, step: 4, hat: false, armB: (g, l, c) => l(2.6, c.INK, 0, -12, -6, -6), armF: (g, l, c) => { l(3, c.INK, 3, -13, 9, -11, 12, -9); l(3.2, c.INK, 12, -9, 14, -8); l(1.8, c.STEEL, 14, -8, 24, -2, 28, 2); } });
    // rifleman: aiming from the shoulder, then the bayonet thrust
    man(2, { lean: 0.05, step: 2, hat: true, armB: (g, l, c) => l(2.6, c.INK, 0, -12, 6, -9), armF: (g, l, c) => { l(3, c.INK, 3, -13, 9, -12); l(3, c.WOOD, -2, -10, 6, -12); l(1.8, c.INK, 6, -12, 25, -14); l(1.2, c.STEEL, 25, -14, 30, -14.5); } });
    man(3, { lean: 0.32, step: 5, hat: true, armB: (g, l, c) => l(2.6, c.INK, 0, -12, 8, -6), armF: (g, l, c) => { l(3, c.INK, 3, -13, 12, -8); l(3, c.WOOD, 0, -6, 9, -7); l(1.8, c.INK, 9, -7, 27, -9); l(1.4, c.STEEL, 27, -9, 34, -9.5); } });
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const FIG = figTex(false), FIG_MASK = figTex(true);
  const OUT4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function crowdOf(F, state) {
    const fx = fightFx.get(F.t) || { spark: 0, shot: 0, smoke: 0, men: [] };
    fightFx.set(F.t, fx);
    return fx;
  }
  function figSprite(src, order) {
    const tex = src.clone(); tex.needsUpdate = true; tex.repeat.set(1 / FIG_CELLS, 1);
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    m.renderOrder = order; scene.add(m); return m;
  }
  function figure() { return { s: figSprite(FIG, 99645), o: OUT4.map(() => figSprite(FIG_MASK, 99644)) }; }
  function dropFigure(m) { for (const x of [m.s, ...m.o]) { scene.remove(x); x.material.map.dispose(); x.material.dispose(); } }
  // S8 (Tim 2026-11-23): the fighters are the real sprites of the people in each hold, scaled way down, trading blows,
  // with only a thin outline in their clan's colour (four silhouette copies a hair off each side, drawn just behind)
  const FIG_SIZE = 0.36, OUTLINE = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const screenDir = (ux, uz) => {   // a ground direction as a sprite row: 0..7 = S, SW, W, NW, N, NE, E, SE on screen
    const sx = ux * CAM_RIGHT.x + uz * CAM_RIGHT.z, up = -(ux * VIEW_DIR.x + uz * VIEW_DIR.z);
    return ((Math.round(Math.atan2(-sx, -up) / (Math.PI / 4)) % 8) + 8) % 8;
  };
  function fighterFor(fx, w, model) {
    let f = fx.men.find(x => x.key === w.key);
    if (f && f.model !== model) { dropFighter(f); fx.men.splice(fx.men.indexOf(f), 1); f = null; }
    if (f) return f;
    f = { key: w.key, model, spr: null, outl: [], phase: rand(0, 1), gone: false };
    fx.men.push(f);
    figureSprite(model).then(spr => {
      if (f.gone) { scene.remove(spr.thing.mesh); spr.dispose?.(); return; }
      spr.material.depthTest = false; spr.thing.mesh.renderOrder = 99645; spr.thing.mesh.frustumCulled = false;
      for (const _ of OUTLINE) {
        const mat = spr.material.clone(); mat.uniforms.uFill.value.set(1, 1, 1, 0.8); mat.depthTest = false;
        const m = new THREE.Mesh(spr.thing.mesh.geometry, mat); m.quaternion.copy(CAM_QUAT); m.renderOrder = 99644; m.frustumCulled = false; scene.add(m); f.outl.push(m);
      }
      f.spr = spr;
    }).catch(() => {});
    return f;
  }
  function dropFighter(f) {
    f.gone = true;
    if (f.spr) { scene.remove(f.spr.thing.mesh); f.spr.dispose?.(); }
    for (const m of f.outl) { scene.remove(m); m.material.dispose(); }
  }
  function realCrowd(fx, want, state, colA, colD, dt) {
    const seen = new Set(), models = {};
    const modelsOf = id => models[id] ||= Object.values(state.entities).filter(u => u.inShip === id && !u.dead && u.model).map(u => u.model).sort();
    for (const w of want) {
      const list = modelsOf(w.ship); if (!list.length) continue;
      seen.add(w.key);
      const f = fighterFor(fx, w, list[w.j % list.length]); if (!f.spr) continue;
      const spr = f.spr, cyc = (clock * 0.9 + f.phase) % 1.6, swing = cyc < 1 ? cyc : null;   // a blow, then a breath
      spr.lift = w.p.y - 0.15;
      spr.update(dt, w.p.x, w.p.z, screenDir(w.ux, w.uz), swing !== null ? 'attack' : 'idle', swing, FIG_SIZE);
      spr.thing.mesh.visible = true;
      const u = spr.material.uniforms, px = spr.cellWorld * FIG_SIZE / 64;   // about a pixel of the figure at a normal zoom
      f.outl.forEach((m, i) => {
        const mu = m.material.uniforms;
        mu.uMap.value = u.uMap.value; mu.uFrame.value.copy(u.uFrame.value); mu.uSampleBounds.value.copy(u.uSampleBounds.value);
        mu.uFill.value.set(...(w.ours ? colA : colD).toArray(), 0.95);
        m.scale.copy(spr.thing.mesh.scale);
        m.position.copy(spr.thing.mesh.position).addScaledVector(CAM_RIGHT, OUTLINE[i][0] * px).addScaledVector(CAM_UP, OUTLINE[i][1] * px);
      });
    }
    fx.men = fx.men.filter(f => { if (seen.has(f.key)) return true; dropFighter(f); return false; });
  }
  function deckFight(F, state, dt) {
    const t = state.entities[F.t]; if (!t) return;
    const fx = crowdOf(F, state), others = F.ships.map(id => state.entities[id]).filter(s => s && s !== t && !s.dead);
    const want = [];
    for (const a of others) {
      const dx = a.x - t.x, dz = a.z - t.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, [hx, hz] = head(t.heading);
      const gap = (k, w) => ({ x: t.x + ux * L * w + hx * k, y: (DECK[t.warUnit] ?? 2.1) + 0.15, z: t.z + uz * L * w + hz * k });   // w 0 on the target .. 1 on the alongside ship
      // the clash at the rails
      if (clock >= fx.spark) { fx.spark = clock + rand(0.06, 0.2);
        const p = gap(rand(-2.6, 2.6), rand(0, 0.5) / L);   // on the boarded deck (Tim 2026-11-23)
        glow.emit({ x: p.x, y: p.y + rand(0.1, 0.5), z: p.z, life: 0.1, size: rand(0.9, 1.3), color: FLAME[0], alpha: 0.8, shape: SHAPE.sparkle, rot: rand(0, 3) });
        for (let i = 0; i < 6; i++) glow.emit({ x: p.x, y: p.y + 0.3, z: p.z, vx: rand(-2.5, 2.5), vz: rand(-2.5, 2.5), vy: rand(0.8, 2.6), gravity: 7, life: rand(0.2, 0.35), size: rand(0.08, 0.13), color: FLAME[1], alpha: 0.7, shape: SHAPE.ember }); }
      // a pistol or musket fired across: a flash and its small puff, now from one deck, now the other
      if (clock >= fx.shot) { fx.shot = clock + rand(0.25, 0.7);
        const w = Math.random() < 0.5 ? rand(0.05, 0.25) : rand(0.75, 0.95), p = gap(rand(-3, 3), w), dir = w < 0.5 ? 1 : -1;
        glow.emit({ x: p.x + ux * dir * 0.3, y: p.y + 0.3, z: p.z + uz * dir * 0.3, life: 0.08, size: rand(0.8, 1.1), grow: 0.4, color: FLAME[1], alpha: 0.7, shape: SHAPE.dot });
        for (let i = 0; i < 3; i++) soot.emit({ x: p.x + ux * dir * 0.4, y: p.y + 0.3, z: p.z + uz * dir * 0.4, vx: ux * dir * rand(1, 2.4) + 0.3, vz: uz * dir * rand(1, 2.4), vy: rand(0.2, 0.6), drag: 1.6, sway: 0.25,
          life: rand(1.6, 2.6), size: rand(0.35, 0.6), grow: 2, color: pick(SMOKE), alpha: rand(0.28, 0.42), shape: SHAPE.puff, rot: rand(-0.4, 0.4), spin: rand(-0.3, 0.3) }); }
      // powder smoke drifting up between the hulls
      if (clock >= fx.smoke) { fx.smoke = clock + rand(0.2, 0.45); const p = gap(rand(-3, 3), rand(-0.3, 0.6) / L);   // over the boarded deck
        soot.emit({ x: p.x, y: p.y + 0.4, z: p.z, vx: 0.4, vz: -0.15, vy: rand(0.25, 0.5), drag: 1, sway: 0.3, life: rand(2.5, 3.5), size: rand(0.8, 1.3), grow: 1.8, color: pick(SMOKE), alpha: 0.22, shape: SHAPE.puff, rot: rand(-0.4, 0.4), spin: rand(-0.2, 0.2) }); }
      // the crowd: a few small figures a side, all on the boarded ship's deck, boarders at its near rail (Tim 2026-11-23)
      const na = Math.min(4, F.view?.na ?? 3), nd = Math.min(4, F.view?.nd ?? 3);
      for (let i = 0; i < na + nd; i++) { const ours = i < na, j = ours ? i : i - na, n = ours ? na : nd, k = ((j + 0.5) / n - 0.5) * 4.6;
        const surge = Math.sin(clock * (2.1 + j * 0.37) + j * 2.3 + (ours ? 0 : 1.6)) * 0.08;
        want.push({ ours, j, ship: ours ? a.id : t.id, ux: ours ? ux : -ux, uz: ours ? uz : -uz, key: `${a.id}:${ours ? 'a' : 'd'}:${j}`, p: gap(k + (ours ? 0.3 : -0.3) + Math.sin(clock * 1.3 + j) * 0.15, ((ours ? 0.45 : -0.15) + (ours ? -surge : surge) * 2) / L), pose: Math.floor(clock * 4 + j * 1.7 + (ours ? 0 : 0.5)) % 3, flip: ours ? (ux * CAM_RIGHT.x + uz * CAM_RIGHT.z < 0) : (ux * CAM_RIGHT.x + uz * CAM_RIGHT.z > 0) }); }
    }
    const seen = new Set(), clanCol = o => clothColour(state.clans?.[o]?.color || '#888888').multiplyScalar(1.25);
    const colA = clanCol(F.att), colD = clanCol(F.def);
    if (figureSprite) { realCrowd(fx, want, state, colA, colD, dt); return; }
    for (const w of want) { seen.add(w.key); let m = fx.men.find(x => x.key === w.key); if (!m) { m = { key: w.key, ...figure(), phase: rand(0, 1) }; fx.men.push(m); }
      const cell = ((w.j + (w.ours ? 0 : 1)) % 2) * 2 + ((clock * 1.1 + m.phase) % 1 < 0.45 ? 1 : 0), sx = (w.flip ? -1 : 1) * FIG_W, px = FIG_W * 0.024;
      for (const [i, x] of [m.s, ...m.o].entries()) {
        x.material.map.offset.set(cell / FIG_CELLS, 0); x.scale.set(sx, FIG_W, 1); x.visible = true;
        x.position.set(w.p.x, w.p.y + FIG_W * 0.42, w.p.z);
        if (i) { const [dx, dy] = OUT4[i - 1]; x.position.addScaledVector(CAM_RIGHT, dx * px).addScaledVector(CAM_UP, dy * px); x.material.color.copy(w.ours ? colA : colD); x.material.opacity = 0.85; }
      } }
    fx.men = fx.men.filter(m => { if (seen.has(m.key)) return true; dropFigure(m); return false; });
  }

  // ---- the bar ----
  const bars = new Map();   // fight key -> { mesh, g, tex, key }
  const BAR_PX = [420, 92], BAR_W = 7.4;
  function drawBar(g, { ours, theirs, oursCol, theirsCol, weak }) {
    const W = BAR_PX[0], H = BAR_PX[1] - 26, c = 12;
    g.clearRect(0, 0, W, BAR_PX[1]);
    const cut = (x0, y0, x1, y1, k) => { g.beginPath(); g.moveTo(x0 + k, y0); g.lineTo(x1 - k, y0); g.lineTo(x1, y0 + k); g.lineTo(x1, y1 - k); g.lineTo(x1 - k, y1); g.lineTo(x0 + k, y1); g.lineTo(x0, y1 - k); g.lineTo(x0, y0 + k); g.closePath(); };
    cut(2, 2, W - 2, H - 2, c);
    const lac = g.createLinearGradient(0, 0, 0, H); lac.addColorStop(0, 'rgba(38,24,17,.9)'); lac.addColorStop(1, 'rgba(18,11,8,.9)');
    g.fillStyle = lac; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(10,6,4,.9)'; g.stroke();
    cut(4, 4, W - 4, H - 4, c - 1); g.lineWidth = 1.6; g.strokeStyle = 'rgba(190,150,82,.85)'; g.stroke();
    const bx = 70, by = 20, bw = W - 140, bh = 22, f = ours + theirs > 0 ? ours / (ours + theirs) : 0.5, mid = bx + bw * f;
    g.fillStyle = '#080504'; g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const fill = (x0, x1, col) => { g.fillStyle = col; g.fillRect(x0, by, x1 - x0, bh); g.fillStyle = 'rgba(255,240,200,.2)'; g.fillRect(x0, by, x1 - x0, 5); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x0, by + bh - 4, x1 - x0, 4); };
    fill(bx, mid, oursCol); fill(mid, bx + bw, theirsCol);
    // where they meet: two small crossed blades
    g.save(); g.translate(mid, by + bh / 2); g.strokeStyle = '#efe0bd'; g.lineWidth = 2.4; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-9 * s, 11); g.lineTo(9 * s, -11); g.stroke(); }
    g.fillStyle = '#1b120c'; g.beginPath(); g.arc(0, 0, 3.4, 0, Math.PI * 2); g.fill(); g.restore();
    g.font = 'bold 20px Georgia, serif'; g.textBaseline = 'middle';
    g.fillStyle = '#f0e2c0'; g.textAlign = 'right'; g.fillText(String(Math.round(ours)), bx - 10, by + bh / 2 + 1);
    g.textAlign = 'left'; g.fillText(String(Math.round(theirs)), bx + bw + 10, by + bh / 2 + 1);
    if (weak) {   // a small tab under the boarded ship's side
      const tx = weak === 'left' ? bx + bw * 0.2 : bx + bw * 0.8, tw = 132;
      g.fillStyle = 'rgba(18,11,8,.92)'; g.fillRect(tx - tw / 2, H - 4, tw, 30); g.strokeStyle = 'rgba(196,67,44,.9)'; g.lineWidth = 1.5; g.strokeRect(tx - tw / 2 + 0.5, H - 3.5, tw - 1, 29);
      g.font = 'bold 20px Georgia, serif'; g.textAlign = 'center'; g.fillStyle = '#f0a488'; g.fillText('weakened', tx, H + 11);
    }
  }
  function bar(F, state, sprites, me) {
    let b = bars.get(F.t);
    if (!b) { const cv = document.createElement('canvas'); [cv.width, cv.height] = BAR_PX; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      mesh.scale.set(BAR_W, BAR_W * BAR_PX[1] / BAR_PX[0], 1); mesh.renderOrder = 99610; scene.add(mesh);
      b = { mesh, g: cv.getContext('2d'), tex, key: '' }; bars.set(F.t, b); }
    const v = F.view || { a: 0, d: 0 }, mine = me === F.def ? 'd' : 'a';   // your side on the left; a bystander sees the boarders on the left
    const ours = mine === 'a' ? v.a : v.d, theirs = mine === 'a' ? v.d : v.a;
    const weak = v.weak ? (mine === 'd' ? 'left' : 'right') : null;
    const key = `${ours}|${theirs}|${weak}|${me}`;
    if (key !== b.key) { b.key = key; drawBar(b.g, { ours, theirs, oursCol: me === F.att || me === F.def ? OWN : '#9a8a6a', theirsCol: FOE, weak }); b.tex.needsUpdate = true; }
    const t = state.entities[F.t], ships = F.ships.map(id => sprites.get(id)).filter(Boolean);
    if (!t || !ships.length) { b.mesh.visible = false; return; }
    let x = 0, z = 0; for (const id of F.ships) { const e = state.entities[id]; if (e) { x += e.x; z += e.z; } } x /= F.ships.length; z /= F.ships.length;
    const st = sprites.get(F.t), up = (st?.feetUp ?? 3.2) + (st?.cellWorld ?? 16) * 0.36 + 3.4;   // above the ships' own plates
    b.mesh.position.set(x, up, z); b.mesh.visible = true;
  }

  return {
    cast(c, state, sprites) {
      if (c.kind === 'boardGrapple') grapple(c);
      else if (c.kind === 'boardBreak') { const L = lines.get(c.a); if (L) { L.state = 'snap'; L.at = clock; } }
      else if (c.kind === 'boardFail') { const L = lines.get(c.a); if (L) { L.state = 'drop'; L.at = clock; } }
      else if (c.kind === 'shipCaptured' && state && sprites) captured(c, state, sprites);
    },
    update(state, sprites, dt, place, me) {
      clock += dt;
      for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= clock) { const f = later[i].fn; later.splice(i, 1); f(); }
      const seen = new Set();
      if (place === 'world') for (const e of Object.values(state.entities)) {
        if (!e.ship) continue;
        const s = sprites.get(e.id); if (!s?.thing?.mesh) continue;
        seen.add(e.id);
        clanLook(e, s, state, dt);
      }
      for (const [id, p] of pens) if (!seen.has(id) || state.entities[id]?.dead) { scene.remove(p.mesh); p.mesh.material.dispose(); if (p.old) { scene.remove(p.old.mesh); p.old.mesh.material.dispose(); } pens.delete(id); }
      drawLines(state);
      const live = new Set();
      if (place === 'world') for (const F of Object.values(state.frontier?.boardings || {})) { live.add(F.t); deckFight(F, state, dt); bar(F, state, sprites, me); }
      for (const [k, fx] of fightFx) if (!live.has(k)) { for (const m of fx.men) { if (m.o) dropFigure(m); else dropFighter(m); } fightFx.delete(k); }
      for (const [k, b] of bars) if (!live.has(k)) { scene.remove(b.mesh); b.mesh.material.dispose(); b.tex.dispose(); bars.delete(k); }
      glow.update(dt); soot.update(dt);
    },
  };
}
