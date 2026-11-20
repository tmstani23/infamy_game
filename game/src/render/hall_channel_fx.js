// The look of a hall being taken at the end of a war (war checkpoint 8a, Tim OK'd the mock 2026-11-15:
// /mnt/project-files/war_build/cp8a/hall_channel_look_mock.jpg). Drawing only: reads the war records in the state.
//  - Burn (and the defender taking a war camp hall): the HQ fire (render/hq_fire.js) grows on the ruin with the
//    channel, base fires first, then the whole ruin; the biggest flames always sit round the base (Tim 2026-11-15).
//  - Sack: mostly smoke with small base fires; after the sack they die down over afterSeconds.
//  - Capture: the attacker's war banner, in his clan colour, tilts up from lying flat to upright on the ruin; it
//    stays standing on a captured town's ruined hall until the hall is rebuilt.
//  - A ring at the channelling hero's feet fills with the channel, so the other side sees whom to hit.
// A hit restarts the channel (sim/frontier/war_end.js), so the look falls back with it.
// createHallChannelFx({ scene, lights, thingAt, artThing, seconds }) -> { update(state, place) }
//   thingAt(key): the world-ground thing drawing a town prop (render/world_ground.js), artThing(prop): a new one
import * as THREE from 'three';
import { CAM_QUAT, CAM_UP, CAM_RIGHT, VIEW_DIR } from './iso.js';
import { fireMaterial, fireSources, ROOF_SOURCES, PAD_W, PAD_H } from './hq_fire.js';
import { groundY } from '../castle_height.js';

const AFTER_SECONDS = 40;
const OUTCOME_LOOK = { burn: 'burn', sack: 'sack', capture: 'capture' };
const ease = t => t * t * (3 - 2 * t);

export function createHallChannelFx({ scene, lights = null, thingAt = () => null, artThing = () => null, seconds = () => 60 }) {
  const active = new Map();   // key -> { thing, fire, full, banner, ring, light, look }
  const ground = new THREE.Vector3();
  // the ruined hall of a war side as drawn: its world-ground key (render/world_ground.js 'town:' + town_props key)
  function hallOf(f, w, side) {
    if (side === 'camp') { const b = (w.camp?.buildings || []).find(x => x.type === 'camp_hall' && x.stage === 'ruined'); return b ? { key: `town:${w.id}:${b.id}:ruined` } : null; }
    const s = f.settlements?.[w.town], b = (s?.buildings || []).find(x => x.type === 'town_hall' && x.stage === 'ruined');
    return b ? { key: `town:${s.id}:${b.id}:ruined`, s } : null;
  }
  // what to draw this frame: key -> { look, frac, clan, hero }
  function wanted(state) {
    const f = state.frontier, out = new Map(), now = state.tick ?? 0, need = Math.max(1, seconds() * 20);
    if (!f) return out;
    for (const w of Object.values(f.wars?.list || {})) {
      const ch = w.channel; if (!ch) continue;
      const h = hallOf(f, w, ch.side); if (!h) continue;
      const look = ch.side === 'camp' ? 'burn' : OUTCOME_LOOK[ch.outcome] || 'burn';
      out.set(h.key, { look, frac: Math.min(1, Math.max(0, (now - ch.start) / need)), clan: state.entities?.[ch.by]?.owner ?? w.attacker, hero: ch.by });
    }
    // after a sack the fires die down; a captured town's ruined hall keeps the banner until it is rebuilt
    for (const w of f.wars?.history || []) if (w.result === 'sacked' && now - (w.ended ?? -1e9) < AFTER_SECONDS * 20) {
      const h = hallOf(f, w, 'town'); if (h && !out.has(h.key)) out.set(h.key, { look: 'sack', frac: 1, fade: 1 - (now - w.ended) / (AFTER_SECONDS * 20), clan: w.attacker });
    }
    for (const s of Object.values(f.settlements || {})) if (s.captured) {
      const h = hallOf(f, { town: s.id }, 'town'); if (h && !out.has(h.key)) out.set(h.key, { look: 'capture', frac: 1, clan: s.owner });
    }
    return out;
  }
  function drop(key) {
    const a = active.get(key); if (!a) return;
    for (const m of [a.fire, a.banner?.mesh]) if (m) { scene.remove(m); const i = a.thing.extras.indexOf(m); if (i >= 0) a.thing.extras.splice(i, 1); m.material.dispose(); }
    if (a.ring) { scene.remove(a.ring); a.ring.geometry.dispose(); a.ring.material.dispose(); }
    if (a.light && lights) { const i = lights.indexOf(a.light); if (i >= 0) lights.splice(i, 1); }
    active.delete(key);
  }
  function build(key, thing, want) {
    const a = { thing, look: want.look };
    const w = Math.abs(thing.mesh.scale.x), h = Math.abs(thing.mesh.scale.y);
    if (want.look !== 'capture') {
      a.full = fireSources(w / h);
      a.fire = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fireMaterial(w / h, a.full, (key.length * 7.3) % 10));
      a.fire.quaternion.copy(CAM_QUAT);
      a.fire.scale.set(w * PAD_W, h * PAD_H, 1);
      a.fire.position.copy(thing.mesh.position).addScaledVector(CAM_UP, h * (PAD_H - 1) / 2);
      a.fire.frustumCulled = false;
      thing.extras.push(a.fire); scene.add(a.fire);
      const c = thing.mesh.position;
      ground.set(c.x - VIEW_DIR.x * c.y / VIEW_DIR.y, 2, c.z - VIEW_DIR.z * c.y / VIEW_DIR.y);
      a.light = { pos: ground.clone(), radius: 1, color: new THREE.Color(1, 0.38, 0.1), fire: true, seed: key.length };
      if (lights) lights.push(a.light);
    }
    active.set(key, a);
    return a;
  }
  // the banner: stands at the ruin's middle, its pole foot the pivot it tilts up about
  function banner(a, want, state) {
    if (!a.banner) {
      const c = a.thing.mesh.position, cy = c.y - (a.thing.lift || 0), gx = c.x - VIEW_DIR.x * cy / VIEW_DIR.y, gz = c.z - VIEW_DIR.z * cy / VIEW_DIR.y;   // lift: a castle terrace's height (Z4h)
      const t = artThing({ art: 'war_banner', x: gx, z: gz, noLights: true });
      if (!t) return;   // still loading: next frame
      a.banner = { mesh: t.mesh, centre: t.mesh.position.clone(), w: Math.abs(t.mesh.scale.x), h: Math.abs(t.mesh.scale.y) };
      a.banner.mesh.scale.multiplyScalar(1.6); a.banner.w *= 1.6; a.banner.h *= 1.6;
      // the art's foot (bottom middle of the quad) back on the ground spot after scaling
      a.banner.foot = a.banner.centre.clone().addScaledVector(CAM_UP, -a.banner.h / 1.6 / 2);
      a.thing.extras.push(a.banner.mesh); scene.add(a.banner.mesh);
    }
    const B = a.banner, col = state.clans?.[want.clan]?.color;
    if (col) B.mesh.material.uniforms.uTint.value.set(col).lerp(new THREE.Color(1, 1, 1), 0.25);
    B.mesh.material.uniforms.uSelfLight?.value.setRGB(0.32, 0.22, 0.2);   // reads at night too
    // lying almost flat (to the screen's left) at the start, upright at the end
    const ang = (1 - ease(want.frac)) * 1.3, pivotX = -B.w * 0.12;   // the pole sits a little left of the art's middle
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    B.mesh.quaternion.copy(CAM_QUAT).multiply(q);
    const ox = -pivotX, oy = B.h / 2, rx = ox * Math.cos(ang) - oy * Math.sin(ang), ry = ox * Math.sin(ang) + oy * Math.cos(ang);
    B.mesh.position.copy(B.foot).addScaledVector(CAM_RIGHT, pivotX + rx).addScaledVector(CAM_UP, ry);
  }
  // the fire grows with the channel: base fires first and biggest; on Burn the upper fires follow, smaller
  function fire(a, want) {
    const u = a.fire.material.uniforms.uSrc.value, burn = want.look === 'burn', f = want.frac, fade = want.fade ?? 1;
    a.full.forEach((p, i) => {
      const roof = i < ROOF_SOURCES, k = roof ? i / ROOF_SOURCES : (i - ROOF_SOURCES) / Math.max(1, a.full.length - ROOF_SOURCES);
      const on = burn ? (roof ? f > 0.35 && k < (f - 0.35) / 0.55 : k < 0.3 + f) : (roof ? f > 0.45 && i % 7 < 2 && k < f - 0.35 : k < 0.3 + 0.7 * f);
      const grow = (burn ? 0.35 + 0.65 * f : 0.4 + 0.3 * f) * fade;
      if (on && grow > 0.03) u[i].set(p[0], p[1], p[2] * grow, p[3]); else u[i].set(0.5, -5, 0.05, 0);
    });
    a.fire.material.uniforms.uGrow.value = (burn ? 0.35 + 0.65 * f : 0.9 + 0.3 * f) * fade;
    if (a.light) a.light.radius = Math.max(1, Math.abs(a.thing.mesh.scale.x) * (burn ? 0.3 + 0.6 * f : 0.4) * fade);
  }
  // the channel ring at the hero's feet: fills clockwise as the channel runs
  function ring(a, want, state) {
    const e = want.hero && state.entities?.[want.hero];
    if (!e) { if (a.ring) { scene.remove(a.ring); a.ring.geometry.dispose(); a.ring.material.dispose(); a.ring = null; } return; }
    const steps = Math.max(1, Math.round(want.frac * 48));
    if (!a.ring || a.ringSteps !== steps) {
      if (a.ring) { scene.remove(a.ring); a.ring.geometry.dispose(); }
      const geo = new THREE.RingGeometry(1.15, 1.45, 48, 1, Math.PI / 2, -Math.PI * 2 * steps / 48);
      if (!a.ring) {
        a.ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: state.clans?.[want.clan]?.color || '#e0786c', transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
        a.ring.rotation.x = -Math.PI / 2; a.ring.renderOrder = 5;
      } else a.ring.geometry = geo;
      a.ringSteps = steps; scene.add(a.ring);
    }
    a.ring.position.set(e.x, (0.06)+groundY(e.x, e.z), e.z);
  }
  function update(state, place) {
    const want = place === 'world' ? wanted(state) : new Map();
    for (const key of [...active.keys()]) {
      const a = active.get(key), w = want.get(key);
      // gone, a different look, or the world ground redrew the ruin (its extras went with it)
      if (!w || w.look !== a.look || thingAt(key) !== a.thing) drop(key);
    }
    for (const [key, w] of want) {
      const thing = thingAt(key); if (!thing) continue;
      const a = active.get(key) || build(key, thing, w);
      if (a.fire) fire(a, w);
      if (w.look === 'capture') banner(a, w, state);
      ring(a, w, state);
    }
  }
  return { update };
}
