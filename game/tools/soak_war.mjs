// War checkpoint 8d-6: bot-vs-bot war runs for balance. One seeded war per run: a bot clan with the given attack
// strategy launches from its own town at another bot clan's town of the given size, both sides run by their
// generals (sim/war_general_brain.js). Prints one JSON line per run: who won, how long the war took (from the banner),
// ryo spent and troops lost on each side.
//   node game/tools/soak_war.mjs <attack> <defence> <size> [seed] [maxMinutes]
//   node game/tools/soak_war.mjs all [seed] [maxMinutes]        every pair against every size (27 runs)
// attack, defence: rush | siege | raider.  size: camp | average | built (the fixture towns below; placeholders).
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';
import { STRATEGIES } from '../src/sim/frontier/war_general.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json');
export const SIZES = {
  camp: { tier: 1, pop: 8, prep: 0, stock: { food: 800, ryo: 600, timber: 300, stone: 150, goods: 60 } },
  average: { tier: 2, pop: 30, prep: 6000, stock: { food: 3000, ryo: 2500, timber: 1500, stone: 800, goods: 300 } },
  built: { tier: 3, pop: 80, prep: 14000, stock: { food: 8000, ryo: 6000, timber: 5000, stone: 3000, goods: 800 } },
};
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'),
  frontier: { ...data('data/frontier.json'), fixtureTowns: false, dev: true } });

export function runWar({ attack, defence, size, seed = 1, maxMinutes = 90, tune = null, log = null }) {
  const o = options(); tune?.(o.frontier);
  const Z = SIZES[size], g = createGame(o);
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: o.district.spawns, test: { playerRyo: 1000 }, seed });
  const S = g.state, [A, B] = Object.keys(S.clans).filter(c => c !== 'player');
  // two sites a short march apart (founding.minSpacing or more), away from the capital, picked by the seed
  const sites = world.sites.filter(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700);
  const pairs = [];
  for (const a of sites) for (const b of sites) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (a !== b && d >= 1650 && d <= 2100) pairs.push([a, b]); }
  const [sa, sb] = pairs[seed % pairs.length];
  const hall = o.frontier.founding.townHall;
  g.frontier.world.addTown({ id: 'tA', name: 'Attacker', owner: A, x: sa.x, z: sa.z, pop: 30, stock: { food: 5000, ryo: 4000, timber: 3000, stone: 2000, goods: 400 }, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
  g.frontier.world.addTown({ id: 'tB', name: 'Defender', owner: B, x: sb.x, z: sb.z, pop: Z.pop, stock: { ...Z.stock }, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
  const tA = S.frontier.settlements.tA, tB = S.frontier.settlements.tB;
  tB.tier = Z.tier;
  S.clans[A].warStrategy = attack; S.clans[B].warStrategy = defence;
  const heroOf = c => Object.values(S.entities).find(e => e.type === 'hero' && e.owner === c);
  Object.assign(heroOf(A), { place: 'world', x: tA.x + 30, z: tA.z }); Object.assign(heroOf(B), { place: 'world', x: tB.x + 30, z: tB.z });
  g.step([]);
  const gens = makeBots(g, m.rivals).filter(b => b.config?.general && (b.config.clan === A || b.config.clan === B));
  const step = n => { for (let i = 0; i < n; i++) g.step(gens.flatMap(b => b.tick())); };
  // peace first: the defender builds what its strategy and stock allow; the attacker's town is too young to launch
  tA.founded = S.tick + 1e9;
  step(Z.prep);
  tA.founded = -1e9;
  const War = g.frontier.war, max = Math.round(maxMinutes * 60 * 20);
  let w = null, guard = 0;
  while (!(w = War.warOn('tB')) && guard++ < 40) step(500);
  if (!w) return { attack, defence, size, seed, result: 'no war', note: gens.find(b => b.config.clan === A).view() };
  const t0 = S.tick, seen = { [A]: new Set(), [B]: new Set() }, brought = w.camp.brought?.ryo ?? w.camp.chest;
  const before = { town: tB.buildings.filter(b => b.stage === 'built').map(b => b.type) };
  let peak = { [A]: 0, [B]: 0 }, last = null; const left = { [A]: 0, [B]: 0 };
  while (War.byId(w.id) && S.tick - t0 < max) {
    step(100);
    for (const c of [A, B]) { const l = Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === c && e.type !== 'horse'); for (const e of l) seen[c].add(e.id); const n = l.filter(e => !e.dead && !e.rout).length; peak[c] = Math.max(peak[c], n); if (War.byId(w.id)) left[c] = n; }
    last = { chest: w.camp?.chest ?? 0, defChest: w.defense?.chest ?? 0, put: w.defense?.put ?? 0, morale: [g.frontier.warMorale.pct(w.id, 'town'), g.frontier.warMorale.pct(w.id, 'camp')] };
    if (log && (S.tick - t0) % 2400 < 100) log({ min: Math.round((S.tick - t0) / 1200), ...last, troops: [A, B].map(c => Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === c && !e.dead && e.type !== 'horse').length), camp: (w.camp?.buildings || []).filter(b => b.stage === 'built').map(b => b.type).join(','), modes: gens.map(b => b.view().wars[w.id]) });
  }
  const over = !War.byId(w.id), rec = over ? S.frontier.wars.history.at(-1) : w;
  const result = over ? rec.result : 'unfinished';
  const winner = !over ? null : ['captured', 'sacked', 'burned'].includes(result) ? 'attacker' : ['campFell', 'attackerSurrendered'].includes(result) ? 'defender' : result === 'ransomed' ? (rec.terms?.by === 'attacker' ? 'defender' : 'attacker') : null;
  return { attack, defence, size, seed, result, winner, minutes: Math.round((S.tick - t0) / 120) / 10,
    attackerRyo: Math.round(brought - (last?.chest ?? 0)), defenderRyo: Math.round((last?.put ?? 0) - (last?.defChest ?? 0)),
    attackerTrained: seen[A].size, defenderTrained: seen[B].size, attackerPeak: peak[A], defenderPeak: peak[B],
    attackerLost: seen[A].size - left[A], defenderLost: seen[B].size - left[B],
    morale: last?.morale, townBuilt: before.town.filter(x => x !== hall).join(',') || 'none' };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('soak_war.mjs')) {
  const a = process.argv.slice(2);
  if (a[0] === 'all') {
    for (const size of Object.keys(SIZES)) for (const attack of STRATEGIES) for (const defence of STRATEGIES) console.log(JSON.stringify(runWar({ attack, defence, size, seed: Number(a[1]) || 1, maxMinutes: Number(a[2]) || 90 })));
  } else {
    const verbose = process.env.VERBOSE ? x => console.log('  ', JSON.stringify(x)) : null;
    console.log(JSON.stringify(runWar({ attack: a[0] || 'rush', defence: a[1] || 'siege', size: a[2] || 'camp', seed: Number(a[3]) || 1, maxMinutes: Number(a[4]) || 90, log: verbose })));
  }
}
