// Import only this asset family, preserving generated source PNGs.
import fs from 'node:fs';
import sharp from 'sharp';
const dir='assets/environment/island/',catalogFile='game/data/art.json',cutsFile='game/art/cutouts.json';
const catalogText=fs.readFileSync(catalogFile,'utf8'),cutsText=fs.readFileSync(cutsFile,'utf8');
const catalog=JSON.parse(fs.readFileSync(catalogFile)),cuts=JSON.parse(fs.readFileSync(cutsFile));
const configs={};
for(const biome of ['forest','snow','dry']){
  for(const variant of ['a','b'])configs[`cliff_${biome}_${variant}`]={scale:1.4667,foot:[55,3],anchor:[768,680],treePixels:200};
  configs[`rim_${biome}`]={scale:1.4667,foot:[55,3],anchor:[768,600],treePixels:200};
  configs[`corner_out_${biome}`]={scale:1.2222,foot:[24,24],anchor:[512,955],treePixels:240};
  configs[`corner_in_${biome}`]={scale:1.2222,foot:[24,24],anchor:[512,540],treePixels:240};
  configs[`outcrop_${biome==='forest'?'moss':biome}`]={scale:.32,foot:[4,4]};
}
Object.assign(configs,{pass_gate:{scale:.5,foot:[7,5],anchor:[768,650]},city_gate:{scale:.5,foot:[8,3],anchor:[768,620]},city_gate_se:{scale:.5,foot:[3,8],anchor:[768,620]},river_ford:{scale:1,foot:[1,1]},lake_edge:{scale:1,foot:[1,1]}});
for(const [name,cfg]of Object.entries(configs)){
  const {data,info}=await sharp(dir+name+'.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,right=0,bottomY=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const i=(y*info.width+x)*4+3;if(data[i]>240)data[i]=255;
    if(data[i]>128){left=Math.min(left,x);right=Math.max(right,x);bottomY=Math.max(bottomY,y);}
  }
  let sum=0,n=0;for(let y=Math.max(0,bottomY-2);y<=bottomY;y++)for(let x=left;x<=right;x++)if(data[(y*info.width+x)*4+3]>128){sum+=x;n++;}
  await sharp(data,{raw:info}).png().toFile('game/art/props/'+name+'.png');
  cuts['props/'+name]={w:info.width,h:info.height,left,right,bottomX:Math.round(sum/n),bottomY,glows:[]};
  catalog.items[name]={kind:'props',scale:cfg.scale,foot:cfg.foot,solid:0,...(cfg.anchor?{artAnchor:cfg.anchor}:{}),_note:cfg.treePixels?`W3.9 crown calibration ${cfg.treePixels}px to ~5.5u; anchor/scale are art-only, tune after visual review`:'W3.9 art-only; does not change navigation'};
}
for(const name of ['top_forest','top_snow','top_dry'])await sharp(dir+name+'.png').removeAlpha().png().toFile('game/art/ground/'+name+'.png');
// Preserve unrelated catalog formatting when importing or tuning this family.
function closeObject(text,start){let depth=0,quoted=false,escape=false;for(let i=start;i<text.length;i++){const c=text[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth)return i;}throw Error('Invalid JSON object');}
function update(text,values,nested){for(const [key,value]of Object.entries(values)){const root=nested?text.indexOf('{',text.indexOf('"items"')):text.indexOf('{'),end=closeObject(text,root),found=text.indexOf(JSON.stringify(key)+':',root);if(found>=0&&found<end){const a=text.indexOf('{',found),b=closeObject(text,a);text=text.slice(0,a)+JSON.stringify(value)+text.slice(b+1);}else{text=text.slice(0,end).trimEnd()+',\n'+(nested?'    ':' ')+JSON.stringify(key)+': '+JSON.stringify(value)+'\n'+(nested?'  ':'')+text.slice(end);}}return text;}
fs.writeFileSync(catalogFile,update(catalogText,Object.fromEntries(Object.keys(configs).map(k=>[k,catalog.items[k]])),true));
fs.writeFileSync(cutsFile,update(cutsText,Object.fromEntries(Object.keys(configs).map(k=>['props/'+k,cuts['props/'+k]])),false));
console.log('Imported 26 island assets; source art preserved; alpha>240 snapped opaque');
