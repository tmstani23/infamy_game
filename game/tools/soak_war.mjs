// War checkpoint 8d-6: bot-vs-bot war runs for balance. One seeded war per run: a bot clan with the given attack
// strategy launches from its own town at another bot clan's town of the given size, both sides run by their
// generals (sim/war_general_brain.js). Prints one JSON line per run: who won, how long the war took (from the banner),
// ryo spent and troops lost on each side.
//   node game/tools/soak_war.mjs <attack> <defence> <size> [seed] [maxMinutes]
//   node game/tools/soak_war.mjs all [seed] [maxMinutes]        every pair against every size (27 runs)
// attack, defence: rush | siege | raider.  size: camp | average | built (the fixture towns below; placeholders).
// RAIL=1: both towns have a station and a capital line (the camp can lay its spur); the output adds `line`.
// TREASURY=n: both clans' Clan treasury starts at n ryo. attackerUse / defenderUse: what came by train, the biggest
// troop cap, supply tents, armory levels and the ryo left in the chest (Tim 2026-11-17).
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
  frontier: { ...data('data/frontier.json'), railways: data('data/railways.json'), fixtureTowns: false, dev: true } });

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
  g.frontier.world.addTown({ id: 'tA', name: 'Attacker', owner: A, x: sa.x, z: sa.z, pop: 30, stock: { food: 5000, ryo: 9000, timber: 7000, stone: 5000, goods: 400 }, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
  g.frontier.world.addTown({ id: 'tB', name: 'Defender', owner: B, x: sb.x, z: sb.z, pop: Z.pop, stock: { ...Z.stock }, buildings: [{ type: hall, stage: 'built', cell: 0 }] });
  const tA = S.frontier.settlements.tA, tB = S.frontier.settlements.tB;
  tB.tier = Z.tier;
  S.clans[A].warStrategy = attack; S.clans[B].warStrategy = defence;
  const heroOf = c => Object.values(S.entities).find(e => e.type === 'hero' && e.owner === c);
  Object.assign(heroOf(A), { place: 'world', x: tA.x + 30, z: tA.z }); Object.assign(heroOf(B), { place: 'world', x: tB.x + 30, z: tB.z });
  g.step([]);
  // TREASURY=n: both clans' Clan treasury starts at n ryo (the treasury keep line is war.supply.treasuryKeep)
  if (process.env.TREASURY) for (const c of [A, B]) S.clans[c].ryo = +process.env.TREASURY;
  // RAIL=1 (8e): both towns get a railway station and a line from the capital, so the attacker's camp can lay its spur
  if (process.env.RAIL) {
    const RL = o.frontier.railways.link;
    const near = (s, o) => { const k = 80 / (Math.hypot(o.x - s.x, o.z - s.z) || 1), px = s.x + (o.x - s.x) * k, pz = s.z + (o.z - s.z) * k; let best = -1, bd = Infinity; s.grid.use.split('').forEach((c, i) => { if (c !== '.') return; const [x, z] = g.frontier.stable.centre(s, { cell: i }), d = Math.hypot(x - px, z - pz); if (d < bd) { bd = d; best = i; } }); return best; };   // a free cell 80 out toward the other town: a clear way out
    for (const [s, c] of [[tA, A], [tB, B]]) { s.tier = Math.max(s.tier || 1, RL.minTier || 1); s.buildings.push({ id: `st${s.id}`, type: 'station', cell: near(s, s === tA ? tB : tA), stage: 'built' }); ((S.frontier.rail ||= { seq: 0, links: {}, trains: {} }).links ||= {})[`rc${s.id}`] = { id: `rc${s.id}`, owner: c, from: 'capital', to: s.id, done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100] }; }
  }
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
  if (process.env.PROBE) globalThis.__soak = { g, w, A, B };
  const t0 = S.tick, seen = { [A]: new Set(), [B]: new Set() }, brought = w.camp.brought?.ryo ?? w.camp.chest;
  const before = { town: tB.buildings.filter(b => b.stage === 'built').map(b => b.type), walls: [...tB.grid.use].filter(c => c === 'w').length, gates: [...tB.grid.use].filter(c => c === 'g').length };
  const kinds = { [A]: {}, [B]: {} }, campBuilt = new Set();
  let peak = { [A]: 0, [B]: 0 }, last = null; const left = { [A]: 0, [B]: 0 };
  const line = { linkedMin: null, cuts: 0, cutTicks: 0, wasCut: false };   // RAIL: the camp's supply line
  // what each side used and left unused (Tim 2026-11-17): ryo and timber + stone that came by train (the most each
  // order delivered), the biggest troop cap, supply tents and armory levels at the end, ryo left in the chest
  const got = {}, use = { [A]: { ryoByTrain: 0, goodsByTrain: 0, capPeak: 0, tents: 0, armory: 0, chestLeft: 0 }, [B]: { ryoByTrain: 0, goodsByTrain: 0, capPeak: 0, tents: 0, armory: 0, chestLeft: 0 } };
  const tally = () => {
    for (const o of Object.values(S.frontier.shipping?.orders || {})) if (o.war === w.id || o.to === w.camp?.station?.node) got[o.id] = { c: o.owner, ryo: o.kind === 'ryo', n: Math.max(got[o.id]?.n || 0, o.got || 0) };
    for (const c of [A, B]) { const u = use[c], mine = Object.values(got).filter(x => x.c === c), dv = c === B ? War.defense.view(w.id) : War.troopView(w.id), av = g.frontier.war.armory?.view(w.id, c);
      u.ryoByTrain = Math.round(mine.filter(x => x.ryo).reduce((n, x) => n + x.n, 0)); u.goodsByTrain = Math.round(mine.filter(x => !x.ryo).reduce((n, x) => n + x.n, 0));
      u.capPeak = Math.max(u.capPeak, dv?.cap || 0); u.tents = (c === B ? tB.buildings : w.camp?.buildings || []).filter(b => b.type === 'supply_tents' && b.stage === 'built').length;
      u.armory = av ? av.groups.reduce((n, gr) => n + gr.tracks.reduce((k, t) => k + t.level, 0), 0) : u.armory; u.chestLeft = Math.round(c === B ? w.defense?.chest || 0 : w.camp?.chest || 0); }
  };
  while (War.byId(w.id) && S.tick - t0 < max) {
    step(100);
    { const st = w.camp?.station; if (st?.linked && line.linkedMin === null) line.linkedMin = Math.round((S.tick - t0) / 120) / 10;
      const cut = !!st?.cut; if (cut && !line.wasCut) line.cuts++; if (cut) line.cutTicks += 100; line.wasCut = cut; }
    for (const c of [A, B]) { const l = Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === c && e.type !== 'horse'); for (const e of l) { if (!seen[c].has(e.id) && e.warUnit) kinds[c][e.warUnit] = (kinds[c][e.warUnit] || 0) + 1; seen[c].add(e.id); } const n = l.filter(e => !e.dead && !e.rout).length; peak[c] = Math.max(peak[c], n); if (War.byId(w.id)) left[c] = n; }
    for (const b of w.camp?.buildings || []) if (b.stage === 'built' && b.type !== 'palisade') campBuilt.add(b.type);
    if (War.byId(w.id)) tally();
    last = { chest: w.camp?.chest ?? 0, defChest: w.defense?.chest ?? 0, put: w.defense?.put ?? 0, morale: [g.frontier.warMorale.pct(w.id, 'town'), g.frontier.warMorale.pct(w.id, 'camp')] };
    if (log && (S.tick - t0) % 2400 < 100) log({ min: Math.round((S.tick - t0) / 1200), ...last, troops: [A, B].map(c => Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === c && !e.dead && e.type !== 'horse').length), camp: (w.camp?.buildings || []).filter(b => b.type !== 'palisade').map(b => b.type + (b.stage === 'built' ? '' : ':' + b.stage)).join(','), stock: JSON.stringify(w.camp?.stock), workers: w.camp?.workers?.length, hands: (() => { const ix = g.frontier.modules.find(x => x.name === 'workers')?.workers?.index, RES = o.frontier.workers.resources, n = {}; for (const x of w.camp?.workers || []) { const sp = x.spot && ix.get(x.spot); const k = x.project ? 'build' : x.job ? 'job' : sp ? RES[sp.kind] + '@' + Math.round(Math.hypot(sp.x - w.camp.x, sp.z - w.camp.z)) : 'idle'; n[k] = (n[k] || 0) + 1; } return JSON.stringify(n); })(), modes: gens.map(b => b.view().wars[w.id]) });
  }
  if (process.env.DUMP && War.byId(w.id)) for (const c of [A, B]) for (const e of Object.values(S.entities).filter(e => e.warTroop === w.id && e.owner === c && !e.dead)) console.log('   ', c === A ? 'att' : 'def', e.warUnit, 'town', Math.round(Math.hypot(e.x - tB.x, e.z - tB.z)), 'camp', Math.round(Math.hypot(e.x - w.camp.x, e.z - w.camp.z)), JSON.stringify(e.order), e.garrison?.key || '', Math.round(e.hp), e.anim);
  const over = !War.byId(w.id), rec = over ? S.frontier.wars.history.at(-1) : w;
  const result = over ? rec.result : 'unfinished';
  const winner = !over ? null : ['captured', 'sacked', 'burned'].includes(result) ? 'attacker' : ['campFell', 'attackerSurrendered'].includes(result) ? 'defender' : result === 'ransomed' ? (rec.terms?.by === 'attacker' ? 'defender' : 'attacker') : null;
  return { attack, defence, size, seed, result, winner, minutes: Math.round((S.tick - t0) / 120) / 10,
    attackerRyo: Math.round(brought - (last?.chest ?? 0)), defenderRyo: Math.round((last?.put ?? 0) - (last?.defChest ?? 0)),
    attackerTrained: seen[A].size, defenderTrained: seen[B].size, attackerPeak: peak[A], defenderPeak: peak[B],
    attackerLost: seen[A].size - left[A], defenderLost: seen[B].size - left[B],
    morale: last?.morale, townBuilt: before.town.filter(x => x !== hall).join(',') || 'none', walls: before.walls, gates: before.gates,
    brought, attackerUse: use[A], defenderUse: use[B], attackerUnits: kinds[A], defenderUnits: kinds[B], campBuilt: [...campBuilt].join(','), ...(process.env.RAIL ? { line: { linkedMin: line.linkedMin, cuts: line.cuts, cutMinutes: Math.round(line.cutTicks / 120) / 10, station: rec.camp?.station || w.camp?.station || null, spur: Object.values(S.frontier.rail?.links || {}).filter(l => String(l.from).startsWith('camp:')).map(l => ({ to: l.to, len: Math.round(l.length), built: Math.round(l.built || 0), done: !!l.done, waiting: l.waiting || null })) } } : {}) };
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
