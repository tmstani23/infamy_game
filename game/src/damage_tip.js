// Damage taken hover (2026-11-25): hover the health bar of a ship, building, wall or gate card and a small panel
// under the card shows how much of each weapon's damage it takes, read live from the war tables
// (war.ships.hullDamage for hulls, war.structures.damage and war.structures.stone for buildings), so it can never drift.
// A bar opts in with data-dmg="ship" | "wood" | "stone". Presentation only.

const ICON = { siege: 'bow_cannon', melee: 'attack', ranged: 'hamstring', bomb: 'firebomb', gatling: 'gatling' };
const NAME = { siege: 'Cannons', melee: 'Swords and hero', ranged: 'Arrows and rifles', bomb: 'Fire-bombs', gatling: 'Gatling' };

// rows for a target kind: [{ k, name, icon, pct }] highest first (ties keep ORDER)
export function damageRows(frontierData, kind) {
  const W = frontierData?.war || {}, ORDER = ['siege', 'melee', 'ranged', 'bomb', 'gatling'];
  let t, names = { ...NAME };
  if (kind === 'ship') t = W.ships?.hullDamage || {};
  else {
    const D = W.structures?.damage || {}, stone = kind === 'stone' ? W.structures?.stone?.bomb ?? 1 : 1;
    t = { siege: D.siege, melee: D.melee, ranged: D.ranged, bomb: (D.bomb ?? 1) * stone };
    names.ranged = 'Arrows, rifles and Gatling';   // buildings: a Gatling hit counts as ranged
  }
  return ORDER.filter(k => typeof t[k] === 'number').map((k, i) => ({ k, i, name: names[k], icon: ICON[k], pct: Math.round(t[k] * 100) }))
    .sort((a, b) => b.pct - a.pct || a.i - b.i);
}

export function damageTipHtml(rows) {
  const row = r => `<div class="dt-r${r.pct > 100 ? ' hi' : ''}"><div class="dt-t"><img src="../assets/ui/abilities/${r.icon}.png" alt="" draggable="false"></div><span>${r.name}</span><b>${r.pct}%</b></div>`;
  const group = (label, list) => list.length ? `<div class="dt-g">${label}</div>${list.map(row).join('')}` : '';
  return `<div class="dt-cap">Damage it takes</div><div class="dt-note">100% = normal</div>`
    + group('Takes extra from', rows.filter(r => r.pct > 100)) + group('Takes normal from', rows.filter(r => r.pct === 100)) + group('Takes less from', rows.filter(r => r.pct < 100));
}

const CSS = `
#dmgtip{position:fixed;z-index:70;width:236px;box-sizing:content-box;padding:6px 12px 8px;pointer-events:none;font-family:var(--ln-font,Georgia,serif);color:var(--ln-text,#ecdcbc);
 border:11px solid transparent;border-image:url(art/ui/lantern_frame.png) 36 round;background-origin:border-box;background-clip:padding-box;background-color:#1b120d;
 background-image:radial-gradient(ellipse 80% 40% at 30% 0%,rgba(255,150,60,.12),transparent 70%),linear-gradient(rgba(20,13,9,.45),rgba(20,13,9,.45));box-shadow:0 14px 34px rgba(0,0,0,.8)}
#dmgtip[hidden]{display:none}
#dmgtip .dt-cap{font:800 13px/1 var(--ln-font,Georgia,serif);color:#f2e2c0;margin:0 0 4px 1px}
#dmgtip .dt-note{font:500 12px/1 var(--ln-font,Georgia,serif);color:#d9c39a;margin:0 0 2px 1px}
#dmgtip .dt-g{font:800 12px/1 var(--ln-font,Georgia,serif);color:#e0b46a;margin:9px 0 3px 1px}
#dmgtip .dt-r{display:flex;align-items:center;gap:10px;padding:3px 0}
#dmgtip .dt-t{--c:#e2b96e;position:relative;flex:none;width:28px;height:28px;overflow:hidden;background:#0a0604;box-shadow:0 0 0 1px #1a0f08,0 0 0 2px #6d6a5e,0 0 0 3px #0a0604}
#dmgtip .dt-t img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.75) brightness(1.25) contrast(1.05)}
#dmgtip .dt-r span{flex:1;display:flex;align-items:baseline;gap:6px;font:500 13px var(--ln-font,Georgia,serif);color:#e2d1ad}
#dmgtip .dt-r span::after{content:'';flex:1;border-bottom:2px dotted rgba(201,160,78,.35);transform:translateY(-3px)}
#dmgtip .dt-r b{font:800 13.5px var(--ln-font,Georgia,serif);color:#d8c49a;min-width:40px;text-align:right}
#dmgtip .dt-r.hi{padding:5px 8px;margin:0 -8px;background:radial-gradient(ellipse 60% 100% at 12% 50%,rgba(255,140,60,.22),transparent 80%)}
#dmgtip .dt-r.hi span{font-weight:800;font-size:14.5px;color:#ffe2b8}
#dmgtip .dt-r.hi b{font-size:16px;color:#ffb070;text-shadow:0 0 10px rgba(255,120,50,.55)}
#dmgtip .dt-r.hi .dt-t{box-shadow:0 0 0 1px #1a0f08,0 0 0 2px #d0603a,0 0 0 3px #0a0604,0 0 10px rgba(255,110,50,.45)}
#dmgtip .dt-r.hi .dt-t img{filter:brightness(1.25)}`;

export function installDamageTip(frontierData, doc = document) {
  const style = doc.createElement('style'); style.textContent = CSS; doc.head.append(style);
  const tip = Object.assign(doc.createElement('div'), { id: 'dmgtip', hidden: true }); doc.body.append(tip);
  let on = null;
  function show(bar) {
    const kind = bar.dataset.dmg; if (!kind) return hide();
    on = bar; tip.innerHTML = damageTipHtml(damageRows(frontierData, kind)); tip.hidden = false;
    // under the card the bar sits in (above it when there is no room), kept inside the window
    const card = bar.closest('#structcard, .uf, .card') || bar, r = card.getBoundingClientRect(), t = tip.getBoundingClientRect();
    const W = doc.defaultView?.innerWidth || 1920, H = doc.defaultView?.innerHeight || 1080;
    let x = Math.min(Math.max(4, r.right - t.width), W - t.width - 4), y = r.bottom + 4;
    if (y + t.height > H - 4) y = Math.max(4, r.top - t.height - 4);
    tip.style.left = `${Math.round(x)}px`; tip.style.top = `${Math.round(y)}px`;
  }
  function hide() { on = null; tip.hidden = true; }
  doc.addEventListener('mouseover', e => { const bar = e.target?.closest?.('[data-dmg]'); if (bar && bar !== on) show(bar); else if (!bar && on) hide(); });
  doc.addEventListener('mousedown', () => { if (on) hide(); }, true);
  return { show, hide, el: tip };
}

// the kind a structure takes damage as: stone for the town's stone types (not camps), wood otherwise
export const structureDmgKind = (frontierData, st) => !st?.camp && (frontierData?.war?.structures?.stone?.types || []).includes(st?.type) ? 'stone' : 'wood';
