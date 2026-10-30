// Edit layout mode (src/hud_layout.js, phase 8 rewrite 2026-10-30): drag/resize panel handles while editing,
// release is seen even when a panel stops mouseup bubbling, Cancel restores, Done saves, Reset clears,
// and the world-anchored target-marker layer (#lock) is never enrolled. Run: node tools/test_hud_drag.mjs
import assert from 'node:assert/strict';
import { createHudLayout } from '../src/hud_layout.js';
const globals = ['document','localStorage','fetch','addEventListener','ResizeObserver','innerWidth','innerHeight'];
const previous = Object.fromEntries(globals.map(k=>[k,globalThis[k]]));
class Element {
  constructor(id=''){this.id=id;}
  style={}; children=[]; handlers={}; hidden=false; dataset={}; nodeType=1;attributes={};
  get offsetWidth(){return this.hidden||this.hiddenAncestor?0:parseFloat(this.style.width)||100;} get offsetHeight(){return this.hidden||this.hiddenAncestor?0:parseFloat(this.style.height)||parseFloat(this.style.minHeight)||80;}
  classes=new Set();classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),contains:name=>this.classes.has(name),remove:name=>this.classes.delete(name)};
  addEventListener(type,fn,options={}){(this.handlers[type]||=[]).push({fn,capture:options===true||!!options.capture});}
  append(...children){this.children.push(...children);}
  appendChild(child){this.append(child);}
  setAttribute(k,v){this.attributes[k]=v;} focus(){} blur(){} querySelector(){return null;} querySelectorAll(){return [];}
  getBoundingClientRect(){if(this.hidden||this.hiddenAncestor)return {left:0,top:0,width:0,height:0};const s=Number(this.style.scale)||1,width=this.offsetWidth*s,height=this.offsetHeight*s,left=(parseFloat(this.style.left)||100)+(this.offsetWidth-width)/2,top=(parseFloat(this.style.top)||100)+(this.offsetHeight-height)/2;return {left,top,width,height,right:left+width,bottom:top+height};}
}
try {
 const win=new Element(),target=new Element('utarget'),lock=new Element('lock'),body=new Element();
 body.children.push(target,lock);
 let writes=0;
 globalThis.document={body,getElementById:id=>id==='utarget'?target:null,createElement:()=>new Element()};
 globalThis.localStorage={getItem:()=>null,setItem(){writes++;}};
 globalThis.fetch=async()=>({ok:true});
 globalThis.addEventListener=(...args)=>win.addEventListener(...args);
 globalThis.ResizeObserver=class{observe(){}};
 globalThis.innerWidth=1200;globalThis.innerHeight=900;
 const layout=createHudLayout({fromFile:{}});
 assert.ok(layout.registered().includes('utarget'));
 assert.ok(!layout.registered().includes('lock'),'target-marker layer stays pinned (not a movable panel)');
 const layer=body.children.find(c=>c!==target&&c!==lock);
 const handle=layer.children.find(c=>c.className==='layout-handle'),grip=handle.children.find(c=>c.className==='layout-resize');
 const dispatch=(node,type,extra={})=>{
  let stopped=false,immediate=false;
  const e={button:0,buttons:1,clientX:120,clientY:120,code:'',target:node,...extra,
   preventDefault(){},stopPropagation(){stopped=true;},stopImmediatePropagation(){stopped=true;immediate=true;}};
  const invoke=(el,capture)=>{e.currentTarget=el;for(const h of el.handlers[type]||[])if(h.capture===capture){h.fn(e);if(immediate)break;}};
  invoke(win,true);if(!stopped){invoke(node,true);if(!immediate)invoke(node,false);}if(!stopped)invoke(win,false);
 };
 target.addEventListener('mouseup',e=>e.stopPropagation());
 dispatch(handle,'mousedown');dispatch(win,'mousemove',{clientX:180});
 assert.equal(target.style.left,undefined,'nothing moves outside edit mode');
 layout.begin();assert.equal(layout.isEditing(),true);
 dispatch(handle,'mousedown');dispatch(win,'mousemove',{clientX:180,clientY:160});
 const placed=target.style.left;assert.ok(placed,'dragging the handle moves the panel');
 dispatch(target,'mouseup',{buttons:0});dispatch(win,'mousemove',{clientX:280,clientY:260});
 assert.equal(target.style.left,placed,'release over the target frame ends dragging despite stopped bubbling');
 dispatch(handle,'mousedown');dispatch(win,'mousemove',{buttons:0,clientX:480});dispatch(win,'mousemove',{clientX:580});
 assert.equal(target.style.left,placed,'missing a release is recovered when no button is held');
 dispatch(handle,'mousedown',{target:grip});dispatch(win,'mousemove',{clientX:150,clientY:150});   // the grip sits inside the handle
 const resized=target.style.scale;assert.ok(resized&&resized!=='1','the corner grip resizes');
 dispatch(win,'mouseup',{buttons:0});
 dispatch(handle,'mousedown');dispatch(win,'blur');const beforeBlur=target.style.left;
 dispatch(win,'mousemove',{clientX:750});assert.equal(target.style.left,beforeBlur,'losing window focus cancels dragging');
 const w0=writes;layout.cancel();assert.equal(layout.isEditing(),false);assert.equal(writes,w0,'Cancel saves nothing');
 assert.equal(target.style.left,'','Cancel restores the previous layout');
 layout.begin();dispatch(handle,'mousedown');dispatch(win,'mousemove',{clientX:300,clientY:200});dispatch(win,'mouseup');
 const done=target.style.left;layout.done();assert.ok(writes>w0,'Done saves');assert.equal(target.style.left,done);
 layout.reset();assert.equal(target.style.left,'','Reset restores defaults');
 console.log('Edit layout: enrollment, drag, captured release, lost release, resize, blur, Cancel, Done and Reset passed');
} finally {for(const k of globals){if(previous[k]===undefined)delete globalThis[k];else globalThis[k]=previous[k];}}
// side handles (2026-10-30): free panels get edges that set width / height; Cancel drops them
{
 const win=new Element(),target=new Element('contract'),body=new Element();body.children.push(target);
 globalThis.document={body,getElementById:id=>id==='contract'?target:null,createElement:()=>new Element()};
 globalThis.localStorage={getItem:()=>null,setItem(){}};globalThis.fetch=async()=>({ok:true});
 globalThis.addEventListener=(...args)=>win.addEventListener(...args);globalThis.ResizeObserver=class{observe(){}};
 globalThis.innerWidth=1200;globalThis.innerHeight=900;
 const layout=createHudLayout({fromFile:{}}),layer=body.children[1];
 const handle=layer.children.find(c=>c.className==='layout-handle'),right=handle.children.find(c=>c.dataset?.edge==='r');
 assert.ok(right,'free panels have side handles');
 const fire=(node,type,extra={})=>{const e={button:0,buttons:1,clientX:120,clientY:120,target:node,...extra,preventDefault(){},stopPropagation(){}};for(const h of (node.handlers[type]||[]))h.fn(e);for(const h of (win.handlers[type]||[]))h.fn(e);};
 layout.begin();fire(handle,'mousedown',{target:right});fire(win,'mousemove',{clientX:180});
 assert.equal(target.style.width,'160px','dragging the right edge widens the panel');
 layout.cancel();assert.equal(target.style.width,'','Cancel drops the new width');
 for(const k of globals){if(previous[k]===undefined)delete globalThis[k];else globalThis[k]=previous[k];}
 console.log('Edit layout side handles passed');
}
// Filtering is editor-only; picker selection isolates overlaps, and action-bar dimensions persist.
{
 try {
  const win=new Element(),body=new Element(),nodes=['bar','utarget','control-tooltip','callout','hire'].map(id=>new Element(id));
  const [bar,target,tooltip,alert,window]=nodes;body.children.push(...nodes);tooltip.hidden=true;
  let stored=null;
  globalThis.document={body,getElementById:id=>nodes.find(n=>n.id===id),createElement:()=>new Element()};
  globalThis.localStorage={getItem:()=>null,setItem(k,v){stored=JSON.parse(v);}};globalThis.fetch=async()=>({ok:true});
  globalThis.addEventListener=(...args)=>win.addEventListener(...args);globalThis.ResizeObserver=class{observe(){}};
  globalThis.innerWidth=1200;globalThis.innerHeight=900;
  const layout=createHudLayout({fromFile:{}}),layer=body.children.at(-1),toolbar=layer.children[0],filters=toolbar.children.find(c=>c.className==='layout-filters'),picker=filters.children[0];
  const handle=id=>layer.children.find(c=>c.attributes['aria-label']===`Move or resize ${id}`);
  const fire=(node,type,extra={})=>{const e={button:0,buttons:1,clientX:120,clientY:120,target:node,preventDefault(){},stopPropagation(){},...extra};for(const h of node.handlers[type]||[])h.fn(e);};
  const pick=id=>{picker.value=id;fire(picker,'change');};
  const hbar=handle('Action bar'),htarget=handle('Target portrait'),htip=handle('Controls tooltip');
  layout.begin();assert.equal(hbar.hidden,false);assert.equal(htip.hidden,true);
  for(const n of [tooltip,alert,window])assert.ok(n.classList.contains('layout-filtered'));
  assert.equal(tooltip.hidden,true,'filter does not change game visibility state');
  const toggle=filters.children.find(c=>c.dataset.filter==='tooltips');fire(toggle,'click');assert.equal(htip.hidden,false);
  pick('control-tooltip');assert.ok(htip.classList.contains('selected'));assert.ok(tooltip.classList.contains('layout-focused'));
  fire(toggle,'click');assert.equal(htip.hidden,true);assert.equal(picker.value,'','hiding selected category clears selection');
  pick('bar');assert.ok(hbar.classList.contains('selected'));assert.ok(bar.classList.contains('layout-focused'));
  const right=hbar.children.find(c=>c.dataset.edge==='r'),bottom=hbar.children.find(c=>c.dataset.edge==='b');assert.ok(right&&bottom,'bar gets independent width and height handles');
  fire(hbar,'mousedown',{target:right});fire(win,'mousemove',{clientX:720});fire(win,'mouseup');
  assert.equal(bar.style.width,'700px');assert.equal(bar.dataset.layoutSized,'true');
  fire(hbar,'mousedown',{target:bottom});fire(win,'mousemove',{clientY:240});fire(win,'mouseup');
  assert.equal(bar.style.height,'200px');
  fire(hbar,'mousedown');pick('utarget');fire(win,'mousemove',{clientX:1000});
  assert.equal(bar.style.width,'700px','changing selection stops the old drag');
  assert.equal(hbar.classList.contains('selected'),false);assert.ok(htarget.classList.contains('selected'));
  assert.equal(bar.classList.contains('layout-focused'),false);
  const oldLeft=bar.style.left;fire(hbar,'keydown',{code:'ArrowLeft'});assert.equal(bar.style.left,oldLeft,'unselected keyboard event cannot move a panel');
  layout.done();assert.equal(stored.bar.w,700);assert.equal(stored.bar.h,200);
  for(const n of nodes){assert.equal(n.classList.contains('layout-filtered'),false);assert.equal(n.classList.contains('layout-focused'),false);}
  layout.begin();layout.reset();assert.equal(bar.style.width,'');assert.equal(bar.style.height,'');assert.equal(bar.dataset.layoutSized,'false');
  layout.cancel();assert.equal(bar.style.width,'700px');assert.equal(bar.style.height,'200px','Cancel restores saved sizes after Reset');
  layout.reset();assert.equal(bar.style.width,'');assert.equal(bar.style.height,'');
  console.log('Layout filters, hidden previews, exclusive selection/stacking, stopped drags, stretchy bar persistence and reset passed');
 } finally {for(const k of globals){if(previous[k]===undefined)delete globalThis[k];else globalThis[k]=previous[k];}}
}

// Hidden DOM boxes measure zero: edit saved dimensions, not stale natural measurements.
{
 try {
  const win=new Element(),body=new Element(),contract=new Element('contract'),controls=new Element('controls'),cols=new Element();
  contract.hidden=controls.hidden=true;cols.hiddenAncestor=true;controls.querySelector=()=>cols;body.children.push(contract,controls);
  let stored;
  globalThis.document={body,getElementById:id=>({contract,controls})[id],createElement:()=>new Element()};
  globalThis.localStorage={getItem:()=>null,setItem(k,v){stored=JSON.parse(v);}};globalThis.fetch=async()=>({ok:true});
  globalThis.addEventListener=(...args)=>win.addEventListener(...args);globalThis.ResizeObserver=class{observe(){}};
  globalThis.innerWidth=1200;globalThis.innerHeight=900;
  const initial={ax:'l',ay:'t',dx:200,dy:200,s:1.5,w:240,h:100};
  const layout=createHudLayout({fromFile:{contract:{...initial},controls:{...initial}}}),layer=body.children.at(-1),toolbar=layer.children[0],filters=toolbar.children.find(c=>c.className==='layout-filters');
  const fire=(node,type,extra={})=>{const e={button:0,buttons:1,clientX:200,clientY:200,target:node,preventDefault(){},stopPropagation(){},...extra};for(const h of node.handlers[type]||[])h.fn(e);};
  layout.begin();fire(filters.children.find(c=>c.dataset.filter==='windows'),'click');
  for(const [el,label]of [[contract,'Contract status'],[controls,'Controls window']]){
   const handle=layer.children.find(c=>c.attributes['aria-label']===`Move or resize ${label}`);
   assert.equal(handle.style.width,'360px');assert.equal(handle.style.height,'150px');
   const left=parseFloat(handle.style.left),top=parseFloat(handle.style.top);
   for(const [side,delta,key,want]of [['r',{clientX:290},'width',450],['b',{clientY:260},'height',210]]){
    fire(handle,'mousedown',{target:handle.children.find(c=>c.dataset.edge===side)});fire(win,'mousemove',delta);fire(win,'mouseup');
    assert.equal(parseFloat(handle.style[key]),want,'hidden placeholder follows pointer at current scale');
   }
   assert.equal(parseFloat(handle.style.left),left);assert.equal(parseFloat(handle.style.top),top,'opposite corner stays fixed');
   assert.equal(el.hidden,true,'editing never forces game window visible');
  }
  assert.equal(cols.style.width,undefined,'Controls resizes the whole window, not inner columns');
  layout.done();assert.equal(stored.contract.w,300);assert.equal(stored.contract.h,140);assert.equal(stored.controls.w,300);
  contract.hidden=controls.hidden=false;layout.begin();layout.update();
  const h=layer.children.find(c=>c.attributes['aria-label']==='Move or resize Contract status');
  assert.equal(h.style.width,'450px');assert.equal(h.style.height,'210px','populated box matches hidden preview');
  layout.reset();layout.cancel();assert.equal(contract.style.width,'300px');assert.equal(controls.style.minHeight,'140px');
  console.log('Hidden contract/Controls sizing: zero measurements, scaled width/height, fixed corner, population and saved restoration passed');
 } finally {for(const k of globals){if(previous[k]===undefined)delete globalThis[k];else globalThis[k]=previous[k];}}
}
