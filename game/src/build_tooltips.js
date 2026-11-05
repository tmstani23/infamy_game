import { GOOD_LINE, WARN_LINE } from './frontier_tips.js';
import { zoneCells } from './sim/frontier/tiers.js';
// Descriptions of current behavior, shared by every entry point to town building.
export const BUILD_DETAILS={
  road:['A town path connecting developed plots.','Enables nearby zone growth; workers can travel through it.'],
  wall:['A solid stockade fence section.','Closes passage through the cell; use gates to retain access.'],
  gate:['An opening through a wall.','Enables passage through an enclosed town and provides road access.'],
  housing:['A housing zone that grows from huts to larger homes.','Enables population growth by adding housing capacity.'],
  farm:['A cultivated zone for food production.','Enables food production with available townspeople; fertile soil improves output.'],
  work:['A workshop zone that consumes timber and stone.','Enables goods production with available townspeople.'],
  eraser:['Removes selected roads, walls, gates, zones and buildings.','Returns 100% of their resource cost; the town hall is protected.'],
  lumber_camp:['A gathering camp and general worker drop-off; all cargo types accepted.','Delivery credits town stock immediately; no second haul. With trained workers it has no extra passive timber production.'],
  quarry:['A gathering camp and general worker drop-off; all cargo types accepted.','Delivery credits town stock immediately; no second haul. With trained workers it has no extra passive stone production.'],
  storehouse:['A general worker drop-off; all cargo types accepted. Each one raises every storage cap by 500.','Shortens return trips. Delivery credits town stock immediately; camps are optional alternatives.'],
  stockade:['A placed solid stockade building, separate from the fence tools.','Build Wall and Gate for an enclosure. No defensive stat bonus is implemented yet.']
};
export function buildTooltip(id,s,data,requirements) {
  const [purpose,enables]=BUILD_DETAILS[id] || ['A placed town building.',''];
  const zone=data.zones.kinds[id],building=!zone && data.buildings[id],cost=zone?{}:data.placeCosts[id] || building?.cost || {};
  const needs=['Buildable town ground'];
  // B3: everything but roads and work camps goes inside the town hall tier's ring; tiers cap cells and counts
  if(id!=='road' && !data.tiers?.camps?.includes(id))needs.push('inside the town ring (grows with town hall tier)');
  const tier=data.tiers?.list?.[Math.min(data.tiers.list.length,Math.max(1,s?.tier || 1))-1];
  const group=data.tiers?.camps?.includes(id)?'camps':id;
  if(!zone && tier?.placed?.[group]!==undefined)needs.push(`at most ${tier.placed[group]} ${group==='camps'?'work camps':id.replace('_',' ')+'s'} at this tier`);
  let cellsLine='';
  if(zone && tier?.cells?.[id]!==undefined && s?.grid) { const left=tier.cells[id]-zoneCells(s,zone.char); cellsLine=`${left>0?GOOD_LINE:WARN_LINE}${Math.max(0,left)} / ${tier.cells[id]} cells remaining (${tier.name})`; }
  else if(zone && tier?.cells?.[id]!==undefined)needs.push(`at most ${tier.cells[id]} ${id} cells at this tier`);
  if(zone) {
    needs.push(`road within ${zone.needs.roadReach} cells to grow`);
    if(zone.inputs)needs.push(`uses ${Object.entries(zone.inputs).map(([r,v])=>`${v} ${r}`).join(' + ')} per ${Object.keys(zone.output || {}).join('/')} made`);
    const U=data.upkeep;
    if(zone.housing && U?.goodsByStage?.some(v=>v>0))needs.push(`goods to level up past ${String(zone.stages?.[0] || 'level 1').replace(/_/g,' ')}; ${zone.stages?.slice(1).map((n,i)=>`${n.replace(/_/g,' ')} uses ${((U.goodsByStage[i+1] || 0)*60).toFixed(2)} goods/min`).join(', ')}`);
    if(U?.zones?.[id])needs.push(`upkeep ${Object.entries(U.zones[id]).map(([r,v])=>`${(v*60).toFixed(2)} ${r}/min`).join(' + ')} per grown level once the town passes ${U.freeLevels || 0} free levels`);
    if(zone.needs.food)needs.push('food to remain healthy');
    if(zone.needs.workersPerCell)needs.push(`${zone.needs.workersPerCell} townsperson per grown cell`);
  }
  if(building?.size)needs.push(`${building.size} × ${building.size} free cells`, 'construction work and time');
  return [purpose,cellsLine,`Requirements: ${id==='eraser'?'an existing structure or zone':needs.join('; ')}.`,
    `Costs${data.placeCosts[id]?' per cell':''}:\n${requirements(s,cost)}`,
    'Technology: none.',enables].filter(Boolean).join('\n');
}
