// Video settings (Tim 2026-11-07): picture size, glow, screen shake, frame cap and the FPS readout,
// kept in this browser (localStorage 'infamy.video.v1') and applied live (render/view.js, main.js, fps.js).
// resolution: '1080' / '900' / '720' draw about that many pixels whatever the window shape; 'sharp' draws
// every screen pixel (up to 2 per page pixel). ?dpr=N in the URL still overrides it.
export const RESOLUTIONS = [['1080', '1920 × 1080'], ['900', '1600 × 900'], ['720', '1280 × 720'], ['sharp', 'Sharp (full screen detail)']];
export const RESOLUTION_PIXELS = { 1080: 1920 * 1080, 900: 1600 * 900, 720: 1280 * 720 };
export const FPS_CAPS = [[0, 'Off'], [60, '60'], [30, '30']];
// sprites (Tim 2026-11-15): GPU-compressed sprite pages (tools/make_ktx2_pages.mjs); read when the game starts
export const SPRITE_MODES = [['far', 'Far zoom only'], ['all', 'Everywhere'], ['off', 'Off']];
export const VIDEO_DEFAULTS = { resolution: '1080', glow: true, shake: true, weather: true, wildlife: true, fpsCap: 0, showFps: false, sprites: 'far' };
export function normalizeVideoSettings(v = {}) {
  return {
    resolution: RESOLUTIONS.some(([k]) => k === v.resolution) ? v.resolution : VIDEO_DEFAULTS.resolution,
    glow: v.glow !== false, shake: v.shake !== false, weather: v.weather !== false, wildlife: v.wildlife !== false,
    fpsCap: FPS_CAPS.some(([k]) => k === v.fpsCap) ? v.fpsCap : 0,
    showFps: v.showFps === true,
    sprites: SPRITE_MODES.some(([k]) => k === v.sprites) ? v.sprites : VIDEO_DEFAULTS.sprites,
  };
}
// pixels drawn per page pixel for a window of w x h page pixels
export function pixelRatioFor(v, w, h, deviceRatio = 1) {
  const sharp = Math.max(1, Math.min(deviceRatio, 2)), px = RESOLUTION_PIXELS[v.resolution];
  return px ? Math.max(0.5, Math.min(sharp, Math.sqrt(px / Math.max(1, w * h)))) : sharp;
}
export function createVideoSettings(storage = globalThis.localStorage) {
  let s;
  try { s = normalizeVideoSettings(JSON.parse(storage?.getItem('infamy.video.v1') || '{}') || {}); } catch { s = { ...VIDEO_DEFAULTS }; }
  const subs = new Set();
  return {
    get: () => ({ ...s }),
    set(patch) {
      s = normalizeVideoSettings({ ...s, ...patch });
      try { storage?.setItem('infamy.video.v1', JSON.stringify(s)); } catch {}
      for (const f of subs) f({ ...s });
    },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
}
