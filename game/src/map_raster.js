import { shapeDistance, groundZone } from './sim/geometry.js';

const terrain = new WeakMap();
const BUILDING=[62,50,46];
const GROUND = { grass:[78,96,58],dirt:[122,104,78],dry_grass:[130,120,76],mud:[84,70,54],sand:[176,160,122],water:[40,66,84],planks:[110,82,56],gravel:[128,124,116],paving:[146,138,124] };
// Small and full maps share the immutable terrain for this match.
export function mapTerrain(game,district,g){
  let base=terrain.get(game);if(base)return base;
  base=new Uint8ClampedArray(g.w*g.h*3);
  const zones=district.ground.map(groundZone),buildings=game.scenery.filter(s=>s.item?.kind==='buildings'&&!s.indoor&&s.solid).map(s=>s.solid);
  for(let j=0;j<g.h;j++)for(let i=0;i<g.w;i++){
    const x=g.minX+i+.5,z=g.minZ+j+.5;let c=GROUND.grass;
    for(const zone of zones)if(shapeDistance(zone.shape,x,z)>=0)c=GROUND[zone.type]||c;
    for(const r of buildings)if(x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ){c=BUILDING;break;}
    base.set(c,(j*g.w+i)*3);
  }
  terrain.set(game,base);return base;
}
export function createMapRaster(base,pixels){
  const n=base.length/3,seen=new Uint8Array(n),explored=new Uint8Array(n);
  let first=true,lastFog;
  return {paint(visible,known,fog,turf,turfChanged=false){
    const all=first||fog!==lastFog||turfChanged;let dirty=all;
    for(let i=0;i<n;i++){
      const v=fog?visible[i]:1,e=fog?known[i]:1;
      if(!all&&seen[i]===v&&explored[i]===e)continue;
      seen[i]=v;explored[i]=e;dirty=true;
      let r=base[i*3],g=base[i*3+1],b=base[i*3+2];
      if(!v){const l=r*.299+g*.587+b*.114;
        if(e){r=(l+(r-l)*.55)*.5+4;g=(l+(g-l)*.55)*.5+5;b=(l+(b-l)*.55)*.5+10;}
        else{r=7;g=8;b=11;}}
      const k=i*4,a=turf?.[k+3]||0;
      if(a){r+=(turf[k]-r)*a;g+=(turf[k+1]-g)*a;b+=(turf[k+2]-b)*a;}
      pixels[k]=r;pixels[k+1]=g;pixels[k+2]=b;pixels[k+3]=255;
    }
    first=false;lastFog=fog;return dirty;
  }};
}
