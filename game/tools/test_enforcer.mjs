import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { TAUNT } from '../src/sim/taunt.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url))),units=read('data/units.json'),art=read('data/art.json');
for(const t of Object.values(units.types)){t.dodgeChance=0;t.critChance=0;}
for(const model of ['enforcer','demolitions','lookout'])for(const entry of Object.values(art.characters[model])){const file=typeof entry==='string'?entry:entry.file;assert.ok(existsSync(new URL(`../../assets/sprites/${file}.png`,import.meta.url)),file);}
const R={...TAUNT,...units.types.yakuza_enforcer.taunt};
const g=createGame({district:read('data/port_town.json'),catalog:art,cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units,settings:{...read('data/settings.json')}});
const {heroId}=setupMatch(g,{clan:'yakuza',difficulty:'easy',bots:read('data/bots.json')});
const st=g.state,me=st.entities[heroId].owner,rival=Object.keys(st.clans).find(id=>id!==me&&st.clans[id].faction==='kuroda');
assert.notEqual(g.clans.hirePrice(me,'yakuza_enforcer'),null,'Yakuza can hire the enforcer');
assert.equal(g.clans.hirePrice(rival,'yakuza_enforcer'),null,'Kuroda cannot');
for(const e of Object.values(st.entities)){e.holdFire=true;if(e.type!=='hero')e.order={kind:'stop'};if(e.type==='hero')e.x+=80;}
const sector=st.deployment.sectors[0],ax=sector.anchor.x,az=sector.anchor.z;
const big=st.entities[g.spawn('yakuza_enforcer','enforcer',ax,az,{owner:me,deployment:{group:sector.id},order:{kind:'stop'}})];
const mate=st.entities[g.spawn('thug','thug',ax+1,az+1,{owner:me,deployment:{group:sector.id},order:{kind:'stop'},holdFire:true})];
const foe=st.entities[g.spawn('spearman','kuroda_spearman',ax+3,az+1,{owner:rival,deployment:{group:'hero'},order:{kind:'attack',target:mate.id}})];
for(let i=0;i<3&&!foe.taunted;i++)g.step();
assert.equal(foe.taunted?.source,big.id,'enforcer taunts the enemy hitting his clanmate');
assert.ok(big.buffs?.bulwark,'bulwark while the taunt holds');
const seen=[];for(let i=0;i<60;i++){g.step();seen.push(...st.hits.filter(h=>h.t===big.id||h.a===foe.id),...(st.dodges||[]).map(d=>({dodge:d})));if(process.env.DBG&&i>16&&i<40)console.log(st.tick,JSON.stringify(foe.swing),i,foe.anim,foe.order?.kind,!!foe.taunted,foe.swing?.target,Math.hypot(foe.x-big.x,foe.z-big.z).toFixed(2),big.hp,mate.hp);}
if(process.env.DBG)console.log(JSON.stringify(seen),big.hp,big.maxHp);
assert.ok(big.hp<big.maxHp,'taunted enemy attacks the enforcer');
const mateHp=mate.hp;for(let i=0;i<20;i++)g.step();assert.equal(mate.hp,mateHp,'and leaves the clanmate alone');
assert.ok(foe.taunted,'automatically renews taunt when a valid enemy remains');
const ready=big.taunt.readyAt;assert.equal(R.cooldownTicks,80);
while(st.tick<=ready)g.step();
assert.equal(big.taunt.readyAt,ready+80,'automatically taunts again on the four-second cooldown');
assert.doesNotThrow(()=>JSON.stringify(st));
console.log('Enforcer: Yakuza-only hire, taunt priority/forced attack/bulwark/duration/cooldown, sprite sets passed');
