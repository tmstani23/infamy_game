// Cut the three reviewed native marsh sheets into isolated runtime sprites.
import fs from 'node:fs';
import sharp from 'sharp';

const root='assets/environment/island', plan=JSON.parse(fs.readFileSync(`${root}/marsh_generation_plan.json`));
const out=`${root}/marsh/cutouts`;fs.mkdirSync(out,{recursive:true});
const regions=[
 [[0,0,512,525],[512,0,1024,525],[1024,0,1536,525],[0,525,550,1024],[550,525,1000,1024],[1000,525,1536,1024]],
 [[0,0,525,525],[525,0,1030,525],[1030,0,1536,525],[0,525,490,1024],[490,525,1000,1024],[1000,525,1536,1024]],
 [[0,0,500,480],[500,0,1000,480],[1000,0,1536,480],[0,480,480,1024],[480,480,960,1024],[960,480,1536,1024]],
];
const feet=[[2.4,2.2,1.8,2.5,2.4,2.2],[5,4.5,3.2,2.8,4.5,2.7],[4,5,4,4,5,5]];
const items={},cuts={},assets=[];
for(let s=0;s<3;s++)for(let i=0;i<6;i++){
 const sheet=plan.sheets[s],id=sheet.items[i],[left,top,right,bottom]=regions[s][i];
 const source=`${root}/marsh/sheets/${sheet.file}`;
 const {data,info}=await sharp(source).extract({left,top,width:right-left,height:bottom-top}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let x0=info.width,y0=info.height,x1=-1,y1=-1,edge=0,transparent=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];if(a===0)transparent++;
  if(a>30){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  if(a>128&&(x===0||y===0||x===info.width-1||y===info.height-1))edge++;
 }
 if(edge||x1<0)throw Error(`${id}: ${edge} opaque pixels touch the extraction boundary`);
 const l=Math.max(0,x0-4),t=Math.max(0,y0-4),w=Math.min(info.width,x1+5)-l,h=Math.min(info.height,y1+5)-t;
 const png=await sharp(data,{raw:info}).extract({left:l,top:t,width:w,height:h}).png().toBuffer();
 fs.writeFileSync(`${out}/${id}.png`,png);fs.writeFileSync(`game/art/props/${id}.png`,png);
 let sum=0,n=0;for(let y=Math.max(y0,y1-3);y<=y1;y++)for(let x=x0;x<=x1;x++)if(data[(y*info.width+x)*4+3]>128){sum+=x;n++;}
 const anchor=[Math.round(n?sum/n:(x0+x1)/2)-l,y1-t],foot=[feet[s][i],feet[s][i]];
 items[id]={kind:'props',scale:Math.round((foot[0]+foot[1])/Math.SQRT2*(160/3)/w*1e6)/1e6,foot,solid:0,artAnchor:anchor};
 cuts[`props/${id}`]={w,h,left:0,right:w-1,bottomX:anchor[0],bottomY:anchor[1],glows:[]};
 assets.push({id,sourceSheet:sheet.file,cell:[s,i],region:[left,top,right,bottom],trim:{left:l,top:t,width:w,height:h},groundAnchor:anchor,footprint:foot,transparentPixelsInRegion:transparent,opaqueBoundaryPixels:edge});
}
function append(file,entries,nested=false){
 let text=fs.readFileSync(file,'utf8');const existing=JSON.parse(text),target=nested?existing.items:existing;
 const fresh=Object.entries(entries).filter(([k])=>!target[k]);
 if(fresh.length){const at=nested?text.lastIndexOf('}',text.lastIndexOf('}')-1):text.lastIndexOf('}');text=text.slice(0,at).trimEnd()+',\n'+fresh.map(([k,v])=>JSON.stringify(k)+': '+JSON.stringify(v)).join(',\n')+'\n'+text.slice(at);fs.writeFileSync(file,text);}
}
append('game/data/art.json',items,true);append('game/art/cutouts.json',cuts);
fs.writeFileSync(`${out}/cutouts_manifest.json`,JSON.stringify({sourceSheetsUnchanged:true,assets},null,2)+'\n');
console.log(`Imported ${assets.length} marsh props; no opaque boundary intersections.`);
