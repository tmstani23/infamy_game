import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame} from '../src/sim/game.js';
import {setupMatch} from '../src/sim/setup_match.js';
import {createCombat} from '../src/sim/combat.js';
import {createAssignments} from '../src/sim/assignments.js';
import {createShakedown} from '../src/sim/shakedown.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
function fixture(clan){
  const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json'),settings:{...read('data/settings.json'),dayNight:{auto:false}}});
  const {heroId}=setupMatch(g,{clan,difficulty:'easy',bots:read('data/bots.json')}),st=g.state,h=st.entities[heroId],own=st.deployment.clans[h.owner];
  for(const e of Object.values(st.entities)){if(e!==h)e.dead=true;e.holdFire=true;e.order={kind:'stop'};}
  st.night=true;
  const spawn=(sector,point,type=clan==='shinobi'?'ninja':'thug')=>st.entities[g.spawn(type,type,point.x,point.z,{owner:h.owner,deployment:{group:sector},order:{kind:'stop'}})];
  const step=()=>{for(const e of Object.values(st.entities))if(e.guard||e.wild)e.dead=true;g.step();};
  const regroup=(sector,task,op,team)=>{
    assert.equal(task.recovery?.home,true,'first casualty starts HQ replacement recovery');
    assert.equal(task.recovery.required,3);assert.equal(op.state,'Regrouping');
    const before=team.slice(1).map(e=>[e.x,e.z,e.place]);for(let i=0;i<20;i++)step();
    assert.notDeepEqual(team.slice(1).map(e=>[e.x,e.z,e.place]),before,'survivors physically withdraw from the operation');
    for(let i=0;i<3000&&task.recovery?.state!=='Waiting for crew';i++)step();
    assert.equal(task.recovery?.state,'Waiting for crew','healthy survivors cannot resume understaffed');
    const home=Object.values(st.businesses).find(b=>b.hideout===h.owner);
    assert.ok(team.slice(1).every(e=>e.place===home.room),'survivors actually regroup inside HQ');
    for(let i=0;i<125;i++)step();
    assert.equal(task.operation,op,'operation identity/reservation survives recovery');
    const replacement=spawn(sector,{x:0,z:0}),point=g.deployment.destination(replacement,sector);Object.assign(replacement,point);
    step();assert.equal(task.recovery.returning,true);
    for(let i=0;i<3000&&task.recovery;i++)step();
    assert.equal(task.recovery,undefined,'restaffed group physically returns to its saved operation position');
    const live=[...team.slice(1),replacement];assert.ok(live.every(e=>e.deployment.group===sector));
    return live;
  };
  return {g,st,h,own,spawn,step,regroup};
}
{
  const {g,st,h,own,spawn,step,regroup}=fixture('kuroda');
  const source=st.deployment.sectors.find(s=>st.deployment.sectors.some(t=>g.sweep.nearby(s.id,t.id))),target=st.deployment.sectors.find(t=>g.sweep.nearby(source.id,t.id));
  const task=own.sectors[source.id],team=Array.from({length:3},()=>spawn(source.id,source.anchor)),rival=Object.keys(st.clans).find(id=>id!==h.owner);
  g.sweep.command(h,{action:'sweep',sector:source.id,targetSector:target.id,targetClan:rival});
  const op=task.operation;op.pointIndex=1;op.point=op.points[1];op.hold=80;
  for(const e of team)Object.assign(e,op.point);g.sweep.tick();
  const hold=op.hold,startedAt=op.startedAt,sequence=op.rewardSequence;team[0].downed=true;step();
  const live=regroup(source.id,task,op,team);
  assert.equal(task.operation,op);assert.equal(op.pointIndex,1);assert.equal(op.hold,hold,'Sweep hold pauses during HQ recovery');
  assert.equal(op.rewardSequence,sequence,'reward eligibility identity is not refreshed');assert.ok(op.startedAt>startedAt,'operation timeout excludes suspension');
  assert.deepEqual(new Set(op.units),new Set(live.map(e=>e.id)),'replacement joins the resumed operation');
  op.hold=399;step();assert.equal(op.pointIndex,2,'resumed Sweep advances to its remaining third point');
  for(const e of live)Object.assign(e,op.point);for(let i=0;i<410&&!op.success;i++)step();
  assert.equal(op.success,true);assert.equal(st.news.filter(n=>n.kind==='sweepSuccess').length,1);
  assert.doesNotThrow(()=>JSON.stringify(st));
  console.log('Active Sweep: first casualty, physical HQ wait/replacement/return, saved point/hold/reward identity, frozen timeout and one completion passed');
}
{
  const {g,st,h,own,spawn,step,regroup}=fixture('yakuza'),rival=Object.keys(st.clans).find(id=>id!==h.owner&&st.clans[id].kind!=='ninja');
  const b=Object.values(st.businesses).find(b=>b.kind==='shop'&&b.room);g.clans.setOwner(b.id,rival);
  const sector=g.deployment.sectorAt(...b.ring),task=own.sectors[sector];task.objective={x:b.ring[0],z:b.ring[1]};
  const team=Array.from({length:3},()=>spawn(sector,task.objective));g.shakedown.command(h,{action:'shakedown',sector,business:b.id});
  const op=task.operation;let throws=0;
  const track=()=>{step();throws+=st.casts.filter(c=>c.kind==='dynamiteThrow').length;};
  for(let i=0;i<500&&op.progress<5;i++)track();assert.ok(op.progress>0);assert.equal(throws,3);
  const progress=op.progress,startedAt=op.startedAt,money=st.clans[h.owner].ryo;
  team[0].downed=true;step();const live=regroup(sector,task,op,team);
  assert.equal(task.operation,op);assert.equal(op.progress,progress,'Shakedown hold pauses instead of restarting or completing at HQ');
  assert.ok(op.startedAt>startedAt);assert.equal(op.thrown,3,'opening volley is not repeated');
  assert.deepEqual(new Set(op.units),new Set(live.map(e=>e.id)));
  assert.ok((op.civilians||[]).every(id=>!st.entities[id]||st.entities[id].dead||st.entities[id].shakedownCivilian?.released),'hostages are released while crew withdraw');
  for(let i=0;i<500&&!op.success;i++)track();
  assert.equal(op.success,true);assert.equal(throws,3);assert.equal(st.clans[h.owner].ryo-money,300);
  assert.equal(st.news.filter(n=>n.kind==='shakedownSuccess').length,1,'one claim and immediate reward');
  console.log('Active Shakedown: interior HQ retreat/replacement/return, saved hold and timeout, released hostages, no duplicate volley/bonus passed');
}
{
  const {g,st,h,own,spawn,step,regroup}=fixture('shinobi'),source=st.deployment.sectors[0],task=own.sectors[source.id],team=Array.from({length:3},()=>spawn(source.id,source.anchor));
  const rival=Object.keys(st.clans).find(id=>id!==h.owner),p=g.deployment.navFor(team[0]).nearestFree(source.anchor.x+1,source.anchor.z);
  const target=st.entities[g.spawn('thug','thug',...p,{owner:rival,hp:10000,maxHp:10000,holdFire:true,deployment:{group:'hero'},order:{kind:'stop'}})];
  own.targets={[target.id]:{id:target.id,owner:rival,type:'hero',seenAt:st.tick}};g.vision.tick();
  g.shinobiAssignments.command(h,{action:'armAmbush',target:target.id});g.shinobiAssignments.tick();
  const op=task.operation;assert.equal(op.target,target.id);op.attackingAt=st.tick-100;team[0].downed=true;step();
  const elsewhere=st.deployment.sectors[1].anchor;Object.assign(target,elsewhere);
  const live=regroup(source.id,task,op,team);
  assert.equal(task.operation,undefined,'returning ambush reacquires locally instead of chasing an unseen live target');
  assert.equal(own.hunt.target,target.id);assert.equal(own.hunt.committedSector,undefined);
  assert.ok(own.hunt.elapsedAttackTicks>=100&&own.hunt.elapsedAttackTicks<105,'recovery preserves elapsed attack time without counting HQ/pending travel');
  Object.assign(target,{x:live[0].x+1,z:live[0].z});g.vision.tick();g.shinobiAssignments.tick();
  assert.equal(task.operation.target,target.id);assert.deepEqual(new Set(task.operation.units),new Set(live.map(e=>e.id)));
  assert.ok(st.tick-task.operation.attackingAt>=100&&st.tick-task.operation.attackingAt<105,'reacquisition does not reset the 45-second attack budget');
  console.log('Active Ambush: healthy first-casualty HQ retreat, same-identity hunt preserved, local reacquisition and replacement participation passed');
}
// An automated station/patrol assists its own squad beyond acquisition range,
// while preserving visibility, leash, sector and explicit manual restrictions.
for(const kind of ['attackmove','station','move']){
  const actor={id:'a',owner:'p',place:'street',x:0,z:0,order:{kind,x:0,z:0,arrived:true},deployment:{group:'s',duty:{manual:false}}};
  const mate={id:'m',owner:'p',place:'street',x:7,z:0,deployment:{group:'s'},hitBy:{id:'f',tick:10}},foe={id:'f',owner:'r',place:'street',x:8,z:0};
  const st={tick:10,entities:{a:actor,m:mate,f:foe},deployment:{clans:{p:{sectors:{s:{task:'watch'}}}}}};
  const combat=createCombat({state:st,options:{},fight:{},BACKUP_RANGE:6,AGGRO:6,LEASH:10,RETALIATE_SECONDS:5,secs:n=>n*20,sees:()=>true,cop:()=>false,hostile:(a,b)=>!!b&&a.owner!==b.owner});
  assert.equal(combat.crewTarget(actor),foe,`${kind} assists an attacked squadmate at eight steps`);
  actor.deployment.duty.manual=true;assert.equal(combat.crewTarget(actor),null,'manual duty does not gain squad-wide acquisition');
  actor.deployment.duty.manual=false;foe.x=11;assert.equal(combat.crewTarget(actor),null,'squad assistance retains the normal leash');
  foe.x=8;actor.order={kind:'stop'};let defended=null;
  const assignments=createAssignments({state:st,deployment:{},doors:[],clearCombat:()=>{},defenseTarget:e=>combat.crewTarget(e),attackStep:(e,u,t)=>defended=t});
  st.deployment.restrictionsEnabled=true;
  assert.equal(assignments.step(actor,{}),true,'automated Watch answers squad fire before continuing its travel');assert.equal(defended,foe);
}
console.log('Patrol/Watch/Guard: squad-wide defense, manual priority and existing leash passed');
{
  const crew=[0,1,2].map(i=>({id:String(i),owner:'p',hp:200,x:i,z:0,place:'street',deployment:{group:'s'}}));crew[0].downed=true;
  const op={kind:'shakedown',state:'Regrouping',resumeState:'Bombarding',suspendedAt:5,business:'b',defender:'r',units:crew.map(e=>e.id),progress:12,civilians:[]};
  const task={operation:op,objective:{x:20,z:0},recovery:{home:true}};
  const state={tick:11,night:true,casts:[],clans:{p:{},r:{}},attacks:{},businesses:{b:{id:'b',owner:'r'}},entities:Object.fromEntries(crew.map(e=>[e.id,e])),deployment:{sectors:[{id:'s'}],clans:{p:{sectors:{s:task}}}}};
  let blasts=0;
  const shakedown=createShakedown({state,deployment:{cellGrid:()=>({cells:[],w:1})},rally:{participating:()=>false},clearCombat:()=>{},hit:()=>blasts++});
  state.shakedowns.bombs.push({id:1,a:'1',owner:'p',place:'street',x:1,z:0,explodeAt:10});
  shakedown.tick();assert.ok(blasts>0,'already-thrown bombs explode during crew recovery');assert.equal(op.progress,12);assert.equal(op.state,'Regrouping');
  state.night=false;shakedown.tick();assert.equal(op.state,'Returning','dawn invalidates a suspended Shakedown');
  assert.equal(op.suspendedAt,undefined);assert.deepEqual(task.recovery.resumePoint,{x:20,z:0,place:'street'},'invalid operation resumes saved duty instead of the rival interior');
  assert.equal(state.businesses.b.shakedownClaim,undefined);
}
console.log('Suspended Shakedown: live world hazards, frozen objective, dawn cancellation and safe return destination passed');
