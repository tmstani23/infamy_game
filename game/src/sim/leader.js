// Ganging up on the leader (phase 6, Tim 2026-10-29). The leader: the clan (Shinobi too) with the top season
// score, at least leadMargin points ahead of the next. Bounties go only to property clans (the Shinobi have their
// own bonuses already): raiding the leader's business, a Shakedown on it, and when the Shinobi lead, raiding their
// HQ, knocking out their boss or downing their crew. Underdog: a clan at underdogShare of the leader's score or less
// (leader on underdogMinScore or more) hires cheaper and respawns faster. Bots prefer the leader as a target
// (sim/bot.js, sim/ninja_bot.js, sim/deployment_ai.js). Numbers: settings.json leader.
const DEFAULTS = { leadMargin: 2, raid: 300, shakedown: 100, shinobiHQ: 300, shinobiBoss: 150, shinobiCrew: 25,
  underdogShare: 0.6, underdogMinScore: 4, underdogHireDiscount: 0.25, underdogRespawnFaster: 0.3 };

export function createLeader({ state, standings = () => [], rules = {} }) {
  const R = { ...DEFAULTS, ...rules };
  let at = -1, table = [], top = null;
  function refresh() {
    if (at === state.tick) return;
    at = state.tick; table = standings();
    top = table.length && table[0].score - (table[1]?.score ?? 0) >= R.leadMargin ? table[0] : null;
  }
  const leader = () => { refresh(); return top?.clan ?? null; };
  const ninja = id => state.clans?.[id]?.kind === 'ninja';
  function underdog(id) {
    refresh();
    if (!top || top.clan === id || top.score < R.underdogMinScore) return false;
    return (table.find(r => r.clan === id)?.score ?? 0) <= top.score * R.underdogShare;
  }
  const hireFactor = id => underdog(id) ? 1 - R.underdogHireDiscount : 1;
  const respawnFactor = id => underdog(id) ? 1 - R.underdogRespawnFaster : 1;
  function pay(clanId, amount, reason, from) {
    const c = state.clans?.[clanId];
    if (!c || ninja(clanId) || clanId === from || !(amount > 0)) return;
    c.ryo += amount;
    state.ryoGains.push({ clan: clanId, amount, reason });
    state.news.push({ kind: 'leaderBounty', clan: clanId, leader: from, amount, reason });
  }
  // news: last tick's big moments (sim/game.js passes them before clearing)
  function tick(news = []) {
    const l = leader();
    if (!l) return;
    for (const n of news) {
      if (n.kind === 'raidWon' && n.defender === l) pay(n.raider, ninja(l) ? (n.hq ? R.shinobiHQ : 0) : R.raid, 'Leader bounty: raid', l);
      if (n.kind === 'shakedownSuccess' && n.defender === l && !ninja(l)) pay(n.clan, R.shakedown, 'Leader bounty: Shakedown', l);
    }
  }
  // a unit of the leading Shinobi clan knocked out (boss) or downed (crew) by attacker a (sim/game.js hit)
  function downed(a, t) {
    const l = leader();
    if (!l || !ninja(l) || t?.owner !== l || t.guard || !a?.owner) return;
    const boss = t.type === 'hero';
    pay(a.owner, boss ? R.shinobiBoss : R.shinobiCrew, boss ? 'Leader bounty: Shinobi boss' : 'Leader bounty: Shinobi crew', l);
  }
  return { leader, underdog, hireFactor, respawnFactor, tick, downed, rules: R };
}
