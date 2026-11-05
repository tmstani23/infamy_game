// Economy balance B0: soak report. Loads a save's frontier, runs only the frontier rules (no graphics,
// no city) for a number of in-game minutes, and prints each player/bot town's stock, people and workers.
// Run from the repo root: node game/tools/economy_soak.mjs [save name in saves/] [minutes]
// Default: mountainplaytest2, 60 minutes. B6 adds pass/fail limits; for now it is a report.
import {readFileSync,existsSync} from 'node:fs';
import {createFrontier} from '../src/sim/frontier/frontier.js';
const read=f=>JSON.parse(readFileSync(new URL(f,import.meta.url)));
const name=process.argv[2] || 'mountainplaytest2', minutes=Number(process.argv[3] || 60);
const path=new URL(`../../saves/${name}.json`,import.meta.url);
if(!existsSync(path)) { console.log(`no save saves/${name}.json`); process.exit(0); }
const save=JSON.parse(readFileSync(path));
const data=read('../data/frontier.json');
// The soak has no city entities: detach saved worker bodies so they work off screen instead of counting as killed.
for(const s of Object.values(save.state.frontier.settlements))for(const w of s.workers||[])w.entity=null;
const state={tick:save.state.tick,frontier:save.state.frontier,entities:{},news:[]};
const fr=createFrontier({state,data,world:read('../data/world.json'),spotData:read('../data/world_spots.json'),spotRules:read('../data/resource_spots.json')});
const towns=()=>Object.values(state.frontier.settlements).filter(s=>!s.capital && s.owner);
const r1=n=>Math.round(n);
const row=(m,s)=>`${String(m).padStart(4)}m ${s.name.slice(0,22).padEnd(22)} pop ${String(s.pop).padStart(3)}/${String(s.housing).padStart(3)} wk ${String(s.workers?.length||0).padStart(3)} `+
  ['food','timber','stone','goods','ryo'].map(r=>`${r[0]} ${String(r1(s.stock[r])).padStart(6)}`).join(' ');
const ticksPerMin=20*60;
for(let m=0;m<=minutes;m++) {
  if(m%10===0) for(const s of towns()) console.log(row(m,s));
  if(m<minutes) for(let i=0;i<ticksPerMin;i++){state.tick++;fr.tick();}
}
