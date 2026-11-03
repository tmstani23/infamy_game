// Cut the native jungle and temperate forest sheets and register runtime art.
// Source PNGs stay unchanged. Regions follow the actual silhouettes, not a fixed grid.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = 'assets/environment/island';
const plan = JSON.parse(fs.readFileSync(`${root}/jungle_forest_generation_plan.json`));
const regions = [
  [[0,0,520,512],[520,0,1030,512],[1030,0,1536,512],[0,512,500,1024],[500,512,1020,1024],[1020,512,1536,1024]],
  [[0,0,512,512],[512,0,1010,512],[1010,0,1536,512],[0,512,500,1024],[500,512,1015,1024],[1015,512,1536,1024]],
  [[0,0,535,500],[535,0,1055,500],[1055,0,1536,500],[0,500,535,1024],[535,500,1050,1024],[1050,500,1536,1024]],
  [[0,0,512,480],[512,0,1024,480],[1024,0,1536,480],[0,480,375,1024],[375,480,1000,1024],[1000,480,1536,1024]],
];
const feet = [[8,8,8,5,5,2.5],[2.8,2.8,3.2,3,2.8,2.5],[7,5,4,8,6,6],[1.2,1,1.2,1.2,2.7,2.4]];
const items = {}, cuts = {};
for (let s=0; s<4; s++) {
  const sheet = plan.outputs[s], biome = s===3 ? 'forest_floor' : 'jungle';
  const out = `${root}/${biome}/cutouts`; fs.mkdirSync(out,{recursive:true});
  const assets=[];
  for (let i=0;i<6;i++) {
    const id=sheet.items[i], [left,top,right,bottom]=regions[s][i];
    const {data,info}=await sharp(`${root}/${sheet.file}`).extract({left,top,width:right-left,height:bottom-top}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let x0=info.width,y0=info.height,x1=-1,y1=-1,edge=0;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
      const a=data[(y*info.width+x)*4+3];
      if(a>30){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
      if(a>128&&(x===0||y===0||x===info.width-1||y===info.height-1))edge++;
    }
    if(edge||x1<0)throw Error(`${id}: extraction boundary intersects ${edge} opaque pixels`);
    const l=Math.max(0,x0-4),t=Math.max(0,y0-4),w=Math.min(info.width,x1+5)-l,h=Math.min(info.height,y1+5)-t;
    const png=await sharp(data,{raw:info}).extract({left:l,top:t,width:w,height:h}).png().toBuffer();
    fs.writeFileSync(`${out}/${id}.png`,png);fs.writeFileSync(`game/art/props/${id}.png`,png);
    let sum=0,n=0;
    for(let y=Math.max(y0,y1-3);y<=y1;y++)for(let x=x0;x<=x1;x++)if(data[(y*info.width+x)*4+3]>128){sum+=x;n++;}
    const anchor=[Math.round(n?sum/n:(x0+x1)/2)-l,y1-t],foot=[feet[s][i],feet[s][i]];
    items[id]={kind:'props',scale:Math.round((foot[0]+foot[1])/Math.SQRT2*(160/3)/w*1e6)/1e6,foot,solid:0,artAnchor:anchor};
    cuts[`props/${id}`]={w,h,left:0,right:w-1,bottomX:anchor[0],bottomY:anchor[1],glows:[]};
    assets.push({id,sourceSheet:sheet.file,region:[left,top,right,bottom],trim:{left:l,top:t,width:w,height:h},groundAnchor:anchor,footprint:foot,opaqueBoundaryPixels:edge});
  }
  fs.writeFileSync(`${out}/${path.basename(sheet.file,'.png')}_cuts.json`,JSON.stringify({sourceAlphaPreserved:true,assets},null,2)+'\n');
}
function append(file,entries,nested=false){
  let text=fs.readFileSync(file,'utf8');
  const existing=JSON.parse(text), target=nested?existing.items:existing;
  const fresh=Object.entries(entries).filter(([k])=>!target[k]);
  if(fresh.length){const at=nested?text.lastIndexOf('}',text.lastIndexOf('}')-1):text.lastIndexOf('}');text=text.slice(0,at).trimEnd()+',\n'+fresh.map(([k,v])=>JSON.stringify(k)+': '+JSON.stringify(v)).join(',\n')+'\n'+text.slice(at);fs.writeFileSync(file,text);}
}
append('game/data/art.json',items,true);append('game/art/cutouts.json',cuts);
console.log('Cut and imported 24 sprites, preserving source alpha; no opaque extraction boundary intersections.');
