import { creditRyo, debitRyo } from './treasury.js';
import { modeRules } from './modes/index.js';
import { createDeploymentAI } from './deployment_ai.js';
// The lieutenant (frontier plan C2 + C3, Tim 2026-11-02/05). Campaign only (capability campaignCity).
// While a clan's boss is out on the island, its city runs on a lieutenant: a bot brain that sends the
// same commands a player could (tagged by: 'lieutenant'), limited to the standing orders the clan set
// (defend, retake, shakedown, sweep, contracts, hire; buy new businesses for Yakuza/Kuroda; Shinobi jobs and
// steals, Tim 2026-11-06) and to its daily budget. Every clan gets one, bots
// too (rival bosses leave for the frontier as well). A city captain (units.json city_captain) takes
// charge at the HQ when the boss leaves and stands down when he returns; the captain is not crew.
// He never sells or abandons businesses, never moves the boss and never touches frontier towns.
//
// Rules (in the sim): createLieutenantRules -> { tick, command, gate, record, active, captainOf, log }
//   command { id: <boss>, type: 'lieutenant', orders?: { defend, retake, ... : boolean }, budget?, defendAtHome? }
// Brain (a client, like bots): createLieutenantBrain(game, { clan }) -> { tick(): commands }
export const ORDERS = ['defend', 'retake', 'shakedown', 'sweep', 'contracts', 'hire', 'buy', 'jobs', 'steal'];
// Tim 2026-11-06: Shinobi lieutenants only take these contract kinds (never Sabotage or Knock out the boss)
export const LIEUTENANT_JOBS = { scout: 'jobs', bandits: 'jobs', steal: 'steal' };
// which standing order a lieutenant command needs; null = never allowed
function orderFor(c, state) {
  if (c.type === 'contract') {
    if (c.action === 'drop') return 'any';
    const j = c.action === 'take' && (state.contracts?.board || []).find(x => x.id === c.job);
    return (j && LIEUTENANT_JOBS[j.kind]) || null;
  }
  if (c.type === 'deployment') {
    if (c.action === 'autoSector' || c.action === 'staffing') return 'any';
    if (c.action === 'rally') return 'defend';
    if (c.action === 'shakedown') return 'shakedown';
    if (c.action === 'sweep') return 'sweep';
    if (c.action === 'armAmbush') return 'contracts';
    return null;
  }
  if (c.type === 'order') return c.job ? (c.job === 'steal' ? 'steal' : 'jobs') : c.expand ? 'buy' : c.retake ? 'retake' : 'defend';
  if (c.type === 'hire') return 'hire';
  if (c.type === 'business') return c.action === 'buy' ? (c.expand ? 'buy' : 'retake') : c.action === 'knock' ? 'defend' : null;
  return null;
}
const DEFEND_ONLY = new Set(['defend', 'any']);

export function createLieutenantRules({ state, rules = {}, units, clans, doors, spawn, removeUnit, businesses, guideAt = () => null }) {
  const R = { budget: 300, maxBudget: 5000, logEntries: 20, captain: 'city_captain', reserve: 200, jobMinutes: 3, banditJobMinutes: 6, captainWaitSeconds: 60, captainFee: 100, stipend: 150, awayRaidShare: 0.5, wageShare: 0.02, ...rules };
  const on = () => modeRules(state).campaignCity;
  const day = () => state.clock?.day ?? 1;
  const boss = id => Object.values(state.entities).find(e => e.owner === id && e.type === 'hero');
  const away = id => { const b = boss(id); return !!b && b.place === 'world'; };
  const hq = id => Object.values(state.businesses).find(b => b.hideout === id && b.owner === id) || null;
  function record(id) {
    const all = (state.lieutenants ||= {});
    const r = all[id] ||= { orders: Object.fromEntries(ORDERS.map(o => [o, true])), budget: R.budget, defendAtHome: false, spent: 0, day: day(), log: [], captain: null };
    for (const o of ORDERS) if (r.orders[o] === undefined) r.orders[o] = true;   // orders added later start on (older saves)
    return r;
  }
  function log(id, text) {
    const r = record(id);
    r.log.push({ tick: state.tick, day: day(), text });
    if (r.log.length > R.logEntries) r.log.splice(0, r.log.length - R.logEntries);
  }
  // running: the boss is away, or at home with "keep defending" on (defend only)
  const active = id => on() && !!state.clans?.[id] && (away(id) || record(id).defendAtHome);
  const captainOf = id => { const c = state.entities[record(id).captain]; return c && !c.dead ? c : null; };

  // the lieutenant waiting at the island gate for the player's goal steps (Tim 2026-11-06): talkable, not attackable
  const guideWanted = (id, c) => !c.bot && c.permit && !away(id) && !(c.milestones?.metLieutenant && c.milestones?.budgetSet)
    && !Object.values(state.frontier?.settlements || {}).some(s => s.owner === id && s.founded);
  function guide(id, c, r) {
    const g = state.entities[r.guide], want = guideWanted(id, c) && guideAt();
    if (want && !g) {
      const t = units?.types?.[R.captain]; if (!t) return;
      r.guide = spawn(R.captain, t.sprite, want.x, want.z, { owner: id, place: 'street', captain: true, guide: true, holdFire: true, hp: t.hp, dir: want.dir ?? 0 });
    } else if (!want && g) { removeUnit(g.id); delete r.guide; }
    else if (g && (g.dead || g.downed)) { removeUnit(g.id); delete r.guide; }
    else if (g) Object.assign(g, { x: want.x, z: want.z, anim: 'idle' });
  }
  function tick() {
    if (!on()) return;
    for (const id of Object.keys(state.clans || {})) {
      const r = record(id);
      if (state.clans[id]) guide(id, state.clans[id], r);
      if (r.day !== day()) {
        r.day = day(); r.spent = 0;
        // ryo sink (Tim 2026-11-06): each new day the clan pays its lieutenant and captain wageShare of its treasury
        const c0 = state.clans[id], wage = Math.floor(Math.max(0, c0?.ryo || 0) * (R.wageShare || 0));
        if (wage > 0) { debitRyo(state, c0, wage, 'Lieutenant wages'); log(id, `Paid the lieutenant and captain ${wage} ryo`); }
      }
      const cap = state.entities[r.captain];
      // a fallen captain is replaced after captainWaitSeconds for captainFee ryo (free when the clan is broke) (Tim 2026-11-06)
      if (cap?.dead || cap?.downed) { if (cap.dead) { r.captain = null; r.captainDue = state.tick + Math.round((R.captainWaitSeconds ?? 0) * 20); log(id, `The city captain fell: a new one in ${R.captainWaitSeconds ?? 0} s`); } }
      // weak city (Tim 2026-11-06): while the boss is away and the clan holds no business, a small stipend each new day
      const c = state.clans[id];
      if (away(id) && c && r.stipendDay !== day()) {
        r.stipendDay = day();
        const held = Object.values(state.businesses).some(b => b.owner === id && !b.hideout);
        if (!held && R.stipend > 0 && r.awaySince !== undefined && r.awaySince !== day()) { creditRyo(state, c, R.stipend, 'Family stipend'); log(id, `No business held: the family sends ${R.stipend} ryo`); }
      }
      if (away(id)) r.awaySince ??= day(); else delete r.awaySince;
      if (away(id) && !cap) {
        const h = hq(id), d = h && doors.find(x => x.to && !x.ninja && x.place === h.room), t = units?.types?.[R.captain];
        if (!d || !t) continue;
        if (r.captainDue !== undefined) {
          if (state.tick < r.captainDue) continue;
          const fee = Math.min(R.captainFee || 0, Math.max(0, c?.ryo || 0));
          if (fee > 0) debitRyo(state, c, fee, 'New city captain');
          delete r.captainDue;
        }
        r.captain = spawn(R.captain, t.sprite, d.to.x, d.to.z, { owner: id, place: d.place, captain: true, hp: t.hp });
        log(id, 'The city captain takes charge at the HQ');
      } else if (!away(id) && cap) {
        removeUnit(cap.id); r.captain = null; delete r.captainDue;
        log(id, 'The boss is back: the captain stands down');
      }
    }
  }

  // the player's (or bot's) standing orders and budget; validated, a rejected command changes nothing
  function command(e, c) {
    const clan = state.clans?.[e?.owner];
    if (!clan || e.type !== 'hero' || !on()) return false;
    const r = record(clan.id), bad = text => { clan.notice = { tick: state.tick, text }; return false; };
    // goal steps (Tim 2026-11-06): met the lieutenant at the gate, opened While I'm away, set his budget
    const m = (clan.milestones ||= {});
    const FLAG = { met: 'metLieutenant', opened: 'ordersOpened', report: 'reportRead', back: 'reportDue', governor: 'metGovernor' };
    if (FLAG[c.guide]) { m[FLAG[c.guide]] = true; return true; }
    if (c.budget !== undefined && Number.isSafeInteger(c.budget) && c.budget >= 0 && c.budget <= R.maxBudget) m.budgetSet = true;
    if (c.orders !== undefined && (typeof c.orders !== 'object' || c.orders === null || Object.entries(c.orders).some(([k, v]) => !ORDERS.includes(k) || typeof v !== 'boolean'))) return bad('Unknown standing order');
    if (c.budget !== undefined && (!Number.isSafeInteger(c.budget) || c.budget < 0 || c.budget > R.maxBudget)) return bad(`Budget must be 0 to ${R.maxBudget} ryo a day`);
    if (c.defendAtHome !== undefined && typeof c.defendAtHome !== 'boolean') return bad('Bad setting');
    if (c.orders) Object.assign(r.orders, c.orders);
    if (c.budget !== undefined) r.budget = c.budget;
    if (c.defendAtHome !== undefined) r.defendAtHome = c.defendAtHome;
    return true;
  }

  // what a lieutenant command would cost
  function cost(c, id) {
    if (c.type === 'hire') return Array.from({ length: c.count ?? 1 }, (_, i) => clans.hirePrice(id, c.unit, i) ?? Infinity).reduce((n, v) => n + v, 0);
    if (c.type === 'business' && c.action === 'buy') return businesses?.rules?.[state.businesses[c.business]?.kind]?.price ?? Infinity;
    return 0;
  }
  // { ok, why } for a command tagged by: 'lieutenant'; when ok, its cost is booked against the day's budget
  function gate(e, c) {
    const id = e?.owner, clan = state.clans?.[id];
    if (!clan || !active(id)) return { ok: false, why: 'no lieutenant in charge' };
    const order = orderFor(c, state), r = record(id), ninja = clan.kind === 'ninja';
    if (!order) return { ok: false, why: 'not a lieutenant command' };
    if (order !== 'any' && !r.orders[order]) return { ok: false, why: `standing order ${order} is off` };
    if (!away(id) && !DEFEND_ONLY.has(order)) return { ok: false, why: 'the boss is home: defend only' };
    if (c.type === 'hire' && e.id !== r.captain) return { ok: false, why: 'the captain hires' };
    if (order === 'buy' && ninja) return { ok: false, why: 'Shinobi do not own businesses' };
    if ((order === 'jobs' || order === 'steal') && !ninja) return { ok: false, why: 'only Shinobi take contracts' };
    const buyNew = c.type === 'business' && c.action === 'buy' && c.expand, take = c.type === 'contract' && c.action === 'take';
    if (buyNew && r.boughtDay === day()) return { ok: false, why: 'one new business a day' };
    if (take && order === 'steal' && !state.night) return { ok: false, why: 'steals at night only' };
    if (take && order === 'steal' && r.stoleDay === day()) return { ok: false, why: 'one steal a night' };
    if (take && order === 'jobs' && r.jobDay === day()) return { ok: false, why: 'one job a day' };
    const price = cost(c, id);
    if (r.spent + price > r.budget) return { ok: false, why: 'over the budget' };
    if (buyNew && (clan.ryo || 0) - price < R.reserve) return { ok: false, why: `keeps ${R.reserve} ryo in reserve` };
    r.spent += price;
    if (buyNew) r.boughtDay = day();
    if (take) r[order === 'steal' ? 'stoleDay' : 'jobDay'] = day();
    const name = id => state.businesses[id]?.kind?.replace(/_/g, ' ') || 'business';
    const job = take && state.contracts.board.find(x => x.id === c.job);
    const said = c.type === 'hire' ? `Hired a ${c.unit} (${price} ryo)` : buyNew ? `Buying the ${name(c.business)} (${price} ryo)` : c.type === 'business' && c.action === 'buy' ? `Buying back the ${name(c.business)} (${price} ryo)`
      : take ? `Took a contract: ${job?.label || job?.kind}` : c.type === 'contract' && c.action === 'drop' ? 'Called off the contract'
      : c.type === 'deployment' && c.action === 'shakedown' ? `Shakedown on the ${name(c.business)}` : c.type === 'deployment' && c.action === 'sweep' ? 'Sent a Sweep'
      : c.type === 'deployment' && c.action === 'rally' ? 'Called a Rally to defend' : c.type === 'deployment' && c.action === 'armAmbush' ? 'Set an ambush' : null;
    if (said) log(id, said);
    return { ok: true, why: '', cost: price };
  }
  // false on nights a raider leaves this owner alone because its boss is away (awayRaidShare of nights it may raid)
  function raidable(raider, owner) {
    if (!on() || !owner || !away(owner)) return true;
    let h = 2166136261;
    for (const ch of `${day()}:${raider}:${owner}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return ((h >>> 0) % 1000) / 1000 < (R.awayRaidShare ?? 1);
  }
  return { tick, command, gate, record, active, away, captainOf, log, hq, raidable, guideOf: id => state.entities[record(id).guide] || null, rules: R };
}

// The brain: one per clan (player and bots alike), a client that only reads the state and sends commands.
export function createLieutenantBrain(game, { clan }) {
  const state = game.state, L = game.lieutenant;
  let ai = null, aiFor = null, next = 0, jobId = null, jobAt = 0, squad = [];
  const held = new Set();       // businesses it saw the clan hold (retake)
  const day = () => state.clock?.day ?? 1;
  const standing = u => u && !u.dead && !u.downed && !u.jailed;
  const boss = () => Object.values(state.entities).find(e => e.owner === clan && e.type === 'hero');
  const hireType = () => Object.keys(game.settings.units.types).map(k => [k, game.clans.hirePrice(clan, k)])
    .filter(([k, p]) => p !== null && !game.settings.units.types[k].settler).sort((a, b) => a[1] - b[1])[0]?.[0] || null;

  function tick() {
    if (!L) return [];
    const b = boss();
    for (const x of Object.values(state.businesses)) if (x.owner === clan && !x.hideout) held.add(x.id);
    if (!b || !L.active(clan) || state.tick < next) return [];
    next = state.tick + 40;
    const r = L.record(clan), c = state.clans[clan], out = [];
    const tag = cmd => ({ ...cmd, by: 'lieutenant' });
    // defend / shakedown / sweep / contracts: the same deployment brain the bots use, sending as the boss
    if (aiFor !== b.id) { ai = createDeploymentAI(game, { clan, hero: b.id }); aiFor = b.id; }
    for (const cmd of ai.tick()) {
      if (cmd.type === 'deployment' && cmd.action === 'transfer') continue;   // never pulls crew to the absent boss
      // a player's hero party is the player's own: no regroup orders behind his back (Tim 2026-11-07: frontier crew
      // sent to move ran back to the hero after a couple of seconds)
      if (cmd.type === 'order' && cmd.kind === 'follow' && !state.clans[clan]?.bot) continue;
      out.push(tag(cmd));
    }
    if (!L.away(clan)) return out.filter(x => x.type !== 'deployment' || ['rally', 'autoSector', 'staffing'].includes(x.action));
    const cap = L.captainOf(clan), home = L.hq(clan);
    // retake: a business it held that is free again: the captain walks there and buys it back
    const price = x => game.businesses.rules[x.kind]?.price ?? Infinity, left = r.budget - r.spent;
    // only what he can pay today, so the captain never waits at a door he cannot buy (test_lieutenant_hero 2026-11-06)
    const lost = [...held].map(id => state.businesses[id]).find(x => x && !x.owner && x.ring && price(x) <= c.ryo && price(x) <= left);
    if (r.orders.retake && cap && lost) {
      if (Math.hypot(cap.x - lost.ring[0], cap.z - lost.ring[1]) > 1.5 || cap.place !== 'street') out.push(tag({ id: b.id, type: 'order', units: [cap.id], kind: 'move', place: 'street', x: lost.ring[0], z: lost.ring[1], retake: true }));
      else out.push(tag({ id: b.id, type: 'business', action: 'buy', business: lost.id }));
      return out;
    }
    for (const id of [...held]) if (state.businesses[id]?.owner && state.businesses[id].owner !== clan) held.delete(id);   // taken by a rival: needs a raid, not a purchase
    const R = L.rules || {}, ninja = c.kind === 'ninja';
    // buy (Yakuza/Kuroda, Tim 2026-11-06): one free business a day, the nearest to the HQ, inside the budget and the reserve
    if (!ninja && r.orders.buy && cap && home?.ring && r.boughtDay !== day()) {
      const d = x => Math.hypot(x.ring[0] - home.ring[0], x.ring[1] - home.ring[1]);
      const pick = Object.values(state.businesses).filter(x => !x.owner && !x.hideout && x.ring && price(x) <= left && c.ryo - price(x) >= (R.reserve ?? 200))
        .sort((a, b2) => d(a) - d(b2))[0];
      if (pick) {
        if (Math.hypot(cap.x - pick.ring[0], cap.z - pick.ring[1]) > 1.5 || cap.place !== 'street') out.push(tag({ id: b.id, type: 'order', units: [cap.id], kind: 'move', place: 'street', x: pick.ring[0], z: pick.ring[1], expand: true }));
        else out.push(tag({ id: b.id, type: 'business', action: 'buy', business: pick.id, expand: true }));
        return out;
      }
    }
    // Shinobi jobs and steals (Tim 2026-11-06): the captain takes one at the shrine, city crew carry it out
    if (ninja && cap && runJob(b, cap, r, home, out, tag)) return out;
    // hire: the captain hires at the HQ up to the crew cap, inside the budget
    const type = hireType();
    if (r.orders.hire && cap && home && type) {
      if (cap.place !== home.room) { out.push(tag({ id: b.id, type: 'order', units: [cap.id], kind: 'enter', business: home.id })); return out; }
      const room = game.clans.crewCount(clan) + c.queue.length < game.clans.crewCap(clan), price = game.clans.hirePrice(clan, type);
      // with Buy on he saves for the cheapest free business first, so hiring never eats the money for it (soak 2026-11-06)
      const saveFor = !ninja && r.orders.buy && r.boughtDay !== day() ? Math.min(...Object.values(state.businesses).filter(x => !x.owner && !x.hideout && x.ring).map(x => game.businesses.rules[x.kind]?.price ?? Infinity)) + (R.reserve ?? 200) : 0;
      // a boss out on the island with a permit still has a town to pay for: hiring never eats the founding money
      const founding = c.permit ? (game.frontier?.data?.founding?.cost || 0) : 0;
      const keep = Math.max(50, Number.isFinite(saveFor) ? saveFor : 0) + founding;
      if (room && price !== null && c.ryo - price >= keep && r.spent + price <= r.budget && c.queue.length < 2) out.push(tag({ id: cap.id, type: 'hire', business: home.id, unit: type }));
    }
    return out;
  }
  // true while the Shinobi lieutenant is busy with a contract (taking one or carrying it out)
  function runJob(b, cap, r, home, out, tag) {
    const C = state.contracts, mine = C?.active?.[clan], R = L.rules || {};
    if (!C) return false;
    // back out to the street by the HQ (an 'enter' cannot start inside a room); the deployment brain takes them from there
    const recall = () => { const ids = squad.filter(id => standing(state.entities[id]) && state.entities[id].place !== 'world'); if (ids.length && home?.ring) out.push(tag({ id: b.id, type: 'order', units: ids, kind: 'move', place: 'street', x: home.ring[0], z: home.ring[1], job: 'jobs' })); squad = []; jobId = null; };
    if (jobId !== null && (!mine || mine.id !== jobId)) { recall(); return false; }   // done, failed or dropped
    if (mine && mine.id === jobId) {
      const order = mine.kind === 'steal' ? 'steal' : 'jobs';
      const minutes = mine.kind === 'bandits' ? (R.banditJobMinutes ?? R.jobMinutes ?? 3) : (R.jobMinutes ?? 3);
      if (!r.orders[order] || state.tick - jobAt > minutes * 60 * 20) {
        // timed out (bandits move in gangs): the day's job comes back once, so he can try another (Tim 2026-11-06)
        if (r.orders[order] && order === 'jobs' && r.jobRetryDay !== day()) { r.jobRetryDay = day(); delete r.jobDay; L.log?.(clan, 'The job ran out of time: trying another'); }
        out.push(tag({ id: b.id, type: 'contract', action: 'drop' })); recall(); return true;
      }
      squad = squad.filter(id => standing(state.entities[id]) && state.entities[id].place !== 'world');
      if (!squad.length) squad = cityCrew(cap).slice(0, mine.kind === 'bandits' ? 3 : 2).map(u => u.id);
      if (!squad.length) { out.push(tag({ id: b.id, type: 'contract', action: 'drop' })); recall(); return true; }
      const job = { job: order }, x = state.businesses[mine.business];
      if (mine.kind === 'bandits') {
        const t = safeBandit(state.entities[squad[0]], squad.length);
        if (t) out.push(tag({ id: b.id, type: 'order', units: squad, kind: 'attackmove', place: 'street', x: t.x, z: t.z, ...job }));
      } else if (x) {
        const at = p => squad.filter(id => p(state.entities[id].place)), inside = at(p => p === x.room), street = at(p => p === 'street'), rooms = at(p => p !== x.room && p !== 'street');
        if (street.length) out.push(tag({ id: b.id, type: 'order', units: street, kind: 'enter', business: x.id, ...job }));
        if (rooms.length && x.ring) out.push(tag({ id: b.id, type: 'order', units: rooms, kind: 'move', place: 'street', x: x.ring[0], z: x.ring[1], ...job }));   // out first
        const p = mine.kind === 'steal' && game.contracts.stash(x);
        if (p && inside.length) out.push(tag({ id: b.id, type: 'order', units: inside, kind: 'move', place: x.room, x: p.x, z: p.z, ...job }));
      }
      return true;
    }
    if (mine) return false;   // the boss's own contract: leave it alone
    if (game.contracts.readyIn?.(clan)) return false;
    const target = j => j.kind === 'bandits' || (state.businesses[j.business]?.owner && state.businesses[j.business].owner !== clan);
    const crewNow = cityCrew(cap);
    if (crewNow.length < 2) return false;   // hire first
    const bandits = !!safeBandit(crewNow[0], Math.min(3, crewNow.length));
    const rank = { steal: 0, scout: 1, bandits: 2 };   // a steal at night first, then a scout; bandits last (they move in gangs)
    const want = (C.board || []).filter(j => LIEUTENANT_JOBS[j.kind] && target(j) && (j.kind !== 'bandits' || bandits) && (j.kind === 'steal'
      ? r.orders.steal && state.night && r.stoleDay !== day() : r.orders.jobs && r.jobDay !== day())).sort((p, q) => rank[p.kind] - rank[q.kind])[0];
    if (!want) return false;
    const shrine = game.doors.find(d => d.menu === 'contracts');
    if (!shrine) return false;
    if (cap.place !== 'street' || Math.hypot(cap.x - shrine.x, cap.z - shrine.z) > 1.2) { out.push(tag({ id: b.id, type: 'order', units: [cap.id], kind: 'move', place: 'street', x: shrine.x, z: shrine.z, job: LIEUTENANT_JOBS[want.kind] })); return true; }
    out.push(tag({ id: b.id, type: 'contract', action: 'take', job: want.id }));
    jobId = want.id; jobAt = state.tick; squad = [];
    if (home) out.push(tag({ id: b.id, type: 'order', units: [cap.id], kind: 'enter', business: home.id, job: LIEUTENANT_JOBS[want.kind] }));
    return true;
  }
  // a street bandit the squad outnumbers or matches (no bandits within 8 of it beyond the squad's size), nearest to u
  const bandit = e => e.owner === 'bandits' && standing(e) && e.place === 'street';
  function safeBandit(u, n) {
    if (!u) return null;
    const all = Object.values(state.entities).filter(bandit);
    return all.filter(t => all.filter(o => Math.hypot(o.x - t.x, o.z - t.z) < 8).length <= n)
      .sort((p, q) => Math.hypot(p.x - u.x, p.z - u.z) - Math.hypot(q.x - u.x, q.z - u.z))[0] || null;
  }
  // the clan's crew left in the city who may go on a job (any group: the boss is away): not the captain, not in a Rally
  const cityCrew = cap => game.clans.crewOf(clan).filter(u => standing(u) && u.id !== cap.id && !u.captain && u.place !== 'world' && !game.rally.participating(u))
    .sort((p, q) => (p.place !== 'street') - (q.place !== 'street'));
  return { tick, config: { lieutenant: true, clan }, saveState: () => ({ next, held: [...held], jobId, jobAt, squad }),
    loadState: d => { if (!d) return; next = d.next ?? 0; held.clear(); for (const id of d.held || []) held.add(id); jobId = d.jobId ?? null; jobAt = d.jobAt ?? 0; squad = d.squad || []; } };
}
