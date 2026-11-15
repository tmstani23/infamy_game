// War checkpoint 8b-3 (Tim OK'd the mock 2026-11-15): the town war window and its building menus
// (src/town_war_panel.js), Node smoke test with a tiny fake DOM like test_camp_menus.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { createPlacement } from '../src/sim/frontier/placement.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), U = data('data/units.json');

function scene({ trainSpeed = 1 } = {}) {
  const frontier = data('data/frontier.json');
  frontier.war.town.trainSpeed = trainSpeed;
  const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
  const g = createGame(options);
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 47 });
  g.civilians.populate();
  const S = g.state, hero = S.entities[m.heroId];
  const rival = Object.keys(S.clans).find(c => c !== 'player');
  const site = world.sites.filter(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700)[0];
  g.frontier.world.addTown({ id: 'tD', name: 'Holdfast', owner: 'player', x: site.x, z: site.z, pop: 14, founded: true,
    stock: { food: 5000, ryo: 4000, timber: 6000, stone: 6000, goods: 500 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
  const town = S.frontier.settlements.tD;
  Object.assign(hero, { place: 'world', x: site.x + 60, z: site.z });
  g.step([]);
  const P = createPlacement({ data: frontier, state: S, construction: {} });
  const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return S.frontier.receipts.findLast(r => r.action === c.action); };
  const run = n => { for (let i = 0; i < n; i++) g.step([]); };
  // a built building on cleared ground near the hall
  const build = kind => {
    const { n } = town.grid;
    const order = [...Array(n * n).keys()].sort((a, b) => Math.hypot(a % n - n / 2, Math.floor(a / n) - n / 2) - Math.hypot(b % n - n / 2, Math.floor(b / n) - n / 2) || a - b);
    for (const i of order) { const r = P.check(town, { kind, cells: [i] }); if (!r.ok || !r.cells.every(c => town.grid.ground[c] === 'c')) continue;
      const got = cmd({ action: 'place', town: 'tD', kind, cells: [i] }); if (!got.ok) continue;
      for (let k = 0; k < 4000 && town.projects.length; k++) g.step([]);
      return town.buildings.findLast(b => b.type === kind && b.stage === 'built'); }
    throw new Error('no spot for ' + kind);
  };
  return { g, S, hero, rival, town, site, cmd, run, build, frontier, options };
}
function declare(s) {
  const { S, town } = s, cx = town.x - 350, cz = town.z;
  S.frontier.wars ||= { list: {}, cooldown: {}, history: [] };
  S.frontier.wars.list.w1 = { id: 'w1', town: 'tD', attacker: s.rival, defender: 'player', x: cx, z: cz, started: S.tick, state: 'active',
    camp: { x: cx, z: cz, chest: 0, stock: { timber: 0, stone: 0 }, brought: {}, workers: [], workerTraining: [], buildings: [{ id: 'w1:hall', type: 'camp_hall', stage: 'built', x: cx, z: cz }] } };
  return S.frontier.wars.list.w1;
}

const s = scene(), { g, S, town, hero, frontier } = s;
const barracks = s.build('barracks'), tents = s.build('supply_tents'), stable = s.build('stable');
const hall = town.buildings.find(b => b.type === 'town_hall');
// ---- a tiny DOM ----------------------------------------------------------------------------------------------------
const made = [], el = tag => { const n = { tag, style: {}, dataset: {}, hidden: false, innerHTML: '', append() {}, addEventListener(ev, fn) { (n.on ||= {})[ev] = fn; }, contains: () => false, querySelector: () => null, querySelectorAll: () => [], getContext: () => ({}) }; made.push(n); return n; };
globalThis.document = { createElement: el, head: el('head'), body: el('body'), activeElement: null };
globalThis.addEventListener = () => {}; globalThis.Image = class { set src(v) {} }; globalThis.innerWidth = 1200; globalThis.innerHeight = 800;
const { createTownWarPanel } = await import('../src/town_war_panel.js');
const sent = [], placed = [];
const P = createTownWarPanel({ game: g, heroId: hero.id, catalog: null, frontierData: frontier, units: s.options.units, send: x => sent.push(x), placeTool: (t, k) => { placed.push([t, k]); return true; } });
const root = made.find(n => n.id === 'townwar'); assert.ok(root, 'panel root');
const click = d => root.on.click({ target: { closest: () => ({ dataset: d }) } });
const type = (n, value) => root.on.input({ target: { dataset: { n }, value } });
const flush = () => { g.step(sent.splice(0)); P.update(); };

// ---- no war: Military and Hall tabs, no war chest ----------------------------------------------------------------------
assert.ok(P.show('tD'), 'the window opens for your town');
let h = root.innerHTML;
assert.ok(h.includes('Holdfast military') && h.includes('data-tab="military"') && h.includes('data-tab="hall"') && !h.includes('data-tab="chest"'), 'Military and Hall tabs, no chest outside a war');
assert.ok(h.includes('data-build="barracks"') && h.includes('data-build="rifle_range"'), 'military cards');
assert.ok(/Needs [^<]*war upgrade/.test(h), 'locked cards say they need the war upgrade');
click({ build: 'rifle_range' });
assert.deepEqual(placed.pop(), ['tD', 'rifle_range'], 'a card hands its type to the place tool'); assert.equal(root.hidden, true, 'and the window closes');
P.show('tD'); click({ build: 'foundry' }); assert.equal(placed.length, 0, 'a locked card does not place'); assert.ok(root.innerHTML.includes('Needs the town hall war upgrade'), 'it says why');
click({ tab: 'hall' }); h = root.innerHTML;
assert.ok(h.includes('Town hall war upgrade') && h.includes('data-upgrade="1"'), 'the Hall tab offers the upgrade');
click({ upgrade: '1' }); assert.equal(sent.at(-1).action, 'warUpgradeHall'); flush();
assert.ok(town.warUpgrade, 'the upgrade started'); assert.ok(root.innerHTML.includes('War upgrade under way'), 'it shows its progress');
// a building menu outside a war says when it trains
assert.ok(P.show('tD', barracks.id)); h = root.innerHTML;
assert.ok(h.includes('<h2>Barracks</h2>') && /It trains [^<]*while a war is on Holdfast/.test(h) && !h.includes('data-train='), 'no training outside a war');
assert.equal(P.hasMenu('tD', stable.id), false, 'the stable has no war menu outside a war');
assert.equal(P.hasMenu('tD', hall.id), false, 'the hall is not a military building');
assert.equal(P.hasMenu('tD', tents.id), true, 'supply tents have a menu');
P.show('tD', tents.id); assert.ok(!root.innerHTML.includes('data-train=') && root.innerHTML.includes('<h2>Supply tents</h2>'), 'tents say what they do');
assert.equal(P.defendingHere(), null, 'no war coin outside a war');

// ---- a war on the town -------------------------------------------------------------------------------------------------
const W = S.frontier.wars ||= { list: {}, cooldown: {}, history: [] };
const cx = town.x - 350;
W.list.w1 = { id: 'w1', town: 'tD', attacker: s.rival, defender: 'player', x: cx, z: town.z, started: S.tick, state: 'active',
  camp: { x: cx, z: town.z, chest: 0, stock: { timber: 0, stone: 0 }, brought: {}, workers: [], workerTraining: [], buildings: [{ id: 'w1:hall', type: 'camp_hall', stage: 'built', x: cx, z: town.z }] } };
s.run(1);
assert.equal(P.defendingHere()?.id, 'w1', 'the war coin knows the hero stands in a town under attack');
assert.ok(P.show('tD')); h = root.innerHTML;
assert.ok(h.includes('Defence of Holdfast') && h.includes('data-tab="chest"') && h.includes('tab on" data-tab="chest"'), 'opens at the War chest tab');
assert.ok(h.includes('Mustering') && /Training opens in \d:\d\d/.test(h), 'the muster countdown');
type('put', '700'); click({ put: '1' }); assert.deepEqual([sent.at(-1).action, sent.at(-1).amount], ['warChestTown', 700]); flush();
assert.equal(W.list.w1.defense.chest, 700, 'Put in moves ryo from the coffers'); assert.ok(root.innerHTML.includes('<b>700</b>'), 'the chest shows it');
type('put', '99999999'); click({ put: '1' }); flush();
assert.match(root.innerHTML, /The town coffers have only \d+ ryo/, 'a refused put shows why');
type('put', 'abc'); click({ put: '1' }); assert.ok(root.innerHTML.includes('Type how much'), 'no number, no send');
// building menu during the muster: cards, Train disabled
assert.ok(P.show('tD', barracks.id)); h = root.innerHTML;
assert.ok(h.includes('data-train=') && /data-train="[^"]+" data-unit="grunt" disabled/.test(h) && h.includes('Mustering'), 'Train waits for the muster');
W.list.w1.started -= frontier.war.town.musterSeconds * 20; s.run(1); P.update(); h = root.innerHTML;
assert.ok(!/data-unit="grunt" disabled/.test(h), 'the muster is over');
type(`t:${barracks.id}:grunt`, '2'); click({ train: barracks.id, unit: 'grunt' }); flush();
assert.equal(barracks.queue.length, 2, 'Train queues the typed number'); h = root.innerHTML;
assert.ok(h.includes('next in') && h.includes('Cancel last') && /Troop cap: 0 out, 2 training, \d+ free of \d+/.test(h), 'queue and troop cap');
click({ untrain: barracks.id }); flush(); assert.equal(barracks.queue.length, 1, 'Cancel last takes one back');
// the stable gets a war menu during the war, locked until the war upgrade is done
assert.equal(P.hasMenu('tD', stable.id), true, 'the stable has a war menu now');
if (!town.warHall) { P.show('tD', stable.id); assert.ok(root.innerHTML.includes('Cavalry need the town hall war upgrade'), 'cavalry locked without the upgrade'); }
for (let i = 0; i < 4000 && !town.warHall; i++) g.step([]);
assert.ok(town.warHall, 'the upgrade finished');
P.show('tD', stable.id); P.update(); assert.ok(root.innerHTML.includes('data-train=') && !root.innerHTML.includes('Cavalry need'), 'cavalry cards after the upgrade');
// Escape and a foreign town
P.close(); assert.equal(root.hidden, true);
assert.equal(P.show('nope'), false, 'no window for a town that is not yours');
console.log('test_town_war_panel: ok');
