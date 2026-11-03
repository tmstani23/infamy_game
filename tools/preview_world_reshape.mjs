// MR0/MR1 design preview only: never writes blueprint sources or runtime files.
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { createPaint } from '../game/src/world_paint.js';
const root='assets/environment/island/reshape';
const version=process.argv[2] || 'v2';
if(!['v1','v2'].includes(version))throw Error('Use v1 or v2');
const read=f=>JSON.parse(fs.readFileSync(f));
const world=read('game/data/world.json'), bp=read('docs/images/frontier/blueprint/world_blueprint_v2.json');
const cfg=read('game/data/world_paint.json'), P=createPaint(world,cfg);
const proposal=read(`${root}/reshape_proposal_${version}.json`), baseline=read(`${root}/reshape_baseline_v1.json`);
for(const [file,hash] of Object.entries(baseline.sourceHashes))
  if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error(`Baseline stale: ${file}`);
const T=world.terrain.cell,NX=world.size.w/T,NZ=world.size.h/T,W=2800,H=1600,S=W/world.size.w;
const colors={forest:'#6c825d',jungle:'#36765e',plain:'#b6bd82',hills:'#a99b74',marsh:'#81988b',dry:'#c59b68',snow:'#e4e7df',bank:'#486b7c',top_forest:'#827f6e',top_dry:'#a97753',top_snow:'#c9d2d4'};
const index=(x,z)=>Math.floor(z/T)*NX+Math.floor(x/T);
const raw=(x,z)=>world.terrain.rows[Math.floor(z/T)]?.[Math.floor(x/T)]||'w';
const base=Array.from({length:NX*NZ},(_,k)=>P.biomes[P.gridAt((k%NX+.5)*T,(Math.floor(k/NX)+.5)*T)]);
const after=base.slice(), codes=world.terrain.rows.join('').split('');
const low=(x,z)=>{
  const family=base[index(x,z)];
  if(family==='top_snow')return 'snow';if(family==='top_dry')return 'dry';
  const ax=Math.floor(x/T),az=Math.floor(z/T);
  for(let r=1;r<22;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
    const sx=ax+dx,sz=az+dz,c=world.terrain.rows[sz]?.[sx];
    if(c&&!['m','h','w','r'].includes(c))return base[sz*NX+sx];
  }
  return 'hills';
};
// The original blueprint identifies inland range cells; runtime-only coastal
// cliff cells are retained. Infill is a visualization estimate, not authored terrain.
for(let k=0;k<after.length;k++)if(['m','h'].includes(bp.terrain.rows[Math.floor(k/NX)][k%NX])&&['m','h'].includes(codes[k])){
  const x=(k%NX+.5)*T,z=(Math.floor(k/NX)+.5)*T;after[k]=low(x,z);codes[k]='h';
}
function smooth(points,closed=false){
 const out=[],n=points.length;
 const get=i=>points[closed?(i+n)%n:Math.max(0,Math.min(n-1,i))];
 for(let i=0;i<(closed?n:n-1);i++){
  const a=get(i-1),b=get(i),c=get(i+1),d=get(i+2),steps=Math.max(6,Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/55));
  for(let j=0;j<steps;j++){const t=j/steps,t2=t*t,t3=t2*t;
   out.push(b.map((v,k)=>.5*(2*v+(-a[k]+c[k])*t+(2*a[k]-5*v+4*c[k]-d[k])*t2+(-a[k]+3*v-3*c[k]+d[k])*t3)));
  }
 }
 out.push(closed?out[0]:points.at(-1));return out;
}
function nearest(points,x,z){let best={d:Infinity};
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
  if(d<best.d)best={d,width:(a[2]||0)*(1-t)+(b[2]||0)*t};
 }return best;
}
function inside(points,x,z){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
 const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }return hit;}
const protectedPoints=[...world.sites.map(v=>({...v,buffer:170})),...world.nodes.map(v=>({...v,buffer:70})),...world.camps.map(v=>({...v,buffer:110})),...world.setPieces.map(v=>({...v,buffer:150})),...world.nativeVillageSlots.map(v=>({...v,buffer:150})),...world.riverSources.map(v=>({...v,buffer:210}))];
const ranges=[...proposal.ranges,...(proposal.spurs||[]).map(r=>({...r,id:r.parent}))].map(r=>({...r,points:smooth(r.knots)}));
let reserved=0;
for(let k=0;k<after.length;k++){
 if(['w','r','m'].includes(codes[k]))continue;
 const x=(k%NX+.5)*T,z=(Math.floor(k/NX)+.5)*T;
 for(const r of ranges){const q=nearest(r.points,x,z);
  if(q.d<q.width+260&&!['snow','dry','marsh','jungle'].includes(after[k]))after[k]='hills';
  if(q.d>=q.width)continue;
  if(world.passes.some(p=>Math.hypot(x-p.x,z-p.z)<300)||protectedPoints.some(p=>Math.hypot(x-p.x,z-p.z)<p.buffer)){reserved++;break;}
  after[k]=r.id==='R4'?'top_dry':(base[k]==='snow'||base[k]==='top_snow')?'top_snow':'top_forest';codes[k]='m';break;
 }
}
const lakeReport=[];
for(const lake of proposal.lakes){
 const original=world.lakes.find(l=>l.id===lake.id),start=index(original.x,original.z),seen=new Set(),queue=[start];
 for(let i=0;i<queue.length;i++){const k=queue[i];if(seen.has(k)||world.terrain.rows[Math.floor(k/NX)]?.[k%NX]!=='w')continue;seen.add(k);
  const col=k%NX;if(col>0)queue.push(k-1);if(col<NX-1)queue.push(k+1);if(k>=NX)queue.push(k-NX);if(k+NX<NX*NZ)queue.push(k+NX);
 }
 for(const k of seen){after[k]=low((k%NX+.5)*T,(Math.floor(k/NX)+.5)*T);codes[k]=lake.id==='L2'?'k':'p';}
 const outline=smooth(lake.outline,true),cells=[];
 for(let k=0;k<after.length;k++){const x=(k%NX+.5)*T,z=(Math.floor(k/NX)+.5)*T;if(inside(outline,x,z)){after[k]='bank';codes[k]='w';cells.push(k);}}
 const metrics=ks=>{const xs=ks.map(k=>(k%NX)*T),zs=ks.map(k=>Math.floor(k/NX)*T);return {areaSquareUnits:ks.length*T*T,bounds:[Math.min(...xs),Math.min(...zs),Math.max(...xs)+T,Math.max(...zs)+T],width:Math.max(...xs)-Math.min(...xs)+T,height:Math.max(...zs)-Math.min(...zs)+T};};
 lakeReport.push({id:lake.id,before:metrics([...seen]),proposed:metrics(cells)});
}
// Erase only the old western river's blue cells, then show the authored curve.
// Ford anchors are knots, so this proposal requests zero crossing relocations.
const river=smooth(proposal.river.knots);
for(let k=0;k<after.length;k++){
 const x=(k%NX+.5)*T,z=(Math.floor(k/NX)+.5)*T;
 if(raw(x,z)==='r'&&x<6000){after[k]=low(x,z);codes[k]='d';}
 if(x<6000&&codes[k]!=='w'&&nearest(river,x,z).d<Math.max(35,world.rivers.find(r=>r.id==='V4').width/2)){after[k]='bank';codes[k]='r';}
}
const conflicts=protectedPoints.filter(p=>!['w','m'].includes(raw(p.x,p.z))&&['w','m'].includes(codes[index(p.x,p.z)])).map(p=>({id:p.id||p.river,x:p.x,z:p.z,candidateTerrain:codes[index(p.x,p.z)]}));
const draw=(families,annotations)=>{
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 14000 8000"><rect width="14000" height="8000" fill="#34566b"/>`;
 for(let k=0;k<families.length;k++)svg+=`<rect x="${k%NX*T}" y="${Math.floor(k/NX)*T}" width="50" height="50" fill="${colors[families[k]]||colors.plain}"/>`;
 if(annotations){
  for(const p of protectedPoints)svg+=`<circle cx="${p.x}" cy="${p.z}" r="10" fill="#152f35" opacity=".65"/>`;
  for(const p of world.passes)svg+=`<circle cx="${p.x}" cy="${p.z}" r="45" fill="#fff3ba" stroke="#494135" stroke-width="8"/>`;
  for(const p of world.fords)svg+=`<path d="M${p.x-40},${p.z-40}l80,80m-80,0l80,-80" stroke="#fff4c2" stroke-width="14"/>`;
  for(const r of proposal.ranges){const p=r.knots[Math.floor(r.knots.length/2)];svg+=`<text x="${p[0]+120}" y="${p[1]-110}" font-family="Arial" font-size="100" font-weight="bold" fill="#fff9e7" stroke="#33403e" stroke-width="14" paint-order="stroke">${r.id}</text>`;}
 }
 return svg+'</svg>';
};
await sharp(Buffer.from(draw(base,false))).png().toFile(`${root}/reshape_before_${version}.png`);
await sharp(Buffer.from(draw(after,false))).png().toFile(`${root}/reshape_proposed_${version}.png`);
const before=await sharp(Buffer.from(draw(base,true))).resize(1400,800).png().toBuffer(),candidate=await sharp(Buffer.from(draw(after,true))).resize(1400,800).png().toBuffer();
const header=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2800" height="145"><rect width="2800" height="145" fill="#eee8da"/><g font-family="Arial" fill="#253b41"><text x="30" y="36" font-size="27" font-weight="bold">Mountain / lake / Ashen Wash proposal — design review, live world unchanged</text><text x="30" y="72" font-size="20">Current terrain (left) • Proposed masks (right). Pale circles: existing passes; crosses: existing crossings; dots: protected authored locations.</text><text x="30" y="108" font-size="19">Ground infill/clearances are illustrative; final biome paint, routes, river taper and navigation require MR2–MR4. No crossing relocation proposed.</text></g></svg>`);
await sharp({create:{width:2800,height:945,channels:3,background:'#eee8da'}}).composite([{input:header,top:0,left:0},{input:before,top:145,left:0},{input:candidate,top:145,left:1400}]).png().toFile(`${root}/reshape_comparison_${version}.png`);
const report={status:'MR0/MR1 proposal only; not a runtime-valid candidate',liveWorldChanged:false,rangeCount:proposal.ranges.length,spurCount:(proposal.spurs||[]).length,protectedCounts:Object.fromEntries(['sites','nodes','camps','setPieces','nativeVillageSlots','passes','fords'].map(k=>[k,world[k].length])),lakeMetrics:lakeReport,crossingRelocations:[],reservedMountainCells:reserved,protectedPointConflicts:conflicts,limits:['Lowland infill is estimated from nearby existing biomes, not the final blueprint paint.','River preview uses a near-constant mask; final approved taper retained in MR2.','Pass/point buffers are reservations, not a proven pathfinding or pass-clearance result.']};
fs.writeFileSync(`${root}/reshape_review_${version}.json`,JSON.stringify(report,null,2)+'\n');
// Lake detail pairs share a world window and uniform scale (no stretched shapes).
const details=[{input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="85"><rect width="1400" height="85" fill="#eee8da"/><text x="24" y="35" font-family="Arial" font-size="26" fill="#253b41">Main lakes — current (left) / proposed (right)</text><text x="24" y="65" font-family="Arial" font-size="18" fill="#253b41">Same world-space window per pair; dimensions are full footprint bounds.</text></svg>'),top:0,left:0}];
for(let i=0;i<2;i++)for(let side=0;side<2;side++){
 const lake=world.lakes[i],y=85+i*470,m=side?lakeReport[i].proposed:lakeReport[i].before;
 const crop=await sharp(`${root}/reshape_${side?'proposed':'before'}_${version}.png`)
  .extract({left:Math.round((lake.x-900)*S),top:Math.round((lake.z-700)*S),width:360,height:280})
  .resize(630,400,{fit:'contain',background:'#eee8da',kernel:'nearest'}).png().toBuffer();
 const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="55"><text x="25" y="35" font-family="Arial" font-size="22" fill="#253b41">${lake.id} ${side?'proposed':'current'}: ${m.width} x ${m.height} world units</text></svg>`);
 details.push({input:label,top:y,left:side*700},{input:crop,top:y+55,left:side*700+25});
}
await sharp({create:{width:1400,height:1025,channels:3,background:'#eee8da'}}).composite(details).png().toFile(`${root}/reshape_lakes_review_${version}.png`);
console.log(JSON.stringify(report,null,2));
