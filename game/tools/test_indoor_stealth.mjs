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
for(const b of Object.values(g.state.businesses).filter(b=>b.kind==='teahouse')){
 const d=g.doors.find(d=>d.ninja&&d.business===b.id&&d.place===b.room);assert.ok(d,'every teahouse has a usable rear entrance');
 const front=g.doors.find(q=>!q.ninja&&q.place===b.room&&q.to),path=g.nav.findPath(front.x,front.z,d.x,d.z),end=path?.at(-1);
 assert.ok(end&&Math.hypot(end[0]-d.x,end[1]-d.z)<.6,'outside connects to public approach');
 const room=g.rooms.find(r=>r.name===b.room),nav=createNav(room.blockers,{minX:room.origin.x,minZ:room.origin.z,maxX:room.origin.x+room.size[0],maxZ:room.origin.z+room.size[1]},{...ROOM_NAV,pad:ROOM_NAV.pad*(room.template.characterScale||1)});
 const inside=nav.findPath(room.spawn.x,room.spawn.z,d.to.x,d.to.z)?.at(-1);assert.ok(inside&&Math.hypot(inside[0]-d.to.x,inside[1]-d.to.z)<.6,'inside is reachable rather than a wall pocket');checked++;
}
assert.ok(checked);console.log(`Indoor stealth: daytime snuff, room isolation, real detection reduction/dawn reset; ${checked} teahouse rear entries connected on both sides`);
