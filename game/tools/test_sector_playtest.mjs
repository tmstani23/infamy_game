import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame} from '../src/sim/game.js';
import {setupMatch} from '../src/sim/setup_match.js';
import {sectorPatrolRoute} from '../src/sim/sector_patrol.js';
import {createContractMenu} from '../src/contract_menu.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
function make(clan){const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json')});const {heroId}=setupMatch(g,{clan,difficulty:'easy',bots:read('data/bots.json')});for(const e of Object.values(g.state.entities))e.holdFire=true;return {g,heroId,h:g.state.entities[heroId]};}
{
 const {g}=make('yakuza'),s=g.state.deployment.sectors[0];
 const e=g.state.entities[g.spawn('thug','thug',s.anchor.x,s.anchor.z,{owner:'player',deployment:{group:s.id}})],task=g.state.deployment.clans.player.sectors[s.id];
 const route=sectorPatrolRoute(g.state,g.deployment,e,task);
 assert.ok(route.every(p=>g.deployment.patrolAllowed(p.x,p.z)),'all generated waypoints are in town or on roads');
 assert.ok(route.length>=4);assert.ok(Math.max(...route.map(p=>p.x))-Math.min(...route.map(p=>p.x))>20,'route spans sector width');
 assert.ok(Math.max(...route.map(p=>p.z))-Math.min(...route.map(p=>p.z))>20,'route spans sector depth');
 assert.equal(sectorPatrolRoute(g.state,g.deployment,e,task),route,'route stays stable between updates');
 let walking=false;for(let i=0;i<100;i++){g.step();walking ||= e.anim==='walk';assert.notEqual(e.anim,'run');}assert.ok(walking);
}
{
 const {g,heroId}=make('yakuza');g.step();
 const zone=g.state.hqCamping.zones.find(z=>z.owner!=='player'&&g.state.deployment.sectors.some(s=>s.id===g.deployment.sectorAt(z.x,z.z)));
 const id=g.deployment.sectorAt(zone.x,zone.z),sample={owner:'player',type:'thug',place:'street',deployment:{group:id}},p=g.deployment.navFor(sample).nearestFree(zone.x+2,zone.z);
 const e=g.state.entities[g.spawn('thug','thug',...p,{owner:'player',deployment:{group:id}})];
 g.state.hqCamping.visits=[{...zone,clan:'player',inside:true,seconds:20,active:false}];g.step();
 assert.ok(e.deployment.campingEscape,'autonomous assigned crew withdraw at warning');
 for(let i=0;i<180;i++)g.step();assert.ok(Math.hypot(e.x-zone.x,e.z-zone.z)>zone.radius);assert.equal(g.state.clans.player.heat,0);
 g.step([{id:heroId,type:'order',kind:'move',place:'street',units:[e.id],x:zone.x,z:zone.z}]);
 assert.equal(e.deployment.duty.manual,true,'explicit manual orders retain player control');
}
{
 const {g,heroId,h}=make('shinobi'),boss=Object.values(g.state.entities).find(e=>e.type==='hero'&&e.owner!==h.owner);
 boss.hidden=true;
 g.state.contracts.active[h.owner]={kind:'boss',hero:boss.id,target:boss.owner,label:'Boss job',renown:40,ryo:400};
 const element=()=>({handlers:{},addEventListener(k,fn){this.handlers[k]=fn;}}),panel=element(),tracker=element(),sent=[];
 const menu=createContractMenu({panel,tracker,game:g,heroId,send:c=>sent.push(c)});
 menu.update();tracker.handlers.click({target:{closest:()=>true},stopPropagation(){}});
 assert.equal(sent[0].action,'armAmbush');assert.equal(sent[0].target,boss.id);
 g.step(sent);assert.equal(g.state.deployment.clans[h.owner].hunt.target,boss.id,'contract button arms without prior manual boss selection');
 menu.update();assert.match(tracker.innerHTML,/waiting for a local sighting/);assert.match(tracker.innerHTML,/Cancel boss hunt/);
}
console.log('Sector playtest fixes: stable broad walking routes, automatic HQ warning escape/manual override, contract hunt without prior target selection passed');

{
 const {g}=make('yakuza'),s=g.state.deployment.sectors[0],task=g.state.deployment.clans.player.sectors[s.id];
 const u=g.state.entities[g.spawn('thug','thug',s.anchor.x,s.anchor.z,{owner:'player',holdFire:true,smokePassive:true,deployment:{group:s.id,duty:{manual:false,pauseUntil:g.state.tick+100}},order:{kind:'stop'}})];
 const rival=Object.keys(g.state.clans).find(id=>id!=='player');
 const foe=g.state.entities[g.spawn('thug','thug',u.x+1,u.z,{owner:rival,holdFire:true,hp:10000,maxHp:10000,deployment:{group:'hero'},order:{kind:'stop'}})];
 let attacked=false;
 for(let i=0;i<35;i++){g.step();attacked ||= g.state.hits.some(h=>h.a===u.id&&h.t===foe.id);}
 assert.equal(u.holdFire,undefined);assert.equal(u.smokePassive,undefined);assert.ok(attacked,'autonomous patrol with stale passivity defends even at a waypoint pause');
}
{
 const {g,h,heroId}=make('kuroda'),b=Object.values(g.state.businesses).find(b=>b.kind==='teahouse'&&!b.hideout);
 g.clans.setOwner(b.id,'player');
 const door=g.doors.find(d=>d.to&&!d.ninja&&d.place===b.room),p=g.nav.nearestFree(door.x-16,door.z);
 const crew=g.state.entities[g.spawn('spearman','kuroda_spearman',...p,{owner:'player',deployment:{group:'hero'},order:{kind:'move',x:p[0],z:p[1],arrived:true}})];
 g.step([{id:heroId,type:'deployment',action:'rally',groups:['hero']}]);assert.ok(g.rally.participating(crew));
 Object.assign(h,{x:door.x,z:door.z,place:'street'});g.step([{id:heroId,type:'use',units:[crew.id]}]);
 assert.equal(h.place,b.room);assert.equal(crew.order.kind,'follow','rallied stragglers follow through the hero raid entry');
 for(let i=0;i<300&&crew.place!==b.room;i++)g.step();assert.equal(crew.place,b.room,'straggler physically reaches and enters the door');
 Object.assign(crew,{place:'street',x:door.x,z:door.z});
 g.step([{id:heroId,type:'order',kind:'follow',units:[crew.id]}]);assert.equal(crew.place,b.room,'Follow recalls a street crewman while hero is inside');
}
