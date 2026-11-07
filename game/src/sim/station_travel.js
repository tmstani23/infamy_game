// Rickshaw travel between omnibus stations (Tim 2026-11-06 20:21, plan in project files omnibus_stable/plan.md).
// Space at your station on the island (or the island gate menu in the city, src/site_menu.js) lists where you can go: your
// other towns with a finished station, and the capital (you arrive just inside the island gate; the rickshaws
// park on the island side). The trip is instant: each empty rickshaw parked where you leave carries two
// (rules.rickshaw.seats), the hero first, then the crew and settlers following him; whoever does not fit stays.
// The rickshaws park at the destination. Not within station.fightSeconds of a hit or with enemies within
// station.enemyRange. Command: { id: <hero id>, type: 'rickshaw', to: <town id> | 'capital' }.
// createStationTravel({ state, data, rules, frontier, omnibus, gate, areas, navOf, followOffset, freeSlot, forget, danger, say })
//   -> { command, from, destinations }  (destinations: { here, capital, rickshaws, list })

export function createStationTravel({ state, data, rules, frontier, omnibus, gate, areas, navOf, followOffset, freeSlot, forget, danger, say }) {
  const C = () => data()?.buildings?.station?.station || {};
  const st = () => frontier()?.stable;
  const towns = owner => Object.values(state.frontier?.settlements || {}).filter(s => s.owner === owner && s.founded !== undefined && st()?.of(s, 'station'));
  const STAND = 4;
  const atCapital = () => gate ? Object.values(state.entities).filter(v => v.type === 'rickshaw' && !v.dead && v.place === 'world' && Math.hypot(v.x - gate.island[0], v.z - gate.island[1]) <= 18 && !omnibus.riders(v).length) : [];

  // where the hero stands: { town, station } at one of his stations, { capital: true } at the island gate, else null
  function from(e) {
    if (!e) return null;
    if (e.place === 'world') {
      for (const s of towns(e.owner)) { const b = st().of(s, 'station'), [x, z] = st().centre(s, b); if (Math.hypot(e.x - x, e.z - z) <= (C().reach ?? 8) + (data().townGrid?.cellSize || 10)) return { town: s, station: b }; }
      return null;
    }
    // the city side: at the island gate (the gate menu, src/site_menu.js, Tim 2026-11-06 20:42)
    return e.place === 'street' && gate && Math.hypot(e.x - gate.city[0], e.z - gate.city[1]) <= STAND ? { capital: true } : null;
  }
  const waiting = (e, f) => f.capital ? atCapital().filter(v => v.omnibusOwner === e.owner) : st().parkedAt(f.town, f.station, 'rickshaw');
  function destinations(e) {
    const f = from(e);
    if (!f) return null;
    const list = towns(e.owner).filter(s => s !== f.town).map(s => ({ id: s.id, name: s.name }));
    if (!f.capital) list.push({ id: 'capital', name: 'The capital' });
    return { here: f.capital ? 'The capital' : f.town.name, capital: !!f.capital, rickshaws: waiting(e, f).length, list };
  }

  function command(e, c) {
    if (e.type !== 'hero' || e.dead || e.downed || e.jailed) return;
    // Tim 2026-11-07 (train plan): no more instant rickshaw trips between stations; the railway is the fast way
    // between towns, rickshaws stay as vehicles you drive. Set rules.rickshaw.instantTravel to bring it back.
    if (!rules?.rickshaw?.instantTravel) return say(e.owner, 'Rickshaws no longer jump between stations: take the train');
    const f = from(e), R = C();
    if (!f) return say(e.owner, 'Stand at your railway station');
    if (e.aboard) return say(e.owner, 'Step out first (Q)');
    if (state.tick - (e.hitAt ?? -Infinity) < (R.fightSeconds ?? 10) * 20 || danger(e, R.enemyRange ?? 12)) return say(e.owner, 'Not with a fight on');
    const to = c.to === 'capital' ? (f.capital ? null : 'capital') : towns(e.owner).find(s => s.id === c.to && s !== f.town);
    if (!to) return say(e.owner, 'No station there');
    const cars = waiting(e, f);
    if (!cars.length) return say(e.owner, 'No rickshaw waiting here: build one at the station');
    if (e.mounted) { delete e.mounted; delete e.ride; }   // the horse stays here
    const seats = rules?.rickshaw?.seats ?? 2;
    const group = Object.values(state.entities).filter(u => u.owner === e.owner && u.type !== 'hero' && !u.dead && !u.downed && !u.jailed && !u.garrison && !u.aboard && u.place === e.place
      && u.order?.kind === 'follow' && u.order.target === e.id && Math.hypot(u.x - e.x, u.z - e.z) <= 15);
    const n = Math.min(cars.length, Math.ceil((group.length + 1) / seats)), party = group.slice(0, n * seats - 1);
    // where everyone lands
    let place = 'world', px, pz, carX, carZ;
    if (to === 'capital') { place = 'street'; [px, pz] = gate.inside; [carX, carZ] = gate.island; }
    else { const b = st().of(to, 'station'), [x, z] = st().centre(to, b), off = data().townGrid?.cellSize || 10; px = x; pz = z + off * 1.4; carX = x + off; carZ = z + off; }
    Object.assign(e, { x: px, z: pz, place, anim: 'idle' }); forget(e.id);
    areas?.update(Object.values(state.entities));
    if (place === 'world') { const p = areas?.nav.nearestFree(px, pz); if (p) [e.x, e.z] = p; }
    const grid = navOf(place);
    party.forEach((u, k) => {
      const [ox, oz] = followOffset(k % 36), [x, z] = grid?.nearestFree(e.x + ox * 0.8, e.z + oz * 0.8) || [e.x, e.z];
      Object.assign(u, { x, z, place, anim: 'idle' }); forget(u.id);
      u.order = { kind: 'follow', target: e.id }; u.order.slot = freeSlot(e.id, u.id);
    });
    const wgrid = navOf('world');
    cars.slice(0, n).forEach((v, k) => { const [x, z] = wgrid?.nearestFree(carX + k * 2.5, carZ) || [carX, carZ]; Object.assign(v, { x, z, place: 'world', anim: 'idle', trail: [] }); });
    areas?.update(Object.values(state.entities));
    say(e.owner, `By rickshaw to ${to === 'capital' ? 'the capital' : to.name}${party.length < group.length ? ` (${group.length - party.length} could not fit and stayed)` : ''}`);
  }
  return { command, from, destinations };
}
