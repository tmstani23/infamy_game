// Town window Stable tab (Tim 2026-11-23, src/stable_tab.js): the stable shown in the town window: stables with Go to,
// room (owned + queued), buy cards, the queue, your horses and vehicles; its buttons send the stable and garage commands.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), U = data('data/units.json');
const SB = frontier.buildings.stable.stable, M = U.rules.mount;
delete SB.capital;   // town stables only here; the capital stable's room is tested in test_capital_stable.mjs
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, hero = S.entities[m.heroId];
const site = world.sites.find(s => Math.hypot(s.x - g.gate.island[0], s.z - g.gate.island[1]) > 700) || world.sites[0];
g.frontier.world.addTown({ id: 'tS', name: 'Stableton', owner: 'player', x: site.x, z: site.z, pop: 3, stock: { food: 500, goods: 300, timber: 400, stone: 200 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const town = S.frontier.settlements.tS;
Object.assign(hero, { place: 'world', x: site.x + 60, z: site.z + 60 });
g.step([]);
const free = town.grid.use.split('').map((c, i) => c === '.' ? i : -1).filter(i => i >= 0);
town.buildings.push({ id: 'st1', type: 'stable', cell: free[40], stage: 'built' }, { id: 'st2', type: 'stable', cell: free[80], stage: 'built' });

const { createStableTab } = await import('../src/stable_tab.js');
const sent = [], looked = [];
const tab = createStableTab({ game: g, heroId: m.heroId, send: c => sent.push(c), data: frontier, focus: (x, z) => looked.push([x, z]) });
let h = tab.html(town);
assert.match(h, /Stables in Stableton/);
assert.equal((h.match(/data-act="stab-goto"/g) || []).length, 2, 'a Go to per stable');
assert.match(h, /Trains cavalry in war/, 'the second stable says what it is for');
assert.match(h, /Nothing being made/);
for (const k of Object.keys(frontier.buildings.stable.stable.kinds)) assert.ok(h.includes(`data-act="stab-buy" data-id="${k}"`), `buy ${k}`);

// Go to moves the camera to that stable
tab.click({ act: 'stab-goto', id: 'st2' }, town);
assert.deepEqual(looked.at(-1), g.frontier.stable.centre(town, town.buildings.find(b => b.id === 'st2')));

// Buy 1 sends the stable command; run it: the queue shows with its time and slots, room counts it as queued
tab.click({ act: 'stab-buy', id: 'calico', n: '1' }, town);
assert.deepEqual(sent.at(-1), { id: m.heroId, type: 'frontier', action: 'stable', town: 'tS', count: 1, mode: 'horse', kind: 'calico' });
tab.click({ act: 'stab-buy', id: 'rickshaw', n: '1' }, town);
assert.equal(sent.at(-1).mode, 'rickshaw');
g.step(sent.splice(0));
h = tab.html(town);
assert.match(h, /queue 2 of 10/);
assert.match(h, /Making Calico/);
assert.match(h, /All done in/);
assert.match(h, /<em>1\/\d+<\/em>/, 'queued horse counts toward room');
assert.match(h, /owned<i class="q"><\/i>queued/);
tab.click({ act: 'stab-cancel' }, town);
assert.equal(sent.at(-1).mode, 'cancel');
sent.length = 0;

// a finished horse lists with Ride / Go to / Recall, and they send the right commands
for (let t = 0; t < 20 * 70; t++) g.step([]);
h = tab.html(town);
const horse = Object.values(S.entities).find(e => e.type === 'horse' && e.horseOwner === hero.owner && !e.dead && !e.cavalry);
assert.ok(horse, 'a horse was made');
assert.ok(h.includes(`data-act="stab-ride" data-id="${horse.id}"`));
tab.click({ act: 'stab-look', id: horse.id }, town);
assert.deepEqual(looked.at(-1), [horse.x, horse.z]);
tab.click({ act: 'stab-recall', id: horse.id }, town);
assert.deepEqual(sent.at(-1), { id: m.heroId, type: 'garage', action: 'recall', unit: horse.id });
tab.click({ act: 'stab-recallall' }, town);
assert.equal(sent.at(-1).action, 'recallAll');
assert.equal(tab.click({ act: 'tab', id: 'town' }, town), false, 'other buttons are not ours');
console.log('stable tab ok');
if (process.env.DUMP_TO) { tab.click({ act: 'stab-buy', id: 'calico', n: '1' }, town); tab.click({ act: 'stab-buy', id: 'calico', n: '1' }, town); tab.click({ act: 'stab-buy', id: 'rickshaw', n: '1' }, town); g.step(sent.splice(0)); for (let t = 0; t < 200; t++) g.step([]); (await import('node:fs')).writeFileSync(process.env.DUMP_TO, tab.html(town)); }
