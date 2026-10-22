import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const district = data('data/port_town.json');
const g = createGame({ district, catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json') });
assert.ok(g.nav.clearLine(-87.5,78,-78.5,78) && g.nav.clearLine(-78.5,78,-87.5,78), 'both banks have a clear crossing');
for (const z of [73,82]) assert.ok(!g.nav.free(-83,z), 'water beside the new bridge stays blocked');
const trails = district.ground.filter(r => r[0] === 'dirt' && r[1]?.line?.some(p => p[1] === 78));
assert.equal(trails.length, 3, 'village, small camp and forest trail approaches');
for (const [,shape] of trails) for (let i=1;i<shape.line.length;i++)
  assert.ok(g.nav.clearLine(...shape.line[i-1],...shape.line[i]), 'painted approaches avoid solid props');
for (const [a,b] of [
  [[-97.9,55],[-94.75,69.75]], [[-96.25,84.75],[-87.5,78]],
  [[-78.5,78],[-72,47]], [[-72,47],[-52,40]], [[-52,40],[6,8]]
]) assert.ok(g.nav.findPath(...a,...b)?.length, 'HQ, screenshot camp, forest bank and main town are connected');
const mushrooms = district.glowShrooms.filter(([x,z]) => x>=-87.5 && x<=-78.5 && z>=76.2 && z<=79.8);
assert.equal(mushrooms.length, 12, 'matching mushrooms line both plank edges');
g.clans.addClan('player');
const hero = g.spawn('hero','ronin',-88.5,78,{owner:'player',holdFire:true});
for (const type of ['thug','brute','ninja']) {
  const id = g.spawn(type,type==='ninja'?'ninja_grunt':type,-88,78,{owner:'player',holdFire:true,order:{kind:'stop'}});
  const crew = g.state.entities[id];
  for (const x of [-77.5,-88.5]) {
    g.step([{id:hero,type:'order',kind:'move',units:[id],x,z:78}]);
    for (let i=0;i<180 && !crew.order.arrived;i++) g.step();
    assert.ok(crew.order.arrived && Math.abs(crew.x-x)<.8, `${type} crosses both ways`);
  }
  delete g.state.entities[id];
}
console.log('Screenshot-bank bridge: clear approaches, village/camp/town links, mushrooms, blocked adjacent water and all crew sizes crossing both ways');
