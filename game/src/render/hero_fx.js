// Hero ability effects and status marks in the painted style (2026-11-27: rebuild every ability like the boss
// effects, no code-drawn circles or arcs). Built only from painted pieces (render/painted_fx.js). Purely visual.
// One hue per clan: Yakuza blood red with a gold core, Shinobi violet over ink, Kuroda crimson with gold.
// Rules (fx_research.md / fx_research2.md): a wind-up, the impact in the first quarter, a long eased fall-off; the
// leading edge brightest; primary layer bright, secondary darker and slower; somewhat see-through; one status rule:
// a mark under the unit plus one shape over the head.
//   createHeroFx({ scene, texBase }) -> { ready, update(dt),
//     dash(fromX, fromZ, x, z, { hits }), intimidate(x, z, { radius, victims }), rally(x, z, { radius }), lantern(x, z),
//     shadowstep(fromX, fromZ, x, z, { crit }), smoke(x, z, { radius, seconds }), assassinate(fromX, fromZ, x, z),
//     sweep(x, z, { radius }), cleave(x, z, dx, dz), thrust(x, z, tx, tz), counter(x, z, dx, dz), pursuit(x, z, dx, dz),
//     formation(id, x, z, { radius }) per frame,
//     status(id, kind, x, z, { head }) per frame: kind = intimidated | rallied | lantern | veil | ambush | snared | stunned | charmed | taunted }
import * as THREE from 'three';
import { CAM_QUAT, CAM_RIGHT, VIEW_DIR } from './iso.js';
import { SHAPE } from './vfx.js';
import { createPainted, PIECES, rand, pick, seg, outc, inq, outback, ramp, clamp, INKS, GHOST, FLAMES, SMOKES, WISPS, SLASHES, SMEARS, GUSTS, RUNES, FIREBALLS } from './painted_fx.js';

// colours: muted, never pure black or white
const BLOOD = [.78, .14, .1], BLOODHOT = [1, .62, .32], GOLDC = [.95, .7, .3], GOLDHOT = [1, .9, .62];
const VIOLET = [.5, .3, .88], VIOLETHOT = [.86, .76, 1], INKC = [.1, .08, .13], INKV = [.2, .14, .28];
const CRIMSON = [.86, .16, .24], CRIMHOT = [1, .78, .55], STEELC = [.62, .67, .78], PINK = [.95, .42, .66];
const DUST = [.5, .42, .32];
const INTIM = [.55, .25, .95], INTIMHOT = [.88, .76, 1];   // Intimidate stays the game's purple (2026-11-28)
const PETALS = [[1, .62, .8], [1, .75, .88], [1, .5, .7], [1, .85, .92]];

export function createHeroFx({ scene, texBase = 'art/fx/' }) {
  const LANTERN_PIECES = ['lantern1', 'lantern2', 'lantern3', 'lantern4'];   // Red Lantern sheet (2026-11-28, art_prompts/vfx/red_lantern_sheet.jpg)
  const P = createPainted({ scene, texBase, pieces: [...PIECES, ...LANTERN_PIECES] });
  const { spr, set, U, onGround, aim, life3, run, later, dim, fling, kicks, sMark, placeMark, marker, tick, drop, gy } = P;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // a camera card that lives one life: grows, eases in, dissolves. o: spr options + { life, alpha, grow, y, rot, fin, out, follow }
  function flash(name, x, y, z, size, o = {}) {
    const life = o.life ?? .5, m = spr(name, size, { hotK: o.add ? .6 : .35, ...o }), g = o.grow ?? 1.3, a0 = o.alpha ?? .9;
    if (o.rot !== undefined && !o.ground) { m.quaternion.copy(CAM_QUAT); m.rotateZ(o.rot); }
    run(life, (t, dt) => {
      const k = t / life, [a, e] = life3(k, a0, o.fin ?? .1, o.out ?? .55);
      if (o.ground) onGround(m, x, z, o.h ?? .05); else m.position.set(x, y, z);
      m.scale.set(size * (o.w || 1) * (1 + (g - 1) * outc(k)), size * (o.h2 || 1) * (1 + (g - 1) * outc(k)), 1);
      if (o.spin) m.rotation.z += o.spin * dt;
      set(m, a, e); o.tick?.(m, k, t);
    }, () => drop(m));
    return m;
  }
  // a painted streak laid from a to b on screen (camera card turned along the motion); hot leading edge
  function streak(name, ax, ay, az, bx, by, bz, { width = .5, life = .45, color, hot, add = true, alpha = .95, delay = 0, flow = .4 } = {}) {
    later(delay, () => {
      const m = spr(name, 1, { color, hot, add, flow }), dx = bx - ax, dy = by - ay, dz = bz - az;
      const L = aim(m, dx, dy, dz) || .01;
      run(life, t => {
        const k = t / life, grow = outc(seg(k, 0, .18));
        m.position.set(ax + dx * .5, ay + dy * .5, az + dz * .5);
        m.scale.set(L * (.35 + .65 * grow), width * (1 - .4 * outc(k)), 1);
        const [a, e] = life3(k, alpha, .08, .65); set(m, a, e);
      }, () => drop(m));
    });
  }
  // smoke that rises and swells (secondary layer, normal blend so it darkens)
  function puff(x, y, z, { size = 1.2, life = 1.4, color = INKV, alpha = .55, vx = 0, vy = .35, vz = 0, grow = 1.7, delay = 0, flow = .7 } = {}) {
    later(delay, () => fling(pick(SMOKES), x, y, z, vx, vy, vz, { size, life, color, alpha, grow, flow, drag: 1.6, hotK: .25, turn: false }));
  }
  const burstAt = (x, y, z, size, color, hot, life = .35, alpha = .9) => flash(pick(['burst1', 'burst2']), x, y, z, size, { color, hot, add: true, life, alpha, grow: 1.5, fin: .06, out: .7, rot: rand(0, 6.28) });

  // ===================================================================================================================
  // YAKUZA RONIN
  // Dash: the draw flash where he sets off, two painted speed smears laid along the path (gold core, red body), dust
  // thrown back, and on each enemy passed a painted slash across him with a spark burst.
  function dash(fromX, fromZ, x, z, { hits = [] } = {}) {
    const dx = x - fromX, dz = z - fromZ, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    flash('sparks1', fromX, 1.1, fromZ, .9, { color: GOLDC, hot: GOLDHOT, add: true, life: .3, alpha: .6, grow: 1.5, fin: .05, hotK: .5 });
    kicks(fromX, fromZ, 9, { ang: Math.atan2(-uz, -ux), spread: 1.4, speed: [3, 6], color: DUST, len: [.4, .8], vy: [.2, .9] });
    dim(fromX + dx / 2, fromZ + dz / 2, L * .55, .9, .1);
    streak('smear1', fromX, 1.05, fromZ, x, 1.05, z, { width: .75, life: .5, color: BLOOD, hot: BLOODHOT, alpha: .8 });
    streak('smear3', fromX, 1.2, fromZ, x, 1.2, z, { width: .3, life: .38, color: GOLDC, hot: GOLDHOT, alpha: 1, delay: .03 });
    for (let i = 0; i < 3; i++) streak(pick(GUSTS), fromX + ux * L * rand(.1, .5), rand(.6, 1.5), fromZ + uz * L * rand(.1, .5), x - ux * rand(0, 1), rand(.6, 1.5), z - uz * rand(0, 1), { width: .35, life: .6, color: BLOOD, add: false, alpha: .35, delay: .05 + i * .04 });
    for (const h of hits) later(h.t ?? .08, () => {
      flash(pick(SLASHES), h.x, 1.15, h.z, 1.7, { color: BLOOD, hot: BLOODHOT, add: true, life: .42, alpha: .7, grow: 1.15, fin: .05, out: .7, rot: Math.atan2(-uz, ux) + rand(-.4, .4) });
      flash('sparks1', h.x, 1.1, h.z, 1, { color: GOLDC, hot: GOLDHOT, add: true, life: .3, grow: 1.6, fin: .05 });
    });
  }
  // a dash hit (game: abilityFx.cut, one per enemy passed): a painted slash across him along the dash and a spark burst
  function cut(x, z, dx = 1, dz = 0, crit = false) {
    const L = Math.hypot(dx, dz) || 1;
    flash(pick(SLASHES), x, 1.15, z, crit ? 2.1 : 1.7, { color: BLOOD, hot: BLOODHOT, add: true, life: .42, alpha: .7, grow: 1.15, fin: .05, out: .7, rot: Math.atan2(-dz / L, dx / L) + rand(-.4, .4) });
    flash('sparks1', x, 1.1, z, crit ? 1.3 : 1, { color: GOLDC, hot: GOLDHOT, add: true, life: .3, grow: 1.6, fin: .05 });
  }
  // Intimidate (the bellow): wind-up red ghost fire licks up round him and the ground darkens; on the shout a painted
  // shock ring of torn force runs out to the real radius, gusts blown outward, dust lifted at the edge, a burning
  // rune of anger flares over his head and burns away. Each victim gets the intimidated mark.
  function intimidate(x, z, { radius = 5, wind = .22 } = {}) {
    dim(x, z, radius * 1.15, 1.6, .2, [.04, .015, .08]);
    for (let i = 0; i < 3; i++) flash(pick(GHOST), x + rand(-.3, .3), .9, z + rand(-.2, .2), 1.6, { color: INTIM, hot: INTIMHOT, add: true, flow: 1.4, life: wind + .5, alpha: .45, grow: 1.25, fin: .4, out: .5 });
    later(wind, () => {
      burstAt(x, 1.3, z, 1.6, INTIM, INTIMHOT, .3, .4);
      // the shock: torn gusts of force laid on the ground, racing out unevenly (no clean ring)
      for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + rand(-.15, .15), v = radius * rand(2.6, 3.4); fling(pick(GUSTS), x + Math.cos(a) * .7, .06, z + Math.sin(a) * .7, Math.cos(a) * v, 0, Math.sin(a) * v, { ground: true, size: rand(1.4, 2.2), life: rand(.5, .7), color: INTIM, hot: INTIMHOT, add: true, alpha: rand(.35, .55), grow: 1.5, drag: 2.6, hotK: .5 }); }
      const torn = spr('ring_torn', 1, { ground: true, color: INTIM, hot: INTIMHOT, add: true, order: 6, flow: .5, hotK: .5 });
      run(.95, t => { const k = t / .95, [a, e] = life3(k, .3, .1, .55); onGround(torn, x, z, .05); torn.scale.setScalar(radius * 2.2 * (.2 + .8 * outc(k * 1.2))); set(torn, a, e); }, () => drop(torn));
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 + rand(-.2, .2), v = radius * rand(1.6, 2.1); fling(pick(GUSTS), x + Math.cos(a) * .6, rand(.4, 1.2), z + Math.sin(a) * .6, Math.cos(a) * v, 0, Math.sin(a) * v, { size: 1.3, life: .6, color: [.3, .12, .55], alpha: .45, grow: 1.4, drag: 2.4 }); }
      later(.18, () => kicks(x, z, 18, { r0: radius * .85, speed: [1.5, 3], color: DUST, len: [.4, .7], vy: [.3, 1], life: [.3, .55] }));
      const r = spr(pick(['rune3', 'rune7', 'rune9']), 1.1, { color: INTIM, hot: INTIMHOT, add: true, flow: .5 });
      run(1.1, t => { const k = t / 1.1, [a, e] = life3(k, 1, .08, .55); r.position.set(x, 2.55 + .35 * outc(k), z); r.scale.setScalar(1.1 * (1.25 - .25 * outback(seg(k, 0, .25)))); set(r, a, e); }, () => drop(r));
    });
  }
  // Rally: a gold talisman sigil opens under him and a ring of warm light runs out to the radius; gold ghost fire
  // rises off him and glowing sakura petals drift down over the whole radius.
  function rally(x, z, { radius = 6 } = {}) {
    const sg = spr('heal_lotus', 1, { ground: true, color: GOLDC, hot: GOLDHOT, add: true, order: 5, flow: .2, hotK: .35 });
    run(2.2, (t, dt) => { const k = t / 2.2, [a, e] = life3(k, .3, .1, .45); onGround(sg, x, z, .05); sg.rotation.z += dt * .3; sg.scale.setScalar(3.2 * (.5 + .5 * outback(seg(k, 0, .3)))); set(sg, a, e); }, () => drop(sg));
    const ring = spr('heal_ring', 1, { ground: true, color: GOLDC, hot: GOLDHOT, add: true, order: 6, flow: .3 });
    run(2.4, (t, dt) => { const k = t / 2.4, [a, e] = life3(k, .28, .08, .5); onGround(ring, x, z, .05); ring.scale.setScalar(radius * 2.2 * (.15 + .85 * outc(k * 1.6))); ring.rotation.z -= dt * .3; set(ring, a, e); }, () => drop(ring));
    for (let i = 0; i < 2; i++) flash(pick(GHOST), x, 1.1, z, 1.9, { color: GOLDC, hot: GOLDHOT, add: true, flow: 1.3, life: 1.1, alpha: .17, grow: 1.3, fin: .15, hotK: .35 });
    // the old glowing sakura petals (2026-11-28: liked them more), spread over the whole rally radius
    for (let i = 0; i < 70; i++) {
      const a = rand(0, 6.283), r = radius * Math.sqrt(Math.random()) + .3;
      P.glow.emit({ x: x + Math.cos(a) * r, y: rand(1.5, 4.5), z: z + Math.sin(a) * r, vx: Math.cos(a) * .4, vz: Math.sin(a) * .4,
        vy: rand(-.7, -.3), sway: .9, life: rand(2.4, 4), size: rand(.22, .34), color: pick(PETALS), alpha: .9, shape: SHAPE.petal, spin: rand(-2.5, 2.5) });
    }
  }
  // Red Lantern: a flare of red ghost fire round him as the lanterns light, each lantern flame a painted flame
  function lantern(x, z) {
    burstAt(x, 1.3, z, 1.5, BLOOD, BLOODHOT, .3, .8);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; later(i * .05, () => flash(pick(FLAMES), x + Math.cos(a) * 1.1, 1.3, z + Math.sin(a) * 1.1, .7, { color: [.9, .25, .1], hot: BLOODHOT, add: true, flow: 1.2, life: .9, alpha: .85, grow: 1.1, fin: .2 })); }
  }

  // Red Lantern's circling lanterns: one painted lantern card each, deep red with a gold flame core (the game's
  // abilityfx.js keeps the orbit, bob and halo, and sets the alpha every frame with lanternAlpha)
  const lanternCard = i => spr(LANTERN_PIECES[i % LANTERN_PIECES.length], 1, { color: [.72, .12, .05], hot: [1, .78, .4], flow: .35, hotK: .7 });
  const lanternAlpha = (m, a) => set(m, a);

  // ===================================================================================================================
  // SHINOBI LEADER
  // Shadowstep: he goes up in a swirl of ink smoke with a violet vortex on the ground, a violet wisp runs to the target,
  // and he steps out of a smaller ink puff. On the sure crit a big violet slash with a hot edge crosses the target.
  function shadowstep(fromX, fromZ, x, z, { crit = false, tx = x, tz = z } = {}) {   // tx, tz: the crit target (game: c.tx)
    const vx = spr('vortex2', 2.8, { ground: true, color: INKV, hot: VIOLET, order: 5, flow: .6, hotK: .6 });
    run(1.1, (t, dt) => { const k = t / 1.1, [a, e] = life3(k, .75, .1, .5); onGround(vx, fromX, fromZ, .05); vx.rotation.z += dt * 4 * (1 - k); vx.scale.setScalar(2.8 * (.6 + .4 * outc(k))); set(vx, a, e); }, () => drop(vx));
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; puff(fromX + Math.cos(a) * .35, rand(.3, 1.4), fromZ + Math.sin(a) * .35, { vx: -Math.sin(a) * 1.4, vz: Math.cos(a) * 1.4, size: 1.2, life: 1.3, alpha: .6, delay: i * .015 }); }
    flash(pick(INKS), fromX, 0, fromZ, 2.2, { ground: true, color: INKC, life: 1.8, alpha: .6, grow: 1.08, fin: .04, out: .6, order: 4 });
    flash('burst1', fromX, 1.1, fromZ, 1.3, { color: VIOLET, hot: VIOLETHOT, add: true, life: .3, fin: .05, out: .7, grow: 1.5 });
    for (let i = 0; i < 2; i++) streak(pick(WISPS), fromX, 1.1 + i * .3, fromZ, x, 1.1 + i * .2, z, { width: .55, life: .55, color: VIOLET, hot: VIOLETHOT, alpha: .75, delay: .05 + i * .05, flow: 1 });
    later(.14, () => {
      for (let i = 0; i < 4; i++) { const a = rand(0, 6.28); puff(x + Math.cos(a) * .3, rand(.3, 1.2), z + Math.sin(a) * .3, { vx: Math.cos(a) * .8, vz: Math.sin(a) * .8, size: .9, life: 1, alpha: .5 }); }
      if (crit) later(.08, () => {
        flash('slash3', tx, 1.2, tz, 2.6, { color: VIOLET, hot: VIOLETHOT, add: true, hotK: .4, life: .7, alpha: .6, grow: 1.1, fin: .04, out: .6, rot: -.5 });
        later(.1, () => flash('slash1', tx, 1.2, tz, 2, { color: VIOLET, hot: VIOLETHOT, add: true, life: .55, alpha: .5, grow: 1.1, fin: .04, out: .6, rot: .7 }));
        flash('sparks1', tx, 1.15, tz, 1.3, { color: VIOLET, hot: VIOLETHOT, add: true, life: .35, grow: 1.6, fin: .05 });
        dim(tx, tz, 1.6, .9, .25, [.05, .02, .08]);
      });
    });
  }
  // Smoke Bomb: a dull flash and a ring of ink thrown out, then a big cloud of slate and violet smoke that rolls and
  // billows over the real radius for the whole duration (see-through), then thins away through noise.
  function smoke(x, z, { radius = 3.5, seconds = 6 } = {}) {
    flash('burst2', x, .8, z, 1.6, { color: INKV, hot: VIOLET, add: true, life: .3, fin: .05, out: .7, grow: 1.6, alpha: .7 });
    kicks(x, z, 14, { speed: [3, 6], color: INKC, len: [.4, .8], vy: [.3, 1.4], life: [.3, .6], alpha: .7 });
    dim(x, z, radius * 1.1, seconds + 1, .28, [.03, .02, .05]);
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283; puff(x, .6, z, { vx: Math.cos(a) * radius * 1.6, vz: Math.sin(a) * radius * 1.6, vy: .5, size: 1.6, life: 1.1, alpha: .6 }); }
    const n = Math.round(radius * 3.5), clouds = [];
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), r = radius * Math.sqrt(rand(0, .85)), m = spr(pick(SMOKES), rand(2.2, 3.4), { color: r < radius * .45 ? INKC : i % 2 ? [.2, .17, .24] : INKV, hotK: .3, flow: .8, order: 99810 });
      clouds.push({ m, x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, y: rand(.3, 1.6), s: m.scale.x, d: rand(0, .25), sp: rand(-.25, .25), ph: rand(0, 6), al: r < radius * .45 ? .42 : rand(.16, .32) });
    }
    // violet light caught on the rim: a few wisps drifting round the edge of the cloud
    const rim = Array.from({ length: 6 }, (_, i) => ({ m: spr(pick(WISPS), 1.6, { color: VIOLET, hot: VIOLETHOT, add: true, flow: 1.2, hotK: .4 }), a: i / 6 * 6.283, y: rand(.5, 1.5) }));
    run(seconds + 1.2, (t, dt) => {
      for (const w of rim) { const a = w.a + t * .25; w.m.position.set(x + Math.cos(a) * radius * .85, w.y + .15 * Math.sin(t + w.a), z + Math.sin(a) * radius * .85); w.m.quaternion.copy(CAM_QUAT); w.m.rotateZ(w.a + t * .3); set(w.m, .09 * ramp(t, seconds + 1.2, .15, .3), t > seconds ? inq((t - seconds) / 1.2) : 0); }
      for (const c of clouds) {
        const a = c.al * ramp(t - c.d, seconds + 1.2 - c.d, .1, .2), e = t > seconds ? inq((t - seconds) / 1.2) : 0;
        c.m.position.set(c.x + Math.sin(t * .4 + c.ph) * .2, c.y + .1 * Math.sin(t * .6 + c.ph), c.z); c.m.rotateZ(c.sp * dt);
        c.m.scale.setScalar(c.s * (.55 + .45 * outc(t / .5)));
        set(c.m, a, e);
      }
      // simulated smoke (2026-11-28: denser): soft puffs billowing up inside the cloud the whole time, swelling as they fade
      if (t < seconds + .3) for (let k = 0; k < Math.floor(dt * 40) + (Math.random() < dt * 40 % 1 ? 1 : 0); k++) {
        const a = rand(0, 6.283), r = radius * Math.sqrt(Math.random()) * .9;
        P.soft.emit({ x: x + Math.cos(a) * r, y: rand(.15, 1.4), z: z + Math.sin(a) * r, vx: Math.cos(a) * .25, vz: Math.sin(a) * .25, vy: rand(.15, .45), drag: 1.4, sway: .3,
          life: rand(1.4, 2.4), size: rand(1, 1.7), grow: .9, color: pick([[.13, .11, .16], [.18, .15, .22], [.1, .09, .12], [.22, .18, .28]]), alpha: rand(.45, .7), shape: SHAPE.dot, spin: rand(-.6, .6) });
      }
      if (Math.random() < dt * 4) P.glow.emit({ x: x + rand(-radius, radius) * .6, y: rand(.3, 1.4), z: z + rand(-radius, radius) * .6, vy: rand(.2, .6), drag: 1.5, sway: .4, life: rand(.8, 1.4), size: rand(.08, .16), color: [.55, .4, .85], alpha: .6, shape: SHAPE.sparkle });
    }, () => { clouds.forEach(c => drop(c.m)); rim.forEach(w => drop(w.m)); });
  }
  // Assassinate: the lunge is a white-violet smear from where he set off; two painted slashes cross on the target with
  // a white bloom, ink spatters off him, and a violet shadow rune burns over him.
  function assassinate(fromX, fromZ, x, z) {
    puff(fromX, .8, fromZ, { size: 1.1, life: 1, alpha: .5 });
    streak('brush', fromX, 1.1, fromZ, x, 1.1, z, { width: .9, life: .55, color: INKV, hot: VIOLET, add: false, alpha: .7 });
    streak('smear4', fromX, 1.15, fromZ, x, 1.15, z, { width: .3, life: .3, color: VIOLET, hot: VIOLETHOT, alpha: .7 });
    later(.1, () => {
      flash('bloom', x, 1.2, z, 2, { color: VIOLET, hot: VIOLETHOT, add: true, life: .25, alpha: .25, fin: .05, out: .8, grow: 1.4 });
      flash('slash2', x, 1.15, z, 2.3, { color: VIOLET, hot: VIOLETHOT, add: true, life: .75, alpha: .6, grow: 1.08, fin: .04, out: .55, rot: .75 });
      later(.07, () => flash('slash4', x, 1.15, z, 2.3, { color: VIOLET, hot: VIOLETHOT, add: true, life: .7, alpha: .6, grow: 1.08, fin: .04, out: .55, rot: -.75 }));
      flash(pick(INKS), x, 0, z, 2.4, { ground: true, color: INKC, life: 2, alpha: .65, grow: 1.06, fin: .03, out: .6, order: 4 });
      kicks(x, z, 12, { y: 1.1, speed: [2.5, 5], color: INKC, len: [.3, .6], vy: [.5, 2], life: [.3, .55], gravity: 7 });
      dim(x, z, 1.7, 1.2, .3, [.05, .02, .08]);
      const r = spr(pick(['rune2', 'rune5', 'rune11']), 1, { color: VIOLET, hot: VIOLETHOT, add: true, flow: .5 });
      run(1.2, t => { const k = t / 1.2, [a, e] = life3(k, .95, .1, .55); r.position.set(x, 2.5 + .3 * outc(k), z); r.scale.setScalar(1 * (1.2 - .2 * outback(seg(k, 0, .25)))); set(r, a, e); }, () => drop(r));
    });
  }

  // ===================================================================================================================
  // KURODA BOSS
  // Sweep (spinning cut): painted slashes laid flat on the ground, wheeling once round him at the real radius in
  // crimson with a gold edge, dust thrown out at the rim.
  function sweep(x, z, { radius = 2.6 } = {}) {
    for (let i = 0; i < 2; i++) {
      const m = spr(pick(SLASHES), radius * 2.1, { ground: true, color: [.72, .1, .12], hot: CRIMHOT, add: true, order: 6, flow: .3, hotK: .35 }), a0 = i / 2 * 6.283;
      later(i * .05, () => run(.55, (t, dt) => { const k = t / .55, [a, e] = life3(k, .28, .06, .6); onGround(m, x, z, .08 + i * .01); m.rotation.z = a0 - 6.283 * .6 * outc(k); m.scale.setScalar(radius * 2.1 * (.75 + .25 * outc(k))); set(m, a, e); }, () => drop(m)));
    }
    flash('ring_torn', x, 0, z, radius * 2.1, { ground: true, color: CRIMSON, hot: CRIMHOT, add: true, life: .6, alpha: .22, grow: 1.12, order: 5 });
    later(.08, () => kicks(x, z, 16, { r0: radius * .9, speed: [1.5, 3.5], color: DUST, len: [.35, .7], vy: [.2, 1], life: [.3, .5] }));
  }
  // Cleave: one heavy painted slash across the target, sparks, and a crack in the ground
  function cleave(x, z, dx = 1, dz = 0) {
    flash(pick(SLASHES), x, 1.1, z, 2.2, { color: CRIMSON, hot: CRIMHOT, add: true, life: .5, alpha: .65, grow: 1.1, fin: .04, out: .6, rot: rand(-.9, -.4) });
    flash('sparks1', x, 1, z, 1.2, { color: GOLDC, hot: GOLDHOT, add: true, life: .3, grow: 1.6, fin: .05 });
    flash('cracks', x, 0, z, 1.8, { ground: true, color: [.12, .08, .06], life: 1.4, alpha: .55, grow: 1.05, order: 4 });
  }
  // Thrust: a long narrow gold-white smear driven out along his line, a burst at the tip, sparks thrown forward
  function thrust(x, z, tx, tz) {
    const dx = tx - x, dz = tz - z, L = Math.hypot(dx, dz) || 1;
    streak('smear2', x, 1.15, z, tx + dx / L * .5, 1.15, tz + dz / L * .5, { width: .45, life: .4, color: CRIMSON, hot: CRIMHOT, alpha: 1 });
    streak('smear3', x, 1.15, z, tx, 1.15, tz, { width: .14, life: .3, color: GOLDC, hot: GOLDHOT, alpha: 1, delay: .02 });
    later(.08, () => { burstAt(tx, 1.15, tz, 1.2, CRIMSON, CRIMHOT, .3, .95); kicks(tx, tz, 8, { y: 1.1, ang: Math.atan2(dz, dx), spread: 1, speed: [3, 6], color: GOLDC, add: true, len: [.25, .5], vy: [-.2, .6], life: [.15, .3], gravity: 2 }); });
  }
  // Counter: a gold bloom on the guard, a torn ring of light standing like a shield, a spark burst
  function counter(x, z, dx = 0, dz = 1) {
    const L = Math.hypot(dx, dz) || 1, px = x + dx / L * .45, pz = z + dz / L * .45;
    flash('slash2', px, 1.3, pz, 1.5, { color: GOLDC, hot: GOLDHOT, add: true, life: .35, alpha: .6, hotK: .45, rot: 1.3, fin: .05, out: .8, grow: 1.3 });
    flash('ring_torn', px, 1.3, pz, 1.6, { color: GOLDC, hot: GOLDHOT, add: true, life: .5, alpha: .5, fin: .06, out: .6, grow: 1.25 });
    flash('sparks1', px, 1.3, pz, 1.1, { color: GOLDC, hot: GOLDHOT, add: true, life: .3, grow: 1.6, fin: .05 });
  }
  // Pursuit: two crimson wisps stream off behind him as he breaks into the chase, dust kicked back
  function pursuit(x, z, dx = 0, dz = 1) {
    const L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    for (const s of [-1, 1]) streak(pick(WISPS), x + uz * s * .3, 1.2, z - ux * s * .3, x - ux * 2.2 + uz * s * .7, 1.3, z - uz * 2.2 - ux * s * .7, { width: .5, life: .7, color: CRIMSON, hot: CRIMHOT, alpha: .7, flow: 1 });
    kicks(x, z, 10, { ang: Math.atan2(-uz, -ux), spread: 1.2, speed: [2, 4.5], color: DUST, len: [.35, .7], life: [.3, .5] });
  }
  // Formation (per frame while it holds): a gold sigil turning under the formation centre and painted runes standing
  // round the real radius, slowly circling; the near ones go faint so the fight shows through.
  function formation(id, x, z, { radius = 3 } = {}) {
    const m = marker(id, 'formation'); m.x = x; m.z = z; m.r = radius;
    if (!m.parts.length) {
      m.ground = RUNES.slice(4, 12).map(n => spr(n, .75, { ground: true, color: GOLDC, hot: GOLDHOT, add: true, order: 5, flow: .2, hotK: .5 }));
      m.parts.push(spr('ring_torn', radius * 2.1, { ground: true, color: GOLDC, hot: GOLDHOT, add: true, order: 5, flow: .4, hotK: .4 }), ...m.ground);
      m.runes = RUNES.slice(0, 8).map(n => spr(n, .85, { color: GOLDC, hot: GOLDHOT, add: true, flow: .3 }));
      m.parts.push(...m.runes); m.age = 0;
    }
  }
  tick('formation', (m, dt) => {
    m.age += dt; const sg = m.parts[0], open = outback(seg(m.age, 0, .45), 1.2);
    onGround(sg, m.x, m.z, .05); sg.rotation.z -= dt * .15; sg.scale.setScalar(m.r * 2.1 * open); set(sg, m.k * .2);
    m.ground.forEach((g, i) => { const a = i / m.ground.length * 6.283 + m.age * .15, r = m.r * .72 * open; onGround(g, m.x + Math.cos(a) * r, m.z + Math.sin(a) * r, .05); g.rotation.z = -a + Math.PI / 2; set(g, m.k * .5 * (.85 + .15 * Math.sin(m.age * 2 + i))); });
    m.runes.forEach((r, i) => {
      const a = i / m.runes.length * 6.283 - m.age * .4, rise = outc(seg(m.age, i * .04, i * .04 + .4));
      r.position.set(m.x + Math.cos(a) * m.r, gy(m.x, m.z) + (.9 + (i % 2) * .3) * rise + .06 * Math.sin(m.age * 2 + i), m.z + Math.sin(a) * m.r);
      const near = Math.cos(a) * VIEW_DIR.x + Math.sin(a) * VIEW_DIR.z > 0;
      set(r, m.k * rise * (near ? .35 : .9) * (.88 + .12 * Math.sin(m.age * 3 + i)));
    });
  });

  // ===================================================================================================================
  // CREW AND WAR SPECIALS (batch 2)
  const EMBER = [.92, .38, .1], EMBERHOT = [1, .84, .5], CHAR = [.12, .09, .07], SMOKEC = [.22, .19, .17], MINT = [.35, .85, .66], MINTHOT = [.85, 1, .92];
  // a painted rune riding over a unit's head for a while (follow: () => {x, z} or null when gone)
  function headRune(follow, seconds, color, hot, name = pick(['rune3', 'rune7'])) {
    const r = spr(name, .95, { color, hot, add: true, flow: .5, hotK: .6 });
    run(seconds, t => { const p = follow(); if (!p) return; const k = t / seconds, [a, e] = life3(k, .9, .06, .3); r.position.set(p.x, gy(p.x, p.z) + 2.45 + .05 * Math.sin(t * 3), p.z); r.scale.setScalar(.95 * (1.2 - .2 * outback(seg(k, 0, .08)))); set(r, a * (.8 + .2 * Math.sin(t * 6)), e); }, () => drop(r));
  }
  // Fire-bomb telegraph: the real radius as a torn ember ring, a scorch filling it through the wind-up and flight
  function bombMark(x, z, { radius = 2.6, seconds = 2 } = {}) {
    const ring = spr('ring_torn', 1, { ground: true, color: EMBER, hot: EMBERHOT, add: true, order: 5, flow: .6, hotK: .5 });
    const fill = spr('scorch', 1, { ground: true, color: [.55, .16, .04], hot: EMBER, add: true, order: 4, flow: .4, hotK: .3 });
    run(seconds, (t, dt) => { const k = t / seconds, f = ramp(t, seconds, .08, .06);
      onGround(ring, x, z, .06); ring.scale.setScalar(radius * 2.15); ring.rotation.z += dt * .4; set(ring, (.3 + .35 * k) * f);
      onGround(fill, x, z, .05); fill.scale.setScalar(radius * 2 * (.15 + .85 * k)); set(fill, .3 * f); }, () => { drop(ring); drop(fill); });
  }
  // Fire-bomb burst (fire) or dynamite (no fire): flash, a rolling fireball, burning liquid flung out, fires licking on
  // the ground, a scorch left behind, sparks and smoke
  function blast(x, z, { radius = 2.6, fire = true } = {}) {
    flash('bloom', x, .9, z, radius * 1.1, { color: EMBER, hot: EMBERHOT, add: true, life: .16, alpha: .18, fin: .05, out: .8, grow: 1.4, hotK: .5 });
    flash(pick(FIREBALLS), x, 1.1, z, radius * 1.05, { color: [.8, .26, .06], hot: [1, .78, .4], life: .65, alpha: .95, grow: 1.35, fin: .05, out: .6, hotK: .6, flow: .8, rot: rand(-.3, .3) });   // normal blend: additive blew out to white under bloom
    later(.12, () => flash(pick(FIREBALLS), x, 1.6, z, radius * 1.2, { color: SMOKEC, hot: [.5, .3, .18], life: 1.3, alpha: .6, grow: 1.35, fin: .1, out: .6, flow: .7, hotK: .3 }));
    kicks(x, z, fire ? 18 : 24, { y: .6, speed: [3, 7.5], color: EMBER, add: true, len: [.3, .6], vy: [1, 3], life: [.3, .6], gravity: 6 });
    flash('scorch', x, 0, z, radius * 2, { ground: true, color: CHAR, hot: [.2, .14, .1], edge: [.25, .16, .1], life: fire ? 5 : 3.5, alpha: .6, grow: 1.04, fin: .03, out: .5, order: 4 });
    for (let i = 0; i < 6; i++) puff(x + rand(-1, 1), .8, z + rand(-1, 1), { size: 1.6, life: 2.2, color: SMOKEC, alpha: .4, vy: .7, delay: .15 + i * .05 });
    if (!fire) { kicks(x, z, 14, { speed: [2, 5], color: DUST, len: [.4, .8], vy: [.5, 2], life: [.4, .7], gravity: 7 }); return; }
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 + rand(-.3, .3), sx = Math.cos(a) * radius * .5, sz = Math.sin(a) * radius * .5;
      flash('splash_fire', x + sx, .55, z + sz, radius * .75, { color: EMBER, hot: EMBERHOT, add: true, life: .55, alpha: .55, grow: 1.3, fin: .05, out: .6, rot: Math.atan2(-sz, sx) - Math.PI / 2 }); }
    for (let i = 0; i < 7; i++) { const a = rand(0, 6.283), r = radius * Math.sqrt(Math.random()) * .8;
      later(rand(.05, .25), () => flash(pick(FLAMES), x + Math.cos(a) * r, .45, z + Math.sin(a) * r, rand(.7, 1.1), { color: EMBER, hot: EMBERHOT, add: true, flow: 1.3, life: rand(1.2, 2.2), alpha: .65, grow: 1.1, fin: .15, out: .5 })); }
  }
  // Torch channel: a little torch in his free hand with a painted flame on it (off the sprite) and a warm flicker, for the channel's length
  // Torch channel (2026-11-28: no prop): a flame cupped in front of him that grows through the channel, with ember
  // wisps swirling in toward his hands and sparks drawn inward, flaring once when the channel ends
  function torch(x, z, seconds = 1, follow = null) {
    const front = new THREE.Vector3(VIEW_DIR.x, 0, VIEW_DIR.z).normalize().multiplyScalar(.45);
    const at = () => { const p = follow?.() || { x, z }; return { x: p.x + front.x, y: gy(p.x, p.z) + 1.05, z: p.z + front.z }; };
    const f = spr(pick(FLAMES), .4, { color: EMBER, hot: EMBERHOT, add: true, flow: 1.5, hotK: .55 });
    const wisps = [0, 1, 2].map(i => ({ m: spr(WISPS[i], .7, { color: EMBER, hot: EMBERHOT, add: true, flow: 1.2, hotK: .5 }), a: i / 3 * 6.283 }));
    run(seconds, (t, dt) => {
      const c = at(), k = t / seconds, a = ramp(t, seconds, .1, .08);
      f.position.set(c.x, c.y + .1 * k, c.z); f.scale.setScalar(.35 + .4 * outc(k) + .04 * Math.sin(t * 19)); set(f, .9 * a);
      for (const w of wisps) {   // spiralling in: the radius shrinks as the channel fills
        w.a += dt * (4 + 4 * k); const r = .75 * (1 - .65 * k);
        w.m.position.set(c.x + Math.cos(w.a) * r, c.y + .15 * Math.sin(w.a * 1.3), c.z + Math.sin(w.a) * r * .6);
        w.m.quaternion.copy(CAM_QUAT); w.m.rotateZ(-w.a); set(w.m, .45 * a * (.6 + .4 * k));
      }
    }, () => { drop(f); wisps.forEach(w => drop(w.m)); const c = at(); flash('burst1', c.x, c.y + .2, c.z, 1, { color: EMBER, hot: EMBERHOT, add: true, life: .3, alpha: .6, grow: 1.5, fin: .05, out: .7 }); });
    for (let i = 0; i < Math.ceil(seconds * 14); i++) later(i / 14, () => {   // sparks drawn in toward the flame
      const c = at(), a = rand(0, 6.283), r = rand(.8, 1.2);
      P.glow.emit({ x: c.x + Math.cos(a) * r, y: c.y + rand(-.3, .5), z: c.z + Math.sin(a) * r * .6, vx: -Math.cos(a) * r * 2.2, vy: rand(-.2, .3), vz: -Math.sin(a) * r * 1.3, drag: 1, life: .4, size: rand(.08, .13), color: EMBERHOT, shape: SHAPE.ember });
    });
  }
  // Taunt (enforcers): a war shout of gusts thrown out to the reach in the clan colour (a cone: only inside it), and a
  // rune of anger over each taunted enemy for the taunt's length
  function taunt(x, z, { radius = 5, color = BLOOD, hot = BLOODHOT, cone = 0, dir = 0, victims = [], follow = id => null, seconds = 2 } = {}) {
    for (let i = 0; i < 2; i++) flash(pick(GHOST), x + rand(-.2, .2), 1, z + rand(-.2, .2), 1.4, { color, hot, add: true, flow: 1.4, life: .55, alpha: .4, grow: 1.25, fin: .2, out: .5 });
    const n = cone ? 7 : 10, half = cone ? cone * Math.PI / 360 : Math.PI;
    for (let i = 0; i < n; i++) { const a = (cone ? dir - half + (i + .5) / n * half * 2 : i / n * 6.283) + rand(-.12, .12), v = radius * rand(2.4, 3);
      fling(pick(GUSTS), x + Math.cos(a) * .6, .06, z + Math.sin(a) * .6, Math.cos(a) * v, 0, Math.sin(a) * v, { ground: true, size: rand(1.2, 1.8), life: rand(.45, .6), color, hot, add: true, alpha: rand(.3, .45), grow: 1.4, drag: 2.6, hotK: .5 }); }
    for (const t of victims) headRune(() => follow(t.id) || t, seconds, color, hot);
  }
  // Geisha diversion: a pink lotus opening under her, a soft ring to the reach, petals and hearts of light drifting
  function diversion(x, z, { radius = 6 } = {}) {
    flash('heal_lotus', x, 0, z, 2.4, { ground: true, color: PINK, hot: [1, .85, .92], add: true, life: 1.6, alpha: .3, grow: 1.2, fin: .1, out: .5, order: 5, hotK: .4 });
    flash('heal_ring', x, 0, z, radius * 2.1, { ground: true, color: PINK, hot: [1, .85, .92], add: true, life: 1.3, alpha: .2, grow: 1.15, fin: .1, out: .5, order: 5 });
    for (let i = 0; i < 40; i++) { const a = rand(0, 6.283), r = radius * Math.sqrt(Math.random());
      P.glow.emit({ x: x + Math.cos(a) * r, y: rand(1.2, 3.2), z: z + Math.sin(a) * r, vx: -Math.sin(a) * .5, vz: Math.cos(a) * .5, vy: rand(-.5, -.2), sway: .9, life: rand(1.8, 3), size: rand(.2, .3), color: pick(PETALS), alpha: .85, shape: SHAPE.petal, spin: rand(-2.5, 2.5) }); }
  }
  // Kunoichi: Vanish (an ink puff and a small violet vortex where she was) and the Ambush strike (a violet slash)
  function vanish(x, z) {
    const vx = spr('vortex1', 1.8, { ground: true, color: INKV, hot: VIOLET, order: 5, flow: .6, hotK: .6 });
    run(.8, (t, dt) => { const k = t / .8, [a, e] = life3(k, .6, .1, .5); onGround(vx, x, z, .05); vx.rotation.z += dt * 4; set(vx, a, e); }, () => drop(vx));
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; puff(x + Math.cos(a) * .3, rand(.3, 1.3), z + Math.sin(a) * .3, { vx: -Math.sin(a) * 1.2, vz: Math.cos(a) * 1.2, size: 1, life: 1.1, alpha: .55, delay: i * .02 }); }
  }
  function ambushStrike(x, z, dx = 1, dz = 0) {
    const L = Math.hypot(dx, dz) || 1;
    flash(pick(SLASHES), x, 1.15, z, 1.9, { color: VIOLET, hot: VIOLETHOT, add: true, life: .5, alpha: .6, grow: 1.1, fin: .04, out: .6, rot: Math.atan2(-dz / L, dx / L) + rand(-.5, .5) });
    flash('sparks1', x, 1.1, z, 1, { color: VIOLET, hot: VIOLETHOT, add: true, life: .3, grow: 1.6, fin: .05 });
    flash(pick(INKS), x, 0, z, 1.4, { ground: true, color: INKC, life: 1.4, alpha: .5, grow: 1.05, fin: .04, out: .6, order: 4 });
  }
  // Dog handler: a bite (two quick claw rakes and dust) and a loosed dog gone (a dust puff)
  function bite(x, z) {
    for (let i = 0; i < 2; i++) later(i * .07, () => flash(pick(SLASHES), x + rand(-.15, .15), 1, z, 1.1, { color: [.85, .3, .2], hot: [1, .8, .6], add: true, life: .3, alpha: .55, grow: 1.1, fin: .05, out: .6, rot: rand(.6, 1.2) * (i ? 1 : -1) }));
    kicks(x, z, 8, { speed: [1.5, 3], color: DUST, len: [.3, .5], vy: [.2, .8], life: [.25, .45] });
  }
  function dustPuff(x, z, size = 1) {
    for (let i = 0; i < 4; i++) puff(x + rand(-.25, .25), .4, z + rand(-.25, .25), { size: size * rand(.8, 1.1), life: 1, color: DUST, alpha: .4, vy: .5, grow: 1.6 });
  }
  // Hamstring hit: a mint flash and short streaks of light snapping down round his legs
  function hamstring(x, z) {
    flash('sparks1', x, .6, z, .9, { color: MINT, hot: MINTHOT, add: true, life: .3, grow: 1.6, fin: .05 });
    // dark red blood (2026-11-28): drops falling from the cut leg and a small splatter soaking into the ground
    for (let i = 0; i < 14; i++) later(rand(0, .5), () => P.soft.emit({ x: x + rand(-.2, .2), y: gy(x, z) + rand(.35, .6), z: z + rand(-.2, .2), vx: rand(-.4, .4), vz: rand(-.4, .4), vy: rand(-.2, .6), gravity: 9, life: rand(.25, .45), size: rand(.1, .16), color: pick([[.32, .02, .02], [.42, .04, .03], [.24, .01, .02]]), alpha: .9, shape: SHAPE.dot }));
    later(.15, () => flash(pick(INKS), x + rand(-.3, .3), 0, z + rand(-.2, .2), rand(1.3, 1.6), { ground: true, color: [.3, .02, .02], hot: [.45, .05, .04], edge: [.38, .04, .03], life: 4, alpha: .75, grow: 1.12, fin: .1, out: .4, order: 4 }));
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283, l = spr('smear2', 1, { color: MINT, hot: MINTHOT, add: true });
      run(.5, t => { const k = t / .5; l.position.set(x + Math.cos(a) * .45, gy(x, z) + 1 - .8 * outc(k), z + Math.sin(a) * .45 * .9); aim(l, 0, -1, 0); l.scale.set(.8, .14, 1); set(l, .9 * (1 - k)); }, () => drop(l)); }
  }

  // hamstrung (per frame while the slowing arrow's snare holds, 2026-11-28): blood keeps dripping from the leg and
  // leaves a trail of small dark red spots as he walks
  function bleed(id, x, z) {
    const m = marker(id, 'bleed'); m.x = x; m.z = z;
    if (!m.parts.length) { m.parts.push(P.lift(new THREE.Object3D())); m.drip = 0; m.lx = x; m.lz = z; }
  }
  const BLOOD_DROPS = [[.32, .02, .02], [.42, .04, .03], [.24, .01, .02]];
  tick('bleed', (m, dt) => {
    if (m.k < .5) return;
    if ((m.drip -= dt) <= 0) { m.drip = rand(.12, .25); P.soft.emit({ x: m.x + rand(-.15, .15), y: gy(m.x, m.z) + rand(.3, .5), z: m.z + rand(-.12, .12), vy: rand(-.4, 0), gravity: 9, life: .3, size: rand(.08, .13), color: pick(BLOOD_DROPS), alpha: .9, shape: SHAPE.dot }); }
    if (Math.hypot(m.x - m.lx, m.z - m.lz) > .6) { m.lx = m.x; m.lz = m.z; flash(pick(INKS), m.x + rand(-.15, .15), 0, m.z + rand(-.15, .15), rand(.4, .65), { ground: true, color: [.3, .02, .02], hot: [.42, .05, .04], edge: [.36, .04, .03], life: 6, alpha: .7, grow: 1.08, fin: .1, out: .35, order: 4 }); }
  });
  // a loosed war dog (per frame while it runs, 2026-11-28: easier to see): an amber glow on the ground under it and
  // a soft warm halo round the body
  function dogGlow(id, x, z) {
    const m = marker(id, 'dog'); m.x = x; m.z = z;
    if (!m.parts.length) m.parts.push(sMark([.95, .62, .22], .55), spr('bloom', 1.4, { color: [.95, .58, .2], hot: [1, .85, .55], add: true, hotK: .4 }));
  }
  tick('dog', (m, dt) => { m.t += dt; placeMark(m.parts[0], m.x, m.z, m.k * .55, .4); const b = m.parts[1]; b.position.set(m.x, gy(m.x, m.z) + .5, m.z); set(b, m.k * (.2 + .05 * Math.sin(m.t * 9))); });

  // ===================================================================================================================
  // STATUS MARKS (per frame while it lasts): a torn ring under the unit in the status colour + one painted shape over
  // the head. Crowd control reads louder than buffs.
  const ST = {
    intimidated: { col: [.55, .25, .95], hot: INTIMHOT, top: () => pick(GHOST), size: .55, a: .75, flow: 1.6, beat: 3 },
    rallied: { col: [.98, .74, .7], hot: [1, .93, .86], top: () => 'petals', size: .55, a: .65, flow: .5, rise: true },
    lantern: { col: [1, .55, .15], hot: [1, .88, .6], top: () => pick(FLAMES), size: .42, a: .8, flow: 1.4, beat: 2 },
    veil: { col: INKV, hot: VIOLET, top: null, size: 0, a: .5, wisps: true },
    ambush: { col: VIOLET, hot: VIOLETHOT, top: () => pick(GHOST), size: .5, a: .8, flow: 1.4, beat: 1.2 },
    snared: { col: [.7, .62, .4], hot: [.95, .9, .7], top: null, size: 0, a: .8, root: true },
    stunned: { col: [.88, .7, .36], hot: [1, .92, .7], top: () => 'bolt_loop', size: .6, a: .85, spin: true },
    charmed: { col: PINK, hot: [1, .8, .9], top: () => 'heal_lotus', size: .5, a: .6, beat: 1.6, hotK: .4 },
    taunted: { col: BLOOD, hot: BLOODHOT, top: () => pick(['rune3', 'rune7']), size: .55, a: .9, beat: 2.4 },
  };
  function status(id, kind, x, z, { head = 2.4 } = {}) {
    const s = ST[kind], m = marker(id, 'st_' + kind); m.x = x; m.z = z; m.head = head; m.s = s;
    if (!m.parts.length) {
      m.parts.push(sMark(s.col, .62));
      if (s.top) m.parts.push(spr(s.top(), s.size * 2, { color: s.col, hot: s.hot, add: true, flow: s.flow ?? .4, hotK: s.hotK ?? .6 }));
      if (s.wisps) for (let i = 0; i < 3; i++) m.parts.push(spr(WISPS[i], 1.1, { color: VIOLET, hot: VIOLETHOT, add: true, flow: 1.2, hotK: .5 }));
      if (s.root) for (let i = 0; i < 6; i++) m.parts.push(spr('smear2', 1, { color: s.col, hot: s.hot, add: true }));
    }
  }
  for (const kind of Object.keys(ST)) tick('st_' + kind, (m, dt) => {
    m.t += dt; const s = m.s, beat = s.beat ? .75 + .25 * Math.sin(m.t * s.beat * 6.283 / 2) : 1;
    placeMark(m.parts[0], m.x, m.z, m.k * s.a * .55 * (s.beat ? .8 + .2 * beat : 1), .4);
    const top = s.top ? m.parts[1] : null;
    if (top) {
      if (s.feet) { top.position.set(m.x, gy(m.x, m.z) + .45, m.z); set(top, m.k * s.a * beat); }
      else if (s.spin) { top.position.set(m.x, gy(m.x, m.z) + m.head, m.z); top.quaternion.copy(CAM_QUAT); top.rotateZ(-m.t * 3); top.scale.setScalar(s.size * 2); set(top, m.k * s.a); }
      else if (s.rise) { const ph = m.t * .5 % 1; top.position.set(m.x, gy(m.x, m.z) + m.head - .1 - .5 * ph, m.z); set(top, m.k * s.a * Math.sin(ph * Math.PI)); }
      else { top.position.set(m.x, gy(m.x, m.z) + m.head + .05 * Math.sin(m.t * 2), m.z); top.scale.setScalar(s.size * 2 * (.85 + .15 * beat)); set(top, m.k * s.a * beat); }
    }
    if (s.wisps) m.parts.slice(1).forEach((w, i) => {
      const a = m.t * .9 + i * 2.1; w.position.set(m.x + Math.cos(a) * .35, gy(m.x, m.z) + .6 + i * .45 + .1 * Math.sin(m.t * 1.7 + i), m.z + Math.sin(a) * .35);
      w.quaternion.copy(CAM_QUAT); w.rotateZ(Math.sin(m.t + i) * .6 + i); set(w, m.k * (.4 + .15 * Math.sin(m.t * 2 + i)));
    });
    if (s.root) m.parts.slice(1).forEach((l, i) => {   // root: short streaks of light rising from the ring
      const ph = (m.t * .9 + i / 6) % 1, a = i / 6 * 6.283 + .4;
      l.position.set(m.x + Math.cos(a) * .5, gy(m.x, m.z) + .15 + ph * .8, m.z + Math.sin(a) * .5 * .9);
      aim(l, 0, 1, 0); l.scale.set(.9, .16, 1); set(l, m.k * .95 * Math.sin(ph * Math.PI));
    });
  });

  return { ready: P.ready, update: P.update, clear: P.clear, dash, cut, intimidate, rally, lantern, lanternCard, lanternAlpha, shadowstep, smoke, assassinate, sweep, cleave, thrust, counter, pursuit, formation, status, bombMark, blast, torch, taunt, diversion, vanish, ambushStrike, bite, dustPuff, hamstring, dogGlow, bleed };
}
