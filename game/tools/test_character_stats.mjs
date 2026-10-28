import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, DT } from '../src/sim/game.js';
import { formatStat, modifierDisplay } from '../src/character_panel.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
function make(faction = 'kuroda', model = 'rival_yakuza') {
  const units = data('data/units.json');
  units.types.hero.critChance = 0;
  const g = createGame({ district:data('data/waterfront.json'), catalog:data('data/art.json'), cutouts:data('art/cutouts.json'),
    interiors:data('data/interiors.json'), parts:data('data/interior_parts.json'), recipes:data('data/room_recipes.json'), units });
  g.clans.addClan('player', { faction, kind:faction==='shinobi'?'ninja':'yakuza' }); g.clans.addClan('rival');
  const spawn = (type, x, z, extra = {}) => g.state.entities[g.spawn(type, type === 'hero' ? model : units.types[type].sprite, x, z,
    { owner:'player', holdFire:true, order:{kind:'stop'}, ...extra })];
  return { g, spawn, h:spawn('hero', -8, 1) };
}
const row = (g,h,key) => g.stats.snapshot(h).rows.find(r => r.key === key);
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
for (const [faction,model] of [['yakuza','ronin'],['kuroda','rival_yakuza'],['shinobi','ninja_leader']]) {
  const {g,h} = make(faction,model), before = JSON.stringify(g.state);
  const s = g.stats.snapshot(h);
  assert.ok(s.name); assert.equal(s.rows.length,12); assert.equal(s.abilities.length,4);
  assert.equal(s.faction,faction); assert.equal(s.passives.length,faction==='yakuza'?0:1);
  near(s.maxHp,g.stats.base(h).hp);
  assert.equal(JSON.stringify(g.state),before,'reading the character page must not mutate simulation state');
}
{
  const {g,h,spawn}=make(), target=spawn('thug',-7,1,{owner:'rival'});
  h.buffs={lantern:{until:100,damage:1.3,lifesteal:.2},intimidated:{until:100,damage:.8},rally:{until:100,boost:1.4}};
  const expected=row(g,h,'normalHit').value;
  h.swing={start:0,strike:0,len:8,target:target.id}; g.step();
  assert.equal(g.state.hits.find(x=>x.a===h.id)?.damage,expected,'normal damage must match the sheet');
  near(row(g,h,'attackInterval').value,g.stats.base(h).attackSpeed/1.4);
  g.state.tick=100;
  assert.equal(row(g,h,'normalHit').modifier,0,'expired modifiers disappear immediately');
  assert.equal(row(g,h,'lifesteal').value,0);
}
{
  const {g,h}=make();
  h.buffs={pursuit:{until:100,runSpeed:1.3},snared:{until:100,speed:.5}};
  const expected=row(g,h,'run').value, x=h.x,z=h.z;
  g.step([{id:h.id,type:'move',right:1,down:0}]);
  near(Math.hypot(h.x-x,h.z-z),expected*DT);
  h.hp=h.maxHp/2; delete h.hitAt; delete h.foughtAt;
  const hp=h.hp, recovery=row(g,h,'regen').value;
  g.step(); near(h.hp-hp,recovery*DT);
  h.hitAt=g.state.tick;
  assert.equal(row(g,h,'regen').value,0,'recovery pauses after damage');
}
{
  const {g,h}=make(); h.buffs={ambush:{until:10,critChance:.2}};
  const r=row(g,h,'critChance');
  assert.equal(modifierDisplay(r).text,'+20 pp'); assert.equal(formatStat(r,r.value),'20%');
  assert.equal(modifierDisplay({modifier:-.2,unit:'s',lowerBetter:true}).kind,'positive');
  assert.equal(modifierDisplay({modifier:-2,unit:'damage'}).kind,'negative');
}
console.log('character stats: all clan snapshots, read-only queries, actual damage/movement/recovery, expiry and modifier formatting passed');
