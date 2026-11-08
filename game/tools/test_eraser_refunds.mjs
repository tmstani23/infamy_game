import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFrontier} from '../src/sim/frontier/frontier.js';
import {centreCell} from '../src/sim/frontier/town_grid.js';
import {buildPreview,resourceRequirements} from '../src/frontier_build_ui.js';
import {buildTooltip} from '../src/build_tooltips.js';
const data=JSON.parse(readFileSync(new URL('../data/frontier.json',import.meta.url)));
data.settlements={};data.roads={};data.rates.food=0;data.rates.growthTicks=1e9;
const state={tick:0},fr=createFrontier({state,data});
fr.world.addTown({id:'t',owner:'p',name:'Refund test',x:1000,z:1000,pop:10,stock:{food:100,timber:500,stone:100,goods:100,ryo:100},buildings:[{type:'town_hall',cell:0}]});
const s=fr.world.settlement('t'),c=centreCell(s.grid.n),at=(x,z)=>c+x+z*s.grid.n;
const send=c=>{fr.command({owner:'p'},{town:'t',...c});return state.frontier.receipts.at(-1);};
const run=n=>{for(let i=0;i<n;i++){state.tick++;fr.tick();}};
const start=s.stock.timber;
for(const [kind,cell] of [['road',at(3,3)],['wall',at(4,3)],['gate',at(5,3)]])assert.equal(send({action:'place',kind,cells:[cell]}).ok,true);
const after=s.stock.timber;assert.equal(start-after,8);
const before=JSON.stringify(s),preview=buildPreview(s,{action:'remove',cells:[at(3,3),at(4,3),at(5,3),at(5,3)]},data);
assert.equal(JSON.stringify(s),before,'refund preview never mutates state');assert.deepEqual(preview.refund,{timber:8});
assert.equal(send({action:'remove',cells:[at(3,3),at(4,3),at(5,3),at(5,3)]}).ok,true);
assert.equal(s.stock.timber,start,'each paid line cell is refunded exactly once');
const ledger=state.frontier.ledger.length;
assert.equal(send({action:'remove',cells:[at(3,3)]}).ok,false);assert.equal(state.frontier.ledger.length,ledger,'cannot refund twice');
assert.equal(send({action:'remove',cells:[c,at(4,4)]}).ok,false);assert.equal(s.buildings.length,1,'hall is protected atomically');
// Paid, partially completed 2x2 construction is refunded once even when all its cells are erased.
send({action:'place',kind:'quarry',cells:[at(5,5)]});run(45);
const project=s.projects.find(p=>p.type==='quarry');assert.ok(project.paid && project.progress>0);
// full paid cost comes back (costs come from data, retuned since: quarry timber 50 + goods 40)
const paid={...s.stock};send({action:'remove',cells:project.cells});
for(const [r,n] of Object.entries(data.buildings.quarry.cost))assert.equal(s.stock[r],paid[r]+n,`quarry ${r} refunded`);assert.equal(s.projects.length,0);
// Finished structures remember their actual paid cost independently of later data tuning.
send({action:'place',kind:'storehouse',cells:[at(-5,-5)]});run(400);
const building=s.buildings.find(b=>b.type==='storehouse');assert.ok(building);const storeCost={...data.buildings.storehouse.cost};assert.deepEqual(building.paidCost,storeCost);
data.buildings.storehouse.cost.timber=999;
const built=s.stock.timber;send({action:'remove',cells:[building.cell]});assert.equal(s.stock.timber,built+storeCost.timber);
assert.equal(s.buildings.some(b=>b.id===building.id),false);
const tip=buildTooltip('lumber_camp',s,data,resourceRequirements);
assert.match(tip,/drop off/);assert.match(tip,/Requirements:/);assert.match(tip,new RegExp(`need ${data.buildings.lumber_camp.cost.timber}, have`));assert.match(tip,/Technology: none/);
fr.world.checkInvariants();console.log('test_eraser_refunds: ok');
