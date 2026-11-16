import { GOOD_LINE, WARN_LINE } from './frontier_tips.js';
import { zoneCells } from './sim/frontier/tiers.js';
// Descriptions of current behavior, shared by every entry point to town building.
export const BUILD_DETAILS={
  road:['A town path connecting developed plots.','Enables nearby zone growth; workers can travel through it.'],
  wall:['A solid stockade fence section.','Closes passage through the cell; use gates to retain access.'],
  gate:['An opening through a wall.','Enables passage through an enclosed town and provides road access.'],
  military:['Military zone: ground kept for war buildings. Costs nothing.','Your general puts barracks, towers and the rest here first: with the governor initiative On he builds the war buildings of his strategy here on his own, and nowhere else. Houses, farms and workshops do not grow on it, and only military buildings can be placed on it. You can still place military buildings anywhere in the ring yourself.'],
  housing:['A housing zone that grows from huts to larger homes.','Enables population growth by adding housing capacity.'],
  farm:['A cultivated zone for food production.','Enables food production with available townspeople; fertile soil improves output.'],
  work:['A workshop zone that consumes timber and stone.','Enables goods production with available townspeople.'],
  eraser:['Removes selected roads, walls, gates, zones and buildings.','Returns 100% of their resource cost; the town hall is protected.'],
  lumber_camp:['A gathering camp: workers drop off timber only, and reach timber further out from it.','Delivery credits town stock immediately; no second haul. With trained workers it has no extra passive timber production.'],
  food_camp:['A fishing and foraging camp: workers drop off food only, and reach fishing grounds and fertile ground further out from it.','Same storage and ox carts as the other work camps.'],
  quarry:['A gathering camp: workers drop off stone only, and reach stone further out from it.','Delivery credits town stock immediately; no second haul. With trained workers it has no extra passive stone production.'],
  storehouse:['Storage only: each one raises every storage cap by 500.','Workers do not drop off here; they use the town hall or a matching work camp.'],
  market:['Sells goods above the town keep level for ryo (about 1 ryo per goods).','Village tier, one per town. Set the keep level under Steer in the town panel (default 400).'],
  // 8b-1: military buildings, the same as at a war camp; they train only while a war is on the town
  barracks:['Military: trains grunts, spearmen, brutes and enforcers while a war is on this town.','Counts on the town morale bar in a war.'],
  supply_tents:['Military: raises the town troop cap in a war.','Counts toward the troop cap while built.'],
  watchtower:['Military: shoots at enemy troops in a war, lets you see round it and spots hidden units.','Counts on the town morale bar in a war.'],
  rifle_range:['Military: trains archers and riflemen while a war is on this town.','Needed for the clan hall.'],
  field_clinic:['Military: your troops near it recover faster in a war.',''],
  clan_hall:['Military: trains your clan special units while a war is on this town.','Needed for the kennel or hidden dojo.'],
  kennel:['Military: trains dog handlers while a war is on this town.',''],
  hidden_dojo:['Military: trains kunoichi while a war is on this town.',''],
  foundry:['Military: builds siege weapons and the Gatling gun while a war is on this town.',''],
  armory:['Military: blade and rifle upgrades (later).','Counts on the town morale bar in a war.'],
  stockade:['A fortress, very hard to break: up to 40 of your units shelter inside, war troops too. In a war, ranged units inside shoot out.','Hits on units inside land on the stockade; if it breaks, everyone piles out and the governor rebuilds it. A Village has one, a Town up to three, and a Town stockade is tougher.'],
  stable:['Raise horses by hand on its production bar (Calico or Black Beauty, paid in food and goods); pick which one is your mount there. H on the island rides her, at 3.75x run speed.','Right-click one of your horses on the island to ride her.'],
  station:['Railway station: lay track from here to another of your towns or the capital (Town tier 2+); each open line gets a steam train.','Space at it: lay track, see when trains come in, and board a train while it stands here (it waits about a minute; the prompt shows when it leaves).'],
  infirmary:['Your units nearby heal 3x faster.','Anyone knocked out on the island comes round at the nearest town\'s infirmary at full health (at its hall, at low health, without one).']
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
    needs.push(`road within ${zone.needs.roadReach} cells that connects to the town hall`);
    if(zone.inputs)needs.push(`uses ${Object.entries(zone.inputs).map(([r,v])=>`${v} ${r}`).join(' + ')} per ${Object.keys(zone.output || {}).join('/')} made`);
    const U=data.upkeep;
    if(zone.housing && U?.goodsByStage?.some(v=>v>0))needs.push(`goods to level up past ${String(zone.stages?.[0] || 'level 1').replace(/_/g,' ')}; ${zone.stages?.slice(1).map((n,i)=>`${n.replace(/_/g,' ')} uses ${((U.goodsByStage[i+1] || 0)*60).toFixed(2)} goods/min`).join(', ')}`);
    if(U?.zones?.[id])needs.push(`upkeep ${Object.entries(U.zones[id]).map(([r,v])=>`${(v*60).toFixed(2)} ${r}/min`).join(' + ')} per grown level once the town passes ${U.freeLevels || 0} free levels`);
    if(zone.needs.food)needs.push('food to remain healthy');
    if(zone.needs.workersPerCell)needs.push(`${zone.needs.workersPerCell} townsperson per grown cell`);
  }
  if(building?.military) {   // 8b-1: limits and needs shared with the war camp (war.buildings)
    const W=data.war?.buildings?.[id] || {};
    for(const n of W.needs || [])needs.push(n==='upgrade'?'the town hall war upgrade (town hall menu)':n==='tier2'?'a town hall at tier 2 or higher':`a built ${n.replace(/_/g,' ')}`);
    if(W.max)needs.push(`at most ${W.max} in a town`);
    if(W.clan)needs.push(`${W.clan} clan only`);
    const up=data.upkeep?.buildings?.[id];
    if(up)needs.push(`upkeep ${Object.entries(up).map(([r,v])=>`${(v*60).toFixed(2)} ${r}/min`).join(' + ')}; if unpaid the town is warned and it keeps working`);
  }
  if(building?.size)needs.push(`${building.size} × ${building.size} free cells`, 'construction work and time');
  return [purpose,cellsLine,`Requirements: ${id==='eraser'?'an existing structure or zone':needs.join('; ')}.`,
    `Costs${data.placeCosts[id]?' per cell':''}:\n${requirements(s,cost)}`,
    'Technology: none.',enables].filter(Boolean).join('\n');
}
