// Wandering folk props (world variety P2, sim/wandering_folk.js): what a scene brings with it, as island art. Each scene's
// props list (scene.props) is plain data from the sim: a seat log under a sitter ({ seat: true, fx, fz }: lying along his
// facing toward fx, fz, the way render/campfire_fx.js lays its logs), and a night camp's fire ({ fire: true }: the campfire
// art, its flames and its light). A fire put out (out = tick) loses its flames at once and its glow shrinks away over
// emberSeconds. A scene's props go with the scene.
// The hermit's brew going off ('folkPop' cast, 2026-11-26; painted 2026-11-28 from render/painted_fx.js pieces): a flash, a
// ground swirl, a cloud of painted coloured smoke that billows up and drifts off with spirit wisps curling out of it, a ring of glitter and motes left winking in the
// air; a big one throws more of everything, and the shrinking one winds glitter round him. Somewhat see-through. While he mixes, little
// scrolls slip out of his sleeves, tumble off to either side and lie on the ground a while ('folkPaper').
// createFolkFx({ scene, lights, artThing, emberSeconds }) -> { update(state, show, dt), cast(c), things() }
//   artThing(prop): a new world-ground thing for an art name (render/world_ground.js), added to the scene here
// Seat logs as render/campfire_fx.js lays them (2026-11-26): at the seat, always drawn behind the sitter, moved a little
// toward what he faces when his back is to the camera; the sitter's lift and leg cut are campfire_fx.js SIT (render/view.js)
import * as THREE from 'three';
import { createParticles, SHAPE } from './vfx.js';
import { CAM_RIGHT } from './iso.js';
import { groundY } from '../castle_height.js';
import { createPainted, SMOKES, WISPS, pick as ppick, rand as prand, outc } from './painted_fx.js';
// A little rolled scroll: cream paper, darker ends, a red cord round the middle, one loose corner
let scrollTex = null;
const getScrollTex = () => {
  if (scrollTex) return scrollTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  const body = g.createLinearGradient(0, 8, 0, 24); body.addColorStop(0, '#f4ead0'); body.addColorStop(0.55, '#e2d3ae'); body.addColorStop(1, '#b9a67c');
  g.fillStyle = '#e9dcbb'; g.beginPath(); g.moveTo(40, 12); g.lineTo(58, 4); g.lineTo(60, 13); g.lineTo(46, 20); g.closePath(); g.fill();   // the loose corner
  g.fillStyle = body; g.beginPath(); g.roundRect(6, 9, 46, 14, 6); g.fill();
  g.fillStyle = '#a8946a'; g.beginPath(); g.ellipse(8, 16, 3.5, 7, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(50, 16, 3.5, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f7efd9'; g.beginPath(); g.ellipse(50, 16, 1.6, 3.6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9c2f25'; g.fillRect(27, 9, 4, 14);
  g.strokeStyle = 'rgba(60,45,25,.55)'; g.lineWidth = 1; g.beginPath(); g.roundRect(6, 9, 46, 14, 6); g.stroke();
  scrollTex = new THREE.CanvasTexture(c); scrollTex.colorSpace = THREE.SRGBColorSpace;
  return scrollTex;
};
const SCROLL = { max: 14, w: 0.38, h: 0.19, liesSeconds: 9, fadeSeconds: 1.5, gravity: 7, out: [0.9, 1.9], up: [1.3, 2.3], opacity: 0.8, tint: 0xb3aa92 }   // smaller and toned down to sit in the painted ground (2026-11-26);
const rand = (a, b) => a + Math.random() * (b - a);
// A few words over somebody's head (cast 'folkSay': { a: entity id, text }): a dark slip with a brass edge and cream
// letters in the menus' style, a little see-through, with a small tail down to the speaker. It follows him, holds a
// few seconds and fades. One at a time per speaker. Plain words only (2026-11-26)
const SAY = { seconds: 2.8, fade: 0.5, rise: 0.25, up: 3.05, pxPerUnit: 105, font: '600 24px Lantern, Georgia, serif', opacity: 0.9, max: 8 };
function sayTexture(text) {
  const probe = document.createElement('canvas').getContext('2d'); probe.font = SAY.font;
  const w = Math.ceil(Math.min(420, probe.measureText(text).width) + 30), h = 52, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(14,12,10,.74)'; g.strokeStyle = 'rgba(190,150,84,.9)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(2, 2, w - 4, 36, 8); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(w / 2 - 8, 38); g.lineTo(w / 2, 50); g.lineTo(w / 2 + 8, 38); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(w / 2 - 8, 38); g.lineTo(w / 2, 50); g.lineTo(w / 2 + 8, 38); g.stroke();
  g.fillStyle = 'rgba(14,12,10,1)'; g.fillRect(w / 2 - 7, 35, 14, 4);
  g.font = SAY.font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f1e4c7'; g.shadowColor = '#000'; g.shadowBlur = 3;
  g.fillText(text, w / 2, 21, w - 22);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { t, w, h };
}
// smoke colours of a brew: green, violet, blue, rose (each a dark and a light shade, mixed puff by puff)
const POP_TINTS = [[[0.3, 0.75, 0.35], [0.6, 0.95, 0.5]], [[0.55, 0.3, 0.8], [0.8, 0.6, 1]], [[0.25, 0.55, 0.9], [0.55, 0.85, 1]], [[0.9, 0.35, 0.55], [1, 0.7, 0.75]]];
const LOG = { s: 0.5, back: -0.3, depthBias: -1.5 };
const nearOf = (dx, dz) => Math.max(0, (dx + dz) / ((Math.hypot(dx, dz) || 1) * Math.SQRT2));   // 1 = straight toward the camera

export function createFolkFx({ scene, lights = [], artThing = () => null, emberSeconds = () => 20 }) {
  const active = new Map();   // prop key -> { t, radius, prop }
  const add = t => { scene.add(t.mesh, ...t.extras); for (const l of t.lights) lights.push(l); return t; };
  const remove = t => {
    scene.remove(t.mesh, ...t.extras);
    for (const l of t.lights) { const i = lights.indexOf(l); if (i >= 0) lights.splice(i, 1); }
    t.mesh.material?.dispose?.(); for (const m of t.extras) m.material?.dispose?.();
  };
  function build(p) {
    if (p.seat) {
      const dx = p.x - p.fx, dz = p.z - p.fz, d = Math.hypot(dx, dz) || 1, back = LOG.back * Math.min(1, nearOf(dx, dz) * 2);
      return artThing({ art: p.art, x: p.x + dx / d * back, z: p.z + dz / d * back, s: p.s ?? LOG.s, flip: Math.abs(dz) > Math.abs(dx), depthBias: LOG.depthBias, noLights: true });
    }
    return artThing({ art: p.art, x: p.x, z: p.z, ...(p.s ? { s: p.s } : {}), ...(p.fire ? {} : { noLights: true }) });
  }
  const smoke = createParticles(scene, { max: 500, additive: false }), glow = createParticles(scene, { max: 400, additive: true });
  const P = createPainted({ scene, glowMax: 50, softMax: 50 });   // the brew's mystical smoke from the painted sheets (2026-11-28)
  // the hermit's brew in painted pieces: a flash and burst in the brew's colour, a turning vortex on the ground, wisps of
  // spirit smoke curling up and a coloured cloud of painted smoke that swirls, rises and thins away through noise
  function paintedPop(x, z, k, tint) {
    const y = 1.0, col = tint[1], dark = tint[0], hot = col.map(v => v + (1 - v) * .6);
    const once = (name, size, o) => { const m = P.spr(name, size, o); P.run(o.life, t => { const kk = t / o.life, [a, e] = P.life3(kk, o.alpha, .08, o.out ?? .6);
      if (o.ground) P.onGround(m, x, z, .05); else m.position.set(x, P.gy(x, z) + y, z); if (o.ground) m.rotation.z += .05; m.scale.setScalar(size * (1 + (o.grow - 1) * outc(kk))); P.set(m, a, e); }, () => P.drop(m)); };
    once('bloom', 1.8 * k, { color: col, hot, add: true, life: .25, alpha: .3, grow: 1.4, hotK: .5 });
    once('burst2', 1.5 * k, { color: col, hot, add: true, life: .35, alpha: .5, grow: 1.5, hotK: .5, out: .7 });
    once('vortex1', 2.4 * k, { ground: true, color: dark, hot: col, add: true, life: 1.6, alpha: .35, grow: 1.25, hotK: .5, order: 5 });
    for (let i = 0; i < Math.round(7 * k); i++) { const a = prand(0, 6.283), v = prand(.3, 1) * k;
      P.fling(ppick(SMOKES), x + Math.cos(a) * .3, P.gy(x, z) + y + prand(-.3, .4), z + Math.sin(a) * .3, Math.cos(a) * v + .25, prand(.5, 1.2), Math.sin(a) * v - .1, { size: prand(1.1, 1.7) * k, life: prand(2.2, 3.6) * (k > 1 ? 1.2 : 1), color: i % 2 ? col : dark, alpha: .34, grow: 1.9, flow: .9, drag: 1.1, hotK: .3, turn: false }); }
    for (let i = 0; i < Math.round(3 * k); i++) { const a = i / 3 * 6.283;
      P.fling(ppick(WISPS), x + Math.cos(a) * .4, P.gy(x, z) + y, z + Math.sin(a) * .4, -Math.sin(a) * .8, prand(1, 1.6), Math.cos(a) * .8, { size: 1.2 * k, life: 1.4, color: col, add: true, alpha: .38, grow: 1.3, flow: 1.4, drag: 1, hotK: .5 }); }
  }
  const paper = createParticles(scene, { max: 160, additive: false });   // the feed he throws
  const scrolls = [];
  const dropScroll = sc => { scene.remove(sc.m); sc.m.material.dispose(); const i = scrolls.indexOf(sc); if (i >= 0) scrolls.splice(i, 1); };
  const says = [];
  const dropSay = b => { scene.remove(b.m); b.m.material.map?.dispose(); b.m.material.dispose(); const i = says.indexOf(b); if (i >= 0) says.splice(i, 1); };
  function sayStep(dt, state) {
    for (const b of [...says]) {
      b.age += dt;
      const e = state?.entities?.[b.id];
      if (b.age >= SAY.seconds || (e && (e.dead || e.downed))) { dropSay(b); continue; }
      if (e) { b.x = e.x; b.z = e.z; b.k = e.tiny ? 0.6 : 1; }
      const a = Math.min(1, b.age / 0.15, (SAY.seconds - b.age) / SAY.fade);
      b.m.position.set(b.x, groundY(b.x, b.z) + SAY.up * b.k + SAY.rise * Math.min(1, b.age / 0.3), b.z);
      b.m.material.opacity = SAY.opacity * a;
    }
  }
  function scrollStep(dt) {
    for (const sc of [...scrolls]) {
      sc.age += dt;
      if (!sc.landed) {
        sc.vy -= SCROLL.gravity * dt; sc.x += sc.vx * dt; sc.z += sc.vz * dt; sc.y += sc.vy * dt; sc.rot += sc.spin * dt;
        if (sc.y <= 0.07) { sc.y = 0.07; sc.landed = true; sc.rot = rand(-0.5, 0.5); sc.age = 0; }
      } else if (sc.age >= SCROLL.liesSeconds) { dropScroll(sc); continue; }
      sc.m.position.set(sc.x, groundY(sc.x, sc.z) + sc.y, sc.z);
      sc.m.material.rotation = sc.rot;
      sc.m.material.opacity = SCROLL.opacity * (sc.landed ? Math.min(1, (SCROLL.liesSeconds - sc.age) / SCROLL.fadeSeconds) : 1);
    }
  }
  function cast(c) {
    if (c.kind === 'folkSay' && c.text && c.x !== undefined) {
      for (const b of says.filter(b => b.id === c.a)) dropSay(b);
      if (says.length >= SAY.max) dropSay(says[0]);
      const { t, w, h } = sayTexture(String(c.text));
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthTest: false }));
      m.renderOrder = 99870; m.center.set(0.5, 0); m.scale.set(w / SAY.pxPerUnit, h / SAY.pxPerUnit, 1);
      m.position.set(c.x, groundY(c.x, c.z) + SAY.up, c.z);
      scene.add(m);
      says.push({ m, id: c.a, x: c.x, z: c.z, k: 1, age: 0 });
      return;
    }
    if (c.kind === 'folkPaper' && c.x !== undefined) {   // a scroll slips out, tumbles off to one side and lies on the ground a while
      if (scrolls.length >= SCROLL.max) dropScroll(scrolls[0]);
      const side = Math.random() < 0.5 ? -1 : 1, v = rand(...SCROLL.out);
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: getScrollTex(), color: SCROLL.tint, transparent: true, opacity: SCROLL.opacity, depthTest: false }));
      m.renderOrder = 99805; m.scale.set(SCROLL.w, SCROLL.h, 1);
      scene.add(m);
      scrolls.push({ m, x: c.x, y: 1.2, z: c.z, vx: CAM_RIGHT.x * side * v + rand(-0.35, 0.35), vz: CAM_RIGHT.z * side * v + rand(-0.35, 0.35), vy: rand(...SCROLL.up), spin: rand(4, 9) * side, rot: rand(0, 6.28), age: 0, landed: false });
      return;
    }
    if (c.kind === 'folkFeed' && c.x !== undefined) {   // a handful of grain and crumbs tossed toward his animals
      const dx = (c.tx ?? c.x + 1) - c.x, dz = (c.tz ?? c.z) - c.z, d = Math.hypot(dx, dz) || 1, reach = Math.min(4, Math.max(1.5, d * 0.7));
      for (let i = 0; i < 12; i++) {
        const v = reach * rand(0.8, 1.3), side = rand(-0.5, 0.5);
        paper.emit({ x: c.x + dx / d * 0.4, y: 1.3, z: c.z + dz / d * 0.4, vx: dx / d * v - dz / d * side, vz: dz / d * v + dx / d * side, vy: rand(1.6, 2.6), gravity: 6.5, drag: 0.3,
          life: rand(0.7, 0.85), size: rand(0.07, 0.12), color: Math.random() < 0.6 ? [0.86, 0.72, 0.42] : [0.7, 0.52, 0.3], alpha: 0.9, shape: SHAPE.dot });
      }
      return;
    }
    if (c.kind === 'folkCoins' && c.x !== undefined) {   // a few coins shaken out of the peddler, hopping over to the bandit who hit him (2026-11-26)
      const dx = (c.tx ?? c.x + 1) - c.x, dz = (c.tz ?? c.z) - c.z, d = Math.hypot(dx, dz) || 1, n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const life = rand(0.55, 0.75), v = d / life * rand(0.85, 1.05), side = rand(-0.35, 0.35);
        paper.emit({ x: c.x, y: 1.05, z: c.z, vx: dx / d * v - dz / d * side, vz: dz / d * v + dx / d * side, vy: rand(2.4, 3.2), gravity: 9, drag: 0.1,
          life, size: rand(0.09, 0.12), color: Math.random() < 0.7 ? [0.95, 0.76, 0.28] : [0.8, 0.6, 0.2], alpha: 0.92, shape: SHAPE.dot });
        glow.emit({ x: c.x, y: 1.05, z: c.z, vx: dx / d * v - dz / d * side, vz: dz / d * v + dx / d * side, vy: rand(2.4, 3.2), gravity: 9, drag: 0.1,
          life, size: rand(0.1, 0.16), color: [1, 0.85, 0.4], alpha: 0.5, shape: SHAPE.sparkle, twinkle: 9 });
      }
      return;
    }
    if (c.kind !== 'folkPop' || c.x === undefined) return;
    const k = c.big ? 1.4 : c.small ? 0.6 : 1, tint = POP_TINTS[(c.tint ?? 0) % POP_TINTS.length], y = 1.0;
    paintedPop(c.x, c.z, k, tint);   // flash, vortex, spirit wisps and the coloured cloud in painted pieces (2026-11-28)
    for (let i = 0; i < 22 * k; i++) {   // a ring of glitter snapping outward
      const a = i / (22 * k) * Math.PI * 2 + rand(-0.1, 0.1), v = rand(4.5, 6) * k;
      glow.emit({ x: c.x, y: y + rand(-0.1, 0.1), z: c.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(-0.2, 0.6), drag: 5.5, life: rand(0.45, 0.7), size: rand(0.12, 0.2),
        color: i % 3 ? tint[1] : [1, 1, 0.85], alpha: 0.85, shape: SHAPE.sparkle, twinkle: 0.8, spin: rand(-4, 4) });
    }
    for (let i = 0; i < 12 * k; i++) {   // motes of it left hanging, drifting up and winking out
      glow.emit({ x: c.x + rand(-0.7, 0.7) * k, y: y + rand(-0.5, 0.8), z: c.z + rand(-0.7, 0.7) * k, vy: rand(0.5, 1.4), drag: 0.6, sway: 0.7, life: rand(1.2, 2.4), size: rand(0.08, 0.14),
        color: tint[1], alpha: 0.8, shape: SHAPE.sparkle, twinkle: 0.85, spin: rand(-2, 2) });
    }
    if (c.shrink || c.small) {   // the shrinking brew: glitter winding round him, down as he shrinks and up as he comes back
      const down = !!c.shrink;
      for (let i = 0; i < 26; i++) {
        const t = i / 26;
        glow.emit({ x: c.x, y: down ? 2.2 - t * 0.6 : 0.1 + t * 0.4, z: c.z, vy: (down ? -1 : 1) * rand(1.3, 2.1), life: rand(0.8, 1.2), size: rand(0.1, 0.17), color: i % 2 ? tint[1] : [1, 1, 0.9],
          alpha: 0.85, shape: SHAPE.sparkle, twinkle: 0.7, spin: 3, orbit: { x: c.x, z: c.z, r: down ? 1.0 - t * 0.3 : 0.5 + t * 0.4, w: (i % 2 ? 1 : -1) * rand(6, 9), a: t * Math.PI * 4 } });
      }
    }
    for (let i = 0; i < 14 * k; i++) {   // sparks thrown out round it
      const a = Math.random() * Math.PI * 2, v = rand(1.5, 4) * k;
      glow.emit({ x: c.x, y: y + rand(-0.2, 0.2), z: c.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(0.5, 3), drag: 2.5, gravity: 3, life: rand(0.4, 0.9), size: rand(0.1, 0.2),
        color: Math.random() < 0.5 ? tint[1] : [1, 0.95, 0.7], alpha: 0.9, shape: SHAPE.sparkle, twinkle: 0.7, spin: rand(-3, 3) });
    }
  }
  function update(state, show, dt = 0) {
    if (!show) { P.clear(); smoke.clear(); glow.clear(); paper.clear(); for (const sc of [...scrolls]) dropScroll(sc); for (const b of [...says]) dropSay(b); } else if (dt > 0) { P.update(Math.min(dt, 0.1)); smoke.update(Math.min(dt, 0.1)); glow.update(Math.min(dt, 0.1)); paper.update(Math.min(dt, 0.1)); scrollStep(Math.min(dt, 0.1)); sayStep(Math.min(dt, 0.1), state); }
    const want = new Map();
    for (const sc of Object.values(state.world?.folk?.scenes || {})) (sc.props || []).forEach((p, i) => want.set(`${sc.id}:${p.art}:${p.x.toFixed(1)}:${p.z.toFixed(1)}:${i}`, p));
    for (const [k, a] of [...active]) if (!want.has(k)) { remove(a.t); active.delete(k); }
    for (const [k, p] of want) {
      let a = active.get(k);
      if (!a) {
        const t = build(p);
        if (!t) continue;   // art still loading: next frame
        a = { t: add(t), radius: t.lights.map(l => l.radius) };
        active.set(k, a);
      }
      a.prop = p;
      const t = a.t, glows = new Set(t.lights.map(l => l.glow));
      t.mesh.visible = show;
      for (const m of t.extras) m.visible = show && !(p.out && !glows.has(m));   // put out: no flames
      for (const l of t.lights) l.off = !show;
      if (p.out) {
        const left = Math.max(0, 1 - ((state.tick ?? 0) - p.out) / Math.max(1, emberSeconds() * 20));
        t.lights.forEach((l, i) => { l.radius = a.radius[i] * (0.25 + 0.35 * left); l.off = !show || left <= 0; if (l.glow) l.glow.visible = show && left > 0; });
      }
    }
  }
  return { update, cast, things: () => [...active.values()].map(a => a.t) };
}
