import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {createGame} from '../src/sim/game.js';
import {setupMatch} from '../src/sim/setup_match.js';
import {createWorkerRuntime} from '../src/sim_worker_runtime.js';
import {createSnapshotEncoder,applySnapshot} from '../src/sim_snapshot.js';
import {createSimWorkerClient} from '../src/sim_worker_client.js';

const data=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url)));
const options={district:data('data/port_town.json'),catalog:data('data/art.json'),cutouts:data('art/cutouts.json'),
  interiors:data('data/interiors.json'),parts:data('data/interior_parts.json'),recipes:data('data/room_recipes.json'),
  units:data('data/units.json'),civilians:data('data/civilians.json'),bandits:data('data/bandits.json'),
  police:data('data/police.json'),settings:data('data/settings.json')};
const match={clan:'shinobi',difficulty:'easy',bots:data('data/bots.json'),spawns:options.district.spawns,test:{}};
let time=0,messages=[];
const runtime=createWorkerRuntime({now:()=>time,post:m=>messages.push(structuredClone(m))});
runtime.receive({type:'init',options,match});
const mirror=createGame(options),{heroId}=setupMatch(mirror,match);
const consume=()=>{const packets=messages.filter(m=>m.type==='snapshot');messages=[];
  for(const m of packets){applySnapshot(mirror,m.packet);runtime.receive({type:'ack',sequence:m.packet.sequence});}return packets;};
consume();
assert.equal(mirror.state.clans.player.kind,'ninja');
const refs={deployment:mirror.state.deployment,contracts:mirror.state.contracts,clans:mirror.state.clans};
runtime.receive({type:'input',map:true,paused:false,selected:[]});consume();
const initial=runtime.game.state.tick;
for(let i=0;i<20;i++){time+=50;runtime.pump();consume();}
assert.equal(runtime.game.state.tick-initial,20,'worker sim runs at20Hz in map mode');
assert.equal(mirror.state.deployment,refs.deployment,'helper deployment reference retained');
assert.equal(mirror.state.contracts,refs.contracts,'helper contract reference retained');
assert.equal(mirror.state.clans,refs.clans);
assert.deepEqual(mirror.deployment.counts('player'),runtime.game.deployment.counts('player'));
assert.deepEqual(mirror.rally.status('player'),runtime.game.rally.status('player'));
assert.equal(mirror.territory.score('player'),runtime.game.territory.score('player'));

// No cumulative packet backlog if the screen stops acknowledging: sim advances.
time+=250;runtime.pump();const before=runtime.game.state.tick;
for(let i=0;i<12;i++){time+=50;runtime.pump();}
assert.equal(messages.filter(m=>m.type==='snapshot').length,1);
assert.equal(runtime.game.state.tick-before,12);consume();
runtime.receive({type:'input',paused:true,map:true});consume();
const frozen=runtime.game.state.tick;
time+=500;runtime.pump();consume();assert.equal(runtime.game.state.tick,frozen);
runtime.receive({type:'input',paused:false,map:false,movement:{id:heroId,type:'move',right:1,down:0}});consume();
for(let i=0;i<4;i++){time+=50;runtime.pump();consume();}
assert.equal(runtime.game.state.tick,frozen+4,'resume has no paused-time catch-up');
assert.ok(mirror.state.projectiles,'world-only fields restored');
// Discrete commands queued while paused execute once and in order on resume.
runtime.receive({type:'input',paused:true,map:true,commands:[{type:'time'},{type:'time'}]});consume();
time+=100;runtime.pump();consume();
const day=runtime.game.state.clock.day,night=runtime.game.state.night;
runtime.receive({type:'input',paused:false,map:true});consume();
for(let i=0;i<8;i++){time+=50;runtime.pump();consume();}
assert.equal(runtime.game.state.clock.day,day+1);assert.equal(runtime.game.state.night,night);

// Map projection excludes unobserved positions/private state and drops particles.
const enemy=Object.values(runtime.game.state.entities).find(e=>e.type==='hero'&&e.owner!=='player');
enemy.hidden=true;enemy.x=12345;
runtime.game.state.casts.push({kind:'secret'});
const enc=createSnapshotEncoder(runtime.game),p=enc.encode({map:true});
const rec=new Map(p.set);
assert.equal(rec.get('e:'+enemy.id).x,undefined);
assert.equal(rec.get('e:'+enemy.id).order,undefined);
assert.deepEqual(Object.keys(rec.get('s:deployment').clans),['player']);
assert.equal(rec.has('s:projectiles'),false);
const again=enc.encode({map:true});assert.equal(again.set.length,0);assert.equal(again.grid.length,0);
const fog=mirror.vision.grid('player'),authority=runtime.game.vision.grid('player');
assert.deepEqual(fog.explored,authority.explored);

// Real Node worker uses the browser entry module and actual structured cloning.
const worker=new Worker(new URL('./worker_test_bridge.mjs',import.meta.url));
try{
  let last=0,packets=0;
  const ready=new Promise((resolve,reject)=>{
    worker.on('error',reject);
    worker.on('message',m=>{
      if(m.type==='fatal')reject(new Error(m.message+'\n'+m.stack));
      if(m.type==='snapshot'){
        assert.ok(m.packet.sequence>last);last=m.packet.sequence;packets++;
        worker.postMessage({type:'ack',sequence:last});
        if(packets===1){worker.postMessage({type:'input',paused:false,map:true});}
        if(m.packet.tick>=5)resolve(m);
      }
    });
  });
  worker.postMessage({type:'init',options,match});
  let timeout;
  const result=await Promise.race([ready,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('worker timeout')),15000);})]).finally(()=>clearTimeout(timeout));
  assert.equal(result.packet.map,true);assert.ok(result.diagnostics.simMs>0);
}finally{await worker.terminate();}
console.log('Worker lifecycle, pause/resume, backpressure, projection, replica queries and real transport passed');

// Exercise the actual client/ack/apply path too, not only a hand-written receiver.
const clientMirror=createGame(options);setupMatch(clientMirror,match);
const client=await createSimWorkerClient({game:clientMirror,options,match,workerFactory:()=>{
  const w=new Worker(new URL('./worker_test_bridge.mjs',import.meta.url));
  const adapter={postMessage:m=>w.postMessage(m),terminate:()=>w.terminate()};
  w.on('message',data=>adapter.onmessage?.({data}));w.on('error',e=>adapter.onerror?.(e));return adapter;
}});
try{
  let timeout;
  const updated=new Promise((resolve,reject)=>{
    timeout=setTimeout(()=>reject(new Error('client timeout')),10000);
    client.observe(stage=>{if(stage==='after'&&client.map&&clientMirror.state.tick>=3)resolve();});
  });
  client.input({map:true,paused:false});
  await updated.finally(()=>clearTimeout(timeout));
  assert.equal(client.map,true);assert.ok(client.diagnostics().applyMs>=0);
}finally{client.dispose();}
console.log('Actual client startup, replica application and acknowledgments passed');

// Modest synthetic full-roster protocol cost, not a browser FPS benchmark.
const g=runtime.game;
for(const [owner,c] of Object.entries(g.state.clans)){
  const h=Object.values(g.state.entities).find(e=>e.owner===owner&&e.type==='hero');
  for(let i=0;i<20;i++)g.spawn(c.kind==='ninja'?'ninja':'thug',c.kind==='ninja'?'ninja':'thug',h.x+i*.1,h.z,{owner});
}
for(const map of [false,true]){
  const encoder=createSnapshotEncoder(g);encoder.encode({map});
  let encodeMs=0,cloneMs=0,applyMs=0,bytes=0;
  for(let i=0;i<100;i++){
    g.state.tick++;
    for(const e of Object.values(g.state.entities))if(!e.dead&&e.place==='street')e.x+=.001;
    let start=performance.now();const packet=encoder.encode({map});encodeMs+=performance.now()-start;
    start=performance.now();const copy=structuredClone(packet);cloneMs+=performance.now()-start;
    start=performance.now();applySnapshot(mirror,copy);applyMs+=performance.now()-start;
    bytes+=Buffer.byteLength(JSON.stringify({...packet,grid:undefined}))+packet.grid.byteLength;
  }
  console.log(`${map?'Map4Hz':'World20Hz'} snapshot, ${Object.keys(g.state.entities).length} entities: encode ${(encodeMs/100).toFixed(3)}ms, clone ${(cloneMs/100).toFixed(3)}ms, apply ${(applyMs/100).toFixed(3)}ms, ${(bytes/100/1024).toFixed(1)}KiB/packet`);
}
