import { modeRules } from './modes/index.js';
// Campaign goals (quest log, Tim 2026-11-06). Read-only: works out the clan's current goal from the state
// and returns it for the Goal card (src/goal_card.js). No rules, no commands, nothing written to the state.
// The permit rows come from landOffice.permitStatus(), the same check as the telegraph office blink.
// Chain, repeated for each town the clan may found (Influence unlocks the 2nd and 3rd):
//   permit -> settlers -> leave the city -> found, then grow Influence to the next tier.
// current(id) -> null | { key, title, step, steps, rows: [{ icon, label, have, need, done, how }] }
export const GOAL_STEPS = ['permit', 'settlers', 'leave', 'found', 'influence'];
const ORDINAL = ['', '2nd ', '3rd ', '4th '];

export function createCampaignGoals({ state, clans, landOffice, influence, data = {} }) {
  const D = data.founding || {}, P = D.permit || {};
  const townsOf = id => Object.values(state.frontier?.settlements || {}).filter(s => s.owner === id && s.founded).length;
  const heroOf = id => Object.values(state.entities).find(e => e.type === 'hero' && e.owner === id);
  const row = (icon, label, have, need, how) => ({ icon, label, have, need, done: have >= need, how: have >= need ? '' : how });

  function permitRows(id, clan) {
    const ninja = clan.kind === 'ninja', full = clans.crewCount(id) >= clans.crewCap(id);
    const how = {
      Renown: ninja ? 'Finish contracts at the village shrine (Space) and beat rival crew'
        : 'Win raids, shakedowns and sweeps',
      Crew: full ? 'Your crew limit is full: hold more businesses to raise it'
        : ninja ? 'Hire ninja in the village dojo or your longhouse (H)' : 'Hire in a teahouse or your hideout (H)',
      'Businesses held': 'Buy or take a business: left-click it at its door ring, then Buy or Attack',
      Ryo: ninja ? 'Finish contracts at the village shrine (Space)' : 'Collect business payouts at dawn',
    };
    const icons = { Renown: 'renown', Crew: 'crew', 'Businesses held': 'business', Ryo: 'ryo' };
    return landOffice.permitStatus(id).rows.map(r => row(icons[r.label] || 'renown', r.label === 'Businesses held' ? 'Businesses' : r.label, r.have, r.need, how[r.label] || ''));
  }

  function current(id) {
    const clan = state.clans?.[id];
    if (!clan || !landOffice || !modeRules(state).founding || !state.frontier) return null;
    const towns = townsOf(id), max = influence ? influence.maxTowns(id, P.maxTowns ?? 1) : (P.maxTowns ?? 1);
    const nth = ORDINAL[towns] ?? `${towns + 1}th `, steps = GOAL_STEPS.length;
    if (towns < max) {
      if (!clan.permit) {
        const rows = permitRows(id, clan);
        const ready = rows.every(r => r.done);
        rows.push(row('office', 'Permit bought', 0, 1, ready ? 'Go to the telegraph office (East Ward, past Police HQ, gold marker) and press Space, then 1'
          : 'Then buy it at the telegraph office (East Ward, past Police HQ)'));
        return { key: `permit${towns}`, title: `Buy a ${nth}founding permit`, step: 0, steps, rows };
      }
      // settlers waiting safely at the HQ (a count) plus any already walking with the hero
      const need = D.minSettlers ?? 5, have = clans.settlersOf(id).length + (clan.settlersWaiting || 0);
      if (have < need)
        return { key: `settlers${towns}`, title: 'Hire settlers', step: 1, steps,
          rows: [row('settler', 'Settlers', have, need, 'Hire them at the telegraph office: Space, then 2 (one) or 3 (five). They wait safely at your HQ')] };
      const out = heroOf(id)?.place === 'world', cost = D.cost ?? 0;
      if (!out)
        return { key: `leave${towns}`, title: 'Leave the city', step: 2, steps, gate: true,
          rows: [row('settler', 'Settlers ready', have, need, ''),
            row('gate', 'Out through the island gate', 0, 1, 'Go to the island gate (gold marker, east trail) and press Space: your settlers come along')] };
      const rows = [row('settler', 'Settlers', have, need, '')];
      if (cost) rows.push(row('ryo', 'Ryo', Math.floor(clan.ryo || 0), cost, 'Collect business payouts at dawn'));
      rows.push(row('town', 'Town founded', 0, 1, 'With the settlers beside you, click Found a town here'));
      return { key: `found${towns}`, title: `Found your ${nth}town`, step: 3, steps, rows };
    }
    const st = influence?.status(id);
    if (st?.next) return { key: `influence${st.tier}`, title: `Grow Influence: ${st.next.label}`, step: 4, steps,
      rows: [row('influence', 'Influence', st.value, st.next.at, 'Hold businesses (every dawn) and sell town goods at a Market')] };
    return null;
  }
  return { current };
}
