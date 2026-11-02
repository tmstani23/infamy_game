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

export function createFrontier({ state, data }) {
  let world = createFrontierWorld({ state, data });
  const cadence = Math.max(1, data.cadenceTicks || 20);
  const ctx = { state, data, world };
  // A save from before the frontier existed has no state.frontier: loading it deletes ours, so
  // rebuild fresh records from the data (save.js patch keeps the object when the save has one).
  function ensure() {
    if (state.frontier !== world.frontier) ctx.world = world = createFrontierWorld({ state, data });
    return world;
  }
  // modules follow the current world records even after a save load swaps them (ensure)
  const live = new Proxy({}, { get: (_, k) => ensure()[k] });
  const economy = createEconomy({ state, data, world: live });
  const construction = createConstruction({ state, data, world: live });
  const governor = createGovernor({ state, data, world: live, economy, construction });
  const modules = [{ name: 'economy', econTick: () => economy.run() }, { name: 'construction', econTick: () => construction.run() },
    { name: 'governor', econTick: () => governor.run() }];
  const commands = createCommands({ state, data, world: live, economy, construction, governor });
  modules.push({ name: 'commands', command: (e, c) => commands.command(e, c) });   // F2.4+ economy modules, run in this order each economy tick

  function tick() {
    ensure();
    commands.clearOldReceipts();   // receipts live one tick
    world.syncCapital();           // the capital's ryo mirrors the clan treasury
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

  return { get world() { return ensure(); }, tick, command, modules, data };
}
