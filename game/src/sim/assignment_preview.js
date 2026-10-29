import { stageShakedownPreview } from './shakedown_preview.js';

// Development staging only. Both operations still start through their public commands.
export function stageAssignmentPreview(game,heroId,rivals){
  const {state}=game,h=state.entities[heroId],clan=state.clans[h.owner];
  clan.ryo=5000;
  if(clan.faction==='yakuza'){
    const commands=stageShakedownPreview(game,heroId,rivals);clan.ryo=5000;
    state.assignmentPreview={kind:'shakedown',...state.shakedownPreview};return commands;
  }
  if(clan.faction!=='kuroda')return [];
  const source=state.deployment.sectors.find(s=>state.deployment.sectors.some(t=>game.sweep.nearby(s.id,t.id)));
  const target=state.deployment.sectors.find(s=>game.sweep.nearby(source.id,s.id));
  const rival=rivals.find(r=>state.clans[r.clan].faction==='yakuza');
  if(!rival)return [];
  const p=game.nav.nearestFree(source.anchor.x+2,source.anchor.z+2);Object.assign(h,{x:p[0],z:p[1],place:'street'});
  for(let i=0;i<3;i++){
    const p=game.nav.nearestFree(source.anchor.x+i*.5,source.anchor.z);
    game.spawn('spearman','kuroda_spearman',...p,{owner:h.owner,deployment:{group:source.id},order:{kind:'stop'}});
    const q=game.nav.nearestFree(target.anchor.x+i*.5,target.anchor.z);
    game.spawn('thug','thug',...q,{owner:rival.clan,deployment:{group:target.id},order:{kind:'stop'}});
  }
  state.assignmentPreview={kind:'sweep',sector:source.id,targetSector:target.id,targetClan:rival.clan};
  return [{id:heroId,type:'deployment',action:'sweep',sector:source.id,targetSector:target.id,targetClan:rival.clan}];
}
