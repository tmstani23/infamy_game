import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame} from '../src/sim/game.js';
import {setupMatch} from '../src/sim/setup_match.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json'),settings:{...read('data/settings.json'),dayNight:{auto:false}}});
const {heroId}=setupMatch(g,{clan:'yakuza',difficulty:'easy',bots:read('data/bots.json')}),st=g.state,h=st.entities[heroId],owner=h.owner;
for(const e of Object.values(st.entities)){if(e.owner!==owner)e.dead=true;e.holdFire=true;e.order={kind:'stop'};}
const s=st.deployment.sectors[0],task=st.deployment.clans[owner].sectors[s.id];
const spawn=()=>st.entities[g.spawn('thug','thug',s.anchor.x,s.anchor.z,{owner,deployment:{group:s.id},order:{kind:'stop'}})];
const crew=[spawn(),spawn(),spawn()];
const step=()=>{for(const e of Object.values(st.entities))if(e.guard||e.wild)e.dead=true;g.step();};
step();
assert.equal(task.patrolRoster.length,3,'patrol remembers its field roster');
for(let i=0;i<180;i++){step();assert.ok(Math.max(...crew.flatMap(a=>crew.map(b=>Math.hypot(a.x-b.x,a.z-b.z))))<5,'patrol travels as one compact group');}
const waypoint=task.patrolWaypoint;
crew[0].dead=true;step();
assert.equal(task.recovery?.home,true,'first patrol casualty recalls the survivors');assert.equal(task.recovery.required,3);
assert.equal(g.deployment.canOccupy(crew[1],st.deployment.sectors[1].anchor.x,st.deployment.sectors[1].anchor.z,'street'),false,'home retreat never grants player cross-sector orders');
const before=[crew[1].x,crew[1].z];for(let i=0;i<20;i++)step();
assert.notDeepEqual([crew[1].x,crew[1].z],before,'survivors physically travel home');
const attacker=st.entities[g.spawn('thug','thug',crew[1].x+.9,crew[1].z,{owner:Object.keys(st.clans).find(id=>id!==owner),deployment:{group:'hero'},order:{kind:'attack',target:crew[1].id},holdFire:false})];
let defended=false;for(let i=0;i<35;i++){step();defended||=st.hits.some(hit=>hit.t===attacker.id&&crew.slice(1).some(e=>e.id===hit.a));}
assert.ok(defended,JSON.stringify({crew:crew.slice(1).map(e=>({x:e.x,z:e.z,order:e.order,swing:e.swing,place:e.place})),attacker:{x:attacker.x,z:attacker.z,order:attacker.order,place:attacker.place},recovery:task.recovery}));attacker.dead=true;
for(let i=0;i<3000&&task.recovery?.state!=='Waiting for crew';i++)step();
assert.equal(task.recovery?.state,'Waiting for crew','healthy survivors wait at their hideout');
const home=Object.values(st.businesses).find(b=>b.hideout===owner);
assert.ok(crew.slice(1).every(e=>e.place===home.room));assert.equal(task.patrolWaypoint,waypoint,'route position is preserved');
for(let i=0;i<50;i++)step();assert.ok(task.recovery,'health alone cannot restart an understaffed patrol');
const replacement=spawn(),point=g.deployment.destination(replacement,s.id);assert.equal(point.place,home.room,'replacement transfer rendezvous is HQ, not a wasted round trip');Object.assign(replacement,point);
step();assert.equal(task.recovery?.returning,true,'replacement enables the physical return to patrol');
for(let i=0;i<3000&&task.recovery;i++)step();
assert.equal(task.recovery,undefined,'restaffed squad physically returns to its saved route');
const live=[crew[1],crew[2],replacement];assert.ok(live.every(e=>e.place==='street'&&g.deployment.sectorAt(e.x,e.z)===s.id));
assert.ok(live.every(e=>e.deployment.group===s.id),'home recovery never changes sector membership');
// Lost guarded businesses send real guards home and hold them for manual deployment.
const b=Object.values(st.businesses).find(b=>b.ring&&g.deployment.sectorAt(...b.ring)===s.id&&!b.hideout);
g.clans.setOwner(b.id,owner);task.task='guard';task.business=b.id;
for(const e of live)Object.assign(e,{place:b.room,x:g.rooms.find(r=>r.name===b.room).spawn.x,z:g.rooms.find(r=>r.name===b.room).spawn.z});
g.clans.setOwner(b.id,Object.keys(st.clans).find(id=>id!==owner));step();
assert.ok(live.every(e=>e.deployment.awaitingAssignment&&e.deployment.transfer?.to==='home'));
assert.equal(task.task,'patrol','sector retains an active default duty');
for(let i=0;i<3000&&live.some(e=>e.deployment.transfer);i++)step();
assert.ok(live.every(e=>e.deployment.group==='home'&&e.place===home.room));
for(let i=0;i<100;i++)step();assert.ok(live.every(e=>e.deployment.group==='home'),'lost-business guards are not immediately auto-redeployed');
assert.match(g.deployment.reserveStatus(live[0]),/waiting/i);
g.step([{id:heroId,type:'deployment',action:'transfer',units:[live[0].id],to:'hero'}]);
assert.equal(live[0].deployment.awaitingAssignment,undefined,'explicit transfer clears the waiting marker');
console.log('Assignment follow-up: cohesive roster, first-casualty physical home/replacement/resume loop, sector boundaries, lost-business guard return/manual waiting passed');
