import assert from 'node:assert/strict';
import {separateUnits} from '../src/sim/separation.js';
import {createNav} from '../src/sim/nav.js';
import {createAISupport} from '../src/sim/ai_support.js';
function original(crew,move){for(let i=0;i<crew.length;i++)for(let j=i+1;j<crew.length;j++){
 const a=crew[i],b=crew[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),min=(a.r+b.r)*1.1;
 if(d>=min)continue;const [ux,uz]=d>1e-4?[dx/d,dz/d]:[1,0],push=Math.min(.06,(min-d)/2);
 for(const [u,s]of [[a,-1],[b,1]]){move(u,u.r,ux*push*s,0);move(u,u.r,0,uz*push*s);}
}}
let seed=123456;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
for(let test=0;test<100;test++){
 const span=test%3===0?0:test%3===1?3:100;
 const input=Array.from({length:80},()=>({x:(random()-.5)*span,z:(random()-.5)*span,r:.15+random()*.5}));
 const a=structuredClone(input),b=structuredClone(input);
 const move=(e,r,x,z)=>{if(e.x+x<-2&&test%2)return false;e.x+=x;e.z+=z;return true;};
 original(a,move);let reads=0;separateUnits(b,e=>{reads++;return e.r;},move);
 assert.equal(reads,input.length,'radius is evaluated once per body');assert.deepEqual(b,a,'ordered pushes match legacy, including dense chain reactions and blocked movement');
}
const nav=createNav([{minX:0,maxX:1,minZ:-18,maxZ:18}],{minX:-20,maxX:20,minZ:-20,maxZ:20});
for(const target of [[10,0],[-5,4],[100,100]]){
 const job=nav.beginPath(-10,0,...target);let calls=0;
 while(!job.done){job.advance(16);assert.ok(job.work<=16);assert.ok(++calls<10000);}
 assert.deepEqual(job.path,nav.findPath(-10,0,...target),'incremental and synchronous paths agree');
 if(target[0]===10)assert.ok(calls>1,'nontrivial search spans multiple bounded updates');
 if(job.path){let from=[-10,0];for(const to of job.path){assert.ok(nav.clearLine(...from,...to),'no path cuts the obstacle');from=to;}}
}
console.log('Collision optimization: 100 seeded legacy parity fixtures, dense/blocked/cross-cell pushes and one radius read per unit; incremental navigation budgets/parity/obstacles passed');
let work=0;
const hero={id:'h',owner:'p',type:'hero',place:'street',x:-10,z:0},state={tick:0,entities:{h:hero},businesses:{}};
const ai=createAISupport({state,rooms:[],nav:{beginPath(...args){const job=nav.beginPath(...args);return {advance(budget){const done=job.advance(budget);work+=job.work;return done;},get work(){return job.work;},get path(){return job.path;}};}}},'p','h');
for(const z of [-3,0,3])assert.equal(ai.route(10,z),Infinity,'unknown routes remain pending');
for(let i=0;ai.planning();i++){
 assert.ok(i<1000);state.tick++;const before=work;ai.plan();assert.ok(work-before<=1024,'all strategic routes share one work budget per bot tick');const after=work;ai.plan();assert.equal(work,after,'repeated calls cannot spend another budget this tick');
}
assert.ok(Number.isFinite(ai.route(10,0)),'completed route is available from cache');
state.tick+=1000;assert.ok(Number.isFinite(ai.route(10,0)),'static-grid results do not expire while strategic work is pending');const cached=work;ai.plan();assert.equal(work,cached);
ai.route(9,9);hero.x=12;state.tick++;ai.plan();assert.equal(ai.planning(),false,'old-origin queued work is discarded');
console.log('AI planning: pending/cached routes, shared per-tick work limit, duplicate-tick guard and stale-origin cancellation passed');
