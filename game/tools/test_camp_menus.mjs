// War 7c-3: one menu per camp building (Node smoke test with a tiny fake DOM): the hall menu with Build, War chest
// and Hall tabs; a training building shows only its own train cards and queue; a site its progress; others what they do.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { terrainAt } from '../src/sim/world_data.js';
import { townBlockersIn, cellToWorld, centreCell } from '../src/sim/frontier/town_grid.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'), frontier: { ...frontier, dev: true, railways: data('data/railways.json') } });
const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
const hero = g.state.entities[m.heroId], war = g.frontier.war, fw = g.frontier.world, ST = g.frontier.structures;
const rival = Object.keys(g.state.clans).find(c => c !== 'player');
const third = Object.keys(g.state.clans).find(c => c !== 'player' && c !== rival);
const open = (x, z, r) => { for (let dx = -r; dx <= r; dx += 50) for (let dz = -r; dz <= r; dz += 50) if (terrainAt(world, x + dx, z + dz) !== 'p') return false; return true; };
const spots = [];
for (let z = 500; z < world.size.h - 500 && spots.length < 2; z += 50) for (let x = 500; x < world.size.w - 500 && spots.length < 2; x += 50) {
  if (Math.hypot(x - world.capital.x, z - world.capital.z) < 1600 || spots.some(s => Math.hypot(x - s[0], z - s[1]) < 2000)) continue;
  if (open(x, z, 500)) spots.push([x, z]);
}
assert.equal(spots.length, 2, 'test spots exist');
const addTown = (id, owner, [x, z]) => fw.addTown({ id, name: id, region: null, owner, x, z, site: null, traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 5, stock: { ...frontier.founding.startStock, ryo: 0 }, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
const enemy = addTown('enemyTown', rival, spots[0]), mine = addTown('myTown', 'player', spots[1]);
g.step([]);
const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };
Object.assign(hero, { x: enemy.x + 300, z: enemy.z, place: 'world' });
{ const r = cmd({ action: 'devStartWar', town: 'enemyTown', side: 'attack' }); assert.ok(r?.ok, r?.reason); }
const rec = war.warOn('enemyTown'), c = rec.camp, hall = c.buildings.find(b => b.type === 'camp_hall');
const rr = { id: 'rrT', type: 'rifle_range', stage: 'built', x: hall.x + 30, z: hall.z, queue: [] }, site = { id: 'bkT', type: 'barracks', stage: 'site', x: hall.x - 30, z: hall.z, progress: 10, need: 100 }, tents = { id: 'stT', type: 'supply_tents', stage: 'built', x: hall.x, z: hall.z + 30 };
c.buildings.push(rr, site, tents); c.chest = 5000;
g.step([]);
// ---- a tiny DOM: enough for the panel to build its HTML ----------------------------------------------------
const made = [], el = tag => { const n = { tag, style: {}, dataset: {}, hidden: false, innerHTML: '', append() {}, addEventListener(ev, fn) { (n.on ||= {})[ev] = fn; }, contains: () => false, querySelector: () => null, getContext: () => ({}) }; made.push(n); return n; };
globalThis.document = { createElement: el, head: el('head'), body: el('body'), activeElement: null };
const winOn = {}; globalThis.addEventListener = (ev, fn) => { (winOn[ev] ||= []).push(fn); }; globalThis.Image = class { set src(v) {} }; globalThis.innerWidth = 1200; globalThis.innerHeight = 800;
const { createWarCampPanel } = await import('../src/war_camp_panel.js');
const sent = [], P = createWarCampPanel({ game: g, heroId: hero.id, view: {}, catalog: null, frontierData: frontier, units: data('data/units.json'), send: x => sent.push(x) });
const root = made.find(n => n.id === 'warcamp'); assert.ok(root, 'panel root');
const click = data => root.on.click({ target: { closest: () => ({ dataset: data }) } });

assert.ok(P.show(rec.id, rr.id), 'the rifle range menu opens');
let h = root.innerHTML;
assert.ok(/<h2>Rifle range<\/h2>/.test(h), 'titled with the building');
assert.ok(h.includes('Archer') && h.includes('Rifleman') && !h.includes('data-tab='), 'its own train cards, no hall tabs');
assert.ok(/Health<\/span><b>\d+/.test(h) && h.includes('Damage a sec') && h.includes('Range') && h.includes('Speed'), 'stats on the cards');
assert.ok(!h.includes('data-build='), 'no build cards here');
click({ train: rr.id, unit: 'archer' }); g.step(sent.splice(0));
assert.equal(rr.queue.length, 1, 'Train on the card queues one at this building');
P.update(); h = root.innerHTML; assert.ok(h.includes('next in') && h.includes('Cancel last'), 'the queue shows');
// Tim 2026-11-25: a mouse button held on the panel holds the redraw, so the countdown can't swap a Train button out mid-click
root.on.pointerdown({ stopPropagation() {} }); for (let i = 0; i < 40; i++) g.step([]); P.update(); assert.equal(root.innerHTML, h, 'no redraw while the mouse is down');
for (const fn of winOn.pointerup || []) fn({}); P.update(); assert.notEqual(root.innerHTML, h, 'the redraw comes after release');

assert.ok(P.show(rec.id, hall.id) && root.innerHTML.includes('data-build=') && root.innerHTML.includes('data-tab="chest"'), 'the hall: build cards and tabs');
assert.ok(!root.innerHTML.includes('data-train='), 'no training in the hall');
click({ tab: 'chest' }); assert.ok(root.innerHTML.includes('Send ryo by train') && root.innerHTML.includes('data-rsend="capital"') && root.innerHTML.includes(String(Math.floor(c.chest))), 'the war chest tab');
assert.ok(P.show(rec.id) && root.innerHTML.includes('data-build='), 'the war coin opens the hall');
assert.ok(P.show(rec.id, site.id) && root.innerHTML.includes('Under construction') && root.innerHTML.includes('data-cancel'), 'a site shows its progress');
assert.ok(P.show(rec.id, tents.id) && root.innerHTML.includes('troop cap'), 'supply tents say what they do');
console.log('test_camp_menus: ok');
