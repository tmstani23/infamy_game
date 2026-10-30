// Geisha: a defensive charm takes priority over melee; other crew use ordinary combat.
export const DIVERSION={radius:6,durationTicks:120,cooldownTicks:200,castTicks:20,snareSpeed:.25,castLeash:1.5};
export function createDiversion({state,deployment,vision,reveal,clearCombat,hostile=()=>false,
  attackStep=()=>{},moveTo=()=>false,nearestFree=(x,z)=>[x,z],fightTarget=()=>null,clearLine=()=>true,onCharmed=()=>{}}){
  const alive=e=>e&&!e.dead&&!e.downed&&!e.jailed;
  const geisha=e=>e?.type==='shinobi_geisha';
  const targets=(a,id)=>fightTarget(a.id)===id||a.attackTarget===id||a.order?.kind==='attack'&&a.order.target===id||a.swing?.target===id;
  const busy=e=>!alive(e)||e.deployment?.transfer||e.deployment?.scattered||e.holdFire||e.smokePassive||e.distracted
    ||e.buffs?.stunned?.until>state.tick||e.taunted?.until>state.tick||e.execute||e.crewJob
    ||e.order?.kind==='move'&&!e.order.arrived||['enter','heal','loot'].includes(e.order?.kind)||e.order?.kind==='follow'&&e.order.regrouping;
  const group=e=>{const r=state.deployment?.clans[e.owner]?.rally;return r?.active&&r.endsAt>state.tick&&(e.deployment?.group==='hero'||r.participants.some(p=>p.id===e.id))?'rally':e.deployment?.group;};
  const team=e=>Object.values(state.entities).filter(a=>alive(a)&&a.owner===e.owner&&a.place===e.place&&(a.id===e.id||a.type==='hero'||a.type!=='hero'&&!a.guard&&group(a)===group(e)));
  // An assigned attack may still be walking into range. Only an actual swing,
  // outgoing projectile or continuing recent attack makes this target under fire.
  const focused=(e,t)=>Object.values(state.entities).some(a=>a!==e&&alive(a)&&a.owner===e.owner&&a.place===t.place
    &&(a.swing?.target===t.id||(state.projectiles||[]).some(p=>p.a===a.id&&p.t===t.id&&p.until>state.tick)
      ||targets(a,t.id)&&t.hitBy?.id===a.id&&state.tick-t.hitBy.tick<40));
  function valid(e,t,range=DIVERSION.radius){return alive(t)&&state.clans?.[t.owner]&&t.type!=='hero'&&t.type!=='civilian'&&!t.cop&&!t.wild
    &&t.place===e.place&&!t.distracted&&!t.deployment?.transfer&&!focused(e,t)&&hostile(e,t)&&vision.canSee(e.owner,t)
    &&Math.hypot(t.x-e.x,t.z-e.z)<=range;}
  function cancel(e){
    const t=state.entities[e.lure?.target];if(t?.buffs?.charmSnare?.source===e.id)delete t.buffs.charmSnare;
    if(e.lure){e.lure.casting=false;e.lure.castUntil=state.tick;}if(e.buffs)delete e.buffs.charming;
  }
  function release(t){const d=t.distracted;if(!d?.source)return;
    if(t.order?.charmed===d.at)t.order=d.prevOrder||{kind:'stop'};delete t.distracted;clearCombat(t);
  }
  function begin(e){
    const allies=team(e),hero=allies.find(a=>a.type==='hero');
    const candidates=Object.values(state.entities).filter(t=>valid(e,t)&&!(t.buffs?.charmSnare?.until>state.tick)
      &&(allies.some(a=>targets(t,a.id))||targets(e,t.id)||['attackmove','station'].includes(e.order?.kind)));
    const distance=t=>Math.min(...allies.map(a=>Math.hypot(a.x-t.x,a.z-t.z)));
    candidates.sort((a,b)=>{const rank=t=>targets(t,e.id)?0:hero&&targets(t,hero.id)?1:2;return rank(a)-rank(b)||distance(a)-distance(b)||(String(a.id)<String(b.id)?-1:1);});
    const t=candidates[0];if(!t)return false;
    clearCombat(e);e.anim='dance';
    e.lure={target:t.id,readyAt:state.tick+DIVERSION.cooldownTicks,castUntil:state.tick+DIVERSION.castTicks,casting:true};
    (e.buffs||={}).charming={start:state.tick,until:e.lure.castUntil};
    (t.buffs||={}).charmSnare={source:e.id,until:e.lure.castUntil,speed:DIVERSION.snareSpeed};
    reveal(e,true);state.casts.push({kind:'diversion',a:e.id,x:t.x,z:t.z,radius:1.2});return true;
  }
  function wander(e,unit){
    const d=e.distracted;delete e.swing;delete e.execute;delete e.attackTarget;
    if(!d.goal||state.tick>=d.nextWanderAt||Math.hypot(e.x-d.goal.x,e.z-d.goal.z)<.35){
      const hash=String(e.id).split('').reduce((n,c)=>n+c.charCodeAt(0),0),phase=Math.floor((state.tick-d.at)/35),angle=hash+phase*2.399963,radius=1+(hash+phase)%5*.5;
      const p=nearestFree(d.x+Math.cos(angle)*radius,d.z+Math.sin(angle)*radius,e);
      d.nextWanderAt=state.tick+35;d.goal=null;
      if(p&&Math.hypot(p[0]-d.x,p[1]-d.z)<=3.001&&deployment.canOccupy(e,...p,e.place)&&clearLine(e,{...e,x:p[0],z:p[1]}))d.goal={x:p[0],z:p[1]};
    }
    if(!d.goal||!moveTo(e,unit,d.goal.x,d.goal.z,true))e.anim='idle';
    return true;
  }
  function step(e,unit){
    if(e.distracted?.source){if(e.distracted.until>state.tick)return wander(e,unit);release(e);}
    if(!geisha(e))return false;
    if(busy(e)){cancel(e);return false;}
    if(e.lure?.casting){
      const t=state.entities[e.lure.target];
      if(!valid(e,t,DIVERSION.radius+DIVERSION.castLeash)){cancel(e);return false;}
      e.anim='dance';if(state.tick<e.lure.castUntil)return true;
      cancel(e);clearCombat(t);
      t.distracted={source:e.id,clan:e.owner,x:t.x,z:t.z,place:t.place,at:state.tick,until:state.tick+DIVERSION.durationTicks,prevOrder:t.order?structuredClone(t.order):null};
      t.order={kind:'stop',charmed:state.tick};onCharmed(t,e.owner);return true;
    }
    if((e.lure?.readyAt??0)<=state.tick&&begin(e))return true;
    if(e.order?.kind!=='attack'){const allies=team(e),foes=Object.values(state.entities).filter(t=>alive(t)&&t.place===e.place&&hostile(e,t)&&vision.canSee(e.owner,t)&&Math.hypot(t.x-e.x,t.z-e.z)<=DIVERSION.radius&&(allies.some(a=>targets(t,a.id))||targets(e,t.id)||['attackmove','station'].includes(e.order?.kind)));foes.sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z));if(foes[0]){attackStep(e,unit,foes[0]);return true;}}
    return false;
  }
  function tick(){for(const e of Object.values(state.entities)){
    if(e.lure?.casting&&(busy(e)||!valid(e,state.entities[e.lure.target],DIVERSION.radius+DIVERSION.castLeash)))cancel(e);
    if(e.distracted?.source){const a=state.entities[e.distracted.source];if(!alive(e)||!alive(a)||a.place!==e.place||e.distracted.until<=state.tick)release(e);}
  }}
  return {step,tick,release,command:()=>{},manual:e=>{if(geisha(e))cancel(e);},interrupted:e=>{if(geisha(e))cancel(e);}};
}
