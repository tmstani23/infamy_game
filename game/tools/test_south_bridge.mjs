import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const district = data('data/port_town.json');
const g = createGame({ district, catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json') });
assert.ok(district.walkShapes.some(r => r[0] === -85 && r[1] === -23.8), 'third crossing is south of the existing lower bridge');
assert.ok(g.nav.clearLine(-85,-22,-77,-22) && g.nav.clearLine(-77,-22,-85,-22));
for (const z of [-27,-17]) assert.ok(!g.nav.free(-81,z), 'nearby river remains impassable');
for (const [a,b] of [
  [[-97.9,55],[-95,20]], [[-95,20],[-99,7]], [[-99,7],[-103,9]],
  [[-99,7],[-89.25,-8.75]], [[-89.25,-8.75],[-88.25,-14.25]],
  [[-88.25,-14.25],[-87.75,-18.75]], [[-87.75,-18.75],[-85,-22]],
  [[-77,-22],[-62,-7]], [[-62,-7],[6,8]]
]) assert.ok(g.nav.findPath(...a,...b)?.length, `village, camp, southern crossing and main streets connect: ${a} to ${b}`);
const trails = district.ground.filter(r => r[0] === 'dirt' && r[1]?.line?.some(p => p[1] === -22));
for (const [,shape] of trails) for (let i=1;i<shape.line.length;i++)
  assert.ok(g.nav.clearLine(...shape.line[i-1],...shape.line[i]), 'painted trail avoids solid props');
g.clans.addClan('player');
const hero = g.spawn('hero','ronin',-86,-22,{owner:'player',holdFire:true});
for (const type of ['thug','brute','ninja']) {
  const id = g.spawn(type,type === 'ninja' ? 'ninja_grunt' : type,-85.5,-22,{owner:'player',holdFire:true,order:{kind:'stop'}});
  const crew = g.state.entities[id];
  for (const x of [-76,-86]) {
    g.step([{id:hero,type:'order',kind:'move',units:[id],x,z:-22}]);
    for (let i=0;i<160 && !crew.order.arrived;i++) g.step();
    assert.ok(crew.order.arrived && Math.abs(crew.x-x)<.8, `${type} traverses the crossing in both directions`);
  }
  delete g.state.entities[id];
}
console.log('Southern bridge: both banks/camp/village/main streets connected, clear trails, adjacent water blocked and all crew sizes cross both ways');
