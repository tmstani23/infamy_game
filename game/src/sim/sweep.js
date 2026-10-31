import { sweepPatrolRoute } from './sector_patrol.js';
import { deploymentFeedback } from './deployment_feedback.js';
import { withdrawalReason } from './sector_recovery.js';
import { alive } from './util.js';
export const SWEEP = { holdTicks:400, holdRadius:6, groupRadius:3, scatterTicks:600, timeoutTicks:3600 };
export function createSweep({ state, deployment, rally, clearCombat, hostile, sees, attackStep, rewards, onScatter = () => {}, recover = () => {}, recoverHome = () => false }) {
  const taskOf = (clan, sector) => state.deployment.clans[clan]?.sectors[sector];
  const adjacent = new Set(), { cells, w } = deployment.cellGrid();
  const ids = state.deployment.sectors.map(s => s.id);
  for (let k=0;k<cells.length;k++) if (cells[k]>=0)
    for (const n of [k%w+1<w?k+1:-1,k+w<cells.length?k+w:-1])
      if(n>=0&&cells[n]>=0&&cells[k]!==cells[n]){
        adjacent.add(ids[cells[k]]+':'+ids[cells[n]]);
        adjacent.add(ids[cells[n]]+':'+ids[cells[k]]);
      }
  const nearby = (sector,target) => adjacent.has(sector+':'+target);
  const available = e => alive(e)&&!e.deployment.transfer&&!e.deployment.scattered&&!e.deployment.duty?.manual
    &&!e.holdFire&&!e.smokePassive&&!rally.participating(e);
  const teamOf = (clan,sector,op) => op.units.map(id=>state.entities[id]).filter(e=>alive(e)&&e.owner===clan
    &&e.deployment?.group===sector&&!e.deployment.transfer&&!e.deployment.scattered&&!rally.participating(e));
  const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  const rivals = (e,op) => Object.values(state.entities).filter(t=>alive(t)&&t.owner===op.targetClan
    &&t.type!=='civilian'&&!t.cop&&!t.wild&&e.place==='street'&&t.place==='street'
    &&deployment.sectorAt(t.x,t.z)===op.targetSector&&distance(e,t)<=7&&hostile(e,t)&&sees(e,t));
  const targetOf = (e,op) => rivals(e,op).sort((a,b)=>distance(e,a)-distance(e,b))[0];
  function eligibility(clan,sector,target,targetClan) {
    const task=taskOf(clan,sector),destination=state.deployment.sectors.find(s=>s.id===target);
    if(state.clans[clan]?.faction!=='kuroda'||!task||!state.deployment.restrictionsEnabled)
      return {ok:false,why:'Choose a Kuroda sector squad'};
    if(task.operation||task.recovery)return {ok:false,why:'Squad is operating or recovering'};
    if(!destination||!nearby(sector,target))return {ok:false,why:'Choose an adjacent sector'};
    if(!state.clans[targetClan]||targetClan===clan)return {ok:false,why:'Choose a rival clan'};
    if(Object.values(state.deployment.clans[clan].sectors).some(t=>t.operation?.kind==='sweep'&&t.operation.targetSector===target))
      return {ok:false,why:'A squad is already sweeping that sector'};
    const team=deployment.members(clan,sector).filter(available);
    if(!team.length)return {ok:false,why:'Return available sector crew to duty first'};
    return {ok:true,team,destination};
  }
  function recall(clan,sector,reason) {
    const task=taskOf(clan,sector),op=task?.operation;
    if(op?.kind!=='sweep'||op.state==='Returning')return;
    op.state='Returning';op.reason=reason;
    delete op.suspendedAt;delete op.resumeState;
    if(task.recovery?.home)task.recovery.resumePoint={...op.returnPoint};
    for(const e of teamOf(clan,sector,op)){clearCombat(e);e.order={kind:'stop'};}
  }
  function command(h,c) {
    if(h.type!=='hero')return false;
    const task=taskOf(h.owner,c.sector),op=task?.operation;
    const result=(ok,text)=>deploymentFeedback(state,h,c,ok,text);
    if(c.action==='sweep'){
      const check=eligibility(h.owner,c.sector,c.targetSector,c.targetClan);
      if(!check.ok){result(false,check.why);return true;}
      const planner={...check.team[0],deployment:{group:c.targetSector}},planTask={objective:check.destination.anchor};
      const points=sweepPatrolRoute(state,deployment,planner,planTask);
      if(points.length<3){result(false,'No safe three-point Sweep route in this sector');return true;}
      task.operation={kind:'sweep' ,state:'Marching',targetSector:c.targetSector,targetClan:c.targetClan,
        points,pointIndex:0,point:points[0],returnPoint:{...task.objective,place:'street'},
        units:check.team.map(e=>e.id),startedAt:state.tick,hold:0,seen:[],
        rewardSequence:rewards?.sectorClaim(h.owner,c.targetSector).sequence??0};
      delete task.engagement;
      for(const e of check.team){clearCombat(e);e.order={kind:'stop'};e.deployment.duty={manual:false,status:'Sweep: marching'};}
      state.news.push({kind:'sweepAlert',clan:h.owner,defender:c.targetClan,sector:c.targetSector,x:points[0].x,z:points[0].z});
      result(true,'SWEEP DISPATCHED — secure three street positions for 20 seconds each');return true;
    }
    if(c.action==='cancelSweep'&&op?.kind==='sweep'){
      recall(h.owner,c.sector,'Recall ordered');result(true,'SWEEP RECALLED — returning to saved duty');return true;
    }
    if(c.action==='assignment'&&op?.kind==='sweep'){result(false,'Recall the Sweep squad before changing its saved duty');return true;}
    if(c.action==='return'&&!c.selectionChange&&Array.isArray(c.units))
      for(const [sector,t]of Object.entries(state.deployment.clans[h.owner]?.sectors||{}))
        if(t.operation?.kind==='sweep'&&t.operation.units.some(id=>c.units.includes(id)))recall(h.owner,sector,'Return to duty ordered');
    return false;
  }
  const gathered = (team,point,sector) => team.every(e=>e.place==='street'&&deployment.sectorAt(e.x,e.z)===sector&&distance(e,point)<2.5);
  function success(clan,sector,op,team) {
    op.success=true;
    op.reward=op.seen.length>=2?(rewards?.claimSweep(clan,op.targetSector,op.rewardSequence)||0):0;
    op.scattered=[];
    for(const e of deployment.members(op.targetClan,op.targetSector)){
      if(!alive(e)||e.deployment.transfer||e.deployment.scattered||rally.participating(e)||e.place!=='street'
        ||deployment.sectorAt(e.x,e.z)!==op.targetSector)continue;
      onScatter(e);clearCombat(e);e.order={kind:'stop'};
      // Keep the assignment slot reserved throughout the physical HQ/recovery/return trip.
      e.deployment.scattered={phase:'Withdrawing',sector:op.targetSector,startedAt:state.tick};
      e.deployment.duty={manual:false,status:'Scattered: withdrawing to HQ'};
      op.scattered.push(e.id);
    }
    state.casts.push({kind:'sweepSuccess',a:team[0].id,x:op.point.x,z:op.point.z,place:'street',
      streetX:op.point.x,streetZ:op.point.z,bonus:op.reward});
    state.news.push({kind:'sweepSuccess',clan,sector:op.targetSector,rival:op.targetClan,ryo:op.reward,scattered:op.scattered.length});
    state.clans[clan].notice={tick:state.tick,text:'SWEEP COMPLETE'+(op.reward?' · +'+op.reward+' ryo':' · reward unavailable')+' — returning to duty'};
    recall(clan,sector,'Area secured');
  }
  function tick() {
    for(const e of Object.values(state.entities)){
      if(e.buffs?.sweep)delete e.buffs.sweep;
      if(e.deployment?.scattered&&!alive(e))delete e.deployment.scattered;
    }
    for(const [clan,config]of Object.entries(state.deployment.clans))for(const [sector,task]of Object.entries(config.sectors)){
      const op=task.operation;if(op?.kind!=='sweep')continue;
      const team=teamOf(clan,sector,op);
      if(!team.length){delete task.operation;continue;}
      if(task.recovery)continue;
      if(op.units.some(id=>!alive(state.entities[id]))&&recoverHome(clan,sector,'Sweep casualty — returning home for replacements',op.units))continue;
      if(op.state!=='Returning'){
        const reason=withdrawalReason(state.entities,op.units);
        if(reason)recall(clan,sector,reason);
        else if(state.tick-op.startedAt>=SWEEP.timeoutTicks)recall(clan,sector,'Operation timed out');
      }
      if(op.state==='Returning'){
        if(gathered(team,op.returnPoint,sector)){
          for(const e of team){clearCombat(e);e.order={kind:'stop'};e.deployment.duty={manual:false,status:'On duty'};}
          delete task.operation;
          if(team.some(e=>e.hp<e.maxHp*.7))recover(clan,sector,'Recovering after Sweep');
        }
      }else{
        const visible=[...new Map(team.flatMap(e=>rivals(e,op)).map(e=>[e.id,e])).values()];
        for(const e of visible)if(!op.seen.includes(e.id))op.seen.push(e.id);
        const contest=visible.some(e=>distance(e,op.point)<=SWEEP.holdRadius);
        op.contested=contest;
        if(!op.reached&&gathered(team,op.point,op.targetSector)){
          op.reached=true;
          state.news.push({kind:'sweepArrival',clan,defender:op.targetClan,sector:op.targetSector,
            point:op.pointIndex+1,x:op.point.x,z:op.point.z,units:team.map(e=>e.id)});
        }
        if(visible.length)op.state='Fighting';
        else op.state=op.reached?'Holding':'Marching';
        // Neither a defender nor a chase outside the hold area advances the objective.
        if(op.reached&&!contest&&gathered(team,op.point,op.targetSector)){
          op.state='Holding';op.hold++;
          if(op.hold>=SWEEP.holdTicks){
            if(op.points&&op.pointIndex<op.points.length-1){op.pointIndex++;op.point=op.points[op.pointIndex];op.hold=0;op.reached=false;op.state='Marching';
              state.news.push({kind:'sweepPoint',clan,defender:op.targetClan,sector:op.targetSector,point:op.pointIndex+1,x:op.point.x,z:op.point.z});
            }else success(clan,sector,op,team);
          }
        }
      }
      for(const e of team)if(team.length>=2&&team.every(a=>a.place===e.place&&distance(a,e)<=SWEEP.groupRadius))
        (e.buffs||={}).sweep={until:state.tick+2,taken:.9};
    }
  }
  function travel(e,unit,point,record){
    if(!record.travel||state.tick-record.travel.tick>=20){
      if(record.travel&&distance(e,record.travel)<.2)clearCombat(e);
      record.travel={x:e.x,z:e.z,tick:state.tick};
    }
    const result=deployment.localTravel(e,unit,point);
    if(result==='arrived')e.anim='idle';
    if(result==='blocked'){e.anim='idle';e.deployment.duty.status+=' (route blocked; retrying)';}
    return result;
  }
  function scatterStep(e,unit){
    const s=e.deployment?.scattered;if(!s)return false;
    if(rally.participating(e)){delete e.deployment.scattered;clearCombat(e);return false;}
    const home=deployment.destination(e,'home');
    const task=taskOf(e.owner,s.sector);
    if(!task){delete e.deployment.scattered;return false;}
    if(!home)s.phase='Returning';
    e.deployment.duty={manual:false,status:'Scattered: '+s.phase.toLowerCase()};
    if(s.phase==='Withdrawing'){
      if(travel(e,unit,home,s)==='arrived'){s.phase='Recovering';s.readyAt=state.tick+SWEEP.scatterTicks;clearCombat(e);}
    }else if(s.phase==='Recovering'){
      e.anim='idle';e.order={kind:'stop'};
      if(e.hp>=e.maxHp*.7&&state.tick>=s.readyAt
        &&state.tick-Math.max(e.hitAt??-Infinity,e.foughtAt??-Infinity)>=120)s.phase='Returning';
    }else if(travel(e,unit,{...task.objective,place:'street'},s)==='arrived'){
      delete e.deployment.scattered;clearCombat(e);e.order={kind:'stop'};e.deployment.duty={manual:false,status:'On duty'};
    }
    return true;
  }
  function step(e,unit) {
    const task=taskOf(e.owner,e.deployment?.group),op=task?.operation;
    if(task?.recovery)return false;
    if(op?.kind!=='sweep'||!op.units.includes(e.id)||e.deployment.transfer||e.deployment.scattered||rally.participating(e))return false;
    e.deployment.duty={manual:false,status:'Sweep: '+op.state.toLowerCase()};
    const foe=op.state!=='Returning'&&targetOf(e,op);
    op.targets||={};
    if(op.targets[e.id]!==foe?.id){clearCombat(e);delete op.travel?.[e.id];}
    if(foe){op.targets[e.id]=foe.id;e.deployment.duty.status='Sweep: fighting';attackStep(e,unit,foe);return true;}
    delete op.targets[e.id];op.travel||={};
    if(op.state==='Holding'&&e.place==='street'&&distance(e,op.point)<=SWEEP.holdRadius){e.anim='idle';return true;}
    const team=teamOf(e.owner,e.deployment.group,op),leader=team[0];
    // Followers close up before the leader advances; no teleport or speed boost.
    if(op.state==='Marching'&&e===leader&&team.some(a=>a.place===e.place&&distance(a,e)>3)){
      e.anim='idle';return true;
    }
    const point=op.state==='Returning'?op.returnPoint:op.state==='Marching'&&leader!==e
      &&distance(leader,op.point)>2?{x:leader.x,z:leader.z,place:leader.place,reach:1}:op.point;
    travel(e,unit,point,op.travel[e.id]||=( {} ));
    return true;
  }
  function manual(e){
    const op=taskOf(e.owner,e.deployment?.group)?.operation;
    if(op?.kind==='sweep'&&op.units.includes(e.id))recall(e.owner,e.deployment.group,'Manual recall');
  }
  return {command,tick,step,scatterStep,manual,eligibility,nearby,recall};
}
