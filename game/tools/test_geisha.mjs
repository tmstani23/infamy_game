import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { storedDeployment, restoredDeployment } from '../src/sim/deployment.js';
import { DIVERSION, createDiversion } from '../src/sim/diversion.js';
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
const sector=st.deployment.sectors[0];
const fresh=(dx,extra={})=>st.entities[g.spawn('thug','thug',sector.anchor.x+dx,sector.anchor.z,{owner:rival,deployment:{group:'hero'},order:{kind:'stop'},holdFire:true,...extra})];
const actor=st.entities[g.spawn('shinobi_geisha','shinobi_geisha',sector.anchor.x,sector.anchor.z,{owner:'player',deployment:{group:sector.id}})];
// Lure is her auto attack: a visible idle enemy within reach stands entranced; heroes never.
const idle=fresh(4);Object.assign(enemyHero,{x:sector.anchor.x-4,z:sector.anchor.z,place:'street'});
for(let i=0;i<DIVERSION.castTicks+5&&!idle.distracted;i++)g.step();
assert.equal(idle.distracted?.source,actor.id,'geisha charms a nearby enemy on her own');
assert.equal(enemyHero.distracted,undefined,'heroes are never charmed');
const at=[idle.x,idle.z];for(let i=0;i<20;i++)g.step();
assert.ok(Math.hypot(idle.x-at[0],idle.z-at[1])<.05,'charmed unit stands still');
for(let i=0;i<DIVERSION.durationTicks;i++)g.step();
assert.equal(idle.distracted,undefined,'charm wears off');
assert.ok(actor.lure.readyAt>st.tick-DIVERSION.cooldownTicks,'lure has a cooldown');
// Anyone coming at her: she runs.
idle.dead=true;Object.assign(enemyHero,{x:sector.anchor.x+60,z:sector.anchor.z+60});
const hunter=fresh(3,{holdFire:false,order:{kind:'attack',target:actor.id}});
actor.hidden=false;actor.revealUntil=st.tick+100;
const d0=Math.hypot(hunter.x-actor.x,hunter.z-actor.z);
for(let i=0;i<10;i++)g.step();
assert.equal(actor.geishaMode,'fleeing','threatened geisha flees');
// Caught anyway: she fights, and hurts.
hunter.dead=true;const catcher=fresh(.9,{holdFire:true,order:{kind:'stop'}});const hp0=catcher.hp;
for(let i=0;i<60;i++){actor.cornered=st.tick-DIVERSION.cornerTicks;Object.assign(catcher,{x:actor.x+.9,z:actor.z});g.step();}
assert.equal(actor.geishaMode,'fighting','cornered geisha fights back');
assert.ok(catcher.hp<=hp0-units.types.shinobi_geisha.damage,'cornered geisha lands damage at her configured strength');
assert.doesNotThrow(()=>JSON.stringify(st));
// A charmed geisha must stand still even when she could charm, flee or fight.
{
  const a={id:'a',type:'shinobi_geisha',owner:'p',x:0,z:0,place:'street',distracted:{source:'b',until:100}};
  const b={id:'b',type:'thug',owner:'q',x:4,z:0,place:'street',order:{kind:'stop'}};
  const state={tick:1,entities:{a,b},clans:{p:{},q:{}},casts:[]};
  let moves=0,attacks=0;
  const diversion=createDiversion({state,deployment:{canOccupy:()=>true},vision:{canSee:()=>true},reveal:()=>{},clearCombat:()=>{},
    hostile:(x,y)=>x.owner!==y.owner,moveTo:()=>{moves++;return true;},attackStep:()=>{attacks++;}});
  for(const distance of [4,1]) {
    b.x=distance; a.cornered=-100;
    assert.equal(diversion.step(a,{attackRange:1.2}),true);
    assert.equal(a.anim,'idle');
  }
  assert.equal(a.lure,undefined,'charm blocks her own lure');
  assert.equal(moves,0,'charm blocks fleeing'); assert.equal(attacks,0,'charm blocks fighting');
  delete a.distracted; b.x=4;
  diversion.step(a,{attackRange:1.2});
  assert.equal(b.buffs?.charmSnare?.source,a.id,'autonomous channel resumes after charm');
  state.tick+=DIVERSION.castTicks;diversion.step(a,{});
  assert.equal(b.distracted?.source,a.id,'completed channel charms');
}
{
 const a={id:'a',type:'shinobi_geisha',owner:'p',place:'street',x:0,z:0,anim:'walk',order:{kind:'move',x:8,z:0}},b={id:'b',type:'thug',owner:'q',place:'street',x:4,z:0};
 const state={tick:1,entities:{a,b},clans:{p:{},q:{}},casts:[]};
 const diversion=createDiversion({state,deployment:{canOccupy:()=>true},vision:{canSee:()=>true},reveal(){},clearCombat(){},hostile:(a,b)=>a.owner!==b.owner});
 assert.equal(diversion.step(a,{}),false);assert.equal(a.lure,undefined,'moving never auto charms');
 a.order={kind:'attack',target:'b'};a.anim='idle';assert.equal(diversion.step(a,{}),false);assert.equal(a.lure,undefined);
 a.order={kind:'stop'};assert.equal(diversion.step(a,{}),true);assert.equal(a.anim,'dance');assert.equal(a.buffs.charming.until,1+DIVERSION.castTicks);
 const ready=a.lure.readyAt;diversion.manual(a);assert.equal(a.buffs.charming,undefined);assert.equal(a.lure.castUntil,state.tick);assert.equal(a.lure.readyAt,ready,'moving interrupts visual channel without resetting cooldown');
}
console.log('Geisha: hire, stationary-only charm/channel, move/attack priority, duration/cooldown, freeze, fleeing and configured last-resort damage passed');
