// Offline, character-local motion (+Z forward): rise behind, pass overhead,
// cast forward, then recover. No chain simulation runs in the game.
const KEYS=[
 [0,-.55,.60,.35],[.13,-.64,.92,-.60],[.29,-.53,1.85,-.82],
 [.42,-.35,2.20,.12],[.56,-.18,1.02,1.80],[.71,-.30,.45,1.45],
 [.88,-.55,.54,.62],[1,-.55,.60,.35]
];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
export const CHAIN_LINKS=48,CHAIN_LENGTH=1.92;

export function chainWeightPose(phase,attacking){
 const p=clamp(phase);if(!attacking)return {x:-.55,y:.60,z:.35,extension:0};
 let i=0;while(i<KEYS.length-2&&p>KEYS[i+1][0])i++;
 const a=KEYS[i],b=KEYS[i+1],dt=b[0]-a[0],u=(p-a[0])/dt;
 const previous=KEYS[Math.max(0,i-1)],next=KEYS[Math.min(KEYS.length-1,i+2)];
 const h00=2*u**3-3*u*u+1,h10=u**3-2*u*u+u,h01=-2*u**3+3*u*u,h11=u**3-u*u;
 const value=c=>h00*a[c]+h10*dt*(i?(b[c]-previous[c])/(b[0]-previous[0]):0)
   +h01*b[c]+h11*dt*(i+1<KEYS.length-1?(next[c]-a[c])/(next[0]-a[0]):0);
 const x=value(1),y=value(2),z=value(3);return {x,y,z,extension:clamp((z-.35)/1.45)};
}

// Verlet integration + position-based distance constraints. The exporter samples
// animated hand anchors in chronological order, then reuses this track for 8 views.
export function bakeChainTrack({duration,anchorAt,attacking=true,hz=240,links=CHAIN_LINKS,length=CHAIN_LENGTH}){
 const count=links,step=length/(count-1),dt=1/hz,points=[],previous=[];
 const anchor=anchorAt(0),rest=chainWeightPose(0,false),tip=[rest.x,rest.y,rest.z];
 for(let i=0;i<count;i++){const u=i/(count-1),p=anchor.map((n,k)=>mix(n,tip[k],u));p[1]=Math.max(.12,p[1]-.55*Math.sin(Math.PI*u));points.push(p);previous.push([...p]);}
 const collide=p=>{
  p[1]=Math.max(.10,p[1]);
  // A conservative torso capsule; the right-hand path avoids the opposite shield.
  if(p[1]>.35&&p[1]<1.75){const d=Math.hypot(p[0],p[2]);if(d<.32){const s=.32/Math.max(d,1e-8);p[0]=d<1e-8?-.32:p[0]*s;p[2]*=s;}}
 };
 function constrain(pin,goal,iterations=64){
  const target=[...goal],d=Math.hypot(...goal.map((v,k)=>v-pin[k]));
  if(d>length*.98)for(let k=0;k<3;k++)target[k]=pin[k]+(goal[k]-pin[k])*length*.98/d;
  for(let n=0;n<iterations;n++){
   points[0]=[...pin];points[count-1]=[...target];
   for(let j=0;j<count-1;j++){
    const i=n%2?count-2-j:j;
    const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],d=Math.hypot(dx,dy,dz)||1e-8;
    const fix=(d-step)/d,wa=i===0?0:i===count-2?1:.5,wb=i===count-2?0:i===0?1:.5;
    for(let k=0;k<3;k++){const v=(b[k]-a[k])*fix;a[k]+=v*wa;b[k]-=v*wb;}
   }
   for(let i=1;i<count-1;i++)collide(points[i]);
  }
  points[0]=[...pin];points[count-1]=[...target];
 }
 function advance(pin,goal){
  for(let i=1;i<count-1;i++)for(let k=0;k<3;k++){
   const p=points[i],old=p[k],velocity=(p[k]-previous[i][k])*.987;
   p[k]+=velocity+(k===1?-9.81*dt*dt:0);previous[i][k]=old;
  }
  // The authored weight leads the stroke; free links retain inertia and sag.
  constrain(pin,goal);
 }
 for(let i=0;i<hz;i++)advance(anchor,tip);
 const initial=points.map(p=>[...p]),frames=[initial],steps=Math.max(1,Math.ceil(duration*hz));
 for(let i=1;i<=steps;i++){
  const phase=i/steps,pin=anchorAt(phase),guide=chainWeightPose(phase,attacking);
  advance(pin,[guide.x,guide.y,guide.z]);
  // Ease residual whip energy into the next idle pose.
  if(attacking&&phase>.86){
   const t=clamp((phase-.86)/.14),blend=t*t*(3-2*t);
   for(let j=1;j<count;j++)for(let k=0;k<3;k++)points[j][k]=mix(points[j][k],initial[j][k]+(pin[k]-anchor[k]),blend*.28);
   constrain(pin,[guide.x,guide.y,guide.z]);
  }
  frames.push(points.map(p=>[...p]));
 }
 return {duration,steps,links:count,length,frames};
}

// Deterministic random access: drawing a frame never advances the simulation.
export function sampleChainTrack(track,phase){
 const f=clamp(phase)*track.steps,i=Math.min(track.steps,Math.floor(f)),j=Math.min(track.steps,i+1),t=f-i;
 return track.frames[i].map((p,n)=>p.map((v,k)=>mix(v,track.frames[j][n][k],t)));
}
