// Knocked out on the island (Tim 2026-11-06): the hero and his crew come round at their clan's
// nearest founded town hall at low health, instead of back in the city. Without a town the hero
// wakes at the island side of the city gate and crew fall back to the city rules (sim/clans.js).
// Rules: units.json rules.islandRespawn { hpShare, crewSeconds }.
export function createIslandRespawn({ state, areas, gate, rules = {}, cellSize = 20, spawn, freeSlot, followOffset, say = () => {}, infirmary = null }) {
  const R = { hpShare: 0.3, crewSeconds: 30, ...rules };
  const towns = owner => Object.values(state.frontier?.settlements || {}).filter(s => s.owner === owner && s.founded && Number.isFinite(s.x));
  function nearestHall(owner, x, z) {
    let best = null, bd = Infinity;
    for (const s of towns(owner)) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
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
  // the town's finished infirmary (Tim 2026-11-06): come round there at full health; else the hall, at low health
  const infirmaryAt = s => { const I = typeof infirmary === 'function' ? infirmary() : infirmary, b = I?.of(s); return b ? I.centre(s, b) : null; };
  const wakeAt = s => { const inf = s && infirmaryAt(s); return inf ? { spot: [inf[0], inf[1] + cellSize * 0.9], share: 1, where: 'infirmary' } : { spot: s ? hallFront(s) : null, share: R.hpShare, where: 'hall' }; };

  // a knocked-out hero lying on the island: true when he was brought round out there
  function hero(e) {
    if (!areas || e.place !== 'world') return false;
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
    const clan = state.clans?.[e.owner], s = clan && nearestHall(e.owner, e.x, e.z);
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
        const s = state.frontier?.settlements?.[r.town]?.owner === clan.id ? state.frontier.settlements[r.town] : towns(clan.id)[0];
        if (!s) { delete r.island; r.left = 0; continue; }   // the town was lost: come round at the city HQ instead
        clan.respawning.splice(clan.respawning.indexOf(r), 1);
        const t = types[r.unit] || {}, maxHp = t.hp || 100;
        const boss = Object.values(state.entities).find(u => u.owner === clan.id && u.type === 'hero');
        const follow = r.hero && boss && boss.place === 'world' && !boss.dead && !boss.downed;
        const w = wakeAt(s), [hx, hz] = w.spot;
        const [ox, oz] = followOffset ? followOffset(clan.respawning.length % 36) : [0, 0];
        const [x, z] = spotNear(hx + ox * 0.8, hz + oz * 0.8);
        const dep = r.deployment ? { ...r.deployment, group: follow ? 'hero' : 'home', everAssigned: true } : undefined;
        if (dep && follow) delete dep.savedGroup;
        const id = spawn(r.unit, r.model || t.sprite, x, z, { owner: clan.id, place: 'world', hp: Math.max(1, Math.round(maxHp * w.share)), maxHp, noGearLoot: true, deployment: dep });
        const u = state.entities[id];
        if (u && follow) { u.order = { kind: 'follow', target: boss.id }; u.order.slot = freeSlot?.(boss.id, u.id); }
        say(clan, `Your ${r.unit} came round at ${s.name || 'your town'} ${w.where}`);
      }
    }
  }
  return { hero, carry, tick, nearestHall, rules: R };
}
