// Edit layout mode (src/hud_layout.js, phase 8 rewrite 2026-10-30): drag/resize panel handles while editing,
// release is seen even when a panel stops mouseup bubbling, Cancel restores, Done saves, Reset clears,
// and the world-anchored target-marker layer (#lock) is never enrolled. Run: node tools/test_hud_drag.mjs
import assert from 'node:assert/strict';
import { createHudLayout } from '../src/hud_layout.js';
const globals = ['document','localStorage','fetch','addEventListener','ResizeObserver','innerWidth','innerHeight'];
const previous = Object.fromEntries(globals.map(k=>[k,globalThis[k]]));
class Element {
  constructor(id=''){this.id=id;}
  style={}; children=[]; handlers={}; offsetWidth=100; offsetHeight=80; hidden=false; dataset={}; nodeType=1;
  classes=new Set();classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),contains:name=>this.classes.has(name),remove:name=>this.classes.delete(name)};
  addEventListener(type,fn,options={}){(this.handlers[type]||=[]).push({fn,capture:options===true||!!options.capture});}
  append(...children){this.children.push(...children);}
  appendChild(child){this.append(child);}
  setAttribute(){} focus(){} blur(){} querySelector(){return null;} querySelectorAll(){return [];}
  getBoundingClientRect(){const left=parseFloat(this.style.left)||100,top=parseFloat(this.style.top)||100;return {left,top,width:100,height:80,right:left+100,bottom:top+80};}
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
