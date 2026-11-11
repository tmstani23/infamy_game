// Bot-client choices only: every action goes through the same player commands.
import { alive } from './util.js';
export const inHeroParty = (game, e) => !game.state.deployment?.restrictionsEnabled
  || (!e.deployment?.transfer && (e.deployment?.group === 'hero' || game.rally.participating(e)));

export function createDeploymentAI(game, { clan, hero }) {
  let next = 0, guards = {};   // guards: sector -> { business, at, objective, route } set by guardDuty below
  function tick() {
    const st = game.state, h = st.entities[hero], out = [];
    if (!st.deployment?.restrictionsEnabled || !h || st.tick < next) return out;
    next = st.tick + 40;
    const members = game.deployment.members(clan).filter(alive), record = st.deployment.clans[clan];
    const command = c => out.push({ id: hero, type: 'deployment', ...c });
    if(game.deployment.needsFirstSector?.(clan)){
      const home=Object.values(st.businesses).find(b=>b.hideout===clan),point=home?.ring||[h.x,h.z];
      const sector=st.deployment.sectors.slice().sort((a,b)=>Math.hypot(a.anchor.x-point[0],a.anchor.z-point[1])-Math.hypot(b.anchor.x-point[0],b.anchor.z-point[1]))[0];
      if(sector)command({action:'autoSector',sector:sector.id});
    }
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
      const idle = e => !e.crewJob&&!e.swing&&!e.execute&&(!e.order||e.order.kind==='stop'||(e.order.kind==='move'&&e.order.arrived));
      const spare = members.find(e=>e.deployment.group==='home'&&!e.deployment.transfer&&!e.deployment.keepAtHQ&&e.hp>=e.maxHp&&idle(e));
      if (spare && game.deployment.counts(clan).hero < 6 && game.deployment.canTransfer(hero,[spare.id],'hero').ok) command({action:'transfer',units:[spare.id],to:'hero'});
      const follow = members.filter(e=>inHeroParty(game,e)&&!e.deployment.transfer&&idle(e)&&e.place===h.place).map(e=>e.id);
      if (follow.length && !raid) out.push({id:hero,type:'order',kind:'follow',units:follow});
    }
    // Guard duty (Tim 2026-11-10): every day half the sectors where the clan holds a business guard their most
    // expensive one and the other half patrol; the halves swap each day. A business being raided or shaken down is
    // guarded at once by its sector while the hit is on. A duty set by hand (a guard this brain did not set) is left alone.
    if (st.clans[clan].kind !== 'ninja') {
      const own = {}, price = b => game.businesses?.rules?.[b.kind]?.price || 0;
      for (const b of Object.values(st.businesses)) {
        if (b.owner !== clan || b.hideout || !b.room || !b.ring) continue;
        const sector = game.deployment.sectorAt(...b.ring);
        if (sector && record.sectors[sector] && (!own[sector] || price(b) > price(own[sector]))) own[sector] = b;
      }
      const hit = Object.values(st.attacks || {}).filter(a => a.mode === 'raid' && a.defender === clan && !a.hq).map(a => a.business);
      for (const other of Object.values(st.deployment.clans)) for (const t of Object.values(other.sectors)) if (t.operation?.kind === 'shakedown' && t.operation.defender === clan) hit.push(t.operation.business);
      const want = {}, dayNo = st.season?.day ?? st.clock?.day ?? 0;
      Object.keys(own).sort().forEach((sector, i) => { if ((i + dayNo) % 2 === 0) want[sector] = own[sector].id; });
      for (const id of hit) { const b = st.businesses[id], sector = b?.ring && b.room && !b.hideout && b.owner === clan ? game.deployment.sectorAt(...b.ring) : null; if (sector && record.sectors[sector]) want[sector] = id; }
      for (const [sector, task] of Object.entries(record.sectors)) {
        const g = guards[sector], ours = !!g && task.task === 'guard' && task.business === g.business;
        if (g && !ours && g.at !== st.tick) delete guards[sector];   // changed by hand since
        if (g?.at === st.tick || task.operation || task.recovery) continue;
        const to = want[sector] || null;
        if (task.task === 'patrol' && to) {
          guards[sector] = { business: to, at: st.tick, objective: { ...task.objective }, route: (task.route || []).map(p => ({ ...p })) };
          command({ action: 'assignment', sector, task: 'guard', business: to, fallback: task.fallback });
        } else if (ours && to && to !== g.business) {
          g.business = to; g.at = st.tick;
          command({ action: 'assignment', sector, task: 'guard', business: to, fallback: task.fallback });
        } else if (ours && !to) {
          command({ action: 'assignment', sector, task: 'patrol', objective: g.objective, fallback: task.fallback, route: g.route });
          delete guards[sector];
        }
      }
    }
    let targeting = !!record.hunt;
    if(st.night&&st.clans[clan].faction==='yakuza'&&game.shakedown&&!rally.active&&!raid&&st.clans[clan].heat<60)for(const [id,task]of Object.entries(record.sectors)){
      const squad=members.filter(e=>e.deployment.group===id&&!e.deployment.transfer&&!e.deployment.duty?.manual&&!game.rally.participating(e));
      if(squad.length<3||task.operation||task.recovery||squad.some(e=>e.hp<e.maxHp*.85))continue;
      const lead=game.leader?.leader(),target=Object.values(st.businesses).filter(b=>game.shakedown.eligibility(clan,id,b.id).ok).sort((a,b)=>(b.owner===lead)-(a.owner===lead))[0];   // the season leader first (sim/leader.js)
      if(target){command({action:'shakedown',sector:id,business:target.id});break;}
    }
    if(st.clans[clan].faction==='kuroda'&&game.sweep&&!rally.active&&!raid)for(const [id,task]of Object.entries(record.sectors)){
      const squad=members.filter(e=>e.deployment.group===id&&!e.deployment.transfer&&!e.deployment.scattered&&!e.deployment.duty?.manual&&!game.rally.participating(e));
      if(squad.length<3||task.operation||task.recovery||squad.some(e=>e.hp<e.maxHp*.85))continue;
      const target=enemies.find(e=>e.place==='street'&&e.type!=='civilian'&&!e.cop&&!e.wild
        &&game.sweep.eligibility(clan,id,game.deployment.sectorAt(e.x,e.z),e.owner).ok);
      if(target){command({action:'sweep',sector:id,targetSector:game.deployment.sectorAt(target.x,target.z),targetClan:target.owner});break;}
    }
    if (st.clans[clan].kind==='ninja') for (const [id,task]of Object.entries(record.sectors)) {
      const crew=members.filter(e=>e.deployment.group===id&&!e.deployment.transfer&&!game.rally.participating(e));
      if (!crew.length || task.operation || task.recovery || task.task==='ambush' || targeting) continue;
      const geisha=crew.find(e=>e.type==='shinobi_geisha');
      const targets=game.shinobiAssignments.targets(clan,id).filter(t=>game.deployment.sectorAt(t.x,t.z)===id);
      const target=targets.find(t=>game.shinobiAssignments.defenders(clan,t.id)<crew.length&&crew.every(e=>e.hp>=e.maxHp*.7)&&(!geisha||crew.length>1));
      if(target){command({action:'armAmbush',sector:id,target:target.id});targeting=true;}
    }
    return out;
  }
  return {tick,saveState:()=>({next,guards}),loadState:d=>{if(d){next=d.next;guards=d.guards||{};}}};
}
