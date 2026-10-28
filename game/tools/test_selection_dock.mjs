import assert from 'node:assert/strict';
import {createSelectionDock} from '../src/selection_dock.js';
import {createUnitFrames} from '../src/unit_frames.js';
class Element {
 children=[];parentNode=null;hidden=false;style={left:'153px',scale:'.7'};classes=new Set();
 classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};
 get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}
 appendChild(el){this.insertBefore(el,null);}
 insertBefore(el,sibling){if(el.parentNode)el.parentNode.children.splice(el.parentNode.children.indexOf(el),1);const i=sibling?this.children.indexOf(sibling):this.children.length;this.children.splice(i,0,el);el.parentNode=this;}
}
const body=new Element(),target=new Element(),crew=new Element(),other=new Element(),map=new Element(),deployment=new Element();
body.appendChild(target);body.appendChild(crew);body.appendChild(other);
let destination=null,restores=0;
const dock=createSelectionDock({panels:[target,crew],destination:()=>destination,onRestore:()=>restores++});
destination=map;dock.update();assert.deepEqual(map.children,[target,crew]);assert.ok(target.classes.has('hud-docked'));
const stable=map.children;for(let n=0;n<120;n++)dock.update();assert.equal(map.children,stable,'same host does not rebuild/reparent every frame');
destination=deployment;dock.update();assert.deepEqual(deployment.children,[target,crew]);assert.equal(map.hidden,true);
target.hidden=crew.hidden=true;dock.update();assert.equal(deployment.hidden,true);target.hidden=false;dock.update();assert.equal(deployment.hidden,false);
destination=null;dock.update();assert.deepEqual(body.children,[target,crew,other],'normal HUD parent/order restored');assert.equal(restores,1);
assert.deepEqual(target.style,{left:'153px',scale:'.7'},'docking never overwrites personal layout styles');assert.ok(!target.classes.has('hud-docked'));
// Inspect the clicked traveler even when command selection excludes transfers.
const previousDocument=globalThis.document;
try{
 class FrameElement extends Element {
  parts=new Map();textContent='';innerHTML='';handlers={};
  constructor(){super();this.style.setProperty=(k,v)=>this.style[k]=v;}
  querySelector(key){if(!this.parts.has(key))this.parts.set(key,new FrameElement());return this.parts.get(key);}
  addEventListener(k,fn){this.handlers[k]=fn;}
  after(){}replaceChildren(){this.children=[];}
 }
 const docBody=new FrameElement();globalThis.document={head:new FrameElement(),body:docBody,createElement:()=>new FrameElement()};
 const h={id:'h',type:'hero',model:'ronin',owner:'p',place:'street',hp:100,maxHp:100,x:0,z:0},n={...h,id:'n',type:'ninja',hp:40,maxHp:80,place:'HQ',deployment:{group:'home',transfer:{to:'west'}}},r={...h,id:'r',owner:'r'};
 const game={state:{tick:1,entities:{h,n,r},clans:{p:{kind:'yakuza'},r:{}},deployment:{sectors:[{id:'west',name:'West Ward'}],clans:{p:{sectors:{}}}}},vision:{canSee:()=>true}};
 let selected=[];const input={selected:()=>selected,looked:()=>null,tabbed:()=>r.id};
 const frames=createUnitFrames({game,units:{types:{hero:{name:'Hero'},ninja:{name:'Ninja'}}},catalog:{},heroId:'h',crewInput:input,view:{commandPlace:()=> 'street'}});
 frames.inspect('n');const card=docBody.children.find(el=>el.id==='utarget');
 assert.equal(card.querySelector('.hp span').textContent,'40 / 80');assert.equal(card.querySelector('i').textContent,'Transferring → West Ward','live transfer destination belongs to inspected crew');
 assert.equal(card.hidden,false,'own crew remains inspectable while traveling inside another room');
 frames.clearInspection();assert.match(card.title,/Rival clan/,'closing map restores the normal enemy target context');
}finally{globalThis.document=previousDocument;}
console.log('Selection docking: map/deployment moves reuse live cards, stable nodes, visibility, original HUD order and saved styles passed');
