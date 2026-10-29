// The game rules. Holds the state and advances it one fixed tick at a time from
// commands. No three.js and no DOM: in multiplayer a Colyseus server runs this
// same code, and browsers only send commands and draw the state they get back.
import { placeScenery, placePiece, dirIndex, SCREEN_RIGHT, SCREEN_DOWN, shapeBlockers } from './geometry.js';
import { buildRoom3d, INTERIOR_ORIGIN } from './interiors.js';
import { generateRoom } from './generate.js';
import { createClans } from './clans.js';
import { createNav, ROOM_NAV } from './nav.js';
import { createCivilians } from './civilians.js';
import { createBandits, WILD } from './bandits.js';
import { createRewards } from './rewards.js';
import { createVision } from './vision.js';
import { createTerritory } from './territory.js';
import { createStealth } from './stealth.js';
import { createPolice, POLICE } from './police.js';
import { applySettings } from './settings.js';
import { createBusinesses } from './businesses.js';
import { createContracts } from './contracts.js';
import { interactionActor } from './interactions.js';
import { createHQCamping } from './hq_camping.js';
import { createKuroda, KURODA_KINDS, stunned } from './kuroda.js';
import { createHQRaidEffects } from './hq_raids.js';
import { createDeployment } from './deployment.js';
import { createAssignments } from './assignments.js';
import { createDeploymentRally } from './deployment_rally.js';
import { createShinobiAssignments } from './shinobi_assignments.js';
import { createDiversion } from './diversion.js';
import { createRifleman } from './rifleman.js';
import { createTaunt } from './taunt.js';
import { createSectorRecovery } from './sector_recovery.js';
import { createShinobiIntelligence } from './shinobi_intelligence.js';
import { clearSight } from './perception.js';
import { distractionStep } from './distraction.js';
import { createStats } from './stats.js';
import { reachableEntry } from './rear_entry.js';
import { createSectorCleanup } from './sector_cleanup.js';
import { createCrewJobs } from './crew_jobs.js';
export { DEFAULT_MOVEMENT as UNITS } from './stats.js';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

// Unit types: size and speeds in world units per second (the ronin is 2 tall)

const DOOR_RADIUS = 1.5;
const title = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function createGame(options) {
  const { district, catalog, cutouts, interiors = {}, parts = null, recipes = {} } = options;
  // options.settings (data/settings.json) is laid over the detail files; without it they are used as they are
  const S = options.settings ? applySettings(options, options.settings) : { ...options, dayNight: null };
  const { units = null, civilians: civData = null, bandits: banditData = null, police: policeData = null, dayNight } = S;
  const scenery = placeScenery(district, catalog, cutouts);

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
    hits: [], dodges: [], casts: [], heatGains: [], ryoGains: [], policeNews: [], news: [] };
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
    onAddClan: clan => deployment.addClan(clan) }) : null;
  const rewards = createRewards(state, units?.rules);
  // territory: the street around each owned business, quarters and the season score (sim/territory.js)
  const scoreOf = Object.fromEntries(Object.entries(units?.rules?.businesses || {}).map(([k, v]) => [k, v.score || 0]));
  const territory = createTerritory({ state, bounds: district.bounds, rules: units?.rules?.territory, season: units?.rules?.season, scores: scoreOf, quarters: district.quarters || [] });
  const vision = createVision(state, district.bounds, units?.rules?.vision, territory);
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
  const navOf = place => place === 'street' ? nav : roomNavs[place];
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
    const r = rooms.find(r => r.name === door.place);
    const closed = interiorDoors.filter(d => d.place === door.place && !state.interiorDoors[d.id]).map(d => d.blocker);
    roomNavs[door.place] = createNav([...r.blockers, ...closed],
      { minX: r.origin.x, minZ: r.origin.z, maxX: r.origin.x + r.size[0], maxZ: r.origin.z + r.size[1] }, navSettings(r));
    for (const u of Object.values(state.entities)) if (u.place === door.place) delete paths[u.id];
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
    clearCombat: e => { delete e.swing; delete e.execute; delete e.patrol; delete e.indoorDuty; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target;
      for (const h of Object.values(state.entities)) if (h.assistCrew) h.assistCrew = h.assistCrew.filter(id => id !== e.id); } });
  const rally = createDeploymentRally({ state, deployment });
  const shinobiIntelligence = createShinobiIntelligence({ state, deployment, vision });
  const sectorRecovery = createSectorRecovery({ state, deployment, rally, vision,
    hostile: (a, b) => hostile(a, b),
    inCombat: e => !!fight[e.id]?.target,
    clearCombat: e => { delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; },
    attackStep: (e, unit, t) => { if (!swingStep(e, unit)) engage(e, unit, t); } });
  const shinobiAssignments = createShinobiAssignments({ state, deployment, assignments, rally, vision, intelligence: shinobiIntelligence, recovery: sectorRecovery, sees: (a, b) => sees(a, b),
    clearCombat: e => { delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; },
    attackStep: (e, unit, t) => { if (!swingStep(e, unit)) engage(e, unit, t); }, executeStep,
    finishTarget: (clan, target, ids) => { const h = Object.values(state.entities).find(e => e.owner === clan && e.type === 'hero'); if (h) startExecute(h, { target, units: ids, crewOnly: true }, true); } });
  const diversion = createDiversion({ state, deployment, vision, reveal: (e, attack) => stealth.reveal(e, attack),
    hostile: (a, b) => hostile(a, b) && sees(a, b), attackStep: (e, unit, t) => { if (!swingStep(e, unit)) engage(e, unit, t); },
    moveTo: (e, unit, x, z, walk) => moveTo(e, unit, x, z, walk), nearestFree: (x, z, e) => (e && (deployment.navFor(e) || navOf(e.place)) || nav).nearestFree(x, z), fightTarget: id => fight[id]?.target,
    clearLine: (a, b) => navOf(a.place)?.clearLine(a.x, a.z, b.x, b.z) ?? true,
    inCombat: e => !!fight[e.id]?.target, clearCombat: e => { delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; } });
  const rifleman = createRifleman({ state, vision, hit: (a, t, d, crit, kind) => hit(a, t, d, crit, kind), addHeat: (owner, n, reason) => addHeat(owner, n, reason),
    stun: (t, ticks) => { delete t.swing; addBuff(t, 'stunned', ticks / TICK_RATE); }, clearLine: (a, b) => navOf(a.place)?.clearLine(a.x, a.z, b.x, b.z) ?? true,
    hostile: (a, b) => hostile(a, b) && sees(a, b), attackStep: (e, unit, t) => { if (!swingStep(e, unit)) engage(e, unit, t); },
    moveTo: (e, unit, x, z, walk) => moveTo(e, unit, x, z, walk), nearestFree: (x, z, e) => (e && (deployment.navFor(e) || navOf(e.place)) || nav).nearestFree(x, z), canOccupy: (e, x, z, p) => deployment.canOccupy(e, x, z, p),
    fightTarget: id => fight[id]?.target, inCombat: e => !!fight[e.id]?.target, rules: units?.types?.kuroda_rifleman?.rifle, inRally: e => rally.participating(e),
    clearCombat: e => { delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; } });
  const taunt = createTaunt({ state, vision, hostile: (a, b) => hostile(a, b) && sees(a, b), addBuff: (e, name, seconds, extra) => addBuff(e, name, seconds, extra),
    attackStep: (e, unit, t) => { if (!swingStep(e, unit)) engage(e, unit, t); }, fightTarget: id => fight[id]?.target, rules: units?.types?.yakuza_enforcer?.taunt,
    clearCombat: e => { delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id]; if (fight[e.id]) delete fight[e.id].target; } });
  function manualCrew(e) { crewJobs?.cancel(e);sectorCleanup.cancel(e);contracts?.interruptScrub(e); diversion.manual(e); rifleman.manual(e); shinobiAssignments.manual(e); assignments.manual(e); }
  let nextId = 1;

  function spawn(type, model, x, z, extra = {}) {
    const id = String(nextId++);
    state.entities[id] = { id, type, model, x, z, dir: 0, anim: 'idle', place: 'street', ...extra };
    const e = state.entities[id], hp = statsOf(e).hp;
    if (hp && e.hp === undefined) e.hp = hp;
    if (e.hp !== undefined) e.maxHp ??= e.hp;
    if (stealth.canHide(e)) e.hidden = true;   // Shinobi units start hidden (sim/stealth.js)
    const o = e.order;
    if (o?.kind === 'follow' && o.slot === undefined) o.slot = freeSlot(o.target, id);
    deployment.onSpawn(e);
    return id;
  }

  // --- Crew orders ---------------------------------------------------------------
  // Places around a hero for followers: rings of 6, 12 and 18 (enough for 36 crew)
  function followOffset(k) {
    for (const [r, n] of [[1.5, 6], [2.7, 12], [3.9, 18]]) {
      if (k < n) { const a = k / n * 2 * Math.PI + (r > 2 ? Math.PI / n : 0); return [Math.cos(a) * r, Math.sin(a) * r]; }
      k -= n;
    }
    return [0, 0];
  }
  // The lowest ring place nobody following this hero uses yet
  function freeSlot(heroId, self) {
    const used = new Set(Object.values(state.entities)
      .filter(u => u.id !== self && u.order?.kind === 'follow' && u.order.target === heroId).map(u => u.order.slot));
    let k = 0;
    while (used.has(k)) k++;
    return k;
  }
  // A square block of places around a clicked point, one per unit
  function blockOffset(k, n) {
    const side = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / side), sp = 1.1;
    return [(k % side - (side - 1) / 2) * sp, (Math.floor(k / side) - (rows - 1) / 2) * sp];
  }

  // order command from a hero for some of its own crew in the same place (street or room):
  // follow (the hero), move (go there and wait) or station (go there and hold it; defends later)
  function giveOrder(hero, c) {
    if (hero.type !== 'hero' || !Array.isArray(c.units) || !['follow', 'move', 'station', 'attack', 'attackmove', 'heal', 'stop', 'enter', 'resume'].includes(c.kind)) return;
    // enter (right-click your own business, checkpoint 5): walk to its door, go in and hold the room
    // or right-click the business of an active Shinobi infiltration job: use its back window
    const eb = c.kind === 'enter' && state.businesses[c.business];
    const door = eb && (eb.owner === hero.owner ? doors.find(d => d.to && d.place === eb.room)
      : contracts?.mayClimb(hero, eb.room) && doors.find(d => d.to && d.ninja && d.place === eb.room));
    if (c.kind === 'enter' && !door) return;
    if (c.kind === 'attack' && !(fair(hero, state.entities[c.target]) && sees(hero, state.entities[c.target]))
      && !(c.place === state.entities[c.target]?.place && c.units.some(id => {
        const u = state.entities[id]; return u && u.owner === hero.owner && fair(u, state.entities[c.target]) && sees(u, state.entities[c.target]);
      }))) return;
    if (!['follow', 'attack', 'heal', 'stop', 'enter', 'resume'].includes(c.kind) && !(Number.isFinite(c.x) && Number.isFinite(c.z))) return;
    const crew = c.units.map(id => state.entities[id])
      .filter(u => u && !u.dead && !u.downed && !u.jailed && u.owner === hero.owner && u.type !== 'hero' && !u.guard && (!c.broadcast || u.place === 'street')
        && (u.place === hero.place || (c.kind === 'follow' && u.place === 'street') || (hero.place === 'street' && ['move', 'stop', 'resume'].includes(c.kind))
          || (c.place === 'street' && (u.place === 'street' || (c.kind === 'move' && u.place !== 'street')))
          || (c.kind==='attack'&&c.place===u.place&&state.entities[c.target]?.place===u.place)
          || ((hero.dead || hero.downed || hero.jailed) && c.kind === 'attack' && state.entities[c.target]?.place === u.place))
        && !(u.place !== 'street' && ['heal', 'enter'].includes(c.kind))
        && (c.kind === 'follow' || !c.place || u.place === c.place || (c.place === 'street' && c.kind === 'move' && u.place !== 'street'))
        && deployment.allowsOrder(u, c, hero, door));
    if(state.deployment.restrictionsEnabled){
      const group=u=>rally.status(hero.owner).active&&(u.deployment.group==='hero'||rally.participating(u))?'rally':u.deployment.group;
      if(new Set(crew.map(group)).size>1)return;
    }
    const recalling = c.kind === 'move' || c.kind === 'follow';
    if (recalling && Array.isArray(hero.assistCrew)) hero.assistCrew = hero.assistCrew.filter(id => !crew.some(u => u.id === id));
    crew.forEach((u, k) => {
      if(crewJobs?.intercept(u,c))return;
      manualCrew(u);
      delete u.lootEscort;
      delete paths[u.id];
      delete u.patrol;
      if (u.indoorDuty) u.indoorDuty.resume = false;
      delete u.execute;
      const attacking = c.kind === 'attack' || c.kind === 'attackmove';
      if (!u.smokePassive || attacking) delete u.holdFire;
      if (attacking) delete u.smokePassive;
      if (fight[u.id]) delete fight[u.id].target;
      // stop (Z, Tim 2026-10-18): stand still and stay passive, no auto attack even when hit,
      // until the next order of any kind replaces this one
      // resume (a second T, Tim 2026-10-19): call off the T attack, back to the order before it
      if (c.kind === 'resume') { if (u.order?.kind === 'attack') { delete u.swing; endAttack(u, true); } return; }
      if (c.kind === 'stop') { delete u.swing; u.order = { kind: 'stop' }; u.anim = 'idle'; return; }
      if (recalling) delete u.swing;
      if (c.kind === 'follow') { u.order = { kind: 'follow', target: hero.id, regrouping: true, ...(hero.place !== 'street' ? { exitWithHero: true } : {}) }; u.order.slot = freeSlot(hero.id, u.id); return; }
      // resume (T, Tim 2026-10-19): when the attack ends they go back to what they were doing
      if (c.kind === 'attack') {
        if (u.swing?.target !== c.target) delete u.swing;
        const follow = c.followOnDefeat === true || c.assist || (Array.isArray(c.followOnDefeat) && c.followOnDefeat.includes(u.id));
        const t=state.entities[c.target];
        u.order = { kind: 'attack', target: c.target, lastSeen:{x:t.x,z:t.z,place:t.place}, ...(follow ? { followLeader: hero.id } : {}), ...(c.resume ? { prev: resumable(u) } : {}), ...(c.broadcast ? { broadcast: true } : {}) }; return;
      }
      if (c.kind === 'heal') {
        const b = clans?.clinicOf();
        if (!b || u.hp >= u.maxHp) return;
        const [x, z] = nav.nearestFree(...(b.door || [b.x, b.z])) || [b.x, b.z];
        u.order = { kind: 'heal', x, z };
        return;
      }
      if (c.kind === 'enter') {
        if (u.place !== 'street') return;
        const [x, z] = nav.nearestFree(door.x, door.z) || [door.x, door.z];
        u.order = { kind: 'enter', room: door.place, x, z, k, n: crew.length, ...(door.ninja ? { window: true } : {}) };
        return;
      }
      const [ox, oz] = blockOffset(k, crew.length);
      const place = c.place || hero.place;
      const grid = (place === 'street' ? deployment.navFor({ ...u, place }) : null) || navOf(place);
      const [x, z] = grid?.nearestFree(c.x + ox, c.z + oz) || [c.x, c.z];
      u.order = { kind: c.kind, x, z, place };
    });
  }

  // Crew inside a building whose order is out on the street (Tim 2026-10-19): walk to the room's
  // way out and step out of the front door, then carry on with the order. True while doing that
  function crewOut(e, unit) {
    if (e.place === 'street') return false;
    const o = e.order || {};
    if (o.kind !== 'move' || o.place !== 'street') return false;
    const room = rooms.find(r => r.name === e.place);
    const d = room && doors.find(d => d.place === 'street' && d.to && d.x === room.exit.x && d.z === room.exit.z);
    if (!d) return false;
    if (Math.hypot(d.x - e.x, d.z - e.z) > 0.6) { if (!moveTo(e, unit, d.x, d.z, false)) e.anim = 'idle'; return true; }
    const [x, z] = nav.nearestFree(d.to.x, d.to.z) || [d.to.x, d.to.z];
    state.news.push({ kind: 'crewOut', clan: e.owner, building: Number(Object.keys(roomOf).find(k => roomOf[k] === e.place)) });   // the screen flashes the building
    Object.assign(e, { x, z, place: 'street', anim: 'idle' });
    delete paths[e.id]; delete e.swing;
    if (fight[e.id]) delete fight[e.id].target;
    return true;
  }

  // Where a crew member wants to be right now, or null to stand still
  function crewGoal(e) {
    const o = e.order;
    if (!o || o.kind === 'stop') return null;
    // a ninja's pebble (Distract): house guards go and look where it fell
    const dz = e.distracted;
    if (dz && state.tick < dz.until) return { x: dz.x, z: dz.z, near: 0.8, walk: true };
    if (o.kind === 'follow') {
      const h = state.entities[o.target];
      if (!h || h.place !== e.place || h.dead) return null;   // hero indoors or knocked out: wait
      const [ox, oz] = followOffset(o.slot);
      return { x: h.x + ox, z: h.z + oz, near: Math.hypot(e.x - h.x, e.z - h.z) < 2.2 + o.slot * 0.08 ? 0.6 : 0.3, walk: h.anim === 'walk' };
    }
    if (o.kind === 'attack') return null;
    return { x: o.x, z: o.z, near: 0.25, walk: !!o.patrol, stroll: !!o.patrol };   // patrol (house guards): walk the whole way
  }

  // Walk one tick toward (gx, gz) along a street path; false when there is no way
  function moveTo(e, unit, gx, gz, walk) {
    if (stunned(e, state.tick)) { e.anim = 'idle'; return true; }
    const grid = deployment.navFor(e) || navOf(e.place);
    if (!grid) paths[e.id] = { pts: [[gx, gz]], gx, gz };   // a place with no walk grid: walk straight
    let p = paths[e.id];
    if (!p || Math.hypot(p.gx - gx, p.gz - gz) > 1.2 || !p.pts.length) {
      p = paths[e.id] = { pts: grid.findPath(e.x, e.z, gx, gz) || [], gx, gz };
      if (!p.pts.length) return false;
    }
    // the last leg goes straight at the live goal (keeps up with a moving hero or enemy)
    let [wx, wz] = p.pts.length === 1 ? [gx, gz] : p.pts[0];
    // a waypoint counts as reached when close and the next one is in clear view (else cutting
    // the corner snags a wide body on the furniture), or when right on it
    const near = Math.hypot(wx - e.x, wz - e.z);
    if (p.pts.length > 1 && (near < 0.05 || (near < 0.35 && grid?.clearLine(e.x, e.z, ...p.pts[1])))) { p.pts.shift(); [wx, wz] = p.pts.length === 1 ? [gx, gz] : p.pts[0]; }
    const dx = wx - e.x, dz = wz - e.z, len = Math.hypot(dx, dz);
    if (len < 1e-6) return true;
    e.anim = walk ? 'walk' : 'run';
    const want = dirIndex(dx, dz), turn = (want - e.dir + 8) % 8;
    const patrolling = walk && (e.perceptionPatrol || e.order?.patrol || e.distracted || (e.guard && e.order?.kind === 'station')) && !fight[e.id]?.target;
    if (patrolling && turn) {
      if (state.tick >= (e.patrolTurnAt ?? 0)) { e.dir = (e.dir + (turn <= 4 ? 1 : 7)) % 8; e.patrolTurnAt = state.tick + 2; }
      if (e.dir !== want) { e.anim = 'idle'; return true; }
    } else e.dir = want;
    // crew know their own streets: crewSpeed times as fast in their clan's territory (sim/territory.js)
    const d = Math.min(stats.movement(e, e.anim) * DT, len) / len;
    tryMove(e, unit.radius, dx * d, 0);
    tryMove(e, unit.radius, 0, dz * d);
    return true;
  }

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
  const hostile = (a, b) => b && a !== b && !b.dead && !b.downed && !b.jailed && a.owner && b.owner && a.owner !== b.owner && a.place === b.place
    && (!wild(a) || angryAt(a, b)) && (!wild(b) || angryAt(b, a)) && (!cop(a) || angryAt(a, b)) && (!cop(b) || angryAt(b, a)) && !blind(a, b)
    && deployment.canActAt(a, b.x, b.z, b.place);
  // Townsfolk belong to no clan: never picked as a fight on their own, but anyone in a clan
  // can be told to attack (and finish off) one. That is what makes heat.
  const civ = t => t?.type === 'civilian';
  // anyone in a clan can also go for an officer (that is +heat and makes the police angry)
  const fair = (a, b) => (hostile(a, b) || ((civ(b) || ((wild(b) || cop(b)) && !wild(a) && !cop(a))) && a !== b && !b.dead && !b.downed && !b.jailed && !!a.owner && a.place === b.place && !blind(a, b)))
    && deployment.canActAt(a, b.x, b.z, b.place);
  // Fog of war (sim/vision.js): a clan only fights what it can see. Units outside any clan
  // (night bandits) are not limited.
  // a hidden ninja (sim/stealth.js) is seen by nobody but its own side
  const sees = (a, b) => !(b?.hidden && b.owner !== a.owner) && !(b && blind(a, b)) && (!state.clans?.[a.owner] || vision.canSee(a.owner, b));
  const reachOf = (a, b) => (statsOf(a).attackRange || 1) + statsOf(b).radius;

  // Officers are never picked on their own: hitting police (+heat) is always the player's
  // (or bot's) own order, so standing still next to a squad doesn't spiral the heat.
  // Business attack-wave officers add no infamy per hit and remain automatic targets.
  function nearestEnemy(e, x, z, range) {
    let best = null, bd = range;
    for (const t of Object.values(state.entities)) {
      if (!hostile(e, t) || !sees(e, t) || (cop(t) && !cop(e) && !t.wave)) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // Where a crew member is tied to: its hero, its station, or where it is going
  function anchorOf(e) {
    const o = e.order || {};
    if (o.kind === 'follow') { const h = state.entities[o.target]; return h && !h.dead && h.place === e.place ? [h.x, h.z] : [e.x, e.z]; }
    if (o.kind === 'station' || o.kind === 'move' || o.kind === 'attackmove') return [o.x, o.z];
    return [e.x, e.z];
  }

  // the order a T attack goes back to afterwards: follow, hold / station / move spot, passive stop,
  // or one still on its way (attack-move, going into a business, off to the clinic)
  function resumable(u) {
    const o = u.order?.kind === 'attack' ? u.order.prev : u.order;
    return o && ['follow', 'move', 'station', 'stop', 'attackmove', 'enter', 'heal'].includes(o.kind) ? { ...o } : null;
  }
  // A finished attack holds at the last combat position. Calling an attack off
  // explicitly (a second T) still restores the previous order.
  function endAttack(u, cancelled = false) {
    const p = u.order?.prev;
    const resume = cancelled || !!state.clans?.[u.owner]?.bot;
    if (resume && p?.kind === 'follow') p.slot = freeSlot(p.target, u.id);
    if (!cancelled && u.order?.assist) {
      const h = state.entities[u.order.assist];
      if (h?.assistCrew) h.assistCrew = h.assistCrew.filter(id => id !== u.id);
    }
    u.order = resume && p ? p : { kind: 'move', x: u.x, z: u.z, arrived: true };
    delete paths[u.id];
  }

  // Right-click/Tab assistance follows the leader's changing target. Manual attack
  // orders (T or Ctrl-right-click) and deliberate duties stay independent.
  function setAssistCrew(hero, ids) {
    hero.assistCrew = [...new Set(Array.isArray(ids) ? ids : [])].filter(id => {
      const u = state.entities[id];
      return u && u.owner === hero.owner && u.type !== 'hero' && !u.guard && !u.dead && !u.downed && !u.jailed && u.place === hero.place;
    });
    // A new selection must leave the previous squad doing its existing attack.
    for (const u of Object.values(state.entities)) if (u.order?.assist === hero.id && !hero.assistCrew.includes(u.id)) delete u.order.assist;
  }
  function syncCrewAttacks() {
    const heroes = Object.values(state.entities).filter(e => e.type === 'hero');
    for (const u of Object.values(state.entities)) if (u.order?.assist) {
      const h = state.entities[u.order.assist], t = h && state.entities[h.attackTarget];
      if (!h?.assistCrew?.includes(u.id) || h.dead || h.downed || h.jailed || !fair(h, t) || !sees(h, t)
        || u.place !== h.place || Math.hypot(t.x - h.x, t.z - h.z) > LOCK_RANGE) {
        delete u.swing; endAttack(u);
      }
    }
    for (const h of heroes) {
      const t = state.entities[h.attackTarget];
      if (!h.assistCrew?.length || h.dead || h.downed || h.jailed || !fair(h, t) || !sees(h, t)
        || Math.hypot(t.x - h.x, t.z - h.z) > LOCK_RANGE) continue;
      for (const u of Object.values(state.entities)) {
        if (!h.assistCrew.includes(u.id) || u.owner !== h.owner || u.type === 'hero' || u.guard || u.dead || u.downed || u.jailed || u.smokePassive || u.place !== h.place || !fair(u, t)) continue;
        const o = u.order;
        if (o?.kind === 'move' && !o.arrived) continue; // finish a deliberate move before joining the hero
        if (o?.kind === 'attack' && o.assist !== h.id) continue;
        if ((o?.kind === 'station' && !o.garrison) || ['stop', 'heal', 'enter', 'loot'].includes(o?.kind) || u.execute) continue;
        if (o?.assist === h.id && o.target === t.id) continue;
        const prev = resumable(u);
        if (prev?.garrison) {
          delete prev.garrison; delete prev.patrol; delete u.patrol;
          if (u.indoorDuty) u.indoorDuty.resume = false;
        }
        delete u.swing; delete u.holdFire; delete paths[u.id];
        if (fight[u.id]) delete fight[u.id].target;
        u.order = { kind: 'attack', target: t.id, assist: h.id, prev, followLeader: h.id };
      }
    }
  }

  // Who this crew member should be fighting right now, if anyone
  function crewTarget(e) {
    const o = e.order || {};
    if (o.kind === 'stop') return null;                  // passive (Z): never picks a fight
    if (e.holdFire) return null;                         // smoke escort stays passive until an explicit combat order
    if (o.kind === 'attack') {
      const t = state.entities[o.target];
      // A deliberate order keeps tracking a visible-at-order-time enemy across fog and screens.
      // Stealth still breaks the lock; a recall or new order replaces it.
      if (fair(e, t) && !(t.hidden && t.owner !== e.owner)) return t;
      endAttack(e);                                    // target gone: back to the old order, or stand there
      return null;
    }
    // a plain move ignores enemies until it arrives (RTS rule); everything else fights back
    if (o.kind === 'move' && !o.arrived) return null;
    if ((o.kind === 'heal' || o.kind === 'enter') && Math.hypot(o.x - e.x, o.z - e.z) > 0.6) return null;
    // first stop anyone finishing off one of our downed crew nearby
    const executor = Object.values(state.entities).find(t => t.execute && hostile(e, t) && !cop(t)
      && state.entities[t.execute.target]?.owner === e.owner && Math.hypot(t.x - e.x, t.z - e.z) < AGGRO);
    if (executor) return executor;
    const [ax, az] = anchorOf(e);
    // crew of every clan, bots too, only pick fights on an attack-move, while stationed in a business, or
    // inside a business being raided or attacked (Tim 2026-10-19/20). Otherwise they swing back at whoever
    // hit them, or at whoever hit their boss or a mate within BACKUP_RANGE. House guards keep auto-aggro
    const raidRoom = e.place !== 'street' && Object.values(state.attacks || {}).some(a => a.room === e.place && a.phase !== 'over');
    if (!e.guard && o.kind !== 'attackmove' && o.kind !== 'station' && !raidRoom) {
      const attacker = u => {
        const by = u.hitBy && state.tick - u.hitBy.tick < secs(RETALIATE_SECONDS) && state.entities[u.hitBy.id];
        return by && u.hitBy.tick > (o.recalledAt ?? -1) && hostile(e, by) && (!cop(by) || by.wave) && Math.hypot(by.x - ax, by.z - az) < LEASH ? by : null;
      };
      const own = attacker(e);
      if (own) return own;
      for (const u of Object.values(state.entities)) {
        if (u === e || u.owner !== e.owner || u.dead || u.place !== e.place || Math.hypot(u.x - e.x, u.z - e.z) > BACKUP_RANGE) continue;
        const by = attacker(u);
        if (by) return by;
      }
      return null;
    }
    const f = fight[e.id];
    const old = f && state.entities[f.target];
    if (hostile(e, old) && (!cop(old) || old.wave) && Math.hypot(old.x - ax, old.z - az) < LEASH) return old;
    return nearestEnemy(e, e.x, e.z, AGGRO);
  }

  // Close in on the target, then swing at it every attackSpeed seconds. A swing has a
  // wind-up and the damage lands on the strike (STRIKE of the way through), Dota-style;
  // e.swing is in the state so the renderer can time the animation to it.
  const STRIKE = 0.4;
  const swingTicks = unit => Math.max(4, Math.round(Math.min(unit.attackSpeed * 0.85, unit.swingSeconds || 0.7) / DT));
  function engage(e, unit, t, chase = true) {
    if (stunned(e, state.tick)) { delete e.swing; e.anim = 'idle'; return; }
    const f = fight[e.id] ||= { cd: 0 };
    // never chase into another place (Tim 2026-10-28: ambush ninja kept running into a building's wall after a target who went inside)
    if (t.place !== e.place) { delete f.target; if (!e.swing) e.anim = 'idle'; return; }
    f.target = t.id;
    if (e.swing) return;                                   // mid-swing: finish it (see swingStep)
    const d = Math.hypot(t.x - e.x, t.z - e.z);
    // a townsperson running away gets away during the wind-up: get right up close first
    const running = chase && civ(t) && t.flee;
    if (d > reachOf(e, t) * (running ? 0.5 : 1)) {
      if (chase) {
        // close in on a spot round the target so several attackers surround it instead of queueing
        const [sx, sz] = running ? [t.x, t.z] : surroundSpot(e, t);
        if (moveTo(e, unit, sx, sz, false)) return;
      }
      e.anim = 'idle';
      return;
    }
    delete paths[e.id];
    // turn toward the target one eighth per tick instead of snapping round
    const want = dirIndex(t.x - e.x, t.z - e.z), diff = (want - e.dir + 8) % 8;
    if (diff) { e.dir = (e.dir + (diff <= 4 ? 1 : 7)) % 8; if (diff !== 1 && diff !== 7) { e.anim = 'idle'; return; } }
    if (f.cd > 0) { e.anim = 'idle'; return; }
    const speed = stats.attackInterval(e);
    const len = swingTicks({ ...unit, attackSpeed: speed });
    e.swing = { start: state.tick, len, strike: state.tick + Math.round(len * STRIKE), target: t.id };
    e.anim = 'attack';
    f.cd = speed;
  }

  // Where an attacker should stand round its target: spread out by how many are on it
  function surroundSpot(e, t) {
    const on = Object.values(state.entities).filter(u => u.type !== 'hero' && !u.dead && fight[u.id]?.target === t.id).map(u => u.id).sort();
    const n = on.length, k = Math.max(0, on.indexOf(e.id));
    const r = reachOf(e, t) * 0.8, a = Math.atan2(e.z - t.z, e.x - t.x) + (n > 1 ? (k - (n - 1) / 2) * 0.9 : 0);
    const spot = [t.x + Math.cos(a) * r, t.z + Math.sin(a) * r];
    return t.place === 'street' ? nav.nearestFree(...spot) || [t.x, t.z] : spot;
  }

  // Swings in progress: land the hit on the strike tick (if the target is still in reach), end the swing
  function swingStep(e, unit) {
    if (stunned(e, state.tick)) { delete e.swing; e.anim = 'idle'; return true; }
    const w = e.swing;
    if (!w) return false;
    if (state.tick === w.strike) {
      const t = state.entities[w.target];
      if (fair(e, t) && sees(e, t) && Math.hypot(t.x - e.x, t.z - e.z) <= reachOf(e, t) + 0.6) {
        const dodge = stats.dodgeChance(t);
        if (dodge && rng() < dodge) {
          stealth.reveal(e, true); // attempting an attack still consumes the attacker's veil
          state.dodges.push({ a: e.id, t: t.id, x: t.x, z: t.z });
        } else {
          const crit = rng() < stats.criticalChance(e);
          const damage = Math.round(stats.damage(e) * (crit ? unit.critMultiplier || 2 : 1));
          hit(e, t, damage, crit);
          kuroda.weaponHit(e, t, damage);
        }
      }
    }
    if (state.tick >= w.start + w.len) { delete e.swing; return false; }
    e.anim = 'attack';
    return true;
  }

  // Small seeded random numbers, so a game replays the same way from the same seed
  let seed = (options.seed ?? 12345) >>> 0;
  function rng() {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = seed;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  // Heat: a number per clan for trouble caused in the street (townsfolk hurt or killed),
  // cooling by 1 every heatCoolSeconds. Nothing reacts to it yet.
  const heatFor = k => units?.rules?.civilianHeat?.[k] || 0;
  // state.heatGains = this tick's rises ({ clan, amount, reason }), for the heat pop-ups
  // c.infamy = lifetime heat (stand-in until the infamy board); the top-infamy clan gains more (police.heatScale)
  function addHeat(owner, n, reason, scale = true) {
    const c = state.clans?.[owner];
    if (!c || !n) return;
    c.infamy = (c.infamy || 0) + n;
    n = Math.round(n * (scale ? police?.heatScale(owner) ?? 1 : 1));
    c.heat = (c.heat || 0) + n;
    state.heatGains.push({ clan: owner, amount: n, reason });
  }
  // a clan's home hideout (b.hideout = clan id; sim/clans.js gives it to the clan) and whether a unit is in it
  const hideoutOf = id => Object.values(state.businesses).find(b => b.hideout === id && b.owner === id);
  const atHome = e => !!e && e.place !== 'street' && hideoutOf(e.owner)?.room === e.place;
  function coolHeat() {
    const every = secs(units?.rules?.heatCoolSeconds || 10);
    if (!state.clans) return;
    // laying low: with the boss inside the hideout heat cools heatCoolFactor times as fast
    const f = units?.rules?.hideout?.heatCoolFactor ?? 1, fast = Math.max(1, Math.round(every / f));
    for (const c of Object.values(state.clans)) {
      if (!(c.heat > 0)) continue;
      const boss = Object.values(state.entities).find(e => e.owner === c.id && e.type === 'hero');
      // in your own territory it cools every territory.heatCoolSeconds (sim/territory.js)
      const turf = territory.inOwn(boss) ? Math.max(1, Math.min(every, secs(territory.rules.heatCoolSeconds))) : every;
      if (state.tick % (atHome(boss) ? Math.min(fast, turf) : turf) === 0) c.heat = Math.max(0, c.heat - 1);
    }
  }

  function hit(a, t, damage, crit = false, kind = null) {
    // Assassinate's explicit current-health rule stays exact inside a formation.
    if (kind !== 'assassinate') damage = Math.round(damage * stats.damageTaken(t));
    stealth.reveal(a, true); stealth.reveal(t);   // outgoing hits consume the smoke veil; incoming hits cannot reveal it
    t.hp = Math.max(0, t.hp - damage);
    t.hitAt = state.tick;
    contracts?.interruptScrub(t);
    diversion.interrupted(t);
    rifleman.interrupted(t);
    t.hitBy = { id: a.id, tick: state.tick };   // a hero only swings back at whoever hit him (below)
    if (damage > 0) kuroda.damaged(t, a);
    delete t.execute;                // a hit breaks an execute channel
    // this tick's hits, for damage numbers and effects (cleared every tick)
    state.hits.push({ a: a.id, t: t.id, damage, crit, kill: t.hp <= 0, x: t.x, z: t.z, dir: a.dir, weapon: a.model, ...(kind ? { kind } : {}) });
    // Red Lantern: heal part of the damage dealt
    const steal = stats.lifesteal(a);
    if (steal && !a.dead && a.maxHp) a.hp = Math.min(a.maxHp, a.hp + damage * steal);
    if (civ(t)) addHeat(a.owner, heatFor('hit'), 'Assault');
    if (civ(t) && t.hp <= 0) addHeat(a.owner, heatFor('down'), 'Townsperson beaten down');
    if (civ(t)) police?.witnessAssault(a, t);
    if (wild(t)) bandits.provoke(t, a.owner);
    if (cop(a)) t.copHitAt = state.tick;     // the police box won't take a bribe right after (sim/police.js)
    // who fought where, for the police (a patrol goes to a clan's last fight, and for units seen fighting)
    if (state.clans?.[a.owner]) {
      a.foughtAt = state.tick;
      if (a.place === 'street') state.clans[a.owner].lastFight = { x: a.x, z: a.z, tick: state.tick };
      // officers defending a business you attack (e.wave) give attack.hitHeat instead: the attack already costs heat when won
      if (cop(t)) { addHeat(a.owner, t.wave ? units?.rules?.attack?.hitHeat ?? 0 : police.rules.hitPoliceHeat, 'Assaulting police'); police.provoke(t, a.owner); }
    }
    if (t.hp > 0) return;
    if (t.type === 'hero') {
      delete t.assistCrew;
      for (const u of Object.values(state.entities)) if (u.owner === t.owner && u.order?.kind === 'follow' && u.order.target === t.id) {
        u.order = { kind: 'move', x: u.x, z: u.z, arrived: true };
        delete paths[u.id];
      }
    }
    delete t.swing;
    delete t.dash;
    delete t.buffs;
    kuroda.cancel(t);
    delete paths[t.id];
    delete fight[t.id];
    t.anim = 'death';
    // Bandits leave their money on the body for whoever loots it.
    if (wild(t)) { t.dead = true; t.diedAt = state.tick; bandits.killed(a, t); return; }
    // an officer knocked out is taken away (the HQ sends another)
    if (cop(t)) { t.dead = true; t.diedAt = state.tick; police.knockedOut(t); return; }
    // house guards (sim/businesses.js) die outright; the business sends a new one later
    if (t.guard) { t.dead = true; t.diedAt = state.tick; return; }
    // crew go down, not dead: an enemy can finish them with an execute (see executeStep)
    if (t.type !== 'hero') { t.downed = true; t.downedAt = state.tick; return; }
    // the police knock the hero down instead, and an officer arrests him (a channel only his crew can break)
    state.news.push({ kind: 'bossDown', clan: t.owner, hero: t.id, by: a.owner || null, x: t.x, z: t.z });
    if (cop(a) && police) { t.downed = true; t.downedAt = state.tick; return; }
    rewards.leaderDown(a, t);
    t.dead = true;
    t.anim = 'death';
    t.diedAt = state.tick;
    delete paths[t.id];
    delete fight[t.id];
  }

  // Downed units remain executable/arrestable for the configured window. An
  // already-started execution or arrest may finish before the body is carried.
  function carryOffDowned() {
    const r = units?.rules || {};
    for (const e of Object.values(state.entities)) {
      if (!e.downed || e.dead) continue;
      e.downedAt ??= state.tick;
      if (state.tick - e.downedAt < secs(r.downedMinSeconds ?? 20)) continue;
      if (Object.values(state.entities).some(o => o.execute?.target === e.id && Number.isFinite(o.execute.start))) continue;
      // a hero the police knocked down but nobody arrested: knocked out as usual (up at the clinic)
      if (e.type === 'hero') { delete e.downed; e.dead = true; e.diedAt = state.tick; continue; }
      if (!civ(e) && !clans?.carryOff(e)) continue;      // townsfolk are helped home (sim/civilians.js sends a new one out later)
      delete state.entities[e.id];
      delete intents[e.id];
      for (const u of Object.values(state.entities)) if (u.order?.target === e.id && u.order.kind === 'attack') endAttack(u);
    }
  }

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
  const lootable = (e, b) => !!b && b.dead && b.loot > 0 && b.place === e.place && sees(e, b) && deployment.canActAt(e, b.x, b.z, b.place);
  function startLoot(e, c) {
    const body = state.entities[c.target];
    if (e.type !== 'hero') return;
    const heroReady = !e.dead && !e.downed && !e.jailed && !c.crewOnly;
    if (heroReady && c.preferHeroInRange && lootable(e, body) && Math.hypot(e.x - body.x, e.z - body.z) <= LOOT_REACH) {
      delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id];
      e.lootTarget = body.id;
      return;
    }
    if (Array.isArray(c.units) && c.units.length) {
      const selected = c.units.map(id => state.entities[id])
        .filter(u => u && !u.dead && !u.downed && !u.jailed && u.owner === e.owner && u.type !== 'hero' && !u.guard && lootable(u, body))
        .sort((a, b) => Math.hypot(a.x - body.x, a.z - body.z) - Math.hypot(b.x - body.x, b.z - body.z));
      const u = selected[0];
      if (!u) return;
      manualCrew(u);
      delete paths[u.id]; delete u.execute; delete u.swing;
      if (fight[u.id]) delete fight[u.id].target;
      const previous = resumable(u);
      u.order = { kind: 'loot', target: body.id, prev: previous };
      if (previous?.kind !== 'follow') for (const other of selected.slice(1)) {
        const prev = resumable(other);
        if (prev?.kind === 'follow') continue;
        manualCrew(other);
        delete paths[other.id];
        other.lootEscort = { looter: u.id, prev };
        other.order = { kind: 'follow', target: u.id, slot: freeSlot(u.id, other.id) };
      }
      return;
    }
    if (!heroReady || e.execute || !lootable(e, body)) return;
    delete e.swing; delete e.execute; delete e.attackTarget; delete paths[e.id];
    e.lootTarget = body.id;
  }
  // One tick of walking to a body; true while busy with it (takes the ryo once in reach)
  function lootStep(e, unit, id) {
    const body = state.entities[id];
    if (!lootable(e, body)) return false;
    if (Math.hypot(body.x - e.x, body.z - e.z) <= LOOT_REACH) {
      const clan = state.clans?.[e.owner];
      if (clan) {
        clan.ryo += body.loot;
        state.ryoGains.push({ clan: clan.id, amount: body.loot, reason: `${body.type === 'night_brute' ? 'Night brute' : 'Bandit'} looted` });
        state.casts.push({ kind: 'loot', a: e.id, x: body.x, z: body.z, ryo: body.loot });
      }
      delete body.loot;   // the body then fades like any other
      e.anim = 'idle';
      return false;
    }
    if (!moveTo(e, unit, body.x, body.z, false)) return false;
    return true;
  }

  function startExecute(e, c, assignmentOperation = false) {
    const t = state.entities[c.target];
    const heroReady = e.type === 'hero' && !e.dead && !e.downed && !e.jailed && !c.crewOnly;
    // Police and bots also call this directly without a selected crew list.
    let ex = !e.dead && !e.downed && !e.jailed && !c.crewOnly ? e : null;
    if (Array.isArray(c.units) && c.units.length && !(heroReady && c.preferHeroInRange && e.place === t?.place && Math.hypot(e.x - t?.x, e.z - t?.z) <= 1.3)) {
      ex = c.units.map(id => state.entities[id])
        .filter(u => u && !u.dead && !u.downed && !u.jailed && u.owner === e.owner && u.type !== 'hero' && !u.guard && (!c.broadcast || u.place === 'street') && u.place === t?.place && deployment.canActAt(u, t.x, t.z, t.place))
        .sort((a, b) => t ? Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z) : 0)[0];
    }
    if (!ex || ex.dead || ex.downed || (ex === e && e.type === 'hero' && e.execute) || !downedFoe(ex, state.entities[c.target]) || !sees(ex, state.entities[c.target])) return;
    if (!assignmentOperation && e.type === 'hero' && ex.type !== 'hero') manualCrew(ex);
    delete ex.smokePassive; delete ex.holdFire;
    delete ex.swing;
    delete ex.attackTarget;
    delete paths[ex.id];
    if (fight[ex.id]) delete fight[ex.id].target;
    ex.execute = { target: c.target, start: null, len: secs(units?.rules?.executeSeconds || 3) };
  }
  // An executed enemy (not townsfolk) pays the executor's clan its type's executeRyo, ±executeRyoSpread
  // (state.ryoGains for the badge notice; cast.ryo tells the view to burst coins)
  function payExecute(e, t, cast) {
    const clan = state.clans?.[e.owner], base = units?.types?.[t.type]?.executeRyo || 0;
    if (!clan || !base || !state.clans?.[t.owner] || t.owner === e.owner) return;
    const k = units.rules.executeRyoSpread ?? 0, amount = Math.round(base * (1 - k + rng() * 2 * k));
    clan.ryo += amount;
    cast.ryo = amount;
    const name = units.types[t.type].name || t.type[0].toUpperCase() + t.type.slice(1);
    const victimClan = state.clans[t.owner].name || t.owner;
    state.ryoGains.push({ clan: clan.id, amount, target: t.id, reason: `${victimClan} ${name.toLowerCase()} executed` });
  }
  // One tick of an execute; false when there is nothing (left) to do
  function executeStep(e, unit) {
    const x = e.execute, t = state.entities[x.target];
    if (!downedFoe(e, t)) { delete e.execute; return false; }
    if (Math.hypot(t.x - e.x, t.z - e.z) > 1.3) {
      x.start = null;
      if (!moveTo(e, unit, t.x, t.z, false)) { delete e.execute; return false; }
      return true;
    }
    delete paths[e.id];
    e.anim = 'idle';
    e.dir = dirIndex(t.x - e.x, t.z - e.z);
    if (x.start === null) x.start = state.tick;
    if (state.tick - x.start < x.len) return true;
    // police arrest instead: the unit goes to jail (sim/police.js), nobody dies
    if (cop(e)) {
      state.casts.push({ a: e.id, kind: 'arrest', target: t.id, x: t.x, z: t.z });
      if (t.type === 'hero') police.jailHero(t);
      else { police.jail(t); removeUnit(t.id); }
      delete e.execute;
      return true;
    }
    delete t.downed;
    t.dead = true;
    t.diedAt = state.tick;
    state.casts.push({ a: e.id, kind: 'execute', target: t.id, x: t.x, z: t.z });
    if (civ(t)) { addHeat(e.owner, heatFor('kill'), 'Townsperson killed'); police?.witnessAssault(e, t); }
    else {
      payExecute(e, t, state.casts[state.casts.length - 1]);
      rewards.crewExecuted(e, t);
    }
    delete e.execute;
    return true;
  }

  // Bots: once a second an idle bot crew member looks for a downed enemy within AGGRO of
  // where it belongs, or within carryRadius of itself (so nothing it keeps from being
  // carried off is out of its reach). It only goes when that is safe (no standing enemy
  // within SAFE of the downed unit), and then on a roll against its clan's aggression,
  // made again every second (a once-only "no" left crew lying there for good); pricier
  // unit types are picked first.
  const SAFE = 5;
  const sectorCleanup=createSectorCleanup({state,deployment,rally,navigation:e=>deployment.navFor(e)||navOf(e.place),sees,downedFoe,lootable,
    startExecute,executeStep,lootStep,inCombat:e=>!!crewTarget(e),stopPath:e=>{delete paths[e.id];}});
  crewJobs=createCrewJobs({state,deployment,rally,manual:manualCrew,navigation:e=>deployment.navFor(e)||navOf(e.place),sees,lootable,downedFoe,startExecute,executeStep,lootStep,giveOrder,resumeDuty:assignments.resume,freeSlot,
    clearCombat:e=>{delete e.swing;delete e.execute;delete e.attackTarget;delete e.lootTarget;delete paths[e.id];if(fight[e.id])delete fight[e.id].target;}});
  function botExecute(e) {
    const clan = state.clans?.[e.owner];
    if (!clan?.bot || e.holdFire || (state.tick + Number(e.id)) % TICK_RATE) return false;
    const [ax, az] = anchorOf(e), reach = units?.rules?.carryRadius ?? 8;
    const price = t => units?.types[t.type]?.price || 0;
    const options = Object.values(state.entities).filter(t => downedFoe(e, t) && !civ(t)
      && (Math.hypot(t.x - ax, t.z - az) < AGGRO || Math.hypot(t.x - e.x, t.z - e.z) < reach)
      && !Object.values(state.entities).some(o => o.execute?.target === t.id)
      && !Object.values(state.entities).some(o => hostile(e, o) && Math.hypot(o.x - t.x, o.z - t.z) < SAFE));
    if (!options.length || rng() >= (clan.aggression ?? 0.5)) return false;
    options.sort((a, b) => price(b) - price(a) || Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
    startExecute(e, { target: options[0].id });
    return !!e.execute;
  }

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

  function useAbility(e, c) {
    const a = statsOf(e).abilities?.[c.slot];
    if (!a || e.type !== 'hero' || e.dead || e.downed || e.jailed || e.dash || e.brace || e.spearCombo || e.spearSweep || stunned(e, state.tick)) return;
    if ((e.cooldowns?.[c.slot] ?? 0) > state.tick) return;
    const aim = Number.isFinite(c.x) && Number.isFinite(c.z) ? [c.x, c.z] : null;
    let extra = {};   // more for the renderer's cast entry
    if (KURODA_KINDS.has(a.kind)) {
      const result = kuroda.cast(e, a, c);
      if (!result) return;
      extra = result;
    } else if (a.kind === 'dash') {
      let dx = aim ? aim[0] - e.x : 0, dz = aim ? aim[1] - e.z : 0, len = Math.hypot(dx, dz);
      if (len < 0.2) {   // no aim: dash the way the hero faces
        const th = e.dir * Math.PI / 4, sx = -Math.sin(th), sy = Math.cos(th);
        dx = sx * SCREEN_RIGHT.x + sy * SCREEN_DOWN.x; dz = sx * SCREEN_RIGHT.z + sy * SCREEN_DOWN.z; len = Math.hypot(dx, dz);
      }
      const dist = Math.min(a.range, Math.max(len, 1.5)), ticks = Math.max(1, secs(a.seconds || 0.25));
      e.dash = { vx: dx / len * dist / ticks, vz: dz / len * dist / ticks, left: ticks, hit: [], start: state.tick, len: ticks };
      e.dir = dirIndex(dx, dz);
    } else if (a.kind === 'intimidate') {
      for (const t of Object.values(state.entities))
        if (hostile(e, t) && Math.hypot(t.x - e.x, t.z - e.z) <= a.radius) {
          addBuff(t, 'intimidated', a.seconds, { damage: a.enemyDamage });
          if (a.snareSeconds && a.snareSpeed) addBuff(t, 'snared', a.snareSeconds, { speed: a.snareSpeed });
        }
    } else if (a.kind === 'rally') {
      for (const u of Object.values(state.entities)) {
        if (u.dead || !rally.buffEligible(e, u) || u.place !== e.place || Math.hypot(u.x - e.x, u.z - e.z) > a.radius) continue;
        // heal over time (Tim 2026-10-19): a.heal in all, in healTicks equal parts, the first at once, then one a second
        const n = a.healTicks || 1;
        addBuff(u, 'rally', a.seconds, { boost: a.attackSpeed, heal: a.heal / n, ticksLeft: n, nextHeal: state.tick });
      }
    } else if (a.kind === 'lantern') {
      addBuff(e, 'lantern', a.seconds, { damage: a.damage, lifesteal: a.lifesteal });
    } else if (a.kind === 'shadowstep') {
      // Shadow Step (Shinobi Q): gone in a puff, out again up to range toward the mouse; stops at
      // the first wall or water on the way, and he stays hidden
      // with a target (c.target: the one in the target frame) he can see within range, he steps onto it instead
      // (Tim 2026-10-21: not the mouse), lands next to it with a sure crit, then auto attacks it
      const ct = state.entities[c.target];
      const t = ct && fair(e, ct) && sees(e, ct) && Math.hypot(ct.x - e.x, ct.z - e.z) <= a.range + 1 ? ct : null;
      const grid = navOf(e.place), dx = aim ? aim[0] - e.x : 0, dz = aim ? aim[1] - e.z : 0, len = Math.hypot(dx, dz);
      if (!grid || (!t && len < 0.5)) return;
      const dist = Math.min(a.range, len), n = Math.ceil(dist / 0.25);
      let x = e.x, z = e.z;
      for (let i = 1; i <= n; i++) {
        const px = e.x + dx / len * dist * i / n, pz = e.z + dz / len * dist * i / n;
        if (!grid.free(px, pz)) break;
        x = px; z = pz;
      }
      if (t) {
        const tl = Math.hypot(t.x - e.x, t.z - e.z) || 1, stop = Math.max(0, tl - (a.landGap ?? 0.9));
        x = e.x; z = e.z;
        for (let i = 1, m = Math.ceil(stop / 0.25); i <= m; i++) {
          const px = e.x + (t.x - e.x) / tl * stop * i / m, pz = e.z + (t.z - e.z) / tl * stop * i / m;
          if (!grid.free(px, pz)) break;
          x = px; z = pz;
        }
      }
      if (!t && Math.hypot(x - e.x, z - e.z) < 0.5) return;
      extra = { fx: e.x, fz: e.z };
      e.x = x; e.z = z; e.dir = t ? dirIndex(t.x - x, t.z - z) : dirIndex(dx, dz);
      delete paths[e.id];
      if (t && Math.hypot(t.x - e.x, t.z - e.z) <= reachOf(e, t) + 0.6) {
        const u = statsOf(e);
        hit(e, t, Math.round(u.damage * damageScale(e) * (u.critMultiplier || 2)), true);
        extra = { ...extra, tx: t.x, tz: t.z, target: t.id, crit: true };   // the big slash (render/abilityfx.js)
        if (!t.dead && !t.downed) { e.attackTarget = t.id; delete e.execute; delete e.holdFire; }
      }
    } else if (a.kind === 'distract') {
      // Distract (Shinobi E): a pebble thrown at the mouse (up to range); house guards, police and
      // bandits within radius of where it lands who aren't fighting go and look there for seconds
      if (!aim) return;
      const len = Math.hypot(aim[0] - e.x, aim[1] - e.z), k = len > a.range ? a.range / len : 1;
      const x = e.x + (aim[0] - e.x) * k, z = e.z + (aim[1] - e.z) * k;
      for (const t of Object.values(state.entities)) {
        if (!(t.guard || cop(t) || wild(t)) || t.owner === e.owner || t.place !== e.place || t.dead || t.downed || t.jailed) continue;
        if (Math.hypot(t.x - x, t.z - z) > a.radius || t.swing || t.execute || t.wave || Object.keys(t.angry || {}).length) continue;
        const [sx, sz] = navOf(t.place)?.nearestFree(x, z) || [x, z];
        t.distracted = { x: sx, z: sz, lookX: x, lookZ: z, investigateTicks: secs(4), travelUntil: state.tick + secs(20), until: state.tick + secs(24) };
        delete paths[t.id];
      }
      // ...and it is a scatter of caltrops (Tim 2026-10-20): every enemy close to it is slowed, bosses too
      if (a.snareRadius) for (const t of Object.values(state.entities))
        if (t.owner !== e.owner && !civ(t) && t.place === e.place && !t.dead && !t.downed && !t.jailed && Math.hypot(t.x - x, t.z - z) <= a.snareRadius)
          addBuff(t, 'snared', a.snareSeconds, { speed: a.snareSpeed });
      extra = { tx: x, tz: z };
    } else if (a.kind === 'smoke') {
      // Smoke Bomb (Shinobi R): a cloud round him (radius, seconds); see blind() for what it does.
      // Every unit of his clan holds its attacks, hitting back too, until given a new order
      // (Tim 2026-10-20), so nobody breaks stealth on his own
      const cloud = { x: e.x, z: e.z, r: a.radius, place: e.place, clan: e.owner, hero: e.id, until: state.tick + secs(a.seconds), heal: a.heal || 0, fadeSeconds: a.fadeSeconds || 0 };
      (state.smokes ||= []).push(cloud);
      for (const u of Object.values(state.entities)) {
        if (u.owner !== e.owner || !inSmoke(cloud, u)) continue;
        u.holdFire = true;
        delete u.swing; delete u.execute; delete u.attackTarget;
        if (fight[u.id]) delete fight[u.id].target;
        if (u.type !== 'hero' && u.order?.kind === 'attack') endAttack(u);
      }
      extra = { seconds: a.seconds };
    } else if (a.kind === 'assassinate') {
      // Assassinate (Shinobi F): only after hiddenSeconds hidden (smoke doesn't count), on the enemy
      // at the mouse within reach; non-heroes go down at once. Heroes retain
      // bossShare of their current HP, rounded to whole HP without a finishing blow.
      const clan = state.clans?.[e.owner], tell = text => { if (clan) clan.notice = { tick: state.tick, text }; };
      if (!e.hidden || (!stealth.veiled(e) && (e.hiddenAt == null || state.tick - e.hiddenAt < secs(a.hiddenSeconds)))) return tell(`Assassinate: stay hidden ${a.hiddenSeconds} s first`);
      // the target in the target frame first, else whoever is at the mouse; townsfolk and police too (Tim 2026-10-21)
      const inReach = u => u && fair(e, u) && Math.hypot(u.x - e.x, u.z - e.z) <= reachOf(e, u) + a.reach;
      const picked = inReach(state.entities[c.target]) ? state.entities[c.target] : null;
      let t = picked, bd = 2;
      for (const u of Object.values(state.entities)) {
        if (picked || !aim || !inReach(u)) continue;
        const d = Math.hypot(u.x - aim[0], u.z - aim[1]);
        if (d < bd) { bd = d; t = u; }
      }
      if (!t) return tell('Assassinate: nobody in reach at the mouse');
      const remaining = Math.min(t.hp, Math.max(1, Math.round(t.hp * a.bossShare)));
      const dmg = t.type === 'hero' ? t.hp - remaining : t.hp;
      // a quick lunge onto him first (Tim 2026-10-20: longer reach, so he strikes before he is spotted)
      const fx = e.x, fz = e.z, tl = Math.hypot(t.x - e.x, t.z - e.z), stop = Math.max(0, tl - (a.landGap ?? 0.9)), grid = navOf(e.place);
      for (let i = 1, m = Math.ceil(stop / 0.25); grid && i <= m; i++) {
        const px = fx + (t.x - fx) / (tl || 1) * stop * i / m, pz = fz + (t.z - fz) / (tl || 1) * stop * i / m;
        if (!grid.free(px, pz)) break;
        e.x = px; e.z = pz;
      }
      delete paths[e.id];
      e.dir = dirIndex(t.x - e.x, t.z - e.z);
      extra = { tx: t.x, tz: t.z, target: t.id, fx, fz, critRadius: a.critRadius };
      hit(e, t, dmg, true, 'assassinate');
      delete e.holdFire; // a successful offensive ability is an explicit attack
      for (const u of Object.values(state.entities)) {
        if (!rally.buffEligible(e, u) || u.guard || u.dead || u.downed || u.jailed || u.place !== e.place
          || Math.hypot(u.x - e.x, u.z - e.z) > a.critRadius) continue;
        addBuff(u, 'ambush', a.critSeconds, { critChance: a.critChance });
      }
    } else return;
    delete e.swing;
    (e.cooldowns ||= {})[c.slot] = state.tick + secs(a.cooldown);
    state.casts.push({ a: e.id, slot: c.slot, kind: a.kind, x: e.x, z: e.z, ...(a.radius ? { radius: a.radius } : {}), ...extra });
  }

  // One tick of a dash: slide toward the aim, cut every enemy passed (once each)
  function dashStep(e, unit) {
    const d = e.dash, a = unit.abilities?.Q;
    e.anim = 'run';
    tryMove(e, unit.radius, d.vx, 0);
    tryMove(e, unit.radius, 0, d.vz);
    for (const t of Object.values(state.entities)) {
      if (!(hostile(e, t) || (wild(t) && fair(e, t))) || d.hit.includes(t.id) || Math.hypot(t.x - e.x, t.z - e.z) > statsOf(t).radius + 0.9) continue;
      d.hit.push(t.id);
      hit(e, t, Math.round(unit.damage * (a?.damageMultiplier || 1) * damageScale(e)), false, 'dash');
    }
    if (--d.left <= 0) delete e.dash;
  }

  // Buffs that heal in ticks (Rally): heal share of max health each second while they last
  function healBuffs() {
    for (const e of Object.values(state.entities)) {
      const b = e.buffs?.rally;
      if (!b?.ticksLeft || state.tick < b.nextHeal || e.dead || e.downed) continue;
      if (e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * b.heal);
      b.ticksLeft--; b.nextHeal = state.tick + secs(1);
    }
  }

  function expireBuffs() {
    for (const e of Object.values(state.entities)) {
      if (!e.buffs) continue;
      for (const [k, b] of Object.entries(e.buffs)) if (state.tick >= b.until) delete e.buffs[k];
      if (!Object.keys(e.buffs).length) delete e.buffs;
    }
  }

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
      if (e.type === 'hero' && secs >= (units?.rules?.heroRespawnSeconds ?? 20)) {
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

  function crewStep(e, unit) {
    if(e.crewJob&&(e.dead||e.downed||e.jailed||e.deployment?.transfer||stunned(e,state.tick)))crewJobs.cancel(e);
    if(e.deployment?.cleanup&&(e.deployment.transfer||e.deployment.duty?.manual||rally.participating(e)
      ||state.deployment.clans[e.owner]?.sectors[e.deployment.group]?.recovery||state.deployment.clans[e.owner]?.sectors[e.deployment.group]?.operation))sectorCleanup.cancel(e);
    if (e.dead || e.downed || e.jailed) return;
    const escorted = e.lootEscort && state.entities[e.lootEscort.looter];
    if (e.lootEscort && (!escorted || escorted.dead || escorted.downed || escorted.jailed || escorted.order?.kind !== 'loot')) {
      e.order = e.lootEscort.prev || { kind: 'move', x: e.x, z: e.z };
      delete e.lootEscort; delete paths[e.id];
    }
    if (stunned(e, state.tick)) { delete e.swing; e.anim = 'idle'; return; }
    if (contracts?.scrubStep(e)) return;
    if (deployment.travelStep(e, unit)) return;
    if(crewJobs.step(e,unit))return;
    if (e.distracted?.source && diversion.step(e, unit)) return;
    if (e.taunted && taunt.step(e, unit)) return;
    if (assignments.avoidCamping(e,unit)) return;
    if (sectorRecovery.step(e, unit)) return;
    if (distractionStep(e, unit, state, moveTo, u => { delete paths[u.id]; })) return;
    if (diversion.step(e, unit)) return;
    if (rifleman.step(e, unit)) return;
    if (taunt.step(e, unit)) return;
    if (sectorCleanup.step(e,unit)) return;
    if (shinobiAssignments.step(e, unit)) return;
    if (!rally.participating(e) && assignments.step(e, unit)) return;
    if (state.deployment.restrictionsEnabled && e.order?.kind === 'follow' && e.deployment?.group !== 'hero' && !rally.participating(e) && !e.lootEscort) {
      e.order = { kind: 'move', x: e.x, z: e.z, arrived: true }; delete paths[e.id];
    }
    const finished = e.order?.kind === 'attack' && state.entities[e.order.target];
    if (finished && (finished.dead || finished.downed || finished.jailed)) { delete e.swing; endAttack(e); }
    if(pursueAttack(e,unit))return;
    indoorDuty(e);
    // Move and an explicit Follow recall reach their goal even under fire. Process
    // it before swings, retaliation, automatic executions or hero assistance.
    const recalling = e.order?.kind === 'follow' && e.order.regrouping;
    if (e.order?.kind === 'follow' && !state.clans?.[e.owner]?.bot && !e.execute && e.place === 'street') {
      const leader = state.entities[e.order.target];
      const door = leader && !leader.dead && !leader.downed && !leader.jailed && leader.place !== 'street'
        && doors.find(d => d.to && !d.ninja && d.place === leader.place);
      if (door && (!businesses || businesses.mayEnter(e, door.place))) {
        delete e.swing; delete e.execute;
        if (fight[e.id]) delete fight[e.id].target;
        if (Math.hypot(door.x - e.x, door.z - e.z) >= DOOR_RADIUS) {
          if (!moveTo(e, unit, door.x, door.z, false)) e.anim = 'idle';
        } else {
          const [x, z] = navOf(door.place)?.nearestFree(door.to.x, door.to.z) || [door.to.x, door.to.z];
          Object.assign(e, { x, z, place: door.place, anim: 'idle' });
          e.order.exitWithHero = true;
          delete paths[e.id];
        }
        return;
      }
    }
    if ((e.order?.kind === 'move' && !e.order.arrived) || recalling) {
      delete e.swing; delete e.execute;
      if (fight[e.id]) delete fight[e.id].target;
      if (crewOut(e, unit)) return;
      const goal = crewGoal(e);
      if (goal && Math.hypot(goal.x - e.x, goal.z - e.z) >= goal.near) {
        if (!moveTo(e, unit, goal.x, goal.z, goal.walk)) e.anim = 'idle';
        return;
      }
      if (recalling) delete e.order.regrouping;
      else e.order.arrived = true;
      // Hits during retreat are stale once we get back. A fresh assault after
      // arrival can still provoke normal defense unless Smoke granted passivity.
      e.order.recalledAt = state.tick;
      e.anim = 'idle'; delete paths[e.id];
      return;
    }
    if (e.execute && executeStep(e, unit)) return;
    if (swingStep(e, unit)) return;
    if (e.order?.kind === 'loot') {   // Ctrl + right-click on a body: walk there and take its ryo
      if (lootStep(e, unit, e.order.target)) return;
      e.order = e.order.prev || { kind: 'move', x: e.x, z: e.z };
    }
    if (e.order?.kind === 'enter' && enterStep(e)) return;
    if (crewOut(e, unit)) return;
    const t = crewTarget(e);
    if (t) { engage(e, unit, t); return; }
    if (fight[e.id]) delete fight[e.id].target;
    if (botExecute(e)) return;
    const goal = crewGoal(e);
    const dist = goal ? Math.hypot(goal.x - e.x, goal.z - e.z) : 0;
    if (!goal || dist < goal.near) {
      e.anim = 'idle'; delete paths[e.id];
      if (e.order?.kind === 'attackmove') e.order = { kind: 'move', x: e.order.x, z: e.order.z };   // arrived: hold there
      if (e.order?.kind === 'heal') {                                       // at the clinic door: go in (or wait if broke)
        if (clans?.hitWait(e) > 0) return;                                  // hit lately: wait at the door till it's safe (Tim 2026-10-20)
        if (clans?.checkIn(e)) { delete state.entities[e.id]; delete intents[e.id]; delete fight[e.id]; return; }
        e.order = { kind: 'move', x: e.order.x, z: e.order.z };
      }
      return;
    }
    if (!moveTo(e, unit, goal.x, goal.z, goal.walk && (goal.stroll || dist < 4))) e.anim = 'idle';
  }

  // Pursue only a visible target or a last-observed public doorway/position.
  // Crossing a door never exposes the enemy's unobserved room coordinates.
  function pursueAttack(e,unit) {
    const o=e.order;if(o?.kind!=='attack')return false;
    const t=state.entities[o.target];if(!t||t.dead||t.downed||t.jailed)return false;
    const visible=sees(e,t);
    if(visible){o.lastSeen={x:t.x,z:t.z,place:t.place};delete o.searchPlace;}
    const last=o.lastSeen;
    if(visible&&!deployment.canActAt(e,t.x,t.z,t.place)){endAttack(e);if(state.clans[e.owner])state.clans[e.owner].notice={tick:state.tick,text:'Pursuit stopped: target left the assigned sector'};return true;}
    if(t.place===e.place&&visible)return false;
    if(e.swing)delete e.swing;
    if(o.searchPlace===e.place&&!visible){e.anim='idle';return true;}
    let goal=null;
    if(t.place!==e.place){
      if(e.place==='street'){
        const candidates=doors.filter(d=>d.to&&!d.ninja&&d.place!=='street'&&(visible?d.place===t.place:last?.place==='street'&&Math.hypot(last.x-d.x,last.z-d.z)<DOOR_RADIUS+2));
        const d=candidates.sort((a,b)=>Math.hypot(a.x-(last?.x??e.x),a.z-(last?.z??e.z))-Math.hypot(b.x-(last?.x??e.x),b.z-(last?.z??e.z)))[0];
        if(d)goal={x:d.to.x,z:d.to.z,place:d.place};
      }else{
        const room=rooms.find(r=>r.name===e.place),d=room&&doors.find(d=>!d.ninja&&d.place==='street'&&d.to&&d.x===room.exit.x&&d.z===room.exit.z);
        if(d&&(visible||(last?.place===e.place&&Math.hypot(last.x-d.x,last.z-d.z)<DOOR_RADIUS+2)))goal={...d.to,place:'street'};
      }
    }else if(last?.place===e.place)goal={...last};
    if(!goal&&last?.place===e.place)goal={...last};
    if(!goal){e.anim='idle';return true;}
    const allowed=goal.place==='street'?{ok:true}:businesses?.entryStatus(e,goal.place)||{ok:true};
    const result=allowed.ok?deployment.localTravel(e,unit,goal):'blocked';
    if(result==='blocked'){
      endAttack(e);delete paths[e.id];e.anim='idle';
      if(state.clans[e.owner])state.clans[e.owner].notice={tick:state.tick,text:`Pursuit stopped: ${allowed.ok?'door or sector route is blocked':allowed.why}`};
      return true;
    }
    if(goal.place!==last?.place)o.searchPlace=goal.place;
    if(result==='arrived')e.anim='idle';return true;
  }

  // Entered crew keep guarding even when their leader visits. Explicit orders
  // take control; leaving them behind again restores duty once that task ends.
  function indoorDuty(e) {
    if (e.guard || e.wild || e.cop) return;
    if (e.place === 'street') { delete e.indoorDuty; delete e.patrol; return; }
    const leader = Object.values(state.entities).find(h => h.type === 'hero' && h.owner === e.owner);
    const present = leader && !leader.dead && !leader.jailed && leader.place === e.place;
    const o = e.order;
    if (e.indoorDuty?.room !== e.place) e.indoorDuty = { room: e.place, present: !!present, resume: !present && (!o || o.kind === 'follow') };
    if (e.indoorDuty.present && !present) e.indoorDuty.resume = true;
    e.indoorDuty.present = !!present;
    const busy = e.execute || (o && ['attack', 'attackmove', 'heal', 'enter', 'loot'].includes(o.kind)) || (o?.kind === 'move' && !o.arrived);
    if (e.indoorDuty.resume && !busy) {
      e.order = { kind: 'station', x: e.x, z: e.z, garrison: true };
      delete paths[e.id]; delete e.patrol;
      e.indoorDuty.resume = false;
    }
    if (e.execute || !e.order?.garrison || e.order.kind !== 'station') return;
    businesses?.patrolCrew(e);
  }

  // At the door of the business they were sent into: step inside and hold a spot near the way in
  // (a station order: they fight whoever comes in, then go back to it)
  function enterStep(e) {
    const o = e.order, d = doors.find(d => d.to && d.place === o.room && !d.ninja === !o.window);
    if (!d) { e.order = { kind: 'move', x: e.x, z: e.z }; return false; }
    if (Math.hypot(d.x - e.x, d.z - e.z) >= DOOR_RADIUS || (businesses && !businesses.mayEnter(e, d.place))) return false;
    const [ox, oz] = blockOffset(o.k, o.n);
    const [x, z] = navOf(d.place)?.nearestFree(d.to.x + ox, d.to.z + oz) || [d.to.x, d.to.z];
    Object.assign(e, { x, z, place: d.place, anim: 'idle' });
    delete paths[e.id]; delete e.swing;
    delete e.patrol;
    if (fight[e.id]) delete fight[e.id].target;
    e.order = { kind: 'station', x, z, garrison: true };
    return true;
  }

  // Crew standing on each other get nudged apart a little every tick
  function separate() {
    const crew = Object.values(state.entities).filter(e => e.type !== 'hero' && e.place === 'street' && !e.dead && !e.downed);
    for (let i = 0; i < crew.length; i++) for (let j = i + 1; j < crew.length; j++) {
      const a = crew[i], b = crew[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      const min = (statsOf(a).radius + statsOf(b).radius) * 1.1;
      if (d >= min) continue;
      const [ux, uz] = d > 1e-4 ? [dx / d, dz / d] : [1, 0], push = Math.min(0.06, (min - d) / 2);
      for (const [u, s] of [[a, -1], [b, 1]]) {
        const r = statsOf(u).radius;
        tryMove(u, r, ux * push * s, 0);
        tryMove(u, r, 0, uz * push * s);
      }
    }
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
  function bringCrew(hero, from, d, ids = []) {
    const out = d.place === 'street';
    const crew = Object.values(state.entities).filter(u => u.owner === hero.owner && u.type !== 'hero' && !u.guard && !u.dead && !u.downed && u.place === from
      && (ids || []).includes(u.id) && (!out || (u.order?.kind === 'follow' && u.order.target === hero.id && u.order.exitWithHero))
      && deployment.canActAt(u, d.to.x, d.to.z, d.place)
      && (out || Math.hypot(u.x - d.x, u.z - d.z) < BRING_RADIUS))
      .slice(0, out ? Infinity : d.ninja ? 6 : businesses?.crewSlots(hero.owner, d.place) ?? Infinity);   // selected ninja crew climb in through a back window too (Tim 2026-10-21)   // a raid takes at most maxCrewInside crew in
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

  const civilians = createCivilians({
    state, data: civData, pois: district.pois, nav, spawn, moveTo, statsOf,
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
  const bandits = createBandits({
    state, data: banditData, units, camps: district.banditCamps, pois: district.pois, edges: district.edges, nav, spawn, moveTo, fightStep, statsOf,
    canSee: (e, t) => sees(e, t) && nav.clearLine(e.x, e.z, t.x, t.z),
    stopPath: e => { delete paths[e.id]; },
    remove: id => { delete state.entities[id]; delete paths[id]; delete fight[id]; delete intents[id]; },
    seed: (options.seed ?? 12345) ^ 0xba7d,
  });

  // Take a unit off the map (arrested, gone home), and stop anyone's attack order on it
  function removeUnit(id) {
    delete state.entities[id]; delete paths[id]; delete fight[id]; delete intents[id];
    for (const u of Object.values(state.entities)) if (u.order?.target === id && u.order.kind === 'attack') endAttack(u);
  }
  // Police (sim/police.js): they move and fight through the same rules as crew
  const police = units && policeData ? createPolice({
    state, data: policeData, units, district, nav, doors, spawn, spawnOutside, moveTo, statsOf, remove: removeUnit,
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
  const businesses = clans ? createBusinesses({ state, units, clans, onRaidPlaced: clan => rally.raidPlaced(clan), payoutShare: id => police?.payoutShare(id) ?? 1, tierOf: id => police?.tierOf(id) ?? 0,
    spawn, guardSpots, patrolSpots, roomOf: roomOfBusiness, remove: removeUnit, payoutBonus: territory.payoutBonus, addHeatGain: (clan, amount, reason) => state.heatGains.push({ clan, amount, reason }) }) : null;
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
  const contracts = clans ? createContracts({ state, rules: units?.rules?.contracts, scores: scoreOf, backRoom: backRoomOf, stash: stashOf, WILD, seed: (options.seed ?? 12345) ^ 0xc0de, leader: () => territory?.standings().find(r => r.score > 0)?.clan ?? null, inCombat:e=>!!fight[e.id]?.target }) : null;
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
    rally.tick();
    rally.cleanBuffs();
    state.hits = [];      // this tick's hits and ability uses, for the renderer
    state.dodges = [];
    state.casts = [];
    state.heatGains = [];
    state.ryoGains = [];
    state.news = [];         // this tick's big moments (boss knocked out or arrested, War Lantern knocked down), for the screen
    state.policeNews = [];   // this tick's police news per clan ({ clan, kind: 'lost' }), for the screen
    state.dawn = state.dusk = false;
    if (state.clock && --state.clock.left <= 0) setNight(!state.night);
    for (const c of commands) {
      if (c.type === 'time') { setNight(typeof c.night === 'boolean' ? c.night : !state.night); continue; }
      const e = state.entities[c.id];
      if (!e) continue;
      // a hero lying down or in jail can still order his crew, nothing else
      if ((e.dead || e.downed || e.jailed) && !['order', 'move', 'business', 'clinic', 'police', 'contract', 'loot', 'execute', 'deployment'].includes(c.type)) continue;
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
        if (d?.to && deployment.canActAt(e, d.to.x, d.to.z, d.place) && (!businesses || businesses.mayEnter(e, d.place))) {   // menu doors (the clinic) have no room
          const from = e.place;
          e.x = d.to.x; e.z = d.to.z; e.place = d.place;
          if (e.type === 'hero') bringCrew(e, from, d, c.units);
        }
      }
      if (c.type === 'interiorDoor' && !stunned(e, state.tick)) toggleInteriorDoor(e);
      if (c.type === 'hire' && clans) clans.hire(e, c.business, c.unit);
      if (c.type === 'dismiss' && clans) clans.dismiss(e, c.unit, c.business);
      if (c.type === 'business' && businesses) businesses.command(e, c);
      if (c.type === 'order') giveOrder(e, c);
      if (c.type === 'deployment') { deployment.command(e, c); assignments.command(e, c); rally.command(e, c); shinobiAssignments.command(e, c); diversion.command(e, c); }
      if (c.type === 'ability') useAbility(e, c);
      if (c.type === 'snuff') stealth.snuff(e, c.prop);   // a Shinobi boss puts out a lantern (sim/stealth.js)
      if((c.type==='execute'||c.type==='loot')&&c.crewJob&&e.type==='hero'){crewJobs.command(e,c);continue;}
      if (c.type === 'execute' && e.type === 'hero') startExecute(e, c);
      if (c.type === 'loot') startLoot(e, c);
      if (c.type === 'attack' && e.type === 'hero' && !e.dead && fair(e, state.entities[c.target]) && sees(e, state.entities[c.target])) {
        if (c.assist && Array.isArray(c.units)) for (const id of c.units) {
          const u = state.entities[id], t = state.entities[c.target];
          if (u?.owner === e.owner && u.type !== 'hero' && !u.guard && !u.crewJob && deployment.canActAt(u, t.x, t.z, t.place)) manualCrew(u);
        }
        if (e.execute) { giveOrder(e, { ...c, type: 'order', kind: 'attack' }); continue; }
        if (e.swing?.target !== c.target) delete e.swing;
        setAssistCrew(e, c.assist ? c.units : []);
        for (const id of e.assistCrew || []) { const u = state.entities[id]; delete u.smokePassive; delete u.holdFire; }
        e.attackTarget = c.target; delete e.holdFire;
      }
      // left-click elsewhere (Tim 2026-10-18): the hero drops his locked target and stops swinging at it
      if ((c.type === 'stopattack' || c.type === 'cancel') && e.type === 'hero') {
        if (Array.isArray(c.units)) setAssistCrew(e, c.units);
        if (e.swing?.target === e.attackTarget) delete e.swing;
        delete e.attackTarget; delete e.assistCrew;
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
    kuroda.tick();
    clans?.tick(DT, spawnOutside);
    syncCrewAttacks();
    sectorRecovery.tick();
    for (const f of Object.values(fight)) f.cd = Math.max(0, f.cd - DT);
    for (const e of Object.values(state.entities)) {
      const unit = statsOf(e);
      if (e.type === 'civilian' || e.wild || e.cop) continue;   // townsfolk, bandits and police move in their own ticks below
      if (e.type !== 'hero') { crewStep(e, unit); continue; }
      if (e.dead || e.downed || e.jailed) continue;      // knocked down by the police, or in jail (sim/police.js)
      if (stunned(e, state.tick)) { e.anim = 'idle'; continue; }
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
      e.anim = c.walk ? 'walk' : 'run';
      e.dir = dirIndex(dx, dz);
      const d = stats.movement(e, e.anim) * DT / len;
      tryMove(e, unit.radius, dx * d, 0);
      tryMove(e, unit.radius, 0, dz * d);
    }
    civilians.tick();
    bandits.tick();
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
    let x = e.x + dx, z = e.z + dz;
    for (const b of blockersNear(Math.min(e.x, x) - r, Math.min(e.z, z) - r, Math.max(e.x, x) + r, Math.max(e.z, z) + r)) {
      if (!(x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ)) continue;
      if (dx > 0) x = Math.min(x, b.minX - r - 1e-4);
      else if (dx < 0) x = Math.max(x, b.maxX + r + 1e-4);
      else if (dz > 0) z = Math.min(z, b.minZ - r - 1e-4);
      else z = Math.max(z, b.maxZ + r + 1e-4);
    }
    // never step backwards (when already overlapping something)
    if ((dx ? Math.sign(x - e.x) === Math.sign(dx) : Math.sign(z - e.z) === Math.sign(dz)) && deployment.canOccupy(e, x, z)) { e.x = x; e.z = z; }
  }

  return { state, step, spawn, scenery, settings: { units, civilians: civData, bandits: banditData, police: policeData, dayNight }, blockers, rooms, doors, interiorDoors, interiorDoorNear, doorNear, serviceAt, clans, nav, civilians, bandits, police, businesses, contracts, vision, territory, stealth, hqCamping, deployment, assignments, rally, shinobiAssignments, shinobiIntelligence, sectorRecovery, diversion, stats };
}
