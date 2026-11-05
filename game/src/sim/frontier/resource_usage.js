// Read-only economy manifest: actual last zone output, active recipes and pending one-time costs.
import {cellToWorld} from './town_grid.js';
import {workerCount} from './people.js';
export function resourceUsage(s,resource,data) {
  const seconds=(data.cadenceTicks || 20)/20,entries=[];
  const add=(id,name,rate,state,purpose,cell=null,once=0,demand=rate)=>{
    const p=cell!==null && s.grid?cellToWorld(s,cell):[s.x,s.z];
    entries.push({id,name,rate,demand,state,purpose,once,x:p[0],z:p[1]});
  };
  if(resource==='food' && s.pop)add('people','Townspeople',data.rates.food*s.pop/seconds,s.foodShortage?'Short of food':'Fed',`Food for ${s.pop} townspeople`);
  const crew=workerCount(s);if(resource==='food' && crew)add('workers','Workers',data.rates.food*crew/seconds,s.foodShortage?'Short of food':'Fed',`Food for ${crew} workers`);
  for(const [kind,def] of Object.entries(data.zones?.kinds || {}))if(def.inputs?.[resource] && s.grid) {
    const z=s.zones?.[kind],cells=[];
    for(let i=0;i<s.grid.zone.length;i++)if(s.grid.zone[i]===def.char && Number(s.grid.stage[i])>0)cells.push(i);
    const levels=cells.reduce((n,i)=>n+Number(s.grid.stage[i]),0);
    for(const i of cells) {
      const share=levels?Number(s.grid.stage[i])/levels:0,rate=(z?.output || 0)*def.inputs[resource]*share/seconds;
      const demand=Object.values(def.output).reduce((n,v)=>n+v,0)*Number(s.grid.stage[i])*def.inputs[resource]/seconds;
      add(`zone:${i}`,`${kind[0].toUpperCase()+kind.slice(1)} plot ${i}`,rate,z?.abandoned?'Abandoned':(z?.health ?? 1)<data.zones.healthyAt?'Unhealthy':rate?'Producing':'Waiting for inputs/workers',
        `Makes ${Object.keys(def.output).join(', ')}; needs ${demand.toFixed(3)} ${resource}/s at full production`,i,0,demand);
    }
  }
  for(const b of s.buildings || []) {
    const def=data.buildings[b.type],recipe=def?.recipe;
    if(!recipe?.in?.[resource])continue;
    const crews=b.stage==='built'?Math.floor((b.workers || 0)/(def.jobs || 1)):0;
    add(`building:${b.id}`,b.type.replaceAll('_',' '),recipe.in[resource]*crews/((recipe.everyTicks || 1)*seconds),crews?'Active recipe':'Waiting for workers',`Makes ${Object.keys(recipe.out).join(', ')}`,b.cell);
  }
  for(const p of s.projects || [])if(!p.paid && p.cost?.[resource])add(`project:${p.id}`,p.type.replaceAll('_',' '),0,p.authorized?'Waiting for materials':'Awaiting approval','Construction cost, paid once',p.cell,p.cost[resource]);
  const consumption=entries.reduce((n,e)=>n+e.rate,0),pending=entries.reduce((n,e)=>n+e.once,0);
  const workers=(s.workers || []).filter(w=>w.trip?.resource===resource && !w.order && !w.status && !w.project);
  const gathering=workers.reduce((n,w)=>n+(w.trip.load || 0)/Math.max(1,w.trip.total)*20,0);
  return {entries,consumption,demand:entries.reduce((n,e)=>n+e.demand,0),pending,gathering,net:s.report?.rate?.[resource] || 0,stock:s.stock[resource] || 0};
}
