// The town hall upgrade block (Tim 2026-11-25, mock town_upgrade_reqs): one line per requirement with have / need,
// a bar, what is short and roughly how long at the current rate; the Upgrade button names what is still missing.
// Used by the town hall card (frontier_build_ui.js) and the town panel (frontier_panel.js). Presentation only:
// the rule is upgradeCheck in sim/frontier/tiers.js, the numbers here read the same fields it does.
import { tierOf, nextTier, upgradeCheck } from './sim/frontier/tiers.js';
import { msArt } from './menu_shell.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { timber: 'art/props/firewood.png', stone: 'art/props/sandstone_stones.png', goods: 'art/props/crates.png', food: 'art/props/sake_barrels.png', ryo: 'art/props/iron_chest.png', people: '../assets/sprites/portraits/stills/laborer.png' };
const ONCE = new Set(['build', 'train', 'upgrade', 'refund', 'market', 'test']);   // one-off spends, left out of the rate (as the governor does)
const fmt = n => Math.floor(n).toLocaleString('en-US');
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || '';

export function minutesText(min) {
  if (!(min > 0) || !Number.isFinite(min)) return '';
  if (min < 1) return 'under a minute more';
  if (min < 90) return `${Math.ceil(min)} min more`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${h} h ${m} min more`;
}
export function secondsText(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`;
}
// per-minute net rate of a resource from the Usage flows (s.flow), one-off spends left out
export function netPerMin(s, r) {
  return Object.entries(s.flow?.[r] || {}).filter(([why]) => !ONCE.has(why)).reduce((n, [, v]) => n + v, 0);
}

// the rows and state the block draws, kept apart from the HTML so a Node test can check the numbers
export function hallUpgradeRows(s, data, state = null) {
  const next = nextTier(s, data), up = next?.upgrade;
  if (!up) return null;
  const rows = Object.entries(up.cost || {}).map(([r, need]) => {
    const have = s.stock?.[r] ?? 0, ok = have >= need, rate = netPerMin(s, r);
    const note = ok ? '' : `${fmt(need - have)} short` + (rate > 0.01 ? `, ${minutesText((need - have) / rate)}` : ', not rising now');
    return { key: r, label: cap1(r), have, need, ok, note, tip: `${cap1(r)} in this town's stores. The upgrade uses ${fmt(need)}.` };
  });
  if (up.pop) {
    const folk = Math.floor(s.pop || 0), workers = (s.workers?.length || 0) + (s.workerTraining?.length || 0), have = folk + workers, beds = Math.floor(s.housing || 0), ok = have >= up.pop;
    const note = ok ? '' : `${fmt(up.pop - have)} short` + (beds < up.pop ? (have >= beds ? `. Beds are full at ${beds}, build housing` : `. Only ${beds} beds, build housing`) : '');
    rows.push({ key: 'people', label: 'People', have, need: up.pop, ok, note, tip: `${folk} townsfolk and ${workers} workers (in training too), ${beds} beds. People are not used up by the upgrade.` });
  }
  const war = Object.values(state?.frontier?.wars?.list || {}).some(w => w.town === s.id);
  const hall = (s.buildings || []).some(b => b.type === 'town_hall' && b.stage === 'built');
  const chk = upgradeCheck(s, data, state), secs = (data.cadenceTicks || 20) / 20;
  const now = tierOf(s, data), unlock = [];
  if (next.ring > (now?.ring || 0)) unlock.push(`build ring ${next.ring}`);
  if (next.workers > (now?.workers || 0)) unlock.push(`${next.workers} workers`);
  const more = [];
  for (const [k, name] of [['camps', 'camps'], ['storehouse', 'storehouses'], ['stockade', 'stockades']])
    if ((next.placed?.[k] || 0) > (now?.placed?.[k] || 0)) more.push(`${next.placed[k]} ${next.placed[k] === 1 ? name.replace(/ies$/, 'y').replace(/s$/, '') : name}`);
  return {
    name: next.name, rows, war, hall, ok: chk.ok,
    upgrading: s.tierUpgrade ? { left: s.tierUpgrade.left * secs, total: (s.tierUpgrade.total || up.ticks || 1) * secs } : null,
    seconds: (up.ticks || 1) * secs, unlock: [unlock.join(', '), more.join(', ')].filter(Boolean),
    cost: up.cost || {},
  };
}

// opts.act: the town panel's click attribute (data-act="upgrade"); the hall card uses data-upgrade
export function hallUpgradeHTML(s, data, state = null, opts = {}) {
  const m = hallUpgradeRows(s, data, state);
  if (!m) return '';
  const unlock = lead => m.unlock.length ? `<div class="tg-unlock"><span>${lead}</span>${m.unlock.map(t => esc(cap1(t))).join('<br>')}</div>` : '';
  if (m.upgrading) {
    const pct = Math.max(0, Math.min(100, Math.round(100 * (1 - m.upgrading.left / m.upgrading.total))));
    const art = data.townArt?._byTier?.town_hall?.[(s.tier || 1)];
    const src = art ? msArt(art) : '', img = src ? `<img src="${esc(src)}" alt="" onerror="this.remove()">` : '';
    return `<div class="tg"><div class="tg-head"><span>Raising the hall to ${esc(m.name)}</span></div><div class="tg-work"><div class="tg-wtop">${img}<div><div class="tg-time">${secondsText(m.upgrading.left)} left</div>`
      + `<div class="tg-note dim">of ${secondsText(m.upgrading.total)}, paid in full</div></div></div><div class="tg-bar big"><i style="width:${pct}%"></i></div></div>${unlock(`Then unlocks`)}</div>`;
  }
  const ready = m.rows.filter(r => r.ok).length, all = ready === m.rows.length;
  const rows = m.rows.map(r => {
    const pct = Math.min(100, Math.round(100 * r.have / Math.max(1, r.need)));
    return `<div class="tg-req${r.ok ? ' ok' : ''}" title="${esc(r.tip)}"><span class="tg-ic"><img src="${ICON[r.key] || ''}" alt="" onerror="this.remove()">${r.ok ? '<b class="tg-hanko"></b>' : ''}</span>`
      + `<div class="tg-mid"><div class="tg-line"><span class="tg-name">${esc(r.label)}</span><span class="tg-num"><b>${fmt(r.have)}</b> of ${fmt(r.need)}</span></div>`
      + `<div class="tg-bar"><i style="width:${pct}%"></i></div>${r.note ? `<div class="tg-note">${esc(r.note)}</div>` : ''}</div></div>`;
  }).join('');
  const missing = m.rows.filter(r => !r.ok).map(r => r.label.toLowerCase());
  const why = m.war ? 'Not while a war is on this town' : !m.hall ? 'Needs a finished town hall' : `Needs more ${list(missing)}`;
  const res = Object.keys(m.cost), same = new Set(Object.values(m.cost)).size === 1;
  const uses = same ? `Uses ${fmt(Object.values(m.cost)[0] || 0)} each of ${list(res)}` : `Uses ${list(Object.entries(m.cost).map(([r, v]) => `${fmt(v)} ${r}`))}`;
  const go = m.ok;
  return `<div class="tg${all && go ? ' ready' : ''}"><div class="tg-head"><span>${all && go ? 'Ready to raise the hall' : `Raise the hall to ${esc(m.name)}`}</span><em>${all ? '' : `${ready} of ${m.rows.length} ready`}</em></div>${rows}${unlock(`${m.name} unlocks`)}`
    + `<button ${opts.act ? `data-act="${esc(opts.act)}"` : `data-upgrade="${esc(s.id)}"`} class="ti-up tg-btn${go ? ' ti-go' : ' no'}" title="${esc(go ? `Pays now and the new hall stands after ${secondsText(m.seconds)}.` : why)}">Upgrade to ${esc(m.name)}<small>${esc(go ? uses : why)}</small></button></div>`;
}
