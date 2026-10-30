import assert from 'node:assert/strict';
import {createCrewInput} from '../src/crew_input.js';
import {createTargetMemory} from '../src/target_memory.js';
const saved={events:globalThis.addEventListener,document:globalThis.document},handlers={};
globalThis.addEventListener=(k,f)=>(handlers[k]||=[]).push(f);
globalThis.document={body:{style:{}}};
try{
 const h={id:'h',owner:'p',type:'hero',place:'street',x:0,z:0},a={id:'a',owner:'p',type:'ninja',place:'street',x:2,z:2,deployment:{group:'hero'}},s={...a,id:'s',deployment:{group:'east'}},t={id:'t',owner:'r',type:'hero',place:'street',x:3,z:2,hp:100,maxHp:100};
 let visible=true;
 const game={state:{tick:0,entities:{h,a,s,t},clans:{p:{},r:{}},deployment:{restrictionsEnabled:true,sectors:[{id:'east'}],clans:{p:{sectors:{east:{}}}}}},scenery:[],vision:{canSee:()=>visible}};
 const sent=[],view={setSelected(){},unitToScreen:(x,z)=>({x,y:z}),screenToGround:(x,y)=>({x,z:y}),buildingAt:()=>null,nameplateAt:(x,y,ids)=>x===99&&ids.includes('t')?'t':null};
 const input=createCrewInput({game,view,heroId:'h',send:c=>sent.push(c),box:{style:{}}});
 input.selectAll();input.tab();assert.equal(input.tabbed(),'t');assert.equal(sent.length,0,'Tab must only select');
 input.crewAttack();assert.ok(sent.some(c=>c.type==='attack'));assert.deepEqual(sent.find(c=>c.type==='order').units,['a']);
 input.selectUnit('s');sent.length=0;input.crewAttack();assert.equal(sent.length,1);assert.equal(sent[0].type,'order');assert.deepEqual(sent[0].units,['s'],'T never broadcasts to other groups');
 visible=false;assert.equal(input.tabbed(),'t','selected identity survives fog');assert.deepEqual(input.markers(),[],'unseen target never gets a live world marker');sent.length=0;input.crewAttack();assert.equal(sent.length,0,'cannot issue a fresh attack through fog');
 visible=true;const event={button:0,clientX:99,clientY:20,target:{closest:()=>null}};handlers.mousedown.forEach(f=>f(event));handlers.mouseup.forEach(f=>f(event));assert.equal(input.tabbed(),'t','nameplate alone can target a unit');
 input.selectAll();t.downed=true;sent.length=0;input.attackTarget('t');assert.equal(sent[0].crewJob,true);assert.deepEqual(sent[0].units,['a']);assert.equal(sent[0].crewOnly,false);assert.equal(sent[0].preferHeroInRange,true,'hero in range has first choice for body jobs');
 t.downed=false;t.dead=true;t.loot=50;sent.length=0;handlers.mousedown.forEach(f=>f({...event,button:2,clientX:t.x,clientY:t.z}));assert.equal(sent[0].type,'loot');assert.equal(sent[0].crewJob,true);assert.equal(sent[0].preferHeroInRange,true);const cover={...t,id:'cover',dead:false,downed:true,loot:0};game.state.entities.cover=cover;sent.length=0;handlers.mousedown.forEach(f=>f({...event,button:2,clientX:t.x,clientY:t.z}));assert.equal(sent[0].type,'loot','gold corpse wins over overlapping downed body');assert.equal(sent[0].target,t.id);delete game.state.entities.cover;t.dead=false;delete t.loot;
 sent.length=0;handlers.mousedown.forEach(f=>f({...event,button:2,clientX:900,clientY:900}));assert.equal(sent.at(-1).kind,'move','right-click ground always moves despite selected target');
 const memory=createTargetMemory();memory.read('t',t,true,0);t.x=999;t.hp=1;t.place='secret-room';
 const frozen=memory.read('t',t,false,20);assert.equal(frozen.entity.x,3);assert.equal(frozen.entity.hp,100);assert.equal(frozen.entity.place,'street');assert.equal(frozen.visible,false);
 assert.equal(memory.read('t',t,true,21).entity.hp,1,'reacquiring sight restores live information');assert.equal(memory.read('other',null,false,22),null);
 console.log('Target controls: Tab select-only, scoped T, nameplate hits, ground movement, fog identity and frozen unseen position/HP/room passed');
}finally{globalThis.addEventListener=saved.events;globalThis.document=saved.document;}
