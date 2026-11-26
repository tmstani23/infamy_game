// Wild animals on the island (wildlife W3 deer and boar, W4 wolves and bears, Tim 2026-11-24; plan war_build/wildlife/wildlife_plan.md).
// Deer and boar come and go around the player's own units, by the ground they like (data/wildlife.json
// "animals": species habitat by terrain code), and only in chunks that are already awake. They graze and
// wander near a home spot, run from people who come close and from the noise of a fight or a gun, and are
// taken off the map again when nobody of the player's is near. Deer only ever run. A boar that is hit charges
// whoever hit it for a few seconds, then runs.
// Wolves and bears (species with "predator") live in fixed dens instead: deep forest and mountain spots worked out
// once per region of the world map (animals.predators.dens). A den's pack or bear is put on the map when one of
// the player's units comes within wakeDistance of it and taken off again past sleepDistance. At night packs howl
// from their dens ('wolfHowl', heard far past the camera). A pack or bear that finds a small group near its den
// at night (rarely by day) stalks it and attacks: wolves go for crew rather than the hero, the weakest first, bite
// and fall back, and break off at half strength; a bear fights until badly hurt. A big group drives them off.
// A den whose animals all died stays empty for a few days. Hitting a wolf or bear starts the same fight.
// A kill puts the hide straight into the killer's clan stock (clan.hides), whoever in the clan made it, and a
// 'wildDrop' cast flies a hide to the hero (render/wild_drop_fx.js). 'wildAlarm', 'wildCharge' and 'wildHunt'
// casts are for the sounds (and 'wildHunt' for the alert).
// Each animal's state lives on the entity (e.wm), each den's on state.world.wildDens, so a save keeps them. Plain sim code, no three.js.
import { cellToWorld } from './frontier/town_grid.js';
import { creditRyo } from './treasury.js';
import { dirIndex } from './geometry.js';

export const WILDLIFE = 'wildlife';   // the owner every wild animal has (not a clan)
const TICK_RATE = 20;

// state: game state; data: wildlife.json "animals"; world: world.json; areas: island chunks (sim/areas.js);
// terrainAt(x, z): terrain code; settled(x, z): true near towns, camps and the city, where no animal comes; ready(): island games only;
// spawn / remove / moveTo / stopPath / fightStep / statsOf: the game's own; attack(e, t): one step of e fighting t
// (finishes a swing it started, else closes in and swings; false when there is nothing to do); dayTicks: one day and night
export function createWildAnimals({ state, data, world = null, areas, terrainAt, settled = () => false, ready = () => true, spawn, remove, moveTo, stopPath, fightStep, statsOf, attack = () => false, tame = () => null, gear = () => false, dayTicks = 12000, seed = 1 }) {
  const R = data?.rules || {}, SP = data?.species || {}, P = data?.predators || {};
  const secs = s => Math.round(s * TICK_RATE);
  const THINK = secs(R.thinkSeconds ?? 3);
  let s = seed >>> 0;
  function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }
  const range = ([a, b]) => a + rng() * (b - a);
  const speciesOf = e => SP[e?.species];
  const predator = e => !!speciesOf(e)?.predator;
  const animals = () => Object.values(state.entities).filter(e => e.wildlife);
  const alive = e => e && !e.dead && !e.downed;
  // somebody on the island that animals mind (anyone but another animal and the ones tucked away)
  const person = e => alive(e) && e.place === 'world' && !e.wildlife && !e.garrison && !e.aboard && !e.stored && !e.inShip && !e.ship;
  const playerClan = owner => !!state.clans?.[owner] && !state.clans[owner].bot;
  const rest = () => { state.world ||= {}; return state.world.wildRest ||= {}; };   // spawn cell -> tick it may have animals again
  const denState = () => { state.world ||= {}; return state.world.wildDens ||= {}; };   // den id -> { up, rest }
  const cellKey = (x, z) => { const c = R.restCell ?? 100; return `${Math.floor(x / c)}_${Math.floor(z / c)}`; };
  const activeChunk = (x, z) => { const ids = areas.activeIds(); return ids.includes(areas.chunkId(...areas.chunkOf(x, z))); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // the world map's name for a spot: the region whose box holds it, else the nearest region
  const regionName = (x, z) => {
    let best = null, bd = Infinity;
    for (const r of world?.regions || []) {
      const [x0, z0, x1, z1] = r.box || [];
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return r.name;
      const d = Math.hypot(x - (x0 + x1) / 2, z - (z0 + z1) / 2);
      if (d < bd) { bd = d; best = r.name; }
    }
    return best;
  };

  // Where animals may come: a few spread-out spots among the player's units on the island (the hero first)
  function anchors() {
    const out = [], gap = R.anchorGap ?? 80;
    const mine = Object.values(state.entities).filter(e => person(e) && playerClan(e.owner)).sort((a, b) => (b.type === 'hero') - (a.type === 'hero'));
    for (const e of mine) {
      if (out.length >= (R.anchors ?? 4)) break;
      if (out.every(a => Math.hypot(a.x - e.x, a.z - e.z) > gap)) out.push({ x: e.x, z: e.z });
    }
    return out;
  }

  // A species for this ground, by weight times liking (habitat), or null where none of them lives (never a den animal)
  function speciesFor(code) {
    const list = Object.entries(SP).filter(([, sp]) => !sp.predator).map(([k, sp]) => [k, (sp.weight ?? 1) * (sp.habitat?.[code] ?? 0)]).filter(([, w]) => w > 0);
    let r = rng() * list.reduce((n, [, w]) => n + w, 0);
    for (const [k, w] of list) if ((r -= w) < 0) return k;
    return null;
  }

  // Put one group of a species down at (x, z): a herd, a sounder, a pack or a bear
  function place(kind, x, z, extra = {}) {
    const sp = SP[kind], n = Math.round(range(sp.group || [1, 1])), home = areas.nav.nearestFree(x, z);
    if (!home) return [];
    const ids = [];
    for (let i = 0; i < n; i++) {
      const type = i === 0 && sp.lead && rng() < (sp.leadChance ?? 1) ? sp.lead : sp.rest || sp.lead;
      const t = rng() * Math.PI * 2, r = i ? 1.5 + rng() * 2.5 : 0;
      const p = areas.nav.nearestFree(home[0] + Math.cos(t) * r, home[1] + Math.sin(t) * r);
      if (!p || Math.hypot(p[0] - home[0], p[1] - home[1]) > 8) continue;
      const st = statsOf(type);
      ids.push(spawn(type, st.sprite || type, p[0], p[1], { owner: WILDLIFE, wild: true, wildlife: true, species: kind, name: st.name,
        place: 'world', area: 'world', dir: Math.floor(rng() * 8), coat: [+rng().toFixed(3), +rng().toFixed(3)],
        wm: { mode: 'idle', until: state.tick + secs(range(R.graze || [4, 10])), home: [p[0], p[1]], ...extra } }));
    }
    for (const id of ids) if (state.entities[id]) state.entities[id].wm.size = ids.length;
    return ids;
  }

  // One group (a herd of deer, a sounder of boar) somewhere round this anchor, out of sight of everyone
  function spawnGroup(a, people) {
    for (let tries = 0; tries < 6; tries++) {
      const ang = rng() * Math.PI * 2, d = range(R.spawnRing || [45, 85]);
      const x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d;
      if (!activeChunk(x, z) || settled(x, z) || (rest()[cellKey(x, z)] ?? -1) > state.tick) continue;
      if (people.some(p => Math.hypot(p.x - x, p.z - z) < (R.spawnRing?.[0] ?? 45) * 0.8)) continue;
      const kind = speciesFor(terrainAt(x, z));
      if (!kind) continue;
      const ids = place(kind, x, z);
      if (!ids.length) continue;
      rest()[cellKey(x, z)] = state.tick + secs(R.restSeconds ?? 300);
      return ids;
    }
    return [];
  }

  // ---- Dens (wolves and bears) ----------------------------------------------------------------
  // Worked out once from the world map: in each region the spots most surrounded by the den ground (forest,
  // mountain), well away from the sites, camps and the capital; perRegion of each kind, gap apart.
  let denList = null;
  function dens() {
    if (denList) return denList;
    denList = [];
    const D = P.dens || {}, hab = D.habitat || { f: 1, m: 1 }, per = D.perRegion || {}, step = D.step ?? 125, look = D.look ?? 150;
    const avoid = [...(world?.sites || []), ...(world?.camps || []), world?.capital].filter(p => p && Number.isFinite(p.x));
    for (const r of world?.regions || []) {
      const [x0, z0, x1, z1] = r.box, cands = [];
      for (let z = z0 + look; z <= z1 - look; z += step) for (let x = x0 + look; x <= x1 - look; x += step) {
        if (avoid.some(p => Math.hypot(p.x - x, p.z - z) < (D.awayFrom ?? 400))) continue;
        let n = 0, m = 0;
        for (let dz = -look; dz <= look; dz += 50) for (let dx = -look; dx <= look; dx += 50) { m++; n += hab[terrainAt(x + dx, z + dz)] ?? 0; }
        if (n / m >= (D.minShare ?? 0.6)) cands.push({ x, z, s: n / m });
      }
      cands.sort((a, b) => b.s - a.s || a.z - b.z || a.x - b.x);
      const taken = [];
      for (const [kind, count] of Object.entries(per)) {
        let k = 0;
        for (const c of cands) {
          if (k >= count) break;
          if (taken.some(t => dist(t, c) < (D.gap ?? 350))) continue;
          taken.push(c); denList.push({ id: `${r.id}_${kind}${k}`, kind, x: c.x, z: c.z }); k++;
        }
      }
    }
    return denList;
  }
  const denOf = id => dens().find(d => d.id === id);
  const packOf = id => animals().filter(e => e.wm?.den === id && alive(e));

  // Wake the dens near the player's units, put the far ones to sleep, empty ones rest
  function denTick(marks, people) {
    const S = denState(), H = P.hunt || {};
    for (const d of dens()) {
      const st = S[d.id] ||= {}, near = Math.min(...marks.map(a => dist(a, d)), Infinity);
      const pack = packOf(d.id), angry = pack.some(e => e.angry);
      if (st.up && !pack.length) {   // all of them died, or wandered off the awake ground
        if (st.lost) st.rest = state.tick + Math.round((P.denRestDays ?? 2) * dayTicks);
        st.up = false; delete st.lost;
      }
      if (st.up && near > (P.sleepDistance ?? 460) && !angry) { for (const e of pack) remove(e.id); st.up = false; delete st.lost; continue; }
      if (!st.up && near <= (P.wakeDistance ?? 380) && (st.rest ?? -1) <= state.tick && !settled(d.x, d.z)) {
        // out of sight: the spot round the den farthest from everyone
        let best = null, bd = -1;
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * Math.PI * 2, x = d.x + Math.cos(a) * (P.dens?.range ?? 220) * 0.4, z = d.z + Math.sin(a) * (P.dens?.range ?? 220) * 0.4;
          if (!activeChunk(x, z) || settled(x, z)) continue;
          const pd = Math.min(...people.map(p => Math.hypot(p.x - x, p.z - z)), Infinity);
          if (pd > bd) { bd = pd; best = [x, z]; }
        }
        if (best && bd > (P.spawnClear ?? 55) && SP[d.kind] && place(d.kind, best[0], best[1], { den: d.id }).length) st.up = true;
      }
      if (!st.up || !pack.length) {   // asleep, or just woken (its animals look about from the next think)
        // howls carry from deep in wolf country at night, hunting or not
        if (d.kind === 'wolf' && state.night && near <= (P.howl?.range ?? 900) && rng() < (P.howl?.chance ?? 0.05)) howl(d, pack[0]);
        continue;
      }
      if (pack.some(e => e.wm.mode === 'stalk' || e.wm.mode === 'hunt' || e.wm.mode === 'back')) { huntCheck(d, pack, people); continue; }
      if (d.kind === 'wolf' && state.night && near <= (P.howl?.range ?? 900) && rng() < (P.howl?.chance ?? 0.05)) howl(d, pack[0]);
      // look for a small group to hunt near the den: at night, very rarely by day
      const lead = pack[0], sp = SP[d.kind];
      if ((lead.wm.calm ?? -1) > state.tick) continue;   // just broke off a fight
      if (sp.predator !== 'lone' && pack.length <= Math.ceil(Math.max(...pack.map(e => e.wm.size || 1)) * (H.breakAt ?? 0.5)) && pack.length < Math.max(...pack.map(e => e.wm.size || 1))) continue;   // a beaten pack no longer hunts
      const chance = (sp.predator === 'lone' ? H.loneChance ?? 0.1 : H.chance ?? 0.35) * (state.night ? 1 : H.dayFactor ?? 0.04);
      if (rng() >= chance) continue;
      let prey = null, pd = Infinity;
      for (const p of people) {
        if (!state.clans?.[p.owner] || settled(p.x, p.z)) continue;
        const d2 = dist(p, lead);
        if (d2 > (H.range ?? 260) || d2 >= pd) continue;
        const group = people.filter(o => o.owner === p.owner && dist(o, p) <= (H.groupRadius ?? 18)).length;
        if (group > (H.smallGroup ?? 4)) continue;
        if (p.worker && (group > 1 || rng() >= (H.workerChance ?? 0.25))) continue;   // a lone worker on a night route, rarely
        prey = p; pd = d2;
      }
      if (prey) startHunt(d, pack, prey.owner, prey, false);
    }
  }
  function howl(d, lead) {
    state.casts.push({ kind: 'wolfHowl', species: 'wolf', den: d.id, x: lead?.x ?? d.x, z: lead?.z ?? d.z, place: 'world', a: lead?.id ?? null });
  }
  // The pack (or bear) goes for a clan: it closes in on the prey first unless it was hit (then it fights at once)
  function startHunt(d, pack, clan, prey, provoked) {
    const H = P.hunt || {}, until = state.tick + secs(provoked ? H.seconds ?? 90 : H.stalkSeconds ?? 120);
    for (const e of pack) {
      (e.angry ||= {})[clan] = until;
      Object.assign(e.wm, { mode: provoked ? 'hunt' : 'stalk', clan, prey: prey?.id ?? null, huntEnd: until, provoked: !!provoked || e.wm.provoked });
      stopPath(e);
    }
    const lead = pack[0];
    state.casts.push({ kind: 'wildHunt', species: lead.species, den: d.id, clan, x: lead.x, z: lead.z, place: 'world', a: lead.id, worker: !!prey?.worker, prey: prey?.id ?? null });
    // the clan is told when it is not there to see it: prey far from its hero (news_callouts.js names the region and pings the map)
    if (!provoked && prey) {
      const hero = Object.values(state.entities).find(e => e.type === 'hero' && e.owner === clan && !e.dead);
      if (!hero || hero.place !== 'world' || dist(hero, prey) > (H.alertFar ?? 60)) {
        state.news?.push({ kind: 'wildHunted', clan, species: lead.species, worker: !!prey.worker, x: prey.x, z: prey.z, region: regionName(prey.x, prey.z) });
        Object.assign(lead.wm, { alertPrey: prey.id, alertClan: clan, alertAt: [prey.x, prey.z], alertWorker: !!prey.worker });
      }
    }
    if (d.kind === 'wolf') howl(d, lead);
  }
  // Every think while hunting: break off at half strength (a bear when badly hurt), before a big group, or after a while
  function huntCheck(d, pack, people) {
    const H = P.hunt || {}, lead = pack[0], clan = lead.wm.clan, sp = SP[d.kind];
    const size = Math.max(...pack.map(e => e.wm.size || pack.length));
    const hurt = sp.predator === 'lone' ? lead.hp <= (lead.maxHp || statsOf(lead).hp) * (H.loneBreakAt ?? 0.3) : pack.length <= Math.ceil(size * (H.breakAt ?? 0.5)) && size > 1;
    const crowd = people.filter(p => p.owner === clan && dist(p, lead) <= (H.groupRadius ?? 18) + 4).length > (H.bigGroup ?? 9);
    const stalking = pack.some(e => e.wm.mode === 'stalk'), prey = people.some(p => p.owner === clan && pack.some(e => dist(p, e) <= (stalking ? (H.range ?? 260) + 40 : H.lose ?? 70)));
    if (hurt || crowd || !prey || pack.every(e => state.tick > (e.wm.huntEnd ?? 0))) endHunt(d, pack, hurt || crowd);
  }
  function endHunt(d, pack, run) {
    for (const e of pack) {
      delete e.angry; delete e.swing;
      const m = e.wm; delete m.prey; delete m.clan; delete m.huntEnd; delete m.provoked;
      stopPath(e);
      if (!run) { Object.assign(m, { mode: 'idle', until: state.tick + secs(range(R.alert || [3, 6])) }); continue; }
      // run back toward the den, well away from the fight
      const a = Math.atan2(d.z - e.z, d.x - e.x) + (rng() - 0.5) * 0.6, r = P.breakDistance ?? 60;
      const p = areas.nav.nearestFree(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r) || [d.x, d.z];
      Object.assign(m, { mode: 'flee', x: p[0], z: p[1], until: state.tick + secs(14), calm: state.tick + secs(P.calmSeconds ?? 60) });
    }
  }

  // Run from (fx, fz): a spot fleeDistance away, roughly straight away from it; the herd mates near it go too
  function flee(e, fx, fz, herd = true) {
    const m = e.wm;
    if (!m || (m.mode === 'flee' && state.tick < m.until - secs(1))) return;
    if (m.spent > state.tick) return;   // run down: it stands, spent, for a few seconds
    const T = R.tire || {};
    if (!predator(e) && (m.flights || 0) + 1 >= (T.spentAt ?? 4) && state.tick - (m.lastFlee ?? -1e9) < secs(T.window ?? 30) && state.tick - (m.spentFrom ?? -1e9) > secs(T.spentGap ?? 10)) {
      Object.assign(m, { mode: 'idle', until: state.tick + secs(T.spentSeconds ?? 5), spent: state.tick + secs(T.spentSeconds ?? 5), spentFrom: state.tick, flights: Math.max(0, (T.spentAt ?? 4) - 2) });
      stopPath(e);
      return;
    }
    const base = Math.atan2(e.z - fz, e.x - fx) + (rng() - 0.5) * 0.8, d = range(R.fleeDistance || [26, 40]);
    const p = areas.nav.nearestFree(e.x + Math.cos(base) * d, e.z + Math.sin(base) * d) || [e.x + Math.cos(base) * d, e.z + Math.sin(base) * d];
    Object.assign(m, { mode: 'flee', x: p[0], z: p[1], until: state.tick + secs(range(R.flee || [5, 9])), from: [fx, fz] });
    if (!predator(e)) {   // a deer or boar run off again and again tires, and a hurt one runs slower (Tim 2026-11-24: a doe could never be caught)
      m.flights = m.lastFlee != null && state.tick - m.lastFlee < secs(T.window ?? 30) ? (m.flights || 0) + 1 : 0;
      m.lastFlee = state.tick;
      pace(e);
    }
    delete e.swing;
    stopPath(e);
    if (!predator(e) && (!m.alarmed || state.tick - m.alarmed > secs(4))) { m.alarmed = state.tick; state.casts.push({ kind: 'wildAlarm', species: e.species, a: e.id, x: e.x, z: e.z, place: e.place }); }
    if (!herd) return;
    for (const o of animals()) if (o !== e && alive(o) && o.species === e.species && o.wm?.mode !== 'charge' && !hunting(o) && Math.hypot(o.x - e.x, o.z - e.z) <= (R.herdRadius ?? 10)) flee(o, fx, fz, false);
  }
  const hunting = e => ['stalk', 'hunt', 'back'].includes(e.wm?.mode);
  // the prey a clan was warned about (startHunt): tell the clan if it fell, forget it once the hunt is over
  function watchAlert(e) {
    const t = state.entities[e.wm.alertPrey], fell = !t || t.dead || t.downed;   // gone from the map: a dead unit is taken off
    if (t && !fell) e.wm.alertAt = [t.x, t.z];
    const [x, z] = e.wm.alertAt || [e.x, e.z];
    if (fell) state.news?.push({ kind: 'wildKilled', clan: e.wm.alertClan, species: e.species, worker: !!e.wm.alertWorker, down: !!t && !t.dead, x, z, region: regionName(x, z) });
    if (fell || !hunting(e)) for (const k of ['alertPrey', 'alertClan', 'alertAt', 'alertWorker']) delete e.wm[k];
  }
  // how fast a deer or boar runs (sim/stats.js movement): slower each time it is chased off again within tire.window, slower still when hurt
  function pace(e) {
    const T = R.tire || {}, m = e.wm, fresh = m.lastFlee == null || state.tick - m.lastFlee >= secs(T.window ?? 30);
    const k = (fresh ? 1 : Math.max(T.min ?? 0.5, 1 - (T.step ?? 0.15) * (m.flights || 0))) * (e.hp < e.maxHp ? T.wounded ?? 0.7 : 1);
    if (k < 1) m.pace = k; else delete m.pace;
  }

  // Hit by someone of a clan (sim/combat.js): a boar charges that clan, a deer runs, a wolf's pack or a bear fights it
  function provoke(t, clan) {
    if (!alive(t) || !t.wm) return;
    const sp = speciesOf(t), by = Object.values(state.entities).find(e => e.id === t.hitBy?.id);
    if (sp?.predator && clan) {
      const d = denOf(t.wm.den), pack = t.wm.den ? packOf(t.wm.den) : [t];
      if (!hunting(t) || t.wm.clan !== clan) startHunt(d || { id: null, kind: t.species }, pack.length ? pack : [t], clan, by, true);
      else for (const e of pack) { e.wm.mode = e.wm.mode === 'stalk' ? 'hunt' : e.wm.mode; e.wm.provoked = true; }
      return;
    }
    if (sp?.charge && clan) {
      (t.angry ||= {})[clan] = state.tick + secs(sp.charge.seconds ?? 6);
      if (t.wm.mode !== 'charge') { t.wm.mode = 'charge'; t.wm.chargeEnd = state.tick + secs(sp.charge.seconds ?? 6); state.casts.push({ kind: 'wildCharge', species: t.species, a: t.id, x: t.x, z: t.z, place: t.place }); }
      return;
    }
    flee(t, by?.x ?? t.x - 1, by?.z ?? t.z);
  }

  // Killed (sim/combat.js): the hide goes to the killer's clan at once, and the view flies it to the hero
  function killed(a, t) {
    const sp = speciesOf(t), clan = state.clans?.[a?.owner];
    delete t.angry;
    if (t.wm?.den) { const st = denState()[t.wm.den] ||= {}; st.lost = (st.lost || 0) + 1; }
    if (!sp?.drop || !clan) return;
    clan.hides ||= {};
    const hero = Object.values(state.entities).find(e => e.type === 'hero' && e.owner === a.owner);
    const give = item => {
      clan.hides[item] = (clan.hides[item] || 0) + 1;
      state.casts.push({ kind: 'wildDrop', clan: a.owner, item, a: a.id, hero: hero?.id ?? null, x: t.x, z: t.z, place: t.place });
    };
    give(sp.drop);
    for (const [item, chance] of Object.entries(sp.extra || {})) if (rng() < chance) give(item);   // a bear's gall, sometimes
    if (sp.gear?.items?.length && rng() < (sp.gear.chance ?? 0)) gear(a.owner, sp.gear.items[Math.floor(rng() * sp.gear.items.length)]);   // W7: sometimes a wearable (the loot notice shows it)
    // the herd runs from the kill (a pack fights on until it breaks)
    if (!sp.predator) for (const o of animals()) if (o !== t && alive(o) && !predator(o) && Math.hypot(o.x - t.x, o.z - t.z) <= (R.herdRadius ?? 10) * 1.5) flee(o, t.x, t.z, false);
  }

  // What scares animals this tick: people close by (farther when they run or ride, nearer when hidden), and noise
  function fearOf(e, people) {
    const F = { ...(R.fear || {}), ...(speciesOf(e)?.fear || {}) }, k = predator(e) ? P.fearScale ?? 0.6 : 1;   // wild horses: their own (wildlife W6)
    let best = null, bd = Infinity;
    for (const p of people) {
      const reach = (p.hidden ? F.hidden ?? 4 : p.mounted || p.ride ? F.mounted ?? 16 : F.crew != null && p.type !== 'hero' ? F.crew : p.anim === 'run' ? F.run ?? 13 : F.walk ?? 7) * k;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d <= reach && d < bd) { bd = d; best = [p.x, p.z]; }
    }
    return best;
  }
  function noises() {
    const N = R.noise || {}, out = [];
    for (const c of state.casts || []) if (N[c.kind] && (c.place ?? 'world') === 'world') out.push([c.x, c.z, N[c.kind]]);
    for (const h of state.hits || []) { const a = state.entities[h.a]; if (a?.place === 'world' && !a.wildlife) out.push([a.x, a.z, (statsOf(a).attackRange || 1) > 3 ? N.shot ?? 30 : N.melee ?? 10]); }
    return out;
  }

  // A wolf or bear on the hunt, one tick. stalk: close in on the prey; hunt: pick the weakest crew near and bite
  // (wolves fall back after each bite, 'back'); the den check (huntCheck) ends it.
  function huntStep(e, people) {
    const m = e.wm, unit = statsOf(e), H = P.hunt || {}, lone = speciesOf(e)?.predator === 'lone';
    if (m.mode === 'stalk') {
      const t = state.entities[m.prey];
      if (!t || !alive(t) || t.place !== 'world') { m.mode = 'hunt'; return; }
      if (dist(t, e) <= (H.closeIn ?? 14)) {   // in among them: the fight's own clock starts
        m.mode = 'hunt'; m.huntEnd = state.tick + secs(H.seconds ?? 90); (e.angry ||= {})[m.clan] = m.huntEnd; stopPath(e); return;
      }
      if (!toward(e, unit, t)) stuck(e); else delete m.stuck;
      return;
    }
    if (m.mode === 'back') {
      if (state.tick >= m.until || Math.hypot(m.x - e.x, m.z - e.z) < 0.8 || !moveTo(e, unit, m.x, m.z, false)) { stopPath(e); m.mode = 'hunt'; }
      return;
    }
    // hunt: finish a bite in progress, then (wolves) fall back a few strides
    if (e.swing) { attack(e, state.entities[e.swing.target]); m.bit = true; return; }
    if (m.bit && !lone) {
      delete m.bit;
      const t = state.entities[m.prey], a = t ? Math.atan2(e.z - t.z, e.x - t.x) + (rng() - 0.5) * 1.2 : rng() * Math.PI * 2, r = H.backOff ?? 6;
      const p = areas.nav.nearestFree(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r);
      if (p) { Object.assign(m, { mode: 'back', x: p[0], z: p[1], until: state.tick + secs(range(H.biteBack || [1.5, 3])) }); return; }
    }
    delete m.bit;
    // the prey: crew of that clan nearby, the weakest and the most cut off first; the hero only if nothing else is near (or it hit them)
    let t = state.entities[m.prey];
    if (!t || !alive(t) || t.owner !== m.clan || t.place !== 'world' || dist(t, e) > (H.reach ?? 30) || (state.tick + (+e.id || 0)) % 20 === 0) {
      let best = null, bs = Infinity;
      for (const p of people) {
        if (p.owner !== m.clan || dist(p, e) > (H.reach ?? 30)) continue;
        if (p.type === 'hero' && !lone) continue;
        const friends = people.filter(o => o !== p && o.owner === p.owner && dist(o, p) <= 5).length;
        const sc = dist(p, e) * 0.3 + (p.hp / (p.maxHp || statsOf(p).hp || 1)) * 12 + friends * 2;
        if (sc < bs) { bs = sc; best = p; }
      }
      if (!best) best = people.find(p => p.owner === m.clan && p.type === 'hero' && dist(p, e) <= (H.reach ?? 30) && (m.provoked || lone)) || null;
      if (best) m.prey = best.id;
      t = best;
    }
    if (!t) {   // nobody in reach: run after the nearest of them (the pack regroups on the fight)
      const far = people.filter(p => p.owner === m.clan && (p.type !== 'hero' || lone || m.provoked)).sort((a, b) => dist(a, e) - dist(b, e))[0];
      if (far && dist(far, e) <= (H.lose ?? 70) * 3 && toward(e, unit, far)) { delete m.stuck; return; }
      stopPath(e); e.anim = 'idle'; if (far) stuck(e); return;
    }
    attack(e, t);
  }

  // No way through to them (a pocket of forest, a river): after a couple of seconds this one gives the hunt up
  function stuck(e) {
    const m = e.wm;
    if ((m.stuck = (m.stuck || 0) + 1) < secs(2)) return;
    delete e.angry; delete m.stuck; delete m.prey; delete m.clan; delete m.huntEnd; delete m.provoked;
    stopPath(e); Object.assign(m, { mode: 'idle', until: state.tick + secs(range(R.alert || [3, 6])), calm: state.tick + secs((P.calmSeconds ?? 60) * 3) });
  }
  // Close in on t (the whole way, else by way of a nearer point)
  function toward(e, unit, t) {
    if (moveTo(e, unit, t.x, t.z, false)) return true;
    const d = dist(t, e), k = Math.min(1, (P.hunt?.leg ?? 40) / Math.max(d, 1));
    if (k >= 1) return false;
    const p = areas.nav.nearestFree(e.x + (t.x - e.x) * k, e.z + (t.z - e.z) * k);
    return !!p && moveTo(e, unit, p[0], p[1], false);
  }

  // One animal, one tick
  function step(e, people, noise) {
    const m = e.wm, unit = statsOf(e);
    if (!m || !alive(e)) return;
    if (hunting(e)) { huntStep(e, people); return; }
    if (m.held) { if (state.entities[m.held]?.catchCast?.horse === e.id) { e.anim = 'idle'; return; } delete m.held; }   // standing for the hero's catch (catchHorse)
    if (m.mode === 'charge') {
      for (const [clan, until] of Object.entries(e.angry || {})) if (state.tick >= until) delete e.angry[clan];
      if (e.angry && !Object.keys(e.angry).length) delete e.angry;
      const giveUp = speciesOf(e)?.charge?.giveUp ?? 10;
      if (e.angry && state.tick < m.chargeEnd && fightStep(e, giveUp)) return;
      if (e.swing) { fightStep(e, giveUp); return; }   // finish the bite it started
      delete e.angry; m.mode = 'idle';
      const near = people.filter(p => Math.hypot(p.x - e.x, p.z - e.z) < giveUp * 2).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
      flee(e, near?.x ?? e.x - 1, near?.z ?? e.z, false);
    }
    // looking about every few ticks (spread over the animals): anyone close, any noise in earshot
    if ((state.tick + (+e.id || 0)) % 5 === 0) {
      if (m.pace && m.mode !== 'flee') pace(e);   // rested
      const f = fearOf(e, people) || noise.find(([x, z, r]) => Math.hypot(x - e.x, z - e.z) <= r);
      if (f) flee(e, f[0], f[1]);
    }
    if (m.mode === 'flee') {
      if (Math.hypot(m.x - e.x, m.z - e.z) < 0.8 || state.tick > m.until || !moveTo(e, unit, m.x, m.z, false)) {
        stopPath(e);
        m.home = [e.x, e.z];   // a new home here, away from whatever scared it
        const d = m.den && denOf(m.den);
        if (d && Math.hypot(d.x - e.x, d.z - e.z) > (P.dens?.range ?? 220)) m.home = areas.nav.nearestFree(d.x, d.z) || m.home;   // a den animal goes back to its range
        Object.assign(m, { mode: 'idle', until: state.tick + secs(range(R.alert || [3, 6])) });
        delete m.from;
      }
      return;
    }
    if (m.mode === 'walk') {
      if (Math.hypot(m.x - e.x, m.z - e.z) < 0.6 || state.tick > m.until || !moveTo(e, unit, m.x, m.z, true)) {
        stopPath(e);
        const graze = !!speciesOf(e)?.graze && rng() < 0.6;
        Object.assign(m, { mode: graze ? 'graze' : 'idle', until: state.tick + secs(range(R.graze || [4, 10])) });
      }
      return;
    }
    // idle or grazing
    e.anim = m.mode === 'graze' ? 'graze' : 'idle';
    if (state.tick < m.until) return;
    const ang = rng() * Math.PI * 2, d = rng() * (predator(e) ? P.roam ?? 30 : R.wander ?? 10);
    const p = areas.nav.nearestFree(m.home[0] + Math.cos(ang) * d, m.home[1] + Math.sin(ang) * d);
    if (!p) { m.until = state.tick + secs(2); return; }
    Object.assign(m, { mode: 'walk', x: p[0], z: p[1], until: state.tick + secs(Math.hypot(p[0] - e.x, p[1] - e.z) / (unit.walk || 1) * 2 + 4) });
  }

  // Called once per tick after the units moved
  function tick() {
    if (!data || !areas || !ready()) return;
    catchTick();
    const people = Object.values(state.entities).filter(person);
    const noise = noises();
    for (const e of animals()) if (!e.dead) { if (e.wm?.alertPrey != null) watchAlert(e); step(e, people, noise); }
    if (state.tick % THINK !== 0) return;
    const marks = anchors(), all = animals().filter(alive);
    // gone again when none of the player's units is near (and it is not in a fight); den animals go with their den
    for (const e of all) {
      if (!activeChunk(e.x, e.z)) { remove(e.id); continue; }
      if (e.wm?.den) continue;
      const far = marks.every(a => Math.hypot(a.x - e.x, a.z - e.z) > (R.despawnDistance ?? 140));
      if (far && !e.angry) remove(e.id);
    }
    if (world && P.dens) denTick(marks, people);
    let count = animals().filter(e => alive(e) && !e.wm?.den).length;
    for (const a of marks) {
      if (count >= (R.maxTotal ?? 30)) break;
      const near = all.filter(e => state.entities[e.id] && !e.wm?.den && Math.hypot(a.x - e.x, a.z - e.z) <= (R.keepRadius ?? 120)).length;
      if (near >= (R.perAnchor ?? 10) || rng() >= (R.spawnChance ?? 0.3)) continue;
      count += spawnGroup(a, people).length;
    }
  }

  // Selling hides (W5, Tim 2026-11-24): what the clan has taken (clan.hides) the hero sells with Space at the built market
  // of one of its own towns, at data.market.prices ryo each; the coins fly into the market (render/chest_cash_fx.js)
  const M = () => data?.market || {};
  const carried = clan => Object.entries(state.clans?.[clan]?.hides || {}).filter(([, n]) => n > 0);
  const worth = clan => Math.round(carried(clan).reduce((v, [k, n]) => v + n * (M().prices?.[k] ?? 0), 0));
  const itemName = (k, n) => k.replace(/_/g, ' ') + (n > 1 ? 's' : '');
  function sellPoint(e) {
    if (!e || e.type !== 'hero' || e.place !== 'world' || e.dead || e.downed) return null;
    for (const s of Object.values(state.frontier?.settlements || {})) {
      if (s.owner !== e.owner || s.ruined || s.empty || !s.grid) continue;
      for (const b of s.buildings || []) {
        if (b.type !== 'market' || b.stage !== 'built') continue;
        const pts = (b.cells?.length ? b.cells : [b.cell]).filter(Number.isInteger).map(i => cellToWorld(s, i));
        if (!pts.length) continue;
        const x = pts.reduce((v, p) => v + p[0], 0) / pts.length, z = pts.reduce((v, p) => v + p[1], 0) / pts.length;
        if (Math.hypot(x - e.x, z - e.z) <= (M().reach ?? 12)) return { town: s, x, z };
      }
    }
    return null;
  }
  // Space's prompt there (main.js), or null
  function sellPrompt(e) {
    if (!e || !carried(e.owner).length || !sellPoint(e)) return null;
    return { text: `Space  Sell the hides here: ${worth(e.owner)} ryo` };
  }
  function sell(e) {
    const clan = state.clans?.[e?.owner], p = sellPoint(e), goods = carried(e?.owner);
    if (!clan || !p || !goods.length) return false;
    const ryo = worth(e.owner);
    clan.hides = {};
    creditRyo(state, clan, ryo, 'hides');
    state.casts.push({ kind: 'hidesSold', x: e.x, z: e.z, tx: p.x, tz: p.z, loot: { ryo }, sold: Object.fromEntries(goods), place: 'world', by: e.owner, a: e.id });
    clan.notice = { tick: state.tick, text: `Sold ${goods.map(([k, n]) => `${n} ${itemName(k, n)}`).join(', ')} at ${p.town.name || 'the market'} for ${ryo} ryo` };
    return true;
  }

  // Catching a wild horse (W6, Tim 2026-11-24): on foot the hero creeps up (Shift walks; running, riding or crew near
  // make the herd bolt) to within catch.reach of a calm one; on horseback he rides alongside one, running or not, within
  // catch.rideReach. Space catches her (nothing is thrown, Tim 2026-11-24: no lasso, no rope; warm light passes over her and she is saddled, render/tame_fx.js) and she is his (mounts.adopt).
  const CATCH = () => data?.catch || {};
  const NAMES = () => CATCH().names || ['Kaze'];
  function catchTarget(e) {
    if (!e || e.type !== 'hero' || e.place !== 'world' || e.dead || e.downed || e.aboard) return null;
    const reach = e.mounted || e.ride ? CATCH().rideReach ?? 4.5 : CATCH().reach ?? 5;
    let best = null, bd = Infinity;
    for (const a of animals()) {
      if (!alive(a) || !speciesOf(a)?.catchable || a.angry) continue;
      if (!(e.mounted || e.ride) && a.wm?.mode === 'flee') continue;
      const d = dist(a, e);
      if (d <= reach && d < bd) { bd = d; best = a; }
    }
    return best;
  }
  function catchPrompt(e) { return e?.catchCast ? { text: 'Space  Let her go' } : catchTarget(e) ? { text: 'Space  Catch her' } : null; }
  // Space starts a short catch (Tim 2026-11-26: so the hero is seen doing something, not a saddle just appearing):
  // catch.castSeconds with a cast bar, the hero holding a plain pole to her neck (render/tame_fx.js; never a rope or
  // loop) while she stands calm and glows. On foot he stands still (catch.standRange); riding he stays within
  // rideReach + 1. A hit, going down, her being hurt, or Space again ends it, and she bolts. Then she is saddled and his.
  // e.catchCast = { start, until, horse, x, z } (the cast bar and the pole read it); her e.wm.held = the hero's id.
  const say = (owner, text) => { const clan = state.clans?.[owner]; if (clan) clan.notice = { tick: state.tick, text }; };
  function catchHorse(e) {
    if (e?.catchCast) { stopCatch(e, 'You let her go'); return false; }
    const a = catchTarget(e);
    if (!a || !state.clans?.[e?.owner]) return false;
    const n = secs(CATCH().castSeconds ?? 1.5);
    if (n <= 0) return caught(e, a);
    e.catchCast = { start: state.tick, until: state.tick + n, horse: a.id, x: e.x, z: e.z };
    (state.catchCasts ||= {})[e.id] = 1;
    if (!(e.mounted || e.ride)) e.dir = dirIndex(a.x - e.x, a.z - e.z);   // he turns to her
    stopPath(a);
    Object.assign(a.wm, { held: e.id, mode: 'idle', until: state.tick + n + secs(2) });
    delete a.wm.from;
    a.anim = 'idle';
    return true;
  }
  function stopCatch(e, why) {
    const k = e?.catchCast, a = k && state.entities[k.horse];
    if (e) { delete e.catchCast; delete state.catchCasts?.[e.id]; }
    if (a?.wm?.held === e?.id) { delete a.wm.held; if (why && alive(a)) flee(a, e.x, e.z); }
    if (why && e) say(e.owner, why);
  }
  function catchTick() {
    for (const id of Object.keys(state.catchCasts || {})) {
      const e = state.entities[id], k = e?.catchCast, a = k && state.entities[k.horse];
      if (!k) { delete state.catchCasts[id]; continue; }
      if (e.dead || e.downed || e.jailed || e.place !== 'world' || e.aboard) { stopCatch(e, 'She got away'); continue; }
      if (!alive(a) || a.angry) { stopCatch(e, 'She got away'); continue; }
      if ((e.hitAt ?? -Infinity) > k.start || (a.hitAt ?? -Infinity) > k.start) { stopCatch(e, 'She bolts'); continue; }
      const riding = e.mounted || e.ride;
      if (riding ? dist(a, e) > (CATCH().rideReach ?? 4.5) + 1 : Math.hypot(e.x - k.x, e.z - k.z) > (CATCH().standRange ?? 0.6)) { stopCatch(e, 'You moved: she bolts'); continue; }
      if (state.tick >= k.until) { stopCatch(e); caught(e, a); }
    }
  }
  function caught(e, a) {
    const T = data?.types?.[a.type] || {}, name = NAMES()[Math.floor(rng() * NAMES().length)];
    const id = tame(e.owner, { x: a.x, z: a.z, kind: T.tamed || a.sprite || T.sprite, name, coat: a.coat });
    if (id == null) return false;
    state.casts.push({ kind: 'horseCaught', a: e.id, t: a.id, horse: id, dir: a.dir, x: e.x, z: e.z, tx: a.x, tz: a.z, place: 'world' });   // render/tame_fx.js
    const h = state.entities[id];
    if (h) h.dir = a.dir;
    for (const o of animals()) if (o !== a && alive(o) && o.species === a.species && dist(o, a) <= (R.herdRadius ?? 10) * 1.5) flee(o, e.x, e.z, false);   // the rest of the herd bolts
    remove(a.id);
    return true;
  }

  return { tick, provoke, killed, spawnGroup, place, flee, anchors, dens, sellPoint, sellPrompt, sell, catchTarget, catchPrompt, catchHorse, prices: () => M().prices || {}, startHunt: (denId, clan, prey) => { const d = denOf(denId); const pack = packOf(denId); if (d && pack.length) startHunt(d, pack, clan, prey, false); },
    saveState: () => ({ s }), loadState: d => { if (d && Number.isFinite(d.s)) s = d.s; } };
}

// The animal types join the unit types (data/units.json) so stats, swings and bars work as for anyone
export function withAnimalTypes(units, animals) {
  if (!units || !animals?.types) return units;
  return { ...units, types: { ...units.types, ...animals.types } };
}
