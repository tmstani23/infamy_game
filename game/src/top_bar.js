// Top bar buttons and badges updated every sim tick: Rally, Unstuck, jail banner, heat, ryo and the season
// score (moved out of main.js, phase 7 split, 2026-10-29). Reads the state only.
export function createTopBar({ game, heroId, $, TICK_RATE, heatBadge, ryoBadge, scoreText }) {
  function update() {
    { const r = game.rally.status(game.state.entities[heroId].owner), b = $('rallybtn');
      b.disabled = r.active || r.cooldown > 0; b.textContent = r.active ? `Rally · ${r.seconds}s` : r.cooldown ? `Rally · ${r.cooldown}s` : 'Call Rally';
      b.title = 'Calls your remembered groups (all groups on first use). Configure groups in Deployment.'; }
    { const s = game.unstuck.status(game.state.entities[heroId]), b = $('unstuckbtn');
      const t = s.channel ? `Unstuck · ${s.channel}s` : s.cooldown ? `Unstuck · ${Math.floor(s.cooldown / 60)}:${String(s.cooldown % 60).padStart(2, '0')}` : 'Unstuck (U)';
      if (b.textContent !== t) b.textContent = t;
      b.title = s.channel ? 'Hold still: going back to your HQ (U again cancels)' : s.why || 'Stand still 3 s to go back inside your HQ (once per 5 min)'; }
    // in jail (sim/police.js): big red banner with the time left
    const jailed = game.state.entities[heroId]?.jailed, jailEl = $('jail');
    jailEl.hidden = !jailed;
    if (jailed) { const t = `IN JAIL<small>out in ${Math.max(0, Math.ceil((jailed.until - game.state.tick) / TICK_RATE))}s</small>`; if (jailEl.innerHTML !== t) jailEl.innerHTML = t; }
    heatBadge.update();
    ryoBadge.update();
    if (game.state.tick % 10 === 0) {
      const t = scoreText(); if ($('score').innerHTML !== t) $('score').innerHTML = t;
      // hover: where each clan's points come from (sim/territory.js breakdown)
      const why = game.territory ? game.territory.standings().map(r => `${r.clan === 'player' ? 'You' : game.state.clans[r.clan]?.name}: ${game.territory.breakdown(r.clan).map(x => `${x.label} ${x.points}`).join(' + ') || 'no businesses'} = ${r.score}`).join('\n') : '';
      if ($('score').title !== why) $('score').title = why;
    }
  }
  return { update };
}
