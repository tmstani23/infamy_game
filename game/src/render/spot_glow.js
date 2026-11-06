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

// Rich deposits (Tim 2026-11-06): a bigger, soft, warm wash with no rim and no pulse (lamplight on earth,
// not magic), plus a flat painted badge with the kind's character that stays readable at far zoom and
// fades out as you zoom in. Numbers: glow.rich in frontier.json.
export const RICH_GLYPH = { quarry: '石', ore: '鉱', forest: '木', fishing: '魚', fertile: '稲' };
const RICH_TINT = '#ffd9a0';
function washTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,.5)'); grad.addColorStop(0.6, 'rgba(255,255,255,.28)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function badgeTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(58,40,24,.85)'; g.beginPath(); g.arc(48, 48, 40, 0, Math.PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = GLOW_COLORS[kind] || '#e8d2a0'; g.stroke();
  g.fillStyle = '#f3e6c8'; g.font = 'bold 44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(RICH_GLYPH[kind] || '◆', 48, 51);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createSpotGlow({ scene, cfg = {} }) {
  const tex = glowTexture(), geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const rc = cfg.rich || {}, wash = washTexture(), washMats = new Map(), badgeMats = new Map(), badges = new Map();
  const washMat = kind => {
    if (!washMats.has(kind)) washMats.set(kind, new THREE.MeshBasicMaterial({ map: wash, color: new THREE.Color(GLOW_COLORS[kind] || '#ffffff').lerp(new THREE.Color(RICH_TINT), rc.warmth ?? 0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: rc.opacity ?? 0.3 }));
    return washMats.get(kind);
  };
  const badgeMat = kind => {
    if (!badgeMats.has(kind)) badgeMats.set(kind, new THREE.SpriteMaterial({ map: badgeTexture(kind), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
    return badgeMats.get(kind);
  };
  const mats = new Map(), discs = new Map(), group = new THREE.Group();
  group.renderOrder = 1; scene.add(group);
  const mat = kind => {
    if (!mats.has(kind)) mats.set(kind, new THREE.MeshBasicMaterial({ map: tex, color: GLOW_COLORS[kind] || '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    return mats.get(kind);
  };
  // items: [{ key, kind, x, z, r, big, node }]; node = world.json node kind for rich deposits. viewScale > 1 = zoomed out.
  function update(items, visible, viewScale = 1) {
    group.visible = visible;
    if (!visible) return;
    const keep = new Set(), t = performance.now() / (cfg.periodMs || 1400);
    for (const it of items) {
      keep.add(it.key);
      let m = discs.get(it.key);
      const rich = it.big && it.node;
      if (!m) { m = new THREE.Mesh(geo, rich ? washMat(it.node) : mat(it.kind)); m.renderOrder = 1; group.add(m); discs.set(it.key, m); }
      const size = it.r * 2 * (rich ? rc.scale ?? 2.6 : it.big ? cfg.bigScale || 1.4 : 1);
      m.position.set(it.x, cfg.height ?? 0.12, it.z); m.scale.set(size, 1, size);
      if (rich) {
        let b = badges.get(it.key);
        if (!b) { b = new THREE.Sprite(badgeMat(it.node)); b.renderOrder = 5; group.add(b); badges.set(it.key, b); }
        const px = rc.iconSize ?? 0.045; b.scale.set(px, px, 1); b.position.set(it.x, rc.iconHeight ?? 6, it.z);
      }
    }
    for (const [k, m] of discs) if (!keep.has(k)) { group.remove(m); discs.delete(k); }
    for (const [k, b] of badges) if (!keep.has(k)) { group.remove(b); badges.delete(k); }
    const from = rc.iconFrom ?? 1.05, full = rc.iconFull ?? 1.6, fade = Math.max(0, Math.min(1, (viewScale - from) / Math.max(0.01, full - from)));
    for (const m of badgeMats.values()) { m.opacity = fade; m.visible = fade > 0.01; }
    const pulse = (cfg.opacity ?? 0.55) * (1 - (cfg.pulse ?? 0.35) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2)));
    for (const m of mats.values()) m.opacity = pulse;
  }
  return { update };
}
