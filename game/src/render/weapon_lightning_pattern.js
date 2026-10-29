// Presentation only. Read the blade-only mask once; keep discharges attached to
// the actual blade in every exported animation frame, including foreshortening.
export function bladeAxes(rgba, width, height, frames, directions = 8) {
  const cell = height / directions, axes = [];
  for (let dir = 0; dir < directions; dir++) for (let frame = 0; frame < frames; frame++) {
    let peak = 0;
    const alpha = (x,y) => rgba[((dir*cell+y)*width+frame*cell+x)*4+3];
    for (let y=0;y<cell;y++) for(let x=0;x<cell;x++) peak=Math.max(peak,alpha(x,y));
    const points=[]; let sx=0,sy=0,weight=0;
    for(let y=0;y<cell;y++) for(let x=0;x<cell;x++) {
      const a=alpha(x,y); if(a<Math.max(40,peak*.68))continue;
      const p={x:(x+.5)/cell,y:1-(y+.5)/cell,w:a}; points.push(p);sx+=p.x*a;sy+=p.y*a;weight+=a;
    }
    if(points.length<3){axes.push(null);continue;}
    const cx=sx/weight,cy=sy/weight;let xx=0,yy=0,xy=0;
    for(const p of points){const x=p.x-cx,y=p.y-cy;xx+=x*x*p.w;yy+=y*y*p.w;xy+=x*y*p.w;}
    const angle=.5*Math.atan2(2*xy,xx-yy),dx=Math.cos(angle),dy=Math.sin(angle);
    let lo=Infinity,hi=-Infinity;
    for(const p of points){const t=(p.x-cx)*dx+(p.y-cy)*dy;lo=Math.min(lo,t);hi=Math.max(hi,t);}
    const a={x:cx+dx*lo,y:cy+dy*lo},b={x:cx+dx*hi,y:cy+dy*hi};
    // The tip is the end farther from the body, not a fixed screen direction.
    const fromBody=p=>Math.hypot(p.x-.5,p.y-.48);
    axes.push(fromBody(a)>fromBody(b)?{base:b,tip:a}:{base:a,tip:b});
  }
  return axes;
}

export function lightningPattern(axis, seed, attacking = false) {
  let s=seed>>>0;
  const random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const {base,tip}=axis,dx=tip.x-base.x,dy=tip.y-base.y,len=Math.hypot(dx,dy);
  if(len<.008)return [];
  const nx=-dy/len,ny=dx/len;
  // Recursive, unequal leader steps give correlated bends at several scales.
  // Branches split from actual nodes and taper; no regular zigzag/sine wave.
  function leader(a,b,depth,roughness) {
    if(!depth)return [a,b];
    const t=.35+random()*.3,offset=(random()-.5)*roughness;
    const m={x:a.x+(b.x-a.x)*t+nx*offset,y:a.y+(b.y-a.y)*t+ny*offset};
    const left=leader(a,m,depth-1,roughness*.52),right=leader(m,b,depth-1,roughness*.52);
    return [...left.slice(0,-1),...right];
  }
  const end={x:tip.x+dx*(attacking?.18:.06),y:tip.y+dy*(attacking?.18:.06)};
  const main=leader(base,end,4,len*.2),paths=[{points:main,width:1}];
  for(let i=0;i<(attacking?4:3);i++) {
    const start=main[3+Math.floor(random()*10)],side=random()<.5?-1:1;
    const outward=len*(.16+random()*(attacking?.45:.28))*side,forward=.08+random()*.28;
    const finish={x:start.x+dx*forward+nx*outward,y:start.y+dy*forward+ny*outward};
    const branch=leader(start,finish,3,len*.12);
    paths.push({points:branch,width:.35+random()*.22});
    if(random()<.55) {
      const p=branch[3];paths.push({points:leader(p,{x:p.x+dx*.12-nx*outward*.4,y:p.y+dy*.12-ny*outward*.4},2,len*.06),width:.2});
    }
  }
  return paths;
}
