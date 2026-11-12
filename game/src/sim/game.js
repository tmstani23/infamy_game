import { modeRules } from './modes/index.js';
import {slideWorld} from './world_slide.js';
import {separateUnits} from './separation.js';
// The game rules. Holds the state and advances it one fixed tick at a time from
// commands. No three.js and no DOM: in multiplayer a Colyseus server runs this
// same code, and browsers only send commands and draw the state they get back.
import { placeScenery, placePiece, dirIndex, SCREEN_RIGHT, SCREEN_DOWN, shapeBlockers, groundZone, shapeDistance } from './geometry.js';
import { buildRoom3d, INTERIOR_ORIGIN } from './interiors.js';
import { generateRoom } from './generate.js';
import { createClans } from './clans.js';
import { createNav, ROOM_NAV } from './nav.js';
import { createCivilians } from './civilians.js';
import { createBandits, WILD } from './bandits.js';
import { createWorldCamps } from './camps.js';
import { createRewards } from './rewards.js';
import { gearFlat, createInventory } from './inventory.js';
import { largeFightsMemory, restoreLargeFights } from './large_fights.js';
import { createItemServices } from './item_services.js';
import { createVision } from './vision.js';
import { createAreas } from './areas.js';
import { townBlockersIn, townBlockersVersion } from './frontier/town_grid.js';
import { registerTownArt } from './frontier/art_blocks.js';
import { cityOnIsland } from './chunk_gen.js';
import { createTerritory } from './territory.js';
import { createStealth } from './stealth.js';
import { createUnstuck } from './unstuck.js';
import { createLeader } from './leader.js';
import { createPolice, POLICE } from './police.js';
import { applySettings } from './settings.js';
import { createBusinesses } from './businesses.js';
import { createContracts } from './contracts.js';
import { interactionActor } from './interactions.js';
import { createHQCamping } from './hq_camping.js';
import { createKuroda, stunned } from './kuroda.js';
import { createHQRaidEffects } from './hq_raids.js';
import { createDeployment } from './deployment.js';
import { createAssignments } from './assignments.js';
import { createDeploymentRally } from './deployment_rally.js';
import { createShinobiAssignments } from './shinobi_assignments.js';
import { createShakedown } from './shakedown.js';
import { createSweep } from './sweep.js';
import { createDiversion } from './diversion.js';
import { charmProtected,allowCharmAttack } from './charm_rules.js';
import { createRifleman } from './rifleman.js';
import { createTaunt } from './taunt.js';
import { createSectorRecovery } from './sector_recovery.js';
import { createShinobiIntelligence } from './shinobi_intelligence.js';
import { clearSight } from './perception.js';
import { createStats } from './stats.js';
import { reachableEntry } from './rear_entry.js';
import { createSectorCleanup } from './sector_cleanup.js';
import { createCrewJobs } from './crew_jobs.js';
import { createHeroAbilities } from './hero_abilities.js';
import { createLootExecute } from './loot_execute.js';
import { createCrewOrders } from './crew_orders.js';
import { createCrewStep } from './crew_step.js';
import { createCombat } from './combat.js';
import { createDiscovery } from './discovery.js';
import { createFrontier } from './frontier/frontier.js';
import { createLandOffice } from './frontier/land_office.js';
import { createCannonSalute } from './cannon_salute.js';
import { createCampaignGoals } from './campaign_goals.js';
import { createInfluence } from './influence/influence.js';
import { createLieutenantRules } from './lieutenant.js';
import { createIslandRespawn } from './island_respawn.js';
import { createOmnibus } from './omnibus.js';
import { steer } from './vehicle_steer.js';
import { createMounts } from './mounts.js';
import { createGarage } from './vehicle_garage.js';
import { createStationTravel } from './station_travel.js';
import { rosterChanged, bossAway } from './util.js';
export { DEFAULT_MOVEMENT as UNITS } from './stats.js';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

// Unit types: size and speeds in world units per second (the ronin is 2 tall)

export const DOOR_RADIUS = 1.5;
const title = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function createGame(options) {
  const { district, catalog, cutouts, interiors = {}, parts = null, recipes = {} } = options;
  // options.settings (data/settings.json) is laid over the detail files; without it they are used as they are
  const S = options.settings ? applySettings(options, options.settings) : { ...options, dayNight: null };
  const { units = null, civilians: civData = null, bandits: banditData = null, police: policeData = null, dayNight } = S;
  const scenery = placeScenery(district, catalog, cutouts);
  registerTownArt(options.frontier, catalog, cutouts);   // town, zone and war camp buildings block the ground their art stands on

  // Rooms for buildings that have an interior, and the doors between them
  const rooms = [], doors = [], roomBlockers = [], roomOf = {};
  // A street door's ring sits RING_OUT out from the wall (away from the building's middle),
  // so it reads as a spot in the street rather than sinking into the building
  const RING_OUT = 1;
  const ringAt = b => {
    const [dx, dz] = b.door, ox = dx - b.x, oz = dz - b.z, len = Math.hypot(ox, oz) || 1;
    return [dx + ox / len * RING_OUT, dz + oz / len * RING_OUT];
  };
  district.buildings.filter(b => b.interior && b.door).forEach((b, i) => {
    // "interior": "teahouse" names a hand-made room in interiors.json;
    // "interior": { "type": "gambling_den", "seed": 4 } is made by the room generator
    const type = b.interior.type || b.interior, name = b.interior.name || type;   // name: two rooms of one type (hideouts) need their own
    const t = b.interior.type ? generateRoom(type, b.interior.seed, recipes, parts).template : interiors[type];
    if (!t) { console.warn(`No interior template "${type}"`); return; }
    const ox = INTERIOR_ORIGIN.x + i * INTERIOR_ORIGIN.spacing, oz = INTERIOR_ORIGIN.z;
    const room = buildRoom3d(name, t, parts, ox, oz);
    rooms.push(room);
    roomOf[district.buildings.indexOf(b)] = room.name;
    if (room.blockers) roomBlockers.push(...room.blockers);
    scenery.push(...room.pieces.map(p => placePiece(p, catalog, cutouts)).filter(Boolean));
    const [dx, dz] = ringAt(b);
    doors.push({ x: dx, z: dz, to: room.spawn, place: room.name, label: `Enter the ${title(name)}` });
    doors.push({ x: room.exit.x, z: room.exit.z, to: { x: dx, z: dz }, place: 'street', label: 'Leave' });
  });
  const interiorDoors = rooms.flatMap(r => (r.interiorDoors || []).map(d => ({
    id: d.id, place: r.name, x: d.x, z: d.z,
    blocker: { minX: r.origin.x + d.rect.x0, maxX: r.origin.x + d.rect.x1,
      minZ: r.origin.z + d.rect.z0, maxZ: r.origin.z + d.rect.z1 },
  })));

  // Buildings with a menu instead of a room (the clinic): a door ring that opens it.
  // Nothing happens in the rules at that door; the screen opens the menu, which sends commands.
  district.buildings.forEach((b, i) => {
    if (b.business === 'clinic' && b.door) doors.push({ x: ringAt(b)[0], z: ringAt(b)[1], menu: 'clinic', business: `b${i}`, place: 'street', label: 'Open the clinic' });
    // the police box (bribes) and the police HQ (bail), sim/police.js
    if (b.business === 'police_box' && b.door) doors.push({ x: ringAt(b)[0], z: ringAt(b)[1], menu: 'police_box', business: `b${i}`, place: 'street', label: 'Talk to the police box' });
    // the Shinobi village shrine: the contract board (sim/contracts.js)
    if (b.business === 'contract_board' && b.door) doors.push({ x: ringAt(b)[0], z: ringAt(b)[1], menu: 'contracts', business: `b${i}`, place: 'street', label: 'Read the contract board' });
    // the Land Office (telegraph office, E1 2026-11-05): founding permits and settlers (sim/frontier/land_office.js)
    if (b.business === 'land_office' && b.door && options.frontier && options.world) {
      const [rx, rz] = ringAt(b), ox = b.door[0] - b.x, oz = b.door[1] - b.z, l = Math.hypot(ox, oz) || 1;
      doors.push({ x: rx, z: rz, menu: 'land_office', business: `b${i}`, place: 'street', label: 'Open the Land Office' });
      // the old surveyor beside the Land Office door (Tim 2026-11-06 20:45): talk after a permit, he shows you sites
      doors.push({ x: rx - oz / l * 4.5, z: rz + ox / l * 4.5, menu: 'surveyor', business: `b${i}`, place: 'street', label: 'Talk to the old surveyor' });
    }
    if (b.business === 'police_hq' && b.door) doors.push({ x: ringAt(b)[0], z: ringAt(b)[1], menu: 'police_hq', business: `b${i}`, place: 'street', label: 'Open the police HQ' });
  });

  const B = district.bounds, far = 1000;
  const blockers = [
    ...district.blockers.map(([x0, z0, x1, z1]) => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 })),
    ...shapeBlockers(district),       // water and the canal drawn as shapes
    ...scenery.filter(s => s.solid).map(s => s.solid),
    ...roomBlockers,
    // the edge of the street map (rooms lie beyond it, closed in by their own walls)
    { minX: -far, maxX: B.minX, minZ: -far, maxZ: far }, { minX: B.maxX, maxX: INTERIOR_ORIGIN.x - 20, minZ: -far, maxZ: far },
    { minX: -far, maxX: B.maxX, minZ: -far, maxZ: B.minZ }, { minX: -far, maxX: B.maxX, minZ: B.maxZ, maxZ: far },
  ];

  // Everything here is plain data, so it can be synced to other players as is
  // businesses: { b0: { kind: 'warehouse', x, z, door, ring, owner: null } }, keyed by building index (ring = door ring spot)
  // night: the sim clock (townsfolk follow it; the 'time' command flips it)
  // clock: the day/night cycle when settings turn it on (auto); left = ticks to the next flip, day = count of days so far;
  // dawn / dusk = true on the tick night turns to day / day to night, from the clock or the 'time' command alike (payouts at dawn)
  const state = { tick: 0, night: !!dayNight?.startAtNight, dawn: false, dusk: false, clock: null, entities: {}, businesses: {},
    interiorDoors: Object.fromEntries(interiorDoors.map(d => [d.id, true])),
    hits: [], dodges: [], casts: [], heatGains: [], ryoGains: [], ryoLosses: [], itemGains: [], policeNews: [], news: [] };
  const halfTicks = night => Math.round((night ? dayNight.nightSeconds : dayNight.daySeconds) * TICK_RATE);
  if (dayNight?.auto) state.clock = { day: 1, left: halfTicks(state.night) };
  const setNight = night => {
    if (state.night && !night) { state.dawn = true; rewards.tick(); if (state.clock) state.clock.day++; }
    if (!state.night && night) state.dusk = true;
    state.night = night;
    if (state.clock) state.clock.left = halfTicks(night);
  };
  district.buildings.forEach((b, i) => {
    if (b.business) state.businesses[`b${i}`] = { id: `b${i}`, kind: b.business, x: b.x, z: b.z, door: b.door || null, ring: b.door ? ringAt(b) : null, room: roomOf[i] || null, owner: null, ...(b.hideout ? { hideout: b.hideout } : {}), ...(b.territory ? { area: b.territory } : {}) };
  });
  // at Wanted and up the clinic charges more (police.clinicScale); police is made further down
  const clans = units ? createClans(state, units, { clinicScale: id => police?.clinicScale(id) ?? 1,
    onAddClan: clan => deployment.addClan(clan), priceFactor: id => leader.hireFactor(id), respawnFactor: id => leader.respawnFactor(id), islandCarry: (e, saved) => islandRespawn?.carry(e, saved) }) : null;
  const rewards = createRewards(state, units?.rules);
  const inventory = createInventory({state,baseHp:e=>stats.base(e).hp||0});
  const itemServices = createItemServices({state,inventory,raidRules:units?.rules?.raid,spawn,nav:{nearestFree:(...p)=>nav.nearestFree(...p)}});
  // territory: the street around each owned business, quarters and the season score (sim/territory.js)
  const scoreOf = Object.fromEntries(Object.entries(units?.rules?.businesses || {}).map(([k, v]) => [k, v.score || 0]));
  const leader = createLeader({ state, standings: () => territory?.standings() || [], rules: units?.rules?.leader });   // ganging up on the leader (sim/leader.js)
  const territory = createTerritory({ state, bounds: district.bounds, rules: units?.rules?.territory, season: units?.rules?.season, scores: scoreOf, quarters: district.quarters || [] });
  // the island as a walkable place, e.place === 'world' (sim/areas.js, frontier W3.2); the city sits on it
  // at world.capital + cityOffset, as a blocker whose way in is the gate (W3.5)
  const areas = options.world && options.worldChunks ? createAreas({ world: options.world, cfg: options.worldChunks, seed: options.world.seed ?? 1, city: cityOnIsland(options.world, district.bounds), dynamicBlockers: (...box) => townBlockersIn(state.frontier,...box,options.frontier), dynamicVersion: () => townBlockersVersion(state.frontier, options.frontier) }) : null;
  // the city gate out to the island (frontier W3.5, district.islandGate): a pair of doors, open in a
  // campaign match only. The island side stands just outside the city's west wall on the island.
  // The island side is the gate's spot on the island, pushed out past the nearest edge of the city.
  const gate = areas && district.islandGate ? (() => {
    const gd = district.islandGate, c = areas.city, b = district.bounds, out = gd.out ?? 5;
    let [x, z] = [c.minX - b.minX + gd.x, c.minZ - b.minZ + gd.z];
    const side = [[x - c.minX, 'W'], [c.maxX - x, 'E'], [z - c.minZ, 'N'], [c.maxZ - z, 'S']].sort((p, q) => p[0] - q[0])[0][1];
    if (side === 'W') x = c.minX - out; else if (side === 'E') x = c.maxX + out; else if (side === 'N') z = c.minZ - out; else z = c.maxZ + out;
    // coming back in, the hero steps a little way in from the gate, toward the middle of the city
    const mx = (b.minX + b.maxX) / 2 - gd.x, mz = (b.minZ + b.maxZ) / 2 - gd.z, ml = Math.hypot(mx, mz) || 1;
    return { city: [gd.x, gd.z], inside: [gd.x + mx / ml * 3, gd.z + mz / ml * 3], island: [x, z], side };
  })() : null;
  // knocked out on the island: up again at the nearest own town hall (sim/island_respawn.js, Tim 2026-11-06)
  const islandRespawn = areas ? createIslandRespawn({ state, areas, gate, rules: units?.rules?.islandRespawn, cellSize: options.frontier?.townGrid?.cellSize,
    spawn: (...a) => spawn(...a), freeSlot: (...a) => freeSlot(...a), followOffset: (...a) => followOffset(...a), say: (clan, text) => { clan.notice = { tick: state.tick, text }; }, infirmary: () => frontier?.infirmary }) : null;
  // the omnibus out on the island (sim/omnibus.js, Tim 2026-11-06): settlers and the Hero group ride in with the hero
  const omnibus = areas ? createOmnibus({ state, rules: units?.rules, spawn: (...a) => spawn(...a), remove: id => removeUnit(id), nav: () => navOf('world'),
    freeSlot: (...a) => freeSlot(...a), followOffset: (...a) => followOffset(...a), forget: id => { delete paths[id]; delete intents[id]; if (fight[id]) delete fight[id].target; },
    say: (owner, text) => { const clan = state.clans?.[owner]; if (clan) clan.notice = { tick: state.tick, text }; },
    homeAt: () => gate?.island, danger: e => state.tick - (e.hitAt ?? -Infinity) < 200 || Object.values(state.entities).some(u => u.place === e.place && Math.hypot(u.x - e.x, u.z - e.z) <= 12 && baseHostile(u, e)) }) : null;
  // horses from the stable and the hero's mount (sim/mounts.js, Tim 2026-11-06): H to ride, island only
  const mounts = areas ? createMounts({ state, rules: units?.rules, spawn: (...a) => spawn(...a), nav: () => navOf('world'), born: () => frontier?.stable?.born() || [],
    say: (owner, text) => { const clan = state.clans?.[owner]; if (clan) clan.notice = { tick: state.tick, text }; } }) : null;
  // recall and store horses and vehicles at your stables (Tim 2026-11-07, sim/vehicle_garage.js)
  const garage = areas ? createGarage({ state, rules: units?.rules, nav: () => navOf('world'), stable: () => frontier?.stable, omnibus, mounts,
    say: (owner, text) => { const clan = state.clans?.[owner]; if (clan) clan.notice = { tick: state.tick, text }; } }) : null;
  // rickshaw travel between omnibus stations and the capital (sim/station_travel.js, Tim 2026-11-06)
  const stationTravel = areas ? createStationTravel({ state, data: () => frontier?.data, rules: units?.rules, frontier: () => frontier, omnibus, gate, areas, navOf: p => navOf(p),
    followOffset: (...a) => followOffset(...a), freeSlot: (...a) => freeSlot(...a), forget: id => { delete paths[id]; delete intents[id]; if (fight[id]) delete fight[id].target; },
    danger: (e, r) => Object.values(state.entities).some(u => u.place === e.place && Math.hypot(u.x - e.x, u.z - e.z) <= r && baseHostile(u, e)),
    say: (owner, text) => { const clan = state.clans?.[owner]; if (clan) clan.notice = { tick: state.tick, text }; } }) : null;
  // the lieutenant's spot by the gate (goal steps, Tim 2026-11-06): Space here talks to him (sim/lieutenant.js guide)
  if (gate) { const [gx, gz] = gate.city, [ix, iz] = gate.inside, dx = ix - gx, dz = iz - gz, l = Math.hypot(dx, dz) || 1;
    doors.push({ x: gx + dx / l * 3 - dz / l * 4, z: gz + dz / l * 3 + dx / l * 4, place: 'street', menu: 'lieutenant', label: 'Talk to your lieutenant' }); }
  // the city's railway station by the gate (Tim 2026-11-07): Space at its door ring opens the station menu;
  // trains from your towns let you off here (sim/frontier/rail.js uses gate.station)
  const railStation = gate && district.buildings.find(b => b.railStation && b.door);
  // the ticket hall beside it (Tim 2026-11-07, railway_station art): its window ring opens the menu and trains let you off there
  const ticketHall = railStation && district.buildings.find(b => b.ticketHall && b.door);
  // the capital end of the lines on the island (Tim 2026-11-10): level with the station's open east front. The track comes
  // straight in from railApproach, through its own opening in the city wall, and ends railRun inside (gate.rail), so a
  // train rolls into the city and stands at the station; nobody boards out there (sim/frontier/rail.js endpoint, preview)
  if (railStation && gate.side === 'E') { const rz = areas.city.minZ - district.bounds.minZ + railStation.z;
    gate.rail = [areas.city.maxX - 70, rz]; gate.railApproach = [areas.city.maxX + 30, rz]; }
  if (railStation) { gate.station = ringAt(ticketHall || railStation); doors.push({ x: gate.station[0], z: gate.station[1], place: 'street', menu: 'rail_station', label: 'Railway station: trains to your towns' }); }
  // the capital stable (Tim 2026-11-07, the old rickshaw station): Space at its ring opens the stable menu (src/stable_menu.js)
  const capitalStable = gate && district.buildings.find(b => b.capitalStable && b.door);
  if (capitalStable) { const [x, z] = ringAt(capitalStable); doors.push({ x, z, place: 'street', menu: 'capital_stable', label: 'Capital stable: horses, rickshaws and omnibuses' }); }
  if (gate) doors.push({ x: gate.city[0], z: gate.city[1], to: { x: gate.island[0], z: gate.island[1] }, place: 'world', label: 'Out to the island', gate: true },
    { x: gate.island[0], z: gate.island[1], to: { x: gate.inside[0], z: gate.inside[1] }, place: 'street', label: 'Into the city', gate: true });
  const vision = createVision(state, district.bounds, units?.rules?.vision, territory, areas && { ...options.worldChunks.sight, lightsNear: areas.lightsNear });
  const discovery = createDiscovery({ state, world: options.world });   // island fog and scouting (frontier W2.3)
  const frontier = options.frontier ? createFrontier({ state, data: options.frontier, world: options.world, spotData:options.resourceSpots, spotRules:options.resourceSpotRules, removeUnit, capitalYard: gate?.island || null, civilians: civData, dayTicks: dayNight ? Math.round((dayNight.daySeconds + dayNight.nightSeconds) * TICK_RATE) : 12000 }) : null;   // settlement economy (sim/frontier/, F2.3)
  const stats = createStats({ state, units, roamers: banditData?.types, territory, atHome: e => atHome(e),
    formationMultiplier: e => kuroda.damageTaken(e), stealthRules: () => stealth.rules });
  // Shinobi stealth: hidden ninja, lantern light, snuffing lanterns (sim/stealth.js)
  const opaqueStreet = scenery.filter(s => s.solid && !s.indoor && s.item?.kind === 'buildings').map(s => s.solid);
  const stealth = createStealth({ state, scenery, rooms, rules: units?.rules?.stealth,
    observerKnown: (e, u) => vision.canSee(e.owner, u),
    lineOfSight: (a, b) => clearSight(a, b, a.place === 'street' ? opaqueStreet : [...roomBlockers, ...interiorDoors.filter(d => d.place === a.place && !state.interiorDoors[d.id]).map(d => d.blocker)]),
    say: (clan, text) => { clan.notice = { tick: state.tick, text }; } });
  const intents = {};     // latest move command per entity (server-side only)
  let crewJobs=null;
  const nav = createNav(blockers, district.bounds);
  // a walk grid per room too, so units path round the furniture indoors instead of snagging on it
  const roomBodyScales = Object.fromEntries(rooms.map(r => [r.name, r.template.characterScale || 1]));
  const navSettings = r => ({ ...ROOM_NAV, pad: ROOM_NAV.pad * roomBodyScales[r.name] });
  const roomNavs = Object.fromEntries(rooms.map(r => [r.name, createNav(r.blockers, { minX: r.origin.x, minZ: r.origin.z, maxX: r.origin.x + r.size[0], maxZ: r.origin.z + r.size[1] }, navSettings(r))]));
  const navOf = place => place === 'street' ? nav : place === 'world' ? areas?.nav : roomNavs[place];
  function interiorDoorNear(id) {
    const e = state.entities[id];
    if (!e || e.place === 'street') return null;
    return interiorDoors.filter(d => d.place === e.place && Math.hypot(d.x - e.x, d.z - e.z) <= 1.55)
      .sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0] || null;
  }
  function toggleInteriorDoor(e) {
    if (e.type !== 'hero' || e.dead || e.downed || e.jailed) return;
    const door = interiorDoorNear(e.id);
    if (!door) return;
    const closing = state.interiorDoors[door.id];
    if (closing && Object.values(state.entities).some(u => u.place === door.place && !u.dead
      && u.x + 0.45 > door.blocker.minX && u.x - 0.45 < door.blocker.maxX
      && u.z + 0.45 > door.blocker.minZ && u.z - 0.45 < door.blocker.maxZ)) return;
    state.interiorDoors[door.id] = !closing;
    rebuildRoomNav(door.place);
    for (const u of Object.values(state.entities)) if (u.place === door.place) delete paths[u.id];
  }
  // a room's walk grid with its closed interior doors as walls (also after a load)
  function rebuildRoomNav(place) {
    const r = rooms.find(r => r.name === place);
    const closed = interiorDoors.filter(d => d.place === place && !state.interiorDoors[d.id]).map(d => d.blocker);
    roomNavs[place] = createNav([...r.blockers, ...closed],
      { minX: r.origin.x, minZ: r.origin.z, maxX: r.origin.x + r.size[0], maxZ: r.origin.z + r.size[1] }, navSettings(r));
  }

  // Back windows (ninja build phase 3, Tim 2026-10-20): every business with a room gets a second way
  // in on the far side from its door, for the Shinobi clan only; it lands near the back of the room
  district.buildings.forEach((b, i) => {
    const room = rooms.find(r => r.name === roomOf[i]), foot = scenery.find(s => s.building === i)?.foot;
    if (!b.business || !b.door || !room || !foot) return;
    const ux0 = b.door[0] - b.x, uz0 = b.door[1] - b.z, len = Math.hypot(ux0, uz0) || 1, ux = ux0 / len, uz = uz0 / len;
    const half = Math.abs(ux) * (foot.maxX - foot.minX) / 2 + Math.abs(uz) * (foot.maxZ - foot.minZ) / 2;
    const outside=[];
    for(const gap of [2,3.5,5])for(const side of [0,2,-2,4,-4,7,-7])outside.push({x:b.x-ux*(half+gap)-uz*side,z:b.z-uz*(half+gap)+ux*side});
    const [fx,fz]=ringAt(b),out = reachableEntry(nav,{x:fx,z:fz},outside,{blockers,clearance:1.3});
    const mx = room.origin.x + room.size[0] / 2, mz = room.origin.z + room.size[1] / 2;
    const back={x:Math.max(room.origin.x+1.2,Math.min(room.origin.x+room.size[0]-1.2,2*mx-room.spawn.x)),z:Math.max(room.origin.z+1.2,Math.min(room.origin.z+room.size[1]-1.2,2*mz-room.spawn.z))};
    const insideCandidates=[back];for(const radius of [1,2,3,4])for(let a=0;a<8;a++)insideCandidates.push({x:back.x+Math.cos(a*Math.PI/4)*radius,z:back.z+Math.sin(a*Math.PI/4)*radius});
    const inside = reachableEntry(roomNavs[room.name],room.spawn,insideCandidates,{blockers:room.blockers,clearance:1.3});
    if (!out || !inside) return;
    doors.push({ x: out[0], z: out[1], to: { x: inside[0], z: inside[1] }, place: room.name, label: 'Climb in the back window', ninja: true, business: `b${i}` });
    doors.push({ x: inside[0], z: inside[1], to: { x: out[0], z: out[1] }, place: 'street', label: 'Climb out the back window', ninja: true, business: `b${i}` });
  });
  const paths = {};       // crew walking routes (server-side only, rebuilt when needed)
  const deployment = createDeployment({ state, district, nav, navOf, doors, moveTo,
    inCombat: e => !!fight[e.id]?.target,
    entryAllowed: (e, place) => !businesses || businesses.entryStatus(e, place).ok,
    clearCombat: (e, resetPath = true) => {
      delete e.swing; delete e.execute; delete e.attackTarget; delete e.lootTarget;
      delete e.lootEscort; delete e.patrol; delete e.indoorDuty;
      if (resetPath) {
        delete paths[e.id];
        for (const h of Object.values(state.entities)) if (h.assistCrew) h.assistCrew = h.assistCrew.filter(id => id !== e.id);
      }
      if (fight[e.id]) delete fight[e.id].target;
    } });
  const assignments = createAssignments({ state, deployment, doors, inCombat: e => !!fight[e.id]?.target,
    defenseTarget:e=>crewTarget(e),attackStep:(e,unit,t)=>{if(!swingStep(e,unit))engage(e,unit,t);},
    clearCombat: e => { delete e.swing; delete e.execute; delete e.patrol; delete e.indoorDuty; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target;
      for (const h of Object.values(state.entities)) if (h.assistCrew) h.assistCrew = h.assistCrew.filter(id => id !== e.id); } });
  const rally = createDeploymentRally({ state, deployment });
  const shinobiIntelligence = createShinobiIntelligence({ state, deployment, vision });
  const sectorRecovery = createSectorRecovery({ state, deployment, rally, vision, cityAway: () => cityAway,
    hostile: (a, b) => hostile(a, b),
    inCombat: e => !!fight[e.id]?.target,
    clearCombat: e => { delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; },
    attackStep: (e, unit, t) => { if (!swingStep(e, unit)) engage(e, unit, t); } });
  const shinobiAssignments = createShinobiAssignments({ state, deployment, assignments, rally, vision, intelligence: shinobiIntelligence, recovery: sectorRecovery, sees: (a, b) => sees(a, b),
    defenseTarget: e => crewTarget(e),
    clearCombat: e => { delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; },
    attackStep: (e, unit, t) => { if (!swingStep(e, unit)) engage(e, unit, t); }, executeStep,
    finishTarget: (clan, target, ids) => { const h = Object.values(state.entities).find(e => e.owner === clan && e.type === 'hero'); if (h) startExecute(h, { target, units: ids, crewOnly: true }, true); } });
  const diversion = createDiversion({ state, deployment, vision, thinksNow: e => thinksNow(e), decide: (key, e, search, keep) => decide(key, e, search, keep), reveal: (e, attack) => stealth.reveal(e, attack),
    attackStep:(e,unit,t)=>{if(!swingStep(e,unit))engage(e,unit,t);},
    hostile: (a, b) => hostile(a, b) && sees(a, b),
    moveTo: (e, unit, x, z, walk) => moveTo(e, unit, x, z, walk), nearestFree: (x, z, e) => (e && (deployment.navFor(e) || navOf(e.place)) || nav).nearestFree(x, z), fightTarget: id => fight[id]?.target,
    clearLine: (a, b) => navOf(a.place)?.clearLine(a.x, a.z, b.x, b.z) ?? true,
    onCharmed:(target,clan)=>{for(const a of Object.values(state.entities))if(a.owner===clan){if(a.charmAttack?.target===target.id)delete a.charmAttack;if(a.order?.kind==='attack'&&a.order.target===target.id)endAttack(a,true);if(a.attackTarget===target.id)delete a.attackTarget;if(a.swing?.target===target.id)delete a.swing;if(fight[a.id]?.target===target.id)delete fight[a.id].target;if(a.rifle?.aim?.target===target.id)rifleman.interrupted(a);}},
    clearCombat: e => { delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; } });
  const rifleman = createRifleman({ state, vision, hit: (a, t, d, crit, kind) => {const hp=t.hp;hit(a,t,d,crit,kind);if(t.hp<hp)kuroda.rangedHit(a,t);},
    canAttack: (a, b) => attackAllowed(a, b) && sees(a, b),
    stun: (t, ticks) => { delete t.swing; addBuff(t, 'stunned', ticks / TICK_RATE); }, clearLine: (a, b) => navOf(a.place)?.clearLine(a.x, a.z, b.x, b.z) ?? true,
    hostile: (a, b) => hostile(a, b) && sees(a, b), attackStep: (e, unit, t) => { if (!swingStep(e, unit)) engage(e, unit, t); },
    moveTo: (e, unit, x, z, walk) => moveTo(e, unit, x, z, walk), nearestFree: (x, z, e) => (e && (deployment.navFor(e) || navOf(e.place)) || nav).nearestFree(x, z), canOccupy: (e, x, z, p) => deployment.canOccupy(e, x, z, p),
    fightTarget: id => fight[id]?.target, inCombat: e => !!fight[e.id]?.target, rules: units?.types?.kuroda_rifleman?.rifle, inRally: e => rally.participating(e),
    clearCombat: e => { delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; } });
  const taunt = createTaunt({ state, vision, rulesFor:e=>units.types[e?.type]?.taunt, engagementTarget:e=>crewTarget(e), reveal:(e,v)=>stealth.reveal(e,v),allowed:(a,b)=>attackAllowed(a,b)&&sees(a,b), hostile: (a, b) => hostile(a, b), addBuff: (e, name, seconds, extra) => addBuff(e, name, seconds, extra),
    attackStep: (e, unit, t) => { if (!swingStep(e, unit)) engage(e, unit, t); }, fightTarget: id => fight[id]?.target, rules: units?.types?.yakuza_enforcer?.taunt,
    clearCombat: e => { delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; } });
  function manualCrew(e) { delete e.charmAttack; crewJobs?.cancel(e);sectorCleanup.cancel(e);contracts?.interruptScrub(e); diversion.manual(e); rifleman.manual(e); shinobiAssignments.manual(e); shakedown.manual(e); sweep.manual(e); assignments.manual(e); }
  let nextId = 1;

  function spawn(type, model, x, z, extra = {}) {
    const id = String(nextId++);
    state.entities[id] = { id, type, model, x, z, dir: 0, anim: 'idle', place: 'street', ...extra };
    rosterChanged(state);   // per-tick owner indexes (sim/util.js) pick the new unit up at once
    const e = state.entities[id], hp = statsOf(e).hp;
    inventory.initialize(e);
    if (hp && e.hp === undefined) e.hp = hp+gearFlat(e,'maxHpFlat');
    if (e.hp !== undefined) e.maxHp ??= e.hp;
    if (type === 'kuroda_rifleman') e.rifle ??= { readyAt: state.tick }; // hires/revivals arrive loaded; aiming still takes its normal second
    if (stealth.canHide(e)) e.hidden = true;   // Shinobi units start hidden (sim/stealth.js)
    const o = e.order;
    if (o?.kind === 'follow' && o.slot === undefined) o.slot = freeSlot(o.target, id);
    deployment.onSpawn(e);
    return id;
  }

  // --- Crew orders ---------------------------------------------------------------
  // Crew orders: follow slots, giving orders, walking out of buildings and moving: sim/crew_orders.js
  function blockOffset(...a) { return crewOrders.blockOffset(...a); }
  function crewGoal(...a) { return crewOrders.crewGoal(...a); }
  function crewOut(...a) { return crewOrders.crewOut(...a); }
  function followOffset(...a) { return crewOrders.followOffset(...a); }
  function freeSlot(...a) { return crewOrders.freeSlot(...a); }
  function giveOrder(...a) { return crewOrders.giveOrder(...a); }
  function moveTo(...a) { return crewOrders.moveTo(...a); }

  // --- Combat (RTS / Dota style) ----------------------------------------------------
  // Units of two different clans in the same place are enemies. Crew pick fights on
  // their own within AGGRO, but never wander more than LEASH from where they belong.
  const AGGRO = 6, LEASH = 10, CORPSE_SECONDS = 3, LOCK_RANGE = 14, RETALIATE_SECONDS = 5, BACKUP_RANGE = 6;
  const fight = {};      // per unit: { cd: seconds to next hit, target } (server-side only)
  // Bandits become hostile after spotting a clan nearby or being attacked.
  const wild = t => t?.owner === WILD;
  // Police officers (sim/police.js) are only enemies of a clan they are after (o.angry, like bandits)
  const cop = t => t?.owner === POLICE;
  const angryAt = (w, o) => (w.angry?.[o.owner] ?? -1) > state.tick;
  // a jailed hero (sim/police.js) stands greyed out at the HQ: nobody can touch him
  // Smoke Bomb (Shinobi R, state.smokes): inside a cloud nobody but its clan picks or keeps a
  // target, and nobody outside sees in
  const inSmoke = (s, e) => s.place === e.place && (e.x - s.x) ** 2 + (e.z - s.z) ** 2 <= s.r * s.r;
  // except that its own clan's units attacking or knocking down a War Lantern in it can be seen and hit (Tim 2026-10-26)
  const blind = (a, b) => !!state.smokes && state.smokes.some(s => a.owner !== s.clan && (inSmoke(s, a) || inSmoke(s, b))
    && !(b && b.owner === s.clan && stealth.exposed(b)));
  const baseHostile = (a, b) => b && a !== b && !a.garrison && !b.garrison && !a.aboard && (!a.mounted || a.cavalry) && !b.guide && !a.guide && !b.dead && !b.downed && !b.jailed && a.owner && b.owner && a.owner !== b.owner && a.place === b.place
    && (!wild(a) || angryAt(a, b)) && (!wild(b) || angryAt(b, a)) && (!cop(a) || angryAt(a, b)) && (!cop(b) || angryAt(b, a)) && !blind(a, b)
    && deployment.canActAt(a, b.x, b.z, b.place);
  const hostile=(a,b)=>!b?.shopkeeper&&!b?.animal&&baseHostile(a,b)&&!charmProtected(a,b,state);
  // Townsfolk belong to no clan: never picked as a fight on their own, but anyone in a clan
  // can be told to attack (and finish off) one. That is what makes heat.
  const civ = t => t?.type === 'civilian';
  // Frontier (Tim 2026-11-10): heroes and crews of different clans may fight anywhere out there, but frontier
  // townsfolk are never fair game and a town's workers only for the other side of a war on that town
  const atWarWith = (clan, b) => { const w = frontier?.war?.byId(b.town) || frontier?.war?.warOn(b.town); return !!w && ((w.attacker === clan && w.defender === b.workerOwner) || (w.defender === clan && w.attacker === b.workerOwner)); };
  const frontierShield = (a, b) => b?.type === 'civilian' && b.place === 'world' && !!state.clans?.[a?.owner] && (!!b.townsfolk || (!!b.worker && b.workerOwner !== a.owner && !atWarWith(a.owner, b)));
  // anyone in a clan can also go for an officer (that is +heat and makes the police angry)
  const fair = (a, b) => !frontierShield(a, b) && (baseHostile(a, b) || ((civ(b) || ((wild(b) || cop(b)) && !wild(a) && !cop(a))) && a !== b && !a.garrison && !b.garrison && !a.aboard && (!a.mounted || a.cavalry) && !b.guide && !a.guide && !b.dead && !b.downed && !b.jailed && !!a.owner && a.place === b.place && !blind(a, b)))
    && deployment.canActAt(a, b.x, b.z, b.place);
  const attackAllowed=(a,b)=>!b?.shopkeeper&&!b?.animal&&fair(a,b)&&!charmProtected(a,b,state);
  // Fog of war (sim/vision.js): a clan only fights what it can see. Units outside any clan
  // (night bandits) are not limited.
  // a hidden ninja (sim/stealth.js) is seen by nobody but its own side
  const sees = (a, b) => !(b?.hidden && b.owner !== a.owner) && !(b && blind(a, b)) && (!state.clans?.[a.owner] || vision.canSee(a.owner, b));
  const reachOf = (a, b) => (statsOf(a).attackRange || 1) + statsOf(b).radius;

  // City decisions at a lower rate while no player is in the city (lag step 1, Tim 2026-11-05).
  // Away = no hero of a non-bot clan anywhere but the island ('world'); checked at the start of
  // every tick, so walking, travel, Unstuck or a load into the city is full rate on that tick.
  // Only searches (who to fight, whom to chase) slow down; movement and swings stay at 20 Hz.
  // settings.json cityDecisions.awayHz: 0 (or 20) turns it off.
  const awayHz = options.settings?.cityDecisions?.awayHz ?? 2;
  const thinkEvery = awayHz > 0 && awayHz < TICK_RATE ? Math.round(TICK_RATE / awayHz) : 1;
  let cityAway = false;
  const watchingCity = new Set();   // owners looking at their city from the island (Watch the city, Tim 2026-11-08): the city thinks at full speed for them; not saved
  const updateCityAway = () => { cityAway = thinkEvery > 1 && !Object.values(state.entities).some(e => e.type === 'hero' && (e.place !== 'world' || watchingCity.has(e.owner)) && state.clans?.[e.owner] && !state.clans[e.owner].bot);
    if (!cityAway && thinkCache.size) thinkCache.clear(); };
  const thinkSlot = new Map();   // unit id -> its tick slot, so units spread their thinking over the period
  // true when this city unit searches this tick (always, unless the city is away)
  const thinksNow = e => {
    if (!cityAway || e.place === 'world') return true;
    let k = thinkSlot.get(e.id);
    if (k === undefined) { k = 0; for (const ch of String(e.id)) k = (k * 31 + ch.charCodeAt(0)) >>> 0; k %= thinkEvery; thinkSlot.set(e.id, k); }
    return state.tick % thinkEvery === k;
  };
  // A unit's search result (key = which search), reused until its next thinking tick while the city
  // is away. keep(t) re-checks a cached target every tick: a target that died or left is searched for again at once.
  const thinkCache = new Map();
  function decide(key, e, search, keep) {
    let m = thinkCache.get(key); if (!m) thinkCache.set(key, m = new Map());
    const c = m.get(e.id);
    if (c && cityAway && state.tick - c.tick < thinkEvery && !thinksNow(e) && (!c.t || keep(c.t))) return c.t;
    const t = search();
    if (cityAway) m.set(e.id, { t, tick: state.tick });
    return t;
  }

  // Officers are never picked on their own: hitting police (+heat) is always the player's
  // (or bot's) own order, so standing still next to a squad doesn't spiral the heat.
  // Business attack-wave officers add no infamy per hit and remain automatic targets.
  const heatFor = k => units?.rules?.civilianHeat?.[k] || 0;
  // a clan's home hideout (b.hideout = clan id; sim/clans.js gives it to the clan) and whether a unit is in it
  const hideoutOf = id => Object.values(state.businesses).find(b => b.hideout === id && b.owner === id);
  const atHome = e => !!e && e.place !== 'street' && hideoutOf(e.owner)?.room === e.place;
  // Combat: targets, crew attack sync, swings, hits, heat and carrying off the downed: sim/combat.js
  function addHeat(...a) { return combat.addHeat(...a); }
  function anchorOf(...a) { return combat.anchorOf(...a); }
  function carryOffDowned(...a) { return combat.carryOffDowned(...a); }
  function coolHeat(...a) { return combat.coolHeat(...a); }
  function crewTarget(...a) { return combat.crewTarget(...a); }
  function endAttack(...a) { return combat.endAttack(...a); }
  function engage(...a) { return combat.engage(...a); }
  function hit(...a) { return combat.hit(...a); }
  function nearestEnemy(...a) { return combat.nearestEnemy(...a); }
  function resumable(...a) { return combat.resumable(...a); }
  function rng(...a) { return combat.rng(...a); }
  function setAssistCrew(...a) { return combat.setAssistCrew(...a); }
  function swingStep(...a) { return combat.swingStep(...a); }
  function syncCrewAttacks(...a) { return combat.syncCrewAttacks(...a); }

  // --- Downed crew and executes ----------------------------------------------------
  // A downed unit lies there and is skipped by attacks. Any unit of another clan can
  // finish it: walk up, then channel for executeSeconds; a hit, moving or a new order
  // breaks the channel. e.execute = { target, start (tick the channel began, or null), len }
  // is in the state so the renderer can draw the channel bar.
  // a downed hero (only the police knock one down) can only be arrested, never executed
  const downedFoe = (a, t) => t && t.downed && !t.dead && a.owner && a.place === t.place && (civ(t) || (t.owner && a.owner !== t.owner))
    && (t.type !== 'hero' || cop(a));
  // --- Looting (Tim 2026-10-19) -------------------------------------------------------
  // A bandit's body carries its ryo (body.loot). A nearby hero takes it; otherwise
  // the nearest selected crew member goes, with non-following selected crew escorting.
  const LOOT_REACH = 1.6;
  const lootable = (e, b) => !!b && b.dead && (b.loot > 0 || b.gearItem) && b.place === e.place && sees(e, b) && deployment.canActAt(e, b.x, b.z, b.place);
  // Looting bodies and executing downed units (hero and crew): sim/loot_execute.js
  function botExecute(...a) { return lootExecute.botExecute(...a); }
  function executeStep(...a) { return lootExecute.executeStep(...a); }
  function lootStep(...a) { return lootExecute.lootStep(...a); }
  function startExecute(...a) { return lootExecute.startExecute(...a); }
  function startLoot(...a) { return lootExecute.startLoot(...a); }
  const sectorCleanup=createSectorCleanup({state,deployment,rally,navigation:e=>deployment.navFor(e)||navOf(e.place),sees,downedFoe,lootable,
    startExecute,executeStep,lootStep,inCombat:e=>!!crewTarget(e),thinksNow:e=>thinksNow(e),stopPath:e=>{delete paths[e.id];}});
  crewJobs=createCrewJobs({state,heroLoot:(h,c)=>{if(h.dead||h.downed||h.jailed||h.execute||!lootable(h,state.entities[c.target]))return false;startLoot(h,{...c,units:[],crewJob:false});return h.lootTarget===c.target;},deployment,rally,manual:manualCrew,navigation:e=>deployment.navFor(e)||navOf(e.place),sees,lootable,downedFoe,startExecute,executeStep,lootStep,giveOrder,resumeDuty:assignments.resume,freeSlot,
    clearCombat:e=>{delete e.swing;delete e.execute;delete e.attackTarget;delete e.lootTarget;delete paths[e.id];if(fight[e.id])delete fight[e.id].target;}});

  // Slow healing for anyone not hit for a while (stand-in until the hospital exists)
  function regen() {
    for (const e of Object.values(state.entities)) {
      if (e.dead || e.downed || !e.maxHp || e.hp >= e.maxHp) continue;
      e.hp = Math.min(e.maxHp, e.hp + stats.regeneration(e).current * DT);
    }
  }


  // --- Hero abilities (Q / E / R / F) -----------------------------------------------
  // Defined per hero type in units.json ("abilities"), each with a kind the rules know:
  // dash, intimidate, rally, lantern. Cooldowns (e.cooldowns: slot -> tick it is ready)
  // and buffs (e.buffs: name -> { until, ... }) live in the state so the action bar can
  // draw them. Buffs and the dash are cleared when a unit goes down.
  const secs = s => Math.round(s / DT);
  function damageScale(a) {
    return stats.damageMultiplier(a);
  }
  function addBuff(e, name, seconds, extra = {}) { (e.buffs ||= {})[name] = { until: state.tick + secs(seconds), ...extra }; }

  const kuroda = createKuroda({ state, statsOf, fair, sees, reachOf, hit, addBuff, damageScale, civilian: civ, cop, buffEligible: rally.buffEligible,
    clearLine: (a, b) => navOf(a.place)?.clearLine(a.x, a.z, b.x, b.z) ?? true,
    clearCombat: e => { delete e.swing; delete e.execute; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; } });

  // Hero abilities (Q / E / R / F), the dash and buff upkeep: sim/hero_abilities.js
  function dashStep(...a) { return heroAbilities.dashStep(...a); }
  function expireBuffs(...a) { return heroAbilities.expireBuffs(...a); }
  function healBuffs(...a) { return heroAbilities.healBuffs(...a); }
  function useAbility(...a) { return heroAbilities.useAbility(...a); }
  // Dead crew are removed after their fall; a knocked-out hero gets up at home with full health
  function cleanUpDead() {
    for (const e of Object.values(state.entities)) {
      if (!e.dead) continue;
      const secs = (state.tick - e.diedAt) * DT;
      // a knocked-out officer lies there downedMinSeconds too before he is taken away (Tim 2026-10-20)
      const lie = e.loot ? (banditData?.rules?.lootSeconds ?? 60) : cop(e) ? (units?.rules?.downedMinSeconds ?? 10) : CORPSE_SECONDS;
      if (e.type !== 'hero' && secs >= lie) {
        delete state.entities[e.id];
        delete intents[e.id];
        for (const u of Object.values(state.entities)) if (u.order?.target === e.id && (u.order.kind === 'attack' || u.order.kind === 'loot')) { if (u.order.kind === 'attack') endAttack(u); else u.order = u.order.prev || { kind: 'move', x: u.x, z: u.z }; }
      }
      // a knocked-out hero comes round inside his clan's hideout after heroRespawnSeconds (rival bot plan),
      // else at the clinic's door ring (Tim 2026-10-17), or at home when the map has no clinic
      if (e.type === 'hero' && secs >= (units?.rules?.heroRespawnSeconds ?? 20) * leader.respawnFactor(e.owner)) {
        if (islandRespawn?.hero(e)) continue;   // knocked out on the island: up at the nearest town hall, low health
        const hd = doors.find(d => d.to && d.place === hideoutOf(e.owner)?.room);
        if (hd) {
          Object.assign(e, { x: hd.to.x, z: hd.to.z, place: hd.place, hp: e.maxHp, dead: false, anim: 'idle' });
          delete e.diedAt;
          continue;
        }
        const clinic = doors.find(d => d.menu === 'clinic');
        const [hx, hz] = clinic ? [clinic.x, clinic.z] : e.home || [e.x, e.z];
        Object.assign(e, { x: hx, z: hz, place: clinic || e.home ? 'street' : e.place, hp: e.maxHp, dead: false, anim: 'idle' });
        delete e.diedAt;
      }
    }
  }

  // the governor stands in front of each player town hall by day and is inside at night (Tim 2026-11-10). He is
  // nobody's crew (no owner, so he cannot be selected or ordered) and not attackable (guide). Space beside him or at
  // the hall talks to him, day or night. Look: units.json rules.governorModel; spot: rules.governorSpot (in cells).
  function townGovernors() {
    if (!state.frontier || state.tick % 20) return;
    const model = units?.rules?.governorModel || 'merchant', cell = options.frontier?.townGrid?.cellSize || 11;
    const [ox, oz] = units?.rules?.governorSpot || [0.15, -0.62];
    for (const s of Object.values(state.frontier.settlements || {})) {
      const g = s.governorNpc && state.entities[s.governorNpc];
      const want = !state.night && s.founded && s.owner && !state.clans?.[s.owner]?.bot && Number.isFinite(s.x);
      if (g && (!want || g.owner || g.governorOf !== s.owner || g.dead || g.downed)) { removeUnit(g.id); delete s.governorNpc; continue; }
      if (!want) { delete s.governorNpc; continue; }
      const x = s.x + cell * ox, z = s.z + cell * oz;
      if (!g) s.governorNpc = spawn('city_captain', model, x, z, { owner: null, place: 'world', guide: true, governor: s.id, governorOf: s.owner, holdFire: true, hp: 100, name: 'Governor' });
      else Object.assign(g, { x, z, place: 'world', anim: 'idle' });
    }
  }
  // the old surveyor outside the Land Office (Tim 2026-11-06 20:45): one figure, nobody's crew, not attackable (guide),
  // there while any player clan plays a founding mode. Placeholder look: units.json rules.surveyorModel (the fisherman).
  function landSurveyor() {
    if (!landOffice || state.tick % 20) return;
    const d = doors.find(x => x.menu === 'surveyor'), model = units?.rules?.surveyorModel || 'fisherman';
    const g = state.surveyorNpc && state.entities[state.surveyorNpc];
    const want = !!d && modeRules(state).founding && Object.values(state.clans || {}).some(c => !c.bot);
    if (g && (!want || g.dead || g.downed)) { removeUnit(g.id); delete state.surveyorNpc; return; }
    if (!want) return;
    if (!g) state.surveyorNpc = spawn('city_captain', model, d.x + 0.8, d.z, { owner: null, place: 'street', guide: true, surveyor: true, holdFire: true, hp: 100, name: 'Old surveyor' });
    else Object.assign(g, { x: d.x + 0.8, z: d.z, place: 'street', anim: 'idle' });
  }
  const cannons = createCannonSalute({ state, spawn: (...a) => spawn(...a), removeUnit: id => removeUnit(id), cell: options.frontier?.townGrid?.cellSize || 11, rules: units?.rules?.cannonSalute });
  const townCount = owner => Object.values(state.frontier?.settlements || {}).filter(s => s.owner === owner && s.founded !== undefined).length;
  // Space at your town hall talks to its governor (Tim 2026-11-07): within reach of the hall's middle
  const governorNear = (id, reach = null) => { const h = state.entities[id]; if (!h || h.place !== 'world') return null;
    const cell = options.frontier?.townGrid?.cellSize || 11, r = reach ?? cell * 1.5;
    const fig = s => state.entities[s.governorNpc];   // standing beside the governor himself also counts
    const s = Object.values(state.frontier?.settlements || {}).find(s => s.owner === h.owner && s.founded && Number.isFinite(s.x)
      && (Math.hypot(s.x - h.x, s.z - h.z) < r || (fig(s) && Math.hypot(fig(s).x - h.x, fig(s).z - h.z) < 3.5)));
    return s ? { governor: s.id, owner: s.owner, x: s.x, z: s.z } : null; };

  // Crew each tick: duties, pursuit, indoor duty and going through doors: sim/crew_step.js
  function crewStep(...a) { return crewSteps.crewStep(...a); }
  // units standing on each other ease apart; on the island too (Tim 2026-11-07: crew following the hero stacked
  // there), for clan units on foot or horseback (a horse takes more room); riders inside vehicles, horses, vehicles
  // and scenery keep their places. Each place separately: street and island coordinates overlap
  const looseOnIsland = e => e.owner && !e.aboard && !e.guide && !e.garrison && e.type !== 'horse' && e.type !== 'omnibus' && e.type !== 'rickshaw';
  function separate() {
    const all = Object.values(state.entities).filter(e => e.type !== 'hero' && !e.dead && !e.downed);
    separateUnits(all.filter(e => e.place === 'street'),e=>statsOf(e).radius,tryMove);
    const island = all.filter(e => e.place === 'world' && looseOnIsland(e));
    if (island.length > 1) separateUnits(island,e=>statsOf(e).radius*(e.mounted&&!e.cavalry?2.5:1),tryMove);   // war cavalry carry their own radius (units.json)
  }

  // Spawn a unit just outside a building's door, on a spot that is free of walls and
  // other units (new crew step out in a little fan instead of stacking on the door)
  function spawnOutside(type, model, b, extra) {
    const [dx, dz] = b.door || [b.x, b.z];
    let ox = dx - b.x, oz = dz - b.z;
    const len = Math.hypot(ox, oz) || 1; ox /= len; oz /= len;
    const r = statsOf(type)?.radius || 0.35;
    const clear = (x, z) => !blockers.some(k => x + r > k.minX && x - r < k.maxX && z + r > k.minZ && z - r < k.maxZ) &&
      !Object.values(state.entities).some(e => e.place === 'street' && Math.hypot(e.x - x, e.z - z) < 0.9);
    for (let ring = 1; ring <= 4; ring++) {
      for (const side of [0, 1, -1, 2, -2]) {
        const x = dx + ox * ring * 1.1 - oz * side * 0.9, z = dz + oz * ring * 1.1 + ox * side * 0.9;
        if (clear(x, z)) return spawn(type, model, x, z, extra);
      }
    }
    return spawn(type, model, dx, dz, extra);
  }

  // Crew through a door with their hero (Tim 2026-10-17): going in, the crew listed in the
  // 'use' command (the player's selection) who are near the hero come along; the rest stay
  // outside. When leaving, only selected crew explicitly told to Follow while
  // indoors come along. Others stay until ordered to move to the street.
  // Whoever comes along lands in a little ring round the hero and follows him.
  const BRING_RADIUS = 12;
  // Through the island gate (W3.5): the hero's group comes along, the selected crew and anyone
  // following him, if they are near the gate; they keep following him on the other side.
  const GATE_RADIUS = 14;
  function gateCrew(hero, from, d, ids = []) {
    areas.update(Object.values(state.entities));   // the hero is through: wake the chunks round him
    const grid = navOf(d.place);
    const group = Object.values(state.entities).filter(u => u.owner === hero.owner && u.type !== 'hero' && !u.guard && !u.dead && !u.downed && !u.jailed
      && u.place === from && Math.hypot(u.x - d.x, u.z - d.z) < GATE_RADIUS && ((ids || []).includes(u.id) || (u.order?.kind === 'follow' && u.order.target === hero.id))
      && deployment.canActAt(u, d.to.x, d.to.z, d.place));
    group.forEach((u, k) => {
      const [ox, oz] = followOffset(k % 36);
      const [x, z] = grid.nearestFree(hero.x + ox * 0.8, hero.z + oz * 0.8) || [hero.x, hero.z];
      Object.assign(u, { x, z, place: d.place, anim: 'idle' });
      delete paths[u.id]; delete u.execute; delete u.swing; delete u.patrol; delete u.indoorDuty;
      if (fight[u.id]) delete fight[u.id].target;
      u.order = { kind: 'follow', target: hero.id }; u.order.slot = freeSlot(hero.id, u.id);
    });
    areas.update(Object.values(state.entities));
  }
  function bringCrew(hero, from, d, ids = []) {
    const out = d.place === 'street';
    if(!out&&from==='street')for(const id of ids||[]){const u=state.entities[id];
      if(u&&u.owner===hero.owner&&u.place===from&&!u.dead&&!u.downed&&!u.execute&&!u.crewJob&&!u.deployment?.transfer&&rally.participating(u)){
        manualCrew(u);u.order={kind:'follow',target:hero.id,regrouping:true};
      }
    }
    const crew = Object.values(state.entities).filter(u => u.owner === hero.owner && u.type !== 'hero' && !u.guard && !u.dead && !u.downed && u.place === from
      && (ids || []).includes(u.id) && (!out || (u.order?.kind === 'follow' && u.order.target === hero.id && u.order.exitWithHero))
      && deployment.canActAt(u, d.to.x, d.to.z, d.place)
      && (out || Math.hypot(u.x - d.x, u.z - d.z) < BRING_RADIUS))
      .slice(0, out ? Infinity : d.ninja&&!rally.status(hero.owner).active ? 6 : businesses?.crewSlots(hero.owner, d.place) ?? Infinity);   // selected ninja crew climb in through a back window too (Tim 2026-10-21)   // a raid takes at most maxCrewInside crew in
    const r0 = 0.3;
    const clear = (x, z) => !blockers.some(k => x + r0 > k.minX && x - r0 < k.maxX && z + r0 > k.minZ && z - r0 < k.maxZ);
    crew.forEach((u, k) => {
      let [x, z] = [hero.x, hero.z];
      for (let n = k; n < k + 36; n++) {
        const [ox, oz] = followOffset(n % 36);
        if (clear(hero.x + ox * 0.8, hero.z + oz * 0.8)) { [x, z] = [hero.x + ox * 0.8, hero.z + oz * 0.8]; break; }
      }
      if (out) [x, z] = nav.nearestFree(x, z) || [x, z];
      Object.assign(u, { x, z, place: d.place, anim: 'idle' });
      delete paths[u.id]; delete u.execute; delete u.swing;
      delete u.patrol;
      delete u.indoorDuty;
      if (fight[u.id]) delete fight[u.id].target;
      // player crew hold once through (Tim 2026-10-25); a bot's crew stay its mobile squad and can leave with it again
      if (state.clans?.[hero.owner]?.bot) u.order = { kind: 'follow', target: hero.id, slot: freeSlot(hero.id, u.id), ...(out ? {} : { exitWithHero: true }) };
      else if (!out || u.order?.kind !== 'follow' || u.order.target !== hero.id) u.order = { kind: 'move', x: u.x, z: u.z, arrived: true };
      else u.order = { kind: 'follow', target: hero.id, slot: freeSlot(hero.id, u.id) };
    });
  }

  // E1 (Tim 2026-11-05): out of the island gate with settlers only (crew stay in the city). action 'walk'
  // steps through the gate on foot; action 'site' puts the hero and settlers at a chosen open site.
  function expedition(e, c) {
    const clan = state.clans?.[e.owner], r = landOffice.expeditionCheck(e, c);
    if (!r.ok) { if (clan) clan.notice = { tick: state.tick, text: r.reason }; return; }
    const from = e.place, old = { x: e.x, z: e.z };
    // Tim 2026-11-06: the Hero group goes with the hero; crew following from other groups stay in the city
    for (const u of Object.values(state.entities)) if (u.owner === e.owner && u.type !== 'settler' && u.type !== 'hero' && u.order?.kind === 'follow' && u.order.target === e.id && !r.crew.includes(u))
      u.order = { kind: 'move', x: u.x, z: u.z, arrived: true };
    let to = { x: gate.island[0], z: gate.island[1] };
    if (r.site) {
      Object.assign(e, { x: r.site.x, z: r.site.z, place: 'world' });
      areas.update(Object.values(state.entities));
      const spot = areas.nav.nearestFree(r.site.x, r.site.z);
      if (!spot) { Object.assign(e, old, { place: from }); if (clan) clan.notice = { tick: state.tick, text: 'No dry land at that site' }; return; }
      to = { x: spot[0], z: spot[1] };
      landOffice.claim(e.owner, r.site.id);
    }
    Object.assign(e, to, { place: 'world', anim: 'idle' });
    delete paths[e.id]; delete intents[e.id];
    areas.update(Object.values(state.entities));
    const grid = navOf('world'), st = units?.types?.settler;
    if (r.waiting && st && clan) {   // Tim 2026-11-06: settlers held safe at the HQ step out here
      for (let k = 0; k < r.waiting; k++) r.settlers.push(state.entities[spawn('settler', st.sprite, e.x, e.z, { owner: e.owner, hp: st.hp, holdFire: true, place: 'world' })]);
      clan.settlersWaiting = 0;
    }
    [...r.settlers, ...r.crew].forEach((u, k) => {
      const [ox, oz] = followOffset(k % 36);
      const [x, z] = grid.nearestFree(e.x + ox * 0.8, e.z + oz * 0.8) || [e.x, e.z];
      Object.assign(u, { x, z, place: 'world', anim: 'idle' });
      delete paths[u.id]; if (fight[u.id]) delete fight[u.id].target;
      u.order = { kind: 'follow', target: e.id }; u.order.slot = freeSlot(e.id, u.id);
    });
    areas.update(Object.values(state.entities));
    const buses = omnibus?.ride(e, [...r.settlers, ...r.crew]) || 0;   // everyone into the omnibus (Tim 2026-11-06)
    const by = buses ? ` by omnibus${buses > 1 ? ' (two)' : ''}: Q to step out` : '';
    if (clan) clan.notice = { tick: state.tick, text: r.site ? `Arrived at site ${r.site.id} with ${r.settlers.length} settlers and ${r.crew.length} crew${by}` : `Out on the island with ${r.settlers.length} settlers and ${r.crew.length} crew${by}` };
  }

  // The door a unit is standing at, if any
  function doorNear(id) {
    const e = state.entities[id];
    // back windows (d.ninja) are only a way in for the Shinobi clan (sim/stealth.js)
    return e ? doors.find(d => (!d.ninja || (state.clans?.[e.owner]?.kind === 'ninja'
      && (!state.businesses[d.business]?.hideout || state.businesses[d.business].owner === e.owner)))
      && Math.hypot(d.x - e.x, d.z - e.z) < DOOR_RADIUS) || null : null;
  }

  function serviceAt(id, menu = null, preferred = []) {
    const menus = ['clinic', 'police_box', 'police_hq', 'contracts'];
    const actor = interactionActor(state, id, e => {
      const d = doorNear(e.id);
      return e.place === 'street' && menus.includes(d?.menu) && (!menu || d.menu === menu)
        && (d.menu !== 'contracts' || state.clans[e.owner]?.kind === 'ninja');
    }, preferred);
    return actor ? { actor, door: doorNear(actor.id) } : null;
  }

  // Speeds and size: the hero and townsfolk from UNITS, crew from units.json
  // statsOf(type), or statsOf(unit): a unit's own sprite can override its type's numbers (units.json "models", the Shinobi boss)
  function statsOf(t) {
    return stats.base(t);
  }

  // Town traffic (civilians.json "vehicle" types) drives on the roads only: the district's road bands
  // (ground lines that are not water), on a coarser grid; built only when a vehicle type exists
  const roadNav = Object.values(civData?.types || {}).some(t => t.vehicle) ? (() => {
    const roads = (district.ground || []).map(groundZone).filter(g => g.shape?.line && g.type !== 'water').map(g => g.shape);
    return roads.length ? createNav(blockers, district.bounds, { cell: 1, pad: 0.6, allowed: (x, z) => roads.some(r => shapeDistance(r, x, z) > 0.5) }) : null;
  })() : null;
  const civilians = createCivilians({
    state, data: civData, pois: district.pois, nav, roadNav, spawn, moveTo, statsOf,
    stopPath: e => { delete paths[e.id]; }, seed: (options.seed ?? 12345) ^ 0x5eed,
  });

  // A bandit's fighting, one tick: finish a swing, or go for the nearest clan it is angry at
  // within range; false when there is nobody to fight
  function fightStep(e, range) {
    const unit = statsOf(e);
    if (swingStep(e, unit)) return true;
    const t = e.angry && nearestEnemy(e, e.x, e.z, range);
    if (t) { engage(e, unit, t); return true; }
    if (fight[e.id]) delete fight[e.id].target;
    return false;
  }
  let worldCamps=null;
  const bandits = createBandits({
    forcedStep:e=>!!e.taunted&&taunt.step(e,statsOf(e)),
    state, data: banditData, units, camps: district.banditCamps, pois: district.pois, edges: district.edges, nav, spawn, moveTo, fightStep, statsOf,
    canSee: (e, t) => sees(e, t) && !!navOf(e.place)?.clearLine(e.x, e.z, t.x, t.z),
    navFor:e=>navOf(e.place),campFor:id=>worldCamps?.campFor(id),
    spares:(e,t)=>!!e.worldCamp&&!!landOffice?.inGrace(t),   // E1: a new town's 2-day grace
    stopPath: e => { delete paths[e.id]; },
    remove: id => { delete state.entities[id]; delete paths[id]; delete fight[id]; delete intents[id]; },
    seed: (options.seed ?? 12345) ^ 0xba7d,
  });

  // Take a unit off the map (arrested, gone home), and stop anyone's attack order on it
  function removeUnit(id) {
    delete state.entities[id]; delete paths[id]; delete fight[id]; delete intents[id];
    for (const u of Object.values(state.entities)) if (u.order?.target === id && u.order.kind === 'attack') endAttack(u);
  }
  worldCamps=createWorldCamps({state,world:options.world,areas,rules:banditData?.worldCamps,spawn,remove:removeUnit,ai:bandits,spriteFor:type=>statsOf(type).sprite || type,known:(clan,x,z)=>discovery.isDiscovered(clan,x,z)});
  // the Land Office, the expedition out of the gate and the new-town grace (frontier E1/E6)
  const dayTicks = dayNight ? Math.round((dayNight.daySeconds + dayNight.nightSeconds) * TICK_RATE) : 12000;
  // C4 Influence (campaign only): Renown + businesses held per day + frontier trade; unlocks permits and prices
  const influence = createInfluence({ state, rules: options.settings?.influence, businessesHeld: id => Object.values(state.businesses).filter(b => b.owner === id && !b.hideout && units?.rules?.businesses?.[b.kind]).length });
  const landOffice = frontier && units ? createLandOffice({ state, data: options.frontier, worldData: options.world, units, clans, doorNear, discovered: (clan, id) => discovery?.siteDiscovered?.(clan, id), dayTicks, maxTowns: (id, base) => influence.maxTowns(id, base) }) : null;
  const goals = createCampaignGoals({ state, clans, landOffice, influence, lieutenantGuide: id => lieutenant?.guideOf(id) || (doors.find(d => d.menu === 'lieutenant') ?? null), surveyorAt: () => doors.find(d => d.menu === 'surveyor') ?? null, rules: units?.rules, spotKind: (() => { const kinds = new Map((options.resourceSpots?.spots || []).map(p => [p.id, p.kind])); return id => kinds.get(id) || null; })(), data: options.frontier || {} });   // quest log (2026-11-06)
  frontier?.attach({areas,gate,navOf:p=>navOf(p),followOffset:(...a)=>followOffset(...a),freeSlot:(...a)=>freeSlot(...a),forget:id=>{delete paths[id];delete intents[id];if(fight[id])delete fight[id].target;},spawn,remove:removeUnit,onFound:id=>landOffice?.founded(id),trade:{exportFactor:id=>influence.exportFactor(id),sold:(id,goods)=>influence.sold(id,goods)}}); // worker routes and hall clearance
  // Police (sim/police.js): they move and fight through the same rules as crew
  const police = units && policeData ? createPolice({
    forcedStep:e=>!!e.taunted&&taunt.step(e,statsOf(e)),
    state, data: policeData, units, district, nav, doors, spawn, spawnOutside, moveTo, statsOf, remove: removeUnit,
    decide: (key, e, search, keep) => decide(key, e, search, keep),
    stopPath: e => { delete paths[e.id]; },
    act: {
      swing: e => swingStep(e, statsOf(e)),
      arresting: e => !!e.execute && executeStep(e, statsOf(e)),
      arrest: (e, t) => startExecute(e, { target: t.id }),
      engage: (e, t) => engage(e, statsOf(e), t),
      hostile,
    },
    seed: (options.seed ?? 12345) ^ 0xc095,
  }) : null;

  // buying businesses and dawn payouts (sim/businesses.js); the police cut payouts in a Manhunt
  // house guards stand just inside the front room, either side of the way in (on the street at its ring if it has no room)
  const guardSpots = b => {
    const r = rooms.find(r => r.name === b.room);
    if (!r) return b.ring ? [-1, 1].map(k => ({ x: b.ring[0] + k, z: b.ring[1], place: 'street' })) : [];
    const mx = r.origin.x + r.size[0] / 2, mz = r.origin.z + r.size[1] / 2;
    const dx = mx - r.spawn.x, dz = mz - r.spawn.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
    const step = Math.min(3.5, len * 0.8);
    const grid = roomNavs[r.name];
    return [-1, 1].map(k => {
      // where a path from the way in toward that spot ends (backs off furniture in the way)
      const x = r.spawn.x + ux * step - uz * k * 1.2, z = r.spawn.z + uz * step + ux * k * 1.2;
      const way = grid?.findPath(r.spawn.x, r.spawn.z, x, z), p = way?.[way.length - 1] || [r.spawn.x, r.spawn.z];
      return { x: p[0], z: p[1], place: r.name, dir: dirIndex(mx - p[0], mz - p[1]) };
    });
  };
  // spots a house guard walks between: a spread over the building's rooms, on free floor
  // (only spots a path from the way in reaches, worked out once per room)
  const patrolCache = {};
  const patrolSpots = b => {
    if (patrolCache[b.room]) return patrolCache[b.room];
    const r = rooms.find(r => r.name === b.room), grid = r && roomNavs[r.name];
    if (!grid) return [];
    const out = [];
    for (const [fx, fz] of [[0.2, 0.2], [0.5, 0.2], [0.8, 0.2], [0.8, 0.5], [0.8, 0.8], [0.5, 0.8], [0.2, 0.8], [0.2, 0.5], [0.5, 0.5]]) {
      const p = grid.nearestFree(r.origin.x + r.size[0] * fx, r.origin.z + r.size[1] * fz);
      const way = p && grid.findPath(r.spawn.x, r.spawn.z, p[0], p[1]);
      const end = way?.[way.length - 1];
      if (end && Math.hypot(end[0] - p[0], end[1] - p[1]) < 0.5) out.push({ x: p[0], z: p[1] });
    }
    return (patrolCache[b.room] = out);
  };
  const roomOfBusiness = b => rooms.find(r => r.name === b.room) || null;
  const businesses = clans ? createBusinesses({ state, units, clans, campaignCity: options.settings?.campaignCity, onRaidPlaced: clan => rally.raidPlaced(clan), payoutShare: id => police?.payoutShare(id) ?? 1, tierOf: id => police?.tierOf(id) ?? 0,
    spawn, guardSpots, patrolSpots, roomOf: roomOfBusiness, remove: removeUnit, payoutBonus: territory.payoutBonus, addHeatGain: (clan, amount, reason) => state.heatGains.push({ clan, amount, reason }) }) : null;
  // C2/C3: the lieutenant's standing orders, budget, log and the city captain (campaign only, sim/lieutenant.js)
  const lieutenant = clans ? createLieutenantRules({ state, rules: options.settings?.campaignCity?.lieutenant, units, clans, doors, spawn, removeUnit: id => removeUnit(id), businesses,
    guideAt: () => { const d = doors.find(x => x.menu === 'lieutenant'); return d && { x: d.x + 1.2, z: d.z }; } }) : null;
  // Shinobi contracts (sim/contracts.js): the back room is the floor spot furthest from the way in, as for raids
  const backRoomOf = b => {
    const room = b && roomOfBusiness(b);
    if (!room) return null;
    const far = patrolSpots(b).slice().sort((p, q) => Math.hypot(q.x - room.spawn.x, q.z - room.spawn.z) - Math.hypot(p.x - room.spawn.x, p.z - room.spawn.z))[0];
    return far ? { x: far.x, z: far.z } : { x: room.spawn.x, z: room.spawn.z };
  };
  // the Steal stash (Tim 2026-10-21: not by the back window, so the thief has to sneak past the guards):
  // the floor spot furthest from where the back window lets you in, kept 3 away from the front door
  const stashOf = b => {
    const room = b && roomOfBusiness(b), win = room && doors.find(d => d.ninja && d.place === room.name);
    if (!room || !win?.to) return backRoomOf(b);
    const far = patrolSpots(b).filter(p => Math.hypot(p.x - room.spawn.x, p.z - room.spawn.z) >= 3)
      .sort((p, q) => Math.hypot(q.x - win.to.x, q.z - win.to.z) - Math.hypot(p.x - win.to.x, p.z - win.to.z))[0];
    return far ? { x: far.x, z: far.z } : backRoomOf(b);
  };
  const unstuck = createUnstuck({ state, rules: units?.rules?.unstuck,
    // on the island: the nearest of your town halls, or your HQ in the capital when the city gate is closer (Tim 2026-11-07)
    destination: (e, probe) => { const t = islandRespawn?.unstuckSpot(e, probe); if (t) return t; const d = doors.find(d => d.to && d.place === hideoutOf(e.owner)?.room); return d && { x: d.to.x, z: d.to.z, place: d.place }; },
    moving: e => Math.hypot(intents[e.id]?.right || 0, intents[e.id]?.down || 0) >= 0.1 || !!e.snuffing || !!e.lootTarget,
    holding: e => { const job = state.contracts?.active?.[e.owner]; return !!e.markScrub || !!e.lootTarget || (['mark', 'steal'].includes(job?.kind) && state.businesses[job.business]?.room === e.place); },
    cleanup: e => { delete paths[e.id]; delete intents[e.id]; delete e.attackTarget; delete e.assistCrew; delete e.swing; delete e.lootTarget; kuroda.cancel(e); } });
  const contracts = clans ? createContracts({ state, rules: units?.rules?.contracts, scores: scoreOf, backRoom: backRoomOf, stash: stashOf, WILD, seed: (options.seed ?? 12345) ^ 0xc0de, leader: () => territory?.standings().find(r => r.score > 0)?.clan ?? null, inCombat:e=>!!fight[e.id]?.target }) : null;
  const shakedown = createShakedown({ state, deployment, rally, vision, rooms, doors, navOf, spawn, remove:removeUnit,
    recoverHome:(clan,sector,reason,ids)=>sectorRecovery.requestHome(clan,sector,reason,ids),
    rules:{...units?.rules?.shakedown,businesses:units?.rules?.businesses}, sees,
    addHeat, hit, clearCombat:e=>{delete e.swing;delete e.execute;delete e.attackTarget;delete paths[e.id];if(fight[e.id])delete fight[e.id].target;},
    attackStep:(e,unit,t)=>{if(taunt.step(e,unit))return;if(!swingStep(e,unit))engage(e,unit,t);} });
  const sweep = createSweep({ state, deployment, rally, hostile, sees, rewards,
    recoverHome:(clan,sector,reason,ids)=>sectorRecovery.requestHome(clan,sector,reason,ids),
    onScatter:manualCrew, recover:(clan,sector,reason)=>sectorRecovery.request(clan,sector,reason),
    attackStep:(e,unit,t)=>{if(taunt.step(e,unit))return;
      const order=e.order;e.order={kind:'attack',target:t.id};const ranged=rifleman.step(e,unit);e.order=order;
      if(!ranged&&!swingStep(e,unit))engage(e,unit,t);},
    clearCombat:e=>{delete e.swing;delete e.execute;delete e.attackTarget;delete paths[e.id];if(fight[e.id])delete fight[e.id].target;} });
  const hqCamping = clans ? createHQCamping({ state, rules: units?.rules?.hqCamping, addHeat }) : null;
  const hqRaids = clans ? createHQRaidEffects({ state, rules: units?.rules?.hqRaid, dayNight: dayNight || {} }) : null;

  // commands: [{ id, type: 'move', right, down, walk }] with right/down from -1 to 1 on screen,
  // [{ id, type: 'use', units? }] to go through the door the unit stands at (a hero brings `units`,
  //   its selected crew, inside with it; coming out, its crew in the room come too),
  // [{ id, type: 'hire', business, unit }] sent by a hero inside a teahouse (players and bots alike),
  // [{ id, type: 'attack', target }] makes a hero chase and hit an enemy until it moves with WASD,
  // [{ id, type: 'execute', target, units? }] finishes off a downed enemy: the hero, or the nearest of `units` (its crew),
  // [{ id, type: 'ability', slot: 'Q' | 'E' | 'R' | 'F', x, z }] uses a hero ability (x, z = aim on the ground),
  // [{ type: 'time', night? }] sets night on or off (no night given: flips it),
  // [{ id, type: 'business', action: 'buy' | 'attack' | 'raid' | 'lantern', business }] from a hero at a business's door ring (sim/businesses.js),
  // [{ id, type: 'police', action: 'bribe' }] at the police box, [{ id, type: 'police', action: 'bail', prisoner }] at the HQ,
  // [{ id, type: 'clinic', action: 'revive', patient } | { id, type: 'clinic', action: 'heal' }] from a hero
  //   at the clinic door: get a carried-off crew member out now, or heal the hero and nearby crew,
  // or [{ id, type: 'order', units: [ids], kind: 'follow' | 'move' | 'station' | 'attackmove', x, z }]
  // and [{ id, type: 'order', units: [ids], kind: 'attack', target }] sent by a hero
  function step(commands = []) {
    updateCityAway();
    rally.tick();
    rally.cleanBuffs();
    const lastNews = state.news || [];
    state.hits = [];      // this tick's hits and ability uses, for the renderer
    state.dodges = [];
    state.casts = [];
    state.heatGains = [];
    state.ryoGains = [];
    state.itemGains = [];   // this tick's gear put in a bag ({ clan, id }), for the loot notice
    state.ryoLosses = [];
    state.news = [];         // this tick's big moments (boss knocked out or arrested, War Lantern knocked down), for the screen
    state.policeNews = [];   // this tick's police news per clan ({ clan, kind: 'lost' }), for the screen
    state.dawn = state.dusk = false;
    areas?.update(Object.values(state.entities));   // island chunks around the units out there (cheap when nobody moved chunk)
    leader.tick(lastNews);   // leader bounties for last tick's raids and Shakedowns
    rewards.renownTick(lastNews);   // property-clan Renown for the same moments
    if (state.clock && --state.clock.left <= 0) setNight(!state.night);
    // notices raised by a lieutenant's own commands ("War Lantern planted", "Rally accepted") are not shown to the
    // boss as if he had given them (Tim 2026-11-10): his log has them; results (won, failed) still come through
    const ltNotice = new Map(), ownCommand = new Set();
    for (const c of commands) {
      if (c.type === 'time') { setNight(typeof c.night === 'boolean' ? c.night : !state.night); continue; }
      const e = state.entities[c.id];
      if (!e) continue;
      if (c.by !== 'lieutenant') ownCommand.add(e.owner);
      else if (!ltNotice.has(e.owner) && state.clans?.[e.owner] && !state.clans[e.owner].bot) ltNotice.set(e.owner, state.clans[e.owner].notice);
      if (c.type === 'watchCity') { if (c.on && e.type === 'hero') watchingCity.add(e.owner); else watchingCity.delete(e.owner); continue; }
      if (watchingCity.has(e.owner) && !c.by && (c.type === 'order' || c.type === 'deployment')) continue;   // watching only: no crew orders
      // the boss out on the island gives the city no orders (Tim 2026-11-08): the lieutenant runs it (his commands carry
      // by), crew out on the island still take orders. Bots out there have their lieutenant brain instead.
      if (bossAway(e) && !c.by && !state.clans?.[e.owner]?.bot && !watchingCity.has(e.owner)
        && (c.type === 'deployment' || (c.type === 'order' && Array.isArray(c.units)))) {
        const asked = c.type === 'order' ? c.units.length : 0;
        if (c.type === 'order') c.units = c.units.filter(id => state.entities[id]?.place === 'world');
        if (c.type === 'deployment' || (asked && !c.units.length)) {
          const clan = state.clans?.[e.owner];
          if (clan) clan.notice = { tick: state.tick, text: "The lieutenant runs the city while you're away: come back through the gate or by train to give orders" };
          continue;
        }
      }
      // C2: a lieutenant's command runs only inside its standing orders and budget (sim/lieutenant.js)
      if (c.by === 'lieutenant' && !lieutenant?.gate(e, c).ok) continue;
      if (c.type === 'lieutenant' && c.guide === 'governor') cannons.firstTalk(state.frontier?.settlements?.[governorNear(e.id)?.governor]);   // first talk in a town: a salute (Tim 2026-11-07)
      // a goal talk only counts while its card is up (Tim 2026-11-10: he always stands at the gate now, so an early chat
      // must not skip Meet your lieutenant or Give him his orders)
      if (c.type === 'lieutenant' && (c.guide === 'met' || c.guide === 'opened') && goals?.current(e.owner)?.key !== (c.guide === 'met' ? 'lieutenant' : 'orders')) continue;
      if (c.type === 'lieutenant') { lieutenant?.command(e, c); continue; }
      itemServices.interrupt(e,c);
      // a hero lying down or in jail can still order his crew, nothing else
      if ((e.dead || e.downed || e.jailed) && !['order', 'move', 'business', 'clinic', 'police', 'contract', 'loot', 'execute', 'deployment', 'world', 'frontier'].includes(c.type)) continue;
      // inside the omnibus (sim/omnibus.js): no fighting or looting; a door (the gate) steps everyone out first
      if ((e.aboard || (e.mounted && !e.cavalry)) && ['attack', 'ability', 'execute', 'loot', 'snuff', 'interiorDoor', 'item'].includes(c.type)) { const clan = state.clans?.[e.owner]; if (clan) clan.notice = { tick: state.tick, text: e.aboard ? 'Step out of the omnibus first (Q)' : 'Get off your horse first (H)' }; continue; }
      if (e.aboard && c.type === 'use') omnibus?.deploy(e);
      if (e.mounted && c.type === 'use') mounts?.dismount(e);
      // Selection and crew commands cannot replace the hero's current execution.
      if (e.type === 'hero' && e.execute && ['ability', 'snuff', 'use'].includes(c.type)) continue;
      if (e.markScrub && ((c.type === 'move' && Math.hypot(c.right,c.down) >= .1)
        || ['attack','ability','execute','use','interiorDoor','snuff','loot','cancel'].includes(c.type))) contracts.interruptScrub(e);
      if (c.type === 'move') {
        intents[c.id] = c;
        if (Math.hypot(c.right, c.down) >= 0.1) { kuroda.cancel(e, true); delete e.swing; }
      }
      if (c.type === 'use') {
        if (stunned(e, state.tick) || e.brace || e.spearCombo) continue;
        const d = doorNear(c.id);
        // raiders wait outside a raided business until the warm-up ends (sim/businesses.js)
        if (d?.gate && !modeRules(state).island) { const clan = state.clans?.[e.owner]; if (clan) clan.notice = { tick: state.tick, text: 'The gate to the island opens in a campaign' }; }
        // out to the island only with a founding permit, or once you have a town (Tim 2026-11-10)
        else if (d?.gate && d.place === 'world' && landOffice && !landOffice.mayLeave(e.owner)) { const clan = state.clans?.[e.owner]; if (clan) clan.notice = { tick: state.tick, text: 'The island gate opens once you hold a founding permit (telegraph office)' }; }
        // nor with a Rally up (Tim 2026-11-10): rallied crew would follow him out and leave the city short
        else if (d?.gate && d.place === 'world' && e.type === 'hero' && rally.status(e.owner)?.active) { const clan = state.clans?.[e.owner]; if (clan) clan.notice = { tick: state.tick, text: 'A Rally is up: the gate opens once your crew are back at their posts' }; }
        else if (d?.to && deployment.canActAt(e, d.to.x, d.to.z, d.place) && (!businesses || businesses.mayEnter(e, d.place))) {   // menu doors (the clinic) have no room
          const from = e.place;
          e.x = d.to.x; e.z = d.to.z; e.place = d.place;
          delete paths[e.id];
          // a lieutenant's raider heads for the back room at once: his street order would walk him straight back out
          const held = c.job === 'raid' && Object.values(state.attacks || {}).find(a => a.room === d.place && a.clan === e.owner && a.hold);
          if (held) e.order = { kind: 'move', x: held.hold.x, z: held.hold.z, place: d.place, job: 'raid' };
          if (e.type === 'hero') (d.gate ? gateCrew : bringCrew)(e, from, d, c.units);
        }
      }
      if (c.type === 'interiorDoor' && !stunned(e, state.tick)) toggleInteriorDoor(e);
      if (c.type === 'world') discovery.command(e, c);   // island map pins (sim/discovery.js)
      // Dev-only instant travel (Tim 2026-11-02, for testing the island): campaign, dev build, hero on the
      // street or the island; the hero's group comes along like through the gate.
      if (c.type === 'travel' && areas && options.frontier?.dev && modeRules(state).island && e.type === 'hero' && !e.dead && !e.downed
        && (e.place === 'street' || e.place === 'world') && (c.city ? gate : Number.isFinite(c.x) && Number.isFinite(c.z))) {
        const from = e.place, old = { x: e.x, z: e.z };
        if (c.city) {   // back into the city, just inside the gate (the capital on the World map)
          Object.assign(e, { x: gate.inside[0], z: gate.inside[1], place: 'street', anim: 'idle' }); delete paths[e.id]; delete intents[e.id];
          gateCrew(e, from, { x: old.x, z: old.z, to: { x: e.x, z: e.z }, place: 'street' }, c.units);
          continue;
        }
        Object.assign(e, { x: c.x, z: c.z, place: 'world', anim: 'idle' });
        areas.update(Object.values(state.entities));
        const spot = areas.nav.nearestFree(c.x, c.z);
        if (!spot) { Object.assign(e, old, { place: from }); const clan = state.clans?.[e.owner]; if (clan) clan.notice = { tick: state.tick, text: 'No dry land there to travel to' }; }
        else { [e.x, e.z] = spot; delete paths[e.id]; delete intents[e.id]; gateCrew(e, from, { x: old.x, z: old.z, to: { x: e.x, z: e.z }, place: 'world' }, c.units); }
      }
      if (c.type === 'hire' && clans) { if (c.action === 'cancel') clans.cancelHire(e, c.index); else clans.hire(e, c.business, c.unit,c.count ?? 1); }
      if (c.type === 'landOffice' && landOffice && !stunned(e, state.tick) && c.action === 'permit') landOffice.buyPermit(e);
      if (c.type === 'landOffice' && landOffice && !stunned(e, state.tick) && c.action === 'survey') landOffice.survey(e);
      if (c.type === 'expedition' && landOffice && areas && gate && !stunned(e, state.tick)) expedition(e, c);
      if (c.type === 'inventory') inventory.command(e, c);
      if (c.type === 'omnibus') omnibus?.command(e, c);
      if (c.type === 'mount') mounts?.command(e, c);
      if (c.type === 'garage') garage?.command(e, c);
      if (c.type === 'rickshaw') stationTravel?.command(e, c);
      if (c.type === 'frontier' && c.action === 'salute') { const st = state.frontier?.settlements?.[c.settlement]; if (st?.owner === e.owner) cannons.salute(st, true); continue; }
      if (c.type === 'frontier' && frontier) {   // towns keep running while the hero is down
        // founding from the omnibus: everyone steps out first; a new town takes the clan's omnibuses (Tim 2026-11-06)
        const founding = c.action === 'found' && omnibus, before = founding ? townCount(e.owner) : 0;
        if (founding && e.aboard) omnibus.deploy(e);
        frontier.command(e, c);
        if (founding && townCount(e.owner) > before) omnibus.consume(e.owner);
      }
      if (c.type === 'item') {if(c.action==='claim')itemServices.claim(e);else itemServices.command(e,c);}
      if (c.type === 'dismiss' && clans) clans.dismiss(e, c.unit, c.business, c.patient, c.prisoner);
      if (c.type === 'business' && businesses) businesses.command(e, c);
      if (c.type === 'order') { omnibus?.orderVehicles(e, c); giveOrder(e, c); }
      if (c.type === 'deployment') { if(shakedown.command(e,c)||sweep.command(e,c))continue; deployment.command(e, c); assignments.command(e, c); rally.command(e, c); shinobiAssignments.command(e, c); diversion.command(e, c); }
      if (c.type === 'ability') useAbility(e, c);
      if (c.type === 'unstuck') unstuck.command(e);   // a stuck hero back to his hideout (sim/unstuck.js)
      if (c.type === 'snuff') stealth.snuff(e, c.prop);   // a Shinobi boss puts out a lantern (sim/stealth.js)
      if((c.type==='execute'||c.type==='loot')&&c.crewJob&&e.type==='hero'){
        const t=state.entities[c.target],reach=c.type==='loot'?LOOT_REACH:1.3;
        if(c.preferHeroInRange&&!c.crewOnly&&!e.execute&&!Object.values(state.entities).some(u=>u.id!==e.id&&(u.execute?.target===c.target||u.crewJob?.target===c.target||u.lootTarget===c.target))&&t&&e.place===t.place&&Math.hypot(e.x-t.x,e.z-t.z)<=reach){
          if(c.type==='loot')startLoot(e,{...c,units:[]});else startExecute(e,{...c,units:[]});
          if(e.execute||e.lootTarget)continue;
        }
        crewJobs.command(e,c);continue;
      }
      if (c.type === 'execute' && e.type === 'hero') startExecute(e, c);
      if (c.type === 'loot') startLoot(e, c);
      if (c.type === 'attack' && e.type === 'hero' && !e.dead && fair(e, state.entities[c.target]) && sees(e, state.entities[c.target])) {
        if (c.assist && Array.isArray(c.units)) for (const id of c.units) {
          const u = state.entities[id], t = state.entities[c.target];
          if (u?.owner === e.owner && u.type !== 'hero' && !u.guard && !u.crewJob && deployment.canActAt(u, t.x, t.z, t.place)) manualCrew(u);
        }
        allowCharmAttack(e,state.entities[c.target],state);
        if (e.execute) { giveOrder(e, { ...c, type: 'order', kind: 'attack' }); continue; }
        if (e.swing?.target !== c.target) delete e.swing;
        setAssistCrew(e, c.assist ? c.units : []);
        for (const id of e.assistCrew || []) { const u = state.entities[id]; delete u.smokePassive; delete u.holdFire; allowCharmAttack(u,state.entities[c.target],state); }
        e.attackTarget = c.target; delete e.holdFire;
      }
      // left-click elsewhere (Tim 2026-10-18): the hero drops his locked target and stops swinging at it
      if ((c.type === 'stopattack' || c.type === 'cancel') && e.type === 'hero') {
        if (Array.isArray(c.units)) setAssistCrew(e, c.units);
        if (e.swing?.target === e.attackTarget) delete e.swing;
        delete e.attackTarget; delete e.assistCrew; delete e.charmAttack;
        if (c.type === 'cancel') { for(const id of c.units||[]){const u=state.entities[id];if(u?.owner===e.owner)crewJobs.cancel(u);}delete e.execute; delete e.swing; delete e.lootTarget; delete paths[e.id]; kuroda.cancel(e); }
      }
      if (c.type === 'clinic' && clans) {
        const access = serviceAt(e.id, 'clinic');
        if (access) clans.clinicMenu(access.actor, c, access.door, spawnOutside);
      }
      if (c.type === 'police' && police) {
        const access = serviceAt(e.id, c.action === 'bribe' ? 'police_box' : 'police_hq');
        if (access) police.menu(access.actor, c, access.door);
      }
      if (c.type === 'contract' && contracts) {
        const access = serviceAt(e.id, 'contracts');
        contracts.command(access?.actor || e, c, access?.door || doorNear(e.id));
      }
    }
    for (const [owner, before] of ltNotice) {
      const clan = state.clans[owner];
      if (ownCommand.has(owner) || clan.notice === before || clan.notice?.tick !== state.tick) continue;
      if (before) clan.notice = before; else delete clan.notice;
    }
    kuroda.tick();
    unstuck.tick();
    clans?.tick(DT, spawnOutside);
    islandRespawn?.tick(DT, units?.types);
    townGovernors();
    cannons.tick();
    landSurveyor();
    lieutenant?.tick();   // C2: the city captain takes charge / stands down
    influence.tick();   // C4: campaign Influence, after this tick's dawn (no-op in Classic)
    syncCrewAttacks();
    shakedown.tick();
    sweep.tick();
    assignments.tick();
    sectorRecovery.tick();
    deployment.warmNavs?.();   // patrol maps built ahead, a couple per tick (lag fix 3)
    for (const f of Object.values(fight)) f.cd = Math.max(0, f.cd - DT);
    for (const e of Object.values(state.entities)) {
      const unit = statsOf(e);
      if (e.type === 'civilian' || e.wild || e.cop) continue;   // townsfolk, bandits and police move in their own ticks below
      if (e.type !== 'hero') { crewStep(e, unit); continue; }
      if (e.dead || e.downed || e.jailed) continue;      // knocked down by the police, or in jail (sim/police.js)
      if (stunned(e, state.tick)) { e.anim = 'idle'; continue; }
      if (e.taunted && taunt.step(e,unit)) continue;
      if (contracts?.scrubStep(e)) continue;
      if (kuroda.stepActor(e, intents[e.id])) continue;
      if (e.dash) { dashStep(e, unit); continue; }
      const c = intents[e.id];
      let dx = 0, dz = 0;
      if (c) {
        dx = SCREEN_RIGHT.x * c.right + SCREEN_DOWN.x * c.down;
        dz = SCREEN_RIGHT.z * c.right + SCREEN_DOWN.z * c.down;
      }
      const len = Math.hypot(dx, dz);
      if (len < 0.1) {
        // knocking down a War Lantern (sim/businesses.js): busy, no auto attack (it only drew hits back)
        if (Object.values(state.attacks || {}).some(a => a.knock?.by === e.id)) { e.anim = 'idle'; continue; }
        // right-click on your stockade (Tim 2026-11-10): the hero walks over; frontier/garrison.js admits him on arrival
        if (e.type === 'hero' && e.order?.garrisonGo && !e.order.arrived) { delete e.swing; delete e.execute; if (moveTo(e, unit, e.order.x, e.order.z, false)) continue; e.order.arrived = true; }
        if (e.lootTarget) { if (lootStep(e, unit, e.lootTarget)) continue; delete e.lootTarget; delete paths[e.id]; }
        if (e.execute && executeStep(e, unit)) continue;
        if (swingStep(e, unit)) continue;
        // a locked target (Ctrl + right-click): no chasing (Tim 2026-10-17), the hero hits it
        // whenever it is in reach and the player keeps him there with WASD; the lock drops when
        // the target is down or gone, or more than LOCK_RANGE away
        const target = state.entities[e.attackTarget];
        if (!fair(e, target) || !sees(e, target) || Math.hypot(target.x - e.x, target.z - e.z) > LOCK_RANGE) delete e.attackTarget;
        else if (Math.hypot(target.x - e.x, target.z - e.z) <= reachOf(e, target)) { engage(e, unit, target, false); continue; }
        // otherwise standing still: swing back at whoever hit him lately, if in reach (Tim 2026-10-19:
        // no picking fights with any enemy who happens to stand close; that takes a target)
        const by = e.hitBy && state.tick - e.hitBy.tick < secs(RETALIATE_SECONDS) && state.entities[e.hitBy.id];
        const t = !e.holdFire && unit.damage && by && hostile(e, by) && (!cop(by) || by.wave) && Math.hypot(by.x - e.x, by.z - e.z) <= reachOf(e, by) + 0.6 ? by : null;
        if (t) engage(e, unit, t, false); else e.anim = 'idle';
        continue;
      }
      // moving with WASD cancels a swing and an execute, but keeps the locked target
      delete e.swing;
      delete e.execute;
      delete e.lootTarget;
      if (e.order?.garrisonGo) delete e.order;   // WASD takes back control from the walk to the stockade
      e.anim = c.walk ? 'walk' : 'run';
      if (e.ride) {   // driving or riding: cart-like steering (sim/vehicle_steer.js), the vehicle turns, slows in sharp turns
        const kind = e.ride.kind === 'horse' ? 'mount' : state.entities[e.aboard]?.type || 'omnibus';
        // a horse, rickshaw or omnibus trots at rules.<kind>.trot x run speed; the sprint toggle (Shift or the Sprint
        // button, src/input.js) gallops at full ride speed (Tim 2026-11-07: a toggle, not held, so Shift+right-click works)
        const gallop = !!c.sprint, trot = !gallop ? (units?.rules?.[kind]?.trot ?? 1) / (e.ride.speed || 1) : 1;
        e.gallop = !!gallop;
        const s = steer(e, Math.atan2(dx, dz), { turnDegrees: units?.rules?.[kind]?.turnDegrees ?? 120 }, DT), d = stats.movement(e, 'run') * DT * s.slow * Math.min(1, trot);
        tryMove(e, unit.radius, s.hx * d, 0);
        tryMove(e, unit.radius, 0, s.hz * d);
        continue;
      }
      e.dir = dirIndex(dx, dz);
      const d = stats.movement(e, e.anim) * DT / len;
      tryMove(e, unit.radius, dx * d, 0);
      tryMove(e, unit.radius, 0, dz * d);
    }
    civilians.tick();
    shakedown.civilianStep();
    bandits.tick();
    worldCamps.tick();
    hqCamping?.tick();
    police?.tick();
    businesses?.tick();
    hqRaids?.tick();
    // a won Shinobi HQ raid: a few seconds after the reward the raiders are put out of the front door (Tim 2026-10-26)
    for (const r of Object.values(state.hqRaids || {})) if (r.ejectAt === state.tick) {
      const b = state.businesses[r.business], room = rooms.find(m => m.name === b?.room);
      const d = room && doors.find(d => d.place === 'street' && d.to && d.x === room.exit.x && d.z === room.exit.z);
      if (!d) continue;
      let out = false;
      for (const u of Object.values(state.entities)) {
        if (u.owner !== r.raider || u.place !== b.room || u.dead) continue;
        const [x, z] = nav.nearestFree(d.to.x, d.to.z) || [d.to.x, d.to.z];
        Object.assign(u, { x, z, place: 'street', anim: 'idle' });
        delete paths[u.id]; delete u.swing; delete u.attackTarget;
        if (fight[u.id]) delete fight[u.id].target;
        if (u.type !== 'hero' && u.order?.place && u.order.place !== 'street') u.order = { kind: 'move', x, z, place: 'street', arrived: true };
        out = true;
      }
      if (out) state.news.push({ kind: 'crewOut', clan: r.raider, building: Number(Object.keys(roomOf).find(k => roomOf[k] === b.room)) });
    }
    territory.tick();
    if (state.smokes) {
      for (const s of state.smokes) if (s.until <= state.tick && s.fadeSeconds) {
        for (const u of Object.values(state.entities)) {
          if (u.owner !== s.clan || u.guard || !stealth.canHide(u) || !inSmoke(s, u)) continue;
          addBuff(u, 'veil', s.fadeSeconds);
          // Vanish starts a new passive window, even if an old attack was
          // explicitly ordered during the smoke. Preserve hero execute channels.
          u.holdFire = true;
          delete u.swing; delete u.attackTarget;
          if (fight[u.id]) delete fight[u.id].target;
          if (u.type === 'hero') { delete u.assistCrew; continue; }
          u.smokePassive = true; u.holdFire = true;
          delete u.swing; delete u.execute; delete u.attackTarget; delete u.patrol; delete paths[u.id];
          if (fight[u.id]) delete fight[u.id].target;
          if (u.indoorDuty) u.indoorDuty.resume = false;
          u.order = { kind: 'move', x: u.x, z: u.z, arrived: true };
          const leader = Object.values(state.entities).find(e => e.owner === s.clan && e.type === 'hero');
          if (leader?.assistCrew) leader.assistCrew = leader.assistCrew.filter(id => id !== u.id);
        }
      }
      state.smokes = state.smokes.filter(s => s.until > state.tick);
      if (!state.smokes.length) delete state.smokes;
    }
    // inside their own Smoke Bomb the clan's units heal s.heal of their health a second (Tim 2026-10-20; buff 'shroud' for the look)
    if (state.smokes && state.tick % secs(1) === 0) for (const s of state.smokes) for (const u of Object.values(state.entities))
      if (u.owner === s.clan && s.heal && !u.dead && !u.downed && u.maxHp && inSmoke(s, u)
        && rally.buffEligible(state.entities[s.hero] || Object.values(state.entities).find(e => e.owner === s.clan && e.type === 'hero'), u)) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * s.heal); addBuff(u, 'shroud', 1.1); }
    stealth.tick();
    contracts?.tick();
    if (state.tick % secs(1) === 0) rewards.sectorTick(deployment?.sectorAt);
    shinobiIntelligence.tick();
    shinobiAssignments.tick();
    diversion.tick();
    taunt.tick();
    combat.projectileTick();
    // Losing sight drops the lock, queued swing and crew assignment immediately,
    // including while a hero is moving. Revealing the target does not reacquire it.
    for (const e of Object.values(state.entities)) {
      const unseen = id => id && !sees(e, state.entities[id]);
      if (unseen(e.attackTarget)) { delete e.attackTarget; delete e.assistCrew; }
      if (unseen(e.swing?.target)) delete e.swing;
      if (e.order?.kind === 'attack') {
        const target = state.entities[e.order.target];
        if (!target || target.dead || target.downed || target.jailed) {
          endAttack(e); delete paths[e.id];
        }
      }
      if (unseen(e.execute?.target)) delete e.execute;
      if (unseen(fight[e.id]?.target)) delete fight[e.id].target;
    }
    itemServices.tick();
    separate();
    cleanUpDead();
    carryOffDowned();
    coolHeat();
    rally.cleanBuffs();
    healBuffs();
    expireBuffs();
    regen();
    deployment.sync();
    vision.tick();
    discovery.tick();
    frontier?.tick();
    for (const v of frontier?.stable?.bornVehicles?.() || []) {   // built at a station: parked there, empty (Tim 2026-11-06)
      omnibus?.park(v.owner, v.kind, v.x, v.z);
      const clan = state.clans?.[v.owner], town = state.frontier.settlements?.[v.town];
      if (clan && v.town !== 'capital') clan.notice = { tick: state.tick, text: `${town?.name || 'Your town'}: a new ${v.kind} is parked at the station` };   // capital stable: its own notice
    }
    omnibus?.tick();
    mounts?.tick(DT);
    garage?.tick(DT);
    // quest log milestones (campaign only); at the end of the tick so loot, raids and buys made by units this tick count (Tim 2026-11-06)
    goals.record(state.news, state.casts, state.ryoLosses);
    state.tick++;
  }

  // tryMove only looks at the walls near a unit (the wider map has many trees): blockers are
  // bucketed on a coarse grid once; very big ones (the map edges) are always checked
  const BUCKET = 8, buckets = new Map(), bigBlockers = [];
  for (const b of blockers) {
    const i0 = Math.floor(b.minX / BUCKET), i1 = Math.floor(b.maxX / BUCKET), j0 = Math.floor(b.minZ / BUCKET), j1 = Math.floor(b.maxZ / BUCKET);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 64) { bigBlockers.push(b); continue; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = `${i},${j}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(b); }
  }
  function blockersNear(x0, z0, x1, z1) {
    const out = [...bigBlockers];
    for (let i = Math.floor(x0 / BUCKET); i <= Math.floor(x1 / BUCKET); i++)
      for (let j = Math.floor(z0 / BUCKET); j <= Math.floor(z1 / BUCKET); j++) { const l = buckets.get(`${i},${j}`); if (l) out.push(...l); }
    for (const door of interiorDoors) if (!state.interiorDoors[door.id] && door.blocker.minX < x1 && door.blocker.maxX > x0
      && door.blocker.minZ < z1 && door.blocker.maxZ > z0) out.push(door.blocker);
    return out;
  }

  // Move along one axis, stopping flush against the first thing in the way
  function tryMove(e, r, dx, dz) {
    if (stunned(e, state.tick)) return;
    r *= roomBodyScales[e.place] || 1;
    if(e.place==='world'&&areas){const [x,z]=slideWorld(e.x,e.z,r,dx,dz,areas.blockersNear,options.worldChunks?.islandArt?.cornerSlip??.6);if(deployment.canOccupy(e,x,z)){e.x=x;e.z=z;}return;}
    let x = e.x + dx, z = e.z + dz;
    const near = e.place === 'world' && areas ? areas.blockersNear : blockersNear;
    for (const b of near(Math.min(e.x, x) - r, Math.min(e.z, z) - r, Math.max(e.x, x) + r, Math.max(e.z, z) + r)) {
      if (!(x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ)) continue;
      if (dx > 0) x = Math.min(x, b.minX - r - 1e-4);
      else if (dx < 0) x = Math.max(x, b.maxX + r + 1e-4);
      else if (dz > 0) z = Math.min(z, b.minZ - r - 1e-4);
      else z = Math.max(z, b.maxZ + r + 1e-4);
    }
    // never step backwards (when already overlapping something)
    if ((dx ? Math.sign(x - e.x) === Math.sign(dx) : Math.sign(z - e.z) === Math.sign(dz)) && deployment.canOccupy(e, x, z)) { e.x = x; e.z = z; }
  }

  const heroAbilities = createHeroAbilities({ addBuff, civ, cop, damageScale, endAttack, fair, fight, hit, hostile, inSmoke, kuroda, navOf, paths, rally, reachOf, secs, sees, state, statsOf, stealth, tryMove, wild });
  const lootExecute = createLootExecute({ items:itemServices, AGGRO, LOOT_REACH, addHeat, anchorOf, civ, cop, deployment, downedFoe, fight, freeSlot, heatFor, hostile, lootable, manualCrew, moveTo, paths, police, removeUnit, resumable, rewards, rng, secs, sees, state, units });
  const crewOrders = createCrewOrders({ roomOf, clans, contracts, crewJobs, deployment, doors, endAttack, fair, fight, manualCrew, nav, navOf, paths, rally, resumable, rooms, rules: units?.rules, sees, state, stats, tryMove });
  const crewSteps = createCrewStep({ assignments, blockOffset, botExecute, businesses, clans, contracts, crewGoal, crewJobs, crewOut, crewTarget, deployment, diversion, doors, endAttack, engage, executeStep, fight, intents, leader, lootStep, moveTo, navOf, paths, rally, rifleman, rooms, sectorCleanup, sectorRecovery, sees, shakedown, shinobiAssignments, state, sweep, swingStep, taunt });
  const combat = createCombat({ decide, shelter: (t, d) => omnibus?.shelter(t, d) || (frontier?.garrison?.shelter(t, d) ?? false), onDefeat:(a,t)=>{itemServices.defeat(a,t);worldCamps.defeated(a,t);}, clearShot:(a,b)=>navOf(a.place)?.clearLine(a.x,a.z,b.x,b.z)??true, options, BACKUP_RANGE, LOCK_RANGE, RETALIATE_SECONDS, AGGRO, LEASH, atHome, attackAllowed, bandits, civ, clans, contracts, cop, diversion, fair, fight, freeSlot, heatFor, hostile, intents, kuroda, leader, moveTo, nav, paths, police, reachOf, rewards, rifleman, secs, sees, state, stats, stealth, territory, units, wild });
  if(district.buildings.some(b=>b.art==='blacksmith'))itemServices.initialize();
  // --- Save and load (sim/save.js, frontier F1; audit in to_delete/_chk/save_audit.md) ---
  // Closure state that lives outside game.state. Values are copied by the save encoder.
  const savedModules = () => ({ combat, bandits, civilians, police, contracts, territory, vision, stealth, hqCamping });
  function saveState() {
    const modules = {};
    for (const [k, m] of Object.entries(savedModules())) if (m?.saveState) modules[k] = m.saveState();
    return { nextId, intents, fight, paths, largeFights: largeFightsMemory(state), modules };
  }
  function loadState(d) {
    if (!d) return;
    nextId = d.nextId;
    for (const [o, v] of [[intents, d.intents], [fight, d.fight], [paths, d.paths]]) { for (const k of Object.keys(o)) delete o[k]; Object.assign(o, v); }
    restoreLargeFights(state, d.largeFights);
    for (const [k, m] of Object.entries(savedModules())) m?.loadState?.(d.modules?.[k]);
    for (const r of rooms) if (interiorDoors.some(x => x.place === r.name && !state.interiorDoors[x.id])) rebuildRoomNav(r.name);
    inventory.relink();
  }
  return { cityAway: () => cityAway, thinksNow, decide, state, step, spawn, attackAllowed, scenery, saveState, loadState, settings: { units, civilians: civData, bandits: banditData, police: policeData, dayNight }, blockers, rooms, doors, interiorDoors, interiorDoorNear, doorNear, serviceAt, clans, nav, civilians, bandits, worldCamps, police, businesses, contracts, vision, discovery, territory, leader, stealth, unstuck, hqCamping, areas, gate, deployment, assignments, rally, shinobiAssignments, shinobiIntelligence, sectorRecovery, diversion, shakedown, sweep, stats, inventory, itemServices, frontier, landOffice, influence, goals, lieutenant, islandRespawn, omnibus, mounts, garage, stationTravel, governorNear, dayTicks };
}
