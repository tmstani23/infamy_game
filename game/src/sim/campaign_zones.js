// Campaign zones (Z1, 2026-11-19): the island's six zones, who holds each, and the castle siege check.
// Pure module: no DOM, no randomness, reads state only. Data: game/data/campaign_zones.json (zones as groups of
// world.json regions). Not the town zoning (frontier.json 'zones', sim/frontier/placement.js).
// Rules (docs/frontier_campaign_plan.md): a clan holds a zone when it has a town there and no other clan has one;
// empty towns (no owner) count for nobody; the capital and castles are not towns. A castle may be attacked by a
// clan holding siege.zonesNeeded zones, one of them the castle's zone or a zone touching it.
//
// createCampaignZones({ rules, world, settlements, isClan }) -> see the return line
//   rules: campaign_zones.json   world: world.json   settlements: () => state.frontier.settlements
//   isClan: id => true for a living clan (default: any owner id)

export function createCampaignZones({ rules, world, settlements = () => ({}), isClan = () => true }) {
  const list = rules?.zones || [], byId = new Map(list.map(z => [z.id, z]));
  const regions = world?.regions || [], sites = new Map((world?.sites || []).map(s => [s.id, s]));
  // region id -> [{ zone, xMin, xMax }]
  const parts = new Map();
  for (const z of list) for (const r of z.regions || []) {
    const p = typeof r === 'string' ? { id: r } : r;
    if (!parts.has(p.id)) parts.set(p.id, []);
    parts.get(p.id).push({ zone: z.id, xMin: p.xMin ?? -Infinity, xMax: p.xMax ?? Infinity });
  }
  const pick = (regionId, x) => parts.get(regionId)?.find(p => x >= p.xMin && x < p.xMax)?.zone ?? null;

  const regionAt = (x, z) => regions.find(r => x >= r.box[0] && x < r.box[2] && z >= r.box[1] && z < r.box[3])?.id ?? null;
  // zone id at a world point; null off the map
  const zoneAt = (x, z) => (Number.isFinite(x) && Number.isFinite(z)) ? pick(regionAt(x, z), x) : null;
  // zone id of a world.json site (by its own region, so a site on a region edge stays with its region)
  function zoneOfSite(site) {
    const s = typeof site === 'string' ? sites.get(site) : site;
    return s ? (pick(s.region, s.x) ?? zoneAt(s.x, s.z)) : null;
  }
  const zoneOfTown = s => !s ? null : (s.site && sites.has(s.site) ? zoneOfSite(s.site) : zoneAt(s.x, s.z));

  // a town for the zone rules: founded on the island, not the capital, not a castle; owner may be null (empty)
  const isTown = s => !!s && !s.capital && !s.castle && s.founded !== undefined && Number.isFinite(s.x);
  const owned = s => s.owner != null && isClan(s.owner);
  function townsIn(zoneId) {
    return Object.values(settlements() || {}).filter(s => isTown(s) && zoneOfTown(s) === zoneId).sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  const count = (clan, zoneId) => townsIn(zoneId).filter(s => s.owner === clan).length;
  const full = (clan, zoneId) => count(clan, zoneId) >= (rules?.townCap ?? 2);
  // the clan that holds the zone, or null (no towns, only empty towns, or more than one clan)
  function holder(zoneId) {
    const owners = new Set(townsIn(zoneId).filter(owned).map(s => s.owner));
    return owners.size === 1 ? [...owners][0] : null;
  }
  const held = clan => list.filter(z => holder(z.id) === clan).map(z => z.id);
  const touches = (a, b) => a !== b && !!byId.get(a)?.touches?.includes(b);
  // castles: { zone, x, z, site, sea, blocksSites } for each zone with a castle site
  function castles() {
    return list.filter(z => z.castle).map(z => {
      const p = Number.isFinite(z.castle.x) ? z.castle : sites.get(z.castle.site);   // its own spot, else the site's point
      return { zone: z.id, site: z.castle.site || null, x: p?.x, z: p?.z, sea: z.castle.sea || null, blocksSites: z.castle.blocksSites || [] };
    });
  }
  // is a point within castleSpacing of a castle spot (taken or not)? Nobody founds a town there (Z5)
  const nearCastle = (x, z) => castles().some(c => Number.isFinite(c.x) && Math.hypot(x - c.x, z - c.z) < (rules?.castleSpacing ?? 0));
  const castleSites = () => list.map(z => z.castle?.site).filter(Boolean);
  // town spots no clan may found on: castle sites and the spots beside a castle
  const closedSites = () => new Set(list.flatMap(z => [z.castle?.site, ...(z.castle?.blocksSites || [])]).filter(Boolean));
  // may `clan` attack the castle standing in `castleZone`? -> { ok, held, need, near }
  function siege(clan, castleZone) {
    const mine = held(clan), need = rules?.siege?.zonesNeeded ?? 4;
    const near = mine.some(z => z === castleZone || touches(z, castleZone));
    return { ok: mine.length >= need && near, held: mine.length, need, near };
  }
  // one row per zone for goals and the map: { id, name, holder, towns: { clan: n }, empty }
  function summary() {
    return list.map(z => {
      const towns = {}; let empty = 0;
      for (const s of townsIn(z.id)) { if (owned(s)) towns[s.owner] = (towns[s.owner] || 0) + 1; else empty++; }
      return { id: z.id, name: z.name, holder: holder(z.id), towns, empty };
    });
  }

  return { zones: () => list, zone: id => byId.get(id) || null, zoneAt, zoneOfSite, zoneOfTown, townsIn, count, full, holder, held, touches,
    castles, castleSites, closedSites, nearCastle, siege, summary };
}
