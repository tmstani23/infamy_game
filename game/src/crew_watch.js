import {crewCommandGroup} from './sim/deployment_rally.js';
export function watchCrewGroup(state,owner,group,ids=null){
 const crew=Object.values(state.entities).filter(e=>e.owner===owner&&e.type!=='hero'&&!e.guard&&!e.dead&&!e.jailed&&!e.downed&&(ids?ids.includes(e.id):crewCommandGroup(state,e)===group));
 if(!crew.length)return null;
 const clusters=crew.map(p=>crew.filter(q=>q.place===p.place&&Math.hypot(q.x-p.x,q.z-p.z)<8));
 const best=clusters.reduce((a,b)=>b.length>a.length?b:a);
 return {id:best[0].id,x:best.reduce((n,e)=>n+e.x,0)/best.length,z:best.reduce((n,e)=>n+e.z,0)/best.length,place:best[0].place};
}
