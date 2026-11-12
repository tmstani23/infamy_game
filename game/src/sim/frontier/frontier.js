// Frontier hub (frontier plan F2.3). Owns the frontier world records (world.js) and the F2 rule
// modules, and is what sim/game.js talks to: tick() once per sim tick, command(e, c) for
// { type: 'frontier' } commands. The economy runs only every data.cadenceTicks sim ticks;
// state.frontier.econTick counts economy ticks. All state lives in state.frontier (plain data).
// Later F2 steps add their module to `modules` below; each may define econTick(ctx) and
// command(e, c, ctx) (ctx = { state, data, world }) and returns true when it handled the command.
import { createFrontierWorld } from './world.js';
import { createEconomy } from './economy.js';
import { createConstruction } from './construction.js';
import { createGovernor } from './governor.js';
import { createCommands } from './commands.js';
import { createAlerts } from './alerts.js';
import { createFounding } from './founding.js';
import { ensureGrid, townBlockersIn, townBlockersTick, townBlockersVersion } from './town_grid.js';
import { createGarrison } from './garrison.js';
import { createInfirmary } from './infirmary.js';
import { createStable } from './stable.js';
import { createRail } from './rail.js';
import { createShipments } from './shipments.js';
import { livingWorldUnits } from './building_safety.js';
import { createPlacement } from './placement.js';
import { createZones } from './zones.js';
import { createWorkers, ensureWorkers } from './workers.js';
import { createArrivals } from './arrivals.js';
import { createTownsfolk } from './townsfolk.js';
import { createWar } from './war.js';
import { createStructures } from './structures.js';

export function createFrontier({ state, data, world: worldData = null, spotData = null, spotRules = null, removeUnit = () => {}, capitalYard = null, civilians = null, dayTicks = 12000 }) {
  let world = createFrontierWorld({ state, data });
  const cadence = Math.max(1, data.cadenceTicks || 20);
  const ctx = { state, data, world };
  let runtime=null, recovered=null;
  // A save from before the frontier existed has no state.frontier: loading it deletes ours, so
  // rebuild fresh records from the data (save.js patch keeps the object when the save has one).
  function ensure() {
    if (state.frontier !== world.frontier) ctx.world = world = createFrontierWorld({ state, data });
    // L3.1: every positioned town gets its grid (old saves and addTown towns migrate here; spiral slots become grid cells)
    for (const s of Object.values(state.frontier.settlements)) {
      if (!s.grid) ensureGrid(s, worldData, data); ensureWorkers(s);
      if(s.founded!==undefined)s.roadReserve ??= data.townGrid?.hallRoadReserve || 0;
    }
    return world;
  }
  // modules follow the current world records even after a save load swaps them (ensure)
  const live = new Proxy({}, { get: (_, k) => ensure()[k] });
  const workers = createWorkers({state,data,world:live,spotData,spotRules});
  const zones = createZones({ state, data, world: live,resourceIndex:workers.index });
  const trade = {};   // C4 Influence hooks (export price, trade volume), filled by attach()
  const economy = createEconomy({ state, data, world: live, zones, workers, trade });
  const construction = createConstruction({ state, data, world: live,resourceIndex:workers.index });
  const shipRef = {};   // filled once shipments exist (the rail clerk)
  const governor = createGovernor({ state, data, world: live, economy, construction, zones, workers, placement: () => placement, ship: shipRef });
  const modules = [{ name: 'workers', workers, econTick: () => workers.econTick() }, { name: 'economy', econTick: () => economy.run() }, { name: 'construction', econTick: () => construction.run() },
    { name: 'governor', econTick: () => governor.run() }, { name: 'alerts', econTick: () => alerts.econTick() }];
  const alerts = createAlerts({ state, data });
  const arrivals = createArrivals({ state, data });
  const townsfolk = createTownsfolk({ state, data, civilians });   // Tim 2026-11-07: citizens wandering your towns in peacetime
  const founding = data.founding ? createFounding({ state, data, world: worldData, removeUnit, resourceIndex:workers.index }) : null;
  const placement = createPlacement({ state, data, world: live, construction, resourceIndex:workers.index });
  modules.push({ name: 'placement', placement }, { name: 'zones', zones });
  const commandHooks = {};   // .rail once it exists (a removed station tears up its lines)
  const commands = createCommands({ state, data, world: live, economy, construction, governor, founding, worldData, placement, zones, workers, hooks: commandHooks });
  const garrison = createGarrison({ state, data, world: live, atWar: (clan, s) => { const w = war.warOn(s.id); return !!w && w.attacker === clan; } });
  const infirmary = createInfirmary({ state, data });   // Tim 2026-11-06: heals nearby units, revives the island's fallen
  const stable = createStable({ state, data, world: live, capitalYard });   // capitalYard: the island side of the city gate (the capital stable)   // Tim 2026-11-06: horses and omnibuses, made by hand
  modules.push({ name: 'garrison', command: (e, c) => garrison.command(e, c) });
  modules.push({ name: 'stable', command: (e, c) => stable.command(e, c) });
  const rail = createRail({ state, data, world: live, worldData, stable });   // train plan: railway links between stations
  commandHooks.rail = rail;
  modules.push({ name: 'rail', rail, econTick: () => rail.econTick(), command: (e, c) => rail.command(e, c) });
  const shipments = createShipments({ state, data, world: live });   // rail shipments S1: orders, keep amounts, reserved stock
  rail.setShipping(shipments.arrive, shipments.load, shipments.tearDown);
  shipRef.clerk = shipments.clerk;
  modules.push({ name: 'shipments', shipments, econTick: () => shipments.econTick(), command: (e, c) => shipments.command(e, c) });
  const war = createWar({ state, data, world: live, worldData, resourceIndex: workers.index, dayTicks });   // F6 checkpoint 1: war records, planting the banner declares war
  modules.push({ name: 'war', war, econTick: () => war.econTick(), command: (e, c) => war.command(e, c) });
  zones.setFrozen(s => !!war.warOn(s.id));   // 7c: zone cells do not grow or grow back while a war is on the town
  const structures = createStructures({ state, data, world: live, war, garrison, workers });   // F6 checkpoint 6: structure health, attacks, ruins
  modules.push({ name: 'commands', command: (e, c) => commands.command(e, c) });   // F2.4+ economy modules, run in this order each economy tick

  // collision checkpoint 5b: a unit standing where a house grows or a war camp building is finished steps to the
  // nearest open ground (checked only when something solid appears or goes)
  let nudgedAt=-1,nudgedFor=null;
  function nudgeOut() {
    const v=townBlockersVersion(state.frontier,data);
    if(v===nudgedAt && nudgedFor===state.frontier)return;
    nudgedAt=v;nudgedFor=state.frontier;
    const solid=(x,z,pad=0)=>townBlockersIn(state.frontier,x-pad,z-pad,x+pad,z+pad,data).length>0;
    for(const e of livingWorldUnits(state)) {
      if(e.garrison || e.worker || e.cart || e.townsfolk || !solid(e.x,e.z))continue;   // workers, carts and townsfolk follow their own routes
      search: for(let r=0.5;r<=20;r+=0.5)for(let k=0;k<16;k++) {
        const x=e.x+Math.cos(k*Math.PI/8)*r,z=e.z+Math.sin(k*Math.PI/8)*r;
        if(solid(x,z,0.4) || runtime?.areas && runtime.areas.nav?.free && !runtime.areas.nav.free(x,z))continue;
        e.x=x;e.z=z;
        for(const s of Object.values(state.frontier.settlements)){const w=s.workers?.find(w=>w.entity===e.id);if(w){w.departure=[x,z];delete w.retryAt;}}
        break search;
      }
    }
  }
  function tick() {
    townBlockersTick();
    ensure();
    nudgeOut();
    // Older collision checkpoints could save a unit inside a finished hall. Repair only
    // actual overlap once on load; use the same terrain-aware navigation as worker trips.
    if(runtime?.areas && recovered!==state.frontier) {
      recovered=state.frontier;
      for(const e of livingWorldUnits(state))if(townBlockersIn(state.frontier,e.x,e.z,e.x,e.z).length) {
        const route=runtime.areas.nav.workerPath(e.x,e.z,e.x,e.z),point=route?.at(-1);
        if(point && !townBlockersIn(state.frontier,...point,...point).length) {
          [e.x,e.z]=point;
          for(const s of Object.values(state.frontier.settlements)) {
            const w=s.workers?.find(w=>w.entity===e.id);if(w){w.departure=[...point];delete w.retryAt;}
          }
        }
      }
    }
    commands.clearOldReceipts();   // receipts live one tick
    world.syncCapital();           // the capital's ryo mirrors the clan treasury
    garrison.tick();               // stockade garrison: sheltered units stand at the stockade
    infirmary.tick();              // units near their own infirmary heal faster
    stable.tick();                 // the stable's production bar
    rail.tick();                   // the rail gang at each railhead
    workers.tick();                // integer sim ticks, independent of economy cadence and the camera
    war.tick();                    // F6: camp training queues
    structures.tick();             // F6: fires on torched structures
    arrivals.tick();               // B7: cosmetic newcomers walking in, level-up effects
    townsfolk.tick();              // townsfolk wander the town by day, go in at night or when enemies come
    // keyed off state.tick (not a counter of our own), so a loaded save keeps the same rhythm
    if ((state.tick ?? 0) % cadence !== cadence - 1) return;
    state.frontier.econTick++;
    for (const m of modules) m.econTick?.(ctx);
  }

  // [{ id, type: 'frontier', action, ... }] from a player, bot or governor (same path for all)
  function command(e, c) {
    ensure();
    for (const m of modules) if (m.command?.(e, c, ctx)) return true;
    return false;
  }

  function attach(services) {runtime=services;Object.assign(trade,services.trade||{});workers.attach(services);arrivals.attach(services);townsfolk.attach(services);rail.attach(services);founding?.attach(services);war.attach(services);structures.attach(services);}
  return { get world() { return ensure(); }, tick, command, modules, data, founding, garrison, infirmary, stable, rail, shipments, war, structures, attach };
}
