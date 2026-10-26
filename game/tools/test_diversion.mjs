import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { storedDeployment, restoredDeployment } from '../src/sim/deployment.js';
import { DIVERSION } from '../src/sim/diversion.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url))),units=read('data/units.json'),art=read('data/art.json');
for(const t of Object.values(units.types)){t.dodgeChance=0;t.critChance=0;}
for(const entry of Object.values(art.characters.shinobi_geisha)){const file=typeof entry==='string'?entry:entry.file;assert.ok(existsSync(new URL(`../../assets/sprites/${file}.png`,import.meta.url)));}
const g=createGame({district:read('data/port_town.json'),catalog:art,cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units,settings:{...read('data/settings.json'),dayNight:{auto:false}}});
const {heroId}=setupMatch(g,{clan:'shinobi',difficulty:'easy',bots:read('data/bots.json')});
const st=g.state,h=st.entities[heroId],rival=Object.keys(st.clans).find(id=>id!=='player'&&st.clans[id].kind!=='ninja'),enemyHero=Object.values(st.entities).find(e=>e.owner===rival&&e.type==='hero');
for(const e of Object.values(st.entities)){e.holdFire=true;if(e.type!=='hero')e.order={kind:'stop'};}
assert.notEqual(g.clans.hirePrice('player','shinobi_geisha'),null);assert.equal(g.clans.hirePrice(rival,'shinobi_geisha'),null);
const dojo=Object.values(st.businesses).find(b=>b.kind==='dojo'),count=g.clans.crewCount('player');h.place=dojo.room;st.clans.player.ryo=5000;
g.step([{id:heroId,type:'hire',business:dojo.id,unit:'shinobi_geisha'}]);
for(let i=0;i<170;i++)g.step();
const recruit=Object.values(st.entities).find(e=>e.type==='shinobi_geisha'&&e.owner==='player');
assert.ok(recruit);assert.equal(g.clans.crewCount('player'),count+1);assert.notEqual(recruit.order?.kind,'follow');recruit.deployment.keepAtHQ=true;
const sector=st.deployment.sectors[0],task=st.deployment.clans.player.sectors[sector.id];
const actor=st.entities[g.spawn('shinobi_geisha','shinobi_geisha',sector.anchor.x,sector.anchor.z,{owner:'player',deployment:{group:sector.id}})];
const idle=st.entities[g.spawn('thug','thug',sector.anchor.x+3,sector.anchor.z,{owner:rival,deployment:{group:'hero'},order:{kind:'stop'},holdFire:true})];
const busy=st.entities[g.spawn('thug','thug',sector.anchor.x+4,sector.anchor.z,{owner:rival,deployment:{group:'hero'},order:{kind:'attack',target:actor.id},holdFire:true})];
const send=c=>g.step([{id:heroId,type:'deployment',...c}]);
send({action:'assignment',sector:sector.id,task:'diversion',objective:sector.anchor,fallback:sector.anchor});
send({action:'dance',sector:sector.id});assert.equal(task.operation.state,'Dancing');
assert.equal(idle.distracted,undefined,'visible warning precedes attraction');
const until=task.operation.endsAt;assert.equal(until-task.operation.warningUntil,DIVERSION.durationTicks);
let warned=st.news.some(n=>n.kind==='diversionWarning'&&n.clan===rival);
for(let i=0;i<DIVERSION.warningTicks+3;i++){g.step();if(st.news.some(n=>n.kind==='diversionWarning'&&n.clan===rival))warned=true;}
assert.ok(idle.distracted?.source===actor.id);assert.equal(busy.distracted,undefined,'active attackers are immune');
assert.ok(warned,'the affected clan sees a warning before attraction');
assert.equal(h.distracted,undefined,'heroes are never controlled');
g.step([{id:enemyHero.id,type:'order',kind:'stop',place:'street',units:[idle.id]}]);
assert.equal(idle.distracted,undefined,'manual enemy command breaks attraction immediately');assert.ok(idle.diversionImmuneUntil>st.tick);
const other=st.entities[g.spawn('thug','thug',actor.x+2,actor.z,{owner:rival,deployment:{group:'hero'},order:{kind:'stop'},holdFire:true})];
g.step();assert.equal(other.distracted?.source,actor.id);
const striker=st.entities[g.spawn('thug','thug',actor.x+.5,actor.z,{owner:rival,deployment:{group:'hero'},order:{kind:'stop'},holdFire:true})];
striker.swing={start:st.tick,strike:st.tick,len:8,target:actor.id};g.step();
assert.ok(['Escaping','Returning'].includes(task.operation.state),'hitting dancer interrupts the channel');assert.equal(other.distracted,undefined,'interrupt releases all attracted crew');
const ready=actor.deployment.diversionReadyAt,record={deployment:storedDeployment(actor)};assert.equal(restoredDeployment(record).diversionReadyAt,ready);
for(let i=0;i<250&&task.operation;i++)g.step();assert.equal(task.operation,undefined);assert.equal(task.task,'diversion');
send({action:'dance',sector:sector.id});assert.equal(task.operation,undefined,'cooldown prevents immediate repeat');

// A guard follows through its normal doorway, then returns to the same room.
const business=Object.values(st.businesses).find(b=>b.room&&!b.hideout&&g.deployment.sectorAt(...b.ring)===sector.id);
g.clans.setOwner(business.id,rival);g.step();
const door=g.doors.find(d=>d.to&&!d.ninja&&d.place===business.room);
Object.assign(actor,{x:door.x,z:door.z,place:'street',hp:actor.maxHp});
for(const e of [busy,idle,other,striker])e.dead=true;
st.tick=Math.max(st.tick,ready+1);
send({action:'assignment',sector:sector.id,task:'diversion',objective:{x:door.x,z:door.z},fallback:sector.anchor});
const guard=Object.values(st.entities).find(e=>e.guard===business.id&&!e.dead);
assert.ok(guard);Object.assign(guard,door.to,{place:business.room,holdFire:true,order:{kind:'station',...door.to}});
send({action:'dance',sector:sector.id});let cameOut=false;
for(let i=0;i<190;i++){g.step();if(guard.place==='street')cameOut=true;}
assert.ok(cameOut,'idle interior guard is drawn outside through its front door');
for(let i=0;i<1000&&guard.place!==business.room;i++)g.step();
assert.equal(guard.place,business.room,'guard returns through its doorway after distraction ends');
assert.doesNotThrow(()=>JSON.stringify(st));
console.log('Diversion: real recruitment/cap and reused art, warning/duration, idle eligibility, manual/damage counterplay, cooldown persistence, retreat and physical guard doorway return passed');
