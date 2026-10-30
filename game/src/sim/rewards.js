// Rival leader bounties are shared across attackers: one claim per victim each
// dawn cycle. Keep claims in plain state so respawning or saving cannot reset them.
export function createRewards(state, rules = {}) {
  state.bounties = { cycle: 0, claimed: {} };
  function tick() {
    if (state.dawn) { state.bounties.cycle++; state.bounties.claimed = {}; }
  }
  function combatRenown(attacker, victim, kind) {
    const clan = state.clans?.[attacker.owner], rival = state.clans?.[victim.owner];
    if (clan?.kind !== 'ninja' || !rival || clan === rival || attacker.guard || victim.guard) return;
    const amount = rules.combatRenown?.[kind] ?? (kind === 'leader' ? 8 : 2);
    if (amount <= 0) return;
    clan.renown = (clan.renown || 0) + amount;
    state.news.push({ kind: 'combatRenown', clan: clan.id, amount, target: victim.id,
      reason: kind === 'leader' ? 'Rival leader defeated' : 'Rival crew executed' });
  }
  function crewExecuted(attacker, victim) {
    if (!state.clans?.[victim.owner] || victim.type==='hero' || victim.guard || victim.cop || victim.wild) return;
    combatRenown(attacker, victim, 'crew');
  }
  function leaderDown(attacker, victim) {
    const clan = state.clans?.[attacker.owner], rival = state.clans?.[victim.owner];
    if (!clan || !rival || clan === rival) return;
    combatRenown(attacker, victim, 'leader');
    if (state.bounties.claimed[victim.id]) return;
    state.bounties.claimed[victim.id] = clan.id;
    const job = state.contracts?.active?.[clan.id];
    if (job?.kind === 'boss' && job.hero === victim.id && !(state.dawn && job.takenAt < state.tick)) return; // a live contract pays instead
    const amount = rules.leaderBounty ?? 250;
    if (amount <= 0) return;
    clan.ryo += amount;
    state.ryoGains.push({ clan: clan.id, amount, target: victim.id, reason: 'Rival leader defeated' });
    state.casts.push({ kind: 'loot', a: attacker.id, x: victim.x, z: victim.z, ryo: amount });
  }
  // Sector cleared (Tim 2026-10-29): rival clans had at least clearMinRivals units standing on a sector's streets
  // together with yours, and now only yours are left. Once a second; one claim per clan and sector per cooldown.
  state.sectorFights ||= {};
  const fight = s => state.sectorFights[s] ||= { most:{} };
  const sectorClaim = (clan,s) => ({ sequence: fight(s).awards?.[clan]?.sequence || 0,
    readyAt: fight(s).claimed?.[clan] ?? 0 });
  function award(clan,s,amount,kind) {
    const f=fight(s); f.awards ||= {}; f.claimed ||= {};
    f.awards[clan]={sequence:(f.awards[clan]?.sequence||0)+1,amount,kind,tick:state.tick};
    f.claimed[clan]=state.tick+Math.round((rules.sectorClearCooldownSeconds??180)*20);
    state.clans[clan].ryo+=amount;
    state.ryoGains.push({clan,amount,reason:kind==='sweep'?'Sweep secured':'Sector cleared'});
  }
  function claimSweep(clan,s,baseline) {
    const f=fight(s),last=f.awards?.[clan];
    if(state.tick >= (f.claimed?.[clan]??-Infinity)){award(clan,s,500,'sweep');return 500;}
    // A normal clear awarded during this operation contributes to its total, once.
    if(last?.kind==='clear'&&last.sequence>baseline){
      const topup=Math.max(0,500-last.amount);
      award(clan,s,topup,'sweep');return topup;
    }
    return 0;
  }
  function sectorTick(sectorAt) {
    const bonus = rules.sectorClearBonus ?? 200, minRivals = rules.sectorClearMinRivals ?? 2;
    if (bonus <= 0 || !sectorAt) return;
    const present = {};
    for (const e of Object.values(state.entities)) {
      if (!state.clans?.[e.owner] || e.guard || e.dead || e.downed || e.jailed || e.place !== 'street' || (e.type !== 'hero' && !e.maxHp)) continue;
      const s = sectorAt(e.x, e.z);
      if (s && s !== 'village') ((present[s] ||= {})[e.owner] = (present[s][e.owner] || 0) + 1);
    }
    const F = state.sectorFights;
    for (const s of new Set([...Object.keys(present), ...Object.keys(F)])) {
      const here = present[s] || {}, ids = Object.keys(here);
      if (ids.length >= 2) {
        const f = F[s] ||= { most: {} };
        for (const id of ids) f.most[id] = Math.max(f.most[id] || 0, here[id]);
      } else if (F[s] && ids.length === 1 && F[s].most[ids[0]]) {
        const winner = state.clans[ids[0]], rivals = Object.entries(F[s].most).filter(([id]) => id !== ids[0]).reduce((n, [, c]) => n + c, 0);
        F[s].claimed ||= {};
        if (rivals >= minRivals && state.tick >= (F[s].claimed[ids[0]] ?? -Infinity)) {
          award(winner.id,s,bonus,'clear');
          state.news.push({ kind: 'sectorCleared', clan: winner.id, sector: s, ryo: bonus });
          winner.notice = { tick: state.tick, text: `Sector cleared: +${bonus} ryo` };
          F[s].most = {};
        } else F[s].most = {};
      } else if (F[s] && !ids.length) F[s].most = {};
    }
  }
  // Property clans earn Renown toward season points too (Tim 2026-10-30, phase 8), not crew slots.
  // news: last tick's big moments (sim/game.js passes them before clearing)
  const PROPERTY_RENOWN = { raidWon: ['raider', 'raid', 'Raid won'], shakedownSuccess: ['clan', 'shakedown', 'Shakedown success'],
    buildingDefended: ['clan', 'defend', 'Shinobi job stopped'], sectorCleared: ['clan', 'sectorClear', 'Sector cleared'] };
  function renownTick(news = []) {
    const R = { raid: 40, shakedown: 20, defend: 15, sectorClear: 5, ...rules.propertyRenown };
    for (const n of news) {
      const [who, key, reason] = PROPERTY_RENOWN[n.kind] || [], clan = state.clans?.[n[who]], amount = R[key];
      if (!clan || clan.kind === 'ninja' || !(amount > 0)) continue;
      clan.renown = (clan.renown || 0) + amount;
      state.news.push({ kind: 'renown', clan: clan.id, amount, reason });
    }
  }
  return { tick, leaderDown, crewExecuted, sectorTick, sectorClaim, claimSweep, renownTick };
}
