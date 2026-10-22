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
    if (!['thug', 'brute', 'swordsman', 'ninja', 'ninja_tanto', 'rifleman', 'archer'].includes(victim.type)) return;
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
  return { tick, leaderDown, crewExecuted };
}
