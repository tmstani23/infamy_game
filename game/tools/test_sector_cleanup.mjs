import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame} from '../src/sim/game.js';
import {setupMatch} from '../src/sim/setup_match.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
function fixture(clan='yakuza'){
 const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json')});
 const {heroId}=setupMatch(g,{clan,difficulty:'easy',bots:read('data/bots.json')});
 for(const e of Object.values(g.state.entities))e.holdFire=true;
 const sector=g.state.deployment.sectors[0],sample={owner:'player',type:'thug',place:'street',deployment:{group:sector.id}},grid=g.deployment.navFor(sample),p=grid.nearestFree(sector.anchor.x,sector.anchor.z);
 const e=g.state.entities[g.spawn(clan==='shinobi'?'ninja':'thug',clan==='shinobi'?'ninja_grunt':'thug',...p,{owner:'player',deployment:{group:sector.id},order:{kind:'station',x:p[0],z:p[1],duty:true}})];
 const rival=Object.keys(g.state.clans).find(id=>id!=='player'&&g.state.clans[id].kind!=='ninja');
 const body=extra=>g.state.entities[g.spawn('thug','thug',p[0]+.5,p[1],{owner:rival,holdFire:true,...extra})];
 return {g,e,sector,heroId,body};
}
for(const clan of ['yakuza','kuroda','shinobi']){
 const {g,e,body,sector}=fixture(clan),t=body({downed:true,downedAt:0}),cash=body({dead:true,diedAt:0,loot:75});
 const before=g.state.clans.player.ryo;g.step();assert.equal(e.execute?.target,t.id,`${clan} sector auto-executes`);
 for(let n=0;n<110&&cash.loot;n++)g.step();assert.equal(t.dead,true);assert.equal(cash.loot,undefined,'nearby loot collected after execution');assert.ok(g.state.clans.player.ryo>=before+75);
 assert.equal(e.deployment.group,sector.id);assert.ok(!e.deployment.duty.manual);assert.equal(e.deployment.cleanup,undefined,'cleanup completes and returns to normal duty');
}
for(const busy of ['manual','recovery','ambush','transfer','rally','smoke']){
 const {g,e,body,sector,heroId}=fixture(),t=body({downed:true,downedAt:0}),task=g.state.deployment.clans.player.sectors[sector.id];
 if(busy==='manual')e.deployment.duty={manual:true,status:'Manual'};
 if(busy==='recovery'){e.hp=e.maxHp*.5;task.recovery={state:'Recovering',startedAt:0,replanAt:0};}
 if(busy==='ambush')task.operation={kind:'other',state:'Working'};
 if(busy==='transfer')g.step([{id:heroId,type:'deployment',action:'transfer',units:[e.id],to:'home'}]);
 if(busy==='rally')g.step([{id:heroId,type:'deployment',action:'rally',groups:[sector.id]}]);
 if(busy==='smoke'){e.holdFire=true;e.smokePassive=true;}
 g.step();assert.ok(!e.deployment.cleanup,`${busy} blocks opportunistic cleanup`);assert.ok(!e.execute,`${busy} is never interrupted by an execution`);
}
{
 const {g,e,body,heroId}=fixture(),t=body({downed:true,downedAt:0});g.step();assert.ok(e.execute);
 g.step([{id:heroId,type:'order',units:[e.id],kind:'move',place:'street',x:e.x+2,z:e.z}]);
 assert.ok(!e.execute&&!e.deployment.cleanup,'new manual order immediately cancels automatic work');
}
{
 const {g,e,body}=fixture();body({owner:'player',downed:true});body({type:'civilian',downed:true});body({type:'hero',downed:true});
 const unseen=body({downed:true,hidden:true});g.vision.canSee=(clan,t)=>t.owner===clan;
 g.step();assert.ok(!e.execute,'friendlies, civilians, heroes and unseen enemies are never auto-executed');
 assert.doesNotThrow(()=>JSON.stringify(g.state));
}
console.log('Sector cleanup: all clans execute/loot and resume, manual/recovery/ambush/transfer/Rally/smoke priorities, new-order interrupt and visibility/target safety passed');
