import { modeRules } from './modes/index.js';
import { createDeploymentAI } from './deployment_ai.js';
// The lieutenant (frontier plan C2 + C3, Tim 2026-11-02/05). Campaign only (capability campaignCity).
// While a clan's boss is out on the island, its city runs on a lieutenant: a bot brain that sends the
// same commands a player could (tagged by: 'lieutenant'), limited to the standing orders the clan set
// (defend, retake, shakedown, sweep, contracts, hire) and to its daily budget. Every clan gets one, bots
// too (rival bosses leave for the frontier as well). A city captain (units.json city_captain) takes
// charge at the HQ when the boss leaves and stands down when he returns; the captain is not crew.
// He never sells or abandons businesses, never moves the boss and never touches frontier towns.
//
// Rules (in the sim): createLieutenantRules -> { tick, command, gate, record, active, captainOf, log }
//   command { id: <boss>, type: 'lieutenant', orders?: { defend, retake, ... : boolean }, budget?, defendAtHome? }
// Brain (a client, like bots): createLieutenantBrain(game, { clan }) -> { tick(): commands }
export const ORDERS = ['defend', 'retake', 'shakedown', 'sweep', 'contracts', 'hire'];
// which standing order a lieutenant command needs; null = never allowed
function orderFor(c) {
  if (c.type === 'deployment') {
    if (c.action === 'autoSector' || c.action === 'staffing') return 'any';
    if (c.action === 'rally') return 'defend';
    if (c.action === 'shakedown') return 'shakedown';
    if (c.action === 'sweep') return 'sweep';
    if (c.action === 'armAmbush') return 'contracts';
    return null;
  }
  if (c.type === 'order') return c.retake ? 'retake' : 'defend';
  if (c.type === 'hire') return 'hire';
  if (c.type === 'business') return c.action === 'buy' ? 'retake' : c.action === 'knock' ? 'defend' : null;
  return null;
}
const DEFEND_ONLY = new Set(['defend', 'any']);

export function createLieutenantRules({ state, rules = {}, units, clans, doors, spawn, removeUnit, businesses }) {
  const R = { budget: 300, maxBudget: 5000, logEntries: 20, captain: 'city_captain', ...rules };
  const on = () => modeRules(state).campaignCity;
  const day = () => state.clock?.day ?? 1;
  const boss = id => Object.values(state.entities).find(e => e.owner === id && e.type === 'hero');
  const away = id => { const b = boss(id); return !!b && b.place === 'world'; };
  const hq = id => Object.values(state.businesses).find(b => b.hideout === id && b.owner === id) || null;
  function record(id) {
    const all = (state.lieutenants ||= {});
    return all[id] ||= { orders: Object.fromEntries(ORDERS.map(o => [o, true])), budget: R.budget, defendAtHome: false, spent: 0, day: day(), log: [], captain: null };
  }
  function log(id, text) {
    const r = record(id);
    r.log.push({ tick: state.tick, day: day(), text });
    if (r.log.length > R.logEntries) r.log.splice(0, r.log.length - R.logEntries);
  }
  // running: the boss is away, or at home with "keep defending" on (defend only)
  const active = id => on() && !!state.clans?.[id] && (away(id) || record(id).defendAtHome);
  const captainOf = id => { const c = state.entities[record(id).captain]; return c && !c.dead ? c : null; };

  function tick() {
    if (!on()) return;
    for (const id of Object.keys(state.clans || {})) {
      const r = record(id);
      if (r.day !== day()) { r.day = day(); r.spent = 0; }
      const cap = state.entities[r.captain];
      if (cap?.dead || cap?.downed) { if (cap.dead) { r.captain = null; log(id, 'The city captain fell'); } }
      if (away(id) && !cap) {
        const h = hq(id), d = h && doors.find(x => x.to && !x.ninja && x.place === h.room), t = units?.types?.[R.captain];
        if (!d || !t) continue;
        r.captain = spawn(R.captain, t.sprite, d.to.x, d.to.z, { owner: id, place: d.place, captain: true, hp: t.hp });
        log(id, 'The city captain takes charge at the HQ');
      } else if (!away(id) && cap) {
        removeUnit(cap.id); r.captain = null;
        log(id, 'The boss is back: the captain stands down');
      }
    }
  }

  // the player's (or bot's) standing orders and budget; validated, a rejected command changes nothing
  function command(e, c) {
    const clan = state.clans?.[e?.owner];
    if (!clan || e.type !== 'hero' || !on()) return false;
    const r = record(clan.id), bad = text => { clan.notice = { tick: state.tick, text }; return false; };
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
    const order = orderFor(c), r = record(id);
    if (!order) return { ok: false, why: 'not a lieutenant command' };
    if (order !== 'any' && !r.orders[order]) return { ok: false, why: `standing order ${order} is off` };
    if (!away(id) && !DEFEND_ONLY.has(order)) return { ok: false, why: 'the boss is home: defend only' };
    if (c.type === 'hire' && e.id !== r.captain) return { ok: false, why: 'the captain hires' };
    const price = cost(c, id);
    if (r.spent + price > r.budget) return { ok: false, why: 'over the budget' };
    r.spent += price;
    const name = id => state.businesses[id]?.kind?.replace(/_/g, ' ') || 'business';
    const said = c.type === 'hire' ? `Hired a ${c.unit} (${price} ryo)` : c.type === 'business' && c.action === 'buy' ? `Buying back the ${name(c.business)} (${price} ryo)`
      : c.type === 'deployment' && c.action === 'shakedown' ? `Shakedown on the ${name(c.business)}` : c.type === 'deployment' && c.action === 'sweep' ? 'Sent a Sweep'
      : c.type === 'deployment' && c.action === 'rally' ? 'Called a Rally to defend' : c.type === 'deployment' && c.action === 'armAmbush' ? 'Set an ambush' : null;
    if (said) log(id, said);
    return { ok: true, why: '', cost: price };
  }
  return { tick, command, gate, record, active, away, captainOf, log, hq };
}

// The brain: one per clan (player and bots alike), a client that only reads the state and sends commands.
export function createLieutenantBrain(game, { clan }) {
  const state = game.state, L = game.lieutenant;
  let ai = null, aiFor = null, next = 0;
  const held = new Set();       // businesses it saw the clan hold (retake)
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
      out.push(tag(cmd));
    }
    if (!L.away(clan)) return out.filter(x => x.type !== 'deployment' || ['rally', 'autoSector', 'staffing'].includes(x.action));
    const cap = L.captainOf(clan), home = L.hq(clan);
    // retake: a business it held that is free again: the captain walks there and buys it back
    const lost = [...held].map(id => state.businesses[id]).find(x => x && !x.owner && x.ring && game.businesses.rules[x.kind]?.price <= c.ryo);
    if (r.orders.retake && cap && lost) {
      if (Math.hypot(cap.x - lost.ring[0], cap.z - lost.ring[1]) > 1.5 || cap.place !== 'street') out.push(tag({ id: b.id, type: 'order', units: [cap.id], kind: 'move', place: 'street', x: lost.ring[0], z: lost.ring[1], retake: true }));
      else out.push(tag({ id: b.id, type: 'business', action: 'buy', business: lost.id }));
      return out;
    }
    for (const id of [...held]) if (state.businesses[id]?.owner && state.businesses[id].owner !== clan) held.delete(id);   // taken by a rival: needs a raid, not a purchase
    // hire: the captain hires at the HQ up to the crew cap, inside the budget
    const type = hireType();
    if (r.orders.hire && cap && home && type) {
      if (cap.place !== home.room) { out.push(tag({ id: b.id, type: 'order', units: [cap.id], kind: 'enter', business: home.id })); return out; }
      const room = game.clans.crewCount(clan) + c.queue.length < game.clans.crewCap(clan), price = game.clans.hirePrice(clan, type);
      if (room && price !== null && c.ryo - price >= 50 && r.spent + price <= r.budget && c.queue.length < 2) out.push(tag({ id: cap.id, type: 'hire', business: home.id, unit: type }));
    }
    return out;
  }
  return { tick, config: { lieutenant: true, clan }, saveState: () => ({ next, held: [...held] }), loadState: d => { if (!d) return; next = d.next ?? 0; held.clear(); for (const id of d.held || []) held.add(id); } };
}
