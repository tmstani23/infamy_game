// Surrender and terms (frontier plan F6, war checkpoint 8c; Tim 2026-11-09 and 2026-11-15). Rules only: no DOM, and
// every roll is seeded. Numbers: data.war.surrender (placeholders, Tim to tune).
//
// Either side of a war can surrender at any time. It cannot be taken back and the war then always ends in that
// side's loss. From that moment there is a ceasefire: nobody attacks, towers hold fire, fires go out, channels stop
// (game.js warNeutral, structures.js warFor: both ask war.terms).
//   war.terms = { by: 'attacker' | 'defender', clan, at, offers, offer: { amount, at, until } | null, until,
//                 last: <amount last refused> | null, low, suggest, fair: [lo, hi], state?: 'outcome', ended? }
// The surrendering side offers a ransom (surrender.offerSeconds to answer); the other side accepts, says no (a new
// offer may follow within surrender.gapSeconds) or refuses for good. Running out of time counts as refused for good.
// The surrendering side may also leave without terms.
//   accepted   -> the ransom is paid (an attacker pays from his Clan treasury into the town coffers; a defender pays
//                 from the town coffers, then his Clan treasury, into the attacker's Clan treasury; never a war chest).
//                 The war ends 'ransomed': the defender keeps the town, the attacker's hero and crew go to their
//                 nearest own town, every war troop walks off, the attacker's chest goes home, and the town's
//                 cooldown is surrender.cooldownDays.
//   no terms   -> an attacker who surrendered: the war ends 'attackerSurrendered' (as a fallen camp: the chest goes
//                 to the town coffers, his hero and crew fall back). A defender who surrendered: his troops walk off,
//                 his hero and crew in the war circle go to his nearest other town, and the attacker picks capture,
//                 sack or burn with no channel (terms.state 'outcome', surrender.outcomeSeconds, then sack).
// Commands (players and bots alike; e = any unit of that side, usually the hero):
//   { id, type: 'frontier', action: 'warSurrender', war }
//   { id, type: 'frontier', action: 'warOffer', war, amount }           the surrendering side
//   { id, type: 'frontier', action: 'warLeave', war }                   the surrendering side: leave without terms
//   { id, type: 'frontier', action: 'warAnswer', war, answer: 'accept' | 'no' | 'never' }   the other side
//   { id, type: 'frontier', action: 'warOutcome', war, outcome: 'capture' | 'sack' | 'burn' }   the attacker, after a defender's surrender
// The estimate (Tim 2026-11-09): a clan guesses its chance to win only from what it has met: the other side's troops
// it has spotted in this war (war.spotted[clan], fading), the buildings still standing on both morale bars, the other
// clan's towns it has found on the map and its hold on the city. Never a war chest. A seeded noise of
// surrender.noise is added. A judge's price is the worth of what it would gain (the town, or its guess of the
// attacker's chest from the camp and army) times its chance to win; a bot accepts any offer at or above its price.
// The same sum fills terms.suggest for the surrendering side and terms.fair (a rough range) for the other side.
// Bots: answer after bot.answerSeconds; say no below their price and refuse for good after bot.maxLow low offers;
// start a surrender only after bot.notBeforeSeconds, when their loss looks at least bot.lossAt likely, and then only
// by bot.chance per check (every bot.everySeconds).
// createWarTerms({ state, data, war, world, morale, warEnd }) -> { command, tick, view, chance, price, truce, attach }
import { debitRyo, creditRyo } from '../treasury.js';
import { tierOf } from './tiers.js';

export function createWarTerms({ state, data, war, world, morale, warEnd, seed = () => state.campaignSeed ?? 1 }) {
  const W = () => data.war || {};
  const S = () => ({ offerSeconds: 60, gapSeconds: 30, outcomeSeconds: 60, cooldownDays: 3, noise: 0.1, ...W().surrender });
  const BOT = () => ({ everySeconds: 30, notBeforeSeconds: 300, lossAt: 0.85, chance: 0.03, answerSeconds: 3, maxLow: 3, raise: 1.25, maxOffers: 3, ...S().bot });
  const WORTH = () => ({ tier: [0, 300, 900, 2000], material: 0.5, building: 0.5, hero: 300, crew: 80, town: 400, business: 60, weight: 12, ...S().worth });
  let runtime = null;
  const f = () => state.frontier;
  const now = () => state.tick ?? 0;
  const secs = n => Math.round(n * 20);
  const town = id => f()?.settlements?.[id] || null;
  const clanOf = id => state.clans?.[id] || null;
  const nameOf = id => clanOf(id)?.name || 'A rival clan';
  const say = (clan, text) => { const c = clanOf(clan); if (c) c.notice = { tick: now(), text }; };
  const news = n => (state.news ||= []).push(n);
  const sideOf = (w, clan) => !w || clan == null ? null : w.attacker === clan ? 'attacker' : w.defender === clan ? 'defender' : null;
  const other = side => side === 'attacker' ? 'defender' : 'attacker';
  const clanAt = (w, side) => side === 'attacker' ? w.attacker : w.defender;
  const round10 = n => Math.max(10, Math.round(n / 10) * 10);
  // a seeded number in [0, 1) from its parts (the same game gives the same rolls)
  const roll = (...parts) => { let h = (seed() | 0) ^ 0x9e3779b9; for (const ch of parts.join('|')) { h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193); h ^= h >>> 13; } h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return ((h >>> 0) % 100000) / 100000; };
  const truce = w => !!w?.terms;

  // ---- what a side can pay, and paying ---------------------------------------------------------------------------
  // F6 rules 2026-11-10: the attacker from his Clan treasury; the defender from the town coffers plus his treasury
  const purse = (w, side) => Math.max(0, Math.floor(side === 'attacker' ? clanOf(w.attacker)?.ryo || 0 : (town(w.town)?.stock?.ryo || 0) + (clanOf(w.defender)?.ryo || 0)));
  function pay(w, from, n) {
    const s = town(w.town), att = clanOf(w.attacker), def = clanOf(w.defender);
    if (from === 'attacker') { if (att) debitRyo(state, att, n, 'war ransom', { war: w.id }); if (s) world.change(s.id, 'ryo', n, 'war ransom'); return; }
    const a = Math.min(n, Math.max(0, Math.floor(s?.stock?.ryo || 0)));
    if (a > 0) world.change(s.id, 'ryo', -a, 'war ransom');
    if (n - a > 0 && def) debitRyo(state, def, n - a, 'war ransom', { war: w.id });
    if (att) creditRyo(state, att, n, 'war ransom', { war: w.id });
  }

  // ---- the estimate ------------------------------------------------------------------------------------------------
  const inCircle = (w, e) => { const t = town(w.town); return !!t && e.place === 'world' && Math.hypot(e.x - t.x, e.z - t.z) <= (W().circleRadius ?? 900); };
  const fighter = e => !e.dead && !e.downed && !e.worker && !e.guide && !e.guard && e.type !== 'civilian' && e.type !== 'settler' && e.type !== 'horse';
  const valueOf = e => e.warTroop ? (war.ryoOf?.(e.owner, e.warUnit) || WORTH().crew) : e.type === 'hero' ? WORTH().hero : WORTH().crew;
  // a town sees what comes within war.scoutRange of its build ring, a camp what comes that near its banner
  function fromBase(w, clan, e) {
    const reach = W().scoutRange ?? 250;
    if (clan === w.attacker) return Math.hypot(e.x - (w.camp?.x ?? w.x), e.z - (w.camp?.z ?? w.z)) <= reach;
    const s = town(w.town); if (!s || clan !== w.defender) return false;
    const ring = tierOf(s, data)?.ring ?? 150;
    return Math.hypot(e.x - s.x, e.z - s.z) <= ring + reach;
  }
  // the fighting worth of a side's units in this war; seenBy = a clan: only the ones that clan sees now (or its town or camp does)
  function army(w, clan, seenBy = null) {
    let n = 0;
    for (const e of Object.values(state.entities || {})) {
      if (e.owner !== clan || !fighter(e) || e.rout) continue;
      if (e.warTroop ? e.warTroop !== w.id : !inCircle(w, e)) continue;
      if (seenBy != null && runtime?.sees && !runtime.sees(seenBy, e) && !fromBase(w, seenBy, e)) continue;
      n += valueOf(e);
    }
    return n;
  }
  // once a second: what each side has spotted of the other's army (it fades slowly once out of sight)
  function spot(w) {
    const sp = w.spotted ||= {};
    for (const [me, foe] of [[w.attacker, w.defender], [w.defender, w.attacker]]) sp[me] = Math.round(Math.max(army(w, foe, me), (sp[me] || 0) * 0.98));
  }
  const barOf = (w, side) => morale?.view(w.id)?.[side === 'attacker' ? 'camp' : 'town']?.standing || 0;
  const townsOf = clan => Object.values(f()?.settlements || {}).filter(s => s.owner === clan && !s.capital && Number.isFinite(s.x));
  // how strong `side` looks to `viewer` (its own side: what it has; the other side: what it has met)
  function strength(w, side, viewer) {
    const clan = clanAt(w, side), own = clan === viewer, K = WORTH();
    const troops = own ? army(w, clan) : Math.max(w.spotted?.[viewer] || 0, army(w, clan, viewer));
    const towns = townsOf(clan).filter(s => s.id !== w.town && (own || !runtime?.found || runtime.found(viewer, s.x, s.z))).length;
    const city = runtime?.cityHold?.(clan) || 0;
    return troops + barOf(w, side) * K.weight + towns * K.town + city * K.business;
  }
  // a clan's guess of its chance to win this war, 0.02 to 0.98
  function chance(w, clan) {
    const side = sideOf(w, clan); if (!side) return 0;
    const me = strength(w, side, clan), foe = strength(w, other(side), clan);
    const p = (me + foe > 0 ? me / (me + foe) : 0.5) + (roll('chance', w.id, clan) * 2 - 1) * (S().noise ?? 0);
    return Math.min(0.98, Math.max(0.02, p));
  }
  const ryoOfCost = cost => (cost?.ryo || 0) + ((cost?.timber || 0) + (cost?.stone || 0) + (cost?.goods || 0)) * WORTH().material;
  // what the town is worth to whoever takes it: its tier, its coffers and its standing buildings
  function townWorth(w) {
    const s = town(w.town); if (!s) return 0;
    const K = WORTH(), tier = Math.max(1, s.tier || 1);
    const built = (s.buildings || []).filter(b => b.stage === 'built').reduce((n, b) => n + ryoOfCost(data.buildings?.[b.type]?.cost), 0);
    return (K.tier[Math.min(tier, K.tier.length - 1)] || 0) + Math.max(0, s.stock?.ryo || 0) + built * K.building;
  }
  // a defender cannot see the attacker's chest: it guesses it from the camp's standing buildings and the army it has spotted
  function campWorth(w, viewer) {
    const built = (w.camp?.buildings || []).filter(b => b.stage === 'built').reduce((n, b) => n + ryoOfCost(W().buildings?.[b.type]?.cost), 0);
    const troops = viewer === w.attacker ? army(w, w.attacker) : Math.max(w.spotted?.[viewer] || 0, army(w, w.attacker, viewer));
    return built * WORTH().building + troops;
  }
  // the ransom the judging side would take, as `viewer` works it out (the judge itself, or the other side guessing)
  function price(w, viewer, by = w.terms?.by) {
    if (!by) return 0;
    const judge = clanAt(w, other(by));
    const base = by === 'defender' ? townWorth(w) : campWorth(w, viewer);
    const wins = viewer === judge ? chance(w, judge) : 1 - chance(w, viewer);
    return round10(base * wins);
  }
  // what the box of the surrendering side is filled with: a bot judge's own price, else the surrendering side's guess
  function suggestFor(w, by) {
    const judge = clanAt(w, other(by)), me = clanAt(w, by);
    return Math.min(round10(price(w, clanOf(judge)?.bot ? judge : me, by)), Math.max(0, purse(w, by)));
  }
  function fairFor(w, by) { const p = price(w, clanAt(w, other(by)), by), n = S().noise ?? 0.1; return [round10(p * (1 - n)), round10(p * (1 + n))]; }

  // ---- the steps ---------------------------------------------------------------------------------------------------
  const ATTACKS = new Set(['attack', 'attackMove', 'amove', 'torch']);
  function standDown(w) {
    for (const e of Object.values(state.entities || {})) {
      if (e.dead || !(e.warTroop === w.id || ((e.owner === w.attacker || e.owner === w.defender) && inCircle(w, e)))) continue;
      delete e.attackTarget; delete e.swing; delete e.torch;
      runtime?.forget?.(e.id);
      if (e.garrison || e.type === 'hero' && !ATTACKS.has(e.order?.kind)) continue;
      if (e.warTroop || ATTACKS.has(e.order?.kind)) e.order = { kind: 'stop' };
    }
  }
  function surrender(e, c) {
    const w = war.byId(c.war), side = sideOf(w, e?.owner);
    if (!w || w.state !== 'active' || !side) return { ok: false, reason: 'Not your war' };
    if (w.terms) return { ok: false, reason: w.terms.by === side ? 'You have already surrendered' : 'The other side has already surrendered' };
    warEnd.stopChannel?.(w, 'surrender');
    w.terms = { by: side, clan: e.owner, at: now(), offers: 0, offer: null, until: now() + secs(S().gapSeconds), last: null, low: 0 };
    w.terms.suggest = suggestFor(w, side); w.terms.fair = fairFor(w, side);
    standDown(w);
    const s = town(w.town);
    news({ kind: 'warSurrender', war: w.id, town: w.town, townName: s?.name || '', side, clan: e.owner, attacker: w.attacker, defender: w.defender, x: s?.x ?? w.x, z: s?.z ?? w.z });
    say(clanAt(w, other(side)), `${nameOf(e.owner)} surrender${s ? ` at ${s.name}` : ''}: wait for their terms`);
    return { ok: true, reason: '' };
  }
  function offer(e, c) {
    const w = war.byId(c.war), t = w?.terms, side = sideOf(w, e?.owner);
    if (!t || !side) return { ok: false, reason: 'No surrender in this war' };
    if (t.by !== side) return { ok: false, reason: 'Only the side that surrendered offers terms' };
    if (t.state === 'outcome') return { ok: false, reason: 'The terms were refused' };
    if (t.offer) return { ok: false, reason: 'Your offer is still being weighed' };
    const n = c.amount;
    if (!Number.isSafeInteger(n) || n < 1) return { ok: false, reason: 'amount must be a positive whole number' };
    const have = purse(w, side);
    if (n > have) return { ok: false, reason: `You have only ${have} ryo` };
    t.offer = { amount: n, at: now(), until: now() + secs(S().offerSeconds) }; t.offers++;
    t.fair = fairFor(w, side);
    news({ kind: 'warOffer', war: w.id, town: w.town, clan: e.owner, to: clanAt(w, other(side)), amount: n });
    say(clanAt(w, other(side)), `${nameOf(e.owner)} offer ${n} ryo to end the war`);
    return { ok: true, reason: '' };
  }
  // the terms are accepted: pay, then the war ends with the town kept
  function accept(w) {
    const t = w.terms, n = t.offer.amount, have = purse(w, t.by), paid = Math.min(n, have);
    pay(w, t.by, paid);
    w.ransom = { amount: paid, by: clanAt(w, t.by), to: clanAt(w, other(t.by)) };
    t.ended = 'accepted'; t.offer = null;
    news({ kind: 'warAnswer', war: w.id, town: w.town, clan: w.ransom.to, to: w.ransom.by, answer: 'accept', amount: paid });
    warEnd.finish(w, 'ransomed', w.ransom.to, { days: S().cooldownDays });
  }
  // no terms: the surrendering side loses (why: 'refused' | 'left' | 'timeout')
  function refuse(w, why) {
    const t = w.terms; t.ended = why; t.offer = null;
    if (t.by === 'attacker') { warEnd.finish(w, 'attackerSurrendered', w.defender); return; }
    warEnd.rout?.(w, w.defender);
    t.sentHome = runtime?.warSendHome?.(w, { side: 'defender', why: 'surrender' }) || null;
    t.state = 'outcome'; t.until = now() + secs(S().outcomeSeconds);
    const s = town(w.town);
    news({ kind: 'warNoTerms', war: w.id, town: w.town, townName: s?.name || '', clan: w.defender, to: w.attacker, why, x: s?.x ?? w.x, z: s?.z ?? w.z });
    say(w.attacker, `${s?.name || 'The town'} is yours to take: choose capture, sack or burn`);
  }
  function answer(e, c) {
    const w = war.byId(c.war), t = w?.terms, side = sideOf(w, e?.owner);
    if (!t || !side) return { ok: false, reason: 'No surrender in this war' };
    if (t.by === side) return { ok: false, reason: 'The other side answers your terms' };
    if (!t.offer) return { ok: false, reason: 'No offer to answer' };
    if (c.answer === 'accept') { accept(w); return { ok: true, reason: '' }; }
    if (c.answer === 'no') {
      const n = t.offer.amount; t.last = n; t.offer = null; t.until = now() + secs(S().gapSeconds);
      news({ kind: 'warAnswer', war: w.id, town: w.town, clan: e.owner, to: clanAt(w, t.by), answer: 'no', amount: n });
      say(clanAt(w, t.by), `${nameOf(e.owner)} say no to ${n} ryo: offer again or leave`);
      return { ok: true, reason: '' };
    }
    if (c.answer === 'never') {
      news({ kind: 'warAnswer', war: w.id, town: w.town, clan: e.owner, to: clanAt(w, t.by), answer: 'never', amount: t.offer.amount });
      refuse(w, 'refused'); return { ok: true, reason: '' };
    }
    return { ok: false, reason: 'Answer accept, no or never' };
  }
  function leave(e, c) {
    const w = war.byId(c.war), t = w?.terms, side = sideOf(w, e?.owner);
    if (!t || !side) return { ok: false, reason: 'No surrender in this war' };
    if (t.by !== side) return { ok: false, reason: 'Only the side that surrendered can leave' };
    if (t.state === 'outcome') return { ok: false, reason: 'You have already left' };
    refuse(w, 'left'); return { ok: true, reason: '' };
  }
  const RESULT = { capture: 'captured', sack: 'sacked', burn: 'burned' };
  function outcome(e, c) {
    const w = war.byId(c.war), t = w?.terms;
    if (!t || t.state !== 'outcome') return { ok: false, reason: 'Nothing to choose in this war' };
    if (e?.owner !== w.attacker) return { ok: false, reason: 'Only the attacker chooses' };
    const o = warEnd.outcomeList(w).find(x => x.id === c.outcome);
    if (!o) return { ok: false, reason: 'Pick capture, sack or burn' };
    if (!o.ok) return { ok: false, reason: o.why };
    warEnd.finish(w, RESULT[o.id], w.attacker);
    return { ok: true, reason: '' };
  }

  // ---- bots ---------------------------------------------------------------------------------------------------------
  const isBot = clan => !!clanOf(clan)?.bot;
  const unitOf = clan => Object.values(state.entities || {}).find(e => e.owner === clan && e.type === 'hero') || { owner: clan };
  function botAnswer(w) {
    const t = w.terms, judge = clanAt(w, other(t.by)), want = price(w, judge), u = unitOf(judge);
    if (t.offer.amount >= want) return answer(u, { war: w.id, answer: 'accept' });
    t.low = (t.low || 0) + 1;
    return answer(u, { war: w.id, answer: t.low >= BOT().maxLow ? 'never' : 'no' });
  }
  function botOffer(w) {
    const t = w.terms, me = clanAt(w, t.by), u = unitOf(me), have = purse(w, t.by);
    const want = Math.min(have, round10(price(w, me) * Math.pow(BOT().raise, t.offers)));
    if (t.offers >= BOT().maxOffers || want < 10 || have < 10 || (t.last != null && want <= t.last)) return leave(u, { war: w.id });
    return offer(u, { war: w.id, amount: want });
  }
  function botStart(w) {
    const B = BOT(), n = now();
    if (n - (w.started ?? 0) < secs(B.notBeforeSeconds) || n % secs(B.everySeconds) !== 3) return;
    for (const side of ['defender', 'attacker']) {
      const clan = clanAt(w, side);
      if (!isBot(clan) || w.terms) continue;
      if (w.channel && w.channel.side === (side === 'attacker' ? 'town' : 'camp')) continue;   // it is taking the other hall: it is winning
      if (1 - chance(w, clan) >= B.lossAt && roll('surrender', w.id, clan, n) < B.chance) surrender(unitOf(clan), { war: w.id });
    }
  }
  function botOutcome(w) {
    const list = warEnd.outcomeList(w), pick = list.find(o => o.id === 'capture' && o.ok) || list.find(o => o.id === 'sack');
    return outcome(unitOf(w.attacker), { war: w.id, outcome: pick.id });
  }

  function tick() {
    const n = now();
    for (const w of war.active()) {
      if (n % 20 === 3) spot(w);
      const t = w.terms;
      if (!t) { botStart(w); continue; }
      if (t.state === 'outcome') {
        if (isBot(w.attacker)) { if (n >= t.until - secs(S().outcomeSeconds) + secs(BOT().answerSeconds)) botOutcome(w); }
        else if (n >= t.until) warEnd.finish(w, 'sacked', w.attacker);
        continue;
      }
      if (t.offer) {
        if (isBot(clanAt(w, other(t.by)))) { if (n >= t.offer.at + secs(BOT().answerSeconds)) botAnswer(w); }
        else if (n >= t.offer.until) refuse(w, 'timeout');
      } else if (isBot(clanAt(w, t.by))) { if (n >= t.until - secs(S().gapSeconds) + secs(BOT().answerSeconds)) botOffer(w); }
      else if (n >= t.until) refuse(w, 'timeout');
    }
  }

  // for the screen and tests: the surrender of a war as `clan` may know it
  function view(warId, clan) {
    const w = war.byId(warId), t = w?.terms, side = sideOf(w, clan); if (!t || !side) return null;
    const mine = t.by === side, n = now(), left = u => Math.max(0, Math.ceil((u - n) / 20));
    return { by: t.by, clan: t.clan, mine, state: t.state || (t.offer ? 'offer' : 'wait'), offers: t.offers, last: t.last,
      offer: t.offer ? { amount: t.offer.amount, seconds: left(t.offer.until) } : null, seconds: t.offer ? left(t.offer.until) : left(t.until),
      ...(mine ? { suggest: t.suggest, purse: purse(w, side) } : { fair: t.fair }),
      ...(t.state === 'outcome' && side === 'attacker' ? { outcomes: warEnd.outcomeList(w) } : {}) };
  }

  function command(e, c) {
    const fn = { warSurrender: surrender, warOffer: offer, warAnswer: answer, warLeave: leave, warOutcome: outcome }[c.action];
    if (!fn) return false;
    const r = fn(e, c);
    if (!r.ok) say(e.owner, r.reason);
    const fr = f(); fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    (fr.receipts ||= []).push({ seq: fr.receiptSeq, tick: now(), clan: e.owner ?? null, action: c.action, ok: r.ok, reason: r.reason });
    return true;
  }
  return { command, tick, view, chance, price, purse, truce, townWorth, campWorth, rules: () => ({ ...S(), bot: BOT(), worth: WORTH() }), attach: s => { runtime = s; } };
}
