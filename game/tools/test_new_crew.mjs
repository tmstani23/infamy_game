import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createGame} from '../src/sim/game.js';
import {setupMatch} from '../src/sim/setup_match.js';
import {createTaunt} from '../src/sim/taunt.js';
import {createDiversion} from '../src/sim/diversion.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
const units=read('data/units.json'),art=read('data/art.json'),civilians=read('data/civilians.json');
for(const t of Object.values(units.types)){t.dodgeChance=0;t.critChance=0;}
const g=createGame({district:read('data/port_town.json'),catalog:art,cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units,settings:read('data/settings.json')});
const {heroId}=setupMatch(g,{clan:'yakuza',difficulty:'easy',bots:read('data/bots.json')});
const st=g.state,me=st.entities[heroId].owner,red=Object.keys(st.clans).find(id=>st.clans[id].faction==='kuroda'),purple=Object.keys(st.clans).find(id=>st.clans[id].kind==='ninja');
for(const [clan,type] of [[me,'archer'],[red,'kuroda_enforcer'],[purple,'shinobi_enforcer']]){
  assert.notEqual(g.clans.hirePrice(clan,type),null,`${clan} can recruit ${type}`);
  assert.equal(g.clans.hirePrice(clan===me?red:me,type),null,'other clans cannot recruit it');
}
for(const model of ['archer','koruda_enforcer','shinobi_enforcer','gunslinger','western_dockworker'])for(const entry of Object.values(art.characters[model]))assert.ok(existsSync(new URL(`../../assets/sprites/${typeof entry==='string'?entry:entry.file}.png`,import.meta.url)),`${model} sprite exists`);
for(const e of Object.values(st.entities)){e.holdFire=true;e.order={kind:'stop'};if(e.type==='hero')e.x+=80;}
const anchor=st.deployment.sectors[0].anchor;
const archer=st.entities[g.spawn('archer','archer',anchor.x,anchor.z,{owner:me,deployment:{group:'hero'},order:{kind:'stop'}})];
const foe=st.entities[g.spawn('spearman','kuroda_spearman',anchor.x+5,anchor.z,{owner:red,deployment:{group:'hero'},order:{kind:'stop'},holdFire:true})];
const hp=foe.hp;let launch=null,impact=null;
g.step([{id:heroId,type:'order',units:[archer.id],kind:'attack',target:foe.id}]);
for(let i=0;i<90&&!impact;i++){
  g.step();
  if(st.projectiles.length&&!launch){launch={...st.projectiles[0]};assert.equal(foe.hp,hp,'arrow causes no damage before arrival');}
  if(st.hits.some(h=>h.a===archer.id)){impact=st.tick;assert.equal(hp-foe.hp,14,'Hamstring uses ordinary arrow damage');}
}
assert.ok(launch,'explicit ranged attack launches a real sim projectile');assert.ok(impact>launch.at,'impact follows flight time');
assert.ok(foe.buffs.snared.hamstring);assert.equal(foe.buffs.snared.speed,.65);assert.equal(foe.buffs.snared.until,impact-1+60);
assert.equal(archer.hamstringReadyAt,launch.at+200);assert.ok(Math.hypot(archer.x-foe.x,archer.z-foe.z)>4,'archer stays at range');
assert.equal(g.stats.movement(foe,'run')/g.stats.base(foe).run,.65,'slow affects actual movement');
let nextShot=null;for(let i=0;i<50&&!nextShot;i++){g.step();nextShot=st.projectiles.find(p=>p.a===archer.id&&p.at>launch.at);}
assert.ok(nextShot,'archer continues ordinary ranged attacks between abilities');assert.equal(nextShot.hamstring,false,'Hamstring cannot repeat before its ten-second cooldown');
// A fresh charm between release and impact must protect the target from the old arrow.
st.projectiles.push({...launch,hamstring:false,at:st.tick,until:st.tick+1});
foe.distracted={source:archer.id,clan:me,at:st.tick+1,until:st.tick+120,x:foe.x,z:foe.z};
delete archer.swing;archer.order={kind:'stop'};archer.holdFire=true;const safeHp=foe.hp;
g.step();g.step();assert.equal(foe.hp,safeHp,'an in-flight automatic attack cannot break a fresh charm');

// Directional crowd control: front targets are forced, rear/bystanders are untouched.
const e={id:'tank',type:'kuroda_enforcer',owner:'a',x:0,z:0,hp:420,order:{kind:'attack',target:'front'}},
  front={id:'front',type:'thug',owner:'b',x:3,z:0,hp:200},side={id:'side',type:'thug',owner:'b',x:3,z:1,hp:200},back={id:'back',type:'thug',owner:'b',x:-3,z:0,hp:200},cop={id:'cop',type:'police',cop:true,owner:'b',x:2,z:0,hp:200};
const s={tick:10,entities:{tank:e,front,side,back,cop},clans:{a:{},b:{}},casts:[]};let reveals=0;
const taunt=createTaunt({state:s,vision:{canSee:()=>true},hostile:(a,b)=>a.owner!==b.owner,rulesFor:a=>units.types[a.type]?.taunt,engagementTarget:a=>a.order?.kind==='attack'?front:null,reveal:()=>reveals++,addBuff:(a,name,seconds,extra)=>(a.buffs||={})[name]={until:s.tick+seconds*20,...extra}});
assert.ok(taunt.step(e,units.types.kuroda_enforcer));assert.equal(front.taunted.source,e.id);assert.equal(side.taunted.source,e.id);assert.equal(back.taunted,undefined);assert.equal(cop.taunted,undefined);assert.equal(e.buffs.bulwark.taken,.65);assert.equal(reveals,1);
delete front.taunted;delete side.taunted;s.tick=500;e.type='shinobi_enforcer';delete e.taunt;delete e.buffs;e.order={kind:'stop'};
assert.equal(taunt.step(e,units.types.shinobi_enforcer),false,'passive bodyguard never taunts');assert.equal(front.taunted,undefined);
e.order={kind:'attack',target:'front'};assert.ok(taunt.step(e,units.types.shinobi_enforcer));assert.equal(e.buffs?.bulwark,undefined,'bodyguard gains no damage reduction');
assert.equal(read('data/units.json').types.shinobi_enforcer.dodgeChance,.3);
assert.ok(units.types.shinobi_enforcer.damage>units.types.kuroda_enforcer.damage&&units.types.kuroda_enforcer.damage>units.types.yakuza_enforcer.damage);
assert.equal(units.types.shinobi_geisha.projectile.kind,'geishabolt');assert.ok(units.types.shinobi_geisha.damage<units.types.archer.damage);
// Charm can open an explicitly commanded engagement before the victim attacks.
const geisha={id:'g',type:'shinobi_geisha',owner:'a',x:0,z:0,hp:160,order:{kind:'attack',target:'victim'}},victim={id:'victim',type:'thug',owner:'b',x:4,z:0,hp:200};
const ds={tick:1,entities:{g:geisha,victim},clans:{a:{},b:{}},casts:[]};
const diversion=createDiversion({state:ds,deployment:{canOccupy:()=>true},vision:{canSee:()=>true},hostile:(a,b)=>a.owner!==b.owner,reveal:()=>{},clearCombat:()=>{}});
assert.ok(diversion.step(geisha,units.types.shinobi_geisha));assert.equal(geisha.lure.target,victim.id,'Charm initiates against the commanded target');
assert.equal(Object.values(civilians.types).reduce((n,t)=>n+t.count,0),30,'two new civilians replace existing slots');
for(const name of ['foreign_visitor','western_dockworker']){assert.equal(civilians.types[name].nightOut,0);assert.deepEqual(civilians.types[name].homes,['dock_warehouse','customs_house']);}
console.log('New roster: clan hiring/assets, real arrow flight/damage/Hamstring/charm protection, tank cone/passive/reveal/defence, initiating Charm and civilian slots passed');
