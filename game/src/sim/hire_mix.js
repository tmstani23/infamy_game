// Hiring mix (Tim 2026-11-10), shared by the city captain (sim/lieutenant.js) and the rival bosses (sim/bot.js,
// sim/ninja_bot.js): hire the clan's real unit it has fewest of (crew, hire queue, clinic and jail counted; cheapest
// first on a tie), so a clan cycles one of each. The basic units (thug, brute) are left out of the cycle and are
// only the fallback while money is tight. With no other unit to hire the basic units are the cycle.
export function hireMix(game, clan, basic = ['thug', 'brute']) {
  const T = game.settings.units.types, c = game.state.clans[clan];
  const list = Object.keys(T).map(k => [k, game.clans.hirePrice(clan, k)]).filter(([k, p]) => p !== null && !T[k].settler).sort((a, b) => a[1] - b[1]);
  const real = list.filter(([k]) => !basic.includes(k)), pool = real.length ? real : list, n = {};
  for (const k of [...game.clans.crewOf(clan).filter(u => !u.dead).map(u => u.type), ...(c?.queue || []).map(q => q.unit), ...(c?.clinic || []).map(p => p.unit), ...(c?.jail || []).map(p => p.unit)]) n[k] = (n[k] || 0) + 1;
  return { want: [...pool].sort((a, b) => (n[a[0]] || 0) - (n[b[0]] || 0) || a[1] - b[1])[0]?.[0] || null, fallback: list[0]?.[0] || null };
}
// a boss hiring in person: the wanted unit when the treasury covers it, else the cheapest
export function bossHire(game, clan, basic) {
  const m = hireMix(game, clan, basic), p = m.want && game.clans.hirePrice(clan, m.want);
  return m.want && p !== null && (game.state.clans[clan]?.ryo || 0) >= p ? m.want : m.fallback;
}
