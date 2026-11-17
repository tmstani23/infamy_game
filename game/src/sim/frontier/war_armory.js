// War step 8e-9 (Tim 2026-11-16): armory upgrades. Bought at a built armory (the war camp's, or the defending town's
// during its war), for that side of that war only: they end with the war, like the troops. Troops only; the hero and
// crew are never changed. Four unit groups (war.units.<unit>.group: melee, ranged, mounted, siege), two tracks each:
// weapons (+war.armory.step damage a level) and armor (war.armory.step less damage taken a level), war.armory.levels
// levels. A level costs war.armory.cost[level] (ryo from that side's war chest, timber and stone from the camp stock
// or the town's stock) and takes war.armory.seconds while the armory stands; one at a time per side. A finished level
// counts at once for every troop of that side and group, those on the field too (entity.warUp, read by stats.js).
// No iron for now (revisit when iron exists).
// w.armory = { attacker|defender: { levels: { <group>: { weapons, armor } }, work: { group, track, left } | null } }
// createWarArmory({ state, data, war, world }) -> { command, tick, view, applyTo, groupOf }
export const ARMORY_GROUPS = ['melee', 'ranged', 'mounted', 'siege'];
export const ARMORY_TRACKS = ['weapons', 'armor'];

export function createWarArmory({ state, data, war, world }) {
  const W = () => data.war || {}, A = () => W().armory || {};
  const town = id => state.frontier?.settlements?.[id] || null;
  const groupOf = unit => W().units?.[unit]?.group || null;
  const maxLevel = () => A().levels ?? 3;
  const sideOf = (w, owner) => w?.attacker === owner ? 'attacker' : w?.defender === owner ? 'defender' : null;
  const rec = (w, side) => ((w.armory ||= {})[side] ||= { levels: {}, work: null });
  const level = (w, side, group, track) => w?.armory?.[side]?.levels?.[group]?.[track] || 0;
  // the side's armory, built and standing
  function armoryOf(w, side) {
    if (side === 'attacker') return (w.camp?.buildings || []).find(b => b.type === 'armory' && b.stage === 'built') || null;
    const s = town(w.town);
    return s && s.owner === w.defender ? (s.buildings || []).find(b => b.type === 'armory' && b.stage === 'built') || null : null;
  }
  const chestOf = (w, side) => side === 'attacker' ? w.camp?.chest || 0 : w.defense?.chest || 0;
  const stockOf = (w, side) => side === 'attacker' ? w.camp?.stock || {} : town(w.town)?.stock || {};
  const costOf = lvl => (A().cost || [])[Math.min(lvl, (A().cost || []).length - 1)] || {};
  function why(w, side, group, track) {
    if (!w || !side) return 'Not your war';
    if (w.terms) return 'A ceasefire is on: the war is ending';
    if (!ARMORY_GROUPS.includes(group) || !ARMORY_TRACKS.includes(track)) return 'Pick a group and weapons or armor';
    if (!armoryOf(w, side)) return 'Needs a built armory';
    const r = rec(w, side);
    if (r.work) return 'The armory is already working on an upgrade';
    const lvl = level(w, side, group, track);
    if (lvl >= maxLevel()) return 'Fully upgraded';
    const c = costOf(lvl), stock = stockOf(w, side);
    if ((c.ryo || 0) > chestOf(w, side)) return `Needs ${c.ryo} ryo from the war chest (it has ${Math.floor(chestOf(w, side))})`;
    for (const r0 of ['timber', 'stone']) if ((c[r0] || 0) > (stock[r0] || 0)) return `Needs ${c[r0]} ${r0} (has ${Math.floor(stock[r0] || 0)})`;
    return '';
  }
  function buy(e, c) {
    const w = war.byId(c.war), side = sideOf(w, e.owner), reason = why(w, side, c.group, c.track);
    if (reason) return { ok: false, reason };
    const lvl = level(w, side, c.group, c.track), cost = costOf(lvl);
    if (side === 'attacker') {
      w.camp.chest = Math.round(((w.camp.chest || 0) - (cost.ryo || 0)) * 100) / 100;
      for (const r of ['timber', 'stone']) if (cost[r]) w.camp.stock[r] = Math.round(((w.camp.stock[r] || 0) - cost[r]) * 100) / 100;
    } else {
      w.defense.chest = Math.round(((w.defense.chest || 0) - (cost.ryo || 0)) * 100) / 100;
      for (const r of ['timber', 'stone']) if (cost[r]) world.change(w.town, r, -cost[r], 'armory');
    }
    rec(w, side).work = { group: c.group, track: c.track, left: Math.round((A().seconds ?? 60) * 20) };
    return { ok: true };
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
        const r = w.armory?.[side], k = r?.work;
        if (!k || !armoryOf(w, side)) continue;   // the work stops while the armory is down
        if (--k.left > 0) continue;
        const g = (r.levels[k.group] ||= { weapons: 0, armor: 0 });
        g[k.track] = Math.min(maxLevel(), (g[k.track] || 0) + 1);
        r.work = null;
        const owner = side === 'attacker' ? w.attacker : w.defender;
        for (const e of Object.values(state.entities || {})) if (e.warTroop === w.id && e.owner === owner && !e.dead && groupOf(e.warUnit) === k.group) applyTo(e);
        const clan = state.clans?.[owner];
        if (clan) clan.notice = { tick: state.tick, text: `Armory: ${k.group} ${k.track} level ${g[k.track]} done` };
      }
    }
  }
  function view(warId, owner) {
    const w = war.byId(warId), side = sideOf(w, owner);
    if (!w || !side) return null;
    const r = w.armory?.[side] || { levels: {}, work: null }, has = !!armoryOf(w, side);
    return { side, has, max: maxLevel(), step: A().step ?? 0.05, seconds: A().seconds ?? 60,
      work: r.work ? { ...r.work, seconds: Math.ceil(r.work.left / 20) } : null,
      groups: ARMORY_GROUPS.map(group => ({ group, units: Object.keys(W().units || {}).filter(u => groupOf(u) === group),
        tracks: ARMORY_TRACKS.map(track => { const lvl = level(w, side, group, track); return { track, level: lvl, cost: lvl < maxLevel() ? costOf(lvl) : null, why: why(w, side, group, track) }; }) })) };
  }
  function command(e, c) {
    if (c.action !== 'armoryUp') return null;
    return buy(e, c);
  }
  return { command, tick, view, applyTo, groupOf, why: (warId, owner, group, track) => { const w = war.byId(warId); return why(w, sideOf(w, owner), group, track); } };
}
