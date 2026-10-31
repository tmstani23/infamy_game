import assert from 'node:assert/strict';
import {createSweepTrail,sweepArrivalVisible} from '../src/render/sweep_trail.js';
import {createNewsCallouts} from '../src/news_callouts.js';

const op={startedAt:1,pointIndex:0,state:'Marching'},leader={x:0,z:0,place:'street'};
const trail=createSweepTrail(4,1);
assert.equal(trail.update(op,leader,1).length,1);
assert.equal(trail.update(op,leader,1).length,1,'no duplicate on unchanged frames');
leader.x=2;trail.update(op,leader,2);leader.z=2;
let points=trail.update(op,leader,3);
assert.deepEqual(points.map(p=>[p.x,p.z]),[[0,0],[2,0],[2,2]],'trail traces actual corner, not destination shortcut');
assert.equal(points[0].angle,Math.PI/2);assert.equal(points[1].angle,0);
op.state='Holding';assert.equal(trail.update(op,leader,4).length,3,'route persists at hold');
for(let i=0;i<10;i++){leader.z+=2;points=trail.update(op,leader,5+i);}
assert.equal(points.length,4,'bounded history');
op.pointIndex++;assert.equal(trail.update(op,leader,20).length,1,'capture replaces previous leg');
op.state='Returning';assert.equal(trail.update(op,leader,21).length,0,'recall clears route');
op.state='Marching';trail.update(op,leader,22);assert.equal(trail.update(op,leader,0).length,1,'new timeline clears route');
trail.clear();assert.equal(trail.update(op,leader,1).length,1);

const unit={id:'crew',owner:'enemy',place:'street',x:3,z:4},hero={owner:'player'},state={entities:{crew:unit,hero},clans:{},deployment:{sectors:[{id:'ward',name:'West Ward'}]}};
const news={kind:'sweepArrival',clan:'enemy',defender:'other',sector:'ward',point:2,x:3,z:4,units:['crew']};
assert.equal(sweepArrivalVisible(news,state,'player',()=>false),false,'hidden rival arrival private');
assert.equal(sweepArrivalVisible(news,state,'player',()=>true),true,'any observer with sight can see arrival');
unit.hidden=true;assert.equal(sweepArrivalVisible(news,state,'player',(_,e)=>!e.hidden),false);delete unit.hidden;
unit.dead=true;assert.equal(sweepArrivalVisible(news,state,'player',()=>true),false);delete unit.dead;
unit.x=20;assert.equal(sweepArrivalVisible(news,state,'player',()=>true),false,'visible unit elsewhere does not reveal hold');unit.x=3;
assert.equal(sweepArrivalVisible({...news,clan:'player'},state,'player',()=>false),true,'own operation reports arrival');

let sight=false;const calls=[],pings=[];
const game={state,vision:{canSee:()=>sight}};
const ui=createNewsCallouts({game,heroId:'hero',presentation:{map:false},callout:(...x)=>calls.push(x),minimap:{ping:(...p)=>pings.push(p)},gameMap:{ping:(...p)=>pings.push(p)}});
state.news=[news];ui.update();assert.equal(calls.length,0);assert.equal(pings.length,0);
sight=true;ui.update();assert.match(calls[0][0],/IN POSITION.*2\/3/);assert.equal(pings.length,2,'arrival pings map and minimap');
state.news=[{...news,kind:'sweepPoint',defender:'player'}];ui.update();assert.equal(pings.length,2,'next destination never pinged through fog');
console.log('Sweep presentation: route corners, persistence, leg reset, bounds, recall and sight-gated arrival callouts/pings passed');
state.news=[{kind:'sweepSuccess',clan:'player',sector:'ward',ryo:300,scattered:2}];ui.update();
assert.match(calls.at(-1)[0],/VICTORY.*3\/3 secured\n\+300 ryo.*2 rival crew.*returning to duty/);
assert.equal(calls.at(-1)[2],8000,'reward message lingers');
state.news=[{kind:'sweepSuccess',clan:'player',sector:'ward',ryo:0,scattered:0}];ui.update();
assert.match(calls.at(-1)[0],/No additional ryo.*0 rival crew/,'no fabricated payout on empty/cooldown sweep');
state.news=[{kind:'sweepSuccess',clan:'enemy',rival:'player',sector:'ward',ryo:500,scattered:3}];ui.update();
assert.match(calls.at(-1)[0],/ENEMY SWEEP COMPLETE.*\n3 of your crew/);
assert.doesNotMatch(calls.at(-1)[0],/\+500/,'defender is not shown an earned reward');
console.log('Sweep completion: actual payout/top-up, zero payout, scattering count, owner/defender wording and duration passed');

calls.length=0;
state.news=[
  {kind:'renown',clan:'player',amount:37,reason:'Sweep secured'},
  {kind:'renown',clan:'player',amount:5,reason:'Sector cleared'},
  {kind:'renown',clan:'enemy',amount:75,reason:'Raid won'},
  {kind:'renown',clan:'player',amount:0,reason:'Sweep secured'},
  {kind:'sweepSuccess',clan:'player',sector:'ward',ryo:0,scattered:0},
];ui.update();
assert.deepEqual(calls.filter(c=>c[0].includes('Renown')), [
  ['Sweep secured · +37 Renown','win'], ['Sector cleared · +5 Renown','win'],
], 'only actual positive owner rewards appear; configured amounts and separately earned sector-clear reward are preserved');
assert.equal(state.news[0].amount,37,'callout does not mutate reward data');
console.log('Renown feedback: actual event amounts, owner privacy, positive-only rewards and separate sector-clear stacking passed');
