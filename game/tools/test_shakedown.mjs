import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
function fixture(clan='yakuza') {
  const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json'),settings:{...read('data/settings.json'),dayNight:{auto:false}}});
  const {heroId}=setupMatch(g,{clan,difficulty:'easy',bots:read('data/bots.json')});
  const h=g.state.entities[heroId],rival=Object.keys(g.state.clans).find(id=>id!=='player'&&g.state.clans[id].kind!=='ninja');
  const b=Object.values(g.state.businesses).find(b=>b.kind==='shop'&&b.room);
  g.clans.setOwner(b.id,rival);
  const sector=g.deployment.sectorAt(...b.ring),task=g.state.deployment.clans.player.sectors[sector];
  task.objective={x:b.ring[0],z:b.ring[1]};
  for(const e of Object.values(g.state.entities)){e.holdFire=true;if(e.owner===rival){e.x=-100;e.z=-100;}}
  const crew=Array.from({length:3},(_,i)=>{const p=g.nav.nearestFree(b.ring[0]+i*.6,b.ring[1]);return g.state.entities[g.spawn('thug','thug',...p,{owner:'player',deployment:{group:sector},order:{kind:'stop'}})];});
  const send=c=>g.step([{id:heroId,type:'deployment',sector,...c}]);
  const clearGuards=()=>{for(const e of Object.values(g.state.entities))if(e.guard)e.dead=true;};
  return {g,h,heroId,rival,b,sector,task,crew,send,clearGuards};
}
{
  const {g,task,send}=fixture();
  g.state.night=false;send({action:'shakedown',business:'missing'});assert.equal(task.operation,undefined);assert.equal(g.state.deployment.clans.player.feedback.ok,false);
}
{
  const {g,task,send,b}=fixture('kuroda');g.state.night=true;send({action:'shakedown',business:b.id});assert.equal(task.operation,undefined,'Kuroda cannot use Yakuza operation');
}
{
  const {g,h,rival,b,task,crew,send,clearGuards}=fixture();g.state.night=true;
  const heat=g.state.clans.player.heat;send({action:'shakedown',business:b.id});
  assert.ok(g.state.heatGains.some(n=>n.reason==='Shakedown'&&n.amount===10));assert.ok(g.state.news.some(n=>n.kind==='shakedownAlert'&&n.defender===rival));
  const op=task.operation,afterHeat=g.state.clans.player.heat;assert.ok(op);send({action:'shakedown',business:b.id});assert.equal(task.operation,op);assert.equal(g.state.clans.player.heat,afterHeat,'rejection adds no heat');
  let blasts=0,thrown=op.thrown||0,entered=false;const startMoney=g.state.clans.player.ryo;
  for(let i=0;i<1800&&!b.shakedownClaim;i++){
    clearGuards();for(const id of op.civilians||[])g.state.entities[id].dead=true;g.step();blasts+=g.state.casts.filter(c=>c.kind==='dynamiteBlast').length;thrown+=g.state.casts.filter(c=>c.kind==='dynamiteThrow').length;
    entered ||=crew.some(e=>e.place===b.room);
  }
  assert.equal(thrown,3,'three opening throws');assert.equal(blasts,3,'each thrown bomb explodes once');assert.ok(entered,'crew physically enter business');
  assert.ok(b.shakedownClaim,`hold completes even when all hostages died: ${JSON.stringify(task.operation)}`);assert.equal(g.state.clans.player.ryo-startMoney,300,'small-business immediate bonus');
  assert.equal(b.owner,rival,'ownership stays with defender');
  const claimedAt=g.state.tick,defenderMoney=g.state.clans[rival].ryo;
  // Actual modified payout, including suppression: zero cannot consume the claim.
  b.sabotaged=true;g.step([{type:'time',night:false}]);assert.ok(b.shakedownClaim);
  g.state.clans[rival].heat=0;g.step([{type:'time',night:true}]);g.step([{type:'time',night:false}]);
  assert.equal(b.shakedownClaim,undefined);assert.ok(g.state.ryoGains.some(n=>n.reason==='Shakedown payout'&&n.amount===60));
  assert.equal(g.state.clans.player.ryo-startMoney,360,'normal small business total is 360 (payouts -40%, 2026-10-30)');
  for(let i=0;i<2000&&task.operation;i++){clearGuards();g.step();}
  assert.equal(task.operation,undefined,'operation finishes physical return');
  assert.ok(crew.every(e=>e.place==='street'&&g.deployment.sectorAt(e.x,e.z)===e.deployment.group));
  assert.doesNotThrow(()=>JSON.stringify(g.state));
}
{
  const {g,b,task,crew,rival,send,clearGuards}=fixture();g.state.night=true;send({action:'shakedown',business:b.id});
  for(let i=0;i<500&&task.operation?.progress<5;i++){clearGuards();g.step();}
  const op=task.operation;assert.ok(op.progress>0);
  const defender=g.state.entities[g.spawn('thug','thug',op.front.x,op.front.z,{owner:rival,place:b.room,holdFire:true,deployment:{group:'hero'}})];
  const progress=op.progress;g.step();assert.equal(op.state,'Contested');assert.equal(op.progress,progress,'defenders pause the hold');
  defender.dead=true;for(const e of crew)(e.buffs||={}).stunned={until:g.state.tick+20};g.step();assert.equal(op.progress,progress,'no active intimidator pauses the hold');
  for(const e of crew)delete e.buffs.stunned;
  send({action:'cancelShakedown'});assert.equal(op.state,'Returning');assert.equal(b.shakedownClaim,undefined);
  assert.ok(op.civilians.every(id=>g.state.entities[id]?.shakedownCivilian.released));
}
{
  const {g,b,task,crew,rival,send,clearGuards}=fixture();g.state.night=true;send({action:'shakedown',business:b.id});
  for(let i=0;i<60;i++){clearGuards();g.step();}
  const op=task.operation,actor=crew.find(e=>e.place===b.room);assert.ok(actor,'squad entered before reinforcement');
  const hero=Object.values(g.state.entities).find(e=>e.owner===rival&&e.type==='hero');
  Object.assign(hero,{x:actor.x+3,z:actor.z,place:b.room,holdFire:true});
  for(let i=0;i<3;i++)g.spawn('thug','thug',actor.x+3,actor.z+i*.4,{owner:rival,place:b.room,holdFire:true,deployment:{group:'hero'}});
  g.step();assert.equal(op.state,'Returning','visible hero plus three exceeds three attackers');
  assert.equal(g.state.shakedowns.bombs.filter(b=>b.emergency).length,0,'retreat alone never throws emergency bomb');
  // Hold a real, visible enemy group on the only public exit while the squad tries it.
  const door=g.doors.find(d=>d.to&&!d.ninja&&d.place===b.room);
  const blockers=Object.values(g.state.entities).filter(e=>e.owner===rival&&e.place===b.room);
  for(let n=0;n<40&&!op.emergencyUsed;n++){
    for(const e of crew){e.x=door.to.x+1.3;e.z=door.to.z; e.place=b.room;}
    for(const e of blockers){e.x=door.to.x;e.z=door.to.z;e.place=b.room;}
    g.step();
  }
  assert.equal(op.emergencyUsed,true,'blocked escape triggers emergency throw');
  const emergency=g.state.shakedowns.bombs.filter(b=>b.emergency);assert.equal(emergency.length,1);
  for(let i=0;i<60;i++)g.step();
  assert.equal(g.state.shakedowns.bombs.filter(b=>b.emergency).length,0,'emergency explodes without replenishing');
}
console.log('Shakedown: eligibility/faction, alert/heat, timed blasts/entry, contest/intimidator interruption, zero/actual payout, return, larger-hero retreat and blocked-only emergency bomb passed');
