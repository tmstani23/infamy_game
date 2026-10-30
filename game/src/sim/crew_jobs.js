// Explicit body clicks borrow one crewman. Group orders update his return plan;
// a solo order or Stop overrides the job. Automatic sector cleanup is separate.
export function createCrewJobs({state,deployment,rally,manual,clearCombat,navigation,sees,lootable,downedFoe,startExecute,executeStep,lootStep,giveOrder,resumeDuty,freeSlot}) {
  const alive=e=>e&&!e.dead&&!e.downed&&!e.jailed;
  const group=e=>rally.status(e.owner).active&&(e.deployment?.group==='hero'||rally.participating(e))?'rally':e.deployment?.group||'hero';
  function cancel(e){if(e)delete e.bodyQueue;if(!e?.crewJob)return;if(e.execute?.target===e.crewJob.target)delete e.execute;delete e.crewJob;clearCombat(e);}
  function command(hero,c){
    const say=text=>{state.clans[hero.owner].notice={tick:state.tick,text};};
    const target=state.entities[c.target],ids=[...new Set(c.units||[])];
    const roster=ids.map(id=>state.entities[id]).filter(e=>alive(e)&&e.owner===hero.owner&&e.type!=='hero'&&!e.guard&&!e.deployment?.transfer);
    if(new Set(roster.map(group)).size>1)return say('Choose crew from one command group');
    if(Object.values(state.entities).some(e=>(e.execute?.target===c.target||e.crewJob?.target===c.target||e.lootTarget===c.target||e.bodyQueue?.some(j=>j.target===c.target))))return say('A crew member is already handling that body');
    const candidates=roster.filter(e=>e.place===target?.place&&sees(e,target)&&deployment.canActAt(e,target.x,target.z,target.place)
      &&!state.deployment.clans[e.owner]?.sectors[e.deployment?.group]?.recovery&&(c.type==='loot'?lootable(e,target):downedFoe(e,target)))
      .sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z));
    const reachable=e=>{if(Math.hypot(e.x-target.x,e.z-target.z)<=1.3)return true;const end=navigation(e)?.findPath(e.x,e.z,target.x,target.z)?.at(-1);return end&&Math.hypot(end[0]-target.x,end[1]-target.z)<.6;};
    const e=candidates.find(e=>!e.execute&&(!e.crewJob||e.crewJob.phase==='returning')&&e.order?.kind!=='loot'&&reachable(e));
    if(!e){
      const busy=candidates.find(e=>(e.execute||e.crewJob)&&reachable(e));
      if(busy){const q=busy.bodyQueue||=[];if(q.length>=8)return say('Body queue is full (8 jobs)');q.push({hero:hero.id,type:c.type,target:target.id});return say('Body job queued after the current job');}
    }
    if(!e)return say('No available crew in this group can reach that body');
    const previous=e.crewJob,oldOrder=structuredClone(previous?.oldOrder||e.order||{kind:'stop'}),oldDuty=structuredClone(previous?.oldDuty||e.deployment?.duty||{manual:false});
    manual(e);clearCombat(e);delete e.holdFire;delete e.smokePassive;
    e.order={kind:'stop'};
    e.crewJob={kind:c.type,target:target.id,hero:hero.id,group:group(e),phase:'working',oldOrder,oldDuty,
      peers:Object.values(state.entities).filter(u=>alive(u)&&u.id!==e.id&&u.owner===hero.owner&&u.type!=='hero'&&!u.guard&&!u.deployment?.transfer&&group(u)===group(e)).map(u=>u.id),pending:previous?.pending||null};
    if(c.type==='execute'){startExecute(e,{target:target.id},true);if(!e.execute)cancel(e);}
  }
  function intercept(e,c){
    if(!e.crewJob)return false;
    if(new Set(c.units).size===1||c.kind==='stop'){cancel(e);return false;}
    e.crewJob.pending={...c,units:[e.id]};return true;
  }
  function step(e,unit){
    let job=e.crewJob;
    if(alive(e)&&!e.execute&&e.bodyQueue?.length&&(!job||job.phase==='returning')){
      const queue=e.bodyQueue, next=queue.shift(),hero=state.entities[next.hero];
      if(alive(hero))command(hero,{type:next.type,target:next.target,units:[e.id]});
      if(queue.length)e.bodyQueue=queue;else delete e.bodyQueue;
      job=e.crewJob;
    }
    if(!job)return false;
    const task=state.deployment.clans[e.owner]?.sectors[e.deployment?.group];
    if(!alive(e)||e.deployment?.transfer||job.group!==group(e)||e.holdFire||e.smokePassive
      ||task?.recovery||(task&&!e.deployment.duty?.manual)||(e.buffs?.stunned?.until>state.tick)||e.distracted){cancel(e);return false;}
    if(job.phase==='working'){
      const t=state.entities[job.target],valid=t&&e.place===t.place&&sees(e,t)&&deployment.canActAt(e,t.x,t.z,t.place);
      const busy=valid&&(job.kind==='execute'?e.execute&&downedFoe(e,t)&&executeStep(e,unit):lootable(e,t)&&lootStep(e,unit,t.id));
      if(busy&&(job.kind!=='execute'||e.execute))return true;
      delete e.execute;job.phase='returning';job.returnAt=state.tick;
    }
    const peers=job.peers.map(id=>state.entities[id]).filter(u=>alive(u)&&!u.crewJob&&!u.deployment?.transfer&&group(u)===job.group);
    const leader=peers.slice().sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z))[0]
      ||(job.group==='hero'||job.group==='rally'?state.entities[job.hero]:null);
    if(alive(leader)&&(leader.place!==e.place||Math.hypot(leader.x-e.x,leader.z-e.z)>3)&&state.tick-job.returnAt<600){
      const result=deployment.localTravel(e,unit,{x:leader.x,z:leader.z,place:leader.place});
      if(result!=='blocked')return true;
    }
    delete e.crewJob;clearCombat(e);
    const hero=state.entities[job.hero];
    const peer=peers.slice().sort((a,b)=>Number(!!b.deployment?.duty?.manual)-Number(!!a.deployment?.duty?.manual))[0];
    if(!peer&&job.pending&&alive(hero)){const returnWhenDone=e.deployment?.duty?.returnWhenDone;giveOrder(hero,job.pending);if(returnWhenDone&&e.deployment?.duty)e.deployment.duty.returnWhenDone=true;if(e.order.kind!=='stop')return true;}
    if(task&&!peer?.deployment?.duty?.manual&&(!job.oldDuty.manual||e.deployment.duty?.returnWhenDone)){resumeDuty(e);return true;}
    e.order=structuredClone(peer?.order||job.oldOrder);
    if(e.order.kind==='attack'&&(!state.entities[e.order.target]||state.entities[e.order.target].dead||state.entities[e.order.target].downed))e.order=alive(hero)&&['hero','rally'].includes(job.group)?{kind:'follow',target:hero.id}:{kind:'move',x:e.x,z:e.z,arrived:true};
    if(e.order.kind==='follow')e.order.slot=freeSlot(e.order.target,e.id);
    return true;
  }
  return {command,intercept,step,cancel};
}
