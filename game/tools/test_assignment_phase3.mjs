import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame} from '../src/sim/game.js';
import {setupMatch} from '../src/sim/setup_match.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
function make(clan='shinobi'){
  const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json'),settings:{...read('data/settings.json'),dayNight:{auto:false}}});
  const {heroId}=setupMatch(g,{clan,difficulty:'easy',bots:read('data/bots.json')}),st=g.state,h=st.entities[heroId];
  for(const e of Object.values(st.entities)){if(e.id!==h.id)e.dead=true;e.order={kind:'stop'};e.holdFire=true;}
  const s=st.deployment.sectors[0],task=st.deployment.clans[h.owner].sectors[s.id];
  const spawn=(type='ninja',group=s.id,x=s.anchor.x,z=s.anchor.z)=>st.entities[g.spawn(type,type,x,z,{owner:h.owner,deployment:{group},order:{kind:'stop'}})];
  const step=()=>{for(const e of Object.values(st.entities))if(e.guard||e.wild)e.dead=true;g.step();};
  return {g,st,h,s,task,spawn,step};
}
{
  const {g,st,h,s,task,spawn,step}=make(),team=[spawn(),spawn('ninja_tanto'),spawn('shinobi_enforcer')];
  const own=st.deployment.clans[h.owner];
  own.targets={unseen:{id:'unseen',owner:'rival',type:'hero',seenAt:0}};
  g.shinobiAssignments.command(h,{action:'armAmbush',target:'unseen'});
  const start=team.map(e=>[e.x,e.z]);let spread=0,travel=0;
  for(let i=0;i<400;i++){
    step();
    spread=Math.max(spread,...team.flatMap(a=>team.map(b=>Math.hypot(a.x-b.x,a.z-b.z))));
    travel=Math.max(travel,...team.map((e,k)=>Math.hypot(e.x-start[k][0],e.z-start[k][1])));
    for(const e of team)assert.ok(g.deployment.patrolAllowed(e.x,e.z),'hunt travel remains on public patrol ground');
  }
  assert.ok(travel>5,'waiting hunters physically patrol instead of idling');
  assert.ok(spread<5,`hunters stay together (${spread})`);
  assert.equal(own.hunt.target,'unseen');assert.equal(task.operation,undefined,'waiting hunt never substitutes an unrelated victim');
  // A lagging crewman arrests group progress rather than being abandoned.
  const lead=team[0],lag=team[2];lag.x=s.anchor.x;lag.z=s.anchor.z;
  const before=[lead.x,lead.z];g.shinobiAssignments.step(lead,g.stats.base(lead));
  assert.deepEqual([lead.x,lead.z],before,'leader waits for a distant follower');
  // Every hunter assists a nearby mate being attacked, even before commitment.
  const foe=st.entities[g.spawn('thug','thug',lead.x+.9,lead.z,{owner:Object.keys(st.clans).find(id=>id!==h.owner),deployment:{group:'hero'},order:{kind:'attack',target:lead.id},holdFire:false})];
  team[1].x=lead.x;team[1].z=lead.z+.8;lead.hitBy={id:foe.id,tick:st.tick};
  let assisted=false;for(let i=0;i<40;i++){step();assisted||=st.hits.some(hit=>hit.a===team[1].id&&hit.t===foe.id);}
  assert.ok(assisted,'waiting hunters defend their squad');
  assert.equal(own.hunt.target,'unseen');assert.equal(task.operation,undefined,'defending against another enemy never replaces the selected hunt identity');
  console.log(`Hunt: 400 real-map ticks, ${travel.toFixed(1)} steps travel, ${spread.toFixed(2)} max spread, road-safe cohesion and mate assistance passed`);
}
for(const duty of ['watch','ambush']){
  const {g,st,h,task,spawn,step}=make();task.task=duty;
  const team=[spawn(),spawn(),spawn()];step();
  team[0].downed=true;step();
  assert.equal(task.recovery?.home,true,`${duty} first casualty sends survivors to HQ`);
  assert.equal(task.recovery.required,3);
  for(let i=0;i<3000&&task.recovery?.state!=='Waiting for crew';i++)step();
  assert.equal(task.recovery?.state,'Waiting for crew');
  const replacement=spawn(),point=g.deployment.destination(replacement,replacement.deployment.group);Object.assign(replacement,point);
  step();assert.equal(task.recovery.returning,true);
  for(let i=0;i<3000&&task.recovery;i++)step();
  assert.equal(task.recovery,undefined);assert.equal(task.task,duty,'saved assignment survives HQ replacement loop');
}
{
  const {g,st,h,s,task,spawn,step}=make('yakuza');
  const b=Object.values(st.businesses).find(b=>b.room&&!b.hideout&&g.deployment.sectorAt(...b.ring)===s.id);g.clans.setOwner(b.id,h.owner);
  task.task='guard';task.business=b.id;const room=g.rooms.find(r=>r.name===b.room),point=room.spawn;
  const team=[spawn('thug'),spawn('thug'),spawn('thug')];for(const e of team)Object.assign(e,{...point,place:b.room});
  team[0].downed=true;team[1].downed=true;const survivor=team[2];survivor.hp=20;
  const foe=st.entities[g.spawn('thug','thug',point.x+.9,point.z,{owner:Object.keys(st.clans).find(id=>id!==h.owner),place:b.room,hp:10000,maxHp:10000,deployment:{group:'hero'},order:{kind:'attack',target:survivor.id}})];
  let defended=false;
  for(let i=0;i<120&&!survivor.downed&&!survivor.dead;i++){
    const before=[survivor.x,survivor.z];step();defended||=st.hits.some(hit=>hit.a===survivor.id&&hit.t===foe.id);
    assert.equal(task.recovery,undefined,'ordinary Guard does not retreat after casualties or at low health');
    assert.equal(survivor.deployment.transfer,undefined);assert.equal(survivor.place,b.room);
    assert.ok(Math.hypot(survivor.x-before[0],survivor.z-before[1])<1,'Guard never teleports out of the fight');
  }
  assert.ok(defended,'last Guard survivor fights the attacker');assert.ok(survivor.downed||survivor.dead,'Guard holds the business until defeated');
}
{
  const {g,st,h,s,task,spawn,step}=make();task.task='guard';
  const team=[spawn(),spawn(),spawn()];
  team[0].downed=true;team[1].downed=true;team[2].hp=30;team[2].hitAt=st.tick;step();
  assert.equal(task.recovery,undefined,'guard assignment never triggers generic casualty retreat');
  // Hero-group bodyguard stays with the idle squad even while a hunt is armed.
  const p=g.nav.nearestFree(s.anchor.x,s.anchor.z);Object.assign(h,{x:p[0],z:p[1],place:'street'});
  const bodyguard=spawn('shinobi_enforcer','hero',h.x+1.5,h.z);
  g.step([{id:h.id,type:'order',kind:'follow',units:[bodyguard.id]}]);
  st.deployment.clans[h.owner].hunt={target:'unseen',armedAt:st.tick};
  for(let i=0;i<300;i++)step();
  assert.equal(bodyguard.order.kind,'follow');assert.ok(Math.hypot(bodyguard.x-h.x,bodyguard.z-h.z)<2.5);
  const mate=spawn('ninja','hero',h.x-.8,h.z),rival=Object.keys(st.clans).find(id=>id!==h.owner);
  st.clans[rival].kind='ninja';
  for(const departure of ['defeated','concealed']){
    g.step([{id:h.id,type:'order',kind:'follow',units:[bodyguard.id,mate.id]}]);
    for(const e of [bodyguard,mate])e.revealUntil=st.tick+1000;
    const point=g.nav.nearestFree(h.x+3,h.z);
    const foe=st.entities[g.spawn('ninja','ninja',...point,{owner:rival,hp:10000,maxHp:10000,revealUntil:st.tick+1000,deployment:{group:'hero'},order:{kind:'attack',target:mate.id}})];
    const began=st.tick;let taunted=false;
    for(let i=0;i<120&&!taunted;i++){step();taunted=bodyguard.taunt?.target===foe.id&&bodyguard.taunt.startedAt>=began;}
    assert.ok(taunted,`bodyguard actually enters taunt/retaliation before foe is ${departure}`);
    foe.order={kind:'stop'};foe.holdFire=true;delete foe.taunted;delete foe.swing;
    if(departure==='defeated'){foe.dead=true;foe.diedAt=st.tick;}
    else{foe.buffs={veil:{until:st.tick+1000}};foe.hidden=true;}
    let settled=0;
    for(let i=0;i<300;i++){step();if(i>=240)settled=Math.max(settled,Math.hypot(bodyguard.x-h.x,bodyguard.z-h.z));}
    assert.equal(bodyguard.order.kind,'follow',`${departure} target does not strand a stale attack order`);
    assert.equal(bodyguard.swing,undefined);assert.ok(settled<2.5,`${departure} target: bodyguard settles back with the idle hero (${settled})`);
    foe.dead=true;
  }
}
console.log('Watch/Ambush HQ casualty/replacement/resume, Guard no-retreat and hero bodyguard idle/taunt/foe-death/concealment follow recovery passed');
