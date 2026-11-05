// Founding a frontier town (frontier plan E3). Pure rules: no randomness, no DOM. A town can be
// founded anywhere buildable at least founding.minSpacing from other towns (Tim, 2026-11-02); bot
// clans found only within founding.botSiteRadius of one of the W1 sites. Traits (soil, water,
// defense, 1 to 3) are computed from the terrain round the spot, so any spot has them.
// All numbers live in data/frontier.json "founding". Players, bots and governors use the same
// command: { id: <hero id>, type: 'frontier', action: 'found', name? } (hero's own spot).
import { terrainAt, buildable, passable } from '../world_data.js';
import { ensureGrid } from './town_grid.js';

const level = (v, [lo, hi]) => (v >= hi ? 3 : v >= lo ? 2 : 1);

// { soil, water, defense, nodes } for a world point. `cfg` is frontier.json founding.traits.
export function siteTraits(world, x, z, cfg) {
  const R = cfg.radius, step = cfg.step;
  let n = 0, soil = 0, hard = 0;
  for (let dx = -R; dx <= R; dx += step) for (let dz = -R; dz <= R; dz += step) {
    if (Math.hypot(dx, dz) > R) continue;
    const c = terrainAt(world, x + dx, z + dz);
    n++;
    soil += cfg.soilWeight[c] ?? 0;
    hard += cfg.defenseWeight[c] ?? 0;
  }
  // water: how close is the nearest river, lake or sea cell (search rings out to waterSearch)
  let near = Infinity;
  for (let r = cfg.waterStep; r <= cfg.waterSearch && near === Infinity; r += cfg.waterStep) {
    for (let a = 0; a < 16; a++) {
      const c = terrainAt(world, x + Math.cos(a * Math.PI / 8) * r, z + Math.sin(a * Math.PI / 8) * r);
      if (c === 'r' || c === 'w') { near = r; break; }
    }
  }
  const water = near <= cfg.waterNear[0] ? 3 : near <= cfg.waterNear[1] ? 2 : 1;
  const nodes = {};
  for (const nd of world.nodes || []) if (Math.hypot(nd.x - x, nd.z - z) <= cfg.nodeRadius) nodes[nd.kind] = (nodes[nd.kind] || 0) + 1;
  return { soil: level(soil / n, cfg.soilShare), water, defense: level(hard / n, cfg.defenseShare), nodes };
}

export function createFounding({ state, data, world, removeUnit }) {
  const D = data.founding, f = () => state.frontier;

  // Why a spot is not good, or null when it is. `clan` = the founding clan record, `hero` its hero.
  function whyNot(clan, hero, settlers, wd = world) {
    if (!wd) return 'no island';
    if (state.match?.mode !== 'campaign') return 'Towns are founded in a campaign';
    if (!hero || hero.dead || hero.downed || hero.place !== 'world') return 'Found a town out on the island';
    if (settlers.length < D.minSettlers) return `Bring at least ${D.minSettlers} settlers (${settlers.length} with you)`;
    if (clan.ryo < D.cost) return `Founding costs ${D.cost} ryo`;
    if (Math.hypot(hero.x - wd.capital.x, hero.z - wd.capital.z) < D.minSpacing) return `Too close to the capital (${D.minSpacing} units apart)`;
    for (const s of Object.values(f().settlements)) {
      if (s.x === undefined) continue;
      if (Math.hypot(hero.x - s.x, hero.z - s.z) < D.minSpacing) return `Too close to ${s.name} (${D.minSpacing} units apart)`;
    }
    if (!buildable(wd, hero.x, hero.z) || !passable(wd, hero.x, hero.z)) return 'This ground cannot be built on';
    if (clan.bot) {
      const site = (wd.sites || []).find(si => Math.hypot(hero.x - si.x, hero.z - si.z) <= D.botSiteRadius && !Object.values(f().settlements).some(s => s.site === si.id));
      if (!site) return 'Bots found only on a free site';
    }
    return null;
  }

  // Settlers of the hero's clan who stand with him
  function settlersWith(hero) {
    return Object.values(state.entities).filter(u => u.type === 'settler' && u.owner === hero.owner && !u.dead && !u.downed
      && u.place === hero.place && Math.hypot(u.x - hero.x, u.z - hero.z) <= D.gatherRadius);
  }

  // Read-only check for the UI and tests: { ok, reason, settlers, cost }
  function check(hero, wd = world) {
    const clan = state.clans?.[hero?.owner];
    if (!clan) return { ok: false, reason: 'no clan', settlers: 0, cost: D.cost };
    const settlers = settlersWith(hero), reason = whyNot(clan, hero, settlers, wd);
    return { ok: !reason, reason, settlers: settlers.length, cost: D.cost };
  }

  // Founds the town at the hero's spot. Returns { ok, reason, id }. Changes nothing when it fails.
  function found(hero, name, wd, w, construction) {
    const clan = state.clans?.[hero?.owner];
    if (!clan) return { ok: false, reason: 'no clan' };
    const settlers = settlersWith(hero), reason = whyNot(clan, hero, settlers, wd);
    if (reason) return { ok: false, reason };
    const nth = Object.values(f().settlements).filter(s => s.founded).length + 1;
    const region = (wd.regions || []).find(r => r.box && hero.x >= r.box[0] && hero.z >= r.box[1] && hero.x <= r.box[2] && hero.z <= r.box[3]);
    const id = w.newId('t');
    const town = w.addTown({
      id, name: (typeof name === 'string' && name.trim().slice(0, 24)) || `${region?.name || 'Frontier'} ${nth > 1 ? `Settlement ${nth}` : 'Settlement'}`,
      region: region?.id ?? null, owner: clan.id, x: Math.round(hero.x), z: Math.round(hero.z),
      site: (wd.sites || []).find(si => Math.hypot(hero.x - si.x, hero.z - si.z) <= D.botSiteRadius)?.id ?? null,
      traits: siteTraits(wd, hero.x, hero.z, D.traits), pop: settlers.length, stock: D.startStock,
      roadReserve: data.townGrid?.hallRoadReserve || 0,
      buildings: (D.startBuildings || [D.townHall]).map((type, i) => ({ type, stage: 'built', cell: i })),
    });
    ensureGrid(town, wd, data);   // L3.1: the town grid, water and mountain cells marked x; the hall takes the centre
    w.payFounding(clan, D.cost, town.id);
    for (const u of settlers) removeUnit(u.id);
    if (D.firstProject) construction.queue(id, D.firstProject);
    return { ok: true, id };
  }

  return { check, found, settlersWith, whyNot };
}
