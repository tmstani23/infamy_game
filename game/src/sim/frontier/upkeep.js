// Upkeep and goods needs (economy balance B5, Tim 2026-11-05). Called once per economy tick from the
// zone tick of a grid town. Pays what the stock allows (never below zero, through world.change) and
// returns how much of each bill was paid, so zones can turn short upkeep into lower health.
// All numbers: data/frontier.json "upkeep". Towns without it pay nothing.
import { workerCount } from './people.js';

export function payUpkeep(s, data, world) {
  const U = data.upkeep, out = { zone: {}, goods: 1 };
  s.goodsShort = false; s.wagesShort = false;
  if (!U || !s.grid) return out;
  const g = s.grid, kinds = data.zones?.kinds || {}, byChar = {};
  for (const [name, k] of Object.entries(kinds)) byChar[k.char] = name;
  const levels = {}, stages = [];
  for (let i = 0; i < g.zone.length; i++) {
    const name = byChar[g.zone[i]], st = Number(g.stage[i]) || 0;
    if (!name || st < 1) continue;
    levels[name] = (levels[name] || 0) + st;
    if (kinds[name].housing) stages.push(st);   // goods are asked by kinds that house people
  }
  const total = Object.values(levels).reduce((a, b) => a + b, 0);
  const share = total > 0 ? Math.max(0, total - (U.freeLevels || 0)) / total : 0;
  // bills by resource, remembering who asked for what
  const bills = [], add = (who, rates, n) => { for (const [r, v] of Object.entries(rates || {})) if (v * n > 0) bills.push({ who, r, need: v * n }); };
  for (const [name, n] of Object.entries(levels)) add(`zone:${name}`, U.zones?.[name], n * share);
  for (const b of s.buildings || []) if (b.stage === 'built') add('buildings', U.buildings?.[b.type], 1);
  for (const [ch, rates] of Object.entries(U.lines || {})) { let n = 0; for (let i = 0; i < g.use.length; i++) if (g.use[i] === ch) n++; add('lines', rates, n); }
  add('wages', U.workerWage, workerCount(s));
  const goodsNeed = stages.reduce((sum, st) => sum + (U.goodsByStage?.[st - 1] || 0), 0);
  if (goodsNeed > 0) bills.push({ who: 'goods', r: 'goods', need: goodsNeed });
  // pay each resource in one go; every bill on it gets the same paid share
  const need = {}, frac = {};
  for (const b of bills) need[b.r] = (need[b.r] || 0) + b.need;
  for (const [r, n] of Object.entries(need)) frac[r] = n > 0 ? Math.min(Math.max(0, s.stock[r] ?? 0), n) / n : 1;
  // each bill pays its share under its own reason ('upkeep:zone:farm', 'upkeep:wages', ...) for the Usage page
  for (const b of bills) { const pay = b.need * frac[b.r]; if (pay > 0) world.change(s.id, b.r, -Math.min(pay, s.stock[b.r]), `upkeep:${b.who}`); }
  s.upkeepBill = need;   // per economy tick, for the town panel
  s.upkeepPaid = frac;
  for (const b of bills) {
    if (b.who.startsWith('zone:')) { const z = b.who.slice(5); out.zone[z] = Math.min(out.zone[z] ?? 1, frac[b.r]); }
    if (b.who === 'wages' && frac[b.r] < 1) s.wagesShort = true;
    if (b.who === 'goods') { out.goods = frac[b.r]; s.goodsShort = frac[b.r] < 1 - 1e-9; }
  }
  return out;
}
