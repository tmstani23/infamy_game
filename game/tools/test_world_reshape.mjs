// Approved structural reshape invariants; accepts a candidate before live write.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyWorldReshape, pointInside, nearestSegment } from '../../tools/lib/world_reshape.mjs';
import { passable, buildable, validateWorld } from '../src/sim/world_data.js';
const read=p=>JSON.parse(fs.readFileSync(p));
const file=process.argv[2]||'game/data/world.json',world=read(file);
const recipe=read('docs/images/frontier/blueprint/world_reshape_v1.json');
const base=read('docs/images/frontier/blueprint/world_blueprint_v2.json');
const frozen=read('assets/environment/island/reshape/reshape_baseline_v1.json');
const saved=structuredClone(base),one=applyWorldReshape(base,recipe),two=applyWorldReshape(base,recipe);
assert.deepEqual(one,two,'identical source produces identical geometry');
assert.deepEqual(base,saved,'compiler must not mutate the original blueprint');
assert.deepEqual(world.coast,base.coast);assert.deepEqual(world.islets,base.islets);
assert.deepEqual(world.capital,frozen.protected.capital,'capital and port retained');
assert.deepEqual(world.riverSources,frozen.protected.riverSources,'source anchors retained');
assert.equal(world.ranges.length,6);assert.equal(world.passes.length,20);assert.equal(world.fords.length,17);
assert.equal(world.fords.filter(f=>f.kind==='bridge').length,9);
for(const [key,pins]of Object.entries(recipe.pinned)){
 assert.equal(world[key].length,pins.length,`${key} inventory changed`);
 for(const pin of pins){const actual=world[key].find(p=>p.id===pin.id);assert.ok(actual,`${key}/${pin.id} lost`);
  assert.equal(actual.x,pin.x);assert.equal(actual.z,pin.z);
  if(key==='sites')assert.ok(buildable(world,pin.x,pin.z),`site ${pin.id} lost buildable ground`);
  if(['camps','setPieces','nativeVillageSlots','passes','fords'].includes(key))assert.ok(passable(world,pin.x,pin.z),`${key}/${pin.id} is blocked`);
 }
}
const T=world.terrain.cell,raw=(x,z)=>world.terrain.rows[Math.floor(z/T)]?.[Math.floor(x/T)];
for(const lake of world.lakes){
 assert.ok(lake.outline?.length>20&&lake.bounds?.length===4,'authored irregular lake outline/bounds missing');
 const radii=lake.outline.map(p=>Math.hypot(p[0]-lake.x,p[1]-lake.z));
 assert.ok(Math.max(...radii)-Math.min(...radii)>100,'lake must not be a radius stamp');
 const widths=new Set();
 for(let z=Math.floor(lake.bounds[1]/T)*T+T/2;z<lake.bounds[3];z+=T){let count=0;
  for(let x=Math.floor(lake.bounds[0]/T)*T+T/2;x<lake.bounds[2];x+=T){
   if(pointInside(lake.outline,x,z)){assert.equal(raw(x,z),'w',`${lake.id} outline/raster disagreement`);count++;}
  }if(count)widths.add(count);
 }assert.ok(widths.size>=5,'lake basin has no width variation');
}
const river=world.rivers.find(r=>r.id==='V4'),old=frozen.originalRivers.find(r=>r.id==='V4');
assert.deepEqual(river.points[0],old.points[0]);assert.deepEqual(river.points.at(-1),old.points.at(-1));
for(const f of world.fords.filter(f=>f.river==='V4'))assert.ok(nearestSegment(river.points,f.x,f.z).d<1,`${f.id} no longer on channel`);
// Raster connectivity, independently of the metadata centerline: the source
// pool and every channel segment must belong to the same eight-neighbor water.
const NX=world.terrain.rows[0].length,NZ=world.terrain.rows.length,wet=c=>'wr'.includes(c||' ');
const seen=new Set(),queue=[[Math.floor(river.points[0][0]/T),Math.floor(river.points[0][1]/T)]];
for(let at=0;at<queue.length;at++){
 const [x,z]=queue[at],key=z*NX+x;
 if(x<0||z<0||x>=NX||z>=NZ||seen.has(key)||!wet(world.terrain.rows[z][x]))continue;
 seen.add(key);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if(dx||dz)queue.push([x+dx,z+dz]);
}
for(const [x,z]of river.points){let connected=false;
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if(seen.has((Math.floor(z/T)+dz)*NX+Math.floor(x/T)+dx))connected=true;
 assert.ok(connected,`V4 raster disconnected near ${x},${z}`);
}
for(const r of world.rivers.filter(r=>r.id!=='V4'))assert.deepEqual(r,frozen.originalRivers.find(old=>old.id===r.id),'unrelated river changed');
for(const stream of world.streams.filter(s=>s.river==='V4'))assert.ok(nearestSegment(river.points,...stream.points.at(-1)).d<2,'V4 feeder stream disconnected from new centerline');
for(const range of world.ranges){assert.equal(range.spine.length,range.halfWidths.length);assert.ok(Math.max(...range.halfWidths)-Math.min(...range.halfWidths)>100,'untapered range');}
assert.deepEqual(validateWorld(world),[],'candidate world failed access/terrain validation');
console.log(`test_world_reshape: passed (${file}; pinned inventories, deterministic geometry, irregular lakes, V4 anchors/feeders, routes and capital)`);
