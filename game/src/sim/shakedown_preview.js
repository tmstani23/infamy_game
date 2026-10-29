// Development-only staging. The actual attempt still uses the public command.
export function stageShakedownPreview(game,heroId,rivals) {
  const {state}=game,h=state.entities[heroId];
  const rival=rivals.find(r=>state.clans[r.clan].faction==='kuroda');
  const b=Object.values(state.businesses).find(b=>b.kind==='teahouse'&&b.room&&!b.hideout);
  if(!b||!rival)return [];
  game.clans.setOwner(b.id,rival.clan);
  const sector=game.deployment.sectorAt(...b.ring),task=state.deployment.clans[h.owner].sectors[sector];
  const home=game.nav.nearestFree(b.ring[0]+7,b.ring[1]+4);task.objective={x:home[0],z:home[1]};
  const p=game.nav.nearestFree(b.ring[0]+4,b.ring[1]+4);Object.assign(h,{x:p[0],z:p[1],place:'street'});
  for(let i=0;i<3;i++){
    const p=game.nav.nearestFree(b.ring[0]+3+i*.7,b.ring[1]+2);
    game.spawn('thug','thug',...p,{owner:h.owner,deployment:{group:sector},order:{kind:'stop'}});
  }
  state.clans[h.owner].ryo=3000;
  state.shakedownPreview={business:b.id,sector};
  return [{type:'time',night:true},{id:heroId,type:'deployment',action:'shakedown',sector,business:b.id}];
}
