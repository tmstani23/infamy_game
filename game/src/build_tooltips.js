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
  storehouse:['A general worker drop-off; all cargo types accepted. No storage cap is implemented.','Shortens return trips. Delivery credits town stock immediately; camps are optional alternatives.'],
  stockade:['A placed solid stockade building, separate from the fence tools.','Build Wall and Gate for an enclosure. No defensive stat bonus is implemented yet.']
};
export function buildTooltip(id,s,data,requirements) {
  const [purpose,enables]=BUILD_DETAILS[id] || ['A placed town building.',''];
  const zone=data.zones.kinds[id],building=!zone && data.buildings[id],cost=zone?{}:data.placeCosts[id] || building?.cost || {};
  const needs=['Buildable town ground'];
  if(zone?.coreOnly || building?.coreOnly)needs.push('inside town core');
  if(zone) {
    needs.push(`road within ${zone.needs.roadReach} cells to grow`);
    if(zone.needs.food)needs.push('food to remain healthy');
    if(zone.needs.workersPerCell)needs.push(`${zone.needs.workersPerCell} townsperson per grown cell`);
  }
  if(building?.size)needs.push(`${building.size} × ${building.size} free cells`, 'construction work and time');
  return [purpose,`Requirements: ${id==='eraser'?'an existing structure or zone':needs.join('; ')}.`,
    `Costs${data.placeCosts[id]?' per cell':''}:\n${requirements(s,cost)}`,
    'Technology: none.',enables].filter(Boolean).join('\n');
}
