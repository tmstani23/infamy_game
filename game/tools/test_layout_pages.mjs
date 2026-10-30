import assert from 'node:assert/strict';
import {createLayoutPages} from '../src/layout_pages.js';
import {createCrewBar} from '../src/crew_bar.js';
class Node{
 children=[];handlers={};hidden=false;attrs={};className='';classes=new Set();
 classList={toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k),contains:k=>this.classes.has(k),add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)};
 append(...n){this.children.push(...n);}appendChild(n){this.append(n);}setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,fn){this.handlers[k]=fn;}querySelectorAll(){return this.items||[];}
}
const previous=globalThis.document;globalThis.document={createElement:()=>new Node(),head:new Node(),body:new Node()};
try{
 const root=new Node();root.items=Array.from({length:20},(_,i)=>Object.assign(new Node(),{id:String(i)}));
 const pages=createLayoutPages(root,'partyframes'),nav=root.children[0],[back,label,next]=nav.children;
 pages.update(320,330);assert.equal(nav.hidden,false);assert.equal(back.disabled,true);
 const visited=new Set();
 do{root.items.filter(e=>!e.classes.has('layout-page-hidden')).forEach(e=>visited.add(e.id));if(next.disabled)break;next.handlers.click();}while(true);
 assert.equal(visited.size,20,'every crew card remains reachable');assert.equal(root.items.length,20,'paging never removes records');
 const keep=root.items.at(-1);keep.selected=true;pages.update(800,600);assert.ok(keep.selected,'reflow preserves selection state');
 root.items=root.items.slice(0,1);pages.update(800,600);assert.equal(nav.hidden,true);assert.equal(root.items[0].classes.has('layout-page-hidden'),false,'page clamps after deaths/transfers');
 root.items.push(new Node(),new Node(),new Node(),new Node());pages.update(0,330);pages.update(320,330);assert.equal(nav.hidden,false);
 const controls=new Node();controls.items=Array.from({length:6},()=>new Node());createLayoutPages(controls,'controls').update(800,600);
 assert.equal(controls.items.filter(e=>!e.classes.has('layout-page-hidden')).length,1,'Controls sections page without a scrolling window');
 assert.equal(createLayoutPages(new Node(),'ryo'),null,'fixed-shape UI is unaffected');
 const commands=new Node(),sent=[];const crewInput={selected:()=>['c'],returnToDutyAndSelectHero:()=>sent.push('duty'),followMe:()=>sent.push('follow'),crewAttack:()=>sent.push('attack'),stopSelected:()=>sent.push('stop'),armAttackMove:()=>sent.push('amove'),healSelected:()=>sent.push('clinic'),selectAll:()=>sent.push('hero')};
 const game={state:{entities:{h:{owner:'p',type:'hero',place:'street'},c:{owner:'p',type:'thug',place:'street',deployment:{group:'ward'}}},deployment:{clans:{p:{sectors:{ward:{}}}}}}};
 const bar=createCrewBar({root:commands,game,heroId:'h',crewInput});bar.update();
 const buttons=commands.children[0].children;assert.equal(buttons.length,7);
 buttons.forEach(b=>b.handlers.mousedown({button:0,stopPropagation(){}}));assert.deepEqual(sent,['duty','follow','attack','stop','amove','clinic','hero'],'separate commands keep shared input actions');
 console.log('No-scroll panel pages: every crew entry reachable, resize/count changes, selection preserved, Controls paging and independent crew commands passed');
}finally{globalThis.document=previous;}
