// Shared eligibility for the Shinobi HQ exception to ordinary hideout closure.
export const isShinobiHQ = (state, b) => !!b?.hideout && b.owner === b.hideout
  && state.clans?.[b.owner]?.kind === 'ninja';

export const contractLockoutUntil = (state, clan) => Math.max(0, ...Object.values(state.hqRaids || {})
  .filter(r => r.defender === clan).map(r => r.suppressedUntil));

// Victory effects run between business raids and contract progress, so an HQ
// victory cancels even a contract that would otherwise complete on this tick.
export function createHQRaidEffects({ state, rules = {}, dayNight = {} }) {
  const R = { suppressionSeconds: 180, bounty: 600, treasuryShare: 0.1, treasuryCap: 400, seasonPoints: 2, ...rules };
  const ticks = seconds => Math.round(seconds * 20);
  state.hqRaids ||= {};
  function tick() {
    for (const n of state.news.filter(n => n.kind === 'hqRaidWon')) {
      const b = state.businesses[n.business], attacker = state.clans[n.raider], defender = state.clans[n.defender];
      if (n.at !== state.tick || !attacker || !defender || !isShinobiHQ(state, b) || b.owner !== n.defender
        || state.hqRaids[b.id]?.protectedUntil > state.tick) continue;
      const stolen = Math.min(R.treasuryCap, Math.floor(Math.max(0, defender.ryo || 0) * R.treasuryShare));
      defender.ryo -= stolen;
      attacker.ryo += R.bounty + stolen;
      attacker.raidPoints = (attacker.raidPoints || 0) + R.seasonPoints;
      const suppressedUntil = state.tick + ticks(R.suppressionSeconds);
      const protectionSeconds = (dayNight.daySeconds ?? 240) + (dayNight.nightSeconds ?? 360);
      state.hqRaids[b.id] = { business: b.id, defender: n.defender, raider: n.raider, wonAt: state.tick,
        suppressedUntil, protectedUntil: suppressedUntil + ticks(protectionSeconds), recovered: false,
        ejectAt: state.tick + ticks(R.ejectSeconds ?? 2.5) };   // the raiders are put out front (sim/game.js, Tim 2026-10-26)
      state.ryoGains.push({ clan: n.raider, amount: R.bounty + stolen, reason: 'Shinobi HQ raid' });
      state.news.push({ kind: 'hqSuppressed', business: b.id, defender: n.defender, raider: n.raider,
        bounty: R.bounty, stolen, points: R.seasonPoints, suppressedUntil });
    }
    for (const r of Object.values(state.hqRaids)) if (!r.recovered && state.tick >= r.suppressedUntil) {
      r.recovered = true;
      state.news.push({ kind: 'hqRecovered', business: r.business, clan: r.defender, protectedUntil: r.protectedUntil });
    }
  }
  return { tick, rules: R };
}
