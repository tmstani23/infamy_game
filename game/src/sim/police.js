// Police (docs/police_spec.md, data/police.json). Not a clan: a sim-side force that answers
// each clan's heat, through the same moves and swings as everyone else (game.js hands them in).
// Tiers: Watched = a patrol near the clan's last fight that goes for its units seen fighting;
// Wanted = a squad hunts the clan's hero; Manhunt = squads hunt the hero and crew.
// Officers knock units down and arrest them, never kill or execute: arrested crew sit in jail
// (bail or wait); an arrested hero waits out his time greyed out at the HQ and walks out with less heat.
// Officers walk out of the police HQ (or in from the map edge when the map has none) and
// walk back when the clan's heat drops. Plain sim code, no three.js.
const TICK_RATE = 20, DT = 1 / TICK_RATE;
export const POLICE = 'police';    // the owner every officer has (not a clan: nobody hires or runs it)

const DEFAULTS = {
  officer: 'junsa', sight: 18, seenFightingSeconds: 3, angrySeconds: 15, giveUpDistance: 25,
  spawnEverySeconds: 4, hitPoliceHeat: 10, arrestSeconds: 2, arrestReach: 8,
  jailSeconds: 60, bailShare: 0.5, heroJailSeconds: 60, heroJailHeat: 30,
  bribeHeat: 20, bribePerTier: 10, clinicScale: 2, clinicScaleFrom: 2, payoutCutFrom: 3,
  topInfamyHeatBonus: 0.25, noPoliceAreas: [], lostSeconds: 8, searchSeconds: 20, searchRadius: 5, bribeBlockSeconds: 5, replaceSeconds: 60,
  tiers: [
    { name: 'Quiet', min: 0, officers: 0 },
    { name: 'Watched', min: 30, officers: 2, hunt: 'fighting' },
    { name: 'Wanted', min: 60, officers: 4, hunt: 'hero' },
    { name: 'Manhunt', min: 90, officers: 6, hunt: 'all' },
    { name: 'Most Wanted', min: 120, officers: 6, hunt: 'all', relentless: true },
  ],
};

// state: the game state; data: police.json; units: units.json; district: the map;
// spawn / spawnOutside / moveTo / stopPath / remove / statsOf / act come from the game rules.
// act = { swing(e), arresting(e), arrest(e, t), engage(e, t), hostile(a, b) }
export function createPolice({ state, data, units, district, nav, doors = [], spawn, spawnOutside, moveTo, stopPath, remove, statsOf, act, seed = 7171 }) {
  const R = { ...DEFAULTS, ...(data?.rules || {}) };
  const secs = s => Math.round(s / DT);
  const types = units?.types || {};
  let s = seed >>> 0;
  function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  // The police box (bribes) and the HQ (jail, bail, officers come and go), by business kind or art name
  const find = kind => {
    const i = district.buildings.findIndex(b => (b.business || b.art) === kind);
    return i < 0 ? null : { id: `b${i}`, ...district.buildings[i] };
  };
  const hq = find('police_hq'), box = find('police_box');
  const home = () => hq?.door || hq && [hq.x, hq.z];
  const edges = (district.edges || []).map(([x, z]) => nav.nearestFree(x, z) || [x, z]);

  // --- Tiers -----------------------------------------------------------------------
  const tierIndex = heat => R.tiers.reduce((k, t, i) => (heat >= t.min ? i : k), 0);
  const tierOf = clanId => tierIndex(state.clans?.[clanId]?.heat || 0);
  const clinicScale = clanId => (tierOf(clanId) >= R.clinicScaleFrom ? R.clinicScale : 1);
  // Business payouts (none exist yet): share a clan gets, 0 during a Manhunt
  const payoutShare = clanId => (tierOf(clanId) >= R.payoutCutFrom ? 0 : 1);
  const quiet = () => !!state.raidWindow;                  // no police during the night raid window
  const noPolice = (x, z) => R.noPoliceAreas.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);

  // Underdog rule: the clan with the most infamy (strictly) gains more heat. Infamy is the
  // clan's lifetime heat for now, until the infamy board exists.
  function heatScale(clanId) {
    const list = Object.values(state.clans || {}), me = state.clans?.[clanId];
    if (!me || !(me.infamy > 0) || list.length < 2) return 1;
    return list.every(c => c === me || (c.infamy || 0) < me.infamy) ? 1 + R.topInfamyHeatBonus : 1;
  }

  const officers = () => Object.values(state.entities).filter(e => e.owner === POLICE && !e.dead);
  const mind = {};       // per officer: { x, z, until, deadline, leaving } (server-side only)
  // Where the police last saw each hunted clan's hero: { x, z, seenAt } (server-side only).
  // Wanted and Manhunt squads only know where he is while an officer can see him (and for
  // lostSeconds after); then they search that spot for searchSeconds and go back to patrolling.
  // A relentless tier (Most Wanted) always knows, and follows him indoors.
  const track = {};
  const hunted = {};     // per clan: did they know where the hero was last tick (for the 'lost' news)
  const nextOut = {};    // per clan: tick the next officer may come out
  const owed = {};       // per clan: ticks at which knocked-out officers may be replaced (Tim 2026-10-18)

  // --- Notices ---------------------------------------------------------------------
  const say = (clan, text) => { clan.notice = { tick: state.tick, text }; return text; };

  // --- Arrests ---------------------------------------------------------------------
  // Called by the game when an officer finishes an arrest on a downed unit. Crew go to jail
  // (bot clans' crew are taken away for good, like their carried-off crew).
  function jail(t) {
    const clan = state.clans?.[t.owner], ty = types[t.type];
    if (!clan) return;
    if (clan.bot) return;
    (clan.jail ||= []).push({ unit: t.type, model: t.model, left: R.jailSeconds, bail: Math.round((ty?.price || 0) * R.bailShare) });
    say(clan, `Your ${t.type} was arrested`);
  }
  // An officer finished arresting the knocked-down hero (Tim 2026-10-18): he stands greyed out
  // beside the HQ door for heroJailSeconds (h.jailed = { until, len }, nobody can touch him), and the
  // clan's heat drops to heroJailHeat so he isn't hunted again straight away. Stand-in until the jail interior.
  function jailHero(h) {
    const clan = state.clans?.[h.owner];
    const ring = doors.find(d => d.menu === 'police_hq'), [dx, dz] = ring ? [ring.x, ring.z] : [h.x, h.z];
    const [x, z] = nav.nearestFree(dx + 2.2, dz + 0.6) || [dx, dz];
    delete h.downed; delete h.swing; delete h.execute; delete h.attackTarget; delete h.buffs; delete h.dash;
    Object.assign(h, { x, z, place: 'street', anim: 'idle', jailed: { until: state.tick + secs(R.heroJailSeconds), len: secs(R.heroJailSeconds) } });
    stopPath(h);
    if (clan) say(clan, `Your boss was arrested: out in ${R.heroJailSeconds}s`);
  }
  // Time served: out of the HQ door with full health
  function releaseHeroes() {
    for (const h of Object.values(state.entities)) {
      if (!h.jailed || state.tick < h.jailed.until) continue;
      const ring = doors.find(d => d.menu === 'police_hq'), [x, z] = ring ? [ring.x, ring.z] : [h.x, h.z];
      delete h.jailed;
      Object.assign(h, { x, z, hp: h.maxHp, anim: 'idle' });
      const clan = state.clans?.[h.owner];
      if (!clan) continue;
      say(clan, 'Your boss is out of jail');
      // heat drops to heroJailHeat on the way out (Tim 2026-10-18), shown as a cooling notice on the heat badge
      const drop = Math.round((clan.heat || 0) - R.heroJailHeat);
      if (drop > 0) { clan.heat = R.heroJailHeat; state.heatGains.push({ clan: clan.id, amount: -drop, reason: 'Out of jail' }); }
    }
  }

  // Somebody of a clan hit an officer: that officer and the ones near it go after the clan
  function provoke(t, clanId) {
    if (!state.clans?.[clanId]) return;
    for (const o of officers()) {
      if (o.place !== t.place || Math.hypot(o.x - t.x, o.z - t.z) > R.sight) continue;
      (o.angry ||= {})[clanId] = state.tick + secs(R.angrySeconds);
      if (mind[o.id]) mind[o.id].leaving = false;
    }
  }

  // --- Menus at the box and the HQ (the 'police' command) -------------------------
  // bribe: at the police box, takes bribeHeat off for bribePerTier ryo x (tier + 1)
  // bail: at the HQ, a jailed crew member walks out now for its bail
  const bribeCost = clanId => R.bribePerTier * (tierOf(clanId) + 1);
  // no bribes while an officer hit the hero in the last bribeBlockSeconds (Tim 2026-10-18)
  const bribeBlocked = hero => state.tick - (hero?.copHitAt ?? -Infinity) < secs(R.bribeBlockSeconds);
  function menu(hero, c, door) {
    const clan = state.clans?.[hero.owner];
    if (!clan || hero.type !== 'hero' || hero.dead) return null;
    if (c.action === 'bribe' && door?.menu === 'police_box') {
      if (!(clan.heat > 0)) return say(clan, 'Nothing to pay off');
      if (bribeBlocked(hero)) return say(clan, 'Not while the police are beating you');
      const cost = bribeCost(clan.id);
      if (clan.ryo < cost) return say(clan, `Not enough ryo (${cost} needed)`);
      clan.ryo -= cost;
      const before = clan.heat;
      clan.heat = Math.max(0, clan.heat - R.bribeHeat);
      state.heatGains.push({ clan: clan.id, amount: -Math.round(before - clan.heat), reason: 'Bribe' });
      return say(clan, `Paid ${cost} ryo: the police look away (-${R.bribeHeat} heat)`);
    }
    if (c.action === 'bail' && door?.menu === 'police_hq') {
      const p = clan.jail?.[c.prisoner];
      if (!p) return null;
      if (clan.ryo < p.bail) return say(clan, `Not enough ryo (${p.bail} needed)`);
      clan.ryo -= p.bail;
      clan.jail.splice(c.prisoner, 1);
      release(clan, p, hero);
      return say(clan, `Your ${p.unit} is out on bail (${p.bail} ryo)`);
    }
    return null;
  }
  function release(clan, p, hero = Object.values(state.entities).find(e => e.owner === clan.id && e.type === 'hero')) {
    const extra = { owner: clan.id, hp: types[p.unit]?.hp, ...(hero ? { order: { kind: 'follow', target: hero.id } } : {}) };
    const model = p.model || types[p.unit]?.sprite;
    if (hq) spawnOutside(p.unit, model, hq, extra);
    else { const [x, z] = edges[0] || [0, 0]; spawn(p.unit, model, x, z, extra); }
  }
  function jailTick() {
    for (const clan of Object.values(state.clans || {})) {
      for (const p of [...(clan.jail || [])]) {
        if ((p.left = Math.max(0, p.left - DT)) > 0) continue;
        clan.jail.splice(clan.jail.indexOf(p), 1);
        release(clan, p);
        say(clan, `Your ${p.unit} is out of jail`);
      }
    }
  }

  // --- Officers ----------------------------------------------------------------------
  // A clan's units the police can go after: on the street, standing, outside no-police areas
  const fair = (u, clanId) => u.owner === clanId && u.place === 'street' && !u.dead && !u.downed && !u.jailed && !noPolice(u.x, u.z);

  // Every new officer comes out fresh: it patrols and only joins the hunt once it sees the
  // hero itself within sight (except at Most Wanted, where they always know where he is)
  function comeOut(clanId) {
    const kind = R.officer, model = statsOf(kind).sprite || kind, extra = { owner: POLICE, cop: true, clan: clanId };
    const from = [hq, box].filter(b => b?.door);
    let id;
    if (from.length) id = spawnOutside(kind, model, from[Math.floor(rng() * from.length)], extra);
    else {
      // no HQ on the map: in from the map edge nearest the clan's last fight
      const f = state.clans[clanId].lastFight || { x: 0, z: 0 };
      const w = edges.slice().sort((a, b) => Math.hypot(a[0] - f.x, a[1] - f.z) - Math.hypot(b[0] - f.x, b[1] - f.z))[0];
      if (!w) return;
      id = spawn(kind, model, w[0], w[1], extra);
    }
    mind[id] = { fresh: true };
  }
  // An officer was knocked out: its clan's squad is one short for replaceSeconds
  function knockedOut(o) {
    if (o.clan && !mind[o.id]?.leaving) (owed[o.clan] ||= []).push(state.tick + secs(R.replaceSeconds));
  }

  // How many officers each clan should have out, and send the rest home
  function staff() {
    for (const clan of Object.values(state.clans || {})) {
      const want = quiet() ? 0 : R.tiers[tierOf(clan.id)].officers || 0;
      const mine = officers().filter(o => o.clan === clan.id && !mind[o.id]?.leaving);
      // knocked-out officers still count until their replaceSeconds are up
      const list = owed[clan.id] || [];
      owed[clan.id] = want ? list.filter(t => t > state.tick) : [];
      if (mine.length + owed[clan.id].length < want && state.tick >= (nextOut[clan.id] || 0)) {
        comeOut(clan.id);
        nextOut[clan.id] = state.tick + secs(R.spawnEverySeconds);
      }
      // the extra ones walk home, unless something made them angry at somebody
      for (const o of mine.slice(want)) if (quiet() || !o.angry) Object.assign(mind[o.id] ||= {}, { leaving: true, deadline: undefined });
    }
  }

  const dist = (e, u) => Math.hypot(u.x - e.x, u.z - e.z);
  const nearest = (e, list) => list.slice().sort((a, b) => dist(e, a) - dist(e, b))[0] || null;
  const heroOf = clanId => Object.values(state.entities).find(u => u.owner === clanId && u.type === 'hero' && !u.dead && !u.jailed);
  const tierFor = clanId => (state.clans?.[clanId] ? R.tiers[tierOf(clanId)] : null);
  const hunting = t => t?.hunt === 'hero' || t?.hunt === 'all';

  // Once a tick: does any officer see each hunted clan's hero? (sight, street, not in a no-police area)
  function updateTracks() {
    for (const clan of Object.values(state.clans || {})) {
      const t = tierFor(clan.id), h = heroOf(clan.id);
      if (!hunting(t) || !h || quiet()) { delete track[clan.id]; continue; }
      const seen = t.relentless || (h.place === 'street' && !noPolice(h.x, h.z)
        && officers().some(o => o.place === 'street' && dist(o, h) <= R.sight));
      if (seen) track[clan.id] = { x: h.x, z: h.z, place: h.place, seenAt: state.tick };
    }
    // they just lost the hero (out of sight long enough, or he went indoors): news for the screen
    for (const clan of Object.values(state.clans || {})) {
      const h = heroOf(clan.id), now = !!knownHero(clan.id);
      if (hunted[clan.id] && !now && h && !h.downed && hunting(tierFor(clan.id))) state.policeNews?.push({ clan: clan.id, kind: 'lost' });
      hunted[clan.id] = now;
    }
  }
  // The hunted hero, while the police know where he is (seen, or lost less than lostSeconds ago and still outside)
  function knownHero(clanId) {
    const t = tierFor(clanId), h = heroOf(clanId), k = track[clanId];
    if (!h || !k || !hunting(t)) return null;
    if (t.relentless) return h;
    return h.place === 'street' && !h.downed && state.tick - k.seenAt <= secs(R.lostSeconds) ? h : null;
  }
  // Lost him a moment ago: the spot to search, until searchSeconds have passed
  function searchSpot(clanId) {
    const k = track[clanId];
    if (!k || knownHero(clanId) || state.tick - k.seenAt > secs(R.lostSeconds + R.searchSeconds)) return null;
    return k;
  }

  // Who this officer should go for, or null
  function targetOf(e) {
    const clan = state.clans?.[e.clan], tier = tierFor(e.clan);
    if (clan && tier?.hunt && !quiet()) {
      const theirs = Object.values(state.entities).filter(u => fair(u, e.clan));
      const inSight = theirs.filter(u => dist(e, u) <= R.sight);
      // Watched: its units seen fighting
      const seenFighting = inSight.filter(u => state.tick - (u.foughtAt ?? -Infinity) <= secs(R.seenFightingSeconds));
      if (hunting(tier)) {
        // Wanted / Manhunt: the hero while they know where he is; crew only when seen
        let hero = knownHero(e.clan);
        const m = mind[e.id];
        if (m?.fresh && hero && !tier.relentless) {
          if (hero.place === e.place && dist(e, hero) <= R.sight) m.fresh = false;   // seen him: joins the hunt
          else hero = null;
        }
        if (hero || inSight.length) (e.angry ||= {})[e.clan] = state.tick + secs(R.angrySeconds);
        const here = hero && hero.place === e.place ? hero : null;
        // the squad goes for the hero, but deals with crew that get in the way
        const close = nearest(e, inSight.filter(u => dist(e, u) <= 3 && u.place === e.place));
        if (tier.hunt === 'hero') return close || here;
        if (here && dist(e, here) <= R.sight) return close || here;
        return nearest(e, inSight) || here;
      }
      if (seenFighting.length) {
        (e.angry ||= {})[e.clan] = state.tick + secs(R.angrySeconds);
        return nearest(e, seenFighting);
      }
    }
    // anyone it is angry at (they hit an officer, or were seen fighting a moment ago)
    let best = null, bd = R.sight;
    for (const u of Object.values(state.entities)) {
      if (!u.owner || u.owner === POLICE || !act.hostile(e, u) || noPolice(u.x, u.z)) continue;
      const d = dist(e, u);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // A downed unit of a clan this officer is after, close by and with nobody standing over it
  function arrestable(e) {
    const list = Object.values(state.entities).filter(t => t.downed && !t.dead && t.owner && t.owner !== POLICE && state.clans?.[t.owner]
      && t.place === e.place && ((e.angry?.[t.owner] ?? -1) > state.tick || tierOf(t.owner) > 0) && dist(e, t) < R.arrestReach
      && !Object.values(state.entities).some(o => o.execute?.target === t.id));
    if (!list.length || Object.values(state.entities).some(o => act.hostile(e, o) && dist(e, o) < 2.5)) return null;
    return nearest(e, list);
  }

  // Walk to the door that leads toward `place` (out to the street first), and go through it
  function goThrough(e, place, unit) {
    const d = e.place !== 'street' ? nearest(e, doors.filter(d => d.to && d.place === 'street'))
      : doors.find(d => d.to && d.place === place);
    if (!d) return false;
    if (Math.hypot(d.x - e.x, d.z - e.z) < 1.2) { Object.assign(e, { x: d.to.x, z: d.to.z, place: d.place }); stopPath(e); return true; }
    return moveTo(e, unit, d.x, d.z, false);
  }

  // Where an officer with nothing to do walks: after the hero when they know where he is,
  // round the spot they lost him while searching, round the clan's last fight on a patrol
  function patrolSpot(e, m) {
    const clan = state.clans?.[e.clan];
    const fresh = m.fresh && !tierFor(e.clan)?.relentless;          // a new officer just patrols
    const hero = !fresh && knownHero(e.clan);
    if (hero && hero.place === e.place) return [hero.x, hero.z, false];
    const k = !fresh && searchSpot(e.clan);
    if (k && m.search !== k.seenAt) { m.search = k.seenAt; m.x = null; m.until = null; }   // just lost him: go look
    if (!k) m.search = null;
    if (m.x != null && state.tick < m.until) return null;           // waiting at a spot
    if (m.x != null && Math.hypot(m.x - e.x, m.z - e.z) > 0.6 && state.tick < m.deadline) return [m.x, m.z, !k];
    if (m.x != null && m.until == null) { m.until = state.tick + secs(k ? 1 + rng() * 2 : 3 + rng() * 5); stopPath(e); return null; }
    const f = k || clan?.lastFight || { x: e.x, z: e.z }, a = rng() * Math.PI * 2, r = k ? rng() * R.searchRadius : 2 + rng() * 6;
    const [x, z] = nav.nearestFree(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r) || [f.x, f.z];
    Object.assign(m, { x, z, until: null, deadline: state.tick + secs(Math.hypot(x - e.x, z - e.z) / statsOf(e.type).walk * 2.5 + 6) });
    return [x, z, !k];
  }

  function step(e) {
    const m = mind[e.id] ||= {}, unit = statsOf(e.type);
    if (e.dead || e.downed) return;
    // anger runs out, or ends when nobody of that clan is within giveUpDistance
    if (e.angry) {
      for (const [c, until] of Object.entries(e.angry)) {
        const near = Object.values(state.entities).some(o => o.owner === c && !o.dead && o.place === e.place && Math.hypot(o.x - e.x, o.z - e.z) <= R.giveUpDistance);
        const never = c === e.clan && tierFor(c)?.relentless;           // Most Wanted: they never give up
        if (!never && (state.tick >= until || !near || quiet())) delete e.angry[c];
      }
      if (!Object.keys(e.angry).length) delete e.angry;
    }
    if (act.swing(e)) return;
    if (act.arresting(e)) return;
    // Most Wanted: follow the hero through doors, indoors and back out
    const hero = !m.leaving && tierFor(e.clan)?.relentless && knownHero(e.clan);
    // ...but first deal with anyone fighting it right here (crew used to beat officers walking off)
    const close = hero && hero.place !== e.place
      && nearest(e, Object.values(state.entities).filter(u => u.owner !== POLICE && u.place === e.place && act.hostile(e, u) && dist(e, u) <= 3));
    if (close) { act.engage(e, close); m.x = null; return; }
    if (hero && hero.place !== e.place) { if (!goThrough(e, hero.place, unit)) e.anim = 'idle'; return; }
    if (!m.leaving) {
      const down = arrestable(e);
      if (down) { act.arrest(e, down); if (e.execute) { e.execute.len = secs(R.arrestSeconds); e.execute.arrest = true; return; } }
      const t = targetOf(e);
      if (t) { act.engage(e, t); m.x = null; return; }
    }
    if (m.leaving) {
      if (e.place !== 'street') { remove(e.id); return; }          // indoors: they just go
      const [hx, hz] = hq ? nav.nearestFree(...home()) || home()
        : edges.slice().sort((a, b) => Math.hypot(a[0] - e.x, a[1] - e.z) - Math.hypot(b[0] - e.x, b[1] - e.z))[0] || [e.x, e.z];
      m.deadline ??= state.tick + secs(Math.hypot(hx - e.x, hz - e.z) / unit.walk * 2.5 + 8);
      if (Math.hypot(hx - e.x, hz - e.z) < 1 || state.tick > m.deadline || !moveTo(e, unit, hx, hz, true)) remove(e.id);
      return;
    }
    const goal = patrolSpot(e, m);
    if (!goal || !moveTo(e, unit, goal[0], goal[1], goal[2])) { e.anim = 'idle'; stopPath(e); }
  }

  // Called once per tick after the units moved
  function tick() {
    jailTick();
    releaseHeroes();
    staff();
    updateTracks();
    for (const e of officers()) step(e);
    for (const id of Object.keys(mind)) if (!state.entities[id]) delete mind[id];
  }

  return { tick, provoke, knockedOut, jail, jailHero, menu, bribeCost, bribeBlocked, tierOf, tierIndex,
    clinicScale, payoutShare, heatScale, knownHero, searchSpot, track, hq, box, mind, rules: R };
}
