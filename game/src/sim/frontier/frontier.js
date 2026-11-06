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
import { ensureGrid, townBlockersIn } from './town_grid.js';
import { createGarrison } from './garrison.js';
import { createInfirmary } from './infirmary.js';
import { livingWorldUnits } from './building_safety.js';
import { createPlacement } from './placement.js';
import { createZones } from './zones.js';
import { createWorkers, ensureWorkers } from './workers.js';
import { createArrivals } from './arrivals.js';

export function createFrontier({ state, data, world: worldData = null, spotData = null, spotRules = null, removeUnit = () => {} }) {
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
  const governor = createGovernor({ state, data, world: live, economy, construction, zones, workers, placement: () => placement });
  const modules = [{ name: 'workers', workers, econTick: () => workers.econTick() }, { name: 'economy', econTick: () => economy.run() }, { name: 'construction', econTick: () => construction.run() },
    { name: 'governor', econTick: () => governor.run() }, { name: 'alerts', econTick: () => alerts.econTick() }];
  const alerts = createAlerts({ state, data });
  const arrivals = createArrivals({ state, data });
  const founding = data.founding ? createFounding({ state, data, world: worldData, removeUnit, resourceIndex:workers.index }) : null;
  const placement = createPlacement({ state, data, world: live, construction, resourceIndex:workers.index });
  modules.push({ name: 'placement', placement }, { name: 'zones', zones });
  const commands = createCommands({ state, data, world: live, economy, construction, governor, founding, worldData, placement, zones, workers });
  const garrison = createGarrison({ state, data, world: live });
  const infirmary = createInfirmary({ state, data });   // Tim 2026-11-06: heals nearby units, revives the island's fallen
  modules.push({ name: 'garrison', command: (e, c) => garrison.command(e, c) });
  modules.push({ name: 'commands', command: (e, c) => commands.command(e, c) });   // F2.4+ economy modules, run in this order each economy tick

  function tick() {
    ensure();
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
    workers.tick();                // integer sim ticks, independent of economy cadence and the camera
    arrivals.tick();               // B7: cosmetic newcomers walking in, level-up effects
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

  function attach(services) {runtime=services;Object.assign(trade,services.trade||{});workers.attach(services);arrivals.attach(services);founding?.attach(services);}
  return { get world() { return ensure(); }, tick, command, modules, data, founding, garrison, infirmary, attach };
}
