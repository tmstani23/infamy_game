// Authored blueprint overlay. Pure, deterministic; no I/O and no placement RNG.
export function smoothPath(points,closed=false){
 const out=[],n=points.length,get=i=>points[closed?(i+n)%n:Math.max(0,Math.min(n-1,i))];
 for(let i=0;i<(closed?n:n-1);i++){
  const a=get(i-1),b=get(i),c=get(i+1),d=get(i+2),steps=Math.max(6,Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/55));
  for(let j=0;j<steps;j++){const t=j/steps,t2=t*t,t3=t2*t;
   out.push(b.map((v,k)=>.5*(2*v+(-a[k]+c[k])*t+(2*a[k]-5*v+4*c[k]-d[k])*t2+(-a[k]+3*v-3*c[k]+d[k])*t3)));
  }
 }out.push(closed?out[0]:points.at(-1));return out;
}
export function nearestSegment(points,x,z){let best={d:Infinity};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  const px=a[0]+t*dx,pz=a[1]+t*dz,d=Math.hypot(x-px,z-pz);
  if(d<best.d)best={d,x:px,z:pz,width:(a[2]||0)*(1-t)+(b[2]||0)*t,index:i,t};
 }return best;
}
export function pointInside(points,x,z){let hit=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }return hit;
}
export function applyWorldReshape(base,recipe){
 if(!recipe?.enabled)return structuredClone(base);
 const bp=structuredClone(base),T=bp.cell,NX=bp.terrain.rows[0].length,NZ=bp.terrain.rows.length;
 const original=bp.terrain.rows.map(r=>r.split('')),rows=original.map(r=>r.slice());
 const raw=(x,z)=>original[Math.floor(z/T)]?.[Math.floor(x/T)]??'w';
 for(const [key,pins]of Object.entries(recipe.pinned))for(const p of pins){
  const target=bp[key].find(q=>q.id===p.id);if(!target)throw Error(`Missing pinned ${key}/${p.id}`);target.x=p.x;target.z=p.z;
 }
 // Recover local underlying lowland from the frozen base, not newly painted
 // cells; order-independent and no shared random generator is consumed.
 function low(x,z){
  const ax=Math.floor(x/T),az=Math.floor(z/T);
  for(let r=1;r<22;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
   const c=original[az+dz]?.[ax+dx];if(c&&!['m','h','w','r'].includes(c))return c;
  }return 'p';
 }
 const protectedPoints=[...bp.sites.map(p=>({...p,buffer:recipe.clearance.site})),...bp.nodes.map(p=>({...p,buffer:recipe.clearance.node})),...bp.camps.map(p=>({...p,buffer:recipe.clearance.camp})),...bp.setPieces.map(p=>({...p,buffer:recipe.clearance.setPiece})),...bp.nativeVillageSlots.map(p=>({...p,buffer:recipe.clearance.nativeVillage})),...bp.riverSources.map(p=>({...p,buffer:recipe.clearance.source}))];
 const shapes=[...recipe.ranges,...(recipe.spurs||[]).map(r=>({...r,id:r.parent}))].map(r=>({...r,points:smoothPath(r.knots)}));
 for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){
  const x=(i+.5)*T,z=(j+.5)*T;
  if('mh'.includes(original[j][i]))rows[j][i]=low(x,z);
  if('wr'.includes(rows[j][i]))continue;
  for(const r of shapes){const q=nearestSegment(r.points,x,z);
   if(q.d<q.width+260&&!['n','d','k'].includes(rows[j][i]))rows[j][i]='h';
   if(q.d>=q.width)continue;
   if(bp.passes.some(p=>Math.hypot(x-p.x,z-p.z)<recipe.clearance.pass)||protectedPoints.some(p=>Math.hypot(x-p.x,z-p.z)<p.buffer))break;
   rows[j][i]='m';break;
  }
 }
 // Replace each named lake's original connected body, not unrelated tarns.
 for(const lake of recipe.lakes){
  const old=bp.lakes.find(l=>l.id===lake.id);if(!old)throw Error(`Unknown lake ${lake.id}`);
  const seen=new Set(),queue=[[Math.floor(old.x/T),Math.floor(old.z/T)]];
  for(let k=0;k<queue.length;k++){
   const [x,z]=queue[k],id=z*NX+x;if(x<0||z<0||x>=NX||z>=NZ||seen.has(id)||original[z][x]!=='w')continue;
   seen.add(id);rows[z][x]=low((x+.5)*T,(z+.5)*T);queue.push([x-1,z],[x+1,z],[x,z-1],[x,z+1]);
  }
  const outline=smoothPath(lake.outline,true),xs=outline.map(p=>p[0]),zs=outline.map(p=>p[1]);
  const bounds=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++)if(pointInside(outline,(i+.5)*T,(j+.5)*T))rows[j][i]='w';
  // Radius remains a conservative compatibility bound; terrain rows own shape.
  Object.assign(old,{outline:outline.map(p=>p.map(Math.round)),bounds,r:Math.ceil(Math.max(...outline.map(p=>Math.hypot(p[0]-old.x,p[1]-old.z))))});
 }
 const river=bp.rivers.find(r=>r.id===recipe.river.id),oldRiver=river.points,newRiver=smoothPath(recipe.river.knots);
 const length=newRiver.reduce((n,p,i)=>i?n+Math.hypot(p[0]-newRiver[i-1][0],p[1]-newRiver[i-1][1]):0,0);
 const along=[0];for(let i=1;i<newRiver.length;i++)along.push(along[i-1]+Math.hypot(newRiver[i][0]-newRiver[i-1][0],newRiver[i][1]-newRiver[i-1][1]));
 for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){
  const x=(i+.5)*T,z=(j+.5)*T;
  if(original[j][i]==='r'&&nearestSegment(oldRiver,x,z).d<river.width+T)rows[j][i]=low(x,z);
  if(raw(x,z)==='w')continue; // preserve coastline, source tarn and other water
  const q=nearestSegment(newRiver,x,z),f=(along[q.index-1]+q.t*(along[q.index]-along[q.index-1]))/length;
  const radius=Math.max(35,river.width*(.55+.15*Math.min(3,Math.floor(f*4)))/2);
  if(q.d<radius)rows[j][i]='r';
 }
 river.points=newRiver.map(p=>p.slice(0,2).map(Math.round));
 // Retain the original substrate at authored site clearings. Nearest-lowland
 // inference can otherwise pull adjacent marsh under a previously buildable site.
 for(const p of recipe.pinned.sites){const i=Math.floor(p.x/T),j=Math.floor(p.z/T);
  if(rows[j][i]==='k'&&!['m','w','r','k'].includes(p.terrainCode))rows[j][i]=p.terrainCode;
 }
 for(const stream of bp.streams.filter(s=>s.river===river.id)){
  const p=stream.points.at(-1),q=nearestSegment(newRiver,...p),n=stream.points.length;
  for(let i=Math.max(0,n-4);i<n;i++){const weight=(i-(n-4)+1)/4;stream.points[i]=[Math.round(stream.points[i][0]+(q.x-p[0])*weight),Math.round(stream.points[i][1]+(q.z-p[1])*weight)];}
 }
 // An exact geometric width accompanies each sampled spine; old halfWidth is
 // retained as a conservative bound for compatibility/debugging.
 for(const r of bp.ranges){
  const main=shapes.find(s=>s.id===r.id),sample=p=>p.filter((_,i)=>i%3===0||i===p.length-1);
  const points=sample(main.points);r.spine=points.map(p=>p.slice(0,2).map(Math.round));r.halfWidths=points.map(p=>Math.round(p[2]));r.halfWidth=Math.max(...r.halfWidths);
  r.spurs=shapes.filter(s=>s.id===r.id&&s!==main).map(s=>{const p=sample(s.points);return {spine:p.map(q=>q.slice(0,2).map(Math.round)),halfWidths:p.map(q=>Math.round(q[2]))};});
 }
 bp.terrain.rows=rows.map(r=>r.join(''));
 return bp;
}
