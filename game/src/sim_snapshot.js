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

export function createSnapshotEncoder(game, clan = 'player') {
  let previous = new Map(), previousGrid = null, sequence = 0;
  function encode({map = false, selected = [], events = {}} = {}) {
    const st = game.state, detail = new Set(selected), roots = pick(st, ROOTS);
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
      if (!map || e.owner === clan || detail.has(e.id) && game.vision.canSee(clan,e)) records.set('e:'+e.id,e);
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
    return {sequence:++sequence,tick:st.tick,map,set,remove,grid,gridFull,events,recordChars};
  }
  return {encode};
}

export function applySnapshot(game, packet) {
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
