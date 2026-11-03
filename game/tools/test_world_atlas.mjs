import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { atlasItems, ATLAS_MARKERS, ATLAS_LAYERS, atlasGlyphSVG, createAtlasBiomes, atlasRegionAt, atlasZoneLabels } from '../src/world_atlas.js';
import { createPaint } from '../src/world_paint.js';
import { createWorldMap, worldToCanvas, isDiscovered, fitView } from '../src/world_map.js';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url));
const world=JSON.parse(read('game/data/world.json')), cfg=JSON.parse(read('game/data/world_paint.json')), art=JSON.parse(read('game/data/world_atlas.json'));
for (const [path,hash] of Object.entries(art.sourceHashes)) assert.equal(createHash('sha256').update(read(path)).digest('hex'),hash,`Stale atlas input: ${path}. Refresh reference and review artwork before updating registration.`);
assert.deepEqual(read(art.sourceImage),read('game/'+art.image),'native source is installed unchanged');
assert.deepEqual(art.size,world.size);
const png=read('game/'+art.image);
assert.equal(png.readUInt32BE(16)/png.readUInt32BE(20),world.size.w/world.size.h,'native artwork aspect matches the world without stretching');
const layers=Object.fromEntries(ATLAS_LAYERS.map(l=>[l.id,true]));
const state={discovered:'0',pins:[{id:'p',x:1200,z:2300,note:'A'.repeat(200)}],towns:[{id:'t',x:world.sites[0].x,z:world.sites[0].z}]};
const unexplored=atlasItems(world,state,layers,()=>false);
assert.ok(unexplored.every(i=>!['site','camp','resource'].includes(i.kind)),'full geography does not reveal undiscovered sites, camps or resources');
for (const [kind,count] of [['bridge',9],['ford',8],['pass',20],['town',1],['capital',1],['pin',1]]) assert.equal(unexplored.filter(i=>i.kind===kind).length,count,`${kind} is available before exploration`);
const all=atlasItems(world,state,layers,()=>true);
for (const [key,kind] of [['sites','site'],['nodes','resource'],['camps','camp'],['passes','pass']]) for (const it of world[key]) {
  const marker=all.find(m=>m.id===it.id && m.kind===kind); assert.ok(marker); assert.equal(marker.x,it.x);assert.equal(marker.z,it.z);
}
assert.equal(all.filter(i=>i.kind==='bridge').length,9);assert.equal(all.filter(i=>i.kind==='ford').length,8);
for (const it of world.fords) {
  const marker=unexplored.find(m=>m.id===it.id);assert.ok(marker);assert.equal(marker.kind,it.kind);assert.equal(marker.x,it.x);assert.equal(marker.z,it.z);
}
for (const layer of ATLAS_LAYERS.filter(l=>['sites','camps','resources','crossings'].includes(l.id))) {
  const visible=atlasItems(world,state,{...layers,[layer.id]:false},()=>true);
  assert.ok(visible.every(it=>ATLAS_MARKERS[it.kind].layer!==layer.id),'disabled layer contributes neither symbols nor hit targets');
}
for (const kind of Object.keys(ATLAS_MARKERS)) assert.ok(atlasGlyphSVG(kind).includes(ATLAS_MARKERS[kind].color));
for (const region of world.regions) {
  const [x0,z0,x1,z1]=region.box;
  assert.equal(atlasRegionAt(world,(x0+x1)/2,(z0+z1)/2)?.id,region.id);
}
assert.equal(atlasRegionAt(world,-1,0),null);
assert.equal(atlasRegionAt(world,world.size.w,world.size.h),null);
const intersects=(a,b)=>a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
for (const [w,h] of [[480,300],[800,460],[1400,800]]) {
  const view=fitView(world,w,h),project=(x,z)=>worldToCanvas(x,z,view),p=project(2625,1900);
  const obstacle={left:p.px-10,right:p.px+10,top:p.py-10,bottom:p.py+10};
  const labels=atlasZoneLabels(world,project,s=>s.length*7,{left:29,top:29,right:w-5,bottom:h-5},[obstacle]);
  if(w>=800)assert.ok(labels.length>0,'zone names fit normal atlas sizes');
  for (const [i,l] of labels.entries()) {
    assert.equal(l.lines.join(' '),l.region.name,'labels use source zone names');
    const [x0,z0,x1,z1]=l.region.box,a=project(x0,z0),b=project(x1,z1);
    assert.ok(l.box.left>=Math.max(29,a.px) && l.box.right<=Math.min(w-5,b.px) && l.box.top>=Math.max(29,a.py) && l.box.bottom<=Math.min(h-5,b.py),'label stays inside its own zone and visible viewport');
    assert.ok(!intersects(l.box,obstacle),'zone label avoids map symbols');
    for(const previous of labels.slice(0,i))assert.ok(!intersects(l.box,previous.box),'zone names never overlap each other');
  }
}
const biomes=createAtlasBiomes(world,cfg),paint=createPaint(world,cfg),weights=new Float32Array(cfg.biomes.length);
for (const [x,z] of [[0,0],[6486.37,3735.21],...world.sites.map(s=>[s.x+.3,s.z+.7]),...world.passes.map(p=>[p.x,p.z])]) {
  paint.fieldAt(x,z,weights);let best=0;for(let i=1;i<weights.length;i++)if(weights[i]>weights[best])best=i;
  assert.equal(biomes.at(x,z).id,cfg.biomes[best],'hover queries exact runtime field, not mock sampling');
}

// Exercise illustration loading/fallback, hover, pin clutter, fog and hidden hit targets without a browser.
const globals={document:globalThis.document,Image:globalThis.Image,addEventListener:globalThis.addEventListener};
const calls=[],events={},images=[];
const context=()=>new Proxy({measureText:t=>({width:t.length*7})},{get:(o,k)=>o[k]??((...args)=>calls.push([k,...args]))});
const make=()=>({width:1400,height:800,clientWidth:1400,clientHeight:800,getContext:()=>context(),addEventListener:(k,fn)=>{events[k]=fn;},getBoundingClientRect:()=>({left:0,top:0,width:1400,height:800})});
try {
  globalThis.document={createElement:make};globalThis.addEventListener=()=>{};
  globalThis.Image=class {constructor(){images.push(this);}};
  const canvas=make();let hover=null;
  const map=createWorldMap({canvas,world,paintConfig:cfg,atlasConfig:art,getState:()=>state,onHover:p=>hover=p});map.attach();map.frame(1);
  assert.equal(images[0].src,art.image);assert.ok(calls.some(c=>c[0]==='drawImage' && c[1]!==images[0]),'terrain fallback before art loads');
  images[0].onload();calls.length=0;map.frame(1);
  assert.ok(calls.some(c=>c[0]==='drawImage' && c[1]===images[0] && c[2]===0 && c[3]===0 && c[4]===world.size.w && c[5]===world.size.h),'full native image registered to exact world bounds');
  assert.ok(!calls.some(c=>c[0]==='fillText' && c[1]===state.pins[0].note),'long pin notes never spill across map');
  assert.ok(!calls.some(c=>c[0]==='rect' && c[3]===250),'terrain fog cells are absent');
  for (const marker of unexplored.filter(i=>['bridge','ford','pass'].includes(i.kind))) {
    const p=worldToCanvas(marker.x,marker.z,map.view);
    assert.equal(map.hit(p.px,p.py)?.id,marker.id,'crossing/pass hit target exists at its authored location before exploration');
    events.pointermove({clientX:p.px,clientY:p.py,buttons:0});map.invalidate();map.frame(1);
    assert.ok(hover.feature.includes(marker.id));
    assert.ok(hover.feature.startsWith(ATLAS_MARKERS[marker.kind].label),'hover identifies the crossing/pass type');
    assert.equal(hover.zone,atlasRegionAt(world,marker.x,marker.z)?.name || '','hover includes the real zone');
  }
  const bridge=world.fords.find(f=>f.kind==='bridge'),bp=worldToCanvas(bridge.x,bridge.z,map.view);
  map.setLayer('crossings',false);assert.equal(map.hit(bp.px,bp.py),null,'crossing layer also removes its hit targets');
  map.setLayer('crossings',true);
  const target=world.sites[5],p=worldToCanvas(target.x,target.z,map.view);
  assert.equal(map.hit(p.px,p.py),null,'undiscovered site has no hit target');
  state.discovered=null;map.setLayer('sites',false);assert.equal(map.hit(p.px,p.py),null,'hidden site has no hit target');
  map.setLayer('sites',true);assert.equal(map.hit(p.px,p.py)?.id,target.id);
  events.pointermove({clientX:p.px+.01,clientY:p.py+.02,buttons:0});map.frame(2);
  assert.ok(hover.feature.includes(target.id));assert.equal(hover.biome,biomes.at(hover.x,hover.z).name);
  assert.ok(calls.some(c=>c[0]==='strokeText'),'zone labels are drawn by default');
  map.setLayer('names',false);calls.length=0;map.frame(3);
  assert.ok(!calls.some(c=>c[0]==='strokeText'),'Zone names toggle hides labels');
  assert.equal(hover.zone,atlasRegionAt(world,hover.x,hover.z)?.name || '','zone hover survives hiding labels');
  assert.ok(isDiscovered(world,'0',world.capital.x,world.capital.z)===false);
} finally {for(const [k,v] of Object.entries(globals))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}

// Resolve the actual root display rules in stylesheet order. This catches the World grid
// overriding [hidden], which left a closed map visible even though its JS state was closed.
const atlasCSS=read('game/src/world_atlas.css').toString();
const css=[read('game/src/deployment_map.css').toString(),atlasCSS,...read('game/index.html').toString().matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(s=>typeof s==='string'?s:s[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
function rootDisplay(classes,hidden) {
  let display='',rank=-1;
  for(const [,selectors,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) for(const selector of selectors.split(',')) {
    const match=selector.trim().match(/^#gamemap((?:\.[\w-]+)*)(\[hidden\])?$/);if(!match)continue;
    const required=match[1].split('.').filter(Boolean);if(required.some(c=>!classes.includes(c)) || (match[2]&&!hidden))continue;
    const value=body.match(/(?:^|;)\s*display\s*:\s*([\w-]+)/)?.[1],specificity=required.length+!!match[2];
    if(value && specificity>=rank){display=value;rank=specificity;}
  }
  return display;
}
for(const mode of [['game-map'],['game-map','world'],['game-map','world','docked']]) {
  assert.equal(rootDisplay(mode,true),'none','Close/M/Escape hidden state wins in every map mode');
  assert.equal(rootDisplay(mode,false),'grid','open map remains visible');
}
assert.doesNotMatch(atlasCSS,/overflow(?:-[xy])?\s*:\s*(?:auto|scroll)\b/,'atlas has no scrolling panels');
console.log('test_world_atlas: registration, discovery/crossings, zone labels/hover, fallback and hidden-state CSS passed');
