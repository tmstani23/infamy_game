// Room generator: building type + seed -> a 3D room template in the same format as
// data/interiors.json. Plan: docs/room_generator_plan.md. Recipes: data/room_recipes.json.
// Pure code with no graphics, so the server can run it too. The same seed always gives
// the same room.
import { buildRoom3d, propRect, overlap, turned } from './interiors.js';
import { createNav, ROOM_NAV } from './nav.js';

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
const NEEDS_ACCESS = new Set(['tea_table', 'manor_reception_table', 'gambling_mat', 'counter', 'futon']);   // plus anything marked loot
// gap rule (Tim 2026-10-18): two solid things either nearly touch (one pile) or leave room for
// the biggest crew body (brute, 0.9 wide) to walk between them on the room walk grid
const GAP = { pile: 0.5, walk: 1.05 };
const ENTRY = [4, 4];      // clear floor inside the door, cells across x deep, so crew coming in aren't boxed in

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
  const door = recipe.door_side ? rng.pick(doorChoices.filter(d => d.side === recipe.door_side))
    : rng.next() < 0.75 ? rng.pick(doorChoices.filter(d => d.side === 'north')) : rng.pick(doorChoices);
  walls[door.side][door.bay] = rng.pick(recipe.door);
  for (const side of ['north', 'west']) {
    const n = rng.range(recipe.walls.windows || 0);
    const free = rng.shuffle(walls[side].map((_, i) => i)
      .filter(i => !(side === door.side && Math.abs(i - door.bay) <= 0) && !(side === 'west' && back && (i + 1) * W.bay > at)));
    for (const i of free.slice(0, n)) walls[side][i] = recipe.walls.window || 'window';
  }
  walls.near = fill[0];

  const template = { build: '3d', size: [X, Z], floor: recipe.floor, walls, door, props: [] };

  // keep-clear areas: in front of the door and both sides of the inner doorway
  const along = (door.bay + 0.5) * W.bay;
  const keep = [door.side === 'north' ? { x0: along - 1, x1: along + 1, z0: 0, z1: 2.5 } : { x0: 0, x1: 2.5, z0: along - 1, z1: along + 1 }];
  const [entryWidth, entryDepth] = ENTRY;
  const entryClear = door.side === 'north'
    ? { x0: along - entryWidth / 2, x1: along + entryWidth / 2, z0: 0, z1: entryDepth }
    : { x0: 0, x1: entryDepth, z0: along - entryWidth / 2, z1: along + entryWidth / 2 };
  const zones = { main: { x0: 0, z0: 0, x1: X, z1: back ? at - 0.5 : Z } };
  const areaOf = (item, zoneName) => {
    const zone = zones[zoneName], bounds = recipe.areas?.[item.area];
    if (!bounds) return zone;
    const width = zone.x1 - zone.x0, depth = zone.z1 - zone.z0;
    return { x0: zone.x0 + bounds[0] * width, z0: zone.z0 + bounds[1] * depth,
      x1: zone.x0 + bounds[2] * width, z1: zone.z0 + bounds[3] * depth };
  };
  const clearings = [];        // { rect, walls }: kept clear after the layout (see "the way in" below)
  if (back) {
    const d = rng.int(0, X / W.bay - 1);
    template.inner = [{ along: 'x', at, door: d, fill: back.fill || fill[0] }];
    template.zones = [{ name: 'main', rect: [0, 0, X, at] }, { name: 'back_room', rect: [0, at, X, Z] }];
    keep.push({ x0: d * W.bay, x1: (d + 1) * W.bay, z0: at - 1, z1: at + 1 });
    // and room to walk up to it from both sides, wall pieces included
    clearings.push({ rect: { x0: d * W.bay - 0.5, x1: (d + 1) * W.bay + 0.5, z0: at - 2, z1: at + 2 }, walls: true });
    zones.back_room = { x0: 0, z0: at + 0.5, x1: X, z1: Z };
  }

  // bays a wall prop must not cover: windows and the door
  const openBay = (side, i) => (side === door.side && i === door.bay) || !!parts.bays[walls[side][i]]?.window;

  const placed = [];           // standing props: { type, def, rect }
  // the walls as rects, for the gap rule (the inner wall leaves its doorway open)
  const wallRects = [{ x0: -1, x1: X + 1, z0: -1, z1: 0 }, { x0: -1, x1: 0, z0: -1, z1: Z + 1 }, { x0: X, x1: X + 1, z0: -1, z1: Z + 1 }, { x0: -1, x1: X + 1, z0: Z, z1: Z + 1 }];
  if (template.inner) {
    const d = template.inner[0].door * W.bay;
    wallRects.push({ x0: 0, x1: d, z0: at - 0.1, z1: at + 0.1 }, { x0: d + W.bay, x1: X, z0: at - 0.1, z1: at + 0.1 });
  }
  let strict = false;          // the gap rule, on once the seed's own layout is done (so it stays as Tim picked it)
  const fits = (r, zone, def) => r.x0 >= zone.x0 && r.z0 >= zone.z0 && r.x1 <= zone.x1 && r.z1 <= zone.z1
    && !placed.some(q => overlap(r, q.rect)) && !keep.some(k => overlap(r, k)) && !(strict && tight(r, null, def));
  // a gap too narrow to walk through between r and anything else (hanging lanterns may sit by a wall)
  const solidOf = (r, def) => {
    if (!def?.solid) return r;
    const [sx, sz] = turned(def.solid, r.rot), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    return { x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2 };
  };
  const tight = (r, self, def = self?.def) => {
    // Sleeping bays intentionally put a screen close to each futon; their open
    // ends and the walkway check determine whether crew can enter each bay.
    if (self?.fixedRun) return false;
    const me = solidOf(r, def);
    return [...placed.filter(q => q !== self).map(q => solidOf(q.rect, q.def)), ...(def?.rule === 'ceiling' ? [] : wallRects)].some(o => narrow(me, o));
  };

  const place = (item, zoneName) => {
    const def = parts.props[item.type];
    if (!def) { missing.push(`recipe names unknown prop "${item.type}"`); return null; }
    const zone = areaOf(item, zoneName);
    for (let t = 0; t < TRIES; t++) {
      let p;
      if (def.rule === 'wall') {
        // against a far wall, inside this zone, not over a window or the door
        const sides = (item.wall || ['north', 'west']).filter(s => s === 'west' ? zone.x0 === 0 : zone.z0 === 0);
        if (!sides.length) continue;
        const side = rng.pick(sides);
        const [len] = def.size;
        const lo = side === 'north' ? zone.x0 : zone.z0, hi = (side === 'north' ? zone.x1 : zone.z1) - len;
        if (hi < lo) continue;
        p = { type: item.type, wall: side, at: lo + 0.5 * rng.int(0, Math.floor((hi - lo) * 2)) };
        const r = propRect(p, def, [X, Z]);
        const a = side === 'north' ? r.x0 : r.z0, b = side === 'north' ? r.x1 : r.z1;
        let blocked = false;
        for (let i = Math.floor(a / W.bay); i * W.bay < b; i++) if (openBay(side, i)) blocked = true;
        if (blocked || !fits(r, zone, def)) continue;
        // Surface decoration travels with wall furniture when the layout moves it.
        const top = item.top && { type: item.top, at: [
          (r.x0 + r.x1) / 2 - 0.5 + (side === 'north' ? def.size[0] / 4 : 0),
          (r.z0 + r.z1) / 2 - 0.5 + (side === 'west' ? def.size[0] / 4 : 0),
        ] };
        placed.push({ type: item.type, def, rect: r, p, top, item, zoneName });
        template.props.push(p);
        if (top) template.props.push(top);
        return r;
      }
      if (item.place === 'corners') {
        const c = rng.pick([[zone.x0, zone.z0], [zone.x1 - 1, zone.z0], [zone.x0, zone.z1 - 1], [zone.x1 - 1, zone.z1 - 1]]);
        p = { type: item.type, at: c };
      } else {
        const rot = def.rotations ? rng.pick(def.rotations) : def.size[0] === def.size[1] ? 0 : rng.pick([0, 90]);
        const [ex, ez] = turned(def.size, rot);
        // keep a cell from the walls so there is room to walk round
        const x = item.anchor === 'west' ? 0 : item.anchor === 'east' ? zone.x1 - zone.x0 - ex
          : 1 + 0.5 * rng.int(0, Math.max(0, Math.floor((zone.x1 - zone.x0 - ex - 2) * 2)));
        const z = 1 + 0.5 * rng.int(0, Math.max(0, Math.floor((zone.z1 - zone.z0 - ez - 2) * 2)));
        p = { type: item.type, at: [zone.x0 + x, zone.z0 + z], ...(rot ? { rot } : {}) };
      }
      const r = propRect(p, def, [X, Z]);
      if (!fits(r, zone, def)) continue;
      const top = item.top && { type: item.top, at: [(r.x0 + r.x1) / 2 - 0.5, (r.z0 + r.z1) / 2 - 0.5] };
      placed.push({ type: item.type, def, rect: r, p, top, item, zoneName });
      template.props.push(p);
      if (top) template.props.push(top);
      return r;
    }
    return null;
  };

  // hanging lanterns: one over each listed piece of furniture, then near a wall
  const hangs = [];
  const hang = (item, zoneName) => {
    const zone = areaOf(item, zoneName);
    const over = rng.shuffle(placed.filter(q => (item.over || []).includes(q.type) && !hangs.includes(q)));
    if (over.length) {
      const q = over[0], r = q.rect;
      hangs.push(q);
      q.lantern = { type: item.type, at: [(r.x0 + r.x1) / 2 - 0.5, (r.z0 + r.z1) / 2 - 0.5] };
      template.props.push(q.lantern);
      return true;
    }
    for (let t = 0; t < TRIES; t++) {
      // next to a far wall (or the inner wall), clear of everything standing
      const onNorth = zone.z0 === 0 && rng.next() < 0.5;
      const p = onNorth ? [zone.x0 + 0.5 * rng.int(2, (zone.x1 - zone.x0 - 2) * 2), zone.z0 + 0.2]
        : [zone.x0 + 0.2, zone.z0 + 0.5 * rng.int(2, Math.max(2, (zone.z1 - zone.z0 - 2) * 2))];
      const r = { x0: p[0], z0: p[1], x1: p[0] + 1, z1: p[1] + 1 };
      if (!fits(r, zone, parts.props[item.type])) continue;
      const lp = { type: item.type, at: p };
      placed.push({ type: item.type, def: parts.props[item.type], rect: r, p: lp, item, zoneName });
      template.props.push(lp);
      return true;
    }
    return false;
  };

  // A straight run keeps screens or display cases aligned as one group. Screens
  // start at the west wall; shop cases can be centred within their display area.
  const placeLineRun = (item, zoneName, count) => {
    const def = parts.props[item.type], zone = areaOf(item, zoneName);
    if (!def || def.rule !== 'floor') return false;
    const variants = item.variants ? rng.shuffle(item.variants) : [item.type];
    if (variants.some(type => {
      const variant = parts.props[type];
      return !variant || variant.rule !== def.rule || variant.size[0] !== def.size[0] || variant.size[1] !== def.size[1];
    })) return false;
    const gap = item.run_gap || 0;
    const width = count * def.size[0] + (count - 1) * gap;
    // A dependent run shares its host's horizontal span and starts a fixed
    // distance beyond its back edge (bath washing stations behind the screens).
    const hosts = item.run_after ? placed.filter(q => q.type === item.run_after && q.zoneName === zoneName) : [];
    if (item.run_after && !hosts.length) return false;
    const x0 = hosts.length ? Math.min(...hosts.map(q => q.rect.x0)) : zone.x0;
    const x1 = hosts.length ? Math.max(...hosts.map(q => q.rect.x1)) : zone.x1;
    const margin = hosts.length ? 0 : (item.run_align === 'center' ? 2 : 3);
    if (width > x1 - x0 - margin) return false;
    const centeredX = x0 + (x1 - x0 - width) / 2;
    const xOptions = item.run_shift
      ? Array.from({ length: Math.floor((x1 - x0 - width) * 2) + 1 }, (_, i) => x0 + i * 0.5)
        .sort((a, b) => Math.abs(a - centeredX) - Math.abs(b - centeredX))
      : [item.run_align === 'center' ? centeredX : x0];
    const zSteps = Math.floor((zone.z1 - zone.z0 - def.size[1] - 2) * 2);
    if (zSteps < 0 && !hosts.length) return false;
    const zOptions = hosts.length
      ? [Math.max(...hosts.map(q => q.rect.z1)) + (item.run_gap_z ?? 0)]
      : item.run_depth === 'near'
        ? Array.from({ length: zSteps + 1 }, (_, i) => zone.z0 + 1 + i * 0.5)
        : Array.from({ length: TRIES }, () => zone.z0 + 1 + 0.5 * rng.int(0, zSteps));
    for (const z of zOptions) {
      for (const x of xOptions) {
        const candidates = Array.from({ length: count }, (_, i) => {
          const type = variants[i % variants.length], variant = parts.props[type];
          const p = { type, at: [x + i * (def.size[0] + gap), z] };
          return { p, rect: propRect(p, variant, [X, Z]), def: variant };
        });
        if (candidates.some(({ rect, def: variant }) => !fits(rect, zone, variant) || overlap(rect, entryClear)
          || clearings.some(c => overlap(rect, c.rect)))) continue;
        for (const { p, rect, def: variant } of candidates) {
          const top = item.top && { type: item.top, at: [(rect.x0 + rect.x1) / 2 - 0.5, (rect.z0 + rect.z1) / 2 - 0.5] };
          placed.push({ type: p.type, def: variant, rect, p, top, item, zoneName, fixedRun: true });
          template.props.push(p);
          if (top) template.props.push(top);
        }
        return true;
      }
    }
    return false;
  };

  const placeAround = (item, zoneName, count) => {
    const def = parts.props[item.type], zone = areaOf(item, zoneName);
    const host = placed.find(q => q.type === item.around && q.zoneName === zoneName);
    if (!def || !host || count !== 4) return false;
    const r = host.rect;
    const spots = [
      [r.x0 + 0.7, r.z0 - 1], [r.x1 - 1.7, r.z0 - 1],
      [r.x0 + 0.7, r.z1], [r.x1 - 1.7, r.z1],
    ];
    const candidates = spots.map(at => {
      const p = { type: item.type, at };
      return { p, rect: propRect(p, def, [X, Z]) };
    });
    if (candidates.some(({ rect }) => !fits(rect, zone, def) || overlap(rect, entryClear))) return false;
    for (const { p, rect } of candidates) {
      placed.push({ type: item.type, def, rect, p, item, zoneName, fixedRun: true });
      template.props.push(p);
    }
    return true;
  };

  // Tenement beds form paired sleeping bays along the side walls. Screens separate
  // the rows, while their open ends face a shared central aisle.
  if (recipe.sleeping_bays) {
    const beds = parts.props.futon, screens = parts.props.shoji_partition;
    const starts = [4, 8.5, 13];
    for (const side of ['west', 'east']) for (let row = 0; row < starts.length; row++) {
      const x = side === 'west' ? 1 : X - 3;
      const p = { type: 'futon', at: [x, starts[row]], artAngle: -3 };
      const rect = propRect(p, beds, [X, Z]);
      if (!fits(rect, zones.main, beds) || overlap(rect, entryClear)) missing.push('could not fit a tenement sleeping bay');
      else { placed.push({ type: p.type, def: beds, rect, p, zoneName: 'main', item: { type: p.type }, fixedRun: true }); template.props.push(p); }
      if (row === starts.length - 1) continue;
      const partition = { type: 'shoji_partition', at: [side === 'west' ? 1 : X - 3, starts[row] + 3] };
      const screenRect = propRect(partition, screens, [X, Z]);
      if (!fits(screenRect, zones.main, screens) || overlap(screenRect, entryClear)) missing.push('could not fit a tenement divider');
      else { placed.push({ type: partition.type, def: screens, rect: screenRect, p: partition, zoneName: 'main', item: { type: partition.type }, fixedRun: true }); template.props.push(partition); }
    }
  }

  // order: wall pieces, then furniture biggest first, then corner lamps, then lanterns
  const order = item => {
    const def = parts.props[item.type] || { size: [1, 1] };
    if (def.rule === 'wall') return 0;
    if (item.place === 'screen_run' || item.place === 'display_run') return 0.5;
    if (item.place === 'around') return 0.9;
    if (def.rule === 'ceiling') return 3;
    if (item.place === 'corners') return 2;
    return 1 - def.size[0] * def.size[1] / 100;
  };
  const jobs = [];
  for (const [zoneName, items] of [['back_room', back?.props || []], ['main', recipe.props]])
    for (const item of items) jobs.push({ item, zoneName, n: rng.range(item.count ?? 1), min: Array.isArray(item.count) ? item.count[0] : item.count ?? 1 });
  jobs.sort((a, b) => order(a.item) - order(b.item));
  for (const j of jobs) {
    if (j.item.place === 'screen_run' || j.item.place === 'display_run') {
      if (!placeLineRun(j.item, j.zoneName, j.n)) missing.push(`could not fit the ${j.item.type} display run in the ${j.zoneName.replace('_', ' ')}`);
      continue;
    }
    if (j.item.place === 'around') {
      if (!placeAround(j.item, j.zoneName, j.n)) missing.push(`could not fit the ${j.item.type} seating around ${j.item.around}`);
      continue;
    }
    let n = 0;
    for (let i = 0; i < j.n; i++) {
      const ok = parts.props[j.item.type]?.rule === 'ceiling' ? hang(j.item, j.zoneName) : place(j.item, j.zoneName);
      if (ok) n++;
    }
    if (n < j.min) missing.push(`could not fit ${j.min - n} ${j.item.type} in the ${j.zoneName.replace('_', ' ')}`);
  }

  // the way in (Tim 2026-10-18): a wide patch of clear floor inside the door, and room to walk
  // up to the back room's doorway. Then the gap rule: anything that leaves a gap too narrow to
  // walk through is moved. Both happen after the layout, so the rest of the room keeps the
  // layout its seed gave it. Pieces flat against the wall beside the street door stay, and so
  // does anything with nowhere else to go (the walkway check still makes sure there's a way past).
  clearings.unshift({ rect: entryClear });
  keep.push(...clearings.map(c => c.rect));
  strict = true;
  const move = q => {
    if (q.fixedRun) return false;
    const old = [q.p, q.top, q.lantern].filter(Boolean);
    placed.splice(placed.indexOf(q), 1);
    template.props = template.props.filter(t => !old.includes(t));
    const r = q.def.rule === 'ceiling' ? hang(q.item, q.zoneName) : place(q.item, q.zoneName);
    if (!r) { placed.push(q); template.props.push(...old); return false; }
    if (q.lantern) template.props.push({ ...q.lantern, at: [(r.x0 + r.x1) / 2 - 0.5, (r.z0 + r.z1) / 2 - 0.5] });
    return true;
  };
  for (const q of placed.filter(q => clearings.some(c => (c.walls || q.def.rule !== 'wall') && overlap(q.rect, c.rect)))) move(q);
  // a small shift first (half a cell or a cell, so it closes up to a pile or opens a walkway),
  // else somewhere new; later pieces go first, so the big furniture placed early stays put
  const nudge = q => {
    if (q.def.rule === 'wall' || q.fixedRun) return false;
    placed.splice(placed.indexOf(q), 1);
    for (const d of [0.5, 1]) for (const [dx, dz] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [d, -d], [-d, d], [-d, -d]]) {
      const r = { ...q.rect, x0: q.rect.x0 + dx, x1: q.rect.x1 + dx, z0: q.rect.z0 + dz, z1: q.rect.z1 + dz };
      if (!fits(r, areaOf(q.item, q.zoneName), q.def)) continue;
      q.rect = r;
      for (const t of [q.p, q.top, q.lantern]) if (t) t.at = [t.at[0] + dx, t.at[1] + dz];
      placed.push(q);
      return true;
    }
    placed.push(q);
    return false;
  };
  for (const q of [...placed].reverse()) if (placed.includes(q) && tight(q.rect, q)) nudge(q) || move(q);
  const left = placed.filter(q => tight(q.rect, q));
  if (left.length) missing.push(`${left.map(q => q.type).join(', ')} leave a gap too narrow to walk through`);
  return { template, missing };
}

// Two boxes face each other across a gap that is too narrow: wider than a pile's, but too
// tight to walk through. Corner-to-corner gaps are fine, as you can always walk round a corner.
export function narrow(a, b) {
  const dx = Math.max(b.x0 - a.x1, a.x0 - b.x1), dz = Math.max(b.z0 - a.z1, a.z0 - b.z1);
  if (dx > 0 && dz > 0) return false;
  const gap = Math.max(dx, dz);
  return gap > GAP.pile && gap < GAP.walk;
}

// ---------- step 6: walkway check ----------
// Flood-fills the floor from where you come in, on the same walk grid the crew path on
// (sim/nav.js ROOM_NAV), so a room that passes is one every crew member can walk round.
export function walkway(room, parts) {
  const [X, Z] = room.size, ox = room.origin.x, oz = room.origin.z, step = ROOM_NAV.cell, radius = ROOM_NAV.pad;
  const nav = createNav(room.blockers, { minX: ox, minZ: oz, maxX: ox + X, maxZ: oz + Z }, ROOM_NAV);
  const nx = Math.round(X / step), nz = Math.round(Z / step);
  const dist = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
  const free = new Uint8Array(nx * nz), seen = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) free[i * nz + k] = nav.free(ox + (i + 0.5) * step, oz + (k + 0.5) * step) ? 1 : 0;
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
