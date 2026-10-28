// Stealth for the Shinobi clan (ninja build phase 3, Tim 2026-10-20): its units (the ninja leader
// and ninja crew) are hidden unless an enemy stands within detection range: darkRange in the dark,
// litRange in lantern light or by day, indoorRange in a room, times runFactor while running.
// Once seen, or when it hits or is hit, a unit is revealed for revealSeconds. Hidden units cannot
// be seen or targeted by anyone else (sim/vision.js canSee, sim/game.js sees). Townsfolk never spot.
// Snuffing a lantern: the ninja boss at night, within snuffReach of a lit lantern (click it or Space), for snuffSeconds
// (only being downed cancels it): the light is out until dawn (state.lightsOut = prop indexes, for the screen),
// at most snuffPerNight a night. Numbers: units.json rules.stealth.
import { inViewCone } from './perception.js';
const DEFAULTS = { darkRange: 2, litRange: 5, indoorRange: 2, runFactor: 2, revealSeconds: 5, lightRadius: 5,
  viewAngle: 90, suspicionSeconds: 1.2, suspicionDecay: 2,
  snuffPerNight: 3, snuffSeconds: 1, snuffReach: 7, snuffArea: 2.5, every: 1 };

export const indoorLightId = (room,index) => `room:${room}:${index}`;
export function createStealth({ state, scenery, rooms = [], rules = {}, say = () => {}, lineOfSight = () => true, observerKnown = () => false }) {
  const R = { ...DEFAULTS, ...rules };
  const secs = s => Math.round(s * 20);
  // the lanterns the sim knows about: lit props (lantern posts, stone lanterns, braziers...)
  const lights = scenery.filter(s => !s.indoor && s.prop !== undefined && s.item?.lights?.length).map(s => ({ prop: s.prop, x: s.x, z: s.z,place:'street',radius:R.lightRadius }));
  for(const room of rooms)room.props.forEach((p,index)=>{if(p.def.light)lights.push({prop:indoorLightId(room.name,index),place:room.name,x:room.origin.x+p.cx,z:room.origin.z+p.cz,radius:p.def.light.radius*(room.worldScale||1)});});
  state.lightsOut ||= [];
  const out = () => new Set(state.lightsOut);
  // is this street spot lit: by day everywhere, at night within lightRadius of a lantern still burning
  function lit(x, z, place='street') {
    if (place==='street'&&!state.night) return true;
    const off = out();
    return lights.some(l => l.place===place&&!off.has(l.prop) && (l.x - x) ** 2 + (l.z - z) ** 2 <= l.radius*l.radius);
  }
  const ninja = e => state.clans?.[e?.owner]?.kind === 'ninja';
  const canHide = e => ninja(e) && !e.dead && !e.downed && !e.jailed;
  const suspicion = new Map();
  // who can spot a hidden unit: any armed unit not on its side (other clans, police, house guards, bandits)
  const spotter = (u, e) => u.owner !== e.owner && u.type !== 'civilian' && !u.dead && !u.downed && !u.jailed && u.place === e.place;
  function range(e) {
    const indoors=e.place!=='street',modeled=rooms.some(r=>r.name===e.place);
    const base = indoors ? !modeled||lit(e.x,e.z,e.place)?R.indoorRange:(R.indoorDarkRange??R.indoorRange*.5) : lit(e.x, e.z) ? R.litRange : R.darkRange;
    return base * (e.anim === 'run' ? R.runFactor : 1);
  }
  // hiddenAt: when it last went hidden (Assassinate needs a few seconds of it); seen = from scratch
  const veiled = e => canHide(e) && (e.buffs?.veil?.until ?? -1) > state.tick;
  // in plain sight whatever the cover (Tim 2026-10-26): knocking down a War Lantern always; attacking
  // only matters inside its clan's Smoke Bomb (see tick), so cancelling the attack hides it again
  const knocking = e => Object.values(state.attacks || {}).some(a => a.knock?.by === e.id);
  const exposed = e => knocking(e) || !!(e.swing || e.attackTarget);
  function reveal(e, attacking = false) {
    if (!e || !canHide(e) || (!attacking && veiled(e))) return;
    if (attacking && e.buffs) delete e.buffs.veil;
    e.revealUntil = state.tick + secs(R.revealSeconds); e.hidden = false; e.hiddenAt = null;
  }

  function tick() {
    // a snuff in progress: done after snuffSeconds; walking on doesn't cancel it (Tim 2026-10-21:
    // the puff went off while moving and the lantern stayed lit), only being knocked down
    for (const e of Object.values(state.entities)) {
      const s = e.snuffing;
      if (!s) continue;
      if (e.dead || e.downed) { delete e.snuffing; continue; }
      if (state.tick >= s.until) {
        delete e.snuffing;
        const clan = state.clans[e.owner];
        // the whole lantern area goes dark, not just the light nearest the click (Tim 2026-10-21): every
        // lantern within snuffArea of it, for one snuff
        const near = lights.filter(l => l.place===s.place&&(l.prop === s.prop || Math.hypot(l.x - s.lx, l.z - s.lz) <= R.snuffArea)).map(l => l.prop).filter(p => !state.lightsOut.includes(p));
        if (near.length) { state.lightsOut.push(...new Set(near)); clan.snuffs = (clan.snuffs || 0) + 1; state.news.push({ kind: 'snuffed', clan: clan.id, prop: s.prop }); }
      }
    }
    if (state.dawn) state.lightsOut = [];
    if (state.dusk) for (const c of Object.values(state.clans || {})) c.snuffs = 0;
    if (state.tick % R.every) return;
    const all = Object.values(state.entities);
    for (const e of all) {
      if (!canHide(e)) { if (e.hidden) e.hidden = false; delete e.stealthStatus; suspicion.delete(e.id); continue; }
      const lighting = e.place !== 'street' ? lit(e.x,e.z,e.place)?'indoors · lit':'indoors · dark' : lit(e.x, e.z) ? 'lit' : 'dark';
      e.stealthStatus = { lighting, movement: e.anim === 'run' ? 'running' : e.anim === 'walk' ? 'walking' : 'still', range: range(e),
        concealment: Math.max(0, Math.min(1, 1 - range(e) / (Math.max(R.litRange, R.indoorRange) * R.runFactor))), suspicion: 0, observers: [], mode: 'normal' };
      // The cloud's parting veil ignores detection and incoming-hit reveals. An
      // outgoing attack consumes it; it also waives Assassinate's hiding timer.
      if (knocking(e)) { if (e.buffs) delete e.buffs.veil; e.hidden = false; e.hiddenAt = null; continue; }
      if (veiled(e)) { e.hidden = true; e.stealthStatus.mode = 'veil'; e.stealthStatus.concealment = 1; suspicion.delete(e.id); continue; }
      // inside its own clan's Smoke Bomb: hidden unless attacking, but that doesn't count as hidden time
      if (state.smokes?.some(s => s.clan === e.owner && s.place === e.place && (e.x - s.x) ** 2 + (e.z - s.z) ** 2 <= s.r * s.r)) { e.hidden = !exposed(e); e.stealthStatus.mode = 'smoke'; e.stealthStatus.concealment = e.hidden ? 1 : 0; suspicion.delete(e.id); if (!e.hidden) e.hiddenAt = null; continue; }
      if ((e.revealUntil ?? -1) > state.tick) { e.hidden = false; continue; }
      const r = range(e), r2 = r * r;
      const memory = suspicion.get(e.id) || new Map(), active = new Set(); let maximum = 0;
      for (const u of all) if (spotter(u, e) && (u.x - e.x) ** 2 + (u.z - e.z) ** 2 <= r2 && inViewCone(u, e, R.viewAngle) && lineOfSight(u, e)) {
        active.add(u.id); const ticks = (memory.get(u.id) || 0) + R.every;
        memory.set(u.id, ticks); maximum = Math.max(maximum, ticks);
        if (observerKnown(e, u)) e.stealthStatus.observers.push({ id: u.id, progress: Math.min(1, ticks / Math.max(1, secs(R.suspicionSeconds))) });
      }
      for (const [id, ticks] of memory) if (!active.has(id)) { const left = ticks - R.every * R.suspicionDecay; if (left > 0) memory.set(id, left); else memory.delete(id); }
      suspicion.set(e.id, memory);
      e.stealthStatus.suspicion = Math.min(1, maximum / Math.max(1, secs(R.suspicionSeconds)));
      if (e.stealthStatus.suspicion >= 1) reveal(e); else { e.hiddenAt ??= state.tick; e.hidden = true; }
    }
    for (const id of suspicion.keys()) if (!state.entities[id]) suspicion.delete(id);
  }

  // the lantern a ninja boss could snuff from where he stands (that one, given its prop), or null
  function snuffable(e, prop) {
    if (!e || e.type !== 'hero' || !ninja(e) || (e.place==='street'&&!state.night)) return null;
    const off = out();
    let best = null, bd = R.snuffReach;
    for (const l of lights) { const d = Math.hypot(l.x - e.x, l.z - e.z); if (l.place===e.place&&d < bd && !off.has(l.prop) && (prop === undefined || l.prop === prop)) { bd = d; best = l; } }
    return best;
  }
  const snuffsLeft = clanId => Math.max(0, R.snuffPerNight - (state.clans?.[clanId]?.snuffs || 0));
  // [{ id, type: 'snuff', prop? }] from a Shinobi boss near a lantern at night (prop: the one clicked)
  function snuff(e, prop) {
    const l = snuffable(e, prop), clan = state.clans?.[e?.owner];
    if (!l || !clan || e.dead || e.downed || e.jailed) return;
    if (snuffsLeft(clan.id) <= 0) { say(clan, `You can snuff ${R.snuffPerNight} lanterns a night`); return; }
    e.snuffing = { prop: l.prop, place:l.place, lx: l.x, lz: l.z, x: e.x, z: e.z, until: state.tick + secs(R.snuffSeconds) };
    state.casts?.push({ kind: 'snuff', a: e.id, x: e.x, z: e.z, tx: l.x, tz: l.z });   // the smoke flash (render/abilityfx.js)
  }

  return { tick, lit, reveal, veiled, exposed, snuff, snuffable, snuffsLeft, lights, canHide, rules: R };
}
