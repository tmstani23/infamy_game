import { modeRules } from './modes/index.js';
// Guarded places (world variety P4, 2026-11-27). Each hidden place of data/hidden_places.json with a `guard` block
// holds guards and a boss. Built on the island camp pattern (sim/camps.js): the guards are put on the map only while
// their chunk is awake, kept in state.world.guarded with the save, and come back respawnDays after a clear.
//   people  owner 'bandits', fought by the bandit AI (sim/bandits.js) inside `leash` of the place; campFor() gives
//           the bandit AI this place as its camp, with a longer sight and give-up distance than a night bandit's
//   animals (the cave bear, the wolf pack) wild predators (sim/wild_animals.js) of a den of their own ('hp_<id>'),
//           so the far-away sweep leaves them; they start the hunt when the player's people come within `aggro`
//           and are walked home past the leash
//   cavalry the caravan raiders ride from the saddle like war cavalry (sim/frontier/war.js)
// A clear: every guard and the boss down. The clan that landed the last blow (a player clan, never a bot) gets the
// place's relic the first time (each clan once), later clears pay repeatRyo. Boss looks and abilities: the `boss`
// field on the boss entity, read by render/view.js and sim/boss_abilities.js.
export const GUARD_DEN = id => `hp_${id}`;
export function withGuardTypes(units, hidden) {
  if (!units || !hidden?.types) return units;
  return { ...units, types: { ...units.types, ...hidden.types } };
}
export function createGuardedPlaces({ state, data, areas, spawn, remove, ai, statsOf, wild = null, grant = () => false, say = () => {}, itemName = id => id, dayTicks = 12000, wildOwner = 'wildlife' }) {
  const G = data?.guards || {};
  const defs = (data?.places || []).filter(p => p.guard);
  const byId = Object.fromEntries(defs.map(p => [p.id, p]));
  const enabled = !!(areas && defs.length);
  const secs = s => Math.round(s * 20);
  const backIn = rec => Math.max(0, (G.respawnDays ?? 5) * dayTicks - (state.tick - rec.clearedAt));   // ticks until the guards return
  const records = () => { state.world ||= {}; return state.world.guarded ||= {}; };
  const ready = () => enabled && modeRules(state).island;
  const loadedAt = (x, z) => areas.activeIds().includes(areas.chunkId(...areas.chunkOf(x, z)));
  const animal = p => !!p.guard.species;
  const player = owner => !!state.clans?.[owner] && !state.clans[owner].bot;

  function createRecord(p, old = null) {
    const g = p.guard, members = [];
    for (const [type, n] of g.members || []) for (let i = 0; i < n; i++) members.push({ type, entity: null, dead: false, saved: null });
    members.push({ type: g.boss.type, boss: true, entity: null, dead: false, saved: null });
    return { version: 1, cleared: false, clearedAt: null, generation: old ? old.generation + 1 : 0, claimed: old?.claimed || {}, clears: old?.clears || 0, members, lastClan: null };
  }
  function bossOf(p) {
    const b = p.guard.boss, st = statsOf(b.type);
    return { place: p.id, name: st.name, title: b.title, scale: b.scale || 1.4, tint: b.tint || null, grey: b.grey || 0, ability: b.ability || null, bleed: b.bleed || null };
  }
  function keep(slot, e) {
    const saved = structuredClone(e);
    for (const k of ['id', 'attackTarget', 'swing', 'angry', 'order', 'execute', 'lootTarget', 'distracted', 'taunted', 'ride', 'mounted']) delete saved[k];
    if (saved.wm) saved.wm = { mode: 'idle', until: 0, home: saved.wm.home, den: saved.wm.den };
    slot.saved = saved;
  }
  function despawn(e) {
    if (!e) return;
    const horse = e.ride?.horse && state.entities[e.ride.horse];
    if (horse) remove(horse.id);
    remove(e.id); delete ai.mind[e.id];
  }
  function suspend(rec) {
    for (const slot of rec.members) {
      const e = state.entities[slot.entity];
      if (e && !e.dead) { keep(slot, e); despawn(e); }
      else if (e) despawn(e);
      slot.entity = null;
    }
  }
  function put(p, rec, slot, index) {
    const n = rec.members.length, a = (index + rec.generation * 0.3) * Math.PI * 2 / n;
    const r = slot.boss ? 0 : (G.spawnRadius ?? 5) * (0.6 + 0.4 * ((index * 7) % 3) / 2);
    const x = slot.saved?.x ?? p.x + Math.cos(a) * r, z = slot.saved?.z ?? p.z + Math.sin(a) * r;
    const at = areas.nav.nearestFree(x, z);
    if (!at || Math.hypot(at[0] - p.x, at[1] - p.z) > (G.leash ?? 26)) return null;
    const st = statsOf(slot.type), base = { ...(slot.saved || {}), x: at[0], z: at[1], place: 'world', area: 'world', guarded: p.id, name: st.name };
    if (slot.boss) base.boss = bossOf(p);
    let id;
    if (animal(p)) {
      id = spawn(slot.type, st.sprite || slot.type, at[0], at[1], { ...base, owner: wildOwner, wild: true, wildlife: true, species: p.guard.species,
        wm: { mode: 'idle', until: state.tick + secs(3), home: [at[0], at[1]], den: GUARD_DEN(p.id), ...(slot.saved?.wm || {}) } });
    } else {
      id = spawn(slot.type, st.sprite || slot.type, at[0], at[1], { ...base, owner: 'bandits', wild: true, camp: p.id, worldCamp: true });
      ai.mind[id] = { camp: p.id, spot: null };
      if (p.guard.mounted || (slot.boss && p.guard.boss.horse)) {
        const e = state.entities[id], horseModel = slot.boss && p.guard.boss.horse || 'mare_saddled';
        const hid = spawn('horse', horseModel, at[0], at[1], { horseOwner: 'bandits', cavalry: true, guarded: p.id, place: 'world', area: 'world', hp: e.maxHp, maxHp: e.maxHp, holdFire: true, vehicle: true });
        const horse = state.entities[hid];
        if (horse) { e.cavalry = true; e.mounted = true; e.ride = { kind: 'horse', speed: 2, horse: hid }; horse.rider = id; }
      }
    }
    slot.entity = id; slot.saved = null;
    return id;
  }
  // the player's people near a spot (hero, crew, anyone of a player clan on the island)
  const people = () => Object.values(state.entities).filter(e => player(e.owner) && e.place === 'world' && !e.dead && !e.downed && !e.garrison && !e.aboard && !e.ship && !e.wildlife);
  function award(p, rec) {
    const clan = rec.lastClan, c = state.clans?.[clan];
    rec.clears++;
    if (!c || c.bot) return;
    const relic = p.guard.relic, first = !rec.claimed[clan];
    rec.claimed[clan] = true;
    if (first && relic) {
      grant(clan, relic);
      say(clan, `${p.name} cleared. You took the ${itemName(relic)}. Guards return in ${G.respawnDays ?? 5} days.`);
    } else {
      const amount = G.repeatRyo ?? 350;
      c.ryo += amount;
      (state.ryoGains ||= []).push({ clan, amount, reason: 'Guarded place cleared', place: p.id });
      say(clan, `${p.name} cleared again: ${amount} ryo. Guards return in ${G.respawnDays ?? 5} days.`);
    }
    (state.news ||= []).push({ kind: 'guardedCleared', clan, place: p.id, relic: first ? relic : null, ryo: first ? 0 : G.repeatRyo ?? 350 });
    state.casts?.push({ kind: 'guardedCleared', clan, place: p.id, x: p.x, z: p.z, first, relic: first ? relic : null });
  }
  function tick() {
    if (!ready()) return;
    const all = records(), crowd = people();
    for (const p of defs) {
      const loaded = loadedAt(p.x, p.z);
      let rec = all[p.id];
      if (!rec && !loaded) continue;
      rec ||= all[p.id] = createRecord(p);
      // who is down; the clan that landed the last blow on each
      for (const slot of rec.members) {
        const e = state.entities[slot.entity];
        if (e?.dead && !slot.dead) { slot.dead = true; const by = state.entities[e.hitBy?.id]; if (by && state.clans?.[by.owner]) rec.lastClan = by.owner; }
        else if (slot.entity && !e && !slot.dead) slot.entity = null;   // taken off the map by someone else (a wild sweep): put back later
      }
      if (!rec.cleared && rec.members.every(m => m.dead)) { rec.cleared = true; rec.clearedAt = state.tick; award(p, rec); }
      if (rec.cleared && backIn(rec) <= 0) { suspend(rec); rec = all[p.id] = createRecord(p, rec); }
      if (!loaded) { suspend(rec); continue; }
      rec.members.forEach((slot, i) => {
        const e = state.entities[slot.entity];
        if (slot.dead) { if (e?.dead && e.diedAt != null && state.tick - e.diedAt > secs(G.corpseSeconds ?? 60)) despawn(e); return; }
        if (!e) put(p, rec, slot, i);
      });
      if (animal(p) && wild && state.tick % 10 === 0) watchAnimals(p, rec, crowd);
    }
  }
  // the bear and the pack: a hunt when your people come close, home again past the leash
  function watchAnimals(p, rec, crowd) {
    const pack = rec.members.map(m => state.entities[m.entity]).filter(e => e && !e.dead);
    const near = crowd.filter(e => !e.relicUnseen && !e.hidden && Math.hypot(e.x - p.x, e.z - p.z) <= (G.aggro ?? 16));   // the fox mask: unnoticed until they attack
    for (const e of pack) {
      const far = Math.hypot(e.x - p.x, e.z - p.z) > (G.leash ?? 26);
      if (far) { delete e.angry; Object.assign(e.wm, { mode: 'walk', x: p.x, z: p.z, until: state.tick + secs(12), home: [p.x, p.z] }); delete e.wm.clan; delete e.wm.prey; continue; }
      if (near.length && !e.angry) { e.hitBy ||= { id: near[0].id, tick: state.tick }; wild.provoke(e, near[0].owner); }
    }
  }
  function campFor(id) {
    const p = byId[id];
    return ready() && p ? { id, x: p.x, z: p.z, leash: G.leash ?? 26, sight: G.sight, giveUp: G.giveUp, patrol: G.patrol || [5, 12], bossPatrol: G.bossPatrol || [0, 3] } : null;
  }
  // for the place card and the map: is it guarded, when do the guards come back, does this clan hold the relic
  function viewFor(clan, id) {
    const p = byId[id], rec = records()[id];
    if (!p) return null;
    const left = rec?.cleared ? backIn(rec) : null;
    return { id, relic: p.guard.relic, boss: statsOf(p.guard.boss.type).name, bossTitle: p.guard.boss.title, cleared: !!rec?.cleared, backInTicks: left, dayTicks,
      held: !!rec?.claimed?.[clan], clears: rec?.clears || 0 };
  }
  return { tick, campFor, viewFor, enabled, places: defs, rules: G, records };
}
