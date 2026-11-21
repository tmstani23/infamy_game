// War checkpoint 8d-1 (Tim 2026-11-15): the bot general, rules side.
// A general runs every side of a war that nobody is watching: a bot clan's side always, and a player's side while
// his hero is away (not inside that war's circle). The orders themselves come from the general's brain
// (sim/war_general_brain.js), a client like the bots and the lieutenant: it only reads the state and sends the
// commands a player sends. This module keeps what the sim has to know and save:
//   clan.warStrategy       'rush' | 'siege' | 'raider'. A bot's is rolled from the game seed the first time it is
//                          asked for and kept; a player picks his own (command warStrategy), default general.default.
//   town.warKeep           share of the town coffers the player's general leaves in them when it fills the
//                          defender's war chest (command warKeep { town, share }), default general.keepShare.
//                          It never touches the Clan treasury.
// Numbers: data.war.general.
// createWarGeneral({ state, data, war, dayTicks }) -> { command, strategyOf, away, runs, sides, keepOf, view, rules, enable, enabled, dayTicks }
// enable(): called by a general's brain when it is made; from then on the stand-in defender and stand-in douse of
// the earlier checkpoints stay off (they remain for bare tests that run no brains).
export const STRATEGIES = ['rush', 'siege', 'raider'];

export function createWarGeneral({ state, data, war, dayTicks = 12000, seed = () => state.campaignSeed ?? 1 }) {
  const G = () => ({ reviewSeconds: 5, default: 'siege', keepShare: 0.5, strategies: {}, ...(data.war?.general || {}) });
  const clanOf = id => state.clans?.[id] || null;
  const town = id => state.frontier?.settlements?.[id] || null;
  const heroOf = clan => Object.values(state.entities || {}).find(e => e.owner === clan && e.type === 'hero') || null;
  function hash(...parts) {
    let h = 2166136261;
    for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (h >>> 0);
  }
  // a clan's strategy; a bot's is rolled once from the game seed and kept on the clan
  function strategyOf(clan) {
    const c = clanOf(clan);
    if (!c) return G().default;
    if (!STRATEGIES.includes(c.warStrategy)) c.warStrategy = c.bot ? STRATEGIES[hash('warStrategy', seed(), clan) % STRATEGIES.length] : G().default;
    return c.warStrategy;
  }
  const sideOf = (w, clan) => w.attacker === clan ? 'attacker' : w.defender === clan ? 'defender' : null;
  // Tim 2026-11-17: a general's temperament in one war, rolled once from the game seed and kept on the war: 'bold'
  // pushes in full once its core troops are up, 'patient' builds its list first. Odds: the strategy's attack.bold
  function temper(w, side) {
    const t = (w.temper ||= {}), clan = side === 'attacker' ? w.attacker : w.defender;
    if (!t[side]) { const odds = G().strategies?.[strategyOf(clan)]?.attack?.bold ?? G().attack?.bold ?? 0.5; t[side] = (hash('temper', seed(), w.id, side, clan) % 1000) < odds * 1000 ? 'bold' : 'patient'; }
    return t[side];
  }
  // the player is away from a war when his hero is not inside its circle (a hero who is down inside it is still there)
  function away(w, clan) {
    const h = heroOf(clan), t = town(w.town), R = data.war?.circleRadius ?? 900;
    if (!h || !t) return true;
    return !(h.place === 'world' && Math.hypot(h.x - t.x, h.z - t.z) <= R);
  }
  // does the general run this clan's side of the war now
  function runs(w, clan) {
    const c = clanOf(clan);
    if (!c || !w || !sideOf(w, clan)) return false;
    return !!c.bot || away(w, clan);
  }
  // every side this clan's general runs now: [{ war, side }]
  const sides = clan => war.warsOf(clan).filter(w => runs(w, clan)).map(w => ({ war: w, side: sideOf(w, clan) }));
  const keepOf = s => { const k = s?.warKeep; return Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : G().keepShare; };
  let on = false;

  function setStrategy(e, c) {
    const clan = clanOf(e.owner);
    if (!clan) return { ok: false, reason: 'No clan' };
    if (!STRATEGIES.includes(c.strategy)) return { ok: false, reason: 'Pick Rush, Siege or Raider' };
    if (clan.bot && STRATEGIES.includes(clan.warStrategy)) return { ok: false, reason: 'A rival keeps its strategy' };
    clan.warStrategy = c.strategy;
    clan.strategyPicked = true;   // the Pick his strategy goal (campaign_goals.js): choosing, or confirming the chosen one
    return { ok: true, reason: '' };
  }
  function setKeep(e, c) {
    const s = town(c.town);
    if (!s || s.owner !== e.owner) return { ok: false, reason: 'Not your town' };
    if (!Number.isFinite(c.share) || c.share < 0 || c.share > 1) return { ok: false, reason: 'share must be from 0 to 1' };
    s.warKeep = Math.round(c.share * 100) / 100;
    return { ok: true, reason: '' };
  }
  function command(e, c) {
    const fn = { warStrategy: setStrategy, warKeep: setKeep }[c.action];
    if (!fn) return false;
    const r = fn(e, c), fr = state.frontier;
    if (!r.ok && clanOf(e.owner)) clanOf(e.owner).notice = { tick: state.tick, text: r.reason };
    fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    fr.receipts.push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: c.action, ok: r.ok, reason: r.reason || '' });
    return true;
  }
  // for the screens: a clan's own strategy and which of its wars its general runs now (never another clan's strategy)
  function view(clan) {
    return { strategy: strategyOf(clan), wars: war.warsOf(clan).map(w => ({ war: w.id, side: sideOf(w, clan), general: runs(w, clan) })) };
  }
  return { command, strategyOf, temper, away, runs, sides, sideOf, keepOf, view, rules: G, enable: () => { on = true; }, enabled: () => on, dayTicks };
}
