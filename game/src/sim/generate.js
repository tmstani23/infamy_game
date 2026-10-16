// Room generator: building type + seed -> a 3D room template in the same format as
// data/interiors.json. Plan: docs/room_generator_plan.md. Recipes: data/room_recipes.json.
// Pure code with no graphics, so the server can run it too. The same seed always gives
// the same room.
import { buildRoom3d, propRect, overlap, turned } from './interiors.js';

// Small seeded random numbers (mulberry32)
export function random(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (a, b) => a + Math.floor(next() * (b - a + 1));            // a..b inclusive
  return {
    next, int,
    range: r => Array.isArray(r) ? int(r[0], r[1]) : r,                 // [a, b] or a number
    pick: list => list[Math.floor(next() * list.length)],
    shuffle: list => { const l = [...list]; for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; },
  };
}

const hash = (...parts) => {
  let h = 2166136261;
  for (const c of parts.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const evenIn = (rng, a, b) => 2 * rng.int(Math.ceil(a / 2), Math.floor(b / 2));
const TRIES = 30;          // spots tried per prop before it is skipped
const ATTEMPTS = 25;       // whole layouts tried per seed before giving up
const NEEDS_ACCESS = new Set(['tea_table', 'gambling_mat', 'counter']);   // plus anything marked loot

// Generates one room. Returns { template, room, problems, attempt }; problems is empty
// when the room passed every check.
export function generateRoom(type, seed, recipes, parts) {
  const recipe = recipes[type];
  if (!recipe) throw new Error(`no recipe for "${type}"`);
  let last;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rng = random(hash(type, seed, attempt));
    const { template, missing } = layout(recipe, parts, rng);
    template.generated = { type, seed };
    const room = buildRoom3d(type, template, parts, 0, 0, { quiet: true });
    const problems = [...missing, ...room.problems, ...walkway(room, parts)];
    last = { template, room, problems, attempt };
    if (!problems.length) return last;
  }
  return last;
}

// ---------- steps 1 to 5: size, walls, door, back room, props ----------
function layout(recipe, parts, rng) {
  const W = parts.wall;
  const X = evenIn(rng, recipe.size.min[0], recipe.size.max[0]);
  const Z = evenIn(rng, recipe.size.min[1], recipe.size.max[1]);
  const fill = recipe.walls.fill;
  const missing = [];

  // back room: a strip along the near (south) end behind a low inner wall
  const back = recipe.back_room;
  const depth = back ? rng.range(back.depth) : 0;
  const at = Z - depth;

  // far walls: bays from the recipe's mix, then windows, then the door
  const bays = { north: X / W.bay, west: Z / W.bay };
  const walls = {
    north: Array.from({ length: bays.north }, () => rng.pick(fill)),
    west: Array.from({ length: bays.west }, (_, i) => back && i * W.bay >= at ? (back.fill || rng.pick(fill)) : rng.pick(fill)),
  };
  // door: a north bay away from the corners, or a west bay in the main room
  const doorChoices = [];
  for (let i = 1; i < bays.north - 1; i++) doorChoices.push({ side: 'north', bay: i });
  for (let i = 1; (i + 1) * W.bay <= at - 2; i++) doorChoices.push({ side: 'west', bay: i });
  const door = rng.next() < 0.75 ? rng.pick(doorChoices.filter(d => d.side === 'north')) : rng.pick(doorChoices);
  walls[door.side][door.bay] = rng.pick(recipe.door);
  for (const side of ['north', 'west']) {
    const n = rng.range(recipe.walls.windows || 0);
    const free = rng.shuffle(walls[side].map((_, i) => i)
      .filter(i => !(side === door.side && Math.abs(i - door.bay) <= 0) && !(side === 'west' && back && (i + 1) * W.bay > at)));
    for (const i of free.slice(0, n)) walls[side][i] = 'window';
  }
  walls.near = fill[0];

  const template = { build: '3d', size: [X, Z], floor: recipe.floor, walls, door, props: [] };

  // keep-clear areas: in front of the door and both sides of the inner doorway
  const along = (door.bay + 0.5) * W.bay;
  const keep = [door.side === 'north' ? { x0: along - 1, x1: along + 1, z0: 0, z1: 2.5 } : { x0: 0, x1: 2.5, z0: along - 1, z1: along + 1 }];
  const zones = { main: { x0: 0, z0: 0, x1: X, z1: back ? at - 0.5 : Z } };
  if (back) {
    const d = rng.int(0, X / W.bay - 1);
    template.inner = [{ along: 'x', at, door: d, fill: back.fill || fill[0] }];
    template.zones = [{ name: 'main', rect: [0, 0, X, at] }, { name: 'back_room', rect: [0, at, X, Z] }];
    keep.push({ x0: d * W.bay, x1: (d + 1) * W.bay, z0: at - 1, z1: at + 1 });
    zones.back_room = { x0: 0, z0: at + 0.5, x1: X, z1: Z };
  }

  // bays a wall prop must not cover: windows and the door
  const openBay = (side, i) => (side === door.side && i === door.bay) || walls[side][i] === 'window';

  const placed = [];           // standing props: { type, def, rect }
  const fits = (r, zone) => r.x0 >= zone.x0 && r.z0 >= zone.z0 && r.x1 <= zone.x1 && r.z1 <= zone.z1
    && !placed.some(q => overlap(r, q.rect)) && !keep.some(k => overlap(r, k));

  const place = (item, zoneName) => {
    const def = parts.props[item.type];
    if (!def) { missing.push(`recipe names unknown prop "${item.type}"`); return null; }
    const zone = zones[zoneName];
    for (let t = 0; t < TRIES; t++) {
      let p;
      if (def.rule === 'wall') {
        // against a far wall, inside this zone, not over a window or the door
        const side = rng.pick(['north', 'west'].filter(s => s === 'west' || zone.z0 === 0));
        const [len] = def.size;
        const lo = side === 'north' ? zone.x0 : zone.z0, hi = (side === 'north' ? zone.x1 : zone.z1) - len;
        if (hi < lo) continue;
        p = { type: item.type, wall: side, at: lo + 0.5 * rng.int(0, Math.floor((hi - lo) * 2)) };
        const r = propRect(p, def, [X, Z]);
        const a = side === 'north' ? r.x0 : r.z0, b = side === 'north' ? r.x1 : r.z1;
        let blocked = false;
        for (let i = Math.floor(a / W.bay); i * W.bay < b; i++) if (openBay(side, i)) blocked = true;
        if (blocked || !fits(r, zone)) continue;
        placed.push({ type: item.type, def, rect: r });
        template.props.push(p);
        return r;
      }
      if (item.place === 'corners') {
        const c = rng.pick([[zone.x0, zone.z0], [zone.x1 - 1, zone.z0], [zone.x0, zone.z1 - 1], [zone.x1 - 1, zone.z1 - 1]]);
        p = { type: item.type, at: c };
      } else {
        const rot = def.size[0] === def.size[1] ? 0 : rng.pick([0, 90]);
        const [ex, ez] = turned(def.size, rot);
        // keep a cell from the walls so there is room to walk round
        const x = 1 + 0.5 * rng.int(0, Math.max(0, Math.floor((zone.x1 - zone.x0 - ex - 2) * 2)));
        const z = 1 + 0.5 * rng.int(0, Math.max(0, Math.floor((zone.z1 - zone.z0 - ez - 2) * 2)));
        p = { type: item.type, at: [zone.x0 + x, zone.z0 + z], ...(rot ? { rot } : {}) };
      }
      const r = propRect(p, def, [X, Z]);
      if (!fits(r, zone)) continue;
      placed.push({ type: item.type, def, rect: r });
      template.props.push(p);
      if (item.top) template.props.push({ type: item.top, at: [(r.x0 + r.x1) / 2 - 0.5, (r.z0 + r.z1) / 2 - 0.5] });
      return r;
    }
    return null;
  };

  // hanging lanterns: one over each listed piece of furniture, then near a wall
  const hangs = [];
  const hang = (item, zoneName) => {
    const zone = zones[zoneName];
    const over = rng.shuffle(placed.filter(q => (item.over || []).includes(q.type) && !hangs.includes(q)));
    if (over.length) {
      const q = over[0], r = q.rect;
      hangs.push(q);
      template.props.push({ type: item.type, at: [(r.x0 + r.x1) / 2 - 0.5, (r.z0 + r.z1) / 2 - 0.5] });
      return true;
    }
    for (let t = 0; t < TRIES; t++) {
      // next to a far wall (or the inner wall), clear of everything standing
      const onNorth = zone.z0 === 0 && rng.next() < 0.5;
      const p = onNorth ? [zone.x0 + 0.5 * rng.int(2, (zone.x1 - zone.x0 - 2) * 2), zone.z0 + 0.2]
        : [zone.x0 + 0.2, zone.z0 + 0.5 * rng.int(2, Math.max(2, (zone.z1 - zone.z0 - 2) * 2))];
      const r = { x0: p[0], z0: p[1], x1: p[0] + 1, z1: p[1] + 1 };
      if (!fits(r, zone)) continue;
      placed.push({ type: item.type, def: parts.props[item.type], rect: r });
      template.props.push({ type: item.type, at: p });
      return true;
    }
    return false;
  };

  // order: wall pieces, then furniture biggest first, then corner lamps, then lanterns
  const order = item => {
    const def = parts.props[item.type] || { size: [1, 1] };
    if (def.rule === 'wall') return 0;
    if (def.rule === 'ceiling') return 3;
    if (item.place === 'corners') return 2;
    return 1 - def.size[0] * def.size[1] / 100;
  };
  const jobs = [];
  for (const [zoneName, items] of [['back_room', back?.props || []], ['main', recipe.props]])
    for (const item of items) jobs.push({ item, zoneName, n: rng.range(item.count ?? 1), min: Array.isArray(item.count) ? item.count[0] : item.count ?? 1 });
  jobs.sort((a, b) => order(a.item) - order(b.item));
  for (const j of jobs) {
    let n = 0;
    for (let i = 0; i < j.n; i++) {
      const ok = parts.props[j.item.type]?.rule === 'ceiling' ? hang(j.item, j.zoneName) : place(j.item, j.zoneName);
      if (ok) n++;
    }
    if (n < j.min) missing.push(`could not fit ${j.min - n} ${j.item.type} in the ${j.zoneName.replace('_', ' ')}`);
  }
  return { template, missing };
}

// ---------- step 6: walkway check ----------
// Flood-fills the floor on a quarter-cell grid from where you come in. Spots closer than a
// body's radius to anything solid are blocked, so a gap has to be about a cell wide to pass.
export function walkway(room, parts, { radius = 0.35, step = 0.25 } = {}) {
  const [X, Z] = room.size, ox = room.origin.x, oz = room.origin.z;
  const nx = Math.round(X / step), nz = Math.round(Z / step);
  const blocks = room.blockers.map(b => ({ x0: b.minX - ox, x1: b.maxX - ox, z0: b.minZ - oz, z1: b.maxZ - oz }));
  const dist = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
  const free = new Uint8Array(nx * nz), seen = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = (i + 0.5) * step, z = (k + 0.5) * step;
    free[i * nz + k] = blocks.every(b => dist(b, x, z) >= radius) ? 1 : 0;
  }
  const start = [Math.floor((room.spawn.x - ox) / step), Math.floor((room.spawn.z - oz) / step)];
  const problems = [];
  if (!free[start[0] * nz + start[1]]) return ['the way in is blocked'];
  const queue = [start];
  seen[start[0] * nz + start[1]] = 1;
  while (queue.length) {
    const [i, k] = queue.pop();
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = k + dk;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const c = a * nz + b;
      if (free[c] && !seen[c]) { seen[c] = 1; queue.push([a, b]); }
    }
  }
  // can someone get within reach of r?
  const reach = r => {
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      if (!seen[i * nz + k]) continue;
      const x = (i + 0.5) * step, z = (k + 0.5) * step;
      if (dist(r, x, z) <= radius + 0.3) return true;
    }
    return false;
  };
  for (const p of room.props) {
    if (!p.stands || !(NEEDS_ACCESS.has(p.type) || p.def.loot)) continue;
    if (!reach(p.rect)) problems.push(`can't reach the ${p.type}`);
  }
  for (const z of room.zones) {
    const r = { x0: z.rect[0], z0: z.rect[1], x1: z.rect[2], z1: z.rect[3] };
    let any = false;
    for (let i = Math.ceil(r.x0 / step); i < r.x1 / step && !any; i++) for (let k = Math.ceil(r.z0 / step); k < r.z1 / step; k++) if (seen[i * nz + k]) { any = true; break; }
    if (!any) problems.push(`can't get into the ${z.name.replace('_', ' ')}`);
  }
  let open = 0, got = 0;
  for (let c = 0; c < free.length; c++) { open += free[c]; got += seen[c]; }
  if (got < open * 0.9) problems.push(`${Math.round(100 - 100 * got / open)}% of the floor is walled off`);
  return problems;
}
