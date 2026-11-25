// War step 8e-9 (Tim 2026-11-16): armory upgrades. Bought at a built armory (the war camp's, or the defending town's
// during its war), for that side of that war only: they end with the war, like the troops. Troops only; the hero and
// crew are never changed. Tim 2026-11-25: one group for all troops (was four: melee, ranged, mounted, siege), two tracks:
// weapons (+war.armory.step damage a level) and armor (war.armory.step less damage taken a level), war.armory.levels
// levels. A level costs war.armory.cost[level] (ryo from that side's war chest, timber and stone from the camp stock
// or the town's stock) and takes war.armory.seconds while the armory stands; one in the work per side. Tim 2026-11-18:
// more can wait in a queue (war.armory.queue, work included), each paid when queued; a waiting one can be cancelled
// for its full price back (command armoryCancel { war, index }), the one in the work cannot. A finished level
// counts at once for every troop of that side, those on the field too (entity.warUp, read by stats.js).
// No iron for now (revisit when iron exists).
// w.armory = { attacker|defender: { levels: { <group>: { weapons, armor } }, work: { group, track, left } | null,
//   queue: [{ group, track, paid: { ryo, timber, stone } }] } }
// createWarArmory({ state, data, war, world }) -> { command, tick, view, applyTo, groupOf }
import { addCampStock } from './camp_stock.js';
import { debitRyo, creditRyo } from '../treasury.js';
export const ARMORY_GROUPS = ['all'];   // Tim 2026-11-25: condensed to one group, all troops
export const ARMORY_TRACKS = ['weapons', 'armor'];

export function createWarArmory({ state, data, war, world }) {
  const W = () => data.war || {}, A = () => W().armory || {};
  const town = id => state.frontier?.settlements?.[id] || null;
  const groupOf = unit => (W().units?.[unit] ? 'all' : null);   // every roster troop
  // an older save's per-group levels, work and queue fold into 'all' (best level of each track; the rest stays queued)
  function fold(r) {
    if (!r || r.folded) return r;
    const L = r.levels || {}, all = { weapons: 0, armor: 0 };
    for (const g of Object.values(L)) for (const t of ARMORY_TRACKS) all[t] = Math.max(all[t], g?.[t] || 0);
    r.levels = { all };
    if (r.work) r.work.group = 'all';
    for (const q of r.queue || []) q.group = 'all';
    r.folded = true;
    return r;
  }
  const maxLevel = () => A().levels ?? 3;
  const sideOf = (w, owner) => w?.attacker === owner ? 'attacker' : w?.defender === owner ? 'defender' : null;
  const rec = (w, side) => { const r = fold((w.armory ||= {})[side] ||= { levels: {}, work: null, folded: true }); r.queue ||= []; return r; };
  const queueMax = () => A().queue ?? 5;
  // levels bought but not done yet (in the work or waiting) for one track
  const pending = (w, side, group, track) => { const r = fold(w?.armory?.[side]); if (!r) return 0; return (r.work?.group === group && r.work?.track === track ? 1 : 0) + (r.queue || []).filter(q => q.group === group && q.track === track).length; };
  const level = (w, side, group, track) => fold(w?.armory?.[side])?.levels?.[group]?.[track] || 0;
  // the side's armory, built and standing
  function armoryOf(w, side) {
    if (side === 'attacker') return (w.camp?.buildings || []).find(b => b.type === 'armory' && b.stage === 'built') || null;
    const s = town(w.town);
    return s && s.owner === w.defender ? (s.buildings || []).find(b => b.type === 'armory' && b.stage === 'built') || null : null;
  }
  // Z6: a besieged castle pays ryo from the Clan treasury and needs no timber or stone (it keeps no stores)
  const castle = (w, side) => side !== 'attacker' && !!town(w.town)?.castle;
  const chestOf = (w, side) => side === 'attacker' ? w.camp?.chest || 0 : castle(w, side) ? Math.max(0, state.clans?.[w.defender]?.ryo || 0) : w.defense?.chest || 0;
  const stockOf = (w, side) => side === 'attacker' ? w.camp?.stock || {} : castle(w, side) ? { timber: Infinity, stone: Infinity } : town(w.town)?.stock || {};
  const costOf = lvl => (A().cost || [])[Math.min(lvl, (A().cost || []).length - 1)] || {};
  function why(w, side, group, track) {
    if (!w || !side) return 'Not your war';
    if (w.terms) return 'A ceasefire is on: the war is ending';
    if (!ARMORY_GROUPS.includes(group) || !ARMORY_TRACKS.includes(track)) return 'Pick weapons or armor';
    if (!armoryOf(w, side)) return 'Needs a built armory';
    const r = rec(w, side);
    if ((r.work ? 1 : 0) + r.queue.length >= queueMax()) return `The armory queue is full (${queueMax()})`;
    const lvl = level(w, side, group, track) + pending(w, side, group, track);
    if (lvl >= maxLevel()) return level(w, side, group, track) >= maxLevel() ? 'Fully upgraded' : 'Already queued to the top level';
    const c = costOf(lvl), stock = stockOf(w, side);
    if ((c.ryo || 0) > chestOf(w, side)) return `Needs ${c.ryo} ryo from the ${castle(w, side) ? 'Clan treasury' : 'war chest'} (it has ${Math.floor(chestOf(w, side))})`;
    for (const r0 of ['timber', 'stone']) if ((c[r0] || 0) > (stock[r0] || 0)) return `Needs ${c[r0]} ${r0} (has ${Math.floor(stock[r0] || 0)})`;
    return '';
  }
  function buy(e, c) {
    const w = war.byId(c.war), side = sideOf(w, e.owner), reason = why(w, side, c.group, c.track);
    if (reason) return { ok: false, reason };
    const lvl = level(w, side, c.group, c.track) + pending(w, side, c.group, c.track), cost = costOf(lvl);
    if (side === 'attacker') {
      w.camp.chest = Math.round(((w.camp.chest || 0) - (cost.ryo || 0)) * 100) / 100;
      for (const r of ['timber', 'stone']) if (cost[r]) addCampStock(w.camp, r, -cost[r]);
    } else if (castle(w, side)) {
      if (cost.ryo) debitRyo(state, state.clans[w.defender], cost.ryo, 'castle armory', { war: w.id });
    } else {
      (w.defense ||= { chest: 0, put: 0 }).chest = Math.round(((w.defense.chest || 0) - (cost.ryo || 0)) * 100) / 100;
      for (const r of ['timber', 'stone']) if (cost[r]) world.change(w.town, r, -cost[r], 'armory');
    }
    const r = rec(w, side), paid = castle(w, side) ? { ryo: cost.ryo || 0, timber: 0, stone: 0 } : { ryo: cost.ryo || 0, timber: cost.timber || 0, stone: cost.stone || 0 };
    if (r.work) r.queue.push({ group: c.group, track: c.track, paid });
    else r.work = { group: c.group, track: c.track, left: Math.round((A().seconds ?? 60) * 20) };
    return { ok: true };
  }
  // a waiting level back out of the queue, its price back in full; later levels of that track are dropped and refunded
  // too (they built on it)
  function cancel(e, c) {
    const w = war.byId(c.war), side = sideOf(w, e.owner), r = side && w?.armory?.[side];
    if (!w || !side) return { ok: false, reason: 'Not your war' };
    const i = Number(c.index);
    if (!r?.queue?.[i]) return { ok: false, reason: 'Nothing waiting there' };
    const q = r.queue[i], out = r.queue.filter((x, k) => k === i || (k > i && x.group === q.group && x.track === q.track));
    r.queue = r.queue.filter(x => !out.includes(x));
    for (const x of out) refund(w, side, x.paid);
    return { ok: true };
  }
  function refund(w, side, paid = {}) {
    if (side === 'attacker') {
      w.camp.chest = Math.round(((w.camp.chest || 0) + (paid.ryo || 0)) * 100) / 100;
      for (const r of ['timber', 'stone']) if (paid[r]) addCampStock(w.camp, r, paid[r]);
    } else if (castle(w, side)) {
      if (paid.ryo && state.clans?.[w.defender]) creditRyo(state, state.clans[w.defender], paid.ryo, 'castle armory', { war: w.id });
    } else {
      (w.defense ||= {}).chest = Math.round(((w.defense.chest || 0) + (paid.ryo || 0)) * 100) / 100;
      for (const r of ['timber', 'stone']) if (paid[r] && town(w.town)) world.change(w.town, r, paid[r], 'armory');
    }
  }
  // what one troop gets from its side's upgrades
  function applyTo(e) {
    const w = e?.warTroop ? war.byId(e.warTroop) : null, side = sideOf(w, e?.owner), group = groupOf(e?.warUnit);
    if (!w || !side || !group) return;
    const step = A().step ?? 0.05, wp = level(w, side, group, 'weapons'), ar = level(w, side, group, 'armor');
    if (!wp && !ar) { delete e.warUp; return; }
    e.warUp = { damage: Math.round((1 + step * wp) * 1000) / 1000, taken: Math.round(Math.max(0.1, 1 - step * ar) * 1000) / 1000 };
  }
  function tick() {
    for (const w of war.active()) {
      for (const side of ['attacker', 'defender']) {
        const r = fold(w.armory?.[side]), k = r?.work;
        if (!k || !armoryOf(w, side)) continue;   // the work stops while the armory is down
        if (--k.left > 0) continue;
        const g = (r.levels[k.group] ||= { weapons: 0, armor: 0 });
        g[k.track] = Math.min(maxLevel(), (g[k.track] || 0) + 1);
        const next = (r.queue ||= []).shift();
        r.work = next ? { group: next.group, track: next.track, left: Math.round((A().seconds ?? 60) * 20) } : null;
        const owner = side === 'attacker' ? w.attacker : w.defender;
        for (const e of Object.values(state.entities || {})) if (e.warTroop === w.id && e.owner === owner && !e.dead && groupOf(e.warUnit) === k.group) applyTo(e);
        const clan = state.clans?.[owner];
        if (clan) clan.notice = { tick: state.tick, text: `Armory: troop ${k.track} level ${g[k.track]} done` };
      }
    }
  }
  function view(warId, owner) {
    const w = war.byId(warId), side = sideOf(w, owner);
    if (!w || !side) return null;
    const r = fold(w.armory?.[side]) || { levels: {}, work: null }, has = !!armoryOf(w, side), sec = A().seconds ?? 60;
    return { side, has, max: maxLevel(), step: A().step ?? 0.05, seconds: sec, queueMax: queueMax(),
      work: r.work ? { ...r.work, seconds: Math.ceil(r.work.left / 20) } : null,
      queue: (r.queue || []).map((q, i) => ({ index: i, group: q.group, track: q.track, paid: q.paid,
        level: level(w, side, q.group, q.track) + (r.work?.group === q.group && r.work?.track === q.track ? 1 : 0) + (r.queue || []).slice(0, i + 1).filter(x => x.group === q.group && x.track === q.track).length })),
      groups: ARMORY_GROUPS.map(group => ({ group, units: Object.keys(W().units || {}).filter(u => groupOf(u) === group),
        tracks: ARMORY_TRACKS.map(track => { const lvl = level(w, side, group, track), q = pending(w, side, group, track); return { track, level: lvl, queued: q, cost: lvl + q < maxLevel() ? costOf(lvl + q) : null, why: why(w, side, group, track) }; }) })) };
  }
  function command(e, c) {
    if (c.action === 'armoryCancel') return cancel(e, c);
    if (c.action !== 'armoryUp') return null;
    return buy(e, c);
  }
  // train robbery R2 (Tim 2026-11-20): a train guard gets the best upgrades its clan has for its group in any war on now
  function applyGuard(e) {
    const group = groupOf(e?.warUnit);
    if (!group) return;
    let wp = 0, ar = 0;
    for (const w of war.active()) { const side = sideOf(w, e.owner); if (!side) continue; wp = Math.max(wp, level(w, side, group, 'weapons')); ar = Math.max(ar, level(w, side, group, 'armor')); }
    if (!wp && !ar) return;
    const step = A().step ?? 0.05;
    e.warUp = { damage: Math.round((1 + step * wp) * 1000) / 1000, taken: Math.round(Math.max(0.1, 1 - step * ar) * 1000) / 1000 };
  }
  return { command, tick, view, applyTo, applyGuard, groupOf, why: (warId, owner, group, track) => { const w = war.byId(warId); return why(w, sideOf(w, owner), group, track); } };
}
