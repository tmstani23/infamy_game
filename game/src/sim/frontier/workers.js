// Saved worker records, integer-tick trips, ground clearing and nearby civilian units.
// Stock/population still have one writer (world.js); no camera, DOM or Math.random.
import { makeSpotIndex, spotState, spotYield, regrowSpot } from '../resource_spots.js';
import { cellToWorld, worldToCell, townBlockersIn } from './town_grid.js';
import { dirIndex } from '../geometry.js';
const HZ=20;
export function ensureWorkers(s) { s.workers ||= []; s.workerTraining ||= []; }
const result = reason => ({ok:!reason,reason:reason || ''});
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const compare = (a,b) => a===b ? 0 : a<b ? -1 : 1;   // deterministic, independent of browser/server locale

export function createWorkers({state,data,world,spotData=null,spotRules=null}) {
  const R=data.workers, index=makeSpotIndex(spotData || {spots:[],byChunk:{},chunkSize:250});
  let runtime=null;
  const paths=new Map();
  const townBlocked = (x,z) => townBlockersIn(state.frontier,x,z,x,z).length>0;
  function waitingPoint(s,w,building=null) {
    const origin=building ? point(s,building) : [s.x,s.z];
    if (!runtime || !s.grid || !s.roadReserve && !townBlocked(...origin)) return origin;
    const candidates=[];
    const search=R.spawnSearchCells || 3;
    for(let dz=-search;dz<=search;dz++)for(let dx=-search;dx<=search;dx++) {
      const p=[origin[0]+dx*s.grid.cell,origin[1]+dz*s.grid.cell];
      const i=worldToCell(s,...p);
      if(i<0 || s.grid.ground[i]==='x' || s.grid.zone[i]!=='.' || townBlocked(...p))continue;
      const occupied=s.workers.some(other=>other!==w && other.departure && distance(other.departure,p)<1);
      candidates.push({p,d:dx*dx+dz*dz,occupied});
    }
    candidates.sort((a,b)=>Number(a.occupied)-Number(b.occupied) || a.d-b.d || b.p[1]-a.p[1] || b.p[0]-a.p[0]);
    // Query the planning grid, not loaded chunks: the same town must choose the same
    // waiting/drop-off point while asleep, including training ordered from the map.
    return candidates.find(({p}) => {
      const route=runtime.areas.nav.workerPath(...p,...p,townBlocked);
      return route && distance(route[0],p)<1;
    })?.p || origin;
  }
  function attach(services) { runtime=services.areas ? services : null; }
  function path(a,b) {
    if(!runtime)return [a,b];
    const key=JSON.stringify([a,b,towns().map(s=>[s.grid?.use,s.buildings.map(b=>[b.id,b.stage])])]);
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
    ensureWorkers(s);
    world.change(s.id,'ryo',-count*R.cost,'train');world.changePop(s.id,-count*R.personCost,'train');
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
    // Finish a carried load before changing destinations; an order never destroys or duplicates cargo.
    for(const w of selected) {
      w.by=by;
      delete w.order;delete w.nextOrder;delete w.status;delete w.retryAt;
      if(w.carrying>0)w.nextSpot=spot.id;
      else { w.departure=position(w) || w.departure || (runtime ? [s.x,s.z] : null);w.spot=spot.id;w.trip=null;w.elapsed=0;w.phase=0;w.dropoff=null;delete w.project; }
    }
    return result();
  }
  function assignIdle(s) {
    if(!on(s) || !has(s))return;
    const spots=index.spotsNear(s.x,s.z,R.range).filter(p=>R.resources[p.kind]);
    const resources=[...new Set(Object.values(R.resources))].sort((a,b)=>s.stock[a]-s.stock[b] || compare(a,b));
    for(const w of s.workers) {
      if(w.spot || w.project || w.order || w.by==='p')continue;
      const spot=resources.map(r=>spots.filter(p=>R.resources[p.kind]===r).sort((a,b)=>distance([s.x,s.z],[a.x,a.z])-distance([s.x,s.z],[b.x,b.z]) || compare(a.id,b.id))[0]).find(Boolean);
      if(spot)assign(s,[w.id],spot.id,'g');
    }
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
  function moveTrip(route) {
    const target=route.at(-1),out=Math.max(1,walkTicks(length(route)));
    return {kind:'move',origin:target,destination:target,outPath:route,backPath:[target,target],out,harvest:0,back:0,total:out,load:0,harvested:true};
  }
  function workerOrder(s,ids,kind,{x,z,group}={}) {
    if(!Array.isArray(ids) || !ids.length || new Set(ids).size!==ids.length)return result('workers must list each id once');
    const selected=ids.map(id=>s.workers?.find(w=>w.id===id));
    if(selected.some(w=>!w))return result('unknown worker');
    if(kind==='group') {
      if(!Number.isInteger(group) || group<0 || group>(R.groups || 4))return result('invalid worker group');
      for(const w of selected)w.group=group;
      return result();
    }
    if(!['move','hold'].includes(kind))return result('unknown worker order');
    if(kind==='move' && (!Number.isFinite(x) || !Number.isFinite(z)))return result('invalid move position');
    const plans=selected.map(w=>{
      const here=currentPoint(w) || [s.x,s.z];
      return {w,here,route:kind==='move' ? path(here,[x,z]) : null};
    });
    if(kind==='move' && plans.some(p=>!p.route))return result('no walking route to that position');
    for(const {w,here,route} of plans) {
      w.by='p';delete w.project;delete w.nextSpot;delete w.status;delete w.retryAt;
      if(kind==='hold') {w.order={kind:'hold'};delete w.nextOrder;w.departure=here;}
      else if(w.carrying>0) {w.nextOrder={kind,x,z};delete w.order;}
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
    paths.clear();
    if(w.order?.kind==='move') {
      const route=path(here,w.order.target);if(!route)return false;
      w.trip=moveTrip(route);w.elapsed=0;w.phase=0;return true;
    }
    if(w.carrying>0) {
      const spot=index.get(w.spot),drop=spot && nearestDropoff(s,spot),route=drop && path(here,drop.p);
      if(!route)return false;
      const back=walkTicks(length(route));
      w.trip={...w.trip,origin:route.at(-1),destination:here,outPath:null,backPath:route,out:0,harvest:0,back,total:Math.max(1,back),harvested:true};
      w.dropoff=drop.b.id;w.elapsed=0;w.phase=0;return true;
    }
    w.departure=here;w.trip=null;w.elapsed=0;w.phase=0;
    const spot=index.get(w.spot);return !!spot && start(s,w,spot);
  }
  function progress(s,w) {
    if(w.retryAt>state.tick)return false;
    if(walk(w,w.elapsed+1)) {delete w.status;return true;}
    if(reroute(s,w) && walk(w,w.elapsed+1)) {delete w.status;return true;}
    w.status='Route blocked';w.retryAt=state.tick+(R.retryTicks || 100);return false;
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
    const points=[];
    if(p) {
      const duration=next<=t.out?t.out:t.back,offset=next<=t.out?0:t.out+t.harvest;
      let d=0;const from=length(p)*(old-offset)/duration,to=length(p)*(next-offset)/duration;
      for(let i=1;i<p.length;i++) {d+=distance(p[i-1],p[i]);if(d>from && d<to)points.push(p[i]);}
    }
    points.push(target);let here=[e.x,e.z];
    for(const point of points) {if(!runtime.areas.nav.clearLine(...here,...point))return false;here=point;}
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
    if(!spot) { if(!w.carrying) {w.spot=null;w.trip=null;w.phase=0;} return; }
    if(!w.trip) {
      if(w.retryAt>state.tick)return;
      if(!start(s,w,spot)) {w.retryAt=state.tick+(R.retryTicks || 100);return;}
    }
    // Removing a storehouse reroutes a carried load; it never unloads into a vanished building.
    if(!dropoffs(s).some(b=>b.id===w.dropoff)) {
      if(!w.carrying) {w.trip=null;return;}
      const drop=nearestDropoff(s,spot);if(!drop)return;
      const here=position(w),backPath=path(here,drop.p);if(!backPath)return;
      const back=walkTicks(length(backPath));
      w.dropoff=drop.b.id;w.trip={...w.trip,origin:backPath.at(-1),destination:here,backPath,outPath:null,out:0,harvest:0,back,total:Math.max(1,back),harvested:true};w.elapsed=0;
    }
    if(!progress(s,w))return;
    const t=w.trip;w.elapsed++;
    if(!t.harvested && w.elapsed>=t.out+t.harvest) {harvest(spot);w.carrying=t.load;t.harvested=true;}
    w.phase=Math.min(1,w.elapsed/t.total);
    if(w.elapsed>=t.total) {
      if(w.carrying) {world.change(s.id,t.resource,w.carrying,'gather');s.workerIncome ||= {};s.workerIncome[t.resource]=(s.workerIncome[t.resource] || 0)+w.carrying;}
      w.deliveries=(w.deliveries || 0)+1;w.carrying=0;w.phase=0;w.elapsed=0;w.trip=null;
      if(runtime)w.departure=[...t.origin];
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
    const enabled=runtime && state.match?.mode==='campaign';
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
        const p=position(w) || resting,spot=index.get(w.spot);
        const awake=enabled && near(p) && (w.order || w.by==='p' || near([s.x,s.z]) || spot && near([spot.x,spot.z]) || project && near(resting));
        if(w.entity!==null && !awake)suspend(w);
        if(w.order?.kind==='move' && w.trip) {
          if(progress(s,w)) {
            w.elapsed++;w.phase=Math.min(1,w.elapsed/w.trip.total);
            if(w.elapsed>=w.trip.total) {w.departure=[...w.trip.destination];w.trip=null;w.order={kind:'hold'};w.phase=0;}
          }
        } else if(!w.order && !busy.has(w) && !w.project && w.spot)gather(s,w);
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
  return {tick,econTick,train,assign,workerOrder,assignIdle,has,position,index,attach};
}
