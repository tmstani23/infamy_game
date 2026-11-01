// Equipped-item effects (Tim 2026-11-01): every item kind has its own look, subtle but readable
// at medium zoom. Presentation only; the item's visual.kind comes from sim/gear_catalog.js.
//   weapon    weaponGlint  a short spark slides along the blade edge every few seconds
//             weaponEmbers a few sparks drift off the blade, more on swings
//             weaponTrail  a thin light arc follows the blade tip on swings
//   armor     armorShimmer thin light along the body outline, slow top-to-toe sweep
//             bodyOutline  1-2 faint afterimages trail the body while moving
//   accessory accessoryAura tiny spirit motes rise around the body and fade
//             movementWisps thin wind curls on the ground behind the feet while running
// Sprite-local units: the quad is 1 x 1 centred on 0, y up (same as render/run_trail.js).
import * as THREE from 'three';
import { CAM_QUAT } from './iso.js';
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
  let fx = {}, clock = 0, last = null;

  function build(kind, color, strength) {
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
    return null;
  }

  function set(items = []) {
    dispose();
    fx = {};
    items.forEach(item => {
      const v = item?.visual; if (!v?.kind) return;
      const made = build(v.kind, v.color || item.glow || [.8, .8, .7], v.strength || 1);
      if (made) fx[v.kind] = made;
    });
  }

  // world offset -> this sprite's local plane units
  const inv = CAM_QUAT.clone().invert(), tmp = new THREE.Vector3();
  const toLocal = (dx, dz) => tmp.set(dx, 0, dz).applyQuaternion(inv).divideScalar(mesh.scale.x);

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
  return { set, update, dispose };
}
export const GEAR_SLOT_OF_KIND = SLOT_KINDS;
