import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildChunk} from '../src/sim/chunk_gen.js';
import {createWorldMap,worldToCanvas} from '../src/world_map.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f+'.json',import.meta.url)));
const world=read('world'),cfg=read('world_chunks'),stops=read('island_art_tests').stops,assets=new Set(stops.map(p=>p.asset)),cache=new Map();
assert.equal(cfg.islandArt.reviewEnabled,false,'review scenery is off in production data');cfg.islandArt.reviewEnabled=true;
for(const b of ['forest','snow','dry']){
  for(const variant of ['a','b'])for(const edge of ['south','east'])assert.ok(stops.some(p=>p.key===`cliff_${b}_${variant}_${edge}`));
  for(const edge of ['north','west'])assert.ok(stops.some(p=>p.key===`rim_${b}_${edge}`));
  for(const name of [`corner_in_${b}`,`corner_out_${b}`,`top_${b}`,`outcrop_${b==='forest'?'moss':b}`])assert.ok(assets.has(name));
}
for(const name of ['pass_gate','river_ford','lake_edge','city_gate','city_gate_se'])assert.ok(assets.has(name));
assert.ok(stops.some(p=>p.key==='gate_city')&&stops.some(p=>p.key==='gate_island'));
assert.equal(new Set(stops.map(p=>p.id)).size,stops.length);
for(const p of stops){
  if(p.travel.city)continue;
  const {x,z}=p.travel,key=Math.floor(x/cfg.chunk)+','+Math.floor(z/cfg.chunk);
  if(!cache.has(key)){const [cx,cz]=key.split(',').map(Number);cache.set(key,buildChunk(world,cfg,cx,cz));}
  assert.ok(!cache.get(key).blockers.some(b=>x+.35>b.minX&&x-.35<b.maxX&&z+.35>b.minZ&&z-.35<b.maxZ),p.id+' has a safe landing');
}
// Review markers are deliberately visible above fog only when supplied by the dev UI.
const canvas={width:1400,height:800,getContext:()=>({})},sample=stops[0];
const map=createWorldMap({canvas,world,getState:()=>({discovered:'0',artTests:[sample]})}),p=worldToCanvas(sample.x,sample.z,map.view);
assert.equal(map.hit(p.px,p.py).id,sample.id);
const normal=createWorldMap({canvas,world,getState:()=>({discovered:'0'})});assert.notEqual(normal.hit(p.px,p.py)?.kind,'arttest');
console.log(`test_island_art_tests: ok (${stops.length} stops, ${assets.size} assets, all orientations, safe landings and dev marker hits)`);
