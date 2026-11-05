// Descriptions of current behavior, shared by every entry point to town building.
export const BUILD_DETAILS={
  road:['A town path connecting developed plots.','Enables nearby zone growth; workers can travel through it.'],
  wall:['A solid stockade fence section.','Closes passage through the cell; use gates to retain access.'],
  gate:['An opening through a wall.','Enables passage through an enclosed town and provides road access.'],
  housing:['A housing zone that grows from huts to larger homes.','Enables population growth by adding housing capacity.'],
  farm:['A cultivated zone for food production.','Enables food production with available townspeople; fertile soil improves output.'],
  work:['A workshop zone that consumes timber and stone.','Enables goods production with available townspeople.'],
  eraser:['Removes selected roads, walls, gates, zones and buildings.','Returns 100% of their resource cost; the town hall is protected.'],
  lumber_camp:['A timber gathering camp and worker drop-off.','Enables a nearer place to unload timber. Workers can also unload at the hall.'],
  quarry:['A stone gathering camp and worker drop-off.','Enables a nearer place to unload stone. Workers can also unload at the hall.'],
  storehouse:['A local worker drop-off for gathered resources.','Enables shorter return trips when built near resource spots.'],
  stockade:['A placed town stockade structure.','Adds the stockade structure; build Wall and Gate separately for an enclosing fence.']
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
