import { modeRules } from '../modes/index.js';
// Saved worker records, integer-tick trips, ground clearing and nearby civilian units.
// Stock/population still have one writer (world.js); no camera, DOM or Math.random.
import { makeSpotIndex, spotState, spotYield, regrowSpot } from '../resource_spots.js';
import { cellToWorld, worldToCell, townBlockersIn } from './town_grid.js';
import { dirIndex, blockOffset } from '../geometry.js';
import { isFull } from './storage.js';
import { workerCap, nextTier } from './tiers.js';
import { workerCount } from './people.js';
const HZ=20;
export function ensureWorkers(s) {
  s.workers ||= []; s.workerTraining ||= [];
  for(const w of s.workers)if(w.carrying>0 && !w.cargoResource && w.trip?.resource)w.cargoResource=w.trip.resource;
}
const result = reason => ({ok:!reason,reason:reason || ''});
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const compare = (a,b) => a===b ? 0 : a<b ? -1 : 1;   // deterministic, independent of browser/server locale

export function createWorkers({state,data,world,spotData=null,spotRules=null}) {
  const R=data.workers, index=makeSpotIndex(spotData || {spots:[],byChunk:{},chunkSize:250});
  let runtime=null;
  const paths=new Map(),waiting=new Map();
  let geometry='',geometryAt=-1,geometryState=null,revision=0;
  function geometryRevision() {
    if(geometryAt!==state.tick || geometryState!==state.frontier) {
      const next=JSON.stringify(towns().map(s=>[s.id,s.grid?.use,s.grid?.zone,s.grid?.stage,s.buildings.map(b=>[b.id,b.stage])]));
      if(next!==geometry || geometryState!==state.frontier){geometry=next;revision++;waiting.clear();paths.clear();}
      geometryAt=state.tick;geometryState=state.frontier;
    }
    return revision;
  }
  const townBlocked = (x,z) => townBlockersIn(state.frontier,x,z,x,z,data).length>0;
  function waitingPoint(s,w,building=null) {
    const origin=building ? point(s,building) : [s.x,s.z];
    if (!runtime || !s.grid || !s.roadReserve && !townBlocked(...origin)) return origin;
    const key=building && `${s.id}:${building.id}:${geometryRevision()}`;
    if(key && waiting.has(key))return waiting.get(key);
    const candidates=[];
    const search=R.spawnSearchCells || 3;
    for(let dz=-search;dz<=search;dz++)for(let dx=-search;dx<=search;dx++) {
      const p=[origin[0]+dx*s.grid.cell,origin[1]+dz*s.grid.cell];
      const i=worldToCell(s,...p);
      if(i<0 || s.grid.ground[i]==='x' || s.grid.zone[i]!=='.' || townBlocked(...p))continue;
      const occupied=!building && s.workers.some(other=>other!==w && other.departure && distance(other.departure,p)<1);
      candidates.push({p,d:dx*dx+dz*dz,occupied});
    }
    candidates.sort((a,b)=>Number(a.occupied)-Number(b.occupied) || a.d-b.d || b.p[1]-a.p[1] || b.p[0]-a.p[0]);
    // Query the planning grid, not loaded chunks: the same town must choose the same
    // waiting/drop-off point while asleep, including training ordered from the map.
    const found=candidates.find(({p}) => {
      const route=runtime.areas.nav.workerPath(...p,...p,townBlocked);
      return route && distance(route[0],p)<1;
    })?.p || origin;
    if(key)waiting.set(key,found);
    return found;
  }
  function attach(services) { runtime=services.areas ? services : null; }
  function path(a,b) {
    if(!runtime)return [a,b];
    const key=JSON.stringify([a,b,geometryRevision()]);
    if(paths.has(key))return paths.get(key);
    let p=runtime.areas.nav.workerPath(...a,...b,townBlocked);
    if(p && distance(a,p[0])>1e-6 && runtime.areas.nav.clearLine(...a,...p[0]))p=[a,...p];
    paths.set(key,p);if(paths.size>R.pathCacheSize)paths.delete(paths.keys().next().value);
    return p;
  }
  const length=p=>p.slice(1).reduce((n,v,i)=>n+distance(p[i],v),0);
  function along(p,f) {
    let left=length(p)*Math.max(0,Math.min(1,f));
    for(let i=1;i<p.length;i++) {
      const d=distance(p[i-1],p[i]);
      if(d && left<d)return p[i-1].map((v,k)=>v+(p[i][k]-v)*left/d);
      left-=d;
    }
    return [...p.at(-1)];
  }
  function suspend(w) {
    const e=state.entities?.[w.entity];
    if(e) {w.hp=e.hp;runtime.remove(e.id);}
    w.entity=null;
  }
  function wake(w,p,s) {
    w.entity=runtime.spawn('civilian',R.model,...p,{place:'world',area:'world',worker:w.id,town:s.id,workerOwner:s.owner,holdFire:true,hp:w.hp ?? R.hp,maxHp:R.hp,carrying:w.carrying,phase:w.phase});
  }
  const towns=()=>Object.values(state.frontier.settlements).filter(s=>!s.capital);
  const has=s=>!!s.workers?.length;
  const on=s=>!!R && Number.isFinite(s.x) && Number.isFinite(s.z);
  const walkTicks=d=>Math.ceil(d/R.speed*HZ);
  const point=(s,b)=>s.grid && Number.isInteger(b.cell) ? cellToWorld(s,b.cell) : [s.x,s.z];
  const dropoffs=s=>s.buildings.filter(b=>b.stage==='built' && R.dropoffs.includes(b.type));
  function nearestDropoff(s,spot) {
    return dropoffs(s).map(b=>({b,p:waitingPoint(s,null,b)})).sort((a,b)=>distance(a.p,[spot.x,spot.z])-distance(b.p,[spot.x,spot.z]) || compare(a.b.id,b.b.id))[0] || null;
  }
  function eligible(s,id) {
    const spot=index.get(id);
    return spot && R.resources[spot.kind] && distance([s.x,s.z],[spot.x,spot.z])<=R.range ? spot : null;
  }
  function train(s,count) {
    if(!on(s))return result('no town position');
    if(!Number.isSafeInteger(count) || count<1)return result('count must be a positive integer');
    if(!s.buildings.some(b=>b.type==='town_hall' && b.stage==='built'))return result('needs a town hall');
    if(s.pop<count*R.personCost)return result('not enough people');
    if(s.pop-count*R.personCost < (data.opening?.reservePeople || 0))return result('keep one townsperson for food and construction');
    if(s.stock.ryo<count*R.cost)return result('cannot afford workers');
    if((s.stock.goods || 0)<count*(R.goodsCost || 0))return result('not enough goods');
    if(workerCount(s)+count>workerCap(s,data))return result('town hall tier worker limit');
    ensureWorkers(s);
    world.change(s.id,'ryo',-count*R.cost,'train');if(R.goodsCost)world.change(s.id,'goods',-count*R.goodsCost,'train');world.changePop(s.id,-count*R.personCost,'train');
    let readyAt=Math.max(state.tick || 0,s.workerTraining.at(-1)?.readyAt || 0);
    for(let i=0;i<count;i++)s.workerTraining.push({id:world.newId('w'),readyAt:readyAt+=R.trainTicks});
    return result();
  }
  function assign(s,ids,id,by='p') {
    if(!on(s))return result('no town position');
    if(!Array.isArray(ids) || !ids.length || new Set(ids).size!==ids.length || ids.some(id=>typeof id!=='string'))return result('workers must list each id once');
    const selected=ids.map(id=>s.workers?.find(w=>w.id===id));
    if(selected.some(w=>!w))return result('unknown worker');
    const spot=eligible(s,id);if(!spot)return result(index.get(id)?'spot outside work range':'unknown spot');
    if(!nearestDropoff(s,spot))return result('no drop-off');
    const returns=new Map();
    for(const w of selected)if(w.carrying>0) {
      const plan=returnPlan(s,w);if(!plan?.route || !plan.resource)return result('No walking route to a resource drop-off');
      returns.set(w,plan);
    }
    // A new harvest assignment returns existing cargo before collecting another resource.
    for(const w of selected) {
      w.by=by;
      delete w.order;delete w.nextOrder;delete w.status;delete w.retryAt;
      if(w.carrying>0){setReturnTrip(w,returns.get(w));w.nextSpot=spot.id;}
      else { w.departure=position(w) || w.departure || (runtime ? [s.x,s.z] : null);w.spot=spot.id;w.trip=null;w.elapsed=0;w.phase=0;w.dropoff=null;delete w.project; }
    }
    return result();
  }
  function assignIdle(s) {
    if(!on(s) || !has(s))return;
    const spots=index.spotsNear(s.x,s.z,R.range).filter(p=>R.resources[p.kind]);
    const resources=[...new Set(Object.values(R.resources))].filter(r=>!isFull(s,data,r)).sort((a,b)=>s.stock[a]-s.stock[b] || compare(a,b));
    for(const w of s.workers) {
      // B2: governor-placed workers on a full resource are moved; the player's own picks stay put.
      const stuck=w.by==='g' && w.spot && !w.carrying && !w.trip && w.status==='Store full';
      if((w.spot && !stuck) || w.project || w.order || w.by==='p')continue;
      const spot=resources.map(r=>spots.filter(p=>R.resources[p.kind]===r).sort((a,b)=>distance([s.x,s.z],[a.x,a.z])-distance([s.x,s.z],[b.x,b.z]) || compare(a.id,b.id))[0]).find(Boolean);
      if(spot)assign(s,[w.id],spot.id,'g');
    }
  }
  // Tim 2026-11-05 (self-running governor): move one governor-placed worker per call from a well stocked
  // resource to the lowest one that needs hands (the player's own picks never move).
  function rebalance(s) {
    if(!on(s) || !has(s))return;
    const res=w=>R.resources[index.get(w.spot)?.kind],mine=s.workers.filter(w=>w.by!=='p' && w.spot && !w.order && !w.project && !w.trip?.kind);
    const kinds=[...new Set(Object.values(R.resources))].filter(r=>!isFull(s,data,r));
    if(kinds.length<2)return;
    const count=r=>s.workers.filter(w=>w.spot && res(w)===r).length;
    // compare stocks against what the town is saving for (the next hall upgrade), so no resource is starved
    const goal=nextTier(s,data)?.upgrade?.cost || {},fill=r=>(s.stock[r] || 0)/Math.max(50,goal[r] || 200);
    const low=[...kinds].sort((a,b)=>fill(a)-fill(b) || compare(a,b))[0];
    const met=r=>fill(r)>=1 && fill(low)<1;   // a resource already at its goal gives hands to one still short
    const donor=kinds.filter(r=>r!==low && (met(r) ? count(r)>0 : fill(r)>fill(low)*2+0.1 && count(r)>(count(low)===0?0:count(low)+1)))
      .sort((a,b)=>count(b)-count(a) || compare(a,b))[0];
    if(!donor)return;
    const w=mine.filter(w=>res(w)===donor).sort((a,b)=>(a.carrying || 0)-(b.carrying || 0) || compare(a.id,b.id))[0];if(!w)return;
    const spots=index.spotsNear(s.x,s.z,R.range).filter(p=>R.resources[p.kind]===low).sort((a,b)=>distance([s.x,s.z],[a.x,a.z])-distance([s.x,s.z],[b.x,b.z]) || compare(a.id,b.id));
    if(spots[0])assign(s,[w.id],spots[0].id,'g');
  }
  function start(s,w,spot) {
    const drop=nearestDropoff(s,spot);if(!drop)return false;
    const backPath=path([spot.x,spot.z],drop.p);
    const outPath=path(w.departure || drop.p,[spot.x,spot.z]);
    if(!outPath || !backPath) { w.status='No walking route to resource'; return false; }
    const out=walkTicks(length(outPath)),back=walkTicks(length(backPath));
    const stages=spotRules?.stages, saved=state.frontier.spots?.[spot.id];
    const harvest=stages ? Math.ceil(R.harvestTicks*spot.pieces.length/spotYield(spot,saved,stages)) : R.harvestTicks;
    w.trip={origin:backPath.at(-1),destination:outPath.at(-1),outPath,backPath,out,harvest,back,total:Math.max(1,out+back+harvest),resource:R.resources[spot.kind],load:R.load,harvested:false};
    delete w.departure;
    w.dropoff=drop.b.id;w.elapsed=0;w.phase=0;return true;
  }
  const currentPoint=w=>{
    const e=state.entities?.[w.entity];
    return e ? [e.x,e.z] : position(w) || w.departure;
  };
  const cargoType=w=>w.cargoResource || w.trip?.resource || R.resources[index.get(w.spot)?.kind];
  function returnPlan(s,w) {
    const here=currentPoint(w) || [s.x,s.z],drop=nearestDropoff(s,{x:here[0],z:here[1]});
    return {here,drop,route:drop && path(here,drop.p),resource:cargoType(w)};
  }
  function setReturnTrip(w,{here,drop,route,resource}) {
    const back=walkTicks(length(route));w.cargoResource=resource;
    w.trip={kind:'return',origin:route.at(-1),destination:here,backPath:route,out:0,harvest:0,back,total:Math.max(1,back),resource,load:w.carrying,harvested:true};
    w.dropoff=drop.b.id;w.elapsed=0;w.phase=0;
  }
  function moveTrip(route) {
    const target=route.at(-1),out=Math.max(1,walkTicks(length(route)));
    return {kind:'move',origin:target,destination:target,outPath:route,backPath:[target,target],out,harvest:0,back:0,total:out,load:0,harvested:true};
  }
  function workerOrder(s,ids,kind,{x,z,group,confirm}={}) {
    if(!Array.isArray(ids) || !ids.length || new Set(ids).size!==ids.length)return result('workers must list each id once');
    const selected=ids.map(id=>s.workers?.find(w=>w.id===id));
    if(selected.some(w=>!w))return result('unknown worker');
    if(kind==='drop') {
      if(confirm!==true)return result('Confirm: dropped resources are permanently lost');
      for(const w of selected) {
        const here=currentPoint(w) || [s.x,s.z];w.carrying=0;w.spot=null;w.trip=null;w.elapsed=0;w.phase=0;w.departure=here;w.order={kind:'hold'};w.by='p';
        delete w.cargoResource;delete w.nextSpot;delete w.nextOrder;delete w.project;delete w.status;delete w.retryAt;
      }
      return result();
    }
    if(kind==='return') {
      const loaded=selected.filter(w=>w.carrying>0);if(!loaded.length)return result('No carried resources to return');
      const plans=loaded.map(w=>({w,...returnPlan(s,w)}));
      if(plans.some(p=>!p.route || !p.resource))return result('No walking route to a resource drop-off');
      for(const plan of plans) {
        const {w}=plan;setReturnTrip(w,plan);w.nextOrder={kind:'hold'};w.by='p';
        delete w.order;delete w.nextSpot;delete w.project;delete w.status;delete w.retryAt;
      }
      return result();
    }
    if(kind==='group') {
      if(!Number.isInteger(group) || group<0 || group>(R.groups || 4))return result('invalid worker group');
      for(const w of selected)w.group=group;
      return result();
    }
    if(!['move','hold'].includes(kind))return result('unknown worker order');
    if(kind==='move' && (!Number.isFinite(x) || !Number.isFinite(z)))return result('invalid move position');
    const targets=[];
    const plans=selected.map((w,i)=>{
      const here=currentPoint(w) || [s.x,s.z];
      const offset=blockOffset(i,selected.length,R.moveSpacing),goal=[x+offset[0],z+offset[1]];
      const route=kind==='move' ? path(here,goal) : null;
      if(route && targets.some(p=>distance(p,route.at(-1))<(R.moveSpacing || 1)-1e-6))return {w,here,route:null};
      if(route)targets.push(route.at(-1));
      return {w,here,route};
    });
    if(kind==='move' && plans.some(p=>!p.route))return result('no walking route to that position');
    for(const {w,here,route} of plans) {
      w.by='p';delete w.project;delete w.nextSpot;delete w.status;delete w.retryAt;
      if(w.carrying>0)w.cargoResource=cargoType(w);
      if(kind==='hold') {w.order={kind:'hold'};delete w.nextOrder;w.departure=here;}
      else {
        w.order={kind,target:route.at(-1)};w.spot=null;w.dropoff=null;delete w.nextOrder;
        w.trip=moveTrip(route);w.elapsed=0;w.phase=0;w.departure=here;
      }
    }
    return result();
  }
  // Replan a stalled saved route from the actual position. Preserve its harvested cargo.
  function reroute(s,w) {
    const here=currentPoint(w);if(!here)return false;
    // (no shared paths.clear(): one stuck worker replanning every tick made every worker re-search its routes)
    if(w.order?.kind==='move') {
      const route=path(here,w.order.target);if(!route)return false;
      w.trip=moveTrip(route);w.elapsed=0;w.phase=0;return true;
    }
    if(w.carrying>0) {
      const plan=returnPlan(s,w);if(!plan.route || !plan.resource)return false;
      setReturnTrip(w,plan);return true;
    }
    w.departure=here;w.trip=null;w.elapsed=0;w.phase=0;
    const spot=index.get(w.spot);return !!spot && start(s,w,spot);
  }
  function progress(s,w) {
    if(w.retryAt>state.tick)return false;
    if(walk(w,w.elapsed+1)) {delete w.status;delete w.stuckTries;return true;}
    // replan at most once a second per worker; if the new route still can't start, step onto it (stuck on a tree/rock)
    if(w.rerouteAt>state.tick) {w.status ||= 'Stuck';return false;}
    w.rerouteAt=state.tick+(R.rerouteTicks || 20);
    if(reroute(s,w) && (walk(w,w.elapsed+1) || unstick(w) && walk(w,w.elapsed+1))) {delete w.status;delete w.stuckTries;return true;}
    // Tim 2026-11-05: after stuckGiveUp failed tries, jump to open ground further away; if that fails too, back to a drop-off, idle
    if((w.stuckTries=(w.stuckTries || 0)+1)>=(R.stuckGiveUp || 3)) {
      w.stuckTries=0;
      if(unstick(w,R.rescueReach || 25) && reroute(s,w) && walk(w,w.elapsed+1)) {delete w.status;return true;}
      rescue(s,w);return false;
    }
    w.status='Route blocked';w.retryAt=state.tick+(R.retryTicks || 100);return false;
  }
  // Give up on a route: the worker appears at the nearest drop-off, hands in its cargo and goes idle (governor may reassign).
  function rescue(s,w) {
    const here=currentPoint(w) || [s.x,s.z],drop=nearestDropoff(s,{x:here[0],z:here[1]});
    const at=drop?.p || [s.x,s.z],res=cargoType(w);
    if(w.carrying>0 && res) {world.change(s.id,res,w.carrying,'gather');s.workerIncome ||= {};s.workerIncome[res]=(s.workerIncome[res] || 0)+w.carrying;}
    w.carrying=0;delete w.cargoResource;w.trip=null;w.elapsed=0;w.phase=0;w.departure=[...at];w.spot=null;
    if(w.order?.kind==='move')w.order={kind:'hold'};
    const e=state.entities?.[w.entity];if(e) {[e.x,e.z]=at;e.carrying=0;}
    w.status='Was stuck: back at drop-off';w.retryAt=state.tick+(R.retryTicks || 100);
  }
  function unstick(w,reach=R.unstickReach || 4) {
    const e=state.entities?.[w.entity],p=position({...w,elapsed:Math.max(0,w.elapsed)});if(!e || !p)return false;
    const spot=runtime.areas.nav.free(...p) ? p : runtime.areas.nav.nearestFree(...p);
    if(!spot || distance([e.x,e.z],spot)>reach)return false;
    [e.x,e.z]=spot;return true;
  }
  function position(w) {
    const t=w.trip;if(!t)return null;
    if(w.elapsed<t.out) return along(t.outPath || [t.origin,t.destination],w.elapsed/t.out);
    if(w.elapsed<t.out+t.harvest)return [...t.destination];
    const f=t.back ? Math.min(1,(w.elapsed-t.out-t.harvest)/t.back):1;
    return along(t.backPath || [t.destination,t.origin],f);
  }
  // Move along each cached corner, checking the live navigation grid. Advance the trip clock
  // only when the walking unit arrives; an attack/stun cannot produce stock remotely.
  function walk(w,next) {
    const e=state.entities?.[w.entity];if(!e)return true;
    e.anim='idle';
    if(e.stunnedUntil>state.tick || e.buffs?.stunned?.until>state.tick)return false;
    const t=w.trip, old=w.elapsed;
    const p=next<=t.out ? t.outPath : next>t.out+t.harvest ? t.backPath : null;
    const target=position({...w,elapsed:next});
    if(!target)return true;
    // Check the planned legs this step touches with the planner's own line test (Tim 2026-11-05 mini-freeze fix):
    // testing entity -> interpolated point sampled the grid differently, so lines the planner passed clipped tree
    // corners, the worker froze up to a second and hopped. A leg is checked once per town geometry revision.
    if(p) {
      const duration=next<=t.out?t.out:t.back,offset=next<=t.out?0:t.out+t.harvest,total=length(p);
      const from=total*Math.max(0,old-offset)/duration,to=total*(next-offset)/duration,rev=geometryRevision();
      let d=0;
      for(let i=1;i<p.length;i++) {
        const a=d;d+=distance(p[i-1],p[i]);
        if(d<from || a>to)continue;
        const key=`${rev}|${p===t.outPath?'o':'b'}${i}`;
        if(t.legOk?.[key])continue;
        if(!runtime.areas.nav.clearLine(...p[i-1],...p[i]))return false;
        (t.legOk ||= {})[key]=1;
      }
    }
    const dx=target[0]-e.x,dz=target[1]-e.z;
    if(dx || dz) {e.dir=dirIndex(dx,dz);e.anim='walk';}
    [e.x,e.z]=target;return true;
  }
  function harvest(spot) {
    if(!spotRules?.stages)return;
    const saved=state.frontier.spots ||= {}, chars=spotState(spot,saved[spot.id]);
    const i=chars.indexOf('f')>=0 ? chars.indexOf('f'):chars.indexOf('s');
    if(i>=0)saved[spot.id]=chars.slice(0,i)+'h'+chars.slice(i+1);
  }
  function gather(s,w) {
    const spot=eligible(s,w.spot);
    if(!spot && w.trip?.kind!=='return') { if(!w.carrying) {w.spot=null;w.trip=null;w.phase=0;} return; }
    if(!w.trip) {
      if(w.retryAt>state.tick)return;
      // B2: a full store sends nobody out; the worker waits (Idle tab, governor may move it).
      if(spot && isFull(s,data,R.resources[spot.kind])) {w.status='Store full';w.retryAt=state.tick+(R.retryTicks || 100);return;}
      if(w.status==='Store full')delete w.status;
      if(!start(s,w,spot)) {w.retryAt=state.tick+(R.retryTicks || 100);return;}
    }
    // Removing a storehouse reroutes a carried load; it never unloads into a vanished building.
    if(!dropoffs(s).some(b=>b.id===w.dropoff)) {
      if(!w.carrying) {w.trip=null;return;}
      const drop=nearestDropoff(s,spot || {x:currentPoint(w)[0],z:currentPoint(w)[1]});if(!drop)return;
      const here=position(w),backPath=path(here,drop.p);if(!backPath)return;
      const back=walkTicks(length(backPath));
      w.dropoff=drop.b.id;w.trip={...w.trip,origin:backPath.at(-1),destination:here,backPath,outPath:null,out:0,harvest:0,back,total:Math.max(1,back),harvested:true};w.elapsed=0;
    }
    if(!progress(s,w))return;
    const t=w.trip;w.elapsed++;
    const e=state.entities?.[w.entity];
    if(e && !t.kind && !t.harvested && w.elapsed>=t.out)e.anim='attack';
    if(!t.harvested && w.elapsed>=t.out+t.harvest) {harvest(spot);w.carrying=t.load;w.cargoResource=t.resource;t.harvested=true;if(e)e.harvestedAt=state.tick;}
    w.phase=Math.min(1,w.elapsed/t.total);
    if(w.elapsed>=t.total) {
      if(w.carrying) {
        world.change(s.id,t.resource,w.carrying,'gather');s.workerIncome ||= {};s.workerIncome[t.resource]=(s.workerIncome[t.resource] || 0)+w.carrying;
        const log=s.workerLog ||= [];
        log.push({tick:state.tick,worker:w.id,resource:t.resource,amount:w.carrying,dropoff:w.dropoff});
        const limit=R.logEntries || 64;
        if(log.length>limit)log.splice(0,log.length-limit);
      }
      w.deliveries=(w.deliveries || 0)+1;w.carrying=0;w.phase=0;w.elapsed=0;w.trip=null;
      delete w.cargoResource;
      if(runtime || t.kind==='return')w.departure=[...t.origin];
      if(w.nextSpot) {w.spot=w.nextSpot;delete w.nextSpot;}
      if(w.nextOrder) {const next=w.nextOrder;delete w.nextOrder;workerOrder(s,[w.id],next.kind,next);}
    }
  }
  function clear(s) {
    const p=s.projects.find(p=>p.authorized && p.phase==='clearing');
    for(const w of s.workers)if(w.project && w.project!==p?.id)delete w.project;
    if(!p)return new Set();
    const cells=p.cells || [p.cell], over=()=>cells.filter(i=>s.grid.ground[i]==='o');
    if(!over().length) {p.phase='cleared';return new Set();}
    const selected=s.workers.filter(w=>w.project===p.id).slice(0,data.rates.maxBuilders);
    for(const w of s.workers)if(selected.length<data.rates.maxBuilders && !selected.includes(w) && !w.carrying && !w.order) {
      w.departure=position(w) || w.departure || (runtime ? [s.x,s.z] : null);
      w.project=p.id;w.trip=null;w.phase=0;w.elapsed=0;selected.push(w);
    }
    if(!selected.length)return new Set();
    p.clearWork=(p.clearWork || 0)+selected.length;
    let left=over();
    while(left.length && p.clearWork>=R.clearTicks) {
      const i=left.shift();s.grid.ground=s.grid.ground.slice(0,i)+'c'+s.grid.ground.slice(i+1);p.clearWork-=R.clearTicks;
    }
    if(!left.length) {p.phase='cleared';delete p.clearWork;for(const w of selected)delete w.project;}
    return new Set(selected);
  }
  function tick() {
    if(!R)return;
    const enabled=runtime && modeRules(state).island;
    const anchors=enabled ? Object.values(state.entities).filter(e=>e.place==='world' && !e.worker && !e.worldCamp && e.type!=='civilian' && e.owner && !e.dead && !e.downed && !e.jailed) : [];
    const near=p=>p && anchors.some(e=>distance(p,[e.x,e.z])<=R.spawnRadius);
    let spawned=0;
    for(const s of towns()) {
      ensureWorkers(s);if(!on(s))continue;
      // A disappeared/knocked-out live unit is a casualty, never a fresh spawn. Sleeping
      // records have entity:null, so they cannot be attacked or accidentally lost.
      s.workers=s.workers.filter(w=>{
        if(w.entity===null)return true;
        const e=state.entities?.[w.entity];
        if(!e || e.dead || e.downed || e.hp<=0) {if(e)runtime?.remove(e.id);return false;}
        return true;
      });
      while(s.workerTraining.length && s.workerTraining[0].readyAt<=(state.tick || 0)) {
        const job=s.workerTraining.shift(),w={id:job.id,spot:null,dropoff:null,phase:0,carrying:0,entity:null,elapsed:0,trip:null};
        if(enabled)w.departure=waitingPoint(s,w);
        s.workers.push(w);
      }
      const busy=clear(s);
      for(const w of s.workers) {
        if(enabled && s.roadReserve && !w.order && !w.trip && !w.spot && !w.project && (!w.departure || townBlocked(...w.departure))) {
          w.departure=waitingPoint(s,w);
          const e=state.entities?.[w.entity];if(e)[e.x,e.z]=w.departure;
        }
        const project=s.projects.find(p=>p.id===w.project);
        const resting=w.departure || (project ? point(s,project) : [s.x,s.z]);
        const p=position(w) || resting;
        const awake=enabled && near(p);
        if(w.entity!==null && !awake)suspend(w);
        if(w.order?.kind==='move' && w.trip) {
          if(progress(s,w)) {
            w.elapsed++;w.phase=Math.min(1,w.elapsed/w.trip.total);
            if(w.elapsed>=w.trip.total) {w.departure=[...w.trip.destination];w.trip=null;w.order={kind:'hold'};w.phase=0;}
          }
        } else if(!w.order && !busy.has(w) && !w.project && (w.spot || w.trip?.kind==='return'))gather(s,w);
        else if(state.entities?.[w.entity])state.entities[w.entity].anim='idle';
        const current=position(w) || resting,e=state.entities?.[w.entity];
        if(e) {
          if(!near([e.x,e.z]) || !awake)suspend(w);
          else {e.carrying=w.carrying;e.phase=w.phase;}
        } else if(awake && near(current) && spawned<R.spawnPerTick && runtime.areas.nav.free(...current)) {wake(w,current,s);spawned++;}
      }
    }
  }
  function econTick() {
    if(!R || !spotRules?.stages)return;
    for(const [id,chars] of Object.entries(state.frontier.spots || {})) {
      const spot=index.get(id);if(!spot)continue;
      let seed=spotData.seed | 0;for(const ch of id)seed=Math.imul(seed^ch.charCodeAt(0),16777619);
      seed^=state.frontier.econTick;
      const rand=()=>{seed=Math.imul(seed^(seed>>>16),2246822507);return (seed>>>0)/4294967296;};
      const next=regrowSpot(spot,chars,spotRules.stages,rand);
      if(next===null)delete state.frontier.spots[id];else state.frontier.spots[id]=next;
    }
  }
  return {tick,econTick,train,assign,workerOrder,assignIdle,rebalance,has,position,index,attach};
}
