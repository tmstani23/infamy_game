import assert from 'node:assert/strict';
import { createCombat } from '../src/sim/combat.js';

// Exercise actual target acquisition and closing, without a renderer or a match.
const defender={id:'d',type:'thug',owner:'p',place:'street',x:0,z:0,dir:0};
const archer={id:'a',type:'archer',owner:'q',place:'street',x:8,z:0};
const state={tick:100,entities:{d:defender,a:archer},attacks:{},projectiles:[]},fight={},moves=[];
let visible=true,withinSector=true;
const hostile=(a,b)=>!!b&&a.owner!==b.owner&&a.place===b.place&&withinSector;
const combat=createCombat({options:{},BACKUP_RANGE:6,LOCK_RANGE:14,RETALIATE_SECONDS:5,AGGRO:6,LEASH:10,
 state,fight,paths:{},secs:n=>n*20,cop:e=>e?.cop,hostile,sees:()=>visible,attackAllowed:hostile,
 reachOf:()=>1.2,civ:()=>false,nav:{nearestFree:(x,z)=>[x,z]},moveTo(e,u,x,z){moves.push({x,z});return true;}});
const reset=order=>{defender.order=order;defender.hitBy={id:'a',tick:99};delete defender.holdFire;delete defender.smokePassive;delete fight.d;visible=true;withinSector=true;archer.x=8;};
for(const order of [{kind:'station',x:0,z:0},{kind:'attackmove',x:0,z:0},{kind:'move',x:0,z:0,arrived:true}]){
 reset(order);assert.equal(combat.crewTarget(defender),archer,'a recent ranged hit provokes defense beyond the 6-unit acquisition range');
 combat.engage(defender,{attackSpeed:1},archer);assert.ok(moves.at(-1).x>0&&moves.at(-1).x<archer.x,'short-range defender closes toward its attacker');
}
for(const order of [{kind:'stop'},{kind:'move',x:3,z:0,arrived:false},{kind:'heal',x:3,z:0},{kind:'enter',x:3,z:0}]){
 reset(order);assert.equal(combat.crewTarget(defender),null,'passive and deliberate movement orders keep priority');
}
for(const flag of ['holdFire','smokePassive']){reset({kind:'station',x:0,z:0});defender[flag]=true;assert.equal(combat.crewTarget(defender),null);}
reset({kind:'station',x:0,z:0});visible=false;assert.equal(combat.crewTarget(defender),null,'cannot retaliate into unseen contacts');
reset({kind:'station',x:0,z:0});withinSector=false;assert.equal(combat.crewTarget(defender),null,'sector restrictions still apply');
reset({kind:'station',x:0,z:0});archer.x=11;assert.equal(combat.crewTarget(defender),null,'normal leash still applies');
reset({kind:'move',x:0,z:0,arrived:true,recalledAt:100});assert.equal(combat.crewTarget(defender),null,'hits before a recall stay stale');
reset({kind:'station',x:0,z:0});defender.hitBy.tick=-1;assert.equal(combat.crewTarget(defender),null,'expired hit does not extend ordinary acquisition range');
reset({kind:'station',x:0,z:0});delete defender.hitBy;assert.equal(combat.crewTarget(defender),null,'distant bystanders are not acquired');
console.log('Ranged retaliation: standing duties close beyond acquisition range; passive/move/heal/enter, smoke, visibility, sector, leash, recall and expiry restrictions passed');
