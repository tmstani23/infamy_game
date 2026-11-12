// Founded towns on screen (frontier E5). Pure: turns settlement records into the list of things the
// island renderer draws, so the drawing always follows the record (never the chunks). An unbuilt
// project is a flat dirt footprint; a project with work done is its building at half opacity; a
// finished building is drawn as normal. Art names come from data/frontier.json "townArt".
import { townSlot } from './sim/frontier/town_layout.js';
import { cellOffset } from './sim/frontier/town_grid.js';
import { stationParts } from './sim/frontier/station_layout.js';
// grid towns (L3.1) give cells as grid indices; a town not migrated yet still holds spiral slots
const slotOf = (s, c, cells) => {
  if (!s.grid) return townSlot(c);
  const offsets = (cells?.length ? cells : [c]).map(i => cellOffset(s, i));
  return offsets.reduce(([x, z], [dx, dz]) => [x + dx / offsets.length, z + dz / offsets.length], [0, 0]);
};
// a war camp's buildings stand where they were placed (off: offset from the camp), not on a grid cell
const spotOf = (s, b, i) => b.off || slotOf(s, b.cell ?? i, b.cells);

// Which towns to draw: your own (full records, with a position) from the frontier snapshot.
export function drawableTowns(frontier, clan) {
  return Object.values(frontier?.settlements || {}).filter(s => s.owner === clan && !s.capital && Number.isFinite(s.x) && Array.isArray(s.buildings));
}

// F6 war: rival towns on discovered ground (the snapshot gives them position, grid and buildings) and war
// camps, drawn like towns but without Space doors (foreign: true). A camp is a small pseudo-town: its camp
// hall, its banner, its finished buildings and its building sites (checkpoint 4), each where it was placed.
export function drawableWarSites(frontier, clan) {
  const out = Object.values(frontier?.settlements || {}).filter(s => s.owner !== clan && !s.capital && Number.isFinite(s.x) && Array.isArray(s.buildings))
    .map(s => ({ ...s, projects: s.projects || [], foreign: true }));
  for (const w of Object.values(frontier?.wars?.list || {})) {
    const c = w.camp; if (!c || !Number.isFinite(c.x)) continue;
    const list = (c.buildings || []).filter(b => Number.isFinite(b.x)), off = b => [b.x - c.x, b.z - c.z];
    const hall = list.find(b => b.type === 'camp_hall'), u = hall?.upgrade;
    out.push({ id: w.id, camp: w.id, name: 'War camp', owner: w.attacker, x: c.x, z: c.z, grid: null, zones: {}, foreign: true,
      ...(u ? { tierUpgrade: { left: Math.max(0, (u.need || 1) - (u.progress || 0)), total: u.need || 1 } } : {}),
      buildings: [...(hall ? [] : [{ id: 'hall', type: 'camp_hall', stage: 'built', cell: 0 }]), { id: 'banner', type: 'war_banner', stage: 'built', cell: 1 },
        ...list.filter(b => b.stage === 'built' || b.stage === 'ruined').map(b => ({ id: b.id, type: b.type, stage: b.stage, off: off(b), ...(b.rot !== undefined ? { rot: b.rot } : {}) }))],
      projects: list.filter(b => b.stage === 'site').map(b => ({ id: b.id, type: b.type, off: off(b), paid: true, progress: b.progress || 0, need: b.need || 1 })) });
  }
  return out;
}

// Town hall upgrade phase 1-3 while s.tierUpgrade runs (Tim 2026-11-05: the hall goes through construction stages), else 0
export function hallPhase(s) {
  const u = s.tierUpgrade;
  if (!u) return 0;
  const frac = 1 - Math.max(0, u.left) / Math.max(1, u.total || u.left);
  return frac < 1 / 3 ? 1 : frac < 2 / 3 ? 2 : 3;
}
// A short string that changes whenever a drawn thing would change (so the renderer only rebuilds then).
export function townSignature(towns) {
  return JSON.stringify(towns.map(s => [s.id, s.x, s.z,
    s.buildings.map(b => [b.id, b.type, b.cell, b.cells, b.stage, b.off, b.rot]),
    s.projects.map(p => [p.id, p.type, p.cell, p.cells, p.off, p.phase, p.paid, p.progress > 0, p.progress * 2 >= p.need]), s.grid,
    Object.entries(s.zones || {}).map(([kind, z]) => [kind, !!z.abandoned]), hallPhase(s), s.breaches || 0]));
}

// Local drawing instructions only. No clearing, growth or placement rules run here.
export function townCellsToProps(grid, art = {}, zones = {}) {
  if (!grid?.ground || !grid.use || !grid.zone || !grid.stage) return [];
  const out = [], mid = (grid.n - 1) / 2, G = art._ground;
  const definitions = art._zones || {};
  const cleared = i => {
    if (i < 0 || i >= grid.n * grid.n || grid.ground[i] !== 'c') return false;
    const x = (i % grid.n - mid) * grid.cell, z = (Math.floor(i / grid.n) - mid) * grid.cell;
    return grid.use[i] !== '.' || grid.zone[i] !== '.' || Math.hypot(x, z) <= G.foundationRadius;
  };
  for (let i = 0; i < grid.n * grid.n; i++) {
    if (grid.ground[i] === 'x') continue;
    const x = (i % grid.n - mid) * grid.cell, z = (Math.floor(i / grid.n) - mid) * grid.cell;
    const use = grid.use[i], zone = grid.zone[i], stage = Number(grid.stage[i]);
    const base = { cell: i, x, z };
    const patch = (key, width, height, tint, texture) => out.push({ ...base, key: `${i}:${key}`, dirt: true, width, height, tint, texture, cornerRadius:Math.min(width,height)*(G?.tileRoundness || 0) });
    // Open plains are already cleared in the sim; only the foundation and used cells need a dirt decal.
    if (G && cleared(i)) {
      patch('clear', grid.cell, grid.cell, G.clearTint, G.clearTexture);
      // Fade only the clearing's perimeter; adjoining cells share uninterrupted earth.
      Object.assign(out[out.length - 1], { tile: G.textureTile, edgeFade: G.edgeFade, opacity: G.clearOpacity,
        edges: [i % grid.n === 0 || !cleared(i - 1), i % grid.n === grid.n - 1 || !cleared(i + 1), !cleared(i - grid.n), !cleared(i + grid.n)].map(Number) });
    }
    if (G && (use === 'r' || use === 'g')) {
      // One whole-cell tile per road cell, picked by which neighbours are roads (16 pre-made tiles).
      const col = i % grid.n, row = Math.floor(i / grid.n);
      const joinsRoad = (dc, dr) => col + dc >= 0 && col + dc < grid.n && row + dr >= 0 && row + dr < grid.n && 'rgB'.includes(grid.use[(row + dr) * grid.n + col + dc]);
      const arms = [joinsRoad(-1, 0), joinsRoad(1, 0), joinsRoad(0, -1), joinsRoad(0, 1)].map(Number);
      // art/ground/road/road_<mask>.png: kerbs on the open sides, a rounded corner on a bend (tools/build_road_tiles.py)
      const mask = arms[0] + 2 * arms[1] + 4 * arms[2] + 8 * arms[3];
      patch('road', grid.cell, grid.cell, '#ffffff', `art/ground/road/road_${mask}.png`);
      Object.assign(out[out.length - 1], { cornerRadius: 0, road: { arms, mask } });
    }
    if (use === 'w' || use === 'g') {
      const col = i % grid.n, row = Math.floor(i / grid.n);
      const joins = (dc, dr) => col + dc >= 0 && col + dc < grid.n && row + dr >= 0 && row + dr < grid.n && 'wg'.includes(grid.use[(row + dr) * grid.n + col + dc]);
      const alongX = joins(-1, 0) || joins(1, 0), alongZ = joins(0, -1) || joins(0, 1);
      const axes = use === 'w' && alongX && alongZ ? [false, true] : [alongZ];
      const wall = art._walls?.[use];
      const turn=use==='w' && alongX && alongZ && [joins(-1,0),joins(1,0),joins(0,-1),joins(0,1)].filter(Boolean).length===2;
      const bend=grid.cell*(art._walls?.cornerCut || 0.25);
      if (wall) for (const vertical of axes) {
        const corner=use==='w' && alongX && alongZ;
        const low=corner && !joins(vertical?0:-1,vertical?-1:0)?turn?bend:0:-grid.cell/2;
        const high=corner && !joins(vertical?0:1,vertical?1:0)?turn?-bend:0:grid.cell/2;
        const count=Math.max(1,Math.round(wall.count*(high-low)/grid.cell));
        for(let k=0;k<count;k++) {
          const d=low+(k+.5)*(high-low)/count;
          out.push({ ...base, key: `${i}:${use}:${vertical}:${k}`, x: x + (vertical ? 0 : d), z: z + (vertical ? d : 0), art: wall.art, flip: vertical, s: wall.scale, noLights: true });
        }
      }
      if(wall && turn) {
        const a=[joins(-1,0)?-bend:bend,0],b=[0,joins(0,-1)?-bend:bend],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),count=Math.max(1,Math.ceil(length/(grid.cell/wall.count)));
        for(let k=0;k<count;k++)out.push({...base,key:`${i}:w:corner:${k}`,x:x+a[0]+dx*(k+.5)/count,z:z+a[1]+dz*(k+.5)/count,art:wall.art,flip:false,
          fenceHeading:[dx,dz],fenceMinWidth:art._walls.cornerMinWidth,s:wall.scale*length/count/(grid.cell/wall.count),noLights:true});
      }
    }
    const def = definitions[zone];
    if (!def || grid.ground[i] !== 'c' || (!stage && !def.zoned)) continue;
    const abandoned = !!zones[def.kind]?.abandoned, tint = abandoned ? G?.abandonedTint : undefined;
    if (def.field && G) {
      patch('field', grid.cell * G.fieldSize, grid.cell * G.fieldSize, abandoned ? G.abandonedTint : G.fieldTint, G.fieldTexture);
      // Soft feathered edge so fields melt into the ground; no fade where the next cell is also a field.
      const isField = j => j >= 0 && j < grid.n * grid.n && grid.ground[j] === 'c' && definitions[grid.zone[j]]?.field && Number(grid.stage[j]) > 0;
      const fc = i % grid.n;
      Object.assign(out[out.length - 1], { tile: G.fieldTile || G.textureTile, edgeFade: G.fieldFade ?? G.edgeFade, opacity: G.fieldOpacity ?? 0.8, cornerRadius: 0,
        width: grid.cell * (G.fieldSize + 0.1), height: grid.cell * (G.fieldSize + 0.1),
        edges: [fc === 0 || !isField(i - 1), fc === grid.n - 1 || !isField(i + 1), !isField(i - grid.n), !isField(i + grid.n)].map(Number) });
      if (!abandoned) for (let row = 0; row < G.cropRows; row++) out.push({ ...base, key: `${i}:crop:${row}`, dirt: true, width: grid.cell * G.fieldSize, height: grid.cell * G.cropWidth, opacity: G.cropOpacity ?? 1, z: z + (row - (G.cropRows - 1) / 2) * grid.cell * G.fieldSize / G.cropRows, tint: G.cropTint });
      if (i % def.houseEvery !== 0) continue;
    }
    // Stage 0 shows def.zoned (the construction site just begun); an abandoned kind with its own ruin art swaps it in
    // from the first built stage and drops the grey tint (farms have none, so they keep the tint).
    const ruin = abandoned && stage > 0 && def.abandoned, name = ruin ? def.abandoned : stage ? def.stages[Math.min(stage, def.stages.length) - 1] : def.zoned;
    if (name) out.push({ ...base, key: `${i}:zone:${stage}:${abandoned}`, art: name, tint: ruin ? undefined : tint, noLights: abandoned, maxFootprint: grid.cell * (G?.zoneFootprint || 1) });
  }
  return out;
}

export function townProps(towns, townArt, townLights = {}) {
  const out = [];
  for (const s of towns) {
    const lighting = townLights.automatic;
    if (lighting && s.grid) {
      const g=s.grid, mid=(g.n-1)/2, corners=new Set();
      for(let i=0;i<g.n*g.n;i++) {
        if(g.ground[i]==='x' || g.use[i]==='.' && g.zone[i]==='.')continue;
        const col=i%g.n, row=Math.floor(i/g.n);
        for(const [dc,dr] of [[0,0],[1,0],[0,1],[1,1]]) {
          const c=col+dc,r=row+dr;
          // Align lights to a regular lattice; always mark the hall's corners as well.
          if ((c-mid)%lighting.spacingCells===0 && (r-mid)%lighting.spacingCells===0 || g.use[i]==='B' && s.buildings.some(b=>b.type==='town_hall' && b.cell===i)) corners.add(`${c},${r}`);
        }
      }
      for(const key of corners) {
        const [c,r]=key.split(',').map(Number);
        out.push({key:`${s.id}:auto-light:${key}`,art:lighting.art,x:s.x+(c-mid-.5)*g.cell,z:s.z+(r-mid-.5)*g.cell,lightRadius:lighting.radius});
      }
    }
    s.buildings.forEach((b, i) => {
      // a camp palisade or gate piece faces along its line (checkpoint 6-6)
      const lineArt = s.camp && townArt._campLine?.[b.type], art = lineArt ? lineArt[Math.abs(Math.cos(b.rot || 0)) >= Math.abs(Math.sin(b.rot || 0)) ? 'x' : 'z'] : townArt[b.type], [ox, oz] = spotOf(s, b, i);
      // a ruin (war checkpoint 6): the burned ruin art; a broken camp palisade or gate piece shows dark rubble
      if (b.stage === 'ruined') {
        const R = townArt._ruin || {}, own = R.byType?.[b.type], alongX = Math.abs(Math.cos(b.rot || 0)) >= Math.abs(Math.sin(b.rot || 0));
        const fitR = R.footprint?.[b.type] ?? townArt._placedFootprint?.[b.type];
        out.push({ key: `${s.id}:${b.id}:ruined`, art: own || (lineArt ? R.rubble : R.art) || (townArt._buildPhases || ['house_construction_1'])[0], x: s.x + ox, z: s.z + oz,
          ...(lineArt ? (own ? { flip: alongX } : { tint: R.tint || '#4a403a' }) : R.artTint || !(own || R.art) ? { tint: R.artTint || '#4a403a' } : {}),
          ...(fitR ? { maxFootprint: (s.grid?.cell || 11) * fitR } : lineArt ? { maxFootprint: 3 } : {}), noLights: true });
        return;
      }
      const fit = townArt._placedFootprint?.[b.type], maxFootprint = fit ? (s.grid?.cell || 11) * fit : undefined;   // Tim 2026-11-07: placed buildings were far bigger than the townhouse
      // the 3x2 railway station (Tim 2026-11-07): the ticket hall (its Space ring) and the engine shed, its open front to the track
      const parts = b.type === 'station' && townArt._stationParts && stationParts(s, b);
      if (parts) {
        const P = townArt._stationParts, along = parts.rot % 2 === 0, mf = (s.grid?.cell || 11) * (P.fit ?? 1.6), op = b.stage === 'built' ? 1 : 0.5;
        // coach_house opens toward +z, mirrored toward +x; railway_station's platform faces +x, mirrored +z
        out.push({ key: `${s.id}:${b.id}:${b.stage}:shed`, art: P.shed, x: s.x + parts.shed[0], z: s.z + parts.shed[1], flip: along, opacity: op, maxFootprint: mf });
        out.push({ key: `${s.id}:${b.id}:${b.stage}:hall`, art: P.hall, x: s.x + parts.hall[0], z: s.z + parts.hall[1], flip: !along, opacity: op, maxFootprint: mf,
          ...(b.stage === 'built' && !s.foreign ? { spaceDoor: `${s.id}:${b.id}` } : {}) });
      }
      else if (art) out.push({ key: `${s.id}:${b.id}:${b.stage}`, art, x: s.x + ox, z: s.z + oz, opacity: b.stage === 'built' ? 1 : 0.5, maxFootprint,
        ...(b.stage === 'built' && !s.foreign && ['town_hall', 'stable', 'station'].includes(b.type) ? { spaceDoor: `${s.id}:${b.type === 'town_hall' ? 'hall' : b.id}` } : {}) });   // render/banners.js puts its Space ring at the door
      // hall upgrade: new wings go up beside the hall in stages (site, frame, then timber stacks while it finishes)
      const phase = (b.type === 'town_hall' || b.type === 'camp_hall') && b.stage === 'built' ? hallPhase(s) : 0;
      if (phase) {
        const c = s.grid?.cell || 11, site = townArt._hallUpgrade?.[phase - 1] || ['house_construction_1', 'house_construction_2', 'wall_planks'][phase - 1];
        for (const [k, dx, dz] of [[0, -0.95, 0.55], [1, 0.95, 0.55], [2, 0, -0.95]]) out.push({ key: `${s.id}:${b.id}:up${phase}:${k}`, art: k === 2 && phase < 3 ? 'wall_planks' : site, x: s.x + ox + dx * c, z: s.z + oz + dz * c });
      }
      // stone lanterns beside finished buildings: they light the town at night (townLights = how many per type)
      if (b.stage === 'built') for (let k = 0; k < (townLights[b.type] || 0); k++) out.push({ key: `${s.id}:${b.id}:lamp${k}`, art: townLights.art || 'stone_lantern', x: s.x + ox + (k ? 4.6 : -4.6), z: s.z + oz + 3.8 });
    });
    for (const p of townCellsToProps(s.grid, townArt, s.zones)) out.push({ ...p, key: `${s.id}:${p.key}`, x: s.x + p.x, z: s.z + p.z });
    // a breached wall or gate cell (war checkpoint 6): rubble on open ground
    if (s.grid) for (const br of s.breaches || []) {
      const R = townArt._ruin || {}, [bx, bz] = cellOffset(s, br.cell), n = s.grid.n, col = br.cell % n, row = Math.floor(br.cell / n);
      const own = br.was === 'g' ? R.gate : R.wall;
      // the wall ran along x when a wall, gate or other gap sits beside it in the row
      const wallAt = (c, r) => c >= 0 && c < n && r >= 0 && r < n && ('wg'.includes(s.grid.use[r * n + c]) || s.breaches.some(o => o.cell === r * n + c));
      const alongX = wallAt(col - 1, row) || wallAt(col + 1, row) || !(wallAt(col, row - 1) || wallAt(col, row + 1));
      out.push({ key: `${s.id}:breach:${br.cell}`, art: own || R.rubble || 'house_construction_1', x: s.x + bx, z: s.z + bz, ...(own ? { flip: alongX } : { tint: R.tint || '#4a403a' }), noLights: true, maxFootprint: s.grid.cell * (own ? R.breachFootprint || 1 : 0.6) });
    }
    s.projects.forEach((p, i) => {
      const art = townArt[p.type], [ox, oz] = spotOf(s, p, s.buildings.length + i);
      const x = s.x + ox, z = s.z + oz;
      // placed buildings go through the same build phases as zone houses (Tim 2026-11-05): site, then frame, then the building
      if (p.paid && p.progress > 0 && art) { const half = p.progress * 2 >= p.need, phases = townArt._buildPhases || ['house_construction_1', 'house_construction_2'];
        out.push({ key: `${s.id}:${p.id}:frame${half ? 2 : 1}`, art: phases[half ? 1 : 0], x, z }); }
      else if (p.phase !== 'clearing') {
        const offsets = p.cells?.map(c => cellOffset(s, c));
        const width = offsets ? Math.max(...offsets.map(p => p[0])) - Math.min(...offsets.map(p => p[0])) + s.grid.cell : 8;
        const height = offsets ? Math.max(...offsets.map(p => p[1])) - Math.min(...offsets.map(p => p[1])) + s.grid.cell : 6;
        out.push({ key: `${s.id}:${p.id}:dirt`, dirt: true, width, height, x, z,
          texture: townArt._ground?.clearTexture, tint: townArt._ground?.clearTint, tile: townArt._ground?.textureTile,
          edgeFade: townArt._ground?.edgeFade, edges: [1, 1, 1, 1], opacity: townArt._ground?.clearOpacity,cornerRadius:Math.min(width,height)*(townArt._ground?.tileRoundness || 0) });
      }
    });
  }
  return out;
}

// ---- hover and right-click on a plot (frontier E5, Tim 2026-11-04) ----
// Every building and project of your towns is a plot: { town, kind: 'building' | 'project', id, x, z }.
export function townPlots(towns) {
  const out = [];
  for (const s of towns) {
    const tag = { ...(s.foreign ? { foreign: true } : {}), ...(s.camp ? { camp: s.camp } : {}) };
    s.buildings.forEach((b, i) => { const [ox, oz] = spotOf(s, b, i); out.push({ town: s.id, kind: 'building', type: b.type, id: b.id, x: s.x + ox, z: s.z + oz, ...tag }); });
    s.projects.forEach((p, i) => { const [ox, oz] = spotOf(s, p, s.buildings.length + i); out.push({ town: s.id, kind: 'project', type: p.type, id: p.id, x: s.x + ox, z: s.z + oz, ...tag }); });
  }
  return out;
}

// how many of your units shelter in a town's stockade (entities plus sleeping workers), for the hover card and the badge
export function garrisonCount(frontier, entities, s) {
  let n = Object.values(entities || {}).filter(e => e.garrison?.town === s.id && !e.garrison.hall).length;
  for (const w of s.workers || []) if (w.garrison && !entities?.[w.entity]) n++;
  return n;
}
const nice = t => (t || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
// { title, lines } for a plot, read from the live snapshot so numbers stay current.
// a rival town's building (F6 war): what it is; at the hall, its stores and people once one of your units
// is close (snapshot scouted, Tim 2026-11-10), otherwise a hint to walk up. Never opens a town panel.
function rivalPlotInfo(s, plot) {
  const n = v => Math.floor(v || 0);
  if (plot.kind === 'project') {
    const p = (s.projects || []).find(x => x.id === plot.id);
    return p ? { title: nice(p.type), lines: ['Under construction', s.name] } : null;
  }
  const b = (s.buildings || []).find(x => x.id === plot.id);
  if (!b) return null;
  if (b.stage === 'ruined') return { title: `${nice(b.type)} (ruin)`, lines: [s.name] };
  if (b.type !== 'town_hall') return { title: nice(b.type), lines: [s.name] };
  const lines = [s.name];
  if (s.scouted && s.stock) lines.push(`${n(s.pop)} people, housing ${n(s.housing)}, ${n(s.workerCount)} workers`,
    `Food ${n(s.stock.food)}, Timber ${n(s.stock.timber)}, Stone ${n(s.stock.stone)}`, `Goods ${n(s.stock.goods)}, Ryo ${n(s.stock.ryo)}`);
  else lines.push('Come closer to see its stores and people');
  return { title: nice(b.type), lines };
}

// a war camp's building (checkpoint 4): your own camp says what it is, how far a site has got and that a click opens
// the camp panel; a rival camp only says what stands there
function campPlotInfo(frontier, plot, mine, clan = null) {
  const w = frontier?.wars?.list?.[plot.camp], b = w?.camp?.buildings?.find(x => x.id === plot.id);
  const town = frontier?.settlements?.[w?.town]?.name, type = b?.type || plot.type;
  if (!w || !type) return null;
  const lines = [b?.stage === 'site' ? `Under construction: ${Math.round(100 * (b.progress || 0) / Math.max(1, b.need || 1))}%` : b?.upgrade ? `Upgrading: ${Math.round(100 * (b.upgrade.progress || 0) / Math.max(1, b.upgrade.need || 1))}%` : '',
    (b?.queue || []).length ? `Training ${b.queue.length}` : '', `War camp${town ? ` at ${town}` : ''}`].filter(Boolean);
  if (b?.stage === 'ruined') return { title: `${nice(type)} (ruin)`, lines: [`War camp${town ? ` at ${town}` : ''}`] };
  const hp = b?.hp != null ? [`Health ${Math.round(b.hp)}`] : [];
  return { title: nice(type), lines: mine ? [...lines, ...hp, 'Left-click: open the camp panel'] : [...lines, ...hp, ...(w?.defender === clan ? ['Right-click: attack it'] : [])] };
}

export function plotInfo(frontier, plot, data, entities = null, clan = null) {
  if (plot.camp) return campPlotInfo(frontier, plot, frontier?.wars?.list?.[plot.camp]?.attacker === clan, clan);
  const s = frontier?.settlements?.[plot.town];
  if (!s) return null;
  if (plot.foreign) { const info = rivalPlotInfo(s, plot), b = (s.buildings || []).find(x => x.id === plot.id);
    // at war with this town (checkpoint 6): its standing buildings can be attacked
    if (info && plot.kind === 'building' && b?.stage === 'built' && Object.values(frontier?.wars?.list || {}).some(w => w.town === s.id && w.attacker === clan)) info.lines.push('Right-click: attack it');
    return info; }
  const lines = [];
  if (plot.kind === 'project') {
    const p = s.projects.find(x => x.id === plot.id);
    if (!p) return null;
    lines.push(!p.paid ? (p.authorized ? 'Waiting for materials' : 'Planned: not started') : `Under construction: ${Math.round(100 * p.progress / Math.max(1, p.need))}%`);
    lines.push(`Cost: ${Object.entries(p.cost).map(([r, n]) => `${n} ${r}`).join(', ') || 'free'}`);
    lines.push(`${s.name}`);
    return { title: nice(p.type), lines: [...lines, 'Right-click: open the town panel'] };
  }
  const b = s.buildings.find(x => x.id === plot.id);
  if (!b) return null;
  const t = data?.buildings?.[b.type] || {};
  if (b.type === 'town_hall') lines.push(`${s.name}: ${s.pop} people, housing ${s.housing}`, `Food ${Math.floor(s.stock.food)} · Timber ${Math.floor(s.stock.timber)} · Stone ${Math.floor(s.stock.stone)}`, ...(s.mood !== undefined ? [`Mood ${Math.round(s.mood)}`] : []));
  else {
    if (t.jobs) lines.push(`Workers ${b.workers}/${t.jobs}`);
    if (t.housing) lines.push(`Houses ${t.housing} people`);
    if (t.output) lines.push(`Makes ${Object.keys(t.output).join(', ')}`);
    if (!lines.length) lines.push(nice(b.type));
    if (b.type === 'stockade' && b.stage === 'built' && entities && data?.buildings?.stockade?.garrison) lines.push(`Garrison ${garrisonCount(frontier, entities, s)} / ${data.buildings.stockade.garrison.capacity}`);
    lines.push(s.name);
  }
  return { title: nice(b.type), lines: [...lines, b.type === 'stockade' && b.stage === 'built' ? 'Right-click: send selected crew in (none selected: your hero goes in)' : 'Right-click: open the town panel'] };
}
