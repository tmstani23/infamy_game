// Preserve the original i,j collision response order. Reindex moving bodies and
// requery after each push, so chain reactions cannot miss newly adjacent pairs.
// weightOf (optional): a heavy unit (a cannon, units.json weight) is pushed less and pushes lighter ones more.
export function separateUnits(crew,radiusOf,tryMove,weightOf=null){
  const weights=weightOf?crew.map(weightOf):null;
  const radii=crew.map(radiusOf),size=Math.max(1,...radii.map(r=>r*2.2));
  const buckets=new Map(),keys=[];
  const key=e=>`${Math.floor(e.x/size)},${Math.floor(e.z/size)}`;
  const index=i=>{const k=key(crew[i]);if(keys[i]===k)return;buckets.get(keys[i])?.delete(i);if(!buckets.has(k))buckets.set(k,new Set());buckets.get(k).add(i);keys[i]=k;};
  crew.forEach((_,i)=>index(i));
  const nearby=(i,after)=>{
    const a=crew[i],x=Math.floor(a.x/size),z=Math.floor(a.z/size),out=[];
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const j of buckets.get(`${x+dx},${z+dz}`)||[])if(j>after)out.push(j);
    return out.sort((a,b)=>a-b);
  };
  for(let i=0;i<crew.length;i++){
    let candidates=nearby(i,i),at=0;
    while(at<candidates.length){
      const j=candidates[at++],a=crew[i],b=crew[j],dx=b.x-a.x,dz=b.z-a.z,min=(radii[i]+radii[j])*1.1;
      if(Math.abs(dx)>=min||Math.abs(dz)>=min)continue;
      const d=Math.hypot(dx,dz);if(d>=min)continue;
      const [ux,uz]=d>1e-4?[dx/d,dz/d]:[1,0],push=Math.min(.06,(min-d)/2);
      const wi=weights?.[i]||1,wj=weights?.[j]||1,even=wi===wj;
      for(const [n,sign,share]of [[i,-1,even?1:2*wj/(wi+wj)],[j,1,even?1:2*wi/(wi+wj)]]){tryMove(crew[n],radii[n],ux*push*sign*share,0);tryMove(crew[n],radii[n],0,uz*push*sign*share);index(n);}
      candidates=nearby(i,j);at=0;
    }
  }
}
