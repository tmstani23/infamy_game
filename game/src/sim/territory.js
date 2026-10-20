// Territory and the season (docs/territory_plan.md, Tim 2026-10-20): every business a clan owns
// marks a circle of street around it as that clan's territory (where circles overlap, the
// nearest business wins). Inside your own territory you see every unit (except hidden ninja,
// e.hidden), get an alert when rival clan units walk in, heal faster, cool heat faster and your
// crew move faster. Holding every scoring business in a quarter (port_town.json "quarters")
// adds a payout bonus. The season: one score for every clan (owned businesses weighted by
// size, later ninja Renown), counted at dawn; after season.cycles dawns the season ends.
// Numbers: units.json rules.territory / rules.season (data/settings.json lays over them).
// The grid lives here, not in the state (it is worked out from b.owner), so the state stays plain JSON.

const DEFAULTS = {
  radius: { teahouse: 10, warehouse: 12, gambling_den: 16, hideout: 12 },
  healFactor: 2, heatCoolSeconds: 20, crewSpeed: 1.1, quarterBonus: 0.25, intruderAlertSeconds: 30,
};

export function createTerritory({ state, bounds, rules = {}, season = {}, scores = {}, quarters = [] }) {
  const T = { ...DEFAULTS, ...rules, radius: { ...DEFAULTS.radius, ...rules.radius } };
  const cycles = season.cycles ?? 10, renownPerPoint = season.renownPerPoint ?? 100;
  const minX = Math.floor(bounds.minX), minZ = Math.floor(bounds.minZ);
  const w = Math.ceil(bounds.maxX) - minX, h = Math.ceil(bounds.maxZ) - minZ;
  // cell -> index into areas + 1 (0 = nobody's)
  const cells = new Uint16Array(w * h);
  let areas = [], key = null;
  // b.area = [x, z, r]: port_town.json "territory", a circle of its own (the Shinobi village round the longhouse)
  const radiusOf = b => b.area?.[2] || T.radius[b.kind] || 0;

  // rebuilt only when owners change (checked once a tick, in tick())
  function refresh() {
    const owned = Object.values(state.businesses).filter(b => b.owner && radiusOf(b) > 0);
    const k = owned.map(b => `${b.id}:${b.owner}`).join(',');
    if (k === key) return;
    key = k;
    areas = owned.map(b => ({ business: b.id, clan: b.owner, x: b.area?.[0] ?? b.x, z: b.area?.[1] ?? b.z, r: radiusOf(b) }));
    cells.fill(0);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = i + minX + 0.5, z = j + minZ + 0.5;
      let best = 0, bd = Infinity;
      areas.forEach((a, n) => {
        const d = (x - a.x) ** 2 + (z - a.z) ** 2;
        if (d <= a.r * a.r && d < bd) { bd = d; best = n + 1; }
      });
      cells[j * w + i] = best;
    }
  }
  const cellOf = (x, z) => {
    const i = Math.floor(x) - minX, j = Math.floor(z) - minZ;
    return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i;
  };
  // the area (business circle) at a street point, or null
  function areaAt(x, z) {
    const c = cellOf(x, z);
    return c < 0 || !cells[c] ? null : areas[cells[c] - 1];
  }
  const ownerAt = (x, z) => areaAt(x, z)?.clan || null;
  // Is this unit in its own clan's territory? On the street by the map, indoors in a business its clan owns
  function inOwn(e) {
    if (!e?.owner || e.dead) return false;
    if (e.place === 'street') return ownerAt(e.x, e.z) === e.owner;
    return Object.values(state.businesses).some(b => b.room === e.place && b.owner === e.owner);
  }

  // quarters: { id, name, box: [minX, minZ, maxX, maxZ] } with the scoring businesses inside
  const scoring = b => (scores[b.kind] || 0) > 0;
  const quarterList = quarters.map(q => ({ ...q,
    businesses: Object.values(state.businesses).filter(b => scoring(b) && b.x >= q.box[0] && b.z >= q.box[1] && b.x <= q.box[2] && b.z <= q.box[3]).map(b => b.id) }))
    .filter(q => q.businesses.length);
  // the clan holding every scoring business in that quarter, or null
  const heldBy = q => {
    const owners = new Set(q.businesses.map(id => state.businesses[id].owner));
    const [o] = owners;
    return owners.size === 1 && o ? o : null;
  };
  const quarterOf = b => quarterList.find(q => q.businesses.includes(b.id)) || null;
  // payout multiplier for a business at dawn: the quarter bonus when its owner holds the whole quarter
  const payoutBonus = b => { const q = quarterOf(b); return q && heldBy(q) === b.owner ? 1 + T.quarterBonus : 1; };

  // season score of a clan: owned businesses by weight, plus Renown (ninja, later) per renownPerPoint
  function score(clan) {
    let s = 0;
    for (const b of Object.values(state.businesses)) if (b.owner === clan) s += scores[b.kind] || 0;
    return s + Math.floor((state.clans?.[clan]?.renown || 0) / renownPerPoint);
  }
  // where a clan's score comes from: [{ label, points }] (businesses by weight, Renown later)
  function breakdown(clan) {
    const out = [];
    for (const b of Object.values(state.businesses)) if (b.owner === clan && scores[b.kind]) out.push({ label: b.kind.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()), points: scores[b.kind] });
    const r = state.clans?.[clan]?.renown || 0;
    if (r) out.push({ label: `${r} Renown`, points: Math.floor(r / renownPerPoint) });
    return out;
  }
  const standings = () => Object.keys(state.clans || {}).map(id => ({ clan: id, score: score(id) })).sort((a, b) => b.score - a.score);

  refresh();
  // state.season = { day, cycles, over, winner, final }; day counts dawns from 1
  state.season ||= { day: 1, cycles, over: false, winner: null, final: null };
  const lastAlert = {};
  let held = {};
  function tick() {
    refresh();
    // a quarter changing hands: news for the screen
    for (const q of quarterList) {
      const o = heldBy(q);
      if (o !== (held[q.id] ?? null)) { if (o) state.news.push({ kind: 'quarter', quarter: q.id, name: q.name, clan: o }); if (held[q.id]) state.news.push({ kind: 'quarterLost', quarter: q.id, name: q.name, clan: held[q.id] }); }
      held[q.id] = o;
    }
    // rival clan units walking into your territory (not police, bandits or townsfolk; not hidden ninja)
    if (state.tick % 10 === 0) {
      const wait = Math.round(T.intruderAlertSeconds * 20);
      for (const e of Object.values(state.entities)) {
        if (!state.clans?.[e.owner] || e.dead || e.downed || e.hidden || e.place !== 'street') continue;
        const a = areaAt(e.x, e.z);
        if (!a || a.clan === e.owner) continue;
        const k = `${a.clan}:${a.business}`;
        if (state.tick - (lastAlert[k] ?? -Infinity) < wait) continue;
        lastAlert[k] = state.tick;
        state.news.push({ kind: 'intruder', clan: a.clan, intruder: e.owner, business: a.business, x: e.x, z: e.z });
      }
    }
    // the season: counted at dawn; after `cycles` dawns it is over
    const s = state.season;
    if (state.dawn && !s.over) {
      s.day++;
      if (s.day > s.cycles) {
        s.over = true;
        s.final = standings();
        s.winner = s.final.length && (s.final.length < 2 || s.final[0].score > s.final[1].score) ? s.final[0].clan : null;   // null = a draw
        state.news.push({ kind: 'seasonEnd', winner: s.winner });
      }
    }
  }

  return { tick, areaAt, ownerAt, inOwn, areas: () => areas, cellGrid: () => ({ minX, minZ, w, h, cells, areas }), refresh,
    quarters: quarterList, heldBy, payoutBonus, score, breakdown, standings, rules: T };
}
