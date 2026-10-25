// Police (docs/police_spec.md, data/police.json). Not a clan: a sim-side force that answers
// each clan's heat, through the same moves and swings as everyone else (game.js hands them in).
// Tiers: Watched = a patrol near the clan's last fight that goes for its units seen fighting;
// Wanted = a squad hunts the clan's hero; Manhunt = squads hunt the hero and crew.
// Officers knock units down and arrest them, never kill or execute: arrested crew sit in jail
// (until bailed out at the HQ); an arrested hero waits out his time greyed out at the HQ and walks out with less heat.
// Officers walk out of the police HQ (or in from the map edge when the map has none) and
// walk back when the clan's heat drops. Plain sim code, no three.js.
import { canInteract } from './interactions.js';
import { largeFights, retreatZone, retreatSpot } from './large_fights.js';
const TICK_RATE = 20, DT = 1 / TICK_RATE;
export const POLICE = 'police';    // the owner every officer has (not a clan: nobody hires or runs it)

// A jailed crew member (clan.jail, off the map until bailed out at the HQ) as a
// stand-in unit the panels can show, by its prisoner id ('jail1', ...), or null
export function prisonerOf(state, id) {
  for (const clan of Object.values(state.clans || {})) {
    const p = clan.jail?.find(p => p.id === id);
    if (p) return { id, type: p.unit, model: p.model, owner: clan.id, place: 'street', hp: 1, maxHp: 1, prisoner: p };
  }
  return null;
}

const DEFAULTS = {
  officer: 'junsa', sight: 18, seenFightingSeconds: 3, angrySeconds: 15, giveUpDistance: 25,
  spawnEverySeconds: 4, hitPoliceHeat: 10, arrestSeconds: 2, arrestReach: 8,
  bailShare: 0.5, heroJailSeconds: 60, heroJailHeat: 30,
  bribeHeat: 40, bribePerTier: 10, clinicScale: 2, clinicScaleFrom: 2, payoutCutFrom: 3,
  topInfamyHeatBonus: 0.25, noPoliceAreas: [], lostSeconds: 8, searchSeconds: 20, searchRadius: 5, bribeBlockSeconds: 5, replaceSeconds: 60,
  patrolFightSeconds: 30, patrolRadius: 12,
  dayPatrol: { hq: 4, box: 2 },
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
  // every police box on the map (the 2x map has two), officers come out of any of them
  const boxes = district.buildings.map((b, i) => ({ id: `b${i}`, ...b })).filter(b => (b.business || b.art) === 'police_box');
  const home = () => hq?.door || hq && [hq.x, hq.z];
  const edges = (district.edges || []).map(([x, z]) => nav.nearestFree(x, z) || [x, z]);

  // --- Tiers -----------------------------------------------------------------------
  const tierIndex = heat => R.tiers.reduce((k, t, i) => (heat >= t.min ? i : k), 0);
  const tierOf = clanId => tierIndex(state.clans?.[clanId]?.heat || 0);
  const clinicScale = clanId => (tierOf(clanId) >= R.clinicScaleFrom ? R.clinicScale : 1);
  // Business payouts (none exist yet): share a clan gets, 0 during a Manhunt
  const payoutShare = clanId => (tierOf(clanId) >= R.payoutCutFrom ? 0 : 1);
  const quiet = () => !!state.raidWindow;                  // no police during the night raid window
  // the rules' boxes plus the district's own (its forest outskirts)
  const noPoliceBoxes = [...R.noPoliceAreas, ...(district.noPoliceAreas || [])];
  const noPolice = (x, z) => noPoliceBoxes.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);

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
  const stations = [hq, ...boxes].filter(b => b?.door);
  const nextPatrol = {}, patrolOwed = {};

  // --- Notices ---------------------------------------------------------------------
  const say = (clan, text) => { clan.notice = { tick: state.tick, text }; return text; };

  // --- Arrests ---------------------------------------------------------------------
  // Called by the game when an officer finishes an arrest on a downed unit. Crew go to jail
  // until the player bails them out at the HQ, no time limit (Tim 2026-10-18); each prisoner
  // has an id ('jail1', ...) so the action bar and the selection panel can show it.
  // Bot clans' crew are taken away for good, like their carried-off crew.
  function jail(t) {
    const clan = state.clans?.[t.owner], ty = types[t.type];
    if (!clan) return;
    if (clan.bot) return;
    state.jailSeq = (state.jailSeq || 0) + 1;
    (clan.jail ||= []).push({ id: `jail${state.jailSeq}`, unit: t.type, model: t.model, bail: Math.round((ty?.price || 0) * R.bailShare) });
    say(clan, `Your ${t.type} was arrested: bail at the police HQ`);
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
    state.news.push({ kind: 'bossArrested', clan: h.owner, hero: h.id });
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
      (o.angry ||= {})[clanId] = Math.max(o.angry[clanId] ?? 0, state.tick + secs(R.angrySeconds));
      if (mind[o.id]) mind[o.id].leaving = false;
    }
  }

  // Quiet patrols respond to a witnessed assault without treating ordinary clan
  // fighting as a crime. Heat-based squads retain their existing tier rules.
  function witnessAssault(attacker, victim) {
    if (!state.clans?.[attacker.owner] || quiet()) return;
    for (const o of officers()) {
      if (o.wave || o.place !== attacker.place || dist(o, attacker) > R.sight || dist(o, victim) > R.sight) continue;
      (o.angry ||= {})[attacker.owner] = state.tick + secs(R.angrySeconds);
      const m = mind[o.id] ||= {}; m.leaving = false;
      if (o.routine) { o.clan = attacker.owner; m.fresh = false; }
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
    if (!clan || !canInteract(hero)) return null;
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
      release(clan, p);
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

  // --- Officers ----------------------------------------------------------------------
  // A clan's units the police can go after: on the street (indoors too at Most Wanted, where they
  // follow the hero in), standing, outside no-police areas
  const fair = (u, clanId) => u.owner === clanId && (u.place === 'street' || !!tierFor(clanId)?.relentless)
    && !u.dead && !u.downed && !u.jailed && !noPolice(u.x, u.z);

  // Every new officer comes out fresh: it patrols and only joins the hunt once it sees the
  // hero itself within sight (except at Most Wanted, where they always know where he is)
  function comeOut(clanId) {
    const kind = R.officer, model = statsOf(kind).sprite || kind, extra = { owner: POLICE, cop: true, clan: clanId };
    const from = [hq, ...boxes].filter(b => b?.door);
    let id;
    if (from.length) {
      const station = from[Math.floor(rng() * from.length)];
      extra.station = station.id;
      id = spawnOutside(kind, model, station, extra);
    }
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
    if (o.routine) {
      (patrolOwed[o.station] ||= []).push(state.tick + secs(R.replaceSeconds));
      return;
    }
    if (o.clan && !mind[o.id]?.leaving) (owed[o.clan] ||= []).push(state.tick + secs(R.replaceSeconds));
  }

  // How many officers each clan should have out, and send the rest home
  function staff() {
    for (const clan of Object.values(state.clans || {})) {
      const want = quiet() ? 0 : R.tiers[tierOf(clan.id)].officers || 0;
      const mine = officers().filter(o => !o.routine && o.clan === clan.id && !mind[o.id]?.leaving);
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

  function staffPatrols() {
    for (const station of stations) {
      const want = !state.night && !quiet() ? (station === hq ? R.dayPatrol.hq : R.dayPatrol.box) || 0 : 0;
      const mine = officers().filter(o => o.routine && o.station === station.id);
      patrolOwed[station.id] = (patrolOwed[station.id] || []).filter(t => t > state.tick);
      if (want && mine.length + patrolOwed[station.id].length < want && state.tick >= (nextPatrol[station.id] || 0)) {
        const kind = R.officer, model = statsOf(kind).sprite || kind;
        const id = spawnOutside(kind, model, station, { owner: POLICE, cop: true, routine: true, station: station.id });
        mind[id] = { fresh: true };
        nextPatrol[station.id] = state.tick + secs(R.spawnEverySeconds);
      }
      if (want) for (const o of mine) (mind[o.id] ||= {}).leaving = false;
    }
  }

  const dist = (e, u) => Math.hypot(u.x - e.x, u.z - e.z);
  const nearest = (e, list) => list.slice().sort((a, b) => dist(e, a) - dist(e, b))[0] || null;
  const heroOf = clanId => Object.values(state.entities).find(u => u.owner === clanId && u.type === 'hero' && !u.dead && !u.jailed);
  const tierFor = clanId => (state.clans?.[clanId] ? R.tiers[tierOf(clanId)] : null);
  const hunting = t => t?.hunt === 'hero' || t?.hunt === 'all';

  // Routine officers can join any nearby incident. They keep that assignment
  // through the normal pursuit/search, then resume their station's patrol.
  function assignPatrols() {
    for (const o of officers().filter(o => o.routine)) {
      const m = mind[o.id] ||= {};
      if (!quiet() && o.clan && ((o.angry?.[o.clan] || 0) > state.tick || o.swing || o.execute || knownFor(o) || searchFor(o))) continue;
      const candidates = !quiet() ? Object.values(state.entities).filter(u => {
        if (!state.clans?.[u.owner] || !fair(u, u.owner) || u.place !== o.place || dist(o, u) > R.sight) return false;
        const t = tierFor(u.owner);
        return (o.angry?.[u.owner] || 0) > state.tick || (hunting(t) && (u.type === 'hero' || t.hunt === 'all'))
          || (t?.hunt === 'fighting' && state.tick - (u.foughtAt ?? -Infinity) <= secs(R.seenFightingSeconds));
      }) : [];
      const target = nearest(o, candidates);
      if (target) { m.leaving = false; delete m.deadline; }
      if (target?.owner !== o.clan) {
        if (target) o.clan = target.owner; else delete o.clan;
        delete m.saw; m.x = null; m.until = null; m.fresh = !target;
      }
    }
  }

  // Once a tick: which officers see each hunted clan's hero? (Tim 2026-10-18: no radios) Each officer
  // keeps its own sighting (mind.saw = { x, z, seenAt }): it sees the hero itself within sight, or it
  // sees another officer chasing him within sight and takes over that officer's sighting (so a
  // chase spreads officer to officer, but still runs out lostSeconds after the last real sighting).
  // track[clan] = the latest sighting by anyone (for the screen and the tests).
  const chasing = (m, clanId) => m?.saw?.clan === clanId && state.tick - m.saw.seenAt <= secs(R.lostSeconds);
  function updateTracks() {
    for (const clan of Object.values(state.clans || {})) {
      const t = tierFor(clan.id), h = heroOf(clan.id);
      const mine = officers().filter(o => o.clan === clan.id && !mind[o.id]?.leaving);
      if (!hunting(t) || !h || quiet()) { delete track[clan.id]; for (const o of mine) if (mind[o.id]) delete mind[o.id].saw; continue; }
      const visible = h.place === 'street' && !h.downed && !noPolice(h.x, h.z);
      for (const o of mine) {
        const m = mind[o.id] ||= {};
        const sees = visible && o.place === 'street' && dist(o, h) <= R.sight;
        if (sees || t.relentless) m.saw = { clan: clan.id, x: h.x, z: h.z, seenAt: state.tick };
        if (sees) m.fresh = false;
      }
      // spread: an officer who sees a chasing officer joins in (a few passes so a chain can form)
      if (!t.relentless) for (let pass = 0; pass < 3; pass++) for (const o of mine) {
        const m = mind[o.id];
        const lead = mine.find(c => c !== o && c.place === o.place && chasing(mind[c.id], clan.id) && dist(o, c) <= R.sight
          && mind[c.id].saw.seenAt > (m.saw?.clan === clan.id ? m.saw.seenAt : -Infinity));
        if (lead) { m.saw = { ...mind[lead.id].saw }; m.fresh = false; }
      }
      const latest = mine.map(o => mind[o.id]?.saw).filter(s => s?.clan === clan.id).sort((a, b) => b.seenAt - a.seenAt)[0];
      if (latest) track[clan.id] = { x: latest.x, z: latest.z, place: 'street', seenAt: latest.seenAt };
    }
    // they just lost the hero (out of sight long enough, or he went indoors): news for the screen
    for (const clan of Object.values(state.clans || {})) {
      const h = heroOf(clan.id), now = !!knownHero(clan.id);
      if (hunted[clan.id] && !now && h && !h.downed && hunting(tierFor(clan.id))) state.policeNews?.push({ clan: clan.id, kind: 'lost' });
      hunted[clan.id] = now;
    }
  }
  // The hunted hero, while this officer knows where he is (it or an officer it saw chasing him saw
  // him less than lostSeconds ago, and he is still outside). Most Wanted: always.
  function knownFor(e) {
    const t = tierFor(e.clan), h = heroOf(e.clan);
    if (!h || !hunting(t) || quiet()) return null;
    if (t.relentless) return h;
    return h.place === 'street' && !h.downed && chasing(mind[e.id], e.clan) ? h : null;
  }
  // ...while any officer of the squad does (the screen's 'lost' news, Most Wanted following, tests)
  function knownHero(clanId) {
    const t = tierFor(clanId), h = heroOf(clanId);
    if (!h || !hunting(t) || quiet()) return null;
    if (t.relentless) return track[clanId] ? h : null;
    return officers().some(o => o.clan === clanId && knownFor(o)) ? h : null;
  }
  // Lost him a moment ago: the spot to search, until searchSeconds have passed. Not when he got
  // away into a building: then they just patrol on from there (Tim 2026-10-18, they used to search
  // round his door for 20 s and be waiting when he came out)
  const heroInside = clanId => { const h = heroOf(clanId); return !!h && h.place !== 'street'; };
  // this officer's spot to search: where it last knew he was, for searchSeconds after losing him
  function searchFor(e) {
    const k = mind[e.id]?.saw;
    if (!k || k.clan !== e.clan || knownFor(e) || heroInside(e.clan) || tierFor(e.clan)?.relentless
      || state.tick - k.seenAt > secs(R.lostSeconds + R.searchSeconds)) return null;
    return k;
  }
  // any officer of the squad searching (tests)
  function searchSpot(clanId) {
    for (const o of officers()) if (o.clan === clanId) { const k = searchFor(o); if (k) return k; }
    return null;
  }

  // Who this officer should go for, or null
  function targetOf(e) {
    const clan = state.clans?.[e.clan], tier = tierFor(e.clan);
    if (clan && tier?.hunt && !quiet()) {
      const theirs = Object.values(state.entities).filter(u => fair(u, e.clan));
      const inSight = theirs.filter(u => u.place === e.place && dist(e, u) <= R.sight);
      // Watched: its units seen fighting
      const seenFighting = inSight.filter(u => state.tick - (u.foughtAt ?? -Infinity) <= secs(R.seenFightingSeconds));
      if (hunting(tier)) {
        // Wanted / Manhunt: the hero while they know where he is; crew only when seen
        // (a downed hero is not a target: he is arrested instead. At Most Wanted knownHero still gives
        // him while he lies there, and indoors they used to stand swinging at him and never arrest, Tim 2026-10-18)
        let hero = knownFor(e);
        if (hero?.downed) hero = null;
        const here = hero && hero.place === e.place ? hero : null;
        // the squad goes for the hero, but deals with crew that get in the way while it chases him.
        // Wanted (hunt 'hero'): crew the hero left outside are left alone unless seen fighting, so
        // losing the squad indoors works with crew at the door too (Tim 2026-10-18: they stayed
        // angry at the crew and never went back to patrolling)
        const close = here ? nearest(e, inSight.filter(u => dist(e, u) <= 3 && u.place === e.place)) : null;
        if (hero || close || seenFighting.length || (tier.hunt === 'all' && inSight.length)) (e.angry ||= {})[e.clan] = state.tick + secs(R.angrySeconds);
        if (tier.hunt === 'hero') return close || here || nearest(e, seenFighting);
        if (here && dist(e, here) <= R.sight) return close || here;
        return nearest(e, inSight) || here;
      }
      if (seenFighting.length) {
        (e.angry ||= {})[e.clan] = state.tick + secs(R.angrySeconds);
        return nearest(e, seenFighting);
      }
    }
    // anyone it is angry at (they hit an officer, or were seen fighting a moment ago)
    let best = null, bd = e.wave ? Infinity : R.sight;     // business defenders (sim/businesses.js) see the whole room
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
    const hero = !fresh && knownFor(e);
    if (hero && hero.place === e.place) return [hero.x, hero.z, false];
    const k = !fresh && searchFor(e);
    if (k && m.search !== k.seenAt) { m.search = k.seenAt; m.x = null; m.until = null; }   // just lost him: go look
    if (!k) m.search = null;
    const inside = heroInside(e.clan);
    if (inside && !m.inside && m.x != null) { m.x = null; m.until = null; }        // he slipped indoors: patrol on now
    m.inside = inside;
    if (k) m.searchedAt = state.tick;
    if (m.x != null && state.tick < m.until) return null;           // waiting at a spot
    if (m.x != null && Math.hypot(m.x - e.x, m.z - e.z) > 0.6 && state.tick < m.deadline) return [m.x, m.z, !k];
    if (m.x != null && m.until == null) { m.until = state.tick + secs(k ? 1 + rng() * 2 : 3 + rng() * 5); stopPath(e); return null; }
    // patrol: round the clan's last fight while it is fresh, not one they already searched past and the hero isn't hiding indoors,
    // otherwise wander the streets on from where the officer is (Tim 2026-10-18: no more waiting
    // outside the door the hero went into), drifting back toward the HQ when far from it
    const lf = [clan?.lastFight, clan?.lastDisturbance].filter(Boolean).sort((a, b) => b.tick - a.tick)[0];
    const fight = !k && lf && !heroInside(e.clan) && state.tick - lf.tick <= secs(R.patrolFightSeconds) && !(m.searchedAt >= lf.tick);
    const station = stations.find(b => b.id === e.station);
    const [hx, hz] = station?.door || home() || [e.x, e.z];
    const back = Math.hypot(hx - e.x, hz - e.z) > R.patrolRadius * 3 && rng() < 0.5;
    const f = k || (fight ? lf : back ? { x: (e.x + hx) / 2, z: (e.z + hz) / 2 } : { x: e.x, z: e.z }), a = rng() * Math.PI * 2;
    const r = k ? rng() * R.searchRadius : fight ? 2 + rng() * 6 : R.patrolRadius * (0.5 + rng() * 0.5);
    let [x, z] = nav.nearestFree(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r) || [f.x, f.z];
    if (e.routine && !k && !fight) {
      // Keep ordinary patrols around town and their own station rather than
      // drifting into the forest or toward a different police building.
      for (let n = 0; n < 16 && (noPolice(x, z) || Math.hypot(x - hx, z - hz) > R.patrolRadius * 2
        || !nav.findPath(e.x, e.z, x, z)); n++) {
        const angle = rng() * Math.PI * 2, radius = R.patrolRadius * (0.5 + rng());
        [x, z] = nav.nearestFree(hx + Math.cos(angle) * radius, hz + Math.sin(angle) * radius) || [hx, hz];
      }
      if (noPolice(x, z) || !nav.findPath(e.x, e.z, x, z)) return null;
    }
    Object.assign(m, { x, z, until: null, deadline: state.tick + secs(Math.hypot(x - e.x, z - e.z) / statsOf(e).walk * 2.5 + 6) });
    return [x, z, !k];
  }

  function step(e) {
    const m = mind[e.id] ||= {}, unit = statsOf(e);
    if (e.dead || e.downed) return;
    // Finish an arrest already in progress, and preserve business attack defenders.
    if (!e.wave && !e.execute) {
      const zone = retreatZone(e, m, largeFights(state));
      if (zone) {
        delete e.swing; delete e.attackTarget;
        const spot = retreatSpot(e, zone, nav);
        if (Math.hypot(e.x - zone.x, e.z - zone.z) < zone.radius + 2 && spot) {
          if (moveTo(e, unit, ...spot, false)) return;
        }
        stopPath(e); e.anim = 'idle';
        return;
      }
    }
    if (e.routine) {
      const busy = !quiet() && (e.swing || e.execute || knownFor(e) || searchFor(e)
        || Object.entries(e.angry || {}).some(([c, until]) => until > state.tick && Object.values(state.entities)
          .some(u => u.owner === c && !u.dead && u.place === e.place && dist(e, u) <= R.giveUpDistance)));
      if ((state.night || quiet()) && !busy) {
        if (!m.leaving) { m.leaving = true; delete m.deadline; }
      }
    }
    // anger runs out, or ends when nobody of that clan is within giveUpDistance
    if (e.angry) {
      for (const [c, until] of Object.entries(e.angry)) {
        if (e.wave && c === e.waveClan) continue;          // business defenders stay after the attackers
        const near = Object.values(state.entities).some(o => o.owner === c && !o.dead && o.place === e.place && Math.hypot(o.x - e.x, o.z - e.z) <= R.giveUpDistance);
        const never = c === e.clan && tierFor(c)?.relentless;           // Most Wanted: they never give up
        // Wanted: once they lost the hero they calm down at once (patrol, blue ring), unless his
        // crew are fighting right here (at Manhunt his crew stay fair game on sight)
        const lost = c === e.clan && !never && tierFor(c)?.hunt === 'hero' && !knownFor(e)
          && !Object.values(state.entities).some(o => o.owner === c && !o.dead && o.place === e.place && dist(e, o) <= R.sight
            && state.tick - (o.foughtAt ?? -Infinity) <= secs(R.seenFightingSeconds));
        if (!never && (state.tick >= until || !near || quiet() || lost)) delete e.angry[c];
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
    // called in to defend a business (sim/businesses.js): wait in the room for the attackers
    if (e.wave) { e.anim = 'idle'; stopPath(e); return; }
    if (m.leaving) {
      if (e.place !== 'street') {
        if (e.routine) { if (!goThrough(e, 'street', unit)) e.anim = 'idle'; }
        else remove(e.id);
        return;
      }
      const station = stations.find(b => b.id === e.station);
      const destination = station?.door || home();
      const [hx, hz] = destination ? nav.nearestFree(...destination) || destination
        : edges.slice().sort((a, b) => Math.hypot(a[0] - e.x, a[1] - e.z) - Math.hypot(b[0] - e.x, b[1] - e.z))[0] || [e.x, e.z];
      m.deadline ??= state.tick + secs(Math.hypot(hx - e.x, hz - e.z) / unit.walk * 2.5 + 8);
      if (Math.hypot(hx - e.x, hz - e.z) < 1 || state.tick > m.deadline || !moveTo(e, unit, hx, hz, true)) remove(e.id);
      return;
    }
    // nothing to do indoors (he was arrested, or got out): back out to the street to patrol
    if (e.place !== 'street') { if (!goThrough(e, 'street', unit)) remove(e.id); return; }
    // a ninja's pebble (Distract, sim/game.js): walk over and look round there for a while
    const dz = e.distracted;
    if (dz && state.tick < dz.until) { if (Math.hypot(dz.x - e.x, dz.z - e.z) < 0.8 || !moveTo(e, unit, dz.x, dz.z, true)) { e.anim = 'idle'; stopPath(e); } return; }
    const goal = patrolSpot(e, m);
    if (!goal || !moveTo(e, unit, goal[0], goal[1], goal[2])) { e.anim = 'idle'; stopPath(e); }
  }

  // Called once per tick after the units moved
  function tick() {
    releaseHeroes();
    staff();
    staffPatrols();
    assignPatrols();
    updateTracks();
    for (const e of officers()) step(e);
    for (const id of Object.keys(mind)) if (!state.entities[id]) delete mind[id];
  }

  return { tick, provoke, witnessAssault, knockedOut, jail, jailHero, menu, bribeCost, bribeBlocked, tierOf, tierIndex,
    clinicScale, payoutShare, heatScale, knownHero, searchSpot, track, hq, box, mind, rules: R };
}
