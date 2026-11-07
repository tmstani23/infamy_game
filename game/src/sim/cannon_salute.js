// The governor's cannon salute (Tim 2026-11-07): four cannons beside each player town hall (2 brass field
// cannons, then 2 wooden ones). Scenery only: ownerless guides, never targeted, no damage. The governor fires
// them one after another the first time you talk to him in that town, after every tier upgrade, and on his
// "Fire a salute" choice ({ type: 'frontier', action: 'salute', settlement }, cooldownSeconds apart).
// Each shot: the cannon's 'attack' clip (e.swing) and a { kind: 'cannonFire' } cast for sound and effects.
// createCannonSalute({ state, spawn, removeUnit, cell, rules }) -> { tick, salute, firstTalk }
const MODELS = ['cannon_field', 'cannon_field', 'cannon_wooden', 'cannon_wooden'];
export function createCannonSalute({ state, spawn, removeUnit, cell = 11, rules = {} }) {
  const R = { gapTicks: 16, cooldownSeconds: 10, spacing: 4.5, ahead: 1.6, dir: 1, ...rules };   // Tim 2026-11-07: salute every 10 s; dir 1 = facing down-left on screen
  const say = (s, text) => { const c = state.clans?.[s.owner]; if (c) c.notice = { tick: state.tick, text }; };
  // an even row in front of the hall (Tim 2026-11-07: they ran into the house): R.ahead cells toward the camera
  // (screen down = +x +z), spread across the screen (screen right = +x -z), one gun per slot
  const Q = Math.SQRT1_2;
  const spots = s => MODELS.map((m, k) => { const off = (k - (MODELS.length - 1) / 2) * R.spacing, d = cell * R.ahead;
    return { m, x: s.x + Q * d + Q * off, z: s.z + Q * d - Q * off }; });
  function batteries() {
    for (const s of Object.values(state.frontier?.settlements || {})) {
      const want = s.founded !== undefined && s.owner && !state.clans?.[s.owner]?.bot && Number.isFinite(s.x);
      const ids = s.cannons || [];
      if (!want) { if (ids.length) { ids.forEach(id => state.entities[id] && removeUnit(id)); delete s.cannons; } continue; }
      s.cannons = spots(s).map((p, k) => {
        const e = state.entities[ids[k]];
        if (e && !e.dead) { Object.assign(e, { x: p.x, z: p.z, place: 'world', seenBy: s.owner }); if (!e.swing) e.dir = R.dir; return e.id; }
        return spawn('city_captain', p.m, p.x, p.z, { owner: null, seenBy: s.owner, place: 'world', guide: true, holdFire: true, cannon: s.id, hp: 100, dir: R.dir, name: 'Cannon' });
      });
    }
  }
  // start a salute; asked = from his talk menu (cooldown applies)
  function salute(s, asked = false) {
    if (!s?.cannons?.length) return false;
    if (s.salute) return false;
    if (asked && state.tick < (s.saluteReadyAt ?? -1e9)) { say(s, 'The guns are still being loaded: a moment'); return false; }
    s.salute = { start: state.tick + 10 }; s.saluteAt = state.tick; s.saluteReadyAt = state.tick + R.cooldownSeconds * 20;   // saluteReadyAt: the cannons' hover card counts down to it
    return true;
  }
  const firstTalk = s => { if (s && !s.firstSalute) { s.firstSalute = true; salute(s); } };
  function tick() {
    if (!state.frontier) return;
    if (state.tick % 20 === 0) batteries();
    for (const s of Object.values(state.frontier.settlements || {})) {
      if (s.tierUpAt != null && s.tierSaluted !== s.tierUpAt) { if (s.tierSaluted !== undefined || s.firstSalute) salute(s); s.tierSaluted = s.tierUpAt; }
      const sa = s.salute; if (!sa) continue;
      const k = (state.tick - sa.start) / R.gapTicks;
      if (Number.isInteger(k) && k >= 0 && k < (s.cannons || []).length) {
        const e = state.entities[s.cannons[k]];
        if (e) { e.swing = { start: state.tick, len: 20, salute: true }; e.anim = 'attack'; state.casts.push({ kind: 'cannonFire', a: e.id, x: e.x, z: e.z, place: e.place, dir: e.dir || 0, brass: k < 2 }); }
      }
      if (state.tick - sa.start > R.gapTicks * 4 + 40) { delete s.salute; for (const id of s.cannons || []) if (state.entities[id]) { delete state.entities[id].swing; state.entities[id].anim = 'idle'; } }
    }
  }
  return { tick, salute, firstTalk };
}
