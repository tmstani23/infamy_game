// L3.5: worker commands, deterministic trips, clearing and save/load. No graphics.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFrontier} from '../src/sim/frontier/frontier.js';
import {centreCell} from '../src/sim/frontier/town_grid.js';
import {createGame} from '../src/sim/game.js';
import {makeSave,loadSave} from '../src/sim/save.js';
import {createAreas} from '../src/sim/areas.js';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url)));
const base=read('data/frontier.json');
function fixture({saved=null,changes={},spots=null,stages=null}={}) {
  const data=structuredClone(base);data.settlements={};data.roads={};data.rates.food=0;data.rates.growthTicks=1e9;data.rates.maxBuilders=1;data.mood.reviewTicks=1e9;
  Object.assign(data.workers,{trainTicks:2,speed:20,harvestTicks:0,load:3,clearTicks:5},changes);
  const list=spots || [{id:'near',kind:'timber',x:1010,z:1000},{id:'far',kind:'timber',x:1020,z:1000},{id:'stone',kind:'stone',x:1010,z:1010},{id:'fish',kind:'fish',x:1000,z:1020},{id:'distant',kind:'timber',x:1700,z:1000}];
  const spotData={seed:31,chunkSize:250,spots:list.map(p=>({...p,pieces:[[0,0,0],[1,0,0],[2,0,0]],deposit:null})),byChunk:{}};
  for(const p of spotData.spots)(spotData.byChunk[`c${Math.floor(p.x/250)}_${Math.floor(p.z/250)}`] ||= []).push(p.id);
  const state=saved || {tick:0},fr=createFrontier({state,data,spotData,spotRules:stages?{stages}:null});
  if(!saved)fr.world.addTown({id:'t',name:'Test',owner:'p',region:null,x:1000,z:1000,pop:8,stock:{food:100,timber:100,stone:100,ryo:100},buildings:[{type:'town_hall',cell:0}]});
  const s=fr.world.settlement('t'),workers=fr.modules.find(m=>m.name==='workers').workers;
  const send=(c,owner='p')=>{fr.command({owner},{type:'frontier',town:'t',...c});return state.frontier.receipts.at(-1);};
  const run=n=>{for(let i=0;i<n;i++){state.tick++;fr.tick();}};
  const train=(count=1)=>{assert.equal(send({action:'train',count}).ok,true);run(count*data.workers.trainTicks);return s.workers;};
  return {state,data,spotData,s,fr,workers,send,run,train};
}

// Costs/population are reserved once, training is sequential and state is plain saved data.
{
  const f=fixture();assert.equal(f.send({action:'train',count:2}).ok,true);
  assert.equal(f.s.stock.ryo,80);assert.equal(f.s.pop,6);assert.equal(f.s.workers.length,0);
  f.run(1);assert.equal(f.s.workers.length,0);f.run(1);assert.equal(f.s.workers.length,1);
  f.run(2);assert.equal(f.s.workers.length,2);assert.equal(f.s.workerTraining.length,0);
  assert.equal(new Set(f.s.workers.map(w=>w.id)).size,2);
  assert.ok(f.s.workers.every(w=>w.entity===null && w.spot===null && w.carrying===0));
  assert.deepEqual(JSON.parse(JSON.stringify(f.s.workers)),f.s.workers);
  for(const count of [0,-1,.5,NaN,100000]) {
    const before=JSON.stringify(f.s);assert.equal(f.send({action:'train',count}).ok,false);assert.equal(JSON.stringify(f.s),before);
  }
  const before=JSON.stringify(f.s);assert.equal(f.send({action:'train',count:1},'rival').ok,false);assert.equal(JSON.stringify(f.s),before);
  f.s.stock.ryo=0;const poor=JSON.stringify(f.s);assert.equal(f.send({action:'train',count:1}).ok,false);assert.equal(JSON.stringify(f.s),poor);
}
{
  const f=fixture();f.s.buildings[0].stage='frame';
  const before=JSON.stringify(f.s);assert.equal(f.send({action:'train',count:1}).reason,'needs a town hall');assert.equal(JSON.stringify(f.s),before);
}

// Twice the trip distance halves loads (within one); every unit of stock is ledgered once.
{
  const f=fixture();const [near,far]=f.train(2);
  assert.equal(f.send({action:'assign',workers:[near.id],spot:'near'}).ok,true);
  assert.equal(f.send({action:'assign',workers:[far.id],spot:'far'}).ok,true);
  const before=f.s.stock.timber;f.run(400);
  assert.ok(Math.abs(near.deliveries-2*far.deliveries)<=1);
  assert.equal(f.s.stock.timber-before,(near.deliveries+far.deliveries)*f.data.workers.load);
  const entries=f.state.frontier.ledger.filter(l=>l.reason==='gather');
  assert.equal(entries.reduce((n,e)=>n+e.delta,0),f.s.stock.timber-before);
  assert.ok(entries.every(e=>e.delta===f.data.workers.load && e.settlement==='t'));
  assert.equal(f.fr.world.checkInvariants(),true);
  for(const w of f.s.workers)assert.ok(w.phase>=0 && w.phase<1 && Number.isInteger(w.elapsed));
}

// Refusal cannot change worker orders, trip state, stock, population or worked spots.
{
  const f=fixture(),[w]=f.train();f.send({action:'assign',workers:[w.id],spot:'near'});f.run(3);
  for(const c of [{workers:[w.id],spot:'missing'},{workers:[w.id],spot:'distant'},{workers:['missing'],spot:'near'},{workers:[w.id,w.id],spot:'near'},{workers:[],spot:'near'}]) {
    const before=JSON.stringify(f.s),spots=JSON.stringify(f.state.frontier.spots);
    assert.equal(f.send({action:'assign',...c}).ok,false);assert.equal(JSON.stringify(f.s),before);assert.equal(JSON.stringify(f.state.frontier.spots),spots);
  }
}

// Save with cargo on the return leg: the same later tick unloads the same load.
{
  const f=fixture({changes:{harvestTicks:4}}),[w]=f.train();f.send({action:'assign',workers:[w.id],spot:'near'});f.run(15);
  assert.equal(w.carrying,3);assert.ok(w.phase>0 && w.phase<1);
  const g=fixture({saved:JSON.parse(JSON.stringify(f.state)),changes:{harvestTicks:4}});
  for(let i=0;i<50;i++){f.run(1);g.run(1);assert.deepEqual(g.s.stock,f.s.stock);assert.deepEqual(g.s.workers,f.s.workers);}
  assert.deepEqual(g.state.frontier.totals,f.state.frontier.totals);
}

// Player reassignment preserves a carried load; a destroyed drop-off reroutes it to the hall.
{
  const f=fixture(),[w]=f.train(),c=centreCell(f.s.grid.n);
  f.s.buildings.push({id:'drop',type:'storehouse',stage:'built',cell:c+2,workers:0});
  f.send({action:'assign',workers:[w.id],spot:'far'});f.run(2);
  assert.equal(w.dropoff,'drop','nearest finished drop-off wins');assert.equal(w.carrying,3);
  assert.equal(f.send({action:'assign',workers:[w.id],spot:'fish'}).ok,true);
  const timber=f.s.stock.timber;f.s.buildings=f.s.buildings.filter(b=>b.id!=='drop');f.run(1);
  assert.equal(w.dropoff,f.s.buildings.find(b=>b.type==='town_hall').id);assert.equal(w.carrying,3);
  f.run(25);assert.equal(f.s.stock.timber,timber+3);assert.equal(w.spot,'fish');
}

// Governor assigns idle workers to the nearest spot for the town's scarcest gatherable resource.
{
  const f=fixture(),[w]=f.train();f.s.stock.timber=1;f.s.stock.stone=20;f.s.stock.food=100;
  f.s.autoBuild=true; // automatic assignment is explicitly enabled; Ask first keeps workers waiting
  f.run(100);assert.equal(w.spot,'near');assert.equal(w.by,'g');
}

// Clearing waits for trained workers and paid work time; saving mid-clear keeps that progress.
{
  const f=fixture(),c=centreCell(f.s.grid.n),cell=c+6;
  f.s.grid.ground=f.s.grid.ground.slice(0,cell)+'o'+f.s.grid.ground.slice(cell+1);
  assert.equal(f.send({action:'place',kind:'storehouse',cells:[cell]}).ok,true);
  const p=f.s.projects[0];assert.equal(f.send({action:'authorize',project:p.id}).ok,true);f.run(30);assert.equal(p.phase,'clearing');assert.equal(f.s.grid.ground[cell],'o','population builders do not clear instantly');
  f.train();f.run(1);assert.equal(p.clearWork,2);assert.equal(f.s.grid.ground[cell],'o');
  const loaded=fixture({saved:JSON.parse(JSON.stringify(f.state))});
  f.run(3);loaded.run(3);assert.equal(f.s.grid.ground[cell],'c');assert.equal(p.phase,'cleared');assert.deepEqual(loaded.s.projects,f.s.projects);assert.equal(loaded.s.grid.ground,f.s.grid.ground);
  assert.equal(f.fr.world.checkInvariants(),true);
}

// Forage and passive node-camp production stop once the first worker is ready, not while queued.
{
  const f=fixture({spots:[]});f.s.founded=0;f.s.stock.timber=0;f.run(20);assert.ok(f.s.stock.timber>0);
  f.train();const timber=f.s.stock.timber;f.run(40);assert.equal(f.s.stock.timber,timber);
  f.s.buildings.push({id:'lumber',type:'lumber_camp',stage:'built',cell:null,workers:0},{id:'quarry',type:'quarry',stage:'built',cell:null,workers:0});
  const stone=f.s.stock.stone;f.run(40);assert.equal(f.s.stock.timber,timber);assert.equal(f.s.stock.stone,stone);
  assert.equal(f.s.buildings.find(b=>b.id==='lumber').workers,0);
}

// Only worked spots acquire a stage string; regrowth returns a full spot to the unsaved default.
{
  const stages={value:{f:1,s:.2,h:.1},regrow:{h:1,s:1},trickle:.25};
  const f=fixture({stages}),[w]=f.train();f.send({action:'assign',workers:[w.id],spot:'near'});f.run(10);
  assert.equal(f.state.frontier.spots.near,'hff');assert.equal(f.state.frontier.spots.far,undefined);
  f.workers.econTick();assert.equal(f.state.frontier.spots.near,'sff');f.workers.econTick();assert.equal(f.state.frontier.spots.near,undefined);
}

// Real save encoder/game hook, including a trip and pending training in an old-compatible town.
{
  const f=fixture({changes:{trainTicks:10}});
  const options={district:read('data/waterfront.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json'),frontier:f.data,resourceSpots:f.spotData};
  const g=createGame(options);g.clans.addClan('p');g.frontier.world.addTown({id:'t',name:'Test',owner:'p',x:1000,z:1000,pop:8,stock:{ryo:100,food:100,timber:100,stone:100},buildings:[{type:'town_hall',cell:0}]});
  const hero=g.spawn('hero','ronin',-8,1,{owner:'p',holdFire:true});g.step([{id:hero,type:'frontier',action:'train',town:'t',count:2}]);
  for(let i=0;i<12;i++)g.step([]);
  const s=g.state.frontier.settlements.t;g.step([{id:hero,type:'frontier',action:'assign',town:'t',workers:[s.workers[0].id],spot:'near'}]);
  for(let i=0;i<3;i++)g.step([]);assert.equal(s.workerTraining.length,1);
  const save=makeSave(g),h=createGame(options);loadSave(h,JSON.parse(JSON.stringify(save)));
  for(let i=0;i<50;i++){g.step([]);h.step([]);assert.deepEqual(h.state.frontier.settlements.t.workers,s.workers);assert.deepEqual(h.state.frontier.settlements.t.stock,s.stock);}
}
// L3.6 uses the real fine navigation grid, including a wall across the direct shuttle line.
const island={seed:31,size:{w:2000,h:2000},capital:{x:100,z:100},terrain:{cell:50,rows:Array(40).fill('p'.repeat(40))},sites:[],nodes:[],corridors:[],rules:{fordRadius:0}};
const chunks={chunk:250,navCell:1,navPad:.4,loadRadius:1,keepChunks:50,clear:{},props:{},sight:{range:26,fireRadius:18,fireRange:40}};
const wall={minX:1004,maxX:1006,minZ:998,maxZ:1002};
function walking({saved=null,near=true,obstacle=true}={}) {
  const f=fixture({saved,changes:{harvestTicks:4,spawnPerTick:2}});
  f.state.entities ||= {hero:{id:'hero',type:'hero',owner:'p',place:'world',x:1000,z:1000}};
  f.state.match={mode:'campaign'};
  const areas=createAreas({world:island,cfg:chunks,city:obstacle?wall:null});
  let next=1;
  f.workers.attach({areas,spawn:(type,model,x,z,extra)=>{
    let id;do{id=`live${next++}`;}while(f.state.entities[id]);
    f.state.entities[id]={id,type,model,x,z,...extra};return id;
  },remove:id=>delete f.state.entities[id]});
  const run=n=>{for(let i=0;i<n;i++){
    const previous=Object.fromEntries(Object.values(f.state.entities).filter(e=>e.worker).map(e=>[e.id,[e.x,e.z]]));
    areas.update(Object.values(f.state.entities));f.run(1);
    for(const e of Object.values(f.state.entities))if(e.worker && previous[e.id])assert.ok(Math.hypot(e.x-previous[e.id][0],e.z-previous[e.id][1])<=f.data.workers.speed/20+1e-8,'loaded navigation never teleports or exceeds worker speed');
  }};
  f.state.entities.hero.x=near?1000:1800;
  const train=count=>{f.send({action:'train',count});run(count*f.data.workers.trainTicks);return f.s.workers;};
  return {...f,areas,run,train};
}
const units=f=>Object.values(f.state.entities).filter(e=>e.worker);
{
  const a=walking(),b=walking({near:false});
  for(const f of [a,b]) {const ws=f.train(3);f.send({action:'assign',workers:ws.map(w=>w.id),spot:'near'});}
  const before=a.s.stock.timber;
  for(let i=0;i<200*a.data.cadenceTicks;i++) {
    a.run(1);b.run(1);
    assert.ok(units(a).length<=3);assert.equal(units(b).length,0);
    for(const w of a.s.workers) {
      const e=a.state.entities[w.entity],p=a.workers.position(w);
      if(e && p) {assert.ok(Math.hypot(e.x-p[0],e.z-p[1])<1e-8);assert.ok(a.areas.nav.free(e.x,e.z));assert.equal(e.carrying,w.carrying);assert.equal(e.phase,w.phase);assert.equal(e.type,'civilian');assert.equal(e.owner,undefined,'workers never fight or scout as clan troops');}
    }
  }
  assert.ok(a.s.stock.timber>before,'loaded units actually deliver');
  assert.ok(Math.abs(a.s.stock.timber-b.s.stock.timber)<=a.data.workers.load*3);
  assert.deepEqual(a.state.frontier.totals,b.state.frontier.totals,'loaded and sleeping routes conserve identical stock');
  assert.ok(a.s.workers[0].trip.outPath.length>2,'fine navigation detours around the wall');
  assert.equal(a.fr.world.checkInvariants(),true);assert.equal(b.fr.world.checkInvariants(),true);
}
{
  const f=walking(),ws=f.train(5);f.send({action:'assign',workers:ws.map(w=>w.id),spot:'near'});f.run(5);
  f.state.entities.hero.place='street';f.run(1);assert.equal(units(f).length,0);
  f.areas.update(Object.values(f.state.entities));assert.deepEqual(f.areas.activeIds(),[],'workers do not keep chunks awake');
  f.run(3);const saved=JSON.parse(JSON.stringify(f.state)),g=walking({saved});
  for(const h of [f,g]) {h.state.entities.hero.place='world';h.run(1);assert.equal(units(h).length,2,'global spawn budget');
    for(const w of h.s.workers.filter(w=>w.entity!==null)) {const e=h.state.entities[w.entity],p=h.workers.position(w);assert.ok(Math.hypot(e.x-p[0],e.z-p[1])<=1);}
    h.run(2);assert.equal(units(h).length,5);}
  assert.deepEqual(g.s.stock,f.s.stock);
  const victim=f.s.workers[0],survivors=f.s.workers.slice(1).map(w=>w.id),entity=f.state.entities[victim.entity];
  entity.downed=true;entity.hp=0;f.state.entities.hero.place='street';f.run(1);
  assert.deepEqual(f.s.workers.map(w=>w.id),survivors,'one loaded casualty removes exactly one record even during suspension');
  assert.equal(f.state.entities[entity.id],undefined);assert.equal(units(f).length,0);
  f.state.entities.hero.place='world';f.run(4);assert.equal(f.s.workers.length,4);assert.ok(!f.s.workers.some(w=>w.id===victim.id));
  const e=units(f)[0];e.hp=17;f.state.entities.hero.place='street';f.run(1);f.state.entities.hero.place='world';f.run(3);
  assert.equal(units(f).find(u=>u.worker===e.worker).hp,17,'suspension never heals wounds');
}
// Loaded workers still clear footprints, preserve reassigned cargo and reroute a lost drop-off.
{
  const f=walking({obstacle:false}),[w]=f.train(1),c=centreCell(f.s.grid.n),cell=c+6;
  f.s.grid.ground=f.s.grid.ground.slice(0,cell)+'o'+f.s.grid.ground.slice(cell+1);
  f.send({action:'place',kind:'storehouse',cells:[cell]});const project=f.s.projects[0];
  f.send({action:'authorize',project:project.id});f.run(5);assert.equal(f.s.grid.ground[cell],'c');assert.equal(project.phase,'cleared');
  f.s.buildings.push({id:'drop',type:'storehouse',stage:'built',cell:c+2,workers:0});
  f.send({action:'assign',workers:[w.id],spot:'far'});
  for(let i=0;i<100 && !w.carrying;i++)f.run(1);
  assert.equal(w.carrying,3);assert.notEqual(w.entity,null);
  f.send({action:'assign',workers:[w.id],spot:'fish'});const timber=f.s.stock.timber;
  f.s.buildings=f.s.buildings.filter(b=>b.id!=='drop');f.run(1);assert.equal(w.carrying,3);assert.notEqual(w.dropoff,'drop');
  f.run(25);assert.equal(f.s.stock.timber,timber+3);assert.equal(w.spot,'fish');
  for(let i=0;i<100 && !w.carrying;i++)f.run(1);
  assert.equal(w.carrying,3);
  const count=f.s.workers.length,id=w.entity;f.state.entities[id].dead=true;f.run(1);
  assert.equal(f.s.workers.length,count-1);assert.equal(f.state.entities[id],undefined,'carried cargo dies with its worker');
  assert.equal(f.fr.world.checkInvariants(),true);
}
// A real game starts, restores walking entities without duplicating them, and normal combat
// can remove a worker through the existing civilian knockout path (no combat special case).
{
  const f=fixture(),options={district:read('data/waterfront.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json'),frontier:f.data,resourceSpots:f.spotData,world:island,worldChunks:chunks};
  const g=createGame(options);g.state.match={mode:'campaign'};g.clans.addClan('p');
  const id=g.spawn('hero','ronin',1000,1000,{owner:'p',place:'world',holdFire:true});
  g.frontier.world.addTown({id:'t',owner:'p',x:1000,z:1000,pop:8,stock:{food:100,timber:100,stone:100,ryo:100},buildings:[{type:'town_hall',cell:0}]});
  g.step([{id,type:'frontier',town:'t',action:'train',count:2}]);for(let i=0;i<5;i++)g.step([]);
  const s=g.state.frontier.settlements.t;
  g.step([{id,type:'frontier',town:'t',action:'assign',workers:s.workers.map(w=>w.id),spot:'near'}]);
  for(let i=0;i<15;i++)g.step([]);
  assert.equal(units({state:g.state}).length,2);assert.ok(s.workers.some(w=>w.carrying));
  const h=createGame(options);loadSave(h,JSON.parse(JSON.stringify(makeSave(g))));
  for(let i=0;i<60;i++) {g.step([]);h.step([]);assert.deepEqual(h.state.frontier.settlements.t.workers,s.workers);assert.deepEqual(h.state.frontier.settlements.t.stock,s.stock);assert.equal(units({state:h.state}).length,2);}
  const victim=s.workers[0],e=g.state.entities[victim.entity];
  victim.spot=null;victim.trip=null;victim.carrying=0;Object.assign(e,{hp:1,x:1000.5,z:1000});
  g.step([{id,type:'attack',target:e.id}]);for(let i=0;i<80 && s.workers.includes(victim);i++)g.step([]);
  assert.equal(s.workers.length,1,'real combat knockout removes one worker record');assert.equal(g.state.entities[e.id],undefined);
}
{
  const f=walking({near:false});const active=f.areas.activeIds(),cached=f.areas.cached();
  const p=f.areas.nav.workerPath(1000,1000,1010,1000);
  assert.ok(p.length>2);assert.deepEqual(f.areas.activeIds(),active);assert.equal(f.areas.cached(),cached,'offscreen planning retains no chunks');
  f.areas.update([{type:'civilian',worker:'w1',place:'world',x:1000,z:1000}]);assert.deepEqual(f.areas.activeIds(),[]);
  f.state.entities.hero={id:'hero',type:'thug',owner:'bot',place:'world',x:1000,z:1000};
  f.train(1);f.run(1);assert.equal(units(f).length,1,'a bot army wakes workers too');
}
console.log('test_frontier_workers: L3.5 conservation/save/clearing and L3.6 proximity, navigation, parity, lifecycle and casualties passed');
