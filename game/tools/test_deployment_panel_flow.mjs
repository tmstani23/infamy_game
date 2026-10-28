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
 $('.cancel-transfer').emit('click');assert.equal(queue.length,0,'cancelling before choosing a destination sends no command');
 $('.transfer-start').emit('click');$('.pick-destination').emit('click');destinationPick(sector.id);
 assert.equal(destinationPick,null,'destination choice starts transfer and exits map picker');assert.deepEqual(selected.ids,sourceIds,'destination choice preserves source crew');
 assert.deepEqual(queue[0].units,sourceIds);assert.equal(queue[0].to,sector.id);assert.match($('.acceptance').textContent,/PENDING/);
 g.step(queue.splice(0));panel.update();assert.match($('.acceptance').textContent,/TRANSFER STARTED/);assert.match($('.acceptance').className,/accepted/);
 mutations=0;for(let i=0;i<120;i++)panel.update();assert.equal(mutations,0,'unchanged frames preserve interactive roster nodes');
 panel.openGroup(sector.id);$('.task').value='ambush';$('.task').emit('change');assert.equal(queue.length,1,'duty selector applies directly without a Save step');
 assert.match($('.acceptance').textContent,/PENDING/);g.step(queue.splice(0));panel.update();assert.match($('.acceptance').textContent,/AMBUSH ACTIVE/);
 $('.task').value='guard';$('.task').emit('change');g.step(queue.splice(0));panel.update();assert.match($('.acceptance').textContent,/NOT ACCEPTED/,'server rejection cannot display success');
 // A destination may be staffed directly without switching to its source tab.
 const reserve=g.spawn('ninja','ninja_grunt',h.x,h.z,{owner:h.owner,deployment:{group:'home',keepAtHQ:true}});
 panel.openGroup(g.state.deployment.sectors[2].id);const destination=g.state.deployment.sectors[2].id;
 assert.equal($('.transfer-start').disabled,true,'original transfer still requires selected source crew');
 $('.assign-here').emit('click');assert.equal($('.assign-mode').hidden,false);assert.equal($('.assign-source').value,'home','destination flow prefers HQ reserves');
 assert.equal(queue.length,0);assert.equal($('.confirm-assignment').disabled,true,'no transfer without explicit crew choice');
 const incomingRow=$('.assign-roster').children.find(n=>n.children[1].textContent.includes(`#${reserve}`));assert.ok(incomingRow);
 incomingRow.children[0].checked=true;incomingRow.children[0].emit('change');
 assert.match($('.assign-preview').textContent,/HQ reserves/);assert.match($('.assign-preview').textContent,new RegExp(g.state.deployment.sectors[2].name));
 assert.equal(selected.ids.length,0,'destination chooser never turns picked crew into a mixed combat selection');
 h.hitAt=g.state.tick;panel.update(true);assert.equal($('.confirm-assignment').disabled,true,'same combat restrictions apply to incoming assignments');
 assert.equal(queue.length,0);h.hitAt=g.state.tick-120;panel.update(true);assert.equal($('.confirm-assignment').disabled,false);
 $('.cancel-assignment').emit('click');assert.equal(queue.length,0,'cancelling inbound assignment sends nothing');
 $('.assign-here').emit('click');incomingRow.children[0].checked=true;incomingRow.children[0].emit('change');
 $('.confirm-assignment').emit('click');assert.deepEqual(queue[0].units,[reserve]);assert.equal(queue[0].to,destination);
 g.step(queue.splice(0));panel.update();assert.equal(g.state.entities[reserve].deployment.transfer.to,destination);assert.match($('.acceptance').textContent,/TRANSFER STARTED/);
 const another=g.spawn('ninja','ninja_grunt',h.x,h.z,{owner:h.owner,deployment:{group:'home',keepAtHQ:true}});
 panel.openGroup('home');$('.transfer-start').emit('click');destinationPick(destination);
 assert.deepEqual(queue[0].units,[another]);assert.equal(queue[0].to,destination,'choosing destination auto-confirms');
 g.step(queue.splice(0));panel.update();assert.ok(g.state.entities[another].deployment.transfer);
 assert.equal($('.transfer-start').textContent,'Cancel transfer');$('.transfer-start').emit('click');
 assert.equal(queue[0].action,'cancelTransfer');g.step(queue.splice(0));panel.update();
 assert.equal(g.state.entities[another].deployment.transfer.cancelled,true,'same button cancels the active trip');
 assert.ok(nodes.every(n=>!n.draggable&&!n.handlers.dragstart),'button-only transfer exposes no drag controls');
 console.log('Deployment panel: source/destination assignment, auto-start, active cancel, authoritative feedback, direct duty, rejection and stable controls/no dragging passed');
}finally{globalThis.document=original.document;globalThis.Option=original.Option;}
