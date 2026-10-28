import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStealth,indoorLightId} from '../src/sim/stealth.js';
import {createGame} from '../src/sim/game.js';
import {createNav,ROOM_NAV} from '../src/sim/nav.js';
{
 const h={id:'h',owner:'p',type:'hero',x:1,z:0,place:'a',anim:'walk'},state={tick:0,night:false,clans:{p:{id:'p',kind:'ninja'}},entities:{h},casts:[],news:[]};
 const room=name=>({name,origin:{x:0,z:0},props:[{cx:1,cz:0,def:{light:{radius:5}}}]}),stealth=createStealth({state,scenery:[],rooms:[room('a'),room('b')]});
 stealth.tick();const before=h.stealthStatus.range;
 assert.equal(stealth.snuffable(h)?.prop,indoorLightId('a',0),'indoor light can be snuffed during daytime');
 stealth.snuff(h,indoorLightId('a',0));state.tick=20;stealth.tick();
 assert.ok(state.lightsOut.includes(indoorLightId('a',0)));assert.ok(!state.lightsOut.includes(indoorLightId('b',0)),'same-position light in another room stays lit');
 assert.equal(h.stealthStatus.range,before/2,'dark room reduces actual detection distance');assert.match(h.stealthStatus.lighting,/dark/);
 h.anim='run';stealth.tick();assert.equal(h.stealthStatus.range,before,'running still increases exposure in darkness');
 state.dawn=true;state.tick++;stealth.tick();assert.equal(state.lightsOut.length,0,'dawn relights indoor lanterns');
}
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json')});
let checked=0;
for(const b of Object.values(g.state.businesses).filter(b=>b.room)){
 const d=g.doors.find(d=>d.ninja&&d.business===b.id&&d.place===b.room);assert.ok(d,`${b.id} ${b.kind} has a usable rear entrance`);
 const front=g.doors.find(q=>!q.ninja&&q.place===b.room&&q.to),path=g.nav.findPath(front.x,front.z,d.x,d.z),end=path?.at(-1);
 assert.ok(end&&Math.hypot(end[0]-d.x,end[1]-d.z)<.6,'outside connects to public approach');
 const room=g.rooms.find(r=>r.name===b.room),nav=createNav(room.blockers,{minX:room.origin.x,minZ:room.origin.z,maxX:room.origin.x+room.size[0],maxZ:room.origin.z+room.size[1]},{...ROOM_NAV,pad:ROOM_NAV.pad*(room.template.characterScale||1)});
 const inside=nav.findPath(room.spawn.x,room.spawn.z,d.to.x,d.to.z)?.at(-1);assert.ok(inside&&Math.hypot(inside[0]-d.to.x,inside[1]-d.to.z)<.6,'inside is reachable rather than a wall pocket');checked++;
 for(const p of [d,d.to])assert.ok(!g.blockers.some(k=>Math.hypot(Math.max(k.minX-p.x,0,p.x-k.maxX),Math.max(k.minZ-p.z,0,p.z-k.maxZ))<1.3),`${b.kind}: entire back-window ring clears walls and furniture`);
 if(b.kind==='teahouse'){
  g.clans.addClan('probe',{kind:'ninja'});
  for(const e of Object.values(g.state.entities))e.holdFire=true;
  const start=g.nav.nearestFree(front.x,front.z),id=g.spawn('hero','ninja_leader',...start,{owner:'probe',holdFire:true}),h=g.state.entities[id];
  function walkTo(grid,goal){
   const route=grid.findPath(h.x,h.z,goal.x,goal.z);assert.ok(route?.length,'physical approach has a route');
   let k=0;
   for(let n=0;n<1600&&k<route.length;n++){
    const [x,z]=route[k],dx=x-h.x,dz=z-h.z,len=Math.hypot(dx,dz);
    if(len<.14){k++;continue;}
    g.step([{id,type:'move',right:(dx-dz)*Math.SQRT1_2/len,down:(dx+dz)*Math.SQRT1_2/len,walk:true}]);
   }
   assert.ok(Math.hypot(h.x-goal.x,h.z-goal.z)<.3,`actual movement reaches back window: ${h.x},${h.z} vs ${goal.x},${goal.z}`);
   g.step([{id,type:'move',right:0,down:0}]);
  }
  walkTo(g.nav,d);assert.equal(g.doorNear(id),d);
  g.step([{id,type:'use',units:[]}]);assert.equal(h.place,b.room,'Space enters from the real street approach');
  assert.ok(nav.free(h.x,h.z));
  walkTo(nav,room.spawn);walkTo(nav,d.to);
  g.step([{id,type:'use',units:[]}]);assert.equal(h.place,'street','Space exits after walking through the actual room');
 }
}
assert.ok(checked);console.log(`Indoor stealth: daytime snuff, room isolation, real detection reduction/dawn reset; ${checked} rear entries clear on both sides; actual teahouse approach, entry and exit passed`);
