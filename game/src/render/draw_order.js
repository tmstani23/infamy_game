// Draw order of everything drawn as a flat sprite (buildings, props, banners, units).
// No three.js here, so Node tests can check it (game/tools/test_draw_sort.mjs).

// Should A be drawn before (behind) B? The camera looks from +x, +z.
export function behind(A, B) {
  const a = A.foot, b = B.foot, e = 0.01;
  const xs = a.maxX <= b.minX + e ? -1 : b.maxX <= a.minX + e ? 1 : 0;
  const zs = a.maxZ <= b.minZ + e ? -1 : b.maxZ <= a.minZ + e ? 1 : 0;
  if (xs && zs && xs !== zs) return A.depth < B.depth;
  if (xs) return xs < 0;
  if (zs) return zs < 0;
  return A.depth < B.depth;
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const setOrder = (t, order) => {
  t.mesh.renderOrder = 10 + order * 4;
  t.extras.forEach((m, i) => { m.renderOrder = 11 + order * 4 + i % 3; });
};

// Topological sort of everything that overlaps on screen; ties go back to front
export function sortThings(things) {
  const n = things.length;
  const after = Array.from({ length: n }, () => []);
  const pending = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!overlaps(things[i].screen, things[j].screen)) continue;
    if (behind(things[i], things[j])) { after[i].push(j); pending[j]++; } else { after[j].push(i); pending[i]++; }
  }
  const done = new Array(n).fill(false);
  for (let order = 0; order < n; order++) {
    let best = -1;
    for (let i = 0; i < n; i++) if (!done[i] && pending[i] === 0 && (best < 0 || things[i].depth < things[best].depth)) best = i;
    if (best < 0) for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || things[i].depth < things[best].depth)) best = i; // cycle: break it
    done[best] = true;
    for (const j of after[best]) pending[j]--;
    setOrder(things[best], order);
  }
}

// The same order as sortThings(statics.concat(movers)), made cheaper for every frame (Tim 2026-10-26).
// Buildings, props and banners never move, so the overlaps among them are worked out once (and again
// only when that list or one of their screen boxes changes). Each frame only the movers (units) are
// checked, against the statics near them on screen and against each other, and a heap picks the
// next thing to draw instead of scanning everything.
const BUCKET = 4;   // screen units per cell of the statics lookup grid
const cellKey = (i, j) => (i + 32768) * 65536 + (j + 32768);

export function createSorter() {
  let cached = [], cachedScreens = [], base = null;
  let pending = new Int32Array(0), done = new Uint8Array(0), seen = new Int32Array(0), heap = new Int32Array(0);
  const dynAfter = [], touched = [], all = [];
  let stamp = 0;

  function changed(statics) {
    if (statics.length !== cached.length) return true;
    for (let i = 0; i < statics.length; i++) if (statics[i] !== cached[i] || statics[i].screen !== cachedScreens[i]) return true;
    return false;
  }

  function build(statics) {
    const n = statics.length, after = Array.from({ length: n }, () => []), pend = new Int32Array(n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (!overlaps(statics[i].screen, statics[j].screen)) continue;
      if (behind(statics[i], statics[j])) { after[i].push(j); pend[j]++; } else { after[j].push(i); pend[i]++; }
    }
    const cells = new Map();
    for (let k = 0; k < n; k++) {
      const s = statics[k].screen;
      for (let i = Math.floor(s.x0 / BUCKET); i <= Math.floor(s.x1 / BUCKET); i++)
        for (let j = Math.floor(s.y0 / BUCKET); j <= Math.floor(s.y1 / BUCKET); j++) {
          const key = cellKey(i, j);
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(k);
        }
    }
    cached = statics.slice(); cachedScreens = statics.map(t => t.screen);
    seen = new Int32Array(n); stamp = 0;
    return { after, pending: pend, cells };
  }

  function link(i, j) {   // i < j, both overlapping on screen
    let a = i, b = j;
    if (!behind(all[i], all[j])) { a = j; b = i; }
    if (!dynAfter[a]) dynAfter[a] = [];
    if (!dynAfter[a].length) touched.push(a);
    dynAfter[a].push(b);
    pending[b]++;
  }

  // min-heap of indices by (depth, index): the same pick as sortThings' scan
  let size = 0;
  const less = (a, b) => all[a].depth < all[b].depth || (all[a].depth === all[b].depth && a < b);
  function push(x) {
    let i = size++;
    while (i > 0) { const p = (i - 1) >> 1; if (!less(x, heap[p])) break; heap[i] = heap[p]; i = p; }
    heap[i] = x;
  }
  function pop() {
    const top = heap[0], x = heap[--size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && less(heap[c + 1], heap[c])) c++;
      if (!less(heap[c], x)) break;
      heap[i] = heap[c]; i = c;
    }
    if (size) heap[i] = x;
    return top;
  }

  const release = j => { if (--pending[j] === 0 && !done[j]) push(j); };

  function sort(statics, movers) {
    if (!base || changed(statics)) base = build(statics);
    const ns = statics.length, n = ns + movers.length;
    all.length = 0;
    for (const t of statics) all.push(t);
    for (const t of movers) all.push(t);
    if (pending.length < n) { pending = new Int32Array(n * 2); done = new Uint8Array(n * 2); heap = new Int32Array(n * 2); }
    pending.set(base.pending); pending.fill(0, ns, n); done.fill(0, 0, n);
    for (const a of touched) dynAfter[a].length = 0;
    touched.length = 0;

    for (let m = ns; m < n; m++) {
      const s = all[m].screen;
      stamp++;
      for (let i = Math.floor(s.x0 / BUCKET); i <= Math.floor(s.x1 / BUCKET); i++)
        for (let j = Math.floor(s.y0 / BUCKET); j <= Math.floor(s.y1 / BUCKET); j++) {
          const list = base.cells.get(cellKey(i, j));
          if (list) for (const k of list) {
            if (seen[k] === stamp) continue;
            seen[k] = stamp;
            if (overlaps(all[k].screen, s)) link(k, m);
          }
        }
      for (let m2 = m + 1; m2 < n; m2++) if (overlaps(s, all[m2].screen)) link(m, m2);
    }

    size = 0;
    for (let i = 0; i < n; i++) if (pending[i] === 0) push(i);
    for (let order = 0; order < n; order++) {
      let best = -1;
      while (size) { const x = pop(); if (!done[x]) { best = x; break; } }
      if (best < 0) for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || all[i].depth < all[best].depth)) best = i; // cycle: break it
      done[best] = 1;
      if (best < ns) for (const j of base.after[best]) release(j);
      if (dynAfter[best]) for (const j of dynAfter[best]) release(j);
      setOrder(all[best], order);
    }
  }

  return { sort };
}
