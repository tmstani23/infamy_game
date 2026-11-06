// Self-running governor check (Tim 2026-11-05): a fresh town with initiative On, run headless (frontier rules
// only). Prints the town every 10 game minutes; the player's only act is pressing Upgrade when it is affordable.
// Run from the repo root: node game/tools/governor_soak.mjs [minutes] [site index]
import {readFileSync} from 'node:fs';
import {createFrontier} from '../src/sim/frontier/frontier.js';
import {ensureGrid} from '../src/sim/frontier/town_grid.js';
import {upgradeCheck, startUpgrade} from '../src/sim/frontier/tiers.js';
const read=f=>JSON.parse(readFileSync(new URL(f,import.meta.url)));
const minutes=Number(process.argv[2] || 90), siteIx=Number(process.argv[3] || 0);
const data=read('../data/frontier.json'), wd=read('../data/world.json');
data.settlements={};data.roads={};if(process.argv[4])data.tiers.list[0].cells.work=Number(process.argv[4]);
const state={tick:0,entities:{},news:[]};
const fr=createFrontier({state,data,world:wd,spotData:read('../data/world_spots.json'),spotRules:read('../data/resource_spots.json')});
const site=(wd.sites||[])[siteIx];
const s=fr.world.addTown({id:'t',name:site?.name||'Test',owner:'p',x:site.x,z:site.z,pop:data.founding.minSettlers,stock:{...data.founding.startStock},roadReserve:data.townGrid.hallRoadReserve||0,buildings:[{type:'town_hall',stage:'built',cell:0}]});
ensureGrid(s,wd,data);s.autoBuild=true;s.budget={ryo:1e9,spent:0};
s.workerTraining=Array.from({length:data.founding.startWorkers||0},()=>({id:fr.world.newId('w'),readyAt:0}));
const r=n=>String(Math.round(n)).padStart(5);
const cells=ch=>[...s.grid.zone].filter(c=>c===ch).length, roads=()=>[...s.grid.use].filter(c=>c==='r').length;
const show=m=>console.log(`${String(m).padStart(4)}m tier ${s.tier||1} pop ${r(s.pop)}/${r(s.housing)} wk ${r(s.workers?.length||0)} h/f/k ${cells('h')}/${cells('f')}/${cells('k')} roads ${roads()} `+['food','timber','stone','goods','ryo'].map(k=>`${k[0]}${r(s.stock[k]||0)}`).join(' ')+` idle ${s.report?.idle||0} next: ${s.report?.next||''}`);
let upgradedAt=[];
for(let m=0;m<=minutes;m++){
  if(m%10===0)show(m);
  for(let i=0;i<1200;i++){state.tick++;fr.tick();state.news=[];}
  if(upgradeCheck(s,data).ok){startUpgrade(s,data,fr.world);upgradedAt.push(m);}
}
console.log(s.workers.map(w=>w.id+":"+(w.spot||"-")+":"+(w.status||"")).join(" "), JSON.stringify(s.flow?.timber));
console.log('upgrades started at minutes:',upgradedAt.join(', ')||'none');
