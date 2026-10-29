import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { createDiversion,DIVERSION } from '../src/sim/diversion.js';
import { charmProtected,allowCharmAttack } from '../src/sim/charm_rules.js';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
function mini(){
 const a={id:'a',type:'shinobi_geisha',owner:'p',x:0,z:0,place:'street',deployment:{group:'hero'},order:{kind:'stop'}};
 const h={id:'h',type:'hero',owner:'p',x:1,z:0,place:'street',order:{kind:'stop'}};
 const mate={id:'m',type:'ninja',owner:'p',x:2,z:0,place:'street',deployment:{group:'hero'},order:{kind:'stop'}};
 const state={tick:100,entities:{a,h,m:mate},clans:{p:{},q:{}},casts:[]};let visible=true,attacks=0;
 const enemy=(id,x,target)=>state.entities[id]={id,type:'thug',owner:'q',x,z:0,place:'street',order:target?{kind:'attack',target}:{kind:'stop'}};
 const clearCombat=e=>{delete e.swing;delete e.attackTarget;};
 const d=createDiversion({state,deployment:{canOccupy:()=>true},vision:{canSee:()=>visible},reveal(){},clearCombat,hostile:(a,b)=>a.owner!==b.owner,
  moveTo(e,u,x,z){e.x+=(x-e.x)*.25;e.z+=(z-e.z)*.25;e.anim='walk';return true;},attackStep(){attacks++;}});
 return {a,h,mate,state,d,enemy,hide:()=>visible=false,attacks:()=>attacks};
}
{
 const f=mini(),self=f.enemy('self',4,'a'),hero=f.enemy('hero',1,'h'),group=f.enemy('group',.5,'m');f.enemy('idle',.2);
 f.a.swing={target:group.id};f.a.order={kind:'attack',target:group.id};
 assert.equal(f.d.step(f.a,{}),true);assert.equal(f.a.lure.target,self.id,'her own attacker has priority over closer threats');assert.equal(f.a.swing,undefined,'charm interrupts melee');
 assert.equal(f.a.lure.readyAt,300);assert.equal(self.buffs.charmSnare.speed,.25);assert.equal(self.distracted,undefined);
 f.state.tick+=20;f.d.step(f.a,{});assert.equal(self.distracted.until,240,'six-second charm begins at cast completion');
 const before={x:self.x,z:self.z};f.d.step(self,{});
 assert.ok(Math.hypot(self.x-before.x,self.z-before.z)>.01,'charmed enemy wanders');
 assert.ok(Math.hypot(self.x-self.distracted.x,self.z-self.distracted.z)<=3,'wander stays local');
 for(let i=0;i<100;i++){f.state.tick++;f.d.step(self,{});assert.ok(Math.hypot(self.x-self.distracted.x,self.z-self.distracted.z)<=3.001,'wander never drifts beyond the original three-metre radius');}
 assert.equal(charmProtected(f.mate,self,f.state),true);allowCharmAttack(f.mate,self,f.state);assert.equal(charmProtected(f.mate,self,f.state),false);
 self.distracted.at++;assert.equal(charmProtected(f.mate,self,f.state),true,'old explicit click cannot override a future charm');
}
{
 const f=mini(),self=f.enemy('self',4,'a'),hero=f.enemy('hero',1,'h');f.enemy('group',.5,'m');
 f.mate.swing={target:self.id};f.d.step(f.a,{});assert.equal(f.a.lure.target,hero.id,'skip ally focus, then protect hero');
 const g=mini();g.enemy('hero',5,'h');g.enemy('group',1,'m');g.d.step(g.a,{});assert.equal(g.a.lure.target,'hero','hero priority beats distance');
 const idle=mini();idle.enemy('idle',1);assert.equal(idle.d.step(idle.a,{}),false,'no charm on bystanders');
}
{
 const f=mini();f.enemy('e',4,'a');f.a.lure={readyAt:200};
 assert.equal(f.d.step(f.a,{}),true);assert.equal(f.attacks(),1,'normal melee between charms');
 assert.equal(f.state.casts.length,0);f.state.tick=200;f.d.step(f.a,{});assert.equal(f.a.lure.casting,true);
}
for(const interrupt of [
 f=>f.a.dead=true,f=>f.a.downed=true,f=>f.a.jailed={},f=>f.a.buffs.stunned={until:999},
 f=>f.a.taunted={until:999},f=>f.a.order={kind:'move'},f=>f.a.order={kind:'follow',regrouping:true},
 f=>f.a.holdFire=true,f=>f.a.smokePassive=true,f=>f.a.deployment.transfer={to:'home'},
 f=>f.mate.swing={target:'e'},f=>f.state.entities.e.dead=true,f=>f.state.entities.e.place='other',
 f=>f.state.entities.e.x=9,f=>f.hide()
]){
 const f=mini(),e=f.enemy('e',4,'a');f.d.step(f.a,{});const ready=f.a.lure.readyAt;
 interrupt(f);f.d.tick();assert.equal(e.buffs.charmSnare,undefined);assert.equal(f.a.lure.casting,false);assert.equal(f.a.lure.readyAt,ready);
}
{
 const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),
 interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json'),
 settings:{...read('data/settings.json'),dayNight:{auto:false}}});
 const {heroId}=setupMatch(g,{clan:'shinobi',difficulty:'easy',bots:read('data/bots.json')}),st=g.state,h=st.entities[heroId];
 const rival=Object.keys(st.clans).find(id=>id!=='player');
 assert.notEqual(g.clans.hirePrice('player','shinobi_geisha'),null);assert.equal(g.clans.hirePrice(rival,'shinobi_geisha'),null);
 for(const e of Object.values(st.entities)){e.holdFire=true;if(e.owner!=='player')e.dead=true;}
 const p=st.deployment.sectors[0].anchor;Object.assign(h,{x:p.x,z:p.z,place:'street'});
 const foe=st.entities[g.spawn('thug','thug',p.x+4,p.z,{owner:rival,holdFire:true,deployment:{group:'hero'},order:{kind:'attack',target:heroId}})];
 foe.hp=foe.maxHp=1000;
 const a=st.entities[g.spawn('shinobi_geisha','shinobi_geisha',p.x,p.z,{owner:'player',deployment:{group:'hero'},order:{kind:'attack',target:foe.id,prev:{kind:'follow',target:heroId}}})];
 const advance=commands=>{for(const e of Object.values(st.entities))if(e.guard)e.dead=true;g.step(commands);};
 for(let i=0;i<30&&!foe.distracted;i++)advance();
 assert.equal(foe.distracted?.source,a.id,'real cast completes while interrupting own melee');assert.notEqual(a.order.kind,'attack','ally target dropped at charm completion');
 const until=foe.distracted.until,start={x:foe.x,z:foe.z},hp=foe.hp;
 const ally=st.entities[g.spawn('ninja','ninja_grunt',p.x+1,p.z,{owner:'player',deployment:{group:'hero'},order:{kind:'attackmove',x:foe.x,z:foe.z}})];
 for(let i=0;i<25;i++)advance();
 assert.equal(foe.hp,hp,'allied autoattacks leave charmed enemy alone');assert.ok(Math.hypot(foe.x-start.x,foe.z-start.z)>.1,'real wandering moves the target');
 advance([{id:heroId,type:'order',kind:'attack',units:[ally.id],target:foe.id,place:'street'}]);
 for(let i=0;i<40&&foe.hp===hp;i++)advance();assert.ok(foe.hp<hp,'fresh direct attack overrides charm protection');
 const hitHp=foe.hp;
 advance([{id:heroId,type:'order',kind:'attackmove',units:[ally.id],x:foe.x,z:foe.z,place:'street'}]);
 for(let i=0;i<15;i++)advance();assert.equal(foe.hp,hitHp,'replacing direct attack removes its override');
 while(st.tick<=until)advance();assert.equal(foe.distracted,undefined,'charm expires after six seconds');
 assert.equal(DIVERSION.cooldownTicks,200);assert.doesNotThrow(()=>JSON.stringify(st));
}
console.log('Geisha: 6s/10s priority charm, own-melee interruption, group/hero priorities, ally focus, melee between casts, local wandering, autoattack protection/direct override, interruptions and expiry passed');
