// Equipped-item effects (Tim 2026-11-01): every item kind has its own look, subtle but readable
// at medium zoom. Presentation only; the item's visual.kind comes from sim/gear_catalog.js.
//   weapon    weaponGlint  a short spark slides along the blade edge every few seconds
//             weaponEmbers a few sparks drift off the blade, more on swings
//             weaponTrail  a thin light arc follows the blade tip on swings
//   armor     armorShimmer thin light along the body outline, slow top-to-toe sweep
//             bodyOutline  1-2 faint afterimages trail the body while moving
//   accessory accessoryAura tiny spirit motes rise around the body and fade
//             movementWisps thin wind curls on the ground behind the feet while running
//   castle heirlooms (Tim 2026-11-25, after web research on slash VFX): heirloomArc, a short tapered crescent swept
//             round the hands, about 1.35x the blade's reach, revealed with the swing and gone in a fifth of a second.
//             Each sword has its own shape, not just its colour: Benikiri a broad, short crimson sweep with red drops
//             flung off; Shimotsuki a thin, long, cold crescent shedding ice; Kagenui a dark smoke band sewn with
//             black stitches and a pale rim. Mocks: project files war_build/wildlife/w7/fx_mock/.
//   frontier charms (wildlife W7b): fangDodge, on a dodge a cold afterimage steps back and three short rips hang
//             where he was; clawStrike, the hands glow amber through a swing and a hit leaves three claw rakes and
//             a little grit on the one struck. Both fire on the moment only (render/view.js hit(), dodge()).
// Sprite-local units: the quad is 1 x 1 centred on 0, y up (same as render/run_trail.js).
import * as THREE from 'three';
import { CAM_QUAT } from './iso.js';
import { SCREEN_RIGHT, SCREEN_DOWN } from '../sim/geometry.js';
import { SPRITE_VERT } from './shading.js';
import { SPRITE_SAMPLE } from './packed_sheets.js';

const SLOT_KINDS = { weapon: 0, armor: 1, accessory: 2 };
const MOVING = new Set(['walk', 'run']);

// soft round points with their own alpha, additive
function pointsMaterial(color, size) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(...color) }, uSize: { value: size }, uStrength: { value: 1 } },
    vertexShader: `attribute float aAlpha; varying float vA; uniform float uSize;
      void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vA;
      void main() { vec2 p = gl_PointCoord - 0.5; float d = dot(p, p) * 4.0; if (d > 1.0 || vA < 0.01) discard;
        float core = exp(-d * 6.0), halo = (1.0 - d) * 0.35;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.55) * (core + halo) * vA * uStrength, 1.0); }`,
    transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
function lineMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(...color) }, uStrength: { value: 1 } },
    vertexShader: `attribute float aAlpha; varying float vA; void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vA; void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uColor * vA * uStrength, 1.0); }`,
    transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
function dynamic(count, withAlpha = true) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  if (withAlpha) g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
  return g;
}
// the heirloom swing arc: aUV.x 0 oldest .. 1 leading edge, aUV.y 0 inner .. 1 outer; aLife fades it
const ARC_STYLE = { benikiri: 0, shimotsuki: 1, kagenui: 2 };
function arcMaterial(color, style) {
  const dark = style === 2;
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(...color) }, uStrength: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `attribute vec2 aUV; attribute float aLife; varying vec2 vUV; varying float vL;
      void main() { vUV = aUV; vL = aLife; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength, uTime; varying vec2 vUV; varying float vL;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float u = vUV.x, v = vUV.y;
        float k = n(vec2(u * 7.0 - uTime * 4.0, v * 3.0)) * 0.6 + n(vec2(u * 17.0 - uTime * 7.0, v * 7.0)) * 0.4;
        float body = vL * smoothstep(0.0, 0.3, v) * (0.3 + 0.7 * pow(v, 1.4)) * smoothstep(0.0, 0.15, u);
        float lip = vL * smoothstep(0.82, 0.97, v) * (1.0 - smoothstep(0.97, 1.0, v));
        ${dark ? `
        float stitch = step(0.72, fract(u * 9.0 + v * 1.6)) * smoothstep(0.3, 0.42, v) * (1.0 - smoothstep(0.68, 0.8, v)) * vL;
        float a = clamp(body * 0.5 * (0.55 + 0.8 * k) + stitch * 0.55, 0.0, 0.75) * uStrength;
        vec3 c = mix(vec3(0.07, 0.04, 0.1), vec3(0.02, 0.01, 0.03), stitch);
        c = mix(c, uColor, lip * 0.85);
        a = max(a, lip * 0.5 * uStrength);
        if (a < 0.01) discard;
        gl_FragColor = vec4(c, a);` : `
        vec3 edge = ${style === 0 ? 'vec3(0.9, 0.3, 0.22)' : 'vec3(0.86, 0.94, 1.0)'};
        float a = (body * (0.5 + 0.5 * k) * ${style === 0 ? '0.8' : '0.6'} + lip * 0.55) * uStrength;
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(uColor, edge, smoothstep(0.75, 1.0, v)) * min(a, 0.7), 1.0);`}
      }`,
    transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
    blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
}
// a camera-facing tapered strip through 2D points (sprite-local plane), written as triangles with aAlpha
function writeStrip(pos, al, v, pts, widths, alphas, max) {
  for (let i = 0; i + 1 < pts.length && v + 6 <= max; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const wa = widths[i] / 2, wb = widths[i + 1] / 2;
    const P = [[ax + nx * wa, ay + ny * wa, alphas[i]], [ax - nx * wa, ay - ny * wa, alphas[i]], [bx + nx * wb, by + ny * wb, alphas[i + 1]], [bx - nx * wb, by - ny * wb, alphas[i + 1]]];
    for (const q of [0, 1, 2, 2, 1, 3]) { pos.setXYZ(v, P[q][0], P[q][1], 0); al.setX(v++, P[q][2]); }
  }
  return v;
}
// thin light along the sprite's own silhouette; band = sweep position (0 top .. 1 feet)
function rimMaterial(u, color, packed) {
  return new THREE.ShaderMaterial({
    defines: packed ? { PACKED_SPRITE: 1 } : {},
    uniforms: { uMap: u.uMap, uFrame: u.uFrame, uSampleBounds: u.uSampleBounds, uDepthAt: u.uDepthAt, uOpacity: u.uOpacity,
      uColor: { value: new THREE.Color(...color) }, uBand: { value: -1 }, uStrength: { value: 1 } },
    vertexShader: SPRITE_VERT,
    fragmentShader: `${SPRITE_SAMPLE}
      uniform float uOpacity, uBand, uStrength; uniform vec3 uColor; uniform vec4 uFrame; varying vec2 vUv;
      void main() {
        float a = spriteTex(vUv).a; if (a < 0.3) discard;
        vec2 px = vec2(length(dFdx(vUv)), length(dFdy(vUv))) * 1.6;
        float n = min(min(spriteTex(vUv + vec2(px.x, 0.0)).a, spriteTex(vUv - vec2(px.x, 0.0)).a),
                      min(spriteTex(vUv + vec2(0.0, px.y)).a, spriteTex(vUv - vec2(0.0, px.y)).a));
        float edge = clamp((a - n) * 1.4, 0.0, 1.0);
        float y = 1.0 - (vUv.y - uFrame.y) / uFrame.w;              // 0 top of cell .. 1 bottom
        float k = (y - uBand) / 0.09, sweep = uBand > -0.5 ? exp(-k * k) : 0.0;
        float g = edge * (0.16 + 0.95 * sweep) * uStrength * uOpacity;
        if (g < 0.01) discard;
        gl_FragColor = vec4(uColor * g, 1.0);
      }`,
    transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
// a faint tinted copy of an earlier frame
function ghostMaterial(u, color, packed) {
  return new THREE.ShaderMaterial({
    defines: packed ? { PACKED_SPRITE: 1 } : {},
    uniforms: { uMap: { value: u.uMap.value }, uFrame: { value: new THREE.Vector4() }, uSampleBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
      uDepthAt: u.uDepthAt, uOpacity: u.uOpacity, uColor: { value: new THREE.Color(...color) }, uStrength: { value: 0 } },
    vertexShader: SPRITE_VERT,
    fragmentShader: `${SPRITE_SAMPLE}
      uniform float uOpacity, uStrength; uniform vec3 uColor; varying vec2 vUv;
      void main() { vec4 t = spriteTex(vUv); float a = t.a * uStrength * uOpacity; if (a < 0.01) discard;
        gl_FragColor = vec4(mix(t.rgb, uColor, 0.65), a); }`,
    transparent: true, depthTest: true, depthWrite: false,
  });
}

export function createGearFx(sprite) {
  const mesh = sprite.thing.mesh, u = sprite.material.uniforms, packed = !!sprite.sheets.packing;
  const cw = sprite.cellWorld, feetY = -sprite.feetUp / cw, bodyH = 1.7 / cw, bodyW = 0.3 / cw;
  const parts = [];            // everything we made, for dispose
  const own = (obj, parent = mesh, extra = true) => { obj.frustumCulled = false; obj.visible = false; parent.add(obj); if (extra && parent === mesh) sprite.thing.extras.push(obj); parts.push(obj); return obj; };
  let fx = {}, clock = 0, last = null, lastDir = 0, lastFrame = null;

  function build(kind, color, strength, v = {}) {
    const sz = 1 + Math.max(0, strength - 1) * 0.75;   // green items (strength > 1): bigger, not just brighter
    if (kind === 'weaponEmbers' && sprite.glow) {
      const n = 12, pts = own(new THREE.Points(dynamic(n), pointsMaterial(color, 5 * sz)));
      pts.position.z = 0.02;
      return { slot: 0, obj: pts, list: [], spawn: 0, strength };
    }
    if (kind === 'weaponTrail' && sprite.glow) {
      const n = 14, line = own(new THREE.Line(dynamic(n), lineMaterial(color)));
      line.position.z = 0.02;
      return { slot: 0, obj: line, tips: [], strength };
    }
    if (kind === 'weaponGlint' && sprite.glow) return { slot: 0, strength, offset: Math.random() * 3 };
    if (kind === 'armorShimmer') {
      const rim = own(new THREE.Mesh(mesh.geometry, rimMaterial(u, color, packed)));
      rim.position.z = 0.004;
      return { slot: 1, obj: rim, strength, offset: Math.random() * 4.5 };
    }
    if (kind === 'bodyOutline') {
      const ghosts = [0, 1].map(() => { const g = own(new THREE.Mesh(mesh.geometry, ghostMaterial(u, color, packed))); return g; });
      return { slot: 1, ghosts, history: [], tick: 0, fade: 0, strength };
    }
    if (kind === 'accessoryAura') {
      const n = 7, pts = own(new THREE.Points(dynamic(n), pointsMaterial(color, 7 * sz)));   // 3 px read as nothing
      pts.position.z = 0.02;
      return { slot: 2, obj: pts, list: [], spawn: 0, strength };
    }
    if (kind === 'movementWisps') {
      // on the ground: children of the shadow quad (rotated flat), so they lie along the street
      // soft ribbons (1 px GL lines were too faint): per segment 2 quads, edge alpha 0 -> centre -> edge 0
      const n = 3 * 12, lines = own(new THREE.Mesh(dynamic(n * 12), lineMaterial(color)), sprite.shadow, false);
      lines.material.side = THREE.DoubleSide; lines.position.z = 0.005; lines.renderOrder = 2;   // over the street, with the other ground marks
      return { slot: 2, obj: lines, list: [], spawn: 0, strength, sz };
    }
    if (kind === 'heirloomArc') {
      const style = ARC_STYLE[v.style] ?? 0, MAX = 720, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aUV', new THREE.BufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage));
      const arc = own(new THREE.Mesh(g, arcMaterial(color, style)));
      arc.position.z = 0.018;
      const bits = style === 2 ? null : own(new THREE.Points(dynamic(16), pointsMaterial(style === 0 ? [.62, .08, .07] : [.78, .88, 1], (style === 0 ? 4 : 3.5) * sz)));
      if (bits) bits.position.z = 0.02;
      // width of the band (share of the reach), how long a point of it lives (s)
      const shape = [{ width: 0.75, life: 0.18 }, { width: 0.28, life: 0.3 }, { width: 0.55, life: 0.24 }][style];
      return { slot: 0, obj: arc, bits, list: [], hist: [], spawn: 0, strength, style, MAX, ...shape };
    }
    if (kind === 'clawStrike') {
      const hand = own(new THREE.Points(dynamic(1), pointsMaterial(color, 16 * sz)));
      hand.position.z = 0.02;
      const MAX = 600, rakes = own(new THREE.Mesh(dynamic(MAX), lineMaterial(color)));
      rakes.material.side = THREE.DoubleSide; rakes.position.z = 0.025;
      const grit = own(new THREE.Points(dynamic(14), pointsMaterial([.5, .42, .32], 3 * sz)));
      grit.position.z = 0.024;
      return { slot: 2, hand, rakes, grit, marks: [], list: [], glow: 0, strength, MAX };
    }
    if (kind === 'fangDodge') {
      const ghost = own(new THREE.Mesh(mesh.geometry, ghostMaterial(u, color, packed)));
      const MAX = 300, rips = own(new THREE.Mesh(dynamic(MAX), lineMaterial(color)));
      rips.material.side = THREE.DoubleSide; rips.position.z = 0.02;
      return { slot: 2, ghost, rips, t: -1, from: null, cuts: [], strength, MAX };
    }
    return null;
  }

  function set(items = []) {
    dispose();
    fx = {};
    items.forEach(item => {
      const v = item?.visual; if (!v?.kind) return;
      const made = build(v.kind, v.color || item.glow || [.8, .8, .7], v.strength || 1, v);
      if (made) fx[v.kind] = made;
    });
  }

  // world offset -> this sprite's local plane units
  const inv = CAM_QUAT.clone().invert(), tmp = new THREE.Vector3();
  const toLocal = (dx, dz) => tmp.set(dx, 0, dz).applyQuaternion(inv).divideScalar(mesh.scale.x);
  const toLocalUp = (dx, h, dz) => tmp.set(dx, h, dz).applyQuaternion(inv).divideScalar(mesh.scale.x);
  const facing = d => { const a = d * Math.PI / 4, r = -Math.sin(a), dn = Math.cos(a);   // sprite row -> world ground direction (sim/geometry.js dirIndex)
    const x = r * SCREEN_RIGHT.x + dn * SCREEN_DOWN.x, z = r * SCREEN_RIGHT.z + dn * SCREEN_DOWN.z, l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
  // the moment a hit lands (render/view.js addHits): claw rakes on the one struck, dx/dz from him to them
  function hit(dx, dz, crit) {
    const c = fx.clawStrike; if (!c) return;
    const l = toLocalUp(dx, 1.05, dz);
    const lx = l.x, ly = l.y + feetY;   // the plane's origin is the cell centre, his feet sit at feetY
    c.marks.push({ x: lx, y: ly, t: 0, big: crit ? 1.25 : 1 });
    if (c.marks.length > 3) c.marks.shift();
    for (let i = 0; i < 5; i++) c.list.push({ x: lx + (Math.random() - 0.5) * 0.1, y: ly - 0.05, vx: (Math.random() - 0.5) * 0.12, vy: 0.05 + Math.random() * 0.1, life: 1 });
    if (c.list.length > 14) c.list.splice(0, c.list.length - 14);
  }
  // the moment he dodges (render/view.js addDodges): a cold afterimage steps back, three rips hang where he was
  function dodge() {
    const f = fx.fangDodge; if (!f || !lastFrame) return;
    const b = facing(lastDir), l = toLocal(-b.x * 0.4, -b.z * 0.4);
    f.t = 0; f.from = { x: l.x, y: l.y }; f.frame = lastFrame;
    const side = Math.sign(l.x) || 1;
    f.cuts = [0, 1, 2].map(i => ({ y: feetY + bodyH * (0.45 + 0.17 * i) + (Math.random() - 0.5) * 0.02, x0: l.x * 0.3 + side * (0.02 + 0.01 * i), len: (0.1 + Math.random() * 0.05) * side, j: Math.random() }));
  }

  function update(dt, { anim, sheet, dir, frame, swingT, x, z, focus = null }) {
    clock += dt;
    const op = u.uOpacity?.value ?? 1;   // stealth/fade: effects never show more than the body does
    const dead = anim === 'death', swinging = (anim === 'attack' || anim === 'sweep') && swingT !== null;
    const axis = sheet.bladeAxes?.[dir * sheet.frames + frame];
    const boost = slot => focus == null ? 1 : focus.slot === slot ? focus.pulse : 0.3;
    const moved = last ? Math.hypot(x - last.x, z - last.z) : 0, mdx = last ? x - last.x : 0, mdz = last ? z - last.z : 0;
    last = { x, z };

    const glint = fx.weaponGlint;
    const w = sprite.weapon, heroShimmer = w?.hero && !w.lightning && !w.shadow;   // that blade keeps its own shimmer
    if (glint && sprite.glow?.material.uniforms.uShimmer) {
      const g = sprite.glow.material.uniforms, t = (clock + glint.offset) % 3, on = t < 0.45 && !dead;
      if (!heroShimmer) g.uShimmer.value = on ? -0.1 + 1.2 * (t / 0.45) : -1;   // a hero shimmer blade only gets the brief brightening
      if (on) g.uStrength.value *= 1 + 0.25 * Math.sin(Math.PI * t / 0.45) * glint.strength * boost(0);
    }

    const embers = fx.weaponEmbers;
    if (embers) {
      embers.spawn -= dt;
      if (axis && !dead && embers.spawn <= 0) {
        embers.spawn = swinging ? 0.06 : 0.45;
        const t = 0.3 + Math.random() * 0.7;
        embers.list.push({ x: axis.base.x + (axis.tip.x - axis.base.x) * t - 0.5, y: axis.base.y + (axis.tip.y - axis.base.y) * t - 0.5,
          vx: (Math.random() - 0.5) * 0.02, vy: 0.03 + Math.random() * 0.04, life: 1 });
      }
      writePoints(embers, 0.9, dt);
    }

    const trail = fx.weaponTrail;
    if (trail) {
      if (swinging && axis) trail.tips.unshift({ x: axis.tip.x - 0.5, y: axis.tip.y - 0.5, life: 1 });
      for (const p of trail.tips) p.life -= dt / (swinging ? 0.35 : 0.15);
      trail.tips = trail.tips.filter(p => p.life > 0).slice(0, 14);
      const pos = trail.obj.geometry.attributes.position, al = trail.obj.geometry.attributes.aAlpha;
      trail.tips.forEach((p, i) => { pos.setXYZ(i, p.x, p.y, 0); al.setX(i, 0.55 * p.life * (1 - i / 14)); });
      trail.obj.geometry.setDrawRange(0, trail.tips.length);
      pos.needsUpdate = al.needsUpdate = true;
      trail.obj.visible = trail.tips.length > 1;
      trail.obj.material.uniforms.uStrength.value = trail.strength * boost(0) * op;
    }

    const sheen = fx.armorShimmer;
    if (sheen) {
      sheen.obj.visible = !dead;
      const t = (clock + sheen.offset) % 4.5;
      sheen.obj.material.uniforms.uBand.value = t < 1.6 ? -0.1 + 1.2 * (t / 1.6) : -1;
      sheen.obj.material.uniforms.uStrength.value = sheen.strength * boost(1);
    }

    const after = fx.bodyOutline;
    if (after) {
      const moving = MOVING.has(anim) && moved > 0.0005 && !dead;
      after.fade = Math.max(0, Math.min(1, after.fade + (moving ? dt / 0.2 : -dt / 0.25)));
      after.tick -= dt;
      if (moving && after.tick <= 0) {
        after.tick = 0.07;
        after.history.unshift({ map: u.uMap.value, frame: u.uFrame.value.clone(), bounds: u.uSampleBounds.value.clone(), x, z });
        after.history.length = Math.min(after.history.length, 6);
      }
      after.ghosts.forEach((g, i) => {
        const h = after.history[(i + 1) * 2];
        g.visible = !!h && after.fade > 0;
        if (!g.visible) return;
        const gu = g.material.uniforms;
        gu.uMap.value = h.map; gu.uFrame.value.copy(h.frame); gu.uSampleBounds.value.copy(h.bounds);
        const l = toLocal(h.x - x, h.z - z);
        g.position.set(l.x, l.y, -0.01 - 0.005 * i);
        gu.uStrength.value = (i ? 0.13 : 0.24) * after.fade * after.strength * boost(1);
      });
    }

    const motes = fx.accessoryAura;
    if (motes) {
      motes.spawn -= dt;
      if (!dead && motes.spawn <= 0 && motes.list.length < 7) {
        motes.spawn = 0.35 + Math.random() * 0.25;
        motes.list.push({ x: (Math.random() * 2 - 1) * bodyW * 1.6, y: feetY + bodyH * (0.1 + Math.random() * 0.6),
          vx: (Math.random() - 0.5) * 0.03, vy: 0.06 + Math.random() * 0.04, life: 1 });
      }
      writePoints(motes, 2.4, dt, true);
    }

    const wisps = fx.movementWisps;
    if (wisps) {
      const running = anim === 'run' && moved > 0.0005 && !dead;
      wisps.spawn -= dt;
      if (running && wisps.spawn <= 0) {
        wisps.spawn = 0.22;
        // ground units (shadow quad: local x = world x, local y = -world z), behind the feet
        const len = Math.hypot(mdx, mdz) || 1, bx = -mdx / len, bz = -mdz / len, side = (Math.random() - 0.5) * 0.5;
        wisps.list.push({ ox: bx * 0.25 - bz * side, oz: bz * 0.25 + bx * side, bx, bz, bend: Math.random() < 0.5 ? -1 : 1, life: 1 });
        if (wisps.list.length > 3) wisps.list.shift();
      }
      const pos = wisps.obj.geometry.attributes.position, al = wisps.obj.geometry.attributes.aAlpha;
      let v = 0;
      for (const w of wisps.list) {
        w.life -= dt / 0.7;
        const grow = Math.min(1, (1 - w.life) * 2.5), L = 0.55 * grow * wisps.sz;
        let px = w.ox, pz = w.oz;
        for (let k = 1; k <= 12; k++) {
          const s = k / 12, curl = Math.sin(s * Math.PI) * 0.12 * w.bend;
          const nx = w.ox + w.bx * L * s - w.bz * curl, nz = w.oz + w.bz * L * s + w.bx * curl;
          const a = Math.max(0, w.life) * Math.sin(s * Math.PI) * 0.75, hw = 0.045 * wisps.sz * (1 - 0.5 * s);
          const dl = Math.hypot(nx - px, nz - pz) || 1, qx = -(nz - pz) / dl * hw, qz = (nx - px) / dl * hw;
          // ground plane: local (x, -z)
          const P = [[px, pz, a], [nx, nz, a], [px + qx, pz + qz, 0], [nx + qx, nz + qz, 0], [px - qx, pz - qz, 0], [nx - qx, nz - qz, 0]];
          for (const [i, j, k] of [[0, 1, 2], [1, 3, 2], [0, 4, 1], [1, 4, 5]]) for (const q of [i, j, k]) { pos.setXYZ(v, P[q][0], -P[q][1], 0); al.setX(v++, P[q][2]); }
          px = nx; pz = nz;
        }
      }
      wisps.list = wisps.list.filter(w => w.life > 0);
      wisps.obj.geometry.setDrawRange(0, v);
      pos.needsUpdate = al.needsUpdate = true;
      wisps.obj.visible = v > 0;
      wisps.obj.material.uniforms.uStrength.value = wisps.strength * boost(2) * op;
    }

    lastDir = dir; lastFrame = { map: u.uMap.value, frame: u.uFrame.value.clone(), bounds: u.uSampleBounds.value.clone() };

    const arc = fx.heirloomArc;
    if (arc) {
      // the blade's sweep, in this sprite's plane: base (hands) and tip per frame while swinging
      if (swinging && axis && !dead) {
        const h0 = arc.hist[0], bx = axis.base.x - 0.5, by = axis.base.y - 0.5, tx = axis.tip.x - 0.5, ty = axis.tip.y - 0.5;
        if (!h0 || Math.hypot(tx - h0.tx, ty - h0.ty) > 0.004) arc.hist.unshift({ bx, by, tx, ty, life: 1 });
        if (arc.style !== 2) { arc.spawn -= dt; if (arc.spawn <= 0 && h0) { arc.spawn = arc.style ? 0.07 : 0.05;
          const R = 1.3; arc.list.push({ x: bx + (tx - bx) * R, y: by + (ty - by) * R, vx: (tx - h0.tx) * 2 + (Math.random() - 0.5) * 0.05, vy: (ty - h0.ty) * 2 + 0.03, life: 1 }); } }
      }
      for (const p of arc.hist) p.life -= dt / (swinging ? arc.life : arc.life * 0.6);
      arc.hist = arc.hist.filter(p => p.life > 0).slice(0, 14);
      const pos = arc.obj.geometry.attributes.position, uv = arc.obj.geometry.attributes.aUV, lf = arc.obj.geometry.attributes.aLife;
      // smooth the steps between sheet frames: turn the blade about the hands, 5 samples per step
      const pts = [], H = arc.hist.slice().reverse();
      for (let i = 0; i + 1 < H.length; i++) {
        const A = H[i], B = H[i + 1], aA = Math.atan2(A.ty - A.by, A.tx - A.bx), aB = Math.atan2(B.ty - B.by, B.tx - B.bx);
        let da = aB - aA; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        const lA = Math.hypot(A.tx - A.bx, A.ty - A.by), lB = Math.hypot(B.tx - B.bx, B.ty - B.by);
        for (let k = 0; k < 5; k++) { const t = k / 5; pts.push({ bx: A.bx + (B.bx - A.bx) * t, by: A.by + (B.by - A.by) * t, a: aA + da * t, l: lA + (lB - lA) * t, life: A.life + (B.life - A.life) * t }); }
        if (i + 2 === H.length) pts.push({ bx: B.bx, by: B.by, a: aB, l: lB, life: B.life });
      }
      let v = 0;
      const REACH = 1.35, n = pts.length;
      const put = (x, y, U, V, L) => { pos.setXYZ(v, x, y, 0); uv.setXY(v, U, V); lf.setX(v++, L); };
      for (let i = 0; i + 1 < n && v + 6 <= arc.MAX; i++) {
        const q = [pts[i], pts[i + 1]].map((p, j) => { const U = (i + j) / (n - 1), w = arc.width * Math.pow(U, 0.8), c = Math.cos(p.a), s2 = Math.sin(p.a);
          return { ox: p.bx + c * p.l * REACH, oy: p.by + s2 * p.l * REACH, ix: p.bx + c * p.l * (REACH - w), iy: p.by + s2 * p.l * (REACH - w), U, L: p.life }; });
        const [P, Q] = q;
        put(P.ix, P.iy, P.U, 0, P.L); put(P.ox, P.oy, P.U, 1, P.L); put(Q.ix, Q.iy, Q.U, 0, Q.L);
        put(Q.ix, Q.iy, Q.U, 0, Q.L); put(P.ox, P.oy, P.U, 1, P.L); put(Q.ox, Q.oy, Q.U, 1, Q.L);
      }
      arc.obj.geometry.setDrawRange(0, v);
      pos.needsUpdate = uv.needsUpdate = lf.needsUpdate = true;
      arc.obj.visible = v > 0;
      arc.obj.material.uniforms.uStrength.value = Math.min(1.3, arc.strength) * boost(0) * op;
      arc.obj.material.uniforms.uTime.value = clock;
      if (arc.bits) {   // Benikiri's red drops fall; Shimotsuki's ice drifts down slowly
        const g = arc.style === 0 ? 1.4 : 0.25, bp = arc.bits.geometry.attributes.position, ba = arc.bits.geometry.attributes.aAlpha;
        for (const q of arc.list) { q.life -= dt / (arc.style === 0 ? 0.45 : 0.8); q.vy -= g * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
        arc.list = arc.list.filter(q => q.life > 0).slice(-16);
        arc.list.forEach((q, i) => { bp.setXYZ(i, q.x, q.y, 0); ba.setX(i, q.life * 0.8); });
        arc.bits.geometry.setDrawRange(0, arc.list.length); bp.needsUpdate = ba.needsUpdate = true;
        arc.bits.visible = arc.list.length > 0;
        arc.bits.material.uniforms.uStrength.value = arc.strength * boost(0) * op;
      }
    }

    const claw = fx.clawStrike;
    if (claw) {
      // amber in the hands through a swing, fading after it
      claw.glow = Math.max(0, Math.min(1, claw.glow + (swinging && !dead ? dt / 0.08 : -dt / 0.3)));
      const hp = claw.hand.geometry.attributes.position, ha = claw.hand.geometry.attributes.aAlpha;
      if (axis) hp.setXYZ(0, axis.base.x - 0.5, axis.base.y - 0.5, 0);
      ha.setX(0, 0.45 * claw.glow); hp.needsUpdate = ha.needsUpdate = true;
      claw.hand.geometry.setDrawRange(0, 1); claw.hand.visible = claw.glow > 0.01 && !!axis;
      claw.hand.material.uniforms.uStrength.value = claw.strength * boost(2) * op;
      // three rakes on the one struck: drawn in over 0.08 s, gone by 0.4 s; thick heads, thin tails, uneven
      const pos = claw.rakes.geometry.attributes.position, al = claw.rakes.geometry.attributes.aAlpha, S = 1 / mesh.scale.x;
      let v = 0;
      for (const m of claw.marks) m.t += dt;
      claw.marks = claw.marks.filter(m => m.t < 0.4);
      for (const m of claw.marks) {
        const grow = Math.min(1, m.t / 0.08), fade = 1 - Math.max(0, (m.t - 0.15) / 0.25);
        [[-0.16, 0.85], [0, 1], [0.15, 0.75]].forEach(([off, ln], k) => {
          const L = 0.75 * ln * m.big * S, pts = [], ws = [], as = [];
          for (let j = 0; j <= 8; j++) { const t = j / 8 * grow;
            pts.push([m.x + off * S + (-0.35 + t) * L * 0.55, m.y + (0.35 - t) * L + Math.sin(t * Math.PI) * 0.02 * S]);
            ws.push((0.012 + 0.07 * Math.pow(1 - t, 0.5) * Math.min(1, t * 6)) * S * m.big); as.push(fade * (1 - 0.5 * t) * (0.8 + 0.2 * Math.sin(j * 2.3 + k))); }
          v = writeStrip(pos, al, v, pts, ws, as, claw.MAX);
        });
      }
      claw.rakes.geometry.setDrawRange(0, v); pos.needsUpdate = al.needsUpdate = true;
      claw.rakes.visible = v > 0;
      claw.rakes.material.uniforms.uStrength.value = 0.6 * claw.strength * op;
      const gp = claw.grit.geometry.attributes.position, ga = claw.grit.geometry.attributes.aAlpha;
      for (const q of claw.list) { q.life -= dt / 0.5; q.vy -= 0.5 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
      claw.list = claw.list.filter(q => q.life > 0);
      claw.list.forEach((q, i) => { gp.setXYZ(i, q.x, q.y, 0); ga.setX(i, q.life * 0.6); });
      claw.grit.geometry.setDrawRange(0, claw.list.length); gp.needsUpdate = ga.needsUpdate = true;
      claw.grit.visible = claw.list.length > 0;
      claw.grit.material.uniforms.uStrength.value = claw.strength * op;
    }

    const fang = fx.fangDodge;
    if (fang) {
      if (fang.t >= 0) fang.t += dt;
      const on = fang.t >= 0 && fang.t < 0.4;
      fang.ghost.visible = on && !dead;
      if (on) {   // the afterimage eases back from him and fades
        const k = Math.min(1, fang.t / 0.12), gu = fang.ghost.material.uniforms, f = fang.frame;
        gu.uMap.value = f.map; gu.uFrame.value.copy(f.frame); gu.uSampleBounds.value.copy(f.bounds);
        fang.ghost.position.set(fang.from.x * k, fang.from.y * k, -0.01);
        gu.uStrength.value = 0.28 * (1 - fang.t / 0.4) * fang.strength;
      }
      const pos = fang.rips.geometry.attributes.position, al = fang.rips.geometry.attributes.aAlpha;
      let v = 0;
      if (on) for (const c of fang.cuts) {
        const grow = Math.min(1, fang.t / 0.06), fade = 1 - Math.max(0, (fang.t - 0.1) / 0.3), pts = [], ws = [], as = [];
        for (let j = 0; j <= 6; j++) { const t = j / 6 * grow; pts.push([c.x0 + c.len * t, c.y - 0.012 * t + (j % 2 ? 0.004 : -0.004) * (0.5 + c.j)]); ws.push(0.022 * (1 - t) + 0.002); as.push(fade * (1 - 0.6 * t)); }
        v = writeStrip(pos, al, v, pts, ws, as, fang.MAX);
      }
      fang.rips.geometry.setDrawRange(0, v); pos.needsUpdate = al.needsUpdate = true;
      fang.rips.visible = v > 0;
      fang.rips.material.uniforms.uStrength.value = 0.5 * fang.strength * op;
    }

    function writePoints(p, life, dt, twinkle = false) {
      const pos = p.obj.geometry.attributes.position, al = p.obj.geometry.attributes.aAlpha;
      for (const q of p.list) { q.life -= dt / life; q.x += q.vx * dt; q.y += q.vy * dt; }
      p.list = p.list.filter(q => q.life > 0);
      p.list.forEach((q, i) => {
        pos.setXYZ(i, q.x, q.y, 0);
        const fadeIn = Math.min(1, (1 - q.life) * 5);
        al.setX(i, q.life * fadeIn * (twinkle ? 0.7 + 0.3 * Math.sin(clock * 9 + i) : 1));
      });
      p.obj.geometry.setDrawRange(0, p.list.length);
      pos.needsUpdate = al.needsUpdate = true;
      p.obj.visible = p.list.length > 0;
      p.obj.material.uniforms.uStrength.value = p.strength * boost(p.slot) * op;
    }
  }

  function dispose() {
    for (const o of parts) {
      o.parent?.remove(o);
      const i = sprite.thing.extras.indexOf(o); if (i >= 0) sprite.thing.extras.splice(i, 1);
      if (o.geometry !== mesh.geometry) o.geometry.dispose();
      o.material.dispose();
    }
    parts.length = 0;
  }
  return { set, update, dispose, hit, dodge };
}
export const GEAR_SLOT_OF_KIND = SLOT_KINDS;
