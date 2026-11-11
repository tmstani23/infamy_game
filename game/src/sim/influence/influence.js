import { modeRules } from '../modes/index.js';
// Influence (frontier plan C4, Tim 2026-11-05). Campaign only; Classic never imports this folder.
// Influence is a running total per clan = Renown + businesses held per day + frontier trade.
// Renown itself is unchanged (earned as in Classic, never converted or spent).
// Unlocks (settings.json "influence"): more town permits, cheaper imports (takes effect once F3
// shipments exist) and better Market export prices (+exportBonusPerTier per tier). Each tier fires
// once (news + notice). State: state.influence[clan] = { days, trade, tier }, saved with the game.
export function createInfluence({ state, rules, businessesHeld = () => 0 }) {
  const R = rules || {};
  const on = () => !!R.tiers && modeRules(state).influence;
  const rec = id => ((state.influence ||= {})[id] ||= { days: 0, trade: 0, tier: 0 });
  function value(id) {
    if (!on() || !state.clans?.[id]) return 0;
    const r = rec(id);
    return Math.floor((state.clans[id].renown || 0) + r.days + r.trade);
  }
  const tierOf = v => (R.tiers || []).filter(t => v >= t.at).length;
  const tier = id => on() ? tierOf(value(id)) : 0;
  // towns a clan may found: base + one for each permit unlock reached
  const maxTowns = (id, base = 1) => base + (on() ? (R.tiers || []).slice(0, tier(id)).filter(t => t.unlock === 'permit').length : 0);
  const exportFactor = id => 1 + tier(id) * (R.exportBonusPerTier || 0);
  const importFactor = id => Math.max(0, 1 - tier(id) * (R.importDiscountPerTier || 0));
  // { value, tier, next: { at, label } | null } for the screen
  function status(id) {
    const v = value(id), t = tierOf(v), next = (R.tiers || [])[t] || null;
    return { value: v, tier: t, next: next && { at: next.at, label: next.label }, exportFactor: exportFactor(id), importFactor: importFactor(id) };
  }
  // a Market sale of `goods` by a town of clan `id` (sim/frontier/economy.js)
  function sold(id, goods) { if (on() && state.clans?.[id] && goods > 0) rec(id).trade += goods * (R.perGoodSold || 0); }
  // every tick: at dawn each clan's businesses add perBusinessDay each; new tiers fire once
  function tick() {
    if (!on()) return;
    for (const id of Object.keys(state.clans || {})) {
      const r = rec(id);
      if (state.dawn) r.days += businessesHeld(id) * (R.perBusinessDay || 0);
      const t = tierOf(value(id));
      while (r.tier < t) {
        r.tier++;
        const label = R.tiers[r.tier - 1].label;
        (state.news ||= []).push({ kind: 'influenceTier', clan: id, tier: r.tier, label });
        state.clans[id].notice = { tick: state.tick, text: `Influence tier ${r.tier}: ${label}` };
      }
    }
  }
  return { value, tier, status, maxTowns, exportFactor, importFactor, sold, tick, tiers: () => (on() ? R.tiers : []).map(t => ({ at: t.at, label: t.label })) };
}
