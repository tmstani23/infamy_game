import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame} from '../src/sim/game.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
function fixture(){
 const g=createGame({district:read('data/waterfront.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json')});
 g.clans.addClan('p');g.clans.addClan('r');
 const S=g.state.entities,h=g.spawn('hero','ronin',-8,1,{owner:'p',holdFire:true}),crew=[-9,-10,-11].map(x=>g.spawn('thug','thug',x,1,{owner:'p',order:{kind:'follow',target:h}}));
 const enemy=g.spawn('hero','ronin',-4,1,{owner:'r',holdFire:true,hp:100000,maxHp:100000}),other=g.spawn('hero','ronin',-4,3,{owner:'r',holdFire:true,hp:100000,maxHp:100000});
 const body=(extra={})=>{const p=g.nav.nearestFree(-9,3);return g.spawn('thug','thug',...p,{owner:'r',holdFire:true,hp:0,downed:true,downedAt:g.state.tick,...extra});};
 const order=(kind,units=crew,extra={})=>g.step([{id:h,type:'order',kind,units,...extra}]);
 const job=(type,target,units=crew)=>g.step([{id:h,type,target,units,crewJob:true,crewOnly:true}]);
 return {g,S,h,crew,enemy,other,body,order,job};
}
{
 const f=fixture(),{g,S,crew,enemy,other,body,order,job}=f;order('attack',crew,{target:enemy});const target=body();job('execute',target);
 const worker=crew.map(id=>S[id]).find(e=>e.crewJob);assert.ok(worker);assert.equal(S[f.h].execute,undefined,'hero keeps its own actions');
 assert.equal(crew.filter(id=>S[id].execute).length,1);assert.ok(crew.filter(id=>id!==worker.id).every(id=>S[id].order.target===enemy),'rest keep their attack');
 job('execute',target);assert.equal(crew.filter(id=>S[id].execute).length,1,'repeated body clicks never send the whole group');
 order('attack',crew,{target:other});assert.equal(worker.crewJob.pending.target,other,'group target change queues rejoin order');assert.ok(worker.execute,'group attacks do not cancel the explicit execution');
 for(let n=0;n<220&&worker.crewJob;n++)g.step();assert.ok(S[target]?.dead||!S[target]);assert.equal(worker.crewJob,undefined);assert.equal(worker.order.target,other,'worker rejoins latest group attack');
}
{
 const {g,S,h,crew,body,job}=fixture(),target=body({downed:false,dead:true,diedAt:0,loot:80});const before=g.state.clans.p.ryo;job('loot',target);
 const worker=crew.map(id=>S[id]).find(e=>e.crewJob);assert.ok(worker);assert.equal(crew.filter(id=>S[id].crewJob).length,1);assert.ok(crew.filter(id=>id!==worker.id).every(id=>S[id].order.kind==='follow'),'looting never turns the whole group into escorts');
 for(let n=0;n<140&&worker.crewJob;n++)g.step();assert.equal(g.state.clans.p.ryo,before+80);assert.equal(worker.order.kind,'follow');assert.equal(worker.order.target,h);
}
for(const kind of ['move','attack','stop']){
 const {g,S,crew,enemy,body,job,order}=fixture(),target=body();job('execute',target);const worker=crew.map(id=>S[id]).find(e=>e.crewJob);
 order(kind,[worker.id],kind==='attack'?{target:enemy}:{x:-12,z:1});assert.equal(worker.crewJob,undefined,`explicit solo ${kind} overrides`);assert.equal(worker.execute,undefined);
}
{
 const {g,S,crew,enemy,other,body,job,order}=fixture();order('attack',crew,{target:enemy});const target=body();job('execute',target,[crew[0]]);
 const worker=S[crew[0]];order('attack',crew.slice(1),{target:other});
 for(let n=0;n<220&&worker.crewJob;n++)g.step();assert.equal(worker.order.target,other,'a solo-dispatched worker still rejoins the current order of its group');
}
{
 const {g,S,h,crew,body,job}=fixture();g.state.clans.p.kind='ninja';S[h].model='ninja_leader';
 const target=body();job('execute',target);const worker=crew.map(id=>S[id]).find(e=>e.crewJob);assert.ok(worker);
 g.step([{id:h,type:'ability',slot:'R'}]);assert.equal(worker.crewJob,undefined,'Smoke Bomb still drops an active body job');assert.equal(worker.execute,undefined);assert.equal(worker.holdFire,true);
}
{
 const {g,S,crew,body,job}=fixture(),target=body();job('execute',target);const worker=crew.map(id=>S[id]).find(e=>e.crewJob);
 g.step([{id:worker.id,owner:'r',type:'order',kind:'stop',units:crew}]);assert.ok(worker.crewJob,'nonhero/foreign spoof cannot override jobs');
}
console.log('Explicit body jobs: one crewman, execute priority, latest group order/rejoin, solo override, no loot escorts, once-only loot and authority passed');
