// Deterministic art records for a chunk. Terrain/blockers remain authoritative.
import {terrainAt,passable} from './world_data.js';

export function islandBiome(world,x,z){
  // Explicit range art survives the surrounding lowlands' majority biome.
  let nearest=null, distance=Infinity, width=0;
  for(const range of world.ranges||[]) for(const line of [range,...(range.spurs||[])]) for(let i=1;i<line.spine.length;i++){
    const [ax,az]=line.spine[i-1],[bx,bz]=line.spine[i],dx=bx-ax,dz=bz-az;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
    const d=Math.hypot(x-ax-t*dx,z-az-t*dz);
    if(d<distance){distance=d;nearest=range;width=line.halfWidths?line.halfWidths[i-1]*(1-t)+line.halfWidths[i]*t:range.halfWidth;}
  }
  if(nearest?.biome&&distance<=width+350)return nearest.biome;
  const region=world.regions?.find(r=>x>=r.box[0]&&x<r.box[2]&&z>=r.box[1]&&z<r.box[3]);
  return region?.biome==='snow'?'snow':region?.biome==='dry'?'dry':'forest';
}
// Legacy pass metadata can sit in open fields after a blueprint update.
// Only draw a gateway where actual terrain flanks a walkable crossing.
export function islandPassFits(world,p){
  const t=world.terrain.cell,m=(dx,dz)=>terrainAt(world,p.x+dx*t,p.z+dz*t)==='m';
  return passable(world,p.x,p.z)&&((m(-1,0)&&m(1,0))||(m(0,-1)&&m(0,1)));
}
// Where a ford's art goes: on the river's centre line nearest the ford, turned along the flow. Null when the
// crossing is not a ford or the river there is wider than cfg.maxWidth (then it needs a bridge, not stones).
export function islandFordFit(world,f,cfg){
  if(f.kind!=='ford')return null;
  const r=(world.rivers||[]).find(v=>v.id===f.river);if(!r)return null;
  let best=null;
  for(let k=1;k<r.points.length;k++){
    const [ax,az]=r.points[k-1],[bx,bz]=r.points[k],dx=bx-ax,dz=bz-az,l=dx*dx+dz*dz;
    const t=l?Math.max(0,Math.min(1,((f.x-ax)*dx+(f.z-az)*dz)/l)):0,x=ax+dx*t,z=az+dz*t,d=Math.hypot(f.x-x,f.z-z);
    if(!best||d<best.d)best={d,x,z,dx,dz};
  }
  const len=Math.hypot(best.dx,best.dz)||1,nx=-best.dz/len,nz=best.dx/len;
  let w=0;for(const s of [1,-1])for(let k=1;k<40&&terrainAt(world,best.x+nx*s*k*5,best.z+nz*s*k*5)==='r';k++)w+=5;
  if(terrainAt(world,best.x,best.z)!=='r'||w>cfg.maxWidth)return null;
  return {x:+best.x.toFixed(2),z:+best.z.toFixed(2),width:w,angle:+(Math.atan2(best.dz,best.dx)-Math.PI/4).toFixed(4)};
}
export function islandArt(world,cfg,cx,cz){
  if(!cfg.islandArt?.enabled)return [];
  const S=cfg.chunk,T=world.terrain.cell,x0=cx*S,z0=cz*S,out=[];
  const mountain=(x,z)=>terrainAt(world,x,z)==='m';
  const owns=(x,z)=>x>=x0&&x<x0+S&&z>=z0&&z<z0+S;
  const add=(art,x,z,extra={})=>{if(owns(x,z))out.push({kind:'island_art',art,x,z,...extra});};
  const dryTop=cfg.islandArt.dryTop || {};
  const chance=(ix,iz,salt)=>{
    let v=Math.imul(ix,73856093)^Math.imul(iz,19349663)^Math.imul((world.seed||1)+salt,83492791);
    v=Math.imul(v^(v>>>16),2246822519);return ((v^(v>>>13))>>>0)/4294967296;
  };
  // One-cell halo lets the owning chunk emit shared vertices just once.
  for(let z=z0-T;z<z0+S;z+=T)for(let x=x0-T;x<x0+S;x+=T){
    if(!mountain(x+T/2,z+T/2))continue;
    const b=islandBiome(world,x+T/2,z+T/2),south=!mountain(x+T/2,z+1.5*T),east=!mountain(x+1.5*T,z+T/2);
    const variant=((Math.imul(x/T,73856093)^Math.imul(z/T,19349663)^(world.seed||1))>>>0)%2?'a':'b';
    if(south)add(`cliff_${b}_${variant}`,x+T/2,z+T,{edge:'south',span:T});
    if(east)add(`cliff_${b}_${variant}`,x+T,z+T/2,{edge:'east',span:T,flip:true});
    // W3.10: on the far (north and west) edges, forest and snow use the opposite-bank rims, whose lip faces
    // outward so the high ground reads as the mountain's; dry has no such art yet and keeps the old rim.
    const opp=cfg.paint?.enabled&&b!=='dry';
    if(!mountain(x+T/2,z-T/2))add(opp?`rim_${b}_opposite`:`rim_${b}`,x+T/2,z,{edge:'north',span:T});
    if(!mountain(x-T/2,z+T/2))add(opp?`rim_${b}_opposite_mirrored`:`rim_${b}`,x,z+T/2,{edge:'west',span:T,...(opp?{}:{flip:true})});
    if(south&&east)add(`corner_out_${b}`,x+T,z+T,{corner:true});
    if(!south&&!east&&!mountain(x+1.5*T,z+1.5*T))add(`corner_in_${b}`,x+T,z+T,{corner:true});
    if((south||east)&&(x%S===0||z%S===0))add(`outcrop_${b==='forest'?'moss':b}`,x+T*.85,z+T*.85);
    if(b==='dry'&&mountain(x-T/2,z+T/2)&&mountain(x+T/2,z-T/2)&&mountain(x+1.5*T,z+T/2)&&mountain(x+T/2,z+1.5*T)){
      const ix=x/T,iz=z/T,p=chance(ix,iz,61),ox=x+T*(.3+.4*chance(ix,iz,62)),oz=z+T*(.3+.4*chance(ix,iz,63));
      let sum=0;
      for(const entry of dryTop.props||[]){sum+=entry.chance;if(p<sum){add(entry.art,ox,oz,{top:true,s:entry.scale||1});break;}}
      if(chance(ix,iz,64)<(dryTop.oddityChance||0)){
        const names=dryTop.oddities||[];
        if(names.length)add(names[Math.floor(chance(ix,iz,65)*names.length)],x+T*.5,z+T*.5,{top:true,s:.85});
      }
    }
    if(b==='forest'&&!south&&!east&&mountain(x-T/2,z+T/2)&&mountain(x+T/2,z-T/2)){
      for(let k=0;k<(cfg.islandArt.topPinesPerCell||0);k++)add('pine_tree',x+T*(.3+k*.22),z+T*.4,{top:true});
    }
  }
  for(const p of world.passes||[])if(islandPassFits(world,p))add('pass_gate',p.x,p.z);
  if(cfg.paint?.enabled){
    // W3.10 lake banks: narrow top-down strips on the cell edges between lake water and land, where the
    // code-drawn water and the walk blockers end. lake_edge_1 N, 3 E, 5 S, 7 W = the side the land is on.
    const L=cfg.paint.bankDecals,water=(x,z)=>terrainAt(world,x,z)==='w';
    const lakes=(world.lakes||[]).filter(l=>l.x+l.r+2*T>x0&&l.x-l.r-2*T<x0+S&&l.z+l.r+2*T>z0&&l.z-l.r-2*T<z0+S);
    if(!cfg.coastline?.inland?.enabled&&lakes.length)for(let z=z0-T;z<z0+S+T;z+=T)for(let x=x0-T;x<x0+S+T;x+=T){
      const cx=x+T/2,cz=z+T/2;
      if(!water(cx,cz)||!lakes.some(l=>Math.hypot(l.x-cx,l.z-cz)<l.r+2*T))continue;
      const n=Math.max(1,Math.ceil(T/L.step));
      for(const [side,dx,dz] of [['N',0,-1],['E',1,0],['S',0,1],['W',-1,0]]){
        if(!passable(world,cx+dx*T,cz+dz*T))continue;
        for(let k=0;k<n;k++){
          const t=-T/2+(k+.5)*T/n,ex=cx+dx*T/2+(dz?t:0),ez=cz+dz*T/2+(dx?t:0);
          add(L.files[side],ex,ez,{decal:true,width:L.length,height:L.length,angle:0,bank:side});
        }
      }
    }
    // W3.10 fords: the ford art, smaller than before, only at real thin crossings (ford kind, river at most
    // maxWidth across), turned to the river's flow (the art's water runs top-left to bottom-right).
    const FD=cfg.paint.ford;
    for(const f of world.fords||[]){
      const fit=islandFordFit(world,f,FD);
      if(fit)add('river_ford',fit.x,fit.z,{decal:true,width:FD.size,height:FD.size,angle:fit.angle,ford:f.id});
    }
  }
  return out;
}
