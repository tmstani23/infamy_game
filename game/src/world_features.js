// Basic camp dressing, read from authored locations. Decorative only; no navigation changes.
export function campPropsInChunk(world,x0,z0,size) {
  return (world.camps || []).filter(c=>c.kind==='bandit' && c.x>=x0 && c.z>=z0 && c.x<x0+size && c.z<z0+size)
    .map(c=>({kind:'campfire',art:'campfire',x:c.x,z:c.z,light:true,feature:c.id}));
}

// Ruins and caches (one-time finds, rewards come later): a visible landmark from existing art, so the
// cleared dirt circle is never empty.
export function findPropsInChunk(world,x0,z0,size) {
  const art={ruin:'plains_ruined_granary',cache:'trail_cairn'};
  return (world.camps || []).filter(c=>art[c.kind] && c.x>=x0 && c.z>=z0 && c.x<x0+size && c.z<z0+size)
    .map(c=>({kind:art[c.kind],art:art[c.kind],x:c.x,z:c.z,feature:c.id}));
}

// Loop 1 crossings: the river's unit direction at a ford or bridge, from its authored river line.
export function riverDirection(world,f) {
  const r=(world.rivers||[]).find(r=>r.id===f.river);if(!r)return {tx:1,tz:0,width:100};
  let best=Infinity,tx=1,tz=0;
  for(let i=0;i<r.points.length-1;i++){
    const [a,b]=[r.points[i],r.points[i+1]],dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz||1;
    const t=Math.max(0,Math.min(1,((f.x-a[0])*dx+(f.z-a[1])*dz)/l)),d=Math.hypot(a[0]+t*dx-f.x,a[1]+t*dz-f.z);
    if(d<best){best=d;const n=Math.sqrt(l);tx=dx/n;tz=dz/n;}
  }
  return {tx,tz,width:r.width||100};
}

// Plain plank strip across the river at each bridge (flat ground decal, drawn by render/world_ground.js).
// Its length follows the painted water (wetAt(x,z) -> 0..1, world_paint.js waterAt), not the authored river
// width, so it only overhangs each bank a little. `reach` = half length, so the view test keeps a long strip alive.
// Fords have no prop: world_paint.js paints their gravel bed.
export function crossingPropsInChunk(world,x0,z0,size,cfg={},wetAt=null) {
  const over=cfg.overhang??6,w=cfg.width??3;
  return (world.fords||[]).filter(f=>f.kind==='bridge' && f.x>=x0 && f.z>=z0 && f.x<x0+size && f.z<z0+size).map(f=>{
    const {tx,tz,width}=riverDirection(world,f),nx=-tz,nz=tx;
    let lo=-width/2,hi=width/2;
    if(wetAt){   // walk out from the crossing along each side until the water ends (a river mouth's sea never counts)
      const edge=sign=>{let last=0,dry=0;for(let s=0;s<=200;s+=2){if(wetAt(f.x+nx*s*sign,f.z+nz*s*sign)>0.5){last=s;dry=0;}else if((dry+=2)>12&&s>12)break;}return last*sign;};
      lo=edge(-1);hi=edge(1);
    }
    const mid=(lo+hi)/2,len=hi-lo+over*2;
    return {kind:'bridge',art:'bridge_planks',decal:true,x:f.x+nx*mid,z:f.z+nz*mid,width:len,height:w,reach:len/2,angle:Math.atan2(tx,-tz),feature:f.id};
  });
}

// W4.3 resource nodes and unclaimed settlement sites, drawn from props that already exist.
// Art only: no navigation change. Offsets come from the id so every chunk and machine agrees.
const NODE_PROPS = {
  forest:  [['fallen_log', -1.4, 0.6], ['fallen_log', 1.1, -0.9], ['stump', 0.2, 1.8]],      // stacked logs
  quarry:  [['boulder', -1.2, 0.3], ['boulder', 1.3, -0.6], ['small_rocks', 0.1, 1.6]],      // stone outcrop
  ore:     [['boulder', 0, 0], ['small_rocks', -1.8, 1.1], ['small_rocks', 1.7, -1.2]],
  fertile: [['bush', -1.5, 0.4], ['bush', 1.3, -0.5], ['ferns', 0.1, 1.5]],
  fishing: [['bamboo', -1.6, 0], ['bamboo', 0, 0.5], ['bamboo', 1.6, 0.1]],                  // fishing posts
};
const hashId = id => { let h = 7; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
export function nodePropsInChunk(world, x0, z0, size) {
  const out = [];
  for (const n of world.nodes || []) {
    if (n.x < x0 || n.z < z0 || n.x >= x0 + size || n.z >= z0 + size) continue;
    const turn = (hashId(n.id) % 628) / 100;
    for (const [kind, ox, oz] of NODE_PROPS[n.kind] || []) {
      const c = Math.cos(turn), s = Math.sin(turn);
      out.push({ kind, x: n.x + ox * c - oz * s, z: n.z + ox * s + oz * c, feature: n.id });
    }
  }
  return out;
}
// A survey flag with two stakes where a town could be founded. `claimed` ids (founded towns) get none.
export function sitePropsInChunk(world, x0, z0, size, claimed = []) {
  const out = [];
  for (const s of world.sites || []) {
    if (s.x < x0 || s.z < z0 || s.x >= x0 + size || s.z >= z0 + size || claimed.includes(s.id)) continue;
    out.push({ kind: 'clan_banner', x: s.x, z: s.z, feature: s.id }, { kind: 'bamboo', x: s.x - 1.6, z: s.z + 0.8, feature: s.id }, { kind: 'bamboo', x: s.x + 1.6, z: s.z + 0.8, feature: s.id });
  }
  return out;
}

// W4.4 scouting report: only what the world data already says, shown once the site is scouted.
export function siteReport(world, site, nodeRadius = 600) {
  const nodes = {};
  for (const n of world.nodes || []) if (Math.hypot(n.x - site.x, n.z - site.z) <= nodeRadius) nodes[n.kind] = (nodes[n.kind] || 0) + 1;
  let camp = null;
  for (const c of world.camps || []) {
    if (c.kind !== 'bandit') continue;
    const d = Math.hypot(c.x - site.x, c.z - site.z);
    if (!camp || d < camp.distance) camp = { id: c.id, tier: c.tier, distance: Math.round(d) };
  }
  return { nodes, camp, travelCost: site.travelCostToCapital ?? null };
}

// Hover text for a marker on the island minimap (and anywhere else a feature is named).
// kind: 'camp' | 'site' | 'node'. ctx: { camps: state.world.camps view, scouted: [site ids], rules: bandits.json worldCamps }.
const KIND_NAME = { bandit: 'Bandit camp', ruin: 'Ruin', cache: 'Cache', quarry: 'Quarry', forest: 'Forest (timber)', ore: 'Ore vein', fertile: 'Fertile ground', fishing: 'Fishing spot' };
export function featureTip(kind, f, ctx = {}) {
  if (kind === 'camp') {
    const rec = ctx.camps?.[f.id], sizes = ctx.rules?.membersByTier, guards = sizes?.[Math.max(1, Math.min(sizes.length, f.tier || 1)) - 1]?.length;
    if (f.kind !== 'bandit') return { title: `${KIND_NAME[f.kind] || f.kind} ${placeNo(f.id)}`, lines: ['One-time find (reward not built yet)'] };
    return { title: `${KIND_NAME.bandit} ${placeNo(f.id)}`, lines: [`Tier ${f.tier}${guards ? ` · ${guards} guards` : ''}`,
      rec?.cleared ? `Cleared on day ${rec.clearedDay}; returns after ${ctx.rules?.respawnDays ?? 5} days` : 'Guarded',
      ctx.world ? `${Math.round(Math.hypot(f.x - ctx.world.capital.x, f.z - ctx.world.capital.z))} units from the capital` : '',
      ctx.rules ? `Reward: ${(rec?.claimed ? ctx.rules.repeatClearRyo : ctx.rules.firstClearRyo) * (f.tier || 1)} ryo${rec?.claimed ? '' : ' (first clear)'}` : ''].filter(Boolean) };
  }
  if (kind === 'site') {
    const known = ctx.scouted?.includes(f.id);
    return { title: `Site ${placeNo(f.id)}`, lines: known ? [`Soil ${f.traits.soil} · Water ${f.traits.water} · Defence ${f.traits.defense}`, `${f.routesToCapital} routes to the capital${f.harbor ? ' · harbor' : ''}`, ...(ctx.world ? (() => { const r = siteReport(ctx.world, f); return [`Within 600: ${Object.entries(r.nodes).map(([k, n]) => `${n} ${k}`).join(', ') || 'no resource nodes'}`, r.camp ? `Nearest bandit camp ${placeNo(r.camp.id)} (tier ${r.camp.tier}), ${r.camp.distance} away` : '']; })() : [])].filter(Boolean) : ['A place to found a town', 'Not scouted: walk close to learn its traits'] };
  }
  if (kind === 'node') {
    let near = null;
    for (const t of ctx.world?.sites || []) { const d = Math.hypot(t.x - f.x, t.z - f.z); if (!near || d < near.d) near = { id: t.id, d: Math.round(d) }; }
    return { title: KIND_NAME[f.kind] || f.kind, lines: [`Richness ${f.richness} of 3`, near ? `Nearest site ${placeNo(near.id)}, ${near.d} away${near.d <= 600 ? ' (a town there could work it)' : ''}` : '', 'Gathering comes with town building'].filter(Boolean) };
  }
  if (kind === 'bridge' || kind === 'ford') return { title: `${kind === 'bridge' ? 'Bridge' : 'Ford'} ${f.id}`, lines: [`Crosses the ${(ctx.rivers || []).find(r => r.id === f.river)?.name || 'river'}`] };
  if (kind === 'pass') return { title: `Mountain pass ${f.id}`, lines: ['A way through the range'] };
  return { title: String(f.id || kind), lines: [] };
}

// Display number for camps and sites. Their ids (K12, S07) look like map grid squares (E12), so people see "no. 12".
export const placeNo = id => `no. ${parseInt(String(id).replace(/\D+/g, ''), 10) || id}`;
