import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContracts} from '../src/sim/contracts.js';
import {createGame} from '../src/sim/game.js';

function fixture() {
 const guard={id:'g',owner:'r',type:'thug',guard:true,hp:100,maxHp:100,x:0,z:0,place:'room',anim:'idle'};
 const state={tick:1,news:[],hits:[],ryoGains:[],clans:{s:{id:'s',kind:'ninja',ryo:0},r:{id:'r',kind:'yakuza'}},
  entities:{g:guard,n:{id:'n',owner:'s',type:'ninja',hp:100,x:5,z:0,place:'room'}},
  businesses:{b:{id:'b',kind:'shop',owner:'r',room:'room'}}};
 const contracts=createContracts({state,scores:{shop:1},backRoom:()=>({x:0,z:0})});
 contracts.tick();
 const job=state.contracts.active.s={kind:'mark',business:'b',target:'r',clan:'s',progress:0,renown:30,
  mark:{x:0,z:0,place:'room',alertAt:0,alerted:true,away:0,clear:0}};
 const tick=()=>{state.tick++;contracts.scrubStep(guard);contracts.tick();};
 return {state,guard,job,contracts,tick};
}
{
 const f=fixture();f.tick();assert.equal(f.guard.markScrub.len,80);
 const start=f.guard.markScrub.start;
 while(f.state.tick<start+79)f.tick();assert.ok(f.state.contracts.active.s,'79 ticks cannot erase a mark');
 f.tick();assert.equal(f.state.contracts.active.s,undefined,'one defender channels four full seconds');
 assert.equal(f.guard.markScrub,undefined,'completed contract clears channel');
 assert.equal(f.state.clans.r.ryo,150,'owners who scrub a warned mark get the defend bonus');
}
for(const action of ['attack','damage','movement','stun','charm','downed','leave']){
 const f=fixture();f.tick();for(let n=0;n<50;n++)f.tick();
 const before=f.guard.markScrub.start;
 if(action==='attack')f.guard.swing={target:'n'};
 if(action==='damage'){f.guard.hitAt=f.state.tick+1;f.guard.hp--;}
 if(action==='movement')f.guard.x+=.1;
 if(action==='stun')f.guard.buffs={stunned:{until:f.state.tick+20}};
 if(action==='charm')f.guard.distracted={source:'geisha',until:f.state.tick+20};
 if(action==='downed')f.guard.downed=true;
 if(action==='leave')f.guard.place='street';
 f.tick();assert.equal(f.guard.markScrub,undefined,`${action} interrupts`);assert.equal(f.job.mark.clear,0,`${action} resets progress`);
 assert.ok(f.state.contracts.active.s);
 if(['damage','movement'].includes(action)){f.tick();assert.ok(f.guard.markScrub.start>before,'retry starts fresh');}
}
{
 const f=fixture();f.guard.swing={target:'n'};
 for(let n=0;n<120;n++)f.tick();assert.ok(f.state.contracts.active.s,'fighting on the mark never removes it');assert.equal(f.job.mark.clear,0);
 delete f.guard.swing;f.tick();assert.ok(f.guard.markScrub);
 for(let n=0;n<60;n++)f.tick();
 f.state.entities.replacement={...f.guard,id:'replacement',markScrub:undefined};f.guard.downed=true;f.tick();
 assert.equal(f.job.mark.scrubber,'replacement');assert.equal(f.job.mark.clear,0,'replacement defender cannot inherit partial progress');
 f.contracts.command(f.state.entities.n,{action:'drop'});assert.equal(f.state.entities.replacement.markScrub,undefined,'cancelling job cleans all channels');
}
{
 // Real simulation: a scrubbing guard cannot keep swinging or patrolling, and
 // an actual landed hit interrupts before a removal can complete that tick.
 const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url))),units=read('data/units.json');
 units.rules.houseGuards.count=0;units.rules.houseGuards.hideoutCount=0;
 const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units});
 g.clans.addClan('s',{kind:'ninja'});g.clans.addClan('r');
 const b=Object.values(g.state.businesses).find(b=>b.kind==='teahouse');g.clans.setOwner(b.id,'r');
 const p=g.contracts.backRoom(b),guard=g.state.entities[g.spawn('thug','thug',p.x,p.z,{owner:'r',guard:true,place:b.room,holdFire:true,order:{kind:'station',x:p.x,z:p.z,garrison:true}})];
 const attacker=g.state.entities[g.spawn('hero','ronin',p.x+.5,p.z,{owner:'s',place:b.room,holdFire:true})];
 g.step();g.state.contracts.active.s={kind:'mark',business:b.id,target:'r',clan:'s',progress:0,renown:30,
  mark:{...p,place:b.room,alertAt:0,alerted:true,away:0,clear:0}};
 g.step();assert.ok(guard.markScrub);const start=guard.markScrub.start;
 for(let n=0;n<79;n++){g.step();assert.equal(guard.x,p.x);assert.equal(guard.z,p.z);assert.ok(!guard.swing,'scrubbing prevents combat');}
 attacker.swing={start:g.state.tick,strike:g.state.tick,len:8,target:guard.id};g.step();
 assert.ok(guard.hitAt>start,'real hit landed');assert.equal(guard.markScrub,undefined,'actual damage cancels channel immediately');
 assert.equal(g.state.contracts.active.s.mark.clear,0);
 assert.doesNotThrow(()=>JSON.stringify(g.state));
}
console.log('Sabotage removal: four-second channel, no simultaneous combat, damage/movement/stun/charm/KO/exit interruptions, fresh defender progress and cleanup passed');
