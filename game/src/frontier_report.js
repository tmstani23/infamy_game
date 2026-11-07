import { residents, workerCount } from './sim/frontier/people.js';
// Dev-only town readout text (frontier plan F2.4b). Pure: reads a frontier snapshot, writes nothing.
// F4 replaces this with the real town panel.
const fix = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString();

export function frontierReport(frontier) {
  if (!frontier) return 'frontier: off';
  const lines = [`frontier · economy tick ${frontier.econTick}`];
  for (const s of Object.values(frontier.settlements || {})) {
    if (s.capital || !s.stock) continue;   // rival towns arrive as name only (F4.2)
    const stock = Object.entries(s.stock).map(([r, v]) => `${r} ${fix(v)}`).join(' · ');
    const jobs = (s.buildings || []).reduce((n, b) => n + (b.stage === 'built' ? b.workers || 0 : 0), 0);
    lines.push(`${s.name} (${s.id}) owner ${s.owner ?? '-'} · pop ${s.pop}/${s.housing} · jobs ${jobs}${s.mood !== undefined ? ` · mood ${fix(s.mood, 0)}` : ''}`);
    lines.push(`  ${stock}`);
    const r = s.report || {};
    if (r.doing || r.next || r.waiting?.length) lines.push(`  ${r.doing || ''}${r.next ? ' → ' + r.next : ''}${r.waiting?.length ? ' · waiting: ' + r.waiting.join(', ') : ''}`);
  }
  return lines.join('\n');
}

// ---- F4.3: rows for the town panel. Pure: reads a settlement snapshot (and optionally the same
// town one refresh earlier, for the arrows), writes nothing, touches no DOM. ----
const name = s => String(s).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const RES = ['food', 'timber', 'stone', 'goods', 'ryo'];
// Tooltips only where a player cannot guess the meaning or needs it for a choice (Tim, 2026-11-02).
export const TIPS = {
  mood: 'How content the town is. Built from food, safety and taxes. Low for long and people start leaving.',
  food: 'Arrow shows whether food is going up or down since the last refresh. If it keeps falling, a farm is needed.',
  focus: 'What the governor builds first: Grow (farms, homes), Produce (workshops, camps), Trade (goods to sell), Fortify (defences).',
  tax: 'Ryo per person. Higher taxes bring more ryo but lower mood. Auto lets the governor pick.',
  initiative: 'Off: the governor only suggests, you approve. On: he builds suggestions within his budget by himself.',
  suggestions: 'Ideas from the governor. Nothing is built until you approve.',
  jobs: 'Workers in each building. Idle people have no job; free jobs have no worker.\nIdle townsfolk pay half tax; give them work (zones, buildings) to collect full tax.'
};
const dir = (now, then) => then === undefined || Math.abs(now - then) < 0.05 ? 'flat' : now > then ? 'up' : 'down';
// What a "Waiting for <resource>" chip can say: how full it is and how long it will take (frontier E5 polish, Tim 2026-11-04).
// Looks at the first authorized, unpaid project that is short of that resource; rate comes from the sim (report.rate, per second).
export function waitInfo(s, w) {
  const res = RES.find(r => r === w);
  const p = res && (s.projects || []).find(x => x.authorized && !x.paid && (x.cost?.[res] ?? 0) > (s.stock?.[res] ?? 0));
  if (!p) return s.report?.statusTips?.[w] ? {fill:0,tip:s.report.statusTips[w]} : null;
  const f = n => Math.round(n * 10) / 10;
  const need = p.cost[res], have = s.stock[res], short = need - have, rate = s.report?.rate?.[res] ?? 0;
  const eta = rate > 0.0001 ? `At +${rate.toFixed(2)} ${res} a second: about ${Math.ceil(short / rate)} s.` : `No ${res} is coming in right now.`;
  return { fill: Math.max(0, Math.min(1, have / need)), tip: `${name(p.type)} needs ${need} ${res}: ${f(have)} in stock, ${f(short)} short. ${eta}` };
}

export function reportRows(s, prev) {
  if (!s || !s.stock) return null;   // rival towns arrive as name only
  const f = n => Math.round(n * 10) / 10;
  const stock = RES.map(r => ({ key: r, label: name(r), value: f(s.stock[r] ?? 0), cap: s.storageCaps?.[r] ?? null, full: s.storageCaps?.[r] != null && (s.stock[r] ?? 0) >= s.storageCaps[r] - Math.max(1, s.storageCaps[r] * 0.01), arrow: dir(s.stock[r] ?? 0, prev?.stock?.[r]),
    delta: prev?.stock ? f((s.stock[r] ?? 0) - (prev.stock[r] ?? 0)) : 0, tip: r === 'food' ? s.report?.statusTips?.food || TIPS.food : undefined }));
  const byType = {};
  for (const b of s.buildings || []) if (b.stage === 'built' && b.workers) byType[b.type] = (byType[b.type] || 0) + b.workers;
  for(const [kind,zone] of Object.entries(s.zones || {}))if(zone.workers)byType[`${kind} zone`]=(byType[`${kind} zone`] || 0)+zone.workers;
  const jobs = Object.entries(byType).map(([t, n]) => ({ label: name(t), workers: n }));
  const r = s.report || {};
  const waiting = (r.waiting || []).map(w => `Waiting for ${w}`);
  const projects = (s.projects || []).map(p => {
    const cost = Object.entries(p.cost || {}).map(([k, n]) => `${n} ${k}`).join(', ');
    const status = p.paid ? `${Math.min(100, Math.round(100 * p.progress / Math.max(1, p.need)))}% built` : p.authorized ? 'Waiting for materials' : 'Needs your OK';
    return { id: p.id, label: name(p.type), status, cost, canAuthorize: !p.authorized && !p.paid, canCancel: true };
  });
  const suggestions = (s.suggestions || []).map((x, index) => ({ index, label: name(x.type), reason: x.reason }));
  return {
    id: s.id, title: s.name, owner: s.owner,
    mood: { value: Math.round(s.mood ?? 0), factors: s.moodFactors || {}, why: (r.moodWhy || []).map(w => ({ text: w.text, hint: w.hint, tip:w.tip || w.hint })), tip: TIPS.mood },
    stock,
    pop: { pop: residents(s), housing: s.housing, text: `${s.pop} townsfolk + ${workerCount(s)} workers / ${Math.floor(s.housing)} beds`, growth: r.growth?.text || '', goodsWait: (r.waiting || []).includes('goods for housing'), fill: s.housing ? Math.min(1, residents(s) / s.housing) : 0 },
    jobs, jobsTip: TIPS.jobs, idle: r.idle || 0, unfilled: r.unfilled || 0,
    jobsText: `Jobs ${jobs.reduce((n, j) => n + j.workers, 0)} filled · ${r.unfilled || 0} free · ${r.idle || 0} idle${r.idle ? ' (half tax)' : ''}`,
    doing: r.doing || '', next: r.next || '', waiting, waitingInfo: (r.waiting || []).map(w => waitInfo(s, w)),
    projects, suggestions, suggestionsTip: TIPS.suggestions,
    steer: { priority: s.priority, tax: s.taxLevel, taxLocked: !!s.taxLocked, autoBuild: !!s.autoBuild, tips: { focus: TIPS.focus, tax: TIPS.tax, initiative: TIPS.initiative } }
  };
}

// What the town's governor says, in his words, and what you can answer (F4.4). Pure.
export function governorSays(rows) {
  if (!rows) return null;
  const bits = [];
  if (rows.waiting.some(w => /food/i.test(w)) || rows.stock.find(r => r.key === 'food')?.arrow === 'down') bits.push(rows.idle >= 2 ? 'Food is thin. A farm would help, and we have idle hands.' : 'Food is thin, and everyone is already working.');
  if (rows.pop.pop >= rows.pop.housing) bits.push('We are out of room: more houses would let the town grow.');
  if (rows.mood.value < 55 && rows.mood.why[0]) bits.push(`The people are unhappy: ${rows.mood.why[0].text.toLowerCase()}. ${rows.mood.why[0].hint}.`);
  if (rows.suggestions.length) bits.push(`I have ${rows.suggestions.length === 1 ? 'a suggestion' : rows.suggestions.length + ' suggestions'} waiting for your word.`);
  if (!bits.length) bits.push(rows.doing ? rows.doing + '.' : 'All is quiet.');
  const st = rows.steer, choices = [];
  choices.push(st.autoBuild ? { id: 'ask', label: 'Ask me before building' } : { id: 'initiative', label: 'Take more initiative' });
  choices.push({ id: 'ease', label: 'Ease the taxes' }, { id: 'squeeze', label: 'Squeeze them harder' });
  if (st.taxLocked) choices.push({ id: 'autotax', label: 'Handle taxes yourself' });
  choices.push({ id: 'salute', label: 'Fire a salute' });
  choices.push({ id: 'close', label: 'Never mind' });
  return { who: 'Governor', text: bits.join(' '), choices };
}
// What each choice sends (next level up or down from the current tax level).
const LEVELS = ['low', 'normal', 'high'];
export function talkCommand(choice, rows) {
  const sid = rows.id;
  if (choice === 'initiative') return { action: 'setAutoBuild', settlement: sid, on: true };
  if (choice === 'ask') return { action: 'setAutoBuild', settlement: sid, on: false };
  if (choice === 'salute') return { action: 'salute', settlement: sid };
  if (choice === 'autotax') return { action: 'setTax', settlement: sid, level: 'auto' };
  const i = Math.max(0, LEVELS.indexOf(rows.steer.tax) < 0 ? 1 : LEVELS.indexOf(rows.steer.tax));
  if (choice === 'ease') return { action: 'setTax', settlement: sid, level: LEVELS[Math.max(0, i - 1)] };
  if (choice === 'squeeze') return { action: 'setTax', settlement: sid, level: LEVELS[Math.min(2, i + 1)] };
  return null;
}

// ---- F4.4b: one row per owned town for the overview window. Pure. `prev` = { [id]: settlement } from
// about a second ago (for trends). `alerts` = { [id]: ['road blocked', ...] } (F4.4c). ----
export function overviewRows(frontier, clan, prev = {}, alerts = {}) {
  if (!frontier) return [];
  const own = Object.values(frontier.settlements || {}).filter(s => s.owner === clan && !s.capital && s.stock);
  const order = frontier.townOrder || [];
  const rank = id => { const i = order.indexOf(id); return i < 0 ? 999 : i; };
  own.sort((a, b) => rank(a.id) - rank(b.id));
  return own.map((s, i) => {
    const rep = reportRows(s, prev[s.id]);
    const road = Object.values(frontier.roads || {}).find(r => r.from === s.id || r.to === s.id);
    const proj = rep.projects[0];
    return { id: s.id, rank: i + 1, name: s.name, pop: `${s.pop}/${s.housing}`, popNum: s.pop,
      mood: rep.mood.value, moodWhy: rep.mood.why[0]?.text || '',
      moodTip:rep.mood.why.map(w=>w.tip).join('\n') || TIPS.mood,foodTip:s.report?.statusTips?.food || TIPS.food,shortageTip:rep.waitingInfo[0]?.tip || '',
      food: rep.stock[0].arrow, foodValue: rep.stock[0].value,
      ryo: rep.stock[4].value, ryoArrow: rep.stock[4].arrow,
      shortage: rep.waiting[0] || '', project: proj ? `${proj.label} · ${proj.status}` : '',
      road: road ? road.state : 'none', garrison: '–',
      priority: s.priority, tax: s.taxLocked ? s.taxLevel : 'auto', alerts: alerts[s.id] || [],
      need: s.need?.level || 'ok', needScore: s.need?.score || 0, needWhy: (s.need?.why || []).map(w => w.text) };   // Tim 2026-11-06: sim/frontier/alerts.js townNeed
  });
}
export const SORTS = { name: (a, b) => a.name.localeCompare(b.name), pop: (a, b) => b.popNum - a.popNum, mood: (a, b) => a.mood - b.mood, ryo: (a, b) => b.ryo - a.ryo, rank: (a, b) => a.rank - b.rank, need: (a, b) => b.needScore - a.needScore || a.rank - b.rank };

// ---- F4.4d: the small card when you hover a town on the World map. Your towns get the full card; a
// rival town only what you have seen (name, owner, that you saw it). Pure. ----
export function hoverCard(town, { clan = 'player', clanName = id => id, roads = {} } = {}) {
  if (!town) return null;
  if (town.owner !== clan || !town.stock) {
    return { title: town.name, sub: town.owner ? `Held by ${clanName(town.owner)}` : 'No one holds it', lines: [], mine: false };
  }
  const rep = reportRows(town);
  const road = Object.values(roads).find(r => r.from === town.id || r.to === town.id);
  const lines = [['Pop', `${town.pop} / ${town.housing}`], ['Mood', `${rep.mood.value}${rep.mood.why[0] ? ' · ' + rep.mood.why[0].text : ''}`],
    ['Food', rep.stock[0].value + (rep.stock[0].arrow === 'down' ? ' ▼' : rep.stock[0].arrow === 'up' ? ' ▲' : '')],
    ['Building', rep.projects[0] ? `${rep.projects[0].label} · ${rep.projects[0].status}` : 'Nothing'], ['Road', road ? road.state : 'none']];
  if (rep.waiting.length) lines.push(['Short of', rep.waiting[0].replace('Waiting for ', '')]);
  return { title: town.name, sub: 'Yours · click to open', lines, mine: true };
}
