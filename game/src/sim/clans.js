// Clans: money, the businesses they hold and their crew cap. Plain data inside the
// game state, so players and bot clans follow exactly the same rules.
// Numbers come from game/data/units.json (docs/crew_recruiting_plan.md).

export function createClans(state, units) {
  const rules = units.rules, types = units.types;
  state.clans = {};

  function addClan(id, { name = id, bot = false, ryo = rules.startRyo } = {}) {
    // queue: hires paid for and waiting, first one counting down; notice: last hire message
    state.clans[id] = { id, name, bot, ryo, queue: [], notice: null };
    return state.clans[id];
  }

  // Crew a clan has now (everything it owns except its hero)
  const crewOf = id => Object.values(state.entities).filter(e => e.owner === id && e.type !== 'hero');

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
    const have = crewOf(id).length + (state.clans[id]?.queue.length || 0);
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
    if (crewOf(clan.id).length + clan.queue.length >= crewCap(clan.id)) return say(clan, 'Crew is full: hold more buildings for more crew');
    if (clan.queue.length >= rules.maxQueue) return say(clan, 'Too many hires waiting');
    if (clan.ryo < price) return say(clan, `Not enough ryo (${price} needed)`);
    clan.ryo -= price;
    clan.queue.push({ unit: type, business: b.id, left: types[type].hireSeconds });
    return say(clan, `Hired a ${type} for ${price} ryo`);
  }

  // One tick: the first hire in each clan's queue counts down, then steps out the door.
  // spawnOutside(type, model, business, extra) is given by the game and finds a free spot.
  function tick(dt, spawn) {
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

  return { addClan, crewOf, crewCap, hirePrice, setOwner, hire, tick };
}
