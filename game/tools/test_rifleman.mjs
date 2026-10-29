import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { RIFLE } from '../src/sim/rifleman.js';
import { createFlee } from '../src/sim/flee.js';
import { WILD } from '../src/sim/bandits.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url))),units=read('data/units.json'),art=read('data/art.json');
for(const t of Object.values(units.types)){t.dodgeChance=0;t.critChance=0;}
for(const entry of Object.values(art.characters.mercenary)){const file=typeof entry==='string'?entry:entry.file;assert.ok(existsSync(new URL(`../../assets/sprites/${file}.png`,import.meta.url)),file);}
const R={...RIFLE,...units.types.kuroda_rifleman.rifle};
const g=createGame({district:read('data/port_town.json'),catalog:art,cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units,settings:{...read('data/settings.json')}});
const {heroId}=setupMatch(g,{clan:'kuroda',difficulty:'easy',bots:read('data/bots.json')});
const st=g.state,me=st.entities[heroId].owner,rival=Object.keys(st.clans).find(id=>id!==me&&st.clans[id].kind!=='ninja');
assert.notEqual(g.clans.hirePrice(me,'kuroda_rifleman'),null,'Kuroda can hire the rifleman');
assert.equal(g.clans.hirePrice(rival,'kuroda_rifleman'),null,'Yakuza cannot');
for(const e of Object.values(st.entities)){e.holdFire=true;if(e.type!=='hero')e.order={kind:'stop'};if(e.type==='hero')Object.assign(e,{x:e.x+80});}
const sector=st.deployment.sectors[0],ax=sector.anchor.x,az=sector.anchor.z;
const rifle=st.entities[g.spawn('kuroda_rifleman','mercenary',ax,az,{owner:me,deployment:{group:sector.id},order:{kind:'stop'}})];
const foe=(dx,extra={})=>st.entities[g.spawn('thug','thug',ax+dx,az,{owner:rival,deployment:{group:'hero'},order:{kind:'stop'},holdFire:true,...extra})];
const heat0=st.clans[me].heat;
const target=foe(6),hp0=target.hp;
let aimed=false;for(let i=0;i<5;i++){g.step();aimed||=!!rifle.rifle?.aim;}
assert.ok(aimed,'rifleman aims at a visible enemy on his own');
assert.equal(target.hp,hp0,'no damage before the aim finishes');
for(let i=0;i<R.aimTicks+2;i++)g.step();
assert.ok(target.hp<=hp0-R.damage+1,'shot lands');
assert.ok((target.buffs?.stunned?.until??0)>st.tick,'shot staggers');
assert.ok(st.clans[me].heat>heat0,'gunfire adds heat');
const ready=rifle.rifle.readyAt;assert.ok(ready>=st.tick+R.cooldownTicks-R.aimTicks-5,'cooldown');
// being hit while aiming spoils the shot
target.dead=true;rifle.rifle.readyAt=0;const t2=foe(-6),hp2=t2.hp;
for(let i=0;i<3&&!rifle.rifle.aim;i++)g.step();assert.ok(rifle.rifle.aim,'aims again');
// on a sector duty he skirmishes: backs off from a chaser, then turns and fights after fleeTicks
t2.dead=true;delete rifle.rifle.aim;rifle.rifle.readyAt=st.tick+999;
const hunter=foe(3,{holdFire:false,order:{kind:'attack',target:rifle.id}});
for(let i=0;i<8;i++)g.step();assert.equal(rifle.rifleMode,'fleeing','on duty he backs off');
for(let i=0;i<R.fleeTicks+5;i++)g.step();assert.equal(rifle.rifleMode,'fighting','can\'t shake him: turns and fights');
hunter.dead=true;
// a move order beats aiming: he walks like normal crew
t2.dead=true;rifle.rifle.readyAt=0;const t3=foe(-6);g.step();
g.step([{id:heroId,type:'order',kind:'move',place:'street',units:[rifle.id],x:ax+8,z:az}]);
for(let i=0;i<10;i++)g.step();assert.equal(rifle.rifle.aim,undefined,'move order cancels aiming');assert.ok(['walk','run'].includes(rifle.anim),'and he moves');
assert.doesNotThrow(()=>JSON.stringify(st));
// fleeing keeps one escape spot (no new goal every tick) and prefers a clear straight line
{ const st2={tick:0},goals=[];const flee=createFlee({state:st2,moveTo:(e,u,x,z)=>{goals.push([x,z]);return true;},nearestFree:(x,z)=>[x,z],clearLine:(a,b)=>b.z>=a.z});
  const e={x:0,z:0,place:'street'},from={x:-2,z:0};
  for(let i=0;i<10;i++){st2.tick=i;e.x+=0.2;flee(e,{},from);}
  assert.ok(goals.every(g=>g[0]===goals[0][0]&&g[1]===goals[0][1]),'flee goal is stable');assert.ok(goals[0][1]>=0,'flee prefers a clear line'); }
// Real player commands: a fresh hero-party rifleman opens with his loaded gun,
// even at close range or on attack-move. Explicit bandit orders also use the gun.
for (const [kind, distance, type] of [['attack',1.8,'thug'],['attack',6,'thug'],['attackmove',6,'thug'],['attack',6,'bandit'],['attackmove',6,'bandit'],['reinforcement',6,'bandit']]) {
  for (const e of Object.values(st.entities)) if (e.id !== heroId) e.dead = true;
  const h = st.entities[heroId]; Object.assign(h,{x:ax,z:az+2,place:'street',holdFire:true});
  const u=st.entities[g.spawn('kuroda_rifleman','mercenary',ax,az,{owner:me,deployment:{group:'hero'},order:{kind:'follow',target:heroId}})];
  assert.ok(u.rifle?.readyAt <= st.tick,'new rifleman starts loaded immediately, including a late hire');
  assert.equal(u.rifle.firedAt,undefined,'new rifleman has no prior shot/reload');
  const t=st.entities[g.spawn(type,type==='bandit'?'bandit':'thug',ax+distance,az,{owner:type==='bandit'?WILD:rival,wild:type==='bandit',angry:{[me]:st.tick+200},deployment:{group:'hero'},order:{kind:'stop'},holdFire:true})];
  if(kind==='reinforcement')h.hitBy={id:t.id,tick:st.tick}; // joins after the original group attack was issued
  const shots=[],hits=[];
  for(let i=0;i<R.aimTicks+3;i++) {
    g.step(i===0&&kind!=='reinforcement'?[{id:heroId,type:'order',units:[u.id],kind,target:t.id,x:ax+7,z:az,place:'street'}]:[]);
    shots.push(...st.casts.filter(c=>c.kind==='rifleshot'&&c.a===u.id));
    hits.push(...st.hits.filter(hit=>hit.a===u.id));
  }
  assert.equal(shots[0]?.t,t.id,`${kind} at ${distance}: first attack is a shot at the ordered/detected target`);
  assert.equal(hits[0]?.kind,'rifle',`${kind} at ${distance}: no melee hit before the loaded shot`);
}
console.log('Rifleman: loaded spawns, close/ranged attack orders, attack-move, bandit targeting, auto aim, damage/stagger/heat, move priority and skirmish passed');
