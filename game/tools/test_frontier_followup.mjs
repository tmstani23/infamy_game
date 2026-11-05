// Reported L3.9 failures: browser-normalized HTML, resource review, road space and waiting workers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontier } from '../src/sim/frontier/frontier.js';
import { createAreas } from '../src/sim/areas.js';
import { centreCell, worldToCell, hallRoadCell, townBlockersIn } from '../src/sim/frontier/town_grid.js';
import { createFrontierBuildUI, resourceRequirements } from '../src/frontier_build_ui.js';
import { townProps } from '../src/town_props.js';
import { createFrontierPanel } from '../src/frontier_panel.js';

const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url)));
const data=read('data/frontier.json'); data.settlements={}; data.roads={}; data.rates.food=0; data.rates.growthTicks=1e9;
data.workers.trainTicks=2; data.workers.speed=20; data.workers.harvestTicks=1;
const spots={seed:1,chunkSize:250,spots:[{id:'timber',kind:'timber',x:1100,z:1000,pieces:[[0,0,0]]}],byChunk:{c4_4:['timber']}};
const state={tick:0,entities:{h:{id:'h',owner:'p',type:'hero',place:'world',x:1000,z:1000}},match:{mode:'campaign'}};
const fr=createFrontier({state,data,spotData:spots});
fr.world.addTown({id:'t',name:'Test town',owner:'p',x:1000,z:1000,pop:6,stock:{food:60,timber:40,goods:20,ryo:20},buildings:[{type:'town_hall',cell:0}],roadReserve:1});
const s=fr.world.settlement('t'),c=centreCell(s.grid.n),at=(x,z)=>c+x+z*s.grid.n;
const command=c=>{fr.command({owner:'p'}, {town:'t',...c});return state.frontier.receipts.at(-1);};
assert.match(command({action:'zone',kind:'housing',cells:[at(1,0)]}).reason,/reserved/);
assert.match(command({action:'place',kind:'wall',cells:[at(1,0)]}).reason,/reserved/);
assert.match(command({action:'place',kind:'quarry',cells:[at(1,0)]}).reason,/reserved/);
assert.equal(command({action:'place',kind:'road',cells:[at(1,0)]}).ok,true);
assert.equal(command({action:'zone',kind:'housing',cells:[at(2,0),at(3,0)]}).ok,true);
// Mature housing blocks the direct worker route, while the reserved ring stays open.
for(const i of [at(2,0),at(3,0)])s.grid.stage=s.grid.stage.slice(0,i)+'1'+s.grid.stage.slice(i+1);
const island={seed:1,size:{w:2000,h:2000},capital:{x:100,z:100},terrain:{cell:50,rows:Array(40).fill('p'.repeat(40))},sites:[],nodes:[],corridors:[],rules:{fordRadius:0}};
const areas=createAreas({world:island,cfg:{chunk:250,navCell:1,navPad:.4,loadRadius:1,keepChunks:50,clear:{},props:{},sight:{range:26,fireRadius:18,fireRange:40}}});
const workers=fr.modules.find(m=>m.name==='workers').workers;
let next=0;
workers.attach({areas,spawn:(type,model,x,z,extra)=>{const id='worker'+next++;state.entities[id]={id,type,model,x,z,...extra};return id;},remove:id=>delete state.entities[id]});
const run=n=>{for(let i=0;i<n;i++){areas.update(Object.values(state.entities));state.tick++;fr.tick();}};
assert.equal(command({action:'train',count:2}).ok,true);run(4);
assert.equal(s.workers.length,2);
for(const w of s.workers) {
  const e=state.entities[w.entity];assert.ok(e,'worker wakes near the hero');
  assert.ok(hallRoadCell(s,worldToCell(s,e.x,e.z)),'worker waits in the protected road ring');
  assert.equal(w.spot,null,'Ask first does not auto-assign a new worker');
}
assert.notDeepEqual(s.workers[0].departure,s.workers[1].departure,'waiting workers spread out');
const [w]=s.workers;
assert.equal(command({action:'assign',workers:[w.id],spot:'timber'}).ok,true);run(3);
assert.ok(w.trip.outPath.every(([x,z])=>!['B','w'].includes(s.grid.use[worldToCell(s,x,z)])), 'trip avoids the hall and walls');
assert.equal(townBlockersIn(state.frontier,1021,999,1023,1001).length,0,'zoned ground stays passable');
const timber=s.stock.timber;run(300);assert.ok(s.stock.timber>timber,'manually assigned worker delivers');
// Saved manual movement, stop and groups use the same validated commands as harvesting.
const mover=s.workers[1];
assert.equal(command({action:'workerOrder',workers:[mover.id],kind:'group',group:2}).ok,true);assert.equal(mover.group,2);
assert.equal(command({action:'workerOrder',workers:[mover.id],kind:'group',group:99}).ok,false);
assert.equal(command({action:'workerOrder',workers:[mover.id],kind:'move',x:950,z:1000}).ok,true);
run(5);assert.equal(mover.order.kind,'move');
state.entities.h.place='street';run(1);assert.equal(mover.entity,null);
const movingSave=JSON.parse(JSON.stringify(state)),restoredMove=createFrontier({state:movingSave,data,spotData:spots});
for(let i=0;i<5;i++){run(1);movingSave.tick++;restoredMove.tick();}
assert.deepEqual(movingSave.frontier.settlements.t.workers[1],mover,'mid-move save retains route, progress and group');
assert.equal(command({action:'workerOrder',workers:[mover.id],kind:'hold'}).ok,true);
const held=workers.position(mover);run(10);assert.deepEqual(workers.position(mover),held,'Stop holds position');
assert.equal(command({action:'workerOrder',workers:[mover.id],kind:'move',x:950,z:1000}).ok,true);
run(150);assert.equal(mover.order.kind,'hold');assert.deepEqual(mover.departure,[950,1000]);
state.entities.h.place='world';run(2);
const before=JSON.stringify(s);assert.match(command({action:'train',count:s.pop}).reason,/townsperson|afford/);assert.equal(JSON.stringify(s),before,'reserved population is not spent');
const restored=JSON.parse(JSON.stringify(state));delete restored.frontier.settlements.t.roadReserve;
createFrontier({state:restored,data,spotData:spots});
assert.equal(restored.frontier.settlements.t.roadReserve,1,'old saves receive the additive reservation');
assert.equal(restored.frontier.settlements.t.grid.zone,s.grid.zone,'migration keeps existing zones');
const lights=townProps([s],data.townArt,data.townLights).filter(p=>p.key.includes('auto-light'));
assert.ok(lights.length>=4);assert.equal(new Set(lights.map(p=>p.key)).size,lights.length);

// DOM double deliberately normalizes boolean attributes like a real browser.
const handlers={},elements=[];
globalThis.addEventListener=(name,fn,options)=>(handlers[name] ||= []).push({fn,capture:!!options?.capture});
globalThis.innerWidth=1000;globalThis.innerHeight=800;
const ctx=new Proxy({}, {get:(o,k)=>o[k] || (()=>{}),set:(o,k,v)=>(o[k]=v,true)});
const element=()=>({hidden:true,style:{},dataset:{},listeners:{},writes:0,
  get innerHTML(){return this.html || '';},set innerHTML(v){this.writes++;this.html=v.replace('data-close ','data-close="" ');},
  addEventListener(t,f){this.listeners[t]=f;},getContext:()=>ctx});
globalThis.document={createElement:element,body:{append(...els){elements.push(...els);}}};
const sent=[],view={screenToGround:(x,y)=>({x:(x-500)/5+1000,z:(y-400)/5+1000}),unitToScreen:(x,z)=>({x:(x-1000)*5+500,y:(z-1000)*5+400})};
const crew={cancelPointer(){},clear(){},selected:()=>[]};let built=null;
const ui=createFrontierBuildUI({game:{state},view,heroId:'h',data,spotIndex:workers.index,spotRules:{stages:{}},known:()=>true,send:c=>sent.push(c),crewInput:crew,onBuild:id=>built=id});
const canvas={closest:sel=>sel==='canvas#view'?{}:null};
function emit(name,x,y,extra={}) {const e={button:0,clientX:x,clientY:y,target:canvas,preventDefault(){},stopImmediatePropagation(){this.stopped=true;},...extra};for(const h of handlers[name] || []){h.fn(e);if(e.stopped)break;}return e;}
const click=(x,y)=>{emit('mousedown',x,y);emit('mouseup',x,y);};
ui.html(s);click(500,400);ui.update();
const card=elements.find(e=>e.id==='towninspect'),review=elements.find(e=>e.id==='townbuildreview');
assert.match(card.innerHTML,/Train worker/);
const writes=card.writes;ui.update();ui.update();assert.equal(card.writes,writes,'card is stable despite normalized HTML');
const button=dataset=>({dataset,hasAttribute:k=>k==='data-close' && 'close' in dataset});
fr.world.change('t','ryo',20,'test training funds');
card.listeners.click({target:{closest:()=>button({train:'t'})}});ui.update();
review.listeners.click({target:{closest:()=>({hasAttribute:k=>k==='data-confirm'})}});assert.equal(sent.at(-1).action,'train');
card.listeners.click({target:{closest:()=>button({close:''})}});ui.update();assert.equal(card.hidden,true,'close button dismisses inspector');
click(500,400);ui.update();emit('mousedown',850,700);assert.equal(card.hidden,true,'outside left click dismisses inspector');emit('mouseup',850,700);
click(500,400);ui.update();card.listeners.click({target:{closest:()=>button({build:'t'})}});assert.equal(built,'t');
ui.click({act:'build-tool',id:'road'},s);
const sentBefore=sent.length;emit('mousedown',775,675);emit('mousemove',830,675);emit('mouseup',830,675);ui.update();
assert.equal(sent.length,sentBefore,'drag release spends nothing');assert.equal(review.hidden,false);assert.match(review.innerHTML,/need 2, have/);
// Final validation rejects spending after stock has changed under the preview.
const stock=s.stock.timber;s.stock.timber=0;
review.listeners.click({target:{closest:()=>({hasAttribute:k=>k==='data-confirm'})}});assert.equal(sent.length,sentBefore);
s.stock.timber=stock;review.listeners.click({target:{closest:()=>({hasAttribute:k=>k==='data-confirm'})}});
assert.equal(sent.at(-1).action,'place');assert.equal(sent.at(-1).cells.length,2);
const afterConfirm=sent.length;
emit('mousedown',775,730);emit('mouseup',830,730);ui.update();
review.listeners.click({target:{closest:()=>({hasAttribute:()=>false})}});
assert.equal(review.hidden,true);assert.equal(sent.length,afterConfirm,'Cancel sends no command');
assert.match(resourceRequirements({...s,stock:{timber:1}},{timber:3}),/need 3, have 1.*missing 2/);
assert.match(ui.html(s),new RegExp(data.buildUI.zoneColors.housing));
ui.close();
// The real spawned civilian can be selected and ordered through the client events.
const idle=s.workers.find(worker=>!worker.spot),e=state.entities[idle.entity],pixel=view.unitToScreen(e.x,e.z);
click(pixel.x,pixel.y);emit('mousedown',1000,400,{button:2});
assert.equal(sent.at(-1).action,'assign');assert.ok(sent.at(-1).workers.includes(idle.id));
// A remote choice stays singular; O's nearby resolver does not fall back to a distant town.
fr.world.addTown({id:'other',name:'Other town',owner:'p',x:1700,z:1700,pop:5,stock:{},buildings:[{type:'town_hall',cell:0}]});
document.body.appendChild=()=>{};
const nativeInterval=globalThis.setInterval;globalThis.setInterval=()=>0;
let nearby='t';const root=element();
const panel=createFrontierPanel({root,game:{state},heroId:'h',clan:'p',send:()=>{},nearbyTown:()=>nearby});
panel.open();assert.match(root.innerHTML,/Test town/);assert.doesNotMatch(root.innerHTML,/Other town|data-act="town"/);
panel.open('other');assert.match(root.innerHTML,/Other town/);assert.doesNotMatch(root.innerHTML,/Test town/);
panel.close();nearby=null;panel.open();assert.match(root.innerHTML,/Go near your town/);assert.doesNotMatch(root.innerHTML,/Other town/);
globalThis.setInterval=nativeInterval;
fr.world.checkInvariants();
console.log('test_frontier_followup: ok');
