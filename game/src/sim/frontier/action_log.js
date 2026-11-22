// The general's and the governor's logs (Tim 2026-11-22): what each did lately in a town, and the general's war camp
// actions, newest first, for the General tab, the Governor tab and the war camp's General tab (src/action_log_ui.js).
// holder.log = { general: [entry], governor: [entry] } on a settlement, or on a war record for its camp. entry = { tick,
// day, night, k, x, d, n }: k = kind (build | land | save | bad | war | work), x = the line, d = the detail for the
// hover box, n = how many times (when more than one). At most data.logs.keep entries each (30, three pages of ten); a
// line written again within data.logs.sameSeconds of its last time moves to the top and counts up. Saved with the game (settlement and war records).
export function logAct(state, data, holder, who, k, x, d = '') {
  if (!holder || !x) return;
  const L = (holder.log ||= {}), list = (L[who] ||= []), tick = state?.tick ?? 0;
  const same = (data?.logs?.sameSeconds ?? 120) * 20, day = state?.clock?.day ?? state?.season?.day ?? 1, night = !!state?.night;
  // the same line again soon (also between other lines): it moves to the top with a count instead of a new line
  const i = list.findIndex(e => e.x === x && tick - e.tick < same);
  if (i >= 0) { const e = list.splice(i, 1)[0]; Object.assign(e, { tick, day, night, n: (e.n || 1) + 1 }, d ? { d } : {}); list.unshift(e); return; }
  list.unshift({ tick, day, night, k, x, ...(d ? { d } : {}) });
  const keep = data?.logs?.keep ?? 30; if (list.length > keep) list.length = keep;
}
const nice = t => String(t || '').replace(/_/g, ' ');
// "a barracks", "an armory", "supply tents" (a name that reads as plural takes no article)
export const aName = t => { const n = nice(t); return /[^s]s$/.test(n) && !/barracks$/.test(n) ? n : (/^[aeiou]/.test(n) ? 'an ' : 'a ') + n; };
const a = aName;
// a general's command that was carried out (frontier.js): its line, or null for ones not logged (training, orders)
export function generalLine(c, s, w) {
  const of = id => (s?.buildings || w?.camp?.buildings || []).find(b => b.id === id)?.type;
  switch (c.action) {
    case 'place': return ['build', `Placed ${a(c.kind)}`, `Paid from the safety fund in peace, from town stock in a war. Town builders put it up.`];
    case 'warUpgradeHall': return ['build', 'Started the town hall war upgrade', 'It opens the foundry and armory, cavalry at the stable, and more supply tents.'];
    case 'rebuild': return ['war', `Rebuilding the ruined ${nice(of(c.building) || 'building')}`, 'In a war he rebuilds ruins of his list, one at a time, from town stock.'];
    case 'campPlace': return ['build', `Placed ${a(c.kind)} at the war camp`, 'Paid from the camp\'s war chest and stock.'];
    case 'campUpgrade': return ['build', 'Upgraded the camp hall', 'It unlocks more supply tents and the camp\'s second tier buildings.'];
    case 'campLine': return ['land', 'Put up a palisade line', 'The camp digs in once the fight drags on or a push is beaten back.'];
    case 'campRebuild': return ['war', `Rebuilding the ruined ${nice(of(c.building) || 'building')}`, 'Paid from the camp\'s war chest and stock.'];
    default: return null;
  }
}
