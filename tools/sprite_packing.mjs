// Offline, lossless frame bounds and atlas layout. No browser or game dependency.
import assert from 'node:assert/strict';

export function mipBytes(width, height, mipmaps = true) {
  let bytes = 0;
  do {
    bytes += width * height * 4;
    if (!mipmaps || (width === 1 && height === 1)) return bytes;
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  } while (true);
}

// Alpha > 0, not a visibility threshold: even faint weapon halos are preserved.
export function frameBounds(rgba, width, height, directions = 8) {
  const cell = height / directions, frames = width / cell;
  assert.ok(Number.isInteger(cell) && Number.isInteger(frames) && cell > 0 && frames > 0);
  assert.equal(rgba.length, width * height * 4);
  const bounds = [];
  for (let dir = 0; dir < directions; dir++) for (let frame = 0; frame < frames; frame++) {
    let x0 = cell, y0 = cell, x1 = -1, y1 = -1;
    for (let y = 0; y < cell; y++) {
      let i = ((dir * cell + y) * width + frame * cell) * 4 + 3;
      for (let x = 0; x < cell; x++, i += 4) if (rgba[i] > 0) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y);
        x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    bounds.push({dir, frame, x: x1 < 0 ? 0 : x0, y: y1 < 0 ? 0 : y0,
      w: x1 < 0 ? 0 : x1 - x0 + 1, h: y1 < 0 ? 0 : y1 - y0 + 1});
  }
  return {cell, frames, directions, bounds};
}

const powerOfTwo = n => 2 ** Math.ceil(Math.log2(Math.max(1, n)));
const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const contains = (a, b) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;

// Deterministic MaxRects, best short side, no rotation. Candidate page widths
// are compared using actual POT allocations, not only occupied rectangle area.
function layoutAtWidth(rectangles, width, maxSize, margin) {
  const pages = [], placements = Array(rectangles.length).fill(null);
  const ordered = rectangles.map((r, index) => ({...r, index, w: r.w + 2 * margin, h: r.h + 2 * margin}))
    .filter(r => rectangles[r.index].w && rectangles[r.index].h)
    .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || a.index - b.index);
  for (const rect of ordered) {
    if (rect.w > width || rect.h > maxSize) return null;
    let best = null;
    for (let page = 0; page < pages.length; page++) for (const free of pages[page].free) {
      if (rect.w > free.w || rect.h > free.h) continue;
      const short = Math.min(free.w - rect.w, free.h - rect.h), long = Math.max(free.w - rect.w, free.h - rect.h);
      if (!best || short < best.short || (short === best.short && long < best.long)) best = {page, x: free.x, y: free.y, short, long};
    }
    if (!best) {
      best = {page: pages.length, x: 0, y: 0};
      pages.push({free: [{x: 0, y: 0, w: width, h: maxSize}], usedW: 0, usedH: 0});
    }
    const page = pages[best.page], placed = {x: best.x, y: best.y, w: rect.w, h: rect.h};
    const split = [];
    for (const free of page.free) {
      if (!intersects(free, placed)) { split.push(free); continue; }
      if (placed.x > free.x) split.push({...free, w: placed.x - free.x});
      if (placed.x + placed.w < free.x + free.w) split.push({...free, x: placed.x + placed.w, w: free.x + free.w - placed.x - placed.w});
      if (placed.y > free.y) split.push({...free, h: placed.y - free.y});
      if (placed.y + placed.h < free.y + free.h) split.push({...free, y: placed.y + placed.h, h: free.y + free.h - placed.y - placed.h});
    }
    page.free = split.filter((r, i) => !split.some((s, j) => j !== i && contains(s, r) && (!contains(r, s) || j < i)));
    page.usedW = Math.max(page.usedW, placed.x + placed.w);
    page.usedH = Math.max(page.usedH, placed.y + placed.h);
    placements[rect.index] = {page: best.page, x: placed.x + margin, y: placed.y + margin};
  }
  // Empty frames share a transparent pixel by metadata; retain a tiny page if
  // the entire animation is empty, instead of pretending it costs no texture.
  if (!pages.length) pages.push({usedW: 1, usedH: 1});
  return {pages: pages.map(p => ({width: powerOfTwo(p.usedW), height: powerOfTwo(p.usedH)})), placements};
}

export function packFrames(bounds, {margin = 8, maxSize = 2048} = {}) {
  assert.ok(Number.isInteger(margin) && margin >= 0);
  assert.ok(Number.isInteger(maxSize) && maxSize > 0 && powerOfTwo(maxSize) === maxSize);
  let best;
  for (let width = 64; width <= maxSize; width *= 2) {
    const candidate = layoutAtWidth(bounds, width, maxSize, margin);
    if (!candidate) continue;
    const bytes = candidate.pages.reduce((sum, p) => sum + mipBytes(p.width, p.height), 0);
    if (!best || bytes < best.bytes || (bytes === best.bytes && candidate.pages.length < best.pages.length)) best = {...candidate, bytes};
  }
  assert.ok(best, 'Frame exceeds atlas page limit including padding');
  return {margin, maxSize, ...best};
}

export function validateLayout(bounds, layout) {
  assert.equal(bounds.length, layout.placements.length);
  for (let i = 0; i < bounds.length; i++) {
    const r = bounds[i], p = layout.placements[i];
    if (!r.w || !r.h) { assert.equal(p, null); continue; }
    const page = layout.pages[p.page], m = layout.margin;
    assert.ok(p.x >= m && p.y >= m && p.x + r.w + m <= page.width && p.y + r.h + m <= page.height);
    const padded = {x: p.x - m, y: p.y - m, w: r.w + 2*m, h: r.h + 2*m};
    for (let j = 0; j < i; j++) {
      const q = layout.placements[j], s = bounds[j];
      if (q && q.page === p.page) assert.ok(!intersects(padded, {x: q.x - m, y: q.y - m, w: s.w + 2*m, h: s.h + 2*m}), 'Packed frames overlap');
    }
  }
  return true;
}
