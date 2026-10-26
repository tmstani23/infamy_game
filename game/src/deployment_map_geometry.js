// Public navigation geometry only. Visual hexes never change sim sectors or paths.
export const SECTOR_COLORS = ['#dfb365', '#54c8b9', '#ae88e4', '#dd7e70'];

export function sectorOutlines({ bounds, cell, w, h, cells }, sectors) {
  const at = (i, j) => i >= 0 && j >= 0 && i < w && j < h ? cells[j * w + i] : -1;
  return sectors.map((s, label) => {
    const edges = [], outgoing = new Map();
    const add = (x, z, x1, z1, dir) => {
      const e = { x, z, x1, z1, dir, used: false }, key = `${x},${z}`;
      edges.push(e);
      if (!outgoing.has(key)) outgoing.set(key, []);
      outgoing.get(key).push(e);
    };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (at(i, j) === label) {
      if (at(i, j - 1) !== label) add(i, j, i + 1, j, 0);
      if (at(i + 1, j) !== label) add(i + 1, j, i + 1, j + 1, 1);
      if (at(i, j + 1) !== label) add(i + 1, j + 1, i, j + 1, 2);
      if (at(i - 1, j) !== label) add(i, j + 1, i, j, 3);
    }
    const loops = [], rank = [1, 0, 3, 2];
    for (const first of edges) {
      if (first.used) continue;
      const points = []; let edge = first;
      while (edge && !edge.used) {
        edge.used = true; points.push([edge.x, edge.z]);
        const next = (outgoing.get(`${edge.x1},${edge.z1}`) || []).filter(e => !e.used);
        next.sort((a, b) => rank[(a.dir - edge.dir + 4) % 4] - rank[(b.dir - edge.dir + 4) % 4]);
        edge = next[0];
      }
      if (points.length < 4) continue;
      const area = points.reduce((n, p, i) => {
        const q = points[(i + 1) % points.length]; return n + p[0] * q[1] - q[0] * p[1];
      }, 0);
      // Clockwise exterior loops; omit interior building holes from bold borders.
      if (area <= 0) continue;
      loops.push(points.filter((p, i) => {
        const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
        return (a[0] !== p[0] || p[0] !== b[0]) && (a[1] !== p[1] || p[1] !== b[1]);
      }).map(([x, z]) => [bounds.minX + x * cell, bounds.minZ + z * cell]));
    }
    return { ...s, color: SECTOR_COLORS[label % SECTOR_COLORS.length], loops };
  });
}

export function hexCells(bounds, sectorAt, radius = 4) {
  const result = [], step = Math.sqrt(3) * radius;
  for (let col = 0, x = bounds.minX; x <= bounds.maxX + radius; col++, x += radius * 1.5)
    for (let z = bounds.minZ - (col % 2 ? 0 : step / 2); z <= bounds.maxZ + radius; z += step) {
      const sector = sectorAt(x, z);
      result.push({ x, z, sector, points: Array.from({ length: 6 }, (_, i) =>
        [x + radius * Math.cos(i * Math.PI / 3), z + radius * Math.sin(i * Math.PI / 3)]) });
    }
  return result;
}
