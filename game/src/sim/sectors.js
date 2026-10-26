// Connected deployment areas follow the existing public street navigation.
// Hexes will visualize these areas later; they do not replace navigation cells.
export function createSectors(district, nav) {
  const bounds = district.bounds, cell = .5;
  const w = Math.ceil((bounds.maxX - bounds.minX) / cell), h = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const cells = new Int8Array(w * h).fill(-1), walkable = new Uint8Array(w * h);
  const centre = k => [bounds.minX + (k % w + .5) * cell, bounds.minZ + (Math.floor(k / w) + .5) * cell];
  const index = (x, z) => {
    const i = Math.floor((x - bounds.minX) / cell), j = Math.floor((z - bounds.minZ) / cell);
    return i >= 0 && i < w && j >= 0 && j < h ? j * w + i : -1;
  };
  const village = district.buildings.find(b => b.hideout === 'ninja')?.territory;
  const inVillage = (x, z) => !!village && Math.hypot(x - village[0], z - village[1]) <= village[2];
  const fallback = [
    ['nw', 'Northwest', .25, .75], ['ne', 'Northeast', .75, .75],
    ['sw', 'Southwest', .25, .25], ['se', 'Southeast', .75, .25],
  ].map(([id, name, x, z]) => ({ id, name, x: bounds.minX + x * (bounds.maxX - bounds.minX), z: bounds.minZ + z * (bounds.maxZ - bounds.minZ) }));
  const definitions = district.quarters?.length === 4 ? district.quarters.map(q => ({
    id: q.id, name: q.name, x: (q.box[0] + q.box[2]) / 2, z: (q.box[1] + q.box[3]) / 2,
  })) : fallback;
  for (let k = 0; k < cells.length; k++) {
    const [x, z] = centre(k);
    if (!inVillage(x, z) && nav.free(x, z)) walkable[k] = 1;
  }
  const queue = new Int32Array(cells.length), sectors = [];
  let head = 0, tail = 0;
  for (const [id, s] of definitions.entries()) {
    let best = -1, distance = Infinity;
    for (let k = 0; k < cells.length; k++) if (walkable[k] && cells[k] === -1) {
      const [x, z] = centre(k), d = (x - s.x) ** 2 + (z - s.z) ** 2;
      if (d < distance) { best = k; distance = d; }
    }
    if (best === -1) throw new Error(`No walkable deployment anchor for ${s.name}`);
    const [x, z] = centre(best);
    sectors.push({ id: s.id, name: s.name, anchor: { x, z } });
    cells[best] = id; queue[tail++] = best;
  }
  // Every cell grows from its sector anchor through cardinal walkable neighbors,
  // keeping each area connected around buildings, water and narrow bridges.
  while (head < tail) {
    const k = queue[head++], x = k % w, z = Math.floor(k / w);
    const neighbors = [x > 0 ? k - 1 : -1, x + 1 < w ? k + 1 : -1, z > 0 ? k - w : -1, z + 1 < h ? k + w : -1];
    for (const next of neighbors) if (next >= 0 && walkable[next] && cells[next] === -1) {
      cells[next] = cells[k]; queue[tail++] = next;
    }
  }
  function at(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || index(x, z) < 0) return null;
    if (inVillage(x, z)) return 'village';
    let k = index(x, z);
    if (!nav.free(x, z)) {
      const p = nav.nearestFree(x, z);
      if (!p) return null;
      k = index(...p);
    }
    return k >= 0 && cells[k] >= 0 ? sectors[cells[k]].id : null;
  }
  return { sectors, at, village: village ? { x: village[0], z: village[1], radius: village[2] } : null,
    cellGrid: () => ({ bounds, cell, w, h, cells }) };
}
