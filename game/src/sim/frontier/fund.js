// Safety fund (Tim 2026-11-21, war_build/town_plan/town_plan_spec.md section 4). Each frontier town sets aside one
// percentage of its gains of timber, stone and ryo (the income reasons in data war.general.fund.from) into
// s.fund. The town's general spends only from it: his military quarter road, his list of military buildings and
// the hall war upgrade. Tim 2026-11-22: the share is always set aside, whatever he is saving for (no cap; before,
// the fund stopped at the cost of the rest of his list, so ryo stayed at 0 once the hall war upgrade was done).
// s.fund.cap is now only what the rest of his list at this tier needs (shown on the General tab). When the town is
// attacked the fund pours into its war chest (ryo) and its stock (timber, stone): war_defense.js. A share of 0
// hands the fund back to the town.
// The player types the percentage (Governor tab, command setFund); 0 = no military building. A player's new town
// starts at the value of his last one (frontier.fundPctLast), else fund.startPct. A bot town's percentage comes
// from its clan's hidden war strategy (fund.byStrategy). s.fund = { pct, timber, stone, ryo, cap, next, set? }.
import { storageCap } from './storage.js';
export const FUND_RES = ['timber', 'stone', 'ryo'];
const rules = data => data.war?.general?.fund || {};
const EPS = 1e-9;

export function fundOf(s, data, state) {
  if (!s || s.capital || s.castle || s.camp || !s.grid || s.founded === undefined) return null;
  if (!s.fund) {
    const last = state?.frontier?.fundPctLast;
    s.fund = { pct: Number.isFinite(last) ? last : (rules(data).startPct ?? 10), timber: 0, stone: 0, ryo: 0, cap: { timber: 0, stone: 0, ryo: 0 }, next: '' };
  }
  return s.fund;
}

// the share in use: a bot clan's towns by its strategy, a player's by what he typed
export function fundPct(s, data, state) {
  const f = fundOf(s, data, state); if (!f) return 0;
  const clan = state?.clans?.[s.owner];
  if (clan?.bot) { const R = rules(data), st = clan.warStrategy || data.war?.general?.default; return R.byStrategy?.[st] ?? R.startPct ?? 10; }
  if (!s.autoBuild) return 0;   // Initiative Off: his general builds nothing there, so nothing more is set aside (what is in the fund stays)
  return f.pct;
}

const isGain = (data, reason) => { const from = rules(data).from || []; return from.some(x => reason === x || (x.startsWith('*') && String(reason).endsWith(x.slice(1)))); };

// called by world.change on a gain (after the storage cap): returns the part that goes into the fund
export function takeShare(s, data, state, resource, delta, reason) {
  if (!(delta > 0) || !FUND_RES.includes(resource) || !isGain(data, reason)) return 0;
  const f = fundOf(s, data, state); if (!f) return 0;
  const pct = fundPct(s, data, state); if (!(pct > 0)) return 0;
  const take = delta * pct / 100;   // always (Tim 2026-11-22): not held to what his list needs
  f[resource] = (f[resource] || 0) + take;
  return take;
}

export const fundHas = (f, cost) => !!f && Object.entries(cost || {}).every(([r, v]) => !FUND_RES.includes(r) ? true : (f[r] || 0) + EPS >= v);

// moves `cost` out of the fund into the town's stock (where the build or upgrade then pays it from), reason 'fund'
export function fundPay(s, cost, world) {
  const f = s.fund;
  if (!fundHas(f, cost)) return false;
  for (const [r, v] of Object.entries(cost || {})) {
    if (!FUND_RES.includes(r) || !(v > 0)) continue;
    f[r] = Math.max(0, f[r] - v);
    world.fundIn(s.id, r, v);   // straight in, past the storage cap: it is spent on the build at once (world.change would cut it)
  }
  return true;
}
// a fundPay whose build did not go ahead: the stock gives it back to the fund
export function fundRefund(s, cost, world) {
  for (const [r, v] of Object.entries(cost || {})) {
    if (!FUND_RES.includes(r) || !(v > 0)) continue;
    const back = Math.min(v, s.stock[r] || 0);
    if (back > 0) { world.change(s.id, r, -back, 'fund'); s.fund[r] = (s.fund[r] || 0) + back; }
  }
}

// everything in the fund back to the town (war chest first for ryo when w is given): returns what moved
// data given: only what the town's store has room for moves, the rest waits in the fund (2026-11-21: stock handed
// back to a full store was lost as overflow)
const roomFor = (s, data, r, v) => { if (!data) return v; const cap = storageCap(s, data, r); return Number.isFinite(cap) ? Math.max(0, Math.min(v, Math.floor(cap - (s.stock[r] || 0)))) : v; };
export function fundEmpty(s, world, toChest = null, data = null) {
  const f = s.fund; if (!f) return null;
  const out = {};
  for (const r of FUND_RES) {
    const all = Math.floor(f[r] || 0), v = r === 'ryo' && toChest ? all : roomFor(s, data, r, all); if (v <= 0) continue;
    f[r] -= v; out[r] = v;
    if (r === 'ryo' && toChest) toChest(v); else world.change(s.id, r, v, 'fund');
  }
  return out;
}

export function setFundPct(s, data, state, pct) {
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return 'the fund share is a whole number from 0 to 100';
  const f = fundOf(s, data, state); if (!f) return 'this town has no safety fund';
  f.pct = pct; f.set = true;
  if (state?.frontier) state.frontier.fundPctLast = pct;
  return '';
}

// The general's look (war_general_brain.js prepare): cap = what is left of his list at this tier plus his plot road
// (shown as what he still needs; the fund is not held to it). next = what he is saving for. back: the share is 0,
// so everything in the fund goes back to the town (as far as its stores have room).
export function setFundCap(s, world, cap, next, data = null, back = false) {
  const f = s.fund; if (!f) return;
  f.cap = { timber: 0, stone: 0, ryo: 0, ...cap }; f.next = next || '';
  if (back) for (const r of FUND_RES) { const over = roomFor(s, data, r, Math.floor(f[r] || 0)); if (over > 0) { f[r] -= over; world.change(s.id, r, over, 'fund'); } }
}
