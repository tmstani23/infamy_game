// Actual panel handlers against a small Node event surface and the real sim.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame} from '../src/sim/game.js';
import {setupMatch} from '../src/sim/setup_match.js';
import {createDeploymentPanel} from '../src/deployment_panel.js';
let mutations=0;const nodes=[];
class Element{
 children=[];handlers={};dataset={};style={};classes=new Set();value='';hidden=false;disabled=false;innerHTML='';textContent='';
 classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),toggle:(x,v)=>v?this.classes.add(x):this.classes.delete(x)};
 constructor(){nodes.push(this);}
 append(...xs){for(const x of xs)this.appendChild(x);}
 appendChild(n){if(n.parent)n.remove();this.children.push(n);n.parent=this;mutations++;return n;}
 insertBefore(n,before){if(n.parent)n.remove();this.children.splice(before?this.children.indexOf(before):this.children.length,0,n);n.parent=this;mutations++;}
 get lastChild(){return this.children.at(-1);}
 remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;mutations++;}}
 replaceChildren(...xs){while(this.children.length)this.lastChild.remove();this.append(...xs);}
 add(n){this.appendChild(n);}
 setAttribute(k,v){(this.attributes||={})[k]=v;}
 addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);}
 emit(k,e={}){for(const fn of this.handlers[k]||[])fn({preventDefault(){},stopPropagation(){},...e});}
 blur(){}focus(){}checkValidity(){return Number.isSafeInteger(Number(this.value))&&Number(this.value)>=0;}
}
const original={document:globalThis.document,Option:globalThis.Option};
globalThis.document={createElement:()=>new Element(),createTextNode:text=>Object.assign(new Element(),{textContent:text}),activeElement:null};
globalThis.Option=class extends Element{constructor(text,value){super();this.textContent=text;this.value=value;}};
try{
 const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
 const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json')});
 const {heroId}=setupMatch(g,{clan:'shinobi',difficulty:'easy',bots:read('data/bots.json')}),h=g.state.entities[heroId],sector=g.state.deployment.sectors[0];
 const ids=[0,1].map(i=>g.spawn('ninja','ninja_grunt',h.x+i,h.z,{owner:h.owner,deployment:{group:'hero'}}));
 const root=new Element(),button=new Element(),elements=new Map();
 root.querySelector=selector=>{
   for(const [,cls]of selector.matchAll(/\.([a-z-]+)/g))assert.ok(root.innerHTML.includes(cls),`selector ${cls} must exist in panel markup`);
   if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);
 };
 root.querySelectorAll=()=>[];
 const selected={ids,selected(){return this.ids;},select(ids){this.ids=ids;},returnToDutyAndSelectHero(){}},queue=[];let destinationPick=null;
 const panel=createDeploymentPanel({root,button,game:g,units:g.settings.units,heroId,crewInput:selected,send:c=>queue.push(c),onPickDestination:fn=>destinationPick=fn,onCancelPick:()=>destinationPick=null});
 const $=s=>elements.get(s);panel.openGroup('hero');
 const sourceIds=[...selected.ids];assert.equal($('.roster').children.length,sourceIds.length);$('.transfer-start').emit('click');assert.equal(queue.length,0,'opening transfer sends no optimistic order');
 assert.equal(typeof destinationPick,'function','transfer mode captures map destination clicks immediately');
 $('.pick-destination').emit('click');destinationPick(g.state.deployment.sectors[1].id);assert.equal(typeof destinationPick,'function','map destination mode persists until confirm/cancel');destinationPick(sector.id);assert.deepEqual(selected.ids,sourceIds,'repeated destination choices never replace source crew');assert.equal($('.confirm-transfer').disabled,false);
 $('.confirm-transfer').emit('click');assert.deepEqual(queue[0].units,sourceIds);assert.equal(queue[0].to,sector.id);assert.match($('.acceptance').textContent,/PENDING/);
 g.step(queue.splice(0));panel.update();assert.match($('.acceptance').textContent,/TRANSFER STARTED/);assert.match($('.acceptance').className,/accepted/);
 mutations=0;for(let i=0;i<120;i++)panel.update();assert.equal(mutations,0,'unchanged frames preserve interactive roster nodes');
 panel.openGroup(sector.id);$('.task').value='ambush';$('.task').emit('change');assert.equal(queue.length,1,'duty selector applies directly without a Save step');
 assert.match($('.acceptance').textContent,/PENDING/);g.step(queue.splice(0));panel.update();assert.match($('.acceptance').textContent,/AMBUSH ACTIVE/);
 $('.task').value='guard';$('.task').emit('change');g.step(queue.splice(0));panel.update();assert.match($('.acceptance').textContent,/NOT ACCEPTED/,'server rejection cannot display success');
 assert.ok(nodes.every(n=>!n.draggable&&!n.handlers.dragstart),'button-only transfer exposes no drag controls');
 console.log('Deployment panel: real button-only transfer locks source/confirm, pending→authoritative result, direct duty, rejection, stable controls/no dragging passed');
}finally{globalThis.document=original.document;globalThis.Option=original.Option;}
