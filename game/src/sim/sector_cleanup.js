// Local opportunistic work between duties, shared by player and bot sectors.
// Reuse the ordinary execution/loot rules, rewards and physical navigation.
export function createSectorCleanup({state,deployment,rally,navigation,sees,downedFoe,lootable,startExecute,executeStep,lootStep,inCombat,stopPath}) {
  const radius=6;
  function cancel(e){
    const work=e.deployment?.cleanup;if(!work)return;
    if(work.kind==='execute'&&e.execute?.target===work.target)delete e.execute;
    delete e.deployment.cleanup;stopPath(e);
  }
  function step(e,unit){
    const d=e.deployment,task=state.deployment.clans[e.owner]?.sectors[d?.group];
    if(!task||e.guard||e.type==='hero'){cancel(e);return false;}
    const busy=e.dead||e.downed||e.jailed||d.transfer||d.duty?.manual||task.recovery||task.operation
      ||d.campingEscape||d.duty?.status==='Moving'||rally.participating(e)||e.holdFire||e.smokePassive||e.markScrub||e.distracted
      ||e.swing||e.attackTarget||(e.buffs?.stunned?.until>state.tick)||inCombat(e);
    if(busy){cancel(e);return false;}
    const local=t=>t&&t.place===e.place&&Math.hypot(t.x-e.x,t.z-e.z)<=radius&&sees(e,t)&&deployment.canActAt(e,t.x,t.z,t.place);
    const work=d.cleanup;
    if(work){
      const t=state.entities[work.target];
      if(!local(t)||(work.kind==='execute'? !e.execute||!downedFoe(e,t):!lootable(e,t))){cancel(e);return false;}
      d.duty||={manual:false};d.duty.status=work.kind==='execute'?'Finishing off':'Collecting loot';
      if(work.kind==='execute'){executeStep(e,unit);if(!e.execute)cancel(e);}
      else if(!lootStep(e,unit,t.id))cancel(e);
      return true;
    }
    // Existing explicit channels/jobs always have priority over automatic work.
    if(e.execute||e.lootTarget||['loot','heal','enter'].includes(e.order?.kind))return false;
    const claimed=new Set(Object.values(state.entities).filter(u=>u.id!==e.id&&!u.dead&&!u.downed&&!u.jailed).map(u=>u.execute?.target||u.lootTarget||u.deployment?.cleanup?.target||(u.order?.kind==='loot'?u.order.target:null)).filter(Boolean));
    const grid=navigation(e);
    const targets=Object.values(state.entities).filter(t=>!claimed.has(t.id)&&local(t)
      &&((t.type!=='civilian'&&(!t.cop||(t.angry?.[e.owner]??-1)>state.tick)&&downedFoe(e,t))||lootable(e,t)))
      .sort((a,b)=>Number(!!b.downed)-Number(!!a.downed)||Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z));
    for(const t of targets){
      const end=grid?.findPath(e.x,e.z,t.x,t.z)?.at(-1);
      if(!end||Math.hypot(end[0]-t.x,end[1]-t.z)>.6)continue;
      const kind=t.downed?'execute':'loot';
      if(kind==='execute'){startExecute(e,{target:t.id},true);if(!e.execute)continue;}
      d.cleanup={kind,target:t.id};stopPath(e);return step(e,unit);
    }
    return false;
  }
  return {step,cancel};
}
