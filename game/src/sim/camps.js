import { modeRules } from './modes/index.js';
// W4: authoritative island camp lifecycle. No camera, graphics or random placement.
// Chunk residency, casualties, wounds and first-clear claims survive saves and unloading.
// Existing bandit AI/combat owns movement, attacks and corpse loot.
export function createWorldCamps({ state, world, areas, rules, spawn, remove, ai, spriteFor, known = () => false }) {
  const definitions=(world?.camps || []).filter(c=>c.kind==='bandit');
  const byId=Object.fromEntries(definitions.map(c=>[c.id,c]));
  const enabled=!!(world && areas && rules?.enabled);
  const day=()=>state.clock?.day ?? 1;
  const records=()=>{state.world ||= {};return state.world.camps ||= {};};
  const resident=e=>e?.worldCamp && byId[e.camp];
  const alive=e=>e && !e.dead;
  const ready=()=>enabled && modeRules(state).island;
  function createRecord(c) {
    const tier=Math.max(1,Math.min(rules.membersByTier.length,c.tier || 1));
    return { version:1, cleared:false, clearedDay:null, claimed:false, generation:0,
      members:rules.membersByTier[tier-1].map(type=>({type,entity:null,dead:false,saved:null})) };
  }
  // Called by normal combat, never by the UI. Keep the killer even if the last guard dies
  // just before a chunk unload or the hero travels away.
  function defeated(attacker,target) {
    if (!ready() || !resident(target)) return;
    const rec=records()[target.camp];if(!rec)return;
    if(state.clans?.[attacker?.owner])rec.lastClan=attacker.owner;
    const slot=rec.members.find(m=>m.entity===target.id);if(slot)slot.dead=true;
  }
  function award(c,rec) {
    const first=!rec.claimed;rec.claimed=true;
    const clan=state.clans?.[rec.lastClan];if(!clan)return;
    const amount=(first ? rules.firstClearRyo : rules.repeatClearRyo)*(c.tier || 1);
    clan.ryo+=amount;
    (state.ryoGains ||= []).push({clan:rec.lastClan,amount,reason:'Island camp cleared',camp:c.id});
    (state.news ||= []).push({kind:'worldCampCleared',clan:rec.lastClan,camp:c.id,ryo:amount,first});
  }
  function keep(slot,e) {
    const saved=structuredClone(e);
    // Paths/AI targets are ephemeral. Item ids and corpse loot remain the original ones.
    for(const key of ['id','attackTarget','swing','angry','order','execute','lootTarget','distracted','taunted'])delete saved[key];
    slot.saved=saved;slot.dead=!!e.dead;
  }
  function suspend(rec) {
    for(const slot of rec.members) {
      const e=state.entities[slot.entity];if(e) { keep(slot,e);remove(e.id);delete ai.mind[e.id]; }
      slot.entity=null;
    }
  }
  function wake(c,rec) {
    for(const [index,slot] of rec.members.entries()) {
      const present=state.entities[slot.entity];
      if(present) { ai.mind[present.id] ||= {camp:c.id,spot:null};continue; }
      if(slot.dead && (!slot.saved || state.tick-slot.saved.diedAt>=rules.corpseSeconds*20)) { slot.saved=null;continue; }
      const angle=(index+rec.generation*.25)*Math.PI*2/rec.members.length;
      const x=slot.saved?.x ?? c.x+Math.cos(angle)*rules.spawnRadius;
      const z=slot.saved?.z ?? c.z+Math.sin(angle)*rules.spawnRadius;
      const point=areas.nav.nearestFree(x,z);
      if(!point || Math.hypot(point[0]-c.x,point[1]-c.z)>rules.leash || !areas.nav.clearLine(c.x,c.z,...point))continue;
      const saved=slot.saved || {};
      const id=spawn(slot.type,spriteFor(slot.type),...point,{...saved,x:point[0],z:point[1],place:'world',area:'world',owner:'bandits',wild:true,camp:c.id,worldCamp:true});
      slot.entity=id;slot.saved=null;ai.mind[id]={camp:c.id,spot:null};
    }
  }
  function tick() {
    if(!ready())return;
    const active=new Set(areas.activeIds()), all=records();
    for(const c of definitions) {
      const loaded=active.has(areas.chunkId(...areas.chunkOf(c.x,c.z)));
      let rec=all[c.id];if(!rec && !loaded)continue;
      rec ||= all[c.id]=createRecord(c);
      for(const slot of rec.members) {
        const e=state.entities[slot.entity];
        if(e?.dead || slot.entity && !e)slot.dead=true;
      }
      if(!rec.cleared && rec.members.every(m=>m.dead)) {
        rec.cleared=true;rec.clearedDay=day();award(c,rec);
      }
      if(rec.cleared && day()-rec.clearedDay>=rules.respawnDays) {
        suspend(rec);
        const next=createRecord(c);next.claimed=rec.claimed;next.generation=rec.generation+1;
        rec=all[c.id]=next;
      }
      if(!loaded)suspend(rec);else wake(c,rec);
    }
  }
  function campFor(id) { const c=byId[id];return ready() && c ? {...c,leash:rules.leash}:null; }
  function viewFor(clan) {
    if(!enabled)return {};
    return Object.fromEntries(Object.entries(state.world?.camps || {}).filter(([id])=>byId[id] && known(clan,byId[id].x,byId[id].z))
      .map(([id,r])=>[id,{cleared:r.cleared,clearedDay:r.clearedDay,claimed:r.claimed}]));
  }
  return {tick,defeated,campFor,viewFor,enabled};
}
