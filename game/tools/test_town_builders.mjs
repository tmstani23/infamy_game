// Town builders (2026-11-15): the townspeople build a player's placed building at rates.townBuildRate each,
// workers sent to the site add rates.workerBuildRate each (at most rates.maxBuilders), a one-time tip, the site card
// line, and the townspeople shown hammering at the site (townsfolk.js). Run: node game/tools/test_town_builders.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { centreCell } from '../src/sim/frontier/town_grid.js';
import { siteBuilders } from '../src/frontier_tips.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') });
const FD = data('data/frontier.json'), R = FD.rates;
const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 1000 } });
const hero = g.state.entities[m.heroId], me = hero.owner;
Object.assign(hero, { x: 3000, z: 3000, place: 'world' });
const w = g.frontier.world;
w.addTown({ id: 'tw', name: 'Kita', region: null, owner: me, x: 3000, z: 3000, site: null, traits: { soil: 2, water: 2, defense: 2, nodes: {} },
  pop: 40, stock: { food: 900, timber: 900, stone: 900, goods: 200, ryo: 900 }, buildings: [{ type: 'town_hall', cell: 0 }] });
const s = g.frontier.world.settlement('tw'), n = s.grid.n, C = centreCell(n);
for (let i = 0; i < s.grid.ground.length; i++) if (s.grid.ground[i] !== 'x') s.grid.ground = s.grid.ground.slice(0, i) + 'c' + s.grid.ground.slice(i + 1);
g.state.night = false;
const run = k => { for (let i = 0; i < k; i++) g.step([]); };
const send = c => { g.frontier.command({ owner: me }, { type: 'frontier', town: 'tw', settlement: 'tw', ...c }); return g.state.frontier.receipts.at(-1); };
const news = [];
const watch = k => { for (let i = 0; i < k; i++) { g.step([]); for (const x of g.state.news || []) if (x.kind === 'buildSiteTip' && !news.includes(x)) news.push(x); } };

// a worker first, so there is someone to send
assert.equal(send({ action: 'train', count: 1 }).ok, true, 'worker training');
run(FD.workers.trainTicks + 40);
assert.equal(s.workers.length, 1, 'one worker');

// place a storehouse: the townspeople build it at half speed
const cell = C + 3 * n + 3, r = send({ action: 'place', kind: 'stable', cells: [cell] });
assert.equal(r.ok, true, `placed (${r.reason})`);
const p = s.projects.find(x => x.type === 'stable');
if (!p.authorized) send({ action: 'authorize', project: p.id });
watch(20 * 3);
assert.ok(p.paid, 'paid');
assert.ok(s.builders > 0, 'townspeople building');
const a = p.progress; watch(20 * 4); const per = (p.progress - a) / 4;
assert.ok(Math.abs(per - s.builders * R.townBuildRate) < 1e-6, `townspeople at ${R.townBuildRate} each (${per} a second, ${s.builders} builders)`);
assert.equal(news.length, 1, 'the one-time tip');
assert.match(siteBuilders(s, p, FD, g.state.clans).join('\n'), /townspeople[\s\S]*Time left[\s\S]*Send workers/, 'site card lines');

// the townspeople show at the site, hammering
watch(20 * 20);
const folk = Object.values(g.state.entities).filter(e => e.townsfolk === 'tw' && !e.dead && e.model === FD.townsfolk.builderModel);
assert.ok(folk.length >= 1 && folk.length <= Math.min(s.builders, R.maxBuilders), `builder townsfolk (${folk.length} of ${s.builders} builders)`);
assert.ok(folk.some(e => e.anim === 'hammer'), 'hammering at the site');

// send the worker: it walks there and adds a full builder
const key = g.frontier.structures.projectKeyAt(s, cell);
assert.equal(key, `p|tw|${p.id}`);
const wid = s.workers[0].id;
assert.equal(send({ action: 'workerOrder', workers: [wid], kind: 'work', target: key }).ok, true, 'work order on the site');
for (let i = 0; i < 20 * 60 && s.workers[0].job?.at && s.workers[0].trip; i++) watch(1);
assert.ok(!s.workers[0].trip, 'the worker got there');
if (p.progress < p.need - 10) {
  const b = p.progress; watch(20 * 2); const per2 = (p.progress - b) / 2;
  assert.ok(Math.abs(per2 - (s.builders * R.townBuildRate + R.workerBuildRate)) < 0.06, `worker adds ${R.workerBuildRate} a second (${per2})`);
  assert.match(siteBuilders(s, p, FD, g.state.clans)[0], /1 of your workers/);
}
watch(20 * 200);
assert.ok(!s.projects.includes(p), 'built');
assert.ok(s.buildings.some(b => b.type === 'stable' && b.stage === 'built'), 'the stable stands');
assert.equal(s.workers[0].job, undefined, 'the job is over');
assert.equal(s.workers[0].order?.kind, 'hold', 'the worker waits by it');
watch(20 * 60);
assert.equal(Object.values(g.state.entities).filter(e => e.townsfolk === 'tw' && !e.dead && e.model === FD.townsfolk.builderModel).length, 0, 'builders went back in');
assert.equal(news.length, 1, 'tip only once');

// a bot clan's town builds at full speed
const bot = Object.keys(g.state.clans).find(c => g.state.clans[c].bot);
if (bot) {
  w.addTown({ id: 'tb', name: 'Bot', region: null, owner: bot, x: 6000, z: 6000, site: null, traits: { soil: 2, water: 2, defense: 2, nodes: {} },
    pop: 40, stock: { food: 900, timber: 900, stone: 900, goods: 200, ryo: 900 }, buildings: [{ type: 'town_hall', cell: 0 }] });
  const t = g.frontier.world.settlement('tb'); for (let i = 0; i < t.grid.ground.length; i++) if (t.grid.ground[i] !== 'x') t.grid.ground = t.grid.ground.slice(0, i) + 'c' + t.grid.ground.slice(i + 1);
  g.frontier.command({ owner: bot }, { type: 'frontier', town: 'tb', settlement: 'tb', action: 'place', kind: 'storehouse', cells: [centreCell(t.grid.n) + 3 * t.grid.n + 3] });
  const q = t.projects.find(x => x.type === 'storehouse');
  if (q) { if (!q.authorized) g.frontier.command({ owner: bot }, { type: 'frontier', settlement: 'tb', town: 'tb', action: 'authorize', project: q.id });
    run(20 * 3); const c0 = q.progress; run(20 * 2); if (t.projects.includes(q) && t.builders) assert.ok(Math.abs((q.progress - c0) / 2 - t.builders) < 1e-6, 'bot town at full speed'); }
}
console.log('test_town_builders: ok');
