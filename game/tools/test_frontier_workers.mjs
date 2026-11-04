// L3.5: worker commands, deterministic trips, clearing and save/load. No graphics.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFrontier} from '../src/sim/frontier/frontier.js';
import {centreCell} from '../src/sim/frontier/town_grid.js';
import {createGame} from '../src/sim/game.js';
import {makeSave,loadSave} from '../src/sim/save.js';
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
console.log('test_frontier_workers: training, distance/conservation, rejections, save timing, drop-offs, governor, clearing and forage passed');
