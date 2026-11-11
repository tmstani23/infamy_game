import { creditRyo, debitRyo } from './treasury.js';
import { modeRules } from './modes/index.js';
import { createDeploymentAI } from './deployment_ai.js';
import { hireMix } from './hire_mix.js';
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
export const ORDERS = ['defend', 'retake', 'shakedown', 'sweep', 'contracts', 'hire', 'buy', 'jobs', 'steal', 'raid'];
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
    if (c.action === 'rally') return c.purpose === 'raid' ? 'raid' : 'defend';
    if (c.action === 'shakedown') return 'shakedown';
    if (c.action === 'sweep') return 'sweep';
    if (c.action === 'armAmbush') return 'contracts';
    return null;
  }
  if (c.type === 'use') return c.job === 'raid' ? 'raid' : null;   // raiders step in through the door (Tim 2026-11-08)
  if (c.type === 'order') return c.job ? (c.job === 'steal' ? 'steal' : c.job === 'raid' ? 'raid' : 'jobs') : c.expand ? 'buy' : c.retake ? 'retake' : c.care ? 'hire' : 'defend';
  if (c.type === 'hire') return 'hire';
  // hiring mix (Tim 2026-11-10): the captain lets one basic crewman go to make room for a real unit, under Hire
  if (c.type === 'dismiss') return c.unit != null && c.unit !== 'all' && c.patient == null && c.prisoner == null ? 'hire' : null;
  // crew care (Tim 2026-11-10): the captain bails prisoners out and fetches recovered patients, under Hire
  if (c.type === 'police') return c.action === 'bail' ? 'hire' : null;
  if (c.type === 'clinic') return c.action === 'revive' ? 'hire' : null;
  if (c.type === 'business') return c.action === 'buy' ? (c.expand ? 'buy' : 'retake') : c.action === 'knock' ? 'defend' : ['lantern', 'raid'].includes(c.action) ? 'raid' : null;
  return null;
}
const DEFEND_ONLY = new Set(['defend', 'any']);

export function createLieutenantRules({ state, rules = {}, units, clans, doors, spawn, removeUnit, businesses, guideAt = () => null }) {
  const R = { budget: 300, maxBudget: 5000, logEntries: 20, captain: 'city_captain', reserve: 200, jobMinutes: 3, banditJobMinutes: 6, captainWaitSeconds: 60, captainFee: 100, stipend: 150, awayRaidShare: 0.5, wageShare: 0.02, raidReserve: 1000, raidMinCrew: 3, ...rules };
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
  // Tim 2026-11-10: he stands there whenever the boss is in the city (the talk spot has no ground ring any more, a quest
  // mark over his head instead), not only for the first goal steps
  const guideWanted = (id, c) => !c.bot && !away(id);
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
      // a knocked-out captain counts as fallen too (Tim 2026-11-10: "2 city captains"): he used to be carried to the
      // clinic, a new captain took charge, and the old one came back from the clinic as an ordinary crewman
      if (cap?.dead || cap?.downed) {
        if (!cap.dead) removeUnit(cap.id);
        r.captain = null; r.captainDue = state.tick + Math.round((R.captainWaitSeconds ?? 0) * 20); log(id, `The city captain fell: a new one in ${R.captainWaitSeconds ?? 0} s`);
      }
      // and any such leftover (old saves) is cleared: clinic and jail entries, and captains that are neither in charge nor the gate guide
      if (state.tick % 40 === 0 && state.clans[id]) {
        const c1 = state.clans[id];
        for (const list of [c1.clinic, c1.jail, c1.respawning]) if (Array.isArray(list)) for (let i = list.length - 1; i >= 0; i--) if (list[i].unit === R.captain) list.splice(i, 1);
        for (const e of Object.values(state.entities)) if (e.owner === id && e.type === R.captain && e.id !== r.captain && e.id !== r.guide) removeUnit(e.id);
      }
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
        if (!d || !t || (c?.captainJailedUntil ?? -1) > state.tick) continue;   // arrested: serving his time (sim/police.js jailCaptain)
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
    if (c.type === 'police' && c.action === 'bail') return state.clans[id]?.jail?.[c.prisoner]?.bail ?? Infinity;
    if (c.type === 'clinic' && c.action === 'revive') { const p = state.clans[id]?.clinic?.[c.patient]; return p?.kind === 'recover' ? clans.reviveCost(p, id) : Infinity; }
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
    if (['hire', 'police', 'clinic', 'dismiss'].includes(c.type) && e.id !== r.captain) return { ok: false, why: 'the captain hires' };
    if (order === 'buy' && ninja) return { ok: false, why: 'Shinobi do not own businesses' };
    if ((order === 'jobs' || order === 'steal') && !ninja) return { ok: false, why: 'only Shinobi take contracts' };
    if (order === 'raid' && ninja) return { ok: false, why: 'Shinobi do not capture businesses' };
    // a War Lantern comes out of the treasury, not the daily budget, and only while it keeps raidReserve (Tim 2026-11-08)
    const lantern = c.type === 'business' && c.action === 'lantern', lanternPrice = units?.rules?.raid?.lanternPrice ?? 1200;
    if (lantern && (clan.ryo || 0) - lanternPrice < R.raidReserve) return { ok: false, why: `keeps ${R.raidReserve} ryo after a War Lantern` };
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
    if (c.type === 'business' && c.action === 'raid') r.raidDay = day();
    const name = id => state.businesses[id]?.kind?.replace(/_/g, ' ') || 'business';
    const job = take && state.contracts.board.find(x => x.id === c.job);
    const said = c.type === 'police' ? `Bailed out a ${clan.jail[c.prisoner].unit} (${price} ryo)` : c.type === 'clinic' ? `Fetched a ${clan.clinic[c.patient].unit} from the clinic (${price} ryo)`
      : c.type === 'dismiss' ? `Let a ${state.entities[c.unit]?.type || 'crewman'} go to hire better` : c.type === 'hire' ? `Hired a ${c.unit} (${price} ryo)` : buyNew ? `Buying the ${name(c.business)} (${price} ryo)` : c.type === 'business' && c.action === 'buy' ? `Buying back the ${name(c.business)} (${price} ryo)`
      : take ? `Took a contract: ${job?.label || job?.kind}` : c.type === 'contract' && c.action === 'drop' ? 'Called off the contract'
      : c.type === 'deployment' && c.action === 'shakedown' ? `Shakedown on the ${name(c.business)}` : c.type === 'deployment' && c.action === 'sweep' ? 'Sent a Sweep'
      : lantern ? `Bought a War Lantern (${lanternPrice} ryo)` : c.type === 'business' && c.action === 'raid' ? `Raiding the ${name(c.business)}`
      : c.type === 'deployment' && c.action === 'rally' ? (c.purpose === 'raid' ? 'Called a Rally to raid' : 'Called a Rally to defend') : c.type === 'deployment' && c.action === 'armAmbush' ? 'Set an ambush' : null;
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
  let ai = null, aiFor = null, next = 0, jobId = null, jobAt = 0, squad = [], raid = null, raidThreat = null;   // raid: { business, at } (Tim 2026-11-08)
  const held = new Set();       // businesses it saw the clan hold (retake)
  const day = () => state.clock?.day ?? 1;
  const standing = u => u && !u.dead && !u.downed && !u.jailed;
  const boss = () => Object.values(state.entities).find(e => e.owner === clan && e.type === 'hero');
  // Hiring mix (Tim 2026-11-10): the captain cycles through the clan's real units, always the one he has fewest of
  // (cheapest first on a tie). The basic units (hireBasic: thug, brute) are only a fallback while the treasury or the
  // whole day's budget cannot cover a real unit, and at the crew cap he lets a basic one go once he can afford better.
  const basicUnit = k => (L.rules?.hireBasic ?? ['thug', 'brute']).includes(k);
  const hirePlan = () => hireMix(game, clan, L.rules?.hireBasic);

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
    // the captain fights back (Tim 2026-11-10: he stood there and died to bandits): whoever hit him in the last few
    // seconds comes first, before any errand
    if (cap && standing(cap) && cap.hitBy && state.tick - cap.hitBy.tick < 80) {
      const foe = state.entities[cap.hitBy.id];
      if (standing(foe) && foe.owner !== clan && foe.place === cap.place && !foe.cop) {
        next = Math.min(next, state.tick + 10);
        if (!(cap.order?.kind === 'attack' && cap.order.target === foe.id)) out.push(tag({ id: b.id, type: 'order', units: [cap.id], kind: 'attack', target: foe.id, place: cap.place }));
        return out;
      }
    }
    if (r.orders.defend) defendLantern(b, cap, out, tag);
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
    // crew care (Tim 2026-11-10): under Hire the captain walks to the police HQ and bails out the cheapest prisoner, then
    // to the clinic for recovered patients. Ahead of buying and hiring (a freed crewman costs less than a new one);
    // inside the day's budget, keeping only 50 ryo and a permit's founding money (never the save-for-a-business reserve)
    if (r.orders.hire && cap) {
      const keep = 50 + (c.permit ? (game.frontier?.data?.founding?.cost || 0) : 0), can = n => n <= left && c.ryo - n >= keep;
      const care = (menu, cmd) => {   // true once handled this tick
        const d = game.doors.find(x => x.menu === menu);
        if (!d) return false;
        if (cap.place !== 'street' || Math.hypot(cap.x - d.x, cap.z - d.z) > 0.8) out.push(tag({ id: b.id, type: 'order', units: [cap.id], kind: 'move', place: 'street', x: d.x, z: d.z, care: true }));
        else out.push(tag({ id: cap.id, ...cmd }));
        return true;
      };
      const prisoner = (c.jail || []).map((p, i) => [p.bail, i]).filter(([n]) => can(n)).sort((p, q) => p[0] - q[0])[0]?.[1];
      if (prisoner !== undefined && care('police_hq', { type: 'police', action: 'bail', prisoner })) return out;
      const patient = c.clinic.findIndex(p => p.kind === 'recover' && p.left <= 0 && can(game.clans.reviveCost(p, clan)));
      if (patient >= 0 && care('clinic', { type: 'clinic', action: 'revive', patient })) return out;
    }
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
    // raids (Tim 2026-11-08): the captain buys a War Lantern, calls a Rally and leads it to a rival business at night
    if (!ninja && cap && r.orders.raid && runRaid(b, cap, c, out, tag)) return out;
    // Shinobi jobs and steals (Tim 2026-11-06): the captain takes one at the shrine, city crew carry it out
    if (ninja && cap && runJob(b, cap, r, home, out, tag)) return out;
    // hire: the captain hires at the HQ up to the crew cap, inside the budget
    const plan = hirePlan(), type = plan.want;
    if (r.orders.hire && cap && home && type) {
      if (cap.place !== home.room) { out.push(tag({ id: b.id, type: 'order', units: [cap.id], kind: 'enter', business: home.id })); return out; }
      const room = game.clans.crewCount(clan) + c.queue.length < game.clans.crewCap(clan), price = game.clans.hirePrice(clan, type);
      // with Buy on he saves for the cheapest free business first, so hiring never eats the money for it (soak 2026-11-06)
      const saveFor = !ninja && r.orders.buy && r.boughtDay !== day() ? Math.min(...Object.values(state.businesses).filter(x => !x.owner && !x.hideout && x.ring).map(x => game.businesses.rules[x.kind]?.price ?? Infinity)) + (R.reserve ?? 200) : 0;
      // a boss out on the island with a permit still has a town to pay for: hiring never eats the founding money
      const founding = c.permit ? (game.frontier?.data?.founding?.cost || 0) : 0;
      const keep = Math.max(50, Number.isFinite(saveFor) ? saveFor : 0) + founding;
      const can = p => p !== null && c.ryo - p >= keep && r.spent + p <= r.budget;
      if (room && c.queue.length < 2) {
        // a basic unit only while the treasury or the whole day's budget cannot cover the real one (not just today's leftover)
        const low = plan.fallback, tight = price !== null && (c.ryo - price < keep || price > r.budget);
        const pick = can(price) ? type : low !== type && tight && can(game.clans.hirePrice(clan, low)) ? low : null;
        if (pick) out.push(tag({ id: cap.id, type: 'hire', business: home.id, unit: pick }));
      } else if (!room && !c.queue.length && !basicUnit(type) && price !== null && r.spent + price <= r.budget) {
        // at the crew cap: one basic crewman in the city makes room once the better unit is affordable
        const spare = cityCrew(cap).filter(u => basicUnit(u.type) && !u.aboard && !u.mounted).sort((a, b) => (game.settings.units.types[a.type].price || 0) - (game.settings.units.types[b.type].price || 0))[0];
        if (spare && c.ryo + game.clans.dismissRefund(spare.type) - price >= keep) out.push(tag({ id: cap.id, type: 'dismiss', unit: spare.id, business: home.id }));
      }
    }
    return out;
  }
  // Defending with the boss away (Tim 2026-11-10): a rival's War Lantern outside one of our businesses is knocked down
  // by whoever of ours is nearest (crew or the captain). He walks up and starts the channel; a hit interrupts it, and
  // he tries again once nobody has hit him for knockRetrySeconds.
  function defendLantern(b, cap, out, tag) {
    const a = Object.values(state.attacks || {}).find(x => x.mode === 'raid' && x.defender === clan && x.phase === 'warmup' && x.lantern);
    if (!a) return;
    next = Math.min(next, state.tick + 10);   // look again soon: the channel is short
    if (a.knock) return;
    const reach = (game.businesses.raidRules.knockReach ?? 1.6) - 0.4, wait = (L.rules?.knockRetrySeconds ?? 3) * 20;
    const d = u => Math.hypot(u.x - a.lantern.x, u.z - a.lantern.z);
    const all = [...game.clans.crewOf(clan), ...(cap ? [cap] : [])].filter(u => standing(u) && !u.guard);
    // nobody out on the street (Tim 2026-11-10: everyone was at home when the HQ was lit up): one of the crew inside
    // the HQ steps out to do it, the captain last
    const home = L.hq(clan)?.room, inside = all.filter(u => home && u.place === home).sort((p, q) => (p.captain ? 1 : 0) - (q.captain ? 1 : 0))[0];
    const who = all.filter(u => u.place === 'street').sort((p, q) => d(p) - d(q))[0] || inside;
    if (!who) return;
    if (who.place !== 'street') { if (!(who.order?.kind === 'move' && who.order.place === 'street')) out.push(tag({ id: b.id, type: 'order', units: [who.id], kind: 'move', place: 'street', x: a.lantern.x, z: a.lantern.z })); return; }
    if (d(who) > reach) { out.push(tag({ id: b.id, type: 'order', units: [who.id], kind: 'move', place: 'street', x: a.lantern.x, z: a.lantern.z })); return; }
    if (who.hitBy && state.tick - who.hitBy.tick < wait) return;   // under attack: fight first
    out.push(tag({ id: b.id, type: 'business', action: 'knock', business: a.business }));
  }
  // Raid (Tim 2026-11-08, "holds even"): at the pace a boss would. The captain buys a War Lantern at the moneylender
  // (treasury, keeping raidReserve), and at night calls a Rally of the city groups, walks them to the weakest rival
  // business he can raid, plants the lantern, and once the doors open everyone goes in to hold the back room.
  // True while busy with it.
  function runRaid(b, cap, c, out, tag) {
    const R = L.rules || {}, B = game.businesses, price = game.settings.units.rules?.raid?.lanternPrice ?? 1200;
    const D = state.deployment?.clans?.[clan], rs = game.rally.status(clan);
    const party = () => (rs.active ? D?.rally?.participants || [] : []).map(p => state.entities[p.id]).filter(u => standing(u) && u.place !== 'world');
    const near = (u, x, z, d) => u.place === 'street' && Math.hypot(u.x - x, u.z - z) <= d;
    const move = (units, x, z, place = 'street') => { const ids = units.filter(u => !(u.order?.kind === 'move' && u.order.place === place && Math.hypot(u.order.x - x, u.order.z - z) < 3)).map(u => u.id);
      for (const id of ids) out.push(tag({ id: b.id, type: 'order', units: [id], kind: 'move', place, x, z, job: 'raid' })); };   // one each: crew of mixed groups
    const a = Object.values(state.attacks || {}).find(x => x.mode === 'raid' && x.clan === clan);
    if (a) {   // under way
      const x = state.businesses[a.business], crew = [...party(), cap].filter(standing);
      if (a.phase === 'warmup' || !x?.ring) {
        // someone is knocking the War Lantern down (Tim 2026-11-10): everyone on him, and for a few seconds after, so
        // he cannot simply start again; then back to the door
        next = Math.min(next, state.tick + 10);
        const k = a.knock && state.entities[a.knock.by];
        if (standing(k)) raidThreat = { id: k.id, until: state.tick + (R.knockGuardSeconds ?? 4) * 20 };
        const foe = raidThreat && state.tick < raidThreat.until && state.entities[raidThreat.id];
        if (standing(foe) && foe.place === 'street' && a.lantern && Math.hypot(foe.x - a.lantern.x, foe.z - a.lantern.z) < 8) {
          const ids = crew.filter(u => u.place === 'street' && !(u.order?.kind === 'attack' && u.order.target === foe.id)).map(u => u.id);
          if (ids.length) out.push(tag({ id: b.id, type: 'order', units: ids, kind: 'attack', target: foe.id, place: 'street', job: 'raid' }));
          return true;
        }
        raidThreat = null;
        move(crew.filter(u => !near(u, x.ring[0], x.ring[1], 3)), x.ring[0], x.ring[1]); return true;
      }
      for (const u of crew) {
        if (u.place === a.room) continue;
        if (near(u, x.ring[0], x.ring[1], 1.4)) { if (B.entryStatus(u, a.room).ok) out.push(tag({ id: u.id, type: 'use', job: 'raid' })); }   // full inside: wait at the door
        else move([u], x.ring[0], x.ring[1]);
      }
      move(crew.filter(u => u.place === a.room && Math.hypot(u.x - a.hold.x, u.z - a.hold.z) > a.hold.r * 0.6), a.hold.x, a.hold.z, a.room);
      return true;
    }
    if (raid && state.tick - raid.at > 20 * 120) raid = null;   // never got there: drop it
    // a War Lantern first, by day or night
    if (!(c.lanterns > 0)) {
      const ml = Object.values(state.businesses).find(x => x.kind === 'moneylender' && x.ring);
      if (!ml || (c.ryo || 0) - price < (R.raidReserve ?? 1000)) return false;
      if (!near(cap, ml.ring[0], ml.ring[1], 1.2)) move([cap], ml.ring[0], ml.ring[1]);
      else out.push(tag({ id: cap.id, type: 'business', action: 'lantern', business: ml.id }));
      return true;
    }
    if (!state.night) return false;
    // the weakest rival business he may raid (the season leader's first), not an HQ
    const lead = game.leader?.leader?.(), defenders = x => Object.values(state.entities).filter(u => u.owner === x.owner && standing(u)
      && (u.place === x.room || near(u, x.ring[0], x.ring[1], 15))).length;
    const okWhy = new Set(['', 'Walk to its door to raid']);
    let target = raid && state.businesses[raid.business];
    if (target && !okWhy.has(B.canRaid(cap.id, target.id).why)) { target = null; raid = null; }
    if (!target) {
      target = Object.values(state.businesses).filter(x => x.owner && x.owner !== clan && state.clans[x.owner] && !x.hideout && x.room && x.ring
        && L.raidable(clan, x.owner) && okWhy.has(B.canRaid(cap.id, x.id).why))
        .sort((p, q) => ((q.owner === lead) - (p.owner === lead)) || defenders(p) - defenders(q))[0];
      if (!target) return false;
    }
    // gather: a Rally of the city groups (never the boss's own party out on the island)
    if (!raid) {
      const city = game.clans.crewOf(clan).filter(u => standing(u) && u.place !== 'world' && !u.captain && !u.deployment?.transfer);
      if (city.length < (R.raidMinCrew ?? 3) || rs.active || rs.cooldown > 0) return false;
      out.push(tag({ id: b.id, type: 'deployment', action: 'rally', purpose: 'raid', groups: ['home', ...state.deployment.sectors.map(s => s.id)] }));
      raid = { business: target.id, at: state.tick };
      return true;
    }
    if (!rs.active) { raid = null; return false; }
    const crew = party(), [tx, tz] = target.ring;
    move(crew, tx, tz);
    if (!near(cap, tx, tz, 1.2)) { move([cap], tx, tz); return true; }
    const ready = crew.filter(u => near(u, tx, tz, 8)).length;
    if (ready >= Math.min(R.raidMinCrew ?? 3, crew.length) || state.tick - raid.at > 20 * 60) out.push(tag({ id: cap.id, type: 'business', action: 'raid', business: target.id }));
    return true;
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
      squad = squad.filter(id => standing(state.entities[id]) && state.entities[id].place !== 'world' && !state.entities[id].deployment?.transfer);
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
  const cityCrew = cap => game.clans.crewOf(clan).filter(u => standing(u) && !u.deployment?.transfer && u.id !== cap.id && !u.captain && u.place !== 'world' && !game.rally.participating(u))
    .sort((p, q) => (p.place !== 'street') - (q.place !== 'street'));
  return { tick, config: { lieutenant: true, clan }, saveState: () => ({ next, held: [...held], jobId, jobAt, squad }),
    loadState: d => { if (!d) return; next = d.next ?? 0; held.clear(); for (const id of d.held || []) held.add(id); jobId = d.jobId ?? null; jobAt = d.jobAt ?? 0; squad = d.squad || []; } };
}
