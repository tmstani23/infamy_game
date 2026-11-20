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
  return { captured, sacked, burned, attach: s => { runtime = s; } };
}
