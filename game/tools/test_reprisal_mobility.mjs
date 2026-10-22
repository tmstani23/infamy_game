import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
const data=f=>JSON.parse(readFileSync(new URL(`../${f}`,import.meta.url)));
function make() {
  const units=data('data/units.json');units.types.hero.critChance=0;
  const g=createGame({district:data('data/waterfront.json'),catalog:data('data/art.json'),cutouts:data('art/cutouts.json'),
    interiors:data('data/interiors.json'),parts:data('data/interior_parts.json'),recipes:data('data/room_recipes.json'),units});
  g.clans.addClan('p',{faction:'kuroda'});g.clans.addClan('r');
  const hero=g.state.entities[g.spawn('hero','rival_yakuza',-8,1,{owner:'p',holdFire:true})];
  return {g,hero};
}
const move=(h,right=1,walk=false)=>({id:h.id,type:'move',right,down:0,walk});
const cast=h=>({id:h.id,type:'ability',slot:'E'});
const dist=(h,p)=>Math.hypot(h.x-p[0],h.z-p[1]);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function measure(g,h,c=move(h)) {const p=[h.x,h.z];g.step([c]);return dist(h,p);}

// Deliberately break a fresh stationary brace; full 4s timer starts at break.
{
  const {g,hero:h}=make();g.step([cast(h)]);const tick=g.state.tick;
  close(measure(g,h),6*1.3/20);
  assert.ok(!h.brace&&!h.buffs.reprisal);assert.equal(h.buffs.pursuit.until,tick+80);
  assert.equal(h.cooldowns.E,400);assert.equal(h.buffs.pursuit.runSpeed,1.3);
  assert.equal(g.state.casts.filter(c=>c.kind==='pursuit').length,1);
  g.step([move(h,0)]);
  while(g.state.tick<h.buffs.pursuit.until)g.step();
  close(measure(g,h),6/20);assert.ok(!h.buffs?.pursuit,'expires at exactly four seconds');
}
// Existing held intent and both same-tick command orders work identically.
{
  const {g,hero:h}=make();g.step([move(h)]);const p=[h.x,h.z];
  g.step([cast(h)]);close(dist(h,p),6*1.3/20);assert.ok(h.buffs.pursuit&&!h.brace);
  g.step();assert.equal(g.state.casts.filter(c=>c.kind==='pursuit').length,0,'no repeated proc from held input');
}
for(const abilityFirst of [true,false]) {
  const {g,hero:h}=make();g.step(abilityFirst?[cast(h),move(h)]:[move(h),cast(h)]);
  assert.equal(h.buffs.pursuit.runSpeed,1.3);assert.ok(!h.brace&&!h.buffs.reprisal);
}
// Only run is boosted, and the snare multiplier still applies.
{
  const {g,hero:h}=make();h.buffs={snared:{until:1000,speed:.5}};
  g.step([cast(h),move(h)]);assert.equal(h.buffs.snared.speed,.5);
  close(measure(g,h),6*1.3*.5/20);
  close(measure(g,h,move(h,1,true)),1.7*.5/20);
}
// No hit, Escape, a stun, or death grants no escape bonus.
for(const outcome of ['timeout','escape','stun','lethal']) {
  const {g,hero:h}=make();g.step([cast(h)]);
  if(outcome==='timeout')for(let i=0;i<21;i++)g.step();
  if(outcome==='escape')g.step([{id:h.id,type:'cancel'}]);
  if(outcome==='stun'){h.buffs={stunned:{until:100}};g.step([move(h)]);}
  if(outcome==='lethal'){
    const enemy=g.state.entities[g.spawn('hero','ronin',-6,1,{owner:'r',holdFire:true})];
    h.hp=1;enemy.swing={start:g.state.tick,strike:g.state.tick,len:8,target:h.id};g.step();
    assert.ok(h.dead);
  }
  assert.ok(!h.brace&&!h.buffs?.pursuit&&!h.buffs?.reprisal,outcome);
}
// Damage consumes the brace first: subsequent movement retains the counter,
// without also awarding pursuit.
{
  const {g,hero:h}=make();const enemy=g.state.entities[g.spawn('hero','ronin',-6,1,{owner:'r',holdFire:true})];
  g.step([cast(h)]);enemy.swing={start:g.state.tick,strike:g.state.tick,len:8,target:h.id};g.step();
  assert.ok(h.buffs.reprisal.stunPending);close(measure(g,h),6/20);
  assert.ok(!h.buffs.pursuit&&h.buffs.reprisal.stunPending);
}
// Reapplication refreshes the same multiplier; normal cooldown still blocks
// an early recast. Force readiness only to test future cooldown modifiers.
{
  const {g,hero:h}=make();g.step([cast(h),move(h)]);const first=h.buffs.pursuit.until;
  g.step([cast(h)]);assert.equal(h.buffs.pursuit.until,first);
  h.cooldowns.E=0;g.step([cast(h)]);
  assert.ok(h.buffs.pursuit.until>first);assert.equal(h.buffs.pursuit.runSpeed,1.3);
  close(measure(g,h),6*1.3/20);
}
console.log('Reprisal mobility: +30% run for 4s, held/same-tick input, no stacking, cooldown, snare/walk interaction, counter exclusivity and invalid-interruption safeguards passed');
