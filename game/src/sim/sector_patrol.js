// Stable, reachable coverage points across the actual sector footprint. No
// random destination changes per frame, and no hidden enemy information.
export function rivalHQZones(state, owner) {
  return (state.hqCamping?.zones || []).filter(z=>z.owner!==owner);
}
export const nearRivalHQ = (state,owner,p,margin=3) => rivalHQZones(state,owner).some(z=>Math.hypot(p.x-z.x,p.z-z.z)<z.radius+margin);
export function sweepPatrolRoute(state,deployment,e,task){
  const grid=deployment.navFor({...e,place:'street',patrolPlanning:true});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const candidates=[task.objective,...sectorPatrolRoute(state,deployment,e,task)].filter(p=>p&&!nearRivalHQ(state,e.owner,p)&&(!deployment.patrolAllowed||deployment.patrolAllowed(p.x,p.z)));
  const diameter=Math.max(0,...candidates.flatMap(a=>candidates.map(b=>distance(a,b))));
  const spacing=Math.max(10,Math.min(26,diameter*.32)),points=[];
  // Greedy farthest-point coverage: maximize separation, not the first three
  // nearby patrol points. All legs must terminate on the requested safe point.
  while(points.length<3){
    const from=points.at(-1)||task.objective;
    const ranked=candidates.filter(p=>!points.includes(p)).sort((a,b)=>{
      const score=p=>points.length?Math.min(...points.map(q=>distance(p,q))):distance(p,task.objective);
      return score(b)-score(a);
    });
    const next=ranked.find(p=>{
      if(points.some(q=>distance(p,q)<spacing))return false;
      const end=grid?.findPath(from.x,from.z,p.x,p.z)?.at(-1);
      return end&&Math.hypot(end[0]-p.x,end[1]-p.z)<1;
    });
    if(!next)return [];
    points.push(next);
  }
  return points.map(p=>({...p,place:'street'}));
}
export function sectorPatrolRoute(state,deployment,e,task) {
  if(task.route?.length)return task.route;
  if(task.patrolPath)return task.patrolPath;
  const grid=deployment.navFor({...e,place:'street',patrolPlanning:true}),geometry=deployment.cellGrid?.();
  if(!grid||!geometry)return [task.objective];
  const {bounds,w,cell,cells}=geometry,label=state.deployment.sectors.findIndex(s=>s.id===e.deployment.group),points=[];
  for(let k=0;k<cells.length;k++)if(cells[k]===label&&(!deployment.patrolAllowed||deployment.patrolAllowed(bounds.minX+(k%w+.5)*cell,bounds.minZ+(Math.floor(k/w)+.5)*cell)))points.push({x:bounds.minX+(k%w+.5)*cell,z:bounds.minZ+(Math.floor(k/w)+.5)*cell});
  if(!points.length)return [task.objective];
  const extent=points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minZ:Math.min(b.minZ,p.z),maxZ:Math.max(b.maxZ,p.z)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
  const {minX,maxX,minZ,maxZ}=extent;
  const route=[],fractions=[[.15,.15],[.5,.12],[.85,.15],[.88,.5],[.85,.85],[.5,.88],[.15,.85],[.12,.5]];
  for(const [fx,fz]of fractions){
    const x=minX+(maxX-minX)*fx,z=minZ+(maxZ-minZ)*fz;
    const p=points.reduce((best,p)=>Math.hypot(p.x-x,p.z-z)<Math.hypot(best.x-x,best.z-z)?p:best,points[0]);
    if(nearRivalHQ(state,e.owner,p)||route.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<6))continue;
    const path=grid.findPath(task.objective.x,task.objective.z,p.x,p.z),end=path?.at(-1);
    if(end&&Math.hypot(end[0]-p.x,end[1]-p.z)<1)route.push(p);
  }
  return task.patrolPath=route.length?route:[task.objective];
}
