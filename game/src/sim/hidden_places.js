// Hidden places and rumours (world variety P3, 2026-11-27; plan in project files war_build/world_variety/plan.md part D).
// Nobody should comb a huge map. Finding a place goes in three steps, per clan:
//   1. rumour  a wandering folk scene (sim/wandering_folk.js) or one of your own townsfolk tells you about a place as
//              your hero or crew pass; the words name a landmark on the World map, and a rough area (smudge) is marked
//              there with the place always inside it. Once per scene; townsfolk at most every townEverySeconds per town.
//   2. near    any of your people within flashRange: the place flashes on the minimap with a chime and keeps a soft
//              glint there until it is reached. Works with or without a rumour.
//   3. found   within findRange: a pin on both maps, named by kind ("Relic site", "Cache"); the smudge clears.
// Places and numbers: data/hidden_places.json. Plain data in state.world.hidden, so save/load and the worker carry it:
//   state.world.hidden = { clan: { placeId: { rumour?: { x, z, r, tick, by }, near?: tick, found?: tick } } }
// Rival bots never look for places (player clans only). Read-only views never show a place the clan has not reached
// or been told of. Casts: hiddenRumour, hiddenNear, hiddenFound (render: minimap flash and chime, notice line).
const HZ = 20;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// state; data (hidden_places.json); say(owner, text) puts a line in the clan's notice line;
// speak(entity, text) puts words over a person's head (the wandering folk speech bubble)
export function createHiddenPlaces({ state, data, say = () => {}, speak = () => {} }) {
  const places = (data?.places || []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.z));
  if (!places.length) return { tick() {}, viewFor: () => [], found: () => 0, nearestOpen: () => null, enabled: false };
  const R = { everyTicks: 10, flashRange: 700, findRange: 120, smudgeRadius: 420, smudgeShift: 0.45, folkTalkRange: 70,
    folkScenes: ['hermit', 'pilgrims', 'peddler', 'camp', 'duel'], townTalkRange: 45, townEverySeconds: 120, townReach: 4000, gapSeconds: 30, ...(data.rules || {}) };
  const byId = Object.fromEntries(places.map(p => [p.id, p]));
  const kindOf = p => data.kinds?.[p.kind] || { label: p.kind };
  const live = e => e && !e.dead && !e.downed && !e.jailed;
  const onIsland = e => e.place === 'world' || e.area === 'world';
  // a small seeded number per (text, n), so the same game draws the same smudge and picks the same line
  const hash = (str, n = 0) => { let h = 2166136261 ^ n; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return ((h >>> 0) % 100000) / 100000; };
  function book(clan) {
    state.world ||= {};
    const H = (state.world.hidden ||= {});
    return (H[clan] ||= {});
  }
  const rec = (clan, id) => (book(clan)[id] ||= {});
  const players = () => Object.entries(state.clans || {}).filter(([, c]) => c && !c.bot).map(([id]) => id);
  const open = (clan, p) => !state.world?.hidden?.[clan]?.[p.id]?.found;
  const untold = (clan, p) => open(clan, p) && !state.world?.hidden?.[clan]?.[p.id]?.rumour;

  // the rumour: an area round the place (never centred on it), the words over the teller's head and in the notice line
  function tell(clan, place, teller, from) {
    const a = hash(place.id + clan, 1) * Math.PI * 2, d = hash(place.id + clan, 2) * R.smudgeShift * R.smudgeRadius;
    const r = rec(clan, place.id);
    r.rumour = { x: Math.round(place.x + Math.cos(a) * d), z: Math.round(place.z + Math.sin(a) * d), r: R.smudgeRadius, tick: state.tick, by: from };
    const lines = place.lines?.length ? place.lines : [`They say there is something at ${place.where}.`];
    const text = lines[Math.floor(hash(place.id + clan + state.tick, 3) * lines.length)];
    if (teller) speak(teller, text);
    say(clan, `Rumour: ${text} Marked on your World map (M).`);
    state.casts?.push({ kind: 'hiddenRumour', clan, place: place.id, x: r.rumour.x, z: r.rumour.z, a: teller?.id ?? null });
    book(clan)._last = state.tick;
  }
  // the untold open place nearest to (x, z), within reach (or anywhere)
  function nearestUntold(clan, x, z, reach = Infinity) {
    let best = null, bd = reach;
    for (const p of places) { if (!untold(clan, p)) continue; const d = Math.hypot(p.x - x, p.z - z); if (d <= bd) { bd = d; best = p; } }
    return best;
  }
  const quiet = clan => state.tick - (state.world?.hidden?.[clan]?._last ?? -Infinity) < R.gapSeconds * HZ;

  // wandering folk: each scene tells one rumour to the first clan whose hero or crew pass close
  function folkTalk(clan, mine) {
    if (quiet(clan)) return;
    for (const sc of Object.values(state.world?.folk?.scenes || {})) {
      if (!R.folkScenes.includes(sc.kind) || sc.told?.[clan] || sc.phase === 'scatter' || sc.phase === 'gone') continue;
      if (sc.kind === 'duel' && ['face', 'circle', 'clash', 'part'].includes(sc.phase)) continue;   // not while the blades are out
      const people = (sc.members || []).map(id => state.entities[id]).filter(e => live(e) && e.folk && e.type === 'civilian');
      // the peddler talks only once he is saved (he is busy being robbed until then)
      const tellers = sc.kind === 'peddler' ? people.filter(e => e.peddlerShop || sc.phase === 'saved' || sc.phase === 'trade') : people;
      let teller = null, bd = R.folkTalkRange;
      for (const t of tellers) for (const u of mine) { const d = dist(t, u); if (d <= bd) { bd = d; teller = t; } }
      if (!teller) continue;
      const place = nearestUntold(clan, sc.x ?? teller.x, sc.z ?? teller.z);
      (sc.told ||= {})[clan] = true;
      if (place) { tell(clan, place, teller, 'folk'); return; }
    }
  }
  // your own townsfolk: about places near their town, now and then
  function townTalk(clan, mine) {
    if (quiet(clan)) return;
    const b = book(clan), towns = b._towns ||= {};
    for (const e of Object.values(state.entities)) {
      if (!e.townsfolk || !live(e)) continue;
      const town = state.frontier?.settlements?.[e.townsfolk];
      if (!town || town.owner !== clan || state.tick - (towns[town.id] ?? -Infinity) < R.townEverySeconds * HZ) continue;
      if (!mine.some(u => dist(u, e) <= R.townTalkRange)) continue;
      towns[town.id] = state.tick;
      const place = nearestUntold(clan, town.x, town.z, R.townReach);
      if (place) { tell(clan, place, e, 'town'); return; }
    }
  }

  function tick() {
    if (state.tick % R.everyTicks) return;
    for (const clan of players()) {
      const all = Object.values(state.entities).filter(e => e.owner === clan && live(e) && onIsland(e) && !e.worker && Number.isFinite(e.x));
      if (!all.length) continue;
      for (const p of places) {
        if (!open(clan, p)) continue;
        let d = Infinity; for (const e of all) d = Math.min(d, Math.hypot(e.x - p.x, e.z - p.z));
        if (d > R.flashRange) continue;
        const r = rec(clan, p.id);
        if (d <= R.findRange) {
          r.found = state.tick; r.near ??= state.tick; delete r.rumour;
          const k = kindOf(p);
          say(clan, `Found: ${p.name} (${k.label}). It is marked on your maps.`);
          state.casts?.push({ kind: 'hiddenFound', clan, place: p.id, x: p.x, z: p.z });
          const c = state.clans[clan]; (c.milestones ||= {}).hiddenFound = (c.milestones.hiddenFound || 0) + 1;
        } else if (r.near == null) {
          r.near = state.tick;
          state.casts?.push({ kind: 'hiddenNear', clan, place: p.id, x: p.x, z: p.z });
        }
      }
      // hero and crew (not war troops) hear the rumours
      const talkers = all.filter(e => !e.warTroop && !e.garrison && !e.cart);
      if (talkers.length) { folkTalk(clan, talkers); townTalk(clan, talkers); }
    }
  }

  // What one clan may know, for the maps, the place card and the goal card. Never a place it has not reached or been told of:
  // { id, kind, label, name, state: 'rumour' | 'near' | 'found', x, z (near or found only), smudge: { x, z, r } (rumour only), where (rumour only), foundTick }
  function viewFor(clan) {
    const b = state.world?.hidden?.[clan]; if (!b) return [];
    const out = [];
    for (const p of places) {
      const r = b[p.id]; if (!r) continue;
      const k = kindOf(p), base = { id: p.id, kind: p.kind, label: k.label, what: k.what || '' };
      if (r.found != null) out.push({ ...base, name: p.name, state: 'found', x: p.x, z: p.z, foundTick: r.found });
      else if (r.near != null) out.push({ ...base, name: p.name, state: 'near', x: p.x, z: p.z, ...(r.rumour ? { smudge: { x: r.rumour.x, z: r.rumour.z, r: r.rumour.r }, where: p.where } : {}) });
      else if (r.rumour) out.push({ ...base, name: p.name, state: 'rumour', smudge: { x: r.rumour.x, z: r.rumour.z, r: r.rumour.r }, where: p.where });
    }
    return out;
  }
  const found = clan => places.filter(p => state.world?.hidden?.[clan]?.[p.id]?.found != null).length;
  // for the goal card: the open place the clan knows best (rumoured or seen) nearest to (x, z), else null
  function nearestOpen(clan, x, z) {
    let best = null, bd = Infinity;
    for (const v of viewFor(clan)) {
      if (v.state === 'found') continue;
      const at = v.state === 'near' ? v : v.smudge, d = Math.hypot(at.x - x, at.z - z);
      if (d < bd) { bd = d; best = { ...v, at: { x: at.x, z: at.z } }; }
    }
    return best;
  }
  // every place, for Show everything (test) on the World map only: drawn unstamped where the clan has not been
  const all = () => places.map(p => { const k = kindOf(p); return { id: p.id, kind: p.kind, label: k.label, what: k.what || '', name: p.name, x: p.x, z: p.z }; });
  return { tick, viewFor, all, found, nearestOpen, total: places.length, rules: R, place: id => byId[id] || null, enabled: true };
}
