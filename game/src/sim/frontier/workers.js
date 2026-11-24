import { addCampStock } from './camp_stock.js';
import { modeRules } from '../modes/index.js';
// Saved worker records, integer-tick trips, ground clearing and nearby civilian units.
// Stock/population still have one writer (world.js); no camera, DOM or Math.random.
import { makeSpotIndex, spotState, spotYield, regrowSpot, supportsWorkers } from '../resource_spots.js';
import { campLoad, spotCounts } from './camp_load.js';
import { cellToWorld, worldToCell, townBlocksBox, townBlockedCells, townBlockSignature, campBlockSignature, ringRadius } from './town_grid.js';
import { dirIndex, blockOffset } from '../geometry.js';
import { isFull, defaultKeep } from './storage.js';
import { cartRules, isCamp, campFull, stepCarts, buyCart, cartPoint, orderCarts, wreckCart } from './camp_carts.js';
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
      const next=JSON.stringify(towns().map(s=>[s.id,townBlockSignature(s,data)]))+campBlockSignature(state.frontier);   // perf 2026-11-07: only what blocks walking, so growing fields do not throw away every worker path
      if(next!==geometry || geometryState!==state.frontier) {
        // collision 5b-1: a newly grown house only throws away the kept routes that now run through something solid
        if(geometryState!==state.frontier)paths.clear();
        else for(const [k,p] of paths)if(!p || crossesBlocker(p))paths.delete(k);
        geometry=next;revision++;waiting.clear();
      }
      geometryAt=state.tick;geometryState=state.frontier;
    }
    return revision;
  }
  const townBlocked = (x,z) => townBlocksBox(state.frontier,x,z,x,z,data);
  function crossesBlocker(p) {
    for(let i=1;i<p.length;i++) {
      const [ax,az]=p[i-1],[bx,bz]=p[i],n=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)));
      for(let k=1;k<n;k++)if(townBlocked(ax+(bx-ax)*k/n,az+(bz-az)*k/n))return true;
    }
    return false;
  }
  function waitingPoint(s,w,building=null) {
    // Tim 2026-11-12: a new camp worker steps out in front of the camp hall, not inside it; side by side in a short arc
    const hall=!building && s.camp && s.buildings.find(b=>b.type==='camp_hall');
    if(hall && Number.isFinite(hall.x)) {
      const r=(data.war?.buildings?.camp_hall?.radius ?? 8)+1.5,k=s.workers.filter(o=>o.fresh).length,a=Math.PI/2+((k%7)-3)*0.22;
      return [hall.x+Math.cos(a)*r,hall.z+Math.sin(a)*r];
    }
    const origin=building ? point(s,building) : [s.x,s.z];
    if (!runtime || !s.grid || !s.roadReserve && !townBlocked(...origin)) return origin;
    const key=building && `${s.id}:${building.id}:${geometryRevision()}`;
    if(key && waiting.has(key))return waiting.get(key);
    const candidates=[];
    const search=R.spawnSearchCells || 3;
    for(let dz=-search;dz<=search;dz++)for(let dx=-search;dx<=search;dx++) {
      const p=[origin[0]+dx*s.grid.cell,origin[1]+dz*s.grid.cell];
      const i=worldToCell(s,...p);
      if(i<0 || s.grid.ground[i]==='x' || s.grid.zone[i]!=='.' || planBlocked(...p))continue;   // padded like routes: a bigger town hall (Tim 2026-11-21) left the point free but the walker stuck on its corner
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
  function attach(services) {
    runtime=services.areas ? services : null;
    // lag fix (Tim 2026-11-08): build the island route graph now, while loading, not on the first worker detour (~100 ms)
    runtime?.areas.ensureGraph?.();
  }
  // worker routes keep R.buildingPad further from town buildings than their hard blocking box (Tim 2026-11-10: they
  // cut through the corners of the art); the ends of a route may still sit closer (the planner starts from the nearest free cell)
  const planBlocked = (x,z) => { const k=R.buildingPad || 0; return townBlocksBox(state.frontier,x-k,z-k,x+k,z+k,data); };
  const planCells=cell=>townBlockedCells(state.frontier,data,R.buildingPad || 0,cell),townCells=cell=>townBlockedCells(state.frontier,data,0,cell);
  function path(a,b) {
    if(!runtime)return [a,b];
    geometryRevision();
    const key=JSON.stringify([a,b]);
    // worker lag 2026-11-22: a route in use moves to the back of the line, so a full cache drops the route unused longest
    if(paths.has(key)){const kept=paths.get(key);paths.delete(key);paths.set(key,kept);return kept;}
    // worker lag 2026-11-22: the planner reads the same blockers as ready sets of blocked cells
    let p=runtime.areas.nav.workerPath(...a,...b,planBlocked,planCells) || runtime.areas.nav.workerPath(...a,...b,townBlocked,townCells);
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
  // F6 war camps (checkpoint 3): a war camp is a work site like a town. The adapter below lets the worker code treat it
  // as one: camp workers/training/stock live on the war record (state.frontier.wars.list[id].camp), sealed from every town.
  let jobs=null;   // 7c-4: repair and douse rules, attached by sim/frontier/structures.js
  const CW=()=>data.war?.camp || {};
  const campRes=()=>CW().resources || ['timber','stone'];
  const newWorker=()=>({id:world.newId('w'),spot:null,dropoff:null,phase:0,carrying:0,entity:null,elapsed:0,trip:null});
  function campSite(war) {
    const c=war.camp;if(!c)return null;
    if(typeof c.workers==='number')c.workers=Array.from({length:c.workers},newWorker);   // older saves held a plain number
    c.workers ||= [];c.workerTraining ||= [];
    return {id:war.id,camp:true,war,townId:war.town,owner:war.attacker,name:'War camp',x:c.x,z:c.z,grid:null,projects:[],buildings:c.buildings,stock:c.stock,
      get workers(){return c.workers;},set workers(v){c.workers=v;},
      get workerTraining(){return c.workerTraining;},set workerTraining(v){c.workerTraining=v;},
      get workerIncome(){return c.workerIncome ||= {};},set workerIncome(v){c.workerIncome=v;}};
  }
  const warSites=()=>Object.values(state.frontier.wars?.list || {}).map(campSite).filter(Boolean);
  const sites=()=>[...towns(),...warSites()];
  const siteOf=id=>{const w=state.frontier.wars?.list?.[id];return w?campSite(w):null;};
  const credit=(s,res,n)=>{ if(s.camp){addCampStock(s.war.camp,res,n);} else world.change(s.id,res,n,'gather'); };
  const full=(s,r)=>s.camp ? false : isFull(s,data,r);
  const has=s=>!!s.workers?.length;
  const on=s=>!!R && Number.isFinite(s.x) && Number.isFinite(s.z);
  const walkTicks=d=>Math.ceil(d/R.speed*HZ);
  const point=(s,b)=>s.grid && Number.isInteger(b.cell) ? cellToWorld(s,b.cell) : Number.isFinite(b.x) && Number.isFinite(b.z) ? [b.x,b.z] : [s.x,s.z];
  // Tim 2026-11-07: a work camp takes only its own resource (R.campTakes: lumber camp timber, quarry stone); res unknown = any
  const takes=(b,res)=>!res || !R.campTakes?.[b.type] || R.campTakes[b.type].includes(res);
  const dropoffs=(s,res)=>s.buildings.filter(b=>b.stage==='built' && R.dropoffs.includes(b.type) && !campFull(data,b) && takes(b,res));
  const homeDrops=s=>s.buildings.filter(b=>b.stage==='built' && R.dropoffs.includes(b.type) && !isCamp(data,b));
  // a site without a town grid (a war camp): hand in at the edge of the building, on the side the worker comes from
  // (Tim 2026-11-10: they walked into the middle of the camp hall)
  function edgePoint(s,b,from) {
    const c=point(s,b),r=data.war?.buildings?.[b.type]?.radius || 0,d=distance(c,[from.x,from.z]);
    if(!r || d<=r)return c;
    const p=[Math.round((c[0]+(from.x-c[0])*r/d)*2)/2,Math.round((c[1]+(from.z-c[1])*r/d)*2)/2];
    return !runtime || runtime.areas.nav.free(...p) ? p : c;
  }
  function nearestDropoff(s,spot,res=R.resources[spot?.kind]) {
    return dropoffs(s,res).map(b=>({b,p:s.grid || !spot ? waitingPoint(s,null,b) : edgePoint(s,b,spot)})).sort((a,b)=>distance(a.p,[spot.x,spot.z])-distance(b.p,[spot.x,spot.z]) || compare(a.b.id,b.b.id))[0] || null;
  }
  // Reach (Tim 2026-11-06, rich nodes): within R.range of the hall, or within R.campReach of a built work camp.
  const camps=s=>s.buildings.filter(b=>b.stage==='built' && (R.gatherBuildings || []).includes(b.type));
  // war camp reach (Tim 2026-11-10): anywhere inside the war circle, but outside the town's build ring (that ground is the town's)
  // Safety net (Tim 2026-11-21: "they can walk to any nearest trees", never inside the town's ring): besides the war
  // circle, a camp's workers may use the war.camp.farSpots nearest spots of each resource to the camp (within
  // war.camp.farReach of it), wherever they are outside the ring
  const farCache=new Map();
  function farFor(s,t,res) {
    const ring=ringRadius(t,data),key=`${s.id}|${Math.round(s.x)}|${Math.round(s.z)}|${ring}|${res}`;
    if(farCache.has(key))return farCache.get(key);
    const out=d=>d>ring;
    const far=new Set(index.spotsNear(s.x,s.z,CW().farReach ?? 1500).filter(p=>R.resources[p.kind]===res && out(distance([t.x,t.z],[p.x,p.z])))
      .sort((a,b)=>distance([s.x,s.z],[a.x,a.z])-distance([s.x,s.z],[b.x,b.z]) || compare(a.id,b.id)).slice(0,CW().farSpots ?? 3).map(p=>p.id));
    farCache.set(key,far);
    return far;
  }
  const campReachOk=(s,spot)=>{
    const t=state.frontier.settlements[s.townId],res=R.resources[spot.kind];if(!t || !Number.isFinite(t.x) || !campRes().includes(res))return false;
    const d=distance([t.x,t.z],[spot.x,spot.z]);if(d<=ringRadius(t,data))return false;
    return d<=data.war.circleRadius || !!farFor(s,t,res)?.has(spot.id);
  };
  const inReach=(s,spot)=>s.camp ? campReachOk(s,spot) : distance([s.x,s.z],[spot.x,spot.z])<=R.range || camps(s).some(b=>takes(b,R.resources[spot.kind]) && distance(point(s,b),[spot.x,spot.z])<=(R.campReach || 0));
  function reachSpots(s) {
    if(s.camp){const t=state.frontier.settlements[s.townId];if(!t)return [];
      const out=index.spotsNear(t.x,t.z,data.war.circleRadius).filter(p=>campReachOk(s,p));
      for(const res of campRes())for(const id of farFor(s,t,res) || []){const p=index.get(id);if(p)out.push(p);}
      return out;}
    const out=new Map(index.spotsNear(s.x,s.z,R.range).map(p=>[p.id,p]));
    if(R.campReach)for(const b of camps(s))for(const p of index.spotsNear(...point(s,b),R.campReach))if(takes(b,R.resources[p.kind]))out.set(p.id,p);
    return [...out.values()];
  }
  function eligible(s,id) {
    const spot=index.get(id);
    return spot && R.resources[spot.kind] && inReach(s,spot) ? spot : null;
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
  // Camp workers cost ryo from the war chest only, up to a fixed cap (Tim 2026-11-10); training time as in a town.
  function trainCamp(s,count) {
    const C=CW(),c=s.war.camp;
    if(!Number.isSafeInteger(count) || count<1)return result('count must be a positive integer');
    if(!s.buildings.some(b=>b.type==='camp_hall' && b.stage==='built' && !(b.hp===0)))return result('the camp hall is down');
    const cost=(C.workerCost ?? 0)*count;
    if((c.chest || 0)<cost)return result('the war chest cannot afford workers');
    if(s.workers.length+s.workerTraining.length+count>(C.workerCap ?? Infinity))return result(`a war camp holds at most ${C.workerCap} workers`);
    c.chest=Math.round(((c.chest || 0)-cost)*100)/100;
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
      if(w.wait)endWait(s,w);
      w.by=by;delete w.fresh;delete w.offSpot;
      delete w.order;delete w.nextOrder;delete w.status;delete w.retryAt;
      if(w.carrying>0){setReturnTrip(w,returns.get(w));w.nextSpot=spot.id;}
      else { w.departure=position(w) || w.departure || (runtime ? [s.x,s.z] : null);w.spot=spot.id;w.trip=null;w.elapsed=0;w.phase=0;w.dropoff=null;delete w.project;delete w.buildAt; }
      delete w.job;
    }
    return result();
  }
  // Tim 2026-11-22: a governor's worker takes the spot nearest a drop-off that takes its resource (the hall, or a work
  // camp of that kind), not the one nearest the hall: a timber hand works beside the lumber camp, not past the town
  function dropDist(s) {
    const at={},pos=b=>Number.isFinite(b.x) ? [b.x,b.z] : Number.isInteger(b.cell) && s.grid ? cellToWorld(s,b.cell) : [s.x,s.z];
    return p=>{const res=R.resources[p.kind];at[res] ||= dropoffs(s,res).map(pos);const L=at[res].length ? at[res] : [[s.x,s.z]];return Math.min(...L.map(q=>distance(q,[p.x,p.z])));};
  }
  // Tim 2026-11-22: where a town has a built work camp of a kind, the governor's workers take that resource only at
  // the spots beside one: within R.campNear of the camp, or the camp's one nearest spot inside campReach when none is
  // that close (a camp built toward far trees). No camp of a kind, or a camp with nothing in reach: any spot in reach.
  // { timber: Set of spot ids, ... } for the kinds that are held to their camps; null for a war camp.
  function campSide(s) {
    if(s.camp || !R.campNear)return null;
    const out={};
    for(const b of camps(s))for(const res of R.campTakes?.[b.type] || []) {
      const pt=point(s,b),near=index.spotsNear(...pt,Math.max(R.campNear,R.campReach || 0)).filter(p=>R.resources[p.kind]===res)
        .map(p=>({p,d:distance(pt,[p.x,p.z])})).sort((x,y)=>x.d-y.d || compare(x.p.id,y.p.id));
      const close=near.filter(x=>x.d<=R.campNear),set=out[res] ||= new Set();
      for(const x of close.length ? close : near.slice(0,1))set.add(x.p.id);
    }
    for(const res of Object.keys(out))if(!out[res].size)delete out[res];
    return out;
  }
  const sideOk=(side,p)=>{const set=side?.[R.resources[p.kind]];return !set || set.has(p.id);};
  // one of the governor's workers with no spot beside a camp left waits in the town hall (structures: waitIn), or
  // outside when it is full, until a place opens or the player gives him a job
  function toWait(s,w) {
    const by=w.by,here=currentPoint(w);
    if(here)w.departure=here;
    w.spot=null;w.trip=null;w.elapsed=0;w.phase=0;w.dropoff=null;
    if(!w.shelter)jobs?.waitIn?.(s,w);
    if(by===undefined)delete w.by;else w.by=by;   // the walk to the hall is not the player's order
    w.wait=true;w.waitTry=(state.tick || 0)+(R.waitRetryTicks ?? 1200);
  }
  function endWait(s,w) {
    if(w.shelter?.wait) { jobs?.leave?.(s,w);if(w.order?.kind==='hold' || w.order?.kind==='move') { delete w.order;if(w.trip?.kind==='move') { w.trip=null;w.elapsed=0;w.phase=0; } } }
    delete w.wait;delete w.waitTry;delete w.waitFree;
  }
  function assignIdle(s) {
    if(!on(s) || !has(s))return;
    if(s.camp && !s.workers.some(w=>!w.spot && !w.project && !w.order && w.by!=='p'))return;   // camps check every second: skip the spot search when nobody is idle
    const spots=reachSpots(s).filter(p=>R.resources[p.kind]);
    const resources=[...new Set(Object.values(R.resources))].filter(r=>(!s.camp || campRes().includes(r)) && !full(s,r)).sort((a,b)=>s.stock[a]-s.stock[b] || compare(a,b));
    // Tim 2026-11-06: the governor never puts more workers on a spot than it keeps busy (supportsWorkers) and moves
    // its own extras off an overworked one; the player's own picks stay put.
    // (a worker handing in his load before a new spot, w.nextSpot, already counts there)
    const count={};for(const t of sites())for(const w of t.workers || []){const id=w.nextSpot || w.spot;if(id)count[id]=(count[id] || 0)+1;}
    const room=p=>{const n=spotRules?.stages ? supportsWorkers(p,spotRules.stages) : null;return n==null || (count[p.id] || 0)+1<=n;},dd=dropDist(s);   // +1: with him there the spot must not be over (a spot good for 1.5 took a second worker, who was then one too many and moved off again every review)
    const side=campSide(s),now=state.tick || 0;
    const goal=s.camp ? {} : nextTier(s,data)?.upgrade?.cost || {},short=r=>(s.stock[r] || 0)<(goal[r] || R.shortBelow || 200);
    // lag (Tim 2026-11-22: 90 workers were called back in one review, each a new route): he moves at most
    // R.campMovesPerReview workers from far spots to camp spots per review
    let moves=R.campMovesPerReview ?? 2;
    for(const w of s.workers) {
      // B2: governor-placed workers on a full resource are moved; the player's own picks stay put.
      const sp=w.spot && index.get(w.spot),cap=sp && spotRules?.stages ? supportsWorkers(sp,spotRules.stages) : null;
      const extra=w.by==='g' && cap!=null && count[w.spot]>cap && !w.carrying && !w.trip;
      // off in the wild while his kind has a camp: he comes back between trips (Tim 2026-11-22)
      // (one already told to a new spot once his load is in, w.nextSpot, is left alone: ordering him again every
      // review restarted his walk and worked his route out again, 2026-11-22 lag)
      const away=w.by!=='p' && !!sp && !sideOk(side,sp) && !w.order && !w.project && !w.nextSpot;
      const stuck=extra || away || w.by==='g' && w.spot && !w.carrying && !w.trip && w.status==='Store full';
      if(w.wait && w.by==='p') { delete w.wait;delete w.waitTry;delete w.waitFree; }
      // one handing in his load before a spot he was already given (w.nextSpot, no spot yet) is left to it: given a
      // spot again every review his walk back started over and never ended (2026-11-22, rival towns)
      if((w.spot && !stuck) || w.project || (w.order && !w.wait) || w.by==='p' || w.fresh || (!w.spot && w.nextSpot && w.trip))continue;
      if(w.wait && !w.shelter && now<(w.waitFree || 0))continue;   // the player called him out: left alone for a while
      // one working away from the camps is only moved to a camp spot of the SAME resource (a place freed, a new
      // camp): moved to whatever is lowest he and rebalance (which may send him far again) swapped him every review
      const own=away && !extra ? R.resources[sp.kind] : null;
      const spot=resources.filter(r=>!own || r===own).map(r=>spots.filter(p=>R.resources[p.kind]===r && sideOk(side,p) && room(p)).sort((a,b)=>dd(a)-dd(b) || compare(a.id,b.id))[0]).find(Boolean);
      if(spot) {
        if(away && !extra && w.spot) { if(moves<=0)continue;moves--; }
        if(w.spot)count[w.spot]--;
        endWait(s,w);w.spot=null;
        assign(s,[w.id],spot.id,'g');count[spot.id]=(count[spot.id] || 0)+1;
      } else if(side && Object.keys(side).length && (away || extra || !w.spot)) {
        // No more camps can be built (governor: s.gov.campsDone) and the town is short of something for its next
        // hall tier: rather than wait he works the nearest free spot of it in reach, as before the camp rule
        // (2026-11-22 soak: a hill town with all its camp slots used sat at 25 workers with no timber)
        // Tim 2026-11-22 05:26Z: one already working away from the camps keeps going until a camp spot has room
        // (a new camp, or a place freed), then he is moved there
        if(away && !extra)continue;
        if(s.gov?.campsDone) {
          const far=resources.filter(short).map(r=>spots.filter(p=>R.resources[p.kind]===r && room(p)).sort((a,b)=>dd(a)-dd(b) || compare(a.id,b.id))[0]).find(Boolean);
          if(far) { if(w.spot)count[w.spot]--;endWait(s,w);w.spot=null;assign(s,[w.id],far.id,'g');count[far.id]=(count[far.id] || 0)+1;continue; }
        }
        if(w.carrying)continue;   // he hands his load in first
        if(w.spot)count[w.spot]--;
        if(!w.wait || (!w.shelter && now>=(w.waitTry || 0)))toWait(s,w);
      } else if(extra) {count[w.spot]--;w.spot=null;}
    }
  }
  // Tim 2026-11-05 (self-running governor): move one governor-placed worker per call from a well stocked
  // resource to the lowest one that needs hands (the player's own picks never move).
  function rebalance(s) {
    if(s.gov)delete s.gov.campWant;
    if(!on(s) || !has(s))return;
    const res=w=>R.resources[index.get(w.spot)?.kind],mine=s.workers.filter(w=>w.by!=='p' && w.spot && !w.order && !w.project && !w.trip?.kind);
    const kinds=[...new Set(Object.values(R.resources))].filter(r=>!isFull(s,data,r));
    if(kinds.length<2)return;
    const count=r=>s.workers.filter(w=>w.spot && res(w)===r).length;
    // compare stocks against what the town is saving for (the next hall upgrade), so no resource is starved
    const goal=nextTier(s,data)?.upgrade?.cost || {},fill=r=>(s.stock[r] || 0)/Math.max(50,goal[r] || 200);
    const low=[...kinds].sort((a,b)=>fill(a)-fill(b) || compare(a,b))[0];
    const met=r=>fill(r)>=1 && fill(low)<1;   // a resource already at its goal gives hands to one still short
    // Tim 2026-11-23 (Kagemura: 23 hands on stone at 9,800 while timber sat at 0): a resource above its keep line
    // gives hands to one below its own, whatever the head counts, down to R.keepHands workers left on it
    const line=r=>s.keep?.[r] ?? defaultKeep(s,data,r),over=r=>line(r)>0 && (s.stock[r] || 0)>line(r) && (s.stock[low] || 0)<line(low) && count(r)>(R.keepHands ?? 2);
    const donor=kinds.filter(r=>r!==low && (met(r) ? count(r)>0 : over(r) || fill(r)>fill(low)*2+0.1 && count(r)>(count(low)===0?0:count(low)+1)))
      .sort((a,b)=>count(b)-count(a) || compare(a,b))[0];
    // s.gov.handsDone (Tim 2026-11-23): the lowest resource is under its keep line and no more hands can go to it
    // (nobody to spare, or no free spot in reach): only then the rail clerk's auto-buy budget grows with the town's ryo
    // (kept until a move works again or that resource is back over its line, so it does not flicker between reviews)
    const done=()=>{ if(s.gov && line(low)>0 && (s.stock[low] || 0)<line(low))s.gov.handsDone=low; };
    if(s.gov?.handsDone && (s.gov.handsDone!==low || (s.stock[low] || 0)>=line(low)))delete s.gov.handsDone;
    if(!donor)return done();
    const w=mine.filter(w=>res(w)===donor).sort((a,b)=>(a.carrying || 0)-(b.carrying || 0) || compare(a.id,b.id))[0];if(!w)return;
    const side=campSide(s),held=side && Object.keys(side).length,per={};
    if(held)for(const t of sites())for(const k of t.workers || [])if(k.spot)per[k.spot]=(per[k.spot] || 0)+1;
    // held to the camps (Tim 2026-11-22): only to a spot beside one that still has room
    const room=p=>{const n=held && spotRules?.stages ? supportsWorkers(p,spotRules.stages) : null;return n==null || (per[p.id] || 0)+1<=n;};
    const dd=dropDist(s),all=reachSpots(s).filter(p=>R.resources[p.kind]===low && room(p)).sort((a,b)=>dd(a)-dd(b) || compare(a.id,b.id));
    // no camp spot left for it and no more camps can be built (s.gov.campsDone): the nearest free spot in reach, as
    // before the camp rule (2026-11-22 soak: a hill town could not move hands to timber and never reached Town tier)
    const spots=all.filter(p=>sideOk(side,p)),to=spots[0] || (s.gov?.campsDone ? all[0] : null);
    if(to) { assign(s,[w.id],to.id,'g');if(s.gov)delete s.gov.handsDone; }
    // 2026-11-23 (Kagemura: timber at 0, stone near full, every lumber camp spot taken): no spot with room, so the
    // governor's moreCampRule builds another camp for it this review (gone again when the move works)
    else if(s.gov) { s.gov.campWant=low;if(s.gov.campsDone)done(); }
  }
  // Lag fix (Tim 2026-11-08): working out new routes is the costly part, so only one worker sets out on a
  // new trip per tick (defer); the next tries again a tick later. This counts trips, not uncached routes, so a
  // loaded save (empty route cache) makes the same choices. Reroutes and return trips never wait.
  let startTick=-1;
  // Fishing poles (Tim 2026-11-23): a fish spot's cast point (world_spots.json, out on open water) spread along the shore
  // a little per worker, so a crowd of anglers fans out instead of casting at one spot. Presentation only: the harvest
  // itself is unchanged (render/fishing_fx.js draws the pole, line and float).
  function castPoint(spot,w) {
    const [cx,cz]=spot.cast,L=Math.hypot(cx,cz) || 1,k=((String(w.id).split('').reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7)%9)-4)*0.7;
    return [Math.round((spot.x+cx-cz/L*k)*10)/10,Math.round((spot.z+cz+cx/L*k)*10)/10];
  }
  function start(s,w,spot,defer=false) {
    if(defer && runtime) { if(startTick===state.tick)return 'later'; startTick=state.tick; }   // without island navigation routes are free
    const drop=nearestDropoff(s,spot);if(!drop)return false;
    const outPath=path(w.departure || drop.p,[spot.x,spot.z]);
    // the way back starts where the way out ends (collision 5b: a spot hard against a building is reached from beside it)
    const backPath=path(outPath?.at(-1) || [spot.x,spot.z],drop.p);
    if(!outPath || !backPath) { w.status='No walking route to resource'; return false; }
    const out=walkTicks(length(outPath)),back=walkTicks(length(backPath));
    const stages=spotRules?.stages, saved=state.frontier.spots?.[spot.id];
    const base=stages ? Math.ceil(R.harvestTicks*spot.pieces.length/spotYield(spot,saved,stages)) : R.harvestTicks;
    const harvest=s.camp ? Math.ceil(base/Math.max(0.01,CW().gatherSpeed ?? 1)) : base;   // camp-only gather speed (Tim 2026-11-10); town workers never change
    w.trip={origin:backPath.at(-1),destination:outPath.at(-1),outPath,backPath,out,harvest,back,total:Math.max(1,out+back+harvest),resource:R.resources[spot.kind],load:R.load,harvested:false};
    if(spot.cast)w.trip.cast=castPoint(spot,w);   // fishing poles (Tim 2026-11-23): the water point this worker casts at
    delete w.departure;
    w.dropoff=drop.b.id;w.elapsed=0;w.phase=0;return true;
  }
  const currentPoint=w=>{
    const e=state.entities?.[w.entity];
    return e ? [e.x,e.z] : position(w) || w.departure;
  };
  const cargoType=w=>w.cargoResource || w.trip?.resource || R.resources[index.get(w.spot)?.kind];
  function returnPlan(s,w) {
    const here=currentPoint(w) || [s.x,s.z],drop=nearestDropoff(s,{x:here[0],z:here[1]},cargoType(w));
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
  function workerOrder(s,ids,kind,{x,z,group,confirm,target}={}) {
    if(!Array.isArray(ids) || !ids.length || new Set(ids).size!==ids.length)return result('workers must list each id once');
    const selected=ids.map(id=>s.workers?.find(w=>w.id===id));
    if(selected.some(w=>!w))return result('unknown worker');
    if(kind!=='group')for(const w of selected) { delete w.fresh;if(w.wait)endWait(s,w); }   // an order by hand ends a wait for a spot
    if(kind==='drop') {
      if(confirm!==true)return result('Confirm: dropped resources are permanently lost');
      for(const w of selected) {
        const here=currentPoint(w) || [s.x,s.z];w.carrying=0;w.spot=null;w.trip=null;w.elapsed=0;w.phase=0;w.departure=here;w.order={kind:'hold'};w.by='p';
        delete w.cargoResource;delete w.nextSpot;delete w.nextOrder;delete w.project;delete w.buildAt;delete w.job;delete w.status;delete w.retryAt;
      }
      return result();
    }
    if(kind==='return') {
      const loaded=selected.filter(w=>w.carrying>0);if(!loaded.length)return result('No carried resources to return');
      const plans=loaded.map(w=>({w,...returnPlan(s,w)}));
      if(plans.some(p=>!p.route || !p.resource))return result('No walking route to a resource drop-off');
      for(const plan of plans) {
        const {w}=plan;setReturnTrip(w,plan);w.by='p';
        if(w.spot && !w.order)delete w.nextOrder;else w.nextOrder={kind:'hold'};   // Tim 2026-11-12: a harvester goes back to its spot after unloading
        delete w.order;delete w.nextSpot;delete w.project;delete w.buildAt;delete w.job;delete w.status;delete w.retryAt;
      }
      return result();
    }
    if(kind==='group') {
      if(!Number.isInteger(group) || group<0 || group>(R.groups || 4))return result('invalid worker group');
      for(const w of selected)w.group=group;
      return result();
    }
    // 7c-4 (Tim 2026-11-12): builders, repair and douse are manual. kind 'work', target = a camp building site (or the
    // camp hall while it is upgraded) to build, or the key of one of this site's structures to douse and repair
    // (sim/frontier/structures.js workTarget / workOn). More workers work faster. They stay on it until it is done.
    if(kind==='work') {
      const b=s.camp && typeof target==='string' ? s.buildings.find(x=>x.id===target && (x.stage==='site' || x.upgrade)) : null;
      const job=b ? null : jobs?.target?.(s,target);
      if(!b && !job)return result(jobs?.why?.(s,target) || 'nothing to build, repair or put out there');
      const at=b ? {x:b.x,z:b.z,r:(data.war?.buildings?.[b.type]?.radius ?? 8)*0.8} : job;
      const others=s.workers.filter(w=>!selected.includes(w) && (b ? w.project===b.id : w.job?.key===target)).length;
      // Tim 2026-11-14: at most war.builderCap workers (4) build one site or hall upgrade, the nearest of those sent;
      // the rest stay as they were. Repair and douse have no limit.
      const cap=b ? data.war?.builderCap ?? 4 : jobs?.cap?.(s,target) ?? Infinity;   // a town building site: rates.maxBuilders (Tim 2026-11-15)
      if(others>=cap)return result(`${cap} workers are already building that`);
      const team=Number.isFinite(cap) ? [...selected].map(w=>({w,d:distance(currentPoint(w) || [s.x,s.z],[at.x,at.z])})).sort((p,q)=>p.d-q.d || compare(p.w.id,q.w.id)).slice(0,cap-others).map(x=>x.w) : selected;
      let sent=0;
      team.forEach((w,i)=>{
        const here=currentPoint(w) || [s.x,s.z],a=(others+i)*2.399963,route=path(here,[at.x+Math.cos(a)*at.r,at.z+Math.sin(a)*at.r]) || path(here,[at.x+Math.cos(a+Math.PI)*at.r,at.z+Math.sin(a+Math.PI)*at.r]);
        if(!route)return;
        jobs?.leave?.(s,w);
        w.by='p';w.spot=null;w.dropoff=null;delete w.order;delete w.nextOrder;delete w.nextSpot;delete w.status;delete w.retryAt;delete w.project;delete w.buildAt;delete w.job;
        if(w.carrying>0)w.cargoResource=cargoType(w);
        if(b){w.project=b.id;w.buildAt=route.at(-1);}else w.job={key:target,at:route.at(-1)};
        w.departure=here;w.trip=moveTrip(route);w.elapsed=0;w.phase=0;sent++;
      });
      return sent ? result() : result('no walking route to it');
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
      w.by='p';delete w.project;delete w.buildAt;delete w.job;delete w.nextSpot;delete w.status;delete w.retryAt;
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
    if(w.project && w.buildAt) {const route=path(here,w.buildAt);if(!route)return false;w.trip=moveTrip(route);w.elapsed=0;w.phase=0;return true;}   // a camp builder on its way to a site
    if(w.job?.at) {const route=path(here,w.job.at);if(!route)return false;w.trip=moveTrip(route);w.elapsed=0;w.phase=0;return true;}   // on its way to a repair or a fire
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
    const here=currentPoint(w) || [s.x,s.z],drop=nearestDropoff(s,{x:here[0],z:here[1]},cargoType(w));
    const at=drop?.p || [s.x,s.z],res=cargoType(w);
    if(w.carrying>0 && res) {credit(s,res,w.carrying);s.workerIncome ||= {};s.workerIncome[res]=(s.workerIncome[res] || 0)+w.carrying;}
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
    // each gathering worker keeps its own lane beside the route (Tim 2026-11-10): drawn position only, the trip clock
    // above is untouched. e.lane = the offset now, eased toward the worker's own fixed offset plus a small sway.
    const L=R.lane,was=e.lane || [0,0];
    const dx=target[0]-(e.x-was[0]),dz=target[1]-(e.z-was[1]);
    if(dx || dz) {e.dir=dirIndex(dx,dz);e.anim='walk';}
    let lane=[0,0];
    if(L) {
      let h=2166136261;for(const ch of String(w.id))h=Math.imul(h^ch.charCodeAt(0),16777619);h>>>=0;
      const angle=(h%360)*Math.PI/180,r=L.min+(L.max-L.min)*((h>>>9)%100)/99,d=Math.hypot(dx,dz);
      const sway=d ? (L.sway || 0)*Math.sin(state.tick*0.12+(h%97)) : 0;
      // an ordered Move keeps its own formation spacing: no lane, the offset eases away
      const want=t.kind==='move' ? [0,0] : [Math.cos(angle)*r+(d ? -dz/d*sway : 0),Math.sin(angle)*r+(d ? dx/d*sway : 0)],k=L.ease || 0.12;
      lane=[was[0]+(want[0]-was[0])*k,was[1]+(want[1]-was[1])*k];
      if(Math.hypot(...lane)<0.02)lane=[0,0];
      if(!runtime.areas.nav.free(target[0]+lane[0],target[1]+lane[1]))lane=[was[0]*0.6,was[1]*0.6];   // no room beside the route here: ease back onto it
      if(!runtime.areas.nav.free(target[0]+lane[0],target[1]+lane[1]))lane=[0,0];
    }
    if(lane[0] || lane[1])e.lane=lane;else delete e.lane;
    e.x=target[0]+lane[0];e.z=target[1]+lane[1];return true;
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
      if(spot && full(s,R.resources[spot.kind])) {w.status='Store full';w.retryAt=state.tick+(R.retryTicks || 100);return;}
      if(w.status==='Store full')delete w.status;
      const started=start(s,w,spot,true);
      if(started==='later') {w.retryAt=state.tick+1;return;}   // one new route per tick: try again next tick
      if(!started) {w.retryAt=state.tick+(R.retryTicks || 100);return;}
    }
    // Removing a storehouse reroutes a carried load; it never unloads into a vanished building.
    if(!dropoffs(s,cargoType(w)).some(b=>b.id===w.dropoff)) {
      if(!w.carrying) {w.trip=null;return;}
      const at=currentPoint(w) || [s.x,s.z],drop=nearestDropoff(s,spot || {x:at[0],z:at[1]},cargoType(w));if(!drop)return;
      const here=position(w),backPath=path(here,drop.p);if(!backPath)return;
      const back=walkTicks(length(backPath));
      w.dropoff=drop.b.id;w.trip={...w.trip,origin:backPath.at(-1),destination:here,backPath,outPath:null,out:0,harvest:0,back,total:Math.max(1,back),harvested:true};w.elapsed=0;
    }
    if(!progress(s,w))return;
    const t=w.trip;w.elapsed++;
    const e=state.entities?.[w.entity];
    if(e && !t.kind && !t.harvested && w.elapsed>=t.out) {
      if(t.cast) {e.anim='idle';e.fishing=t.cast;e.dir=dirIndex(t.cast[0]-e.x,t.cast[1]-e.z);}   // fishing poles (Tim 2026-11-23): stands facing the water and casts
      else e.anim='hammer';   // hammer swing while collecting (Tim 2026-11-08): same ticks as before, so the harvest rate is unchanged
    }
    if(!t.harvested && w.elapsed>=t.out+t.harvest) {harvest(spot);w.carrying=t.load;w.cargoResource=t.resource;t.harvested=true;if(e)e.harvestedAt=state.tick;}
    w.phase=Math.min(1,w.elapsed/t.total);
    if(w.elapsed>=t.total) {
      if(w.carrying) {
        const camp=!s.camp && cartRules(data) && s.buildings.find(b=>b.id===w.dropoff && isCamp(data,b));   // a war camp's own lumber camp or quarry hands straight into the camp stock
        if(camp) {camp.store ||= {};camp.store[t.resource]=Math.round(((camp.store[t.resource] || 0)+w.carrying)*100)/100;}
        else credit(s,t.resource,w.carrying);
        s.workerIncome ||= {};s.workerIncome[t.resource]=(s.workerIncome[t.resource] || 0)+w.carrying;
        const log=s.workerLog ||= [];
        log.push({tick:state.tick,worker:w.id,resource:t.resource,amount:w.carrying,dropoff:w.dropoff});
        const limit=R.logEntries || 64;
        if(log.length>limit)log.splice(0,log.length-limit);
      }
      w.deliveries=(w.deliveries || 0)+1;w.carrying=0;w.phase=0;w.elapsed=0;w.trip=null;
      delete w.cargoResource;
      if(runtime || t.kind==='return')w.departure=[...t.origin];
      if(w.offSpot) {delete w.offSpot;w.spot=null;w.dropoff=null;}   // Move extras: off his spot once the load is in
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
    // one waiting in the hall for a spot (w.wait, Tim 2026-11-22) clears ground too: he comes out for it
    for(const w of s.workers)if(selected.length<data.rates.maxBuilders && !selected.includes(w) && !w.carrying && (!w.order || w.wait) && !w.job) {
      if(w.wait)endWait(s,w);
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
  // War camp construction (checkpoint 4; 7c-4, Tim 2026-11-12: manual). Workers sent by a 'work' order walk to the
  // building site (or the camp hall while it is upgraded) and build it, one progress point per worker per tick at the
  // site: more workers build faster. A site with nobody on it is marked b.idle (it flashes on screen). Only a bot
  // clan's camp still sends up to war.builders idle workers by itself. Returns the busy builders.
  // Tim 2026-11-12 playtest: the player's workers wait where they are for orders (a new worker outside the hall, a
  // builder or repairer by the finished job) unless the site runs itself (a bot clan, or a town with Automatic on)
  const selfRun=s=>!!state.clans?.[s.owner]?.bot || (!s.camp && !!s.autoBuild);
  function waitHere(s,w) {
    if(selfRun(s)) {delete w.by;return;}
    if(w.trip?.kind==='move' || !w.trip){w.departure=currentPoint(w) || w.departure;w.trip=null;w.elapsed=0;w.phase=0;}
    w.order={kind:'hold'};w.by='p';w.spot=null;delete w.nextSpot;delete w.nextOrder;
  }
  function campBuild(s) {
    const BD=data.war?.buildings || {},max=state.clans?.[s.owner]?.bot ? data.war?.builders ?? 3 : 0,busy=new Set();
    const jobs=s.buildings.filter(b=>b.stage==='site' || b.upgrade),ids=new Set(jobs.map(b=>b.id));
    for(const w of s.workers)if(w.project && !ids.has(w.project)) {
      delete w.project;delete w.buildAt;
      if(w.trip?.kind==='move'){w.departure=currentPoint(w) || w.departure;w.trip=null;w.elapsed=0;w.phase=0;}
    }
    for(const b of jobs) {
      const job=b.upgrade || b,r=(BD[b.type]?.radius ?? 8)*0.8;
      let crew=s.workers.filter(w=>w.project===b.id);
      if(crew.length<max) {
        const free=s.workers.filter(w=>!w.project && !w.order && !w.carrying && w.by!=='p' && w.trip?.kind!=='return')
          .map(w=>({w,d:distance(currentPoint(w) || [s.x,s.z],[b.x,b.z])})).sort((a,c)=>a.d-c.d || compare(a.w.id,c.w.id));
        for(const {w} of free.slice(0,max-crew.length)) {
          const here=currentPoint(w) || [s.x,s.z],a=crew.length*2*Math.PI/Math.max(1,max),goal=[b.x+Math.cos(a)*r,b.z+Math.sin(a)*r],route=path(here,goal);
          if(!route)continue;
          w.project=b.id;w.buildAt=route.at(-1);w.departure=here;w.trip=moveTrip(route);w.elapsed=0;w.phase=0;delete w.status;delete w.retryAt;
          crew.push(w);
        }
      }
      let work=0;
      for(const w of crew) {
        busy.add(w);
        const e=state.entities?.[w.entity];
        if(w.trip) {
          if(progress(s,w)) {w.elapsed++;w.phase=Math.min(1,w.elapsed/w.trip.total);if(w.elapsed>=w.trip.total){w.departure=[...w.trip.destination];w.trip=null;w.elapsed=0;w.phase=0;}}
          continue;
        }
        work++;
        if(e) {e.anim='hammer';e.dir=dirIndex(b.x-e.x,b.z-e.z);}
      }
      if(crew.length)delete b.idle;else b.idle=true;
      if(!s.war?.terms)job.progress=Math.min(job.need,(job.progress || 0)+work);   // Tim 2026-11-18: no building in a ceasefire
      if(job.progress>=job.need) {
        if(b.upgrade) {b.tier=(b.tier || 1)+1;delete b.upgrade;}
        else {b.stage='built';delete b.progress;delete b.need;delete b.rebuild;}
        delete b.idle;
        for(const w of crew) {
          delete w.project;delete w.buildAt;
          // Tim 2026-11-15: a palisade run is one job: its builders go on to the nearest piece of the run still to build
          const cap=data.war?.builderCap ?? 4,here=currentPoint(w) || [b.x,b.z];
          const next=b.line ? s.buildings.filter(x=>x.line===b.line && x.stage==='site' && s.workers.filter(o=>o.project===x.id).length<cap)
            .map(x=>({x,d:distance(here,[x.x,x.z])})).sort((p,q)=>p.d-q.d || compare(p.x.id,q.x.id))[0]?.x : null;
          const r2=next ? (BD[next.type]?.radius ?? 8)*0.8 : 0,a=next ? Math.atan2(here[1]-next.z,here[0]-next.x) : 0;
          const route=next ? path(here,[next.x+Math.cos(a)*r2,next.z+Math.sin(a)*r2]) || path(here,[next.x-Math.cos(a)*r2,next.z-Math.sin(a)*r2]) : null;
          if(route){w.project=next.id;w.buildAt=route.at(-1);w.departure=here;w.trip=moveTrip(route);w.elapsed=0;w.phase=0;delete next.idle;continue;}
          busy.delete(w);waitHere(s,w);   // done: they wait by it (a bot clan's go back to the camp's own work)
        }
      }
    }
    return busy;
  }
  // 7c-4 repair and douse: workers on a 'work' order at one of their site's structures. They walk there, then every
  // tick the ones at it work (jobs.work: fire first, then health, paid from the site's stock). When it is done, or
  // gone, they go back to the site's own work. Returns the busy workers.
  function jobWork(s) {
    const busy=new Set(),by=new Map();
    for(const w of s.workers)if(w.job) {if(!by.has(w.job.key))by.set(w.job.key,[]);by.get(w.job.key).push(w);}
    for(const [key,crew] of by) {
      const t=jobs?.target?.(s,key);
      let n=0;
      if(t)for(const w of crew) {
        busy.add(w);
        if(w.trip) {
          if(progress(s,w)) {w.elapsed++;w.phase=Math.min(1,w.elapsed/w.trip.total);if(w.elapsed>=w.trip.total){w.departure=[...w.trip.destination];w.trip=null;w.elapsed=0;w.phase=0;}}
          continue;
        }
        n++;
        const e=state.entities?.[w.entity];
        if(e) {e.anim='hammer';e.dir=dirIndex(t.x-e.x,t.z-e.z);}
      }
      const r=!t ? 'done' : n ? jobs.work(s,key,n) : 'working';
      for(const w of crew) {
        if(r==='done') {delete w.job;delete w.status;busy.delete(w);waitHere(s,w);}
        else if(r==='waiting')w.status='waiting for timber or stone';else delete w.status;
      }
    }
    return busy;
  }
  // nearest hall or storehouse to a camp, for its carts
  const cartHome=(s,b)=>{const p=point(s,b),h=homeDrops(s).map(x=>point(s,x)).sort((a,c)=>distance(a,p)-distance(c,p))[0];return h || [s.x,s.z];};
  // Move extras (Tim 2026-11-22), the camp card and Workers view button: on each spot that counts for the camp
  // (camp_load.js: its kind, in reach, this camp the nearest), the workers past the spot's max (supportsWorkers, the
  // number the governor fills it to) go back to the governor (by 'g'): his own first, then those with no load. One
  // with no load leaves the spot now, one carrying hands it in first (w.offSpot). Then the governor places them (a
  // camp spot with room, or a wait in the hall); with Initiative off they stand idle. ok + moved = how many; a
  // campMoved news line tells the player what became of them.
  const spotCount=()=>spotCounts(sites());
  const loadOf=(s,b,count)=>campLoad(s,b,{R,index,stages:spotRules?.stages,count});
  function campExtras(s,id) {
    const b=s.buildings.find(x=>x.id===id && x.stage==='built'),load=b && loadOf(s,b,spotCount());
    if(!load)return result('not a work camp');
    const gone=[];
    for(const {p,n,max} of load.spots) {
      if(n<=max)continue;
      const mine=s.workers.filter(w=>w.spot===p.id && !w.project && !w.offSpot).sort((x,y)=>(x.by==='g' ? 0 : 1)-(y.by==='g' ? 0 : 1) || (x.carrying>0 ? 1 : 0)-(y.carrying>0 ? 1 : 0) || compare(x.id,y.id));
      for(const w of mine.slice(0,n-max)) {
        w.by='g';delete w.nextSpot;delete w.status;delete w.retryAt;delete w.fresh;
        if(w.carrying>0)w.offSpot=true;
        else {const here=currentPoint(w);if(here)w.departure=here;w.spot=null;w.trip=null;w.elapsed=0;w.phase=0;w.dropoff=null;}
        gone.push(w);
      }
    }
    if(!gone.length)return result('no extra workers at this camp');
    assignIdle(s);
    const moved=gone.length,loaded=gone.filter(w=>w.offSpot).length,placed=gone.filter(w=>!w.offSpot && (w.spot || w.nextSpot)).length,waiting=gone.filter(w=>!w.offSpot && w.wait).length,idle=moved-loaded-placed-waiting;
    const label=(data.buildings?.[b.type]?.name || b.type.replace(/_/g,' ')).toLowerCase(),parts=[placed && `${placed} to another spot`,waiting && `${waiting} wait in the town hall`,loaded && `${loaded} hand in their load first`,idle && `${idle} stand idle`].filter(Boolean);
    (state.news ||= []).push({kind:'campMoved',clan:s.owner,settlement:s.id,building:b.id,moved,placed,waiting,loaded,idle,text:`${s.name} ${label}: ${moved} worker${moved>1 ? 's' : ''} moved off. ${parts.join(', ')}`});
    refreshTired(s,spotCount());
    return {...result(),moved};
  }
  // a town's work camps with more workers on their spots than the max (town alert, map marker, Workers view)
  function refreshTired(t,count) {
    const tired=[];
    for(const b of t.buildings || []) {
      const load=b.stage==='built' && R.campTakes?.[b.type] && loadOf(t,b,count);
      if(load && load.extra>0)tired.push({id:b.id,type:b.type,extra:load.extra,n:load.n,max:load.max});
    }
    if(tired.length)t.tiredCamps=tired;else delete t.tiredCamps;
  }
  function buyCampCart(s,id) {
    const b=s.buildings.find(x=>x.id===id),C=cartRules(data);
    const err=buyCart(s,data,b,cost=>{if(Object.entries(cost).some(([r,v])=>(s.stock[r] || 0)<v))return false;for(const [r,v] of Object.entries(cost))world.change(s.id,r,-v,'cart');return true;});
    return err ? result(err) : result();
  }
  // where a drawn cart starts and stops: the edges of the camp and of the hall or storehouse, not their centres (Tim 2026-11-10)
  function cartEnds(s,b) {
    const a=point(s,b),h=cartHome(s,b),d=distance(a,h),cell=s.grid?.cell || data.townGrid?.cellSize || 11,k=cartRules(data).stopEdge ?? 0.5;
    const hb=homeDrops(s).find(x=>distance(point(s,x),h)<1e-6),ra=cell*k*(data.buildings?.[b.type]?.size || 1),rh=cell*k*(data.buildings?.[hb?.type]?.size || 1);
    if(d<=ra+rh+1)return [a,h];
    return [[a[0]+(h[0]-a[0])*ra/d,a[1]+(h[1]-a[1])*ra/d],[h[0]+(a[0]-h[0])*rh/d,h[1]+(a[1]-h[1])*rh/d]];
  }
  function tick() {
    if(!R)return;
    const enabled=runtime && modeRules(state).island;
    const anchors=enabled ? Object.values(state.entities).filter(e=>e.place==='world' && !e.worker && !e.worldCamp && e.type!=='civilian' && e.owner && !e.dead && !e.downed && !e.jailed) : [];
    const near=p=>p && anchors.some(e=>distance(p,[e.x,e.z])<=R.spawnRadius);
    let spawned=0;
    // workers of a war that is over (or whose camp is gone) go home with it
    if(runtime && state.tick%20===0) {
      const ids=new Set(sites().map(x=>x.id));
      for(const e of Object.values(state.entities))if(e.worker && e.town && !ids.has(e.town))runtime.remove(e.id);
    }
    for(const s of sites()) {
      ensureWorkers(s);if(!on(s))continue;
      if(s.camp && state.tick%20===0)assignIdle(s);   // no governor in a camp: idle hands pick timber or stone themselves
      if(!s.camp && cartRules(data)) {
        stepCarts(s,data,world.change,point,cartHome);
        for(const b of s.buildings)for(const c of b.carts || []) {   // decoration: an ox cart on the road near your units
          const e=c.entity && state.entities?.[c.entity], at=enabled && b.cartTicks ? cartPoint(c,...cartEnds(s,b),b.cartTicks) : null;
          // 7c-5: the other side of a war on this town can destroy a cart on the road (sim/game.js frontierShield); at 0 health it is a wreck
          if(e && (e.dead || e.downed || e.hp<=0)) {
            (state.news ||= []).push({kind:'cartDestroyed',town:s.id,x:e.x,z:e.z,owner:s.owner});
            if(state.clans?.[s.owner])state.clans[s.owner].notice={tick:state.tick ?? 0,text:`An ox cart of ${s.name} was destroyed`};
            runtime.remove(e.id);wreckCart(data,c);continue;
          }
          // Tim 2026-11-07: carts stay drawn out to carts.viewRadius (about 1.25 zoomed-out screens), never hidden by fog
          const cr=cartRules(data).viewRadius ?? R.spawnRadius;
          if(!at || !anchors.some(u=>distance(at,[u.x,u.z])<=cr)) {if(e)runtime.remove(e.id);c.entity=null;continue;}
          if(!e) {if(spawned>=R.spawnPerTick)continue;spawned++;c.entity=runtime.spawn('civilian',cartRules(data).model || 'ox_cart',at[0],at[1],{place:'world',area:'world',cart:b.id,town:s.id,cartOwner:s.owner,seenBy:s.owner,holdFire:true,hp:cartRules(data).hp ?? 200,maxHp:cartRules(data).hp ?? 200});continue;}
          [e.x,e.z]=at;e.dir=dirIndex(at[2],at[3]);e.anim='run';
        }
      }
      // Tim 2026-11-22: a town over its hall tier's worker limit (an old save, after the Town limit went from 90 to
      // 60) lets the extra ones go back to the townspeople: those in training first, then the governor's idle ones,
      // the player's own picks and anyone carrying or on a job last
      if(!s.camp && (state.tick || 0)%20===0) {
        let over=s.workers.length+s.workerTraining.length-workerCap(s,data);
        if(Number.isFinite(over) && over>0) {
          while(over>0 && s.workerTraining.length) {s.workerTraining.pop();world.changePop(s.id,R.personCost,'train');over--;}
          const rank=w=>(w.by==='p' ? 8 : 0)+(w.garrison || w.job || w.project ? 4 : 0)+(w.carrying>0 ? 2 : 0)+(w.spot ? 1 : 0);
          const out=new Set([...s.workers].sort((a,b)=>rank(a)-rank(b) || compare(b.id,a.id)).slice(0,Math.max(0,over)));
          for(const w of out) {const e=state.entities?.[w.entity];if(e)runtime?.remove(e.id);world.changePop(s.id,R.personCost,'train');}
          if(out.size)s.workers=s.workers.filter(w=>!out.has(w));
        }
      }
      // A disappeared/knocked-out live unit is a casualty, never a fresh spawn. Sleeping
      // records have entity:null, so they cannot be attacked or accidentally lost.
      s.workers=s.workers.filter(w=>{
        if(w.entity===null)return true;
        const e=state.entities?.[w.entity];
        if(!e || e.dead || e.downed || e.hp<=0) {if(e && !e.dead)runtime?.remove(e.id);return false;}   // a dead one lies there as a body (sim/game.js cleanUpDead, Tim 2026-11-13)
        return true;
      });
      while(s.workerTraining.length && s.workerTraining[0].readyAt<=(state.tick || 0)) {
        const job=s.workerTraining.shift(),w={id:job.id,spot:null,dropoff:null,phase:0,carrying:0,entity:null,elapsed:0,trip:null};
        if(enabled)w.departure=waitingPoint(s,w);
        if(s.camp && !selfRun(s))w.fresh=true;   // Tim 2026-11-12: a new camp worker waits outside the hall for orders (a town's waits unless Automatic is on)
        s.workers.push(w);
      }
      const busy=s.camp ? campBuild(s) : clear(s),onJob=jobWork(s);
      for(const w of s.workers) {
        if(onJob.has(w)) {   // repairing or dousing (7c-4): only its entity is kept in step
          const e=state.entities?.[w.entity],current=position(w) || w.departure || [s.x,s.z],awake=enabled && near(current);
          if(e) {if(!awake)suspend(w);else {e.carrying=w.carrying;e.phase=w.phase;}}
          else if(awake && spawned<R.spawnPerTick && runtime.areas.nav.free(...current)) {wake(w,current,s);spawned++;}
          continue;
        }
        if(enabled && s.roadReserve && !w.order && !w.trip && !w.spot && !w.project && (!w.departure || townBlocked(...w.departure))) {
          w.departure=waitingPoint(s,w);
          const e=state.entities?.[w.entity];if(e)[e.x,e.z]=w.departure;
        }
        const project=s.projects.find(p=>p.id===w.project);
        const resting=w.departure || (project ? point(s,project) : [s.x,s.z]);
        const p=position(w) || resting;
        const awake=enabled && near(p);
        if(w.entity!==null && !awake)suspend(w);
        if(state.entities?.[w.entity]?.fishing)delete state.entities[w.entity].fishing;   // set again each tick while it still fishes (gather)
        if(w.order?.kind==='move' && w.trip) {
          if(progress(s,w)) {
            w.elapsed++;w.phase=Math.min(1,w.elapsed/w.trip.total);
            if(w.elapsed>=w.trip.total) {w.departure=[...w.trip.destination];w.trip=null;w.order={kind:'hold'};w.phase=0;}
          }
        } else if(!w.order && !w.trip && !w.spot && !w.project && !w.job && !w.garrison && !w.shelter && w.carrying>0 && !busy.has(w)) {
          // Tim 2026-11-19: an idle worker with a load (no job, no order) walks it to the nearest drop-off instead of standing with it
          if(!(w.retryAt>state.tick)) {const plan=returnPlan(s,w);if(plan.route && plan.resource)setReturnTrip(w,plan);else w.retryAt=state.tick+(R.retryTicks || 100);}
        } else if(!w.order && !busy.has(w) && !w.project && (w.spot || w.trip?.kind==='return'))gather(s,w);
        else if(state.entities?.[w.entity] && !(s.camp && busy.has(w)))state.entities[w.entity].anim='idle';
        const current=position(w) || resting,e=state.entities?.[w.entity];
        if(e) {
          if(!near([e.x,e.z]) || !awake)suspend(w);
          else {e.carrying=w.carrying;e.phase=w.phase;}
        } else if(awake && near(current) && spawned<R.spawnPerTick && runtime.areas.nav.free(...current)) {wake(w,current,s);spawned++;}
      }
      spaceOut(s);
    }
  }
  // Tim 2026-11-13: workers standing still (waiting, holding, building) never stack on one spot: any two closer than
  // workers.restSpacing ease apart a little each tick, onto open ground only; the new spot becomes where they rest
  function spaceOut(s) {
    const S=R.restSpacing ?? 0.8,nav=runtime?.areas?.nav,still=s.workers.filter(w=>!w.trip && state.entities?.[w.entity]);
    if(!nav || still.length<2)return;
    const moved=new Set();
    for(let i=0;i<still.length;i++)for(let j=i+1;j<still.length;j++) {
      const a=state.entities[still[i].entity],b=state.entities[still[j].entity];
      let ux=b.x-a.x,uz=b.z-a.z;const d=Math.hypot(ux,uz);
      if(d>=S)continue;
      if(d<1e-3) {let h=2166136261;for(const ch of String(still[j].id))h=Math.imul(h^ch.charCodeAt(0),16777619);const ang=((h>>>0)%360)*Math.PI/180;ux=Math.cos(ang);uz=Math.sin(ang);}
      else {ux/=d;uz/=d;}
      const step=Math.min(0.06,(S-d)/2);
      if(nav.free(a.x-ux*step,a.z-uz*step)) {a.x-=ux*step;a.z-=uz*step;moved.add(still[i]);}
      if(nav.free(b.x+ux*step,b.z+uz*step)) {b.x+=ux*step;b.z+=uz*step;moved.add(still[j]);}
    }
    for(const w of moved) {const e=state.entities[w.entity];w.departure=[e.x,e.z];}
  }
  function econTick() {
    if(!R || !spotRules?.stages)return;
    // Tim 2026-11-22: each town's work camps over their max (town alert, map marker, Workers view)
    { const count=spotCount();for(const t of towns())if(!t.camp)refreshTired(t,count); }
    for(const [id,chars] of Object.entries(state.frontier.spots || {})) {
      const spot=index.get(id);if(!spot)continue;
      let seed=spotData.seed | 0;for(const ch of id)seed=Math.imul(seed^ch.charCodeAt(0),16777619);
      seed^=state.frontier.econTick;
      const rand=()=>{seed=Math.imul(seed^(seed>>>16),2246822507);return (seed>>>0)/4294967296;};
      const next=regrowSpot(spot,chars,spotRules.stages,rand);
      if(next===null)delete state.frontier.spots[id];else state.frontier.spots[id]=next;
    }
  }
  // the repair and douse rules live in sim/frontier/structures.js: { target(s, key) -> { x, z, r } | null, why(s, key), work(s, key, n) -> 'working' | 'waiting' | 'done', leave(s, w) }
  function attachJobs(h) { jobs=h; }
  // 7c-5: recall a town's ox carts to the town (they park there), or send parked carts out again
  function cartOrder(s,mode,building) {
    if(s.camp || !cartRules(data))return result('no ox carts here');
    if(mode!=='recall' && mode!=='send')return result('unknown cart order');
    return orderCarts(s,data,mode,typeof building==='string' ? building : null) ? result() : result(mode==='recall' ? 'no carts on the road' : 'no parked carts');
  }
  return {cartOrder,campExtras,tick,econTick,buyCampCart,train,trainCamp,siteOf,assign,workerOrder,assignIdle,rebalance,has,position,index,reachSpots,campSide,attach,attachJobs};
}
