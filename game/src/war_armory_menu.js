// 8e-9 (mock G, Tim 2026-11-16): the armory's menu, at the war camp and in a defending town. Four groups by row
// (melee, ranged, mounted, siege), weapons and armor cards with level pips, the next level's cost as chips and a
// Buy button; the one in the work shows its countdown. Reads war.armory.view (sim/frontier/war_armory.js).
// armoryHtml({ game, war, owner, artUrl }) -> html; armorySig(game, war, owner) -> string; click: data-armup="<group>:<track>"
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap1 = s => s[0].toUpperCase() + s.slice(1);
const ART = { melee: 'barracks', ranged: 'rifle_range', mounted: 'stable', siege: 'foundry' };
const nice = u => u.replace(/_/g, ' ');

export const ARMORY_CSS = sel => `
${sel} .arow{display:grid;grid-template-columns:52px minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:stretch;padding:6px 0;border-bottom:1px solid #ffffff12}
${sel} .arow .athumb{border:1px solid #ffffff22;border-radius:6px;background:#0d0f12;display:grid;place-items:center;cursor:help}
${sel} .arow .athumb img{max-width:48px;max-height:44px}
${sel} .acard{min-width:0;border:1px solid #ffffff1c;border-radius:6px;padding:6px 8px;background:linear-gradient(#ffffff08,#0000)}
${sel} .acard .at{display:flex;justify-content:space-between;align-items:center;font-size:14px;color:#f3e3bd;font-weight:600}
${sel} .acard .pips3{display:flex;gap:3px}${sel} .acard .pips3 i{width:16px;height:5px;border-radius:2px;background:#3a3832}${sel} .acard .pips3 i.on{background:#e0b85a}
${sel} .acard .ab{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px 6px;margin-top:5px;font-size:12px;color:#a9a294}
${sel} .acard .ab .chips{display:flex;gap:3px;align-items:center;margin-left:auto}
${sel} .acard .ab .chip{font-size:11px;padding:1px 5px}
${sel} .acard .ab button{padding:3px 9px}
${sel} .acard .prog{margin-top:4px}`;

export function armorySig(game, w, owner) {
  const v = game.frontier?.war?.armory?.view?.(w.id, owner);
  return JSON.stringify(v ? [v.has, v.work, v.groups.map(g => g.tracks.map(t => [t.level, t.why]))] : null);
}

export function armoryHtml({ game, war: w, owner, artUrl = () => '', chip = (r, n) => `${n} ${r}` }) {
  const v = game.frontier?.war?.armory?.view?.(w.id, owner);
  if (!v) return '<div class="small" style="padding:8px 0">Armory upgrades are not ready yet.</div>';
  const pct = Math.round(v.step * 100);
  let h = `<div class="sec"><span>Troop upgrades, this war only</span><b title="Upgrades count for your troops of that group, those already out too. The hero and crew are never changed. They end with the war.">Hero and crew not affected</b></div>`;
  if (!v.has) h += '<div class="small" style="padding:6px 0;color:#ee8a7c">Needs a built armory.</div>';
  for (const g of v.groups) {
    const card = t => {
      const lvl = t.level, work = v.work && v.work.group === g.group && v.work.track === t.track, max = lvl >= v.max;
      const what = t.track === 'weapons' ? 'damage' : 'defence', now = lvl ? `+${lvl * pct}% ${what}` : '';
      const pips = `<span class="pips3">${Array.from({ length: v.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`;
      let foot;
      if (work) foot = `<span>Level ${lvl + 1}, ${v.work.seconds} s left</span>`;
      else if (max) foot = `<span>${now}, maxed</span>`;
      else foot = `<span>${now ? `${now}, next +${(lvl + 1) * pct}%` : `Next +${pct}% ${what}`}</span><span class="chips">${['ryo', 'timber', 'stone'].filter(r => t.cost?.[r]).map(r => chip(r, t.cost[r])).join('')}<button class="go" data-armup="${esc(`${g.group}:${t.track}`)}"${t.why ? ` disabled title="${esc(t.why)}"` : ` title="${esc(`${cap1(g.group)} ${t.track} level ${lvl + 1}: ${t.cost.ryo || 0} ryo from the war chest${t.cost.timber ? `, ${t.cost.timber} timber` : ''}${t.cost.stone ? `, ${t.cost.stone} stone` : ''}. ${v.seconds} s at the armory, one at a time.`)}"`}>Buy</button></span>`;
      return `<div class="acard"><div class="at"><span>${esc(cap1(g.group))} ${t.track}</span>${pips}</div><div class="ab">${foot}</div>${work ? `<div class="prog"><i style="width:${Math.round(100 * (1 - v.work.seconds / Math.max(1, v.seconds)))}%"></i></div>` : ''}</div>`;
    };
    h += `<div class="arow"><div class="athumb" title="${esc(`${cap1(g.group)}: ${g.units.map(nice).join(', ')}`)}"><img src="${esc(artUrl(ART[g.group]))}" alt=""></div>${g.tracks.map(card).join('')}</div>`;
  }
  h += '<div class="small" style="margin-top:6px">Hover a group to see its units. Weapons: more damage. Armor: less damage taken.</div>';
  return h;
}
