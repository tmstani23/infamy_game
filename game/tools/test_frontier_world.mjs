// F2.2: frontier world records, ids, ledger and totals. Run from the repo root:
//   node game/tools/test_frontier_world.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFrontierWorld } from '../src/sim/frontier/world.js';
import { createGame } from '../src/sim/game.js';
import { patch } from '../src/sim/save.js';
import { createFrontier } from '../src/sim/frontier/frontier.js';

const data = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url)));
const fresh = () => { const state = { tick: 0 }; return { state, world: createFrontierWorld({ state, data }) }; };

// records match the data file
{
  const { state, world } = fresh();
  const f = state.frontier;
  assert.equal(f.version, data.version);
  assert.deepEqual(Object.keys(f.settlements).sort(), Object.keys(data.settlements).sort());
  const s = world.settlement('s_frontier_1');
  assert.equal(s.pop, 8);
  assert.deepEqual(s.stock, { food: 60, timber: 40, stone: 10, goods: 0, ryo: 0 });
  assert.equal(s.buildings.length, 3);
  assert.equal(s.housing, 12, 'two houses of 6');
  assert.equal(s.owner, null);
  assert.equal(f.roads.r1.from, 'capital');
  assert.equal(f.roads.r1.to, 's_frontier_1');
  assert.equal(f.roads.r1.length, 540);
  assert.equal(f.roads.r1.state, 'working');
  assert.equal(world.settlement('nope'), null);
  world.checkInvariants();
}

// ids: p1, p2 and they survive a structuredClone of the state
{
  const { state, world } = fresh();
  assert.equal(world.newId('p'), 'p1');
  assert.equal(world.newId('p'), 'p2');
  const copy = structuredClone(state);
  const world2 = createFrontierWorld({ state: copy, data });   // adopts the existing state.frontier
  assert.equal(world2.newId('p'), 'p3');
  assert.equal(world2.newId('b'), 'b4');
  assert.deepEqual(copy.frontier.settlements, state.frontier.settlements);
}

// ledger is capped at 500 and totals equal the sum of every delta (2,000 calls)
{
  const { state, world } = fresh();
  let sumIn = 0, sumOut = 0;
  for (let i = 0; i < 2000; i++) {
    const delta = (i % 3 === 0 ? -1 : 1) * (0.25 + (i % 7));
    state.tick = i;
    world.ledgerAdd({ settlement: 's_frontier_1', resource: 'food', delta, reason: 'test' });
    if (delta > 0) sumIn += delta; else sumOut -= delta;
    assert.ok(state.frontier.ledger.length <= 500);
  }
  const t = state.frontier.totals.s_frontier_1.food;
  assert.equal(t.in, sumIn);
  assert.equal(t.out, sumOut);
  assert.equal(state.frontier.ledger.length, 500);
  assert.equal(state.frontier.ledger.at(-1).tick, 1999);
  assert.equal(state.frontier.ledger[0].tick, 1500, 'oldest dropped first');
}

// change() writes stock, totals and ledger together
{
  const { state, world } = fresh();
  world.change('s_frontier_1', 'timber', -15, 'build');
  world.change('s_frontier_1', 'food', 2.5, 'farm');
  assert.equal(world.settlement('s_frontier_1').stock.timber, 25);
  assert.equal(state.frontier.totals.s_frontier_1.timber.out, 15);
  assert.equal(state.frontier.totals.s_frontier_1.food.in, 2.5);
  assert.equal(state.frontier.ledger.length, 2);
  world.checkInvariants();
  const before = JSON.stringify(state);
  assert.throws(() => world.change('s_frontier_1', 'stone', -11, 'build'), /negative/);
  assert.throws(() => world.change('s_frontier_1', 'gold', 1, 'x'), /unknown/);
  assert.equal(JSON.stringify(state), before, 'a refused change writes nothing');
  world.setOwner('s_frontier_1', 'player');
  assert.equal(world.settlement('s_frontier_1').owner, 'player');
}

// F2.3: the frontier runs inside the full sim, and only when options.frontier is set
{
  const json = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url)));
  const options = { district: json('data/waterfront.json'), catalog: json('data/art.json'),
    cutouts: json('art/cutouts.json'), interiors: json('data/interiors.json'),
    parts: json('data/interior_parts.json'), recipes: json('data/room_recipes.json'), units: json('data/units.json') };
  const g = createGame({ ...options, frontier: data });
  g.clans.addClan('player', { faction: 'yakuza', kind: 'yakuza', bot: false });
  const hero = g.spawn('hero', 'ronin', -8, 1, { owner: 'player', holdFire: true });
  for (let i = 0; i < 200; i++) g.step(i === 50 ? [{ id: hero, type: 'frontier', action: 'noop' }] : []);
  assert.equal(g.state.frontier.econTick, 10, '200 ticks at cadence 20');
  assert.ok(g.frontier && g.frontier.world.settlement('s_frontier_1'));
  g.frontier.world.checkInvariants();
  // a save without a frontier (older save) loaded into a frontier game: fresh records, still ticking
  const plainGame = createGame(options);
  plainGame.step([]);
  patch(g.state, structuredClone(plainGame.state));
  assert.equal(g.state.frontier, undefined);
  g.step([]);
  assert.equal(g.frontier.world.settlement('s_frontier_1').pop, 8);
  g.frontier.world.checkInvariants();
  // and a save with a frontier keeps it (the hub follows the same records)
  const saved = structuredClone(g.state);
  saved.frontier.econTick = 77;
  patch(g.state, saved);
  assert.equal(g.frontier.world.frontier.econTick, 77);
  assert.equal(plainGame.state.frontier, undefined, 'no frontier option, no state.frontier');
  assert.equal(plainGame.frontier, null);
}
// F2.9: owners, a bot clan's town and the capital's ryo = the clan treasury (fixture towns only)
{
  const mkState = () => ({ tick: 0, ryoGains: [], clans: { player: { id: 'player', ryo: 1000 }, kuroda: { id: 'kuroda', ryo: 800 } } });
  const state = mkState();
  const fr = createFrontier({ state, data });
  const w = fr.world;
  w.assignStartOwners({ player: 'player', bot: 'kuroda' });
  assert.equal(w.settlement('s_frontier_1').owner, 'player');
  assert.equal(w.settlement('s_frontier_2').owner, 'kuroda');
  assert.equal(w.settlement('capital').owner, 'player');
  assert.equal(state.frontier.roads.r2.to, 's_frontier_2');
  // capital ryo: spending lowers the clan treasury by the same amount; credits raise it
  assert.equal(w.settlement('capital').stock.ryo, 1000);
  w.change('capital', 'ryo', -250, 'test');
  assert.equal(state.clans.player.ryo, 750);
  assert.equal(w.settlement('capital').stock.ryo, 750);
  assert.equal(state.ryoLosses.at(-1).amount, 250);
  w.change('capital', 'ryo', 40, 'test');
  assert.equal(state.clans.player.ryo, 790);
  assert.equal(state.ryoGains.at(-1).amount, 40);
  assert.throws(() => w.change('capital', 'ryo', -5000, 'test'), /negative/);
  assert.equal(state.clans.player.ryo, 790, 'a refused spend changes nothing');
  state.clans.player.ryo = 900;           // changed elsewhere (a shop)
  fr.tick();                               // the hub re-syncs the mirror
  assert.equal(w.settlement('capital').stock.ryo, 900);
  w.checkInvariants();

  // both towns grow over 500 economy ticks; a bot clan drives its town only through commands
  const bot = { owner: 'kuroda' };
  const rejected = [];
  const cmd = c => { fr.command(bot, { type: 'frontier', ...c }); const r = state.frontier.receipts.at(-1); if (!r.ok) rejected.push(r); };
  cmd({ action: 'setAutoBuild', settlement: 's_frontier_2', on: true });
  cmd({ action: 'setBudget', settlement: 's_frontier_2', ryo: 200 });
  for (let i = 0; i < 500 * data.cadenceTicks; i++) {
    fr.tick(); state.tick++;
    if (i % 100 === 0) for (let k = state.frontier.settlements.s_frontier_2.suggestions?.length || 0; k > 0; k--) cmd({ action: 'approveSuggestion', settlement: 's_frontier_2', index: 0 });
  }
  assert.equal(state.frontier.econTick, 500);
  for (const id of ['s_frontier_1', 's_frontier_2']) assert.ok(state.frontier.settlements[id].pop > 8, `${id} grew`);
  assert.deepEqual(rejected, [], 'the bot town only issues commands that get ok');
  assert.ok(state.frontier.receipts.length === 0 || state.frontier.receipts.every(r => r.tick >= state.tick - 1));
  w.checkInvariants();

  // a structuredClone of state.frontier restored into a fresh game runs on identically for 50 economy ticks
  const twin = mkState(); twin.tick = state.tick; twin.clans = structuredClone(state.clans);
  twin.frontier = structuredClone(state.frontier);
  const fr2 = createFrontier({ state: twin, data });
  for (let i = 0; i < 50 * data.cadenceTicks; i++) { fr.tick(); state.tick++; fr2.tick(); twin.tick++; }
  assert.equal(JSON.stringify(twin.frontier), JSON.stringify(state.frontier));
  fr2.world.checkInvariants();
}
// F4.4c: town alerts
{
  const { createFrontier } = await import('../src/sim/frontier/frontier.js');
  const state = { tick: 0, news: [] };
  const fr = createFrontier({ state, data: { ...data, dev: true } });
  fr.world.setOwner('s_frontier_1', 'player');
  const run = n => { const seen = []; for (let i = 0; i < n * 20; i++) { state.tick++; state.news = []; fr.tick(); seen.push(...state.news.filter(x => x.kind === 'town')); } return seen; };
  const s = state.frontier.settlements.s_frontier_1;
  s.buildings = s.buildings.filter(b => b.type !== 'farm'); fr.world.recount(s.id);   // no farm: food runs out for real
  run(3);
  // a sustained shortage fires exactly one alert, and again only after it clears and the cooldown passed
  s.stock.food = 0; let n = 0;
  const foods = () => run(1).filter(x => x.event === 'food');
  for (let i = 0; i < 10; i++) n += foods().length;
  assert.equal(n, 1, 'one food alert while the shortage lasts');
  s.stock.food = 500; run(3); run(25);
  s.stock.food = 0; s.pop = 8; n = 0; for (let i = 0; i < 6; i++) n += foods().length;
  assert.equal(n, 1, 'fires again after it cleared');
  // cooldown: a quick on/off flips do not repeat
  const a = []; for (let i = 0; i < 6; i++) { state.frontier.roads.r1.state = i % 2 ? 'working' : 'blocked'; a.push(...run(1).filter(x => x.event === 'blocked')); }
  assert.ok(a.length <= 1, 'cooldown holds for road alerts');
  assert.equal(a[0]?.urgent ?? true, true);
  // alerts only go to the owner
  assert.ok(state.news.every(x => x.clan === 'player'));
  fr.world.setOwner('s_frontier_2', 'kuroda');
  const other = run(3); assert.ok(other.filter(x => x.settlement === 's_frontier_2').every(x => x.clan === 'kuroda'));
  // attack: safety drop
  run(30); const before = state.frontier.alertState.s_frontier_1.at.attack; s.safety = 10;
  assert.ok(run(1).some(x => x.event === 'attack' && x.urgent), 'attack alert is urgent');
}
console.log('test_frontier_world: ok');
