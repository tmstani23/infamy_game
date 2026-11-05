// Presentation queries over full simulation records or compact worker snapshots.
import {dirIndex} from './sim/geometry.js';
export function workerLocation(w,entities={}) {
  const e=entities[w.entity];if(e)return [e.x,e.z];
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
export function workerPresentation(w,s,data,entities={}) {
  const live=entities[w.entity];if(live)return live;
  const p=workerLocation(w,entities) || [s.x,s.z],t=w.trip,returning=t && w.elapsed>=t.out+t.harvest;
  const harvesting=t && !t.kind && !returning && w.elapsed>=t.out;
  const dx=t?t.destination[0]-t.origin[0]:0,dz=t?t.destination[1]-t.origin[1]:1;
  return {id:`worker:${w.id}`,worker:w.id,workerOwner:s.owner,type:'civilian',model:data.workers.model,name:`Worker ${w.id}`,place:'world',
    x:p[0],z:p[1],hp:w.hp ?? data.workers.hp,maxHp:data.workers.hp,carrying:w.carrying,dir:dirIndex(dx*(returning?-1:1),dz*(returning?-1:1)),anim:t?harvesting?'attack':'walk':'idle'};
}
export function withWorkerPresentations(state,data,focus) {
  if(!data?.workers || focus?.place!=='world')return state;
  const entities={...state.entities};
  for(const s of Object.values(state.frontier?.settlements || {}))if(s.owner===focus.owner)for(const w of s.workers || []) {
    if(entities[w.entity])continue;
    const e=workerPresentation(w,s,data,entities);
    if(Math.hypot(e.x-focus.x,e.z-focus.z)<=data.workers.spawnRadius)entities[e.id]=e;
  }
  return {...state,entities};
}
