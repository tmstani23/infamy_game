// Axis movement against island rectangles, with a bounded nudge around near corners.
// Same primitive is exercised by the terrain-edge tests and live movement.
const EPS=1e-4;
const overlaps=(x,z,r,b)=>x+r>b.minX&&x-r<b.maxX&&z+r>b.minZ&&z-r<b.maxZ;
export function slideWorld(x,z,r,dx,dz,near,slip=.6){
  if(!dx&&!dz)return [x,z];
  if(dx&&dz){
    // Follow the tangent first at a fillet, on either orientation. Otherwise a
    // fixed X-first split can undo a Z-first corner escape on every frame.
    let zFirst=false,best=Infinity;
    for(const box of near(x-r-slip,z-r-slip,x+r+slip,z+r+slip))for(const c of box.shoreCorners||[]){
      const qx=(x-c.x)*c.sx,qz=(z-c.z)*c.sz;
      if(qx<-r-slip||qz<-r-slip||qx>c.radius+r+slip||qz>c.radius+r+slip)continue;
      const d=Math.abs(Math.hypot(x-c.cx,z-c.cz)-c.radius);
      if(d<best&&d<r+slip+Math.hypot(dx,dz)){best=d;zFirst=Math.abs(x-c.cx)>Math.abs(z-c.cz);}
    }
    const a=zFirst?slideWorld(x,z,r,0,dz,near,slip):slideWorld(x,z,r,dx,0,near,slip);
    // A corner nudge can oppose the other requested axis. Applying that axis
    // immediately would undo the nudge every tick and pin units on fine stairs.
    if(Math.abs(zFirst?a[0]-x:a[1]-z)>EPS)return a;
    const b=zFirst?slideWorld(...a,r,dx,0,near,slip):slideWorld(...a,r,0,dz,near,slip);
    if(Math.abs(zFirst?b[1]-a[1]:b[0]-a[0])>EPS&&Math.abs(zFirst?a[1]-z:a[0]-x)>EPS)return a;
    return b;
  }
  const query=near(Math.min(x,x+dx)-r-slip,Math.min(z,z+dz)-r-slip,Math.max(x,x+dx)+r+slip,Math.max(z,z+dz)+r+slip);
  let nx=x+dx,nz=z+dz;const hit=[];
  for(const b of query){
    if(!overlaps(nx,nz,r,b))continue;hit.push(b);
    if(dx>0)nx=Math.min(nx,b.minX-r-EPS);else if(dx<0)nx=Math.max(nx,b.maxX+r+EPS);
    else if(dz>0)nz=Math.min(nz,b.minZ-r-EPS);else nz=Math.max(nz,b.maxZ+r+EPS);
  }
  if(dx&&Math.sign(nx-x)!==Math.sign(dx))nx=x;
  if(dz&&Math.sign(nz-z)!==Math.sign(dz))nz=z;
  const distance=Math.abs(dx||dz),progress=Math.hypot(nx-x,nz-z);
  if(progress<distance-EPS&&slip>0){
    const candidates=[];
    for(const b of hit){
      const offset=dx?[b.minZ-r-EPS-z,b.maxZ+r+EPS-z]:[b.minX-r-EPS-x,b.maxX+r+EPS-x];
      for(const d of offset)if(Math.abs(d)<=slip+EPS)candidates.push(d);
    }
    candidates.sort((a,b)=>Math.abs(a)-Math.abs(b)||a-b);
    for(const d of candidates){
      const nudge=Math.sign(d)*Math.min(Math.abs(d),Math.sqrt(Math.max(0,distance*distance-progress*progress)));
      const qx=nx+(dx?0:nudge),qz=nz+(dx?nudge:0);
      if(!query.some(b=>overlaps(qx,qz,r,b))){nx=qx;nz=qz;break;}
    }
  }
  // Never enter a second obstacle while sliding around the first.
  return query.some(b=>overlaps(nx,nz,r,b))?[x,z]:[nx,nz];
}
