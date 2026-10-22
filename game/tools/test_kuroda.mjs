import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { createBot } from '../src/sim/bot.js';
import { WILD } from '../src/sim/bandits.js';
import { POLICE } from '../src/sim/police.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`,import.meta.url)));
function make() {
  const units=data('data/units.json');
  for(const t of Object.values(units.types)) t.critChance=0;
  const g=createGame({district:data('data/waterfront.json'),catalog:data('data/art.json'),cutouts:data('art/cutouts.json'),
    interiors:data('data/interiors.json'),parts:data('data/interior_parts.json'),recipes:data('data/room_recipes.json'),units});
  g.clans.addClan('player',{faction:'kuroda'});g.clans.addClan('rival');
  const spawn=(type,x,z,extra={})=>g.state.entities[g.spawn(type,type==='hero'?'rival_yakuza':units.types[type].sprite,x,z,
    {owner:'player',holdFire:true,order:{kind:'stop'},...extra})];
  return {g,spawn,hero:spawn('hero',-8,1)};
}
const advance=(g,n)=>{for(let i=0;i<n;i++)g.step();};
const use=(g,h,slot,extra={})=>g.step([{id:h.id,type:'ability',slot,...extra}]);
function strike(g,a,t,commands=[]) {
  a.swing={start:g.state.tick,strike:g.state.tick,len:8,target:t.id};g.step(commands);
  return g.state.hits.find(h=>h.a===a.id&&h.t===t.id);
}

// Identity follows the chosen faction, including when Kuroda is the player.
for(const player of ['yakuza','kuroda','shinobi']) {
  const g=createGame({district:data('data/port_town.json'),catalog:data('data/art.json'),cutouts:data('art/cutouts.json'),
    interiors:data('data/interiors.json'),parts:data('data/interior_parts.json'),recipes:data('data/room_recipes.json'),units:data('data/units.json')});
  setupMatch(g,{clan:player,difficulty:'easy',bots:data('data/bots.json')});
  const k=player==='kuroda'?'player':'kuroda', y=player==='yakuza'?'player':'yakuza';
  assert.equal(g.state.clans[k].faction,'kuroda');
  assert.equal(g.clans.hirePrice(k,'swordsman'),null);
  assert.equal(g.clans.hirePrice(k,'spearman'),138);
  assert.equal(g.clans.hirePrice(y,'spearman'),null);
  assert.equal(g.clans.hirePrice(y,'swordsman'),138);
  assert.equal(g.clans.hirePrice(player==='shinobi'?'player':'shinobi','spearman'),null);
}
{
  const {g,hero,spawn}=make();
  const b=Object.values(g.state.businesses).find(b=>b.kind==='teahouse');
  hero.place=b.room;g.state.clans.player.ryo=500;
  g.step([{id:hero.id,type:'hire',business:b.id,unit:'spearman'}]);
  assert.equal(g.state.clans.player.queue[0].unit,'spearman');
  advance(g,161);
  const recruit=g.clans.crewOf('player').find(e=>e.type==='spearman');
  assert.equal(recruit.model,'kuroda_spearman');assert.equal(recruit.maxHp,204);
  assert.equal(g.settings.units.types.spearman.damage,24);
}
// Sweeping Cut: area/slow, room isolation, allies and neutral police/civilians.
{
  const {g,hero,spawn}=make();
  const near=spawn('thug',-4.2,1,{owner:'rival'}), far=spawn('thug',-3.8,1,{owner:'rival'});
  const ally=spawn('thug',-7,2), indoor=spawn('thug',-7,1,{owner:'rival',place:g.rooms[0].name});
  const officer=spawn('junsa',-8,2,{owner:POLICE,cop:true});
  const civ=g.state.entities[g.spawn('civilian','monk',-9,1,{hp:100,maxHp:100})];
  use(g,hero,'Q');
  assert.equal(near.hp,186);assert.equal(near.buffs.snared.speed,.5);
  for(const e of [far,ally,indoor,officer]){assert.equal(e.hp,e.maxHp);assert.ok(!e.buffs?.snared);}
  assert.equal(civ.hp,100);assert.equal(hero.cooldowns.Q,280);
  advance(g,60);assert.ok(!near.buffs?.snared);
}
// No incoming hit: full one-second brace, no activation; movement/Escape cancel.
{
  const {g,hero}=make();use(g,hero,'E');assert.ok(hero.brace);
  advance(g,20);assert.ok(!hero.brace&&!hero.buffs?.reprisal);
}
for(const type of ['move','cancel']) {
  const {g,hero}=make();use(g,hero,'E');
  g.step([{id:hero.id,type,...(type==='move'?{right:1,down:0}:{})}]);
  assert.ok(!hero.brace&&!hero.buffs?.reprisal);
}
// Hit during brace: damage is unchanged, proc immediate, only next normal hit
// stuns, and splash never hits allies, hidden enemies or neutral officers.
{
  const {g,hero,spawn}=make(), enemy=spawn('hero',-6,1,{owner:'rival',model:'ronin'});
  const splash=spawn('thug',-5.7,2,{owner:'rival'}), ally=spawn('thug',-6,2);
  const hidden=spawn('ninja',-6,0,{owner:'rival',hidden:true});
  const police=spawn('junsa',-5.7,0,{owner:POLICE,cop:true});
  use(g,hero,'E'); const hp=hero.hp;
  strike(g,enemy,hero);assert.equal(hp-hero.hp,23);assert.ok(!hero.brace);
  assert.ok(hero.buffs.reprisal.stunPending);assert.equal(hero.buffs.reprisal.until-g.state.tick,119);
  strike(g,hero,enemy);
  assert.ok(enemy.buffs.stunned);assert.equal(enemy.buffs.stunned.until-g.state.tick,14);
  assert.equal(splash.hp,192);assert.equal(ally.hp,200);assert.equal(police.hp,360);
  assert.equal(hero.buffs.reprisal.stunPending,false);
  const end=enemy.buffs.stunned.until;
  delete enemy.swing;
  strike(g,hero,enemy);assert.equal(enemy.buffs.stunned.until,end,'no repeat stun');
  const before=[enemy.x,enemy.z];
  g.step([{id:enemy.id,type:'move',right:1,down:0}]);assert.deepEqual([enemy.x,enemy.z],before,'stun blocks movement');
  const cd=enemy.cooldowns;
  use(g,enemy,'Q',{x:-8,z:1});assert.deepEqual(enemy.cooldowns,cd,'stun blocks abilities');
}
// Threefold Thrust: discrete hits, misses on escape, movement cancels; cleave
// works without consuming the normal-attack stun.
{
  const {g,hero,spawn}=make(), target=spawn('hero',-6,1,{owner:'rival',model:'ronin'});
  const splash=spawn('thug',-5.5,2,{owner:'rival'});
  hero.buffs={reprisal:{until:1000,splash:.35,radius:2,stunSeconds:.75,stunPending:true}};
  use(g,hero,'R',{target:target.id});let count=0;
  for(let i=0;i<20;i++){g.step();count+=g.state.hits.filter(h=>h.kind==='threefold').length;}
  assert.equal(count,3);assert.equal(target.hp,530);assert.equal(splash.hp,188);
  assert.ok(hero.buffs.reprisal.stunPending);assert.ok(!target.buffs?.stunned);
}
{
  const {g,hero,spawn}=make(), t=spawn('hero',-6,1,{owner:'rival',model:'ronin'});
  use(g,hero,'R',{target:t.id});advance(g,4);assert.equal(t.hp,550);
  t.x=10;advance(g,15);assert.equal(t.hp,550,'escaping reach misses later thrusts');
}
{
  const {g,hero,spawn}=make(), t=spawn('hero',-6,1,{owner:'rival',model:'ronin'});
  use(g,hero,'R',{target:t.id});advance(g,4);
  g.step([{id:hero.id,type:'move',right:-1,down:0}]);advance(g,20);
  assert.equal(t.hp,550);assert.ok(!hero.spearCombo);
}
// Formation membership is spatial/live, doesn't stack, affects same-room
// allies, and never changes their independent orders.
{
  const {g,hero,spawn}=make(), enemy=spawn('hero',-6,1,{owner:'rival',model:'ronin'});
  const ally=spawn('spearman',-7,2), far=spawn('thug',4,1), indoors=spawn('thug',-8,1,{place:g.rooms[0].name});
  const order=structuredClone(ally.order);
  use(g,hero,'F');assert.equal(hero.buffs.formation.damageTaken,.75);
  assert.ok(ally.buffs.formation);assert.ok(!far.buffs?.formation&&!indoors.buffs?.formation);
  assert.deepEqual(ally.order,order);
  const hp=hero.hp;strike(g,enemy,hero);assert.equal(hp-hero.hp,17);
  strike(g,ally,enemy);assert.equal(enemy.buffs.snared.speed,.7);
  hero.x=2;ally.x=2;g.step();assert.ok(!hero.buffs?.formation&&!ally.buffs?.formation);
  assert.equal(g.state.formations[0].x,-8,'circle stays at cast location');
  while(g.state.tick<=161)g.step();assert.ok(!g.state.formations);
}
console.log('Kuroda: faction hiring, real recruitment, sweep, counter proc/stun/cleave, movement cancellation, threefold hits/reach, fixed formation and existing-order preservation passed');
// A dodged attack does not spend the one-use normal-attack stun.
{
  const {g,hero,spawn}=make(), t=spawn('ninja',-6,1,{owner:'rival',hidden:false});
  g.settings.units.types.ninja.dodgeChance=1;
  hero.buffs={reprisal:{until:1000,splash:.35,radius:2,stunSeconds:.75,stunPending:true}};
  strike(g,hero,t);assert.equal(g.state.dodges.length,1);assert.ok(hero.buffs.reprisal.stunPending);
  assert.ok(!t.buffs?.stunned);
}
{
  const {g,hero,spawn}=make(), t=spawn('hero',-6,1,{owner:'rival',model:'ronin'});
  use(g,hero,'F');use(g,hero,'Q');advance(g,10);const slow=structuredClone(t.buffs.snared);
  strike(g,hero,t);assert.deepEqual(t.buffs.snared,slow,'formation never weakens the stronger 3-second sweep slow');
}
{
  const {g,hero}=make();use(g,hero,'R',{target:'missing'});assert.ok(!hero.cooldowns?.R,'invalid target spends no cooldown');
}
// Actual bot command path: brace on an incoming swing, consume its counter
// with a normal hit, then execute a planted combo without movement cancelling.
{
  const {g,hero,spawn}=make(), enemy=spawn('hero',-6,1,{owner:'rival',model:'ronin'});
  hero.hp=hero.maxHp=10000;enemy.hp=enemy.maxHp=10000;
  const bot=createBot(g,{clan:'player',hero:hero.id,rules:{abilities:['Q','E','R','F'],reactSeconds:.05,thinkSeconds:60,huntBandits:false,attackChance:0,raidChance:0}});
  enemy.swing={start:0,strike:2,len:8,target:hero.id};
  const casts=new Set();let thrusts=0;
  for(let i=0;i<100;i++){
    g.step(bot.tick());
    for(const c of g.state.casts)if(c.a===hero.id)casts.add(c.kind);
    thrusts+=g.state.hits.filter(h=>h.a===hero.id&&h.kind==='threefold').length;
  }
  assert.ok(casts.has('reprisal')&&casts.has('counter'),'bot anticipates swing and activates counter');
  assert.ok(casts.has('threefold')&&thrusts===3,'bot completes all three thrusts');
  assert.ok(casts.has('formation'),'bot can deploy formation against a leader');
}
{
  const {g,hero}=make(), tea=Object.values(g.state.businesses).find(b=>b.kind==='teahouse');
  g.clans.setOwner(tea.id,'player');tea.hideout='player';
  const income=Object.values(g.state.businesses).find(b=>b!==tea&&g.businesses.rules[b.kind]?.payout);
  g.clans.setOwner(income.id,'player');
  const room=g.rooms.find(r=>r.name===tea.room);
  hero.place=tea.room;hero.x=room.spawn.x;hero.z=room.spawn.z;g.state.clans.player.ryo=1000;
  const bot=createBot(g,{clan:'player',hero:hero.id,rules:{reserve:0,huntBandits:false,attackChance:0,raidChance:0}});
  const commands=bot.tick();assert.ok(commands.some(c=>c.type==='hire'&&c.unit==='spearman'),'Kuroda bot hires faction spear crew');
}
console.log('Kuroda: dodge preserves counter, stronger snares preserved, invalid-target validation and live AI counter/combo/formation/hiring passed');
