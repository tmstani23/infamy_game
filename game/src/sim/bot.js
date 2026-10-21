// Rival bot clan brain (docs/rival_bot_plan.md, B1-B5). A client like the player's screen: it
// reads the state, sees only what its clan sees (sim/vision.js), and sends the same commands as
// a player (walk intents, 'use' at doors, 'hire', 'business', 'order', 'attack', 'ability',
// 'police', 'loot', 'execute'). No hidden bonuses.
// Every thinkSeconds it picks a goal, top rule first: defend > bribe > buy > hire > raid >
// night attack > station crew > patrol. Every reactSeconds it handles the fighting: bandit
// hunts, ambushes, focus fire, going for your boss, finishing off downed crew, sending hurt crew
// to the clinic, abilities. Between thoughts it walks its boss toward the goal along the street grid.
// Knobs per difficulty: data/bots.json (Tim 2026-10-19: easy for now, built for all three).
// tick() returns this tick's commands for game.step.
import { SCREEN_RIGHT, SCREEN_DOWN } from './geometry.js';

const DET = SCREEN_RIGHT.x * SCREEN_DOWN.z - SCREEN_DOWN.x * SCREEN_RIGHT.z;
// a world direction as a WASD-style intent (right / down on screen), like input.js sends
const intentFor = (dx, dz) => ({ right: (dx * SCREEN_DOWN.z - dz * SCREEN_DOWN.x) / DET, down: (SCREEN_RIGHT.x * dz - SCREEN_RIGHT.z * dx) / DET });

export const BOT_DEFAULTS = {
  thinkSeconds: 2, reactSeconds: 1, reserve: 50, hireType: 'thug', stuckSeconds: 4,
  escort: 3, stationPerBusiness: 1, patrolChance: 0.5,
  attackChance: 0.5, attackMinCrew: 4, attackMaxHeat: 60,
  huntBandits: true, huntRange: 10, bribeAtHeat: 60,
  raidChance: 0.5, raidMinCrew: 6, raidReserve: 200, raidWhenWeak: false, memorySeconds: 60,
  ambush: false, ambushRange: 10, heroPriority: false, focusFire: false, executeDowned: false,
  retreatHp: 0, abilities: ['R'],
  revengeDowns: 2, revengeSeconds: 30, revengeRange: 14, fleeHp: 0.3, restUntilHp: 0.8, fleeInRaid: true,
};

export function createBot(game, { clan, hero, rules = {}, seed = 4242 }) {
  const B = { ...BOT_DEFAULTS, ...rules };
  const state = game.state, secs = s => Math.round(s * 20);
  // how often its crew finish off a downed enemy on their own when it is safe (game.js botExecute), per difficulty (Tim 2026-10-20)
  if (B.aggression !== undefined && state.clans[clan]) state.clans[clan].aggression = B.aggression;
  if (B.hideoutGuards !== undefined && state.clans[clan]) state.clans[clan].hideoutGuards = B.hideoutGuards;
  const U = game.settings.units.rules, reach = (U.buyReach ?? 2.5) - 0.6;
  const RD = game.businesses.raidRules;
  let goal = null, path = null, nextThink = 0, nextReact = 0, last = null, still = 0, raidPlan = false;
  const downs = [];   // rival bosses cutting its crew down: { by, tick } (revenge, Tim 2026-10-19)
  const seen = {};   // memory: business id -> { defenders, tick } (what it last saw there)
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);

  // --- what it knows ------------------------------------------------------------------
  const me = () => state.entities[hero];
  const myClan = () => state.clans[clan];
  const roomOf = name => game.rooms.find(rm => rm.name === name);
  const all = () => Object.values(state.entities);
  const biz = () => Object.values(state.businesses);
  const home = () => biz().find(b => b.hideout === clan && b.owner === clan);
  const standing = u => u && !u.dead && !u.downed && !u.jailed;
  const crew = () => all().filter(u => u.owner === clan && u.type !== 'hero' && !u.guard && standing(u));
  const followers = () => crew().filter(u => u.order?.kind === 'follow');
  const sees = e => game.vision.canSee(clan, e);
  const rivalClan = id => id && id !== clan && !!state.clans[id];
  const enemies = () => all().filter(e => rivalClan(e.owner) && standing(e) && sees(e));
  const near = (a, x, z, d) => a.place === 'street' && Math.hypot(a.x - x, a.z - z) <= d;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const crewRoom = () => game.clans.crewCount(clan) + myClan().queue.length < game.clans.crewCap(clan);
  const priceOf = b => game.businesses.rules[b.kind]?.price;
  const order = (units, kind, extra = {}) => units.length ? [{ id: hero, type: 'order', units: units.map(u => u.id), kind, ...extra }] : [];
  const canHireNow = () => {
    const price = game.clans.hirePrice(clan, B.hireType);
    return crewRoom() && price !== null && myClan().ryo - price >= B.reserve && myClan().queue.length < (U.maxQueue ?? 5);
  };

  // remember how many defenders it saw at rival businesses (scouting)
  function look() {
    for (const b of biz()) {
      if (!rivalClan(b.owner) || b.hideout) continue;
      const watched = all().some(u => u.owner === clan && standing(u) && (u.place === b.room || near(u, b.ring[0], b.ring[1], 8)));
      if (!watched) continue;
      const defenders = all().filter(e => e.owner === b.owner && standing(e) && sees(e) && (e.place === b.room || near(e, b.ring[0], b.ring[1], 8))).length;
      seen[b.id] = { defenders, tick: state.tick };
    }
  }
  const fresh = b => seen[b.id] && state.tick - seen[b.id].tick < secs(B.memorySeconds);

  // the first recovered crew member at the clinic it can pay to revive, or -1
  const readyPatient = c => c.clinic.findIndex(p => p.kind === 'recover' && p.left <= 0 && c.ryo >= game.clans.reviveCost(p, clan));

  // --- deciding (rules top first) ---------------------------------------------------------
  function think() {
    const c = myClan(), h = me();
    // 1 defend: a rival raids one of its businesses
    const raid = Object.values(state.attacks || {}).find(a => a.mode === 'raid' && a.defender === clan);
    if (raid) return { kind: 'defend', business: raid.business };
    // bribe the police at Wanted
    const box = game.doors.find(d => d.menu === 'police_box');
    if (box && c.heat >= B.bribeAtHeat && c.ryo >= (game.police?.bribeCost(clan) ?? Infinity)) return { kind: 'bribe' };
    // fetch its downed crew from the clinic once they have recovered (cheapest then; Tim 2026-10-19)
    if (readyPatient(c) >= 0) return { kind: 'revive' };
    // 3 expand: the dearest unclaimed business it can pay for (nearest first among equals)
    const buy = biz().filter(b => !b.owner && b.ring && priceOf(b) && priceOf(b) <= c.ryo)
      .sort((a, b) => priceOf(b) - priceOf(a) || dist(a, h) - dist(b, h))[0];
    if (buy) return { kind: 'buy', business: buy.id };
    // 2 hire at home up to the crew cap, keeping a little ryo back
    if (home() && canHireNow()) return { kind: 'hire', business: home().id };
    // 4 raid a rival's business with a War Lantern (needs a full raiding crew). Once it has made up
    // its mind (raidChance) it sticks to the plan: lantern, scout by day, raid at night
    const targets = biz().filter(b => rivalClan(b.owner) && !b.hideout && b.room && !state.attacks?.[b.id]);
    const able = targets.length && crew().length >= B.raidMinCrew && ((c.lanterns || 0) > 0 || c.ryo >= RD.lanternPrice + B.raidReserve);
    if (!able) raidPlan = false;
    else if (!raidPlan && rnd() < B.raidChance) raidPlan = true;
    if (raidPlan) {
      const stale = targets.find(b => !seen[b.id] || (!state.night && !fresh(b)));
      if (!(c.lanterns > 0)) return { kind: 'raid', business: targets[0].id };      // buys the lantern first
      if (stale) return { kind: 'scout', business: stale.id };
      const t = targets.slice().sort((a, b) => seen[a.id].defenders - seen[b.id].defenders)[0];
      // hard: only when the owner looks weak (its boss far from the place, or the police on it)
      const owner = all().find(e => e.owner === t.owner && e.type === 'hero');
      const weak = !B.raidWhenWeak || !owner || !sees(owner) || dist(owner, t) > 25 || (state.clans[t.owner]?.heat || 0) >= 60;
      if (weak && state.night) return { kind: 'raid', business: t.id };
    }
    // 3b at night, with a crew and the police not after it: attack an unclaimed business
    const open = biz().filter(b => !b.owner && b.room && priceOf(b) && !state.attacks?.[b.id]).sort((a, b) => dist(a, h) - dist(b, h))[0];
    if (open && state.night && crew().length >= B.attackMinCrew && (c.heat || 0) < B.attackMaxHeat && rnd() < B.attackChance
      && !Object.values(state.attacks || {}).some(a => a.clan === clan)) return { kind: 'attack', business: open.id };
    // keep busy: station a crew member in each of its businesses, then walk its streets
    const out = station();
    if (out.length) return { kind: 'now', out };
    const mine = biz().filter(b => b.owner === clan && b.ring);
    if (mine.length && rnd() < B.patrolChance) return { kind: 'patrol', business: mine[Math.floor(rnd() * mine.length)].id };
    return null;
  }
  // one crew member into each owned business (with a room) that has nobody of its own inside
  function station() {
    if (me().place !== 'street') return [];
    let spare = followers().filter(u => u.place === 'street').slice(B.escort);
    const out = [];
    for (const b of biz().filter(b => b.owner === clan && b.room && !b.hideout)) {
      const inside = crew().filter(u => u.place === b.room || (u.order?.kind === 'enter' && u.order.room === b.room)).length;
      for (let k = inside; k < B.stationPerBusiness && spare.length; k++) out.push(...order([spare.shift()], 'enter', { business: b.id }));
    }
    return out;
  }

  // --- walking ------------------------------------------------------------------------------
  // one tick toward (x, z); true when there
  function walk(out, x, z, near) {
    const h = me(), d = Math.hypot(x - h.x, z - h.z);
    if (d <= near) { path = null; return true; }
    let wx = x, wz = z;
    if (h.place === 'street') {
      if (!path || Math.hypot(path.gx - x, path.gz - z) > 0.5) path = { pts: game.nav.findPath(h.x, h.z, x, z) || [], gx: x, gz: z };
      while (path.pts.length > 1 && Math.hypot(path.pts[0][0] - h.x, path.pts[0][1] - h.z) < 0.4) path.pts.shift();
      if (path.pts.length > 1) [wx, wz] = path.pts[0];
    }
    out.push({ id: hero, type: 'move', ...intentFor(wx - h.x, wz - h.z) });
    return false;
  }
  // out of whatever room the boss is in; true once on the street
  function toStreet(out, units = []) {
    const h = me();
    if (h.place === 'street') return true;
    const rm = roomOf(h.place);
    if (rm && walk(out, rm.exit.x, rm.exit.z, 0.6)) out.push({ id: hero, type: 'use', units });
    return false;
  }
  const crewIds = () => crew().filter(u => u.place === me().place).map(u => u.id);

  // --- doing: true when the goal is over ----------------------------------------------------
  function act(out) {
    const h = me(), b = state.businesses[goal.business], c = myClan();
    switch (goal.kind) {
      case 'now': out.push(...goal.out); return true;
      case 'buy':
        if (b.owner) return true;                           // someone was quicker
        if (!toStreet(out)) return false;
        if (!walk(out, b.ring[0], b.ring[1], reach)) return false;
        out.push({ id: hero, type: 'business', action: 'buy', business: b.id });
        return true;
      case 'patrol':
        if (!toStreet(out)) return false;
        return walk(out, b.ring[0], b.ring[1], 1.5);
      case 'hire':
        if (goal.leaving) return toStreet(out);
        if (h.place === b.room) {
          // inside: put in every hire it can afford (one a tick, so the price updates), then leave
          if (!goal.sent && canHireNow()) { out.push({ id: hero, type: 'hire', business: b.id, unit: B.hireType }); goal.sent = true; return false; }
          goal.sent = false;
          if (canHireNow()) return false;
          goal.leaving = true;
          return false;
        }
        if (!toStreet(out)) return false;
        if (walk(out, b.ring[0], b.ring[1], 0.8)) out.push({ id: hero, type: 'use', units: [] });
        return false;
      case 'revive': {
        const door = game.doors.find(d => d.menu === 'clinic'), k = readyPatient(c);
        if (!door || k < 0) return true;
        if (!toStreet(out)) return false;
        if (!walk(out, door.x, door.z, 0.8)) return false;
        out.push({ id: hero, type: 'clinic', action: 'revive', patient: k });   // one a tick until none left it can pay for
        return false;
      }
      case 'bribe': {
        const box = game.doors.filter(d => d.menu === 'police_box').sort((a, d) => dist(a, h) - dist(d, h))[0];
        if (!box || c.heat < B.bribeAtHeat) return true;
        if (!toStreet(out)) return false;
        if (!walk(out, box.x, box.z, 0.8)) return false;
        out.push({ id: hero, type: 'police', action: 'bribe' });
        return true;
      }
      case 'defend': {
        // everyone to the raided place: crew hold the room, the boss knocks the War Lantern down
        const a = state.attacks?.[b.id];
        if (!a || a.mode !== 'raid') return true;
        // the doors are open (no lantern any more): the boss goes in and stands on the back-room spot too
        if (a.phase === 'hold' && h.place === a.room) { walk(out, a.hold.x, a.hold.z, a.hold.r * 0.5); return false; }
        if (!toStreet(out)) return false;
        if (!goal.sent) {
          out.push(...order(crew().filter(u => u.place === 'street'), a.phase === 'hold' ? 'enter' : 'attackmove',
            a.phase === 'hold' ? { business: b.id } : { x: a.lantern.x, z: a.lantern.z }));
          goal.sent = a.phase;
        } else if (goal.sent !== a.phase) goal.sent = false;   // the doors opened: send them in
        if (a.phase === 'hold') { if (walk(out, b.ring[0], b.ring[1], 0.8)) out.push({ id: hero, type: 'use', units: [] }); return false; }
        // hit while knocking it down (Tim 2026-10-20): fight back first, the lantern again once whoever
        // hit him is down or has stopped hitting for a few seconds (no more standing there re-channelling)
        const by = h.hitBy && state.tick - h.hitBy.tick < secs(5) && state.entities[h.hitBy.id];
        if (by && standing(by) && by.place === h.place && rivalClan(by.owner)) { out.push({ id: hero, type: 'attack', target: by.id }); return false; }
        if (!walk(out, a.lantern.x, a.lantern.z, RD.knockReach - 0.4)) return false;
        if (!a.knock && game.businesses.canKnock(hero, b.id).ok) out.push({ id: hero, type: 'business', action: 'knock', business: b.id });
        return false;
      }
      case 'scout': {
        // one crew member walks up to take a look; the goal ends when it has
        const s = state.entities[goal.scout];
        if (fresh(b)) { if (standing(s)) out.push(...order([s], 'follow')); return true; }
        if (!toStreet(out)) return false;
        if (!standing(s)) {
          const pick = followers().filter(u => u.place === 'street')[0];
          if (!pick) return true;
          goal.scout = pick.id;
          out.push(...order([pick], 'move', { x: b.ring[0], z: b.ring[1] }));
          goal.until = state.tick + secs(40);
        }
        if (state.tick > goal.until) { if (s) out.push(...order([s], 'follow')); return true; }
        return false;
      }
      case 'raid': case 'attack': return assault(out, b);
      case 'flee':
        if (h.place === b.room) return true;
        if (!toStreet(out)) return false;
        if (walk(out, b.ring[0], b.ring[1], 0.8)) out.push({ id: hero, type: 'use', units: [] });
        return false;
    }
    return true;
  }

  // a raid (with a War Lantern) or a night attack on an unclaimed business: lantern first if
  // needed, everyone along, at the door start it, go in when the doors open, hold the back room
  function assault(out, b) {
    const h = me(), c = myClan(), raid = goal.kind === 'raid';
    const a = state.attacks?.[b.id];
    if (goal.started) {
      if (!a || a.clan !== clan || a.phase === 'over') return true;        // won, lost or given up
      const open = raid ? a.phase === 'hold' : true;
      if (!open) { walk(out, b.ring[0], b.ring[1], 1.2); return false; }   // the warm-up: wait by the door
      if (h.place === 'street') {
        if (walk(out, b.ring[0], b.ring[1], 0.8)) out.push({ id: hero, type: 'use', units: crew().filter(u => u.place === 'street').map(u => u.id) });
        return false;
      }
      walk(out, a.phase === 'hold' ? a.hold.x : h.x, a.phase === 'hold' ? a.hold.z : h.z, 0.8);   // waves: fight where it stands
      return false;
    }
    if (raid ? b.owner === clan || !rivalClan(b.owner) : b.owner) return true;
    if (!toStreet(out)) return false;
    if (raid && !(c.lanterns > 0)) {
      const ml = biz().find(m => m.kind === 'moneylender');
      if (!ml || c.ryo < RD.lanternPrice) return true;
      if (walk(out, ml.ring[0], ml.ring[1], reach)) out.push({ id: hero, type: 'business', action: 'lantern', business: ml.id });
      return false;
    }
    if (!state.night) return true;                                 // keeps the lantern for another night
    if (!goal.called) { out.push(...order(crew().filter(u => u.place === 'street'), 'follow')); goal.called = true; }
    if (!walk(out, b.ring[0], b.ring[1], reach)) return false;
    out.push({ id: hero, type: 'business', action: raid ? 'raid' : 'attack', business: b.id });
    goal.started = true;
    if (raid) raidPlan = false;
    return false;
  }

  // --- fighting (every reactSeconds) ----------------------------------------------------------
  function react(out) {
    const h = me(), foes = enemies().filter(e => e.place === h.place);
    const mine = crew().filter(u => u.place === h.place);
    const close = (e, d) => mine.some(u => dist(u, e) <= d) || dist(h, e) <= d;
    // hurt crew to the clinic (medium / hard)
    if (B.retreatHp > 0 && h.place === 'street') {
      const hurt = mine.filter(u => u.hp < u.maxHp * B.retreatHp && u.order?.kind !== 'heal');
      out.push(...order(hurt, 'heal'));
    }
    const fighters = mine.filter(u => u.order?.kind !== 'heal' && u.order?.kind !== 'enter');
    const fighting = foes.filter(e => close(e, 6));
    // focus fire (hard) or go for the rival boss (hard). Revenge, any level (Tim 2026-10-19): a rival
    // boss who cuts down revengeDowns of its crew near its own boss within revengeSeconds gets everyone on him
    const angry = fighting.find(e => e.type === 'hero' && downs.filter(d => d.by === e.id && state.tick - d.tick < secs(B.revengeSeconds)).length >= B.revengeDowns);
    if (angry) { if (goal?.kind !== 'flee') out.push({ id: hero, type: 'attack', target: angry.id }); out.push(...order(mine.filter(u => u.order?.kind !== 'heal'), 'attack', { target: angry.id, resume: true })); }
    const boss = angry || (B.heroPriority && fighting.find(e => e.type === 'hero'));
    const focus = boss || (B.focusFire && fighting.slice().sort((a, b) => a.hp - b.hp)[0]);
    if (focus) out.push(...order(fighters, 'attack', { target: focus.id, resume: true }));
    // finish off downed rival crew when it is safe (hard)
    if (B.executeDowned && !fighting.length) {
      const down = all().find(e => rivalClan(e.owner) && e.downed && !e.dead && sees(e) && e.place === h.place && close(e, 6));
      if (down && mine.length) out.push({ id: hero, type: 'execute', target: down.id, units: mine.map(u => u.id) });
    }
    // ambush lone rival crew near its own turf (medium / hard)
    if (B.ambush && !fighting.length && h.place === 'street') {
      const turf = biz().filter(b => b.owner === clan && b.ring);
      const lone = foes.find(e => e.type !== 'hero' && e.place === 'street' && turf.some(b => near(e, b.ring[0], b.ring[1], B.ambushRange))
        && !all().some(o => o !== e && o.owner === e.owner && standing(o) && o.place === 'street' && dist(o, e) < 6));
      if (lone) out.push(...order(fighters, 'attack', { target: lone.id, resume: true }));
    }
    // night bandits: hunt them for their ryo, then loot the bodies
    if (B.huntBandits && state.night && h.place === 'street' && !fighting.length) {
      const bandit = all().find(e => e.wild && standing(e) && sees(e) && dist(h, e) <= B.huntRange);
      if (bandit && mine.length >= 2) { out.push(...order(fighters, 'attack', { target: bandit.id, resume: true })); out.push({ id: hero, type: 'attack', target: bandit.id }); }
      const body = all().find(e => e.dead && e.loot > 0 && e.place === 'street' && sees(e) && dist(h, e) <= B.huntRange);
      if (body && !bandit) out.push({ id: hero, type: 'loot', target: body.id, ...(mine.length ? { units: mine.map(u => u.id) } : {}) });
    }
    // abilities, when there is a fight close by
    const ab = new Set(B.abilities || []), f = fighting.filter(e => dist(h, e) <= 6).sort((a, b) => dist(h, a) - dist(h, b));
    if (f.length) {
      const cast = (slot, extra = {}) => { if (ab.has(slot) && !((h.cooldowns?.[slot] ?? 0) > state.tick)) out.push({ id: hero, type: 'ability', slot, ...extra }); };
      if (f.length >= 2 || mine.length >= 2) cast('R');
      if (f.filter(e => dist(h, e) <= 4).length >= 2) cast('E');
      if (dist(h, f[0]) > 2) cast('Q', { x: f[0].x, z: f[0].z });
      if (f[0].type === 'hero') cast('F');
    }
  }

  function tick() {
    const out = [], h = me();
    if (!h || h.dead || h.downed || h.jailed) { goal = null; path = null; return out; }
    if (state.tick % 10 === 0) look();
    for (const hit of state.hits) {
      const a = state.entities[hit.a], t = state.entities[hit.t];
      if (hit.kill && a?.type === 'hero' && rivalClan(a.owner) && t?.owner === clan && t.type !== 'hero' && dist(t, h) <= B.revengeRange) downs.push({ by: a.id, tick: state.tick });
      // hitting its boss is enough on its own
      if (t === h && a?.type === 'hero' && rivalClan(a.owner)) for (let k = 0; k < B.revengeDowns; k++) downs.push({ by: a.id, tick: state.tick });
    }
    while (downs.length && state.tick - downs[0].tick > secs(B.revengeSeconds)) downs.shift();
    // a thief seen in its hideout: medium/hard send a couple of crew home (Tim 2026-10-20)
    for (const n of state.news || []) if (n.kind === 'stealAlert' && n.clan === clan && B.defendHome) {
      const b = state.businesses[n.business], sent = crew().filter(u => u.place !== b?.room && !u.downed && !u.dead).slice(0, B.defendHome === true ? 2 : B.defendHome);
      if (b && sent.length) out.push(...order(sent, 'enter', { business: b.id }));
    }
    if (state.tick >= nextReact) { react(out); nextReact = state.tick + secs(B.reactSeconds); }
    // badly hurt: run home to the hideout and rest there (its crew stay and cover), Tim 2026-10-19
    const hq = home();
    // medium/hard never run off in the middle of their own raid; easy still does (Tim 2026-10-19)
    const raiding = !B.fleeInRaid && (goal?.kind === 'raid' || Object.values(state.attacks || {}).some(a => a.mode === 'raid' && a.clan === clan));
    if (hq && B.fleeHp > 0 && !raiding && h.hp < h.maxHp * B.fleeHp && goal?.kind !== 'flee' && h.place !== hq.room) { goal = { kind: 'flee', business: hq.id }; path = null; }
    if (hq && h.place === hq.room && h.hp < h.maxHp * B.restUntilHp && goal?.kind !== 'hire') {
      goal = null;
      out.push({ id: hero, type: 'move', right: 0, down: 0 });
      return out;
    }
    // a raid on one of its places beats whatever it was doing
    if (goal?.kind !== 'defend' && goal?.kind !== 'flee' && Object.values(state.attacks || {}).some(a => a.mode === 'raid' && a.defender === clan)) { goal = null; nextThink = 0; }
    if (!goal && state.tick >= nextThink) { goal = think(); nextThink = state.tick + secs(B.thinkSeconds); }
    if (goal) {
      if (act(out)) { goal = null; path = null; }
      // stuck (blocked, no way through): give the goal up and think again; waiting goals don't count
      const waiting = goal && (goal.started || goal.kind === 'scout' || goal.kind === 'defend' || (goal.kind === 'hire' && h.place !== 'street'));
      const moved = !last || Math.hypot(h.x - last.x, h.z - last.z) > 0.02 || h.place !== last.place;
      still = moved || waiting ? 0 : still + 1;
      last = { x: h.x, z: h.z, place: h.place };
      if (still > secs(B.stuckSeconds)) { goal = null; path = null; still = 0; }
    }
    if (!out.some(c => c.type === 'move')) out.push({ id: hero, type: 'move', right: 0, down: 0 });
    return out;
  }

  return { tick, goal: () => goal, seen };
}
