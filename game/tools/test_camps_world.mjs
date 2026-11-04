import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldCamps} from '../src/sim/camps.js';
import {createGame} from '../src/sim/game.js';
import {makeSave,loadSave} from '../src/sim/save.js';
import {createSnapshotEncoder} from '../src/sim_snapshot.js';
import {campPropsInChunk,findPropsInChunk,nodePropsInChunk,sitePropsInChunk,siteReport,featureTip} from '../src/world_features.js';
const data=f=>JSON.parse(readFileSync(new URL('../data/'+f+'.json',import.meta.url)));
const rules=data('bandits').worldCamps;
function fixture(saved=null) {
  const state=saved || {tick:0,match:{mode:'campaign'},clock:{day:1},clans:{p:{ryo:0},r:{ryo:0}},entities:{},news:[],ryoGains:[]};
  const world={camps:[{id:'K1',kind:'bandit',tier:1,x:100,z:100},{id:'K2',kind:'cache',tier:1,x:101,z:100}]};
  let loaded=true,next=1000;
  const ai={mind:{}},areas={activeIds:()=>loaded?['c0_0']:[],chunkOf:()=>[0,0],chunkId:(x,z)=>`c${x}_${z}`,nav:{nearestFree:(x,z)=>[x,z],clearLine:()=>true}};
  const module=createWorldCamps({state,world,areas,rules,ai,known:clan=>clan==='p',spriteFor:t=>t,
    spawn:(type,model,x,z,extra)=>{const id=String(next++);state.entities[id]={id,type,model,x,z,hp:120,maxHp:120,...extra};return id;},remove:id=>delete state.entities[id]});
  const run=()=>{state.tick++;module.tick();};
  const kill=(slot,owner='p')=>{const e=state.entities[slot.entity];module.defeated({owner},e);Object.assign(e,{dead:true,hp:0,diedAt:state.tick,loot:25,gearItem:'original-item'});};
  return {state,world,areas,ai,module,run,kill,setLoaded:v=>loaded=v,get rec(){return state.world?.camps.K1;}};
}
{
  const f=fixture();f.run();assert.equal(f.rec.members.length,rules.membersByTier[0].length);assert.ok(!f.state.world.camps.K2,'ruin/cache interaction is a separate checkpoint');
  const [a,b]=f.rec.members;const victim=f.state.entities[a.entity];f.kill(a);f.state.entities[b.entity].hp=31;
  f.setLoaded(false);f.run();assert.equal(Object.keys(f.state.entities).length,0);assert.equal(Object.keys(f.ai.mind).length,0,'sleeping camps have no AI');
  assert.equal(f.rec.cleared,false,'unloading a partial fight never clears a camp');
  const loaded=fixture(JSON.parse(JSON.stringify(f.state)));loaded.run();
  assert.equal(loaded.rec.members[0].dead,true,'casualties survive save/load while unloaded');
  assert.equal(loaded.state.entities[loaded.rec.members[1].entity].hp,31,'unloading cannot heal guards');
  const body=loaded.state.entities[loaded.rec.members[0].entity];assert.equal(body.loot,victim.loot);assert.equal(body.gearItem,'original-item','returning never rerolls body loot');
  loaded.kill(loaded.rec.members[1]);loaded.run();assert.equal(loaded.rec.cleared,true);assert.equal(loaded.rec.clearedDay,1);
  const bonus=rules.firstClearRyo;assert.equal(loaded.state.clans.p.ryo,bonus);assert.equal(loaded.rec.claimed,true);
  loaded.setLoaded(false);loaded.run();loaded.setLoaded(true);loaded.run();assert.equal(loaded.state.clans.p.ryo,bonus,'no repeat claim on reload');
  const again=fixture(JSON.parse(JSON.stringify(loaded.state)));again.state.clock.day=5;again.run();assert.equal(again.rec.cleared,true,'not before five full days');
  again.state.clock.day=6;again.run();assert.equal(again.rec.cleared,false);assert.equal(again.rec.generation,1);assert.equal(again.rec.claimed,true);
  for(const slot of again.rec.members)again.kill(slot,'r');again.run();assert.equal(again.state.clans.r.ryo,rules.repeatClearRyo,'another clan cannot take the first-clear bonus twice');
  assert.equal(again.state.clans.p.ryo,bonus);
  const view=again.module.viewFor('p');assert.deepEqual(Object.keys(view.K1).sort(),['claimed','cleared','clearedDay']);assert.deepEqual(again.module.viewFor('r'),{},'unknown camps and saved guard inventories stay private');
}
{
  const f=fixture();f.state.match.mode='classic';f.run();assert.equal(f.state.world,undefined,'Classic does not initialize island camps');
}
const world=data('world'),markers=[];
for(let z=0;z<world.size.h;z+=250)for(let x=0;x<world.size.w;x+=250)markers.push(...campPropsInChunk(world,x,z,250));
assert.equal(markers.length,28);assert.equal(new Set(markers.map(p=>p.feature)).size,28,'one decorative campfire per authored bandit camp');
for(const p of markers){const c=world.camps.find(c=>c.id===p.feature);assert.equal(p.x,c.x);assert.equal(p.z,c.z);}

// W4.3: every node and every unclaimed site is dressed once, from props that exist; founded sites get none.
{
  const nodes=[],sites=[],claimed=[];
  for(let z=0;z<world.size.h;z+=250)for(let x=0;x<world.size.w;x+=250){nodes.push(...nodePropsInChunk(world,x,z,250));sites.push(...sitePropsInChunk(world,x,z,250));claimed.push(...sitePropsInChunk(world,x,z,250,['S01']));}
  assert.equal(new Set(nodes.map(p=>p.feature)).size,world.nodes.length,'every node has markers');
  assert.equal(new Set(sites.map(p=>p.feature)).size,world.sites.length,'every site has a survey flag');
  assert.equal(claimed.length,sites.length-3,'a founded site loses its flag');
  const art=data('art');for(const p of [...nodes,...sites])assert.ok(p.kind in {fallen_log:1,stump:1,boulder:1,small_rocks:1,bush:1,ferns:1,bamboo:1}||art.items[p.kind],'existing art: '+p.kind);
  const site=world.sites[7],rep=siteReport(world,site),near=world.nodes.filter(n=>Math.hypot(n.x-site.x,n.z-site.z)<=600);
  assert.equal(Object.values(rep.nodes).reduce((a,b)=>a+b,0),near.length,'scouting report counts the nodes within 600');
  assert.equal(rep.camp.distance,Math.round(Math.min(...world.camps.filter(c=>c.kind==='bandit').map(c=>Math.hypot(c.x-site.x,c.z-site.z)))),'nearest bandit camp');
  assert.deepEqual(nodePropsInChunk(world,0,0,14000).map(p=>[p.x,p.z]),nodePropsInChunk(world,0,0,14000).map(p=>[p.x,p.z]),'deterministic');
}

{
  const finds=[];for(let z=0;z<world.size.h;z+=250)for(let x=0;x<world.size.w;x+=250)finds.push(...findPropsInChunk(world,x,z,250));
  assert.equal(finds.length,24,'every ruin and cache has a landmark');assert.ok(finds.every(p=>data('art').items[p.art]),'landmark art exists');
}

{
  const k=world.camps.find(c=>c.kind==='bandit'),r=world.camps.find(c=>c.kind==='ruin'),n=world.nodes[0],t=world.sites[0];
  const a=featureTip('camp',k,{rules,camps:{}}),b=featureTip('camp',k,{rules,camps:{[k.id]:{cleared:true,clearedDay:2,claimed:true}}});
  assert.ok(a.title.includes('no. '+parseInt(k.id.slice(1)))&&!a.title.includes(k.id)&&a.lines.includes('Guarded')&&a.lines.some(l=>l.includes('first clear')));assert.ok(b.lines[1].includes('day 2')||b.lines[0].includes('day 2')||b.lines.some(l=>l.includes('Cleared on day 2')));
  assert.ok(featureTip('camp',r).title.startsWith('Ruin'));assert.ok(featureTip('node',n).title.length&&featureTip('site',t,{scouted:[]}).lines[1].includes('Not scouted'));
  assert.ok(featureTip('site',t,{scouted:[t.id]}).lines[0].includes('Soil'));
}

// Real game/AI, navigation, save encoder and per-clan snapshots. No graphics/test URL switch.
const options={district:data('waterfront'),catalog:data('art'),cutouts:JSON.parse(readFileSync(new URL('../art/cutouts.json',import.meta.url))),
  interiors:data('interiors'),parts:data('interior_parts'),recipes:data('room_recipes'),units:data('units'),bandits:data('bandits'),world,
  worldChunks:{...data('world_chunks'),loadRadius:0,props:{}}};
const g=createGame(options);g.clans.addClan('player');g.clans.addClan('rival');g.state.match={mode:'campaign'};g.state.clock={day:1,left:1e9};
const camp=world.camps.filter(c=>c.kind==='bandit').sort((a,b)=>Math.hypot(a.x-world.capital.x,a.z-world.capital.z)-Math.hypot(b.x-world.capital.x,b.z-world.capital.z))[0];
const hero=g.spawn('hero','ronin',camp.x+5,camp.z,{owner:'player',place:'world',area:'world',holdFire:true});
g.step();const rec=g.state.world.camps[camp.id];assert.ok(rec);assert.ok(rec.members.every(m=>g.state.entities[m.entity]?.worldCamp),'active real camp spawns bandits');
assert.ok(rec.members.every(m=>g.bandits.mind[m.entity]?.camp===camp.id),'residents use existing bandit AI');
g.state.entities[hero].place='street';g.state.entities[hero].area='street';g.state.entities[hero].x=-8;g.state.entities[hero].z=1;g.step();
assert.equal(g.areas.activeIds().length,0,'guards never keep their own chunks awake');assert.ok(rec.members.every(m=>!m.entity),'guards suspend when expedition leaves');
const saved=makeSave(g),fresh=createGame(options);loadSave(fresh,JSON.parse(JSON.stringify(saved)));fresh.step();
assert.equal(Object.values(fresh.state.entities).filter(e=>e.worldCamp).length,0,'loaded dormant camp remains dormant');
const h=fresh.state.entities[hero];Object.assign(h,{place:'world',area:'world',x:camp.x+5,z:camp.z});fresh.step();
const resumed=fresh.state.world.camps[camp.id];assert.ok(resumed.members.every(m=>fresh.state.entities[m.entity]?.worldCamp));
for(const slot of resumed.members){const e=fresh.state.entities[slot.entity];fresh.worldCamps.defeated(h,e);Object.assign(e,{dead:true,hp:0,diedAt:fresh.state.tick});}
fresh.step();assert.equal(resumed.cleared,true);
fresh.state.world.discovered.player='1'.repeat(fresh.discovery.cols*fresh.discovery.rows);
const packet=createSnapshotEncoder(fresh,'player').encode({map:true}),snapshot=packet.set.find(([k])=>k==='s:world')[1];
assert.deepEqual(snapshot.camps[camp.id],{cleared:true,clearedDay:1,claimed:true});assert.equal(snapshot.camps[camp.id].members,undefined);
console.log('test_camps_world: persistence, wounds/loot, five-day return, claims, dormancy, real AI/save and privacy passed');
