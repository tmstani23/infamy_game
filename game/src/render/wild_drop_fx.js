// A hunted animal's hide flies to the hero (wildlife W3, Tim 2026-11-24): a small pelt icon pops up off the
// carcass, arcs over to wherever the hero is now and shrinks into him. No loot menu; the hide is already in the
// clan's stock (sim/wild_animals.js killed). Sim: a 'wildDrop' cast { x, z, hero, item }.
import * as THREE from 'three';
import { groundY } from '../castle_height.js';

const FLY = 0.95, SIZE = 1.25;   // seconds in the air, world size of the icon
const W = 22, H = 18, S = 3;     // icon page pixels, drawn at S times (render/cargo_icons.js style)
const COATS = { deer_hide: ['#927a5e', '#5c4632', '#cdbda2'], boar_hide: ['#6a5140', '#3a2a1f', '#8e7560'],
  wolf_pelt: ['#7a746a', '#45413b', '#b1a998'], bear_hide: ['#3e322a', '#1d1712', '#62544a'] };   // W4 wolves and bears

// A pelt laid out flat, seen from above: a rough oval with four leg flaps and the neck, darker down the spine,
// ragged at the edge; deer keep a few pale spots, boar a bristly ridge. Muted, no bright outline (Tim 2026-11-23: grown-up icons).
function paint(item) {
  if (item === 'bear_gall') {   // a small dried gall bladder on a cord (W4: a bear sometimes gives one)
    const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
    const g = c.getContext('2d'); g.scale(S, S);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 1.6; g.shadowOffsetY = 0.6;
    const grad = g.createRadialGradient(W / 2 - 1.2, H / 2, 0.4, W / 2, H / 2 + 1, 5.5);
    grad.addColorStop(0, '#8c7448'); grad.addColorStop(0.5, '#5b4628'); grad.addColorStop(1, '#2c2114');
    g.fillStyle = grad; g.beginPath(); g.ellipse(W / 2, H / 2 + 1.5, 4.2, 5, 0, 0, Math.PI * 2); g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = '#6e5a3c'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(W / 2, H / 2 - 3.4); g.quadraticCurveTo(W / 2 + 2.5, 1.5, W / 2 + 0.5, 0.6); g.stroke();
    g.strokeStyle = '#1e140c'; g.globalAlpha = 0.75; g.lineWidth = 0.45; g.beginPath(); g.ellipse(W / 2, H / 2 + 1.5, 4.2, 5, 0, 0, Math.PI * 2); g.stroke();
    return c;
  }
  const [fill, dark, mark] = COATS[item] || COATS.deer_hide;
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const g = c.getContext('2d'); g.scale(S, S); g.lineJoin = 'round'; g.lineCap = 'round';
  let seed = item === 'boar_hide' ? 7 : item === 'bear_hide' ? 11 : item === 'wolf_pelt' ? 5 : 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const boar = item === 'boar_hide' || item === 'bear_hide', leg = boar ? 0.55 : 1, cx = W / 2, cy = H / 2 + 0.3, pts = [];   // a boar hide is rounder and stubbier
  const bump = (t, at, w, h) => { let d = Math.abs(((t - at + Math.PI * 3) % (Math.PI * 2)) - Math.PI); return d < w ? h * (1 + Math.cos(Math.PI * d / w)) / 2 : 0; };
  for (let i = 0; i < 90; i++) {
    const t = i / 90 * Math.PI * 2;
    let r = 1 + (bump(t, -2.5, 0.25, 0.78) + bump(t, -0.6, 0.29, 0.6) + bump(t, 2.22, 0.3, 0.52) + bump(t, 0.95, 0.24, 0.74)) * leg   // legs
      + bump(t, -Math.PI / 2 + 0.12, 0.2, 0.5) * leg + bump(t, Math.PI / 2, 0.14, 0.18) + (rnd() - 0.5) * 0.12;                                 // neck, tail, ragged edge
    pts.push([cx + Math.cos(t) * (boar ? 6 : 4.9) * r, cy + Math.sin(t) * (boar ? 5.6 : 4.6) * r]);
    if (i % 3 === 1) pts.push([cx + Math.cos(t) * (boar ? 6 : 4.9) * r * (0.94 + rnd() * 0.04), cy + Math.sin(t) * (boar ? 5.6 : 4.6) * r * (0.94 + rnd() * 0.04)]);   // tufts
  }
  const outline = () => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
  g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 1.6; g.shadowOffsetY = 0.6;
  const grad = g.createRadialGradient(cx - 1, cy - 1, 0.5, cx, cy, 9);
  grad.addColorStop(0, mark); grad.addColorStop(0.35, fill); grad.addColorStop(1, dark);
  g.fillStyle = grad; outline(); g.fill();
  g.shadowColor = 'transparent';
  g.save(); outline(); g.clip();
  // the spine, darker, and the fur lying away from it
  const spine = boar ? null : g.createLinearGradient(cx - 2.2, 0, cx + 2.2, 0);
  spine?.addColorStop(0, 'rgba(0,0,0,0)'); spine?.addColorStop(0.5, dark); spine?.addColorStop(1, 'rgba(0,0,0,0)');
  if (spine) { g.globalAlpha = 0.75; g.fillStyle = spine; g.fillRect(cx - 2.2, 0, 4.4, H); g.globalAlpha = 1; }
  // soft mottling in the fur (darker patches for boar)
  for (let i = 0; i < (item === 'boar_hide' ? 14 : 8); i++) {
    const x = cx + (rnd() - 0.5) * 9, y = cy + (rnd() - 0.5) * 9, r = 0.8 + rnd() * 1.4;
    const m = g.createRadialGradient(x, y, 0, x, y, r); m.addColorStop(0, boar ? 'rgba(30,22,16,.2)' : 'rgba(60,38,20,.22)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (boar) { g.strokeStyle = '#2e241c'; g.lineWidth = 0.3; g.globalAlpha = 0.5; g.beginPath(); for (let i = 0; i < 60; i++) { const a = rnd() * Math.PI * 2, d = rnd() * 4.6, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 0.9, y + Math.sin(a) * 0.9 - 0.3); } g.stroke(); g.globalAlpha = 1; }
  else if (item === 'deer_hide') { g.fillStyle = mark; g.globalAlpha = 0.45; for (const [x, y] of [[-2.6, -1.8], [2.7, -1.6], [-3.2, 0.6], [3.1, 0.8], [-2.4, 2.8], [2.5, 3], [-1.8, -3.4], [1.9, -3.2]]) { g.beginPath(); g.ellipse(cx + x, cy + y, 0.5, 0.38, 0, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; }
  g.restore();
  g.strokeStyle = '#1e140c'; g.globalAlpha = 0.75; g.lineWidth = 0.45; outline(); g.stroke(); g.globalAlpha = 1;
  return c;
}
const texCache = new Map();
const tex = item => { if (!texCache.has(item)) { const t = new THREE.CanvasTexture(paint(item)); t.colorSpace = THREE.SRGBColorSpace; texCache.set(item, t); } return texCache.get(item); };

// posOf(id): the hero's drawn position (a THREE.Vector3) or null
export function createWildDropFx({ scene, posOf }) {
  const live = [];
  function drop(c) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c.item), color: 0xb4b4b4, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
    s.scale.set(SIZE, SIZE * H / W, 1); s.renderOrder = 12; scene.add(s);
    const at = posOf(c.hero);
    live.push({ s, t: 0, hero: c.hero, from: { x: c.x, y: groundY(c.x, c.z) + 0.8, z: c.z }, last: at ? { x: at.x, y: at.y, z: at.z } : { x: c.x, y: groundY(c.x, c.z), z: c.z } });
  }
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i];
      f.t += dt;
      const k = Math.min(1, f.t / FLY), e = k * k * (3 - 2 * k), at = posOf(f.hero);
      if (at) f.last = { x: at.x, y: at.y, z: at.z };
      const to = { x: f.last.x, y: f.last.y + 0.9, z: f.last.z };
      const pop = Math.min(1, f.t / 0.18);
      f.s.position.set(f.from.x + (to.x - f.from.x) * e, f.from.y + (to.y - f.from.y) * e + Math.sin(Math.PI * k) * 2.4 + pop * 0.4 * (1 - k), f.from.z + (to.z - f.from.z) * e);
      const shrink = k > 0.75 ? 1 - (k - 0.75) / 0.25 * 0.7 : 1;
      f.s.scale.set(SIZE * shrink, SIZE * shrink * H / W, 1);
      f.s.material.opacity = Math.min(1, f.t / 0.12) * (k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1) * 0.95;
      if (k >= 1) { scene.remove(f.s); f.s.material.dispose(); live.splice(i, 1); }
    }
  }
  function clear() { for (const f of live) { scene.remove(f.s); f.s.material.dispose(); } live.length = 0; }
  return { drop, update, clear };
}
