// Town alerts (frontier plan F4.4c). Runs after the governor each economy tick, reads the towns and
// pushes { kind: 'town', event, clan, settlement, name, text, urgent } onto state.news (this tick's
// big moments, like boss knocked out). Only the town's owner gets one (clan = owner).
// Condition alerts (food running out, mood low, road blocked, suggestion waiting) fire once when the
// condition starts and not again until it has cleared AND the cooldown passed. Event alerts (attack,
// building destroyed, project finished) fire when the number changes, also behind the cooldown.
// Latches live in state.frontier.alertState so a loaded save does not re-fire what it already said.
// Not here yet: "town grew a tier" (towns have no tiers until F5).
import { isFull } from './storage.js';
import { residents } from './people.js';
export function createAlerts({ state, data }) {
  const A = data.alerts || {};
  const cooldown = A.cooldownEcon ?? 20;   // economy ticks per town and kind
  const urgentKinds = new Set(['attack', 'destroyed', 'blocked']);
  const TEXT = { attack: 'is under attack!', destroyed: 'lost a building', blocked: 'road blocked', mood: 'mood has fallen below 40', food: 'is running out of food', finished: 'project finished', suggestion: 'governor has a suggestion', tier: 'town hall upgraded' };
  for (const r of data.resources || []) TEXT[`full_${r}`] = `${r} store is full`;   // B2 storage caps

  function econTick() {
    const f = state.frontier; if (!f) return;
    const as = (f.alertState ||= {});
    for (const s of Object.values(f.settlements)) {
      if (s.capital || !s.owner || !s.stock) continue;
      const st = (as[s.id] ||= { on: {}, at: {}, last: null });
      const say = (event) => {
        if (st.at[event] !== undefined && f.econTick - st.at[event] < cooldown) return;
        st.at[event] = f.econTick;
        const fullTip = event.startsWith('full_') ? 'Workers on it wait. Build a storehouse, upgrade the town hall, or spend it.' : null;
        (state.news ||= []).push({ kind: 'town', event, clan: s.owner, settlement: s.id, name: s.name, text: `${s.name} ${TEXT[event]}`, tip:fullTip || s.report?.statusTips?.[event] || s.report?.moodWhy?.map(w=>w.tip).join('\n') || 'Open this town for current requirements and status.', urgent: urgentKinds.has(event) });
      };
      const cond = (event, active) => { if (active && !st.on[event]) say(event); st.on[event] = active; };
      const road = Object.values(f.roads || {}).some(r => (r.from === s.id || r.to === s.id) && r.state === 'blocked');
      cond('blocked', road);
      cond('mood', (s.mood ?? 100) < (A.moodBelow ?? 40));
      cond('food', (s.report?.waiting || []).includes('food'));
      cond('suggestion', (s.suggestions || []).length > 0);
      if (s.tierUpAt === f.econTick) say('tier');   // B3
      // B7 growth alerts: a population milestone or housing full, at most one per growthCooldownEcon
      const people = residents(s), step = A.popMilestone ?? 25, mile = Math.floor(people / step) * step;
      st.mile ??= mile;
      const full = people >= s.housing && s.housing > 0, ready = st.growthAt === undefined || f.econTick - st.growthAt >= (A.growthCooldownEcon ?? 300);
      const tell = text => { st.growthAt = f.econTick; (state.news ||= []).push({ kind: 'town', event: 'growth', clan: s.owner, settlement: s.id, name: s.name, text: `${s.name} ${text}`, tip: 'Open this town for its growth line and housing.', urgent: false }); };
      if (mile > st.mile && ready) { st.mile = mile; tell(`grew to ${mile} people`); }
      else if (full && !st.full && ready) tell('housing is full');
      st.full = full;
      for (const r of data.resources || []) if (isFull(s, data, r)) cond(`full_${r}`, true); else cond(`full_${r}`, false);
      const built = s.buildings.filter(b => b.stage === 'built').length, ruined = s.buildings.filter(b => b.stage === 'ruined').length;
      if (st.last) {
        if ((s.safety ?? 100) <= st.last.safety - (A.attackDrop ?? 20)) say('attack');
        if (ruined > st.last.ruined) say('destroyed');
        if (built > st.last.built && ruined <= st.last.ruined) say('finished');
      }
      st.last = { safety: s.safety ?? 100, built, ruined };
    }
  }
  return { econTick };
}
