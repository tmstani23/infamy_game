// Which size of the packed character pages to use (2026-11-15).
// Full pages:  ../assets/sprites_packed/catalog_v1/<name>.png
// Half pages:  ../assets/sprites_packed/catalog_v1_half/<name>_half.png  (tools/make_half_pages.mjs; a quarter of the memory)
// Far out, a sprite is drawn at half its page size or less, so the half page shows the same picture; up close the full
// page is loaded back. A half page that is missing falls back to its full page. Portrait pages have no half set.

// the half page of a full catalog page, or null when that page has none
export const halfUrl = url => /\/catalog_v1\/[^/?#]+\.png$/.test(url) ? url.replace(/\/catalog_v1\/([^/?#]+)\.png$/, '/catalog_v1_half/$1_half.png') : null;

// the GPU-compressed copy of a catalog page at a level (tools/make_ktx2_pages.mjs), or null when that page has none
export function ktxUrl(url, level) {
  const m = /^(.*)\/catalog_v1\/([^/?#]+)\.png$/.exec(url);
  if (!m) return null;
  return level === 'half' ? `${m[1]}/catalog_v1_half_ktx2/${m[2]}_half.ktx2` : `${m[1]}/catalog_v1_ktx2/${m[2]}.ktx2`;
}
// which levels use the compressed copy for a Video settings 'sprites' mode
export const compressedAt = (mode, level) => mode === 'all' || (mode === 'far' && level === 'half');

// screen pixels per sprite texel -> 'half' or 'full'. Below `down` the half page is as sharp as the full one on screen;
// it goes back to full only above `up`, so a zoom resting near the line does not flip back and forth.
export const DETAIL = { down: 0.55, up: 0.68, settleSeconds: 2 };
export function detailFor(ratio, current, D = DETAIL) {
  if (!(ratio > 0)) return current || 'full';
  if (current === 'half') return ratio > D.up ? 'full' : 'half';
  return ratio < D.down ? 'half' : 'full';
}

// Steady level from a per-frame ratio: sharper at once (zooming in must not look soft), smaller only after the
// zoom has rested there for settleSeconds (a quick zoom out and back loads nothing).
export function createDetailPicker(D = DETAIL) {
  let level = 'full', since = null;
  return {
    level: () => level,
    update(ratio, now) {
      const want = detailFor(ratio, level, D);
      if (want === level) { since = null; return level; }
      if (want === 'full') { level = 'full'; since = null; return level; }
      if (since == null) since = now;
      if (now - since >= D.settleSeconds) { level = want; since = null; }
      return level;
    },
  };
}
