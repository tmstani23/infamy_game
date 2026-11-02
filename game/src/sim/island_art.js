// Deterministic art records for a chunk. Terrain/blockers remain authoritative.
import {terrainAt,passable} from './world_data.js';

export function islandBiome(world,x,z){
  const region=world.regions?.find(r=>x>=r.box[0]&&x<r.box[2]&&z>=r.box[1]&&z<r.box[3]);
  return region?.biome==='snow'?'snow':region?.biome==='dry'?'dry':'forest';
}
// Legacy pass metadata can sit in open fields after a blueprint update.
// Only draw a gateway where actual terrain flanks a walkable crossing.
export function islandPassFits(world,p){
  const t=world.terrain.cell,m=(dx,dz)=>terrainAt(world,p.x+dx*t,p.z+dz*t)==='m';
  return passable(world,p.x,p.z)&&((m(-1,0)&&m(1,0))||(m(0,-1)&&m(0,1)));
}
export function islandArt(world,cfg,cx,cz){
  if(!cfg.islandArt?.enabled)return [];
  const S=cfg.chunk,T=world.terrain.cell,x0=cx*S,z0=cz*S,out=[];
  const mountain=(x,z)=>terrainAt(world,x,z)==='m';
  const owns=(x,z)=>x>=x0&&x<x0+S&&z>=z0&&z<z0+S;
  const add=(art,x,z,extra={})=>{if(owns(x,z))out.push({kind:'island_art',art,x,z,...extra});};
  // One-cell halo lets the owning chunk emit shared vertices just once.
  for(let z=z0-T;z<z0+S;z+=T)for(let x=x0-T;x<x0+S;x+=T){
    if(!mountain(x+T/2,z+T/2))continue;
    const b=islandBiome(world,x+T/2,z+T/2),south=!mountain(x+T/2,z+1.5*T),east=!mountain(x+1.5*T,z+T/2);
    const variant=((Math.imul(x/T,73856093)^Math.imul(z/T,19349663)^(world.seed||1))>>>0)%2?'a':'b';
    if(south)add(`cliff_${b}_${variant}`,x+T/2,z+T,{edge:'south',span:T});
    if(east)add(`cliff_${b}_${variant}`,x+T,z+T/2,{edge:'east',span:T,flip:true});
    if(!mountain(x+T/2,z-T/2))add(`rim_${b}`,x+T/2,z,{edge:'north',span:T});
    if(!mountain(x-T/2,z+T/2))add(`rim_${b}`,x,z+T/2,{edge:'west',span:T,flip:true});
    if(south&&east)add(`corner_out_${b}`,x+T,z+T,{corner:true});
    if(!south&&!east&&!mountain(x+1.5*T,z+1.5*T))add(`corner_in_${b}`,x+T,z+T,{corner:true});
    if((south||east)&&(x%S===0||z%S===0))add(`outcrop_${b==='forest'?'moss':b}`,x+T*.85,z+T*.85);
    if(b==='forest'&&!south&&!east&&mountain(x-T/2,z+T/2)&&mountain(x+T/2,z-T/2)){
      for(let k=0;k<(cfg.islandArt.topPinesPerCell||0);k++)add('pine_tree',x+T*(.3+k*.22),z+T*.4,{top:true});
    }
  }
  for(const p of world.passes||[])if(islandPassFits(world,p))add('pass_gate',p.x,p.z);
  // Ford and shoreline art await correctly scaled, terrain-fitted replacements.
  return out;
}
