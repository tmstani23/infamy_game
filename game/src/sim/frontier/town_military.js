// War checkpoint 8b-1 (Tim 2026-11-15): military buildings in towns.
// A town builds the war camp's military buildings (frontier.json buildings with military: true) inside its ring at
// any time, from town stock, through the normal placement and construction. Both sides share one set of limits:
// max, needs and clan come from war.buildings[type]. needs 'upgrade' = the town hall war upgrade (s.warHall), bought
// at the hall for war.hallUpgrade.cost from town stock (ryo from the coffers), then built by the town builders: war.town.upgradeWork
// builder work (s.warUpgrade = { left, total } while it runs; other projects wait meanwhile), at any tier. Limits may grow with the town hall tier (tierMax, Tim 2026-11-21).
// Plain functions of the town and the data, so the sim and the build bar (on the snapshot) give the same answers.

import { yardWater } from './shipyard.js';
const nice = t => (t || '').replace(/_/g, ' ');
const costText = cost => Object.entries(cost || {}).filter(([, v]) => v).map(([r, v]) => `${v} ${r}`).join(', ');

export const isMilitary = (type, data) => !!data?.buildings?.[type]?.military;
export const militaryTypes = data => Object.keys(data?.buildings || {}).filter(k => data.buildings[k]?.military);
export const warHallDone = s => !!s?.warHall;
// how many of a military type a town (kind 'town', tier = townMilitaryTier: 1, 2 after the town hall war upgrade) or a war camp (kind 'camp', camp hall tier 1-2) may have:
// war.buildings[type].maxByTier[kind][tier - 1] (past the end: the last), else .max (Tim 2026-11-21: supply tents unlock per tier, no early rush)
export const townMilitaryTier = s => warHallDone(s) ? 2 : 1;   // Tim 2026-11-21: the war upgrade, like the camp hall upgrade
export function tierMax(def, kind, tier) {
  const list = def?.maxByTier?.[kind];
  return Array.isArray(list) && list.length ? list[Math.min(Math.max(1, tier || 1), list.length) - 1] : def?.max;
}

// the faction of a town's owner ('yakuza' | 'kuroda' | 'shinobi'), or null when unknown
const factionOf = (s, state) => state?.clans?.[s?.owner]?.faction ?? null;

// types this town's clan may build: a building with clan: '<faction>' is only for that clan (kennel, hidden dojo)
// world (the island, optional): a shore building (shipyard) is offered only to a town with water ships can sail at its harbour (ships S3)
export function militaryFor(s, data, state, world = null) {
  const f = factionOf(s, state);
  return militaryTypes(data).filter(t => { const c = data.war?.buildings?.[t]?.clan; return (!c || !f || c === f) && (!data.buildings[t]?.shore || !world || yardWater(world, s, data.war?.buildings?.[t])); });
}

// how many of a type the town has or has under way (ruins count, like a camp's sites and ruins)
export function militaryCount(s, type) {
  return (s?.buildings || []).filter(b => b.type === type).length + (s?.projects || []).filter(p => p.type === type && !p.replaces).length;
}

// what a military type still needs: ['the town hall war upgrade', 'a built barracks'], [] when nothing
export function militaryNeeds(s, type, data) {
  const out = [];
  for (const n of data.war?.buildings?.[type]?.needs || []) {
    if (n === 'upgrade') { if (!warHallDone(s)) out.push('the town hall war upgrade'); }
    else if (n === 'tier2') { if ((s?.tier || 1) < 2) out.push('a town hall at tier 2'); }   // Tim 2026-11-15: kennel and hidden dojo
    else if (!(s?.buildings || []).some(b => b.type === n && b.stage === 'built')) out.push(`a built ${nice(n)}`);
  }
  return out;
}

// why a military building cannot be placed in this town, or null (also null for any other kind)
export function militaryWhy(s, type, data, state) {
  if (!isMilitary(type, data)) return null;
  const def = data.war?.buildings?.[type] || {}, f = factionOf(s, state);
  if (def.clan && f && def.clan !== f) return `Your clan does not build the ${nice(type)}`;
  const need = militaryNeeds(s, type, data);
  if (need.length) return `Needs ${need.join(' and ')}`;
  const max = tierMax(def, 'town', townMilitaryTier(s));
  if (max && militaryCount(s, type) >= max) return def.maxByTier?.town && max < (def.max ?? Infinity) ? `A town has at most ${max} ${nice(type)} before the town hall war upgrade` : `A town has at most ${max} ${nice(type)}`;
  return null;
}

// ---- the town hall war upgrade ----------------------------------------------------------------
const warsOn = (s, state) => Object.values(state?.frontier?.wars?.list || {}).filter(w => w.town === s.id);
// { ok, reason, cost, ticks, work } for the hall menu and the command. work = builder work it needs (war.town.upgradeWork: each
// economy tick the town's builders add their number, like a construction project); ticks = economy ticks with a full builder crew
export function warUpgradeCheck(s, data, state) {
  const U = data.war?.hallUpgrade, work = data.war?.town?.upgradeWork ?? 480, ticks = Math.ceil(work / Math.max(1, data.rates?.maxBuilders || 4));
  const cost = { ...(U?.cost || {}) };
  if (!U) return { ok: false, reason: 'no war upgrade', cost, ticks, work };
  if (warHallDone(s)) return { ok: false, reason: 'The town hall war upgrade is done', cost, ticks, work };
  if (s.warUpgrade) return { ok: false, reason: 'The war upgrade is already under way', cost, ticks, work };
  const hall = (s.buildings || []).find(b => b.type === 'town_hall');
  if (!hall || hall.stage !== 'built') return { ok: false, reason: hall?.stage === 'ruined' ? 'The town hall is a ruin: send workers to repair it' : 'Needs a town hall', cost, ticks, work };
  const short = Object.entries(cost).find(([r, v]) => (s.stock?.[r] ?? 0) < v);
  if (short) return { ok: false, reason: `Needs ${costText(cost)} (the town has ${Math.floor(s.stock?.[short[0]] ?? 0)} ${short[0]})`, cost, ticks, work };
  return { ok: true, reason: '', cost, ticks, work, atWar: warsOn(s, state).length > 0 };
}
// pay now; then the town builders build it (construction.js holds other projects while it is under way)
export function startWarUpgrade(s, data, world, state) {
  const r = warUpgradeCheck(s, data, state);
  if (!r.ok) return r;
  for (const [res, v] of Object.entries(r.cost)) world.change(s.id, res, -v, 'war upgrade');
  s.warUpgrade = { left: r.work, total: r.work };
  return r;
}
// true while the town builders work on the war upgrade (paused while the hall is a ruin, so they can repair it)
export const warUpgradeBuilding = s => !!s.warUpgrade && !(s.buildings || []).some(b => b.type === 'town_hall' && b.stage === 'ruined');
// seconds left at the current builders (a full crew when none are on it yet)
export const warUpgradeSeconds = (s, data) => s.warUpgrade ? Math.ceil(Math.max(0, s.warUpgrade.left) / Math.max(1, s.builders || data?.rates?.maxBuilders || 4)) : 0;
// one economy tick: the town's builders (economy.js assignJobs) add their number; true on the tick it is done
export function warUpgradeTick(s) {
  const u = s.warUpgrade;
  if (!u || !warUpgradeBuilding(s)) return false;
  if (u.left > 0) { if (!s.builders) return false; u.left = Math.max(0, u.left - s.builders); }
  if (u.left > 0) return false;
  delete s.warUpgrade; s.warHall = true; return true;
}
