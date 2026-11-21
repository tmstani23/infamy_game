// Train robbery R2 + R3 (Tim 2026-11-20; plan in project files war_build/train_robbery/plan.md).
// Guards: a train stopped at a blown track (rail_blast.js) puts out its guard squad (robbery.guards[faction]: war
//  roster units of the owner's clan, Kuroda 2 spearmen + 2 Teppo + 2 Gatling, Yakuza 2 riflemen + 2 Irezumi + 2 dog
//  handlers, Shinobi 2 riflemen + 2 geisha + 2 kunoichi). They hold round the freight wagon (order station) and fight
//  anyone near. The owner's armory upgrades from any war it is in apply (war_armory.applyGuard). When the train
//  leaves the gap they get back aboard (removed); the fallen are missing until it next reaches a station.
// Robbery: { type: 'frontier', action: 'rail', mode: 'rob' } from a hero within robbery.wagonReach of the freight
//  wagon of someone else's stopped train starts a hold of robbery.holdSeconds. Knocked out, or more than wagonReach
//  away, and it breaks. Done: shipments.rob(train, robbery.share) takes half of everything aboard (ryo too); one
//  robbery per blast. The loot goes into the stolen chest the hero carries.
// Stolen chest (R3): e.chest = { loot: { resource: n }, from, at }, one at a time. Knocked out, the hero drops it: a
//  ground item state.frontier.rail.chests[id] = { id, x, z, loot, from, at, by }. Any hero walks over it with no
//  chest to pick it up ({ mode: 'chest' } near it also works). { mode: 'cashChest' } at any own town hall (within
//  robbery.cashReach) or own war camp banner cashes it: ryo to the treasury at a town, to the war chest at a camp;
//  materials into that town's or camp's stock. A dropped chest lies there robbery.chestDays, then is gone.
import { creditRyo } from '../treasury.js';
import { addCampStock } from './camp_stock.js';

export function createRailRobbery({ state, data, rec, pointAt, say, placeName, dayTicks = 12000, runtime = () => null, refs = {} }) {
  const B = () => data.railways?.robbery || {};
  const T = () => data.railways?.train || {};
  const UD = () => data.war?.units || {};
  const now = () => state.tick ?? 0;
  const factionOf = id => state.clans?.[id]?.faction || 'yakuza';
  const lineName = l => `${placeName(l.from)} to ${placeName(l.to)}`;
  const chests = () => rec().chests ||= {};
  const fmt = loot => Object.entries(loot).filter(([, n]) => n >= 1).map(([r, n]) => `${Math.round(n)} ${r}`).join(', ') || 'nothing';

  // the freight wagon: the last goods car (beside the guard van), placed where render/rail_track.js draws it: the
  // engine's middle stands NOSE ahead of t.d, each car its art length plus a coupling behind the one before
  // (Tim 2026-11-21: the old spot, gap x cars, landed behind the guard van)
  const CAR_LEN = { engine: 6.4, tender: 4.3, carriage: 6.3, goods: 4.2, wagon: 4.2, guard: 5.4 }, COUPLING = 0.35, NOSE = 6.5;
  function wagonAt(t, l) {
    const kinds = ['engine', 'tender', ...(t.consist?.length ? t.consist : T().consist || [])].filter(k => CAR_LEN[k]);
    const i = Math.max(kinds.lastIndexOf('goods'), kinds.lastIndexOf('wagon'), 0);
    let off = 0; for (let k = 1; k <= i; k++) off += CAR_LEN[kinds[k - 1]] / 2 + COUPLING + CAR_LEN[kinds[k]] / 2;
    const d = Math.max(0, Math.min(l.length, t.d + t.dir * (NOSE - off)));
    return pointAt(l, d);
  }

  // ---- guards ----------------------------------------------------------------------------------------
  function guardsOut(t, l) {
    const rt = runtime(); if (!rt?.spawn) return;
    const list = (B().guards?.[factionOf(t.owner)] || []).slice(t.guardsLost || 0);
    const w = wagonAt(t, l), nx = Math.cos(w.heading), nz = -Math.sin(w.heading), ax = Math.sin(w.heading), az = Math.cos(w.heading);
    t.guards = [];
    t.wagonSpot = { x: Math.round(w.x * 10) / 10, z: Math.round(w.z * 10) / 10 };   // the robbable wagon flashes until it is robbed (render/stolen_chest.js, Tim 2026-11-20)
    list.forEach((unit, k) => {
      const u = UD()[unit]; if (!u) return;
      const f = factionOf(t.owner), type = typeof u.type === 'string' ? u.type : u.type?.[f] || Object.values(u.type || {})[0];
      const side = k % 2 ? 1 : -1, along = (Math.floor(k / 2) - 1) * 3;
      const x = w.x + nx * side * 4 + ax * along, z = w.z + nz * side * 4 + az * along;
      const id = rt.spawn(type, u.model?.[f] || type, x, z, { owner: t.owner, place: 'world', area: 'world', trainGuard: t.id, warUnit: unit, home: [x, z], aggro: B().guardAggro ?? 14, leash: B().guardLeash ?? 24, order: { kind: 'station', x, z, arrived: true } });   // aggro/leash: they go for anyone they see near the train (sim/combat.js)
      const e = state.entities[id];
      if (!e) return;
      refs.war?.()?.armory?.applyGuard?.(e);
      t.guards.push(id);
    });
    state.news ||= []; state.news.push({ kind: 'railAlert', clan: t.owner, x: w.x, z: w.z, link: l.id, text: `Train stopped at blown track on ${lineName(l)}` });
  }
  function guardsIn(t) {
    const rt = runtime(), list = t.guards || [];
    let lost = 0;
    for (const id of list) { const e = state.entities[id]; if (!e || e.dead || e.downed) lost++; if (e) rt?.remove?.(id); }
    t.guardsLost = Math.min((B().guards?.[factionOf(t.owner)] || []).length, (t.guardsLost || 0) + lost);
    delete t.guards; delete t.wagonSpot;
  }
  const atStation = t => { delete t.guardsLost; };   // fresh guards from the station

  // ---- the hold on the freight wagon ------------------------------------------------------------------
  // the stopped train e could rob now: { t, l }, or why not (a string)
  function robCheck(e) {
    if (e.type !== 'hero' || e.place !== 'world' || e.dead || e.downed || e.aboard) return 'Only your hero can rob a train';
    if (e.chest) return 'You are already carrying a stolen chest';
    const reach = B().wagonReach ?? 5;
    let pick = null;
    for (const t of Object.values(rec().trains)) {
      const l = rec().links[t.link];
      if (!t.stopped || !l) continue;
      const w = wagonAt(t, l), d = Math.hypot(w.x - e.x, w.z - e.z);
      if (d <= reach && (!pick || d < pick.d)) pick = { t, l, d };
    }
    if (!pick) return 'Stand at the freight wagon of a stopped train';
    if (pick.t.owner === e.owner) return 'That is your own train';
    if (pick.l.blast?.robbed) return 'This train was already robbed';
    return pick;
  }
  function rob(e) {
    const p = robCheck(e);
    if (typeof p === 'string') return say(e.owner, p);
    const { t, l } = p;
    e.robbing = { train: t.id, start: now(), until: now() + Math.round((B().holdSeconds ?? 30) * 20) };
    const w = wagonAt(t, l); t.robbing = { by: e.id, x: w.x, z: w.z };   // the wagon flashes while the hold runs (Tim 2026-11-20)
    say(t.owner, `Your train on ${lineName(l)} is being robbed!`);
    return say(e.owner, 'Robbing the freight wagon. Hold on!');
  }
  function holdTick(e) {
    const t = rec().trains[e.robbing.train], l = t && rec().links[t.link];
    const w = t && l && wagonAt(t, l);
    const broken = !t?.stopped || e.dead || e.downed || e.place !== 'world' || !w || Math.hypot(w.x - e.x, w.z - e.z) > (B().wagonReach ?? 5);
    // Tim 2026-11-21: any damage breaks the hold, like a bandage (the guards are not a gate, they interrupt)
    const hurt = (e.hitAt ?? -1) >= (e.robbing.start ?? Infinity);
    if (broken || hurt) { delete e.robbing; if (t?.robbing?.by === e.id) delete t.robbing; return say(e.owner, hurt ? 'Hit! The robbery was broken off' : 'The robbery was broken off'); }
    if (now() < e.robbing.until) return;
    delete e.robbing; delete t.robbing;
    const loot = refs.shipments?.()?.rob?.(t, B().share ?? 0.5, e.owner, true) || {};
    if (l.blast) l.blast.robbed = true;
    e.chest = { loot, from: t.owner, at: now() };
    say(e.owner, `Train robbed: ${fmt(loot)}. Take the chest to one of your town halls or camps.`);
  }

  // ---- the chest --------------------------------------------------------------------------------------
  function dropChest(e) {
    const id = `c${++rec().seq}`;
    chests()[id] = { id, x: Math.round(e.x * 10) / 10, z: Math.round(e.z * 10) / 10, loot: e.chest.loot, from: e.chest.from, at: now(), by: e.owner };
    delete e.chest;
    say(e.owner, 'Your hero dropped the stolen chest');
  }
  function pickUp(e, c) {
    e.chest = { loot: c.loot, from: c.from, at: now() };
    delete chests()[c.id];
    return say(e.owner, c.from === e.owner ? 'You took your stolen cargo back. Take it to a town hall.' : 'You picked up a stolen chest');
  }
  const pickReach = () => B().pickReach ?? 2.5;
  function grab(e) {
    if (e.chest) return say(e.owner, 'You are already carrying a chest');
    const c = Object.values(chests()).find(c => Math.hypot(c.x - e.x, c.z - e.z) <= pickReach() * 2);
    return c ? pickUp(e, c) : say(e.owner, 'No chest here');
  }
  // where e can cash a chest: an own town hall, or an own war camp banner
  function cashPoint(e) {
    const r = B().cashReach ?? 20;
    for (const s of Object.values(state.frontier.settlements || {})) {
      if (s.owner !== e.owner || s.ruined || s.empty) continue;
      if (Math.hypot(s.x - e.x, s.z - e.z) <= r + (s.castle ? 30 : 0)) return { town: s };
    }
    for (const w of Object.values(state.frontier.wars?.list || {})) {
      if (w.state !== 'active' || !w.camp || w.attacker !== e.owner) continue;
      if (Number.isFinite(w.x) && Math.hypot(w.x - e.x, w.z - e.z) <= r) return { war: w };   // the banner
    }
    return null;
  }
  function cash(e) {
    if (!e.chest) return say(e.owner, 'You are not carrying a chest');
    const p = cashPoint(e);
    if (!p) return say(e.owner, 'Take the chest to one of your town halls or war camps');
    const loot = e.chest.loot, clan = state.clans?.[e.owner];
    const world = refs.world?.();
    for (const [r, n] of Object.entries(loot)) {
      if (!(n > 0)) continue;
      if (r === 'ryo' && p.war) p.war.camp.chest = Math.round(((p.war.camp.chest || 0) + n) * 100) / 100;
      else if (r === 'ryo') { if (clan) creditRyo(state, clan, n, 'stolen chest'); }
      else if (p.war) addCampStock(p.war.camp, r, n);
      else if (world?.change) world.change(p.town.id, r, n, 'stolen chest');
    }
    // Tim 2026-11-21: the loot flies from the hero into the town hall (or the camp banner) as little icons, ryo as coins
    const to = p.war ? { x: p.war.x, z: p.war.z } : { x: p.town.x, z: p.town.z };
    (state.casts ||= []).push({ kind: 'chestCashed', x: e.x, z: e.z, tx: to.x, tz: to.z, loot: { ...loot }, place: 'world', by: e.owner });
    delete e.chest;
    return say(e.owner, `Stolen chest cashed in at ${p.war ? 'the war camp' : p.town.name}: ${fmt(loot)}`);
  }

  // once a tick
  function tick() {
    for (const e of Object.values(state.entities || {})) {
      if (e.trainGuard && !rec().trains[e.trainGuard]?.stopped && (now() % 20 === 0)) runtime()?.remove?.(e.id);   // its train is gone
      if (e.robbing) holdTick(e);
      if (e.chest && (e.dead || e.downed)) dropChest(e);
      // the hero's last down spot on the island (maps and minimap show it to its clan until the next one)
      if (e.type === 'hero' && e.place === 'world' && (e.dead || e.downed)) { if (!e.downMarked) { e.downMarked = true; const c = state.clans?.[e.owner]; if (c) c.lastDown = { x: Math.round(e.x), z: Math.round(e.z), at: now() }; } }
      else if (e.downMarked) delete e.downMarked;
    }
    const life = Math.round((B().chestDays ?? 2) * dayTicks);
    for (const c of Object.values(chests())) {
      if (now() - c.at > life) { delete chests()[c.id]; continue; }
      for (const e of Object.values(state.entities || {})) {   // a hero with no chest walking over one picks it up
        if (e.type !== 'hero' || e.chest || e.dead || e.downed || e.place !== 'world' || e.aboard) continue;
        if (Math.hypot(c.x - e.x, c.z - e.z) <= pickReach()) { pickUp(e, c); break; }
      }
    }
  }

  return { guardsOut, guardsIn, atStation, robCheck, rob, grab, cash, cashPoint, tick, wagonAt, chests };
}
