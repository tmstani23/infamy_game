// Owning businesses (docs/business_raids_plan.md): buying an unclaimed one, payouts at dawn,
// the house guards every owned business comes with (free, no upkeep, not yours to order), and
// attacking an unclaimed one at night: the owner calls the police, who come through the door in
// waves; beat them all, then hold the back room. state.attacks[businessId] is the attack in progress.
import { POLICE } from './police.js';
// Players and bots alike send [{ id, type: 'business', action: 'buy', business }] from a hero
// standing at the business's door ring. Prices and payouts: units.json rules.businesses
// (data/settings.json "businesses" lays over them).
// guardSpots(b) = where its guards stand ([{ x, z, place }]); spawn = the game's spawn
export function createBusinesses({ state, units, clans, payoutShare = () => 1, tierOf = () => 0, spawn = null, guardSpots = () => [], patrolSpots = () => [],
  roomOf = () => null, remove = null, addHeatGain = () => {} }) {
  const R = units?.rules?.businesses || {}, reach = units?.rules?.buyReach ?? 2.5;
  const G = units?.rules?.houseGuards || {}, guardCount = G.count ?? 0, guardWait = Math.round((G.replaceSeconds ?? 120) * 20);
  const [pauseMin, pauseMax] = G.patrolPauseSeconds || [3, 8], legTicks = 20 * 20;
  let seed = 97;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const A = { startSeconds: 5, waves: 3, wavesPerTier: 1, perWave: 2, bigWave: 3, bigWavesFrom: 0.5, waveGapSeconds: 5, officerHp: 1, hitHeat: 0, holdSeconds: 30, holdRadius: 2.5, heatAfterWin: 15, heatAfterLoss: 15, leaveSeconds: 10, ...units?.rules?.attack };
  state.attacks ||= {};
  const say = (clan, text) => { clan.notice = { tick: state.tick, text }; return text; };
  const name = b => b.kind.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

  // Can this hero buy that business now? { ok, why, price }; why = what the screen shows when not
  function canBuy(heroId, businessId) {
    const e = state.entities[heroId], b = state.businesses[businessId], clan = state.clans?.[e?.owner];
    const price = R[b?.kind]?.price;
    if (!b || !price) return { ok: false, why: 'Not for sale', price: null };
    if (b.owner) return { ok: false, why: b.owner === e?.owner ? 'Already yours' : 'Owned by another clan', price };
    if (!e || !clan || e.type !== 'hero' || e.dead || e.downed || e.jailed) return { ok: false, why: 'Your boss cannot buy now', price };
    if (!b.ring || e.place !== 'street' || Math.hypot(e.x - b.ring[0], e.z - b.ring[1]) > reach) return { ok: false, why: 'Walk to its door to buy', price };
    if ((clan.ryo || 0) < price) return { ok: false, why: `Need ${price} ryo`, price };
    return { ok: true, why: '', price };
  }

  // Can this hero attack that business now? { ok, why }
  function canAttack(heroId, businessId) {
    const e = state.entities[heroId], b = state.businesses[businessId], clan = state.clans?.[e?.owner];
    if (!b || !R[b.kind] || !b.room) return { ok: false, why: 'Nothing to attack' };
    if (b.owner) return { ok: false, why: b.owner === e?.owner ? 'Already yours' : 'Rival-owned: raid it with a War Lantern' };
    if (state.attacks[b.id]) return { ok: false, why: 'Under attack already' };
    if (!state.night) return { ok: false, why: 'Attack at night' };
    if (!e || !clan || e.type !== 'hero' || e.dead || e.downed || e.jailed) return { ok: false, why: 'Your boss cannot attack now' };
    if (Object.values(state.attacks).some(a => a.clan === clan.id)) return { ok: false, why: 'Already attacking another place' };
    if (!b.ring || e.place !== 'street' || Math.hypot(e.x - b.ring[0], e.z - b.ring[1]) > reach) return { ok: false, why: 'Walk to its door to attack' };
    return { ok: true, why: '' };
  }

  function command(e, c) {
    const clan = state.clans?.[e.owner], b = state.businesses[c.business];
    if (!clan || !b) return;
    if (c.action === 'buy') {
      const can = canBuy(e.id, b.id);
      if (!can.ok) return say(clan, can.why);
      clan.ryo -= can.price;
      clans.setOwner(b.id, clan.id);
      say(clan, `The ${name(b)} is yours`);
    }
    if (c.action === 'attack') {
      const can = canAttack(e.id, b.id);
      if (!can.ok) return say(clan, can.why);
      // waves by the business (R[kind].attackWaves: dearer = more), plus wavesPerTier per police tier, fixed now
      const room = roomOf(b), waves = (R[b.kind]?.attackWaves ?? A.waves) + A.wavesPerTier * tierOf(clan.id);
      // the back room: the floor spot furthest from the way in
      const far = patrolSpots(b).slice().sort((p, q) => Math.hypot(q.x - room.spawn.x, q.z - room.spawn.z) - Math.hypot(p.x - room.spawn.x, p.z - room.spawn.z))[0]
        || { x: room.spawn.x, z: room.spawn.z };
      state.attacks[b.id] = { business: b.id, kind: b.kind, room: room.name, clan: clan.id, hero: e.id, waves, wave: 0, phase: 'waves',
        startsAt: state.tick + secs(A.startSeconds), clearedAt: null, away: 0, heatBefore: clan.heat || 0,
        hold: { x: far.x, z: far.z, r: A.holdRadius }, holdLeft: secs(A.holdSeconds), holdTotal: secs(A.holdSeconds), holding: false };
      say(clan, `The ${name(b)} called the police: get inside, ${waves} waves are coming`);
    }
  }

  // --- Attacks on unclaimed businesses ---------------------------------------------
  const secs = s => Math.round(s * 20);
  const standing = u => u && !u.dead && !u.downed && !u.jailed;
  function spawnWave(a) {
    const room = roomOf(state.businesses[a.business]), kind = units?.rules?.attack?.officer || 'junsa';
    const model = units?.types?.[kind]?.sprite || 'police';
    // the later waves (past bigWavesFrom of them) bring bigWave officers instead of perWave
    const n = a.wave >= Math.ceil(a.waves * A.bigWavesFrom) ? A.bigWave : A.perWave;
    for (let i = 0; i < n; i++) {
      const id = spawn(kind, model, room.spawn.x + (i - (n - 1) / 2) * 0.9, room.spawn.z + 0.6, {
        owner: POLICE, cop: true, place: room.name, wave: a.business, waveClan: a.clan, angry: { [a.clan]: 1e12 } });
      // officerHp x a street officer's HP (tuned 2026-10-19: hero + 3 crew just about take the teahouse; the den needs a full crew and abilities)
      const o = state.entities[id];
      if (o?.maxHp) o.hp = o.maxHp = Math.round(o.maxHp * A.officerHp);
    }
    a.wave++;
  }
  function endAttack(a, won, why) {
    const clan = state.clans[a.clan], b = state.businesses[a.business];
    if (won) {
      clans.setOwner(b.id, clan.id);
      const want = a.heatBefore + A.heatAfterWin;
      addHeatGain(clan.id, want - (clan.heat || 0), 'Took the business');
      clan.heat = want;
      say(clan, `The ${name(b)} is yours`);
      for (const u of Object.values(state.entities)) if (u.wave === a.business) remove(u.id);
      delete state.attacks[a.business];
      return;
    }
    // the attack's heat is set once, win or lose (fighting the waves gives none, Tim 2026-10-19)
    const want = a.heatBefore + A.heatAfterLoss;
    addHeatGain(clan.id, want - (clan.heat || 0), 'Failed attack');
    clan.heat = want;
    say(clan, `Attack on the ${name(b)} failed: ${why}`);
    a.phase = 'over'; a.overAt = state.tick;
  }
  function attackTick() {
    for (const a of Object.values(state.attacks)) {
      const defenders = Object.values(state.entities).filter(u => u.wave === a.business && standing(u));
      if (a.phase === 'over') {
        // the officers finish arresting a downed boss, then go
        const h = state.entities[a.hero], busy = defenders.some(u => u.execute) || (h?.downed && !h.dead && h.place === a.room);
        if (!busy || state.tick - a.overAt > secs(20)) {
          for (const u of Object.values(state.entities)) if (u.wave === a.business) remove(u.id);
          delete state.attacks[a.business];
        }
        continue;
      }
      const hero = state.entities[a.hero];
      if (!standing(hero)) { endAttack(a, false, 'your boss went down'); continue; }
      const ours = Object.values(state.entities).filter(u => u.owner === a.clan && u.place === a.room && standing(u));
      a.away = ours.length ? 0 : a.away + 1;
      if (state.tick < a.startsAt) continue;              // a few seconds to get inside and set up
      if (a.away > secs(A.leaveSeconds)) { endAttack(a, false, 'you left the building'); continue; }
      if (a.phase === 'waves') {
        if (defenders.length) { a.clearedAt = null; continue; }
        a.clearedAt ??= a.wave ? state.tick : -Infinity;   // the first wave comes when the countdown ends
        if (state.tick - a.clearedAt < secs(A.waveGapSeconds)) continue;
        if (a.wave < a.waves) { spawnWave(a); a.clearedAt = null; continue; }
        a.phase = 'hold';
      }
      if (a.phase === 'hold') {
        // the timer runs while one of yours stands in the back room and nobody hostile does
        const inZone = list => list.some(u => Math.hypot(u.x - a.hold.x, u.z - a.hold.z) <= a.hold.r);
        a.holding = inZone(ours) && !inZone(defenders);
        if (a.holding && --a.holdLeft <= 0) endAttack(a, true);
      }
    }
  }

  // House guards: guardCount per owned business, standing inside it (e.guard = business id).
  // A new owner gets fresh guards at once (the old owner's walk off); a guard that dies is
  // replaced after replaceSeconds while the same clan still owns the place.
  // b.guards = { owner, due: [ticks when replacements arrive] }
  function guardTick() {
    if (!spawn || !guardCount) return;
    const all = Object.values(state.entities).filter(e => e.guard);
    for (const b of Object.values(state.businesses)) {
      if (!R[b.kind]) continue;
      const mine = all.filter(e => e.guard === b.id);
      if (b.guards?.owner !== (b.owner || null)) {
        for (const e of mine) remove(e.id);
        mine.length = 0;
        b.guards = b.owner ? { owner: b.owner, due: Array(guardCount).fill(state.tick) } : null;
        if (!b.guards) delete b.guards;
      }
      if (!b.guards) continue;
      const alive = mine.filter(e => !e.dead);
      while (alive.length + b.guards.due.length < guardCount) b.guards.due.push(state.tick + guardWait);
      patrol(b, alive);
      const spots = guardSpots(b);
      b.guards.due = b.guards.due.filter(t => {
        if (t > state.tick || !spots.length) return true;
        const taken = new Set(alive.map(e => e.guardSpot));
        const k = spots.findIndex((_, i) => !taken.has(i)), sp = spots[Math.max(0, k)];
        const id = spawn(G.type || 'guard', G.model || 'thug', sp.x, sp.z, { owner: b.owner, place: sp.place, guard: b.id, guardSpot: Math.max(0, k), order: { kind: 'station', x: sp.x, z: sp.z } });
        alive.push(state.entities[id]);
        return false;
      });
    }
  }

  // Guards stroll between spots across the building (patrolSpots), pausing a few seconds at each.
  // They stay on a station order, so anyone hostile who comes near gets fought as usual, and the
  // walk goes on once the fight is over. A leg that can't be finished (blocked) is given up after legTicks.
  function patrol(b, guards) {
    const spots = patrolSpots(b);
    if (spots.length < 2) return;
    for (const e of guards) {
      if (!e.order || e.order.kind !== 'station') continue;
      const at = Math.hypot(e.order.x - e.x, e.order.z - e.z) < 0.6;
      e.patrol ||= { next: Math.floor(rnd() * spots.length), wait: state.tick + 20 * pauseMin, leg: state.tick };
      if (at && !e.patrol.arrived) { e.patrol.arrived = true; e.patrol.wait = state.tick + Math.round(20 * (pauseMin + rnd() * (pauseMax - pauseMin))); }
      if ((at && state.tick >= e.patrol.wait) || state.tick - e.patrol.leg > legTicks) {
        const sp = spots[e.patrol.next % spots.length];
        e.patrol.next = (e.patrol.next + 1 + Math.floor(rnd() * (spots.length - 1))) % spots.length;
        e.patrol.arrived = false; e.patrol.leg = state.tick;
        e.order = { kind: 'station', x: sp.x, z: sp.z, patrol: true };
      }
    }
  }

  // At dawn every owned business pays its clan (nothing during a police Manhunt)
  function tick() {
    guardTick();
    attackTick();
    if (!state.dawn) return;
    for (const b of Object.values(state.businesses)) {
      const pay = R[b.kind]?.payout, clan = state.clans?.[b.owner];
      if (!pay || !clan) continue;
      const amount = Math.round(pay * payoutShare(clan.id));
      if (amount <= 0) { say(clan, `No payout from the ${name(b)}: the police are cracking down`); continue; }
      clan.ryo += amount;
      state.ryoGains.push({ clan: clan.id, amount, reason: `${name(b)} payout` });
    }
  }

  return { canBuy, canAttack, command, tick, rules: R, attackRules: A };
}
