// Hero running trails (Tim 2026-10-29): only while the hero runs, nothing idle or attacking.
// sonic (Yakuza ronin): thin pale speed lines peel off his body and stretch out behind him; idle, each time
// the blade shimmer runs, two faint hum rings ripple out from the blade (Tim 2026-10-29: added to the glint).
// static (Kuroda boss): slower coherent crimson discharges trail behind and fade; also (Tim 2026-10-29)
// tiny crimson sparks now and then fall off the blade when idle, and one thin extra arc flickers along the blade mid-swing.
// Sprite-local units (0..1 of the quad, y up); "behind" = opposite the sheet direction (sim dirIndex:
// screen right -sin, screen down cos). Purely visual. Style and colour: weapon_glow.json runTrail.
import * as THREE from 'three';
import { runTrailMaterial } from './shading.js';
import { lightningPattern } from './weapon_lightning_pattern.js';
import { lightningRipplePoint } from './lightning_ripple.js';

const STYLES = {
  sonic: { color: [0.62, 0.72, 0.9], every: 0.05, life: 0.32, speed: 0.55, width: 0.0035, alpha: 0.5, max: 14 },
  static: { color: [1, 0.1, 0.16], every: 0.18, life: 0.48, speed: 0.18, width: 0.0045, alpha: 0.95, max: 4 },
};

export function createRunTrail(spriteUniforms, style = 'sonic') {
  const S = STYLES[style] || STYLES.sonic, capacity = style==='static'?2400:1200;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(capacity * 3), uvs = new Float32Array(capacity * 2);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = runTrailMaterial(spriteUniforms, S.color,style==='static'), mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; mesh.visible = false;
  let clock = 0, shedAt = 0, streaks = [], sparks = [], sparkAt = 0, arc = null, rings = [], humming = false;
  let arcPaths=[],arcAt=-Infinity,previousSwing=null;
  const rippleA={},rippleB={};
  return { mesh,
    update(dt, anim, dir, enabled = true, axis = null, swing = null, hum = false) {
      clock += dt;
      const th = dir * Math.PI / 4, bx = Math.sin(th), by = Math.cos(th);   // behind him, sprite-local
      if (enabled && anim === 'run' && clock - shedAt > S.every && streaks.length < S.max) {
        shedAt = clock;
        const h = 0.3 + Math.random() * 0.5, side = (Math.random() - 0.5) * 0.14;
        let paths=[];
        if (style === 'static') {   // correlated, finer bends fixed at birth so the arc holds its shape
          paths=lightningPattern({base:{x:0,y:0},tip:{x:1,y:0}},Math.random()*0xffffffff,false);
        }
        streaks.push({ x: axis&&style==='static'?axis.base.x:0.5 + side - bx * 0.04, y:axis&&style==='static'?axis.base.y:h - by * 0.02, born: clock, paths,bend:(Math.random()<.5?-1:1)*(.07+Math.random()*.04),len: 0.06 + Math.random() * 0.08 });
      }
      streaks = streaks.filter(s => clock - s.born < S.life);
      // Kuroda extras on the blade (needs its blade axis): idle sparks, mid-swing arc
      arc = null;
      if (style === 'static' && enabled && axis) {
        if (anim === 'idle' && clock - sparkAt > 0.45 + Math.random() * 0.5 && sparks.length < 6) {
          sparkAt = clock;
          const t = 0.4 + Math.random() * 0.6;
          sparks.push({ x: axis.base.x + (axis.tip.x - axis.base.x) * t, y: axis.base.y + (axis.tip.y - axis.base.y) * t,
            vx: (Math.random() - 0.5) * 0.12, vy: 0.03, born: clock });
        }
        if (swing !== null && swing > 0.15 && swing < 0.85) {
          if(clock-arcAt>.24||previousSwing===null||swing<previousSwing){
            arcAt=clock;arcPaths=lightningPattern({base:{x:.2,y:0},tip:{x:1,y:0}},Math.random()*0xffffffff,true);
          }
          if(clock-arcAt<.18)arc=axis;
        }
      }
      previousSwing=swing;
      sparks = sparks.filter(p => clock - p.born < 0.4);
      // Yakuza hum: on the shimmer's rising edge, two rings from the blade's middle, a beat apart
      if (style === 'sonic' && enabled && axis && hum && !humming && anim !== 'run')
        for (const delay of [0, 0.14]) rings.push({ x: (axis.base.x + axis.tip.x) / 2, y: (axis.base.y + axis.tip.y) / 2, born: clock + delay });
      humming = hum;
      rings = rings.filter(r => clock - r.born < 0.6);
      let count = 0;
      // one tapered quad strip from a to b, alpha fading along it (uv.y) and soft at the sides (uv.x)
      function segment(ax, ay, bx2, by2, wa, wb, fa, fb) {
        if (count + 6 > capacity) return;
        const l = Math.hypot(bx2 - ax, by2 - ay) || 1, ox = -(by2 - ay) / l, oy = (bx2 - ax) / l;
        const v = [[ax + ox * wa, ay + oy * wa, 0, fa], [ax - ox * wa, ay - oy * wa, 1, fa], [bx2 + ox * wb, by2 + oy * wb, 0, fb],
          [bx2 + ox * wb, by2 + oy * wb, 0, fb], [ax - ox * wa, ay - oy * wa, 1, fa], [bx2 - ox * wb, by2 - oy * wb, 1, fb]];
        for (const [x, y, u, f] of v) { positions.set([x - 0.5, y - 0.5, 0.006], count * 3); uvs.set([u, f], count * 2); count++; }
      }
      for (const s of streaks) {
        const age = (clock - s.born) / S.life, k = 1 - age, travel = S.speed * (clock - s.born);
        // starts at the body and slides back while it stretches, then thins out
        const hx = s.x + bx * travel * 0.5, hy = s.y + by * travel * 0.5;
        if (style === 'static') {
          if ((clock-s.born)<0.025) continue;   // stable discharge, no frame-random flicker
          const ux = bx, uy = by, px = -uy, py = ux;
          for(const path of s.paths)for (let i = 0; i + 1 < path.points.length; i++) {
            const a=lightningRipplePoint(path.points[i],age,s.bend,rippleA),b=lightningRipplePoint(path.points[i+1],age,s.bend,rippleB),w=S.width*k*path.width;
            segment(hx + ux*a.x + px*a.y, hy + uy*a.x + py*a.y, hx + ux*b.x + px*b.y, hy + uy*b.x + py*b.y,
              w,w,S.alpha*k,S.alpha*k*.8);
          }
        } else {
          const len = s.len * (0.4 + 0.6 * Math.min(1, age * 3));
          segment(hx, hy, hx + bx * len, hy + by * len, S.width * (0.6 + 0.4 * k), S.width * 0.2, S.alpha * k, 0);
        }
      }
      for (const p of sparks) {
        const age = (clock - p.born) / 0.4;
        p.vy -= dt * 0.5; p.x += p.vx * dt; p.y += p.vy * dt;   // falls
        segment(p.x, p.y, p.x - p.vx * 0.05, p.y - p.vy * 0.05 + 0.006, 0.003, 0.0015, 0.8 * (1 - age), 0.2 * (1 - age));
      }
      if (arc) {   // Hold each seeded branching channel; animate light, not random geometry.
        const dx = arc.tip.x - arc.base.x, dy = arc.tip.y - arc.base.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        const fade=Math.exp(-(clock-arcAt)*14);
        for(const path of arcPaths)for(let i=1;i<path.points.length;i++){
          const a=path.points[i-1],b=path.points[i],w=.0025*path.width*(1-.6*i/path.points.length);
          segment(arc.base.x+dx*a.x+nx*l*a.y,arc.base.y+dy*a.x+ny*l*a.y,
            arc.base.x+dx*b.x+nx*l*b.y,arc.base.y+dy*b.x+ny*l*b.y,w,w,.7*fade,.6*fade);
        }
      }
      for (const r of rings) {   // a flat ellipse (ground-ish perspective) growing and fading
        const age = (clock - r.born) / 0.6;
        if (age < 0) continue;
        const rad = 0.03 + 0.11 * age, a = 0.35 * (1 - age);
        for (let i = 0; i < 16; i++) {
          const t1 = i / 16 * Math.PI * 2, t2 = (i + 1) / 16 * Math.PI * 2;
          segment(r.x + Math.cos(t1) * rad, r.y + Math.sin(t1) * rad * 0.45, r.x + Math.cos(t2) * rad, r.y + Math.sin(t2) * rad * 0.45, 0.0022, 0.0022, a, a);
        }
      }
      geometry.setDrawRange(0, count); geometry.attributes.position.needsUpdate = true; geometry.attributes.uv.needsUpdate = true;
      mesh.visible = count > 0;
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
