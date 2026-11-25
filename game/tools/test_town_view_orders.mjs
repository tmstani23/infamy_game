// View a town (Tim 2026-11-25): while you view one of your own frontier towns you run it as if your hero were there.
// The sim side: orders stamped view: <own town> reach your crew out on the island with the hero in the city, and a
// right-click raze reaches a structure; without the stamp, or for a rival town or the capital, they do not.
// The client side (viewCommands): the hero is taken out of every command and city / hero-only commands drop.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { loadSave } from '../src/sim/save.js';
import { build } from './make_dev_save.mjs';
import { viewCommands } from '../src/town_view.js';

// client filter
{ const out = viewCommands([
    { id: 'h', type: 'order', kind: 'move', units: ['h', 'a'], x: 1, z: 2, place: 'street' },
    { id: 'h', type: 'order', kind: 'follow', units: ['a'] },
    { id: 'h', type: 'order', kind: 'raze', units: [], hero: true, x: 1, z: 1 },
    { id: 'h', type: 'attack', target: 'x' }, { id: 'h', type: 'mount' }, { id: 'h', type: 'hire' }, { id: 'h', type: 'attackmode', on: false },
    { id: 'h', type: 'frontier', action: 'garrison', mode: 'enter', units: ['h', 'b'] },
    { id: 'h', type: 'frontier', action: 'build', town: 't' },
  ], 'h', 't1');
  assert.deepEqual(out.map(c => c.type + (c.kind ? ':' + c.kind : '')), ['order:move', 'frontier', 'frontier'], 'orders and town commands pass, hero-only and city ones drop');
  assert.deepEqual(out[0].units, ['a']); assert.equal(out[0].place, 'world'); assert.equal(out[0].view, 't1');
  assert.deepEqual(out[1].units, ['b'], 'the hero never walks off to a stockade'); }

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  frontier: { ...data('data/frontier.json'), railways: data('data/railways.json'), castleBlueprint: data('data/castle_default.json'), campaignZones: data('data/campaign_zones.json') } });
const file = JSON.stringify(build('war_test_yakuza', { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 6, warTest: true }));

function setup() {
  const g = createGame(options()), S = g.state; loadSave(g, JSON.parse(file));
  const hero = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === 'player');
  const towns = Object.values(S.frontier.settlements);
  const mine = towns.find(t => t.owner === 'player' && !t.capital), rival = towns.find(t => t.owner && t.owner !== 'player' && !t.capital), cap = towns.find(t => t.owner === 'player' && t.capital);
  assert.ok(hero && mine, 'a player hero and town');
  const crew = Object.values(S.entities).find(e => e.owner === 'player' && e.type !== 'hero' && !e.warTroop && !e.worker && !e.dead && !e.guard && !e.guide && e.type !== 'horse' && !e.vehicle && !e.ship && !e.cannon);
  assert.ok(crew, 'a crew member');
  Object.assign(crew, { place: 'world', x: mine.x + 20, z: mine.z + 20, garrison: undefined, aboard: undefined }); delete crew.order; delete crew.deployment;
  // the hero back in the city (as if viewing from the capital)
  const street = Object.values(S.entities).find(e => e.place === 'street' && e.id !== hero.id);
  Object.assign(hero, { place: 'street', x: street?.x ?? 10, z: street?.z ?? 10 });
  g.step([]);
  crew.deployment = { group: 'hero' };   // out on the island with the hero group, as settlers and crew are in play
  return { g, S, hero, crew, mine, rival, cap };
}
const moveTo = (c, x, z, view) => ({ id: c.hero.id, type: 'order', place: 'world', kind: 'attackmove', units: [c.crew.id], x, z, ...(view ? { view } : {}) });
{ const c = setup(); const x = c.mine.x + 40, z = c.mine.z + 30;
  c.g.step([moveTo(c, x, z)]);
  assert.ok(!(c.crew.order?.kind === 'attackmove' && Math.abs(c.crew.order.x - x) < 6), 'no view stamp: island crew ignore a hero in the city');
  c.g.step([moveTo(c, x, z, c.mine.id)]);
  assert.equal(c.crew.order?.kind, 'attackmove', 'viewing your town: island crew take the order');
  assert.ok(Math.abs(c.crew.order.x - x) < 6);
  assert.equal(c.hero.place, 'street', 'the hero stays put');
  if (c.rival) { const d = setup(); d.g.step([moveTo(d, x, z, d.rival.id)]); assert.ok(d.crew.order?.kind !== 'attackmove' || Math.abs(d.crew.order.x - x) >= 6, 'a rival town stamp does nothing'); }
  if (c.cap) { const d = setup(); d.g.step([moveTo(d, x, z, d.cap.id)]); assert.ok(d.crew.order?.kind !== 'attackmove' || Math.abs(d.crew.order.x - x) >= 6, 'the capital is not viewed'); } }
console.log('town view orders ok');
