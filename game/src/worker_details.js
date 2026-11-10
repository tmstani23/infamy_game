// Presentation queries over full simulation records or compact worker snapshots.
import {dirIndex} from './sim/geometry.js';
export function workerLocation(w,entities={},at=null) {
  const e=entities[w.entity];if(e)return [e.x,e.z];
  if(at?.[w.id])return at[w.id];   // per-tick position from the snapshot (sim_snapshot workerAt)
  if(w.location)return w.location;
  const t=w.trip;if(!t)return w.departure || null;
  if(w.elapsed>=t.out && w.elapsed<t.out+t.harvest)return t.destination;
  const returning=w.elapsed>=t.out+t.harvest,path=(returning?t.backPath:t.outPath) || (returning?[t.destination,t.origin]:[t.origin,t.destination]);
  const span=returning?t.back:t.out,f=Math.max(0,Math.min(1,span?(w.elapsed-(returning?t.out+t.harvest:0))/span:1));
  const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
  let left=lengths.reduce((a,b)=>a+b,0)*f;
  for(let i=0;i<lengths.length;i++){if(left<lengths[i])return path[i].map((v,k)=>v+(path[i+1][k]-v)*left/lengths[i]);left-=lengths[i];}
  return path.at(-1);
}
export function workerDetails(w,index) {
  const t=w.trip,resource=w.cargoResource || t?.resource || index?.get(w.spot)?.kind || '',cargo=w.carrying || 0;
  const harvesting=t && !t.kind && !cargo && w.elapsed>=t.out && w.elapsed<t.out+t.harvest;
  const left=harvesting?Math.max(0,t.out+t.harvest-w.elapsed):0;
  return {resource,cargo,harvesting,left:Math.ceil(left/20),progress:harvesting?Math.max(0,1-left/Math.max(1,t.harvest)):0,
    gathered:harvesting?(t.load || 0)*Math.max(0,1-left/Math.max(1,t.harvest)):cargo};
}
export function workerPresentation(w,s,data,entities={},at=null) {
  const live=entities[w.entity];if(live)return live;
  const p=workerLocation(w,entities,at) || [s.x,s.z],t=w.trip,returning=t && w.elapsed>=t.out+t.harvest;
  const harvesting=t && !t.kind && !returning && w.elapsed>=t.out;
  const dx=t?t.destination[0]-t.origin[0]:0,dz=t?t.destination[1]-t.origin[1]:1;
  return {id:`worker:${w.id}`,worker:w.id,workerOwner:s.owner,type:'civilian',model:data.workers.model,name:`Worker ${w.id}`,place:'world',
    x:p[0],z:p[1],hp:w.hp ?? data.workers.hp,maxHp:data.workers.hp,carrying:w.carrying,dir:dirIndex(dx*(returning?-1:1),dz*(returning?-1:1)),anim:t?harvesting?'hammer':'walk':'idle'};
}
// A war camp as a work site for the screen: { id: war id, camp: true, owner, x, z, workers }
export const campSitesOf=(frontier,owner)=>Object.values(frontier?.wars?.list || {}).filter(w=>w.attacker===owner && w.camp).map(w=>({id:w.id,camp:true,owner:w.attacker,x:w.camp.x,z:w.camp.z,workers:w.camp.workers || [],war:w}));
export function withWorkerPresentations(state,data,focus) {
  if(!data?.workers || focus?.place!=='world')return state;
  const entities={...state.entities};
  // a worker that is a live unit is drawn as that unit only: the 4 Hz frontier record can still name no entity
  // (or an old one) for a few ticks after it wakes, which drew a second, stepping copy on top (Tim 2026-11-05)
  const live=new Set(Object.values(state.entities).filter(e=>e.worker && !e.dead).map(e=>`${e.town}:${e.worker}`));
  // own war camps count as work sites too (workers carry the war id as their town)
  const sites=[...Object.values(state.frontier?.settlements || {}),...campSitesOf(state.frontier,focus.owner)];
  for(const s of sites)if(s.owner===focus.owner)for(const w of s.workers || []) {
    if(entities[w.entity] || live.has(`${s.id}:${w.id}`))continue;
    const e=workerPresentation(w,s,data,entities,state.workerAt);
    if(Math.hypot(e.x-focus.x,e.z-focus.z)<=data.workers.spawnRadius)entities[e.id]=e;
  }
  return {...state,entities};
}
