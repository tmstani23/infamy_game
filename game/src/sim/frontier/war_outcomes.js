// What taking a town does (frontier plan F6, checkpoint 8a-4, Tim 2026-11-14). Rules only. Called by war_end.js
// when the attacking hero's channel at the ruined town hall completes; each returns a note for the 'warEnded' news.
//   captured: the town changes owner with everything in it: people, workers, stores, zones, buildings (ruins stay
//             ruins) and its governor settings. It is cut from the old owner's railway: every line ending at it is
//             torn up (open shipments over them are cancelled, sim/frontier/rail.js tearUp). Its people on the map
//             (workers, carts, townsfolk) are taken off and come back under the new owner. settlement.captured =
//             { tick, from }: a captured town does not count toward the founding limit (land_office.js).
//   sacked:   outcomes.sackShare of the town coffers (its ryo stock) goes to the attacker's Clan treasury. The town
//             stays with its clan, its ruins as they are.
//   burned:   the town is wiped: its record, people, lines and roads go (world.removeTown) and its site is free to
//             found on again under the usual rules.
// Any town can be captured, sacked or burned, a clan's last one too (Z2, Tim 2026-11-19).
// The old owner's horses and vehicles stored in a town he no longer holds move to another of his stables
// (sim/vehicle_garage.js).
// createWarOutcomes({ state, data, war, world, rail, garrison }) -> { captured, sacked, burned, attach }
import { creditRyo } from '../treasury.js';

export function createWarOutcomes({ state, data, war, world, rail = null, garrison = null }) {
  let runtime = null;
  const town = id => state.frontier?.settlements?.[id] || null;
  const say = (clan, text) => { const c = state.clans?.[clan]; if (c) c.notice = { tick: state.tick ?? 0, text }; };
  // the town's own people on the map: workers, carts, newcomers, townsfolk, salute cannons
  function clearPeople(s) {
    const gone = new Set(s.cannons || []);
    for (const e of Object.values(state.entities || {})) {
      if ((e.town === s.id && (e.worker || e.cart || e.arrival)) || e.townsfolk === s.id) gone.add(e.id);
      else if (e.garrison?.town === s.id) delete e.garrison;   // anyone sheltering in it steps out where he stands
    }
    for (const id of gone) if (state.entities[id]) runtime?.remove?.(id);
    for (const w of s.workers || []) { if (!state.entities[w.entity]) w.entity = null; delete w.garrison; delete w.shelter; }
    delete s.cannons; if (s.folk) s.folk = [];
  }
  function cutRail(s, owner) { return rail?.tearUp ? rail.tearUp(owner, s.id) : 0; }
  function captured(w, by) {
    const s = town(w.town); if (!s) return null;
    const from = s.owner;
    cutRail(s, from);
    clearPeople(s);
    world.setOwner(s.id, w.attacker);
    s.captured = { tick: state.tick ?? 0, from };
    say(w.attacker, `${s.name} is yours`); say(from, `You lost ${s.name}`);
    return { townName: s.name };
  }
  function sacked(w, by) {
    const s = town(w.town); if (!s) return null;
    const share = data.war?.outcomes?.sackShare ?? 0.5, ryo = Math.floor(Math.max(0, s.stock?.ryo || 0) * share);
    if (ryo > 0) { world.change(s.id, 'ryo', -ryo, 'sacked'); const clan = state.clans?.[w.attacker]; if (clan) creditRyo(state, clan, ryo, 'town sacked'); }
    say(w.attacker, `${s.name} sacked: ${ryo} ryo taken`); say(s.owner, `${s.name} was sacked: ${ryo} ryo lost`);
    return { townName: s.name, ryo };
  }
  function burned(w, by) {
    const s = town(w.town); if (!s) return null;
    const from = s.owner, name = s.name;
    cutRail(s, from);
    clearPeople(s);
    for (const k of Object.keys(state.frontier.fires || {})) if (k.startsWith(`t|${s.id}|`)) delete state.frontier.fires[k];
    world.removeTown(s.id);
    say(w.attacker, `${name} burned to the ground`); say(from, `${name} was burned to the ground`);
    return { townName: name };
  }
  // Z6 (2026-11-20): a castle's keep is taken. Its clan is out of the campaign: every town of it goes empty (no owner,
  // buildings and stores kept, for anyone to claim, sim/frontier/empty_towns.js), the castle too; its railway is torn
  // up; its city businesses are free and its hideout closes; every unit of it leaves the map. clan.out = { tick, by }.
  // When the player's clan is out the campaign is lost; when one clan is left it has won:
  //   state.campaignEnd = { tick, winner: <clan id> | null, lost: <clan id> | null }
  function clanOut(clan, by = null) {
    const c = state.clans?.[clan]; if (!c || c.out) return null;
    const now = state.tick ?? 0, towns = Object.values(state.frontier?.settlements || {}).filter(s => s.owner === clan);
    for (const s of towns) {
      cutRail(s, clan); clearPeople(s);
      world.setOwner(s.id, null);
      if (!s.capital) s.empty = { tick: now, from: clan };
    }
    for (const b of Object.values(state.businesses || {})) {
      if (b.owner === clan) b.owner = null;
      if (b.hideout === clan) { b.closedHideout = clan; delete b.hideout; }
    }
    // war troops rout with the war; the player's hero stays so the end screen can show the fallen castle (campaign_end.js)
    for (const e of Object.values(state.entities || {})) if (e.owner === clan && !e.warTroop && !(e.type === 'hero' && !c.bot)) runtime?.remove?.(e.id);
    c.out = { tick: now, by, day: state.season?.day ?? null };
    (state.news ||= []).push({ kind: 'clanOut', clan, by, towns: towns.filter(s => !s.capital).length });
    say(by, `${c.name || clan} is out of the campaign`);
    const left = Object.keys(state.clans || {}).filter(id => !state.clans[id].out);
    const day = state.season?.day ?? null;
    if (!c.bot) state.campaignEnd = { tick: now, day, winner: null, lost: clan, by };
    else if (left.length === 1 && !state.campaignEnd) state.campaignEnd = { tick: now, day, winner: left[0], lost: null };
    return { towns: towns.length };
  }
  function fell(w, by) {
    const s = town(w.town); if (!s) return null;
    const from = s.owner, name = s.name;
    s.fallen = { tick: state.tick ?? 0, from, by: w.attacker };
    const r = clanOut(from, w.attacker);
    say(from, `${name} has fallen`);
    return { townName: name, clan: from, towns: r?.towns ?? 0 };
  }
  return { captured, sacked, burned, fell, clanOut, attach: s => { runtime = s; } };
}
