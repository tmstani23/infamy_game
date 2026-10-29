// Unstuck (phase 5 of docs/playtest_followup_plan.md, Tim 2026-10-29): a hero caught on the map stands
// still for channelSeconds and comes out inside his own hideout. Once per cooldownSeconds. A hit, moving,
// attacking, a door or being downed cancels it (pressing again too). Not allowed within combatSeconds of
// hitting or being hit, while his HQ is raided, or while he is in the room of his Sabotage/Steal job.
// Every use is logged in state.stuckSpots (where it was used) so map snags can be fixed.
// Command: [{ id, type: 'unstuck' }] from the hero, players and bots alike. Numbers: units.json rules.unstuck.
import { secs } from './util.js';
const DEFAULTS = { channelSeconds: 3, cooldownSeconds: 300, combatSeconds: 5, logMax: 50 };

export function createUnstuck({ state, rules = {}, destination, moving = () => false, holding = () => false, cleanup = () => {} }) {
  const R = { ...DEFAULTS, ...rules };
  state.stuckSpots ||= [];
  const say = (e, text) => { const clan = state.clans?.[e?.owner]; if (clan) clan.notice = { tick: state.tick, text }; };
  const recent = at => at != null && state.tick - at < secs(R.combatSeconds);
  const hqRaided = clan => Object.values(state.attacks || {}).some(a => a.mode === 'raid' && a.defender === clan && state.businesses[a.business]?.hideout === clan);
  const fighting = e => !!(e.attackTarget || e.swing || e.execute);
  // why the hero can't start one now, or null
  function why(e) {
    if (!e || e.type !== 'hero' || e.dead || e.downed || e.jailed) return 'Not now';
    if ((e.unstuckReady ?? 0) > state.tick) return `Unstuck ready in ${Math.ceil((e.unstuckReady - state.tick) / 20)} s`;
    if (fighting(e) || recent(e.hitAt) || recent(e.struckAt)) return 'Not during a fight';
    if (hqRaided(e.owner)) return 'Your HQ is being raided';
    if (holding(e)) return 'Not while on your contract objective';
    if (!destination(e)) return 'No HQ to go to';
    return null;
  }
  function command(e) {
    if (e?.unstuck) { delete e.unstuck; say(e, 'Unstuck cancelled'); return; }
    const no = why(e);
    if (no) { say(e, no); return; }
    e.unstuck = { start: state.tick, until: state.tick + secs(R.channelSeconds), place: e.place };
  }
  function tick() {
    for (const e of Object.values(state.entities)) {
      const u = e.unstuck;
      if (!u) continue;
      if (e.dead || e.downed || e.jailed || (e.hitAt ?? -1) >= u.start || fighting(e) || moving(e) || e.place !== u.place || hqRaided(e.owner)) {
        delete e.unstuck; say(e, 'Unstuck cancelled'); continue;
      }
      if (state.tick < u.until) continue;
      delete e.unstuck;
      const d = destination(e);
      if (!d) continue;
      state.stuckSpots.push({ x: Math.round(e.x * 10) / 10, z: Math.round(e.z * 10) / 10, place: e.place, tick: state.tick, clan: e.owner });
      if (state.stuckSpots.length > R.logMax) state.stuckSpots.shift();
      state.news.push({ kind: 'unstuck', clan: e.owner, hero: e.id, x: e.x, z: e.z, place: e.place });
      cleanup(e);
      Object.assign(e, { x: d.x, z: d.z, place: d.place, anim: 'idle' });
      e.unstuckReady = state.tick + secs(R.cooldownSeconds);
    }
  }
  // for the button: channel seconds left, cooldown seconds left, and why it can't start (null = ready)
  const status = e => ({ channel: e?.unstuck ? Math.max(0, Math.ceil((e.unstuck.until - state.tick) / 20)) : 0,
    cooldown: Math.max(0, Math.ceil(((e?.unstuckReady ?? 0) - state.tick) / 20)), why: e?.unstuck ? null : why(e) });
  return { command, tick, status, why, rules: R };
}
