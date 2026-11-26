// Knocked out on the island (2026-11-06): the hero and his crew come round at their clan's
// nearest founded town hall at low health, instead of back in the city. Without a town the hero
// wakes at the island side of the city gate and crew fall back to the city rules (sim/clans.js).
// Rules: units.json rules.islandRespawn { hpShare, crewSeconds }.
export function createIslandRespawn({ state, areas, gate, rules = {}, cellSize = 20, spawn, freeSlot, followOffset, say = () => {}, infirmary = null, warRadius = 900 }) {
  const R = { hpShare: 0.3, crewSeconds: 30, ...rules };
  const towns = owner => Object.values(state.frontier?.settlements || {}).filter(s => s.owner === owner && s.founded && Number.isFinite(s.x));
  function nearestHall(owner, x, z, skip = null) {
    let best = null, bd = Infinity;
    for (const s of towns(owner)) { if (s.id === skip) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  // a free spot on the hall's apron, a little in front of the hall
  function spotNear(x, z) {
    const tmp = '__respawn_probe';
    state.entities[tmp] = { id: tmp, x, z, place: 'world' };
    try { areas.update(Object.values(state.entities)); }   // load the chunks round the hall before asking for a spot
    finally { delete state.entities[tmp]; }
    return areas.nav.nearestFree(x, z) || [x, z];
  }
  const hallFront = s => [s.x, s.z + cellSize * 1.2];
  // F6 phase 4: knocked out inside the war circle of a war he attacks, while its camp hall stands, he comes round at the camp hall
  const campHall = w => (w?.camp?.buildings || []).find(b => b.type === 'camp_hall' && b.stage === 'built') || null;
  function campAt(owner, x, z) {
    for (const w of Object.values(state.frontier?.wars?.list || {})) {
      const t = state.frontier?.settlements?.[w.town];
      if (w.attacker === owner && t && campHall(w) && Math.hypot(x - t.x, z - t.z) <= warRadius) return w;
    }
    return null;
  }
  const campFront = w => { const h = campHall(w); return [h.x, h.z + cellSize * 1.2]; };
  // the town's finished infirmary (2026-11-06): come round there at full health; else the hall, at low health
  const infirmaryAt = s => { const I = typeof infirmary === 'function' ? infirmary() : infirmary, b = I?.of(s); return b ? I.centre(s, b) : null; };
  const wakeAt = s => { const inf = s && infirmaryAt(s); return inf ? { spot: [inf[0], inf[1] + cellSize * 0.9], share: 1, where: 'infirmary' } : { spot: s ? hallFront(s) : null, share: R.hpShare, where: 'hall' }; };

  // a knocked-out hero lying on the island: true when he was brought round out there
  function hero(e) {
    if (!areas || e.place !== 'world') return false;
    const camp = campAt(e.owner, e.x, e.z);
    if (camp) {
      const [x, z] = spotNear(...campFront(camp));
      Object.assign(e, { x, z, place: 'world', hp: Math.max(1, Math.round(e.maxHp * R.hpShare)), dead: false, anim: 'idle' });
      delete e.diedAt; delete e.downed; delete e.downedAt;
      areas.update(Object.values(state.entities));
      const clan = state.clans?.[e.owner];
      if (clan) say(clan, 'You came round at your war camp hall');
      return true;
    }
    const s = nearestHall(e.owner, e.x, e.z);
    const w = wakeAt(s), [tx, tz] = w.spot || (gate ? gate.island : [e.x, e.z]);
    const [x, z] = spotNear(tx, tz);
    Object.assign(e, { x, z, place: 'world', hp: Math.max(1, Math.round(e.maxHp * (s ? w.share : R.hpShare))), dead: false, anim: 'idle' });
    delete e.diedAt; delete e.downed; delete e.downedAt;
    areas.update(Object.values(state.entities));
    const clan = state.clans?.[e.owner];
    if (clan) say(clan, s ? `You came round at ${s.name || 'your town'} ${w.where}` : 'You came round by the city gate');
    return true;
  }

  // downed crew on the island with a town to go to: queued to come round at the nearest hall
  function carry(e, deployment) {
    if (!areas || e.place !== 'world' || e.worker) return false;
    const clan = state.clans?.[e.owner], camp = clan && campAt(e.owner, e.x, e.z);
    if (camp) {
      (clan.respawning ||= []).push({ island: true, camp: camp.id, unit: e.type, model: e.model, deployment, hero: e.deployment?.group === 'hero' || deployment?.savedGroup === 'hero', left: R.crewSeconds });
      say(clan, `Your ${e.type} will come round at your war camp hall in ${R.crewSeconds} s`);
      return true;
    }
    const s = clan && nearestHall(e.owner, e.x, e.z);
    if (!s) return false;
    (clan.respawning ||= []).push({ island: true, town: s.id, unit: e.type, model: e.model, deployment, hero: e.deployment?.group === 'hero' || deployment?.savedGroup === 'hero', left: R.crewSeconds });
    say(clan, `Your ${e.type} will come round at ${s.name || 'your town'} hall in ${R.crewSeconds} s`);
    return true;
  }

  function tick(dt, types = {}) {
    if (!areas) return;
    for (const clan of Object.values(state.clans || {})) {
      for (const r of [...(clan.respawning || [])]) {
        if (!r.island || (r.left = Math.max(0, r.left - dt)) > 0) continue;
        const cw = r.camp ? state.frontier?.wars?.list?.[r.camp] : null, atCamp = cw && cw.attacker === clan.id && campHall(cw);
        const s = atCamp ? null : state.frontier?.settlements?.[r.town]?.owner === clan.id ? state.frontier.settlements[r.town] : towns(clan.id)[0];
        if (!s && !atCamp) { delete r.island; r.left = 0; continue; }   // the town was lost: come round at the city HQ instead
        clan.respawning.splice(clan.respawning.indexOf(r), 1);
        const t = types[r.unit] || {}, maxHp = t.hp || 100;
        const boss = Object.values(state.entities).find(u => u.owner === clan.id && u.type === 'hero');
        const follow = r.hero && boss && boss.place === 'world' && !boss.dead && !boss.downed;
        const w = atCamp ? { spot: campFront(cw), share: R.hpShare, where: 'war camp hall' } : wakeAt(s), [hx, hz] = w.spot;
        const [ox, oz] = followOffset ? followOffset(clan.respawning.length % 36) : [0, 0];
        const [x, z] = spotNear(hx + ox * 0.8, hz + oz * 0.8);
        const dep = r.deployment ? { ...r.deployment, group: follow ? 'hero' : 'home', everAssigned: true } : undefined;
        if (dep && follow) delete dep.savedGroup;
        const id = spawn(r.unit, r.model || t.sprite, x, z, { owner: clan.id, place: 'world', hp: Math.max(1, Math.round(maxHp * w.share)), maxHp, noGearLoot: true, deployment: dep });
        const u = state.entities[id];
        if (u && follow) { u.order = { kind: 'follow', target: boss.id }; u.order.slot = freeSlot?.(boss.id, u.id); }
        say(clan, atCamp ? `Your ${r.unit} came round at your war camp hall` : `Your ${r.unit} came round at ${s.name || 'your town'} ${w.where}`);
      }
    }
  }
  // Unstuck on the island (2026-11-07): the nearest of your town halls, or null when the city gate is closer
  function unstuckSpot(e, probe = false) {   // probe: only whether there is one (cheap, for the button)
    if (!areas || e.place !== 'world') return null;
    const s = nearestHall(e.owner, e.x, e.z);
    if (!s) return null;
    const hall = hallFront(s), dHall = Math.hypot(hall[0] - e.x, hall[1] - e.z), dGate = gate ? Math.hypot(gate.island[0] - e.x, gate.island[1] - e.z) : Infinity;
    if (dGate < dHall) return null;
    const [x, z] = probe ? hall : spotNear(...hall);
    return { x, z, place: 'world', town: s.name || 'your town' };
  }
  // A war camp fell (sim/frontier/war_end.js, 2026-11-14): the clan's hero and crew standing within r of (x, z)
  // fall back to their nearest own town hall (the island side of the city gate without a town), health as it is.
  // prepare(e) gets each one off his mount or vehicle first. Returns { town, n } or null.
  // opts (8c): skip = a town id not to fall back to (a defender leaving the town he surrendered); why = 'surrender' |
  // 'ransomed' (the line the clan is told; default: its war camp fell)
  function fallBack(owner, x, z, r, prepare = () => {}, opts = {}) {
    if (!areas) return null;
    const list = Object.values(state.entities).filter(e => e.owner === owner && e.place === 'world' && !e.dead && !e.downed && !e.warTroop && !e.worker && !e.guard && !e.guide && !e.railGang && !e.railRide
      && Math.hypot(e.x - x, e.z - z) <= r).sort((a, b) => (b.type === 'hero') - (a.type === 'hero'));
    if (!list.length) return null;
    const s = nearestHall(owner, x, z, opts.skip ?? null), [hx, hz] = s ? hallFront(s) : gate ? gate.island : [x, z];
    list.forEach((e, i) => {
      prepare(e);
      const [ox, oz] = i && followOffset ? followOffset((i - 1) % 36) : [0, 0];
      const [nx, nz] = spotNear(hx + ox * 0.8, hz + oz * 0.8);
      Object.assign(e, { x: nx, z: nz, anim: 'idle' });
    });
    areas.update(Object.values(state.entities));
    const clan = state.clans?.[owner];
    const lead = opts.why === 'ransomed' ? 'The war is over' : opts.why === 'surrender' ? 'You surrendered' : 'Your war camp fell';
    if (clan) say(clan, s ? `${lead}: you fell back to ${s.name || 'your town'}` : `${lead}: you fell back to the city gate`);
    return { town: s?.id || null, n: list.length };
  }
  return { hero, carry, tick, nearestHall, unstuckSpot, fallBack, rules: R };
}
