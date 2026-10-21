// Shinobi bot clan brain (Tim 2026-10-20: 3 clans, the two you don't play are bots). A client like
// sim/bot.js: it reads the state, sees only what its clan sees (sim/vision.js) and sends the same
// commands as a Shinobi player ('move', 'use', 'hire', 'contract', 'attack', 'order', 'ability',
// 'snuff', 'clinic', 'loot'). No hidden bonuses.
// Every thinkSeconds it picks a goal, top first: flee home when hurt > revive crew at the clinic >
// hire ninja at the dojo up to its Renown cap > take a job at the shrine > do its job > rest at the
// longhouse. Jobs (sim/contracts.js): scout / mark / steal go in by the back window alone (the crew
// wait outside), the boss hunt and the bandit hunt bring the crew. At night it snuffs a lantern
// near where it is going in. Every reactSeconds it fights: R Smoke Bomb when hurt, E Caltrops on a
// target running off or two foes close, Q Shadow Step to close in, F Assassinate when hidden long enough.
// Knobs per difficulty: bots.json shinobiLevels. tick() returns this tick's commands for game.step.
import { SCREEN_RIGHT, SCREEN_DOWN } from './geometry.js';

const DET = SCREEN_RIGHT.x * SCREEN_DOWN.z - SCREEN_DOWN.x * SCREEN_RIGHT.z;
const intentFor = (dx, dz) => ({ right: (dx * SCREEN_DOWN.z - dz * SCREEN_DOWN.x) / DET, down: (SCREEN_RIGHT.x * dz - SCREEN_RIGHT.z * dx) / DET });

export const NINJA_BOT_DEFAULTS = {
  thinkSeconds: 2, reactSeconds: 1, reserve: 40, hireType: 'ninja', stuckSeconds: 4,
  // jobs it likes, first = most wanted (it takes the first one on the board it can do)
  jobs: ['bandits', 'scout', 'boss', 'steal', 'mark'],
  huntRange: 12, fleeHp: 0.3, restUntilHp: 0.8, smokeHp: 0.5, snuff: true,
  abilities: ['Q', 'E', 'R', 'F'],
};

export function createNinjaBot(game, { clan, hero, rules = {}, seed = 9191 }) {
  const B = { ...NINJA_BOT_DEFAULTS, ...rules };
  const state = game.state, secs = s => Math.round(s * 20);
  const U = game.settings.units.rules;
  const F = game.settings.units.models?.ninja_leader?.abilities?.F || {};
  let goal = null, path = null, nextThink = 0, nextReact = 0, last = null, still = 0, spot = 0;
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);

  // --- what it knows ------------------------------------------------------------------
  const me = () => state.entities[hero];
  const myClan = () => state.clans[clan];
  const roomOf = name => game.rooms.find(rm => rm.name === name);
  const all = () => Object.values(state.entities);
  const biz = () => Object.values(state.businesses);
  const home = () => biz().find(b => b.hideout === clan);
  const dojo = () => biz().find(b => b.kind === 'dojo' && b.room);
  const shrine = () => game.doors.find(d => d.menu === 'contracts');
  const standing = u => u && !u.dead && !u.downed && !u.jailed;
  const crew = () => all().filter(u => u.owner === clan && u.type !== 'hero' && !u.guard && standing(u));
  const sees = e => game.vision.canSee(clan, e);
  const rivalClan = id => id && id !== clan && !!state.clans[id];
  const foe = e => standing(e) && sees(e) && (rivalClan(e.owner) || e.wild || e.guard || e.police) && !e.civilian;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const job = () => state.contracts?.active?.[clan] || null;
  const order = (units, kind, extra = {}) => units.length ? [{ id: hero, type: 'order', units: units.map(u => u.id), kind, ...extra }] : [];
  const crewRoom = () => game.clans.crewCount(clan) + myClan().queue.length < game.clans.crewCap(clan);
  const canHireNow = () => {
    const price = game.clans.hirePrice(clan, B.hireType);
    return crewRoom() && price !== null && myClan().ryo - price >= B.reserve && myClan().queue.length < (U.maxQueue ?? 5);
  };
  const readyPatient = c => c.clinic.findIndex(p => p.kind === 'recover' && p.left <= 0 && c.ryo >= game.clans.reviveCost(p, clan));
  // the back window of a business (outside end), for the sneaking jobs
  const windowOf = b => game.doors.find(d => d.ninja && d.place === b.room);
  // can it do this job now? (a mark needs the night, but can be taken by day and done after dark)
  const doable = j => {
    if (j.kind === 'boss') return !!state.entities[j.hero] && crew().length >= 1;
    if (j.kind === 'bandits') return state.night || j.night === false;
    const b = state.businesses[j.business];
    return !!(b && windowOf(b));
  };

  // --- deciding ----------------------------------------------------------------------
  function think() {
    const c = myClan(), h = me();
    if (readyPatient(c) >= 0) return { kind: 'revive' };
    if (dojo() && canHireNow() && !job()) return { kind: 'hire', business: dojo().id };
    const j = job();
    if (j) return { kind: 'job' };
    // take the best job on the board it can do
    const board = state.contracts?.board || [];
    const pick = B.jobs.map(k => board.find(x => x.kind === k && doable(x))).find(Boolean);
    if (pick && shrine()) return { kind: 'take', job: pick.id };
    // nothing to do: rest in the longhouse
    if (home() && h.place !== home().room) return { kind: 'rest', business: home().id };
    return null;
  }

  // --- walking ------------------------------------------------------------------------------
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
  // out of whatever room the boss is in, by the nearer of its door and its back window; true on the street
  function toStreet(out) {
    const h = me();
    if (h.place === 'street') return true;
    const rm = roomOf(h.place);
    if (!rm) return false;
    const win = game.doors.find(d => d.ninja && d.place === 'street' && Math.hypot(d.x - rm.exit.x, d.z - rm.exit.z) < 30);
    const t = win && Math.hypot(win.x - h.x, win.z - h.z) < Math.hypot(rm.exit.x - h.x, rm.exit.z - h.z) ? win : rm.exit;
    if (walk(out, t.x, t.z, 0.6)) out.push({ id: hero, type: 'use', units: [] });
    return false;
  }
  // in through a door ring (front or back window); true once inside the room
  function goIn(out, door, room, units = []) {
    const h = me();
    if (h.place === room) return true;
    if (!toStreet(out)) return false;
    if (walk(out, door.x, door.z, 0.6)) out.push({ id: hero, type: 'use', units });
    return false;
  }
  // at night on the way in: put out a lantern by the window first (snuffPerNight a night)
  function snuffHere(out) {
    const h = me();
    if (!B.snuff || h.snuffing || !game.stealth.snuffable(h) || game.stealth.snuffsLeft(clan) <= 0) return false;
    out.push({ id: hero, type: 'snuff' });
    return true;
  }
  const crewWait = (x, z) => order(crew().filter(u => u.place === 'street'), 'hold', { x, z });
  const crewFollow = () => order(crew().filter(u => u.order?.kind !== 'follow' && u.order?.kind !== 'heal'), 'follow');

  // --- doing: true when the goal is over ----------------------------------------------------
  function act(out) {
    const h = me(), c = myClan();
    switch (goal.kind) {
      case 'revive': {
        const door = game.doors.find(d => d.menu === 'clinic'), k = readyPatient(c);
        if (!door || k < 0) return true;
        if (!toStreet(out)) return false;
        if (!walk(out, door.x, door.z, 0.8)) return false;
        out.push({ id: hero, type: 'clinic', action: 'revive', patient: k });
        return false;
      }
      case 'hire': {
        const b = state.businesses[goal.business];
        if (goal.leaving) return toStreet(out);
        if (h.place === b.room) {
          if (!goal.sent && canHireNow()) { out.push({ id: hero, type: 'hire', business: b.id, unit: B.hireType }); goal.sent = true; return false; }
          goal.sent = false;
          if (canHireNow()) return false;
          goal.leaving = true;
          return false;
        }
        if (!toStreet(out)) return false;
        if (walk(out, b.ring[0], b.ring[1], 0.8)) out.push({ id: hero, type: 'use', units: [] });
        return false;
      }
      case 'take': {
        const s = shrine();
        if (job() || !s || !state.contracts.board.some(j => j.id === goal.job)) return true;
        if (!toStreet(out)) return false;
        if (!walk(out, s.x, s.z, 0.8)) return false;
        out.push({ id: hero, type: 'contract', action: 'take', job: goal.job });
        return true;
      }
      case 'rest': {
        const b = state.businesses[goal.business];
        if (h.place === b.room) return true;
        if (!toStreet(out)) return false;
        if (walk(out, b.ring[0], b.ring[1], 0.8)) out.push({ id: hero, type: 'use', units: crew().filter(u => u.place === 'street').map(u => u.id) });
        return false;
      }
      case 'flee': {
        const b = state.businesses[goal.business];
        if (h.place === b.room) return true;
        if (!toStreet(out)) return false;
        if (walk(out, b.ring[0], b.ring[1], 0.8)) out.push({ id: hero, type: 'use', units: [] });
        return false;
      }
      case 'job': return doJob(out);
    }
    return true;
  }

  function doJob(out) {
    const j = job(), h = me();
    if (!j) { out.push(...crewFollow()); return true; }
    const b = state.businesses[j.business];
    if (j.kind === 'scout' || j.kind === 'mark' || j.kind === 'steal') {
      if (j.kind === 'mark' && !state.night && h.place !== b.room) {   // a mark waits for the dark, near the window
        const w = windowOf(b);
        if (!toStreet(out)) return false;
        walk(out, w.x, w.z, 4);
        return false;
      }
      const w = windowOf(b);
      if (h.place !== b.room) {
        if (!goal.parked) { out.push(...crewWait(w.x, w.z)); goal.parked = true; }
        if (h.place === 'street' && Math.hypot(w.x - h.x, w.z - h.z) < 8 && snuffHere(out)) return false;
        if (h.snuffing) return false;
        goIn(out, w, b.room);
        return false;
      }
      // inside: the scout stands still in the dark; the mark and the steal stand on the back-room spot
      if (j.kind === 'scout') return false;
      const p = j.kind === 'steal' ? game.contracts.stash(b) : game.contracts.backRoom(b);
      if (p) walk(out, p.x, p.z, (game.contracts.rules[j.kind]?.reach ?? 1.5) * 0.6);
      return false;
    }
    if (j.kind === 'boss') {
      const t = state.entities[j.hero];
      if (!t) return true;
      if (!toStreet(out)) return false;
      if (!goal.called) { out.push(...crewFollow()); goal.called = true; }
      if (sees(t) && t.place === 'street') {
        if (dist(h, t) < 10) { out.push({ id: hero, type: 'attack', target: t.id }); out.push(...order(crew().filter(u => u.place === 'street'), 'attack', { target: t.id, resume: true })); }
        else walk(out, t.x, t.z, 1.2);
        return false;
      }
      // not in sight: look for him at his clan's places (hideout last)
      const places = biz().filter(x => x.owner === t.owner && x.ring).sort((a, b2) => !!a.hideout - !!b2.hideout);
      const p = places[spot % Math.max(1, places.length)];
      if (p && walk(out, p.ring[0], p.ring[1], 3)) spot++;
      return false;
    }
    if (j.kind === 'bandits') {
      if (!toStreet(out)) return false;
      if (!goal.called) { out.push(...crewFollow()); goal.called = true; }
      const bandit = all().filter(e => e.wild && standing(e) && sees(e) && e.place === 'street').sort((a, b2) => dist(h, a) - dist(h, b2))[0];
      if (bandit && dist(h, bandit) <= B.huntRange) {
        out.push({ id: hero, type: 'attack', target: bandit.id });
        out.push(...order(crew().filter(u => u.place === 'street'), 'attack', { target: bandit.id, resume: true }));
        return false;
      }
      if (bandit) { walk(out, bandit.x, bandit.z, 2); return false; }
      // roam the town looking for them (from one business door to another)
      const rings = biz().filter(x => x.ring && x.room);
      const p = rings[spot % Math.max(1, rings.length)];
      if (p && walk(out, p.ring[0], p.ring[1], 3)) spot = Math.floor(rnd() * rings.length);
      return false;
    }
    return true;
  }

  // --- fighting (every reactSeconds) ----------------------------------------------------------
  function react(out) {
    const h = me(), ab = new Set(B.abilities || []);
    const cast = (slot, extra = {}) => { if (ab.has(slot) && !((h.cooldowns?.[slot] ?? 0) > state.tick)) { out.push({ id: hero, type: 'ability', slot, ...extra }); return true; } return false; };
    const foes = all().filter(e => foe(e) && e.place === h.place).sort((a, b) => dist(h, a) - dist(h, b));
    const close = foes.filter(e => dist(h, e) <= 6);
    // hit back at whoever is hitting it (unless it is hidden and on a sneaking job)
    const sneaking = ['scout', 'mark', 'steal'].includes(job()?.kind);
    const by = h.hitBy && state.tick - h.hitBy.tick < secs(5) && state.entities[h.hitBy.id];
    if (by && standing(by) && by.place === h.place && !sneaking) out.push({ id: hero, type: 'attack', target: by.id });
    if (!close.length) return;
    if (h.hp < h.maxHp * B.smokeHp && cast('R')) return;
    // Assassinate: hidden long enough, a target right next to it
    const held = h.hidden && h.hiddenAt != null ? (state.tick - h.hiddenAt) / 20 : 0;
    const t = close[0];
    if (held >= (F.hiddenSeconds ?? 3) && dist(h, t) <= (F.reach ?? 1.5) + 0.6 && (!sneaking || t.type === 'hero') && cast('F', { x: t.x, z: t.z, target: t.id })) return;
    // the boss it hunts runs off: caltrops on him; two foes close: caltrops too
    const hunted = job()?.kind === 'boss' && state.entities[job().hero];
    if (hunted && sees(hunted) && dist(h, hunted) > 3 && dist(h, hunted) < 10) { if (cast('E', { x: hunted.x, z: hunted.z })) return; }
    if (close.filter(e => dist(h, e) <= 3).length >= 2 && cast('E', { x: t.x, z: t.z })) return;
    if (!sneaking && dist(h, t) > 2.5 && dist(h, t) < 8 && (t.type === 'hero' || t === hunted)) cast('Q', { x: t.x, z: t.z, target: t.id });
  }

  function tick() {
    const out = [], h = me();
    if (!h || h.dead || h.downed || h.jailed) { goal = null; path = null; return out; }
    if (state.tick >= nextReact) { react(out); nextReact = state.tick + secs(B.reactSeconds); }
    // badly hurt: home to the longhouse and rest there
    const hq = home();
    if (hq && B.fleeHp > 0 && h.hp < h.maxHp * B.fleeHp && goal?.kind !== 'flee' && h.place !== hq.room) { goal = { kind: 'flee', business: hq.id }; path = null; }
    if (hq && h.place === hq.room && h.hp < h.maxHp * B.restUntilHp && goal?.kind !== 'hire') {
      goal = null;
      out.push({ id: hero, type: 'move', right: 0, down: 0 });
      return out;
    }
    if (!goal && state.tick >= nextThink) { goal = think(); nextThink = state.tick + secs(B.thinkSeconds); }
    if (goal) {
      if (act(out)) { goal = null; path = null; }
      // stuck: give the goal up and think again; standing still on a job inside doesn't count
      const waiting = goal && ((goal.kind === 'job' && h.place !== 'street') || h.snuffing || (goal.kind === 'hire' && h.place !== 'street') || (goal.kind === 'job' && job()?.kind === 'mark' && !state.night));
      const moved = !last || Math.hypot(h.x - last.x, h.z - last.z) > 0.02 || h.place !== last.place;
      still = moved || waiting ? 0 : still + 1;
      last = { x: h.x, z: h.z, place: h.place };
      if (still > secs(B.stuckSeconds)) { goal = null; path = null; still = 0; spot++; }
    }
    if (!out.some(c => c.type === 'move')) out.push({ id: hero, type: 'move', right: 0, down: 0 });
    return out;
  }

  return { tick, goal: () => goal };
}
