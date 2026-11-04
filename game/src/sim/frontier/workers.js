// L3.5: saved worker records, integer-tick trips and automatic ground clearing. No entities.
// Stock/population still have one writer (world.js); no camera, DOM or Math.random.
import { makeSpotIndex, spotState, spotYield, regrowSpot } from '../resource_spots.js';
import { cellToWorld } from './town_grid.js';
const HZ=20;
export function ensureWorkers(s) { s.workers ||= []; s.workerTraining ||= []; }
const result = reason => ({ok:!reason,reason:reason || ''});
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const compare = (a,b) => a===b ? 0 : a<b ? -1 : 1;   // deterministic, independent of browser/server locale

export function createWorkers({state,data,world,spotData=null,spotRules=null}) {
  const R=data.workers, index=makeSpotIndex(spotData || {spots:[],byChunk:{},chunkSize:250});
  const towns=()=>Object.values(state.frontier.settlements).filter(s=>!s.capital);
  const has=s=>!!s.workers?.length;
  const on=s=>!!R && Number.isFinite(s.x) && Number.isFinite(s.z);
  const walkTicks=d=>Math.ceil(d/R.speed*HZ);
  const point=(s,b)=>s.grid && Number.isInteger(b.cell) ? cellToWorld(s,b.cell) : [s.x,s.z];
  const dropoffs=s=>s.buildings.filter(b=>b.stage==='built' && R.dropoffs.includes(b.type));
  function nearestDropoff(s,spot) {
    return dropoffs(s).map(b=>({b,p:point(s,b)})).sort((a,b)=>distance(a.p,[spot.x,spot.z])-distance(b.p,[spot.x,spot.z]) || compare(a.b.id,b.b.id))[0] || null;
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
      if(w.carrying>0)w.nextSpot=spot.id;
      else { w.spot=spot.id;w.trip=null;w.elapsed=0;w.phase=0;w.dropoff=null;delete w.project; }
    }
    return result();
  }
  function assignIdle(s) {
    if(!on(s) || !has(s))return;
    const spots=index.spotsNear(s.x,s.z,R.range).filter(p=>R.resources[p.kind]);
    const resources=[...new Set(Object.values(R.resources))].sort((a,b)=>s.stock[a]-s.stock[b] || compare(a,b));
    for(const w of s.workers) {
      if(w.spot || w.project)continue;
      const spot=resources.map(r=>spots.filter(p=>R.resources[p.kind]===r).sort((a,b)=>distance([s.x,s.z],[a.x,a.z])-distance([s.x,s.z],[b.x,b.z]) || compare(a.id,b.id))[0]).find(Boolean);
      if(spot)assign(s,[w.id],spot.id,'g');
    }
  }
  function start(s,w,spot) {
    const drop=nearestDropoff(s,spot);if(!drop)return false;
    const travel=walkTicks(distance(drop.p,[spot.x,spot.z]));
    const stages=spotRules?.stages, saved=state.frontier.spots?.[spot.id];
    const harvest=stages ? Math.ceil(R.harvestTicks*spot.pieces.length/spotYield(spot,saved,stages)) : R.harvestTicks;
    w.trip={origin:drop.p,destination:[spot.x,spot.z],out:travel,harvest,back:travel,total:Math.max(1,travel*2+harvest),resource:R.resources[spot.kind],load:R.load,harvested:false};
    w.dropoff=drop.b.id;w.elapsed=0;w.phase=0;return true;
  }
  function position(w) {
    const t=w.trip;if(!t)return null;
    if(w.elapsed<t.out) {const f=w.elapsed/t.out;return t.origin.map((v,i)=>v+(t.destination[i]-v)*f);}
    if(w.elapsed<t.out+t.harvest)return [...t.destination];
    const f=t.back ? Math.min(1,(w.elapsed-t.out-t.harvest)/t.back):1;
    return t.destination.map((v,i)=>v+(t.origin[i]-v)*f);
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
    if(!w.trip && !start(s,w,spot))return;
    // Removing a storehouse reroutes a carried load; it never unloads into a vanished building.
    if(!dropoffs(s).some(b=>b.id===w.dropoff)) {
      if(!w.carrying) {w.trip=null;return;}
      const drop=nearestDropoff(s,spot);if(!drop)return;
      const here=position(w), back=walkTicks(distance(here,drop.p));
      w.dropoff=drop.b.id;w.trip={...w.trip,origin:drop.p,destination:here,out:0,harvest:0,back,total:Math.max(1,back),harvested:true};w.elapsed=0;
    }
    const t=w.trip;w.elapsed++;
    if(!t.harvested && w.elapsed>=t.out+t.harvest) {harvest(spot);w.carrying=t.load;t.harvested=true;}
    w.phase=Math.min(1,w.elapsed/t.total);
    if(w.elapsed>=t.total) {
      if(w.carrying) {world.change(s.id,t.resource,w.carrying,'gather');s.workerIncome ||= {};s.workerIncome[t.resource]=(s.workerIncome[t.resource] || 0)+w.carrying;}
      w.deliveries=(w.deliveries || 0)+1;w.carrying=0;w.phase=0;w.elapsed=0;w.trip=null;
      if(w.nextSpot) {w.spot=w.nextSpot;delete w.nextSpot;}
    }
  }
  function clear(s) {
    const p=s.projects.find(p=>p.authorized && p.phase==='clearing');
    for(const w of s.workers)if(w.project && w.project!==p?.id)delete w.project;
    if(!p)return new Set();
    const cells=p.cells || [p.cell], over=()=>cells.filter(i=>s.grid.ground[i]==='o');
    if(!over().length) {p.phase='cleared';return new Set();}
    const selected=s.workers.filter(w=>w.project===p.id).slice(0,data.rates.maxBuilders);
    for(const w of s.workers)if(selected.length<data.rates.maxBuilders && !selected.includes(w) && !w.carrying && w.entity===null) {
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
    for(const s of towns()) {
      ensureWorkers(s);if(!on(s))continue;
      while(s.workerTraining.length && s.workerTraining[0].readyAt<=(state.tick || 0)) {
        const job=s.workerTraining.shift();s.workers.push({id:job.id,spot:null,dropoff:null,phase:0,carrying:0,entity:null,elapsed:0,trip:null});
      }
      const busy=clear(s);
      for(const w of s.workers)if(w.entity===null && !busy.has(w) && !w.project && w.spot)gather(s,w);
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
  return {tick,econTick,train,assign,assignIdle,has,position,index};
}
