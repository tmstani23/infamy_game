// Founded towns on screen (frontier E5). Pure: turns settlement records into the list of things the
// island renderer draws, so the drawing always follows the record (never the chunks). An unbuilt
// project is a flat dirt footprint; a project with work done is its building at half opacity; a
// finished building is drawn as normal. Art names come from data/frontier.json "townArt".
import { townSlot } from './sim/frontier/town_layout.js';
import { cellOffset } from './sim/frontier/town_grid.js';
// grid towns (L3.1) give cells as grid indices; a town not migrated yet still holds spiral slots
const slotOf = (s, c, cells) => {
  if (!s.grid) return townSlot(c);
  const offsets = (cells?.length ? cells : [c]).map(i => cellOffset(s, i));
  return offsets.reduce(([x, z], [dx, dz]) => [x + dx / offsets.length, z + dz / offsets.length], [0, 0]);
};

// Which towns to draw: your own (full records, with a position) from the frontier snapshot.
export function drawableTowns(frontier, clan) {
  return Object.values(frontier?.settlements || {}).filter(s => s.owner === clan && !s.capital && Number.isFinite(s.x) && Array.isArray(s.buildings));
}

// A short string that changes whenever a drawn thing would change (so the renderer only rebuilds then).
export function townSignature(towns) {
  return JSON.stringify(towns.map(s => [s.id, s.x, s.z,
    s.buildings.map(b => [b.id, b.type, b.cell, b.cells, b.stage]),
    s.projects.map(p => [p.id, p.type, p.cell, p.cells, p.phase, p.paid, p.progress > 0]), s.grid,
    Object.entries(s.zones || {}).map(([kind, z]) => [kind, !!z.abandoned])]));
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
      const width = grid.cell * G.roadWidth;
      patch('road', width, width, G.roadTint,G.roadTexture);
      Object.assign(out[out.length-1],{tile:G.roadTile || G.textureTile,cornerRadius:width/2,opacity:G.roadOpacity ?? 1});
      for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const col = i % grid.n + dc, row = Math.floor(i / grid.n) + dr;
        if (col < 0 || row < 0 || col >= grid.n || row >= grid.n || !'rgB'.includes(grid.use[row * grid.n + col])) continue;
        out.push({ ...base, key: `${i}:road:${dc}:${dr}`, dirt: true, width: dc ? grid.cell / 2 : width, height: dr ? grid.cell / 2 : width,
          x: x + dc * grid.cell / 4, z: z + dr * grid.cell / 4, tint: G.roadTint,texture:G.roadTexture,tile:G.roadTile || G.textureTile,cornerRadius:width/2,opacity:G.roadOpacity ?? 1 });
      }
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
    if (!def || !stage || grid.ground[i] !== 'c') continue;
    const abandoned = !!zones[def.kind]?.abandoned, tint = abandoned ? G?.abandonedTint : undefined;
    if (def.field && G) {
      patch('field', grid.cell * G.fieldSize, grid.cell * G.fieldSize, abandoned ? G.abandonedTint : G.fieldTint, G.fieldTexture);
      if (!abandoned) for (let row = 0; row < G.cropRows; row++) out.push({ ...base, key: `${i}:crop:${row}`, dirt: true, width: grid.cell * G.fieldSize, height: grid.cell * G.cropWidth, z: z + (row - (G.cropRows - 1) / 2) * grid.cell * G.fieldSize / G.cropRows, tint: G.cropTint });
      if (i % def.houseEvery !== 0) continue;
    }
    const name = def.stages[Math.min(stage, def.stages.length) - 1];
    if (name) out.push({ ...base, key: `${i}:zone:${stage}:${abandoned}`, art: name, tint, noLights: abandoned, maxFootprint: grid.cell * (G?.zoneFootprint || 1) });
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
      const art = townArt[b.type], [ox, oz] = slotOf(s, b.cell ?? i, b.cells);
      if (art) out.push({ key: `${s.id}:${b.id}:${b.stage}`, art, x: s.x + ox, z: s.z + oz, opacity: b.stage === 'built' ? 1 : 0.5 });
      // stone lanterns beside finished buildings: they light the town at night (townLights = how many per type)
      if (b.stage === 'built') for (let k = 0; k < (townLights[b.type] || 0); k++) out.push({ key: `${s.id}:${b.id}:lamp${k}`, art: townLights.art || 'stone_lantern', x: s.x + ox + (k ? 4.6 : -4.6), z: s.z + oz + 3.8 });
    });
    for (const p of townCellsToProps(s.grid, townArt, s.zones)) out.push({ ...p, key: `${s.id}:${p.key}`, x: s.x + p.x, z: s.z + p.z });
    s.projects.forEach((p, i) => {
      const art = townArt[p.type], [ox, oz] = slotOf(s, p.cell ?? s.buildings.length + i, p.cells);
      const x = s.x + ox, z = s.z + oz;
      if (p.paid && p.progress > 0 && art) out.push({ key: `${s.id}:${p.id}:frame`, art, x, z, opacity: 0.5 });
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
    s.buildings.forEach((b, i) => { const [ox, oz] = slotOf(s, b.cell ?? i, b.cells); out.push({ town: s.id, kind: 'building', id: b.id, x: s.x + ox, z: s.z + oz }); });
    s.projects.forEach((p, i) => { const [ox, oz] = slotOf(s, p.cell ?? s.buildings.length + i, p.cells); out.push({ town: s.id, kind: 'project', id: p.id, x: s.x + ox, z: s.z + oz }); });
  }
  return out;
}

const nice = t => (t || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
// { title, lines } for a plot, read from the live snapshot so numbers stay current.
export function plotInfo(frontier, plot, data) {
  const s = frontier?.settlements?.[plot.town];
  if (!s) return null;
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
    lines.push(s.name);
  }
  return { title: nice(b.type), lines: [...lines, 'Right-click: open the town panel'] };
}
