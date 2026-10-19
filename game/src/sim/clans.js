// Clans: money, the businesses they hold and their crew cap. Plain data inside the
// game state, so players and bot clans follow exactly the same rules.
// Numbers come from game/data/units.json (docs/crew_recruiting_plan.md).

// opts.clinicScale(clanId): price factor at the clinic (the police double it at Wanted and up)
export function createClans(state, units, opts = {}) {
  const rules = units.rules, types = units.types;
  const scale = id => opts.clinicScale?.(id) ?? 1;
  state.clans = {};

  // clan colours (banners, badge): the first clan teal, then red, purple, amber... (picked at the start later)
  const COLORS = ['#24978c', '#b02424', '#7a3fb0', '#c08a1e', '#2f5fb0'];
  function addClan(id, { name = id, bot = false, ryo = rules.startRyo, aggression = rules.botAggression ?? 0.5, color = COLORS[Object.keys(state.clans).length % COLORS.length] } = {}) {
    // queue: hires paid for and waiting, first one counting down; notice: last hire message;
    // aggression (bots): share of downed enemies they choose to finish off, 0 to 1
    // clinic: crew in hospital ({ unit, model, kind: 'recover' | 'heal', left, cost, hp })
    // heat: trouble caused in the street (sim/game.js addHeat), cools slowly
    state.clans[id] = { id, name, color, bot, ryo, heat: 0, queue: [], clinic: [], notice: null, ...(bot ? { aggression } : {}) };
    return state.clans[id];
  }

  // Crew a clan has now (everything it owns except its hero and its house guards)
  const crewOf = id => Object.values(state.entities).filter(e => e.owner === id && e.type !== 'hero' && !e.guard);
  // ...plus the ones in hospital or in jail (they still count for the cap and the hire price)
  const crewCount = id => crewOf(id).length + (state.clans[id]?.clinic.length || 0) + (state.clans[id]?.jail?.length || 0);

  // Hero + baseCap crew, plus slots for every business the clan holds
  function crewCap(id) {
    return rules.baseCap + Object.values(state.businesses)
      .filter(b => b.owner === id)
      .reduce((n, b) => n + (rules.capPerBusiness[b.kind] || 0), 0);
  }

  // One-off price; each crew member you have or are waiting on makes the next one dearer
  function hirePrice(id, type) {
    const t = types[type];
    if (!t || t.later || !t.price) return null;
    const have = crewCount(id) + (state.clans[id]?.queue.length || 0);
    return Math.round(t.price * (1 + rules.priceStepPerCrew * have));
  }

  function setOwner(businessId, clanId) {
    const b = state.businesses[businessId];
    if (b) b.owner = clanId;
  }

  const say = (clan, text) => { clan.notice = { tick: state.tick, text }; return text; };

  // Hire command from a hero standing inside a teahouse. Pays now; the recruit
  // arrives at the teahouse door when the timer runs out. Returns the message shown.
  function hire(hero, businessId, type) {
    const clan = state.clans[hero.owner], b = state.businesses[businessId];
    if (!clan || hero.type !== 'hero') return null;
    if (!b || b.kind !== 'teahouse' || hero.place !== b.room) return say(clan, 'Hire crew inside a teahouse');
    const price = hirePrice(clan.id, type);
    if (price === null) return say(clan, 'Nobody here for that job yet');
    if (crewCount(clan.id) + clan.queue.length >= crewCap(clan.id)) return say(clan, 'Crew is full: hold more buildings for more crew');
    if (clan.queue.length >= rules.maxQueue) return say(clan, 'Too many hires waiting');
    if (clan.ryo < price) return say(clan, `Not enough ryo (${price} needed)`);
    clan.ryo -= price;
    clan.queue.push({ unit: type, business: b.id, left: types[type].hireSeconds });
    return say(clan, `Hired a ${type} for ${price} ryo`);
  }

  // --- Hospital (bonesetter's clinic) ------------------------------------------------
  // Downed crew nobody finished are carried here: they recover over recoverSeconds and
  // walk out once the clan pays recoverCostShare of their hire price. Hurt crew sent with
  // a heal order pay healCostPerHp up front and heal healPerSecond.
  const clinicOf = () => Object.values(state.businesses).find(b => b.kind === 'clinic')
    || Object.values(state.businesses).find(b => b.kind === 'teahouse');
  function carryOff(e) {
    const clan = state.clans[e.owner], t = types[e.type];
    if (!clan || !t) return false;
    // bot clans' downed crew are taken home off the map, not to this clinic (they used to walk
    // out of it next to the player and attack; Tim 2026-10-17). Stand-in until rival bases exist.
    if (clan.bot) return true;
    clan.clinic.push({ unit: e.type, model: e.model, kind: 'recover', left: t.recoverSeconds || 30,
      cost: Math.round((t.price || 0) * (rules.recoverCostShare ?? 0.25) * scale(clan.id)), hp: 0 });
    say(clan, `Your ${e.type} was carried to the clinic`);
    return true;
  }
  // a hurt crew member at the clinic door checks in; false when the clan cannot pay
  function checkIn(e) {
    const clan = state.clans[e.owner];
    const missing = e.maxHp - e.hp, cost = Math.ceil(missing * (rules.healCostPerHp ?? 0.2) * scale(e.owner));
    if (!clan || missing <= 0) return false;
    if (clan.ryo < cost) { say(clan, `Not enough ryo to heal (${cost} needed)`); return false; }
    clan.ryo -= cost;
    clan.clinic.push({ unit: e.type, model: e.model, kind: 'heal', left: missing / (rules.healPerSecond || 8), cost: 0, hp: e.hp });
    say(clan, `Your ${e.type} is healing (${cost} ryo)`);
    return true;
  }
  // Clinic menu, from a hero standing at the clinic door (the 'clinic' command):
  // revive = a carried-off patient walks out now for reviveNowCostShare of its hire price
  // (instead of waiting out the timer and paying recoverCostShare);
  // heal = the hero and its crew within clinicHealRadius of the door back to full HP at
  // healCostPerHp, all or nothing. spawn(type, model, business, extra) as for hires.
  const reviveCost = (c, clanId) => Math.round((types[c.unit]?.price || 0) * (rules.reviveNowCostShare ?? 0.5) * scale(clanId));
  function healCost(hero) {
    const b = clinicOf(), r = rules.clinicHealRadius ?? 8, [dx, dz] = b?.door || [hero.x, hero.z];
    const who = Object.values(state.entities).filter(e => e.owner === hero.owner && !e.dead && !e.downed && e.place === 'street'
      && e.maxHp && e.hp < e.maxHp && (e === hero || Math.hypot(e.x - dx, e.z - dz) < r));
    return { who, cost: Math.ceil(who.reduce((n, e) => n + (e.maxHp - e.hp), 0) * (rules.healCostPerHp ?? 0.2) * scale(hero.owner)) };
  }
  function clinicMenu(hero, c, door, spawn) {
    const clan = state.clans[hero.owner], b = clinicOf();
    if (!clan || hero.type !== 'hero' || hero.dead || door?.menu !== 'clinic' || !b) return null;
    if (c.action === 'revive') {
      const p = clan.clinic[c.patient];
      if (!p || p.kind !== 'recover') return null;
      const cost = reviveCost(p, clan.id);
      if (clan.ryo < cost) return say(clan, `Not enough ryo (${cost} needed)`);
      clan.ryo -= cost;
      clan.clinic.splice(c.patient, 1);
      spawn(p.unit, p.model || types[p.unit].sprite, b, { owner: clan.id, hp: types[p.unit].hp, order: { kind: 'follow', target: hero.id } });
      return say(clan, `Your ${p.unit} is back on their feet (${cost} ryo)`);
    }
    if (c.action === 'heal') {
      const { who, cost } = healCost(hero);
      if (!who.length) return say(clan, 'Nobody nearby needs healing');
      if (clan.ryo < cost) return say(clan, `Not enough ryo to heal (${cost} needed)`);
      clan.ryo -= cost;
      for (const e of who) e.hp = e.maxHp;
      return say(clan, `Healed ${who.length} for ${cost} ryo`);
    }
    return null;
  }

  function clinicTick(dt, spawn) {
    const b = clinicOf();
    for (const clan of Object.values(state.clans)) {
      for (const c of [...clan.clinic]) {
        if ((c.left = Math.max(0, c.left - dt)) > 0) continue;
        if (clan.ryo < c.cost) { if (!c.broke) { c.broke = true; say(clan, `Your ${c.unit} is ready: ${c.cost} ryo to leave the clinic`); } continue; }
        if (!b) continue;
        clan.ryo -= c.cost;
        clan.clinic.splice(clan.clinic.indexOf(c), 1);
        const hero = Object.values(state.entities).find(e => e.owner === clan.id && e.type === 'hero');
        spawn(c.unit, c.model || types[c.unit].sprite, b,
          { owner: clan.id, hp: types[c.unit].hp, ...(hero ? { order: { kind: 'follow', target: hero.id } } : {}) });
        say(clan, `Your ${c.unit} is back from the clinic`);
      }
    }
  }

  // One tick: the first hire in each clan's queue counts down, then steps out the door.
  // spawnOutside(type, model, business, extra) is given by the game and finds a free spot.
  function tick(dt, spawn) {
    clinicTick(dt, spawn);
    for (const clan of Object.values(state.clans)) {
      const h = clan.queue[0];
      if (!h || (h.left -= dt) > 1e-9) continue;
      clan.queue.shift();
      // new crew follow the clan's hero by default
      const hero = Object.values(state.entities).find(e => e.owner === clan.id && e.type === 'hero');
      spawn(h.unit, types[h.unit].sprite, state.businesses[h.business],
        { owner: clan.id, hp: types[h.unit].hp, ...(hero ? { order: { kind: 'follow', target: hero.id } } : {}) });
      say(clan, `Your ${h.unit} is here`);
    }
  }

  return { addClan, crewOf, crewCount, crewCap, hirePrice, setOwner, hire, tick, carryOff, checkIn, clinicOf, clinicMenu, reviveCost, healCost };
}
