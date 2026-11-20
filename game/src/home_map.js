// Choosing your home (Z7, Tim 2026-11-20): the old surveyor's island map (surveyor_talk.js) with the six zones, the
// city and the five castle sites; click a site or its name below. A site with a castle on it already (a rival's,
// when the rivals chose first) is greyed and cannot be picked. The rivals take two of the others, hidden.
// homeField({ world, zones, initial, held = [], random = false }) -> { html, mount(root, onChange) }
//   zones: data/campaign_zones.json (or a promise of it); held: zone ids already taken
import { worldTerrainCache } from './world_map.js';
import { drawZoneGround, zoneMapState } from './zone_map.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const GOLD = '#e6c27a';
const CSS = `<style>
.home-map{border:0;margin:0;padding:0;min-width:0}.home-map[hidden]{display:none}
.home-map .hm-map{border:1px solid rgba(222,200,163,.22);border-radius:3px;overflow:hidden;line-height:0}.home-map canvas{width:100%;height:auto}
.home-map .hm-sites{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:9px}
.home-map .hm-choice{display:block;position:relative;cursor:pointer}.home-map .hm-choice input{position:absolute;opacity:0;width:1px;height:1px}
.home-map .hm-choice span{display:block;text-align:center;padding:7px 6px;font-size:13px;border:1px solid rgba(222,200,163,.2);border-radius:3px;background:rgba(10,16,23,.8);color:#b1b4b4}
.home-map .hm-choice:hover span{border-color:#8f7c59}.home-map .hm-choice input:checked+span{color:#f0d3a0;border-color:#ae8c52;background:rgba(79,59,31,.38)}
.home-map .hm-choice input:disabled+span{opacity:.4;cursor:default}
.home-map .hm-note{margin:8px 2px 0;min-height:18px;color:#a3a6a4;font-size:12px;line-height:1.45}
</style>`;


// the five sites and what each one borders, in the order of the zones file
export function homeSites(rules) {
  const zones = rules?.zones || [], name = id => zones.find(z => z.id === id)?.name || id;
  return zones.filter(z => z.castle && Number.isFinite(z.castle.x)).map(z => ({ id: z.id, name: z.name, x: z.castle.x, z: z.castle.z, touches: (z.touches || []).map(name) }));
}
const list = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
export function homeText(sites, id) {
  if (id === 'random') return 'A site is rolled when the game starts. Your rivals take two of the others.';
  const s = sites.find(x => x.id === id); if (!s) return '';
  return `${s.name} borders ${list(s.touches)}.`;
}

export function homeField({ world, zones, initial = 'east_plains', held = [], random = false }) {
  const html = CSS + `<fieldset class="home-map" hidden>
    <div class="hm-map"><canvas width="520" height="298" aria-label="Island map with the five castle sites"></canvas></div>
    <div class="hm-sites"></div><p class="hm-note" aria-live="polite"></p></fieldset>`;
  const taken = id => held.includes(id);
  function mount(root, onChange = () => {}) {
    const box = root.querySelector('.home-map'), cv = box.querySelector('canvas'), row = box.querySelector('.hm-sites'), note = box.querySelector('.hm-note');
    let rules = null, sites = [], pick = initial, hover = null, color = GOLD;
    // drawn in CSS pixels at the size it is shown (the marks and names keep their size in a narrow panel)
    let dpr = 1;
    const fit = () => { const r = cv.getBoundingClientRect(); if (!r.width) return; dpr = globalThis.devicePixelRatio || 1;
      const w = Math.round(r.width * dpr), h = Math.round(w * world.size.h / world.size.w); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } };
    const view = () => { const k = cv.width / dpr / world.size.w; return { k, p: (x, z) => ({ px: x * k, py: z * k }) }; };
    function draw() {
      if (!world?.terrain) return;
      fit();
      const c = cv.getContext('2d'), { p } = view(), W = cv.width / dpr, H = cv.height / dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#0d1824'; c.fillRect(0, 0, W, H);
      c.save(); c.filter = 'saturate(.7) brightness(.62)'; c.drawImage(worldTerrainCache(world), 0, 0, W, H); c.restore();
      if (rules) drawZoneGround(c, world, rules, zoneMapState({ rules, world, settlements: {}, clans: {}, clan: 'player' }), p);
      const cap = world.capital?.port || world.capital;
      if (cap) { const q = p(cap.x, cap.z); c.fillStyle = '#f0a050'; c.beginPath(); c.arc(q.px, q.py, 3.5, 0, 7); c.fill();
        label(c, 'The city', q.px - 8, q.py + 4, 'right', '#d8c6a4'); }
      for (const z of rules?.zones || []) if (!z.castle && z.labelAt) { const q = p(z.labelAt[0], z.labelAt[1]);   // a zone with no castle site
        c.font = 'italic 12px Georgia, serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(10,8,6,.85)'; c.strokeText(z.name, q.px, q.py); c.fillStyle = '#b8ad96'; c.fillText(z.name, q.px, q.py); }
      for (const s of sites) {
        const q = p(s.x, s.z), on = pick === s.id, rnd = pick === 'random', hi = hover === s.id, gone = taken(s.id);
        c.save();
        if (on) { c.shadowColor = GOLD; c.shadowBlur = 16; }
        c.fillStyle = on ? color : gone ? '#3a3632' : '#141110'; c.strokeStyle = on || hi ? GOLD : gone ? '#6a6258' : rnd ? '#c9a868' : '#a89a80'; c.lineWidth = on ? 2.5 : 1.5;
        c.beginPath(); c.rect(q.px - 8, q.py - 5, 16, 11); c.fill(); c.stroke();
        for (const dx of [-8, -1.75, 4.5]) { c.beginPath(); c.rect(q.px + dx, q.py - 9, 3.5, 4); c.fill(); c.stroke(); }
        c.restore();
        if (on) { c.strokeStyle = GOLD; c.lineWidth = 1.5; c.beginPath(); c.arc(q.px, q.py, 17, 0, 7); c.stroke(); }
        const left = q.px > W - 120;
        label(c, gone ? `${s.name}, taken` : s.name, q.px + (left ? -14 : 14), q.py + 4, left ? 'right' : 'left', on ? '#ffe7b0' : gone ? '#8a8276' : hi ? '#f3e9cf' : '#d6ccb6', on);
      }
    }
    function label(c, t, x, y, align, fill, bold = false) {
      c.font = `${bold ? 700 : 600} 13px Georgia, serif`; c.textAlign = align; c.textBaseline = 'alphabetic';
      c.lineWidth = 3.5; c.strokeStyle = 'rgba(10,8,6,.92)'; c.strokeText(t, x, y); c.fillStyle = fill; c.fillText(t, x, y);
    }
    function set(id, tell = true) {
      pick = id;
      for (const i of row.querySelectorAll('input')) i.checked = i.value === id;
      note.textContent = homeText(sites, id); draw(); if (tell) onChange(id);
    }
    const near = ev => { const r = cv.getBoundingClientRect(), { p } = view();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      return sites.find(s => { const q = p(s.x, s.z); return !taken(s.id) && Math.hypot(q.px - x, q.py - y) < 20; })?.id || null; };
    cv.addEventListener('mousemove', ev => { const h = near(ev); if (h !== hover) { hover = h; cv.style.cursor = h ? 'pointer' : ''; draw(); } });
    cv.addEventListener('mouseleave', () => { hover = null; draw(); });
    cv.addEventListener('click', ev => { const h = near(ev); if (h) set(h); });
    row.addEventListener('change', ev => { if (ev.target.name === 'home') set(ev.target.value); });
    Promise.resolve(zones).then(z => {
      rules = z; sites = homeSites(z);
      if (pick !== 'random' && !sites.some(s => s.id === pick && !taken(s.id))) pick = sites.find(s => !taken(s.id))?.id || null;
      row.innerHTML = [...sites, ...(random ? [{ id: 'random', name: 'Random' }] : [])].map(s => `<label class="hm-choice"><input type="radio" name="home" value="${esc(s.id)}"${s.id === pick ? ' checked' : ''}${taken(s.id) ? ' disabled' : ''}><span>${esc(s.name)}</span></label>`).join('');
      set(pick, false);
    }).catch(() => { box.remove(); });
    return {
      value: () => pick,
      show(on) { box.hidden = !on; if (on) draw(); },
      clan(c) { color = c || GOLD; draw(); },
    };
  }
  return { html, mount };
}
