// Diagnostic only: production sim + bot code and map data, no browser/DOM/GPU.
// Full rosters are deliberately staged; this is not a natural-match balance sim.
// node --cpu-prof --cpu-prof-dir=<existing output dir> game/tools/profile_map_runtime.mjs
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {Session} from 'node:inspector';
import {performance} from 'node:perf_hooks';
const {createGame}=await import(process.env.PROFILE_GAME_MODULE||'../src/sim/game.js');
import {setupMatch} from '../src/sim/setup_match.js';
import {createBot} from '../src/sim/bot.js';
import {createNinjaBot} from '../src/sim/ninja_bot.js';
import {createDeploymentMapData} from '../src/deployment_map_data.js';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url)));
const requested=process.argv[2],samples=Number(process.env.PROFILE_TICKS)||500;
const summary=a=>{const s=[...a].sort((a,b)=>a-b),q=p=>+(s[Math.min(s.length-1,Math.floor(s.length*p))]||0).toFixed(3);return {mean:+(a.reduce((n,v)=>n+v,0)/a.length).toFixed(3),p50:q(.5),p95:q(.95),p99:q(.99),max:q(1),over50ms:a.filter(v=>v>50).length};};
for(const scenario of ['startup','full-rosters','combat']){
 if(requested&&requested!==scenario)continue;
 const g=createGame({district:read('data/port_town.json'),catalog:read('data/art.json'),cutouts:read('art/cutouts.json'),interiors:read('data/interiors.json'),parts:read('data/interior_parts.json'),recipes:read('data/room_recipes.json'),units:read('data/units.json'),civilians:read('data/civilians.json'),bandits:read('data/bandits.json'),police:read('data/police.json'),settings:{...read('data/settings.json'),dayNight:{auto:false}}});
 const {heroId,rivals}=setupMatch(g,{clan:'yakuza',difficulty:'easy',bots:read('data/bots.json')});
 g.civilians.populate();
 const brains=rivals.map(r=>(r.kind==='ninja'?createNinjaBot:createBot)(g,r));
 if(scenario!=='startup')for(const [owner,clan]of Object.entries(g.state.clans)){
  const types=clan.kind==='ninja'?['ninja','shinobi_geisha','shinobi_enforcer']:clan.faction==='kuroda'?['spearman','kuroda_rifleman','kuroda_enforcer']:['thug','archer','yakuza_enforcer'];
  const hero=Object.values(g.state.entities).find(e=>e.owner===owner&&e.type==='hero');
  while(g.clans.crewOf(owner).length<20){const i=g.clans.crewOf(owner).length,type=types[process.env.PROFILE_SPECIALS?i%types.length:i===1?1:i===2?2:0],sector=g.state.deployment.sectors[i%4],p=g.nav.nearestFree(sector.anchor.x+(i%3)*1.2,sector.anchor.z+Math.floor(i/4)*1.2);
   g.spawn(type,g.settings.units.types[type].sprite,...p,{owner,deployment:{group:i<6?'hero':sector.id},order:i<6?{kind:'follow',target:hero.id,slot:i}:{kind:'stop'}});
  }
 }
 if(scenario==='combat'){
  const center=g.state.deployment.sectors[0].anchor;
  const heroes=Object.values(g.state.entities).filter(e=>e.type==='hero');
  for(const [j,hero]of heroes.entries()){
   Object.assign(hero,{x:center.x+j*3,z:center.z});
   for(const [i,e]of g.clans.crewOf(hero.owner).entries()){
    const p=g.nav.nearestFree(center.x+j*3+(i%4)*.7,center.z+Math.floor(i/4)*.7);
    Object.assign(e,{x:p[0],z:p[1],place:'street',deployment:{group:'hero'},order:{kind:'attackmove',x:center.x,z:center.z}});
   }
  }
 }
 const data=createDeploymentMapData({game:g,clan:g.state.entities[heroId].owner}),timings=Object.fromEntries(['bots','sim','observe','snapshot','total'].map(k=>[k,[]]));
 const session=process.env.PROFILE_CPU?new Session():null;
 const post=(method)=>new Promise((resolve,reject)=>session.post(method,(error,result)=>error?reject(error):resolve(result)));
 if(session){session.connect();await post('Profiler.enable');}
 for(let i=0;i<samples+50;i++){
  if(session&&i===50)await post('Profiler.start');
  const t0=performance.now(),commands=brains.flatMap(b=>b.tick()),t1=performance.now();g.step(commands);const t2=performance.now();data.update(false);const t3=performance.now();data.update(true);const t4=performance.now();
  if(i>=50){for(const [key,value]of Object.entries({bots:t1-t0,sim:t2-t1,observe:t3-t2,snapshot:t4-t3,total:t4-t0}))timings[key].push(value);}
 }
 if(session){const {profile}=await post('Profiler.stop');mkdirSync('look_tests/perf',{recursive:true});writeFileSync(`look_tests/perf/scoped-${scenario}.cpuprofile`,JSON.stringify(profile));session.disconnect();}
 const entities=Object.values(g.state.entities);
 console.log(JSON.stringify({scenario,rosterMix:process.env.PROFILE_SPECIALS?'special-heavy':'balanced',samples,entities:entities.length,standing:entities.filter(e=>!e.dead&&!e.downed&&!e.jailed).length,civilians:entities.filter(e=>e.type==='civilian').length,police:entities.filter(e=>e.cop).length,ms:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,summary(v)]))}));
}
