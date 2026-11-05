// Presentation protocol, not a save game. Never copies paths, AI planners or RNG.
export const EVENT_KEYS = ['hits','dodges','casts','heatGains','ryoGains','ryoLosses','policeNews','news'];
const ROOTS = ['tick','night','dawn','dusk','clock','businesses','interiorDoors','clans','season','deployment',
  'contracts','attacks','banditCamps','lightsOut','hqCamping','hqRaids','shakedowns','raidWindow',
  'formations','smokes','projectiles'];
const MARKER_FIELDS = ['id','type','model','owner','x','z','place','hp','maxHp','dead','downed','jailed',
  'hidden','cop','wild','guard','name','dir','attackTarget','swing','execute','angry'];
const pick = (value, keys) => Object.fromEntries(keys.filter(k => value[k] !== undefined).map(k => [k,value[k]]));

// Recursive replacement retains object identities captured by read-only sim helpers.
export function reconcile(target, source) {
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      reconcile(target[key], value);
    } else target[key] = value;
  }
  return target;
}

// What one clan may know of the frontier (plan F4.2): full records for its own towns, only
// { id, name, owner, region, site } for towns on discovered ground, roads with their state, its own
// shipments, its own receipts. Never the 500-entry ledger, totals or rival stock.
export const FRONTIER_EVERY = 5;
export function frontierFor(f, clan, discovery, recent, spotIndex, workerPosition) {
  const settlements = {};
  for (const [id, s] of Object.entries(f.settlements || {})) {
    if (s.owner === clan) settlements[id] = {...s,workers:(s.workers || []).map(w=>{
      const {trip,...record}=w;
      // Navigation paths belong to saves/simulation, never the 4 Hz presentation protocol.
      const summary=trip && Object.fromEntries(Object.entries(trip).filter(([k])=>!['outPath','backPath'].includes(k)));
      return {...record,...(trip?{trip:summary}:{}),...(workerPosition?{location:workerPosition(w) || w.departure || [s.x,s.z]}:{})};
    })};
    else if (s.capital || discovery?.siteDiscovered?.(clan, s.site)) settlements[id] = { id: s.id, name: s.name, owner: s.owner, region: s.region, site: s.site };
  }
  const spots = Object.fromEntries(Object.entries(f.spots || {}).filter(([id]) => {
    const p = spotIndex?.get(id);
    return p && discovery?.isDiscovered?.(clan, p.x, p.z);
  }));
  return { version: f.version, econTick: f.econTick, settlements, spots,
    roads: f.roads || {}, townOrder: f.townOrder?.[clan] || [],
    shipments: Object.fromEntries(Object.entries(f.shipments || {}).filter(([, h]) => h.owner === clan)),
    receipts: recent || (f.receipts || []).filter(r => r.clan === clan),
    siteClaims: f.siteClaims || {} };   // E1: claimed sites are shut in everyone's Choose site menu
}

export function createSnapshotEncoder(game, clan = 'player') {
  let previous = new Map(), previousGrid = null, sequence = 0, frontierView = null, frontierAt = -Infinity, recentReceipts = [], lastSeq = 0;
  // Receipts live one sim tick but the screen sees 4 Hz: keep this clan's last few so a rejection can be shown (called each tick).
  function observe() {
    for (const r of game.state.frontier?.receipts || []) if (r.clan === clan && r.seq > lastSeq) { lastSeq = r.seq; recentReceipts.push(r); }
    if (recentReceipts.length > 8) recentReceipts.splice(0, recentReceipts.length - 8);
  }
  function encode({map = false, selected = [], events = {}} = {}) {
    const st = game.state, detail = new Set(selected), roots = pick(st, ROOTS);
    // Island discovery (frontier W2.3): only this clan's fog, scouted sites and last-seen markers, never another clan's.
    if (st.world) roots.world = { discovered: {[clan]: st.world.discovered?.[clan] ?? null}, scouted: {[clan]: st.world.scouted?.[clan] || []}, lastSeen: {[clan]: st.world.lastSeen?.[clan] || {}}, pins: {[clan]: st.world.pins?.[clan] || []}, camps:game.worldCamps?.viewFor(clan) || {} };
    // Frontier towns (F2.4b readout; F4.2 filters per owner): everything but the 500-entry display ledger.
    // F4.2: per clan and at 4 Hz (every 5th tick, the encoder keeps the last view between).
    if (st.influence) roots.influence = { [clan]: st.influence[clan] || null };   // C4: own Influence only
    if (st.lieutenants) roots.lieutenants = { [clan]: st.lieutenants[clan] || null };   // C3: own standing orders and log only
    if (st.frontier) {
      if (!frontierView || st.tick - frontierAt >= FRONTIER_EVERY || st.tick < frontierAt) { const workers=game.frontier?.modules?.find(m => m.name === 'workers')?.workers; frontierView = structuredClone(frontierFor(st.frontier, clan, game.discovery, recentReceipts, workers?.index,workers?.position)); frontierAt = st.tick; }
      roots.frontier = frontierView;
      // Sleeping workers move every tick but the frontier view is 4 Hz: send just their positions each tick so
      // they glide on screen instead of stepping 4 times a second (Tim 2026-11-05 "morse code" workers).
      if (!map) {
        const workers = game.frontier?.modules?.find(m => m.name === 'workers')?.workers, at = {};
        if (workers?.position) for (const s of Object.values(st.frontier.settlements || {})) if (s.owner === clan) for (const w of s.workers || [])
          { const e = st.entities[w.entity], p = e ? [e.x, e.z] : workers.position(w); if (p) at[w.id] = [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]; }   // every worker, live or asleep, so the camera can follow any of them per tick
        roots.workerAt = at;
      }
    }
    if (map) {
      // No world VFX, rival orders or rival deployment records on the map.
      delete roots.formations; delete roots.smokes; delete roots.projectiles;
      roots.deployment = {...st.deployment, clans: {[clan]:st.deployment.clans[clan]}};
      roots.clans = Object.fromEntries(Object.entries(st.clans).map(([id,c])=>[id,id===clan?c:
        pick(c,['id','name','color','kind','faction','bot','renown','raidPoints'])]));
      if(st.contracts) roots.contracts = {board:st.contracts.board,active:{[clan]:st.contracts.active[clan]},
        readyAt:{[clan]:st.contracts.readyAt?.[clan]}};
    }
    const records = new Map(Object.entries(roots).map(([k,v])=>['s:'+k,v]));
    for (const e of Object.values(st.entities)) {
      if (!map || e.owner === clan || e.workerOwner === clan || detail.has(e.id) && game.vision.canSee(clan,e)) records.set('e:'+e.id,e);
      else if (game.vision.canSee(clan,e)) records.set('e:'+e.id,pick(e,MARKER_FIELDS));
      // Contracts need rival hero identity, never their unobserved position.
      else if(e.type==='hero') records.set('e:'+e.id,pick(e,['id','type','model','owner','hidden','dead','downed','jailed']));
    }
    const set = [], remove = [], next = new Map();let recordChars=0;
    for(const [key,value] of records){
      const signature=JSON.stringify(value); next.set(key,signature);
      if(previous.get(key)!==signature){set.push([key,value]);recordChars+=signature?.length||0;}
    }
    for(const key of previous.keys())if(!next.has(key))remove.push(key);
    previous=next;
    const g=game.vision.grid(clan), changes=[];
    const initialGrid=!previousGrid;
    previousGrid ||= new Uint8Array(g.visible.length);
    for(let i=0;i<g.visible.length;i++){
      const packed=g.visible[i]|g.explored[i]<<1;
      if(initialGrid||previousGrid[i]!==packed)changes.push(i,packed);
      previousGrid[i]=packed;
    }
    const gridFull=changes.length*4>previousGrid.length;
    const grid=gridFull?previousGrid.slice():Uint32Array.from(changes);
    // full: the first packet of an encoder carries everything (a new match or a loaded save)
    return {sequence:++sequence,tick:st.tick,map,set,remove,grid,gridFull,events,recordChars,full:initialGrid};
  }
  return {encode,observe};
}

export function applySnapshot(game, packet) {
  // A full packet replaces the replica's units, so ones missing from a loaded save disappear.
  if(packet.full){const keep=new Set(packet.set.map(([k])=>k));for(const id of Object.keys(game.state.entities))if(!keep.has('e:'+id))delete game.state.entities[id];}
  for(const key of packet.remove){const [kind,id]=key.split(':');delete (kind==='e'?game.state.entities:game.state)[id];}
  for(const [key,value] of packet.set){
    const kind=key.slice(0,2),id=key.slice(2),root=kind==='e:'?game.state.entities:game.state;
    if(value&&typeof value==='object'&&!Array.isArray(value))root[id]=reconcile(root[id]||{},value);
    else root[id]=value;
  }
  for(const key of EVENT_KEYS)game.state[key]=packet.events[key]||[];
  const grid=game.vision.grid('player');
  if(packet.gridFull){
    for(let i=0;i<packet.grid.length;i++){grid.visible[i]=packet.grid[i]&1;grid.explored[i]=packet.grid[i]>>1;}
  }else for(let i=0;i<packet.grid.length;i+=2){const n=packet.grid[i],v=packet.grid[i+1];grid.visible[n]=v&1;grid.explored[n]=v>>1;}
  game.territory.refresh();
}
