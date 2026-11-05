// Bot expeditions (frontier plan E6, Tim 2026-11-05). A rival bot founds its town with exactly the
// player's commands: buy a permit and hire settlers at the Land Office, walk to the island gate,
// choose a site ('expedition'), then 'found' there. It leaves once the player has founded a first town
// (or by founding.bots.fallbackDay), staggered staggerDays apart per bot, and only when it can pay for
// the whole trip. Bots need no Renown, crew or businesses for the permit. Site choice: land_office.botSite
// (traits + clan taste + travel + a seeded per-game roll, among the top few free sites).
// The boss stays at the new town afterwards (C2: rival bosses leave for the frontier; the lieutenant runs the city).
// step(out) -> true when it drove the boss this tick (the city brain then does nothing).
export function createBotExpedition(game, { clan, hero, ai }) {
  const state = game.state, L = game.landOffice, F = game.frontier;
  if (!L || !F?.founding || !game.gate) return null;
  const D = F.data.founding;
  const order = () => Object.values(state.clans).filter(c => c.bot).findIndex(c => c.id === clan);
  const me = () => state.entities[hero];
  const myClan = () => state.clans[clan];
  const settlers = () => Object.values(state.entities).filter(u => u.owner === clan && u.type === 'settler' && !u.dead && !u.downed);
  const queued = () => myClan().queue.filter(q => q.unit === 'settler').length;
  const office = () => L.office();
  const raided = () => Object.values(state.attacks || {}).some(a => a.mode === 'raid' && a.defender === clan);
  let tries = 0;

  // what the rest of the trip still costs
  const need = () => {
    const c = myClan(), missing = Math.max(0, D.minSettlers - settlers().length - queued());
    return (c.permit ? 0 : (D.permit?.ryo || 0)) + missing * L.settlerPrice() + D.cost + (D.bots?.reserve ?? 0);
  };
  const due = () => L.botDue(clan, Math.max(0, order()));
  // due but still saving up: the city brain skips buying and hiring
  const saving = () => me()?.place !== 'world' && due() && myClan().ryo < need();

  // a hall spot near the claimed site that founding accepts
  function hallSpot(h, site) {
    const cell = F.data.townGrid.cellSize;
    for (const r of [2, 2.5, 3, 1.6]) for (let a = 0; a < 8; a++) {
      const x = Math.round(h.x + Math.cos(a * Math.PI / 4) * r * cell), z = Math.round(h.z + Math.sin(a * Math.PI / 4) * r * cell);
      if (Math.hypot(x - site.x, z - site.z) > D.botSiteRadius - 1) continue;
      if (F.founding.check(h, undefined, { x, z }).ok) return { x, z };
    }
    return null;
  }

  function step(out) {
    const h = me(), c = myClan();
    if (!h || !c) return false;
    if (h.place === 'world') {
      if (L.townsOf(clan) >= (D.permit?.maxTowns ?? 1)) { out.push({ id: hero, type: 'move', right: 0, down: 0 }); return true; }
      const siteId = Object.entries(state.frontier.siteClaims || {}).find(([, v]) => v === clan)?.[0];
      const site = (game.frontier.founding && siteId) ? (L.sites(clan).find(s => s.id === siteId)) : null;
      out.push({ id: hero, type: 'move', right: 0, down: 0 });
      if (!site || tries > 40) return true;   // walked out without a site, or no spot fits: it waits (the lieutenant phase brings it home)
      if (state.tick % 10) return true;
      const spot = hallSpot(h, site);
      tries++;
      if (spot) out.push({ id: hero, type: 'frontier', action: 'found', x: spot.x, z: spot.z });
      return true;
    }
    if (!due() || raided() || c.ryo < need() || h.hp < h.maxHp * 0.5) return false;
    if (!ai.toStreet(out)) return true;
    const b = office();
    if (!b?.ring) return false;
    if (!c.permit || settlers().length + queued() < D.minSettlers) {
      if (!ai.walk(out, b.ring[0], b.ring[1], 0.8)) return true;
      if (!c.permit) out.push({ id: hero, type: 'landOffice', action: 'permit' });
      else out.push({ id: hero, type: 'hire', business: b.id, unit: 'settler', count: D.minSettlers - settlers().length - queued() });
      return true;
    }
    if (queued()) { out.push({ id: hero, type: 'move', right: 0, down: 0 }); return true; }
    for (const u of settlers()) if (u.place === 'street' && (u.order?.kind !== 'follow' || u.order.target !== hero)) {
      out.push({ id: hero, type: 'order', units: settlers().map(s => s.id), kind: 'follow' });
      break;
    }
    const g = game.gate.city;
    if (!ai.walk(out, g[0], g[1], 0.8)) return true;
    const party = settlers().filter(u => u.place === 'street' && Math.hypot(u.x - h.x, u.z - h.z) < 12);
    if (party.length < D.minSettlers) { out.push({ id: hero, type: 'move', right: 0, down: 0 }); return true; }
    const site = L.botSite(clan);
    if (site) out.push({ id: hero, type: 'expedition', action: 'site', site, units: party.map(u => u.id) });
    return true;
  }

  return { step, saving, due };
}
