// Garrison slots (Tim 2026-11-25): every building troops can hold shows who is inside, one slot per place, in its
// menu (the town and war camp building menus) or its Building pane (houses). Right-click a unit's slot and that one
// walks out. A stockade marks which ranged units hold its firing slots (data buildings.stockade.garrison.firingSlots,
// the first by id, as sim/frontier/structures.js garrisonFire). Presentation only: leaving is the frontier 'garrison'
// command with the structure key, which the sim checks again.
import { healthBar } from './render/health.js';
import { portrait } from './portraits.js';
import { entityName } from './selection_panel.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const GARRISON_SLOTS_CSS = `
.gslots{display:grid;grid-template-columns:repeat(var(--gcols,8),var(--gsz,64px));gap:6px;margin-top:9px}
.gslots .gw{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0}
.gslots .gw .gn{max-width:var(--gsz,64px);font:12px/14px Georgia,serif;color:#e2d3ad;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gslots .gs{width:var(--gsz,64px);height:var(--gsz,64px);box-sizing:border-box;border-radius:3px;position:relative;overflow:hidden;cursor:context-menu;
  background:var(--gpic,none) center 14%/124% no-repeat,radial-gradient(ellipse at 50% 32%,#a88452 0,#5c4429 45%,#241a10 100%);border:2px solid #6b5636;box-shadow:inset 0 0 0 1px #000a,0 1px 0 #0008}
.gslots .gs:hover{border-color:#e9c886}
.gslots .gs:hover::after{content:'Out';position:absolute;left:0;right:0;top:0;padding:1px 0;font:600 10px/12px Georgia,serif;color:#f3e3bd;text-align:center;background:linear-gradient(#000b,#0000)}
.gslots .gs.e{background:radial-gradient(ellipse at 50% 45%,#16120d,#0c0a08);border:2px solid #2e261b;box-shadow:inset 0 2px 6px #000;cursor:default}
.gslots .gs.hero{border-color:#c99a46}
.gslots .gs .h{position:absolute;left:4px;right:4px;bottom:4px;height:6px;background:#0d0b09;box-shadow:0 0 0 1px #000,inset 0 1px 0 #0008}.gslots .gs .h i{display:block;height:100%;filter:saturate(.45) brightness(.72);box-shadow:inset 0 1px 0 #fff3}
.gslots .gs .ini{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 18px Georgia,serif;color:#a08c68}
.gslots .gs .fire{position:absolute;top:4px;right:4px;width:8px;height:8px;border-radius:50%;background:#e0b85a;box-shadow:0 0 0 1px #1a140c,0 0 4px #e0b85a99}
.gslots .gw.hero .gn{color:#e0b85a}
.gslots-foot{font-style:italic;display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px}`;

const unitOf = (units, t) => units?.types?.[t] || units?.[t] || null;
const ranged = (units, e) => { const u = unitOf(units, e.type); return !!(u?.projectile || u?.rifle); };

// who is inside a structure (sim/frontier/structures.js list entry), in a steady order
export function garrisonInside(game, st) {
  return Object.values(game.state.entities || {}).filter(e => !e.dead && !!e.garrison && !e.garrison.hall
    && (e.garrison.key === st.key || (st.b && !e.garrison.zone && e.garrison.town === st.town && e.garrison.building === st.b.id)))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
// the ranged units inside a stockade that hold its firing slots; null for any other building
export function firingSet(frontierData, units, type, mem) {
  const n = frontierData?.buildings?.stockade?.garrison?.firingSlots;
  if (type !== 'stockade' || !(n > 0)) return null;
  return new Set(mem.filter(e => ranged(units, e)).map(e => e.id).sort().slice(0, n));
}

// { html, sig }: the slots of one structure. perPage slots a page; cols per row. sig changes when anyone moves in or
// out, heals or is hit, so a panel redraws only then.
export function garrisonSlotsHtml({ game, heroId, catalog, units, frontierData, st, cap, page = 0, perPage = 16, cols = 8, size = 64, names = true, onPortrait = () => {} }) {
  const mem = garrisonInside(game, st), pages = Math.max(1, Math.ceil(cap / perPage)), pg = Math.min(page, pages - 1);
  const fire = firingSet(frontierData, units, st.type, mem);
  let out = '';
  for (let i = pg * perPage; i < Math.min(cap, (pg + 1) * perPage); i++) {
    const e = mem[i];
    if (!e) { out += `<div class="gw"><div class="gs e" title="Empty place"></div>${names ? '<span class="gn">&nbsp;</span>' : ''}</div>`; continue; }
    const { frac, color } = healthBar(e.hp, e.maxHp), url = catalog ? portrait(catalog, e.model, onPortrait) : null;
    const name = units ? entityName(units, e, e.civ || e.type) : e.type;
    const shoots = fire ? (fire.has(e.id) ? '. Shooting' : ranged(units, e) ? '. Waiting for a firing slot' : '. Melee, cannot fight from inside') : '';
    const tip = `${e.id === heroId ? 'Your hero, ' : ''}${name}, health ${Math.ceil(e.hp || 0)} of ${e.maxHp || 0}${shoots}. Right-click: send out`;
    out += `<div class="gw${e.id === heroId ? ' hero' : ''}"><div class="gs${e.id === heroId ? ' hero' : ''}" data-gout="${esc(e.id)}" style="${url ? `--gpic:url(${url})` : ''}" title="${esc(tip)}">${url ? '' : `<b class="ini">${esc(String(e.type || '?').charAt(0).toUpperCase())}</b>`}${fire?.has(e.id) ? '<span class="fire"></span>' : ''}<div class="h"><i style="width:${frac * 100}%;background:rgb(${color.map(c => Math.round(c * 255)).join(',')})"></i></div></div>${names ? `<span class="gn">${esc(e.id === heroId ? 'Hero' : name)}</span>` : ''}</div>`;
  }
  const label = `${mem.length} of ${cap}${fire ? `, ${fire.size} of ${frontierData.buildings.stockade.garrison.firingSlots} shooting` : ''}`;
  const pager = pages > 1 ? `<span><button data-gpage="-1"${pg ? '' : ' disabled'}>Prev</button> <button data-gpage="1"${pg < pages - 1 ? '' : ' disabled'}>Next</button></span>` : '';
  return {
    count: mem.length, page: pg, label,
    html: `<div class="gslots" style="--gcols:${cols};--gsz:${size}px">${out}</div><div class="gslots-foot"><span class="small">${pages > 1 ? `Page ${pg + 1} of ${pages}. ` : ''}Right-click a unit: send it out</span>${pager}</div>`,
    sig: [st.key, pg, cap, ...mem.map(e => `${e.id}:${Math.ceil(e.hp || 0)}:${fire?.has(e.id) ? 1 : 0}`)].join(','),
  };
}
// a right-click on a slot: that unit walks out. True when it was one.
export function garrisonSlotOut(ev, { heroId, st, send }) {
  if (ev.button !== 2) return false;
  const slot = ev.target.closest?.('[data-gout]'); if (!slot || !st) return false;
  ev.preventDefault(); ev.stopPropagation();
  send({ id: heroId, type: 'frontier', action: 'garrison', mode: 'leave', structure: st.key, units: [slot.dataset.gout] });
  return true;
}
