// Bot-client choices only: every action goes through the same player commands.
export const inHeroParty = (game, e) => !game.state.deployment?.restrictionsEnabled
  || (!e.deployment?.transfer && (e.deployment?.group === 'hero' || game.rally.participating(e)));

export function createDeploymentAI(game, { clan, hero }) {
  let next = 0;
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  function tick() {
    const st = game.state, h = st.entities[hero], out = [];
    if (!st.deployment?.restrictionsEnabled || !h || st.tick < next) return out;
    next = st.tick + 40;
    const members = game.deployment.members(clan).filter(alive), record = st.deployment.clans[clan];
    const command = c => out.push({ id: hero, type: 'deployment', ...c });
    const raid = Object.values(st.attacks || {}).find(a => a.mode === 'raid' && a.defender === clan);
    const field = members.filter(e => e.deployment.group !== 'hero' && !e.deployment.transfer);
    const enemies = Object.values(st.entities).filter(e => alive(e) && e.owner !== clan && st.clans[e.owner] && !e.hidden && game.vision.canSee(clan, e));
    const rally = game.rally.status(clan), pressured = alive(h) && enemies.filter(e => e.place === h.place && Math.hypot(e.x-h.x,e.z-h.z)<10).length >= 3;
    if (!rally.active && !rally.cooldown && field.length && (raid || (pressured && field.length >= 3 && h.hp > h.maxHp*.65))) {
      command({ action:'rally',groups:['hero','home',...st.deployment.sectors.map(s=>s.id)] });
      if (raid) {
        const b=st.businesses[raid.business],ids=members.filter(e=>!e.deployment.transfer&&e.place==='street').map(e=>e.id);
        if (b?.ring && ids.length) out.push({id:hero,type:'order',units:ids,kind:'attackmove',place:'street',x:b.ring[0],z:b.ring[1]});
      }
    }
    if (alive(h)) {
      const idle = e => !e.swing&&!e.execute&&(!e.order||e.order.kind==='stop'||(e.order.kind==='move'&&e.order.arrived));
      const spare = members.find(e=>e.deployment.group==='home'&&!e.deployment.transfer&&!e.deployment.keepAtHQ&&e.hp>=e.maxHp&&idle(e));
      if (spare && game.deployment.counts(clan).hero < 6 && game.deployment.canTransfer(hero,[spare.id],'hero').ok) command({action:'transfer',units:[spare.id],to:'hero'});
      const follow = members.filter(e=>inHeroParty(game,e)&&!e.deployment.transfer&&idle(e)&&e.place===h.place).map(e=>e.id);
      if (follow.length && !raid) out.push({id:hero,type:'order',kind:'follow',units:follow});
    }
    if (st.clans[clan].kind==='ninja') for (const [id,task]of Object.entries(record.sectors)) {
      const crew=members.filter(e=>e.deployment.group===id&&!e.deployment.transfer&&!game.rally.participating(e));
      if (!crew.length || task.operation) continue;
      const geisha=crew.find(e=>e.type==='shinobi_geisha');
      if(geisha && task.task!=='diversion'){command({action:'assignment',sector:id,task:'diversion'});continue;}
      if(geisha && (geisha.deployment.diversionReadyAt||0)<=st.tick && enemies.some(e=>e.place==='street'&&Math.hypot(e.x-task.objective.x,e.z-task.objective.z)<=6)) {command({action:'dance',sector:id});continue;}
      const targets=game.shinobiAssignments.targets(clan,id).filter(t=>game.deployment.sectorAt(t.x,t.z)===id);
      const target=targets.find(t=>game.shinobiAssignments.defenders(clan,t.id)<crew.length&&crew.every(e=>e.hp>=e.maxHp*.7)&&(!geisha||crew.length>1));
      if(target)command({action:'armAmbush',sector:id,target:target.id});
    }
    return out;
  }
  return {tick};
}
