import assert from 'node:assert/strict';
import { createMapRaster,mapTerrain } from '../src/map_raster.js';
import { createPresentationMode } from '../src/presentation_mode.js';
import { createDeploymentMapData } from '../src/deployment_map_data.js';

// Pixel parity with the previous renderer; no browser/graphics dependency.
function legacy(base,out,visible,explored,fog,turf){
  for(let n=0;n<base.length/3;n++){
    const r=base[n*3],g=base[n*3+1],b=base[n*3+2];let o=[r,g,b];
    if(fog&&!visible[n]){const l=r*.299+g*.587+b*.114;
      o=explored[n]?[(l+(r-l)*.55)*.5+4,(l+(g-l)*.55)*.5+5,(l+(b-l)*.55)*.5+10]:[7,8,11];}
    const k=n*4,a=turf?.[k+3]||0;if(a)o=[o[0]+(turf[k]-o[0])*a,o[1]+(turf[k+1]-o[1])*a,o[2]+(turf[k+2]-o[2])*a];
    out[k]=o[0];out[k+1]=o[1];out[k+2]=o[2];out[k+3]=255;
  }
}
const n=128*128,base=Uint8ClampedArray.from({length:n*3},(_,i)=>i%256),pixels=new Uint8ClampedArray(n*4),expected=new Uint8ClampedArray(n*4);
const visible=new Uint8Array(n),known=new Uint8Array(n),turf=new Float32Array(n*4),raster=createMapRaster(base,pixels);
for(let i=0;i<n;i++){visible[i]=i%3===0?1:0;known[i]=i%2;turf[i*4]=120;turf[i*4+1]=30;turf[i*4+2]=80;turf[i*4+3]=i%5===0?.7:0;}
for(const fog of [true,false,true])for(const tint of [turf,null]){
  assert.equal(raster.paint(visible,known,fog,tint,true),true);legacy(base,expected,visible,known,fog,tint);
  assert.deepEqual(pixels,expected);assert.equal(raster.paint(visible,known,fog,tint),false,'unchanged map skips texture upload');
}
visible[1]=1;assert.equal(raster.paint(visible,known,true,null),true);legacy(base,expected,visible,known,true,null);assert.deepEqual(pixels,expected);
const fakeGame={scenery:[]},grid={w:2,h:2,minX:0,minZ:0},district={ground:[]};
assert.equal(mapTerrain(fakeGame,district,grid),mapTerrain(fakeGame,district,grid),'small/full maps share terrain');
assert.notEqual(mapTerrain(fakeGame,district,grid),mapTerrain({scenery:[]},district,grid),'separate matches never share stale terrain');

let time=0,stops=0,starts=0,elapsed=0,simTick=0;
const mode=createPresentationMode({now:()=>time,suspend(){stops++;},resume(seconds){starts++;elapsed=seconds;}});
for(let i=0;i<1000;i++){
  mode.sync(true);time+=50;simTick++;mode.measure('map',()=>{});mode.sync(true);assert.equal(mode.map,true);
  mode.sync(false);simTick++;mode.measure('world',()=>{});
}
assert.equal(stops,1000);assert.equal(starts,1000);assert.equal(elapsed,.05);assert.equal(simTick,2000);
assert.deepEqual(mode.diagnostics(),{opens:1000,closes:1000,worldFrames:1000,mapFrames:1000,worldMs:0,mapMs:0,mode:'world'});

// Closed-map observation retains honest sightings without building roster snapshots.
let seen=true;const enemy={id:'e',owner:'r',x:3,z:4,place:'street',type:'thug'};
const game={state:{tick:1,entities:{e:enemy},businesses:{},clans:{p:{},r:{}},deployment:{sectors:[],clans:{p:{sectors:{}}}}},
  deployment:{sectorAt:()=>null,members:()=>[],counts:()=>({})},vision:{canSee:()=>seen}};
const data=createDeploymentMapData({game,clan:'p'}),initial=data.update(false);
assert.deepEqual(initial.contacts,[],'observation alone does not build a detailed snapshot');
game.state.tick++;seen=false;enemy.x=999;data.update(false);
assert.equal(data.get().contacts[0].x,3,'opening uses the last actually observed position');
assert.equal(data.get().contacts[0].live,false);
game.state.tick+=200;data.update(false);assert.equal(data.get().contacts.length,0,'closed-map contacts still expire');

// Small deterministic CPU baseline, not a claim about browser FPS or total RAM.
const start=performance.now();for(let i=0;i<100;i++)legacy(base,expected,visible,known,true,null);const old=performance.now()-start;
const next=performance.now();for(let i=0;i<100;i++)raster.paint(visible,known,true,null);const cached=performance.now()-next;
console.log('Map performance: pixel/fog/tint parity, buffer reuse, lifecycle, lazy honest contacts passed. 100 raster frames: legacy '+old.toFixed(1)+'ms; cached '+cached.toFixed(1)+'ms.');
