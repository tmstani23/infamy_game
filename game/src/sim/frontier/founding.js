import { modeRules } from '../modes/index.js';
// Founding a frontier town (frontier plan E3). Pure rules: no randomness, no DOM. A town can be
// founded anywhere buildable at least founding.minSpacing from other towns (Tim, 2026-11-02); bot
// clans found only within founding.botSiteRadius of one of the W1 sites. Traits (soil, water,
// defense, 1 to 3) are computed from the terrain round the spot, so any spot has them.
// All numbers live in data/frontier.json "founding". Players, bots and governors use the same
// command: { id: <hero id>, type: 'frontier', action: 'found', x?, z?, name? }.
import { terrainAt, buildable, passable } from '../world_data.js';
import { ensureGrid } from './town_grid.js';
import { livingWorldUnits } from './building_safety.js';
import {coversResources} from './resource_clearance.js';

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

export function createFounding({ state, data, world, removeUnit, resourceIndex }) {
  const D = data.founding, f = () => state.frontier;
  let navigation = null;
  const attach = ({areas}) => {navigation=areas?.nav;};

  // Why a spot is not good, or null when it is. `clan` = the founding clan record, `hero` its hero.
  function whyNot(clan, hero, settlers, wd = world, point = hero) {
    if (!wd) return 'no island';
    if (!modeRules(state).founding) return 'Towns are founded in a campaign';
    if (!hero || hero.dead || hero.downed || hero.place !== 'world') return 'Found a town out on the island';
    if (settlers.length < D.minSettlers) return `Bring at least ${D.minSettlers} settlers (${settlers.length} with you)`;
    if (clan.ryo < D.cost) return `Founding costs ${D.cost} ryo`;
    if(!Number.isFinite(point?.x) || !Number.isFinite(point?.z))return 'Choose a hall position';
    if(Math.hypot(point.x-hero.x,point.z-hero.z)>(D.placementRange || D.gatherRadius))return 'Hall is too far from the hero';
    if (Math.hypot(point.x - wd.capital.x, point.z - wd.capital.z) < D.minSpacing) return `Too close to the capital (${D.minSpacing} units apart)`;
    for (const s of Object.values(f().settlements)) {
      if (s.x === undefined) continue;
      if (Math.hypot(point.x - s.x, point.z - s.z) < D.minSpacing) return `Too close to ${s.name} (${D.minSpacing} units apart)`;
    }
    const half=data.townGrid.cellSize/2,clearance=D.unitClearance ?? 1;
    if(coversResources({x:point.x,z:point.z,grid:{n:1,cell:data.townGrid.cellSize}},[0],resourceIndex,clearance))return 'Hall footprint covers a resource area';
    for(const dx of [-half,0,half])for(const dz of [-half,0,half]) {
      if(!buildable(wd,point.x+dx,point.z+dz) || !passable(wd,point.x+dx,point.z+dz))return 'Hall footprint: this ground cannot be built on';
    }
    if(livingWorldUnits(state).some(e=>Math.abs(e.x-point.x)<half+clearance && Math.abs(e.z-point.z)<half+clearance))return 'Hall footprint needs clearance from units';
    const ring=data.townGrid.cellSize;
    const blocked=(x,z)=>Math.abs(x-point.x)<half+clearance && Math.abs(z-point.z)<half+clearance;
    const exits=[[ring,0],[-ring,0],[0,ring],[0,-ring]].filter(([dx,dz])=>passable(wd,point.x+dx,point.z+dz));
    if(!exits.length)return 'Hall needs escape clearance';
    if(navigation) {
      const reaches=(route,dx,dz)=>route && Math.hypot(route[0][0]-hero.x,route[0][1]-hero.z)<=clearance && Math.hypot(route.at(-1)[0]-point.x-dx,route.at(-1)[1]-point.z-dz)<=clearance;
      const accessible=exits.filter(([dx,dz])=>reaches(navigation.workerPath(hero.x,hero.z,point.x+dx,point.z+dz),dx,dz));
      if(!accessible.length || accessible.some(([dx,dz])=>!reaches(navigation.workerPath(hero.x,hero.z,point.x+dx,point.z+dz,blocked),dx,dz)))return 'Hall needs a clear walking approach and escape route';
    }
    if (clan.bot) {
      const site = (wd.sites || []).find(si => Math.hypot(point.x - si.x, point.z - si.z) <= D.botSiteRadius && !Object.values(f().settlements).some(s => s.site === si.id));
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
  function check(hero, wd = world, point = null) {
    const clan = state.clans?.[hero?.owner];
    if (!clan) return { ok: false, reason: 'no clan', settlers: 0, cost: D.cost };
    const settlers = settlersWith(hero), target=point ? {x:Math.round(point.x),z:Math.round(point.z)} : {x:Math.round(hero.x+data.townGrid.cellSize*2),z:Math.round(hero.z)};
    const reason = whyNot(clan, hero, settlers, wd, target);
    return { ok: !reason, reason, settlers: settlers.length, cost: D.cost, point:target, half:data.townGrid.cellSize/2 };
  }

  // Founds at the validated mouse position (legacy commands use a clear offset).
  function found(hero, name, wd, w, construction, point = null) {
    const clan = state.clans?.[hero?.owner];
    if (!clan) return { ok: false, reason: 'no clan' };
    const settlers = settlersWith(hero), checked=check(hero,wd,point);
    if (!checked.ok) return checked;
    const site=checked.point;
    const nth = Object.values(f().settlements).filter(s => s.founded).length + 1;
    const region = (wd.regions || []).find(r => r.box && site.x >= r.box[0] && site.z >= r.box[1] && site.x <= r.box[2] && site.z <= r.box[3]);
    const id = w.newId('t');
    const town = w.addTown({
      id, name: (typeof name === 'string' && name.trim().slice(0, 24)) || `${region?.name || 'Frontier'} ${nth > 1 ? `Settlement ${nth}` : 'Settlement'}`,
      region: region?.id ?? null, owner: clan.id, x: site.x, z: site.z,
      site: (wd.sites || []).find(si => Math.hypot(site.x - si.x, site.z - si.z) <= D.botSiteRadius)?.id ?? null,
      traits: siteTraits(wd, site.x, site.z, D.traits), pop: settlers.length, stock: D.startStock,
      roadReserve: data.townGrid?.hallRoadReserve || 0,
      buildings: (D.startBuildings || [D.townHall]).map((type, i) => ({ type, stage: 'built', cell: i })),
    });
    ensureGrid(town, wd, data);   // L3.1: the town grid, water and mountain cells marked x; the hall takes the centre
    w.payFounding(clan, D.cost, town.id);
    for (const u of settlers) removeUnit(u.id);
    if (D.firstProject) construction.queue(id, D.firstProject);
    return { ok: true, id };
  }

  return { check, found, settlersWith, whyNot, attach };
}
