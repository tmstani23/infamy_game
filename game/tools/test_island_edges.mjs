import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildChunk} from '../src/sim/chunk_gen.js';
import {slideWorld} from '../src/sim/world_slide.js';
import {terrainAt,passable} from '../src/sim/world_data.js';
import {islandArt} from '../src/sim/island_art.js';
import {placePiece} from '../src/sim/geometry.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const w=read('data/world.json'),cfg=read('data/world_chunks.json'),catalog=read('data/art.json'),cuts=read('art/cutouts.json'),T=w.terrain.cell,r=.35;
const choices=[];
for(let z=T/2;z<w.size.h;z+=T)for(let x=T/2;x<w.size.w;x+=T){
  if(passable(w,x,z))continue;
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])if(passable(w,x+dx*T,z+dz*T))choices.push({x:x+dx*(T/2+r+.001),z:z+dz*(T/2+r+.001),dx,dz,code:terrainAt(w,x,z)});
}
assert.ok(choices.length>=200);
const cache=new Map(),chunk=(cx,cz)=>{const k=cx+','+cz;if(!cache.has(k))cache.set(k,buildChunk(w,cfg,cx,cz));return cache.get(k);};
const boxes=(x0,z0,x1,z1)=>{const out=[];for(let cz=Math.floor(z0/cfg.chunk);cz<=Math.floor(z1/cfg.chunk);cz++)for(let cx=Math.floor(x0/cfg.chunk);cx<=Math.floor(x1/cfg.chunk);cx++)out.push(...chunk(cx,cz).blockers.filter(b=>b.kind==='terrain'));return out;};
const blocked=(x,z)=>boxes(x-r,z-r,x+r,z+r).some(b=>x+r>b.minX&&x-r<b.maxX&&z+r>b.minZ&&z-r<b.maxZ);
const sample=Array.from({length:200},(_,i)=>choices[Math.floor(i*choices.length/200)]);
assert.ok(sample.some(p=>p.code==='m')&&sample.some(p=>p.code==='w'),'mountain and water sampled');
for(const p of sample)for(let d=0;d<8;d++){
  let [x,z]=[p.x,p.z];const dx=Math.cos(d*Math.PI/4)*.3,dz=Math.sin(d*Math.PI/4)*.3;
  for(let k=0;k<60;k++){[x,z]=slideWorld(x,z,r,dx,dz,boxes,cfg.islandArt.cornerSlip);assert.ok(!blocked(x,z),'never enters blocked terrain');}
  const inward=dx*p.dx+dz*p.dz<-.01,tangent=Math.abs(dx*p.dz-dz*p.dx)>.01;
  if(inward&&tangent)assert.ok(Math.hypot(x-p.x,z-p.z)>=6*.5*3-.05,'diagonal wall press keeps at least half run speed');
  const before=[x,z];for(let k=0;k<20;k++){[x,z]=slideWorld(x,z,r,p.dx*.3,p.dz*.3,boxes,cfg.islandArt.cornerSlip);assert.ok(!blocked(x,z));}
  assert.ok(Math.hypot(x-before[0],z-before[1])>5.5,'clears away within one second');
}
// A near corner rounds without a backwards jump, speed boost, or crossing a second wall.
const wall={minX:0,maxX:10,minZ:0,maxZ:10};let x=-r-.001,z=9.9;
for(let k=0;k<8;k++){const old=[x,z];[x,z]=slideWorld(x,z,r,.3,0,()=>[wall]);assert.ok(Math.hypot(x-old[0],z-old[1])<=.30001);assert.ok(!(x+r>0&&x-r<10&&z+r>0&&z-r<10));}
assert.ok(x>0&&z>=10+r,'rounds a near convex corner');
const straight=slideWorld(-r-.001,5,r,.3,0,()=>[wall]);assert.ok(straight[0]<0&&straight[1]===5,'does not teleport along a wall');
const all=[];
for(const [cx,cz]of [[10,5],[20,10],[30,15],[40,20],[50,10]]){
  const a=buildChunk(w,cfg,cx,cz);assert.deepEqual(a,buildChunk(w,cfg,cx,cz));all.push(...a.art);
  for(const p of a.art){assert.ok(p.x>=a.x0&&p.x<a.x0+cfg.chunk&&p.z>=a.z0&&p.z<a.z0+cfg.chunk,'one owning chunk');assert.ok(catalog.items[p.art]&&cuts['props/'+p.art]);}
}
assert.ok(all.length);
// Synthetic topology: south/east outer corner and a concave notch across a chunk edge.
const tiny={seed:1,size:{w:150,h:150},terrain:{cell:50,rows:['ppp','pmp','ppp']},regions:[],passes:[],fords:[],lakes:[]};
const art=islandArt(tiny,{...cfg,chunk:50},2,2);assert.equal(art.filter(p=>p.art==='corner_out_forest').length,1);
tiny.terrain.rows=['ppp','pmm','pmp'];assert.equal(islandArt(tiny,{...cfg,chunk:50},2,2).filter(p=>p.art==='corner_in_forest').length,1,'L-shaped high ground has one concave corner');
tiny.terrain.rows=['ppp','pmm','ppp'];assert.equal(islandArt(tiny,{...cfg,chunk:50},2,2).filter(p=>p.art==='corner_in_forest').length,0,'straight edge has no false inner corner');
for(const p of all.filter(p=>!p.decal)){const piece=placePiece({name:p.art,x:p.x,z:p.z,flip:p.flip},catalog,cuts);assert.ok(piece&&piece.k>0);}
console.log('test_island_edges: ok (200 edges × 8 directions, 3s press + 1s escape; deterministic art and corner slip)');
