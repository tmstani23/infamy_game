// Model capture/bubble propagation in Node: the target frame deliberately stops
// mouseup bubbling. HUD layout must still see release before that handler.
import assert from 'node:assert/strict';
import { createHudLayout } from '../src/hud_layout.js';
const globals = ['document','localStorage','fetch','addEventListener','ResizeObserver','innerWidth','innerHeight'];
const previous = Object.fromEntries(globals.map(k=>[k,globalThis[k]]));
class Element {
  style={}; children=[]; handlers={}; offsetWidth=100; offsetHeight=80; hidden=false;
  classList={toggle(){}};
  addEventListener(type,fn,options={}){(this.handlers[type]||=[]).push({fn,capture:options===true||!!options.capture});}
  append(...children){this.children.push(...children);}
  appendChild(child){this.append(child);}
  blur(){}
  getBoundingClientRect(){const left=parseFloat(this.style.left)||100,top=parseFloat(this.style.top)||100;return {left,top,width:100,height:80,right:left+100,bottom:top+80};}
}
try {
 const win=new Element(),body=new Element(),target=new Element();
 let writes=0;
 globalThis.document={body,getElementById:id=>id==='utarget'?target:null,createElement:()=>new Element()};
 globalThis.localStorage={getItem:()=>null,setItem(){writes++;}};
 globalThis.fetch=async()=>({ok:true});
 globalThis.addEventListener=(...args)=>win.addEventListener(...args);
 globalThis.ResizeObserver=class{observe(){}};
 globalThis.innerWidth=1200;globalThis.innerHeight=900;
 const layout=createHudLayout({fromFile:{}}),layer=body.children[0],[lock,grip]=layer.children;
 const dispatch=(node,type,extra={})=>{
  let stopped=false,immediate=false;
  const e={button:0,buttons:1,clientX:120,clientY:120,...extra,target:node,
   preventDefault(){},stopPropagation(){stopped=true;},stopImmediatePropagation(){stopped=true;immediate=true;}};
  const invoke=(el,capture)=>{e.currentTarget=el;for(const h of el.handlers[type]||[])if(h.capture===capture){h.fn(e);if(immediate)break;}};
  invoke(win,true);if(!stopped){invoke(node,true);if(!immediate)invoke(node,false);}if(!stopped)invoke(win,false);
 };
 target.addEventListener('mouseup',e=>e.stopPropagation());
 dispatch(lock,'click'); // unlock
 dispatch(target,'mousedown');dispatch(win,'mousemove',{clientX:180,clientY:160});
 const placed=target.style.left;assert.notEqual(placed,undefined);
 dispatch(target,'mouseup',{buttons:0});
 dispatch(win,'mousemove',{clientX:280,clientY:260});
 assert.equal(target.style.left,placed,'release over the target frame ends dragging despite stopped bubbling');
 dispatch(lock,'click');dispatch(win,'mousemove',{clientX:380});
 assert.equal(target.style.left,placed,'locking never leaves an active drag');
 dispatch(lock,'click');dispatch(target,'mousedown');
 dispatch(win,'mousemove',{buttons:0,clientX:480});
 dispatch(win,'mousemove',{clientX:580});
 assert.equal(target.style.left,placed,'missing a release is recovered when no button is held');
 dispatch(grip,'mousedown');dispatch(win,'mousemove',{clientX:150,clientY:150});
 const resized=target.style.scale;assert.notEqual(resized,'1');
 dispatch(target,'mouseup',{buttons:0});dispatch(win,'mousemove',{clientX:650,clientY:650});
 assert.equal(target.style.scale,resized,'resize also stops on captured release');
 dispatch(target,'mousedown');dispatch(win,'blur');const beforeBlur=target.style.left;
 dispatch(win,'mousemove',{clientX:750});assert.equal(target.style.left,beforeBlur,'losing window focus cancels dragging');
 assert.ok(writes>=3,'finished placements are saved');
 layout.reset();assert.equal(target.style.left,'');
 console.log('HUD drag: target frame release, lock, lost release, resize, blur and reset passed');
} finally {for(const k of globals){if(previous[k]===undefined)delete globalThis[k];else globalThis[k]=previous[k];}}
