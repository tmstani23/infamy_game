import { charmProtected } from './charm_rules.js';
// Shinobi bot clan brain (Tim 2026-10-20: 3 clans, the two you don't play are bots). A client like
// sim/bot.js: it reads the state, sees only what its clan sees (sim/vision.js) and sends the same
// commands as a Shinobi player ('move', 'use', 'hire', 'contract', 'attack', 'order', 'ability',
// 'snuff', 'clinic', 'loot'). No hidden bonuses.
// Goals balance recovery, squad cost and jobs by reward, travel, risk and preference.
// Failed jobs cool down; public camps supply income and bandit-contract targets.
// Jobs (sim/contracts.js): scout / mark / steal go in by the back window alone (the crew
// wait outside), the boss hunt and the bandit hunt bring the crew. At night it snuffs a lantern
// near where it is going in. Every reactSeconds it fights: R Smoke Bomb when hurt, E Caltrops on a
// target running off or two foes close, Q Shadow Step to close in, F Assassinate when hidden long enough.
// Knobs per difficulty: bots.json shinobiLevels. tick() returns this tick's commands for game.step.
import { createAISupport } from './ai_support.js';
import { contractLockoutUntil } from './hq_raids.js';
import { createDeploymentAI, inHeroParty } from './deployment_ai.js';

export const NINJA_BOT_DEFAULTS = {
  thinkSeconds: 2, reactSeconds: 1, reserve: 40, hireType: 'ninja', stuckSeconds: 4, fillShare: 0.9,
  // Allowed jobs in preference order; reward, time and risk also affect the choice.
  jobs: ['bandits', 'scout', 'boss', 'steal', 'mark'],
  huntRange: 12, fleeHp: 0.3, restUntilHp: 0.8, smokeHp: 0.5, snuff: true,
  riskRatio: 0.8, huntRetreatHp: 0.5, goalCooldownSeconds: 60, jobSeconds: 240,
  abilities: ['Q', 'E', 'R', 'F'],
};

export function createNinjaBot(game, { clan, hero, rules = {}, seed = 9191 }) {
  const B = { ...NINJA_BOT_DEFAULTS, ...rules };
  const state = game.state, secs = s => Math.round(s * 20);
  const ai = createAISupport(game, clan, hero, B);
  const deploymentAI = createDeploymentAI(game, { clan, hero });
  const U = game.settings.units.rules;
  const F = game.settings.units.models?.ninja_leader?.abilities?.F || {};
  let goal = null, nextThink = 0, nextReact = 0, last = null, still = 0, spot = 0;
  let workingJob = null, jobUntil = 0;

  // --- what it knows ------------------------------------------------------------------
  const me = () => state.entities[hero];
  const myClan = () => state.clans[clan];
  const all = () => Object.values(state.entities);
  const biz = () => Object.values(state.businesses);
  const home = () => biz().find(b => b.hideout === clan);
  const dojo = () => biz().find(b => b.kind === 'dojo' && b.room);
  const shrine = () => game.doors.find(d => d.menu === 'contracts');
  const standing = u => u && !u.dead && !u.downed && !u.jailed;
  const crew = () => all().filter(u => u.owner === clan && u.type !== 'hero' && !u.guard && standing(u) && inHeroParty(game, u));
  const sees = e => game.vision.canSee(clan, e)&&!charmProtected({owner:clan},e,state);
  const rivalClan = id => id && id !== clan && !!state.clans[id];
  const foe = e => standing(e) && sees(e) && !e.civilian && (e.id === me().attackTarget
    || e.id === me().hitBy?.id || (rivalClan(e.owner) && e.attackTarget === hero));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const job = () => state.contracts?.active?.[clan] || null;
  const order = (units, kind, extra = {}) => units.length ? [{ id: hero, type: 'order', units: units.map(u => u.id), kind, ...extra }] : [];
  const crewRoom = () => game.clans.crewCount(clan) + myClan().queue.length < game.clans.crewCap(clan);
  const hireType = () => {
    if (state.deployment?.restrictionsEnabled && game.clans.crewCount(clan) >= 8 && game.clans.hirePrice(clan, 'shinobi_geisha') !== null
      && !game.clans.crewOf(clan).some(e => e.type === 'shinobi_geisha') && ![...myClan().queue, ...myClan().clinic, ...(myClan().jail || [])].some(e => e.unit === 'shinobi_geisha')) return 'shinobi_geisha';
    if (B.hireType !== 'ninja' || !game.settings.units.types.ninja_tanto) return B.hireType;
    const count = type => game.clans.crewOf(clan).filter(u => u.type === type).length + myClan().queue.filter(q => q.unit === type).length;
    return count('ninja_tanto') < count('ninja') ? 'ninja_tanto' : 'ninja';
  };
  const canHireNow = () => {
    const price = game.clans.hirePrice(clan, hireType());
    const count = game.clans.crewCount(clan) + myClan().queue.length;
    const established = (myClan().renown || 0) >= (U.renownPerCrew || 75);
    const desired = established || myClan().ryo >= 500 ? Math.ceil(game.clans.crewCap(clan) * (B.fillShare ?? 1)) : 1;
    return count < desired && crewRoom() && price !== null && myClan().ryo - price >= (count ? B.reserve : 0) && myClan().queue.length < (U.maxQueue ?? 5);
  };
  const readyPatient = c => c.clinic.findIndex(p => p.kind === 'recover' && p.left <= 0 && c.ryo >= game.clans.reviveCost(p, clan));
  // the back window of a business (outside end), for the sneaking jobs
  const windowOf = b => game.doors.find(d => d.ninja && d.place === b.room);
  // Contract feasibility is independent of day/night.
  const doable = j => {
    if (ai.blocked(`job:${j.id}`)) return false;
    if (j.kind === 'boss') {
      const t = state.entities[j.hero];
      if (!t || !crew().length) return false;
      const visible = sees(t) ? all().filter(e => e.owner === t.owner && standing(e) && sees(e) && e.place === t.place && dist(e, t) < 10) : [];
      return !visible.length || ai.safe(visible);
    }
    if (j.kind === 'bandits') return !!ai.pickHunt();
    const b = state.businesses[j.business];
    return !!(b && windowOf(b));
  };

  function jobSeconds(j) {
    const s = shrine(), b = state.businesses[j.business];
    if (!s) return Infinity;
    const travel = ai.route(s.x, s.z) + (b ? Math.hypot(b.x - s.x, b.z - s.z) : j.kind === 'boss' ? 70 : 35);
    const duration = j.kind === 'mark' ? 70 : j.kind === 'boss' ? 80 : j.kind === 'bandits' ? 55 : 15;
    return duration + travel / 4;
  }
  function jobScore(j) {
    // Steal uses a public estimate, never the rival's private treasury.
    const quote = game.contracts.quote(j);
    const reward = quote.ryo ?? (j.kind === 'steal' ? Math.min(quote.stealCap, 100 * quote.multiplier) : 100);
    const preference = 1 + (B.jobs.length - B.jobs.indexOf(j.kind)) * 0.12;
    const lead = j.target && j.target === game.leader?.leader() ? 1.5 : 1;   // gang up on the season leader (sim/leader.js)
    return (reward + (quote.renown || 0) * 3) * preference * lead / jobSeconds(j);
  }

  // --- deciding ----------------------------------------------------------------------
  function think() {
    const c = myClan(), h = me();
    const raid = Object.values(state.attacks || {}).find(a => a.hq && a.defender === clan);
    if (raid) return { kind: 'defend', business: raid.business };
    if (readyPatient(c) >= 0 && !ai.blocked('revive:')) return { kind: 'revive' };
    if (dojo() && canHireNow() && !job() && !ai.blocked(`hire:${dojo().id}`)) return { kind: 'hire', business: dojo().id };
    // A leader indoors cannot count recruits waiting outside in its immediate
    // combat strength. Assemble before judging the early camp/contract options.
    if (!job() && h.place !== 'street' && crew().some(u => u.place === 'street' && u.order?.kind === 'follow' && u.order.target === hero)) return { kind: 'rally' };
    const j = job();
    if (j) return { kind: 'job' };
    const hunt = ai.pickHunt();
    if (hunt?.body) return hunt; // Collect earned loot before leaving for another job.
    // take the best job on the board it can do
    const board = contractLockoutUntil(state, clan) > state.tick || game.contracts.readyIn(clan) ? [] : state.contracts?.board || [];
    const pick = board.filter(j => B.jobs.includes(j.kind) && doable(j)).sort((a, b) => jobScore(b) - jobScore(a))[0];
    if (pick && shrine()) return { kind: 'take', job: pick.id };
    if (hunt) return hunt;
    // nothing to do: rest in the longhouse
    if (home() && h.place !== home().room && !ai.blocked(`rest:${home().id}`)) return { kind: 'rest', business: home().id };
    return null;
  }

  // --- walking ------------------------------------------------------------------------------
  const walk = ai.walk;
  // Use the room's front exit so waiting crew can accompany the boss out.
  const toStreet = ai.toStreet;
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
  const crewWait = (x, z) => order(crew().filter(u => u.place === 'street'), 'station', { x, z });
  const crewFollow = () => { const out = []; ai.recall(out); return out; };

  // --- doing: true when the goal is over ----------------------------------------------------
  function act(out) {
    const h = me(), c = myClan();
    switch (goal.kind) {
      case 'hunt': return ai.hunt(out, goal);
      case 'rally': {
        if (!toStreet(out)) return false;
        if (!goal.called) { out.push(...crewFollow()); goal.called = true; goal.until = state.tick + secs(8); }
        return crew().every(u => u.place === h.place && dist(u, h) < 12) || state.tick >= goal.until;
      }
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
          if (!goal.sent && canHireNow()) { out.push({ id: hero, type: 'hire', business: b.id, unit: hireType() }); goal.sent = true; return false; }
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
        if (contractLockoutUntil(state, clan) > state.tick || game.contracts.readyIn(clan)) return true;
        if (job() || !s || !state.contracts.board.some(j => j.id === goal.job && doable(j))) return true;
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
      case 'defend': {
        const a = state.attacks?.[goal.business], b = state.businesses[goal.business];
        if (!a || a.defender !== clan || !b) return true;
        if (a.phase === 'hold' && goal.sent !== a.phase) {
          out.push(...order(crew().filter(u => u.place === 'street'), 'enter', { business: b.id, place: 'street' }));
          goal.sent = a.phase;
        }
        // warm-up: the whole crew defends the lantern (Tim 2026-10-26: only the boss came), crew indoors or
        // away included; those inside walk out first (only a plain move takes crew out of a door)
        if (a.phase !== 'hold') {
          const L = a.lantern, to = { x: L.x, z: L.z, place: 'street' };
          goal.armed ||= new Set();
          const wanted = crew().filter(u => u.order?.kind !== 'heal');
          for (const u of wanted) if (u.place !== 'street') goal.armed.delete(u.id);
          const inside = wanted.filter(u => u.place !== 'street' && !(u.order?.kind === 'move' && Math.hypot(u.order.x - L.x, u.order.z - L.z) < 0.5));
          const outside = wanted.filter(u => u.place === 'street' && !goal.armed.has(u.id));
          outside.forEach(u => goal.armed.add(u.id));
          out.push(...order(inside, 'move', to), ...order(outside, 'attackmove', to));
        }
        if (a.phase === 'hold' && h.place === a.room) { walk(out, a.hold.x, a.hold.z, a.hold.r * .5); return false; }
        if (!toStreet(out)) return false;
        if (a.phase === 'hold') {
          if (walk(out, b.ring[0], b.ring[1], .8)) out.push({ id: hero, type: 'use', units: [] });
          return false;
        }
        const by = h.hitBy && state.tick - h.hitBy.tick < secs(5) && state.entities[h.hitBy.id];
        if (by && standing(by) && by.place === h.place && rivalClan(by.owner)) {
          out.push({ id: hero, type: 'attack', target: by.id }); return false;
        }
        if (walk(out, a.lantern.x, a.lantern.z, game.businesses.raidRules.knockReach - .4)
          && !a.knock && game.businesses.canKnock(hero, b.id).ok)
          out.push({ id: hero, type: 'business', action: 'knock', business: b.id });
        return false;
      }
      case 'flee': {
        const b = state.businesses[goal.business];
        if (h.place === b.room) return true;
        if (!goal.called) {
          ai.recall(out);
          out.push(...order(crew().filter(u => u.order?.kind !== 'heal'), 'enter', { business: b.id }));
          goal.called = true;
        }
        if (!toStreet(out)) return false;
        if (walk(out, b.ring[0], b.ring[1], 0.8)) out.push({ id: hero, type: 'use', units: crew().filter(u => u.place === 'street').map(u => u.id) });
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
      if (!b || !windowOf(b)) return abandon(out, j);
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
        const defenders = all().filter(e => e.owner === t.owner && standing(e) && sees(e) && e.place === t.place && dist(e, t) < 10);
        if (!ai.safe(defenders)) return abandon(out, j);
        ai.engage(out, t);
        return false;
      }
      // not in sight: look for him at his clan's places (hideout last)
      const places = biz().filter(x => ai.known(x) && x.owner === t.owner && x.ring).sort((a, b2) => !!a.hideout - !!b2.hideout);
      const p = places[spot % Math.max(1, places.length)];
      if (p && walk(out, p.ring[0], p.ring[1], 3)) spot++;
      return false;
    }
    if (j.kind === 'bandits') {
      if (!goal.hunt) goal.hunt = ai.pickHunt();
      if (!goal.hunt) return abandon(out, j);
      if (ai.hunt(out, goal.hunt)) { goal.hunt = null; ai.reset(); }
      return false;
    }
    return true;
  }

  function abandon(out, j = job()) {
    if (j) { ai.avoid(`job:${j.id}`, 180); out.push({ id: hero, type: 'contract', action: 'drop' }); }
    out.push(...crewFollow());
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
    const out = deploymentAI.tick(), h = me();
    if (!h || h.dead || h.downed || h.jailed) { goal = null; ai.reset(); return out; }
    if ((job()?.id ?? null) !== workingJob) {
      workingJob = job()?.id ?? null;
      jobUntil = state.tick + secs(B.jobSeconds);
      ai.recall(out); goal = null; ai.reset(); nextThink = 0;
    }
    if (job() && state.tick > jobUntil) { abandon(out); goal = null; ai.reset(); }
    const defending = Object.values(state.attacks || {}).some(a => a.hq && a.defender === clan);
    if (defending && goal?.kind !== 'defend' && goal?.kind !== 'flee') { goal = null; ai.reset(); nextThink = 0; }
    if (state.tick >= nextReact) { react(out); nextReact = state.tick + secs(B.reactSeconds); }
    // badly hurt: home to the longhouse and rest there
    const hq = home();
    const tired = (goal?.kind === 'hunt' || job()?.kind === 'bandits') && h.hp < h.maxHp * B.huntRetreatHp;
    if (hq && B.fleeHp > 0 && (h.hp < h.maxHp * B.fleeHp || tired) && goal?.kind !== 'flee' && h.place !== hq.room) {
      if (goal?.hunt) ai.avoid(ai.key(goal.hunt), 45);
      goal = { kind: 'flee', business: hq.id }; ai.reset(); out.push({ id: hero, type: 'stopattack' });
    }
    // a raid on the HQ doesn't pull a badly hurt leader back out: he heals inside first, or he pops in
    // and out of the doorway every tick, flickering hidden/seen and out of reach (Tim 2026-10-26)
    if (hq && h.place === hq.room && (h.hp < h.maxHp * B.restUntilHp || (!defending && crew().some(u => u.place === hq.room && u.hp < u.maxHp * 0.65))) && goal?.kind !== 'hire') {
      goal = null;
      out.push({ id: hero, type: 'move', right: 0, down: 0 });
      return out;
    }
    if (!goal && state.tick >= nextThink) { goal = think(); nextThink = state.tick + secs(B.thinkSeconds); }
    if (goal) {
      const target = state.entities[out.findLast(c => c.type === 'attack')?.target ?? h.attackTarget];
      const fighting = goal.kind !== 'flee' && !['scout', 'mark', 'steal'].includes(job()?.kind)
        && standing(target) && rivalClan(target.owner) && sees(target) && target.place === h.place && dist(h, target) < 6;
      if (fighting) ai.engage(out, target);
      else if (act(out)) { goal = null; ai.reset(); }
      // stuck: give the goal up and think again; standing still on a job inside doesn't count
      const waiting = goal && (fighting || h.swing || h.lootTarget || goal.kind === 'rally' || (goal.kind === 'job' && h.place !== 'street' && !out.some(c => c.type === 'move')) || h.snuffing || (goal.kind === 'hire' && h.place !== 'street'));
      const moved = !last || Math.hypot(h.x - last.x, h.z - last.z) > 0.02 || h.place !== last.place;
      still = moved || waiting ? 0 : still + 1;
      last = { x: h.x, z: h.z, place: h.place };
      if (goal && (ai.failed() || still > secs(B.stuckSeconds))) {
        if (goal.kind === 'job' || goal.kind === 'take') {
          if (job()) abandon(out); else ai.avoid(`job:${goal.job}`, 180);
        } else ai.avoid(ai.key(goal));
        goal = null; ai.reset(); still = 0; spot++; nextThink = 0;
      }
    }
    if (!out.some(c => c.type === 'move')) out.push({ id: hero, type: 'move', right: 0, down: 0 });
    return out;
  }

  return { tick:()=>tick().filter(c=>!((c.type==='attack'||c.type==='order'&&c.kind==='attack')&&charmProtected({owner:clan},state.entities[c.target],state))), goal: () => goal };
}
