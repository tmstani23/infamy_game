import { bossAway } from './sim/util.js';
import { standingsModel, createStandingsBar } from './top_bar_standings.js';
// Top bar paints once per frame; observe preserves each tick's badge events.
// Rally, Unstuck, jail banner, heat, ryo and the season
// score (moved out of main.js, phase 7 split, 2026-10-29). Reads the state only.
export function createTopBar({ game, heroId, $, TICK_RATE, heatBadge, ryoBadge, onClan = null }) {
  let scoreTick = -Infinity;
  const paintStandings = createStandingsBar($('score'), onClan);   // clock block + clan chips (src/top_bar_standings.js)
  function update() {
    { const r = game.rally.status(game.state.entities[heroId].owner), b = $('rallybtn');
      const away = bossAway(game.state.entities[heroId]);   // the lieutenant runs the city while you're out (Tim 2026-11-08)
      b.disabled = away || r.active || r.cooldown > 0; b.textContent = r.active ? `Rally, ${r.seconds}s` : r.cooldown ? `Rally, ${r.cooldown}s` : 'Call Rally';
      b.title = away ? "The lieutenant runs the city while you're away: come back to call a Rally" : 'Calls your remembered groups (all groups on first use). Configure groups in Deployment.'; }
    { const s = game.unstuck.status(game.state.entities[heroId]), b = $('unstuckbtn');
      const t = s.channel ? `Unstuck, ${s.channel}s` : s.cooldown ? `Unstuck, ${Math.floor(s.cooldown / 60)}:${String(s.cooldown % 60).padStart(2, '0')}` : 'Unstuck (U)';
      if (b.textContent !== t) b.textContent = t;
      b.title = s.channel ? 'Hold still: going back to your HQ (U again cancels)' : s.why || 'Stand still 3 s to go back inside your HQ (once per 5 min)'; }
    // in jail (sim/police.js): big red banner with the time left
    const jailed = game.state.entities[heroId]?.jailed, jailEl = $('jail');
    jailEl.hidden = !jailed;
    if (jailed) { const t = `IN JAIL<small>out in ${Math.max(0, Math.ceil((jailed.until - game.state.tick) / TICK_RATE))}s</small>`; if (jailEl.innerHTML !== t) jailEl.innerHTML = t; }
    heatBadge.update();
    ryoBadge.update();
    if (game.state.tick - scoreTick >= 10) {
      scoreTick = game.state.tick;
      paintStandings(standingsModel(game, game.state.entities[heroId]?.owner, TICK_RATE));
    }
  }
  return { update, observe() { heatBadge.observe(); ryoBadge.observe(); } };
}
