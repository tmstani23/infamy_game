import assert from 'node:assert/strict';
import {createTaunt} from '../src/sim/taunt.js';
const e={id:'tank',type:'kuroda_enforcer',owner:'a',hp:420,x:0,z:0,place:'street',order:{kind:'attack',target:'boss'}};
const boss={id:'boss',type:'hero',owner:'b',hp:500,x:3,z:0,place:'street'};
const bandit={id:'bandit',type:'bandit',wild:true,owner:'wild',hp:200,x:3,z:.5,place:'street'};
const cop={id:'cop',cop:true,type:'junsa',owner:'police',hp:360,x:2,z:0,place:'street'};
const civ={id:'civ',type:'civilian',owner:'town',hp:100,x:2,z:.1,place:'street'};
const state={tick:10,entities:{tank:e,boss,bandit,cop,civ},casts:[]};
let pursued=null;
const taunt=createTaunt({state,vision:{canSee:()=>true},hostile:(a,b)=>a.owner!==b.owner,
  rulesFor:()=>({radius:4.5,coneDegrees:90,durationTicks:60,cooldownTicks:160,engagementOnly:true}),
  engagementTarget:()=>boss,attackStep:(actor,unit,target)=>{
    if(actor===e)assert.equal(target.taunted.source,e.id,'taunt lands before enforcer starts pursuing');
    pursued=[actor.id,target.id];actor.x+=.1;
  }});
assert.ok(taunt.step(e,{}));
assert.equal(boss.taunted.source,e.id);assert.equal(bandit.taunted.source,e.id);
assert.equal(cop.taunted,undefined);assert.equal(civ.taunted,undefined);
assert.deepEqual(pursued,['tank','boss']);assert.equal(e.taunt.castUntil,state.tick);
assert.ok(e.x>0,'instant cast does not pin the caster');
assert.ok(taunt.step(boss,{}));assert.deepEqual(pursued,['boss','tank'],'hero actually obeys forced target');
assert.ok(taunt.step(bandit,{}));assert.deepEqual(pursued,['bandit','tank']);
state.tick=200;for(const t of [boss,bandit,cop,civ])delete t.taunted;
e.order.target='cop';assert.ok(taunt.step(e,{}));assert.equal(cop.taunted.source,e.id);
assert.equal(civ.taunted,undefined,'direct police targeting never pulls nearby civilians');
state.tick=400;e.order={kind:'stop'};delete e.taunt;
assert.equal(taunt.step(e,{}),false,'Kuroda remains passive on Stop');
console.log('Taunt: instant landing/pursuit, hero/bandit forced targets, direct-only police and no bystander splash passed');
