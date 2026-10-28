import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame} from '../src/sim/game.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
function make(){const units=read('data/units.json');units.rules.houseGuards.count=0;units.rules.houseGuards.hideoutCount=0;
 const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units});g.clans.addClan('p');g.clans.addClan('r');return g;}
const g=make(),b=Object.values(g.state.businesses).find(b=>b.kind==='teahouse'),d=g.doors.find(d=>!d.ninja&&d.place===b.room&&d.to),S=g.state.entities;
const h=g.spawn('hero','ronin',d.x,d.z,{owner:'p',holdFire:true}),u=g.spawn('thug','thug',d.x+.5,d.z,{owner:'p'}),t=g.spawn('hero','ronin',d.x,d.z,{owner:'r',holdFire:true,hp:10000,maxHp:10000});
g.step();g.step([{id:h,type:'order',units:[u],kind:'attack',target:t,place:'street'}]);assert.equal(S[u].order.target,t);
g.step([{id:t,type:'use',units:[]}]);assert.equal(S[t].place,b.room);
for(let i=0;i<300&&S[u].place!==b.room;i++)g.step();
assert.equal(S[u].place,b.room,'crew follow their explicit attack through the entrance');assert.equal(S[u].order.target,t);
const room=g.rooms.find(r=>r.name===b.room);Object.assign(S[t],{x:room.exit.x,z:room.exit.z});g.step();g.step();
g.step([{id:t,type:'use',units:[]}]);assert.equal(S[t].place,'street');
for(let i=0;i<300&&S[u].place!=='street';i++)g.step();
assert.equal(S[u].place,'street','crew follow the same attack back outside');assert.equal(S[u].order.target,t);
{
 const g=make(),home=Object.values(g.state.businesses).find(b=>b.hideout&&b.room);home.hideout='r';g.clans.setOwner(home.id,'r');
 const d=g.doors.find(d=>!d.ninja&&d.place===home.room&&d.to),E=g.state.entities;
 const h=g.spawn('hero','ronin',d.x,d.z,{owner:'p',holdFire:true}),u=g.spawn('thug','thug',d.x+.5,d.z,{owner:'p'}),t=g.spawn('hero','ronin',d.x,d.z,{owner:'r',holdFire:true,hp:10000,maxHp:10000});
 g.step();g.step([{id:h,type:'order',kind:'attack',target:t,units:[u],place:'street'}]);g.step([{id:t,type:'use',units:[]}]);
 assert.equal(E[t].place,home.room);for(let i=0;i<20;i++)g.step();assert.equal(E[u].place,'street','pursuit never bypasses rival HQ entry permission');assert.match(g.state.clans.p.notice.text,/hideout/);
}
console.log('Door pursuit: explicit crew attack survives physical entrance and exit with the same target');
