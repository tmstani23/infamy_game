// Town minimap follows the camera when zoomed in (2026-11-20): box stays centred, clicks map back correctly.
import assert from 'node:assert/strict';
const lines=[];let path=[];
const ctx=new Proxy({},{get:(o,k)=>k==='beginPath'?()=>{path=[];}:k==='moveTo'||k==='lineTo'?(u,v)=>path.push([u,v]):k==='stroke'?()=>{if(o.strokeStyle==='rgba(255,255,255,.75)')lines.push(path);}:o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
const canvas=()=>({clientWidth:200,style:{},handlers:{},getContext:()=>ctx,addEventListener(n,f){(this.handlers[n]||=[]).push(f);},getBoundingClientRect:()=>({left:0,top:0,width:200,height:200})});
const events={};
globalThis.document={createElement:canvas,body:{appendChild(){}}};globalThis.devicePixelRatio=1;globalThis.innerWidth=1000;globalThis.innerHeight=800;
globalThis.addEventListener=(n,f)=>(events[n]||=[]).push(f);globalThis.ImageData=class{constructor(w,h){this.data=new Uint8ClampedArray(w*h*4);}};
const {createMinimap}=await import('../src/minimap.js');
const N=100,state={entities:{h:{id:'h',owner:'p',type:'hero',place:'street',x:20,z:20}},businesses:{},clans:{}};
const game={state,scenery:[],vision:{grid:()=>({w:N,h:N,minX:0,minZ:0,visible:new Uint8Array(N*N),explored:new Uint8Array(N*N)}),cellOf:()=>-1}};
let cam={x:20,z:20},place='street',looked=null;
const view={cameraXZ:()=>cam,commandPlace:()=>place,isPanned:()=>false,screenToGround:(px,py)=>({x:cam.x+(px/innerWidth-.5)*10,z:cam.z+(py/innerHeight-.5)*10}),lookAt:(x,z)=>{looked={x,z};}};
const c=canvas(),map=createMinimap({canvas:c,game,district:{ground:[],bounds:{minX:0,minZ:0,maxX:N,maxZ:N}},view,fog:{isOn:()=>false,seen:s=>s},heroId:'h',clan:'p',selected:()=>[],send(){}});
const mid=()=>{const p=lines.at(-1);return[p.reduce((a,q)=>a+q[0],0)/4,p.reduce((a,q)=>a+q[1],0)/4];};
const near=(a,b,m)=>assert.ok(Math.abs(a[0]-b[0])<1e-6&&Math.abs(a[1]-b[1])<1e-6,m+` got ${a} want ${b}`);
// zoom 1: whole town, box off centre where the camera is (camera at 20,20 is up-left of the middle 50,50)
map.draw();const m1=mid();assert.ok(Math.abs(m1[0]-100)<1e-6&&m1[1]<100,'zoom 1: box at the camera, map not moved');
// zoomed: the box sits in the middle and stays there as the camera moves (pan, follow, Home)
map.zoomBy(2);near(mid(),[100,100],'zoomed: box centred');
cam={x:70,z:35};map.draw();near(mid(),[100,100],'camera moved: map followed');
// a click maps to the world point under it on the drawn map
const down=(u,v,button=0)=>c.handlers.mousedown[0]({clientX:u,clientY:v,button,stopPropagation(){},preventDefault(){}});
down(100,100);assert.ok(Math.abs(looked.x-70)<1e-6&&Math.abs(looked.z-35)<1e-6,'click on the middle looks at the camera point');
// while dragging the map holds still (centre stays 70,35), so the drag point does not slide
const K=200/(200*0.7071067811865476)*1.02*2*0.7071067811865476,at=(x,z,cx,cz)=>[100+((x-cx)-(z-cz))*K,100+((x-cx)+(z-cz))*K];
cam={x:30,z:30};map.draw();near(mid(),at(30,30,70,35),'dragging: map held');
events.mouseup.forEach(f=>f());cam={x:40,z:40};map.draw();near(mid(),[100,100],'after drag: follows again');
// indoors the map holds where it was (centre 40,40) even though the camera point is the room
place='den_1';state.entities.h.place='den_1';view.isPanned=()=>true;cam={x:900,z:900};map.draw();near(mid(),at(900,900,40,40),'indoors: map held');
// camera beyond the town: centre clamped to the town's edge
place='street';state.entities.h.place='street';cam={x:200,z:-50};map.draw();near(mid(),at(200,-50,100,0),'centre clamped to the town');
// zoom back out: middle of the district again
map.zoomBy(0.25);cam={x:50,z:50};map.draw();near(mid(),[100,100],'zoom 1 with camera in the middle');
console.log('minimap follow ok');
