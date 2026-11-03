import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { worldToCanvas, canvasToWorld, worldTransform, hitTest, fitView, zoomAt, clampView, isDiscovered, fogCols, GRID, gridLabel, columnLetters, createWorldMap, worldTerrainCache, rulerLabels } from '../src/world_map.js';
const world = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url)));
const v = fitView(world, 1400, 800);
for (const [x, z] of [[0, 0], [7000, 4000], [13950, 7950], [3210.5, 999.9]]) {
  const p = worldToCanvas(x, z, v), q = canvasToWorld(p.px, p.py, v);
  assert.ok(Math.hypot(q.x - x, q.z - z) < 0.5, 'round trip');
}
const z = { ...v, cx: 5000, cz: 3000, scale: 0.2 }; const before = canvasToWorld(300, 200, z);
zoomAt(world, z, 300, 200, 1.5); const after = canvasToWorld(300, 200, z);
assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.5, 'zoom keeps point under cursor');
clampView(world, z); assert.ok(z.scale <= 1.2 && z.scale >= 0.1 * 0.9 - 1e-9);
const items = [{ id: 'a', x: 1000, z: 1000 }, { id: 'b', x: 1050, z: 1000 }];
const vv = { cx: 1000, cz: 1000, scale: 0.1, w: 800, h: 600 }; // 50 units = 5 px
assert.equal(hitTest(items, 400 + 4, 300, vv).id, 'b', 'nearest wins');
assert.equal(hitTest(items, 400 - 3, 300, vv).id, 'a');
assert.equal(hitTest(items, 400, 330, vv), null, 'too far');
assert.equal(isDiscovered(world, null, 5, 5), true);
const g = '0'.repeat(fogCols(world) * 32).split(''); g[0] = '1'; const gs = g.join('');
assert.equal(isDiscovered(world, gs, 100, 100), true); assert.equal(isDiscovered(world, gs, 600, 100), false);
// North-up geometry is independent of display density; no stretch, rotation or lost margins.
const origin = worldToCanvas(0, 0, v), east = worldToCanvas(500, 0, v), south = worldToCanvas(0, 500, v);
assert.equal(east.py, origin.py); assert.equal(south.px, origin.px);
assert.ok(east.px > origin.px && south.py > origin.py);
assert.equal(east.px - origin.px, south.py - origin.py);
assert.ok(origin.px >= 24 && origin.py >= 24);
assert.ok(worldToCanvas(14000, 8000, v).px <= v.w - 24);
const [a,b,c,d,e,f] = worldTransform(v);
assert.equal(a * 3210 + c * 999 + e, worldToCanvas(3210,999,v).px);
assert.equal(b * 3210 + d * 999 + f, worldToCanvas(3210,999,v).py);
assert.equal(GRID, 500);
for (const [i,label] of [[0,'A'],[25,'Z'],[26,'AA'],[27,'AB'],[51,'AZ'],[52,'BA']]) assert.equal(columnLetters(i),label);
for (const [x,z,label] of [[0,0,'A1'],[499.99,499.99,'A1'],[500,500,'B2'],[12480,3500,'Y8'],[13999.99,7999.99,'AB16'],[-1,0,''],[0,NaN,'']]) assert.equal(gridLabel(x,z),label);

// Canvas doubles verify CSS/backing pixels, event coordinates and caching in Node (no browser).
const globals = { document: globalThis.document, devicePixelRatio: globalThis.devicePixelRatio, addEventListener: globalThis.addEventListener };
function canvasDouble(w=800,h=460) {
  const events = {}, calls = [];
  const ctx = new Proxy({ calls, measureText: s=>({width:s.length*7}) }, {get(o,k){return o[k] ?? ((...args)=>calls.push([k,...args]));}});
  return { width:w, height:h, clientWidth:w, clientHeight:h, ctx, events, getContext:()=>ctx,
    getBoundingClientRect:()=>({left:0,top:0,width:w*2,height:h*2}),
    addEventListener:(name,fn)=>{events[name]=fn;},setPointerCapture(){},releasePointerCapture(){} };
}
try {
  const made=[];
  globalThis.document = { createElement:()=>{const c=canvasDouble();made.push(c);return c;} };
  globalThis.devicePixelRatio = 2; globalThis.addEventListener = ()=>{};
  const canvas = canvasDouble(), st = {hero:{x:12480,z:3500},cameraQuad:[{x:12400,z:3500},{x:12480,z:3450},{x:12560,z:3500},{x:12480,z:3550}]};
  const map = createWorldMap({canvas,world,getState:()=>st});map.attach();map.frame(1);
  assert.equal(canvas.width,1600);assert.equal(canvas.height,920);
  assert.equal(map.view.w,800);assert.equal(map.view.h,460);
  const cache=worldTerrainCache(world);assert.equal(worldTerrainCache(world),cache);
  assert.equal(cache.width,world.terrain.rows[0].length*4);assert.equal(cache.height,world.terrain.rows.length*4);
  assert.equal(made.length,2,'World map and minimap reuse a single terrain cache');
  assert.equal(map.grid,false,'grid starts hidden');
  assert.ok(canvas.ctx.calls.some(c=>c[0]==='fillText' && c[1]==='AB'),'rulers remain visible with grid hidden');
  // The atlas is now geographical: camera and enemy snapshots cannot alter its drawing.
  const initial=canvas.ctx.calls.slice();canvas.ctx.calls.length=0;
  st.cameraQuad=null;st.lastSeen={enemy:{x:12345,z:2345,now:true}};map.invalidate();map.frame(1);
  assert.deepEqual(canvas.ctx.calls,initial,'camera footprint and enemy units are absent from the atlas');
  const draws=canvas.ctx.calls.length;map.frame(1);assert.equal(canvas.ctx.calls.length,draws,'unchanged frames do not redraw');
  const mouse={clientX:800,clientY:460,buttons:1,button:0,pointerId:1};
  const before=canvasToWorld(400,230,map.view);canvas.events.wheel({...mouse,deltaY:-1,preventDefault(){}});
  const after=canvasToWorld(400,230,map.view);assert.ok(Math.hypot(before.x-after.x,before.z-after.z)<1e-6,'zoom at transformed CSS pointer');
  const start={...map.view};canvas.events.pointerdown(mouse);canvas.events.pointermove({...mouse,clientX:840,clientY:480});canvas.events.pointerup(mouse);
  assert.ok(Math.abs(map.view.cx-(start.cx-20/start.scale))<1e-6,'north-up horizontal pan');
  assert.ok(Math.abs(map.view.cz-(start.cz-10/start.scale))<1e-6,'north-up vertical pan');assert.equal(map.wasDrag(),true);
  canvas.events.pointerdown(mouse);canvas.events.pointerup(mouse);assert.equal(map.wasDrag(),false,'new click clears old drag');
  map.setGrid(true);map.frame(1);assert.equal(map.grid,true);
  globalThis.devicePixelRatio=1;map.frame(1);assert.equal(canvas.width,800);assert.equal(map.view.w,800);
} finally { for (const [key,value] of Object.entries(globals)) {if(value===undefined)delete globalThis[key];else globalThis[key]=value;} }
// Even narrow rulers leave measured gaps between AA/AB instead of overlapping.
for (const width of [240,420,800,1400]) {
  const labels=rulerLabels(28,i=>25+(i+.5)*(width-50)/28,columnLetters,s=>s.length*7,24,width-4);
  for (let i=1;i<labels.length;i++) assert.ok(labels[i].at-labels[i].text.length*3.5 >= labels[i-1].at+labels[i-1].text.length*3.5+8);
}
console.log('test_world_map: ok');
