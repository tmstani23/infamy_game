import { canInteract } from './interactions.js';
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
  // kind: 'yakuza' (businesses) or 'ninja' (the Shinobi clan: contracts and Renown, no businesses; Tim 2026-10-20)
  function addClan(id, { name = id, bot = false, ryo = rules.startRyo, aggression = rules.botAggression ?? 0.5, color = COLORS[Object.keys(state.clans).length % COLORS.length], kind = 'yakuza', faction = kind === 'ninja' ? 'shinobi' : 'yakuza' } = {}) {
    // queue: hires paid for and waiting, first one counting down; notice: last hire message;
    // aggression (bots): share of downed enemies they choose to finish off, 0 to 1
    // clinic: crew in hospital ({ unit, model, kind: 'recover' | 'heal', left, cost, hp })
    // heat: trouble caused in the street (sim/game.js addHeat), cools slowly
    state.clans[id] = { id, name, color, bot, ryo, heat: 0, queue: [], clinic: [], notice: null, kind, faction, ...(kind === 'ninja' ? { renown: 0 } : {}), ...(bot ? { aggression } : {}) };
    // the clan's home hideout (port_town.json "hideout": clan id) is its own from the start, for good.
    // The Shinobi clan lives in the forest village instead ("hideout": "ninja", the longhouse), so a
    // hideout kept for its id in town (the inn, when you play Shinobi) is just a building then.
    if (kind === 'ninja') {
      for (const b of Object.values(state.businesses)) if (b.hideout === id) delete state.businesses[b.id];
      const village = Object.values(state.businesses).find(b => b.hideout === 'ninja');
      if (village) village.hideout = id;
    }
    for (const b of Object.values(state.businesses)) if (b.hideout === id) b.owner = id;
    return state.clans[id];
  }

  // Crew a clan has now (everything it owns except its hero and its house guards)
  const crewOf = id => Object.values(state.entities).filter(e => e.owner === id && e.type !== 'hero' && !e.guard);
  // ...plus the ones in hospital or in jail (they still count for the cap and the hire price)
  const crewCount = id => crewOf(id).length + (state.clans[id]?.clinic.length || 0) + (state.clans[id]?.jail?.length || 0);

  // Hero + baseCap crew, plus slots for every business the clan holds
  function crewCap(id) {
    // the Shinobi clan holds no businesses: its crew grows with Renown (renownPerCrew a head)
    if (state.clans[id]?.kind === 'ninja') return rules.baseCap + Math.floor((state.clans[id].renown || 0) / (rules.renownPerCrew || 100));
    return rules.baseCap + Object.values(state.businesses)
      .filter(b => b.owner === id)
      .reduce((n, b) => n + (rules.capPerBusiness[b.kind] || 0), 0);
  }

  // One-off price; each crew member you have or are waiting on makes the next one dearer
  function hirePrice(id, type) {
    const t = types[type];
    if (!t || t.later || !t.price) return null;
    if ((t.clan || 'yakuza') !== (state.clans[id]?.kind || 'yakuza')) return null;   // ninja crew for the Shinobi clan only, and the other way round
    const faction = state.clans[id]?.faction;
    if ((t.faction && t.faction !== faction) || t.excludeFactions?.includes(faction)) return null;
    const have = crewCount(id) + (state.clans[id]?.queue.length || 0);
    return Math.round(t.price * (1 + rules.priceStepPerCrew * have));
  }

  function setOwner(businessId, clanId) {
    const b = state.businesses[businessId];
    if (b) b.owner = clanId;
  }

  const say = (clan, text) => { clan.notice = { tick: state.tick, text }; return text; };
  // where a clan hires (besides its own hideout): teahouses, or the dojo for the Shinobi clan
  const hallOf = id => state.clans[id]?.kind === 'ninja' ? 'dojo' : 'teahouse';

  // Hire command from a hero standing inside a teahouse. Pays now; the recruit
  // arrives at the teahouse door when the timer runs out. Returns the message shown.
  function hire(hero, businessId, type) {
    const clan = state.clans[hero.owner], b = state.businesses[businessId];
    if (!clan || hero.type !== 'hero') return null;
    // in a teahouse (the Shinobi clan: the village dojo), or (slower) in your own hideout
    const home = b?.kind === 'hideout' && b.owner === clan.id;
    if (!b || (b.kind !== hallOf(clan.id) && !home) || hero.place !== b.room) return say(clan, clan.kind === 'ninja' ? 'Hire ninja inside the village dojo or your longhouse' : 'Hire crew inside a teahouse or your hideout');
    const price = hirePrice(clan.id, type);
    if (price === null) return say(clan, 'Nobody here for that job yet');
    if (crewCount(clan.id) + clan.queue.length >= crewCap(clan.id)) return say(clan, 'Crew is full: hold more buildings for more crew');
    if (clan.queue.length >= rules.maxQueue) return say(clan, 'Too many hires waiting');
    if (clan.ryo < price) return say(clan, `Not enough ryo (${price} needed)`);
    clan.ryo -= price;
    clan.queue.push({ unit: type, business: b.id, left: types[type].hireSeconds * (home ? rules.hideout?.hireTimeFactor ?? 1 : 1) });
    return say(clan, `Hired a ${types[type].name || type} for ${price} ryo`);
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
    // every clan's downed crew go to the clinic, bots too, and wait there until their boss comes
    // and pays to revive them (Tim 2026-10-19)
    clan.clinic.push({ unit: e.type, model: e.model, kind: 'recover', left: t.recoverSeconds || 30,
      cost: Math.round((t.price || 0) * (rules.recoverCostShare ?? 0.25) * scale(clan.id)), hp: 0 });
    say(clan, `Your ${e.type} was carried to the clinic`);
    return true;
  }
  // a hurt crew member at the clinic door checks in; false when the clan cannot pay
  // seconds before a unit may use the clinic: none until it has gone clinicUnhitSeconds without a hit (Tim 2026-10-20)
  function hitWait(e) {
    return Math.max(0, (rules.clinicUnhitSeconds ?? 5) - (state.tick - (e?.hitAt ?? -Infinity)) / 20);
  }
  function checkIn(e) {
    const clan = state.clans[e.owner];
    if (hitWait(e) > 0) return false;
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
  // reviving costs reviveNowCostShare of the hire price while still recovering, recoverCostShare once recovered
  const reviveCost = (c, clanId) => c.left > 0 ? Math.round((types[c.unit]?.price || 0) * (rules.reviveNowCostShare ?? 0.5) * scale(clanId)) : c.cost;
  function healCost(hero) {
    const b = clinicOf(), r = rules.clinicHealRadius ?? 8, [dx, dz] = b?.door || [hero.x, hero.z];
    const who = Object.values(state.entities).filter(e => e.owner === hero.owner && !e.dead && !e.downed && e.place === 'street'
      && e.maxHp && e.hp < e.maxHp && (e === hero || Math.hypot(e.x - dx, e.z - dz) < r) && hitWait(e) <= 0);   // nobody still in a fight
    return { who, cost: Math.ceil(who.reduce((n, e) => n + (e.maxHp - e.hp), 0) * (rules.healCostPerHp ?? 0.2) * scale(hero.owner)) };
  }
  function clinicMenu(hero, c, door, spawn) {
    const clan = state.clans[hero.owner], b = clinicOf();
    if (!clan || !canInteract(hero) || door?.menu !== 'clinic' || !b) return null;
    if (hitWait(hero) > 0) return say(clan, `You were hit: wait ${Math.ceil(hitWait(hero))} s`);
    if (c.action === 'revive') {
      const p = clan.clinic[c.patient];
      if (!p || p.kind !== 'recover') return null;
      const cost = reviveCost(p, clan.id);
      if (clan.ryo < cost) return say(clan, `Not enough ryo (${cost} needed)`);
      clan.ryo -= cost;
      clan.clinic.splice(c.patient, 1);
      const leader = Object.values(state.entities).find(e => e.owner === clan.id && e.type === 'hero');
      spawn(p.unit, p.model || types[p.unit].sprite, b, { owner: clan.id, hp: types[p.unit].hp, ...(leader ? { order: { kind: 'follow', target: leader.id } } : {}) });
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
        // downed crew never walk out on their own: the boss revives them at the clinic menu (Tim 2026-10-19)
        if (c.kind === 'recover') { c.left = Math.max(0, c.left - dt); continue; }
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

  return { addClan, hallOf, crewOf, crewCount, crewCap, hirePrice, setOwner, hire, tick, carryOff, checkIn, clinicOf, clinicMenu, reviveCost, healCost, hitWait };
}
