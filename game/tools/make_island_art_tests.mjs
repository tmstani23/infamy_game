// Build a compact dev-map tour from actual W3.9 placements, never invented coordinates.
import fs from 'node:fs';
import {buildChunk} from '../src/sim/chunk_gen.js';
import {islandBiome} from '../src/sim/island_art.js';
import {passable,terrainAt} from '../src/sim/world_data.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f+'.json',import.meta.url)));
const w=read('world'),cfg=read('world_chunks'),district=read('port_town'),groups=new Map(),cache=new Map();
function group(key,p,asset,detail){if(!groups.has(key))groups.set(key,[]);groups.get(key).push({p,asset,detail});}
// Dry regions currently contain no mountain cells: stage the missing art there for review.
const dryCases=[['cliff_dry_a','south'],['cliff_dry_a','east'],['cliff_dry_b','south'],['cliff_dry_b','east'],['corner_out_dry'],['corner_in_dry'],['rim_dry','north'],['rim_dry','west'],['outcrop_dry'],['top_dry']];
const dryLand=[];for(let z=2625;z<5375;z+=100)for(let x=3525;x<5225;x+=100)if(clear(x,z))dryLand.push({x,z});
const review=[];for(const [asset,edge]of dryCases){const spot=dryLand.find(p=>review.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>120));if(!spot)throw Error('No dry review location');review.push({art:asset,...spot,edge,flip:edge==='east'||edge==='west',review:true,...(asset==='top_dry'?{decal:true,groundTexture:true,width:50,height:50}:{})});}
review.push({art:'city_gate',x:w.capital.x+125,z:w.capital.z-117,review:true});
cfg.islandArt.reviewProps=review;cfg.islandArt.reviewEnabled=true;cfg.islandArt.reviewNote='Temporary dry-art review samples for W3.9; dry regions currently have no mountain cells. Visual-only, no navigation changes. Remove after review.';
fs.writeFileSync(new URL('../data/world_chunks.json',import.meta.url),JSON.stringify({...cfg,islandArt:{...cfg.islandArt,reviewEnabled:false}},null,2)+'\n');
for(let cz=0;cz<Math.ceil(w.size.h/cfg.chunk);cz++)for(let cx=0;cx<Math.ceil(w.size.w/cfg.chunk);cx++){
  const c=buildChunk(w,cfg,cx,cz);
  for(const p of c.art){
    if(p.top)continue;
    let key=p.art+(p.edge?'_'+p.edge:'');
    if(p.art==='lake_edge')key+='_'+Math.round((p.angle||0)/Math.PI*2)%4;
    group(key,p,p.art,`${p.review?(p.art==='city_gate'?'GATE REVIEW · ':'DRY REVIEW · '):''}${p.art.replaceAll('_',' ')}${p.edge?' · '+p.edge+(p.flip?' (mirrored)':''):''}`);
  }
  for(let j=0;j<c.cells.length;j++)for(let i=0;i<c.cells[j].length;i++)if(c.cells[j][i]==='m'){
    const x=c.x0+(i+.5)*w.terrain.cell,z=c.z0+(j+.5)*w.terrain.cell,b=islandBiome(w,x,z);
    if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>passable(w,x+dx*w.terrain.cell,z+dz*w.terrain.cell)))group('top_'+b,{x,z},'top_'+b,`${b} high-ground texture · view across the cliff top`);
  }
}
function clear(x,z){
  if(!passable(w,x,z))return false;
  const k=Math.floor(x/cfg.chunk)+','+Math.floor(z/cfg.chunk);
  if(!cache.has(k)){const [cx,cz]=k.split(',').map(Number);cache.set(k,buildChunk(w,cfg,cx,cz));}
  return !cache.get(k).blockers.some(b=>x+1.5>b.minX&&x-1.5<b.maxX&&z+1.5>b.minZ&&z-1.5<b.maxZ);
}
function landing(p){
  const direction={south:[0,1],east:[1,0],north:[0,-1],west:[-1,0]}[p.edge];
  const angles=direction?[Math.atan2(direction[1],direction[0])]:Array.from({length:16},(_,i)=>i*Math.PI/8);
  for(const radius of [8,12,18,25,35,45,55,65])for(const a of angles){const x=Math.round(p.x+Math.cos(a)*radius)+.5,z=Math.round(p.z+Math.sin(a)*radius)+.5;if(clear(x,z))return {x,z};}
  return null;
}
const stops=[];
for(const [key,candidates]of [...groups].sort(([a],[b])=>a.localeCompare(b))){
  candidates.sort((a,b)=>Math.hypot(a.p.x-w.capital.x,a.p.z-w.capital.z)-Math.hypot(b.p.x-w.capital.x,b.p.z-w.capital.z));
  for(const c of candidates){const spot=landing(c.p);if(!spot)continue;stops.push({key,asset:c.asset,label:c.detail,x:spot.x,z:spot.z,focus:{x:c.p.x,z:c.p.z},travel:spot});break;}
}
const gd=district.islandGate,o=w.capital.cityOffset||{},cityX=w.capital.x+(o.x||0),cityZ=w.capital.z+(o.z||0),gx=cityX+district.bounds.maxX+(gd.out||5),gz=cityZ+gd.z;
stops.push({key:'gate_city',asset:'city_gate_se',label:'Town gate · city side',x:gx,z:gz,travel:{city:true}},
  {key:'gate_island',asset:'city_gate_se',label:'Town gate · island side',x:gx+5,z:gz,focus:{x:gx,z:gz},travel:{x:gx+5,z:gz}});
stops.forEach((p,i)=>{p.id='T'+String(i+1).padStart(2,'0');p.kind='arttest';});
fs.writeFileSync(new URL('../data/island_art_tests.json',import.meta.url),JSON.stringify({version:1,_note:'Dev-map art review tour generated from actual placements. Regenerate with game/tools/make_island_art_tests.mjs after world/art changes.',stops},null,2)+'\n');
console.log(`Art tour: ${stops.length} stops; ${new Set(stops.map(s=>s.asset)).size} asset types`);
