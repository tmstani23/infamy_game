export const DIVERSION = { radius: 6, warningTicks: 30, durationTicks: 120, cooldownTicks: 600, immunityTicks: 200 };
export function createDiversion({ state, deployment, assignments, rally, vision, sees, reveal, clearCombat, inCombat = () => false }) {
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  const tasks = clan => state.deployment.clans[clan]?.sectors || {};
  const opOf = e => tasks(e.owner)[e.deployment?.group]?.operation;
  const location = e => e.place === 'street' ? { x:e.x,z:e.z } : (() => { const b=Object.values(state.businesses).find(b=>b.room===e.place);return b?.ring?{x:b.ring[0],z:b.ring[1]}:null; })();
  function release(t, returnHome = true) {
    const d=t.distracted;
    if (!d?.source) return;
    delete t.distracted; t.diversionImmuneUntil=state.tick+DIVERSION.immunityTicks;
    if (d.prevOrder) t.order=d.prevOrder; else delete t.order;
    if (returnHome) {
      t.diversionReturn={ target:d.from, order:d.prevOrder || null };
      if(t.place!==d.from.place)t.order={kind:'move',x:t.x,z:t.z,arrived:true};
    }
    clearCombat(t);
  }
  function escape(clan,id,reason) {
    const task=tasks(clan)[id],op=task?.operation;
    if (!op || op.kind!=='diversion' || op.state==='Escaping') return;
    op.state='Escaping';op.reason=reason;op.escapeAt=state.tick;
    const actor=state.entities[op.actor];if(actor){delete actor.dancingUntil;clearCombat(actor);}
    for(const t of Object.values(state.entities))if(t.distracted?.source===op.actor)release(t);
  }
  function command(h,c) {
    if(h.type!=='hero'||state.clans[h.owner]?.kind!=='ninja')return;
    if(c.action==='return'&&!c.selectionChange&&Array.isArray(c.units)) {
      for(const id of c.units){const e=state.entities[id];if(e?.owner===h.owner)escape(h.owner,e.deployment?.group,'Return to assignment');}return;
    }
    const task=tasks(h.owner)[c.sector];if(!task)return;
    if(c.action==='retreat'){escape(h.owner,c.sector,'Retreat ordered');return;}
    if(c.action!=='dance'||task.task!=='diversion'||task.operation)return;
    const actor=deployment.members(h.owner,c.sector).find(e=>e.type==='shinobi_geisha'&&alive(e)&&!e.deployment.transfer&&!rally.participating(e)&&(e.deployment.diversionReadyAt||0)<=state.tick);
    if(!actor){state.clans[h.owner].notice={tick:state.tick,text:'Assign a ready Shinobi geisha to this sector'};return;}
    clearCombat(actor);delete actor.holdFire;delete actor.smokePassive;
    actor.deployment.duty={manual:false,status:'Moving'};
    task.operation={kind:'diversion',state:'Moving',actor:actor.id,units:[actor.id],startedAt:state.tick};
  }
  function tick() {
    for(const [clan,config]of Object.entries(state.deployment.clans))for(const [id,task]of Object.entries(config.sectors)){
      const op=task.operation;if(op?.kind!=='diversion')continue;
      const a=state.entities[op.actor];
      if(!alive(a)||a.deployment?.group!==id||a.deployment.transfer||rally.participating(a)){
        if(a)delete a.dancingUntil;delete task.operation;continue;
      }
      if(op.state==='Dancing'){
        if(a.hitAt>=(op.danceAt??Infinity)||a.swing||a.execute){escape(clan,id,'Dance interrupted');continue;}
        reveal(a,true);
        if(state.tick>=op.endsAt){escape(clan,id,'Dance finished');continue;}
        if(state.tick<op.warningUntil)continue;
        for(const t of Object.values(state.entities)){
          if(!alive(t)||t.owner===clan||!state.clans[t.owner]||t.type==='hero'||t.type==='civilian'||t.cop||t.wild||t.deployment?.transfer||rally.participating(t)
            ||t.distracted||(t.diversionImmuneUntil||0)>state.tick||state.tick-(t.commandedAt??-Infinity)<120||state.tick-Math.max(t.hitAt??-Infinity,t.foughtAt??-Infinity)<120
            ||t.swing||t.execute||t.attackTarget||inCombat(t))continue;
          const o=t.order;
          if(o&&!['stop','station'].includes(o.kind)&&!(o.kind==='move'&&(o.arrived||o.patrol)))continue;
          const p=location(t);
          if(!p||Math.hypot(p.x-a.x,p.z-a.z)>DIVERSION.radius||!vision.canSee(t.owner,a)||!deployment.canActAt(t,a.x,a.z,'street'))continue;
          t.distracted={source:a.id,x:a.x,z:a.z,place:'street',until:op.endsAt,prevOrder:o?structuredClone(o):null,from:{x:t.x,z:t.z,place:t.place},at:state.tick};
          clearCombat(t);
        }
      }else if(op.state==='Escaping'||op.state==='Returning'){
        if(a.place==='street'&&Math.hypot(a.x-task.fallback.x,a.z-task.fallback.z)<1.5){
          op.state='Returning';if(a.hidden||state.tick-op.escapeAt>200){delete task.operation;assignments.resume(a);}
        }
      }
    }
    for(const t of Object.values(state.entities))if(t.distracted?.source){
      const a=state.entities[t.distracted.source],op=a&&opOf(a);
      if(!alive(t)||!alive(a)||op?.kind!=='diversion'||op.state!=='Dancing'||t.distracted.until<=state.tick)release(t);
      else if((t.hitAt??-Infinity)>=t.distracted.at)release(t);
    }
  }
  function step(e,unit){
    const op=opOf(e),task=tasks(e.owner)[e.deployment?.group];
    if(op?.kind==='diversion'&&op.actor===e.id&&!rally.participating(e)){
      const duty=e.deployment.duty||={manual:false,status:op.state};duty.status=op.state;
      if(op.state==='Moving'){
        const result=deployment.localTravel(e,unit,{...task.objective,place:'street'});
        if(result==='arrived'){
          op.state='Dancing';op.danceAt=state.tick;op.warningUntil=state.tick+DIVERSION.warningTicks;op.endsAt=op.warningUntil+DIVERSION.durationTicks;
          e.deployment.diversionReadyAt=state.tick+DIVERSION.cooldownTicks;e.dancingUntil=op.endsAt;reveal(e,true);
          state.casts.push({kind:'diversion',a:e.id,x:e.x,z:e.z,radius:DIVERSION.radius});
          for(const target of Object.values(state.clans))if(target.id!==e.owner&&vision.canSee(target.id,e))state.news.push({kind:'diversionWarning',clan:target.id,x:e.x,z:e.z});
        }else if(result==='blocked')escape(e.owner,e.deployment.group,'Dance point blocked');
      }else if(op.state==='Dancing'){e.anim='dance';reveal(e,true);}
      else {const result=deployment.localTravel(e,unit,{...task.fallback,place:'street'});if(result!=='moving')e.anim='idle';}
      return true;
    }
    const distracted=e.distracted;
    if(distracted?.source){
      if((e.hitAt??-Infinity)>=distracted.at){release(e);return false;}
      const result=deployment.localTravel(e,unit,{x:distracted.x,z:distracted.z,place:'street'});if(result!=='moving')e.anim='idle';
      return true;
    }
    if(e.diversionReturn){
      if(state.tick-Math.max(e.hitAt??-Infinity,e.foughtAt??-Infinity)<120||e.swing||e.execute||inCombat(e))return false;
      const result=deployment.localTravel(e,unit,e.diversionReturn.target);
      if(result==='arrived'){e.order=e.diversionReturn.order||{kind:'move',x:e.x,z:e.z,arrived:true};delete e.diversionReturn;}
      return true;
    }
    return false;
  }
  function manual(e){
    if(e.distracted?.source)release(e,false);delete e.diversionReturn;e.commandedAt=state.tick;e.diversionImmuneUntil=Math.max(e.diversionImmuneUntil||0,state.tick+DIVERSION.immunityTicks);
    const op=opOf(e);if(op?.kind==='diversion'&&op.actor===e.id){delete tasks(e.owner)[e.deployment.group].operation;delete e.dancingUntil;}
  }
  return {command,tick,step,manual,interrupted:e=>{if(e.distracted?.source)release(e);const op=opOf(e);if(op?.kind==='diversion'&&op.actor===e.id)escape(e.owner,e.deployment.group,'Dance interrupted');}};
}
