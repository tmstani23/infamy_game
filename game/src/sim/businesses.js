// Owning businesses (docs/business_raids_plan.md): buying an unclaimed one, payouts at dawn,
// the house guards every owned business comes with (free, no upkeep, not yours to order), and
// attacking an unclaimed one at night: the owner calls the police, who come through the door in
// waves; beat them all, then hold the back room. Raiding a rival's business takes a War Lantern
// (bought at the moneylender's): planted at the door, a warm-up, then hold the back room.
// state.attacks[businessId] is the attack or raid (mode: 'raid') in progress.
import { POLICE } from './police.js';
import { canInteract, interactionActor } from './interactions.js';
import { isShinobiHQ } from './hq_raids.js';
// Players and bots alike send [{ id, type: 'business', action: 'buy', business }] from a hero
// standing at the business's door ring. Prices and payouts: units.json rules.businesses
// (data/settings.json "businesses" lays over them).
// guardSpots(b) = where its guards stand ([{ x, z, place }]); spawn = the game's spawn
export function createBusinesses({ state, units, clans, payoutShare = () => 1, tierOf = () => 0, spawn = null, guardSpots = () => [], patrolSpots = () => [],
  roomOf = () => null, remove = null, addHeatGain = () => {}, payoutBonus = () => 1, onRaidPlaced = () => {} }) {
  const R = units?.rules?.businesses || {}, reach = units?.rules?.buyReach ?? 2.5;
  const G = units?.rules?.houseGuards || {}, guardCount = G.count ?? 0;
  const [pauseMin, pauseMax] = G.patrolPauseSeconds || [3, 8], legTicks = 20 * 20;
  let seed = 97;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const A = { startSeconds: 5, waves: 3, wavesPerTier: 1, perWave: 2, bigWave: 3, bigWavesFrom: 0.5, waveGapSeconds: 5, officerHp: 1, hitHeat: 0, holdSeconds: 30, holdRadius: 2.5, heatAfterWin: 15, heatAfterLoss: 15, leaveSeconds: 10, ...units?.rules?.attack };
  const RD = { lanternPrice: 1200, lanternCarry: 1, warmupSeconds: 30, holdSeconds: 30, holdRadius: 2.5, maxCrewInside: 6, leaveSeconds: 10, knockSeconds: 4, knockReach: 1.6, ...units?.rules?.raid };
  state.attacks ||= {};
  const say = (clan, text) => { clan.notice = { tick: state.tick, text }; return text; };
  const name = b => isShinobiHQ(state, b) ? 'Shinobi HQ' : b.kind.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

  // Can this hero buy that business now? { ok, why, price }; why = what the screen shows when not
  function canBuy(heroId, businessId) {
    const b = state.businesses[businessId], e = actorFor(heroId, b), clan = state.clans?.[e?.owner];
    const price = R[b?.kind]?.price;
    if (!b || !price) return { ok: false, why: 'Not for sale', price: null };
    if (b.owner) return { ok: false, why: b.owner === e?.owner ? 'Already yours' : 'Owned by another clan', price };
    if (!canInteract(e) || !clan) return { ok: false, why: 'No available clan member can buy now', price };
    if (!b.ring || e.place !== 'street' || Math.hypot(e.x - b.ring[0], e.z - b.ring[1]) > reach) return { ok: false, why: 'Walk to its door to buy', price };
    if ((clan.ryo || 0) < price) return { ok: false, why: `Need ${price} ryo`, price };
    return { ok: true, why: '', price };
  }

  // Can this hero attack that business now? { ok, why }
  function canAttack(heroId, businessId) {
    const b = state.businesses[businessId], e = actorFor(heroId, b), clan = state.clans?.[e?.owner];
    if (!b || !R[b.kind] || !b.room) return { ok: false, why: 'Nothing to attack' };
    if (b.owner) return { ok: false, why: b.owner === e?.owner ? 'Already yours' : 'Rival-owned: raid it with a War Lantern' };
    if (state.attacks[b.id]) return { ok: false, why: 'Under attack already' };
    if (!state.night) return { ok: false, why: 'Attack at night' };
    if (!canInteract(e) || !clan || !canInteract(leader(clan.id))) return { ok: false, why: 'Your clan cannot attack now' };
    if (Object.values(state.attacks).some(a => a.clan === clan.id)) return { ok: false, why: 'Already attacking another place' };
    if (!b.ring || e.place !== 'street' || Math.hypot(e.x - b.ring[0], e.z - b.ring[1]) > reach) return { ok: false, why: 'Walk to its door to attack' };
    return { ok: true, why: '' };
  }

  // the hero standing at a business's door ring, on the street
  const atDoor = (e, b) => b.ring && e.place === 'street' && Math.hypot(e.x - b.ring[0], e.z - b.ring[1]) <= reach;
  const able = canInteract;
  const actorFor = (id, b) => interactionActor(state, id, e => !!b && atDoor(e, b)) || state.entities[id];
  const leader = clan => Object.values(state.entities).find(e => e.owner === clan && e.type === 'hero');

  // War Lantern at the moneylender's: { ok, why, price }
  function canBuyLantern(heroId, businessId) {
    const b = state.businesses[businessId], e = actorFor(heroId, b), clan = state.clans?.[e?.owner], price = RD.lanternPrice;
    if (!b || b.kind !== 'moneylender') return { ok: false, why: 'Not sold here', price };
    if (!able(e) || !clan) return { ok: false, why: 'Your boss cannot buy now', price };
    if ((clan.lanterns || 0) >= RD.lanternCarry) return { ok: false, why: `You can carry ${RD.lanternCarry}`, price };
    if (!atDoor(e, b)) return { ok: false, why: 'Walk to its door to buy', price };
    if ((clan.ryo || 0) < price) return { ok: false, why: `Need ${price} ryo`, price };
    return { ok: true, why: '', price };
  }

  // Raid a rival-owned business: { ok, why }
  function canRaid(heroId, businessId) {
    const b = state.businesses[businessId], e = actorFor(heroId, b), clan = state.clans?.[e?.owner];
    if (!b || (!R[b.kind] && !isShinobiHQ(state, b)) || !b.room) return { ok: false, why: 'Nothing to raid' };
    if (!b.owner || b.owner === e?.owner) return { ok: false, why: b.owner ? 'Already yours' : 'Unclaimed: buy or attack it' };
    if (state.attacks[b.id]) return { ok: false, why: 'Under attack already' };
    const recovery = isShinobiHQ(state, b) && state.hqRaids?.[b.id];
    if (recovery?.protectedUntil > state.tick) {
      const burning = recovery.suppressedUntil > state.tick;
      return { ok: false, why: burning ? `HQ burning: contracts reopen in ${Math.ceil((recovery.suppressedUntil - state.tick) / 20)} s`
        : `HQ protected for ${Math.ceil((recovery.protectedUntil - state.tick) / 20)} s` };
    }
    if (!state.night) return { ok: false, why: 'Raid at night' };
    if (!able(e) || !clan || !canInteract(leader(clan.id))) return { ok: false, why: 'Your clan cannot raid now' };
    if (!(clan.lanterns > 0)) return { ok: false, why: 'Needs a War Lantern (moneylender)' };
    if (Object.values(state.attacks).some(a => a.clan === clan.id)) return { ok: false, why: 'Already attacking another place' };
    if (!atDoor(e, b)) return { ok: false, why: 'Walk to its door to raid' };
    return { ok: true, why: '' };
  }

  // Defending (checkpoint 5): the owner's hero, standing by a raider's War Lantern, can knock it
  // down with a knockSeconds channel; moving or taking any hit cancels it. Ends the raid. { ok, why }
  function canKnock(heroId, businessId) {
    const a = state.attacks[businessId];
    const e = interactionActor(state, heroId, u => u.place === 'street' && a?.lantern && Math.hypot(u.x - a.lantern.x, u.z - a.lantern.z) <= RD.knockReach) || state.entities[heroId];
    if (!a || a.mode !== 'raid' || !a.lantern) return { ok: false, why: 'No War Lantern here' };
    if (a.defender !== e?.owner) return { ok: false, why: 'Not your business' };
    if (!able(e) || e.place !== 'street') return { ok: false, why: 'Your boss cannot do that now' };
    if (Math.hypot(e.x - a.lantern.x, e.z - a.lantern.z) > RD.knockReach) return { ok: false, why: 'Walk up to the lantern' };
    return { ok: true, why: '' };
  }

  // Doors: raiders wait out the warm-up outside; once open, at most maxCrewInside of their crew inside
  function entryStatus(e, place) {
    // a clan's home hideout is closed to every other clan (Tim 2026-10-20); the police can still follow in
    const home = Object.values(state.businesses).find(b => b.room === place && b.hideout);
    const a = Object.values(state.attacks).find(a => a.mode === 'raid' && a.room === place && a.clan === e.owner);
    if (home && state.clans?.[e.owner] && home.hideout !== e.owner
      && !(isShinobiHQ(state, home) && a?.hq && a.defender === home.owner))
      return { ok: false, why: `That is the ${state.clans[home.hideout]?.name || 'rival'} hideout: no way in` };
    if (a?.phase === 'warmup') return { ok: false, why: `The doors open in ${Math.ceil((a.opensAt - state.tick) / 20)} s` };
    if (a && e.type !== 'hero' && e.place !== place && crewSlots(e.owner, place) <= 0)
      return { ok: false, why: 'The raiding crew is full inside' };
    return { ok: true, why: '' };
  }
  function mayEnter(e, place) {
    const result = entryStatus(e, place);
    const clan = state.clans?.[e.owner];
    if (!result.ok && clan) say(clan, result.why);
    return result.ok;
  }
  function crewSlots(clanId, place) {
    const a = Object.values(state.attacks).find(a => a.mode === 'raid' && a.room === place && a.clan === clanId);
    if (!a) return Infinity;
    const inside = Object.values(state.entities).filter(u => u.owner === clanId && u.place === place && u.type !== 'hero' && !u.dead).length;
    return Math.max(0, RD.maxCrewInside - inside);
  }

  function command(e, c) {
    const b = state.businesses[c.business], a = state.attacks[c.business];
    e = c.action === 'knock' ? interactionActor(state, e.id, u => u.place === 'street' && a?.lantern && Math.hypot(u.x - a.lantern.x, u.z - a.lantern.z) <= RD.knockReach) || e : actorFor(e.id, b);
    const clan = state.clans?.[e?.owner];
    if (!clan || !b || !canInteract(e)) return;
    if (c.action === 'lantern') {
      const can = canBuyLantern(e.id, b.id);
      if (!can.ok) return say(clan, can.why);
      clan.ryo -= can.price;
      clan.lanterns = (clan.lanterns || 0) + 1;
      say(clan, 'You have a War Lantern: raid a rival business at night');
    }
    if (c.action === 'knock') {
      const can = canKnock(e.id, b.id);
      if (!can.ok) return say(clan, can.why);
      state.attacks[b.id].knock = { by: e.id, start: state.tick, ticks: secs(RD.knockSeconds), hp: e.hp, x: e.x, z: e.z };   // ticks: for the bars
      delete e.swing; delete e.attackTarget;   // hands on the lantern: no swinging while channelling
    }
    if (c.action === 'raid') {
      const can = canRaid(e.id, b.id);
      if (!can.ok) return say(clan, can.why);
      const room = roomOf(b);
      if (!room) return say(clan, 'No way into this building');
      clan.lanterns--;
      const far = patrolSpots(b).slice().sort((p, q) => Math.hypot(q.x - room.spawn.x, q.z - room.spawn.z) - Math.hypot(p.x - room.spawn.x, p.z - room.spawn.z))[0]
        || { x: room.spawn.x, z: room.spawn.z };
      // the lantern stands beside the door ring, on the other side from the owner's banner
      const ox = b.ring[0] - b.x, oz = b.ring[1] - b.z, len = Math.hypot(ox, oz) || 1;
      state.attacks[b.id] = { mode: 'raid', ...(isShinobiHQ(state, b) ? { hq: true } : {}), business: b.id, kind: b.kind, room: room.name, clan: clan.id, defender: b.owner, hero: leader(clan.id).id,
        phase: 'warmup', opensAt: state.tick + secs(RD.warmupSeconds), away: 0, lantern: { x: b.ring[0] + oz / len * 1.6, z: b.ring[1] - ox / len * 1.6 },
        hold: { x: far.x, z: far.z, r: RD.holdRadius }, holdLeft: secs(RD.holdSeconds), holdTotal: secs(RD.holdSeconds), holding: false };
      onRaidPlaced(b.owner);
      say(clan, `War Lantern planted: the doors open in ${RD.warmupSeconds} s`);
      const def = state.clans[b.owner];
      if (def) {
        say(def, `Your ${name(b)} is being raided`);
        state.news.push({ kind: 'businessAttack', clan: b.owner, business: b.id, name: name(b), raider: clan.id });
      }
    }
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
      state.attacks[b.id] = { business: b.id, kind: b.kind, room: room.name, clan: clan.id, hero: leader(clan.id).id, waves, wave: 0, phase: 'waves',
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
  // A raid: warm-up outside, then hold the back room against the owner's guards and crew
  function raidTick(a) {
    const b = state.businesses[a.business], clan = state.clans[a.clan];
    const end = (won, why) => {
      delete state.attacks[a.business];
      if (won && a.hq) {
        say(clan, 'You defeated the Shinobi HQ');
        const d = state.clans[a.defender];
        if (d) say(d, 'Your HQ raid defense was defeated');
        state.news.push({ kind: 'hqRaidWon', at: state.tick, business: b.id, raider: a.clan, defender: a.defender });
      }
      else if (won) { clans.setOwner(b.id, clan.id); say(clan, `The ${name(b)} is yours`); const d = state.clans[a.defender]; if (d) say(d, `You lost the ${name(b)}`); }
      else say(clan, `Raid on the ${name(b)} failed: ${why}`);
      // every clan hears about a won raid (Tim 2026-10-26): "X successfully raided Y's HQ / teahouse"
      if (won) state.news.push({ kind: 'raidWon', business: b.id, raider: a.clan, defender: a.defender, hq: !!a.hq, name: name(b) });
    };
    if (b.owner !== a.defender) return end(false, 'it changed hands');
    // the raiding boss going down doesn't end it (Tim 2026-10-20): during the warm-up only knocking
    // the War Lantern down does
    if (a.knock) {
      const k = a.knock, u = state.entities[k.by], def = state.clans[a.defender];
      if (!standing(u) || u.place !== 'street' || u.hp < k.hp || Math.hypot(u.x - k.x, u.z - k.z) > 0.3) {
        delete a.knock;
        if (def) say(def, 'Knocking down the lantern was interrupted');
      } else if (state.tick - k.start >= secs(RD.knockSeconds)) {
        if (def) say(def, 'You knocked down the War Lantern');
        state.news.push({ kind: 'lanternDown', business: b.id, raider: a.clan, defender: a.defender, x: a.lantern.x, z: a.lantern.z });
        return end(false, 'they knocked down your War Lantern');
      } else k.hp = u.hp;   // healing doesn't count as a hit
    }
    // the doors open: the War Lantern burns out and the fight moves to the back room, where everyone is
    // (Tim 2026-10-19: nobody inside can see a lantern out on the street); a.spot keeps where it stood
    if (a.phase === 'warmup') {
      if (state.tick >= a.opensAt) { a.phase = 'hold'; a.spot = a.lantern; a.lantern = null; delete a.knock; a.away = 0; state.news.push({ kind: 'doorsOpen', business: b.id, raider: a.clan }); }
      return;
    }
    // once the doors are open: nobody of yours inside for leaveSeconds in a row = lost (the screen
    // counts it down: get inside, Tim 2026-10-20)
    const ours = Object.values(state.entities).filter(u => u.owner === a.clan && u.place === a.room && standing(u));
    a.away = ours.length ? 0 : a.away + 1;
    if (a.away > secs(RD.leaveSeconds)) return end(false, 'nobody got inside');
    const theirs = Object.values(state.entities).filter(u => u.owner === a.defender && u.place === a.room && standing(u));
    const inZone = list => list.some(u => Math.hypot(u.x - a.hold.x, u.z - a.hold.z) <= a.hold.r);
    a.holding = inZone(ours) && !inZone(theirs);
    // alerts (Tim 2026-10-19): raiders step onto the back-room spot, or the owner's side steps in to contest it
    const zone = inZone(ours) ? (inZone(theirs) ? 'contested' : 'taking') : 'empty';
    if (zone !== 'empty' && zone !== a.zone) state.news.push({ kind: 'backRoom', state: zone, business: b.id, raider: a.clan, defender: a.defender });
    a.zone = zone;
    if (a.holding && --a.holdLeft <= 0) end(true);
  }

  function attackTick() {
    for (const a of Object.values(state.attacks)) {
      if (a.mode === 'raid') { raidTick(a); continue; }
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
  // replaced at the next dawn or dusk while the same clan still owns the place.
  // due entries are null while waiting for a transition, or a tick for immediate initial staffing.
  function guardTick() {
    if (!spawn || (!guardCount && !G.hideoutCount)) return;
    const all = Object.values(state.entities).filter(e => e.guard);
    for (const b of Object.values(state.businesses)) {
      // hideouts get their own guards too, patrolling the room (Tim 2026-10-20 harder steal):
      // clan.hideoutGuards (bot difficulty) or houseGuards.hideoutCount
      if (!R[b.kind] && !b.hideout) continue;
      const n = b.hideout ? (state.clans?.[b.owner]?.hideoutGuards ?? G.hideoutCount ?? 0) : guardCount;
      if (!n) continue;
      const mine = all.filter(e => e.guard === b.id);
      if (b.guards?.owner !== (b.owner || null)) {
        for (const e of mine) remove(e.id);
        mine.length = 0;
        b.guards = b.owner ? { owner: b.owner, due: Array(n).fill(state.tick) } : null;
        if (!b.guards) delete b.guards;
      }
      if (!b.guards) continue;
      const alive = mine.filter(e => !e.dead);
      // Release existing vacancies first: a guard killed on this transition waits for the next one.
      if (state.dawn || state.dusk) b.guards.due = b.guards.due.map(t => t === null ? state.tick : t);
      while (alive.length + b.guards.due.length < n) b.guards.due.push(null);
      patrol(b, alive);
      const spots = guardSpots(b);
      b.guards.due = b.guards.due.filter(t => {
        if (t === null || t > state.tick || !spots.length) return true;
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
        e.order = { ...e.order, kind: 'station', x: sp.x, z: sp.z, patrol: true };
      }
    }
  }

  // Reuse the guards' reachable indoor routes and pause/retry timing for crew.
  function patrolCrew(e) {
    if (!e.guard && e.order?.garrison && e.place !== 'street') patrol({ room: e.place }, [e]);
  }

  // At dawn every owned business pays its clan (nothing during a police Manhunt; more when the clan holds its whole quarter)
  function tick() {
    guardTick();
    attackTick();
    if (!state.dawn) return;
    for (const b of Object.values(state.businesses)) {
      const pay = R[b.kind]?.payout, clan = state.clans?.[b.owner];
      if (!pay || !clan) continue;
      // a Shinobi Sabotage contract held its mark here (sim/contracts.js): no payout this dawn
      if (b.sabotaged) { delete b.sabotaged; say(clan, `No payout from the ${name(b)}: sabotaged`); state.news.push({ kind: 'sabotaged', clan: clan.id, business: b.id }); continue; }
      const amount = Math.round(pay * payoutShare(clan.id) * (payoutShare(clan.id) > 0 ? payoutBonus(b) : 1));   // whole quarter held: sim/territory.js
      if (amount <= 0) { say(clan, `No payout from the ${name(b)}: the police are cracking down`); continue; }
      clan.ryo += amount;
      state.ryoGains.push({ clan: clan.id, amount, reason: `${name(b)} payout` });
    }
  }

  return { canBuy, canAttack, canBuyLantern, canRaid, canKnock, entryStatus, mayEnter, crewSlots, command, tick, patrolCrew, rules: R, attackRules: A, raidRules: RD };
}
