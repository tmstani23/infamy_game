// Relic effects (world variety P4, 2026-11-28): painted pieces (render/painted_fx.js) for the key relics' casts from
// sim/relics.js. Purely visual; the sim decides what the smoke blocks and who heals.
//   relicSmoke: the hermit's lantern opens with a warm glow, then a wide pale ash-grey cloud rolls out over the real
//     radius (8) for the whole duration, see-through, thicker at the rim so the edge that stops shots reads; then it
//     thins away through noise. Not the Shinobi's violet smoke bomb.
//   relicHeal: the pilgrim's gourd: a soft jade column rises round the hero for the heal's seconds, motes drift up and
//     a slow ring turns at his feet; it follows him.
//   relicConch: the horn's call: three sea-teal rings roll out over the ground from the hero, with gusts thrown out.
import * as THREE from 'three';
import { CAM_QUAT } from './iso.js';
import { createPainted, rand, pick, outc, inq, ramp, SMOKES, WISPS, GUSTS } from './painted_fx.js';

const ASH = [.62, .6, .56], ASHDARK = [.42, .4, .38], LAMP = [.85, .55, .22], LAMPHOT = [1, .86, .55];
const JADE = [.35, .7, .5], JADEHOT = [.85, 1, .85], SEA = [.25, .6, .68], SEAHOT = [.8, .97, 1];

export function createRelicFx({ scene, texBase = 'art/fx/' }) {
  const P = createPainted({ scene, texBase, pieces: ['smoke1', 'smoke2', 'smoke3', 'smoke4', 'wisp1', 'wisp2', 'wisp3', 'wisp4', 'gust1', 'gust2', 'gust3', 'gust4',
    'bloom', 'burst2', 'heal_column', 'heal_motes', 'heal_ring', 'heal_lotus', 'shock_ring', 'ring_torn', 'motes'] });
  const { spr, set, run, drop, onGround, dim, fling, kicks, gy } = P;

  function smoke(x, z, { radius = 8, seconds = 6 } = {}) {
    const glow = spr('bloom', 2.2, { color: LAMP, hot: LAMPHOT, add: true, hotK: .3 });
    run(1.2, t => { const k = t / 1.2; glow.position.set(x, gy(x, z) + 1.2, z); glow.scale.setScalar(2.2 + 1.5 * outc(k)); set(glow, .16 * ramp(t, 1.2, .1, .7)); }, () => drop(glow));
    kicks(x, z, 18, { speed: [5, 9], color: ASHDARK, len: [.5, .9], vy: [.2, 1], life: [.35, .7], alpha: .6 });
    dim(x, z, radius * 1.08, seconds + 1.2, .22, [.04, .04, .04]);
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; fling(pick(SMOKES), x, .6, z, Math.cos(a) * radius * 1.3, .4, Math.sin(a) * radius * 1.3, { size: 2.2, life: 1.2, color: ASH, alpha: .5, grow: 1.8, flow: .7, drag: 1.6, hotK: .25, turn: false }); }
    const clouds = [], n = Math.round(radius * 4.5);
    for (let i = 0; i < n; i++) {
      const rim = i < n * .45, a = rand(0, 6.283), r = rim ? radius * rand(.78, .98) : radius * Math.sqrt(rand(0, .7));
      const m = spr(pick(SMOKES), rand(2.6, 4), { color: rim ? ASH : i % 2 ? ASHDARK : ASH, hotK: .25, flow: .8, order: 99810 });
      clouds.push({ m, x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, y: rand(.4, rim ? 2.2 : 1.6), s: m.scale.x, d: rand(0, .35) * (r / radius), sp: rand(-.2, .2), ph: rand(0, 6), al: rim ? rand(.3, .42) : rand(.14, .26) });
    }
    const lamp = Array.from({ length: 5 }, (_, i) => ({ m: spr(pick(WISPS), 1.8, { color: LAMP, hot: LAMPHOT, add: true, flow: 1.1, hotK: .35 }), a: i / 5 * 6.283 }));
    const L = seconds + 1.2;
    run(L, (t, dt) => {
      const e = t > seconds ? inq((t - seconds) / 1.2) : 0;
      for (const c of clouds) {
        c.m.position.set(c.x + Math.sin(t * .35 + c.ph) * .3, gy(c.x, c.z) + c.y + .12 * Math.sin(t * .5 + c.ph), c.z);
        c.m.rotateZ(c.sp * dt); c.m.scale.setScalar(c.s * (.5 + .5 * outc((t - c.d) / .6)));
        set(c.m, c.al * ramp(t - c.d, L - c.d, .1, .2), e);
      }
      for (const w of lamp) { const a = w.a + t * .3; w.m.position.set(x + Math.cos(a) * 1.2, gy(x, z) + .9 + .2 * Math.sin(t + w.a), z + Math.sin(a) * 1.2); w.m.quaternion.copy(CAM_QUAT); w.m.rotateZ(w.a + t * .4); set(w.m, .08 * ramp(t, L, .15, .3), e); }
      if (t < seconds) for (let k = 0; k < Math.floor(dt * 30) + (Math.random() < dt * 30 % 1 ? 1 : 0); k++) {
        const a = rand(0, 6.283), r = radius * Math.sqrt(Math.random()) * .95;
        P.soft.emit({ x: x + Math.cos(a) * r, y: rand(.2, 1.6), z: z + Math.sin(a) * r, vx: Math.cos(a) * .2, vz: Math.sin(a) * .2, vy: rand(.12, .4), drag: 1.4, sway: .3, life: rand(1.4, 2.2), size: rand(1.6, 2.6), grow: 1.6, color: ASH, alpha: .14 });
      }
    }, () => { for (const c of clouds) drop(c.m); for (const w of lamp) drop(w.m); });
  }

  // at(): the hero's [x, z] now (null once gone); the column follows him
  function heal(at, { seconds = 3 } = {}) {
    const col = spr('heal_column', 3, { color: JADE, hot: JADEHOT, add: true, flow: .9, hotK: .3, h: 1.4 });
    const ring = spr('heal_ring', 2.6, { ground: true, color: JADE, hot: JADEHOT, add: true, hotK: .45, order: 5 });
    const lotus = spr('heal_lotus', 1.2, { color: JADE, hot: JADEHOT, add: true, hotK: .35 });
    const L = seconds + .6;
    run(L, (t, dt) => {
      const p = at(); if (!p) return false;
      const [x, z] = p, y = gy(x, z), e = t > seconds ? inq((t - seconds) / .6) : 0, a = ramp(t, L, .12, .25);
      col.position.set(x, y + 2.1, z); set(col, .17 * a, e);
      onGround(ring, x, z, .05); ring.rotation.z += .5 * dt; set(ring, .35 * a, e);
      lotus.position.set(x, y + 3.4 + .1 * Math.sin(t * 2), z); lotus.scale.setScalar(1.2 * (.8 + .2 * outc(t / .4))); set(lotus, .22 * a * (t < 1 ? 1 : .6), e);
      if (t < seconds && Math.random() < dt * 14) { const r = rand(.2, .7), an = rand(0, 6.283);
        P.glow.emit({ x: x + Math.cos(an) * r, y: y + rand(.2, 1), z: z + Math.sin(an) * r, vy: rand(.8, 1.6), drag: .6, life: rand(.7, 1.1), size: rand(.12, .22), color: JADEHOT, alpha: .5 }); }
    }, () => { drop(col); drop(ring); drop(lotus); });
  }

  function conch(x, z, { reach = 9 } = {}) {
    for (let i = 0; i < 3; i++) P.later(i * .35, () => {
      const m = spr(i ? 'ring_torn' : 'shock_ring', 1, { ground: true, color: SEA, hot: SEAHOT, add: true, hotK: .25, order: 5 });
      const life = 1.4;
      run(life, t => { const k = t / life; onGround(m, x, z, .06); m.scale.setScalar(2 + reach * 2 * outc(k)); set(m, (.2 - i * .05) * (1 - inq(k)), k > .5 ? inq((k - .5) / .5) : 0); }, () => drop(m));
    });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + rand(-.2, .2);
      fling(pick(GUSTS), x + Math.cos(a), gy(x, z) + .5, z + Math.sin(a), Math.cos(a) * 9, .3, Math.sin(a) * 9, { size: 1.6, life: .8, color: SEA, add: true, alpha: .16, grow: 1.5, flow: 1, hotK: .25, ground: true }); }
    const b = spr('burst2', 1.6, { color: SEA, hot: SEAHOT, add: true, hotK: .35 });
    run(.5, t => { b.position.set(x, gy(x, z) + 2.2, z); b.scale.setScalar(1.6 + 1.2 * outc(t / .5)); set(b, .25 * ramp(t, .5, .08, .7)); }, () => drop(b));
  }

  // the climber's hook: grit knocked off the wall top as they go up, and dust where they drop on the far side
  function climb(x, z, x1, z1, { seconds = 3 } = {}) {
    const GRIT = [.5, .43, .34];
    kicks(x, z, 8, { speed: [1.5, 3], color: GRIT, len: [.3, .5], vy: [.2, .8], y: 1.6, life: [.4, .7], alpha: .55, gravity: 6 });
    P.later(seconds * .5, () => kicks(x, z, 6, { speed: [1.5, 3], color: GRIT, len: [.3, .5], vy: [.1, .5], y: 1.8, life: [.4, .7], alpha: .5, gravity: 6 }));
    P.later(seconds * .95, () => { kicks(x1, z1, 12, { speed: [2, 4], color: GRIT, len: [.3, .6], vy: [.1, .5], life: [.3, .6], alpha: .55 });
      for (let i = 0; i < 3; i++) fling(pick(SMOKES), x1, .3, z1, rand(-1, 1), .3, rand(-1, 1), { size: 1.2, life: .9, color: GRIT, alpha: .3, grow: 1.6, flow: .6, drag: 2, hotK: .2, turn: false }); });
  }

  return { ready: P.ready, smoke, heal, conch, climb, update: P.update };
}
