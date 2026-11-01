import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, DT } from '../src/sim/game.js';
import { createInventory, ITEMS, INVENTORY_SLOTS } from '../src/sim/inventory.js';
import { createSnapshotEncoder, applySnapshot } from '../src/sim_snapshot.js';

const data = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url)));
function fixture(faction = 'yakuza', bot = false) {
  const units = data('data/units.json'); units.types.hero.critChance = 0;
  const g = createGame({district:data('data/waterfront.json'),catalog:data('data/art.json'),cutouts:data('art/cutouts.json'),
    interiors:data('data/interiors.json'),parts:data('data/interior_parts.json'),recipes:data('data/room_recipes.json'),units});
  g.clans.addClan('player',{faction,kind:faction==='shinobi'?'ninja':'yakuza',bot});g.clans.addClan('rival');
  const id=g.spawn('hero',faction==='shinobi'?'ninja_leader':faction==='kuroda'?'rival_yakuza':'ronin',-8,1,{owner:'player',holdFire:true});
  const hero=g.state.entities[id],inv=g.state.clans.player.inventory;
  const cmd=(action,detail={})=>g.step([{id,type:'inventory',action,...detail}]);
  return {g,hero,inv,cmd};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const faction of ['yakuza','kuroda','shinobi'])for(const bot of [false,true]){
  const {g,hero,inv,cmd}=fixture(faction,bot);
  assert.equal(inv.bag.length,12);assert.equal(inv.stash.length,12);assert.equal(inv.bag.filter(Boolean).length,3);
  const original=JSON.stringify(g.state);g.inventory.status(hero);g.stats.snapshot(hero);
  assert.equal(JSON.stringify(g.state),original,'inventory/stat reads never mutate');
  cmd('equip',{index:0});cmd('equip',{index:1});cmd('equip',{index:2});
  assert.deepEqual(inv.equipment,{weapon:'weighted_edge',armor:'light_lamellar',accessory:'scouts_knot'});
  near(g.stats.damage(hero),g.stats.base(hero).damage*1.08);
  near(g.stats.attackInterval(hero),g.stats.base(hero).attackSpeed*1.06);
  near(g.stats.movement(hero,'run'),g.stats.base(hero).run*.95*1.05);
  near(g.stats.damageTaken(hero),.94*1.03);
  const snap=g.stats.snapshot(hero),row=key=>snap.rows.find(r=>r.key===key);
  near(row('run').value,g.stats.movement(hero,'run'));near(row('damageTaken').value,g.stats.damageTaken(hero));
  assert.match(row('normalHit').sources.join(),/Weighted edge/);assert.match(row('attackInterval').sources.join(),/Weighted edge/);
  assert.match(row('run').sources.join(),/Light lamellar/);
  cmd('unequip',{slot:'weapon'});assert.equal(inv.equipment.weapon,null);assert.equal(inv.bag[0],'weighted_edge');
  const bag=JSON.stringify(inv.bag);cmd('deposit',{index:0});assert.equal(JSON.stringify(inv.bag),bag,'field stash transfer refused');
  const hq={id:'inventory-hq',owner:'player',hideout:'player',room:'inventory-room'};g.state.businesses[hq.id]=hq;
  hero.place=hq.room;cmd('deposit',{index:0});assert.equal(inv.stash[0],'weighted_edge');assert.equal(inv.bag[0],null);
  cmd('withdraw',{index:0});assert.equal(inv.bag[0],'weighted_edge');assert.equal(inv.stash[0],null);
  const before=JSON.stringify(inv);
  for(const index of [-1,12,1.5,'0',NaN])cmd('equip',{index});
  cmd('unequip',{slot:'__proto__'});assert.equal(JSON.stringify(inv),before,'malformed commands cannot alter storage');
  hero.downed={};cmd('equip',{index:0});assert.equal(JSON.stringify(inv),before);delete hero.downed;
  hero.jailed={};cmd('equip',{index:0});assert.equal(JSON.stringify(inv),before);delete hero.jailed;
  const cloned=structuredClone(g.state),restored=createInventory({state:cloned}),newHero={...cloned.entities[hero.id],id:'recovered'};
  restored.initialize(newHero);assert.deepEqual(cloned.clans.player.inventory,inv,'recovery never creates another starter set');
  assert.deepEqual(newHero.equipment,inv.equipment);
}
{
  const {g,hero,inv,cmd}=fixture();cmd('equip',{index:0});cmd('equip',{index:1});
  const targetId=g.spawn('thug','thug',-7,1,{owner:'rival',holdFire:true,order:{kind:'stop'}}),target=g.state.entities[targetId];
  hero.swing={start:g.state.tick,strike:g.state.tick,len:8,target:targetId};const expected=g.stats.snapshot(hero).rows.find(r=>r.key==='normalHit').value;
  g.step();assert.equal(g.state.hits.find(h=>h.a===hero.id)?.damage,expected,'actual swing matches equipped character stats');
  hero.place='street';delete hero.swing;const x=hero.x,z=hero.z,speed=g.stats.movement(hero,'run');
  g.step([{id:hero.id,type:'move',right:1,down:0}]);near(Math.hypot(hero.x-x,hero.z-z),speed*DT);
  const attacker=g.state.entities[g.spawn('hero','ronin',hero.x+.5,hero.z,{owner:'rival',holdFire:true})];
  attacker.swing={start:g.state.tick,strike:g.state.tick,len:8,target:hero.id};
  const protectedDamage=Math.round(Math.round(g.stats.damage(attacker))*g.stats.damageTaken(hero));g.step();
  assert.equal(g.state.hits.find(h=>h.a===attacker.id)?.damage,protectedDamage,'actual incoming damage uses armor tradeoff');
  inv.bag.fill('scouts_knot');const full=JSON.stringify(inv);
  cmd('unequip',{slot:'weapon'});assert.equal(JSON.stringify(inv),full,'full bag cannot lose equipped gear');
  inv.bag[0]='light_lamellar';cmd('equip',{index:0});assert.equal(inv.bag[0],'light_lamellar','swapping equipment returns old item to its source slot even when full');
  inv.stash.fill('scouts_knot');hero.place='stash-room';g.state.businesses.hq={owner:'player',hideout:'player',room:hero.place};
  const all=JSON.stringify(inv);cmd('deposit',{index:1});cmd('withdraw',{index:0});assert.equal(JSON.stringify(inv),all,'full destinations preserve both containers');
  const crew=g.state.entities[g.spawn('thug','thug',0,0,{owner:'player',equipment:{weapon:'weighted_edge'}})];
  near(g.stats.damage(crew),g.stats.base(crew).damage);assert.equal(INVENTORY_SLOTS,12);assert.equal(Object.keys(ITEMS).length,15);
}
{
  const {g,hero,cmd}=fixture(),replica=fixture().g,encoder=createSnapshotEncoder(g);
  applySnapshot(replica,structuredClone(encoder.encode()));cmd('equip',{index:0});
  applySnapshot(replica,structuredClone(encoder.encode()));
  assert.equal(replica.state.entities[hero.id].equipment.weapon,'weighted_edge');
  near(replica.stats.damage(replica.state.entities[hero.id]),g.stats.damage(hero));
  applySnapshot(replica,structuredClone(encoder.encode({map:true})));
  assert.deepEqual(replica.inventory.status(replica.state.entities[hero.id]).bag,g.inventory.status(hero).bag,'own inventory persists in map projection');
}
console.log('Inventory: all clans/bots, field equip, HQ-only transfers, full/malformed/disabled refusals, recovery, actual damage/protection/movement and snapshot stats passed');
