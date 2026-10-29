import { deploymentFeedback } from './deployment_feedback.js';
import { withdrawalReason } from './sector_recovery.js';
import { dirIndex } from './geometry.js';
import { alive } from './util.js';

// One-shot sector operation. Membership and the saved Patrol/Guard duty never change.
// All timers, projectiles, hazards, hostages and payout claims are plain server state.
export const SHAKEDOWN = { holdSeconds:20, radius:4, fuseSeconds:1.25, flightSeconds:.65,
  blastDamage:60, blastRadius:2.2, fireSeconds:8, fireRadius:.7, fireDamage:6,
  emergencyDamage:110, emergencyRadius:3, retrySeconds:60, timeoutSeconds:120,
  defenderRadius:9, blockedSeconds:1.25, friendlyFire:true };
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
export function createShakedown({ state, deployment, rally, vision, sees, rooms, doors, navOf,
  spawn, remove, clearCombat, attackStep, hit, addHeat, rules = {} }) {
  const R = { ...SHAKEDOWN, ...rules }, ticks = s => Math.round(s*20);
  const S = state.shakedowns ||= { next:1, bombs:[], fires:[], retry:{} };
  const taskOf = (clan,id) => state.deployment.clans[clan]?.sectors[id];
  const operations = () => Object.entries(state.deployment.clans).flatMap(([clan,c]) => Object.entries(c.sectors)
    .filter(([,t])=>t.operation?.kind==='shakedown').map(([sector,t])=>({clan,sector,task:t,op:t.operation})));
  const teamOf = (clan,sector,op) => op.units.map(id=>state.entities[id]).filter(e=>alive(e)&&e.owner===clan&&e.deployment?.group===sector&&!e.deployment.transfer&&!rally.participating(e));
  const observe = (team,t) => alive(t)&&team.some(e=>e.place===t.place&&distance(e,t)<=vision.range&&sees(e,t));
  const notice = (clan,text) => { if(state.clans[clan])state.clans[clan].notice={tick:state.tick,text}; };
  function geometry(b) {
    const room=rooms.find(r=>r.name===b?.room), door=doors.find(d=>d.to&&!d.ninja&&d.place===b?.room);
    if(!room||!door)return null;
    const dx=room.origin.x+room.size[0]/2-door.to.x,dz=room.origin.z+room.size[1]/2-door.to.z,len=Math.hypot(dx,dz)||1;
    const ux=dx/len,uz=dz/len,grid=navOf(b.room);
    const point=(forward,side)=>{const p=grid.nearestFree(door.to.x+ux*forward-uz*side,door.to.z+uz*forward+ux*side);return {x:p[0],z:p[1],place:b.room};};
    return { door, ux, uz, front:point(Math.min(4,len*.7),0), civilian:[point(Math.min(5.5,len*.85),1),point(Math.min(5.5,len*.85),2)], innerBomb:point(2.4,-2.5) };
  }
  // Adjacency follows cardinal street cells, not the district's decorative rectangles.
  const adjacent = new Set();
  const {cells,w}=deployment.cellGrid(),ids=state.deployment.sectors.map(s=>s.id);
  for(let k=0;k<cells.length;k++)if(cells[k]>=0)for(const n of [k%w+1<w?k+1:-1,k+w<cells.length?k+w:-1])
    if(n>=0&&cells[n]>=0&&cells[k]!==cells[n]){adjacent.add(`${ids[cells[k]]}:${ids[cells[n]]}`);adjacent.add(`${ids[cells[n]]}:${ids[cells[k]]}`);}
  const nearby = (sector,b) => {const target=b?.ring&&deployment.sectorAt(...b.ring);return target===sector||adjacent.has(`${sector}:${target}`);};
  function eligibility(clan,sector,business) {
    const task=taskOf(clan,sector),b=state.businesses[business];
    if(state.clans[clan]?.faction!=='yakuza'||!task||!state.deployment.restrictionsEnabled)return {ok:false,why:'Choose a Yakuza sector squad'};
    if(!state.night)return {ok:false,why:'Shakedowns start at night'};
    if(task.operation||task.recovery)return {ok:false,why:'Squad is already operating or recovering'};
    if(!b?.room||!b.ring||b.hideout||!state.clans[b.owner]||b.owner===clan||!rulesFor(b).payout||!nearby(sector,b))return {ok:false,why:'Choose a rival business in this sector or a neighboring sector'};
    if(state.attacks[b.id]||b.shakedownClaim||operations().some(x=>x.op.business===b.id))return {ok:false,why:'Business already has an attack or unpaid Shakedown claim'};
    if((S.retry[b.id]||0)>state.tick)return {ok:false,why:`Business recovering: ${Math.ceil((S.retry[b.id]-state.tick)/20)} s`};
    const team=deployment.members(clan,sector).filter(e=>alive(e)&&!e.deployment.transfer&&!e.deployment.duty?.manual&&!e.holdFire&&!e.smokePassive&&!rally.participating(e));
    if(!team.length)return {ok:false,why:'Return available sector crew to duty first'};
    if(!geometry(b))return {ok:false,why:'Business has no reachable front room'};
    return {ok:true,team,b};
  }
  const rulesFor = b => rules.businesses?.[b?.kind] || {};
  function release(op) {
    for(const id of op.civilians||[]){const e=state.entities[id];if(e?.shakedownCivilian){e.shakedownCivilian.released=true;delete e.shakedownHostage;}}
  }
  function withdraw(clan,sector,reason) {
    const task=taskOf(clan,sector),op=task?.operation;if(op?.kind!=='shakedown'||op.state==='Returning')return;
    release(op);op.state='Returning';op.reason=reason;op.returnAt=state.tick;delete op.intimidator;
    S.retry[op.business]=state.tick+ticks(R.retrySeconds);
    for(const e of teamOf(clan,sector,op)){clearCombat(e);e.order={kind:'stop'};delete e.shakedownAction;}
    notice(clan,`${op.success?'Shakedown complete':'Shakedown abandoned'} — ${reason}`);
  }
  function command(h,c) {
    if(h.type!=='hero')return false;
    const task=taskOf(h.owner,c.sector),op=task?.operation;
    const result=(ok,text)=>deploymentFeedback(state,h,c,ok,text);
    if(c.action==='shakedown') {
      const check=eligibility(h.owner,c.sector,c.business);if(!check.ok){result(false,check.why);return true;}
      const {b,team}=check,g=geometry(b),id=S.next++;
      task.operation={kind:'shakedown',id,business:b.id,defender:b.owner,units:team.map(e=>e.id),state:'Rushing',startedAt:state.tick,progress:0,front:g.front,civilians:[]};
      delete task.engagement;
      for(const e of team){clearCombat(e);e.order={kind:'stop'};e.deployment.duty={manual:false,status:'Shakedown: rushing'};}
      addHeat(h.owner,10,'Shakedown',false);
      notice(b.owner,`SHAKEDOWN — your ${b.kind.replaceAll('_',' ')} is under attack!`);
      state.news.push({kind:'shakedownAlert',clan:h.owner,defender:b.owner,business:b.id,x:b.ring[0],z:b.ring[1],name:b.kind.replaceAll('_',' ')});
      result(true,'SHAKEDOWN STARTED — squad rushing the business');return true;
    }
    if(c.action==='cancelShakedown'&&op?.kind==='shakedown'){withdraw(h.owner,c.sector,'Retreat ordered');result(true,'SHAKEDOWN RECALLED — crew returning to their sector');return true;}
    if(c.action==='assignment'&&op?.kind==='shakedown'){result(false,'Recall the Shakedown squad before changing its saved duty');return true;}
    if(c.action==='return'&&!c.selectionChange&&Array.isArray(c.units))for(const {clan,sector,op}of operations())
      if(clan===h.owner&&op.units.some(id=>c.units.includes(id)))withdraw(clan,sector,'Return to duty ordered');
    return false;
  }
  function throwBomb(e,target,op,emergency=false) {
    const same=e.place===target.place,from=same?e:geometry(state.businesses[op.business]).door.to;
    const bomb={id:S.next++,operation:op.id,a:e.id,owner:e.owner,place:target.place,x:target.x,z:target.z,
      fromX:from.x,fromZ:from.z,thrownAt:state.tick,landsAt:state.tick+ticks(R.flightSeconds),explodeAt:state.tick+ticks(R.fuseSeconds),emergency};
    S.bombs.push(bomb);e.dir=dirIndex(target.x-from.x,target.z-from.z);
    e.shakedownAction={kind:'throwing',until:state.tick+12};
    state.casts.push({kind:'dynamiteThrow',a:e.id,x:bomb.fromX,z:bomb.fromZ,tx:bomb.x,tz:bomb.z,place:bomb.place});
  }
  function bombard(clan,sector,op,team,b) {
    const g=geometry(b),d=g.door,grid=navOf('street');
    // Keep the doorway's center clear: the two street fires sit on its flanks.
    const dx=d.x-b.x,dz=d.z-b.z,length=Math.hypot(dx,dz)||1,ux=dx/length,uz=dz/length;
    const p1=grid.nearestFree(d.x+ux*.8+uz*2.6,d.z+uz*.8-ux*2.6),p2=grid.nearestFree(d.x+ux*.8-uz*2.6,d.z+uz*.8+ux*2.6);
    op.targets=[{x:p1[0],z:p1[1],place:'street'},{x:p2[0],z:p2[1],place:'street'},g.innerBomb];
    op.state='Bombarding';op.volleyAt=state.tick;op.thrown=0;op.entryAt=state.tick+20+ticks(R.fuseSeconds)+4;
    op.civilians=g.civilian.map((p,i)=>spawn('civilian',i?'laborer':'merchant',p.x,p.z,{place:b.room,hp:60,shakedownCivilian:{business:b.id,operation:op.id},shakedownHostage:true}));
  }
  function success(clan,sector,op,b) {
    if(op.success||b.shakedownClaim)return;
    const pay=rulesFor(b).payout,bonus=pay<=200?300:pay<=350?275:200;
    b.shakedownClaim={clan,owner:b.owner,operation:op.id,createdAt:state.tick};op.success=true;
    state.clans[clan].ryo+=bonus;state.ryoGains.push({clan,amount:bonus,reason:'Shakedown success'});
    state.news.push({kind:'shakedownSuccess',clan,defender:b.owner,business:b.id,bonus,x:b.ring[0],z:b.ring[1]});
    const actor=teamOf(clan,sector,op)[0];
    state.casts.push({kind:'shakedownSuccess',a:actor?.id,x:op.front.x,z:op.front.z,streetX:b.ring[0],streetZ:b.ring[1],place:b.room,bonus});
    withdraw(clan,sector,'50% of next payout claimed');
  }
  function tick() {
    for(const [id,until]of Object.entries(S.retry))if(until<=state.tick)delete S.retry[id];
    // Ownership changes invalidate only that property's old claim, never another owner's payout.
    for(const b of Object.values(state.businesses))if(b.shakedownClaim&&b.shakedownClaim.owner!==b.owner)delete b.shakedownClaim;
    for(const bomb of S.bombs.filter(b=>b.explodeAt<=state.tick)) {
      const a=state.entities[bomb.a];
      if(a)for(const t of Object.values(state.entities)){
        if(!alive(t)||t.place!==bomb.place||(!R.friendlyFire&&t.owner===bomb.owner))continue;
        const d=distance(bomb,t),radius=bomb.emergency?R.emergencyRadius:R.blastRadius;
        if(d<=radius)hit(a,t,Math.round((bomb.emergency?R.emergencyDamage:R.blastDamage)*(1-.55*d/radius)),false,'dynamite');
      }
      S.fires.push({id:bomb.id,a:bomb.a,owner:bomb.owner,x:bomb.x,z:bomb.z,place:bomb.place,until:state.tick+ticks(R.fireSeconds),radius:R.fireRadius});
      const witness=Object.values(state.entities).filter(e=>e.place===bomb.place&&!e.dead).sort((a,b)=>distance(a,bomb)-distance(b,bomb))[0];
      state.casts.push({kind:'dynamiteBlast',a:bomb.a,target:witness?.id,x:bomb.x,z:bomb.z,place:bomb.place,radius:bomb.emergency?R.emergencyRadius:R.blastRadius});
    }
    S.bombs=S.bombs.filter(b=>b.explodeAt>state.tick);S.fires=S.fires.filter(f=>f.until>state.tick);
    if(state.tick%20===0)for(const fire of S.fires){const a=state.entities[fire.a];if(a)for(const t of Object.values(state.entities))
      if(alive(t)&&t.place===fire.place&&(R.friendlyFire||t.owner!==fire.owner)&&distance(t,fire)<fire.radius)hit(a,t,R.fireDamage,false,'fire');}
    for(const {clan,sector,task,op}of operations()) {
      const team=teamOf(clan,sector,op),b=state.businesses[op.business];
      if(!team.length){release(op);S.retry[op.business]=state.tick+ticks(R.retrySeconds);delete task.operation;continue;}
      if(!b||b.owner!==op.defender||state.attacks[b.id])withdraw(clan,sector,'Business changed or another raid started');
      if(op.state==='Returning'){
        if(team.every(e=>e.place==='street'&&deployment.sectorAt(e.x,e.z)===sector&&distance(e,task.objective)<2.5)){
          release(op);for(const e of team){clearCombat(e);delete e.shakedownAction;delete e.shakedownBlocked;e.order={kind:'stop'};e.deployment.duty={manual:false,status:'Returning'};}
          delete task.operation;task.recovery={state:'Recovering',startedAt:state.tick,replanAt:state.tick,reason:'Shakedown return'};
        }continue;
      }
      const danger=withdrawalReason(state.entities,op.units);
      if(danger||!state.night||state.tick-op.startedAt>ticks(R.timeoutSeconds)){withdraw(clan,sector,danger||(!state.night?'Dawn arrived':'Attempt timed out'));continue;}
      const defenderHero=Object.values(state.entities).find(e=>e.owner===op.defender&&e.type==='hero'&&observe(team,e));
      if(defenderHero&&team.some(e=>e.place===defenderHero.place&&distance(e,defenderHero)<=R.defenderRadius)){
        const count=Object.values(state.entities).filter(e=>e.owner===op.defender&&(e.type==='hero'||e.deployment?.group==='hero')&&e.place===defenderHero.place&&distance(e,defenderHero)<=R.defenderRadius&&observe(team,e)).length;
        if(count>team.length){withdraw(clan,sector,'Larger defending hero group spotted');continue;}
      }
      if(op.state==='Rushing'&&team.every(e=>e.place==='street'&&distance(e,{x:b.ring[0],z:b.ring[1]})<5.5))bombard(clan,sector,op,team,b);
      if(op.state==='Bombarding'){
        if(op.thrown<3&&state.tick>=op.volleyAt+op.thrown*10){throwBomb(team[op.thrown%team.length],op.targets[op.thrown],op);op.thrown++;}
        if(state.tick>=op.entryAt)op.state='Entering';
      }
      if(op.state==='Entering'||op.state==='Holding'||op.state==='Contested'){
        const inside=team.filter(e=>e.place===b.room&&distance(e,op.front)<=R.radius);
        const defenders=Object.values(state.entities).filter(e=>alive(e)&&e.owner===op.defender&&e.place===b.room&&distance(e,op.front)<=R.radius);
        const intimidating=inside.find(e=>!e.swing&&!e.taunted&&!(e.buffs?.stunned?.until>state.tick)&&state.tick-(e.hitAt??-Infinity)>20);
        op.intimidator=intimidating?.id;
        const clients=(op.civilians||[]).filter(id=>alive(state.entities[id]));
        if(inside.length){op.state=defenders.length?'Contested':intimidating&&clients.length?'Holding':'Entering';
          if(op.state==='Holding')op.progress++;}
        if(op.progress>=ticks(R.holdSeconds))success(clan,sector,op,b);
      }
    }
  }
  function manual(e) {
    const task=taskOf(e.owner,e.deployment?.group),op=task?.operation;
    if(op?.kind==='shakedown'&&op.units.includes(e.id))withdraw(e.owner,e.deployment.group,'Manual recall');
  }
  function civilianStep() {
    for(const e of Object.values(state.entities)){
      const c=e.shakedownCivilian;if(!c||!alive(e))continue;
      if(!c.released){e.anim='scared';continue;}
      const b=state.businesses[c.business],d=doors.find(d=>d.to&&!d.ninja&&d.place===b?.room);
      if(!d){remove(e.id);continue;}
      const result=deployment.localTravel(e,{run:4,walk:1.6,radius:.3},{x:d.x,z:d.z,place:'street'});
      if(result==='arrived'||e.place==='street')remove(e.id);
    }
  }
  function step(e,unit) {
    const task=taskOf(e.owner,e.deployment?.group),op=task?.operation;
    if(op?.kind!=='shakedown'||!op.units.includes(e.id)||e.deployment.transfer||rally.participating(e))return false;
    const b=state.businesses[op.business],team=teamOf(e.owner,e.deployment.group,op);
    e.deployment.duty={manual:false,status:`Shakedown: ${op.state.toLowerCase()}`};
    if(op.state==='Returning'){
      const door=e.place!=='street'&&geometry(b)?.door;
      const exit=door?{x:door.to.x,z:door.to.z,place:e.place}:task.objective;
      const blockers=Object.values(state.entities).filter(t=>t.owner===op.defender&&observe([e],t)&&t.place===e.place&&distance(t,exit)<2&&distance(t,e)<4);
      const result=deployment.localTravel(e,unit,{...task.objective,place:'street'});
      if(result==='blocked'||blockers.length){e.shakedownBlocked??=state.tick;
        if(!op.emergencyUsed&&state.tick-e.shakedownBlocked>=ticks(R.blockedSeconds)){
          const t=blockers[0]||Object.values(state.entities).find(t=>t.owner===op.defender&&observe([e],t)&&distance(e,t)<5);
          if(t){throwBomb(e,{x:t.x,z:t.z,place:t.place},op,true);op.emergencyUsed=true;}
        }
      }else delete e.shakedownBlocked;
      if(result==='blocked'){const t=blockers[0];if(t)attackStep(e,unit,t);else e.anim='idle';}
      return true;
    }
    if(op.state==='Rushing') {deployment.localTravel(e,unit,{x:b.ring[0],z:b.ring[1],place:'street'});return true;}
    if(op.state==='Bombarding'){e.anim=e.shakedownAction?.until>state.tick?'attack':'idle';return true;}
    const foe=Object.values(state.entities).filter(t=>alive(t)&&t.owner===op.defender&&observe([e],t)&&t.place===e.place&&distance(e,t)<7).sort((a,b)=>distance(e,a)-distance(e,b))[0];
    if(foe&&(e.id!==op.intimidator||distance(e,foe)<2.5)){delete e.shakedownAction;attackStep(e,unit,foe);return true;}
    if(e.place!==b.room||distance(e,op.front)>1.5){deployment.localTravel(e,unit,op.front);return true;}
    clearCombat(e);e.anim='idle';
    if(e.id===op.intimidator){e.shakedownAction={kind:'intimidating',until:state.tick+2};const client=state.entities[op.civilians[0]];if(client)e.dir=dirIndex(client.x-e.x,client.z-e.z);}
    else delete e.shakedownAction;
    return true;
  }
  return {command,tick,step,manual,civilianStep,eligibility,nearby,rules:R};
}
