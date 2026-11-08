// Camp storage + ox carts (Tim 2026-11-06). Run: node game/tools/test_camp_carts.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFrontier} from '../src/sim/frontier/frontier.js';
import {worldToCell} from '../src/sim/frontier/town_grid.js';
import {stepCarts, tripTicks, campFull, cartWorkerLimit} from '../src/sim/frontier/camp_carts.js';
const base=JSON.parse(readFileSync(new URL('../data/frontier.json',import.meta.url)));
const C=base.workers.carts;
assert.ok(C.free===2 && C.max===3 && C.share===0.6 && C.maxLoad===150 && C.cap===400 && C.speed===6);

// pure relay: two carts, offset by one one-way trip, each taking 60% (max 150)
{
  const data={workers:{gatherBuildings:['quarry'],carts:C}},b={id:'q',type:'quarry',stage:'built',store:{stone:100}},s={id:'t',buildings:[b]};
  const got=[];const change=(id,r,v,why)=>got.push([r,v,why]);
  const oneWay=tripTicks(C,[0,0],[0,300]);assert.equal(oneWay,Math.ceil(300*1.2/6*20));
  stepCarts(s,data,change,()=>[0,0],()=>[0,300]);
  assert.equal(b.carts.length,2);assert.equal(b.carts[0].at,'out');assert.deepEqual(b.carts[0].load,{stone:60});assert.equal(b.store.stone,40);
  assert.equal(b.carts[1].at,'camp');assert.ok(b.carts[1].t>0,'second cart waits half a cycle');
  for(let i=0;i<=oneWay;i++)stepCarts(s,data,change,()=>[0,0],()=>[0,300]);
  assert.deepEqual(got[0],['stone',60,'cart']);
  assert.equal(b.carts[1].at,'out','second cart leaves as the first arrives home');
  b.store={stone:1000};b.carts[0]={at:'camp',t:0,load:null};b.cartGap=0;stepCarts(s,data,change,()=>[0,0],()=>[0,300]);
  assert.equal(b.carts[0].load.stone,150,'load capped at maxLoad');
  assert.equal(campFull(data,{store:{stone:400}}),true);assert.equal(campFull(data,{store:{stone:399}}),false);
  assert.ok(cartWorkerLimit(data,b,10)>=1);
  // Tim 2026-11-07: carts waiting together at an empty camp never leave together (they drove on top of each other)
  const b2={id:'q2',type:'quarry',stage:'built',store:{}},s2={id:'t2',buildings:[b2]};
  for(let i=0;i<200;i++)stepCarts(s2,data,change,()=>[0,0],()=>[0,300]);
  assert.ok(b2.carts.every(c=>c.at==='camp'),'both wait at the empty camp');
  b2.store={stone:500};
  for(let i=0;i<60;i++)stepCarts(s2,data,change,()=>[0,0],()=>[0,300]);
  assert.equal(b2.carts.filter(c=>c.at==='out').length,1,'only one cart leaves');
  for(let i=0;i<oneWay+30;i++)stepCarts(s2,data,change,()=>[0,0],()=>[0,300]);
  assert.ok(b2.carts.every(c=>c.at!=='camp'),'the other follows a gap later');
}

// in the frontier: workers drop at a camp into its store; a full camp sends them to the hall; carts deliver; buy a 3rd
{
  const data=structuredClone(base);delete data.storage;data.settlements={};data.roads={};data.rates.food=0;data.rates.growthTicks=1e9;data.mood.reviewTicks=1e9;
  Object.assign(data.workers,{trainTicks:2,speed:20,harvestTicks:0,load:3});
  const spotData={seed:1,chunkSize:250,spots:[{id:'r',kind:'stone',x:1300,z:1000,pieces:[[0,0,0],[1,0,0]],deposit:null}],byChunk:{c5_4:['r']}};
  const state={tick:0},fr=createFrontier({state,data,spotData});
  fr.world.addTown({id:'t',name:'Test',owner:'p',region:null,x:1000,z:1000,pop:8,stock:{food:100,timber:500,stone:0,goods:500,ryo:100},buildings:[{type:'town_hall',cell:0},{id:'q1',type:'quarry',stage:'built'}]});
  const s=fr.world.settlement('t'),q=s.buildings.find(b=>b.type==='quarry');q.stage='built';q.cell=worldToCell(s,1300,1000);
  const send=c=>{fr.command({owner:'p'},{type:'frontier',town:'t',...c});return state.frontier.receipts.at(-1);};
  const run=n=>{for(let i=0;i<n;i++){state.tick++;fr.tick();}};
  assert.equal(send({action:'train',count:1}).ok,true);run(2);
  assert.equal(send({action:'assign',workers:[s.workers[0].id],spot:'r'}).ok,true);
  run(3000);
  const delivered=state.frontier.ledger.filter(l=>l.reason==='cart').reduce((n,l)=>n+l.delta,0);
  const direct=state.frontier.ledger.filter(l=>l.reason==='gather').reduce((n,l)=>n+l.delta,0);
  assert.ok(delivered>0,'carts brought stone home');
  assert.ok(Math.abs(s.stock.stone-(delivered+direct))<1e-6,'every unit ledgered');
  assert.ok((q.store?.stone||0)+s.stock.stone<=s.workers[0].deliveries*3+1e-6,'nothing made from nothing');
  q.store={stone:400};const before=state.frontier.ledger.filter(l=>l.reason==='gather').length;run(1300);
  assert.ok(state.frontier.ledger.filter(l=>l.reason==='gather').length>before || (q.store.stone||0)<400,'full camp: workers go to the hall');
  const t0=s.stock.timber;assert.equal(send({action:'buyCart',building:q.id}).ok,true);
  assert.equal(q.carts.length,3);assert.equal(s.stock.timber,t0-150);
  assert.equal(send({action:'buyCart',building:q.id}).ok,false,'max 3 carts');
  assert.equal(fr.world.checkInvariants(),true);
}
console.log('test_camp_carts: ok');
