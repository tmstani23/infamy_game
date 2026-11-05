// Resource glow (Tim 2026-11-05): a soft pulsing ground glow under every discovered resource spot
// (small) and resource node (big), tinted by kind, so they read even at far zoom. Render only:
// additive flat discs on the ground, no effect on rules or navigation. Numbers: frontier.json townArt._spots.glow.
import * as THREE from 'three';

export const GLOW_COLORS = { timber: '#7fe08a', forest: '#7fe08a', stone: '#e8e2d2', quarry: '#e8e2d2', ore: '#ffb35c', fish: '#6fd8ff', fishing: '#6fd8ff', forage: '#ffd76a', fertile: '#c8f06a' };

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,.55)'); grad.addColorStop(0.55, 'rgba(255,255,255,.22)');
  grad.addColorStop(0.82, 'rgba(255,255,255,.5)'); grad.addColorStop(0.9, 'rgba(255,255,255,.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createSpotGlow({ scene, cfg = {} }) {
  const tex = glowTexture(), geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mats = new Map(), discs = new Map(), group = new THREE.Group();
  group.renderOrder = 1; scene.add(group);
  const mat = kind => {
    if (!mats.has(kind)) mats.set(kind, new THREE.MeshBasicMaterial({ map: tex, color: GLOW_COLORS[kind] || '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    return mats.get(kind);
  };
  // items: [{ key, kind, x, z, r, big }]
  function update(items, visible) {
    group.visible = visible;
    if (!visible) return;
    const keep = new Set(), t = performance.now() / (cfg.periodMs || 1400);
    for (const it of items) {
      keep.add(it.key);
      let m = discs.get(it.key);
      if (!m) { m = new THREE.Mesh(geo, mat(it.kind)); m.renderOrder = 1; group.add(m); discs.set(it.key, m); }
      const size = it.r * 2 * (it.big ? cfg.bigScale || 1.4 : 1);
      m.position.set(it.x, cfg.height ?? 0.12, it.z); m.scale.set(size, 1, size);
    }
    for (const [k, m] of discs) if (!keep.has(k)) { group.remove(m); discs.delete(k); }
    const pulse = (cfg.opacity ?? 0.55) * (1 - (cfg.pulse ?? 0.35) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2)));
    for (const m of mats.values()) m.opacity = pulse;
  }
  return { update };
}
